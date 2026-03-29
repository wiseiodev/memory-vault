export type ExtractedSegmentKind = 'ocr' | 'plain_text';

export type ExtractedBlockDraft = {
  content: string;
  kind: ExtractedSegmentKind;
  metadata: Record<string, unknown>;
};

export type ExtractedBlock = ExtractedBlockDraft & {
  charEnd: number;
  charStart: number;
};

export type ExtractedDocument = {
  blocks: ExtractedBlock[];
  canonicalUri: string | null;
  content: string;
  languageCode: string | null;
  metadata: Record<string, unknown>;
  mimeType: string | null;
  sourceBlobId: string | null;
  title: string | null;
};

export type PersistedSegment = {
  charEnd: number;
  charStart: number;
  content: string;
  contentHash: string;
  id: string;
  kind: ExtractedSegmentKind;
  metadata: Record<string, unknown>;
  ordinal: number;
  sourceBlobId: string | null;
  tokenCount: number;
};
