import 'server-only';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider';

type StorageConfig = {
  bucket: string;
  region: string;
  roleArn: string;
};

type HeadedObject = {
  byteSize: bigint;
  contentType: string | null;
  etag: string | null;
};

let storageConfig: StorageConfig | undefined;
let s3Client: S3Client | undefined;

export function getStorageConfig(): StorageConfig {
  if (storageConfig) {
    return storageConfig;
  }

  const bucket = readRequiredEnvVar('MEMORY_VAULT_BLOB_BUCKET');
  const region = readRequiredEnvVar('AWS_REGION');
  const roleArn = readRequiredEnvVar('AWS_ROLE_ARN');

  storageConfig = {
    bucket,
    region,
    roleArn,
  };

  return storageConfig;
}

function readRequiredEnvVar(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Expected MEMORY_VAULT_BLOB_BUCKET, AWS_REGION, and AWS_ROLE_ARN.`,
    );
  }

  return value;
}

export function getS3Client() {
  if (s3Client) {
    return s3Client;
  }

  s3Client = new S3Client({
    credentials: awsCredentialsProvider({
      clientConfig: {
        region: getStorageConfig().region,
      },
      roleArn: getStorageConfig().roleArn,
    }),
    region: getStorageConfig().region,
  });

  return s3Client;
}

export async function createPresignedUpload(input: {
  contentType: string;
  objectKey: string;
}) {
  const config = getStorageConfig();
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    ContentType: input.contentType,
    Key: input.objectKey,
  });

  const uploadUrl = await getSignedUrl(getS3Client(), command, {
    expiresIn: 60 * 15,
  });

  return {
    uploadHeaders: {
      'Content-Type': input.contentType,
    },
    uploadUrl,
  };
}

export async function createPresignedDownload(input: { objectKey: string }) {
  const config = getStorageConfig();
  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: input.objectKey,
  });

  return getSignedUrl(getS3Client(), command, {
    expiresIn: 60 * 5,
  });
}

export async function readObjectBytes(input: { objectKey: string }) {
  const config = getStorageConfig();
  const response = await getS3Client().send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: input.objectKey,
    }),
  );

  const body = response.Body;

  if (!body) {
    throw new Error(`Object body was empty for key ${input.objectKey}.`);
  }

  return new Uint8Array(await body.transformToByteArray());
}

export async function deleteObject(input: { objectKey: string }) {
  const config = getStorageConfig();

  await getS3Client().send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: input.objectKey,
    }),
  );
}

export async function headObject(input: {
  objectKey: string;
}): Promise<HeadedObject | null> {
  const config = getStorageConfig();

  try {
    const response = await getS3Client().send(
      new HeadObjectCommand({
        Bucket: config.bucket,
        Key: input.objectKey,
      }),
    );

    return {
      byteSize: BigInt(response.ContentLength ?? 0),
      contentType: response.ContentType ?? null,
      etag: response.ETag?.replaceAll('"', '') ?? null,
    };
  } catch (error) {
    if (error instanceof NoSuchKey || error instanceof NotFound) {
      return null;
    }

    if (
      error &&
      typeof error === 'object' &&
      '$metadata' in error &&
      typeof error.$metadata === 'object' &&
      error.$metadata !== null &&
      'httpStatusCode' in error.$metadata &&
      error.$metadata.httpStatusCode === 404
    ) {
      return null;
    }

    throw error;
  }
}
