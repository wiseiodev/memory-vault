import {
  type BeginWebCaptureOutput,
  MAX_EXTENSION_HTML_SNAPSHOT_BYTES,
} from '@memory-vault/extension-contract';
import { defineBackground } from 'wxt/utils/define-background';

import { buildConnectStartUrl, getWebAppBaseUrl } from '../src/config';
import type {
  BackgroundErrorCode,
  BackgroundMessage,
  BackgroundResponse,
  ExtensionStatus,
} from '../src/messages';
import { extensionRpc } from '../src/rpc';
import {
  clearPendingPairingState,
  clearStoredConnection,
  getPendingPairingState,
  getStoredConnection,
  type StoredConnection,
  setPendingPairingState,
  setStoredConnection,
} from '../src/storage';

type CaptureMode = 'page' | 'selection';

type CapturedPageSnapshot = {
  canonicalLinkUrl: string | null;
  capturedAt: string;
  contentType: string | null;
  faviconUrl: string | null;
  html: string;
  htmlByteSize: number;
  selectedText: string | null;
  title: string | null;
  url: string;
};

class ExtensionActionError extends Error {
  code: BackgroundErrorCode;

  constructor(code: BackgroundErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

function isHtmlContentType(value: string | null | undefined) {
  return value === 'text/html' || value === 'application/xhtml+xml';
}

function isAuthError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('401') ||
    message.includes('403') ||
    message.includes('forbidden') ||
    message.includes('unauthorized')
  );
}

function capturePageInTab(mode: CaptureMode) {
  const protocol = window.location.protocol;

  if (protocol !== 'http:' && protocol !== 'https:') {
    return {
      error: 'Only http and https pages can be saved from the extension.',
    };
  }

  const contentType = document.contentType ?? 'text/html';

  if (contentType === 'application/pdf') {
    return {
      error: 'PDF pages are not supported by the extension capture flow yet.',
    };
  }

  const html = document.documentElement?.outerHTML ?? '';

  if (!html.trim()) {
    return {
      error: 'The current page did not expose a serializable HTML snapshot.',
    };
  }

  const canonicalLink = document.querySelector('link[rel="canonical"]');
  const faviconLink =
    document.querySelector('link[rel~="icon"]') ??
    document.querySelector('link[rel="shortcut icon"]');
  const selection = window.getSelection()?.toString().trim() || null;

  return {
    canonicalLinkUrl:
      canonicalLink instanceof HTMLLinkElement ? canonicalLink.href : null,
    capturedAt: new Date().toISOString(),
    contentType,
    faviconUrl:
      faviconLink instanceof HTMLLinkElement ? faviconLink.href : null,
    html,
    htmlByteSize: new TextEncoder().encode(html).byteLength,
    selectedText: mode === 'selection' ? selection : null,
    title: document.title || null,
    url: window.location.href,
  };
}

function buildStatus(
  connection: StoredConnection | null,
  pendingPairing: boolean,
): ExtensionStatus {
  return {
    connected: Boolean(connection),
    deviceTokenId: connection?.deviceTokenId ?? null,
    pendingPairing,
    spaceId: connection?.spaceId ?? null,
    webAppBaseUrl: getWebAppBaseUrl(),
  };
}

function toErrorResponse(error: unknown): BackgroundResponse {
  if (error instanceof ExtensionActionError) {
    return {
      code: error.code,
      message: error.message,
      ok: false,
    };
  }

  return {
    code: 'NETWORK_ERROR',
    message:
      error instanceof Error
        ? error.message
        : 'The extension hit an unexpected error.',
    ok: false,
  };
}

function queryActiveTab(): Promise<chrome.tabs.Tab | null> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(
      {
        active: true,
        lastFocusedWindow: true,
      },
      (tabs) => {
        const runtimeError = chrome.runtime.lastError;

        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        resolve(tabs[0] ?? null);
      },
    );
  });
}

function createTab(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url }, () => {
      const runtimeError = chrome.runtime.lastError;

      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }

      resolve();
    });
  });
}

function executeCaptureScript(
  tabId: number,
  mode: CaptureMode,
): Promise<CapturedPageSnapshot> {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(
      {
        args: [mode],
        func: capturePageInTab,
        target: { tabId },
      },
      (results) => {
        const runtimeError = chrome.runtime.lastError;

        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        const result = results?.[0]?.result as
          | CapturedPageSnapshot
          | { error: string }
          | undefined;

        if (!result) {
          reject(
            new ExtensionActionError(
              'UNSUPPORTED_PAGE',
              'The current tab could not be inspected.',
            ),
          );
          return;
        }

        if ('error' in result) {
          reject(new ExtensionActionError('UNSUPPORTED_PAGE', result.error));
          return;
        }

        resolve(result);
      },
    );
  });
}

