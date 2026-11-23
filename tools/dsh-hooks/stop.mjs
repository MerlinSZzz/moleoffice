#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Stop: hold a stop while the run has something left to do: a supervisor's unseen message or running worker, and any
 * agent's own run that is still unfinished.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES
 * ---------------------------------------------------------------------------------------
 *
 * The bridge runs this at `agent/turn-stopping`. The rules are whatHoldsTheStop in office.mjs, which the Claude Code
 * stop hook (claude-code-stop.mjs) follows as well. A supervisor is held while
 *
 *   (a) a message addressed to it is unseen, and the reason names the message, or
 *   (b) an agent it started still has a run in state `running`, and the reason names the workers
 *       and tells it to read the messages waiting for it (GET /api/handles/<handle>/waiting) and the
 *       workers' reports before stopping.
 *
 * And any agent, worker or supervisor, is held while (c) its own run still says `running` and has no seal (problem
 * UbG6k-7jGLa5): a worker that ended its turn to wait for the background subagents it started was ended with them, on
 * 29 September 2026. The reason tells it to wait for that work, or to report and say it is finished.
 *
 * When none holds it prints nothing and the run stops. The hold is the bridge's "force another
 * step with a reason": it prints `{"decision":"block","reason":"…"}`, which the bridge folds to a
 * denied stop and steers the agent with.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THERE IS A CAP, AND WHY IT IS THREE
 * ---------------------------------------------------------------------------------------
 *
 * A forced step costs a full model turn. A supervisor that ignores the reason would otherwise be
 * held for ever, one turn at a time, and the decision that chose this bridge named exactly that as
 * what would reopen the question. So it holds at most THREE times in a row for the same thing it
 * saw. Three is enough for an agent to read its inbox, read the workers' reports and write an
 * answer; a fourth hold is the agent not acting on the reason, and the run is let go.
 *
 * WHAT IT SAW is a fingerprint: the ids of the unseen messages, the handles of the running workers, or the run's own
 * session. A new message or a worker finishing changes the fingerprint, and the count starts again.
 * The count and the fingerprint live in `.logs/dsh-hooks-stop.json` under the directory the hook
 * runs in — the session workspace, which is the worktree — and never in the office, because a hook
 * is not a run and writes no record. The run's own session is part of the stored state, so a fresh
 * run starts with a fresh count.
 *
 * ---------------------------------------------------------------------------------------
 * IT NEVER STOPS A RUN BY FAILING
 * ---------------------------------------------------------------------------------------
 *
 * An unreachable office, an unreadable card and a worker whose runs could not be read all end with
 * one sentence on stderr and no output, which allows the stop. Nothing is guessed and no key is
 * printed.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'

import {
  apiAddress,
  ask,
  holdOrLetGo,
  identity,
  readStdin,
  sayTheTurn,
  theCapLetItGo,
  theHeaders,
  theRunReportsItsTurns,
  whatHoldsTheStop,
} from './office.mjs'
import {
  bytesOfTheTranscript,
  findTheTranscript,
  sizeOfTheBrief,
  theServedOfATranscript,
  theTextOfTheTranscript,
} from './served.mjs'
import { aReceiptReadLately, dshTranscriptUsage, keepingTheOutsideSpend, RECEIPT_NOT_REPORTED, whereItRan } from '../../src/config/usage.mjs'
import { localStampOf } from '../../src/config/stopped-run-cause.mjs'
// THE BRIEF'S PATH IS A DECLARED SETTING, read through the one declaration rather than straight
// from the environment. A run's brief is written into the ENVIRONMENT by run-agent.sh, so this
// reads the declaration against that environment and NOT against `.env`: a checkout-wide line must
// never describe one run, and `readSetting` with `process.env` is the layer the runner wrote.
import { readSetting } from '../../src/config/settings.mjs'

/**
 * WHAT THE RUN'S RUNTIME SERVED IT, PATCHed ONTO THE RUN'S SESSION RECORD. Criterion HB1: a
 * run's conditions are on its session record, written by the runner and not by hand.
 *
 * The four fields, each holding its own value or the words "not reported" where the runtime gave
 * nothing: the model the provider's responses carried, the temperature the session ran at, the
 * brief file's size in bytes — the path is what run-agent.sh was given, named in the
 * MOLE_OFFICE_BRIEF_PATH it exports — and the largest single turn's input tokens plus the total
 * input across the run, counted from the provider's own usage rows only, by the rule the
 * first stock-take of the office's flow named (report jDwkhne4tDWR, block 2): the per-chunk
 * copies of the same numbers inside each message's stream array are never counted, because
 * counting them doubles the total.
 *
 * WRITE ON EVERY STOP OF A RUN WITH AN IDENTITY, held or not. A held stop lets the run go on, and
 * the invocation when it really ends overwrites with the final numbers; the PATCH that changes
 * nothing writes no revision, so the held stops store nothing but the last one's truth.
 *
 * Hands back the sentence for stderr, or null, the transcript's text, which the usage receipt is read from, and why
 * there is no text, or null when there is.
 */
