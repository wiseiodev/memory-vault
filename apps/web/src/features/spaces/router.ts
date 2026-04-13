import { authed } from '@/rpc/procedures';

import { getSpaceInput, listSpacesOutput, spaceDetail } from './schemas';
import { getSpace, listSpaces } from './service';

export const spaceRouter = {
  get: authed
    .input(getSpaceInput)
    .output(spaceDetail)
    .handler(async ({ context, input }) => {
      return getSpace({ ...input, userId: context.user.id });
    }),
  list: authed.output(listSpacesOutput).handler(async ({ context }) => {
    return listSpaces({ userId: context.user.id });
  }),
};
