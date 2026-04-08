import type {
  BackgroundMessage,
  BackgroundResponse,
  ExtensionStatus,
} from '../../src/messages';

import '../../src/ui.css';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Popup root element was not found.');
}

const appRoot = app;

type PopupState = {
  error: string | null;
  isBusy: boolean;
  message: string | null;
  noteBody: string;
  noteTitle: string;
  status: ExtensionStatus | null;
};

const state: PopupState = {
  error: null,
  isBusy: false,
  message: null,
  noteBody: '',
  noteTitle: '',
  status: null,
};

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sendMessage<TMessage extends BackgroundMessage>(message: TMessage) {
  return new Promise<BackgroundResponse>((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: BackgroundResponse) => {
      const runtimeError = chrome.runtime.lastError;

      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }

      resolve(response);
    });
  });
}

function setBusy(nextValue: boolean) {
  state.isBusy = nextValue;
  render();
}

function setError(message: string | null) {
  state.error = message;
  render();
}

function setMessage(message: string | null) {
  state.message = message;
  render();
}

function setStatus(status: ExtensionStatus | null) {
  state.status = status;
  render();
}

async function refreshStatus() {
  const response = await sendMessage({ type: 'get-status' });

  if (!response.ok) {
    setError(response.message);
    return;
  }

  setStatus(response.status ?? null);
}

async function runAction(action: () => Promise<BackgroundResponse>) {
  setError(null);
  setMessage(null);
  setBusy(true);

  try {
    const response = await action();

    if (!response.ok) {
      setError(response.message);
      return;
    }

    if (response.status) {
      state.status = response.status;
    }

    setMessage(response.message ?? null);
  } catch (error) {
    setError(
      error instanceof Error
        ? error.message
        : 'The extension hit an unexpected error.',
    );
  } finally {
    setBusy(false);
  }
}

function render() {
  const connected = state.status?.connected ?? false;
  const pendingPairing = state.status?.pendingPairing ?? false;

  appRoot.innerHTML = `
    <div class="shell" style="width: 360px;">
      <div class="card stack">
        <span class="eyebrow">Chrome capture</span>
        <div>
          <h1 class="title">Memory Vault</h1>
          <p class="body">
            Save notes, full pages, and highlighted text into your personal memory space.
          </p>
        </div>

        <div class="actions">
          <span class="pill ${connected ? 'connected' : pendingPairing ? 'pending' : 'disconnected'}">
            ${connected ? 'Connected' : pendingPairing ? 'Pairing in progress' : 'Disconnected'}
          </span>
        </div>

        ${
          state.error
            ? `<div class="message error">${escapeHtml(state.error)}</div>`
            : ''
        }
        ${
          state.message
            ? `<div class="message success">${escapeHtml(state.message)}</div>`
            : ''
        }

        ${
          connected
            ? `
              <div class="meta">
                <div class="meta-row">
                  <span class="meta-label">Device token</span>
                  <span class="meta-value">${escapeHtml(state.status?.deviceTokenId ?? 'Unknown')}</span>
                </div>
                <div class="meta-row">
                  <span class="meta-label">Space</span>
                  <span class="meta-value">${escapeHtml(state.status?.spaceId ?? 'Unknown')}</span>
                </div>
              </div>

              <div class="field">
                <label class="label" for="note-title">Note title</label>
                <input
                  id="note-title"
                  class="input"
                  maxlength="300"
                  placeholder="Optional title"
                  value="${escapeHtml(state.noteTitle)}"
                />
              </div>

              <div class="field">
                <label class="label" for="note-body">Quick note</label>
                <textarea
                  id="note-body"
                  class="textarea"
                  placeholder="Remember to bring the train adapter."
                >${escapeHtml(state.noteBody)}</textarea>
              </div>

              <div class="actions">
                <button class="button" id="save-note" ${state.isBusy ? 'disabled' : ''}>Save note</button>
                <button class="button secondary" id="save-page" ${state.isBusy ? 'disabled' : ''}>Save page</button>
                <button class="button secondary" id="save-selection" ${state.isBusy ? 'disabled' : ''}>Save selection</button>
              </div>

              <div class="actions">
                <button class="button secondary" id="disconnect" ${state.isBusy ? 'disabled' : ''}>Disconnect</button>
              </div>
            `
            : `
              <p class="body">
                Pair the extension with <strong>${escapeHtml(state.status?.webAppBaseUrl ?? 'your Memory Vault app')}</strong> to start capturing from this browser.
              </p>
              <div class="actions">
                <button class="button" id="connect" ${state.isBusy ? 'disabled' : ''}>
                  ${pendingPairing ? 'Open pairing tab again' : 'Connect extension'}
                </button>
              </div>
            `
        }

        <p class="muted">
          ${
            connected
              ? 'Use Save selection after highlighting text on the active page.'
              : 'The extension only captures regular http and https pages in this first release.'
          }
        </p>
      </div>
    </div>
  `;

  const noteTitleInput =
    document.querySelector<HTMLInputElement>('#note-title');
  const noteBodyInput =
    document.querySelector<HTMLTextAreaElement>('#note-body');

  noteTitleInput?.addEventListener('input', (event) => {
    state.noteTitle =
      event.currentTarget instanceof HTMLInputElement
        ? event.currentTarget.value
        : '';
  });

  noteBodyInput?.addEventListener('input', (event) => {
    state.noteBody =
      event.currentTarget instanceof HTMLTextAreaElement
        ? event.currentTarget.value
        : '';
  });

  document
    .querySelector<HTMLButtonElement>('#connect')
    ?.addEventListener('click', () => {
      void runAction(async () => sendMessage({ type: 'start-connect' }));
    });

  document
    .querySelector<HTMLButtonElement>('#disconnect')
    ?.addEventListener('click', () => {
      void runAction(async () => sendMessage({ type: 'disconnect' }));
    });

  document
    .querySelector<HTMLButtonElement>('#save-note')
    ?.addEventListener('click', () => {
      void runAction(async () =>
        sendMessage({
          body: state.noteBody,
          title: state.noteTitle || undefined,
          type: 'save-note',
        }),
      );
    });

  document
    .querySelector<HTMLButtonElement>('#save-page')
    ?.addEventListener('click', () => {
      void runAction(async () => sendMessage({ type: 'save-page' }));
    });

  document
    .querySelector<HTMLButtonElement>('#save-selection')
    ?.addEventListener('click', () => {
      void runAction(async () => sendMessage({ type: 'save-selection' }));
    });
}

void refreshStatus();
render();
