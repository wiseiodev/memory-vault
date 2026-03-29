import { z } from 'zod';
import { retrievalSourceKinds } from '@/features/retrieval/types';

const isoDateTimePattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

const optionalDateTimeInput = z.preprocess(
  (value) => {
    if (value === '') {
      return undefined;
    }

    if (typeof value === 'string') {
      return value.trim();
    }

    return value;
  },
  z
    .union([
      z.date(),
      z
        .string()
        .min(1)
        .refine((value) => isoDateTimePattern.test(value), {
          message:
            'must be an ISO 8601 datetime string with timezone information.',
        })
        .transform((value) => new Date(value)),
    ])
    .optional(),
);

export const askQueryInput = z
  .object({
    capturedAfter: optionalDateTimeInput,
    capturedBefore: optionalDateTimeInput,
    question: z
      .string()
      .trim()
      .min(1, 'question is required.')
      .max(2000, 'question must be 2000 characters or fewer.'),
    sourceKinds: z.array(z.enum(retrievalSourceKinds)).optional(),
    spaceId: z.string().trim().min(1).optional(),
  })
  .refine(
    (value) => {
      if (!value.capturedAfter || !value.capturedBefore) {
        return true;
      }

      return value.capturedAfter <= value.capturedBefore;
    },
    {
      message: 'capturedAfter must be less than or equal to capturedBefore.',
      path: ['capturedAfter'],
    },
  );

export const queryCitationRetrievalMeta = z.object({
  fusionScore: z.number(),
  primitiveSources: z.array(
    z.enum(['memory_text', 'memory_vector', 'segment_text', 'segment_vector']),
  ),
  rerankScore: z.number(),
});

export const queryCitation = z.object({
  bundleKey: z.string(),
  canonicalUri: z.string().nullable(),
  citationId: z.string(),
  evidenceKind: z.enum(['memory', 'segment']),
  exactQuotes: z.array(z.string()),
  locators: z.array(z.record(z.string(), z.unknown())),
  memoryId: z.string().optional(),
  retrievalMeta: queryCitationRetrievalMeta,
  segmentIds: z.array(z.string()),
  sourceItemId: z.string(),
  sourceKind: z.enum(retrievalSourceKinds),
  sourceTitle: z.string().nullable(),
});

export const querySourceReference = z.object({
  canonicalUri: z.string().nullable(),
  citationIds: z.array(z.string()),
  sourceItemId: z.string(),
  sourceKind: z.enum(retrievalSourceKinds),
  title: z.string().nullable(),
});

export const queryRetrievalMeta = z.object({
  fusedCandidateCount: z.number().int().nonnegative(),
  memoryHitsUsed: z.boolean(),
  normalizationDegraded: z.boolean(),
  primitiveCounts: z.object({
    memory_text: z.number().int().nonnegative(),
    memory_vector: z.number().int().nonnegative(),
    segment_text: z.number().int().nonnegative(),
    segment_vector: z.number().int().nonnegative(),
  }),
  rerankDegraded: z.boolean(),
  retrievalQuery: z.string(),
  usedNormalizedQuery: z.boolean(),
});

export const askQueryStatusEvent = z.object({
  counts: z
    .object({
      candidateCount: z.number().int().nonnegative().optional(),
      memoryHitsUsed: z.boolean().optional(),
    })
    .optional(),
  phase: z.enum(['answering', 'normalizing', 'reranking', 'retrieving']),
  type: z.literal('status'),
});

export const askQueryAnswerDeltaEvent = z.object({
  text: z.string(),
  type: z.literal('answer_delta'),
});

export const askQueryCompletedEvent = z.object({
  answerMarkdown: z.string(),
  citations: z.array(queryCitation),
  retrievalMeta: queryRetrievalMeta,
  sourceReferences: z.array(querySourceReference),
  type: z.literal('completed'),
});

export const askQueryAbstainedEvent = z.object({
  citations: z.array(queryCitation),
  message: z.string(),
  reason: z.enum([
    'generation_validation_failed',
    'no_grounded_evidence',
    'weak_evidence',
  ]),
  retrievalMeta: queryRetrievalMeta,
  sourceReferences: z.array(querySourceReference),
  type: z.literal('abstained'),
});

export const askQueryEvent = z.discriminatedUnion('type', [
  askQueryStatusEvent,
  askQueryAnswerDeltaEvent,
  askQueryCompletedEvent,
  askQueryAbstainedEvent,
]);

export type AskQueryEvent = z.infer<typeof askQueryEvent>;
