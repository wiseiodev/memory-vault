import { createHash } from 'node:crypto';

import { generateId } from '@/db/columns/id';
import type {
  ExtractedBlock,
  PersistedSegment,
} from '@/features/ingestion/types';
import type { ExtractedDocument } from './types';

const TARGET_CHUNK_LENGTH = 900;
const MIN_CHUNK_LENGTH = 300;
const HARD_MAX_CHUNK_LENGTH = 1400;

type ChunkPiece = Pick<
  ExtractedBlock,
  'charEnd' | 'charStart' | 'content' | 'kind' | 'metadata'
> & {
  sourceBlobId: string | null;
};

function countApproximateTokens(content: string) {
  return content.split(/\s+/).filter(Boolean).length;
}

function uniqueNumberValues(values: number[]) {
  return [...new Set(values)].sort((left, right) => left - right);
}

function sentenceRanges(content: string) {
  const matches = [...content.matchAll(/[^.!?]+[.!?]+|[^.!?]+$/g)];

  if (matches.length === 0) {
    return [{ end: content.length, start: 0 }];
  }

  return matches.map((match) => ({
    end: (match.index ?? 0) + match[0].length,
    start: match.index ?? 0,
  }));
}

function splitTextAtWhitespace(content: string, maxLength: number) {
  const pieces: Array<{
    content: string;
    end: number;
    start: number;
  }> = [];
  let cursor = 0;

  while (cursor < content.length) {
    while (cursor < content.length && /\s/.test(content[cursor] ?? '')) {
      cursor += 1;
    }

    if (cursor >= content.length) {
      break;
    }

    let splitIndex = Math.min(cursor + maxLength, content.length);

    if (splitIndex < content.length) {
      const breakpoint = content.lastIndexOf(' ', splitIndex);
      if (breakpoint > cursor) {
        splitIndex = breakpoint;
      }
    }

    let chunkStart = cursor;
    let chunkEnd = splitIndex;

    while (chunkStart < chunkEnd && /\s/.test(content[chunkStart] ?? '')) {
      chunkStart += 1;
    }

    while (chunkEnd > chunkStart && /\s/.test(content[chunkEnd - 1] ?? '')) {
      chunkEnd -= 1;
    }

    if (chunkEnd > chunkStart) {
      pieces.push({
        content: content.slice(chunkStart, chunkEnd),
        end: chunkEnd,
        start: chunkStart,
      });
    }

    cursor = splitIndex;
  }

  return pieces;
}

function splitOversizedPiece(piece: ChunkPiece): ChunkPiece[] {
  if (piece.content.length <= HARD_MAX_CHUNK_LENGTH) {
    return [piece];
  }

  const text = piece.content;
  const pieces: ChunkPiece[] = [];
  let current = '';
  let currentStart = 0;

  for (const range of sentenceRanges(text)) {
    const sentence = text.slice(range.start, range.end).trim();

    if (!sentence) {
      continue;
    }

    const nextContent = current ? `${current} ${sentence}` : sentence;

    if (nextContent.length <= HARD_MAX_CHUNK_LENGTH) {
      if (!current) {
        currentStart = range.start;
      }
      current = nextContent;
      continue;
    }

    if (current) {
      pieces.push({
        ...piece,
        charEnd: piece.charStart + currentStart + current.length,
        charStart: piece.charStart + currentStart,
        content: current,
      });
      current = '';
    }

    for (const textChunk of splitTextAtWhitespace(
      sentence,
      HARD_MAX_CHUNK_LENGTH,
    )) {
      pieces.push({
        ...piece,
        charEnd: piece.charStart + range.start + textChunk.end,
        charStart: piece.charStart + range.start + textChunk.start,
        content: textChunk.content,
      });
    }
  }

  if (current) {
    pieces.push({
      ...piece,
      charEnd: piece.charStart + currentStart + current.length,
      charStart: piece.charStart + currentStart,
      content: current,
    });
  }

  return pieces;
}

function aggregateChunkMetadata(pieces: ChunkPiece[]) {
  const firstPiece = pieces[0];
  const pageNumbers = uniqueNumberValues(
    pieces
      .map((piece) => {
        const pageNumber = piece.metadata.pageNumber;
        return typeof pageNumber === 'number' ? pageNumber : null;
      })
      .filter((value): value is number => value !== null),
  );

  const metadata: Record<string, unknown> = {
    ...firstPiece?.metadata,
  };

  if (pageNumbers.length === 1) {
    metadata.pageNumber = pageNumbers[0];
  } else if (pageNumbers.length > 1) {
    metadata.pageNumbers = pageNumbers;
    delete metadata.pageNumber;
  }

  delete metadata.sourceBlobId;

  return metadata;
}

function piecesToSegment(
  pieces: ChunkPiece[],
  ordinal: number,
): PersistedSegment | null {
  if (pieces.length === 0) {
    return null;
  }

  const content = pieces
    .map((piece) => piece.content)
    .join('\n\n')
    .trim();

  if (!content) {
    return null;
  }

  const firstPiece = pieces[0];
  const lastPiece = pieces.at(-1);

  if (!firstPiece || !lastPiece) {
    return null;
  }

  return {
    charEnd: lastPiece.charEnd,
    charStart: firstPiece.charStart,
    content,
    contentHash: createHash('sha256').update(content).digest('hex'),
    id: generateId('seg'),
    kind: firstPiece.kind,
    metadata: aggregateChunkMetadata(pieces),
    ordinal,
    sourceBlobId: firstPiece.sourceBlobId,
    tokenCount: countApproximateTokens(content),
  };
}

export function buildSegmentsFromExtractedDocument(
  document: ExtractedDocument,
): PersistedSegment[] {
  const splitPieces = document.blocks.flatMap((block) =>
    splitOversizedPiece({
      ...block,
      sourceBlobId: document.sourceBlobId,
    }),
  );

  const segments: PersistedSegment[] = [];
  let currentPieces: ChunkPiece[] = [];

  const flushCurrentPieces = () => {
    const segment = piecesToSegment(currentPieces, segments.length + 1);

    if (segment) {
      segments.push(segment);
    }

    currentPieces = [];
  };

  for (const piece of splitPieces) {
    if (currentPieces.length === 0) {
      currentPieces = [piece];
      continue;
    }

    const currentExtractor = currentPieces[0]?.metadata.extractor;
    const nextExtractor = piece.metadata.extractor;

    if (currentExtractor === 'note-body' && nextExtractor === 'note-body') {
      flushCurrentPieces();
      currentPieces = [piece];
      continue;
    }

    const currentLength = currentPieces.reduce(
      (total, currentPiece) => total + currentPiece.content.length,
      0,
    );
    const nextLength =
      currentLength + piece.content.length + currentPieces.length * 2;

    if (nextLength <= TARGET_CHUNK_LENGTH || currentLength < MIN_CHUNK_LENGTH) {
      currentPieces.push(piece);
      continue;
    }

    flushCurrentPieces();
    currentPieces = [piece];
  }

  flushCurrentPieces();

  return segments;
}
