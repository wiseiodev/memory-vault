import 'server-only';

import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';

import { getDb } from '@/db';
import {
  memories,
  memoryCitations,
  segments,
  sourceBlobs,
  sourceItems,
  spaces,
} from '@/db/schema';

type Db = ReturnType<typeof getDb>;

export type ItemListRow = {
  canonicalUri: string | null;
  capturedAt: string | null;
  createdAt: string;
  kind: 'file' | 'note' | 'web_page';
  memoryCount: number;
  metadata: Record<string, unknown>;
  segmentCount: number;
  sourceItemId: string;
  spaceId: string;
  spaceName: string;
  status: 'archived' | 'failed' | 'pending' | 'processing' | 'ready';
  title: string | null;
};

export type ItemDetailRow = {
  blob: {
    byteSize: bigint | null;
    contentType: string | null;
    objectKey: string;
    sourceBlobId: string;
    uploadedAt: string | null;
  } | null;
  canonicalUri: string | null;
  capturedAt: string | null;
  createdAt: string;
  kind: 'file' | 'note' | 'web_page';
  memories: Array<{
    content: string;
    createdAt: string;
    id: string;
    kind: string;
    state: 'active' | 'archived' | 'invalidated' | 'superseded';
    summary: string | null;
    title: string | null;
  }>;
  memoryCount: number;
  metadata: Record<string, unknown>;
  mimeType: string | null;
  segmentCount: number;
  segments: Array<{
    charEnd: number | null;
    charStart: number | null;
    content: string;
    id: string;
    kind: 'ocr' | 'plain_text' | 'quote' | 'title' | 'transcript';
    ordinal: number;
    tokenCount: number | null;
  }>;
  sourceItemId: string;
  spaceId: string;
  spaceName: string;
  status: 'archived' | 'failed' | 'pending' | 'processing' | 'ready';
  title: string | null;
  updatedAt: string;
};

export type ItemRepository = {
  getOwnedItem(input: {
    sourceItemId: string;
    userId: string;
  }): Promise<ItemDetailRow | null>;
  listOwnedItems(input: {
    limit: number;
    spaceId?: string;
    userId: string;
  }): Promise<ItemListRow[]>;
};

const MAX_DETAIL_SEGMENTS = 50;
const MAX_DETAIL_MEMORIES = 25;

function normalizeKind(kind: string): 'file' | 'note' | 'web_page' {
  if (kind === 'file' || kind === 'note' || kind === 'web_page') {
    return kind;
  }

  return 'file';
}

function normalizeStatus(
  status: string,
): 'archived' | 'failed' | 'pending' | 'processing' | 'ready' {
  if (
    status === 'archived' ||
    status === 'failed' ||
    status === 'processing' ||
    status === 'ready'
  ) {
    return status;
  }

  return 'pending';
}

function normalizeMemoryState(
  state: string,
): 'active' | 'archived' | 'invalidated' | 'superseded' {
  if (
    state === 'archived' ||
    state === 'invalidated' ||
    state === 'superseded'
  ) {
    return state;
  }

  return 'active';
}

function normalizeSegmentKind(
  kind: string,
): 'ocr' | 'plain_text' | 'quote' | 'title' | 'transcript' {
  if (
    kind === 'ocr' ||
    kind === 'quote' ||
    kind === 'title' ||
    kind === 'transcript'
  ) {
    return kind;
  }

  return 'plain_text';
}

