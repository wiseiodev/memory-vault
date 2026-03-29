import 'server-only';

import { generateId } from '@/db/columns/id';
import { createSpaceRepository, type SpaceRepository } from '@/features/spaces';
import { completeUpload } from '@/features/uploads/service';
import { type CaptureRepository, createCaptureRepository } from './repository';

type OwnedSpaceRepository = Pick<
  SpaceRepository,
  'createDefaultForUser' | 'findDefaultForUser' | 'findOwnedById'
>;

type CreateCaptureDeps = {
  now: () => Date;
  repository: CaptureRepository;
  spaceRepository: OwnedSpaceRepository;
};

type FinalizeUploadDeps = {
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

export async function createNoteCapture(
  input: NoteCaptureInput,
  deps: CreateCaptureDeps = {
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

  return deps.repository.createCapture({
    canonicalUri: null,
    capturedAt: deps.now(),
    kind: 'note',
    metadata: {
      noteBody: input.body,
    },
    sourceItemId,
    spaceId: space.id,
    title: input.title ?? null,
    userId: input.userId,
  });
}

export async function createUrlCapture(
  input: UrlCaptureInput,
  deps: CreateCaptureDeps = {
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

  return deps.repository.createCapture({
    canonicalUri: input.url,
    capturedAt: deps.now(),
    kind: 'web_page',
    metadata: {
      submittedUrl: input.url,
    },
    sourceItemId,
    spaceId: space.id,
    title: input.title ?? null,
    userId: input.userId,
  });
}

export async function finalizeUploadCapture(
  input: FinalizeUploadInput,
  deps: FinalizeUploadDeps = {
    completeUpload,
  },
): Promise<CaptureSummary> {
  const completedUpload = await deps.completeUpload(input);

  if (!completedUpload.uploadedAt) {
    throw new Error('completeUpload did not return an uploadedAt timestamp');
  }

  return {
    capturedAt: completedUpload.uploadedAt,
    kind: 'file',
    sourceBlobId: completedUpload.sourceBlobId,
    sourceItemId: completedUpload.sourceItemId,
    spaceId: completedUpload.spaceId,
    status: 'pending',
  };
}
