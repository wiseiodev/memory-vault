import { authed } from '@/rpc/procedures';

import {
  captureSummaryOutput,
  createNoteCaptureInput,
  createUrlCaptureInput,
  finalizeUploadCaptureInput,
} from './schemas';
import {
  createNoteCapture,
  createUrlCapture,
  finalizeUploadCapture,
} from './service';

export const captureRouter = {
  createNote: authed
    .input(createNoteCaptureInput)
    .output(captureSummaryOutput)
    .handler(async ({ context, input }) => {
      return createNoteCapture({ ...input, userId: context.user.id });
    }),
  createUrl: authed
    .input(createUrlCaptureInput)
    .output(captureSummaryOutput)
    .handler(async ({ context, input }) => {
      return createUrlCapture({ ...input, userId: context.user.id });
    }),
  finalizeUpload: authed
    .input(finalizeUploadCaptureInput)
    .output(captureSummaryOutput)
    .handler(async ({ context, input }) => {
      return finalizeUploadCapture({ ...input, userId: context.user.id });
    }),
};
