import 'server-only';

import {
  type BeginWebCaptureOutput,
  beginWebCaptureOutput,
  type ExtensionCaptureSummary,
  MAX_EXTENSION_HTML_SNAPSHOT_BYTES,
} from '@memory-vault/extension-contract';
import { ORPCError } from '@orpc/server';
import { DatabaseError } from 'pg';

import { generateId } from '@/db/columns/id';
import {
  DEFAULT_INGESTION_MAX_ATTEMPTS,
  dispatchIngestionJobForRequest,
} from '@/features/ingestion/service';
import { createSpaceRepository, type SpaceRepository } from '@/features/spaces';
import { buildSourceBlobObjectKey } from '@/features/uploads/object-key';
import { completeUpload } from '@/features/uploads/service';
import {
  createPresignedUpload,
  deleteObject,
  headObject,
} from '@/features/uploads/storage';
import {
  type CaptureRepository,
  createCaptureRepository,
  type ExtensionCaptureRecord,
} from './repository';

const EXTENSION_CONNECTOR_KEY = 'chrome_extension';
const HTML_CAPTURE_FILENAME = 'page.html';

type OwnedSpaceRepository = Pick<
  SpaceRepository,
  'createDefaultForUser' | 'findDefaultForUser' | 'findOwnedById'
>;

type CreateCaptureDeps = {
  dispatchIngestionJob: typeof dispatchIngestionJobForRequest;
  now: () => Date;
  repository: CaptureRepository;
  spaceRepository: OwnedSpaceRepository;
};

type ExtensionNoteDeps = {
  dispatchIngestionJob: typeof dispatchIngestionJobForRequest;
  now: () => Date;
  repository: CaptureRepository;
};

type BeginWebCaptureDeps = {
  createPresignedUpload: typeof createPresignedUpload;
  now: () => Date;
  repository: CaptureRepository;
  storageHeadObject: typeof headObject;
};

type CompleteWebCaptureDeps = {
  dispatchIngestionJob: typeof dispatchIngestionJobForRequest;
  now: () => Date;
  repository: CaptureRepository;
  storageHeadObject: typeof headObject;
};

type AbandonWebCaptureDeps = {
  deleteObject: typeof deleteObject;
  now: () => Date;
  repository: CaptureRepository;
};

type FinalizeUploadDeps = {
  dispatchIngestionJob: typeof dispatchIngestionJobForRequest;
  completeUpload: typeof completeUpload;
};

type BaseCaptureInput = {
  spaceId?: string;
  userId: string;
};

type NoteCaptureInput = BaseCaptureInput & {
  body: string;
  title?: string;
};

type UrlCaptureInput = BaseCaptureInput & {
  title?: string;
  url: string;
};

type ExtensionCaptureIdentity = {
  captureRequestId: string;
  spaceId: string;
  userId: string;
};

type ExtensionNoteInput = ExtensionCaptureIdentity & {
  body: string;
  title?: string;
};

type BeginWebCaptureInput = ExtensionCaptureIdentity & {
  browserVersion?: string;
  canonicalLinkUrl?: string;
  capturedAt: string;
  extensionVersion?: string;
  faviconUrl?: string;
  htmlByteSize: number;
  htmlContentType: string;
  selectedText?: string;
  title?: string;
  url: string;
};

type CompleteWebCaptureInput = ExtensionCaptureIdentity & {
  sourceBlobId: string;
  sourceItemId: string;
};

type AbandonWebCaptureInput = CompleteWebCaptureInput;

type FinalizeUploadInput = {
  sourceBlobId: string;
  sourceItemId: string;
  userId: string;
};

export type CaptureSummary = {
  capturedAt: string;
  kind: 'file' | 'note' | 'web_page';
  sourceBlobId?: string;
  sourceItemId: string;
  spaceId: string;
  status: 'pending';
};

function deriveWebCaptureJobId(sourceItemId: string) {
  if (!sourceItemId.startsWith('src_')) {
    throw new Error(`Cannot derive an ingestion job id from ${sourceItemId}.`);
  }

  return `job_${sourceItemId.slice(4)}`;
}

function isHtmlContentType(value: string | null | undefined) {
  return value === 'text/html' || value === 'application/xhtml+xml';
}