async function writeTheServed(api, id, payload) {
  const dshHome = process.env.DSH_HOME !== undefined && process.env.DSH_HOME !== ''
    ? process.env.DSH_HOME
    : join(homedir(), '.dsh')
  const briefBytes = sizeOfTheBrief(readSetting('MOLE_OFFICE_BRIEF_PATH', process.env).value)
  const cwd = payload !== null && typeof payload === 'object' && typeof payload['cwd'] === 'string' && payload['cwd'] !== ''
    ? payload['cwd']
    : process.cwd()
  const sessionId = payload !== null && typeof payload === 'object' ? payload['session_id'] : undefined
  let text = ''
  let unread = 'no transcript of this dsh session was found'
  const transcript = findTheTranscript(dshHome, cwd, sessionId)
  if (transcript !== null) {
    const bytes = bytesOfTheTranscript(transcript)
    if (bytes === null) unread = 'its file could not be read'
    else {
      const decoded = theTextOfTheTranscript(transcript, bytes)
      text = decoded.text ?? ''
      unread = decoded.text === null ? decoded.why : null
    }
  }
  const served = theServedOfATranscript(text, briefBytes)
  const said = await ask(api, `/api/records/${encodeURIComponent(id.session)}`, {
    method: 'PATCH',
    headers: theHeaders(id),
    body: { dataPatch: { served } },
  })
  if (said === null) {
    return { said: `dsh-hooks Served: Mole Office did not answer at ${api} about what run ${id.session} was served, so the run's conditions were not recorded.\n`, text, unread }
  }
  if (!said.ok) {
    return { said: `dsh-hooks Served: Mole Office answered ${String(said.status)} to the run's own record of what it was served, so the run's conditions were not recorded.\n`, text, unread }
  }
  return { said: null, text, unread }
}

/**
 * THE RUN'S USAGE RECEIPT, beside what served it (milestone M8, report 4IoRUKizcZXb): the running total of the
 * transcript, written over the last one at each stop, so a held stop and the real end agree. dsh names no cost and no
 * login, so those are absent or "not reported". Where it ran is a sandbox, or the host for a round started there
 * (a secretary's ask). Outside spending already on the stored receipt is kept, so the receipt is written only when that
 * read answered. It is its own write after `served`, so a receipt the office refuses never costs the run its served
 * conditions. Returns the one sentence for stderr, or null.
 *
 * A HELD STOP WRITES IT AT MOST ONCE IN TEN MINUTES; A STOP THAT LETS THE RUN GO ALWAYS DOES (a review, message
 * DLqviJ8nr3yH). A held stop is followed by another turn, and every write is a whole revision of the run, so a held stop
 * that finds a receipt read in the last ten minutes (aReceiptReadLately, src/config/usage.mjs) writes nothing.
 *
 * A TRANSCRIPT THAT GAVE NO TEXT IS NAMED IN THE RECEIPT'S WORDS, with why, so a receipt with no numbers is never read as
 * a run that used nothing.
 * @param {string} api
 * @param {{ agent: string, session: string, workspace: string }} id
 * @param {string} text
 * @param {string | null} unread Why the transcript gave no text, or null when it did.
 * @param {boolean} held Whether this stop is held, so the run goes on.
 * @returns {Promise<string | null>}
 */
