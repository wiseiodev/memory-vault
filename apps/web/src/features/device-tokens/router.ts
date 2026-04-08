import { authed, extensionAuthed } from '@/rpc/procedures';

import {
  listDeviceTokensOutput,
  revokeDeviceTokenInput,
  revokeDeviceTokenOutput,
} from './schemas';
import {
  listDeviceTokens,
  revokeCurrentDeviceToken,
  revokeOwnedDeviceToken,
} from './service';

export const deviceTokenRouter = {
  list: authed.output(listDeviceTokensOutput).handler(async ({ context }) => {
    return listDeviceTokens({
      userId: context.user.id,
    });
  }),
  revoke: authed
    .input(revokeDeviceTokenInput)
    .output(revokeDeviceTokenOutput)
    .handler(async ({ context, input }) => {
      return revokeOwnedDeviceToken({
        deviceTokenId: input.deviceTokenId,
        userId: context.user.id,
      });
    }),
  revokeCurrent: extensionAuthed
    .output(revokeDeviceTokenOutput)
    .handler(async ({ context }) => {
      return revokeCurrentDeviceToken({
        deviceTokenId: context.extension.deviceTokenId,
      });
    }),
};
