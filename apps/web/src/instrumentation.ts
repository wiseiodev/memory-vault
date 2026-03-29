import { defineNodeInstrumentation } from 'evlog/next/instrumentation';

export const { onRequestError, register } = defineNodeInstrumentation(
  () => import('./lib/evlog'),
);