async function writeTheReceipt(api, id, text, unread, held) {
  const before = await ask(api, `/api/records/${encodeURIComponent(id.session)}`, { headers: theHeaders(id) })
  if (before === null || !before.ok) {
    return `dsh-hooks Usage: run ${id.session} could not be read first (${before === null ? 'no answer' : String(before.status)}), so its usage receipt was not written.\n`
  }
  const stored = (before.body?.record ?? before.body)?.data?.usageReceipt
  const readAt = new Date()
  if (held && aReceiptReadLately(stored, readAt.getTime())) return null
  const read = dshTranscriptUsage(text)
  const says = unread === null ? {} : { says: `The run's own transcript was not read: ${unread}. ${String(read.says)}` }
  const usageReceipt = keepingTheOutsideSpend(stored, { ...read, ...says, paidBy: RECEIPT_NOT_REPORTED, ranIn: whereItRan(process.env), readAt: localStampOf(readAt) })
  const wrote = await ask(api, `/api/records/${encodeURIComponent(id.session)}`, {
    method: 'PATCH',
    headers: theHeaders(id),
    body: { dataPatch: { usageReceipt } },
  })
  if (wrote === null) return `dsh-hooks Usage: Mole Office did not answer at ${api}, so run ${id.session}'s usage receipt was not written.\n`
  if (!wrote.ok) return `dsh-hooks Usage: Mole Office answered ${String(wrote.status)} to run ${id.session}'s usage receipt, so it was not written.\n`
  return null
}

async function main() {
  const payload = JSON.parse((await readStdin()) || '{}')
  const id = identity()
  if (id === null) {
    process.stderr.write(
      'dsh-hooks Stop: the runner exported no MOLE_OFFICE_AGENT, MOLE_OFFICE_SESSION and ' +
        'MOLE_OFFICE_WORKSPACE, so the stop was allowed.\n',
    )
    return
  }
  const api = apiAddress()

  // WHAT THE RUN'S RUNTIME SERVED IT, criterion HB1, read from the run's own transcript and
  // PATCHed onto the session record with the run's own headers. Written on EVERY stop of a run
  // with an identity, worker or supervisor, held or not — a held stop lets the run go on, and the
  // invocation when it really ends overwrites with the final numbers; a patch that changes
  // nothing writes no revision. The failure sentence is kept and printed at the natural endings
  // below, so an office that did not answer is named once by the existing sentences and not twice.
  let theServedSaid = null
  let text = ''
  let unread = null
  try {
    ;({ said: theServedSaid, text, unread } = await writeTheServed(api, id, payload))
  } catch (error) {
    theServedSaid = `dsh-hooks Served: ${error instanceof Error ? error.message : String(error)}, so the run's conditions were not recorded.\n`
  }
  // THE RECEIPT IS WRITTEN ONCE THE HOOK KNOWS WHETHER THIS STOP IS HELD (writeTheReceipt), and only after `served` was
  // written, as before. Its sentence is printed beside the served one at the natural endings below; where the stop
  // could not be told, the one sentence already printed names the office, so neither is printed.
  const sayWhatTheServedDid = async (held, quiet = false) => {
    let theReceiptSaid = null
    if (theServedSaid === null) {
      try {
        theReceiptSaid = await writeTheReceipt(api, id, text, unread, held)
      } catch (error) {
        theReceiptSaid = `dsh-hooks Usage: ${error instanceof Error ? error.message : String(error)}, so run ${id.session}'s usage receipt was not written.\n`
      }
    }
    if (!quiet) for (const sentence of [theServedSaid, theReceiptSaid]) if (sentence !== null) process.stderr.write(sentence)
  }

  // THE TURN ENDED, said first when the run has said it reports its turns (session-start.mjs), so the messages it held in
  // this turn go now, whether or not the stop is then held.
  if (theRunReportsItsTurns(id)) {
    const ended = await sayTheTurn(api, id, 'ended', 'dsh-hooks Stop')
    if (ended !== null) process.stderr.write(ended)
  }

  // WHAT HOLDS THE STOP, from the rules both runtimes follow (office.mjs, whatHoldsTheStop): a supervisor for an unseen
  // message or a worker it started that still runs, and any agent for its own run still running and unsealed (problem
  // UbG6k-7jGLa5), the same sight at most HOLDS_IN_A_ROW times in a row; the stop the cap lets go says so.
  const decided = await whatHoldsTheStop(api, id, 'dsh-hooks Stop')
  if (decided.couldNotTell !== undefined) {
    process.stderr.write(decided.couldNotTell)
    await sayWhatTheServedDid(false, true)
    return
  }
  let held = false
  if (decided.hold !== null) {
    held = holdOrLetGo(id, decided.hold)
    if (!held) process.stderr.write(theCapLetItGo('dsh-hooks Stop', decided.hold))
  }
  await sayWhatTheServedDid(held)
}
try {
  await main()
} catch (error) {
  process.stderr.write(
    `dsh-hooks Stop: ${error instanceof Error ? error.message : String(error)}, so the stop was allowed.\n`,
  )
}