function toExtensionCaptureSummary(
  capture: Pick<
    ExtensionCaptureRecord,
    | 'capturedAt'
    | 'kind'
    | 'sourceBlobId'
    | 'sourceItemId'
    | 'spaceId'
    | 'status'
  >,
): ExtensionCaptureSummary {
  return {
    capturedAt: capture.capturedAt,
    kind: capture.kind,
    sourceBlobId: capture.sourceBlobId ?? undefined,
    sourceItemId: capture.sourceItemId,
    spaceId: capture.spaceId,
    status: capture.status,
  };
}

async function resolveCaptureSpace(input: {
  requestedSpaceId?: string;
  repository: OwnedSpaceRepository;
  userId: string;
}) {
  if (input.requestedSpaceId) {
    const ownedSpace = await input.repository.findOwnedById({
      spaceId: input.requestedSpaceId,
      userId: input.userId,
    });

    if (ownedSpace) {
      return ownedSpace;
    }
  }

  const existingDefaultSpace = await input.repository.findDefaultForUser({
    userId: input.userId,
  });

  if (existingDefaultSpace) {
    return existingDefaultSpace;
  }

  return input.repository.createDefaultForUser({
    userId: input.userId,
  });
}

async function loadExistingExtensionCapture(
  input: ExtensionCaptureIdentity,
  repository: CaptureRepository,
) {
  return repository.findExtensionCaptureByExternalId({
    captureRequestId: input.captureRequestId,
    spaceId: input.spaceId,
    userId: input.userId,
  });
}

async function buildExistingBeginWebCaptureResponse(
  capture: ExtensionCaptureRecord,
  input: Pick<BeginWebCaptureInput, 'htmlContentType'>,
  deps: Pick<
    BeginWebCaptureDeps,
    'createPresignedUpload' | 'storageHeadObject'
  >,
): Promise<BeginWebCaptureOutput> {
  const captureSummary = toExtensionCaptureSummary(capture);

  if (capture.status !== 'pending') {
    return beginWebCaptureOutput.parse({
      capture: captureSummary,
      phase: 'already_captured',
      upload: null,
    });
  }

  if (!capture.sourceBlobId || !capture.sourceBlobObjectKey) {
    throw new ORPCError('CONFLICT', {
      message: 'Pending capture is missing its reserved snapshot blob.',
    });
  }

  const existingObject = await deps.storageHeadObject({
    objectKey: capture.sourceBlobObjectKey,
  });

  if (
    existingObject &&
    isHtmlContentType(existingObject.contentType) &&
    existingObject.byteSize <= BigInt(MAX_EXTENSION_HTML_SNAPSHOT_BYTES)
  ) {
    return beginWebCaptureOutput.parse({
      capture: captureSummary,
      phase: 'ready_to_complete',
      upload: null,
    });
  }

  const presignedUpload = await deps.createPresignedUpload({
    contentType: input.htmlContentType,
    objectKey: capture.sourceBlobObjectKey,
  });

  return beginWebCaptureOutput.parse({
    capture: captureSummary,
    phase: 'upload_required',
    upload: {
      objectKey: capture.sourceBlobObjectKey,
      sourceBlobId: capture.sourceBlobId,
      sourceItemId: capture.sourceItemId,
      uploadHeaders: presignedUpload.uploadHeaders,
      uploadMethod: 'PUT',
      uploadUrl: presignedUpload.uploadUrl,
    },
  });
}

function buildWebCaptureMetadata(input: BeginWebCaptureInput) {
  return {
    browserVersion: input.browserVersion,
    canonicalLinkUrl: input.canonicalLinkUrl,
    captureRequestId: input.captureRequestId,
    capturedAt: input.capturedAt,
    extensionVersion: input.extensionVersion,
    faviconUrl: input.faviconUrl,
    htmlByteSize: input.htmlByteSize,
    pageTitle: input.title ?? null,
    selectedText: input.selectedText,
    submittedUrl: input.url,
  } satisfies Record<string, unknown>;
}

