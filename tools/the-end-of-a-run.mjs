// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { theNativeSelectionRefusal, theRefusalOfAnEffortNotTheRows } from '../src/config/launcher-selection.mjs'
import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { A_RUN_IS_OVER_IN, theRunEndedBeforeItsCommand, aCodexStopNotice, aModelToName, askTheOffice, theOfficeSaid, whereAStoredMessageWaits } from './sandbox-common.mjs'
import { aCommandsProgram, aRuntimeIsCodex } from '../src/config/run-permissions.mjs'
import { codexCapacityAtTheEnd, codexRateOrUsageLimitAtTheEnd, isACauseTheyMustActOn, theStopCauseAtTheEndOfTheTranscript, theStopCauseOf } from '../src/config/stopped-run-cause.mjs'
import { UNKNOWN_STOP_CAUSE } from './sandbox-common.mjs'
import { theLoginThatPaid } from '../src/config/claude-code-login.mjs'
import { theReceiptOfAnEndedCodexCommand, theReceiptOfAnEndedCommand, theReceiptOfAnEndedOpenCodeCommand, theReceiptWrittenOver, whereItRan } from '../src/config/usage.mjs'
import { theServedOfAClaudeCodeRun } from '../src/config/claude-code-served.mjs'
import { theServedOfACodexRun } from '../src/config/runtime-served.mjs'
import { theOutputOfTheRunItContinues } from '../src/config/the-run-it-continues.mjs'
import { theCommandResumesAConversation, aWaitATestMayShorten } from '../src/config/sandbox-start-values.mjs'
import { aRunSaysItIsFinished, THE_LONGEST_FINISH_WAIT_MS, THE_FINISH_ANSWER_WAS_LATE } from '../src/config/finished.mjs'
import { clockStamp, nowStamp } from '../src/shared/time.ts'
import { theRecordedBaseOfRun } from '../src/shared/next-round.ts'
import { theGoLimitAnOpenCodeRunEndedOn, theLastLinesOf } from '../src/config/stopped-run-cause.mjs'
import { theAgentsMessagesSince, whatTheRunSays } from './a-run-says-it-seals.mjs'
import { readAFullList } from './a-full-list-read.mjs'

let theLauncher = null
let launcherWasSet = false

/** Where this launcher runs, for the host and the unchanged sandbox path. */
function whereThisLauncherRuns() {
  if (theLauncher.instanceDir == null) return { host: true, name: 'host-worker-launcher', words: 'on the host' }
  return { host: false, name: 'sandbox-start', words: `in sandbox ${theLauncher.instance.instance}` }
}

export function useTheLauncher(context) {
  if (launcherWasSet) throw new Error('The launcher was already set')
  launcherWasSet = true
  theLauncher = context
}

