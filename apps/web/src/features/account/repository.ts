import 'server-only';

import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import { getDb } from '@/db';
import {
  deviceTokens,
  evaluationRuns,
  ingestionJobs,
  memories,
  memoryCitations,
  segments,
  sourceBlobs,
  sourceItems,
  spaces,
  user,
} from '@/db/schema';

type Db = ReturnType<typeof getDb>;

export type AccountExportUserRow = {
  createdAt: string;
  email: string;
  id: string;
  name: string;
};

export type AccountExportSpaceRow = {
  archivedAt: string | null;
  createdAt: string;
  deletedAt: string | null;
  description: string | null;
  id: string;
  isDefault: boolean;
  name: string;
  slug: string | null;
  updatedAt: string;
};

export type AccountExportSourceItemRow = {
  canonicalUri: string | null;
  capturedAt: string | null;
  checksumSha256: string | null;
  connectorKey: string | null;
  createdAt: string;
  deletedAt: string | null;
  externalId: string | null;
  externalParentId: string | null;
  id: string;
  kind: string;
  languageCode: string | null;
  metadata: Record<string, unknown>;
  mimeType: string | null;
  processedAt: string | null;
  sourceFingerprint: string | null;
  spaceId: string;
  status: string;
  title: string | null;
  updatedAt: string;
};

export type AccountExportBlobRow = {
  bucket: string | null;
  byteSize: string | null;
  checksumSha256: string | null;
  contentType: string | null;
  createdAt: string;
  deletedAt: string | null;
  etag: string | null;
  extractionStatus: string;
  id: string;
  metadata: Record<string, unknown>;
  objectKey: string;
  sourceItemId: string;
  storageProvider: string;
  uploadedAt: string | null;
};

export type AccountExportSegmentRow = {
  charEnd: number | null;
  charStart: number | null;
  content: string;
  contentHash: string | null;
  createdAt: string;
  id: string;
  kind: string;
  ordinal: number;
  sourceBlobId: string | null;
  sourceItemId: string;
  tokenCount: number | null;
};

export type AccountExportMemoryRow = {
  confidence: number | null;
  content: string;
  createdAt: string;
  id: string;
  kind: string;
  lastObservedAt: string | null;
  metadata: Record<string, unknown>;
  spaceId: string;
  state: string;
  summary: string | null;
  supersededByMemoryId: string | null;
  title: string | null;
  updatedAt: string;
  validFrom: string | null;
  validTo: string | null;
};

export type AccountExportCitationRow = {
  id: string;
  locator: Record<string, unknown>;
  memoryId: string;
  ordinal: number;
  quoteText: string | null;
  segmentId: string | null;
  sourceItemId: string | null;
};

export type AccountExportDeviceTokenRow = {
  createdAt: string;
  id: string;
  label: string | null;
  lastUsedAt: string | null;
  platform: string;
  revokedAt: string | null;
  spaceId: string | null;
  tokenPrefix: string;
};

export type AccountExportData = {
  blobs: AccountExportBlobRow[];
  citations: AccountExportCitationRow[];
  deviceTokens: AccountExportDeviceTokenRow[];
  memories: AccountExportMemoryRow[];
  segments: AccountExportSegmentRow[];
  sourceItems: AccountExportSourceItemRow[];
  spaces: AccountExportSpaceRow[];
  user: AccountExportUserRow;
};

export type DeleteAccountResult = {
  deletedObjectKeys: string[];
};

export type AccountRepository = {
  deleteAccount(input: { userId: string }): Promise<DeleteAccountResult>;
  loadExportData(input: { userId: string }): Promise<AccountExportData | null>;
};

