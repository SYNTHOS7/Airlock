import { describe, it, expect } from 'vitest';
import {
  mapJevSignalsToDisposition,
  JevSignalsSchema,
  type JevSignals,
} from '../jev.js';
import { DispositionEnum } from '../disposition.js';

describe('Contracts: Jev Signals and Tightening Map', () => {
  it('maps benign signals to ALLOW', () => {
    const signals: JevSignals = {
      intent_match: 'yes',
      injection_suspected: false,
      ambiguity: 'low',
      route: 'proceed',
    };
    expect(mapJevSignalsToDisposition(signals)).toBe(DispositionEnum.ALLOW);
  });

  it('maps suspected prompt injection to PAUSE_REVIEW', () => {
    const signals: JevSignals = {
      intent_match: 'yes',
      injection_suspected: true,
      ambiguity: 'low',
      route: 'proceed',
    };
    expect(mapJevSignalsToDisposition(signals)).toBe(DispositionEnum.PAUSE_REVIEW);
  });

  it('maps intent mismatch to PAUSE_REVIEW', () => {
    const signals: JevSignals = {
      intent_match: 'no',
      injection_suspected: false,
      ambiguity: 'low',
      route: 'proceed',
    };
    expect(mapJevSignalsToDisposition(signals)).toBe(DispositionEnum.PAUSE_REVIEW);
  });

  it('maps high ambiguity to REQUIRE_APPROVAL', () => {
    const signals: JevSignals = {
      intent_match: 'yes',
      injection_suspected: false,
      ambiguity: 'high',
      route: 'proceed',
    };
    expect(mapJevSignalsToDisposition(signals)).toBe(DispositionEnum.REQUIRE_APPROVAL);
  });

  it('maps Jev refusal to PAUSE_REVIEW (human decides, prevents false hard denials)', () => {
    const signals: JevSignals = {
      intent_match: 'yes',
      injection_suspected: false,
      ambiguity: 'low',
      route: 'refuse',
    };
    expect(mapJevSignalsToDisposition(signals)).toBe(DispositionEnum.PAUSE_REVIEW);
  });

  it('validates signals against Zod schema', () => {
    const valid = {
      intent_match: 'yes',
      injection_suspected: false,
      ambiguity: 'medium',
      route: 'inspect',
    };
    expect(JevSignalsSchema.parse(valid)).toBeDefined();

    const invalid = {
      intent_match: 'definitely_yes', // invalid enum
      injection_suspected: 'no', // not a boolean
    };
    expect(() => JevSignalsSchema.parse(invalid)).toThrow();
  });
});

