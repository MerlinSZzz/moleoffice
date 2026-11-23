// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NEXT ROUND OF A RUN STARTED IN A SANDBOX, ASKED AT ONE DOOR. Wave 13j, round loop-2 (step 2 of "a supervisor
 * runs its own loop", module HoSzb82KlTHJ; plan 4uSoJQ5RySTw, part "doors", D1). It replaces the old start-after.sh.
 *
 * The ask is `POST /api/agents/<agent>/next-round` {brief, sandbox?}, or {delegations, line, sandbox?} naming the inside
 * packages the round takes, for which the office writes the brief. src/server/lib/next-round.ts checks it and
 * keeps it on the agent's last run as `nextRound`; the message worker on the host starts the round with
 * `node tools/sandbox.mjs round`, because Claude Code cannot be started from inside a sandbox. The launcher files
 * the new run, derived from the last, and the office mints its key on that create.
 *
 * `nextRound` moves through four states, each written by the office alone:
 *   - wanted    the ask is kept, and nothing has started;
 *   - starting  the worker filed its launcher run (`starting.wrapper`) and is starting the launcher;
 *   - started   the launcher filed the new run (`started.run`), and the office minted its key;
 *   - failed    nothing was started, and `failed.says` says why.
 *
 * Here and not on the server so the door, the worker and a page read one shape.
 */

import type { ParticipantRef } from './participants.ts'
import type { TheModelARunGets } from './run-models.ts'
import type { TheRowAWorkerIsGiven } from './worker-runs.ts'
import { aCutFromCommitHasItsShape, A_CUT_FROM_COMMIT_IS } from './kind-fields/session-wave-13n.ts'

/** The recorded commit for the cut still named on a run, or its name when none was recorded for it. */
export function theRecordedBaseOfRun(data: Record<string, unknown>): { base: string | null; recorded: boolean } | { fails: string } {
  const recorded = data['cutFromCommit']
  const named = typeof data['cutFrom'] === 'string' && data['cutFrom'].trim() !== '' ? data['cutFrom'] : null
  if (recorded === undefined) return { base: named, recorded: false }
  if (!aCutFromCommitHasItsShape(recorded)) return { fails: A_CUT_FROM_COMMIT_IS }
  return named === recorded.named ? { base: recorded.commit, recorded: true } : { base: named, recorded: false }
}

export const NEXT_ROUND = 'nextRound'
export const NEXT_ROUND_HELD_BY = { office: 'the office', worker: 'the message worker' } as const

/** The shared Claude-login limit and the use already counted in this pass. */
export function theClaudeSupervisorCapSays(atOnce: number, going: number): string {
  return `MOLE_OFFICE_CLAUDE_SUPERVISORS_AT_ONCE is ${atOnce}; ${going} Claude supervisors are going or already listed in this pass.`
}

/** The refusal of `nextRound` in any write but the office's own, on a create and on a patch. */
export const ONLY_THE_OFFICE_WRITES_THE_NEXT_ROUND =
  "Only the office writes a run's next round, at POST /api/agents/<agent>/next-round. Nothing was written."

/**
 * The runtime word of the worker's own run that starts the launcher. It runs no model and serves no agent.
 * `RUNTIMES_THAT_RUN_NO_MODEL` in src/shared/check-eligibility.ts lists this runtime with the merge tool's,
 * which is where the check note reads which acts can apply to a run of this kind.
 */
export const ROUND_LAUNCHER_RUNTIME = 'round-launcher'

export const NEXT_ROUND_STATES = ['wanted', 'starting', 'started', 'failed'] as const
export type NextRoundState = (typeof NEXT_ROUND_STATES)[number]

/**
 * Who may ask, each proved by its own key or, for the person, the way the person is proved. `its leader` is the agent
 * recorded as the agent's owner, which need not be its starter. The office asks only in its
 * own process, for a fix round of a red merge entry or a hand-back's resolve brief (wave 13u round 90), and for the next
 * round of a run it saw sealed, with its sandbox's briefs/NEXT.md (round 94).
 */
export const NEXT_ROUND_ASKERS = ['the run’s agent', 'its starter', 'its leader', 'a secretary', 'the person', 'the office'] as const
export type NextRoundAsker = (typeof NEXT_ROUND_ASKERS)[number]

/**
 * THE EFFORT THE LAUNCHER IS ANSWERED, as both doors that start a run through the sandbox launcher record it: the
 * office's answer to the question the launcher asks before it starts the run (src/server/lib/next-round.ts,
 * `theEffortTheLauncherIsAnswered`). `effort` is null when the office answers none.
 */