export function createItemRepository(db: Db = getDb()): ItemRepository {
  return {
    async listOwnedItems(input) {
      const segmentCountExpr = sql<number>`(
        select count(*)::int from ${segments}
        where ${segments.sourceItemId} = ${sourceItems.id}
          and ${segments.deletedAt} is null
      )`;

      const memoryCountExpr = sql<number>`(
        select count(distinct ${memories.id})::int from ${memories}
        inner join ${memoryCitations}
          on ${memoryCitations.memoryId} = ${memories.id}
        where ${memories.spaceId} = ${sourceItems.spaceId}
          and ${memories.deletedAt} is null
          and ${memoryCitations.sourceItemId} = ${sourceItems.id}
      )`;

      const filters = [
        eq(spaces.ownerUserId, input.userId),
        isNull(sourceItems.deletedAt),
        isNull(spaces.deletedAt),
        isNull(spaces.archivedAt),
      ];

      if (input.spaceId) {
        filters.push(eq(sourceItems.spaceId, input.spaceId));
      }

      const rows = await db
        .select({
          canonicalUri: sourceItems.canonicalUri,
          capturedAt: sourceItems.capturedAt,
          createdAt: sourceItems.createdAt,
          kind: sourceItems.kind,
          memoryCount: memoryCountExpr,
          metadata: sourceItems.metadata,
          segmentCount: segmentCountExpr,
          sourceItemId: sourceItems.id,
          spaceId: sourceItems.spaceId,
          spaceName: spaces.name,
          status: sourceItems.status,
          title: sourceItems.title,
        })
        .from(sourceItems)
        .innerJoin(spaces, eq(sourceItems.spaceId, spaces.id))
        .where(and(...filters))
        .orderBy(
          desc(
            sql`coalesce(${sourceItems.capturedAt}, ${sourceItems.createdAt})`,
          ),
          desc(sourceItems.createdAt),
        )
        .limit(input.limit);

      return rows.map((row) => ({
        canonicalUri: row.canonicalUri,
        capturedAt: row.capturedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        kind: normalizeKind(row.kind),
        memoryCount: Number(row.memoryCount ?? 0),
        metadata: row.metadata ?? {},
        segmentCount: Number(row.segmentCount ?? 0),
        sourceItemId: row.sourceItemId,
        spaceId: row.spaceId,
        spaceName: row.spaceName,
        status: normalizeStatus(row.status),
        title: row.title,
      }));
    },
    async getOwnedItem(input) {
      const [row] = await db
        .select({
          canonicalUri: sourceItems.canonicalUri,
          capturedAt: sourceItems.capturedAt,
          createdAt: sourceItems.createdAt,
          kind: sourceItems.kind,
          metadata: sourceItems.metadata,
          mimeType: sourceItems.mimeType,
          sourceItemId: sourceItems.id,
          spaceId: sourceItems.spaceId,
          spaceName: spaces.name,
          status: sourceItems.status,
          title: sourceItems.title,
          updatedAt: sourceItems.updatedAt,
        })
        .from(sourceItems)
        .innerJoin(spaces, eq(sourceItems.spaceId, spaces.id))
        .where(
          and(
            eq(sourceItems.id, input.sourceItemId),
            eq(spaces.ownerUserId, input.userId),
            isNull(sourceItems.deletedAt),
            isNull(spaces.deletedAt),
            isNull(spaces.archivedAt),
          ),
        )
        .limit(1);

      if (!row) {
        return null;
      }

      const [blobRow] = await db
        .select({
          byteSize: sourceBlobs.byteSize,
          contentType: sourceBlobs.contentType,
          objectKey: sourceBlobs.objectKey,
          sourceBlobId: sourceBlobs.id,
          uploadedAt: sourceBlobs.uploadedAt,
        })
        .from(sourceBlobs)
        .where(
          and(
            eq(sourceBlobs.sourceItemId, row.sourceItemId),
            isNull(sourceBlobs.deletedAt),
          ),
        )
        .orderBy(desc(sourceBlobs.uploadedAt), desc(sourceBlobs.createdAt))
        .limit(1);

      const segmentRows = await db
        .select({
          charEnd: segments.charEnd,
          charStart: segments.charStart,
          content: segments.content,
          id: segments.id,
          kind: segments.kind,
          ordinal: segments.ordinal,
          tokenCount: segments.tokenCount,
        })
        .from(segments)
        .where(
          and(
            eq(segments.sourceItemId, row.sourceItemId),
            isNull(segments.deletedAt),
          ),
        )
        .orderBy(asc(segments.ordinal))
        .limit(MAX_DETAIL_SEGMENTS);

      const [{ totalSegments }] = await db
        .select({
          totalSegments: sql<number>`count(*)::int`,
        })
        .from(segments)
        .where(
          and(
            eq(segments.sourceItemId, row.sourceItemId),
            isNull(segments.deletedAt),
          ),
        );

      const memoryRows = await db
        .select({
          content: memories.content,
          createdAt: memories.createdAt,
          id: memories.id,
          kind: memories.kind,
          state: memories.state,
          summary: memories.summary,
          title: memories.title,
          updatedAt: memories.updatedAt,
        })
        .from(memories)
        .innerJoin(memoryCitations, eq(memoryCitations.memoryId, memories.id))
        .where(
          and(
            eq(memories.spaceId, row.spaceId),
            eq(memoryCitations.sourceItemId, row.sourceItemId),
            isNull(memories.deletedAt),
          ),
        )
        .groupBy(
          memories.id,
          memories.content,
          memories.createdAt,
          memories.kind,
          memories.state,
          memories.summary,
          memories.title,
          memories.updatedAt,
        )
        .orderBy(desc(memories.updatedAt), desc(memories.id))
        .limit(MAX_DETAIL_MEMORIES);

      const [{ totalMemories }] = await db
        .select({
          totalMemories: sql<number>`count(distinct ${memories.id})::int`,
        })
        .from(memories)
        .innerJoin(memoryCitations, eq(memoryCitations.memoryId, memories.id))
        .where(
          and(
            eq(memories.spaceId, row.spaceId),
            eq(memoryCitations.sourceItemId, row.sourceItemId),
            isNull(memories.deletedAt),
          ),
        );

      return {
        blob: blobRow
          ? {
              byteSize: blobRow.byteSize,
              contentType: blobRow.contentType,
              objectKey: blobRow.objectKey,
              sourceBlobId: blobRow.sourceBlobId,
              uploadedAt: blobRow.uploadedAt?.toISOString() ?? null,
            }
          : null,
        canonicalUri: row.canonicalUri,
        capturedAt: row.capturedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        kind: normalizeKind(row.kind),
        memories: memoryRows.map((memory) => ({
          content: memory.content,
          createdAt: memory.createdAt.toISOString(),
          id: memory.id,
          kind: memory.kind,
          state: normalizeMemoryState(memory.state),
          summary: memory.summary,
          title: memory.title,
        })),
        memoryCount: Number(totalMemories ?? 0),
        metadata: row.metadata ?? {},
        mimeType: row.mimeType,
        segmentCount: Number(totalSegments ?? 0),
        segments: segmentRows.map((segment) => ({
          charEnd: segment.charEnd,
          charStart: segment.charStart,
          content: segment.content,
          id: segment.id,
          kind: normalizeSegmentKind(segment.kind),
          ordinal: segment.ordinal,
          tokenCount: segment.tokenCount,
        })),
        sourceItemId: row.sourceItemId,
        spaceId: row.spaceId,
        spaceName: row.spaceName,
        status: normalizeStatus(row.status),
        title: row.title,
        updatedAt: row.updatedAt.toISOString(),
      };
    },
  };
}
