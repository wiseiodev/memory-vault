import { authed } from '@/rpc/procedures';

import { accountExportOutput, deleteAccountOutput } from './schemas';
import { deleteAccount, exportAccount } from './service';

export const accountRouter = {
  delete: authed.output(deleteAccountOutput).handler(async ({ context }) => {
    return deleteAccount({ userId: context.user.id });
  }),
  export: authed.output(accountExportOutput).handler(async ({ context }) => {
    return exportAccount({ userId: context.user.id });
  }),
};
