// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE CLAUDE CODE ENVELOPE'S TOKEN COUNTS, WORKED OUT ONCE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS JAVASCRIPT AND NOT TYPESCRIPT
 * ---------------------------------------------------------------------------------------
 *
 * Two callers need this same rule and they run under different Node processes. One is the
 * TypeScript adapter `src/worker/runtimes/usage.ts`, which every message-worker run goes through.
 * The other is `tools/agent-worker.mjs`, the tool a builder's brief runs on, which is a plain
 * `.mjs` file started by `node tools/agent-worker.mjs` and may run under a Node that cannot read
 * TypeScript. A second copy of this parsing in the tool would be two rules that drift, which is the
 * ninth invariant. So the rule is here, in JavaScript, and both import it.
 *
 * The JSDoc below is checked by `tsc` through `// @ts-check`, `allowJs` and the type import, so the
 * TypeScript caller gets the same types it would from a `.ts` file.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT NEVER DOES
 * ---------------------------------------------------------------------------------------
 *
 * A count the runtime did not give stays absent. Zero is a measured value and is kept. The
 * `finish` sentence names every number the envelope did not supply, so absence is read as absence
 * rather than as a zero. U3.
 */


/** @typedef {import('../shared/usage-receipts.ts').UsageReceipt} UsageReceipt */
/** @typedef {Record<string, unknown>} Envelope */

/**
 * THE PREFIX OF THE ONE LINE AN INSPECTOR PRINTS ITS MODEL ENVELOPE ON.
 *
 * Earlier inspector tools printed a Claude result with this prefix. The receipt reader still
 * accepts those recorded results. Current checks carry their harness and native output with
 * INSPECTION_USAGE_LINE below, because the tool's other output is a person's report.
 */
/**
 * THE FIXED FORMS OF A RECEIPT'S `paidBy` AND `ranIn`, declared once. They are here, not in a TypeScript file, because
 * tools/session-hook.mjs loads this file under a Node that cannot read TypeScript. The tools write these forms, and
 * src/shared/usage-receipts.ts re-exports them so the receipt on a page can say them in the reader's language.
 */
export const RECEIPT_NOT_REPORTED = 'not reported'
export const RAN_ON_THE_HOST = 'on the host'
export const RAN_IN_THE_SANDBOX = 'in the sandbox '
export const PAID_BY_THE_LOGIN_IN = 'the Claude Code login in '

export const CLAUDE_USAGE_LINE = 'CLAUDE-CODE-USAGE '

/** The check tool carries the runtime and its native output together for the worker's receipt reader. */
export const INSPECTION_USAGE_LINE = 'INSPECTION-MODEL-OUTPUT '

/**
 * THE TRANSCRIPT A DSH CHECK'S LINE CARRIES (1S-Comh3Shf- point 4). The worker that reads the line cannot reach
 * the check's home, which may be gone by then, so the line carries the transcript's text and the path the check saw it
 * at; or no text, and one sentence saying why it was not read. The text on the line is only what dshTranscriptUsage
 * reads (dshAnswersCarried), never the whole transcript: the rest holds what the model read and wrote, which may include
 * the key in its environment, and the check's output log is stored without masking (wave 13n, meSWfODwknO1).
 * @typedef {{ text: string, from: string } | { text: null, why: string }} DshCheckTranscript
 */
/**
 * A dsh check's line may also name the model the check asked dsh for, `modelRequested` (Dxiry_2y6vuD point 3). It
 * is kept apart from the model the transcript names, and absent when the line names none.
 * @typedef {{ runtime: 'claude-code' | 'codex' | 'opencode', output: string } | { runtime: 'dsh', output: string, transcript: DshCheckTranscript, modelRequested?: string }} InspectionOutput
 */

/** Where a dsh check keeps its sessions, as the check sees it (DSH_HOME in tools/inspector-sandbox.mjs). */
const A_DSH_CHECKS_SESSIONS = '/check/home/.dsh/sessions/'

/** The refusal of a dsh check's transcript, so a reader can tell it from the line's other refusals by its class. */
export class DshTranscriptRefused extends Error {}

/**
 * A dsh line's transcript when it is one of the two shapes, and otherwise a refusal that says what is wrong. A path
 * outside the check's own sessions folder is refused, because the receipt says the count came from the check's own home.
 * @param {unknown} value
 * @returns {DshCheckTranscript}
 */
function theDshTranscript(value) {
  const refuse = (/** @type {string} */ what) => new DshTranscriptRefused(`A dsh check line carries its transcript as text and the path inside ${A_DSH_CHECKS_SESSIONS} it was read from, or as no text and why; this one ${what}.`)
  if (value === undefined) throw refuse('carries no transcript')
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw refuse('carries a transcript that is not an object')
  const one = /** @type {Record<string, unknown>} */ (value)
  const fields = Object.keys(one).sort().join(', ')
  if (one['text'] === null) {
    if (fields !== 'text, why') throw refuse(`carries no text with the fields ${fields}`)
    if (typeof one['why'] !== 'string' || one['why'].trim() === '') throw refuse('carries no text and gives no reason')
    return { text: null, why: one['why'] }
  }
  if (typeof one['text'] !== 'string') throw refuse('carries transcript text that is neither text nor null')
  if (fields !== 'from, text') throw refuse(`carries text with the fields ${fields}`)
  const from = one['from']
  if (typeof from !== 'string' || !from.startsWith(A_DSH_CHECKS_SESSIONS) ||
      from.slice(A_DSH_CHECKS_SESSIONS.length).split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw refuse(`names ${JSON.stringify(from)}, which is not a path inside ${A_DSH_CHECKS_SESSIONS}`)
  }
  return { text: one['text'], from }
}

/**
 * The model a dsh line says its check asked for, when it names one. Anything but a string with words in it is refused.
 * @param {unknown} value
 * @returns {string | undefined}
 */
function theModelAskedFor(value) {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`A dsh check line names the model it asked for as a model name, or not at all; this one names ${JSON.stringify(value)}.`)
  return value
}

/**
 * @param {'claude-code' | 'codex' | 'opencode' | 'dsh'} runtime
 * @param {string} output Native stdout: a Claude result, Codex JSON events, OpenCode JSON events, or the dsh ACP client's envelope lines.
 * @param {DshCheckTranscript} [transcript] A dsh check's own transcript, or why it was not read. dsh needs one, and no other runtime takes one.
 * @param {string} [modelRequested] The model a dsh check asked dsh for. No other runtime takes one.
 * @returns {string}
 */
