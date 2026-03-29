import { existsSync } from 'node:fs';
import path from 'node:path';

import { config as loadDotenv } from 'dotenv';
import { vi } from 'vitest';

const cwd = process.cwd();
const dotenvPaths = ['.env.local', '.env'].map((file) => path.join(cwd, file));

for (const dotenvPath of dotenvPaths) {
  if (existsSync(dotenvPath)) {
    loadDotenv({
      override: false,
      path: dotenvPath,
    });
  }
}

vi.mock('server-only', () => ({}));