/** A git plumbing line, read from `dir`, or null rather than a throw: nothing here may crash a run's finish. */
function gitLine(dir, ...args) {
  try {
    return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

/**
 * THE FOLDER A RUN'S FINISH READS (9 November 2026): the one its record names now, because the office's
 * finish checks HEAD there. A round the next-round door continued, which moved to a new worktree as it was told, has its
 * record name the new one, while the folder the launcher started in still holds the earlier run's sealed tip.
 * That run's finish submitted the tip, and the office refused it with 409. A folder other than the one it started in is
 * read only inside this sandbox's own folder, where the launcher already reads git; one named elsewhere, or none, leaves
 * the start folder read, and the finish log says so.
 */
function theFolderTheRunNamesNow(named, startFolder) {
  if (typeof named !== 'string' || named.trim() === '' || named === startFolder) return startFolder
  if (whereThisLauncherRuns().host) {
    finishLog(`run ${theLauncher.run}'s record names the folder ${named}; this host launcher reads ${String(startFolder)}, where it started.`)
    return startFolder
  }
  let inside = false
  try {
    const real = realpathSync(named), sandbox = realpathSync(theLauncher.instanceDir)
    inside = real === sandbox || real.startsWith(`${sandbox}/`)
  } catch {
    inside = false
  }
  if (inside) return named
  finishLog(`run ${theLauncher.run}'s record names the folder ${named}, which is not inside this sandbox's folder or cannot be read, so its finish reads ${String(startFolder)}, where it started.`)
  return startFolder
}

/**
 * True, false, or null when either commit could not be read (an unreadable worktree, or a cutFrom gone from history). A
 * cutFrom that starts with - is null before git sees it: no branch name or commit does, and git reads one as an option,
 * so a cutFrom of --output=<file> would have git rev-list open that file for writing.
 */
function hasCommitsBeyondTheCut(dir, cutFrom) {
  if (typeof cutFrom !== 'string' || cutFrom.startsWith('-')) return null
  const head = gitLine(dir, 'rev-parse', 'HEAD')
  const base = gitLine(dir, 'rev-parse', cutFrom)
  if (head === null || base === null) return null
  const count = gitLine(dir, 'rev-list', '--count', `${base}..${head}`)
  return count === null ? null : Number(count) > 0
}

/**
 * THE COMMIT A RUN'S CUT IS READ AT: the commit the run was filed with, while the run's cutFrom is still the name it was
 * recorded under, and otherwise the name. It is the office's own rule (theBaseARunNames in src/server/lib/sealed-tip.ts),
 * so a cut branch renamed or moved since the filing is read as the office reads it. A recorded commit of no shape the
 * office takes is null, not known, because the office refuses to read that run's base at all.
 */
function theCutARunIsReadAt(record, cutFrom) {
  const read = theRecordedBaseOfRun(record?.data ?? {})
  if ('fails' in read) return null
  return record?.data?.cutFrom === cutFrom ? read.base ?? cutFrom : cutFrom
}

/** Appended, never thrown: by the time this runs nobody is reading this helper's own stdout or stderr any more. */
export function finishLog(line) {
  try {
    appendFileSync(join(theLauncher.logs, 'finish.log'), `${clockStamp().instant} ${line}\n`)
  } catch {
    // The run's own end is still whatever the PATCH above made it, or did not; only the note of it is lost.
  }
}

/** The six words a session record may hold (`@shared/types.ts`'s `SESSION_STATES`); these three never take a further PATCH from here. */
const RUN_ALREADY_OVER = new Set(A_RUN_IS_OVER_IN)

/**
 * A RUN IS SEALED ON ITS EXIT ONLY WHEN IT SAYS IT SEALS, whether the seal is of its commits or of its records (as in
 * the inspector's refusal: the records finish sealed a run
 * whose last word said it was not done). True when its last message to its starter says it seals (tools/a-run-says-it-seals.mjs).
 * Otherwise the end is written with why, the finish log says so, and false tells the caller to leave the run as it was.
 * `ended` finishes the sentence "Its command ...".
 */
async function itSaysItSeals(before, ended, commandEnded, already) {
  const word = await theRunsLastWordToItsStarter(before)
  if (word.says === 'seals') return true
  const read = word.says === 'unread' ? `its last message to its starter could not be read (${word.why})` : word.message === null
    ? 'it sent its starter no message since it began' : `its last message to its starter, ${word.message}, ${word.says === 'holds' ? 'says it does not seal' : 'does not say it seals'}`
  const why = `Its command ${ended}, but ${read}, so the launcher left it as it was rather than seal it: a run is sealed on its ` +
    'exit only when it says it seals. It is finished by its agent, or by its starter, when it is done.'
  const kept = await theEndIsWritten(why, commandEnded)
  finishLog(`run ${theLauncher.run}'s command ${ended}, and ${read}; left as ${String(already)}; ${kept}`)
  return false
}

/**
 * THE RUN'S LAST WORD TO ITS STARTER, read by tools/a-run-says-it-seals.mjs: its starter's ids (the name it was started as and
 * the agent its starter's session serves) and the messages the run's agent sent, from the office, with the run's own headers.
 * { says: 'seals' | 'holds' | 'silent', message } or { says: 'unread', why } when the office did not answer a read.
 */
async function theRunsLastWordToItsStarter(read) {
  const record = read?.status === 200 ? (read.body?.record ?? read.body) : null
  if (record === null) return { says: 'unread', why: 'the run record could not be read' }
  const agent = record.data?.servingAgentId ?? record.data?.servingAgent
  if (typeof agent !== 'string') return { says: 'unread', why: 'the run names no agent it serves' }
  const parentId = record.data?.parentAttachment
  const parent = typeof parentId === 'string' ? await askTheOffice(theLauncher.api, `/api/records/${encodeURIComponent(parentId)}`, { headers: theLauncher.aboutTheRun(theLauncher.owner) }) : null
  const parentData = parent?.status === 200 ? (parent.body?.record ?? parent.body)?.data : null
  const starterIds = [theLauncher.starter, parentData?.servingAgentId, parentData?.servingAgent].filter((one) => typeof one === 'string')
  // PAGE BY PAGE until the last word is known (theAgentsMessagesSince): one page of 50 read a busy agent's run as silent.
  let sent
  try {
    sent = await theAgentsMessagesSince(async (path) => {
      // THE WORDS ARE ASKED FOR BY NAME; an older office's 400 is retried without it.
      const page = await readAFullList((one) => askTheOffice(theLauncher.api, one, { headers: theLauncher.aboutTheRun(theLauncher.owner) }), path)
      if (page.status !== 200) throw new Error(`GET /api/messages answered ${String(page.status)}`)
      return page.body
    }, record, starterIds)
  } catch (error) {
    return { says: 'unread', why: error instanceof Error ? error.message : String(error) }
  }
  if (!sent.complete) return { says: 'unread', why: sent.why }
  const messages = sent.messages
  const said = whatTheRunSays(record, messages, starterIds)
  // A NARROW ANSWER IS NOT GUESSED AT: the run's last word is its body, so one that arrives without the words is unread.
  if (said.message !== null && typeof messages.find((one) => one?.id === said.message)?.body !== 'string') {
    return { says: 'unread', why: 'the messages answer did not carry the words of the run\'s last message' }
  }
  if (said.message !== null || typeof theLauncher.starter !== 'string') return said
  // A STARTER NAMED BY ITS HANDLE ONLY (its session names no servingAgentId): its registry id is asked once, by the profile
  // door, and the messages are read again against it. A host agent's id is its name, and a supervisor's run the launcher
  // filed names its id, so this is the rare case.
  const profile = await askTheOffice(theLauncher.api, `/api/participants/agent/${encodeURIComponent(theLauncher.starter)}/profile`, { headers: theLauncher.aboutTheRun(theLauncher.owner) })
  const id = profile.status === 200 ? (profile.body?.profile ?? profile.body?.participant ?? profile.body)?.id : null
  return typeof id === 'string' && !starterIds.includes(id) ? whatTheRunSays(record, messages, [...starterIds, id]) : said
}

/** How many reports the run's record says are linked to it, in either direction; 0 when the record could not be read. */
function theReportsLinkedTo(read) {
  return theReportIdsLinkedTo(read).length
}

/** Only reports on the record already read, in either direction; name each once even when several links reach it. */
function theReportIdsLinkedTo(read) {
  const links = read?.status === 200 && Array.isArray(read.body?.links) ? read.body.links : []
  return [...new Set(links.filter((one) => one?.other?.kind === 'report').map((one) => one.other.id))]
}

/**
 * WRITE A ROUND'S END THAT LEAVES THE RUN AS IT IS: its `detail` and how its command ended. The office reads the first
 * `commandEnded` on a run with no seal as the end of the round, records why it was not sealed, and tells the starter once
 * (src/server/lib/how-a-round-ended.ts). When the office refuses the write, nobody else would tell the starter, so this
 * launcher does, with the office's answer. Answers a sentence for the finish log.
 */
async function theEndIsWritten(why, commandEnded) {
  const kept = await askTheOffice(theLauncher.api, `/api/records/${encodeURIComponent(theLauncher.run)}`, { method: 'PATCH', headers: theLauncher.aboutTheRun(theLauncher.owner), body: { dataPatch: { detail: theLauncher.withStartExplanation(why), commandEnded } } })
  if (kept.status === 200) return 'the office tells its starter.'
  const told = await theStarterIsTold(
    `Run ${theLauncher.run}'s end could not be written`,
    `Run ${theLauncher.run}: ${why} The office refused to write how its command ended (${theOfficeSaid(kept)}), so it did not record why the round has no seal.`,
  )
  return `its end could not be written (${theOfficeSaid(kept)}); ${told}`
}

/** Write a refused finish as crashed only after the office proves the run's process has ended. */
async function theRefusedFinishIsWritten(why, commandEnded) {
  const reading = await askTheOffice(theLauncher.api, `/api/runs/${encodeURIComponent(theLauncher.run)}/process-ended`, { headers: theLauncher.aboutTheRun(theLauncher.owner) })
  if (reading.status === 200 && reading.body?.ended === true && typeof reading.body?.says === 'string') {
    const kept = await askTheOffice(theLauncher.api, `/api/records/${encodeURIComponent(theLauncher.run)}`, { method: 'PATCH', headers: theLauncher.aboutTheRun(theLauncher.owner), body: { dataPatch: { state: 'crashed', detail: theLauncher.withStartExplanation(why), commandEnded } } })
    if (kept.status === 200) {
      theLauncher.theStateItsEndLeft = 'crashed'
      return 'written crashed; the office tells its starter.'
    }
    const told = await theStarterIsTold(
      `Run ${theLauncher.run}'s end could not be written`,
      `Run ${theLauncher.run}: ${why} The office refused to write how its command ended (${theOfficeSaid(kept)}), so it did not record why the round has no seal.`,
    )
    return `its end could not be written (${theOfficeSaid(kept)}); ${told}`
  }
  const processReading = reading.status === 404
    ? 'the process reading is unavailable on an older office (404)'
    : reading.status === 200 && reading.body?.ended === false && typeof reading.body?.says === 'string'
      ? `the process reading says ${reading.body.says}`
      : `the process reading is unreadable (${theOfficeSaid(reading)})`
  const kept = await theEndIsWritten(why, commandEnded)
  return `${processReading}; its state was left as it was; ${kept}`
}

/**
 * ONE MESSAGE TO THE RUN'S STARTER, filed as the kit files one (design/agents/kit/send-message.py). With the run's own
 * key it is the run telling its starter, under the served agent's name, because only that name can carry that key;
 * without one it goes with the starter's own identity, as before. Answers a sentence for the finish log. `about` says in
 * a few fixed words what the message is about.
 *
 * ONLY FOR WHAT THE OFFICE HAS NOT WRITTEN: a write the office refused, or a
 * record it could not read, so the run is not over and its key still works. A message under the run's key is in the run's
 * session, and the office reads the newest one to the starter as the run's own last word. So the run's report, its Codex
 * stop and its long run are said by the office, from the finishing write's `tellTheStarter` and its own clock.
 *
 * A MESSAGE THE OFFICE STORED AND ANSWERED 409 IS TOLD. The office stores a message to a registered agent that nothing
 * holds, routes it and answers 409 (whereAStoredMessageWaits). Such an answer is taken as a 201 is, for the short message
 * as well, and the message waits where the office routed it. The finish log gives the office's routed line after the
 * told sentence.
 *
 * A MESSAGE THE OFFICE REFUSES FOR ITS WORDS IS SAID ANOTHER WAY. Since wave 13w's key
 * door the office refuses a message whose words look as if they hold a key, and this launcher's
 * words carry paths, ids and the office's own sentences, any of which may have that shape. Until then a refusal was only
 * a line in finish.log, which the starter never reads. Every other 4xx answer refuses these words, so the refused words
 * go to finish.log with the office's answer, and a second, short message tells the starter, in words built only from this
 * run's id, which the office made, `about`, the refusal's status and code, and where finish.log is. A 5xx or no answer
 * is the office not taking messages at all, which a second message would meet too; that stays a line in finish.log.
 */
async function theStarterIsTold(title, body, about = 'how its command ended') {
  if (theLauncher.starter === null) return 'no starter is known to tell.'
  const send = (words) => askTheOffice(theLauncher.api, '/api/records', {
    method: 'POST',
    headers: theLauncher.aboutTheRun(theLauncher.starterSession),
    body: { kind: 'message', title: words.title, data: { body: words.body, to: [{ kind: 'agent', id: theLauncher.starter }], aboutRun: theLauncher.run } },
  })
  const sent = await send({ title, body })
  const waits = whereAStoredMessageWaits(sent, 'The message')
  if (sent.status === 201 || waits !== null) return `its starter ${theLauncher.starter} is told (message ${String(sent.body?.record?.id ?? '?')}).${waits ?? ''}`
  const notTold = `its starter ${theLauncher.starter} could not be told (${theOfficeSaid(sent)}).`
  if (typeof sent.status !== 'number' || sent.status < 400 || sent.status >= 500) return notTold
  finishLog(`the office refused the launcher's message about ${about}; its title was ${JSON.stringify(title)} and its words ${JSON.stringify(body)}.`)
  const code = typeof sent.body?.code === 'string' ? `, ${sent.body.code}` : ''
  const shortly = await send({
    title: `A message about run ${theLauncher.run} was refused`,
    body: `Run ${theLauncher.run}: the office refused the launcher's message to you about ${about} (${String(sent.status)}${code}), so its words are not in a message. They are in ${join(theLauncher.logs, 'finish.log')}, with the office's answer.`,
  })
  const shortWaits = whereAStoredMessageWaits(shortly, 'The short message')
  return shortly.status === 201 || shortWaits !== null
    ? `${notTold} A second, short message told it so (message ${String(shortly.body?.record?.id ?? '?')}); the refused words are on the line above.${shortWaits ?? ''}`
    : `${notTold} The second, short message was refused too (${theOfficeSaid(shortly)}); the refused words are on the line above.`
}

/** What the office's answer to a write with `tellTheStarter` says it did, as a sentence for the finish log. */
export function theOfficesLine(said) {
  const told = said.body?.tellTheStarter
  const secretary = told?.theUsageNoticeSecretary
  const andTheSecretary = typeof secretary?.told === 'string' ? ` It told the secretary who takes the usage notices (message ${secretary.told}).`
    : typeof secretary?.notTold === 'string' ? ` It did not tell the secretary who takes the usage notices: ${secretary.notTold}` : ''
  if (typeof told?.told === 'string') return `the office told its starter (message ${told.told}).${andTheSecretary}`
  if (typeof told?.notTold === 'string') return `the office did not tell its starter: ${told.notTold}${andTheSecretary}`
  return "the office's answer does not say whether it told its starter."
}

/**
 * WHETHER THE RUN'S KEY WAS REFUSED AT THE EXIT BECAUSE THE RUN WAS ALREADY OVER (theRunEndedBeforeItsCommand). Only a
 * 403 on the run's own key is asked about. One more read, as the starter and without the run key, must show the run in
 * a state it is over in. When it does not, finish.log says what it showed, and the 403 stays a fault as before.
 */
async function theRunWasEndedBeforeItsCommand(before) {
  if (before.status !== 403 || theLauncher.runKey === null) return false
  const again = await askTheOffice(theLauncher.api, `/api/records/${encodeURIComponent(theLauncher.run)}`, { headers: theLauncher.headers(theLauncher.starterSession) })
  const state = again.status === 200 ? (again.body?.record ?? again.body)?.data?.state : undefined
  if (theRunEndedBeforeItsCommand(before.status, true, state)) return true
  finishLog(`run ${theLauncher.run}'s key was refused at its command's end (${theOfficeSaid(before)}), and a read as its starter without that key ${again.status === 200 ? `shows it ${JSON.stringify(state)}, not over` : `was answered ${theOfficeSaid(again)}`}; so the refusal is a fault, not a seal.`)
  return false
}

/** The one sentence for that case, in finish.log and on stderr. */
function itEndedBeforeItsCommand() {
  return `run ${theLauncher.run} sealed itself, or somebody ended it, before its command exited; its key was revoked in that write, so what served it and its usage receipt are what that write carried.`
}

/**
 * THE CODEX THREAD THE RUN'S OUTPUT FILE NAMES, in the first `thread.started` line `codex exec --json` printed, or null.
 * @param {string} path
 * @returns {string | null}
 */
function theCodexThreadIn(path) {
  let text = ''
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return null
  }
  for (const line of text.split('\n')) {
    try {
      const event = JSON.parse(line)
      if (event?.type === 'thread.started' && typeof event.thread_id === 'string') return event.thread_id
    } catch {
      // Not a line of codex exec --json; the thread is named on one of its own.
    }
  }
  return null
}

/**
 * THE RUN THIS ROUND CONTINUES, AS ITS RECEIPT NEEDS IT (an answer, item 1; wave 13s round 42).
 * A round's record has a `derived_from` link to the run it follows (`--continues`, which `sandbox.mjs round` passes),
 * and it continues that run when its command resumes a conversation (theCommandResumesAConversation). Its own usage is
 * then what its command reported less what that run's own output reported at its end, so that run's output file,
 * logs/<that run>/out in this sandbox, is read here. Null for a run with no such link, and for a round whose command
 * resumes nothing (round 54's refusal, item 1): it follows that run in a new conversation, and what it reported is its
 * own. A run with more than one link, whose file cannot be read, or whose command is not read, is given with words
 * saying why, and its receipt then says so (src/config/usage.mjs).
 * @param {{ status: number | null, body?: any }} before The run's record, as read when its command ended.
 * @returns {import('../src/config/usage.mjs').ThePreviousRun}
 */
function theRunItContinues(before) {
  const links = Array.isArray(before.body?.links) ? before.body.links : []
  const continued = links.filter((link) => link?.type === 'derived_from' && link.isBacklink === false && link.other?.kind === 'session')
  if (continued.length === 0) return null
  const resumes = theCommandResumesAConversation(theLauncher.command ?? [])
  if (resumes === false) return null
  const ids = continued.map((link) => String(link.other.id))
  if (ids.length > 1) return { run: ids.join(' and '), unread: `run ${theLauncher.run} is derived from ${ids.length} runs, so which one it continues is not known` }
  const id = ids[0]
  if (resumes === null) return { run: id, unread: "its command is not a Claude Code or Codex command line, so whether it resumed that run's conversation is not known" }
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return { run: id, unread: 'its id cannot name a folder' }
  if (whereThisLauncherRuns().host) return { run: id, unread: 'the host launcher has no recorded path to the earlier run output' }
  return theOutputOfTheRunItContinues(id, join(theLauncher.instanceDir, 'logs', id, 'out'))
}

/**
 * WHAT SERVED A CLAUDE CODE OR CODEX RUN, WRITTEN WHEN ITS COMMAND ENDS (HB1, round 36, for
 * Codex). Every path of finishOrCrashTheRun calls this first, the run that is already over included, because a worker
 * that says finished itself is the usual case. The Claude Code reading is src/config/claude-code-served.mjs, and the
 * Codex reading is theServedOfACodexRun in src/config/runtime-served.mjs, from the rollout of the thread the output
 * file's thread.started line names. The write is sent with the run as the session, which is the one writer of
 * `served` besides the person and the secretary (assertMayWriteServed). A `served` already on the record is left as
 * it is. dsh writes its own, from its stop hook, and the launcher starts no other runtime. Every outcome goes to
 * finish.log.
 */
async function theServedIsWritten(before, endedFirst) {
  const record = before.status === 200 ? (before.body?.record ?? before.body) : null
  if (record === null) {
    if (endedFirst) return
    finishLog(`run ${theLauncher.run}'s record could not be read (${theOfficeSaid(before)}), so the launcher cannot tell whether it is a Claude Code run, and wrote nothing about the model that answered.`)
    return
  }
  const codex = aRuntimeIsCodex(record.data?.runtime)
  if (record.data?.runtime !== 'claude-code' && !codex) return
  const stored = record.data?.served
  if (stored !== undefined && stored !== null) {
    finishLog(`run ${theLauncher.run} already holds what served it (model ${JSON.stringify(stored.model)}), so the launcher left it as it was.`)
    return
  }
  const briefPath = theLauncher.mode === 'agent' ? (theLauncher.chosen.brief ?? null) : null
  const { served, said } = codex
    ? theServedOfACodexRun({ thread: theLauncher.WAIT ? null : theCodexThreadIn(theLauncher.outPath), env: theLauncher.childEnv, sinceMs: Date.parse(theLauncher.start.startedAt) })
    : theServedOfAClaudeCodeRun({ outPath: theLauncher.WAIT ? null : theLauncher.outPath, env: theLauncher.childEnv, cwd: theLauncher.cwd, startedAt: theLauncher.start.startedAt, briefPath })
  if (codex && briefPath !== null) {
    try {
      served.briefBytes = statSync(briefPath).size
    } catch {
      // The brief is gone by the time the run ended; its size stays "not reported", as the Served shape says.
    }
  }
  const wrote = await askTheOffice(theLauncher.api, `/api/records/${encodeURIComponent(theLauncher.run)}`, { method: 'PATCH', headers: theLauncher.aboutTheRun(theLauncher.owner), body: { dataPatch: { served } } })
  finishLog(
    wrote.status === 200
      ? `run ${theLauncher.run}'s model that answered is recorded as ${JSON.stringify(served.model)}: ${said}`
      : `run ${theLauncher.run}'s model that answered could not be recorded (${theOfficeSaid(wrote)}); what was read: ${said}`,
  )
}

/**
 * THE RUN'S USAGE RECEIPT, read from the envelope its command printed last (milestone M8).
 *
 * A CODEX RUN is read the same way from the last `turn.completed` event `codex exec --json` printed (codexUsage in
 * src/config/usage.mjs, the message worker's own rule). Codex gives no cost, and which Codex login paid is not known
 * here, so both are "not reported". A Codex run that reported no usage is told why from its own output, the signal
 * that stopped it included. AN OPENCODE RUN gets the sum of the step_finish events `opencode run --format json` printed,
 * each one step's own tokens and cost (theReceiptOfAnEndedOpenCodeCommand), or words
 * saying there were none. A run of any other runtime gets no receipt from the launcher.
 *
 * A ROUND THAT CONTINUES ANOTHER (wave 13s round 42). `codex exec resume` reports its thread's total
 * so far, and `claude -p --continue` its conversation's cost so far, so the round's own share is that less what the run
 * it continues reported at its end (theRunItContinues). When that cannot be read, the receipt says so in words and
 * keeps no total as the round's. A round linked to a run it follows in a new conversation resumes nothing, and its
 * receipt is what its own command reported.
 *
 * ONE WRITER (the same answer, item 2). The receipt replaces the stored one whole (theReceiptWrittenOver), so no
 * words of an earlier write are left beside these numbers, unless this reading has no numbers and the stored receipt has
 * some: that receipt then stays, and only these words are added to it.
 *
 * A Claude Code run started here runs `claude -p --output-format json` (theClaudeCodeCommand in tools/sandbox.mjs), so
 * the last line of its output file is the envelope, and src/config/usage.mjs reads it by the same rule as an inspector's
 * check (theUsageIsKept in tools/the-inspector.mjs). A run that failed still printed an envelope, error_max_turns
 * included, and its tokens were spent, so it is written whatever the exit was. A number the envelope does not give
 * stays absent, which the receipt and its page say as "not reported". Which login paid and which sandbox ran it are
 * written beside the numbers, and outside spending already on the receipt is kept.
 *
 * IT NEVER STOPS THE RUN. A receipt that cannot be written is said in one sentence on stderr and in finish.log, and
 * the finish or crash below goes on. A run that finished itself less than fifteen minutes ago still has a key that may
 * read its record and store its receipt (an agreement, aFinishedRunStoresOnlyItsReceipt in
 * src/server/lib/records.ts), so its receipt is written here over the one its seal carried. A run whose key was refused
 * because it was already over keeps the receipt its last write carried, and the sentence says so instead of a fault
 * (theRunEndedBeforeItsCommand).
 */
async function theReceiptIsWritten(before, endedFirst, signal) {
  if (endedFirst) {
    finishLog(itEndedBeforeItsCommand())
    process.stderr.write(`${whereThisLauncherRuns().name}: ${itEndedBeforeItsCommand()}\n`)
    return
  }
  const record = before.status === 200 ? (before.body?.record ?? before.body) : null
  const codex = aRuntimeIsCodex(record?.data?.runtime)
  const opencode = record?.data?.runtime === 'opencode'
  if (record !== null && record.data?.runtime !== 'claude-code' && !codex && !opencode) return
  let text = ''
  let unread = theLauncher.WAIT ? 'The run printed to its starter\'s screen, so its usage was not kept and nothing was reported.' : null
  try {
    text = theLauncher.WAIT ? '' : readFileSync(theLauncher.outPath, 'utf8')
  } catch (error) {
    unread = `The run's output file ${theLauncher.outPath} could not be read (${error?.code ?? String(error)}), so nothing was reported.`
  }
  const stored = record?.data?.usageReceipt
  const receipt = opencode
    ? theReceiptOfAnEndedOpenCodeCommand({ text, unread, stored, ranIn: whereItRan(theLauncher.childEnv) })
    : codex
    ? theReceiptOfAnEndedCodexCommand({
        text,
        unread,
        stopped: typeof signal === 'string' ? `by ${signal}` : null,
        previous: theRunItContinues(before),
        stored,
        ranIn: whereItRan(theLauncher.childEnv),
      })
    : theReceiptOfAnEndedCommand({
        text,
        noEnvelope: theLauncher.WAIT ? 'The run printed to its starter\'s screen, so its usage envelope was not kept and nothing was reported.' : `The run's output file ${theLauncher.outPath} holds no --output-format json envelope, so nothing was reported.`,
        previous: theRunItContinues(before),
        stored,
        paidBy: theLoginThatPaid(theLauncher.childEnv),
        ranIn: whereItRan(theLauncher.childEnv),
      })
  const written = theReceiptWrittenOver(stored, receipt)
  const wrote = record === null
    ? before
    : await askTheOffice(theLauncher.api, `/api/records/${encodeURIComponent(theLauncher.run)}`, { method: 'PATCH', headers: theLauncher.aboutTheRun(theLauncher.owner), body: { dataPatch: { usageReceipt: written } } })
  if (wrote.status === 200 && record !== null) {
    finishLog(`run ${theLauncher.run}'s usage receipt is recorded: ${JSON.stringify(written)}`)
    return
  }
  const sentence = `The run ran, and its usage receipt was not stored on run ${theLauncher.run} (${theOfficeSaid(wrote)}); nothing else about the run changed because of this.`
  finishLog(sentence)
  process.stderr.write(`${whereThisLauncherRuns().name}: ${sentence}\n`)
}

/**
 * HOW LONG THE LAUNCHER'S FINISH WAITS FOR THE OFFICE: the same five minutes the office tool waits for a write that may
 * seal a run (THE_LONGEST_FINISH_WAIT_MS, declared in src/config/finished.mjs), because the launcher's finish seals too
 * and a seal reads and hashes the whole worktree. A test may shorten it with SANDBOX_FINISH_WAIT_MS.
 */
const THE_FINISH_WAIT_MS = THE_LONGEST_FINISH_WAIT_MS

/**
 * HOW LONG THE LAUNCHER SEARCHES FOR THE RUN AFTER A FINISH GOT NO ANSWER AT ALL, all of it: a few reads, and the short
 * waits between the ones the office answered nothing to. A test may shorten it with SANDBOX_FINISH_READ_BACK_MS; each
 * read and each wait is worked out from it, so the search always fits inside it.
 */
const THE_FINISH_READ_BACK_MS = 60_000
/** How many reads that search makes. */
const THE_FINISH_READ_BACK_TRIES = 5
/** The longest wait between two reads, when the bound has room for it. */
const A_FINISH_READ_BACK_PAUSE_MS = 2_000

/** The bound, the wait between two reads, and one read's bound, worked out from the real bound or a test's shorter one. */
function theReadBackWaits() {
  const bound = aWaitATestMayShorten(THE_FINISH_READ_BACK_MS, 'SANDBOX_FINISH_READ_BACK_MS')
  const pause = Math.min(A_FINISH_READ_BACK_PAUSE_MS, Math.max(1, Math.floor(bound / (THE_FINISH_READ_BACK_TRIES * 2))))
  const each = Math.max(1, Math.floor((bound - pause * (THE_FINISH_READ_BACK_TRIES - 1)) / THE_FINISH_READ_BACK_TRIES))
  return { bound, pause, each }
}

/**
 * THE RUN READ BACK AFTER A FINISHING WRITE GOT NO ANSWER AT ALL. It says 'finished' when the run itself reads finished,
 * 'not-finished' when the office answered and the run does not say finished, and 'unread' when nothing could be read
 * within the bound. A status that is not 200 is an answer, and it is not read as finished.
 */
async function theRunReadBackAfterAnUnansweredFinish() {
  const { bound, pause, each } = theReadBackWaits()
  const end = Date.now() + bound
  let last = null
  for (let attempt = 0; attempt < THE_FINISH_READ_BACK_TRIES && Date.now() < end; attempt++) {
    if (attempt > 0) await new Promise((sleep) => setTimeout(sleep, Math.min(pause, Math.max(0, end - Date.now()))))
    if (Date.now() >= end) break
    const read = await askTheOffice(theLauncher.api, `/api/records/${encodeURIComponent(theLauncher.run)}`, {
      headers: theLauncher.aboutTheRun(theLauncher.owner),
      timeoutMs: Math.min(each, Math.max(1, end - Date.now())),
    })
    last = read
    if (read.status === null) continue
    if (read.status !== 200) return { read: 'unread', said: read }
    const data = (read.body?.record ?? read.body)?.data
    return aRunSaysItIsFinished(data !== null && typeof data === 'object' ? data : {}) ? { read: 'finished', said: read } : { read: 'not-finished', said: read }
  }
  return { read: 'unread', said: last }
}

/**
 * ONE LAUNCHER FINISH: the PATCH that finishes a run, waited for as long as a seal may take, and, when nothing answered
 * at all, the run read back before the finish is called refused. The git finish and the records finish both go through
 * here. Answers {done: true, readBack, said} when the run is finished, and {done: false, refused, said, why} when it is
 * not: `refused` says the office answered with a status that is not 200, and then nothing is read back.
 * @param {Record<string, unknown>} body
 */
async function theFinishIsWritten(body) {
  const said = await askTheOffice(theLauncher.api, `/api/records/${encodeURIComponent(theLauncher.run)}`, {
    method: 'PATCH', headers: theLauncher.aboutTheRun(theLauncher.owner), body,
    timeoutMs: aWaitATestMayShorten(THE_FINISH_WAIT_MS, 'SANDBOX_FINISH_WAIT_MS'),
  })
  if (said.status === 200) return { done: true, readBack: false, said }
  if (said.status !== null) return { done: false, refused: true, said }
  const back = await theRunReadBackAfterAnUnansweredFinish()
  if (back.read === 'finished') return { done: true, readBack: true, said }
  const found = back.read === 'not-finished'
    ? 'reading the run back did not find it finished: it reads unfinished'
    : `reading the run back could not read it (${back.said === null ? 'nothing answered' : theOfficeSaid(back.said)})`
  return { done: false, refused: false, said, why: `The finishing write got no answer (${theOfficeSaid(said)}), and ${found}` }
}

/**
 * ACCEPTANCE FINDING 2. Once the command this helper started (the gate, exec'd into it) actually
 * exits, this is the only place left that can still know its real exit code — see the header
 * comment on `relayInBackground` for why. A clean exit with commits past the worktree's cut and a report
 * linked to the run finishes it the ordinary way, which seals it (`sealFinishedRun`, invoked from any
 * PATCH to `finished` for a run with a `servingAgent`), and says the finish was the launcher's reading;
 * the same exit with no report leaves the run as it was and tells its starter (acceptance finding 48);
 * a clean exit with nothing new committed, or with a worktree or cut that could not be read, is never
 * left silent: with a report linked to the run, known absence of commits, and no declared
 * submission except records, it finishes with a records submission. Otherwise the reported run is left as it was
 * and its starter is told why. With no report its starter is told and it is written `orphaned`, so
 * its key goes too. A clean exit whose run record could not be read is left as it is, and its starter
 * is told that, because neither a report nor the run's state is known then (invariant 5). A non-zero
 * exit or a signal is recorded as `crashed`, naming what happened, and is never sealed.
 */
export async function finishOrCrashTheRun(code, signal) {
  // HOW THE COMMAND ENDED, ON EVERY WRITE THAT ENDS THE RUN (wave 13j round loop-1). Its first appearance on a run with
  // no seal is when the office records how the round ended and tells the starter once (src/server/lib/how-a-round-ended.ts),
  // so this launcher no longer sends its own message for the ends the office now says.
  const commandEnded = { at: nowStamp(), ...(typeof code === 'number' ? { code } : {}), ...(typeof signal === 'string' ? { signal } : {}) }
  // A MARK OF WAITING ON GO GOES WITH THE COMMAND (round 48), after every write its output asked for.
  if (theLauncher.goWaitEverMarked) theLauncher.theGoWaitIsWritten(null, `run ${theLauncher.run}'s command ended, so its mark of waiting on Go's usage limit is taken off.`, finishLog)
  await theLauncher.goWaitWrites
  const before = await askTheOffice(theLauncher.api, `/api/records/${encodeURIComponent(theLauncher.run)}`, { headers: theLauncher.aboutTheRun(theLauncher.owner) })
  const endedFirst = await theRunWasEndedBeforeItsCommand(before)
  // A FAILED READING MUST NOT COST THE RUN ITS FINISH OR ITS CRASH below, so its error is logged and the rest goes on.
  await theServedIsWritten(before, endedFirst).catch((error) =>
    finishLog(`run ${theLauncher.run}'s model that answered could not be read or recorded: ${error instanceof Error ? error.message : String(error)}`),
  )
  await theReceiptIsWritten(before, endedFirst, signal).catch((error) =>
    finishLog(`The run ran, and its usage receipt was not stored on run ${theLauncher.run}: ${error instanceof Error ? error.message : String(error)}.`),
  )
  const already = before.status === 200 ? (before.body?.record ?? before.body)?.data?.state : undefined
  if (typeof already === 'string') theLauncher.theStateItsEndLeft = already
  if (typeof already === 'string' && RUN_ALREADY_OVER.has(already)) {
    finishLog(`run ${theLauncher.run} already says ${already}; its command's end (code ${String(code)}, signal ${String(signal)}) changes nothing.`)
    return
  }
  if (code === 0) {
    // A READ OF THE RUN THAT FAILED IS NOT A RUN WITH NOTHING IN IT (the inspector's refusal, check
    // invariant 5). Whether a report is linked to the run, and whether it is already over, are both read off
    // its record; with no record read, neither is known. So nothing below guesses them: the starter is told the record
    // could not be read, and the run is left as it is.
    if (endedFirst) return
    if (before.status !== 200) {
      const told = await theStarterIsTold(
        `Run ${theLauncher.run}'s record could not be read when its command ended`,
        `Run ${theLauncher.run}: its command exited 0, and the launcher could not read the run's record (${theOfficeSaid(before)}), so it cannot tell whether a report is linked to it or whether it is already over. It left the run as it is.`,
      )
      finishLog(`run ${theLauncher.run}'s command exited 0, but its record could not be read (${theOfficeSaid(before)}); left as it is; ${told}`)
      return
    }
    // THE FOLDER IS THE ONE THE RUN'S RECORD NAMES NOW, as the cut below is (theFolderTheRunNamesNow).
    const dir = theFolderTheRunNamesNow((before.body?.record ?? before.body)?.data?.workingDirectory, theLauncher.mode === 'agent' ? theLauncher.worktree : theLauncher.runWorkingDirectory)
    // THE CUT IS NAMED AS THE RUN'S RECORD NAMES IT NOW, as the office names it (theBaseARunNames in
    // src/server/lib/sealed-tip.ts): a cutFrom changed after the filing is the one read, and the launcher's own only
    // where the record names none.
    const named = (before.body?.record ?? before.body)?.data?.cutFrom
    const cutFromHere = typeof named === 'string' && named.trim() !== '' ? named : theLauncher.mode === 'agent' ? theLauncher.cutFrom : theLauncher.runCutFrom
    const cutAt = cutFromHere === null ? null : theCutARunIsReadAt(before.body?.record ?? before.body, cutFromHere)
    const has = dir !== null && cutAt !== null ? hasCommitsBeyondTheCut(dir, cutAt) : null
    if (has !== true) {
      // A RUN THAT ENDED WITH NOTHING TO SEAL IS NOT LEFT SILENT. A worker whose work is reading, not code,
      // always ended here, and was left saying running while
      // nobody was told: a reader of wave 13n ended at 09:38 on 29 September 2026, and its supervisor found out at
      // 10:31. With a report linked to it, the checks below decide whether it can finish as records. With none, its
      // starter is told first, while the run's key still proves the run, and then it is written orphaned: nothing holds it
      // and it never said. That is a state that ends a run (RUN_IS_OVER_STATES in src/server/lib/keys.ts), so its key goes
      // in that same write; `unknown` would have kept the key of a run whose command has ended.
      const ended = has === null ? 'exited 0, and its worktree or the branch it was cut from could not be read' : `exited 0 with no commits beyond ${cutFromHere}`
      if (theReportsLinkedTo(before) > 0) {
        // NEVER REPLACE THE RUN'S DECLARED WORK WITH LESS (the inspector; USER.md invariant 2).
        // A report does not turn files, git or mixed work into
        // records alone. An unreadable worktree or cut does not prove there are no commits to seal either.
        // Read the submission from the same record as the reports; leave the run unchanged and tell its starter.
        const submission = (before.body?.record ?? before.body)?.data?.submission
        if (submission !== undefined && submission?.kind !== 'records') {
          // The inspector's note: kinds.ts reads an absent kind as git; say that reading.
          const kind = submission?.kind === undefined ? 'git' : String(submission.kind)
          const declared = submission?.kind === undefined
            ? 'a submission with no kind, which the office reads as git'
            : `a ${kind} submission`
          const why = `Its command ${ended}, and a report is linked to it. It declared ${declared}. The launcher does not replace a declared submission. The run's agent or its starter finishes it with the work it declared.`
          const kept = await theEndIsWritten(why, commandEnded)
          finishLog(`run ${theLauncher.run}'s command ${ended}, with a report; left as ${String(already)} because it declared ${declared}; ${kept}`)
          return
        }
        if (has === null) {
          const why = `Its command ${ended}, and a report is linked to it. Whether it holds commits is not known, so the launcher did not finish it. The run's agent or its starter finishes it once its work can be read.`
          const kept = await theEndIsWritten(why, commandEnded)
          finishLog(`run ${theLauncher.run}'s command ${ended}, with a report; left as ${String(already)} because whether it holds commits is not known; ${kept}`)
          return
        }
        // RECORDS ARE SOMETHING THE LAUNCHER CAN FINISH (a report). Like finding 48's git finish,
        // the detail says whose reading it is.
        // KEEP EVERY DECLARED RECORD (the inspector;
        // USER.md invariant 2). A records submission may name problems or proposals as well as reports.
        // Keep its order, then add only reports linked on the record already read, each record once.
        // The office tells the starter of a finish or an unsealed end. If it refuses to record the end too,
        // the launcher tells the starter both refusals.
        // A RECORDS FINISH IS A SEAL TOO (the inspector's refusal), so it is made only when
        // the run's last word says it seals, as the git seal below is.
        if (!(await itSaysItSeals(before, `${ended}, with a report`, commandEnded, already))) return
        const declared = submission?.records ?? []
        const reports = theReportIdsLinkedTo(before)
        const records = [...new Set([...declared, ...reports])]
        const detail = `Finished by the launcher, which read its command's clean exit (${ended}) and a report linked to it; the agent did not say finished itself.`
        const finish = await theFinishIsWritten({
          // NO REMINDER BEFORE THE SEAL (src/server/lib/before-the-seal.ts): the agent's command has ended, so nobody
          // is left to read one, and a reminder in place of this seal would leave the run unfinished.
          dataPatch: { state: 'finished', submission: { kind: 'records', records }, detail: theLauncher.withStartExplanation(detail), commandEnded }, remindBeforeTheSeal: false, tellTheStarter: 'ended-with-its-report',
        })
        if (finish.done) {
          theLauncher.theStateItsEndLeft = 'finished'
          finishLog(finish.readBack
            ? `run ${theLauncher.run}'s command ${ended}, with a report; ${THE_FINISH_ANSWER_WAS_LATE}; finished with a records submission naming ${records.join(', ')}.`
            : `run ${theLauncher.run}'s command ${ended}, with a report; finished with a records submission naming ${records.join(', ')}; ${theOfficesLine(finish.said)}`)
          return
        }
        const why = finish.refused
          ? `Its command ${ended}, and a report is linked to it. The office refused to finish it with a records submission: ${theOfficeSaid(finish.said)}`
          : `Its command ${ended}, and a report is linked to it. ${finish.why}. The run was not finished.`
        const kept = await theRefusedFinishIsWritten(why, commandEnded)
        finishLog(`run ${theLauncher.run}'s command ${ended}, with a report, but it could not be finished with a records submission (${finish.refused ? theOfficeSaid(finish.said) : finish.why}); ${kept}`)
        return
      }
      // NO REPORT STILL MEANS ORPHANED, even when git cannot be read (USER.md invariant 2).
      // This claims no successful submission:
      // it records the ended command with no account of its work, states the failed read, and revokes its key.
      const why = `Its command ${ended}, and no report is linked to it. Nothing runs for it any more, and it never said whether it did its work.`
      // THE OFFICE TELLS THE STARTER, from the write itself (wave 13j round loop-1): the orphaning ends the round without a
      // seal, and the office records why and wakes the starter once. Only a refused write is this launcher's to say.
      const said = await askTheOffice(theLauncher.api, `/api/records/${encodeURIComponent(theLauncher.run)}`, { method: 'PATCH', headers: theLauncher.aboutTheRun(theLauncher.owner), body: { dataPatch: { state: 'orphaned', detail: theLauncher.withStartExplanation(why), commandEnded } } })
      if (said.status === 200) {
        theLauncher.theStateItsEndLeft = 'orphaned'
        finishLog(`run ${theLauncher.run}'s command ${ended}, with no report; written orphaned; the office tells its starter.`)
        return
      }
      const corrected = await theStarterIsTold(
        `Run ${theLauncher.run} could not be written orphaned`,
        `Run ${theLauncher.run}: ${why} The office refused to write it orphaned (${theOfficeSaid(said)}), so it still says ${String(already)} and its key still works.`,
      )
      finishLog(`run ${theLauncher.run}'s command ${ended}, with no report, but it could not be written orphaned (${theOfficeSaid(said)}); ${corrected}`)
      return
    }
    // A RUN THAT FILED NO REPORT IS NOT FINISHED HERE. Acceptance finding 48 (block f-48),
    // an ask of 23 September 2026. A supervisor under `claude -p`
    // ends its process whenever it ends a turn, and a clean exit with commits past the cut was read as done, which
    // sealed wave 3 in the middle and queued a check of it. A worker that exits cleanly but forgot its report
    // would likewise be sealed, and then refused. So a run with no report linked to it is left as it was: its own
    // words say why, and its starter is told in one message.
    const reports = theReportsLinkedTo(before)
    if (reports === 0) {
      const why =
        `Its command exited 0 with commits beyond ${cutFromHere}, and no report is linked to it, so the launcher left it as it ` +
        'was rather than finish it: a clean exit is not the agent saying it is done, and a check refuses a run with no ' +
        'report. It is finished by its agent, or by its starter, once its report is in.'
      const kept = await theEndIsWritten(why, commandEnded)
      finishLog(`run ${theLauncher.run}'s command exited 0 with commits beyond ${cutFromHere} and no report; left as ${String(already)}; ${kept}`)
      return
    }
    // A RUN IS SEALED HERE ONLY WHEN IT SAYS IT SEALS (9 November 2026). A Terra map
    // round wrote in its report that it was not done, and a clean exit with commits and a report sealed it and queued a check
    // its starter had to stop. So the run's last message to its starter is read by the rule the secretary's seal-wait used
    // (tools/a-run-says-it-seals.mjs). A run that says it does not seal, says nothing of a seal, or whose words could not be
    // read is left as it was: the office records why there is no seal and tells its starter once, as for a run with no report.
    if (!(await itSaysItSeals(before, `exited 0 with commits beyond ${cutFromHere} and a report`, commandEnded, already))) return
    const tip = gitLine(dir, 'rev-parse', 'HEAD')
    const finish = await theFinishIsWritten({
      // THE FINISH SAYS WHOSE READING IT IS (finding 48): the launcher's, of a clean exit, and not the agent's own word.
      // AND NO REMINDER BEFORE THE SEAL, for the reason given at the records finish above.
      dataPatch: { state: 'finished', tip, detail: theLauncher.withStartExplanation(`Finished by the launcher, which read its command's clean exit with commits beyond ${cutFromHere} and a report linked to it; the agent did not say finished itself.`), commandEnded }, remindBeforeTheSeal: false,
    })
    if (finish.done) {
      theLauncher.theStateItsEndLeft = 'finished'
      finishLog(finish.readBack
        ? `run ${theLauncher.run}'s command exited 0 with commits beyond ${cutFromHere}; ${THE_FINISH_ANSWER_WAS_LATE}; finished at ${String(tip)}.`
        : `run ${theLauncher.run}'s command exited 0 with commits beyond ${cutFromHere}; finished at ${String(tip)}.`)
      return
    }
    // A REFUSED FINISH IS STILL THE END OF THE ROUND (wave 13j round loop-1): the end is written, so the office records why
    // there is no seal and tells the starter, rather than this line in finish.log being the only account of it.
    const kept = await theRefusedFinishIsWritten(finish.refused
      ? `Its command exited 0 with commits beyond ${cutFromHere} and a report, and the office refused to finish it: ${theOfficeSaid(finish.said)}`
      : `Its command exited 0 with commits beyond ${cutFromHere} and a report. ${finish.why}. The run was not finished.`, commandEnded)
    finishLog(`run ${theLauncher.run}'s command exited 0 with commits beyond ${cutFromHere}, but it could not be finished (${finish.refused ? theOfficeSaid(finish.said) : finish.why}); ${kept}`)
    return
  }
  const where = whereThisLauncherRuns().words
  const ended =
    signal !== null && signal !== undefined
      ? `Its command ${where} was ended by signal ${signal}.`
      : `Its command ${where} exited ${String(code)}.`
  // AN OPENCODE RUN THAT ENDED ON GO'S USAGE LIMIT IS A QUOTA STOP (round 47), written as the session hook writes a Claude
  // stop, so the router skips every Go row until the reset and the owner is told once. Any other end is the plain crash.
  // The stop cause also keeps where its reset came from, in the reader's words, for every place that shows the reset
  // (round 48).
  const record = before.status === 200 ? (before.body?.record ?? before.body) : null
  const goLimit = !theLauncher.WAIT && record?.data?.runtime === 'opencode' ? theGoLimitAnOpenCodeRunEndedOn(theLastLinesOf(theLauncher.outPath)) : null
  const resets = goLimit === null ? null : clockStamp(() => new Date(goLimit.resetsAtMs))
  const goStop = goLimit === null ? {} : {
    closedAt: commandEnded.at,
    closedHow: 'provider-event',
    closedBecause: `OpenCode Go stopped the run at its usage limit: "${goLimit.said}". The office counts Go as limited until ${resets.stamp} ${resets.timeZone}, ${goLimit.resetFrom}.`,
    stopCause: { kind: goLimit.kind, said: goLimit.said, at: clockStamp(() => new Date(goLimit.atMs)).instant, resetsAt: resets.instant, resetFrom: goLimit.resetFrom },
  }
  // The host worker-run door belongs to the starter. This worker's key cannot ask it.
  // A CODEX RUN THAT ENDED AT A RATE OR USAGE LIMIT, OR AT CAPACITY, whatever its model: both are read only from Codex's own
  // final events, and no list of model names is read. The model named is the Casting row's native model, else the start's.
  const stopModel = aModelToName(theLauncher.startValues?.selection?.native.model ?? theLauncher.startValues?.model ?? null)
  const codexEnded = code !== 0 && code !== null && signal == null && aRuntimeIsCodex(theLauncher.runRuntime) &&
    aCommandsProgram(theLauncher.chosen.command.slice(theLauncher.theProgramAt(theLauncher.chosen.command))).isCodex
  /** @type {'codex-usage-limit' | 'codex-capacity' | undefined} */
  const codexStop = !codexEnded ? undefined : codexRateOrUsageLimitAtTheEnd(theLauncher.outPath) ? 'codex-usage-limit' : codexCapacityAtTheEnd(theLauncher.outPath) ? 'codex-capacity' : undefined
  const notice = codexStop === undefined ? '' : ` ${aCodexStopNotice(codexStop, stopModel)}`
  const detail = `${ended}${notice}`
  const nativeRefusal = code !== 0 && code !== null && signal == null && theLauncher.startValues?.selection?.casting != null
    ? theNativeSelectionRefusal(theLauncher.runRuntime, theLastLinesOf(theLauncher.outPath)) : null
  // AN OPTION REFUSAL OF AN EFFORT THAT IS NOT THE ROW'S OWN HOLDS NOTHING (wave 13n round BK): the row's own effort was
  // not tried, so the refusal says nothing about the row. The sentence says so in the log and in the crash detail. A
  // refusal of the model still holds the row.
  const notHeld = nativeRefusal === null ? null : theRefusalOfAnEffortNotTheRows(theLauncher.startValues, nativeRefusal)
  if (nativeRefusal !== null && notHeld === null) {
    const selected = theLauncher.startValues.selection.casting
    const held = await askTheOffice(theLauncher.api, `/api/casting/rows/${selected.id}/hold`, {method:'POST',headers:theLauncher.aboutTheRun(theLauncher.owner),body:{revision:selected.revision,run: theLauncher.run,refusal:nativeRefusal}})
    finishLog(held.status === 200 ? `Casting ${selected.id} is held after native refusal: ${nativeRefusal.said}` : `Casting ${selected.id} could not be held after native refusal (${theOfficeSaid(held)}).`)
  }
  if (notHeld !== null) finishLog(notHeld)
  const knownStop = nativeRefusal !== null || codexStop !== undefined || goLimit !== null ||
    isACauseTheyMustActOn(theStopCauseOf(record?.data ?? {})?.kind) || theStopCauseAtTheEndOfTheTranscript(theLauncher.outPath) !== null
  const unknownWords = code !== 0 && code !== null && signal == null && !knownStop ? ` ${UNKNOWN_STOP_CAUSE}` : ''
  // THE OFFICE TELLS THE STARTER OF A CODEX STOP, from `tellTheStarter` on the crash write, in the same sentence. The write
  // carries the kind and the model's name, or null for a model the start did not name, and no other words.
  const tellTheStarter = codexStop
  const crash = { dataPatch: { state: 'crashed', detail: theLauncher.withStartExplanation(detail) + (nativeRefusal === null ? '' : notHeld !== null ? ` ${notHeld}` : ` Native ${nativeRefusal.kind} refusal: ${nativeRefusal.said}`) + unknownWords, commandEnded, ...goStop } }
  const said = await askTheOffice(theLauncher.api, `/api/records/${encodeURIComponent(theLauncher.run)}`, {
    method: 'PATCH',
    headers: theLauncher.aboutTheRun(theLauncher.owner),
    body: { ...crash, ...(tellTheStarter === undefined ? {} : { tellTheStarter, theModelItRanOn: stopModel }) },
  })
  if (said.status === 200) theLauncher.theStateItsEndLeft = 'crashed'
  const goWords = goLimit === null ? '' : ` OpenCode Go's usage limit stopped it; Go counts as limited until ${resets.stamp} ${resets.timeZone}, ${goLimit.resetFrom}.`
  const toldWords = tellTheStarter === undefined ? '' : ` ${theOfficesLine(said)}`
  finishLog(
    said.status === 200
      ? `run ${theLauncher.run} is marked crashed: ${ended}${goWords}${notice}${unknownWords}${toldWords}`
      : `run ${theLauncher.run}'s command ended (code ${String(code)}, signal ${String(signal)}), but it could not be marked crashed (${theOfficeSaid(said)}).${goWords}${notice}`,
  )
}

