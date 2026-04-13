import 'server-only';

import { ORPCError } from '@orpc/server';

import { deleteObject } from '@/features/uploads/storage';
import { getRequestLogger } from '@/lib/evlog';

import { createItemRepository, type ItemRepository } from './repository';
import type { ItemDetail, ItemListItem } from './schemas';

const DEFAULT_LIST_LIMIT = 50;
const PREVIEW_TEXT_MAX_CHARS = 240;

type ListItemsInput = {
  limit?: number;
  spaceId?: string;
  userId: string;
};

type GetItemInput = {
  sourceItemId: string;
  userId: string;
};

type DeleteItemInput = {
  sourceItemId: string;
  userId: string;
};

type Deps = {
  repository: ItemRepository;
};

type DeleteItemDeps = Deps & {
  deleteObject: typeof deleteObject;
  now: () => Date;
};

function truncatePreview(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.replaceAll(/\s+/g, ' ').trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.length <= PREVIEW_TEXT_MAX_CHARS) {
    return trimmed;
  }

  return `${trimmed.slice(0, PREVIEW_TEXT_MAX_CHARS - 1).trimEnd()}…`;
}

function derivePreview(metadata: Record<string, unknown>) {
  const noteBody = metadata.noteBody;
  if (typeof noteBody === 'string' && noteBody.trim().length > 0) {
    return truncatePreview(noteBody);
  }

  const selectedText = metadata.selectedText;
  if (typeof selectedText === 'string' && selectedText.trim().length > 0) {
    return truncatePreview(selectedText);
  }

  return null;
}

export async function listItems(
  input: ListItemsInput,
  deps: Deps = { repository: createItemRepository() },
): Promise<ItemListItem[]> {
  const rows = await deps.repository.listOwnedItems({
    limit: input.limit ?? DEFAULT_LIST_LIMIT,
    spaceId: input.spaceId,
    userId: input.userId,
  });

  return rows.map((row) => ({
    canonicalUri: row.canonicalUri,
    capturedAt: row.capturedAt,
    createdAt: row.createdAt,
    kind: row.kind,
    memoryCount: row.memoryCount,
    previewText: derivePreview(row.metadata),
    segmentCount: row.segmentCount,
    sourceItemId: row.sourceItemId,
    spaceId: row.spaceId,
    spaceName: row.spaceName,
    status: row.status,
    title: row.title,
  }));
}

export async function getItem(
  input: GetItemInput,
  deps: Deps = { repository: createItemRepository() },
): Promise<ItemDetail> {
  const row = await deps.repository.getOwnedItem(input);

  if (!row) {
    throw new ORPCError('NOT_FOUND', {
      message: 'Source item was not found.',
    });
  }

  return {
    blob: row.blob
      ? {
          byteSize: row.blob.byteSize?.toString() ?? null,
          contentType: row.blob.contentType,
          objectKey: row.blob.objectKey,
          sourceBlobId: row.blob.sourceBlobId,
          uploadedAt: row.blob.uploadedAt,
        }
      : null,
    canonicalUri: row.canonicalUri,
    capturedAt: row.capturedAt,
    createdAt: row.createdAt,
    kind: row.kind,
    memories: row.memories,
    memoryCount: row.memoryCount,
    metadata: row.metadata,
    mimeType: row.mimeType,
    previewText: derivePreview(row.metadata),
    segmentCount: row.segmentCount,
    segments: row.segments,
    sourceItemId: row.sourceItemId,
    spaceId: row.spaceId,
    spaceName: row.spaceName,
    status: row.status,
    title: row.title,
    updatedAt: row.updatedAt,
  };
}

export async function deleteItem(
  input: DeleteItemInput,
  deps: DeleteItemDeps = {
    deleteObject,
    now: () => new Date(),
    repository: createItemRepository(),
  },
): Promise<{ deleted: true; sourceItemId: string }> {
  const result = await deps.repository.deleteOwnedItem({
    deletedAt: deps.now(),
    sourceItemId: input.sourceItemId,
    userId: input.userId,
  });

  if (!result) {
    throw new ORPCError('NOT_FOUND', {
      message: 'Source item was not found.',
    });
  }

  const logger = getRequestLogger();

  for (const objectKey of result.deletedObjectKeys) {
    try {
      await deps.deleteObject({ objectKey });
    } catch (error) {
      logger.error('source_item.delete.blob_cleanup_failed', {
        error: error instanceof Error ? error.message : String(error),
        objectKey,
        sourceItemId: input.sourceItemId,
      });
    }
  }

  return {
    deleted: true as const,
    sourceItemId: input.sourceItemId,
  };
}