export function inspectionUsageLine(runtime, output, transcript, modelRequested) {
  if (runtime !== 'claude-code' && runtime !== 'codex' && runtime !== 'opencode' && runtime !== 'dsh') throw new Error(`The inspection output names unsupported runtime ${String(runtime)}.`)
  if (runtime === 'dsh') {
    const read = theDshTranscript(transcript)
    const asked = theModelAskedFor(modelRequested)
    return INSPECTION_USAGE_LINE + JSON.stringify({ runtime, output, transcript: read.text === null ? read : { text: dshAnswersCarried(read.text), from: read.from },
      ...(asked === undefined ? {} : { modelRequested: asked }) })
  }
  if (transcript !== undefined) throw new Error(`Only a dsh check line carries a transcript; a ${runtime} line does not.`)
  if (modelRequested !== undefined) throw new Error(`Only a dsh check line names the model it asked for; a ${runtime} line does not.`)
  return INSPECTION_USAGE_LINE + JSON.stringify({ runtime, output })
}

/**
 * Read the last model invocation the tool reported. Older tools printed the Claude-only marker.
 * An unreadable new marker is reported as broken; it never falls back to an older invocation.
 * @param {string} said
 * @returns {InspectionOutput | null}
 */
export function inspectionUsageIn(said) {
  for (const line of said.split('\n').reverse()) {
    if (line.startsWith(INSPECTION_USAGE_LINE)) {
      let parsed
      try { parsed = JSON.parse(line.slice(INSPECTION_USAGE_LINE.length)) }
      catch { throw new Error('The check tool printed an inspection output line that is not JSON.') }
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed) ||
          !['claude-code', 'codex', 'opencode', 'dsh'].includes(parsed.runtime) || typeof parsed.output !== 'string') {
        throw new Error('The check tool printed an inspection output line without a supported runtime and native output.')
      }
      if (parsed.runtime === 'dsh') {
        const asked = theModelAskedFor(parsed.modelRequested)
        return { runtime: 'dsh', output: parsed.output, transcript: theDshTranscript(parsed.transcript), ...(asked === undefined ? {} : { modelRequested: asked }) }
      }
      return { runtime: parsed.runtime, output: parsed.output }
    }
    if (line.startsWith(CLAUDE_USAGE_LINE)) return { runtime: 'claude-code', output: line.slice(CLAUDE_USAGE_LINE.length) }
  }
  return null
}

/**
 * A single native Claude JSON result, or the native results of successive invocations.
 * Leave unreadable output whole so claudeUsage reports that it could not read it.
 * @param {string} output
 * @returns {string[]}
 */
export function inspectionClaudeResults(output) {
  try { JSON.parse(output); return [output] } catch { /* More than one native result is JSONL. */ }
  const lines = output.split('\n').filter((line) => line.trim() !== '')
  try { for (const line of lines) JSON.parse(line) } catch { return [output] }
  return lines.length === 0 ? [output] : lines
}

/**
 * The check starts its own conversation and keeps all its native output, including corrections.
 * Codex reports the thread's last cumulative counts. Claude reports invocation-local tokens and
 * duration, and the conversation's final cumulative cost. Each total is counted once.
 */
/** @param {InspectionOutput} native @returns {UsageReceipt} */
export function inspectionUsageReceipt(native) {
  if (native.runtime === 'dsh') {
    // THE MODEL ASKED FOR IS ITS OWN FIELD, and `model` stays the one the transcript names, or absent (Dxiry_2y6vuD).
    const receipt = theDshChecksUsage(native.transcript)
    return native.modelRequested === undefined ? receipt : { ...receipt, modelRequested: native.modelRequested }
  }
  const events = jsonLines(native.output)
  if (native.runtime === 'opencode') return events.some(event => event.type === 'step_finish')
    ? openCodeUsage(native.output)
    : { runtime: 'opencode', source: OPENCODE_SOURCE, says: 'The check output holds no step_finish event, so OpenCode reported no usage.' }
  if (native.runtime === 'codex') {
    const threads = new Set(events.filter((event) => event.type === 'thread.started' && typeof event.thread_id === 'string').map((event) => event.thread_id))
    if (threads.size > 1) return { runtime: 'codex', source: 'the check tool\'s native Codex output',
      says: 'The output names more than one Codex thread, so their cumulative counts cannot be assigned to this check.' }
    return theRoundsOwnCodexUsage(native.output, null, null)
  }
  const receipts = inspectionClaudeResults(native.output).map(claudeUsage)
  if (receipts.length === 1) return /** @type {UsageReceipt} */ (receipts[0])
  const models = new Set(receipts.map((receipt) => receipt.model))
  const sessions = new Set(events.filter((event) => typeof event.session_id === 'string').map((event) => event.session_id))
  const everyResultNamesAConversation = events.length === receipts.length && events.every((event) =>
    typeof event.session_id === 'string' && event.session_id.trim() !== '')
  const { costUsd: _summedCosts, ...invocationCounts } = sum(receipts)
  const cost = everyResultNamesAConversation && sessions.size === 1 ? receipts.at(-1)?.costUsd : undefined
  const receipt = finish({ ...invocationCounts, ...(cost === undefined ? {} : { costUsd: cost }), runtime: 'claude-code', inputIncludesCached: false,
    source: 'Native Claude results: invocation tokens and duration; the final cost when one conversation reported it.',
    ...(models.size === 1 && !models.has(undefined) ? { model: receipts[0]?.model } : {}) })
  const whyNoCost = !everyResultNamesAConversation
    ? 'One or more native Claude results name no conversation, so their cumulative cost cannot be assigned to this check.'
    : sessions.size > 1 ? 'The output names more than one Claude conversation, so its cumulative cost cannot be assigned to this check.' : null
  return whyNoCost === null ? receipt : { ...receipt, says: `${receipt.says ?? ''} ${whyNoCost}`.trim() }
}

/**
 * A DSH CHECK'S RECEIPT (1S-Comh3Shf- point 4). With the check's own transcript, the tokens are counted by
 * dshTranscriptUsage, as the dsh workers' receipts are, and the source names the transcript. Without it, dsh's ACP output
 * carries no token count, so none is reported. Its usage_update numbers say how full the context is, not what a turn
 * spent, so they are never counted. Either way the words end "dsh reports no cost."
 * @param {DshCheckTranscript} transcript
 * @returns {UsageReceipt}
 */
