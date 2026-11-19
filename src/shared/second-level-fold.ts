// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SECOND LEVEL OF A FLOW OR A DECISION, LEFT OUT UNTIL ASKED FOR.
 * `foldTheSecondLevel` was moved byte for byte out of src/server/lib/flow-reasons.ts, with no change of
 * behaviour, with what it reads: `SECOND_LEVEL_PARAM`, `SECOND_LEVEL_SHOW`, `Json`, `isObject`,
 * `SecondLevelHeld` and `counted`. That file re-exports the four it exported and imports `isObject` and
 * `Json` back, so those two gained the export word.
 */

import type { PanelRecord } from '@shared/types.ts'

/** The query parameter that asks for the second level, and the one value that asks for it. */
export const SECOND_LEVEL_PARAM = 'secondLevel'
export const SECOND_LEVEL_SHOW = 'show'

export type Json = Record<string, unknown>

export const isObject = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value)

/** What a reply left out, and how to ask for it. Present only on a kind that has a second level. */
export interface SecondLevelHeld {
  held: string[]
  ask: string
}

/** A count with its noun, so a notice says "1 record" and "2 records". */
function counted(n: number, one: string, many: string): string {
  return `${String(n)} ${n === 1 ? one : many}`
}

/**
 * THE SECOND LEVEL, LEFT OUT UNTIL ASKED FOR. What the office hands an agent gives
 * the main content first, and the reasons, sources, change record and basis when it
 * asks. Returns the record as handed
 * back and what was held, or the record unchanged and null on any other kind, or when the reader asked.
 */
export function foldTheSecondLevel(record: PanelRecord, asked: boolean, askPath: string): { record: PanelRecord; secondLevel: SecondLevelHeld | null } {
  if (asked || (record.kind !== 'flow' && record.kind !== 'decision')) return { record, secondLevel: null }
  const data = isObject(record.data) ? { ...record.data } : null
  if (data === null) return { record, secondLevel: null }
  const held: string[] = []
  if (record.kind === 'flow') {
    if (Array.isArray(data['stages'])) {
      const steps = data['stages'] as unknown[]
      const withSecond = steps.filter((step) => isObject(step) && ('why' in step || 'sources' in step)).length
      data['stages'] = steps.map((step) => {
        if (!isObject(step)) return step
        const { why: _why, sources: _sources, ...rest } = step
        return rest
      })
      held.push(`data.stages[].why and data.stages[].sources (${withSecond} of ${counted(steps.length, 'step', 'steps')} ${withSecond === 1 ? 'has' : 'have'} them)`)
    }
    if (Array.isArray(data['step_changes'])) held.push(`data.step_changes (${counted((data['step_changes'] as unknown[]).length, 'entry', 'entries')})`)
    delete data['step_changes']
  } else {
    if (Array.isArray(data['basis'])) held.push(`data.basis (${counted((data['basis'] as unknown[]).length, 'record', 'records')})`)
    delete data['basis']
  }
  const ask = `${askPath}${askPath.includes('?') ? '&' : '?'}${SECOND_LEVEL_PARAM}=${SECOND_LEVEL_SHOW}`
  return { record: { ...record, data }, secondLevel: { held, ask } }
}
