export type StoredConnection = {
  connectedAt: string;
  deviceTokenId: string;
  spaceId: string;
  token: string;
};

type PendingPairingState = {
  startedAt: string;
  state: string;
};

const CONNECTION_STORAGE_KEY = 'memoryVault.connection';
const PENDING_PAIRING_STORAGE_KEY = 'memoryVault.pendingPairing';

function getStorageValue<T>(key: string): Promise<T | null> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(key, (result) => {
      const runtimeError = chrome.runtime.lastError;

      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }

      resolve((result[key] as T | undefined) ?? null);
    });
  });
}

function setStorageValue<T>(key: string, value: T): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [key]: value }, () => {
      const runtimeError = chrome.runtime.lastError;

      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }

      resolve();
    });
  });
}

function removeStorageValue(key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(key, () => {
      const runtimeError = chrome.runtime.lastError;

      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }

      resolve();
    });
  });
}

export function getStoredConnection() {
  return getStorageValue<StoredConnection>(CONNECTION_STORAGE_KEY);
}

export function setStoredConnection(value: StoredConnection) {
  return setStorageValue(CONNECTION_STORAGE_KEY, value);
}

export function clearStoredConnection() {
  return removeStorageValue(CONNECTION_STORAGE_KEY);
}

export function getPendingPairingState() {
  return getStorageValue<PendingPairingState>(PENDING_PAIRING_STORAGE_KEY);
}

export function setPendingPairingState(value: PendingPairingState) {
  return setStorageValue(PENDING_PAIRING_STORAGE_KEY, value);
}

export function clearPendingPairingState() {
  return removeStorageValue(PENDING_PAIRING_STORAGE_KEY);
}
