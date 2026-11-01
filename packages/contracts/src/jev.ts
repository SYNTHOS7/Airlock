import { z } from 'zod';
import { DispositionEnum, type Disposition } from './disposition.js';

export const JevIntentMatchSchema = z.enum(['yes', 'no', 'unclear']);
export type JevIntentMatch = z.infer<typeof JevIntentMatchSchema>;

export const JevAmbiguitySchema = z.enum(['low', 'medium', 'high']);
export type JevAmbiguity = z.infer<typeof JevAmbiguitySchema>;

export const JevRouteSchema = z.enum(['proceed', 'inspect', 'verify_outcome', 'human_review', 'refuse']);
export type JevRoute = z.infer<typeof JevRouteSchema>;

export const JevSignalsSchema = z.object({
  intent_match: JevIntentMatchSchema,
  injection_suspected: z.boolean(),
  ambiguity: JevAmbiguitySchema,
  route: JevRouteSchema,
  explanation: z.string().optional(),
});

export type JevSignals = z.infer<typeof JevSignalsSchema>;

export const JevStatusSchema = z.enum(['ran', 'unavailable', 'invalid']);
export type JevStatus = z.infer<typeof JevStatusSchema>;

export const JevDecisionPayloadSchema = z.object({
  status: JevStatusSchema,
  signals: JevSignalsSchema.optional(),
  error: z.string().optional(),
});

export type JevDecisionPayload = z.infer<typeof JevDecisionPayloadSchema>;

/**
 * Maps advisory Jev signals to a minimum disposition.
 * Remember the monotonic rule: Jev can ONLY tighten the disposition, never loosen it.
 */
export function mapJevSignalsToDisposition(signals: JevSignals): Disposition {
  // If prompt injection or adversarial steering is detected -> PAUSE_REVIEW
  if (signals.injection_suspected) {
    return DispositionEnum.PAUSE_REVIEW;
  }

  // If the unstructured text does not match the structured intent -> PAUSE_REVIEW
  if (signals.intent_match === 'no' || signals.intent_match === 'unclear') {
    return DispositionEnum.PAUSE_REVIEW;
  }

  // Refusal or human review recommended by Jev maps to PAUSE_REVIEW (human decides)
  if (signals.route === 'refuse' || signals.route === 'human_review') {
    return DispositionEnum.PAUSE_REVIEW;
  }

  // If verification is recommended because outcome is unknown
  if (signals.route === 'verify_outcome') {
    return DispositionEnum.PAUSE_REVIEW;
  }

  // High ambiguity or inspection needed -> REQUIRE_APPROVAL
  if (signals.ambiguity === 'high' || signals.route === 'inspect') {
    return DispositionEnum.REQUIRE_APPROVAL;
  }

  return DispositionEnum.ALLOW;
}

