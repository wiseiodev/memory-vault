import { serve } from 'inngest/next';

import { inngest } from '@/inngest/client';
import { inngestFunctions } from '@/inngest/functions';
import { withEvlog } from '@/lib/evlog';

export const runtime = 'nodejs';

const {
  GET: inngestGet,
  POST: inngestPost,
  PUT: inngestPut,
} = serve({
  client: inngest,
  functions: inngestFunctions,
});

export const GET = withEvlog(inngestGet);
export const POST = withEvlog(inngestPost);
export const PUT = withEvlog(inngestPut);
