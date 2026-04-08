import { captureRouter } from '@/features/captures/router';
import { deviceTokenRouter } from '@/features/device-tokens/router';
import { ingestionRouter } from '@/features/ingestion/router';
import { queryRouter } from '@/features/query/router';
import { uploadRouter } from '@/features/uploads/router';

export const appRouter = {
  captures: captureRouter,
  deviceTokens: deviceTokenRouter,
  ingestion: ingestionRouter,
  query: queryRouter,
  uploads: uploadRouter,
};

export type AppRouter = typeof appRouter;
