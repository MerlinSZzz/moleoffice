// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A READINESS CHECKLIST, AS THE SERVER AND THE BROWSER BOTH NAME IT, at wave 13u
 * round 13.
 * The rule, the gated operations and the gate are in src/server/lib/readiness.ts.
 *
 * NOT THE CHECKLISTS OF src/shared/checklists.ts. Those are a person's or an agent's own lists of requests, ticked with
 * evidence. A readiness checklist belongs to one operation, its signers are worked out by the office, and the
 * operation runs only when every one of them has signed. Nothing of one is stored in the other.
 *
 * NOTHING HERE TOUCHES THE DATABASE, because the browser imports it.
 */

/** The kind a readiness checklist is listed as on Needs you. Its id is not a record's: it lives in its own table. */
export const READINESS_CHECKLIST = 'readiness checklist'

/**
 * HOW FAR AN OPERATION REACHES, the three levels of a decision.
 * `itself` is an operation that affects only
 * whoever asks for it, and it needs no checklist, so no checklist is ever stored at that level.
 */
export const READINESS_LEVELS = ['itself', 'a-group', 'everyone'] as const
export type ReadinessLevel = (typeof READINESS_LEVELS)[number]

/**
 * Where a checklist stands. `running` is everyone signed and the office is running it now. `could-not` is everyone
 * signed and the operation could not run; `outcome` says why.
 */
export const READINESS_STATES = ['waiting', 'running', 'ran', 'could-not', 'cancelled', 'expired'] as const
export type ReadinessState = (typeof READINESS_STATES)[number]

/** Why the office put a signer on a checklist. */
export const WHY_A_SIGNER = ['the-person', 'a-secretary', 'the-highest-affected'] as const
export type WhyASigner = (typeof WHY_A_SIGNER)[number]

/** One signer the office worked out, and why. */
export interface AReadinessSigner {
  kind: 'person' | 'agent'
  id: string
  why: WhyASigner
}

/** One signer as a checklist is read: who, whether they have signed, and when. */
export interface AReadinessSignerNow extends AReadinessSigner {
  /** The signer's handle or name, where the office knows one. */
  name: string | null
  /** When the standing signature was given, or null while this signer has not signed. */
  signedAt: string | null
}
