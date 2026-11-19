// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SENTENCE AN AGENT MADE BY THE START A NEW AGENT PRESS CARRIES AS ITS SUMMARY, IN THE READER'S LANGUAGE.
 * Wave 13k round 39, piece 4.
 *
 * src/server/lib/worker.ts stores it in English when the press makes the agent, and writes the facts beside it
 * (`data.branchedFrom`, type BranchedFrom in src/shared/kinds/agent.ts). A Chinese page drew the English. A page now
 * draws the sentence from those facts in its own language, naming the old agent by the name the registry holds.
 *
 * ONLY WHERE THE STORED SUMMARY IS STILL THE SENTENCE THE PRESS WROTE. A summary somebody rewrote is theirs and is
 * drawn as written. The stored English and the sentence a page recognises come from one word (invariant 9), so a
 * change to the words cannot leave the page unable to recognise what the server stores.
 */

import { sayInEnglish, type Say } from './i18n.ts'
import { wordWithSpacedValues } from './spacing.ts'

/** The agent a branched agent was branched from, as stored. */
export interface BranchedFrom {
  agent: string
  handle: string
}

/** `data.branchedFrom` when it holds both strings, or null. */
export function branchedFromIn(data: Readonly<Record<string, unknown>>): BranchedFrom | null {
  const stored = data['branchedFrom']
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return null
  const { agent, handle } = stored as Record<string, unknown>
  return typeof agent === 'string' && agent !== '' && typeof handle === 'string' && handle !== '' ? { agent, handle } : null
}

/** The sentence, in the language of `say`. `name` is the old agent's name, or null where nobody holds one. */
export function theBranchedSummary(say: Say, handle: string, name: string | null): string {
  const who =
    name === null || name.trim() === '' || name.trim() === handle
      ? say('agentBranched.byHandle', { handle })
      : wordWithSpacedValues(say, 'agentBranched.byName', { name: name.trim(), handle })
  return wordWithSpacedValues(say, 'agentBranched.summary', { who })
}

/** The English the server stores as the new agent's summary. */
export function theStoredBranchedSummary(handle: string): string {
  return theBranchedSummary(sayInEnglish, handle, null)
}

/**
 * THE SUMMARY A PAGE DRAWS FOR A BRANCHED AGENT, or null because the record is not one or its summary was rewritten.
 * `nameOf` answers the old agent's name from its registry id, or null.
 */
export function theBranchedSummaryOnThePage(
  say: Say,
  record: { kind: string; summary: string | null; data: Readonly<Record<string, unknown>> },
  nameOf: (agent: string) => string | null,
): string | null {
  if (record.kind !== 'agent') return null
  const from = branchedFromIn(record.data)
  if (from === null || record.summary !== theStoredBranchedSummary(from.handle)) return null
  return theBranchedSummary(say, from.handle, nameOf(from.agent))
}
