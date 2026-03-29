import { describe, expect, it } from 'vitest';

import { buildSegmentsFromExtractedDocument } from './chunking';

describe('buildSegmentsFromExtractedDocument', () => {
  it('preserves provenance-rich metadata on persisted segments', () => {
    const result = buildSegmentsFromExtractedDocument({
      blocks: [
        {
          charEnd: 12,
          charStart: 0,
          content: 'Page one text',
          kind: 'ocr',
          metadata: {
            extractionStrategy: 'gateway_fallback',
            extractor: 'vercel-ai-gateway',
            fallbackReason: 'image_ocr',
            fallbackUsed: true,
            mimeType: 'image/png',
            model: 'google/gemini-3-flash',
            pageNumber: 1,
            providerRoute: [
              'google/gemini-3-flash',
              'openai/gpt-5-mini',
              'anthropic/claude-sonnet-4.6',
            ],
            sourceUri: 'memory://capture/image',
          },
        },
      ],
      canonicalUri: 'memory://capture/image',
      content: 'Page one text',
      languageCode: 'en',
      metadata: {
        extractionStrategy: 'gateway_fallback',
      },
      mimeType: 'image/png',
      sourceBlobId: 'blob_123',
      title: 'Boarding pass',
    });

    expect(result).toEqual([
      expect.objectContaining({
        charEnd: 12,
        charStart: 0,
        kind: 'ocr',
        metadata: expect.objectContaining({
          extractionStrategy: 'gateway_fallback',
          extractor: 'vercel-ai-gateway',
          fallbackReason: 'image_ocr',
          fallbackUsed: true,
          mimeType: 'image/png',
          model: 'google/gemini-3-flash',
          pageNumber: 1,
          sourceUri: 'memory://capture/image',
        }),
        ordinal: 1,
        sourceBlobId: 'blob_123',
      }),
    ]);
  });

  it('keeps character offsets monotonic for repeated oversized content', () => {
    const repeatedSentence = 'Repeat this sentence exactly. ';
    const oversizedBlock = repeatedSentence.repeat(80).trim();

    const result = buildSegmentsFromExtractedDocument({
      blocks: [
        {
          charEnd: oversizedBlock.length,
          charStart: 0,
          content: oversizedBlock,
          kind: 'plain_text',
          metadata: {
            extractionStrategy: 'deterministic',
            extractor: 'pdfjs',
            fallbackUsed: false,
            pageNumber: 1,
            sourceUri: 'memory://capture/repeated',
          },
        },
      ],
      canonicalUri: 'memory://capture/repeated',
      content: oversizedBlock,
      languageCode: 'en',
      metadata: {
        extractionStrategy: 'deterministic',
      },
      mimeType: 'text/plain',
      sourceBlobId: 'blob_123',
      title: 'Repeated text',
    });

    expect(result.length).toBeGreaterThan(1);

    for (let index = 1; index < result.length; index += 1) {
      expect(result[index]?.charStart).toBeGreaterThanOrEqual(
        result[index - 1]?.charEnd ?? 0,
      );
    }
  });
});
