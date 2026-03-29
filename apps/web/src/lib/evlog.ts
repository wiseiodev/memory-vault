import 'server-only';

import { createEvlog } from 'evlog/next';
import { createInstrumentation } from 'evlog/next/instrumentation';

const service = process.env.SERVICE_NAME?.trim() || 'memory-vault-web';

const {
  createError,
  log,
  useLogger: requestScopedLogger,
  withEvlog,
} = createEvlog({
  service,
});

export { createError, log, withEvlog };

export const useLogger = requestScopedLogger;

export function getRequestLogger() {
  return requestScopedLogger();
}

export const { onRequestError, register } = createInstrumentation({
  service,
});
