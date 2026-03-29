import 'server-only';

import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { readObjectBytes } from '@/features/uploads/storage';
import {
  extractHardWebPageWithAi,
  extractImageWithAi,
  extractScannedPdfWithAi,
} from '@/lib/ai/extraction';
import { IngestionPipelineError } from './errors';
import type {
  ExtractedBlock,
  ExtractedBlockDraft,
  ExtractedDocument,
} from './types';

type IngestionJobForExtraction = {
  canonicalUri: string | null;
  mimeType: string | null;
  sourceBlobContentType: string | null;
  sourceBlobId: string | null;
  sourceBlobObjectKey: string | null;
  sourceKind: 'file' | 'note' | 'web_page' | null;
  sourceMetadata: Record<string, unknown>;
  sourceTitle: string | null;
};

export type ExtractSourceDocumentInput = IngestionJobForExtraction;

type PdfPage = {
  content: string;
  pageNumber: number;
};

type PdfTextExtraction = {
  pages: PdfPage[];
  totalPages: number;
};

type ExtractSourceDeps = {
  extractHardWebPageWithAi: typeof extractHardWebPageWithAi;
  extractImageWithAi: typeof extractImageWithAi;
  extractPdfPages: (input: { bytes: Uint8Array }) => Promise<PdfTextExtraction>;
  extractScannedPdfWithAi: typeof extractScannedPdfWithAi;
  fetch: typeof fetch;
  readObjectBytes: typeof readObjectBytes;
};

function normalizeText(content: string) {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitParagraphs(content: string) {
  return normalizeText(content)
    .split(/\n{2,}/)
    .map((block) => normalizeText(block))
    .filter(Boolean);
}

function buildExtractedDocument(input: {
  blocks: ExtractedBlockDraft[];
  canonicalUri: string | null;
  languageCode: string | null;
  metadata: Record<string, unknown>;
  mimeType: string | null;
  sourceBlobId: string | null;
  title: string | null;
}): ExtractedDocument {
  const blocks: ExtractedBlock[] = [];
  const parts: string[] = [];
  let cursor = 0;
  const sharedBlockMetadata: Record<string, unknown> = {
    mimeType: input.mimeType,
    sourceUri: input.canonicalUri,
  };

  for (const block of input.blocks) {
    const content = normalizeText(block.content);

    if (!content) {
      continue;
    }

    if (parts.length > 0) {
      parts.push('\n\n');
      cursor += 2;
    }

    const charStart = cursor;
    parts.push(content);
    cursor += content.length;

    blocks.push({
      ...block,
      charEnd: cursor,
      charStart,
      content,
      metadata: {
        ...sharedBlockMetadata,
        ...block.metadata,
      },
    });
  }

  const content = parts.join('');

  if (!content) {
    throw new IngestionPipelineError(
      'EMPTY_EXTRACTED_CONTENT',
      'Extraction produced no searchable content.',
    );
  }

  return {
    blocks,
    canonicalUri: input.canonicalUri,
    content,
    languageCode: input.languageCode,
    metadata: input.metadata,
    mimeType: input.mimeType,
    sourceBlobId: input.sourceBlobId,
    title: input.title,
  };
}

function inferMimeTypeFromName(name: string | null) {
  if (!name) {
    return null;
  }

  const normalizedName = name.toLowerCase();

  if (normalizedName.endsWith('.pdf')) {
    return 'application/pdf';
  }

  if (normalizedName.endsWith('.md') || normalizedName.endsWith('.markdown')) {
    return 'text/markdown';
  }

  if (normalizedName.endsWith('.json')) {
    return 'application/json';
  }

  if (normalizedName.endsWith('.txt')) {
    return 'text/plain';
  }

  if (normalizedName.endsWith('.png')) {
    return 'image/png';
  }

  if (normalizedName.endsWith('.jpg') || normalizedName.endsWith('.jpeg')) {
    return 'image/jpeg';
  }

  if (normalizedName.endsWith('.webp')) {
    return 'image/webp';
  }

  if (normalizedName.endsWith('.gif')) {
    return 'image/gif';
  }

  return null;
}

function isHtmlMimeType(mimeType: string | null) {
  return (
    mimeType === 'application/xhtml+xml' ||
    mimeType?.includes('text/html') === true
  );
}

function isTextMimeType(mimeType: string | null) {
  if (!mimeType) {
    return false;
  }

  return (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/ld+json' ||
    mimeType === 'application/markdown' ||
    mimeType === 'application/xml'
  );
}

function isImageMimeType(mimeType: string | null): mimeType is string {
  return mimeType?.startsWith('image/') ?? false;
}

function pickTitle(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

async function defaultExtractPdfPages(input: {
  bytes: Uint8Array;
}): Promise<PdfTextExtraction> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await pdfjs.getDocument({
    data: input.bytes,
    useWorkerFetch: false,
  }).promise;
  const pages: PdfPage[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const content = normalizeText(
      textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' '),
    );

    if (!content) {
      continue;
    }

    pages.push({
      content,
      pageNumber,
    });
  }

  return {
    pages,
    totalPages: document.numPages,
  };
}

