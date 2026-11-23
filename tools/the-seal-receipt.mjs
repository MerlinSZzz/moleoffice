// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE USAGE RECEIPT A RUN'S OWN SEAL CARRIES, under a decision in wave 13s round 34. The
 * secretary's agreement, message jRM57hUWbIBn, is under six conditions (message Xbgm8gDFfAY9, quoted in 0J-bDsdC9EeP).
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * The seal revokes the run's key, and no write is accepted after it (messages 5gg-Q_azbInF and fWNeIBeL3Meu).
 * So the launcher's receipt at the command's exit is skipped for a run that sealed itself (theReceiptIsWritten in
 * tools/sandbox-start.mjs), and the only other route, tools/usage-so-far.mjs, runs only when an agent remembers to.
 * office_request (tools/office-request.mjs) sends the seal itself, so it adds the receipt to the seal's own PATCH: the
 * numbers come from the runtime's own log, never from an agent's memory, and nothing is written after the seal.
 *
 * ---------------------------------------------------------------------------------------
 * THE SIX CONDITIONS, each proved in tests/a-seal-carries-its-runs-own-receipt.test.ts
 * ---------------------------------------------------------------------------------------
 *
 *   1. ONLY THE RUN'S OWN SEAL (aSealOfThisRun in tools/office-request.mjs). A PATCH to state `finished` of the record MOLE_OFFICE_SESSION names, read from the tool's
 *      environment and never from the body, and only when the body carries no usageReceipt of its own.
 *   2. THE RUN'S OWN LOG, NAMED BY ITS OWN SESSION. Claude Code: the transcript named by CLAUDE_CODE_SESSION_ID. Codex:
 *      the rollout of the thread the run's own output file names in its thread.started line (MOLE_OFFICE_RUN_OUTPUT,
 *      set by tools/sandbox-start.mjs). dsh: the transcript of the session named by DSH_SESSION_ID, which dsh's own
 *      tool call hands in (tools/dsh-hooks/office-tool.mjs). No match: no numbers, and the receipt says so.
 *   3. NUMBERS OUT, NEVER CONTENT. The receipt holds counts, a model name of a model name's shape, and the file's path
 *      with the home folder left out. No reason given here quotes the file.
 *   4. THE SEAL IS NEVER HELD UP. The log is read from its end, at most THE_MOST_OF_A_LOG_READ bytes and for at most
 *      THE_LONGEST_LOG_READ_MS. Over either, or on a file that cannot be read, the seal goes with no numbers and says why.
 *   5. READ-ONLY, INSIDE ITS OWN FOLDERS. Every file is read by its real path, and only when that path is inside the
 *      runtime's own folder, so a planted link cannot make the tool read anything else. Nothing is written.
 *   6. IT SAYS WHAT IT IS. The receipt's source and words say it is self-reported: read by the run's own tool from its
 *      own log at the seal, not measured by the office.
 *
 * EVERY RUN'S OWN SEAL CARRIES ONE (wave 13s round 40; agreement ZbUh96UhT6YQ). A runtime whose log this tool
 * has no reader for gets a receipt that says so in words and holds no numbers. A seal revokes the run's key, so a seal
 * that carried nothing would leave a run that nobody can write a receipt for afterwards. Today that is every runtime
 * but Claude Code, Codex and dsh.
 *
 * IT IS JAVASCRIPT THAT IMPORTS NO TYPESCRIPT, because dsh loads office-request.mjs, which imports this file, and dsh
 * does not read TypeScript. How a log is read (conditions 3, 4 and 5) is in src/config/a-runs-own-log.mjs, which the
 * server shares for a run whose terminal ends.
 */

import { closeSync, openSync, readSync, realpathSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'

import { AN_ID, codeOf, insideItsOwnFolder, shownInAReceipt, theEndOf, theLastBytesOf, THE_MOST_OF_A_LOG_READ, theOwnLogOfARunOn, theRolloutOfTheCodexThread, withAModelOfItsShape } from '../src/config/a-runs-own-log.mjs'
import { theCredentialsFile, theLoginThatPaid } from '../src/config/claude-code-login.mjs'
import { theHomeNamedIn } from '../src/config/the-paths-of-a-system.mjs'
import { localStampOf, theMomentOfALocalStamp } from '../src/config/stopped-run-cause.mjs'
import { claudeTranscriptUsage, codexRolloutUsage, dshTranscriptUsage, keepingTheOutsideSpend, RECEIPT_NOT_REPORTED, whereItRan } from '../src/config/usage.mjs'
import { theTextOfTheTranscript, theTranscriptOfTheSession } from './dsh-hooks/served.mjs'

/** The most of a Codex run's output file read for its thread.started line, in bytes. */
const THE_MOST_OF_THE_OUTPUTS_HEAD = 64 * 1024

/**
 * A dsh SESSION ID, as one path segment that dsh's own encoder leaves as it is (encodeSegment in
 * @deepseek-ai/dsh-session-persistence-jsonl), so the folder is named by the id itself. Anything else names no file.
 */
const A_DSH_SESSION_ID = /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,200}$/

