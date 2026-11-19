// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE THE PERMANENT RESIDENTS' PERSONAL SPACES ARE, by the one name both the server and the backup read.
 *
 * Here and not in src/server/lib/residents.ts because scripts/backup.ts must not import a module that opens the
 * database for writing (the reason its header gives), and this file opens nothing. The rules for a space
 * are in src/server/lib/residents.ts.
 */

/** The folder every personal space is in, beside the database: `personal-spaces/<agent id>/`. */
export const PERSONAL_SPACE_DIRECTORY = 'personal-spaces'

/**
 * THE FOLDER OF A RESIDENT'S SPACE THE BRIEF HANDS BACK AT THE START, a path inside the space and never a path on the
 * machine. The office's message at a secretary's sleep time names it too, so both read it here.
 */
export const MEMORY_FOLDER = 'memory/'

/**
 * A SECRETARY'S OWN SLEEP TIME, the person's decision: each secretary sets the time its sleep begins, at the hour its
 * department is least affected. The shortest and longest sleep, in minutes, that the sleep-time door takes. A length
 * outside them is refused, not cut to fit.
 */
export const SLEEP_TIME_SHORTEST_MINUTES = 15
export const SLEEP_TIME_LONGEST_MINUTES = 720

/**
 * HOW MANY OPEN ITEMS A CHECKLIST MAY HOLD BEFORE THE MESSAGE AT THE START OF THE SLEEP NAMES IT as a thing to look at.
 * More than this is named; this many is not. It is a signal for the secretary to judge, never a gate: nothing is refused
 * or held because a checklist is long: many items for a short time can be
 * fine, and many for a long time say the way of recording is wrong.
 */
export const OPEN_ITEMS_WORTH_A_LOOK = 5

/**
 * WHAT A RESIDENCY PROPOSAL IS CALLED AS A ROW OF WHAT WAITS ON THE PERSON (GET /api/waiting). Not `proposal`: it is not a
 * generic fork, and no generic press answers it. The page sends such a row to where its two presses are.
 */
export const RESIDENCY_PROPOSAL = 'residency proposal'

/**
 * WHAT THE PICTURE-AND-NAME REMINDER IS CALLED AS A ROW OF WHAT WAITS ON THE PERSON (GET /api/waiting).
 * When the person approves a promotion, the office reminds that a picture and a name be
 * chosen. The row's id
 * is the agent's registry id, not a record's, and the page sends it to the agent's own page, where both are changed.
 */
export const RESIDENT_TO_BE_NAMED = 'resident to be named'

/**
 * THE DECIDED CRITERION FOR A PERMANENT RESIDENT: "three days of work and five compactions or more,
 * and a long-term area of responsibility". The office SHOWS whether a proposal
 * meets each part and never refuses a proposal below them: the person judges with one press.
 */
export const RESIDENCY_CRITERION = { daysWithARun: 3, compactions: 5 } as const

/** One part of the criterion, as measured. `not-reported` is for the compactions: no run of the agent reported any. */
export type ACriterionPart = 'met' | 'not-met' | 'not-reported' | 'not-measured'

/** The criterion against the facts a proposal holds. Worked out here only, so the server's words and the page agree. */
export interface TheCriterionReading {
  days: { needed: number; have: number; part: ACriterionPart }
  /** `have` is null when the facts were measured before compactions were counted, or when none was reported. */
  compactions: { needed: number; have: number | null; part: ACriterionPart }
  /** The area of responsibility the proposal named, or null because it named none. */
  area: { named: string | null; part: 'named' | 'not-named' }
}

/**
 * THE FACTS AGAINST THE CRITERION. `compactionsReported` is undefined on a proposal filed before compactions were
 * counted (`not-measured`), and 0 when the agent's runs reported none, which is not the same as none happening
 * (`not-reported`). A count of 1 to 4 reported is `not-met`, because the reports show fewer than five.
 */
export function measuredAgainstTheCriterion(
  facts: { daysWithARun: number; compactionsReported?: number },
  area: string | null,
): TheCriterionReading {
  const reported = facts.compactionsReported
  const compactions: TheCriterionReading['compactions'] =
    reported === undefined
      ? { needed: RESIDENCY_CRITERION.compactions, have: null, part: 'not-measured' }
      : reported === 0
        ? { needed: RESIDENCY_CRITERION.compactions, have: null, part: 'not-reported' }
        : { needed: RESIDENCY_CRITERION.compactions, have: reported, part: reported >= RESIDENCY_CRITERION.compactions ? 'met' : 'not-met' }
  return {
    days: {
      needed: RESIDENCY_CRITERION.daysWithARun,
      have: facts.daysWithARun,
      part: facts.daysWithARun >= RESIDENCY_CRITERION.daysWithARun ? 'met' : 'not-met',
    },
    compactions,
    area: area === null || area.trim() === '' ? { named: null, part: 'not-named' } : { named: area.trim(), part: 'named' },
  }
}

/** The `extra` key a residency proposal carries: `data.extra.residency.agentId` names the agent it proposes. */
export const RESIDENCY_EXTRA_KEY = 'residency'

/**
 * WHETHER A PROPOSAL'S DATA IS A RESIDENCY PROPOSAL, the one reading of it. A residency proposal is settled only by the
 * residents' doors (Confirm and Not now on its row), because confirming it makes the space in the same act; every
 * generic way of settling a fork asks this and refuses one.
 */
export function isAResidencyProposal(data: unknown): boolean {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return false
  const extra = (data as Record<string, unknown>)['extra']
  if (typeof extra !== 'object' || extra === null || Array.isArray(extra)) return false
  const held = (extra as Record<string, unknown>)[RESIDENCY_EXTRA_KEY]
  return typeof held === 'object' && held !== null && typeof (held as Record<string, unknown>)['agentId'] === 'string'
}

/**
 * WHAT A GENERIC DOOR SAYS WHEN IT IS ASKED TO SETTLE A RESIDENCY PROPOSAL. Written once, for every door that refuses
 * one.
 */
export function aResidencyProposalHasItsOwnDoors(title: string): string {
  return (
    `"${title}" is a proposal to make an agent a permanent resident, and only its own two presses settle it: Confirm and ` +
    'Not now, on its row where residents are proposed (POST /api/residents/proposals/<id>/confirm or /decline). ' +
    'Confirming it also makes the agent’s personal space, which no other door does. Nothing was written.'
  )
}
