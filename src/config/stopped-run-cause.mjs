// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A CLAUDE CODE SESSION SAID WHEN IT STOPPED, READ FROM ITS OWN TRANSCRIPT.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS IS A `.mjs` FILE IN `src/config` AND NOT A `.ts` FILE BESIDE IT
 * ---------------------------------------------------------------------------------------------
 *
 * Two callers need the same reading and they run in two different worlds:
 *
 *   · `tools/session-hook.mjs`, a plain Node script Claude Code runs. The Node on the PATH a hook
 *     is handed cannot read a `.ts` file (the hook's own header has the measurement), and this
 *     repository's plain-JavaScript modules for that caller already live in `src/config`.
 *   · `src/server/lib/reminders.ts`, the office's own sweep, which imports `.mjs` from `src/config`
 *     in several places already (`settings.mjs`, `visit-headers.mjs`, `world-header.mjs`).
 *
 * ONE FUNCTION, ONE PLACE, as invariant 9 of USER.md asks. The hook and the sweep both call
 * `theStopCauseInTheTranscript` and `thePatchThatClosesARun`; neither works the cause out again.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT A LIMIT LEAVES IN A CLAUDE CODE TRANSCRIPT, MEASURED
 * ---------------------------------------------------------------------------------------------
 *
 * Measured on this machine on 12 September 2026, against the transcript of the session that hit
 * its session limit on 11 September 2026 (12:55 local, `2026-09-11T16:55:08.628Z`):
 *
 * The transcript, a `.jsonl` file under `~/.claude/projects/`,
 * holds a line whose `type` is `assistant`, whose `message.model` is `<synthetic>`, whose
 * `message.content[0].text` is `You've hit your session limit · resets 7:10pm (Europe/London)`,
 * and which carries `"error":"rate_limit"`, `"isApiErrorMessage":true`, `"apiErrorStatus":429`.
 * The monthly quota leaves the same shape with different words and no reset time: `You've hit your
 * monthly spend limit. Run /usage-credits to manage your limit and keep using Fable 5.1 or switch
 * models to continue this chat.` A subagent killed at the same moment leaves a task-notification
 * whose text carries `<status>failed</status>` and `error type rate_limit, HTTP 429`.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT A LIMIT LEAVES IN A CODEX ROLLOUT, MEASURED
 * ---------------------------------------------------------------------------------------------
 *
 * Measured on this machine on 12 September 2026, against codex-cli 0.153.4. Codex writes one JSON
 * object per line at `~/.codex/sessions/<year>/<month>/<day>/rollout-<ISO>-<thread>.jsonl`, and a
 * turn that dies leaves its last line as
 *
 *   `{"timestamp":"…","ordinal":…,"type":"event_msg","payload":{"type":"task_complete",…,
 *     "error":{"message":"You've hit your usage limit. Visit … or try again at Sep 17th, 2026
 *     11:41 PM.","codex_error_info":"usage_limit_exceeded"}}}`
 *
 * So a codex error is a `task_complete` event whose `payload.error` carries the provider's own
 * machine-readable `codex_error_info` beside the words a person reads. The codex binary's own enum
 * names `usage_limit_exceeded`, `rate_limit_exceeded` and `unauthorized` beside a dozen ordinary
 * transport failures, and those three are the causes a person has to act on. A reset time, when the
 * message carries one, is phrased `try again at <moment>` rather than claude's `resets <moment>`.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT A GO LIMIT LEAVES IN AN OPENCODE RUN'S OUTPUT, READ FROM ITS CODE
 * ---------------------------------------------------------------------------------------------
 *
 * Read on 14 October 2026 from opencode 1.18.31's own code. No Go limit has been captured on this
 * machine, so this is what the code says it prints, not a measurement. OpenCode Go answers a request
 * over its limit with an API error whose response body names `GoUsageLimitError`. OpenCode then
 * retries up to five times, waiting as long as the response's `retry-after` header asks. While it
 * waits, `opencode run --format json` prints nothing: the retry is a session status, and that
 * format prints no status. Only when the retries are spent does it print one line
 *
 *   `{"type":"error","timestamp":<ms>,"sessionID":"…","error":{"name":"APIError","data":{"message":
 *     "…","statusCode":429,"isRetryable":…,"responseHeaders":{"retry-after":"…"},"responseBody":
 *     "…GoUsageLimitError…"}}}`
 *
 * and exit 1. So a run that ends on Go's limit can be read from its output, and `tools/sandbox-start.mjs`
 * reads it with `theGoLimitAnOpenCodeRunEndedOn`. A run still waiting on a long `retry-after` prints
 * nothing that can be read, and is not read here.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT WILL NOT DO
 * ---------------------------------------------------------------------------------------------
 *
 * IT READS ONLY ERROR LINES, so a person writing the words "usage limit" in a conversation is not
 * mistaken for a session that stopped. A synthetic assistant line, `isApiErrorMessage`, an `error`
 * word, a 4xx `apiErrorStatus` or a failed task-notification are the five shapes it accepts, and a
 * line carrying none of them is prose however much it talks about limits.
 *
 * IT NAMES A CAUSE IT READ, AND NOTHING WHEN IT READ NONE. `null` is a real answer: the transcript
 * did not say why the run stopped. The caller writes that absence into `closedBecause` rather than
 * inventing a cause — invariant 5 of USER.md.
 */

import { closeSync, fstatSync, openSync, readSync, statSync } from 'node:fs'

/** How much of the end of a transcript is read. Enough for the last turns; never the whole file. */
const MOST_BYTES_OF_TRANSCRIPT = 256 * 1024

/** How many of the last parsed lines are looked at. A transcript can hold thousands. */
const MOST_LINES_LOOKED_AT = 400

/** The three causes that are the person's to act on, and the words each is said in. Criterion M94. */
export const THE_CAUSES_THEY_MUST_ACT_ON = ['session-limit', 'quota', 'login']

/** Whether a cause is one the person has to act on, rather than an ordinary end. */
export function isACauseTheyMustActOn(kind) {
  return THE_CAUSES_THEY_MUST_ACT_ON.includes(kind)
}

/** One cause, in the words a person reads in the notice's first line. */
export function theCauseInWords(kind) {
  if (kind === 'session-limit') return 'a session limit'
  if (kind === 'quota') return 'a quota'
  if (kind === 'login') return 'a login'
  return 'a reason nobody named'
}

/**
 * THE MOMENT A STORED STAMP NAMES, read back the way localStampOf writes it, or null when it is not one. The same rule as
 * parseStoredStamp in src/shared/time.ts, for tools/session-hook.mjs, which runs under a Node that cannot read TypeScript.
 * @param {unknown} stamp
 * @returns {number | null}
 */
export function theMomentOfALocalStamp(stamp) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(String(stamp).trim())
  if (m === null) return null
  const ms = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])).getTime()
  return Number.isNaN(ms) ? null : ms
}

