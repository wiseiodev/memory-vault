import type { ExtensionCaptureSummary } from '@memory-vault/extension-contract';

export type ExtensionStatus = {
  connected: boolean;
  deviceTokenId: string | null;
  pendingPairing: boolean;
  spaceId: string | null;
  webAppBaseUrl: string;
};

export type BackgroundErrorCode =
  | 'AUTH_REQUIRED'
  | 'BAD_REQUEST'
  | 'INVALID_STATE'
  | 'NETWORK_ERROR'
  | 'UNSUPPORTED_PAGE';

export type BackgroundMessage =
  | { type: 'get-status' }
  | { type: 'start-connect' }
  | {
      type: 'finish-pairing';
      deviceTokenId: string;
      spaceId: string;
      state: string;
      token: string;
    }
  | { type: 'disconnect' }
  | { body: string; title?: string; type: 'save-note' }
  | { type: 'save-page' }
  | { type: 'save-selection' };

export type BackgroundResponse =
  | {
      ok: true;
      capture?: ExtensionCaptureSummary;
      message?: string;
      status?: ExtensionStatus;
    }
  | {
      code: BackgroundErrorCode;
      message: string;
      ok: false;
    };
