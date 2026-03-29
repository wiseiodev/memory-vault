import 'server-only';

import { gateway, generateText, Output } from 'ai';
import { z } from 'zod';

const webExtractionSchema = z.object({
  confidence: z.number().min(0).max(1).nullable().optional(),
  languageCode: z.string().trim().min(2).max(16).nullable().optional(),
  pages: z
    .array(
      z.object({
        content: z.string().trim().min(1),
        pageNumber: z.number().int().positive().nullable().optional(),
      }),
    )
    .min(1),
  reason: z.string().trim().min(1).nullable().optional(),
  title: z.string().trim().min(1).nullable().optional(),
});

export type AiExtractedContent = z.infer<typeof webExtractionSchema>;

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

export async function extractHardWebPageWithAi(input: {
  html?: string | null;
  title: string | null;
  url: string;
}) {
  readRequiredAiGatewayApiKey();
  const primaryModel = 'google/gemini-3.1-pro-preview';
  const fallbackModels = ['openai/gpt-5', 'anthropic/claude-sonnet-4.6'] as [
    string,
    ...string[],
  ];
  const providerRoute = buildProviderRoute({
    fallbackModels,
    primaryModel,
  });

  const result = await generateText({
    model: gateway(primaryModel),
    output: Output.object({
      schema: webExtractionSchema,
    }),
    providerOptions: baseProviderOptions({
      fallbackModels,
      metadata: {
        capability: 'web-extraction',
        sourceKind: 'web_page',
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
              'Extract the main readable content from this captured web page.',
              'Do not summarize.',
              'Preserve source order.',
              'Remove navigation, repeated boilerplate, and ads.',
              'Return a single page entry unless the source clearly contains multiple page sections.',
              `URL: ${input.url}`,
              input.title ? `Captured title: ${input.title}` : null,
              input.html
                ? ['', 'Captured HTML:', input.html]
                : [
                    '',
                    'No HTML snapshot was available from the deterministic fetch path.',
                    'Use the URL as the source of truth when producing the structured extraction.',
                  ],
            ]
              .flat()
              .filter(Boolean)
              .join('\n'),
          },
        ],
      },
    ],
  });

  return {
    model: primaryModel,
    output: result.output,
    providerMetadata: result.providerMetadata,
    providerRoute,
  };
}

export async function extractImageWithAi(input: {
  bytes: Uint8Array;
  mediaType: string;
  title: string | null;
}) {
  readRequiredAiGatewayApiKey();
  const primaryModel = 'google/gemini-3-flash';
  const fallbackModels = [
    'openai/gpt-5-mini',
    'anthropic/claude-sonnet-4.6',
  ] as [string, ...string[]];
  const providerRoute = buildProviderRoute({
    fallbackModels,
    primaryModel,
  });

  const result = await generateText({
    model: gateway(primaryModel),
    output: Output.object({
      schema: webExtractionSchema,
    }),
    providerOptions: baseProviderOptions({
      fallbackModels,
      metadata: {
        capability: 'image-ocr',
        sourceKind: 'file',
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
              'Read this image and extract the visible text exactly as faithfully as possible.',
              'Do not summarize.',
              'Preserve the top-to-bottom reading order.',
              input.title ? `Title hint: ${input.title}` : null,
            ]
              .filter(Boolean)
              .join('\n'),
          },
          {
            image: input.bytes,
            mediaType: input.mediaType,
            type: 'image',
          },
        ],
      },
    ],
  });

  return {
    model: primaryModel,
    output: result.output,
    providerMetadata: result.providerMetadata,
    providerRoute,
  };
}

export async function extractScannedPdfWithAi(input: {
  bytes: Uint8Array;
  title: string | null;
}) {
  readRequiredAiGatewayApiKey();
  const primaryModel = 'google/gemini-3-flash';
  const fallbackModels = [
    'openai/gpt-5-mini',
    'anthropic/claude-sonnet-4.6',
  ] as [string, ...string[]];
  const providerRoute = buildProviderRoute({
    fallbackModels,
    primaryModel,
  });

  const result = await generateText({
    model: gateway(primaryModel),
    output: Output.object({
      schema: webExtractionSchema,
    }),
    providerOptions: baseProviderOptions({
      fallbackModels,
      metadata: {
        capability: 'pdf-ocr',
        sourceKind: 'file',
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
              'Extract the text from this PDF.',
              'Preserve page ordering.',
              'Return one page entry per page when page boundaries are apparent.',
              'Do not summarize or invent missing text.',
              input.title ? `Title hint: ${input.title}` : null,
            ]
              .filter(Boolean)
              .join('\n'),
          },
          {
            data: input.bytes,
            mediaType: 'application/pdf',
            type: 'file',
          },
        ],
      },
    ],
  });

  return {
    model: primaryModel,
    output: result.output,
    providerMetadata: result.providerMetadata,
    providerRoute,
  };
}
