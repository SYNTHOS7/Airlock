import { describe, it, expect } from 'vitest';
import {
  DispositionEnum,
  compareDispositions,
  mergeDispositions,
  isStricterThan,
  DISPOSITION_LEVEL,
} from '../disposition.js';

describe('Contracts: Disposition and Monotonic Strictness Order', () => {
  it('enforces the exact ordering: ALLOW < REQUIRE_APPROVAL < PAUSE_REVIEW < DENY', () => {
    expect(DISPOSITION_LEVEL[DispositionEnum.ALLOW]).toBeLessThan(
      DISPOSITION_LEVEL[DispositionEnum.REQUIRE_APPROVAL]
    );
    expect(DISPOSITION_LEVEL[DispositionEnum.REQUIRE_APPROVAL]).toBeLessThan(
      DISPOSITION_LEVEL[DispositionEnum.PAUSE_REVIEW]
    );
    expect(DISPOSITION_LEVEL[DispositionEnum.PAUSE_REVIEW]).toBeLessThan(
      DISPOSITION_LEVEL[DispositionEnum.DENY]
    );
  });

  it('correctly compares disposition levels with compareDispositions', () => {
    expect(compareDispositions(DispositionEnum.ALLOW, DispositionEnum.REQUIRE_APPROVAL)).toBe(-1);
    expect(compareDispositions(DispositionEnum.REQUIRE_APPROVAL, DispositionEnum.ALLOW)).toBe(1);
    expect(compareDispositions(DispositionEnum.DENY, DispositionEnum.DENY)).toBe(0);
    expect(compareDispositions(DispositionEnum.PAUSE_REVIEW, DispositionEnum.DENY)).toBe(-1);
  });

  it('evaluates isStricterThan correctly', () => {
    expect(isStricterThan(DispositionEnum.DENY, DispositionEnum.PAUSE_REVIEW)).toBe(true);
    expect(isStricterThan(DispositionEnum.PAUSE_REVIEW, DispositionEnum.REQUIRE_APPROVAL)).toBe(true);
    expect(isStricterThan(DispositionEnum.REQUIRE_APPROVAL, DispositionEnum.ALLOW)).toBe(true);
    expect(isStricterThan(DispositionEnum.ALLOW, DispositionEnum.DENY)).toBe(false);
  });

  describe('Monotonic mergeDispositions: max(a, b)', () => {
    it('never loosens an existing disposition', () => {
      // DENY + anything = DENY
      expect(mergeDispositions(DispositionEnum.DENY, DispositionEnum.ALLOW)).toBe(DispositionEnum.DENY);
      expect(mergeDispositions(DispositionEnum.ALLOW, DispositionEnum.DENY)).toBe(DispositionEnum.DENY);

      // PAUSE_REVIEW + REQUIRE_APPROVAL = PAUSE_REVIEW
      expect(
        mergeDispositions(DispositionEnum.PAUSE_REVIEW, DispositionEnum.REQUIRE_APPROVAL)
      ).toBe(DispositionEnum.PAUSE_REVIEW);

      // REQUIRE_APPROVAL + ALLOW = REQUIRE_APPROVAL
      expect(
        mergeDispositions(DispositionEnum.REQUIRE_APPROVAL, DispositionEnum.ALLOW)
      ).toBe(DispositionEnum.REQUIRE_APPROVAL);

      // ALLOW + ALLOW = ALLOW
      expect(mergeDispositions(DispositionEnum.ALLOW, DispositionEnum.ALLOW)).toBe(
        DispositionEnum.ALLOW
      );
    });

    it('proves the advisory model cannot downgrade an authoritative policy denial', () => {
      const policyDecision = DispositionEnum.DENY;
      const modelSuggestion = DispositionEnum.ALLOW; // Model says "proceed"
      const finalResult = mergeDispositions(policyDecision, modelSuggestion);
      expect(finalResult).toBe(DispositionEnum.DENY);
    });
  });
});

