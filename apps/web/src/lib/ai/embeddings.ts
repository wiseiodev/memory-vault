import 'server-only';

import { embed, embedMany, gateway } from 'ai';

import { EMBEDDING_DIMENSIONS } from '@/db/columns';

export const SEGMENT_EMBEDDING_MODEL = 'google/gemini-embedding-2';

type EmbeddingTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

function readRequiredAiGatewayApiKey() {
  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      'Missing required environment variable: AI_GATEWAY_API_KEY.',
    );
  }

  return apiKey;
}

function baseProviderOptions(taskType: EmbeddingTaskType) {
  return {
    gateway: {
      metadata: {
        capability: 'segment-embedding',
        embeddingTaskType: taskType,
        sourceKind: 'segment',
      },
    },
    google: {
      outputDimensionality: EMBEDDING_DIMENSIONS,
      taskType,
    },
  };
}

function assertEmbeddingDimensions(embeddings: number[][]) {
  for (const embedding of embeddings) {
    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Expected embedding length ${EMBEDDING_DIMENSIONS}, received ${embedding.length}.`,
      );
    }
  }
}

export async function embedDocumentTextValues(input: { values: string[] }) {
  readRequiredAiGatewayApiKey();

  if (input.values.length === 0) {
    return {
      embeddings: [] as number[][],
      model: SEGMENT_EMBEDDING_MODEL,
    };
  }

  const result = await embedMany({
    model: gateway.embeddingModel(SEGMENT_EMBEDDING_MODEL),
    providerOptions: baseProviderOptions('RETRIEVAL_DOCUMENT'),
    values: input.values,
  });

  assertEmbeddingDimensions(result.embeddings);

  return {
    embeddings: result.embeddings,
    model: SEGMENT_EMBEDDING_MODEL,
  };
}

export async function embedQueryText(input: { value: string }) {
  readRequiredAiGatewayApiKey();

  const result = await embed({
    model: gateway.embeddingModel(SEGMENT_EMBEDDING_MODEL),
    providerOptions: baseProviderOptions('RETRIEVAL_QUERY'),
    value: input.value,
  });

  assertEmbeddingDimensions([result.embedding]);

  return {
    embedding: result.embedding,
    model: SEGMENT_EMBEDDING_MODEL,
  };
}