/** What a receipt read at a seal says it is (condition 6). */
export const SELF_REPORTED =
  "Self-reported: read by the run's own office tool from its own log as the run sealed itself, not measured by the office. " +
  "The run's last reply, after the seal, is not in it."

/** Whether any line of the text is stamped before `sinceMs`. */
function aLineStampedBefore(/** @type {string} */ text, /** @type {number} */ sinceMs) {
  for (const match of text.matchAll(/"timestamp":"([^"]{10,40})"/g)) {
    const at = Date.parse(match[1] ?? '')
    if (Number.isFinite(at) && at < sinceMs) return true
  }
  return false
}

/**
 * CLAUDE CODE: the transcript named by this run's own session id, in the folder Claude Code keeps for the run's working
 * directory, inside its own projects folder.
 * @param {Record<string, string | undefined>} env
 * @param {string[]} cwds
 * @returns {{ ok: true, path: string, root: string } | { ok: false, why: string }}
 */
function theClaudeTranscript(env, cwds) {
  const id = env['CLAUDE_CODE_SESSION_ID']
  if (typeof id !== 'string' || !AN_ID.test(id)) return { ok: false, why: 'Claude Code named no session id to this tool, so no transcript is this run\'s own.' }
  const credentials = theCredentialsFile(env)
  if (credentials === null) return { ok: false, why: 'no home folder is named, so Claude Code\'s own folder is unknown.' }
  const root = join(dirname(credentials), 'projects')
  for (const cwd of cwds) {
    const path = join(root, cwd.replace(/[^a-zA-Z0-9]/g, '-'), `${id}.jsonl`)
    const inside = insideItsOwnFolder(path, root)
    if (inside.ok) return { ok: true, path: inside.real, root }
    if (!inside.why.startsWith('no such file')) return { ok: false, why: `the transcript named by this run's session id: ${inside.why}.` }
  }
  return { ok: false, why: 'no transcript named by this run\'s session id is in Claude Code\'s folder for its working directory.' }
}

/**
 * CODEX: the thread the run's own output file names in its first thread.started line, then that thread's rollout
 * inside Codex's own sessions folder.
 * @param {Record<string, string | undefined>} env
 * @param {string} session
 * @returns {{ ok: true, path: string } | { ok: false, why: string }}
 */
function theCodexRollout(env, session) {
  const output = env['MOLE_OFFICE_RUN_OUTPUT']
  if (typeof output !== 'string' || output === '') return { ok: false, why: 'the launcher named no output file to this tool, so the run\'s Codex thread is unknown.' }
  let real
  try {
    real = realpathSync(output)
  } catch (error) {
    return { ok: false, why: `the run's output file could not be found (${codeOf(error)}).` }
  }
  if (!real.endsWith(`${sep}logs${sep}${session}${sep}out`)) return { ok: false, why: 'the output file named to this tool is not this run\'s own, so it was not read.' }
  let head = ''
  try {
    const fd = openSync(real, 'r')
    try {
      const buffer = Buffer.alloc(THE_MOST_OF_THE_OUTPUTS_HEAD)
      head = buffer.subarray(0, readSync(fd, buffer, 0, buffer.length, 0)).toString('utf8')
    } finally {
      closeSync(fd)
    }
  } catch (error) {
    return { ok: false, why: `the run's output file could not be read (${codeOf(error)}).` }
  }
  let thread = null
  for (const line of head.split('\n')) {
    try {
      const event = JSON.parse(line)
      if (event?.type === 'thread.started') {
        thread = event.thread_id
        break
      }
    } catch {
      // Not a line of codex exec --json; the thread is named on one of its own.
    }
  }
  if (typeof thread !== 'string' || !AN_ID.test(thread)) return { ok: false, why: 'the start of the run\'s output file names no Codex thread.' }
  return theRolloutOfTheCodexThread(thread, env)
}

/**
 * dsh: the transcript of the session DSH_SESSION_ID names, in dsh's own sessions folder for the run's working directory.
 * The project's newest session is never taken in its place.
 * @param {Record<string, string | undefined>} env
 * @param {string[]} cwds
 * @returns {{ ok: true, path: string } | { ok: false, why: string }}
 */
function theDshTranscript(env, cwds) {
  const id = env['DSH_SESSION_ID']
  if (typeof id !== 'string' || !A_DSH_SESSION_ID.test(id)) return { ok: false, why: 'dsh named no session of the run\'s own to this tool, so no transcript is this run\'s own.' }
  const named = env['DSH_HOME']
  const home = theHomeNamedIn(env)
  const dshHome = named !== undefined && named !== '' ? named : home === null ? null : join(home, '.dsh')
  if (dshHome === null) return { ok: false, why: 'no home folder is named, so dsh\'s own folder is unknown.' }
  const root = join(dshHome, 'sessions')
  for (const cwd of cwds) {
    const found = theTranscriptOfTheSession(dshHome, cwd, id)
    if (found === null) continue
    const inside = insideItsOwnFolder(found, root)
    return inside.ok ? { ok: true, path: inside.real } : { ok: false, why: `the transcript of the run's dsh session: ${inside.why}.` }
  }
  return { ok: false, why: 'no transcript of the run\'s dsh session is in dsh\'s folder for its working directory.' }
}