export async function createNoteCapture(
  input: NoteCaptureInput,
  deps: CreateCaptureDeps = {
    dispatchIngestionJob: dispatchIngestionJobForRequest,
    now: () => new Date(),
    repository: createCaptureRepository(),
    spaceRepository: createSpaceRepository(),
  },
): Promise<CaptureSummary> {
  const space = await resolveCaptureSpace({
    requestedSpaceId: input.spaceId,
    repository: deps.spaceRepository,
    userId: input.userId,
  });
  const sourceItemId = generateId('src');
  const jobId = generateId('job');

  const createdCapture = await deps.repository.createCapture({
    canonicalUri: null,
    capturedAt: deps.now(),
    ingestionJob: {
      id: jobId,
      maxAttempts: DEFAULT_INGESTION_MAX_ATTEMPTS,
      payload: {
        sourceKind: 'note',
      },
    },
    kind: 'note',
    metadata: {
      noteBody: input.body,
    },
    sourceItemId,
    spaceId: space.id,
    title: input.title ?? null,
    userId: input.userId,
  });

  await deps.dispatchIngestionJob({
    jobId: createdCapture.jobId,
    sourceItemId: createdCapture.sourceItemId,
  });

  return {
    capturedAt: createdCapture.capturedAt,
    kind: createdCapture.kind,
    sourceItemId: createdCapture.sourceItemId,
    spaceId: createdCapture.spaceId,
    status: createdCapture.status,
  };
}

export async function createUrlCapture(
  input: UrlCaptureInput,
  deps: CreateCaptureDeps = {
    dispatchIngestionJob: dispatchIngestionJobForRequest,
    now: () => new Date(),
    repository: createCaptureRepository(),
    spaceRepository: createSpaceRepository(),
  },
): Promise<CaptureSummary> {
  const space = await resolveCaptureSpace({
    requestedSpaceId: input.spaceId,
    repository: deps.spaceRepository,
    userId: input.userId,
  });
  const sourceItemId = generateId('src');
  const jobId = generateId('job');

  const createdCapture = await deps.repository.createCapture({
    canonicalUri: input.url,
    capturedAt: deps.now(),
    ingestionJob: {
      id: jobId,
      maxAttempts: DEFAULT_INGESTION_MAX_ATTEMPTS,
      payload: {
        sourceKind: 'web_page',
      },
    },
    kind: 'web_page',
    metadata: {
      submittedUrl: input.url,
    },
    sourceItemId,
    spaceId: space.id,
    title: input.title ?? null,
    userId: input.userId,
  });

  await deps.dispatchIngestionJob({
    jobId: createdCapture.jobId,
    sourceItemId: createdCapture.sourceItemId,
  });

  return {
    capturedAt: createdCapture.capturedAt,
    kind: createdCapture.kind,
    sourceItemId: createdCapture.sourceItemId,
    spaceId: createdCapture.spaceId,
    status: createdCapture.status,
  };
}

export async function createExtensionNoteCapture(
  input: ExtensionNoteInput,
  deps: ExtensionNoteDeps = {
    dispatchIngestionJob: dispatchIngestionJobForRequest,
    now: () => new Date(),
    repository: createCaptureRepository(),
  },
): Promise<ExtensionCaptureSummary> {
  const existingCapture = await loadExistingExtensionCapture(
    input,
    deps.repository,
  );

  if (existingCapture) {
    return toExtensionCaptureSummary(existingCapture);
  }

  const sourceItemId = generateId('src');
  const jobId = deriveWebCaptureJobId(sourceItemId);

  try {
    const createdCapture = await deps.repository.createCapture({
      canonicalUri: null,
      capturedAt: deps.now(),
      connectorKey: EXTENSION_CONNECTOR_KEY,
      externalId: input.captureRequestId,
      ingestionJob: {
        id: jobId,
        maxAttempts: DEFAULT_INGESTION_MAX_ATTEMPTS,
        payload: {
          captureRequestId: input.captureRequestId,
          sourceKind: 'note',
        },
      },
      kind: 'note',
      metadata: {
        captureRequestId: input.captureRequestId,
        noteBody: input.body,
      },
      sourceItemId,
      spaceId: input.spaceId,
      title: input.title ?? null,
      userId: input.userId,
    });

    await deps.dispatchIngestionJob({
      jobId: createdCapture.jobId,
      sourceItemId: createdCapture.sourceItemId,
    });

    return {
      capturedAt: createdCapture.capturedAt,
      kind: 'note',
      sourceItemId: createdCapture.sourceItemId,
      spaceId: createdCapture.spaceId,
      status: createdCapture.status,
    };
  } catch (error) {
    if (!(error instanceof DatabaseError) || error.code !== '23505') {
      throw error;
    }

    const replayedCapture = await loadExistingExtensionCapture(
      input,
      deps.repository,
    );

    if (!replayedCapture) {
      throw error;
    }

    return toExtensionCaptureSummary(replayedCapture);
  }
}

