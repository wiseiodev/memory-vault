import { eventIterator } from '@orpc/server';
import { authed } from '@/rpc/procedures';

import { askQueryEvent, askQueryInput } from './schemas';
import { askQuery } from './service';

export const queryRouter = {
  ask: authed
    .input(askQueryInput)
    .output(eventIterator(askQueryEvent))
    .handler(async ({ context, input }) => {
      return askQuery({
        ...input,
        userId: context.user.id,
      });
    }),
};
