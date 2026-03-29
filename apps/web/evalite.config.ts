import { defineConfig } from 'evalite/config';
import { createInMemoryStorage } from 'evalite/in-memory-storage';

export default defineConfig({
  storage: () => createInMemoryStorage(),
  setupFiles: ['./evalite.setup.ts'],
  testTimeout: 120_000,
});
