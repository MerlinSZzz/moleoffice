// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE ASKS FOR THE NEXT ROUND AT THE SEAL (wave 13u round 94, item 30 step 5) OR AT THE RELEASE (wave 13r round
 * AX, item 24). Proved by tests/the-office-asks-the-next-round-at-the-seal.test.ts and
 * tests/the-office-asks-the-next-round-at-the-release.test.ts.
 *
 * ONE DECISION FOR BOTH MOMENTS. When a run of a line that is on is sealed (`queuesAtTheSeal.on`,
 * lib/merge-queue-at-the-seal.ts) and the gate 'next-round-at-the-seal' is on, or when a run is released
 * (`releaseOrRefuse` in lib/inspection.ts) and the gate 'next-round-at-the-release' is on, the office asks the
 * next-round door itself, as the office, with the briefs/NEXT.md of the sandbox the run was started in. At the release
 * no line needs to be on: the pause file is a line's only stop. It keeps what it did on the run as
 * `atTheSeal.nextRound` (src/shared/next-round-at-the-seal.ts), with the moment. It asks nothing, and says why, when:
 *
 *   1. a next round is asked for this run already, by anyone;
 *   2. the run's agent does not hold the supervisor card;
 *   3. the office cannot vouch for the run's sandbox, so it cannot tell which file is the line's NEXT.md;
 *   4. the line rests: the pause file `THE_LINE_RESTS` is in the sandbox's briefs folder;
 *   5. briefs/NEXT.md is missing, is not a plain file, or is a NEXT-held-* file by its real path;
 *   6. briefs/NEXT.md was written before the run was filed, by its file time;
 *   7. no record names the brief this round started with, or NEXT.md is still that brief;
 *   8. a run of the agent was filed after this one, of any kind and in any project;
 *   9. the door refuses, in its own words.
 *
 * The office reads its own note first, so a seal or a release asked again asks once, and a release asks nothing after
 * a seal that asked. How the round then starts is the door's and the worker's (lib/next-round.ts): the worker leaves the
 * ask waiting while a process of the run still runs, and while as many Claude supervisors as the cap are going.
 */
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'

import { AT_THE_SEAL, readQueuesAtTheSeal, thePartAtTheSeal } from '@shared/merge-queue-at-the-seal.ts'
import { NEXT_ROUND, readTheNextRound } from '@shared/next-round.ts'
import { readNextRoundAtTheSeal, type NextRoundAtTheSeal, type NextRoundMoment } from '@shared/next-round-at-the-seal.ts'
import { THE_SUPERVISOR } from '@shared/roles.ts'
import { nowStamp, parseStoredStamp } from '@shared/time.ts'
import type { PanelRecord } from '@shared/types.ts'
import { sqlite } from '../db/client.ts'
import { anyRecordForAgent } from '../db/any-record-for-agent.ts'
import { gateMet } from './gate-counts.ts'
import { nameOf } from './groups.ts'
import { theAgentOfARun } from './inspection.ts'
import { THE_OFFICE } from './the-office.ts'
import { QUEUES_AT_THE_SEAL, asTheOfficeWriting } from './merge-queue-fields-the-office-writes.ts'
import { askForTheNextRound, theNewestRunOf, theSandboxTheOfficeVouchesFor } from './next-round.ts'
import { theCardOfAgent } from '../db/the-card-of-agent.ts'
import { aPatchThatReplaces, getRecord, patchRecord } from './records.ts'
import { PanelError } from './panel-error.ts'
import { whyThisRunStartsNoRound, theSecretaryAskedFirst, whyNoSecretaryWasTold } from './the-line-next-round.ts'
import { asTheOfficeAsking } from './the-office-asks-for-a-round.ts'

/** A brief the office never asks for: one held back until somebody answers (briefs/NEXT-held-*). */
const A_HELD_BRIEF = 'NEXT-held-'

/**
 * THE PAUSE FILE OF A LINE: while it is in the briefs folder of the line's sandbox, the office asks for none of the
 * line's next rounds, at the seal or at the release. Whoever starts the line's rounds by hand writes it.
 */
