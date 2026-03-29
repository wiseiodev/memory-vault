import { captureRouter } from '@/features/captures/router';
import { ingestionRouter } from '@/features/ingestion/router';
import { uploadRouter } from '@/features/uploads/router';

export const appRouter = {
  captures: captureRouter,
  ingestion: ingestionRouter,
  uploads: uploadRouter,
};

export type AppRouter = typeof appRouter;
