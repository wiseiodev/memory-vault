import { authed } from '@/rpc/procedures';

import {
  completeUploadInput,
  completeUploadOutput,
  deleteUploadInput,
  deleteUploadOutput,
  downloadUploadInput,
  downloadUploadOutput,
  listUploadsOutput,
  reserveUploadInput,
  reserveUploadOutput,
} from './schemas';
import {
  completeUpload,
  deleteUpload,
  getDownloadUrl,
  listUploads,
  reserveUpload,
} from './service';

export const uploadRouter = {
  reserve: authed
    .input(reserveUploadInput)
    .output(reserveUploadOutput)
    .handler(async ({ input, context }) => {
      return reserveUpload({ ...input, userId: context.user.id });
    }),
  complete: authed
    .input(completeUploadInput)
    .output(completeUploadOutput)
    .handler(async ({ input, context }) => {
      return completeUpload({ ...input, userId: context.user.id });
    }),
  delete: authed
    .input(deleteUploadInput)
    .output(deleteUploadOutput)
    .handler(async ({ input, context }) => {
      return deleteUpload({ ...input, userId: context.user.id });
    }),
  download: authed
    .input(downloadUploadInput)
    .output(downloadUploadOutput)
    .handler(async ({ input, context }) => {
      return getDownloadUrl({ ...input, userId: context.user.id });
    }),
  list: authed.output(listUploadsOutput).handler(async ({ context }) => {
    return listUploads({ userId: context.user.id });
  }),
};
