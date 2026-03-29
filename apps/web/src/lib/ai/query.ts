import 'server-only';

import { gateway, generateText, Output } from 'ai';
import { z } from 'zod';

const normalizationSchema = z.object({
  normalizedQuery: z.string().trim().min(1),
});

const rerankSchema = z.object({
  results: z.array(
    z.object({
      candidateKey: z.string().trim().min(1),
      rationale: z.string().trim().min(1).nullable().optional(),
      score: z.number().min(0).max(1),
    }),
  ),
});

const NORMALIZATION_PRIMARY_MODEL = 'google/gemini-3-flash';
const NORMALIZATION_FALLBACK_MODELS = [
  'openai/gpt-5-mini',
  'anthropic/claude-sonnet-4.6',
] as [string, ...string[]];

const ANSWER_PRIMARY_MODEL = 'google/gemini-3.1-pro-preview';
const ANSWER_FALLBACK_MODELS = [
  'openai/gpt-5',
  'anthropic/claude-sonnet-4.6',
] as [string, ...string[]];

function readRequiredAiGatewayApiKey() {
  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      'Missing required environment variable: AI_GATEWAY_API_KEY.',
    );
  }

  return apiKey;
}

function baseProviderOptions(input: {
  fallbackModels: [string, ...string[]];
  metadata: Record<string, string>;
}) {
  return {
    gateway: {
      metadata: input.metadata,
      models: input.fallbackModels,
      order: ['google', 'openai', 'anthropic'],
    },
  };
}

function buildProviderRoute(input: {
  fallbackModels: [string, ...string[]];
  primaryModel: string;
}) {
  return [input.primaryModel, ...input.fallbackModels];
}

function resolveResponseModel(input: {
  primaryModel: string;
  result: Awaited<ReturnType<typeof generateText>>;
}) {
  return input.result.response.modelId || input.primaryModel;
}

export async function normalizeQueryText(input: { question: string }) {
  readRequiredAiGatewayApiKey();
  const providerRoute = buildProviderRoute({
    fallbackModels: NORMALIZATION_FALLBACK_MODELS,
    primaryModel: NORMALIZATION_PRIMARY_MODEL,
  });

  const result = await generateText({
    model: gateway(NORMALIZATION_PRIMARY_MODEL),
    output: Output.object({
      schema: normalizationSchema,
    }),
    providerOptions: baseProviderOptions({
      fallbackModels: NORMALIZATION_FALLBACK_MODELS,
      metadata: {
        capability: 'query-normalization',
      },
    }),
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: [
              'Rewrite this user question only to improve retrieval recall.',
              'Do not add filters, facts, or assumptions.',
              'Return one concise normalized query.',
              '',
              input.question,
            ].join('\n'),
          },
        ],
      },
    ],
  });

  return {
    configuredModel: NORMALIZATION_PRIMARY_MODEL,
    normalizedQuery: result.output.normalizedQuery,
    providerRoute,
    responseModel: resolveResponseModel({
      primaryModel: NORMALIZATION_PRIMARY_MODEL,
      result,
    }),
  };
}

export async function rerankRetrievalCandidates(input: {
  candidates: Array<{
    candidateKey: string;
    canonicalUri: string | null;
    excerpt: string;
    memorySummary: string | null;
    sourceKind: string;
    title: string | null;
  }>;
  question: string;
}) {
  readRequiredAiGatewayApiKey();
  const providerRoute = buildProviderRoute({
    fallbackModels: NORMALIZATION_FALLBACK_MODELS,
    primaryModel: NORMALIZATION_PRIMARY_MODEL,
  });

  const result = await generateText({
    model: gateway(NORMALIZATION_PRIMARY_MODEL),
    output: Output.object({
      schema: rerankSchema,
    }),
    providerOptions: baseProviderOptions({
      fallbackModels: NORMALIZATION_FALLBACK_MODELS,
      metadata: {
        capability: 'query-rerank',
      },
    }),
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: [
              'Score each candidate for how directly it helps answer the question.',
              'Use only the provided evidence.',
              'Return one score between 0 and 1 for every candidate.',
              '',
              `Question: ${input.question}`,
              '',
              `Candidates: ${JSON.stringify(input.candidates)}`,
            ].join('\n'),
          },
        ],
      },
    ],
  });

  return {
    configuredModel: NORMALIZATION_PRIMARY_MODEL,
    providerRoute,
    responseModel: resolveResponseModel({
      primaryModel: NORMALIZATION_PRIMARY_MODEL,
      result,
    }),
    results: result.output.results,
  };
}

export async function generateGroundedAnswer(input: {
  bundles: Array<{
    canonicalUri: string | null;
    citationId: string;
    exactQuotes: string[];
    provenance: string;
  }>;
  question: string;
}) {
  readRequiredAiGatewayApiKey();
  const providerRoute = buildProviderRoute({
    fallbackModels: ANSWER_FALLBACK_MODELS,
    primaryModel: ANSWER_PRIMARY_MODEL,
  });

  const result = await generateText({
    model: gateway(ANSWER_PRIMARY_MODEL),
    providerOptions: baseProviderOptions({
      fallbackModels: ANSWER_FALLBACK_MODELS,
      metadata: {
        capability: 'grounded-answer',
      },
    }),
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: [
              'Answer the user question using only the evidence bundles below.',
              'Every substantive sentence must include one or more citations in [C#] form.',
              'Use only citation ids that appear in the provided evidence.',
              'If the evidence is insufficient, answer with exactly: Unable to answer from the available evidence.',
              '',
              `Question: ${input.question}`,
              '',
              `Evidence: ${JSON.stringify(input.bundles)}`,
            ].join('\n'),
          },
        ],
      },
    ],
  });

  return {
    answerMarkdown: result.text.trim(),
    configuredModel: ANSWER_PRIMARY_MODEL,
    providerRoute,
    responseModel: resolveResponseModel({
      primaryModel: ANSWER_PRIMARY_MODEL,
      result,
    }),
  };
}

export async function repairGroundedAnswer(input: {
  answerMarkdown: string;
  allowedCitationIds: string[];
  question: string;
}) {
  readRequiredAiGatewayApiKey();
  const providerRoute = buildProviderRoute({
    fallbackModels: ANSWER_FALLBACK_MODELS,
    primaryModel: ANSWER_PRIMARY_MODEL,
  });

  const result = await generateText({
    model: gateway(ANSWER_PRIMARY_MODEL),
    providerOptions: baseProviderOptions({
      fallbackModels: ANSWER_FALLBACK_MODELS,
      metadata: {
        capability: 'grounded-answer-repair',
      },
    }),
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: [
              'Repair this grounded answer so that every citation uses only the allowed ids.',
              'Do not add new factual claims.',
              'If the answer cannot be repaired faithfully, return exactly: Unable to answer from the available evidence.',
              '',
              `Question: ${input.question}`,
              `Allowed citation ids: ${input.allowedCitationIds.join(', ')}`,
              '',
              input.answerMarkdown,
            ].join('\n'),
          },
        ],
      },
    ],
  });

  return {
    answerMarkdown: result.text.trim(),
    configuredModel: ANSWER_PRIMARY_MODEL,
    providerRoute,
    responseModel: resolveResponseModel({
      primaryModel: ANSWER_PRIMARY_MODEL,
      result,
    }),
  };
}
