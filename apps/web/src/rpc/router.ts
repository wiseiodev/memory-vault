import { captureRouter } from '@/features/captures/router';
import { deviceTokenRouter } from '@/features/device-tokens/router';
import { ingestionRouter } from '@/features/ingestion/router';
import { itemRouter } from '@/features/items/router';
import { queryRouter } from '@/features/query/router';
import { spaceRouter } from '@/features/spaces/router';
import { uploadRouter } from '@/features/uploads/router';

export const appRouter = {
  captures: captureRouter,
  deviceTokens: deviceTokenRouter,
  ingestion: ingestionRouter,
  items: itemRouter,
  query: queryRouter,
  spaces: spaceRouter,
  uploads: uploadRouter,
};

export type AppRouter = typeof appRouter;
