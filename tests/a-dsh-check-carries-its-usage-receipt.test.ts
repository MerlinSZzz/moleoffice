// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DSH CHECK CARRIES ITS USAGE RECEIPT, AND SAYS IT CANNOT NAME THE MODEL THAT SERVED IT.
 *
 * The secretary's message uVlfyTGEjhbq gave wave 13n a check on dsh's ACP driver, and 1S-Comh3Shf- point 4 settled what its
 * receipt says. The check tool prints one INSPECTION-MODEL-OUTPUT line. The office's worker reads that line and cannot
 * reach the check's home, which may be gone by then. So a dsh line carries the check's own transcript itself, or the
 * reason it was not read. With the text, the tokens are counted by dshTranscriptUsage, the reader the dsh workers'
 * receipts use, and the receipt names where the count came from. Without it, the receipt says the tokens are not
 * reported in dsh's ACP output. Either way it says dsh reports no cost. The served model is "not reported".
 *
 * Every transcript and every envelope here is synthetic text written in this file. No model runs, no dsh runs, and no
 * key is held. The worker's side is driven through InspectionAdapter.readResult and servedOf over a file, as
 * tests/every-run-records-the-model-it-was-served.test.ts drives servedOf.
 *
 * MUTATIONS, and the cases each turns red:
 *   U1. inspectionUsageIn and inspectionUsageLine accept a dsh line without a transcript: "refuses a dsh line with no
 *       transcript" (case 3) and "refuses dsh without a transcript" (case 4).
 *   U2. The receipt's source does not name the `from` path: "counts the transcript the line carries" (case 1).
 *   U3. The not-read receipt leaves out "dsh reports no cost.": "says the tokens are not reported" (case 2).
 *   U4. servedOf names a model for dsh: "serves nothing and says the model is not reported" (case 5).
 *   U5. The line carries the whole transcript text: "carries only each answer's usage and source" (case 7).
 *   U6. The line keeps only the answers that carry a usage: "counts the same from the line as from the whole text" (case 8).
 *   U7. The receipt writes the model asked for into `model`: "keeps the model the transcript names" (case 9).
 *   U8. The receipt leaves out `modelRequested`: both cases 9.
 *   U9. inspectionUsageIn takes a model asked for that is not a string with words in it: "refuses a dsh line whose model
 *       asked for is" (case 10).
 *
 * THE MODEL ASKED FOR IS ITS OWN FIELD (Dxiry_2y6vuD point 3). A dsh check's line carries the model the check asked
 * dsh for, and the receipt keeps it as `modelRequested`. `model` stays the model the transcript names, or absent. The two
 * can differ, and neither is written over the other. servedOf still says the served model is not reported.
 *
 * WHY THE LINE CARRIES SO LITTLE (message meSWfODwknO1). A whole dsh transcript holds what the model
 * read and wrote, every tool result among it. A check's model has DEEPSEEK_API_KEY in its environment, so a transcript may
 * hold the key, and the check's output log is stored without masking. So the line carries, for each assistant/message
 * event, only data.usage and data.message.source, the two fields dshTranscriptUsage reads, and no other event.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { NOT_REPORTED } from '../src/config/claude-code-served.mjs'
import {
  aReceiptHoldsNumbers,
  dshTranscriptUsage,
  INSPECTION_USAGE_LINE,
  inspectionUsageIn,
  inspectionUsageLine,
  inspectionUsageReceipt,
} from '../src/config/usage.mjs'
import type { RunHandle } from '../src/worker/runtimes/adapter.ts'
import { InspectionAdapter } from '../src/worker/runtimes/inspection.ts'