/** The local stamp a session record's dates are written in, to the second. Same shape as localStamp. */
export function localStampOf(when) {
  const at = when instanceof Date ? when : new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return (
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ` +
    `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`
  )
}

/**
 * THE INSTANT A TIME NAMES, written as local wall-clock with its offset, or null when the words name no moment. The same
 * shape as clockStamp's `instant` in src/shared/time.ts, and the same rule for what an instant is: seconds, then Z or an
 * explicit offset, and a real calendar time. For the session hook, which runs under a Node that cannot read TypeScript.
 * A transcript line's time is in UTC words, and a stored time is local wall-clock.
 * @param {unknown} words
 * @returns {string | null}
 */
export function theLocalInstantOf(words) {
  if (typeof words !== 'string') return null
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d{3})?(Z|([+-])(\d{2}):(\d{2}))$/.exec(words)
  if (m === null) return null
  const hours = Number(m[5] ?? 0)
  const minutes = Number(m[6] ?? 0)
  const stated = (m[4] === '-' ? -1 : 1) * (hours * 60 + minutes)
  const ms = Date.parse(words)
  if (hours > 23 || minutes > 59 || !Number.isFinite(ms)) return null
  // Date.parse moves a day that does not exist into the next month, so the stated fields are checked as well.
  if (new Date(ms + stated * 60_000).toISOString().slice(0, 19) !== m[1]) return null
  const at = new Date(ms)
  const east = -at.getTimezoneOffset()
  const pad = (n) => String(n).padStart(2, '0')
  const offset = `${east < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(east) / 60))}:${pad(Math.abs(east) % 60)}`
  return `${localStampOf(at).replace(' ', 'T')}.${String(at.getMilliseconds()).padStart(3, '0')}${offset}`
}

/**
 * THE LAST LINES OF A TRANSCRIPT, READ FROM THE END AND NEVER WHOLE.
 *
 * It seeks to within `maxBytes` of the file's end and reads forward. When it started in the middle
 * of a line the partial first line is dropped: half a JSON object is not evidence of anything.
 * An unreadable file answers an empty list, and the caller reports that as "the transcript said
 * nothing" rather than as a cause.
 */
export function theLastLinesOf(logPath, maxBytes = MOST_BYTES_OF_TRANSCRIPT) {
  if (typeof logPath !== 'string' || logPath.trim() === '') return []
  let fd
  try {
    fd = openSync(logPath, 'r')
    const size = fstatSync(fd).size
    const from = Math.max(0, size - maxBytes)
    const length = size - from
    const buffer = Buffer.alloc(length)
    let read = 0
    while (read < length) {
      const got = readSync(fd, buffer, read, length - read, from + read)
      if (got <= 0) break
      read += got
    }
    let text = buffer.subarray(0, read).toString('utf8')
    if (from > 0) {
      const firstBreak = text.indexOf('\n')
      text = firstBreak === -1 ? '' : text.slice(firstBreak + 1)
    }
    return text.split('\n').filter((line) => line.trim() !== '')
  } catch {
    return []
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd)
      } catch {
        // Closing a file that is already gone changes nothing a caller can act on.
      }
    }
  }
}

/**
 * WHEN A CODEX ROLLOUT WAS LAST WRITTEN, read from the same end of the same file.
 *
 * It hands back the shape `transcriptLastWrittenAt` in the claude-code adapter hands back, so the
 * one judgement in `answering.ts` compares a codex transcript's age against the hold's lapse window
 * in the same words as any other. The last line's own `timestamp` wins over the file's modification
 * time for the reason the claude adapter's header measured: a file can be rewritten without being
 * appended to, and its mtime would then call an old log fresh.
 *
 * AN UNREADABLE FILE IS AN ABSENCE, NOT A WRITE NOW. The timestamp of a line that will not parse is
 * skipped, and a file with no readable line at all falls back to its modification time and then to
 * a plain refusal to date it.
 *
 * @param {string} logPath
 * @returns {{ read: true, at: Date, from: 'its last line' | "the file's modification time" } | { read: false, missing: boolean, reason: string }}
 */
export function theCodexTranscriptLastWrittenAt(logPath) {
  const lines = theLastLinesOf(logPath)
  for (let i = lines.length - 1; i >= 0; i--) {
    let record
    try {
      record = JSON.parse(lines[i])
    } catch {
      continue
    }
    if (record === null || typeof record !== 'object') continue
    const iso = record.timestamp
    if (typeof iso !== 'string') continue
    const ms = Date.parse(iso)
    if (!Number.isNaN(ms)) return { read: true, at: new Date(ms), from: 'its last line' }
  }
  try {
    const ms = statSync(logPath).mtimeMs
    return { read: true, at: new Date(ms), from: "the file's modification time" }
  } catch (err) {
    return {
      read: false,
      missing: err !== null && typeof err === 'object' && err.code === 'ENOENT',
      reason: `the codex rollout at ${logPath} carries no readable timestamp and its file could not be dated`,
    }
  }
}

/** The words a transcript line carries, from either side of a tool result. */
function theWordsOf(record) {
  const message = record === null || typeof record !== 'object' ? null : record.message
  if (message === null || typeof message !== 'object') return ''
  const content = message.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const part of content) {
    if (part === null || typeof part !== 'object') continue
    if (part.type === 'text' && typeof part.text === 'string') parts.push(part.text)
    if (part.type === 'tool_result') {
      const inner = part.content
      if (typeof inner === 'string') parts.push(inner)
      else if (Array.isArray(inner)) {
        for (const one of inner) {
          if (one !== null && typeof one === 'object' && one.type === 'text' && typeof one.text === 'string') {
            parts.push(one.text)
          }
        }
      }
    }
  }
  return parts.join('\n')
}

/**
 * A CODEX TURN'S OWN ERROR, or null because this line is not one.
 *
 * The measured shape: `type` is `event_msg`, the payload's own `type` is `task_complete`, and the
 * payload carries an `error` object whose `message` is what a person reads and whose
 * `codex_error_info` is the provider's machine-readable cause. The rollout's `task_complete` and
 * the CLI's `error` and `turn.failed` events report the provider's ending. An inter-agent
 * `agent_message` that quotes an error is a message about a turn, so it does not qualify.
 */
function theCodexErrorIn(record) {
  if (record.type === 'error') return typeof record.message === 'string' ? { code: '', said: record.message.trim() } : null
  if (record.type === 'turn.failed') {
    const error = record.error
    return error !== null && typeof error === 'object' && typeof error.message === 'string'
      ? { code: typeof error.codex_error_info === 'string' ? error.codex_error_info : '', said: error.message.trim() } : null
  }
  if (record.type !== 'event_msg') return null
  const payload = record.payload
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null
  if (payload.type !== 'task_complete') return null
  const error = payload.error
  if (error === null || typeof error !== 'object' || Array.isArray(error)) return null
  const said = typeof error.message === 'string' ? error.message.trim() : ''
  const code = typeof error.codex_error_info === 'string' ? error.codex_error_info : ''
  if (said === '' && code === '') return null
  return { code, said: said === '' ? code : said }
}

/**
 * WHICH CAUSE A CODEX ERROR CODE NAMES, or null because it is not one of the three.
 *
 * The names are the codex binary's own serialized enum, read off this machine's codex-cli 0.153.4.
 * Only the three a person has to act on are mapped: a usage limit, a rate limit and an
 * authentication failure. Every other code — an overloaded server, a sandbox error, a rolled-back
 * thread — is left for the words to be read, and the words usually name no cause at all, which is
 * the honest null.
 */
function theCodexKindIn(code) {
  if (code === 'usage_limit_exceeded') return 'session-limit'
  if (code === 'rate_limit_exceeded') return 'quota'
  if (code === 'unauthorized') return 'login'
  return null
}

/**
 * WHICH CAUSE ONE TRANSCRIPT LINE NAMES, from either tool's shape, or null.
 *
 * A codex line is read first because only a codex line has the `event_msg` shape at all, and its
 * provider code decides when the code is one of the three. The claude reading below is untouched:
 * `theWordsOf` and `whatTheCauseWas` are the same functions they were.
 */
function theCauseIn(record) {
  const codex = theCodexErrorIn(record)
  if (codex !== null) {
    const kind = theCodexKindIn(codex.code)
    if (kind !== null) return { kind, said: codex.said, resetsAt: theResetIn(codex.said) }
    return whatTheCauseWas(codex.said)
  }
  return whatTheCauseWas(theWordsOf(record))
}

/**
 * WHETHER A TRANSCRIPT LINE IS AN ERROR AND NOT PROSE. The five claude shapes the measurement named,
 * and codex's `task_complete` error, which is the sixth.
 *
 * `message.model === '<synthetic>'` is how Claude Code writes its own limit and login lines: they
 * are not model output, and nothing else in a transcript is synthetic. A failed task-notification
 * is the subagent's own death notice arriving at its parent.
 */
function itIsAnErrorLine(record) {
  if (theCodexErrorIn(record) !== null) return true
  if (record.isApiErrorMessage === true) return true
  if (typeof record.error === 'string' && record.error !== '') return true
  if (typeof record.apiErrorStatus === 'number' && record.apiErrorStatus >= 400) return true
  const message = record.message
  if (message !== null && typeof message === 'object' && message.model === '<synthetic>') return true
  const words = theWordsOf(record)
  return /<task-notification>/.test(words) && /<status>failed<\/status>/.test(words)
}

/**
 * The reset time a limit's own words carry, or null because they carry none.
 *
 * BOTH TOOLS' PHRASINGS, and neither is rewritten. Claude Code says `resets 7:10pm (Europe/London)`
 * and codex says `try again at Sep 17th, 2026 11:41 PM.` The captured moment is handed back as the
 * provider wrote it, with only a trailing full stop and whitespace removed.
 */
function theResetIn(text) {
  const found = text.match(/(?:resets?\s+(?:at\s+)?|try again at\s+)([^\n]+)/i)
  if (found === null) return null
  const said = found[1].replace(/[.\s]+$/, '').trim()
  return said === '' ? null : said
}

/**
 * WHICH CAUSE A PIECE OF TEXT NAMES, or null because it names none.
 *
 * STATED ORDER: a login first, then a session limit, then a quota. "You've hit your monthly spend
 * limit. Run /usage-credits …" must be a quota even though it carries the word limit; "You've hit
 * your session limit · resets 7:10pm" must be a session limit; "rate_limit_error" and HTTP 429
 * belong to the quota family, which is the family that has a reset time.
 */
export function whatTheCauseWas(words) {
  const text = String(words === undefined || words === null ? '' : words).trim()
  if (text === '') return null
  if (/log ?in|logged out|sign ?in|authenticat|unauthorized|invalid api key|api key|credential|\b401\b/i.test(text)) {
    return { kind: 'login', said: text, resetsAt: null }
  }
  if (/session limit|usage limit/i.test(text)) {
    return { kind: 'session-limit', said: text, resetsAt: theResetIn(text) }
  }
  if (/spend limit|quota|usage[- ]?credits|rate.?limit|\b429\b/i.test(text)) {
    return { kind: 'quota', said: text, resetsAt: theResetIn(text) }
  }
  return null
}

/**
 * WHICH CAUSE A CLAUDE CODE RESULT NAMES, or null because it names none. The result is the one JSON object `claude -p
 * --output-format json` prints when it ends; a check prints it.
 *
 * WHAT A LIMIT LEAVES IN IT, MEASURED on the sample the check line's secretary captured from a check and gave as
 * tests/fixtures/a-check-that-hit-the-5-hour-limit.txt: `"type":"result"`, `"is_error":true`, `"api_error_status":429`,
 * `"terminal_reason":"api_error"`, and `"result":"You've hit your session limit · resets 7:10pm (Europe/London)"`. Its
 * `subtype` says `success` even so, and is not read.
 *
 * ONLY AN ERROR IS READ, so a check whose verdict talks about a session limit is not mistaken for one that hit it.
 * @param {unknown} result
 */
export function theStopCauseInAClaudeResult(result) {
  if (result === null || typeof result !== 'object' || result.is_error !== true) return null
  return whatTheCauseWas(typeof result.result === 'string' ? result.result : '')
}

/**
 * WHAT THE LAST LINES OF A TRANSCRIPT SAY THE RUN STOPPED FOR, or null.
 *
 * A transcript with no file, no error line among its last lines, or an error line that names no
 * cause answers null. That is the absence the caller writes down, never a cause invented here.
 *
 * The cause's `at` is the line's own time written by `theLocalInstantOf`, or null when it carries
 * none that names a moment.
 */
export function theStopCauseInTheTranscript(logPath) {
  const lines = theLastLinesOf(logPath)
  for (let i = lines.length - 1; i >= 0 && lines.length - i <= MOST_LINES_LOOKED_AT; i--) {
    let record
    try {
      record = JSON.parse(lines[i])
    } catch {
      continue
    }
    if (record === null || typeof record !== 'object') continue
    if (!itIsAnErrorLine(record)) continue
    const cause = theCauseIn(record)
    if (cause === null) continue
    return { ...cause, at: theLocalInstantOf(record.timestamp) }
  }
  return null
}

/**
 * WHAT THE TRANSCRIPT'S LAST REAL LINE SAYS IT STOPPED FOR, or null because the last real line is
 * anything else.
 *
 * DIFFERENT FROM `theStopCauseInTheTranscript`, WHICH FINDS THE NEWEST ERROR IN THE TAIL even when
 * the session went on afterwards. That reading answers "why did this run end at some point", which
 * is what a reminder or a closing hook wants. This one answers "is the cause still the last thing
 * the session said", which is what a hold wants: a session that hit a limit and then kept working
 * is answering, and only a cause nothing came after is a session that has stopped. Criterion M126.
 *
 * AN UNPARSEABLE TRAILING LINE IS SKIPPED RATHER THAN TREATED AS ACTIVITY. A torn write is not a
 * turn, and a transcript that ends in half a line should still be read from its last whole line. A
 * line that parses but is not an error answers null, and so does an error line that names none of
 * the causes this module knows; both leave the caller to its other readings rather than inventing a
 * limit.
 */
export function theStopCauseAtTheEndOfTheTranscript(logPath) {
  const lines = theLastLinesOf(logPath)
  for (let i = lines.length - 1; i >= 0; i--) {
    let record
    try {
      record = JSON.parse(lines[i])
    } catch {
      continue
    }
    if (record === null || typeof record !== 'object') continue
    if (!itIsAnErrorLine(record)) return null
    const cause = theCauseIn(record)
    if (cause === null) return null
    return { ...cause, at: theLocalInstantOf(record.timestamp) }
  }
  return null
}

/** How long the office counts OpenCode Go as limited when the provider sent no reset: Go's window is five hours. */
export const A_GO_LIMIT_WITH_NO_RESET_MS = 5 * 60 * 60 * 1000

/** The kind of stop OpenCode Go's usage limit is, for a run it ended and for a run still waiting on it (round 47). */
export const A_GO_LIMIT_IS = 'quota'

/** How every `resetFrom` opens, for a stop and for a run still waiting, so the two read alike (round 48). */
const NAMED_BY_THE_ERROR = 'named by the error'
const ASSUMED_FIVE_HOURS = "assumed: five hours, Go's allowance window"

/**
 * Whether a `resetFrom` says the error named the reset, and not that it was assumed. For a run still waiting, only then is
 * the reset OpenCode's own next try, so only then does the office show that time to the run's starter.
 * @param {unknown} resetFrom
 */
export const aResetTheErrorNamed = (resetFrom) => typeof resetFrom === 'string' && resetFrom.startsWith(NAMED_BY_THE_ERROR)

/**
 * WHETHER AN OPENCODE RUN ENDED ON OPENCODE GO'S USAGE LIMIT, read from the last error event its
 * `--format json` output printed, or null.
 *
 * Only the last error event among the last lines is read. It is Go's limit only when its response
 * body names `GoUsageLimitError`; any other error, or an event with no time, answers null and the run
 * stays a plain crash. The reset is the provider's `retry-after` in seconds when it sent one, the
 * header OpenCode itself reads for a Go limit. When it sent none, or one that is not a number of
 * seconds, the office takes five hours from the stop.
 *
 * `resetFrom` SAYS WHERE THE RESET CAME FROM, and this is the one place it is worked out. Either the
 * error named it, quoted as the header the reader read, or the office assumed Go's five-hour window
 * and says why. The launcher stores these words on the stop cause, and every place that shows the
 * reset shows them as stored (round 48).
 *
 * @param {string[]} lines
 * @returns {{ kind: 'quota', said: string, atMs: number, resetsAtMs: number, resetFrom: string } | null}
 */
export function theGoLimitAnOpenCodeRunEndedOn(lines) {
  for (let i = lines.length - 1; i >= 0 && lines.length - i <= MOST_LINES_LOOKED_AT; i--) {
    let record
    try {
      record = JSON.parse(lines[i])
    } catch {
      continue
    }
    if (record === null || typeof record !== 'object' || record.type !== 'error') continue
    const error = record.error
    const data = error !== null && typeof error === 'object' ? error.data : null
    if (data === null || typeof data !== 'object') return null
    if (typeof record.timestamp !== 'number' || !Number.isFinite(record.timestamp)) return null
    const headers = data.responseHeaders !== null && typeof data.responseHeaders === 'object' ? data.responseHeaders : {}
    const limit = theGoLimitIn(data.responseBody, typeof headers['retry-after'] === 'string' ? headers['retry-after'] : null, record.timestamp)
    if (limit === null) return null
    const said = typeof data.message === 'string' && data.message.trim() !== '' ? data.message.trim() : 'GoUsageLimitError'
    return { kind: A_GO_LIMIT_IS, said, atMs: record.timestamp, ...limit }
  }
  return null
}

/**
 * WHETHER ONE ANSWER FROM OPENCODE GO IS ITS USAGE LIMIT, and when the limit resets, or null. It is the limit when the
 * response body names `GoUsageLimitError`. The reset is the `retry-after` header in seconds from `atMs` when it is a
 * number, and otherwise Go's five-hour window, with `resetFrom` saying which and why. A run that ended on the limit and
 * the provider router, which moves a request off a used-up key, both read the limit here.
 *
 * @param {unknown} responseBody
 * @param {string | null} retryAfterHeader
 * @param {number} atMs
 * @returns {{ resetsAtMs: number, resetFrom: string } | null}
 */
export function theGoLimitIn(responseBody, retryAfterHeader, atMs) {
  if (typeof responseBody !== 'string' || !responseBody.includes('GoUsageLimitError')) return null
  const retryAfter = typeof retryAfterHeader === 'string' ? retryAfterHeader.trim() : null
  const seconds = retryAfter !== null && /^\d+(\.\d+)?$/.test(retryAfter) ? Number(retryAfter) : null
  if (seconds !== null) return { resetsAtMs: atMs + Math.ceil(seconds * 1000), resetFrom: `${NAMED_BY_THE_ERROR}: "retry-after: ${retryAfter}"` }
  const why = retryAfter === null ? 'the error sent no retry-after' : `the error's retry-after "${retryAfter}" is not a number of seconds`
  return { resetsAtMs: atMs + A_GO_LIMIT_WITH_NO_RESET_MS, resetFrom: `${ASSUMED_FIVE_HOURS} (${why})` }
}

