import { authed, extensionAuthed } from '@/rpc/procedures';

import {
  abandonWebCaptureInput,
  abandonWebCaptureOutput,
  beginWebCaptureInput,
  beginWebCaptureOutput,
  captureSummaryOutput,
  completeWebCaptureInput,
  createExtensionNoteInput,
  createNoteCaptureInput,
  createUrlCaptureInput,
  extensionCaptureSummaryOutput,
  finalizeUploadCaptureInput,
} from './schemas';
import {
  abandonWebCapture,
  beginWebCapture,
  completeWebCapture,
  createExtensionNoteCapture,
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
  createExtensionNote: extensionAuthed
    .input(createExtensionNoteInput)
    .output(extensionCaptureSummaryOutput)
    .handler(async ({ context, input }) => {
      return createExtensionNoteCapture({
        ...input,
        spaceId: context.extension.spaceId,
        userId: context.extension.userId,
      });
    }),
  beginWebCapture: extensionAuthed
    .input(beginWebCaptureInput)
    .output(beginWebCaptureOutput)
    .handler(async ({ context, input }) => {
      return beginWebCapture({
        ...input,
        spaceId: context.extension.spaceId,
        userId: context.extension.userId,
      });
    }),
  completeWebCapture: extensionAuthed
    .input(completeWebCaptureInput)
    .output(extensionCaptureSummaryOutput)
    .handler(async ({ context, input }) => {
      return completeWebCapture({
        ...input,
        spaceId: context.extension.spaceId,
        userId: context.extension.userId,
      });
    }),
  abandonWebCapture: extensionAuthed
    .input(abandonWebCaptureInput)
    .output(abandonWebCaptureOutput)
    .handler(async ({ context, input }) => {
      return abandonWebCapture({
        ...input,
        spaceId: context.extension.spaceId,
        userId: context.extension.userId,
      });
    }),
};
