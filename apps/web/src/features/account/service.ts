import 'server-only';

import { ORPCError } from '@orpc/server';

import {
  createPresignedDownload,
  deleteObject,
} from '@/features/uploads/storage';
import { getRequestLogger } from '@/lib/evlog';

import { type AccountRepository, createAccountRepository } from './repository';
import { type AccountExportManifest, EXPORT_MANIFEST_VERSION } from './schemas';

const DOWNLOAD_URL_TTL_SECONDS = 60 * 15;

const BACKUP_RETENTION_NOTE =
  'Backup copies may persist in managed Postgres backups and S3 versioned storage for up to 30 days before being removed.';

const DOWNLOAD_URL_TTL_NOTE =
  'Signed download URLs in this export expire 15 minutes after the export was generated. Re-run the export to obtain fresh URLs.';

type ExportAccountInput = {
  userId: string;
};

type DeleteAccountInput = {
  userId: string;
};

type ExportAccountDeps = {
  createPresignedDownload: typeof createPresignedDownload;
  now: () => Date;
  repository: AccountRepository;
};

type DeleteAccountDeps = {
  deleteObject: typeof deleteObject;
  repository: AccountRepository;
};

export async function exportAccount(
  input: ExportAccountInput,
  deps: ExportAccountDeps = {
    createPresignedDownload,
    now: () => new Date(),
    repository: createAccountRepository(),
  },
): Promise<AccountExportManifest> {
  const data = await deps.repository.loadExportData({ userId: input.userId });

  if (!data) {
    throw new ORPCError('NOT_FOUND', {
      message: 'Account was not found.',
    });
  }

  const generatedAt = deps.now();
  const downloadUrlExpiresAt = new Date(
    generatedAt.getTime() + DOWNLOAD_URL_TTL_SECONDS * 1000,
  ).toISOString();

  const logger = getRequestLogger();

  const blobsWithUrls = await Promise.all(
    data.blobs.map(async (blob) => {
      if (blob.deletedAt) {
        return {
          ...blob,
          downloadUrl: null,
          downloadUrlExpiresAt: null,
        };
      }

      try {
        const downloadUrl = await deps.createPresignedDownload({
          objectKey: blob.objectKey,
        });
        return {
          ...blob,
          downloadUrl,
          downloadUrlExpiresAt,
        };
      } catch (error) {
        logger.error('account.export.presign_failed', {
          error: error instanceof Error ? error.message : String(error),
          objectKey: blob.objectKey,
        });
        return {
          ...blob,
          downloadUrl: null,
          downloadUrlExpiresAt: null,
        };
      }
    }),
  );

  return {
    blobs: blobsWithUrls,
    citations: data.citations,
    deviceTokens: data.deviceTokens,
    downloadUrlTtlSeconds: DOWNLOAD_URL_TTL_SECONDS,
    generatedAt: generatedAt.toISOString(),
    memories: data.memories,
    notes: {
      backupRetention: BACKUP_RETENTION_NOTE,
      downloadUrlTtl: DOWNLOAD_URL_TTL_NOTE,
    },
    segments: data.segments,
    sourceItems: data.sourceItems,
    spaces: data.spaces,
    user: data.user,
    version: EXPORT_MANIFEST_VERSION,
  };
}

export async function deleteAccount(
  input: DeleteAccountInput,
  deps: DeleteAccountDeps = {
    deleteObject,
    repository: createAccountRepository(),
  },
): Promise<{ deleted: true; userId: string }> {
  const result = await deps.repository.deleteAccount({ userId: input.userId });

  const logger = getRequestLogger();

  for (const objectKey of result.deletedObjectKeys) {
    try {
      await deps.deleteObject({ objectKey });
    } catch (error) {
      logger.error('account.delete.blob_cleanup_failed', {
        error: error instanceof Error ? error.message : String(error),
        objectKey,
        userId: input.userId,
      });
    }
  }

  return {
    deleted: true as const,
    userId: input.userId,
  };
}