/**
 * THE LINE tools/opencode-go-limit-plugin.mjs PRINTS on an OpenCode run's output for each retry on Go's limit. Its
 * `type` is this word, which no event OpenCode prints itself carries.
 */
export const A_GO_RETRY_LINE = 'mole-office.go-limit-retry'

/**
 * WHETHER A LINE OF AN OPENCODE RUN'S OUTPUT SAYS OPENCODE IS WAITING ON GO'S USAGE LIMIT, and until when, or null.
 *
 * OpenCode 1.18.31 retries a Go limit in silence. Between tries `--format json` prints nothing, and it waits the
 * provider's retry-after, which can be five hours. It hands each retry to its plugins as a `session.status` event of
 * type `retry`. On Go's limit, and only there, its `action.reason` is "account_rate_limit". `next` is the time of the
 * next try in epoch milliseconds. The words say "It will reset in <time>.", where <time> is read from the provider's
 * retry-after and is empty when it sent none. Measured on 14 October 2026 against a local stand-in for the provider.
 *
 * When the words name a time, the reset is `next`, the moment OpenCode waits for. When they name none, OpenCode waits
 * seconds only, so `next` is no reset: the office takes Go's five-hour window from the retry and says so. This is the
 * one place a waiting run's reset and its `resetFrom` are worked out, and `resetFrom` opens as a stop's does.
 * `nextTryAtMs` is `next` itself, or null when the retry gave none: the launcher reads how long the run waits from it.
 *
 * @param {string} line
 * @returns {{ provider: string | null, said: string, attempt: number | null, seenAtMs: number, nextTryAtMs: number | null, resetsAtMs: number, resetFrom: string } | null}
 */