export const THE_LINE_RESTS = `${A_HELD_BRIEF}the-line-rests.md`

/** Keep the note on the run, as the office, replacing whatever note was there. The note about the merge queue stays. */
function keep(run: PanelRecord, note: NextRoundAtTheSeal): NextRoundAtTheSeal {
  const before = thePartAtTheSeal(getRecord(run.id)?.data, 'nextRound')
  const value = typeof before === 'object' && before !== null && !Array.isArray(before) ? aPatchThatReplaces(before as Record<string, unknown>, note) : note
  asTheOfficeWriting(AT_THE_SEAL, () => patchRecord(run.id, { dataPatch: { [AT_THE_SEAL]: { nextRound: value } } }, THE_OFFICE))
  return note
}

const notAsked = (run: PanelRecord, moment: NextRoundMoment, says: string): NextRoundAtTheSeal =>
  keep(run, { outcome: 'not-asked', moment, says: `${says} The office asked for no next round.`, at: nowStamp() })

/** The sha256 of the brief the round before this one asked for, when a run before names this run as the round it started. */
function theBriefThisRoundStartedWith(run: PanelRecord): string | null {
  // derived_from in its general sense: this round's run continues the run before it, as register-a-run.mjs --continues files it.
  const before = sqlite.prepare("SELECT to_id AS toId FROM links WHERE from_id = ? AND type = 'derived_from' ORDER BY rowid").all(run.id) as { toId: string }[]
  for (const { toId } of before) {
    const asked = readTheNextRound(getRecord(toId)?.data[NEXT_ROUND])
    if (asked?.started?.run === run.id) return asked.brief.sha256
  }
  return null
}

/** Ask the door as the office: the brief as the door read it, or its refusal in its own words. */
function askTheDoor(agent: string, brief: string, workspaceId: string): { asked: { path: string; sha256: string } } | { refused: string } {
  try {
    const answered = asTheOfficeAsking({ agent, brief }, () => askForTheNextRound({ agent, brief, workspaceId, actor: THE_OFFICE }))
    return { asked: { path: answered.nextRound.brief.path, sha256: answered.nextRound.brief.sha256 } }
  } catch (error) {
    if (!(error instanceof PanelError)) throw error
    return { refused: error.message }
  }
}

/**
 * DECIDE THE NEXT ROUND OF ONE RUN, at its seal or at its release. Null when the office looks at nothing: at the seal,
 * the run's agent has no line turned on; at either moment, the moment's gate is off. The gate counts every seal of a line
 * that is on, and every release of a run of an agent, whichever way it is set.
 */
