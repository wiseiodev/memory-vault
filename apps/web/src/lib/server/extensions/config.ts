import 'server-only';

const CHROME_EXTENSION_ID_PATTERN = /^[a-z]{32}$/u;

function parseAllowedIds() {
  return (process.env.CHROME_EXTENSION_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => CHROME_EXTENSION_ID_PATTERN.test(value));
}

export function getAllowedChromeExtensionIds() {
  return new Set(parseAllowedIds());
}

export function getAllowedChromeExtensionOrigins() {
  return [...getAllowedChromeExtensionIds()].map(
    (extensionId) => `chrome-extension://${extensionId}`,
  );
}

export function isAllowedChromeExtensionId(extensionId: string) {
  return getAllowedChromeExtensionIds().has(extensionId);
}

export function isAllowedChromeExtensionOrigin(origin: string | null) {
  if (!origin) {
    return false;
  }

  return getAllowedChromeExtensionOrigins().includes(origin);
}

export function buildChromeExtensionCallbackUrl(input: {
  callbackPath: string;
  extensionId: string;
}) {
  if (!isAllowedChromeExtensionId(input.extensionId)) {
    throw new Error('Chrome extension id is not allowlisted.');
  }

  return new URL(
    input.callbackPath,
    `chrome-extension://${input.extensionId}`,
  ).toString();
}
