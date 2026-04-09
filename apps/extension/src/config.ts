export const EXTENSION_CALLBACK_PATH = '/callback.html';
export const EXTENSION_DEVICE_LABEL = 'Chrome extension';

function getManifestWebAppBaseUrl() {
  const manifest = chrome.runtime.getManifest();
  const hostPermissions = manifest.host_permissions ?? [];
  const webAppMatch = hostPermissions.find((value: string) => {
    if (!value.startsWith('http://') && !value.startsWith('https://')) {
      return false;
    }

    return !value.includes('.amazonaws.com/');
  });

  if (!webAppMatch) {
    return null;
  }

  return webAppMatch.replace(/\/\*$/u, '').replace(/\/+$/u, '');
}

export function getWebAppBaseUrl() {
  return (
    getManifestWebAppBaseUrl() ||
    import.meta.env.WXT_PUBLIC_WEB_APP_URL?.trim() ||
    'http://localhost:3000'
  ).replace(/\/+$/u, '');
}

export function getExtensionVersion() {
  return chrome.runtime.getManifest().version;
}

export function getBrowserVersion() {
  return navigator.userAgent.slice(0, 200);
}

export function buildConnectStartUrl(state: string) {
  const url = new URL('/extension/connect/start', getWebAppBaseUrl());

  url.searchParams.set('browserVersion', getBrowserVersion());
  url.searchParams.set('callbackPath', EXTENSION_CALLBACK_PATH);
  url.searchParams.set('deviceLabel', EXTENSION_DEVICE_LABEL);
  url.searchParams.set('extensionId', chrome.runtime.id);
  url.searchParams.set('extensionVersion', getExtensionVersion());
  url.searchParams.set('state', state);

  return url.toString();
}