const scratch = mkdtempSync(join(tmpdir(), 'dsh-check-receipt-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

const FROM = '/check/home/.dsh/sessions/--work--/0f1e2d3c-4b5a-4968-8776-655443322110/session.v3.jsonl.zstd'

/** One assistant/message event, shaped as dshTranscriptUsage reads it (data.usage, data.message.source). */
function anAnswer(usage: Record<string, number>, model = 'deepseek-synthetic-model'): string {
  return JSON.stringify({ type: 'assistant/message', data: { usage, message: { source: { provider: 'deepseek-official', model } } } })
}

/** Two synthetic answers. */
const ANSWERS = [
  anAnswer({ inputTokens: 120, cacheReadTokens: 30, cacheWriteTokens: 5, outputTokens: 40, reasoningTokens: 7 }),
  anAnswer({ inputTokens: 80, cacheReadTokens: 10, cacheWriteTokens: 0, outputTokens: 25, reasoningTokens: 3 }),
]

/** A synthetic transcript of the two answers, with the lines dsh writes before any answer. */
const TRANSCRIPT = [
  JSON.stringify({ type: 'session', data: { id: 'synthetic' } }),
  JSON.stringify({ type: 'approval/policy', data: { policy: 'never' } }),
  ...ANSWERS,
].join('\n')

/** What a line carries of TRANSCRIPT: its answers, each already no more than its usage and source. */
const CARRIED = ANSWERS.join('\n')

/** The client's one envelope line, as tools/inspector-dsh-acp.mjs prints it. Synthetic. */
const ENVELOPE = JSON.stringify({ type: 'dsh-acp-result', sessionId: '0f1e2d3c-4b5a-4968-8776-655443322110', resumed: false,
  route: { provider: 'deepseek-official', model: 'deepseek-flash' }, effortSet: null, effortReported: 'high', stopReason: 'end_turn',
  isError: false, error: null, result: 'VERDICT: released' })

/** The worker's handle on a check whose output file holds `said`. */
function aCheckThatSaid(said: string, name: string): RunHandle {
  const outputPath = join(scratch, `out-${name}`)
  writeFileSync(outputPath, said)
  return { runtime: 'inspection-tool', pid: 0, pgid: 0, startedAt: '2026-10-17 20:00:00', providerSession: null, outputPath }
}

const adapter = () => new InspectionAdapter({ run: 'synthetic-check', checkout: null, model: 'deepseek-v4.1-flash' }, {})

describe('a dsh check line with its transcript text', () => {
  it('counts the transcript the line carries, names the from path, and says dsh reports no cost (case 1)', () => {
    const line = inspectionUsageLine('dsh', ENVELOPE, { text: TRANSCRIPT, from: FROM })
    const receipt = adapter().readResult(aCheckThatSaid(`checking\n${line}\nreleased\n`, 'with-text')).usageReceipt
    const counted = dshTranscriptUsage(TRANSCRIPT)
    expect(receipt).toBeDefined()
    expect(receipt?.runtime).toBe('dsh')
    for (const key of ['inputTokens', 'cachedInputTokens', 'cacheCreationInputTokens', 'outputTokens', 'reasoningTokens', 'inputIncludesCached', 'model'] as const) {
      expect(receipt?.[key]).toEqual(counted[key])
    }
    expect(receipt?.inputTokens).toBe(200)
    expect(receipt?.outputTokens).toBe(65)
    expect(receipt?.costUsd).toBeUndefined()
    expect(receipt?.source).toContain(FROM)
    expect(receipt?.source).toContain("the check's own dsh transcript")
    expect(receipt?.source).toContain('data.usage on each assistant/message event')
    expect(receipt?.says).toBe(counted.says)
    expect(receipt?.says?.endsWith('dsh reports no cost.')).toBe(true)
  })
})

describe('a dsh check line whose transcript was not read', () => {
  it('says the tokens are not reported in dsh\'s ACP output, with the why, and counts nothing (case 2)', () => {
    const why = 'the session folder holds two transcript files'
    const line = inspectionUsageLine('dsh', ENVELOPE, { text: null, why })
    const receipt = adapter().readResult(aCheckThatSaid(`${line}\n`, 'not-read')).usageReceipt
    expect(receipt).toEqual({
      runtime: 'dsh',
      source: "the check tool's dsh ACP output",
      says: `The tokens are not reported in dsh's ACP output, and the check's own transcript was not read: ${why}. dsh reports no cost.`,
    })
    expect(aReceiptHoldsNumbers(receipt)).toBe(false)
  })

  it('never counts the ACP usage_update numbers as tokens', () => {
    const output = [ENVELOPE, JSON.stringify({ sessionUpdate: 'usage_update', used: 9000, size: 128000 })].join('\n')
    const receipt = inspectionUsageReceipt({ runtime: 'dsh', output, transcript: { text: null, why: 'no transcript was found' } })
    expect(aReceiptHoldsNumbers(receipt)).toBe(false)
  })
})

describe('a dsh check line that carries no readable transcript', () => {
  const bare = (fields: Record<string, unknown>) => INSPECTION_USAGE_LINE + JSON.stringify({ runtime: 'dsh', output: ENVELOPE, ...fields })

  it.each([
    ['no transcript field', {}],
    ['a transcript that is a string', { transcript: TRANSCRIPT }],
    ['text without from', { transcript: { text: TRANSCRIPT } }],
    ['null text without why', { transcript: { text: null } }],
    ['a blank why', { transcript: { text: null, why: '  ' } }],
    ['text that is not a string', { transcript: { text: 5, from: FROM } }],
    ['a from outside the check\'s own dsh home', { transcript: { text: TRANSCRIPT, from: '/srv/elsewhere/.dsh/sessions/x/y/session.v3.jsonl.zstd' } }],
    ['a from that climbs out of it', { transcript: { text: TRANSCRIPT, from: '/check/home/.dsh/sessions/../../elsewhere/session.v3.jsonl.zstd' } }],
    ['both from and why', { transcript: { text: null, why: 'synthetic', from: FROM } }],
  ])('refuses a dsh line with %s, as a receipt that says what was wrong (case 3)', (_name, fields) => {
    const said = `${bare(fields)}\n`
    expect(() => inspectionUsageIn(said)).toThrow(/dsh/)
    const receipt = adapter().readResult(aCheckThatSaid(said, `malformed-${_name.replace(/\W+/g, '-')}`)).usageReceipt
    expect(receipt?.source).toBe('the inspection output line')
    expect(receipt?.says).toMatch(/dsh/)
    expect(receipt?.says).toMatch(/transcript/)
    expect(aReceiptHoldsNumbers(receipt)).toBe(false)
  })

  it('refuses a dsh line with no transcript (case 3)', () => {
    expect(() => inspectionUsageIn(bare({}))).toThrow(/transcript/)
  })
})

describe('the line the check tool prints', () => {
  it.each(['claude-code', 'codex', 'opencode'] as const)('refuses a transcript for %s (case 4)', (runtime) => {
    expect(() => inspectionUsageLine(runtime, '{}', { text: TRANSCRIPT, from: FROM })).toThrow(/transcript/)
    expect(() => inspectionUsageLine(runtime, '{}', { text: null, why: 'synthetic' })).toThrow(/transcript/)
    expect(inspectionUsageLine(runtime, '{}')).toBe(INSPECTION_USAGE_LINE + JSON.stringify({ runtime, output: '{}' }))
  })

  it('refuses dsh without a transcript, or with one of neither shape (case 4)', () => {
    expect(() => inspectionUsageLine('dsh', ENVELOPE)).toThrow(/transcript/)
    expect(() => inspectionUsageLine('dsh', ENVELOPE, { text: TRANSCRIPT } as never)).toThrow(/transcript/)
    expect(() => inspectionUsageLine('dsh', ENVELOPE, { text: null, why: '' })).toThrow(/transcript/)
  })

  it('reads its own dsh line back as runtime, output and transcript', () => {
    expect(inspectionUsageIn(inspectionUsageLine('dsh', ENVELOPE, { text: TRANSCRIPT, from: FROM })))
      .toEqual({ runtime: 'dsh', output: ENVELOPE, transcript: { text: CARRIED, from: FROM } })
    expect(inspectionUsageIn(inspectionUsageLine('dsh', ENVELOPE, { text: null, why: 'synthetic' })))
      .toEqual({ runtime: 'dsh', output: ENVELOPE, transcript: { text: null, why: 'synthetic' } })
  })
})

describe('the model that served a dsh check', () => {
  it('serves nothing and says the model is not reported, even when the transcript names one (case 5)', () => {
    const line = inspectionUsageLine('dsh', ENVELOPE, { text: TRANSCRIPT, from: FROM })
    const read = adapter().servedOf(aCheckThatSaid(`${line}\n`, 'served'))
    expect(read.served.model).toBe(NOT_REPORTED)
    expect(read.said).toBe('The model served by this dsh check is not reported.')
    // The receipt keeps the model the transcript named; servedOf does not read it (a question for the secretary, in the report).
    expect(dshTranscriptUsage(TRANSCRIPT).model).toBe('deepseek-synthetic-model')
  })

  it('serves nothing when the transcript was not read', () => {
    const line = inspectionUsageLine('dsh', ENVELOPE, { text: null, why: 'synthetic' })
    const read = adapter().servedOf(aCheckThatSaid(`${line}\n`, 'served-not-read'))
    expect(read.served.model).toBe(NOT_REPORTED)
    expect(read.said).toBe('The model served by this dsh check is not reported.')
  })
})

describe('two dsh lines', () => {
  it('reads the last one, as for the other runtimes (case 6)', () => {
    const first = inspectionUsageLine('dsh', ENVELOPE, { text: null, why: 'the first line' })
    const later = [TRANSCRIPT, anAnswer({ inputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1, reasoningTokens: 0 })].join('\n')
    const last = inspectionUsageLine('dsh', `${ENVELOPE}\n${ENVELOPE}`, { text: later, from: FROM })
    const said = `${first}\na correction was asked\n${last}\n`
    const carried = [CARRIED, anAnswer({ inputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 1, reasoningTokens: 0 })].join('\n')
    expect(inspectionUsageIn(said)).toEqual({ runtime: 'dsh', output: `${ENVELOPE}\n${ENVELOPE}`, transcript: { text: carried, from: FROM } })
    const receipt = adapter().readResult(aCheckThatSaid(said, 'two-lines')).usageReceipt
    expect(receipt?.inputTokens).toBe(201)
    expect(receipt?.says).not.toContain('the first line')
  })
})

/**
 * A synthetic transcript with a marker in every place a key could reach: the system message, the model's own text, a tool
 * result and the copies in an answer's stream. The marker is not a key. The event name tool/result is a stand-in: no tool
 * result from a real dsh turn has been seen (s2-acp-client-keyless-view-probe-notes.md).
 */
const MARKER = 'SYNTHETIC-MARKER-NOT-A-KEY'
const SOURCE = { provider: 'deepseek-official', model: 'deepseek-synthetic-model' }
const USAGE = { inputTokens: 300, cacheReadTokens: 20, cacheWriteTokens: 4, outputTokens: 50, reasoningTokens: 9 }
const WITH_MARKERS = [
  JSON.stringify({ type: 'system/message', data: { message: { content: [{ type: 'text', text: `You are a checker. ${MARKER}` }] } } }),
  JSON.stringify({ type: 'user/message', data: { message: { content: [{ type: 'text', text: `Check the work. ${MARKER}` }] } } }),
  JSON.stringify({ type: 'request/context', data: { env: { DEEPSEEK_API_KEY: MARKER } } }),
  JSON.stringify({ type: 'assistant/message', id: `answer-${MARKER}`, data: {
    usage: USAGE,
    message: { source: SOURCE, content: [{ type: 'text', text: `The environment holds ${MARKER}.` }] },
    stream: [{ usage: USAGE, text: MARKER }],
  } }),
  JSON.stringify({ type: 'tool/result', data: { output: `DEEPSEEK_API_KEY=${MARKER}` } }),
].join('\n')

describe('what a dsh line carries of its transcript', () => {
  it("carries only each answer's usage and source, and nothing else from any event (case 7)", () => {
    const line = inspectionUsageLine('dsh', ENVELOPE, { text: WITH_MARKERS, from: FROM })
    expect(line).not.toContain(MARKER)
    const read = inspectionUsageIn(line)
    expect(read?.runtime === 'dsh' ? read.transcript : null)
      .toEqual({ text: JSON.stringify({ type: 'assistant/message', data: { usage: USAGE, message: { source: SOURCE } } }), from: FROM })
    const receipt = adapter().readResult(aCheckThatSaid(`${line}\n`, 'with-markers')).usageReceipt
    const { source: _whole, ...counted } = dshTranscriptUsage(WITH_MARKERS)
    const { source, ...fromTheLine } = receipt ?? {}
    expect(counted.inputTokens).toBe(300)
    expect(counted.model).toBe('deepseek-synthetic-model')
    expect(fromTheLine).toEqual(counted)
    expect(source).toContain(FROM)
    expect(source).toContain('without the rest of the transcript')
  })

  // Transcripts dsh has not been seen to write, each with something the count reads differently if the line dropped it.
  it.each([
    ['an answer with no usage that names another model', [ANSWERS[0], JSON.stringify({ type: 'assistant/message', data: { message: { source: { model: 'deepseek-other-model' } } } })]],
    ['an answer whose data is not an object', [ANSWERS[0], JSON.stringify({ type: 'assistant/message', data: 'synthetic' })]],
    ['an answer whose usage is an array', [ANSWERS[0], JSON.stringify({ type: 'assistant/message', data: { usage: [1, 2], message: { source: SOURCE } } })]],
    ['a line that is not JSON and one that is not an object', [ANSWERS[1], 'not json', '[1,2]', ANSWERS[0]]],
    ['counts that are not numbers', [anAnswer({ inputTokens: -4, outputTokens: 3 }), JSON.stringify({ type: 'assistant/message', data: { usage: { inputTokens: '7' } } })]],
    ['no answer at all', [JSON.stringify({ type: 'turn/end', data: {} })]],
  ])('counts the same from the line as from the whole text, with %s (case 8)', (name, lines) => {
    const whole = lines.join('\n')
    const receipt = adapter().readResult(aCheckThatSaid(`${inspectionUsageLine('dsh', ENVELOPE, { text: whole, from: FROM })}\n`, `odd-${name.replace(/\W+/g, '-')}`)).usageReceipt
    const { source: _whole, ...counted } = dshTranscriptUsage(whole)
    const { source: _line, ...fromTheLine } = receipt ?? {}
    expect(fromTheLine).toEqual(counted)
  })
})

/** The model a check asked dsh for, as tools/the-inspector.mjs passes it from theDshSelection. Synthetic here. */
const ASKED = 'deepseek-flash'

describe('the model a dsh check asked for (the tool maintainer, Dxiry_2y6vuD point 3)', () => {
  it('keeps the model the transcript names in model and the model asked for in modelRequested, neither written over the other (case 9)', () => {
    const line = inspectionUsageLine('dsh', ENVELOPE, { text: TRANSCRIPT, from: FROM }, ASKED)
    expect(inspectionUsageIn(line)).toEqual({ runtime: 'dsh', output: ENVELOPE, transcript: { text: CARRIED, from: FROM }, modelRequested: ASKED })
    const receipt = adapter().readResult(aCheckThatSaid(`${line}\n`, 'asked-for')).usageReceipt
    expect(receipt?.model).toBe('deepseek-synthetic-model')
    expect(receipt?.modelRequested).toBe(ASKED)
    // THE REST OF THE RECEIPT IS WHAT A LINE WITHOUT THE MODEL ASKED FOR GIVES.
    const { modelRequested: _asked, ...rest } = receipt ?? {}
    const without = inspectionUsageLine('dsh', ENVELOPE, { text: TRANSCRIPT, from: FROM })
    expect(rest).toEqual(adapter().readResult(aCheckThatSaid(`${without}\n`, 'not-asked')).usageReceipt)
    expect(adapter().servedOf(aCheckThatSaid(`${line}\n`, 'asked-for-served')).served.model).toBe(NOT_REPORTED)
  })

  it('keeps the model asked for when the transcript was not read, and names no model (case 9)', () => {
    const line = inspectionUsageLine('dsh', ENVELOPE, { text: null, why: 'synthetic' }, ASKED)
    const receipt = adapter().readResult(aCheckThatSaid(`${line}\n`, 'asked-for-not-read')).usageReceipt
    expect(receipt?.modelRequested).toBe(ASKED)
    expect(receipt).not.toHaveProperty('model')
    expect(aReceiptHoldsNumbers(receipt)).toBe(false)
  })

  it('carries no model asked for when the line names none, because nobody recorded it (case 10)', () => {
    const line = inspectionUsageLine('dsh', ENVELOPE, { text: TRANSCRIPT, from: FROM })
    expect(inspectionUsageIn(line)).not.toHaveProperty('modelRequested')
    expect(adapter().readResult(aCheckThatSaid(`${line}\n`, 'none-asked')).usageReceipt).not.toHaveProperty('modelRequested')
  })

  it.each([['a number', 5], ['an empty string', ''], ['a blank string', '  '], ['null', null]])('refuses a dsh line whose model asked for is %s (case 10)', (_name, value) => {
    const said = INSPECTION_USAGE_LINE + JSON.stringify({ runtime: 'dsh', output: ENVELOPE, transcript: { text: null, why: 'synthetic' }, modelRequested: value })
    expect(() => inspectionUsageIn(said)).toThrow(/the model it asked for/)
    expect(() => inspectionUsageLine('dsh', ENVELOPE, { text: null, why: 'synthetic' }, value as never)).toThrow(/the model it asked for/)
  })

  it.each(['claude-code', 'codex', 'opencode'] as const)('refuses the model asked for on a %s line (case 10)', (runtime) => {
    expect(() => inspectionUsageLine(runtime, '{}', undefined, ASKED)).toThrow(/the model it asked for/)
  })
})
