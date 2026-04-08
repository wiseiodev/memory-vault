import { createExtensionRpcClient } from '@memory-vault/extension-contract';

import { getWebAppBaseUrl } from './config';
import { getStoredConnection } from './storage';

export const extensionRpc = createExtensionRpcClient({
  getBaseUrl: () => getWebAppBaseUrl(),
  getToken: async () => {
    const connection = await getStoredConnection();
    return connection?.token ?? null;
  },
});