function decideTheNextRound(runId: string, moment: NextRoundMoment): NextRoundAtTheSeal | null {
  const run = getRecord(runId)
  if (run === null || run.kind !== 'session' || run.deletedAt) return null
  const agent = theAgentOfARun(run)
  if (agent === null) return null
  if (moment === 'seal') {
    const bound = anyRecordForAgent(agent.id)
    const line = bound === null ? null : readQueuesAtTheSeal(getRecord(bound.record)?.data[QUEUES_AT_THE_SEAL])
    if (line?.on !== true) return null
  }
  // EACH MOMENT HAS ITS OWN GATE, named where it is met.
  const met = moment === 'seal' ? gateMet('next-round-at-the-seal') : gateMet('next-round-at-the-release')
  if (met !== '1') return null

  const noted = readNextRoundAtTheSeal(thePartAtTheSeal(run.data, 'nextRound'))
  if (noted !== null && noted.outcome !== 'not-asked') return noted
  const already = readTheNextRound(run.data[NEXT_ROUND])
  if (already !== null) {
    return keep(run, {
      outcome: 'already',
      moment,
      says: `The next round after run ${run.id} was asked for already, at ${already.askedAt}, by ${nameOf(already.askedBy.who)} as ${already.askedBy.as}, so the office asked for none.`,
      at: nowStamp(),
    })
  }
  const card = theCardOfAgent(agent.id)
  if (card !== THE_SUPERVISOR) {
    return notAsked(run, moment, `${agent.handle} holds the ${card ?? 'unknown'} card, and the office asks only for a supervisor's next round.`)
  }

  const noRound = whyThisRunStartsNoRound(run)
  if (noRound !== null) return notAsked(run, moment, noRound)

  const sandbox = theSandboxTheOfficeVouchesFor(run)
  if (sandbox === null) {
    return notAsked(run, moment, `Run ${run.id} names no sandbox the office can vouch for, so the office cannot tell which file is the line's NEXT.md.`)
  }
  const rests = join(sandbox.folder, 'briefs', THE_LINE_RESTS)
  if (existsSync(rests)) return notAsked(run, moment, `The line rests: ${rests} is there.`)
  const path = join(sandbox.folder, 'briefs', 'NEXT.md')
  let real: string
  try {
    real = realpathSync(path)
  } catch {
    return notAsked(run, moment, `There is no brief at ${path}.`)
  }
  if (basename(real).startsWith(A_HELD_BRIEF)) return notAsked(run, moment, `${path} is the held brief ${basename(real)}, which waits for an answer.`)
  if (!lstatSync(real).isFile()) return notAsked(run, moment, `${path} is not a plain file.`)
  // THE RUN'S STAMP IS LOCAL WALL CLOCK, read as the office reads every stored stamp; a stamp it cannot read is said.
  const filed = parseStoredStamp(run.createdAt)
  if (filed === null) return notAsked(run, moment, `The time run ${run.id} was filed, ${JSON.stringify(run.createdAt)}, cannot be read, so nobody can say whether ${path} is newer.`)
  if (statSync(real).mtimeMs <= filed) return notAsked(run, moment, `${path} was written before run ${run.id} was filed, at ${run.createdAt}, so it is not the brief of the round after it.`)
  const sha256 = createHash('sha256').update(readFileSync(real)).digest('hex')

  const startedWith = theBriefThisRoundStartedWith(run)
  if (startedWith === null) {
    return notAsked(run, moment, `No record names the brief run ${run.id} started with, so the office cannot tell whether ${path} is a new one.`)
  }
  if (startedWith === sha256) return notAsked(run, moment, `${path} is still the brief run ${run.id} started with.`)

  const newest = theNewestRunOf(agent.id, agent.handle)
  if (newest?.id !== run.id) {
    return notAsked(run, moment, `Run ${run.id} is not the newest run of ${agent.handle}${newest === null ? '' : `: run ${newest.id} is`}, so its next round has begun or is somebody else's to ask.`)
  }
  const secretaryFirst = sqlite.transaction(() => {
    const reason = theSecretaryAskedFirst(run, agent, real, path)
    return reason === null ? null : notAsked(run, moment, reason)
  })()
  if (secretaryFirst !== null) return secretaryFirst
  const answered = askTheDoor(agent.id, path, run.workspaceId)
  if ('refused' in answered) return notAsked(run, moment, `The next-round door refused: ${answered.refused}`)
  const noSecretary = moment === 'seal' ? whyNoSecretaryWasTold(agent, run.workspaceId) : null
  return keep(run, { outcome: 'asked', moment, brief: answered.asked, at: nowStamp(), ...(noSecretary === null ? {} : { says: noSecretary }) })
}

/** Decide at one moment, or say why what the office did could not be kept. */
function decideOrSay(runId: string, moment: NextRoundMoment): NextRoundAtTheSeal | { notKept: string } | null {
  try {
    return decideTheNextRound(runId, moment)
  } catch (error) {
    return { notKept: error instanceof Error ? error.message : String(error) }
  }
}

/** THE OFFICE ASKS FOR THE NEXT ROUND AT THE SEAL, or says why it could not keep what it did. Asked by api/records.ts. */
export function theOfficeAsksTheNextRoundAtTheSeal(runId: string): NextRoundAtTheSeal | { notKept: string } | null {
  return decideOrSay(runId, 'seal')
}

/** THE OFFICE ASKS FOR THE NEXT ROUND AT THE RELEASE, or says why it could not keep what it did. Asked by lib/inspection.ts. */
export function theOfficeAsksTheNextRoundAtTheRelease(runId: string): NextRoundAtTheSeal | { notKept: string } | null {
  return decideOrSay(runId, 'release')
}