async function requireConnection() {
  const connection = await getStoredConnection();

  if (!connection) {
    throw new ExtensionActionError(
      'AUTH_REQUIRED',
      'Connect the extension before saving anything.',
    );
  }

  return connection;
}

async function withRpcAuth<T>(action: () => Promise<T>) {
  try {
    return await action();
  } catch (error) {
    if (isAuthError(error)) {
      await clearStoredConnection();
      throw new ExtensionActionError(
        'AUTH_REQUIRED',
        'Your extension session expired. Reconnect to keep saving captures.',
      );
    }

    throw error;
  }
}

async function getCurrentStatusResponse(): Promise<BackgroundResponse> {
  const [connection, pendingPairing] = await Promise.all([
    getStoredConnection(),
    getPendingPairingState(),
  ]);

  return {
    ok: true,
    status: buildStatus(connection, Boolean(pendingPairing)),
  };
}

async function startConnectFlow(): Promise<BackgroundResponse> {
  const state = crypto.randomUUID();

  await setPendingPairingState({
    startedAt: new Date().toISOString(),
    state,
  });
  await createTab(buildConnectStartUrl(state));

  return getCurrentStatusResponse();
}

async function finishPairing(
  message: Extract<BackgroundMessage, { type: 'finish-pairing' }>,
) {
  const pendingPairing = await getPendingPairingState();

  if (!pendingPairing || pendingPairing.state !== message.state) {
    await clearPendingPairingState();
    throw new ExtensionActionError(
      'INVALID_STATE',
      'The pairing callback state did not match the pending request.',
    );
  }

  await setStoredConnection({
    connectedAt: new Date().toISOString(),
    deviceTokenId: message.deviceTokenId,
    spaceId: message.spaceId,
    token: message.token,
  });
  await clearPendingPairingState();

  return getCurrentStatusResponse();
}

async function disconnectExtension() {
  const connection = await getStoredConnection();

  if (connection) {
    try {
      await withRpcAuth(() => extensionRpc.deviceTokens.revokeCurrent());
    } catch {
      // Best effort revoke. Local disconnect still proceeds.
    }
  }

  await Promise.all([clearPendingPairingState(), clearStoredConnection()]);

  return getCurrentStatusResponse();
}

async function captureActivePage(mode: CaptureMode) {
  const tab = await queryActiveTab();

  if (!tab?.id || !tab.url) {
    throw new ExtensionActionError(
      'UNSUPPORTED_PAGE',
      'Open a browser tab before trying to save a page.',
    );
  }

  if (!tab.url.startsWith('http://') && !tab.url.startsWith('https://')) {
    throw new ExtensionActionError(
      'UNSUPPORTED_PAGE',
      'Only regular http and https pages can be saved from the extension.',
    );
  }

  const snapshot = await executeCaptureScript(tab.id, mode);

  if (!isHtmlContentType(snapshot.contentType)) {
    throw new ExtensionActionError(
      'UNSUPPORTED_PAGE',
      'This page does not expose a supported HTML snapshot.',
    );
  }

  if (snapshot.htmlByteSize > MAX_EXTENSION_HTML_SNAPSHOT_BYTES) {
    throw new ExtensionActionError(
      'BAD_REQUEST',
      `This page is too large to capture. The limit is ${MAX_EXTENSION_HTML_SNAPSHOT_BYTES.toLocaleString()} bytes.`,
    );
  }

  if (mode === 'selection' && !snapshot.selectedText) {
    throw new ExtensionActionError(
      'BAD_REQUEST',
      'Select some text on the page before using Save selection.',
    );
  }

  return snapshot;
}

async function abandonPendingCapture(
  reservation: BeginWebCaptureOutput | null,
  captureRequestId: string,
  reason: 'canceled' | 'serialization_failed' | 'upload_failed',
) {
  const sourceBlobId =
    reservation?.capture.sourceBlobId ?? reservation?.upload?.sourceBlobId;
  const sourceItemId =
    reservation?.upload?.sourceItemId ?? reservation?.capture.sourceItemId;

  if (!reservation || !sourceBlobId || !sourceItemId) {
    return;
  }

  try {
    await withRpcAuth(() =>
      extensionRpc.captures.abandonWebCapture({
        captureRequestId,
        reason,
        sourceBlobId,
        sourceItemId,
      }),
    );
  } catch {
    // Best-effort cleanup only.
  }
}

