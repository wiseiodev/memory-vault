import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { createScorer, evalite } from 'evalite';

import {
  extractHardWebPageWithAi,
  extractImageWithAi,
  extractScannedPdfWithAi,
} from '../src/lib/ai/extraction';

type EvalCase =
  | {
      expectedPhrases: string[];
      expectedTitle: string | null;
      fixturePath: string;
      type: 'image';
    }
  | {
      expectedPhrases: string[];
      expectedTitle: string | null;
      fixturePath: string;
      type: 'pdf';
    }
  | {
      expectedPhrases: string[];
      expectedTitle: string | null;
      fixturePath: string;
      type: 'web';
      url: string;
    };

const fixture = (name: string) =>
  path.join(process.cwd(), 'evals', 'fixtures', name);

if (!process.env.AI_GATEWAY_API_KEY) {
  throw new Error(
    'AI_GATEWAY_API_KEY is required to run extraction fallback evals.',
  );
}

const hasExpectedTitle = createScorer<
  EvalCase,
  Awaited<ReturnType<typeof runTask>>
>({
  name: 'expected-title',
  scorer: ({ input, output }) => {
    if (!input.expectedTitle) {
      return 1;
    }

    return output.title?.includes(input.expectedTitle) ? 1 : 0;
  },
});

const preservesAnchorPhrases = createScorer<
  EvalCase,
  Awaited<ReturnType<typeof runTask>>
>({
  name: 'anchor-phrases',
  scorer: ({ input, output }) => {
    const haystack = output.pages.map((page) => page.content).join('\n');
    const matchedPhrases = input.expectedPhrases.filter((phrase) =>
      haystack.includes(phrase),
    );

    return matchedPhrases.length / input.expectedPhrases.length;
  },
});

const returnsNonEmptyOutput = createScorer<
  EvalCase,
  Awaited<ReturnType<typeof runTask>>
>({
  name: 'non-empty-output',
  scorer: ({ output }) => {
    const content = output.pages.map((page) => page.content.trim()).join('');
    return content.length > 0 ? 1 : 0;
  },
});

const preservesPageOrdering = createScorer<
  EvalCase,
  Awaited<ReturnType<typeof runTask>>
>({
  name: 'page-ordering',
  scorer: ({ input, output }) => {
    if (input.type === 'web') {
      return 1;
    }

    const pageNumbers = output.pages
      .map((page) => page.pageNumber)
      .filter(
        (pageNumber): pageNumber is number => typeof pageNumber === 'number',
      );

    if (pageNumbers.length <= 1) {
      return 1;
    }

    const isOrdered = pageNumbers.every((pageNumber, index) => {
      const previousPageNumber = pageNumbers[index - 1];
      return index === 0 || previousPageNumber === undefined
        ? true
        : pageNumber >= previousPageNumber;
    });

    return isOrdered ? 1 : 0;
  },
});

async function runTask(input: EvalCase) {
  if (input.type === 'web') {
    const html = await readFile(input.fixturePath, 'utf8');
    const result = await extractHardWebPageWithAi({
      html,
      title: input.expectedTitle,
      url: input.url,
    });

    return result.output;
  }

  const bytes = new Uint8Array(await readFile(input.fixturePath));

  if (input.type === 'image') {
    const result = await extractImageWithAi({
      bytes,
      mediaType: 'image/png',
      title: input.expectedTitle,
    });

    return result.output;
  }

  const result = await extractScannedPdfWithAi({
    bytes,
    title: input.expectedTitle,
  });

  return result.output;
}

evalite('fallback extraction quality', {
  data: [
    {
      expected: undefined,
      input: {
        expectedPhrases: [
          'Project Delta update',
          'Budget sign-off is still pending',
        ],
        expectedTitle: 'Weekly Project Delta Update',
        fixturePath: fixture('hard-web-page.html'),
        type: 'web',
        url: 'https://example.com/internal/project-delta',
      },
    },
    {
      expected: undefined,
      input: {
        expectedPhrases: [
          'Passport renewal due April 18',
          'Bring ID and old passport',
        ],
        expectedTitle: 'Passport renewal reminder',
        fixturePath: fixture('ocr-note.png'),
        type: 'image',
      },
    },
    {
      expected: undefined,
      input: {
        expectedPhrases: [
          'Passport renewal due April 18',
          'Bring ID and old passport',
        ],
        expectedTitle: 'Passport renewal reminder',
        fixturePath: fixture('scanned-note.pdf'),
        type: 'pdf',
      },
    },
  ],
  scorers: [
    returnsNonEmptyOutput,
    hasExpectedTitle,
    preservesAnchorPhrases,
    preservesPageOrdering,
  ],
  task: runTask,
});
