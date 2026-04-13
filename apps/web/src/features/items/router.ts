import { authed } from '@/rpc/procedures';

import {
  deleteItemInput,
  deleteItemOutput,
  getItemInput,
  itemDetail,
  listItemsInput,
  listItemsOutput,
} from './schemas';
import { deleteItem, getItem, listItems } from './service';

export const itemRouter = {
  delete: authed
    .input(deleteItemInput)
    .output(deleteItemOutput)
    .handler(async ({ context, input }) => {
      return deleteItem({ ...input, userId: context.user.id });
    }),
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
