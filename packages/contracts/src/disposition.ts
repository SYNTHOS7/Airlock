import { z } from 'zod';

/**
 * Disposition reflects the decision class of Airlock's policy evaluation.
 * Ordered strictly from least strict to most strict:
 * ALLOW < REQUIRE_APPROVAL < PAUSE_REVIEW < DENY
 */
export const DispositionEnum = {
  ALLOW: 'ALLOW',
  REQUIRE_APPROVAL: 'REQUIRE_APPROVAL',
  PAUSE_REVIEW: 'PAUSE_REVIEW',
  DENY: 'DENY',
} as const;

export type Disposition = (typeof DispositionEnum)[keyof typeof DispositionEnum];

export const DispositionSchema = z.enum([
  DispositionEnum.ALLOW,
  DispositionEnum.REQUIRE_APPROVAL,
  DispositionEnum.PAUSE_REVIEW,
  DispositionEnum.DENY,
]);

/**
 * Numeric strictness level for monotonic comparison:
 * Higher value means stricter disposition.
 */
export const DISPOSITION_LEVEL: Record<Disposition, number> = {
  [DispositionEnum.ALLOW]: 0,
  [DispositionEnum.REQUIRE_APPROVAL]: 1,
  [DispositionEnum.PAUSE_REVIEW]: 2,
  [DispositionEnum.DENY]: 3,
};

/**
 * Compares two dispositions according to strictness order:
 * Returns -1 if a is less strict than b
 * Returns 0 if a and b have equal strictness
 * Returns 1 if a is stricter than b
 */
export function compareDispositions(a: Disposition, b: Disposition): number {
  const levelA = DISPOSITION_LEVEL[a];
  const levelB = DISPOSITION_LEVEL[b];
  if (levelA < levelB) return -1;
  if (levelA > levelB) return 1;
  return 0;
}

/**
 * Monotonic Tighten-Only merge:
 * Returns the stricter of two dispositions.
 * Guarantees that an advisory model (Jev) or secondary rule can only
 * escalate strictness, never loosen an existing decision.
 */
export function mergeDispositions(a: Disposition, b: Disposition): Disposition {
  return DISPOSITION_LEVEL[a] >= DISPOSITION_LEVEL[b] ? a : b;
}

/**
 * Returns true if disposition `a` is strictly stricter than `b`.
 */
export function isStricterThan(a: Disposition, b: Disposition): boolean {
  return DISPOSITION_LEVEL[a] > DISPOSITION_LEVEL[b];
}

