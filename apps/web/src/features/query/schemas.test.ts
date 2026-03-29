import { describe, expect, it } from 'vitest';

import { askQueryInput } from './schemas';

describe('askQueryInput', () => {
  it('accepts ISO datetime strings and normalizes them to Date values', () => {
    const parsed = askQueryInput.parse({
      capturedAfter: '2026-03-29T10:00:00.000Z',
      capturedBefore: '2026-03-29T12:00:00.000Z',
      question: 'what happened?',
    });

    expect(parsed.capturedAfter).toEqual(new Date('2026-03-29T10:00:00.000Z'));
    expect(parsed.capturedBefore).toEqual(new Date('2026-03-29T12:00:00.000Z'));
  });

  it('accepts Date inputs', () => {
    const capturedAfter = new Date('2026-03-29T10:00:00.000Z');
    const parsed = askQueryInput.parse({
      capturedAfter,
      question: 'what happened?',
    });

    expect(parsed.capturedAfter).toEqual(capturedAfter);
  });

  it('treats empty optional date inputs as unset', () => {
    const parsed = askQueryInput.parse({
      capturedAfter: '',
      capturedBefore: '',
      question: 'what happened?',
    });

    expect(parsed.capturedAfter).toBeUndefined();
    expect(parsed.capturedBefore).toBeUndefined();
  });

  it('rejects ambiguous date-only strings', () => {
    expect(() =>
      askQueryInput.parse({
        capturedAfter: '2026-03-29',
        question: 'what happened?',
      }),
    ).toThrow();
  });

  it('rejects invalid date strings', () => {
    expect(() =>
      askQueryInput.parse({
        capturedAfter: 'yesterday afternoon',
        question: 'what happened?',
      }),
    ).toThrow();
  });

  it('rejects reversed ranges after coercion', () => {
    expect(() =>
      askQueryInput.parse({
        capturedAfter: '2026-03-29T12:00:00.000Z',
        capturedBefore: '2026-03-29T10:00:00.000Z',
        question: 'what happened?',
      }),
    ).toThrow();
  });
});
