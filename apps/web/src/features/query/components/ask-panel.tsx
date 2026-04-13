'use client';

import Link from 'next/link';
import { startTransition, useMemo, useState } from 'react';

import { rpc } from '@/rpc/client';
import type { AskQueryEvent } from '../schemas';

type SpaceOption = {
  id: string;
  name: string;
};

type AskPanelProps = {
  spaces: SpaceOption[];
};

type CompletedEvent = Extract<AskQueryEvent, { type: 'completed' }>;
type AbstainedEvent = Extract<AskQueryEvent, { type: 'abstained' }>;
type StatusEvent = Extract<AskQueryEvent, { type: 'status' }>;

type AskState = {
  answerText: string;
  citations: CompletedEvent['citations'];
  error: string | null;
  isPending: boolean;
  outcome: 'abstained' | 'answered' | null;
  phase: StatusEvent['phase'] | null;
  reason: AbstainedEvent['reason'] | null;
  sourceReferences: CompletedEvent['sourceReferences'];
};

const INITIAL_STATE: AskState = {
  answerText: '',
  citations: [],
  error: null,
  isPending: false,
  outcome: null,
  phase: null,
  reason: null,
  sourceReferences: [],
};

const PHASE_LABELS: Record<StatusEvent['phase'], string> = {
  answering: 'Generating answer…',
  normalizing: 'Parsing your question…',
  reranking: 'Reranking candidates…',
  retrieving: 'Retrieving grounded evidence…',
};

const ABSTAIN_REASON_LABELS: Record<AbstainedEvent['reason'], string> = {
  generation_validation_failed:
    'The model produced an answer that did not pass grounding validation.',
  no_grounded_evidence:
    'No grounded evidence was found for this question in your memory.',
  weak_evidence:
    'The evidence was too weak to build a trustworthy answer. Try rephrasing or narrowing the space.',
};

function renderAnswerMarkdown(markdown: string) {
  const lines = markdown.split('\n');
  return lines.map((line, index) => (
    <p key={`${index}-${line}`} className='text-sm leading-7 text-slate-800'>
      {line}
    </p>
  ));
}

