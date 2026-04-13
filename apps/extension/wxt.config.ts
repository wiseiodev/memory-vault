import { defineConfig } from 'wxt';

function normalizeBaseUrl(value: string | undefined) {
  return (value?.trim() || 'http://localhost:3000').replace(/\/+$/u, '');
}

function getWebAppOrigin() {
  return new URL(
    normalizeBaseUrl(
      process.env.BETTER_AUTH_URL ?? process.env.WXT_PUBLIC_WEB_APP_URL,
    ),
  ).origin;
}

function buildHostPermissions() {
  const webAppOrigin = getWebAppOrigin();
  const permissions = new Set<string>([`${webAppOrigin}/*`]);
  const bucket = process.env.MEMORY_VAULT_BLOB_BUCKET?.trim();
  const region = process.env.AWS_REGION?.trim();

  if (bucket && region) {
    permissions.add(`https://${bucket}.s3.${region}.amazonaws.com/*`);
    permissions.add(`https://${bucket}.s3.amazonaws.com/*`);
  } else {
    permissions.add('https://*.amazonaws.com/*');
  }

  return [...permissions];
}

function buildWebAccessibleResources() {
  const webAppOrigin = getWebAppOrigin();

  return [
    {
      matches: [`${webAppOrigin}/*`],
      resources: ['callback.html', 'assets/*', 'chunks/*'],
    },
  ];
}

const EXTENSION_DEV_PORT = 3010;

export default defineConfig({
  dev: {
    server: {
      port: EXTENSION_DEV_PORT,
      origin: `http://localhost:${EXTENSION_DEV_PORT}`,
    },
  },
  manifest: {
    action: {
      default_popup: 'popup.html',
      default_title:
        process.env.NODE_ENV === 'production'
          ? 'Memory Vault'
          : 'Memory Vault Dev',
    },
    description: 'Capture notes, pages, and selections into Memory Vault.',
    host_permissions: buildHostPermissions(),
    key: process.env.CHROME_EXTENSION_KEY?.trim() || undefined,
    name:
      process.env.NODE_ENV === 'production'
        ? 'Memory Vault'
        : 'Memory Vault Dev',
    permissions: ['activeTab', 'scripting', 'storage', 'tabs'],
    web_accessible_resources: buildWebAccessibleResources(),
  },
  outDir: 'dist',
});
