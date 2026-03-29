import { captureRouter } from '@/features/captures/router';
import { uploadRouter } from '@/features/uploads/router';

export const appRouter = {
  captures: captureRouter,
  uploads: uploadRouter,
};

export type AppRouter = typeof appRouter;