function aiPagesToDocument(input: {
  canonicalUri: string | null;
  fallbackReason: string;
  kind: 'ocr' | 'plain_text';
  model: string;
  mimeType: string | null;
  output: Awaited<ReturnType<typeof extractHardWebPageWithAi>>['output'];
  providerRoute: string[];
  sourceBlobId: string | null;
}) {
  return buildExtractedDocument({
    blocks: input.output.pages.map((page) => ({
      content: page.content,
      kind: input.kind,
      metadata: {
        extractionStrategy: 'gateway_fallback',
        extractor: 'vercel-ai-gateway',
        fallbackReason: input.fallbackReason,
        fallbackUsed: true,
        model: input.model,
        pageNumber: page.pageNumber ?? undefined,
        providerRoute: input.providerRoute,
      },
    })),
    canonicalUri: input.canonicalUri,
    languageCode: input.output.languageCode ?? null,
    metadata: {
      confidence: input.output.confidence ?? null,
      extractionStrategy: 'gateway_fallback',
      fallbackReason: input.fallbackReason,
      fallbackUsed: true,
      model: input.model,
      providerRoute: input.providerRoute,
      reason: input.output.reason ?? null,
    },
    mimeType: input.mimeType,
    sourceBlobId: input.sourceBlobId,
    title: input.output.title ?? null,
  });
}

function textToDocument(input: {
  canonicalUri: string | null;
  content: string;
  extractor: string;
  kind?: 'ocr' | 'plain_text';
  metadata?: Record<string, unknown>;
  mimeType: string | null;
  sourceBlobId: string | null;
  title: string | null;
}) {
  return buildExtractedDocument({
    blocks: splitParagraphs(input.content).map((content) => ({
      content,
      kind: input.kind ?? 'plain_text',
      metadata: {
        extractionStrategy: 'deterministic',
        extractor: input.extractor,
        fallbackUsed: false,
        ...input.metadata,
      },
    })),
    canonicalUri: input.canonicalUri,
    languageCode: null,
    metadata: {
      extractionStrategy: 'deterministic',
      extractor: input.extractor,
      fallbackUsed: false,
    },
    mimeType: input.mimeType,
    sourceBlobId: input.sourceBlobId,
    title: input.title,
  });
}

async function fallbackWebPageToAi(input: {
  canonicalUri: string;
  deps: ExtractSourceDeps;
  fallbackReason: 'fetch_failed' | 'low_text_yield' | 'readability_failed';
  html?: string | null;
  title: string | null;
}) {
  const aiResult = await input.deps.extractHardWebPageWithAi({
    html: input.html ?? null,
    title: input.title,
    url: input.canonicalUri,
  });

  return aiPagesToDocument({
    canonicalUri: input.canonicalUri,
    fallbackReason: input.fallbackReason,
    kind: 'plain_text',
    model: aiResult.model,
    mimeType: 'text/html',
    output: aiResult.output,
    providerRoute: aiResult.providerRoute,
    sourceBlobId: null,
  });
}