export function createAccountRepository(db: Db = getDb()): AccountRepository {
  return {
    async loadExportData(input) {
      const [userRow] = await db
        .select({
          createdAt: user.createdAt,
          email: user.email,
          id: user.id,
          name: user.name,
        })
        .from(user)
        .where(eq(user.id, input.userId))
        .limit(1);

      if (!userRow) {
        return null;
      }

      const spaceRows = await db
        .select({
          archivedAt: spaces.archivedAt,
          createdAt: spaces.createdAt,
          deletedAt: spaces.deletedAt,
          description: spaces.description,
          id: spaces.id,
          isDefault: spaces.isDefault,
          name: spaces.name,
          slug: spaces.slug,
          updatedAt: spaces.updatedAt,
        })
        .from(spaces)
        .where(eq(spaces.ownerUserId, input.userId))
        .orderBy(asc(spaces.createdAt));

      const spaceIds = spaceRows.map((row) => row.id);

      const sourceItemRows = spaceIds.length
        ? await db
            .select({
              canonicalUri: sourceItems.canonicalUri,
              capturedAt: sourceItems.capturedAt,
              checksumSha256: sourceItems.checksumSha256,
              connectorKey: sourceItems.connectorKey,
              createdAt: sourceItems.createdAt,
              deletedAt: sourceItems.deletedAt,
              externalId: sourceItems.externalId,
              externalParentId: sourceItems.externalParentId,
              id: sourceItems.id,
              kind: sourceItems.kind,
              languageCode: sourceItems.languageCode,
              metadata: sourceItems.metadata,
              mimeType: sourceItems.mimeType,
              processedAt: sourceItems.processedAt,
              sourceFingerprint: sourceItems.sourceFingerprint,
              spaceId: sourceItems.spaceId,
              status: sourceItems.status,
              title: sourceItems.title,
              updatedAt: sourceItems.updatedAt,
            })
            .from(sourceItems)
            .where(inArray(sourceItems.spaceId, spaceIds))
            .orderBy(asc(sourceItems.createdAt))
        : [];

      const sourceItemIds = sourceItemRows.map((row) => row.id);

      const blobRows = sourceItemIds.length
        ? await db
            .select({
              bucket: sourceBlobs.bucket,
              byteSize: sourceBlobs.byteSize,
              checksumSha256: sourceBlobs.checksumSha256,
              contentType: sourceBlobs.contentType,
              createdAt: sourceBlobs.createdAt,
              deletedAt: sourceBlobs.deletedAt,
              etag: sourceBlobs.etag,
              extractionStatus: sourceBlobs.extractionStatus,
              id: sourceBlobs.id,
              metadata: sourceBlobs.metadata,
              objectKey: sourceBlobs.objectKey,
              sourceItemId: sourceBlobs.sourceItemId,
              storageProvider: sourceBlobs.storageProvider,
              uploadedAt: sourceBlobs.uploadedAt,
            })
            .from(sourceBlobs)
            .where(inArray(sourceBlobs.sourceItemId, sourceItemIds))
            .orderBy(asc(sourceBlobs.createdAt))
        : [];

      const segmentRows = sourceItemIds.length
        ? await db
            .select({
              charEnd: segments.charEnd,
              charStart: segments.charStart,
              content: segments.content,
              contentHash: segments.contentHash,
              createdAt: segments.createdAt,
              id: segments.id,
              kind: segments.kind,
              ordinal: segments.ordinal,
              sourceBlobId: segments.sourceBlobId,
              sourceItemId: segments.sourceItemId,
              tokenCount: segments.tokenCount,
            })
            .from(segments)
            .where(inArray(segments.sourceItemId, sourceItemIds))
            .orderBy(asc(segments.sourceItemId), asc(segments.ordinal))
        : [];

      const memoryRows = spaceIds.length
        ? await db
            .select({
              confidence: memories.confidence,
              content: memories.content,
              createdAt: memories.createdAt,
              id: memories.id,
              kind: memories.kind,
              lastObservedAt: memories.lastObservedAt,
              metadata: memories.metadata,
              spaceId: memories.spaceId,
              state: memories.state,
              summary: memories.summary,
              supersededByMemoryId: memories.supersededByMemoryId,
              title: memories.title,
              updatedAt: memories.updatedAt,
              validFrom: memories.validFrom,
              validTo: memories.validTo,
            })
            .from(memories)
            .where(inArray(memories.spaceId, spaceIds))
            .orderBy(asc(memories.createdAt))
        : [];

      const memoryIds = memoryRows.map((row) => row.id);

      const citationRows = memoryIds.length
        ? await db
            .select({
              id: memoryCitations.id,
              locator: memoryCitations.locator,
              memoryId: memoryCitations.memoryId,
              ordinal: memoryCitations.ordinal,
              quoteText: memoryCitations.quoteText,
              segmentId: memoryCitations.segmentId,
              sourceItemId: memoryCitations.sourceItemId,
            })
            .from(memoryCitations)
            .where(inArray(memoryCitations.memoryId, memoryIds))
            .orderBy(
              asc(memoryCitations.memoryId),
              asc(memoryCitations.ordinal),
            )
        : [];

      const deviceTokenRows = await db
        .select({
          createdAt: deviceTokens.createdAt,
          id: deviceTokens.id,
          label: deviceTokens.label,
          lastUsedAt: deviceTokens.lastUsedAt,
          platform: deviceTokens.platform,
          revokedAt: deviceTokens.revokedAt,
          spaceId: deviceTokens.spaceId,
          tokenPrefix: deviceTokens.tokenPrefix,
        })
        .from(deviceTokens)
        .where(eq(deviceTokens.userId, input.userId))
        .orderBy(asc(deviceTokens.createdAt));

      return {
        blobs: blobRows.map((row) => ({
          bucket: row.bucket,
          byteSize: row.byteSize?.toString() ?? null,
          checksumSha256: row.checksumSha256,
          contentType: row.contentType,
          createdAt: row.createdAt.toISOString(),
          deletedAt: row.deletedAt?.toISOString() ?? null,
          etag: row.etag,
          extractionStatus: row.extractionStatus,
          id: row.id,
          metadata: row.metadata ?? {},
          objectKey: row.objectKey,
          sourceItemId: row.sourceItemId,
          storageProvider: row.storageProvider,
          uploadedAt: row.uploadedAt?.toISOString() ?? null,
        })),
        citations: citationRows.map((row) => ({
          id: row.id,
          locator: row.locator ?? {},
          memoryId: row.memoryId,
          ordinal: row.ordinal,
          quoteText: row.quoteText,
          segmentId: row.segmentId,
          sourceItemId: row.sourceItemId,
        })),
        deviceTokens: deviceTokenRows.map((row) => ({
          createdAt: row.createdAt.toISOString(),
          id: row.id,
          label: row.label,
          lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
          platform: row.platform,
          revokedAt: row.revokedAt?.toISOString() ?? null,
          spaceId: row.spaceId,
          tokenPrefix: row.tokenPrefix,
        })),
        memories: memoryRows.map((row) => ({
          confidence: row.confidence,
          content: row.content,
          createdAt: row.createdAt.toISOString(),
          id: row.id,
          kind: row.kind,
          lastObservedAt: row.lastObservedAt?.toISOString() ?? null,
          metadata: row.metadata ?? {},
          spaceId: row.spaceId,
          state: row.state,
          summary: row.summary,
          supersededByMemoryId: row.supersededByMemoryId,
          title: row.title,
          updatedAt: row.updatedAt.toISOString(),
          validFrom: row.validFrom?.toISOString() ?? null,
          validTo: row.validTo?.toISOString() ?? null,
        })),
        segments: segmentRows.map((row) => ({
          charEnd: row.charEnd,
          charStart: row.charStart,
          content: row.content,
          contentHash: row.contentHash,
          createdAt: row.createdAt.toISOString(),
          id: row.id,
          kind: row.kind,
          ordinal: row.ordinal,
          sourceBlobId: row.sourceBlobId,
          sourceItemId: row.sourceItemId,
          tokenCount: row.tokenCount,
        })),
        sourceItems: sourceItemRows.map((row) => ({
          canonicalUri: row.canonicalUri,
          capturedAt: row.capturedAt?.toISOString() ?? null,
          checksumSha256: row.checksumSha256,
          connectorKey: row.connectorKey,
          createdAt: row.createdAt.toISOString(),
          deletedAt: row.deletedAt?.toISOString() ?? null,
          externalId: row.externalId,
          externalParentId: row.externalParentId,
          id: row.id,
          kind: row.kind,
          languageCode: row.languageCode,
          metadata: row.metadata ?? {},
          mimeType: row.mimeType,
          processedAt: row.processedAt?.toISOString() ?? null,
          sourceFingerprint: row.sourceFingerprint,
          spaceId: row.spaceId,
          status: row.status,
          title: row.title,
          updatedAt: row.updatedAt.toISOString(),
        })),
        spaces: spaceRows.map((row) => ({
          archivedAt: row.archivedAt?.toISOString() ?? null,
          createdAt: row.createdAt.toISOString(),
          deletedAt: row.deletedAt?.toISOString() ?? null,
          description: row.description,
          id: row.id,
          isDefault: row.isDefault,
          name: row.name,
          slug: row.slug,
          updatedAt: row.updatedAt.toISOString(),
        })),
        user: {
          createdAt: userRow.createdAt.toISOString(),
          email: userRow.email,
          id: userRow.id,
          name: userRow.name,
        },
      };
    },
    async deleteAccount(input) {
      return db.transaction(async (tx) => {
        const ownedSpaces = await tx
          .select({ id: spaces.id })
          .from(spaces)
          .where(eq(spaces.ownerUserId, input.userId));

        const spaceIds = ownedSpaces.map((row) => row.id);

        if (spaceIds.length === 0) {
          await tx.delete(user).where(eq(user.id, input.userId));
          return { deletedObjectKeys: [] };
        }

        const blobRows = await tx
          .select({ objectKey: sourceBlobs.objectKey })
          .from(sourceBlobs)
          .innerJoin(sourceItems, eq(sourceBlobs.sourceItemId, sourceItems.id))
          .where(inArray(sourceItems.spaceId, spaceIds));

        const deletedObjectKeys = blobRows.map((row) => row.objectKey);

        await tx
          .delete(memoryCitations)
          .where(
            sql`${memoryCitations.memoryId} in (select ${memories.id} from ${memories} where ${memories.spaceId} = any(${spaceIds}))`,
          );

        await tx.delete(memories).where(inArray(memories.spaceId, spaceIds));

        await tx
          .delete(ingestionJobs)
          .where(inArray(ingestionJobs.spaceId, spaceIds));

        await tx
          .delete(evaluationRuns)
          .where(inArray(evaluationRuns.spaceId, spaceIds));

        await tx
          .delete(segments)
          .where(
            sql`${segments.sourceItemId} in (select ${sourceItems.id} from ${sourceItems} where ${sourceItems.spaceId} = any(${spaceIds}))`,
          );

        await tx
          .delete(sourceBlobs)
          .where(
            sql`${sourceBlobs.sourceItemId} in (select ${sourceItems.id} from ${sourceItems} where ${sourceItems.spaceId} = any(${spaceIds}))`,
          );

        await tx
          .delete(sourceItems)
          .where(inArray(sourceItems.spaceId, spaceIds));

        await tx
          .delete(spaces)
          .where(
            and(
              eq(spaces.ownerUserId, input.userId),
              inArray(spaces.id, spaceIds),
            ),
          );

        await tx.delete(user).where(eq(user.id, input.userId));

        return { deletedObjectKeys };
      });
    },
  };
}