/**
 * THE RECEIPT THE RUN'S OWN SEAL CARRIES, whatever the run's runtime. `added` says, in one sentence for the model, what
 * was added and from which file, or why it holds no numbers.
 *
 * The run's filing time and the now are read with the plain JavaScript stamp functions of src/config/stopped-run-cause.mjs,
 * which give what parseStoredStamp and clockStamp give for a stamp the office wrote.
 * @param {{ record: any, env: Record<string, string | undefined>, cwd?: string, limits?: { most?: number, forMs?: number, now?: () => number } }} at
 * @returns {{ receipt: import('../src/shared/usage-receipts.ts').UsageReceipt, added: string }}
 */
export function theSealsReceipt({ record, env, cwd = process.cwd(), limits }) {
  const data = record?.data ?? {}
  const runtime = typeof data.runtime === 'string' && data.runtime !== '' ? data.runtime : null
  const session = String(env['MOLE_OFFICE_SESSION'] ?? '')
  const cwds = [...new Set([data.workingDirectory, cwd].filter((one) => typeof one === 'string' && one !== ''))]
  const beside = {
    paidBy: runtime === 'claude-code' ? theLoginThatPaid(env) : RECEIPT_NOT_REPORTED,
    ranIn: whereItRan({ SANDBOX_DIR: env['SANDBOX_DIR'] ?? data.sandbox?.folder }),
    readAt: localStampOf(new Date()),
  }
  /** @param {string} why */
  const inWords = (why) => {
    const says = `No numbers were read at the seal: ${why} ${SELF_REPORTED}`
    const receipt = { ...(runtime === null ? {} : { runtime }), source: "self-reported at the seal by the run's own office tool", says, ...beside }
    return { receipt: keepingTheOutsideSpend(data.usageReceipt, receipt), added: `A usage receipt with no numbers: ${why}` }
  }
  /**
   * @param {string} path
   * @param {import('../src/shared/usage-receipts.ts').UsageReceipt} read
   */
  const fromTheLog = (path, read) => {
    const where = shownInAReceipt(path, env)
    const receipt = keepingTheOutsideSpend(data.usageReceipt, {
      ...withAModelOfItsShape(read),
      source: `self-reported at the seal by the run's own office tool, from ${where}: ${String(read.source)}`,
      says: `${read.says === undefined ? '' : `${read.says} `}${SELF_REPORTED}`,
      ...beside,
    })
    const told = read.outputTokens === undefined ? 'no token counts' : `${String(read.outputTokens)} tokens out`
    return { receipt, added: `This run's usage receipt, read from its own log ${where} (${told}), went with the seal.` }
  }
  if (runtime === null) return inWords('the run\'s record names no runtime, so which log is its own is unknown.')
  if (runtime === 'dsh') {
    // The whole transcript, as the stop hook reads it (tools/dsh-hooks/stop.mjs): its numbers are summed over every
    // turn, so a transcript read in part would give a total that is too small.
    const found = theDshTranscript(env, cwds)
    if (!found.ok) return inWords(found.why)
    const read = theLastBytesOf(found.path, limits)
    if (!read.ok) return inWords(`${read.why}.`)
    if (!read.whole) return inWords(`the transcript of the run's dsh session is longer than ${String(limits?.most ?? THE_MOST_OF_A_LOG_READ)} bytes, and a part of it would give a total that is too small.`)
    const decoded = theTextOfTheTranscript(found.path, read.bytes)
    if (decoded.text === null) return inWords(`the transcript of the run's dsh session was not read: ${decoded.why}.`)
    return fromTheLog(found.path, dshTranscriptUsage(decoded.text))
  }
  if (runtime !== 'claude-code' && runtime !== 'codex') return inWords(`this office tool has no reader of ${theOwnLogOfARunOn(runtime)}.`)
  const sinceMs = theMomentOfALocalStamp(String(record?.createdAt ?? ''))
  if (sinceMs === null) return inWords('the run\'s filing time is not a stamp, so where its own part of the log begins is unknown.')
  const found = runtime === 'codex' ? theCodexRollout(env, session) : theClaudeTranscript(env, cwds)
  if (!found.ok) return inWords(found.why)
  const end = theEndOf(found.path, limits)
  if (!end.ok) return inWords(`${end.why}.`)
  if (!end.whole && runtime === 'claude-code' && !aLineStampedBefore(end.text, sinceMs)) {
    return inWords(`the last ${String(limits?.most ?? THE_MOST_OF_A_LOG_READ)} bytes of the transcript do not reach back to before the run began.`)
  }
  return fromTheLog(found.path, runtime === 'codex' ? codexRolloutUsage(end.text, sinceMs, end.whole) : claudeTranscriptUsage([end.text], sinceMs))
}