async function uploadSnapshot(
  reservation: BeginWebCaptureOutput,
  html: string,
) {
  if (!reservation.upload) {
    throw new ExtensionActionError(
      'NETWORK_ERROR',
      'The extension did not receive an upload target for this capture.',
    );
  }

  const response = await fetch(reservation.upload.uploadUrl, {
    body: html,
    headers: reservation.upload.uploadHeaders,
    method: reservation.upload.uploadMethod,
  });

  if (!response.ok) {
    throw new ExtensionActionError(
      'NETWORK_ERROR',
      'Uploading the page snapshot failed. Try again in a moment.',
    );
  }
}

async function savePageLikeCapture(
  mode: CaptureMode,
): Promise<BackgroundResponse> {
  await requireConnection();

  const snapshot = await captureActivePage(mode);
  const htmlContentType =
    snapshot.contentType === 'application/xhtml+xml'
      ? 'application/xhtml+xml'
      : 'text/html';
  const captureRequestId = crypto.randomUUID();
  let reservation: BeginWebCaptureOutput | null = null;

  reservation = await withRpcAuth(() =>
    extensionRpc.captures.beginWebCapture({
      canonicalLinkUrl: snapshot.canonicalLinkUrl ?? undefined,
      captureRequestId,
      capturedAt: snapshot.capturedAt,
      faviconUrl: snapshot.faviconUrl ?? undefined,
      htmlByteSize: snapshot.htmlByteSize,
      htmlContentType,
      selectedText: snapshot.selectedText ?? undefined,
      title: snapshot.title ?? undefined,
      url: snapshot.url,
    }),
  );

  if (reservation.phase === 'already_captured') {
    return {
      capture: reservation.capture,
      message: 'This capture request already completed.',
      ok: true,
    };
  }

  if (reservation.phase === 'upload_required') {
    try {
      await uploadSnapshot(reservation, snapshot.html);
    } catch (error) {
      await abandonPendingCapture(
        reservation,
        captureRequestId,
        'upload_failed',
      );
      throw error;
    }
  }

  const sourceBlobId =
    reservation.capture.sourceBlobId ?? reservation.upload?.sourceBlobId;

  if (!sourceBlobId) {
    throw new ExtensionActionError(
      'NETWORK_ERROR',
      'The extension capture reservation is missing its snapshot blob id.',
    );
  }

  const capture = await withRpcAuth(() =>
    extensionRpc.captures.completeWebCapture({
      captureRequestId,
      sourceBlobId,
      sourceItemId: reservation.capture.sourceItemId,
    }),
  );

  return {
    capture,
    message:
      mode === 'selection'
        ? 'Selection saved to Memory Vault.'
        : 'Page saved to Memory Vault.',
    ok: true,
  };
}

async function saveNoteCapture(
  message: Extract<BackgroundMessage, { type: 'save-note' }>,
): Promise<BackgroundResponse> {
  await requireConnection();

  if (!message.body.trim()) {
    throw new ExtensionActionError(
      'BAD_REQUEST',
      'Add some note text before saving.',
    );
  }

  const capture = await withRpcAuth(() =>
    extensionRpc.captures.createExtensionNote({
      body: message.body,
      captureRequestId: crypto.randomUUID(),
      title: message.title?.trim() || undefined,
    }),
  );

  return {
    capture,
    message: 'Note saved to Memory Vault.',
    ok: true,
  };
}

async function handleMessage(
  message: BackgroundMessage,
): Promise<BackgroundResponse> {
  switch (message.type) {
    case 'disconnect':
      return disconnectExtension();
    case 'finish-pairing':
      return finishPairing(message);
    case 'get-status':
      return getCurrentStatusResponse();
    case 'save-note':
      return saveNoteCapture(message);
    case 'save-page':
      return savePageLikeCapture('page');
    case 'save-selection':
      return savePageLikeCapture('selection');
    case 'start-connect':
      return startConnectFlow();
    default:
      throw new ExtensionActionError(
        'BAD_REQUEST',
        'The extension received an unsupported action.',
      );
  }
}

export default defineBackground({
  type: 'module',
  main() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      void handleMessage(message as BackgroundMessage)
        .then(sendResponse)
        .catch((error) => {
          sendResponse(toErrorResponse(error));
        });

      return true;
    });
  },
});
