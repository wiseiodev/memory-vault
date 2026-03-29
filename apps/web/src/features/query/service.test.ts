import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  generateGroundedAnswer,
  logger,
  repairGroundedAnswer,
  retrieveGroundedEvidence,
} = vi.hoisted(() => {
  return {
    generateGroundedAnswer: vi.fn(),
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
    },
    repairGroundedAnswer: vi.fn(),
    retrieveGroundedEvidence: vi.fn(),
  };
});

vi.mock('@/lib/evlog', () => ({
  getRequestLogger: vi.fn(() => logger),
}));

vi.mock('@/features/retrieval/service', () => ({
  retrieveGroundedEvidence,
}));

vi.mock('@/lib/ai/query', () => ({
  generateGroundedAnswer,
  repairGroundedAnswer,
}));

import { askQuery } from './service';

function createBundle(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    bundleKey: 'segment:seg_1',
    candidateKey: 'segment:seg_1',
    canonicalUri: 'https://example.com/note',
    exactQuotes: [
      'Pack the charger before leaving for the weekend trip because you always forget it, the battery drains quickly, and you need it for the hotel check-in message, travel confirmations, maps, and the airport rideshare receipt.',
    ],
    evidenceKind: 'segment' as const,
    fusionScore: 1.2,
    locators: [{ page: 1, segmentId: 'seg_1' }],
    primitiveSources: ['segment_text'] as const,
    rerankScore: 0.91,
    segmentIds: ['seg_1'],
    sourceItemId: 'src_1',
    sourceKind: 'note' as const,
    sourceTitle: 'Trip note',
    ...overrides,
  };
}

async function collectEvents(generator: AsyncGenerator<unknown, void, void>) {
  const events: unknown[] = [];

  for await (const event of generator) {
    events.push(event);
  }

  return events;
}

describe('askQuery', () => {
  beforeEach(() => {
    generateGroundedAnswer.mockReset();
    logger.info.mockReset();
    logger.warn.mockReset();
    repairGroundedAnswer.mockReset();
    retrieveGroundedEvidence.mockReset();
  });

  it('abstains when grounded evidence is too weak', async () => {
    retrieveGroundedEvidence.mockResolvedValue({
      bundles: [createBundle({ rerankScore: 0.4 })],
      retrievalMeta: {
        fusedCandidateCount: 1,
        memoryHitsUsed: false,
        normalizationDegraded: false,
        primitiveCounts: {
          memory_text: 0,
          memory_vector: 0,
          segment_text: 1,
          segment_vector: 0,
        },
        rerankDegraded: false,
        retrievalQuery: 'pack list',
        usedNormalizedQuery: false,
      },
    });

    const events = await collectEvents(
      askQuery({
        question: 'what should i pack?',
        userId: 'user_123',
      }),
    );

    expect(events.at(-1)).toEqual(
      expect.objectContaining({
        reason: 'weak_evidence',
        type: 'abstained',
      }),
    );
    expect(generateGroundedAnswer).not.toHaveBeenCalled();
  });

  it('can still answer when reranking degraded but grounded evidence is strong', async () => {
    retrieveGroundedEvidence.mockResolvedValue({
      bundles: [
        createBundle({ rerankScore: 0.6 }),
        createBundle({
          bundleKey: 'segment:seg_2',
          candidateKey: 'segment:seg_2',
          exactQuotes: [
            'Bring the passport and old ID card to the appointment for verification, keep the printed confirmation page with your renewal code, and carry the supporting travel documents because the office may ask for them during the identity review.',
          ],
          fusionScore: 0.9,
          locators: [{ page: 2, segmentId: 'seg_2' }],
          rerankScore: 0.59,
          segmentIds: ['seg_2'],
          sourceItemId: 'src_2',
          sourceTitle: 'Renewal note',
        }),
      ],
      retrievalMeta: {
        fusedCandidateCount: 2,
        memoryHitsUsed: false,
        normalizationDegraded: false,
        primitiveCounts: {
          memory_text: 0,
          memory_vector: 0,
          segment_text: 2,
          segment_vector: 0,
        },
        rerankDegraded: true,
        retrievalQuery: 'travel prep',
        usedNormalizedQuery: false,
      },
    });
    generateGroundedAnswer.mockResolvedValue({
      answerMarkdown: 'Pack the charger [C1]. Bring your passport [C2].',
      responseModel: 'google/gemini-3.1-pro-preview',
    });
    repairGroundedAnswer.mockResolvedValue({
      answerMarkdown: 'Pack the charger [C1]. Bring your passport [C2].',
      responseModel: 'google/gemini-3.1-pro-preview',
    });

    const events = await collectEvents(
      askQuery({
        question: 'what should i bring?',
        userId: 'user_123',
      }),
    );

    expect(generateGroundedAnswer).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toEqual(
      expect.objectContaining({
        answerMarkdown: 'Pack the charger [C1]. Bring your passport [C2].',
        type: 'completed',
      }),
    );
  });

  it('repairs invalid citations before streaming the final answer', async () => {
    retrieveGroundedEvidence.mockResolvedValue({
      bundles: [
        createBundle(),
        createBundle({
          bundleKey: 'segment:seg_2',
          candidateKey: 'segment:seg_2',
          exactQuotes: [
            'Bring the passport and old ID card to the appointment for verification, keep the printed confirmation page with your renewal code, and carry the supporting travel documents because the office may ask for them during the identity review.',
          ],
          fusionScore: 0.9,
          locators: [{ page: 2, segmentId: 'seg_2' }],
          rerankScore: 0.85,
          segmentIds: ['seg_2'],
          sourceItemId: 'src_2',
          sourceTitle: 'Renewal note',
        }),
      ],
      retrievalMeta: {
        fusedCandidateCount: 2,
        memoryHitsUsed: false,
        normalizationDegraded: false,
        primitiveCounts: {
          memory_text: 0,
          memory_vector: 0,
          segment_text: 2,
          segment_vector: 0,
        },
        rerankDegraded: false,
        retrievalQuery: 'travel prep',
        usedNormalizedQuery: false,
      },
    });
    generateGroundedAnswer.mockResolvedValue({
      answerMarkdown: 'Pack the charger [C99]. Bring your passport [C2].',
      responseModel: 'google/gemini-3.1-pro-preview',
    });
    repairGroundedAnswer.mockResolvedValue({
      answerMarkdown: 'Pack the charger [C1]. Bring your passport [C2].',
      responseModel: 'google/gemini-3.1-pro-preview',
    });

    const events = await collectEvents(
      askQuery({
        question: 'what should i bring?',
        userId: 'user_123',
      }),
    );

    expect(repairGroundedAnswer).toHaveBeenCalledTimes(1);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ phase: 'normalizing', type: 'status' }),
        expect.objectContaining({ phase: 'answering', type: 'status' }),
        expect.objectContaining({ type: 'answer_delta' }),
        expect.objectContaining({
          answerMarkdown: 'Pack the charger [C1]. Bring your passport [C2].',
          citations: expect.arrayContaining([
            expect.objectContaining({ citationId: 'C1' }),
            expect.objectContaining({ citationId: 'C2' }),
          ]),
          type: 'completed',
        }),
      ]),
    );
  });
});
