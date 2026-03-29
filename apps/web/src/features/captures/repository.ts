import 'server-only';

import { getDb } from '@/db';
import { sourceItems } from '@/db/schema';

type Db = ReturnType<typeof getDb>;

export type CaptureRepository = {
  createCapture(input: {
    canonicalUri: string | null;
    capturedAt: Date;
    kind: 'note' | 'web_page';
    metadata: Record<string, unknown>;
    sourceItemId: string;
    spaceId: string;
    title: string | null;
    userId: string;
  }): Promise<{
    capturedAt: string;
    kind: 'note' | 'web_page';
    sourceItemId: string;
    spaceId: string;
    status: 'pending';
  }>;
};

export function createCaptureRepository(db: Db = getDb()): CaptureRepository {
  return {
    async createCapture(input) {
      const [createdSourceItem] = await db
        .insert(sourceItems)
        .values({
          id: input.sourceItemId,
          canonicalUri: input.canonicalUri,
          capturedAt: input.capturedAt,
          createdByUserId: input.userId,
          kind: input.kind,
          metadata: input.metadata,
          spaceId: input.spaceId,
          status: 'pending',
          title: input.title,
          updatedAt: input.capturedAt,
        })
        .returning({
          capturedAt: sourceItems.capturedAt,
          kind: sourceItems.kind,
          sourceItemId: sourceItems.id,
          spaceId: sourceItems.spaceId,
          status: sourceItems.status,
        });

      return {
        capturedAt:
          createdSourceItem.capturedAt?.toISOString() ??
          input.capturedAt.toISOString(),
        kind: createdSourceItem.kind as 'note' | 'web_page',
        sourceItemId: createdSourceItem.sourceItemId,
        spaceId: createdSourceItem.spaceId,
        status: 'pending',
      };
    },
  };
}
