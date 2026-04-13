import { authed } from '@/rpc/procedures';

import {
  getItemInput,
  itemDetail,
  listItemsInput,
  listItemsOutput,
} from './schemas';
import { getItem, listItems } from './service';

export const itemRouter = {
  get: authed
    .input(getItemInput)
    .output(itemDetail)
    .handler(async ({ context, input }) => {
      return getItem({ ...input, userId: context.user.id });
    }),
  list: authed
    .input(listItemsInput)
    .output(listItemsOutput)
    .handler(async ({ context, input }) => {
      return listItems({ ...input, userId: context.user.id });
    }),
};