export async function beginWebCapture(
  input: BeginWebCaptureInput,
  deps: BeginWebCaptureDeps = {
    createPresignedUpload,
    now: () => new Date(),
    repository: createCaptureRepository(),
    storageHeadObject: headObject,
  },
) {
  const existingCapture = await loadExistingExtensionCapture(
    input,
    deps.repository,
  );

  if (existingCapture) {
    return buildExistingBeginWebCaptureResponse(existingCapture, input, deps);
  }

  const sourceItemId = generateId('src');
  const sourceBlobId = generateId('blob');
  const objectKey = buildSourceBlobObjectKey({
    filename: HTML_CAPTURE_FILENAME,
    sourceBlobId,
    sourceItemId,
    spaceId: input.spaceId,
  });

  try {
    const reservedCapture = await deps.repository.createWebCaptureReservation({
      byteSize: BigInt(input.htmlByteSize),
      canonicalUri: input.url,
      capturedAt: new Date(input.capturedAt),
      connectorKey: EXTENSION_CONNECTOR_KEY,
      contentType: input.htmlContentType,
      externalId: input.captureRequestId,
      metadata: buildWebCaptureMetadata(input),
      objectKey,
      sourceBlobId,
      sourceItemId,
      spaceId: input.spaceId,
      title: input.title ?? null,
      userId: input.userId,
    });

    try {
      const presignedUpload = await deps.createPresignedUpload({
        contentType: input.htmlContentType,
        objectKey,
      });

      return beginWebCaptureOutput.parse({
        capture: {
          capturedAt: reservedCapture.capturedAt,
          kind: 'web_page',
          sourceBlobId,
          sourceItemId: reservedCapture.sourceItemId,
          spaceId: reservedCapture.spaceId,
          status: reservedCapture.status,
        },
        phase: 'upload_required',
        upload: {
          objectKey,
          sourceBlobId,
          sourceItemId,
          uploadHeaders: presignedUpload.uploadHeaders,
          uploadMethod: 'PUT',
          uploadUrl: presignedUpload.uploadUrl,
        },
      });
    } catch (error) {
      await deps.repository.abandonWebCaptureReservation({
        captureRequestId: input.captureRequestId,
        deletedAt: deps.now(),
        sourceBlobId,
        sourceItemId,
        spaceId: input.spaceId,
        userId: input.userId,
      });
      throw error;
    }
  } catch (error) {
    if (!(error instanceof DatabaseError) || error.code !== '23505') {
      throw error;
    }

    const replayedCapture = await loadExistingExtensionCapture(
      input,
      deps.repository,
    );

    if (!replayedCapture) {
      throw error;
    }

    return buildExistingBeginWebCaptureResponse(replayedCapture, input, deps);
  }
}

