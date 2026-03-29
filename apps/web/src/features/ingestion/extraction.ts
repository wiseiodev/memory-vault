import 'server-only';

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import {
  readObjectBytes,
  StorageObjectTooLargeError,
} from '@/features/uploads/storage';
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
  sourceBlobByteSize: bigint | null;
  sourceBlobContentType: string | null;
  sourceBlobId: string | null;
  sourceBlobObjectKey: string | null;
  sourceKind: 'file' | 'note' | 'web_page' | null;
  sourceMetadata: Record<string, unknown>;
  sourceTitle: string | null;
};

export type ExtractSourceDocumentInput = IngestionJobForExtraction;

type ExtractSourceDeps = {
  assertSafeWebUrl: (url: string) => Promise<string>;
  extractHardWebPageWithAi: typeof extractHardWebPageWithAi;
  extractImageWithAi: typeof extractImageWithAi;
  extractScannedPdfWithAi: typeof extractScannedPdfWithAi;
  fetch: typeof fetch;
  readObjectBytes: typeof readObjectBytes;
};

const MAX_EXTRACTION_BLOB_BYTES = 25 * 1024 * 1024;
const MAX_WEB_REDIRECTS = 5;
const MIN_READABILITY_TEXT_LENGTH = 200;

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

function ipv4ToInteger(address: string) {
  return address
    .split('.')
    .map((part) => Number(part))
    .reduce((value, octet) => (value << 8) + octet, 0);
}

function isPrivateIpv4(address: string) {
  const value = ipv4ToInteger(address);
  const ranges: Array<[number, number]> = [
    [ipv4ToInteger('0.0.0.0'), ipv4ToInteger('0.255.255.255')],
    [ipv4ToInteger('10.0.0.0'), ipv4ToInteger('10.255.255.255')],
    [ipv4ToInteger('100.64.0.0'), ipv4ToInteger('100.127.255.255')],
    [ipv4ToInteger('127.0.0.0'), ipv4ToInteger('127.255.255.255')],
    [ipv4ToInteger('169.254.0.0'), ipv4ToInteger('169.254.255.255')],
    [ipv4ToInteger('172.16.0.0'), ipv4ToInteger('172.31.255.255')],
    [ipv4ToInteger('192.168.0.0'), ipv4ToInteger('192.168.255.255')],
    [ipv4ToInteger('198.18.0.0'), ipv4ToInteger('198.19.255.255')],
    [ipv4ToInteger('224.0.0.0'), ipv4ToInteger('255.255.255.255')],
  ];

  return ranges.some(([start, end]) => value >= start && value <= end);
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase();

  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:') ||
    normalized.startsWith('::ffff:127.') ||
    normalized.startsWith('::ffff:10.') ||
    normalized.startsWith('::ffff:192.168.') ||
    normalized.startsWith('::ffff:169.254.')
  );
}

function isPrivateIpAddress(address: string) {
  const version = isIP(address);

  if (version === 4) {
    return isPrivateIpv4(address);
  }

  if (version === 6) {
    return isPrivateIpv6(address);
  }

  return false;
}

async function defaultAssertSafeWebUrl(url: string) {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw new IngestionPipelineError(
      'UNSAFE_SOURCE_URI',
      'Web extraction requires a valid absolute URL.',
      { url },
    );
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new IngestionPipelineError(
      'UNSAFE_SOURCE_URI',
      'Web extraction only supports http and https URLs.',
      {
        protocol: parsedUrl.protocol,
        url,
      },
    );
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new IngestionPipelineError(
      'UNSAFE_SOURCE_URI',
      'Localhost targets are not allowed for web extraction.',
      { hostname, url },
    );
  }

  if (isPrivateIpAddress(hostname)) {
    throw new IngestionPipelineError(
      'UNSAFE_SOURCE_URI',
      'Private network targets are not allowed for web extraction.',
      { hostname, url },
    );
  }

  try {
    const addresses = await lookup(hostname, {
      all: true,
      verbatim: true,
    });

    if (addresses.some((address) => isPrivateIpAddress(address.address))) {
      throw new IngestionPipelineError(
        'UNSAFE_SOURCE_URI',
        'Web extraction cannot follow domains that resolve to private network addresses.',
        { hostname, url },
      );
    }
  } catch (error) {
    if (error instanceof IngestionPipelineError) {
      throw error;
    }
  }

  parsedUrl.username = '';
  parsedUrl.password = '';

  return parsedUrl.toString();
}

