import { uploadRouter } from '@/features/uploads/router';

export const appRouter = {
  uploads: uploadRouter,
};

export type AppRouter = typeof appRouter;