async function extractNoteDocument(job: IngestionJobForExtraction) {
  const noteBody = job.sourceMetadata.noteBody;

  if (typeof noteBody !== 'string' || noteBody.trim().length === 0) {
    throw new IngestionPipelineError(
      'NOTE_BODY_MISSING',
      'The captured note is missing noteBody metadata.',
    );
  }

  return textToDocument({
    canonicalUri: job.canonicalUri,
    content: noteBody,
    extractor: 'note-body',
    mimeType: job.mimeType ?? 'text/plain',
    sourceBlobId: null,
    title: job.sourceTitle,
  });
}

async function extractFileBytesDocument(
  input: {
    bytes: Uint8Array;
    canonicalUri: string | null;
    mimeType: string | null;
    sourceBlobId: string | null;
    title: string | null;
  },
  deps: ExtractSourceDeps,
) {
  const inferredMimeType =
    input.mimeType ?? inferMimeTypeFromName(input.title) ?? null;

  if (isTextMimeType(inferredMimeType)) {
    return textToDocument({
      canonicalUri: input.canonicalUri,
      content: new TextDecoder().decode(input.bytes),
      extractor: 'text-file',
      mimeType: inferredMimeType,
      sourceBlobId: input.sourceBlobId,
      title: input.title,
    });
  }

  if (inferredMimeType === 'application/pdf') {
    const extraction = await deps.extractPdfPages({
      bytes: input.bytes,
    });

    if (
      extraction.pages.length > 0 &&
      extraction.pages.length === extraction.totalPages
    ) {
      return buildExtractedDocument({
        blocks: extraction.pages.map((page) => ({
          content: page.content,
          kind: 'plain_text',
          metadata: {
            extractionStrategy: 'deterministic',
            extractor: 'pdfjs',
            fallbackUsed: false,
            pageNumber: page.pageNumber,
          },
        })),
        canonicalUri: input.canonicalUri,
        languageCode: null,
        metadata: {
          extractionStrategy: 'deterministic',
          extractor: 'pdfjs',
          fallbackUsed: false,
        },
        mimeType: inferredMimeType,
        sourceBlobId: input.sourceBlobId,
        title: input.title,
      });
    }

    const aiResult = await deps.extractScannedPdfWithAi({
      bytes: input.bytes,
      title: input.title,
    });

    return aiPagesToDocument({
      canonicalUri: input.canonicalUri,
      fallbackReason: 'scanned_pdf',
      kind: 'ocr',
      model: aiResult.model,
      mimeType: inferredMimeType,
      output: aiResult.output,
      providerRoute: aiResult.providerRoute,
      sourceBlobId: input.sourceBlobId,
    });
  }

  if (isImageMimeType(inferredMimeType)) {
    const aiResult = await deps.extractImageWithAi({
      bytes: input.bytes,
      mediaType: inferredMimeType,
      title: input.title,
    });

    return aiPagesToDocument({
      canonicalUri: input.canonicalUri,
      fallbackReason: 'image_ocr',
      kind: 'ocr',
      model: aiResult.model,
      mimeType: inferredMimeType,
      output: aiResult.output,
      providerRoute: aiResult.providerRoute,
      sourceBlobId: input.sourceBlobId,
    });
  }

  throw new IngestionPipelineError(
    'UNSUPPORTED_FILE_TYPE',
    `Unsupported file type for extraction: ${inferredMimeType ?? 'unknown'}.`,
    {
      mimeType: inferredMimeType,
    },
  );
}

async function extractFileDocument(
  job: IngestionJobForExtraction,
  deps: ExtractSourceDeps,
) {
  if (!job.sourceBlobObjectKey) {
    throw new IngestionPipelineError(
      'SOURCE_BLOB_REQUIRED',
      'File extraction requires a source blob object key.',
    );
  }

  const bytes = await deps.readObjectBytes({
    objectKey: job.sourceBlobObjectKey,
  });

  return extractFileBytesDocument(
    {
      bytes,
      canonicalUri: job.canonicalUri,
      mimeType:
        job.sourceBlobContentType ??
        job.mimeType ??
        inferMimeTypeFromName(job.sourceTitle),
      sourceBlobId: job.sourceBlobId,
      title: job.sourceTitle,
    },
    deps,
  );
}

