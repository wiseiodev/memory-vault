import { describe, expect, it, vi } from 'vitest';
import {
  type ExtractSourceDocumentInput,
  extractSourceDocument,
} from './extraction';

function createJob(
  overrides: Partial<ExtractSourceDocumentInput> = {},
): ExtractSourceDocumentInput {
  return {
    canonicalUri: null,
    mimeType: null,
    sourceBlobContentType: null,
    sourceBlobId: null,
    sourceBlobObjectKey: null,
    sourceKind: 'note',
    sourceMetadata: {},
    sourceTitle: null,
    ...overrides,
  };
}

function createDeps() {
  return {
    extractHardWebPageWithAi: vi.fn(),
    extractImageWithAi: vi.fn(),
    extractPdfPages: vi.fn(),
    extractScannedPdfWithAi: vi.fn(),
    fetch: vi.fn(),
    readObjectBytes: vi.fn(),
  };
}

describe('extractSourceDocument', () => {
  it('extracts readable web pages deterministically', async () => {
    const deps = createDeps();
    deps.fetch.mockResolvedValue(
      new Response(
        `
          <html>
            <head><title>Trip report</title></head>
            <body>
              <article>
                <h1>Trip report</h1>
                <p>We landed safely in Tokyo.</p>
                <p>Then we checked into the hotel.</p>
                <p>
                  After dropping our bags, we walked through the neighborhood,
                  found dinner, and wrote down the train route for the next
                  morning so the rest of the trip would start smoothly.
                </p>
              </article>
            </body>
          </html>
        `,
        {
          headers: {
            'content-type': 'text/html; charset=utf-8',
          },
          status: 200,
        },
      ),
    );

    const document = await extractSourceDocument(
      createJob({
        canonicalUri: 'https://example.com/trip',
        sourceKind: 'web_page',
      }),
      deps,
    );

    expect(document.title).toBe('Trip report');
    expect(document.mimeType).toBe('text/html');
    expect(document.metadata).toMatchObject({
      extractionStrategy: 'deterministic',
      extractor: 'readability',
    });
    expect(document.content).toContain('We landed safely in Tokyo.');
    expect(deps.extractHardWebPageWithAi).not.toHaveBeenCalled();
  });

  it('treats XHTML responses as web pages', async () => {
    const deps = createDeps();
    deps.fetch.mockResolvedValue(
      new Response(
        `
          <html xmlns="http://www.w3.org/1999/xhtml">
            <head><title>Trip report</title></head>
            <body>
              <article>
                <p>
                  This XHTML travel log contains enough content to stay on the
                  deterministic readability path without being misclassified as
                  an unsupported file type during ingestion.
                </p>
                <p>
                  We walked from the station to the hotel, checked in, dropped
                  our bags, found a late dinner, and wrote down the exact train
                  transfer sequence for the next morning so we would not lose
                  time navigating across the city during the first full day of
                  the trip.
                </p>
              </article>
            </body>
          </html>
        `,
        {
          headers: {
            'content-type': 'application/xhtml+xml; charset=utf-8',
          },
          status: 200,
        },
      ),
    );

    const document = await extractSourceDocument(
      createJob({
        canonicalUri: 'https://example.com/xhtml-trip',
        sourceKind: 'web_page',
      }),
      deps,
    );

    expect(document.mimeType).toBe('application/xhtml+xml');
    expect(document.metadata).toMatchObject({
      extractionStrategy: 'deterministic',
      extractor: 'readability',
    });
    expect(deps.extractHardWebPageWithAi).not.toHaveBeenCalled();
  });

  it('falls back to AI for low-yield web pages', async () => {
    const deps = createDeps();
    deps.fetch.mockResolvedValue(
      new Response('<html><body><div>Hi</div></body></html>', {
        headers: {
          'content-type': 'text/html; charset=utf-8',
        },
        status: 200,
      }),
    );
    deps.extractHardWebPageWithAi.mockResolvedValue({
      model: 'google/gemini-3.1-pro-preview',
      output: {
        confidence: 0.86,
        languageCode: 'en',
        pages: [
          {
            content: 'Recovered article body from the fallback extractor.',
            pageNumber: null,
          },
        ],
        reason: 'HTML was too sparse for Readability.',
        title: 'Fallback article',
      },
      providerMetadata: {},
      providerRoute: [
        'google/gemini-3.1-pro-preview',
        'openai/gpt-5',
        'anthropic/claude-sonnet-4.6',
      ],
    });

    const document = await extractSourceDocument(
      createJob({
        canonicalUri: 'https://example.com/sparse',
        sourceKind: 'web_page',
      }),
      deps,
    );

    expect(document.title).toBe('Fallback article');
    expect(document.metadata).toMatchObject({
      extractionStrategy: 'gateway_fallback',
      fallbackReason: 'low_text_yield',
    });
    expect(document.blocks[0]).toMatchObject({
      content: 'Recovered article body from the fallback extractor.',
      kind: 'plain_text',
    });
  });

  it('falls back to AI when the web fetch response is not ok', async () => {
    const deps = createDeps();
    deps.fetch.mockResolvedValue(
      new Response('Unavailable right now', {
        status: 503,
      }),
    );
    deps.extractHardWebPageWithAi.mockResolvedValue({
      model: 'google/gemini-3.1-pro-preview',
      output: {
        confidence: 0.63,
        languageCode: 'en',
        pages: [
          {
            content: 'Recovered content after deterministic fetch failed.',
            pageNumber: null,
          },
        ],
        reason: 'Origin fetch failed, URL fallback used instead.',
        title: 'Recovered page',
      },
      providerMetadata: {},
      providerRoute: [
        'google/gemini-3.1-pro-preview',
        'openai/gpt-5',
        'anthropic/claude-sonnet-4.6',
      ],
    });

    const document = await extractSourceDocument(
      createJob({
        canonicalUri: 'https://example.com/fetch-failed',
        sourceKind: 'web_page',
      }),
      deps,
    );

    expect(document.metadata).toMatchObject({
      extractionStrategy: 'gateway_fallback',
      fallbackReason: 'fetch_failed',
    });
    expect(deps.extractHardWebPageWithAi).toHaveBeenCalledWith({
      html: null,
      title: null,
      url: 'https://example.com/fetch-failed',
    });
  });

  it('falls back to AI when the web fetch throws', async () => {
    const deps = createDeps();
    deps.fetch.mockRejectedValue(new Error('socket hang up'));
    deps.extractHardWebPageWithAi.mockResolvedValue({
      model: 'google/gemini-3.1-pro-preview',
      output: {
        confidence: 0.51,
        languageCode: 'en',
        pages: [
          {
            content: 'Recovered content after the fetch threw.',
            pageNumber: null,
          },
        ],
        reason: 'URL fallback used after network failure.',
        title: 'Recovered after throw',
      },
      providerMetadata: {},
      providerRoute: [
        'google/gemini-3.1-pro-preview',
        'openai/gpt-5',
        'anthropic/claude-sonnet-4.6',
      ],
    });

    const document = await extractSourceDocument(
      createJob({
        canonicalUri: 'https://example.com/fetch-threw',
        sourceKind: 'web_page',
      }),
      deps,
    );

    expect(document.metadata).toMatchObject({
      extractionStrategy: 'gateway_fallback',
      fallbackReason: 'fetch_failed',
    });
    expect(deps.extractHardWebPageWithAi).toHaveBeenCalledWith({
      html: null,
      title: null,
      url: 'https://example.com/fetch-threw',
    });
  });

  it('extracts text files directly from blob bytes', async () => {
    const deps = createDeps();
    deps.readObjectBytes.mockResolvedValue(
      new TextEncoder().encode('Pack charger.\n\nBook dog sitter.'),
    );

    const document = await extractSourceDocument(
      createJob({
        mimeType: 'text/plain',
        sourceBlobId: 'blob_123',
        sourceBlobObjectKey: 'spaces/spc_123/notes.txt',
        sourceKind: 'file',
        sourceTitle: 'notes.txt',
      }),
      deps,
    );

    expect(document.blocks).toHaveLength(2);
    expect(document.blocks[0]).toMatchObject({
      content: 'Pack charger.',
      kind: 'plain_text',
    });
    expect(document.blocks[1]).toMatchObject({
      content: 'Book dog sitter.',
      kind: 'plain_text',
    });
  });

  it('extracts text PDFs deterministically when page text exists', async () => {
    const deps = createDeps();
    deps.readObjectBytes.mockResolvedValue(new Uint8Array([1, 2, 3]));
    deps.extractPdfPages.mockResolvedValue({
      pages: [
        {
          content: 'Page one paragraph.',
          pageNumber: 1,
        },
        {
          content: 'Page two paragraph.',
          pageNumber: 2,
        },
      ],
      totalPages: 2,
    });

    const document = await extractSourceDocument(
      createJob({
        mimeType: 'application/pdf',
        sourceBlobId: 'blob_123',
        sourceBlobObjectKey: 'spaces/spc_123/report.pdf',
        sourceKind: 'file',
        sourceTitle: 'report.pdf',
      }),
      deps,
    );

    expect(document.metadata).toMatchObject({
      extractionStrategy: 'deterministic',
      extractor: 'pdfjs',
    });
    expect(document.blocks[0]?.metadata).toMatchObject({
      pageNumber: 1,
    });
    expect(deps.extractScannedPdfWithAi).not.toHaveBeenCalled();
  });

  it('falls back to AI OCR for scanned PDFs', async () => {
    const deps = createDeps();
    deps.readObjectBytes.mockResolvedValue(new Uint8Array([1, 2, 3]));
    deps.extractPdfPages.mockResolvedValue({
      pages: [],
      totalPages: 1,
    });
    deps.extractScannedPdfWithAi.mockResolvedValue({
      model: 'google/gemini-3-flash',
      output: {
        confidence: 0.72,
        languageCode: 'en',
        pages: [
          {
            content: 'OCR page one text.',
            pageNumber: 1,
          },
        ],
        reason: 'No embedded PDF text was available.',
        title: 'Scanned note',
      },
      providerMetadata: {},
      providerRoute: [
        'google/gemini-3-flash',
        'openai/gpt-5-mini',
        'anthropic/claude-sonnet-4.6',
      ],
    });

    const document = await extractSourceDocument(
      createJob({
        mimeType: 'application/pdf',
        sourceBlobId: 'blob_123',
        sourceBlobObjectKey: 'spaces/spc_123/scanned.pdf',
        sourceKind: 'file',
        sourceTitle: 'scanned.pdf',
      }),
      deps,
    );

    expect(document.metadata).toMatchObject({
      extractionStrategy: 'gateway_fallback',
      fallbackReason: 'scanned_pdf',
    });
    expect(document.blocks[0]).toMatchObject({
      kind: 'ocr',
    });
  });

  it('falls back to AI OCR when a PDF has scanned pages mixed with text pages', async () => {
    const deps = createDeps();
    deps.readObjectBytes.mockResolvedValue(new Uint8Array([1, 2, 3]));
    deps.extractPdfPages.mockResolvedValue({
      pages: [
        {
          content: 'Embedded text from page one.',
          pageNumber: 1,
        },
      ],
      totalPages: 2,
    });
    deps.extractScannedPdfWithAi.mockResolvedValue({
      model: 'google/gemini-3-flash',
      output: {
        confidence: 0.81,
        languageCode: 'en',
        pages: [
          {
            content: 'Embedded text from page one.',
            pageNumber: 1,
          },
          {
            content: 'OCR text from scanned page two.',
            pageNumber: 2,
          },
        ],
        reason: 'Mixed PDF required OCR to preserve all pages.',
        title: 'Hybrid report',
      },
      providerMetadata: {},
      providerRoute: [
        'google/gemini-3-flash',
        'openai/gpt-5-mini',
        'anthropic/claude-sonnet-4.6',
      ],
    });

    const document = await extractSourceDocument(
      createJob({
        mimeType: 'application/pdf',
        sourceBlobId: 'blob_123',
        sourceBlobObjectKey: 'spaces/spc_123/hybrid.pdf',
        sourceKind: 'file',
        sourceTitle: 'hybrid.pdf',
      }),
      deps,
    );

    expect(document.metadata).toMatchObject({
      extractionStrategy: 'gateway_fallback',
      fallbackReason: 'scanned_pdf',
    });
    expect(document.blocks).toHaveLength(2);
    expect(deps.extractScannedPdfWithAi).toHaveBeenCalledOnce();
  });

  it('uses AI OCR for images', async () => {
    const deps = createDeps();
    deps.readObjectBytes.mockResolvedValue(new Uint8Array([1, 2, 3]));
    deps.extractImageWithAi.mockResolvedValue({
      model: 'google/gemini-3-flash',
      output: {
        confidence: 0.91,
        languageCode: 'en',
        pages: [
          {
            content: 'Remember passport renewal.',
            pageNumber: null,
          },
        ],
        reason: 'OCR extraction path.',
        title: 'Sticky note',
      },
      providerMetadata: {},
      providerRoute: [
        'google/gemini-3-flash',
        'openai/gpt-5-mini',
        'anthropic/claude-sonnet-4.6',
      ],
    });

    const document = await extractSourceDocument(
      createJob({
        mimeType: 'image/png',
        sourceBlobId: 'blob_123',
        sourceBlobObjectKey: 'spaces/spc_123/note.png',
        sourceKind: 'file',
        sourceTitle: 'note.png',
      }),
      deps,
    );

    expect(document.blocks[0]).toMatchObject({
      content: 'Remember passport renewal.',
      kind: 'ocr',
    });
  });

  it('rejects unsupported file types explicitly', async () => {
    const deps = createDeps();
    deps.readObjectBytes.mockResolvedValue(new Uint8Array([1, 2, 3]));

    await expect(
      extractSourceDocument(
        createJob({
          mimeType: 'application/zip',
          sourceBlobId: 'blob_123',
          sourceBlobObjectKey: 'spaces/spc_123/archive.zip',
          sourceKind: 'file',
          sourceTitle: 'archive.zip',
        }),
        deps,
      ),
    ).rejects.toMatchObject({
      code: 'UNSUPPORTED_FILE_TYPE',
    });
  });

  it('fails when extracted content is empty after normalization', async () => {
    const deps = createDeps();
    deps.readObjectBytes.mockResolvedValue(new TextEncoder().encode(' \n\n '));

    await expect(
      extractSourceDocument(
        createJob({
          mimeType: 'text/plain',
          sourceBlobId: 'blob_123',
          sourceBlobObjectKey: 'spaces/spc_123/empty.txt',
          sourceKind: 'file',
          sourceTitle: 'empty.txt',
        }),
        deps,
      ),
    ).rejects.toMatchObject({
      code: 'EMPTY_EXTRACTED_CONTENT',
    });
  });
});