export interface TheEffortTheLauncherIsAnswered {
  effort: string | null
  effortFrom: NonNullable<TheModelARunGets['effortFrom']>
  effortSays: string
}

export interface TheNextRound {
  state: NextRoundState
  askedAt: string
  /** Who asked, named as a participant is named everywhere, and as which of the six who may. */
  askedBy: { who: ParticipantRef; as: NextRoundAsker; session?: string }
  /** The brief, as a pointer and a hash: an absolute path inside the sandbox folder, its sha256 and its size. */
  brief: { path: string; sha256: string; bytes: number }
  /** The sandbox the last run was started in, as the office vouches for it. */
  sandbox: { folder: string; instance: string; container: string }
  /** The asker's own run, still going when it asked. The round starts after it ends. */
  after?: string
  /** A bounded reservation for a repair that must start only after this entry lands on main. */
  repair?: { entry: string; dueAt: string; capHeldMs?: number; capHeldSince?: number }
  /** The ask this one replaced, when one was still waiting. */
  replaced?: { askedAt: string; askedBy: string }
  /** The Casting row the ask chose, or null when it kept the run; absent on an ask made before the ask kept one. */
  row?: TheRowAWorkerIsGiven | null
  /** With row null: the model the ask read on the run it continues. */
  model?: string
  /** With row null when another program's row was in force: what the ask found, for the start's words. */
  unmatchedRow?: { id: number; card: string; program: string }
  /**
   * Why the round starts on another program's row than the run it continues: the program that was out, and what said so.
   * Set only when the ask drew that row because the run's own program was spent (its row out until a time still to
   * come, or a provider limit).
   */
  switched?: { from: string; says: string }
  /**
   * While wanted: since when the ask waits for a process of the run that holds it, and which (wave 13u round 94). The
   * launcher starts nothing while one still runs. It stays on the ask once the ask moves on.
   */
  waits?: { since: string; says: string }
  /** A reason the office or message worker cannot start the round, without a wait deadline. */
  held?: { since: string; says: string; by: (typeof NEXT_ROUND_HELD_BY)[keyof typeof NEXT_ROUND_HELD_BY] }
  /** What the launcher was given: the office's model, and the effort the office answers the launcher. */
  starting?: { at: string; wrapper: string; model: string; modelSays: string; worktree?: string; cutFrom?: string; tip?: string; worktreeSays?: string } & TheEffortTheLauncherIsAnswered
  started?: { at: string; run: string; runKeyId: string }
  /** How the launcher ended, once it has. */
  launcher?: { at: string; ok: boolean; says: string }
  /** The new run's open process row when the launcher ended, or null with why none was found. */
  process?: { row: string | null; says: string }
  failed?: { at: string; says: string }
  /** With `line`, and only on an ask that named them: the inside packages the round takes, by task record id, in the ask's order. */
  delegations?: string[]
  /** With `delegations`: the line the round takes them for. */
  line?: string
}

const isText = (value: unknown): value is string => typeof value === 'string' && value !== ''
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** A package id or a line as an ask names it: a word with no blank around it, the rule the round start reads them by. */
export const isAPlainWord = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '' && value === value.trim()

/** Packages as an ask names them: one or more plain words, each once. */
export const areNamedPackages = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length > 0 && value.every(isAPlainWord) && new Set(value).size === value.length

/** Read a stored `nextRound`, or null when there is none or it is not one. */
export function readTheNextRound(value: unknown): TheNextRound | null {
  if (!isObject(value) || !NEXT_ROUND_STATES.includes(value['state'] as NextRoundState) || !isText(value['askedAt'])) return null
  const askedBy = value['askedBy']
  const brief = value['brief']
  const sandbox = value['sandbox']
  if (!isObject(askedBy) || !isObject(askedBy['who']) || !isText(askedBy['who']['id']) || !NEXT_ROUND_ASKERS.includes(askedBy['as'] as NextRoundAsker)) return null
  if (!isObject(brief) || !isText(brief['path']) || !isText(brief['sha256']) || typeof brief['bytes'] !== 'number') return null
  if (!isObject(sandbox) || !isText(sandbox['folder']) || !isText(sandbox['instance']) || !isText(sandbox['container'])) return null
  const repair = value['repair']
  if (repair !== undefined && (!isObject(repair) || !isText(repair['entry']) || !isText(repair['dueAt']))) return null
  // Both or neither: packages are named only with their line.
  const delegations = value['delegations']
  const line = value['line']
  if ((delegations === undefined) !== (line === undefined)) return null
  if (delegations !== undefined && (!areNamedPackages(delegations) || !isAPlainWord(line))) return null
  return value as unknown as TheNextRound
}