function theDshChecksUsage(transcript) {
  if (transcript.text === null) {
    return { runtime: 'dsh', source: "the check tool's dsh ACP output",
      says: `The tokens are not reported in dsh's ACP output, and the check's own transcript was not read: ${transcript.why.trim().replace(/\.$/, '')}. dsh reports no cost.` }
  }
  return { ...dshTranscriptUsage(transcript.text),
    source: `the check's own dsh transcript at ${transcript.from}, written inside the check view, data.usage on each assistant/message event, carried on the line without the rest of the transcript` }
}

/**
 * HOW OFTEN A STOP WRITES A RUN'S RECEIPT (review message DLqviJ8nr3yH). A stop fires after every reply, and
 * reading a whole transcript took 2.2 seconds and 1.24 GB of memory on a 411 MB conversation, inside a hook that has 10
 * seconds; each write is also a whole revision of the run. So a stop leaves a receipt read less than ten minutes ago as
 * it is, reads no transcript and writes nothing. The end of a session always writes one.
 */
export const A_STOP_WRITES_THE_RECEIPT_EVERY_MS = 10 * 60 * 1000

/**
 * Whether a stored receipt was read less than ten minutes before `nowMs`, by the local time its `readAt` says. A
 * receipt with no `readAt`, or one that cannot be read as a time, was not read lately, so it is written. A time is
 * read as this machine's local time, which the hooks wrote it in; around a clock change that can make one write early.
 * @param {unknown} stored
 * @param {number} nowMs
 * @returns {boolean}
 */
export function aReceiptReadLately(stored, nowMs) {
  const readAt = object(stored)['readAt']
  const at = typeof readAt === 'string' ? /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(readAt) : null
  if (at === null) return false
  const ms = new Date(Number(at[1]), Number(at[2]) - 1, Number(at[3]), Number(at[4]), Number(at[5]), Number(at[6])).getTime()
  return nowMs >= ms && nowMs - ms < A_STOP_WRITES_THE_RECEIPT_EVERY_MS
}

/**
 * THE NUMBERS A RECEIPT MAY CARRY, declared here so a reader in this file can sum them, and re-exported by
 * src/shared/usage-receipts.ts for everything else.
 */
export const USAGE_NUMBERS = /** @type {const} */ (['inputTokens', 'cachedInputTokens', 'cacheCreationInputTokens', 'outputTokens', 'reasoningTokens', 'durationMs', 'costUsd'])

/** Every line of a stream of JSON events that parses as an object, in order. */
/** @param {string} text @returns {Envelope[]} */
export function jsonLines(text) {
  /** @type {Envelope[]} */
  const out = []
  for (const line of String(text).split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || !trimmed.startsWith('{')) continue
    try {
      const parsed = JSON.parse(trimmed)
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) out.push(parsed)
    } catch {
      // A partial line at the end of a file that is still being written is not a fault.
      continue
    }
  }
  return out
}

/** An incomplete stream never becomes a complete total. Only add fields supplied by every event. */
/** @param {UsageReceipt[]} parts @returns {UsageReceipt} */
export function sum(parts) {
  /** @type {UsageReceipt} */
  const out = {}
  if (parts.length === 0) return out
  for (const key of USAGE_NUMBERS) {
    if (parts.every((part) => part[key] !== undefined)) out[key] = parts.reduce((total, part) => total + /** @type {number} */ (part[key]), 0)
  }
  return out
}

/** An envelope field, or an empty object when it is not one. */
/** @param {unknown} value @returns {Envelope} */
export function object(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? /** @type {Envelope} */ (value) : {}
}