export async function completeWebCapture(
  input: CompleteWebCaptureInput,
  deps: CompleteWebCaptureDeps = {
    dispatchIngestionJob: dispatchIngestionJobForRequest,
    now: () => new Date(),
    repository: createCaptureRepository(),
    storageHeadObject: headObject,
  },
): Promise<ExtensionCaptureSummary> {
  const existingCapture = await loadExistingExtensionCapture(
    input,
    deps.repository,
  );

  if (!existingCapture) {
    throw new ORPCError('NOT_FOUND', {
      message: 'Capture reservation was not found.',
    });
  }

  if (existingCapture.status !== 'pending') {
    return toExtensionCaptureSummary(existingCapture);
  }

  if (
    existingCapture.sourceItemId !== input.sourceItemId ||
    existingCapture.sourceBlobId !== input.sourceBlobId
  ) {
    throw new ORPCError('CONFLICT', {
      message:
        'Capture reservation does not match the latest pending snapshot.',
    });
  }

  if (!existingCapture.sourceBlobObjectKey) {
    throw new ORPCError('CONFLICT', {
      message: 'Capture reservation is missing its snapshot upload target.',
    });
  }

  const uploadedObject = await deps.storageHeadObject({
    objectKey: existingCapture.sourceBlobObjectKey,
  });

  if (!uploadedObject) {
    throw new ORPCError('CONFLICT', {
      message: 'Snapshot upload was not found in storage.',
    });
  }

  if (
    !isHtmlContentType(uploadedObject.contentType) ||
    uploadedObject.byteSize > BigInt(MAX_EXTENSION_HTML_SNAPSHOT_BYTES)
  ) {
    throw new ORPCError('CONFLICT', {
      message: 'Snapshot upload is not a supported HTML document.',
    });
  }

  const jobId = deriveWebCaptureJobId(input.sourceItemId);
  const finalizedCapture = await deps.repository.finalizeWebCaptureReservation({
    byteSize: uploadedObject.byteSize,
    captureRequestId: input.captureRequestId,
    contentType: uploadedObject.contentType,
    etag: uploadedObject.etag,
    ingestionJob: {
      id: jobId,
      maxAttempts: DEFAULT_INGESTION_MAX_ATTEMPTS,
      payload: {
        captureRequestId: input.captureRequestId,
        snapshotSourceBlobId: input.sourceBlobId,
        sourceKind: 'web_page',
      },
    },
    sourceBlobId: input.sourceBlobId,
    sourceItemId: input.sourceItemId,
    spaceId: input.spaceId,
    uploadedAt: deps.now(),
    userId: input.userId,
  });

  if (!finalizedCapture) {
    throw new ORPCError('NOT_FOUND', {
      message: 'Capture reservation was not found.',
    });
  }

  await deps.dispatchIngestionJob({
    jobId,
    sourceItemId: input.sourceItemId,
  });

  return toExtensionCaptureSummary(finalizedCapture);
}

export async function abandonWebCapture(
  input: AbandonWebCaptureInput,
  deps: AbandonWebCaptureDeps = {
    deleteObject,
    now: () => new Date(),
    repository: createCaptureRepository(),
  },
) {
  const existingCapture = await loadExistingExtensionCapture(
    input,
    deps.repository,
  );

  if (
    !existingCapture ||
    existingCapture.status !== 'pending' ||
    existingCapture.sourceItemId !== input.sourceItemId ||
    existingCapture.sourceBlobId !== input.sourceBlobId
  ) {
    return { abandoned: true as const };
  }

  if (existingCapture.sourceBlobObjectKey) {
    try {
      await deps.deleteObject({
        objectKey: existingCapture.sourceBlobObjectKey,
      });
    } catch {
      // Best-effort cleanup only.
    }
  }

  await deps.repository.abandonWebCaptureReservation({
    captureRequestId: input.captureRequestId,
    deletedAt: deps.now(),
    sourceBlobId: input.sourceBlobId,
    sourceItemId: input.sourceItemId,
    spaceId: input.spaceId,
    userId: input.userId,
  });

  return { abandoned: true as const };
}

export async function finalizeUploadCapture(
  input: FinalizeUploadInput,
  deps: FinalizeUploadDeps = {
    dispatchIngestionJob: dispatchIngestionJobForRequest,
    completeUpload,
  },
): Promise<CaptureSummary> {
  const completedUpload = await deps.completeUpload(input);

  if (!completedUpload.uploadedAt) {
    throw new Error('completeUpload did not return an uploadedAt timestamp');
  }

  await deps.dispatchIngestionJob({
    jobId: completedUpload.ingestionJobId,
    sourceItemId: completedUpload.sourceItemId,
  });

  return {
    capturedAt: completedUpload.uploadedAt,
    kind: 'file',
    sourceBlobId: completedUpload.sourceBlobId,
    sourceItemId: completedUpload.sourceItemId,
    spaceId: completedUpload.spaceId,
    status: 'pending',
  };
}