export function theGoLimitAnOpenCodeRunWaitsOn(line) {
  let record
  try {
    record = JSON.parse(line)
  } catch {
    return null
  }
  if (record === null || typeof record !== 'object' || record.type !== A_GO_RETRY_LINE) return null
  if (typeof record.at !== 'number' || !Number.isFinite(record.at) || typeof record.said !== 'string') return null
  const seenAtMs = record.at
  const said = record.said.trim()
  const attempt = Number.isInteger(record.attempt) ? record.attempt : null
  const provider = typeof record.provider === 'string' && record.provider !== '' ? record.provider : null
  const resetIn = /It will reset in ([^.]*)\./.exec(said)?.[1]?.trim() ?? ''
  const next = typeof record.next === 'number' && Number.isFinite(record.next) ? record.next : null
  if (resetIn !== '' && next !== null) {
    return { provider, said, attempt, seenAtMs, nextTryAtMs: next, resetsAtMs: next, resetFrom: `${NAMED_BY_THE_ERROR}, as OpenCode's retry read it: "It will reset in ${resetIn}"` }
  }
  const why = resetIn === '' ? "OpenCode's retry named no reset" : "OpenCode's retry gave no time for its next try"
  return { provider, said, attempt, seenAtMs, nextTryAtMs: next, resetsAtMs: seenAtMs + A_GO_LIMIT_WITH_NO_RESET_MS, resetFrom: `${ASSUMED_FIVE_HOURS} (${why})` }
}