/** A count, or undefined when the runtime did not give a usable one. Zero is a real measurement. */
/** @param {unknown} value @returns {number | undefined} */
export function number(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

/** The one model name every event agrees on, or undefined when they disagree or none said. */
/** @param {Envelope[]} events @returns {string | undefined} */
export function modelIn(events) {
  const names = new Set(events.map((event) => event['model']).filter((name) => typeof name === 'string' && name !== ''))
  return names.size === 1 ? /** @type {string} */ ([...names][0]) : undefined
}

/**
 * THE RECEIPT, WITH A SENTENCE NAMING WHAT THE ENVELOPE DID NOT GIVE.
 *
 * It is here rather than in each reader so that the Claude, Codex and OpenCode receipts all say
 * absence the same way.
 */
/** @param {UsageReceipt} receipt @returns {UsageReceipt} */
export function finish(receipt) {
  const missing = /** @type {const} */ (['inputTokens', 'cachedInputTokens', 'outputTokens', 'model', 'durationMs'])
  const names = { inputTokens: 'tokens in', cachedInputTokens: 'cached tokens', outputTokens: 'tokens out', model: 'model', durationMs: 'duration' }
  const absent = missing.filter((key) => receipt[key] === undefined).map((key) => names[key])
  return { ...receipt, ...(absent.length ? { says: `Not given in this output: ${absent.join(', ')}.` } : {}) }
}

/** Claude JSON result: input excludes cache reads and cache creation. See captured fixture. */
/** @param {string} said @returns {UsageReceipt} */
export function claudeUsage(said) {
  let envelope = /** @type {Envelope} */ ({})
  try { envelope = object(JSON.parse(said)) } catch { /* No JSON envelope: counts stay absent. */ }
  const usage = object(envelope['usage'])
  const models = Object.keys(object(envelope['modelUsage']))
  return finish({
    runtime: 'claude-code', source: '--output-format json result.usage and result.modelUsage',
    inputTokens: number(usage['input_tokens']), cachedInputTokens: number(usage['cache_read_input_tokens']),
    cacheCreationInputTokens: number(usage['cache_creation_input_tokens']), outputTokens: number(usage['output_tokens']),
    reasoningTokens: number(object(usage['output_tokens_details'])['thinking_tokens']), inputIncludesCached: false,
    model: modelIn([envelope]) ?? (models.length === 1 ? models[0] : undefined),
    durationMs: number(envelope['duration_ms']), costUsd: number(envelope['total_cost_usd']),
  })
}

/**
 * THE ENVELOPE AT THE END OF A RUN'S OUTPUT FILE, as its one line of JSON, or null when there is none.
 *
 * A sandbox round runs `claude -p --output-format json` with its standard output and its standard error in one file
 * (`<instance>/logs/<run>/out`, tools/sandbox-start.mjs). The envelope is the last line that is a JSON object of type
 * `result`. Anything else in the file, such as a line on the error channel, is passed over.
 * @param {string} text
 * @returns {string | null}
 */
export function theEnvelopeLineIn(text) {
  return theLastEnvelopeAmong(String(text).split('\n'))
}

/**
 * The last of these lines that is the envelope, trimmed, or null. The one rule of what an envelope line is, for a
 * caller that splits a file into lines itself.
 * @param {readonly string[]} lines
 * @returns {string | null}
 */
export function theLastEnvelopeAmong(lines) {
  for (let at = lines.length - 1; at >= 0; at -= 1) {
    const line = (lines[at] ?? '').trim()
    if (!line.startsWith('{')) continue
    try {
      if (object(JSON.parse(line))['type'] === 'result') return line
    } catch {
      // Not JSON; the envelope is a whole line of it, so keep looking above.
    }
  }
  return null
}

/**
 * WHERE A RUN RAN: the sandbox its launcher named, or "on the host" when no sandbox is named.
 *
 * SANDBOX_DIR is set by tools/sandbox-start.mjs for every process it starts in a sandbox, and the sandbox's name is
 * its folder's.
 * @param {Record<string, string | undefined>} env
 * @returns {string}
 */
export function whereItRan(env) {
  const dir = env['SANDBOX_DIR']
  if (typeof dir !== 'string' || dir.trim() === '') return RAN_ON_THE_HOST
  return `${RAN_IN_THE_SANDBOX}${dir.replace(/\/+$/, '').split('/').pop()}`
}

/**
 * THE OUTSIDE SPENDING A STORED RECEIPT HOLDS, carried onto a fresh one.
 *
 * A receipt is written whole by the run's end, while its outside spending is added by whoever paid
 * (tools/outside-spend.mjs). So every writer of a fresh receipt keeps what was spent outside, and this is the one
 * place that says how.
 * @param {unknown} stored The receipt the record holds now, if any.
 * @param {UsageReceipt} fresh
 * @returns {UsageReceipt}
 */
export function keepingTheOutsideSpend(stored, fresh) {
  const spent = object(stored)['outsideSpend']
  return Array.isArray(spent) && spent.length > 0 ? { ...fresh, outsideSpend: /** @type {UsageReceipt['outsideSpend']} */ (spent) } : fresh
}

/** Whether a receipt holds any of the numbers a receipt may carry (USAGE_NUMBERS). */
/** @param {unknown} receipt @returns {boolean} */
export function aReceiptHoldsNumbers(receipt) {
  const one = object(receipt)
  return USAGE_NUMBERS.some((key) => typeof one[key] === 'number')
}

/** The words the guard below adds to a stored receipt when a later reading found no numbers. */
export const A_LATER_READING_FOUND_NO_NUMBERS = 'A later reading found no numbers, so the numbers here were kept from the earlier one. It said: '

/**
 * THE `usageReceipt` OF A dataPatch THAT WRITES A FRESH RECEIPT OVER THE STORED ONE. ONE WRITER (the answer,
 * message k0eknvS08jLE, 2; wave 13s round 42).
 *
 * The office merges a dataPatch into what is stored, key by key (src/server/lib/records/merge-data.ts), so a receipt
 * sent as it is keeps every stored key it leaves out. Run 2WL9TfhVa3u6 showed what that does: its seal wrote "No numbers
 * were read at the seal", the launcher then wrote its numbers, and the record held both. So the later write replaces
 * the earlier one whole. Every stored key is sent as null, which the merge deletes, unless the fresh receipt gives it a
 * value. Outside spending already stored is kept (keepingTheOutsideSpend).
 *
 * THE GUARD: a write never makes the receipt worse. When the fresh reading holds no numbers and the stored receipt holds
 * some, the stored receipt stays whole, and only the fresh reading's words are added to its own, once.
 *
 * tools/sandbox-start.mjs and tools/office-request.mjs, the two writers of 2WL9TfhVa3u6's receipt, both write through it.
 * @param {unknown} stored The receipt the record holds now, if any.
 * @param {UsageReceipt} fresh
 * @returns {Record<string, unknown>}
 */
export function theReceiptWrittenOver(stored, fresh) {
  const kept = object(stored)
  if (!aReceiptHoldsNumbers(fresh) && aReceiptHoldsNumbers(kept)) {
    const added = `${A_LATER_READING_FOUND_NO_NUMBERS}${fresh.says ?? 'it gave no reason.'}`
    const says = typeof kept['says'] === 'string' ? kept['says'] : ''
    return { says: says.includes(added) ? says : `${says === '' ? '' : `${says} `}${added}` }
  }
  /** @type {Record<string, unknown>} */
  const patch = {}
  for (const key of Object.keys(kept)) patch[key] = null
  for (const [key, value] of Object.entries(keepingTheOutsideSpend(stored, fresh))) if (value !== undefined) patch[key] = value
  return patch
}

/**
 * THE RUN A ROUND CONTINUES, as its launcher or the message worker found it (the answer, message k0eknvS08jLE, 1),
 * read by src/config/the-run-it-continues.mjs. Null for a run that continues none, so it is its conversation's or
 * thread's first. Otherwise the previous run's id and the text of its output file, or its id and why that file was not
 * read. A resumed Codex run whose worker was not told which run of the thread came before it gives the thread alone
 * (src/worker/runtimes/codex.ts).
 * @typedef {null | { run: string, text: string } | { run: string, unread: string } | { thread: string }} ThePreviousRun
 */

/** How a receipt names what a round continues. */
/** @param {Exclude<ThePreviousRun, null>} previous @returns {string} */
function theContinuation(previous) {
  return 'thread' in previous ? `This run resumes Codex thread ${previous.thread}` : `This run continues run ${previous.run}`
}

/** Why the total at the end of what a round continues is unknown, when its output was not read; null when it was. */
/** @param {Exclude<ThePreviousRun, null>} previous @returns {string | null} */
function whyTheEarlierTotalIsUnknown(previous) {
  if ('thread' in previous) return 'and the message worker was not told which run of that thread came before it.'
  if ('unread' in previous) return `whose output file could not be read (${previous.unread}).`
  return null
}

/**
 * THE RECEIPT A LAUNCHER WRITES WHEN A CLAUDE CODE RUN'S COMMAND ENDS (tools/sandbox-start.mjs), read from what the
 * command printed under `--output-format json`. The envelope is found by theEnvelopeLineIn. A run that failed still
 * printed one, so this is the same whatever the exit was. With no envelope, every number stays absent ("not reported",
 * never 0) and `says` names why. Which login paid and where it ran are written beside, and outside spending already on
 * the stored receipt is kept.
 *
 * A ROUND THAT CONTINUES A CONVERSATION (`--continue`) is given the conversation's cost so far in `total_cost_usd`, so its
 * own cost is that less what the run it continues reported at its end (theRoundsOwnClaudeUsage). Its token counts are
 * already its own.
 * @param {{ text: string, noEnvelope: string, previous: ThePreviousRun, stored: unknown, paidBy: string, ranIn: string }} at
 * @returns {UsageReceipt}
 */
export function theReceiptOfAnEndedCommand({ text, noEnvelope, previous, stored, paidBy, ranIn }) {
  const line = theEnvelopeLineIn(text)
  const read = line === null ? { runtime: 'claude-code', says: noEnvelope } : theRoundsOwnClaudeUsage(line, previous)
  return keepingTheOutsideSpend(stored, { ...read, paidBy, ranIn })
}

/**
 * A CLAUDE CODE ROUND'S OWN COST (fault 1 of round 42, run 2WL9TfhVa3u6). Claude Code's `total_cost_usd` is the
 * conversation's cost so far, every earlier round included, while `usage` and `duration_ms` are this command's own. So
 * the round's cost is its `total_cost_usd` less the one in the envelope of the run it continues, when both envelopes
 * name the same conversation. When that envelope cannot be found or read, the cost is left out, and the words give the
 * conversation's total as its total.
 * @param {string} line The run's envelope line.
 * @param {ThePreviousRun} previous
 * @returns {UsageReceipt}
 */
export function theRoundsOwnClaudeUsage(line, previous) {
  const read = claudeUsage(line)
  if (previous === null || read.costUsd === undefined) return read
  const total = read.costUsd
  const cannot = (/** @type {string} */ why) => {
    const { costUsd: _total, ...rest } = read
    return { ...rest, says: `${read.says === undefined ? '' : `${read.says} `}${theContinuation(previous)}, ${why} So the cost Claude Code gave, ${total} USD, is the conversation's total so far, over every round of it, and not this run's own. No cost is kept on this receipt as this run's.` }
  }
  const unknown = whyTheEarlierTotalIsUnknown(previous)
  if (unknown !== null || !('text' in previous)) return cannot(unknown ?? '')
  const before = theEnvelopeLineIn(previous.text)
  if (before === null) return cannot('whose output holds no --output-format json envelope, so the conversation\'s cost at its end is unknown.')
  const was = object(JSON.parse(before))
  const now = object(JSON.parse(line))
  const conversation = (/** @type {Envelope} */ one) => (typeof one['session_id'] === 'string' && one['session_id'] !== '' ? one['session_id'] : null)
  if (conversation(now) === null || conversation(was) !== conversation(now)) {
    return cannot(`whose envelope names conversation ${String(conversation(was) ?? 'none')}, while this run's names ${String(conversation(now) ?? 'none')}.`)
  }
  const then = number(was['total_cost_usd'])
  if (then === undefined) return cannot('whose envelope gives no cost.')
  if (then > total) return cannot(`whose cost, ${then} USD, is larger than this run's, so the two are not one conversation's totals.`)
  return { ...read, costUsd: total - then, source: `${String(read.source)}; the cost is total_cost_usd less the ${then} USD run ${previous.run} reported at its end` }
}

/** What a receipt says Codex's turn.completed and "tokens used" readings came from. */
const CODEX_SOURCE = "--json turn.completed.usage, the last one, which is the thread's total so far; model announcement when present"

/** The most of a failed turn's message a receipt quotes, in characters. */
const THE_MOST_OF_A_MESSAGE_QUOTED = 200

/** The counts of one Codex usage object. Codex's events carry no duration and no cost. */
/** @param {Envelope} usage @returns {UsageReceipt} */
function theCodexCounts(usage) {
  return { inputTokens: number(usage['input_tokens']), cachedInputTokens: number(usage['cached_input_tokens']),
    cacheCreationInputTokens: number(usage['cache_write_input_tokens']), outputTokens: number(usage['output_tokens']),
    reasoningTokens: number(usage['reasoning_output_tokens']) }
}

/**
 * A CODEX COMMAND'S USAGE, from what `codex exec --json` printed. Its last `turn.completed` event is the thread's total
 * so far, cached input included (measured in round 42: a resumed seven-round thread reported 60,338,872 tokens in
 * for a one-word answer). For a command that began its thread, that is the command's own usage. The message worker's
 * Codex adapter (src/worker/runtimes/codex.ts) and the launcher both read it here. Codex's events carry no cost, so the
 * cost stays absent and `says` says so.
 * @param {string} said
 * @returns {UsageReceipt}
 */
export function codexUsage(said) {
  const events = jsonLines(said)
  const last = events.filter((event) => event['type'] === 'turn.completed').at(-1)
  const receipt = finish({ ...(last === undefined ? {} : theCodexCounts(object(last['usage']))), runtime: 'codex', source: CODEX_SOURCE,
    inputIncludesCached: true, model: modelIn(events) })
  return { ...receipt, says: `${receipt.says === undefined ? '' : `${receipt.says} `}Codex reports no cost.` }
}

/** The thread a Codex output's first thread.started event names, or null. */
/** @param {Envelope[]} events @returns {string | null} */
function theCodexThreadOf(events) {
  const id = events.find((event) => event['type'] === 'thread.started')?.['thread_id']
  return typeof id === 'string' && id !== '' ? id : null
}

/**
 * THE ONE TOTAL CODEX'S PLAIN TEXT GIVES. Without --json, Codex 0.159.2 ends its output with a line "tokens used" and the
 * total on the next line, such as "425,719" (run V9PIC7m9HQYx; answer k0eknvS08jLE, 3). The last such pair, or
 * null.
 * @param {string[]} lines The output's lines, trimmed, with the empty ones left out.
 * @returns {{ printed: string, count: number } | null}
 */
function theTokensUsedIn(lines) {
  for (let at = lines.length - 2; at >= 0; at -= 1) {
    const printed = lines[at + 1] ?? ''
    if (lines[at] === 'tokens used' && /^\d{1,3}(,\d{3})*$|^\d+$/.test(printed)) return { printed, count: Number(printed.replaceAll(',', '')) }
  }
  return null
}

/** A message an event gave, cut to THE_MOST_OF_A_MESSAGE_QUOTED characters and quoted, or words saying it gave none. */
/** @param {unknown} message @returns {string} */
function quoted(message) {
  if (typeof message !== 'string' || message.trim() === '') return 'it gave no message.'
  const one = message.trim().replace(/\s+/g, ' ')
  return `"${one.length > THE_MOST_OF_A_MESSAGE_QUOTED ? `${one.slice(0, THE_MOST_OF_A_MESSAGE_QUOTED)}…` : one}".`
}

/**
 * WHY A CODEX OUTPUT HOLDS NO turn.completed EVENT, worked out from the output (fault 2 of round 42, run
 * V9PIC7m9HQYx), and never only "no turn.completed". In this order: plain text that ends with its "tokens used" total; a
 * failed turn, or an error event, with its message; a command stopped by a signal; an empty output; an output cut part-way
 * through a line of JSON; an output with no JSON event at all; and otherwise the last event Codex printed.
 * @param {string} text
 * @param {Envelope[]} events
 * @param {string | null} stopped How the command was stopped, such as "by SIGTERM", or null.
 * @param {ThePreviousRun} previous
 * @returns {string}
 */
function whyCodexReportedNoUsage(text, events, stopped, previous) {
  const lines = String(text).split('\n').map((line) => line.trim()).filter((line) => line !== '')
  const total = theTokensUsedIn(lines)
  if (total !== null) {
    return `Codex printed plain text, not codex exec --json events, so the one usage it gave is its "tokens used" line, ${total.printed}. ` +
      'That is a single total, not split into tokens in, cached tokens and tokens out, so it is kept in these words only and is not priced.' +
      (previous === null ? '' : ` ${theContinuation(previous)}, so the total is the thread's so far, over every round of it, and not this run's own.`) +
      ' Codex reports no cost.'
  }
  const failed = events.filter((event) => event['type'] === 'turn.failed').at(-1)
  if (failed !== undefined) return `The turn failed before Codex reported usage: ${quoted(object(failed['error'])['message'])}`
  const error = events.filter((event) => event['type'] === 'error').at(-1)
  if (error !== undefined) return `Codex reported an error before it reported usage: ${quoted(error['message'])}`
  if (stopped !== null) return `The run was stopped ${stopped} before Codex reported usage.`
  const last = lines.at(-1)
  if (last === undefined) return 'The output is empty, so Codex reported nothing.'
  if (last.startsWith('{') && jsonLines(last).length === 0) return 'The output ends part-way through a line of JSON, so it was cut before Codex reported usage.'
  if (events.length === 0) return 'The output holds no event of codex exec --json and no "tokens used" line of Codex\'s plain text, so Codex reported no usage that can be read.'
  return `Codex's last event was ${JSON.stringify(events.at(-1)?.['type'] ?? 'of no type')}, and no turn.completed came after it, so no usage was reported.`
}

/**
 * A CODEX ROUND'S OWN USAGE (fault 1 of round 42). `codex exec resume` reports the thread's total so far, so a
 * round's own usage is its last turn.completed less the last one of the run it continues, when both outputs name the
 * same thread. A run that continues none is its thread's first, and its total is its own. When the earlier total cannot
 * be found, no number is kept, and the words give the figures as the thread's total so far.
 * @param {string} text The run's whole output.
 * @param {ThePreviousRun} previous
 * @param {string | null} stopped How the command was stopped, such as "by SIGTERM", or null.
 * @returns {UsageReceipt}
 */
export function theRoundsOwnCodexUsage(text, previous, stopped) {
  const events = jsonLines(text)
  if (!events.some((event) => event['type'] === 'turn.completed')) return { runtime: 'codex', says: whyCodexReportedNoUsage(text, events, stopped, previous) }
  const total = codexUsage(text)
  if (previous === null) return total
  const cannot = (/** @type {string} */ why) => {
    const figures = /** @type {const} */ ([['inputTokens', 'tokens in'], ['cachedInputTokens', 'cached tokens'], ['cacheCreationInputTokens', 'cache written'], ['outputTokens', 'tokens out'], ['reasoningTokens', 'reasoning tokens']])
      .filter(([key]) => total[key] !== undefined).map(([key, name]) => `${name} ${String(total[key])}`)
    return { runtime: 'codex', source: CODEX_SOURCE, ...(total.model === undefined ? {} : { model: total.model }),
      says: `${theContinuation(previous)}, ${why} So the figures Codex gave are the thread's total so far, over every round of it, and not this run's own: ${figures.length === 0 ? 'none' : figures.join(', ')}. None of them is kept on this receipt as a number of this run's. Codex reports no cost.` }
  }
  const unknown = whyTheEarlierTotalIsUnknown(previous)
  if (unknown !== null || !('text' in previous)) return cannot(unknown ?? '')
  const earlier = jsonLines(previous.text)
  const last = earlier.filter((event) => event['type'] === 'turn.completed').at(-1)
  if (last === undefined) return cannot('whose output holds no turn.completed event, so the thread\'s total at its end is unknown.')
  const thread = theCodexThreadOf(events)
  if (thread === null || theCodexThreadOf(earlier) !== thread) {
    return cannot(`whose output names Codex thread ${String(theCodexThreadOf(earlier) ?? 'none')}, while this run's names ${String(thread ?? 'none')}.`)
  }
  const then = theCodexCounts(object(last['usage']))
  /** @type {UsageReceipt} */
  const own = {}
  for (const key of /** @type {const} */ (['inputTokens', 'cachedInputTokens', 'cacheCreationInputTokens', 'outputTokens', 'reasoningTokens'])) {
    const now = total[key]
    const was = then[key]
    if (now === undefined || was === undefined) continue
    if (was > now) return cannot(`whose thread's total is larger than this run's (${key} ${was} against ${now}), so the two are not one thread's totals.`)
    own[key] = now - was
  }
  const receipt = finish({ ...own, runtime: 'codex', source: `${CODEX_SOURCE}, less the total run ${previous.run} reported at its end`, inputIncludesCached: true, model: total.model })
  return { ...receipt, says: `${receipt.says === undefined ? '' : `${receipt.says} `}Codex reports no cost.` }
}

/**
 * THE RECEIPT A LAUNCHER WRITES WHEN A CODEX RUN'S COMMAND ENDS (tools/sandbox-start.mjs), read from what the command
 * printed, whatever the exit was: the round's own part of its thread's total (theRoundsOwnCodexUsage). `unread` is why
 * the output was not read, or null when `text` is the whole of it. A command that reported no usage leaves every number
 * absent, and `says` names why. The launcher cannot tell which Codex login paid, so that is "not reported". Where it ran
 * is written beside, and outside spending already on the stored receipt is kept.
 * @param {{ text: string, unread: string | null, stopped: string | null, previous: ThePreviousRun, stored: unknown, ranIn: string }} at
 * @returns {UsageReceipt}
 */
export function theReceiptOfAnEndedCodexCommand({ text, unread, stopped, previous, stored, ranIn }) {
  const read = unread === null ? theRoundsOwnCodexUsage(text, previous, stopped) : { runtime: 'codex', says: unread }
  return keepingTheOutsideSpend(stored, { ...read, paidBy: RECEIPT_NOT_REPORTED, ranIn })
}

const OPENCODE_SOURCE = '--format json step_finish.part.tokens and cost'

/** OpenCode step_finish parts are per-step deltas; input excludes cache reads and writes. */
/** @param {string} said @returns {UsageReceipt} */
export function openCodeUsage(said) {
  const events = jsonLines(said)
  const seen = new Set()
  const parts = events.filter((event) => event['type'] === 'step_finish').flatMap((event) => {
    const part = object(event['part'])
    const id = part['id']
    if (typeof id === 'string') {
      if (seen.has(id)) return []
      seen.add(id)
    }
    const tokens = object(part['tokens'])
    const cache = object(tokens['cache'])
    return [{ inputTokens: number(tokens['input']), cachedInputTokens: number(cache['read']),
      cacheCreationInputTokens: number(cache['write']), outputTokens: number(tokens['output']),
      reasoningTokens: number(tokens['reasoning']), costUsd: number(part['cost']) }]
  })
  return finish({ ...sum(parts), runtime: 'opencode', source: OPENCODE_SOURCE, inputIncludesCached: false, model: modelIn(events) })
}

/**
 * THE RECEIPT A LAUNCHER WRITES WHEN AN OPENCODE RUN'S COMMAND ENDS (tools/sandbox-start.mjs; message
 * SAmHNCUlzQNN, wave 13s round 42). `opencode run --format json` prints a step_finish event after each step with that
 * step's own tokens and cost, and openCodeUsage sums them, so the sum is this command's own. An output with none says so
 * in words and holds no number. Which login paid is not known here, so that is "not reported"; where it ran is written
 * beside, and outside spending already on the stored receipt is kept.
 * @param {{ text: string, unread: string | null, stored: unknown, ranIn: string }} at
 * @returns {UsageReceipt}
 */
export function theReceiptOfAnEndedOpenCodeCommand({ text, unread, stored, ranIn }) {
  const read = unread !== null
    ? { runtime: 'opencode', says: unread }
    : jsonLines(text).some((event) => event['type'] === 'step_finish')
      ? openCodeUsage(text)
      : { runtime: 'opencode', source: OPENCODE_SOURCE, says: "The run's output holds no step_finish event, so OpenCode reported no usage. It prints one after each step only when it is run with --format json." }
  return keepingTheOutsideSpend(stored, { ...read, paidBy: RECEIPT_NOT_REPORTED, ranIn })
}

/**
 * A CODEX RUN'S USAGE, read from its thread's own rollout, in wave 13s round 34. Each
 * `token_count` event carries `total_token_usage`, the thread's total so far, cached input included. A thread can hold
 * rounds before this run, so the run's part is the last total minus the last total stamped before `sinceMs`. That
 * earlier total is zero when the thread began at or after `sinceMs`, or when `whole` says the text is the whole file
 * and nothing before `sinceMs` counted tokens. When `text` is only the file's end and does not reach back to such a
 * total, the run's part cannot be told, so every number stays absent and `says` says why. Codex's rollout carries no
 * cost.
 * @param {string} text
 * @param {number} sinceMs
 * @param {boolean} whole
 * @returns {UsageReceipt}
 */
export function codexRolloutUsage(text, sinceMs, whole) {
  /** @type {Envelope | null} */
  let before = null
  /** @type {Envelope | null} */
  let last = null
  let beganSince = false
  /** @type {Envelope[]} */
  const contexts = []
  for (const event of jsonLines(text)) {
    const at = typeof event['timestamp'] === 'string' ? Date.parse(event['timestamp']) : NaN
    if (!Number.isFinite(at)) continue
    const payload = object(event['payload'])
    if (event['type'] === 'session_meta' && at >= sinceMs) beganSince = true
    if (event['type'] === 'turn_context' && at >= sinceMs) contexts.push(payload)
    if (event['type'] !== 'event_msg' || payload['type'] !== 'token_count') continue
    const total = object(object(payload['info'])['total_token_usage'])
    if (Object.keys(total).length === 0) continue
    if (at < sinceMs) before = total
    else last = total
  }
  const source = "the Codex rollout, the last token_count's total_token_usage less the last one before the run began"
  const words = (/** @type {string} */ why) => ({ runtime: 'codex', source, says: `${why} Codex reports no cost.` })
  if (before === null && !beganSince && !whole) {
    return words('The end of the rollout that was read does not reach back to before the run began, so the run\'s own part of the thread\'s total cannot be told.')
  }
  if (last === null) return words('The rollout holds no token count stamped after the run began.')
  const at = /** @type {Envelope} */ (last)
  const part = (/** @type {string} */ name) => {
    const now = number(at[name])
    const then = before === null ? 0 : number(before[name])
    return now === undefined || then === undefined || now < then ? undefined : now - then
  }
  const receipt = finish({
    runtime: 'codex', source,
    inputTokens: part('input_tokens'), cachedInputTokens: part('cached_input_tokens'),
    cacheCreationInputTokens: part('cache_write_input_tokens'), outputTokens: part('output_tokens'),
    reasoningTokens: part('reasoning_output_tokens'), inputIncludesCached: true, model: modelIn(contexts),
  })
  return { ...receipt, says: `${receipt.says === undefined ? '' : `${receipt.says} `}Codex reports no cost.` }
}

/** A count summed over events, or undefined when no event gave one. Zero from an event is a measured zero. */
/** @param {(number | undefined)[]} counts @returns {number | undefined} */
function summed(counts) {
  const given = counts.filter((one) => one !== undefined)
  return given.length === 0 ? undefined : given.reduce((sum, one) => sum + /** @type {number} */ (one), 0)
}

/**
 * A CLAUDE CODE RUN'S USAGE SO FAR, read from its own transcripts (milestone M8).
 *
 * Each assistant line carries `message.usage`, and Claude Code writes one line for each part of one answer with the
 * same `message.id` and the same usage. So each id is counted once, from its last line. `sinceMs` leaves out lines
 * stamped before the run began: a round that continues a conversation shares its transcript with the rounds before
 * it. The transcript gives no cost and no duration, so those stay absent and the receipt says so.
 * @param {string[]} texts
 * @param {number} sinceMs
 * @returns {UsageReceipt}
 */
export function claudeTranscriptUsage(texts, sinceMs) {
  const answers = claudeAnswersSince(sinceMs)
  for (const text of texts) claudeAnswersFoldedIn(answers, text)
  return theReceiptOfClaudeAnswers(answers)
}

/**
 * WHAT THE RECEIPT OF A CLAUDE CODE TRANSCRIPT READS OF ONE ANSWER: its four counts and its model, never its content.
 * @typedef {{ inputTokens: number | undefined, cachedInputTokens: number | undefined, cacheCreationInputTokens: number | undefined, outputTokens: number | undefined, model: string | undefined }} AClaudeAnswer
 */
/**
 * A CLAUDE CODE TRANSCRIPT'S ANSWERS SO FAR, as the lines folded in leave them: each answer by its id, in the order the
 * ids were first seen, and how many answers with no id were given a name.
 * @typedef {{ sinceMs: number, byId: Map<string, AClaudeAnswer>, unnamed: number }} ClaudeAnswers
 */

/** No answers yet, of the lines stamped at or after `sinceMs`. @param {number} sinceMs @returns {ClaudeAnswers} */
export function claudeAnswersSince(sinceMs) {
  return { sinceMs, byId: new Map(), unnamed: 0 }
}

/**
 * THE LINES OF `text` FOLDED INTO `answers`, worked out here once. claudeTranscriptUsage folds in whole transcripts, and
 * the step reminder (claudeCodeTokensSoFarReadOn in ./tokens-so-far.mjs) folds in only the lines added to a conversation
 * file since it last read it, into the answers it kept. So an answer keeps only what the receipt reads: it is kept
 * between passes, and its content would be kept with it. Changes `answers` and returns it.
 * @param {ClaudeAnswers} answers
 * @param {string} text
 * @returns {ClaudeAnswers}
 */
export function claudeAnswersFoldedIn(answers, text) {
  for (const line of String(text).split('\n')) {
    if (line.trim() === '') continue
    let event
    try { event = object(JSON.parse(line)) } catch { continue }
    if (event['type'] !== 'assistant') continue
    const at = typeof event['timestamp'] === 'string' ? Date.parse(event['timestamp']) : NaN
    if (!Number.isFinite(at) || at < answers.sinceMs) continue
    const message = object(event['message'])
    const usage = object(message['usage'])
    if (Object.keys(usage).length === 0) continue
    const id = typeof message['id'] === 'string' && message['id'] !== '' ? message['id'] : `unnamed ${answers.unnamed += 1}`
    answers.byId.set(id, {
      inputTokens: number(usage['input_tokens']), cachedInputTokens: number(usage['cache_read_input_tokens']),
      cacheCreationInputTokens: number(usage['cache_creation_input_tokens']), outputTokens: number(usage['output_tokens']),
      model: typeof message['model'] === 'string' ? message['model'] : undefined,
    })
  }
  return answers
}

/** The receipt of the answers folded in so far. @param {ClaudeAnswers} answers @returns {UsageReceipt} */
export function theReceiptOfClaudeAnswers(answers) {
  const kept = [...answers.byId.values()]
  const receipt = finish({
    runtime: 'claude-code', source: 'the conversation transcript, message.usage once for each answer',
    inputTokens: summed(kept.map((a) => a.inputTokens)), cachedInputTokens: summed(kept.map((a) => a.cachedInputTokens)),
    cacheCreationInputTokens: summed(kept.map((a) => a.cacheCreationInputTokens)), outputTokens: summed(kept.map((a) => a.outputTokens)),
    ...(kept.length === 0 ? {} : { inputIncludesCached: false }),
    model: modelIn(kept.filter((a) => a.model !== '<synthetic>')),
  })
  return { ...receipt, says: `${receipt.says === undefined ? '' : `${receipt.says} `}The transcript carries no cost.` }
}

/**
 * WHAT dshTranscriptUsage READS OF A DSH TRANSCRIPT, worked out here once: for each assistant/message event, its
 * `data.usage` and `data.message.source` as they are. A dsh check's line carries these and nothing else
 * (dshAnswersCarried), so a field the count reads is carried with it.
 * @param {string} text
 * @returns {{ usage: unknown, source: unknown }[]}
 */
function theDshAnswersIn(text) {
  /** @type {{ usage: unknown, source: unknown }[]} */
  const answers = []
  for (const line of String(text).split('\n')) {
    if (line.trim() === '') continue
    let event
    try { event = object(JSON.parse(line)) } catch { continue }
    if (event['type'] !== 'assistant/message') continue
    const data = object(event['data'])
    answers.push({ usage: data['usage'], source: object(data['message'])['source'] })
  }
  return answers
}

/**
 * A DSH TRANSCRIPT CUT TO WHAT dshTranscriptUsage READS: one assistant/message event for each of its answers, holding the
 * answer's data.usage and data.message.source and nothing else. No other event is kept. dshTranscriptUsage reads the cut
 * text as it reads the whole one.
 * @param {string} text
 * @returns {string}
 */
function dshAnswersCarried(text) {
  return theDshAnswersIn(text).map(({ usage, source }) => JSON.stringify({ type: 'assistant/message', data: { usage, message: { source } } })).join('\n')
}

/**
 * A dsh RUN'S USAGE, read from its own transcript.
 *
 * dsh writes one `usage` on each assistant/message event's `data`, with its counts kept apart: `inputTokens` is the
 * input that was not cached, and `cacheReadTokens` and `cacheWriteTokens` are the cached parts (TokenUsage in
 * @deepseek-ai/dsh-llm). The copies of the same numbers inside each message's `stream` array are never counted,
 * because counting them doubles the total (report jDwkhne4tDWR, block 2; tools/dsh-hooks/served.mjs). dsh gives no
 * cost, so it stays absent.
 * @param {string} text
 * @returns {UsageReceipt}
 */
export function dshTranscriptUsage(text) {
  const answers = theDshAnswersIn(text)
  const usages = answers.map((answer) => object(answer.usage)).filter((usage) => Object.keys(usage).length > 0)
  const sources = answers.map((answer) => object(answer.source))
  const receipt = finish({
    runtime: 'dsh', source: 'the dsh transcript, data.usage on each assistant/message event',
    inputTokens: summed(usages.map((u) => number(u['inputTokens']))), cachedInputTokens: summed(usages.map((u) => number(u['cacheReadTokens']))),
    cacheCreationInputTokens: summed(usages.map((u) => number(u['cacheWriteTokens']))), outputTokens: summed(usages.map((u) => number(u['outputTokens']))),
    reasoningTokens: summed(usages.map((u) => number(u['reasoningTokens']))),
    ...(usages.length === 0 ? {} : { inputIncludesCached: false }),
    model: modelIn(sources),
  })
  return { ...receipt, says: `${receipt.says === undefined ? '' : `${receipt.says} `}dsh reports no cost.` }
}
