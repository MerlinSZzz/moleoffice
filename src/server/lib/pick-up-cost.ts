// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TWO THRESHOLDS AND THE RUN'S OWN IDLE CLOCK. Criterion T6, amended 13 September 2026.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE TWO NUMBERS COME FROM
 * ---------------------------------------------------------------------------------------
 *
 * The tokens are the run's own usage receipt (`data.usageReceipt.inputTokens`), read by the one
 * helper in `@shared/pick-up-cost.ts`. The idle minutes are read here from the run's
 * `data.lastOutputAt`, which is the same clock the presence reading reads for its
 * "a run with recent output" input: `minutesSince` in `lib/arrivals.ts`, which returns null for a
 * stamp it cannot read rather than treating it as "just now".
 *
 * IT IS THE RUN'S OWN CLOCK AND NOT A SECOND PRESENCE READING. `presenceOf` is keyed to the open
 * attachments of a durable agent and takes no run; asking it for a row would be one more query per
 * row on the Embassy, whose speed is already a live complaint. `lastOutputAt` is the run's own
 * statement of when it last produced output, it is what the presence reading reads, and a run with
 * no readable stamp carries no warning rather than being called fresh.
 *
 * ---------------------------------------------------------------------------------------
 * THE THRESHOLDS ARE JUDGEMENTS, SO THEY ARE DECLARED SETTINGS
 * ---------------------------------------------------------------------------------------
 *
 * Both come from src/config/settings.mjs through its one reader: MOLE_OFFICE_EXPENSIVE_AFTER, a
 * duration, and MOLE_OFFICE_LARGE_LAST_TURN_TOKENS, a whole number. They move into the Settings
 * store when U2 lands; until then they are read here, once per request by each caller.
 */
import { settingValue } from '../../config/settings.mjs'
import {
  lastTurnTokensOf,
  pickUpCostSaid,
  type PickUpCost,
} from '../../shared/pick-up-cost.ts'
import type { UsageReceipt } from '../../shared/usage-receipts.ts'
import type { PanelRecord } from '../../shared/types.ts'
import { parseDuration } from './adapters/index.ts'
import { minutesSince } from './arrivals.ts'
import { ranAsIn } from '@shared/ran-as.ts'

/** The two variable names, spelled once so every message names them the same way. */
export const EXPENSIVE_AFTER_VAR = 'MOLE_OFFICE_EXPENSIVE_AFTER'
export const LARGE_LAST_TURN_TOKENS_VAR = 'MOLE_OFFICE_LARGE_LAST_TURN_TOKENS'

/** The two effective thresholds, in the units the comparison uses. */
export interface PickUpCostThresholds {
  /** Whole minutes of idle at or above which picking the run up is called expensive. */
  idleAtLeastMinutes: number
  /** Input tokens at or above which a run's last turn counts as large. */
  largeAtLeastTokens: number
}

/**
 * Read both thresholds, or refuse with the variable named.
 *
 * The duration is parsed by `parseDuration`, the one duration reader in this repository, and
 * rounded UP to whole minutes: a window of 90 seconds is 2 minutes here, never 1, so a run is
 * never called expensive a moment before the window it was given.
 */
export function pickUpCostThresholds(): PickUpCostThresholds {
  const idle = settingValue(EXPENSIVE_AFTER_VAR)
  if (idle === null || idle === '') {
    throw new Error(`${EXPENSIVE_AFTER_VAR} has no value and no declared default, so idle time cannot be judged.`)
  }
  const idleAtLeastMinutes = Math.ceil(parseDuration(idle, EXPENSIVE_AFTER_VAR) / 60)

  const raw = settingValue(LARGE_LAST_TURN_TOKENS_VAR)
  const largeAtLeastTokens = Number(raw)
  if (raw === null || raw === '' || !Number.isFinite(largeAtLeastTokens) || largeAtLeastTokens <= 0) {
    throw new Error(
      `${LARGE_LAST_TURN_TOKENS_VAR} is ${JSON.stringify(raw)}, which is not a whole number of tokens greater than ` +
        'zero. Nothing was guessed at.',
    )
  }
  return { idleAtLeastMinutes, largeAtLeastTokens }
}

/**
 * How long one run has been idle, in whole minutes, or null when its own stamp cannot be read.
 *
 * `minutesSince` is the one reader of a stored stamp against a clock, and its null is kept: a run
 * whose `lastOutputAt` is missing or unreadable is not a run that just spoke.
 */
export function idleMinutesOfARun(data: Record<string, unknown>, now: Date): number | null {
  const said = data['lastOutputAt']
  if (typeof said !== 'string' || said === '') return null
  return minutesSince(said, now)
}

/** The warning for one run, or null. The receipt is read as the record holds it. */
export function pickUpCostOfARun(
  data: Record<string, unknown>,
  now: Date,
  thresholds: PickUpCostThresholds,
): PickUpCost | null {
  const receipt = (data['usageReceipt'] as UsageReceipt | undefined) ?? null
  return pickUpCostSaid(
    lastTurnTokensOf(receipt),
    idleMinutesOfARun(data, now),
    thresholds.largeAtLeastTokens,
    thresholds.idleAtLeastMinutes,
  )
}

/**
 * THE WARNING FOR EACH AGENT'S NEWEST RUN, over a set of session records read once.
 *
 * A ROW IS A PARTICIPANT AND A RUN IS NOT, so the Embassy reaches a run through the binding the
 * citizen's page uses: `ranAs` names the agent RECORD each run worked as, and the newest run by
 * `createdAt` is the one a reader is looking at. This returns a map keyed by that agent record id;
 * `recordForAgentIn` turns a registry row's own id into it.
 *
 * IT TAKES THE RECORDS RATHER THAN QUERYING THEM, because the caller already reads every session
 * once for the whole table. A second query here would be the per-row read the Embassy must not pay.
 */
export function pickUpCostPerAgent(
  rows: readonly PanelRecord[],
  workspaceId: string,
  now: Date,
  thresholds: PickUpCostThresholds,
): Map<string, PickUpCost> {
  const newest = new Map<string, PanelRecord>()
  for (const row of rows) {
    const agentId = ranAsIn(row, workspaceId)
    if (agentId === null) continue
    const held = newest.get(agentId)
    // `createdAt` is a local wall-clock stamp, so the later one is the newer run.
    if (held === undefined || row.createdAt > held.createdAt) newest.set(agentId, row)
  }
  const out = new Map<string, PickUpCost>()
  for (const [agentId, row] of newest) {
    const cost = pickUpCostOfARun(row.data, now, thresholds)
    if (cost !== null) out.set(agentId, cost)
  }
  return out
}
