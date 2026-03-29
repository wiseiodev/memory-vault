export const retrievalSourceKinds = [
  'api',
  'bookmark',
  'chat',
  'email',
  'file',
  'note',
  'web_page',
] as const;

export type RetrievalSourceKind = (typeof retrievalSourceKinds)[number];

export type RetrievalMode = 'text' | 'vector';

export type RetrievalCandidate = {
  canonicalUri: string | null;
  content: string;
  effectiveSourceAt: Date;
  metadata: Record<string, unknown>;
  ordinal: number;
  retrievalMode: RetrievalMode;
  score: number;
  segmentId: string;
  segmentKind: 'ocr' | 'plain_text' | 'quote' | 'title' | 'transcript';
  sourceBlobId: string | null;
  sourceItemId: string;
  sourceKind: RetrievalSourceKind;
  sourceTitle: string | null;
};

export type SearchSegmentsInput = {
  capturedAfter?: Date;
  capturedBefore?: Date;
  limit: number;
  query: string;
  sourceKinds?: RetrievalSourceKind[];
  spaceId?: string;
  userId: string;
};
