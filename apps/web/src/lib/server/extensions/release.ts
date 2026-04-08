import 'server-only';

const EXTENSION_RELEASE_PREFIX = 'releases/chrome-extension';
const EXTENSION_RELEASE_FILENAME = 'memory-vault-extension-store.zip';
const FALLBACK_EXTENSION_RELEASE_VERSION = '0.1.0';

export function getExtensionReleaseVersion() {
  return (
    process.env.CHROME_EXTENSION_RELEASE_VERSION?.trim() ||
    FALLBACK_EXTENSION_RELEASE_VERSION
  );
}

export function getExtensionReleaseFilename() {
  return EXTENSION_RELEASE_FILENAME;
}

export function getExtensionReleaseObjectKey() {
  return `${EXTENSION_RELEASE_PREFIX}/${getExtensionReleaseVersion()}/${EXTENSION_RELEASE_FILENAME}`;
}
