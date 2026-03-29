import { describe, expect, it } from 'vitest';

import * as retrieval from './index';

describe('retrieval feature barrel', () => {
  it('does not expose server-only service functions', () => {
    expect(retrieval).not.toHaveProperty('retrieveGroundedEvidence');
  });
});