/**
 * WHETHER A LINE OF AN OPENCODE RUN'S OUTPUT SHOWS THE RUN WENT ON: an event OpenCode printed itself, other than an
 * error. The plugin's line is not one. A run held on Go's limit prints nothing until a try gets through, so the first
 * such line after a retry means the run is past the limit.
 *
 * @param {string} line
 */
export function anOpenCodeLineThatGoesOn(line) {
  let record
  try {
    record = JSON.parse(line)
  } catch {
    return false
  }
  return record !== null && typeof record === 'object' && typeof record.type === 'string' && record.type !== 'error' && record.type !== A_GO_RETRY_LINE
}

/** The sentence `closedBecause` holds: the cause's own words, and the reset when they name one. */
function theSentenceWithTheCause(cause) {
  if (cause.resetsAt === null || cause.said.includes(cause.resetsAt)) return cause.said
  return `${cause.said} It resets ${cause.resetsAt}.`
}

/**
 * THE PATCH THAT CLOSES A RUN, from what its transcript said and what Claude Code said.
 *
 * `cause` is `theStopCauseInTheTranscript`'s answer, or null. `theReasonClaudeGave` is the
 * SessionEnd payload's own `reason` word, which is a provider code such as `other`, `clear` or
 * `logout` and not one of the five words a session record's `closedHow` may hold. So the five-word
 * field carries the one that is true — the provider said the run ended — and Claude Code's own word
 * is kept verbatim in `detail`, the field this kind declares for "how it ended, in the words the
 * exit gave you". A cause the person must act on makes the state `crashed`; a clean end makes it
 * `finished`. The cause itself is kept machine-readably in the session field `stopCause`, so the
 * office's sweep folds runs by cause without having to read the sentence again.
 *
 * A CAUSE NOT READ IS NOT INVENTED. When `cause` is null the sentence says that the transcript said
 * nothing, and Claude Code's own reason is still carried beside it.
 */