export function AskPanel({ spaces }: AskPanelProps) {
  const [state, setState] = useState<AskState>(INITIAL_STATE);
  const [question, setQuestion] = useState('');
  const [spaceId, setSpaceId] = useState<string>('');

  const citationsById = useMemo(() => {
    const map = new Map<string, CompletedEvent['citations'][number]>();
    for (const citation of state.citations) {
      map.set(citation.citationId, citation);
    }
    return map;
  }, [state.citations]);

  function handleSubmit() {
    if (!question.trim()) {
      setState((prev) => ({ ...prev, error: 'Ask a question first.' }));
      return;
    }

    setState({
      ...INITIAL_STATE,
      isPending: true,
    });

    startTransition(async () => {
      try {
        const iterator = await rpc.query.ask({
          capturedAfter: undefined,
          capturedBefore: undefined,
          question,
          spaceId: spaceId || undefined,
        });

        for await (const event of iterator) {
          if (event.type === 'status') {
            setState((prev) => ({ ...prev, phase: event.phase }));
          } else if (event.type === 'answer_delta') {
            setState((prev) => ({
              ...prev,
              answerText: prev.answerText + event.text,
            }));
          } else if (event.type === 'completed') {
            setState((prev) => ({
              ...prev,
              answerText: event.answerMarkdown,
              citations: event.citations,
              isPending: false,
              outcome: 'answered',
              phase: null,
              sourceReferences: event.sourceReferences,
            }));
          } else if (event.type === 'abstained') {
            setState((prev) => ({
              ...prev,
              answerText: event.message,
              citations: event.citations,
              isPending: false,
              outcome: 'abstained',
              phase: null,
              reason: event.reason,
              sourceReferences: event.sourceReferences,
            }));
          }
        }
      } catch (askError) {
        setState((prev) => ({
          ...prev,
          error:
            askError instanceof Error
              ? askError.message
              : 'Ask request failed unexpectedly.',
          isPending: false,
          phase: null,
        }));
      }
    });
  }

  return (
    <div className='space-y-6'>
      <section className='rounded-3xl border border-slate-200/80 bg-white/90 p-5'>
        <div className='space-y-3'>
          <label className='block space-y-2'>
            <span className='block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500'>
              Ask your memory
            </span>
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder='What did I save about the Japan trip budget?'
              rows={3}
              className='block w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700'
            />
          </label>

          <label className='flex flex-wrap items-center gap-3'>
            <span className='text-xs font-semibold uppercase tracking-[0.18em] text-slate-500'>
              Space
            </span>
            <select
              value={spaceId}
              onChange={(event) => setSpaceId(event.target.value)}
              className='rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700'
            >
              <option value=''>All spaces</option>
              {spaces.map((space) => (
                <option key={space.id} value={space.id}>
                  {space.name}
                </option>
              ))}
            </select>
          </label>

          <div className='flex items-center justify-between gap-3 pt-1'>
            {state.error ? (
              <p className='text-sm text-red-600'>{state.error}</p>
            ) : (
              <p className='text-xs text-slate-500'>
                Answers only use content you have saved, and every claim cites
                its source.
              </p>
            )}
            <button
              type='button'
              disabled={state.isPending}
              onClick={handleSubmit}
              className='inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60'
            >
              {state.isPending ? 'Asking…' : 'Ask'}
            </button>
          </div>
        </div>
      </section>

      {state.phase ? (
        <p className='text-sm text-slate-600'>{PHASE_LABELS[state.phase]}</p>
      ) : null}

      {state.outcome || state.answerText ? (
        <section className='rounded-3xl border border-slate-200/80 bg-white/90 p-5'>
          <h3 className='text-sm font-semibold uppercase tracking-[0.18em] text-slate-500'>
            {state.outcome === 'abstained' ? 'No grounded answer' : 'Answer'}
          </h3>
          <div className='mt-3 space-y-2'>
            {renderAnswerMarkdown(state.answerText)}
          </div>
          {state.outcome === 'abstained' && state.reason ? (
            <p className='mt-3 rounded-2xl border border-amber-200/70 bg-amber-50/80 p-3 text-xs text-amber-900'>
              {ABSTAIN_REASON_LABELS[state.reason]}
            </p>
          ) : null}
        </section>
      ) : null}

      {state.sourceReferences.length > 0 ? (
        <section className='rounded-3xl border border-slate-200/80 bg-white/90 p-5'>
          <h3 className='text-sm font-semibold uppercase tracking-[0.18em] text-slate-500'>
            Sources
          </h3>
          <ul className='mt-4 space-y-3'>
            {state.sourceReferences.map((source) => (
              <li
                key={source.sourceItemId}
                className='rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4'
              >
                <div className='flex flex-wrap items-start justify-between gap-2'>
                  <Link
                    href={`/app/items/${source.sourceItemId}`}
                    className='text-sm font-semibold text-slate-950 hover:underline'
                  >
                    {source.title ?? source.canonicalUri ?? source.sourceItemId}
                  </Link>
                  <span className='text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500'>
                    {source.sourceKind}
                  </span>
                </div>
                {source.canonicalUri ? (
                  <a
                    href={source.canonicalUri}
                    rel='noreferrer noopener'
                    target='_blank'
                    className='mt-1 block break-all text-xs text-sky-700 hover:underline'
                  >
                    {source.canonicalUri}
                  </a>
                ) : null}
                <p className='mt-2 text-xs text-slate-500'>
                  Cited as {source.citationIds.join(', ')}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {state.citations.length > 0 ? (
        <section className='rounded-3xl border border-slate-200/80 bg-white/90 p-5'>
          <h3 className='text-sm font-semibold uppercase tracking-[0.18em] text-slate-500'>
            Citation evidence
          </h3>
          <ul className='mt-4 space-y-3'>
            {state.citations.map((citation) => {
              const matching = citationsById.get(citation.citationId);
              const quote = matching?.exactQuotes?.[0];
              return (
                <li
                  key={citation.citationId}
                  className='rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4'
                >
                  <div className='flex flex-wrap items-start justify-between gap-2'>
                    <span className='text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500'>
                      {citation.citationId} · {citation.evidenceKind}
                    </span>
                    <span className='text-[11px] text-slate-500'>
                      rerank {citation.retrievalMeta.rerankScore.toFixed(2)}
                    </span>
                  </div>
                  {quote ? (
                    <blockquote className='mt-2 border-l-2 border-slate-300 pl-3 text-sm italic leading-6 text-slate-700'>
                      “{quote}”
                    </blockquote>
                  ) : null}
                  <Link
                    href={`/app/items/${citation.sourceItemId}`}
                    className='mt-2 inline-block text-xs text-sky-700 hover:underline'
                  >
                    {citation.sourceTitle ?? citation.sourceItemId}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
