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

export type RetrievalPrimitive =
  | 'segment_text'
  | 'segment_vector'
  | 'memory_text'
  | 'memory_vector';

export type RetrievalEvidenceKind = 'memory' | 'segment';

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

export type MemoryRetrievalCandidate = {
  canonicalUri: string | null;
  confidence: number | null;
  content: string;
  createdAt: Date;
  memoryId: string;
  score: number;
  summary: string | null;
  title: string | null;
  updatedAt: Date;
};

export type GroundingCitation = {
  canonicalUri: string | null;
  locator: Record<string, unknown>;
  memoryCitationOrdinal: number;
  memoryId: string;
  quoteText: string;
  segmentContent: string;
  segmentId: string;
  segmentMetadata: Record<string, unknown>;
  segmentOrdinal: number;
  sourceItemId: string;
  sourceKind: RetrievalSourceKind;
  sourceTitle: string | null;
};

export type FusedRetrievalCandidate = {
  bundleKey: string;
  candidateKey: string;
  canonicalUri: string | null;
  exactQuotes: string[];
  evidenceKind: RetrievalEvidenceKind;
  fusionScore: number;
  locators: Array<Record<string, unknown>>;
  memoryId?: string;
  memorySummary: string | null;
  primitiveSources: RetrievalPrimitive[];
  rerankRationale?: string | null;
  rerankScore: number;
  segmentIds: string[];
  sourceItemId: string;
  sourceKind: RetrievalSourceKind;
  sourceTitle: string | null;
};

export type RetrieveGroundedEvidenceInput = {
  capturedAfter?: Date;
  capturedBefore?: Date;
  sourceKinds?: RetrievalSourceKind[];
  spaceId?: string;
  question: string;
  userId: string;
};

export type RetrieveGroundedEvidenceResult = {
  bundles: FusedRetrievalCandidate[];
  retrievalMeta: {
    fusedCandidateCount: number;
    memoryHitsUsed: boolean;
    normalizationDegraded: boolean;
    primitiveCounts: Record<RetrievalPrimitive, number>;
    rerankDegraded: boolean;
    retrievalQuery: string;
    usedNormalizedQuery: boolean;
  };
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