export function thePatchThatClosesARun(cause, at, theReasonClaudeGave) {
  const stamp = localStampOf(at)
  const reason =
    typeof theReasonClaudeGave === 'string' && theReasonClaudeGave.trim() !== '' ? theReasonClaudeGave.trim() : null
  const provider = reason === null ? 'Claude Code did not say why.' : `Claude Code's own reason was "${reason}".`
  const patch = {
    state: cause === null ? 'finished' : 'crashed',
    closedAt: stamp,
    closedHow: 'provider-event',
    detail: `The session ended. ${provider}`,
    closedBecause:
      cause === null
        ? `The session ended and nothing in its transcript said why. ${provider}`
        : theSentenceWithTheCause(cause),
  }
  if (cause !== null) {
    patch.stopCause = { kind: cause.kind, said: cause.said, at: cause.at, resetsAt: cause.resetsAt }
  }
  return patch
}

/**
 * A RUN'S STOP CAUSE AND ITS MARK OF WAITING ON A LIMIT, WHEREVER THE RUN KEEPS THEM: src/config/a-runs-stop-and-wait.mjs,
 * which the browser can load too (round 50). Handed on here, so this file's importers read them where they always did.
 */
export { STOP_CAUSE_KIND_IN_SQL, WAITS_ON_A_LIMIT_IN_SQL, theStopCauseOf, theWaitOnALimitOf } from './a-runs-stop-and-wait.mjs'