async function extractWebPageDocument(
  job: IngestionJobForExtraction,
  deps: ExtractSourceDeps,
) {
  const submittedUrl =
    job.canonicalUri ??
    (typeof job.sourceMetadata.submittedUrl === 'string'
      ? job.sourceMetadata.submittedUrl
      : null);

  if (!submittedUrl) {
    throw new IngestionPipelineError(
      'SOURCE_URI_REQUIRED',
      'Web extraction requires a canonical or submitted URL.',
    );
  }

  let response: Response;

  try {
    response = await deps.fetch(submittedUrl, {
      headers: {
        Accept:
          'text/html,application/xhtml+xml,text/plain;q=0.8,application/pdf;q=0.7,*/*;q=0.5',
        'User-Agent':
          'MemoryVaultBot/1.0 (+https://memory-vault.local/extraction)',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return fallbackWebPageToAi({
      canonicalUri: submittedUrl,
      deps,
      fallbackReason: 'fetch_failed',
      title: job.sourceTitle,
    });
  }

  if (!response.ok) {
    return fallbackWebPageToAi({
      canonicalUri: response.url || submittedUrl,
      deps,
      fallbackReason: 'fetch_failed',
      title: job.sourceTitle,
    });
  }

  const finalUrl = response.url || submittedUrl;
  const mimeType =
    response.headers.get('content-type')?.split(';')[0]?.trim() ?? null;
  const bytes = new Uint8Array(await response.arrayBuffer());

  if (!isHtmlMimeType(mimeType)) {
    return extractFileBytesDocument(
      {
        bytes,
        canonicalUri: finalUrl,
        mimeType,
        sourceBlobId: null,
        title: job.sourceTitle,
      },
      deps,
    );
  }

  const html = new TextDecoder().decode(bytes);
  try {
    const dom = new JSDOM(html, {
      url: finalUrl,
    });
    const readability = new Readability(dom.window.document);
    const article = readability.parse();
    const extractedText = normalizeText(article?.textContent ?? '');

    if (extractedText.length >= 200) {
      return textToDocument({
        canonicalUri: finalUrl,
        content: extractedText,
        extractor: 'readability',
        metadata: {
          extractionStrategy: 'deterministic',
          fallbackUsed: false,
        },
        mimeType,
        sourceBlobId: null,
        title: pickTitle(
          article?.title,
          dom.window.document.title,
          job.sourceTitle,
        ),
      });
    }

    return fallbackWebPageToAi({
      canonicalUri: finalUrl,
      deps,
      fallbackReason:
        extractedText.length > 0 ? 'low_text_yield' : 'readability_failed',
      html: html.slice(0, 120_000),
      title: pickTitle(
        article?.title,
        dom.window.document.title,
        job.sourceTitle,
      ),
    });
  } catch {
    return fallbackWebPageToAi({
      canonicalUri: finalUrl,
      deps,
      fallbackReason: 'readability_failed',
      html: html.slice(0, 120_000),
      title: job.sourceTitle,
    });
  }
}

export async function extractSourceDocument(
  job: IngestionJobForExtraction,
  deps: ExtractSourceDeps = {
    extractHardWebPageWithAi,
    extractImageWithAi,
    extractPdfPages: defaultExtractPdfPages,
    extractScannedPdfWithAi,
    fetch,
    readObjectBytes,
  },
) {
  if (job.sourceKind === 'note') {
    return extractNoteDocument(job);
  }

  if (job.sourceKind === 'file') {
    return extractFileDocument(job, deps);
  }

  if (job.sourceKind === 'web_page') {
    return extractWebPageDocument(job, deps);
  }

  throw new IngestionPipelineError(
    'EXTRACTOR_NOT_IMPLEMENTED',
    `${job.sourceKind ?? 'unknown'} ingestion is not implemented yet.`,
    {
      sourceKind: job.sourceKind,
    },
  );
}