async function extractReadableHtml(html: string, url: string) {
  const [{ Readability }, { JSDOM }] = await Promise.all([
    import('@mozilla/readability'),
    import('jsdom'),
  ]);
  const dom = new JSDOM(html, { url });
  const readability = new Readability(dom.window.document);
  const article = readability.parse();

  return {
    article,
    documentTitle: dom.window.document.title,
  };
}

function gatewayPagesToDocument(input: {
  canonicalUri: string | null;
  configuredModel?: string;
  extractionStrategy: 'ai_ocr' | 'gateway_fallback';
  fallbackReason?: string;
  fallbackUsed: boolean;
  kind: 'ocr' | 'plain_text';
  model: string;
  mimeType: string | null;
  output: Awaited<ReturnType<typeof extractHardWebPageWithAi>>['output'];
  providerRoute: string[];
  sourceBlobId: string | null;
}) {
  const configuredPrimaryModel = input.configuredModel ?? input.model;
  const responseProvider = input.model.includes('/')
    ? input.model.split('/')[0]
    : null;
  const providerFallbackUsed = input.model !== configuredPrimaryModel;
  const baseMetadata = {
    configuredPrimaryModel,
    extractionStrategy: input.extractionStrategy,
    extractor: 'vercel-ai-gateway',
    fallbackUsed: input.fallbackUsed,
    model: input.model,
    providerFallbackUsed,
    providerRoute: input.providerRoute,
    providerRouteType: 'configured_fallback_order' as const,
    responseModel: input.model,
    responseProvider,
    configuredProviderRoute: input.providerRoute,
  };
  const fallbackMetadata =
    input.fallbackReason === undefined
      ? {}
      : {
          fallbackReason: input.fallbackReason,
        };

  return buildExtractedDocument({
    blocks: input.output.pages.map((page) => ({
      content: page.content,
      kind: input.kind,
      metadata: {
        ...baseMetadata,
        ...fallbackMetadata,
        pageNumber: page.pageNumber ?? undefined,
      },
    })),
    canonicalUri: input.canonicalUri,
    languageCode: input.output.languageCode ?? null,
    metadata: {
      confidence: input.output.confidence ?? null,
      ...baseMetadata,
      ...fallbackMetadata,
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

  return gatewayPagesToDocument({
    canonicalUri: input.canonicalUri,
    configuredModel: aiResult.configuredModel,
    extractionStrategy: 'gateway_fallback',
    fallbackReason: input.fallbackReason,
    fallbackUsed: true,
    kind: 'plain_text',
    model: aiResult.responseModel ?? aiResult.model,
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
    const aiResult = await deps.extractScannedPdfWithAi({
      bytes: input.bytes,
      title: input.title,
    });

    return gatewayPagesToDocument({
      canonicalUri: input.canonicalUri,
      configuredModel: aiResult.configuredModel,
      extractionStrategy: 'ai_ocr',
      fallbackUsed: false,
      kind: 'ocr',
      model: aiResult.responseModel ?? aiResult.model,
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

    return gatewayPagesToDocument({
      canonicalUri: input.canonicalUri,
      configuredModel: aiResult.configuredModel,
      extractionStrategy: 'gateway_fallback',
      fallbackReason: 'image_ocr',
      fallbackUsed: true,
      kind: 'ocr',
      model: aiResult.responseModel ?? aiResult.model,
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

  if (
    typeof job.sourceBlobByteSize === 'bigint' &&
    job.sourceBlobByteSize > BigInt(MAX_EXTRACTION_BLOB_BYTES)
  ) {
    throw new IngestionPipelineError(
      'SOURCE_BLOB_TOO_LARGE',
      'File is too large for the current in-memory extraction pipeline.',
      {
        byteSize: job.sourceBlobByteSize.toString(),
        maxBytes: MAX_EXTRACTION_BLOB_BYTES,
        sourceBlobId: job.sourceBlobId,
      },
    );
  }

  let bytes: Uint8Array;

  try {
    bytes = await deps.readObjectBytes({
      maxBytes: MAX_EXTRACTION_BLOB_BYTES,
      objectKey: job.sourceBlobObjectKey,
    });
  } catch (error) {
    if (error instanceof StorageObjectTooLargeError) {
      throw new IngestionPipelineError(
        'SOURCE_BLOB_TOO_LARGE',
        'File is too large for the current in-memory extraction pipeline.',
        {
          byteSize: error.byteSize.toString(),
          maxBytes: error.maxBytes,
          objectKey: error.objectKey,
          sourceBlobId: job.sourceBlobId,
        },
      );
    }

    throw error;
  }

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

function isRedirectStatus(status: number) {
  return [301, 302, 303, 307, 308].includes(status);
}

async function fetchWebPageResponse(
  submittedUrl: string,
  deps: ExtractSourceDeps,
) {
  let currentUrl = await deps.assertSafeWebUrl(submittedUrl);

  for (
    let redirectCount = 0;
    redirectCount <= MAX_WEB_REDIRECTS;
    redirectCount += 1
  ) {
    const response = await deps.fetch(currentUrl, {
      headers: {
        Accept:
          'text/html,application/xhtml+xml,text/plain;q=0.8,application/pdf;q=0.7,*/*;q=0.5',
        'User-Agent':
          'MemoryVaultBot/1.0 (+https://memory-vault.local/extraction)',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });

    if (!isRedirectStatus(response.status)) {
      return {
        finalUrl: currentUrl,
        response,
      };
    }

    const location = response.headers.get('location');

    if (!location) {
      return {
        finalUrl: currentUrl,
        response,
      };
    }

    if (redirectCount === MAX_WEB_REDIRECTS) {
      throw new IngestionPipelineError(
        'WEB_FETCH_FAILED',
        'Web extraction exceeded the maximum redirect count.',
        {
          maxRedirects: MAX_WEB_REDIRECTS,
          url: currentUrl,
        },
      );
    }

    currentUrl = await deps.assertSafeWebUrl(
      new URL(location, currentUrl).toString(),
    );
  }

  throw new IngestionPipelineError(
    'WEB_FETCH_FAILED',
    'Web extraction exhausted the redirect handling loop unexpectedly.',
    {
      maxRedirects: MAX_WEB_REDIRECTS,
      url: submittedUrl,
    },
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

  const safeSubmittedUrl = await deps.assertSafeWebUrl(submittedUrl);
  let response: Response;
  let finalUrl = safeSubmittedUrl;

  try {
    const resolvedResponse = await fetchWebPageResponse(safeSubmittedUrl, deps);
    response = resolvedResponse.response;
    finalUrl = resolvedResponse.finalUrl;
  } catch (error) {
    if (
      error instanceof IngestionPipelineError &&
      error.code === 'UNSAFE_SOURCE_URI'
    ) {
      throw error;
    }

    return fallbackWebPageToAi({
      canonicalUri: safeSubmittedUrl,
      deps,
      fallbackReason: 'fetch_failed',
      title: job.sourceTitle,
    });
  }

  if (!response.ok) {
    return fallbackWebPageToAi({
      canonicalUri: finalUrl,
      deps,
      fallbackReason: 'fetch_failed',
      title: job.sourceTitle,
    });
  }

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
    const { article, documentTitle } = await extractReadableHtml(
      html,
      finalUrl,
    );
    const extractedText = normalizeText(article?.textContent ?? '');

    if (extractedText.length >= MIN_READABILITY_TEXT_LENGTH) {
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
        title: pickTitle(article?.title, documentTitle, job.sourceTitle),
      });
    }

    return fallbackWebPageToAi({
      canonicalUri: finalUrl,
      deps,
      fallbackReason:
        extractedText.length > 0 ? 'low_text_yield' : 'readability_failed',
      html: html.slice(0, 120_000),
      title: pickTitle(article?.title, documentTitle, job.sourceTitle),
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
    assertSafeWebUrl: defaultAssertSafeWebUrl,
    extractHardWebPageWithAi,
    extractImageWithAi,
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