/**
 * THE FINAL CODEX PROVIDER ERROR SAYS THE MODEL IS AT CAPACITY (18 October 2026; the inspector's refusal luJMYqhYQoH-).
 *
 * Measured on w13m run 1dSiDsrMtC1S (15 October 2026, gpt-6.1-sol): codex exec --json ended with an `error` event, then
 * `turn.failed` with the same words, "Selected model is at capacity. Please try a different model.", and no code. So the last
 * JSON record must be Codex's own error, carry no code, and say "at capacity". An agent's message, a command's output or a
 * plain text line that holds the words never qualifies, nor does an error with a code: no code for capacity has been seen,
 * and a cause not read is not invented.
 */
export function codexCapacityAtTheEnd(logPath) {
  for (const line of theLastLinesOf(logPath).reverse()) {
    let record
    try { record = JSON.parse(line) } catch { continue }
    if (record === null || typeof record !== 'object') return false
    const error = theCodexErrorIn(record)
    if (error === null || error.code !== '') return false
    return /\bat capacity\b/i.test(error.said)
  }
  return false
}

/** The final Codex provider error names a rate or usage limit. Other codes and conversation prose never qualify. */
export function codexRateOrUsageLimitAtTheEnd(logPath) {
  for (const line of theLastLinesOf(logPath).reverse()) {
    let record
    try { record = JSON.parse(line) } catch { continue }
    if (record === null || typeof record !== 'object') return false
    const error = theCodexErrorIn(record)
    if (error === null) return false
    if (error.code !== '') return ['usage_limit_exceeded', 'rate_limit_exceeded'].includes(error.code)
    return /\busage limit\b|\brate[ -]?limit\b/i.test(error.said)
  }
  return false
}
