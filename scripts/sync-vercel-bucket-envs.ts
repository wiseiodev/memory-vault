import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT_DIR = process.cwd();
const ENV_FILE = join(ROOT_DIR, '.env.local');
const BUCKET_ENV_NAME = 'MEMORY_VAULT_BLOB_BUCKET';

type Stage = 'dev' | 'preview' | 'prod';

const STAGE_CONFIG: Record<
  Stage,
  {
    stackName: string;
    vercelEnvironment: 'development' | 'preview' | 'production';
  }
> = {
  dev: {
    stackName: 'dev-memories-bucket-stack',
    vercelEnvironment: 'development',
  },
  preview: {
    stackName: 'preview-memories-bucket-stack',
    vercelEnvironment: 'preview',
  },
  prod: {
    stackName: 'prod-memories-bucket-stack',
    vercelEnvironment: 'production',
  },
};

function main(): void {
  const { AWS_PROFILE, AWS_REGION } = readAwsConfig();

  for (const stage of ['dev', 'preview', 'prod'] as const) {
    const { stackName, vercelEnvironment } = STAGE_CONFIG[stage];
    const bucketName = getBucketName(stackName, AWS_PROFILE, AWS_REGION);

    if (!bucketName || bucketName === 'None') {
      throw new Error(
        `Could not resolve BucketName output for stack ${stackName}`,
      );
    }

    setVercelEnv(vercelEnvironment, bucketName);
    console.log(`Synced ${stackName} -> ${vercelEnvironment} (${bucketName})`);
  }
}

function readAwsConfig(): { AWS_PROFILE: string; AWS_REGION: string } {
  if (!existsSync(ENV_FILE)) {
    throw new Error(`Missing ${ENV_FILE}`);
  }

  const parsed = parseDotEnv(readFileSync(ENV_FILE, 'utf8'));
  const AWS_PROFILE = parsed.AWS_PROFILE;
  const AWS_REGION = parsed.AWS_REGION;

  if (!AWS_PROFILE) {
    throw new Error('AWS_PROFILE must be set in .env.local');
  }

  if (!AWS_REGION) {
    throw new Error('AWS_REGION must be set in .env.local');
  }

  return { AWS_PROFILE, AWS_REGION };
}

function parseDotEnv(contents: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function getBucketName(
  stackName: string,
  profile: string,
  region: string,
): string {
  return runCommand('aws', [
    'cloudformation',
    'describe-stacks',
    '--profile',
    profile,
    '--region',
    region,
    '--stack-name',
    stackName,
    '--query',
    "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue",
    '--output',
    'text',
  ]).trim();
}

function setVercelEnv(
  environment: 'development' | 'preview' | 'production',
  bucketName: string,
): void {
  try {
    runCommand('vercel', ['env', 'rm', BUCKET_ENV_NAME, environment, '--yes'], {
      stdio: 'ignore',
    });
  } catch {
    // Ignore missing env vars so reruns stay idempotent.
  }

  runCommand('vercel', ['env', 'add', BUCKET_ENV_NAME, environment], {
    input: `${bucketName}\n`,
    stdio: ['pipe', 'ignore', 'inherit'],
  });
}

function runCommand(
  command: string,
  args: string[],
  options?: {
    input?: string;
    stdio?: 'ignore' | ['pipe', 'ignore', 'inherit'];
  },
): string {
  return execFileSync(command, args, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    input: options?.input,
    stdio: options?.stdio ?? ['pipe', 'pipe', 'inherit'],
  });
}

main();
