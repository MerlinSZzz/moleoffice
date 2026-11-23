// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CONVERSATION FILE READ AS IT GROWS IS COUNTED AS A WHOLE READ OF IT WOULD BE, AT EVERY READ.
 *
 * The step reminder (src/server/lib/step-reminders.ts) reads a sandboxed Claude Code run's conversation file at each
 * pass. It reads only what was added since its last read of the same file, through claudeCodeTokensSoFarReadOn in
 * src/config/tokens-so-far.mjs: theTokensOf calls it with what the last read kept, and keeps what it answers. These cases
 * call it the same way, on a file they grow and change, and after each change compare its answer with a whole read of
 * the file as it is then: claudeCodeTokensSoFar for the count, and claudeTranscriptUsage for the receipt the count is
 * made from, model included.
 *
 * WHAT IS PROVED, one case each:
 *   - A file grown by complete lines, by a line in two halves, and by a last line with no newline after it, with an
 *     answer whose id comes again in a later read and with answers that have no id, read after each change. Each read
 *     ends after the last newline it read, so the next one starts there. A file not changed since the last read is not
 *     read: the answer is what the last read kept.
 *   - A file cut short and written again, a new file put at the same path, and a change of the run's start are each
 *     read whole.
 *   - Only the bytes after the last read are read. Bytes before it, changed in place in a file that then grew, are not
 *     seen. That is the one change the read does not look for: the same file, not shorter than before.
 *   - What is kept for each answer is its four counts and its model, and none of its content.
 *
 * Nothing here is a real conversation. Each line is made up by this file, in a temporary folder of its own that is
 * removed after the cases. The counts are whole numbers, except three that are fractions so that the order of the sum
 * shows in it.
 *
 * THE MUTATIONS THIS IS WRITTEN AGAINST, each after a control run, then restored:
 *   - The offset not moved after a read: the answers with no id are counted twice, and the growing case goes red.
 *   - A part line kept as read, the offset moved to the end of what was read: the line written in two halves is never
 *     counted, and the growing case goes red.
 *   - The last line with no newline after it left out until a newline follows it: the growing case goes red.
 *   - The counter of answers with no id started again at each read: a later one takes the place of an earlier one, and
 *     the growing case goes red.
 *   - A shrunk file read from the old offset: the cut-short case goes red.
 *   - A new file at the same path read from the old offset: the new-file case goes red.
 *   - A change of the run's start not read whole: the run's-start case goes red.
 *   - Each read made whole: the in-place case goes red.
 */

import { appendFileSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { claudeCodeTokensSoFar, claudeCodeTokensSoFarReadOn } from '../src/config/tokens-so-far.mjs'
import { claudeTranscriptUsage } from '../src/config/usage.mjs'

type ARead = ReturnType<typeof claudeCodeTokensSoFarReadOn>

/** A made-up start of the run, in milliseconds. Every line is stamped some seconds after it, or before it. */
const START = 1_000_000_000_000
/** Words in each made-up answer, which nothing kept between reads may hold. */
const CONTENT = 'made-up words of an answer, never kept'

let folder: string

beforeAll(() => {
  folder = mkdtempSync(join(tmpdir(), 'a-conversation-read-as-it-grows-'))
})

afterAll(() => {
  rmSync(folder, { recursive: true, force: true })
})

/** One made-up answer line, stamped `seconds` after the start, without its newline. A null id gives an answer with none. */
function anAnswer(id: string | null, seconds: number, usage: Record<string, number>, model = 'model-a'): string {
  return JSON.stringify({
    type: 'assistant',
    timestamp: new Date(START + seconds * 1_000).toISOString(),
    message: { ...(id === null ? {} : { id }), model, role: 'assistant', content: [{ type: 'text', text: `${CONTENT} ${seconds}` }], usage },
  })
}

/** One made-up line of the person's, which is never counted. */
function aPersonsLine(seconds: number): string {
  return JSON.stringify({ type: 'user', timestamp: new Date(START + seconds * 1_000).toISOString(), message: { role: 'user', content: CONTENT } })
}

/** Reads on from `last` as theTokensOf does, and holds its answer equal to a whole read of the file as it is now. */
function readOnAsAWholeRead(file: string, sinceMs: number, last: ARead | undefined): ARead {
  const read = claudeCodeTokensSoFarReadOn(file, sinceMs, last)
  const whole = readFileSync(file, 'utf8')
  expect(read.tokens).toStrictEqual(claudeCodeTokensSoFar(whole, sinceMs))
  expect(read.receipt).toStrictEqual(claudeTranscriptUsage([whole], sinceMs))
  return read
}

describe('a conversation file read as it grows', () => {
  it('counts complete lines, a line in two halves, a last line with no newline, a repeated id and answers with no id as a whole read does', () => {
    const file = join(folder, 'growing.jsonl')
    writeFileSync(file, [
      aPersonsLine(-120),
      anAnswer('msg_before', -60, { input_tokens: 1_000, output_tokens: 1_000 }),
      anAnswer('msg_1', 10, { input_tokens: 3, cache_read_input_tokens: 100, cache_creation_input_tokens: 0.1, output_tokens: 1 }, 'model-b'),
      '',
    ].join('\n'))
    let read = readOnAsAWholeRead(file, START, undefined)
    expect(read.offset).toBe(statSync(file).size)
    expect(read.tokens.tokens).not.toBeNull()

    appendFileSync(file, [
      anAnswer('msg_2', 20, { input_tokens: 2, cache_read_input_tokens: 103, cache_creation_input_tokens: 0.2, output_tokens: 5 }),
      anAnswer(null, 30, { input_tokens: 7, cache_read_input_tokens: 0, cache_creation_input_tokens: 0.3, output_tokens: 11 }),
      aPersonsLine(35),
      '',
    ].join('\n'))
    read = readOnAsAWholeRead(file, START, read)
    expect(read.offset).toBe(statSync(file).size)

    // A line written in two halves: the first half alone is not a line yet, so the next read starts where it starts.
    const halved = anAnswer('msg_3', 40, { input_tokens: 4, cache_read_input_tokens: 50, cache_creation_input_tokens: 9, output_tokens: 13 })
    const firstHalf = halved.slice(0, Math.floor(halved.length / 2))
    appendFileSync(file, `${anAnswer(null, 38, { input_tokens: 1, cache_read_input_tokens: 2, cache_creation_input_tokens: 3, output_tokens: 4 })}\n${firstHalf}`)
    read = readOnAsAWholeRead(file, START, read)
    expect(read.offset).toBe(statSync(file).size - Buffer.byteLength(firstHalf))
    appendFileSync(file, `${halved.slice(firstHalf.length)}\n`)
    read = readOnAsAWholeRead(file, START, read)
    expect(read.offset).toBe(statSync(file).size)

    // msg_1 again, in a later read: its last line is the one counted, and its model now agrees with the others.
    appendFileSync(file, `${anAnswer('msg_1', 50, { input_tokens: 3, cache_read_input_tokens: 100, cache_creation_input_tokens: 0.1, output_tokens: 17 })}\n`)
    read = readOnAsAWholeRead(file, START, read)
    expect(read.receipt.model).toBe('model-a')

    // A complete last line with no newline after it is counted, and counted once when the newline and more come.
    const noNewline = anAnswer(null, 60, { input_tokens: 5, cache_read_input_tokens: 6, cache_creation_input_tokens: 7, output_tokens: 8 })
    appendFileSync(file, noNewline)
    read = readOnAsAWholeRead(file, START, read)
    expect(read.offset).toBe(statSync(file).size - Buffer.byteLength(noNewline))
    appendFileSync(file, `\n${anAnswer(null, 70, { input_tokens: 9, cache_read_input_tokens: 10, cache_creation_input_tokens: 11, output_tokens: 12 })}\n`)
    read = readOnAsAWholeRead(file, START, read)
    expect(read.offset).toBe(statSync(file).size)

    // Not changed since the last read: nothing is read, and the answer is what that read kept.
    expect(claudeCodeTokensSoFarReadOn(file, START, read)).toBe(read)

    // What is kept for each answer: its four counts and its model, never its content.
    const kept = [...read.answers.byId.values()]
    expect(kept.length).toBeGreaterThan(0)
    for (const answer of kept) expect(Object.keys(answer).sort()).toStrictEqual(['cacheCreationInputTokens', 'cachedInputTokens', 'inputTokens', 'model', 'outputTokens'])
    expect(JSON.stringify({ ...read, answers: [...read.answers.byId] })).not.toContain(CONTENT)
  })

  it('reads a file cut short and written again whole', () => {
    const file = join(folder, 'cut-short.jsonl')
    writeFileSync(file, [
      anAnswer('msg_1', 10, { input_tokens: 3, cache_read_input_tokens: 1, cache_creation_input_tokens: 2, output_tokens: 1 }),
      anAnswer(null, 20, { input_tokens: 30, cache_read_input_tokens: 10, cache_creation_input_tokens: 20, output_tokens: 10 }),
      anAnswer('msg_2', 30, { input_tokens: 300, cache_read_input_tokens: 100, cache_creation_input_tokens: 200, output_tokens: 100 }),
      '',
    ].join('\n'))
    const before = readOnAsAWholeRead(file, START, undefined)
    writeFileSync(file, `${anAnswer('msg_9', 40, { input_tokens: 1, cache_read_input_tokens: 1, cache_creation_input_tokens: 1, output_tokens: 1 })}\n`)
    let read = readOnAsAWholeRead(file, START, before)
    expect(read.tokens).not.toStrictEqual(before.tokens)
    appendFileSync(file, `${anAnswer(null, 50, { input_tokens: 2, cache_read_input_tokens: 2, cache_creation_input_tokens: 2, output_tokens: 2 })}\n`)
    read = readOnAsAWholeRead(file, START, read)
    expect(read.offset).toBe(statSync(file).size)
  })

  it('reads a new file put at the same path whole, though it is longer than the last one read', () => {
    const file = join(folder, 'replaced.jsonl')
    writeFileSync(file, `${anAnswer('msg_1', 10, { input_tokens: 3, cache_read_input_tokens: 1, cache_creation_input_tokens: 2, output_tokens: 1 })}\n`)
    const before = readOnAsAWholeRead(file, START, undefined)
    const beforeInode = statSync(file).ino
    const replacement = join(folder, 'replacement.jsonl')
    writeFileSync(replacement, [
      anAnswer(null, 20, { input_tokens: 40, cache_read_input_tokens: 41, cache_creation_input_tokens: 42, output_tokens: 43 }),
      anAnswer('msg_7', 30, { input_tokens: 50, cache_read_input_tokens: 51, cache_creation_input_tokens: 52, output_tokens: 53 }),
      anAnswer(null, 40, { input_tokens: 60, cache_read_input_tokens: 61, cache_creation_input_tokens: 62, output_tokens: 63 }),
      '',
    ].join('\n'))
    renameSync(replacement, file)
    expect(statSync(file).ino).not.toBe(beforeInode)
    expect(statSync(file).size).toBeGreaterThan(before.size)
    const read = readOnAsAWholeRead(file, START, before)
    expect(read.offset).toBe(statSync(file).size)
  })

  it('reads the file whole again when the run’s start changed', () => {
    const file = join(folder, 'start-changed.jsonl')
    writeFileSync(file, [
      anAnswer('msg_1', 10, { input_tokens: 3, cache_read_input_tokens: 1, cache_creation_input_tokens: 2, output_tokens: 1 }),
      anAnswer(null, 20, { input_tokens: 30, cache_read_input_tokens: 10, cache_creation_input_tokens: 20, output_tokens: 10 }),
      anAnswer('msg_2', 30, { input_tokens: 300, cache_read_input_tokens: 100, cache_creation_input_tokens: 200, output_tokens: 100 }),
      '',
    ].join('\n'))
    const before = readOnAsAWholeRead(file, START, undefined)
    const later = readOnAsAWholeRead(file, START + 15_000, before)
    expect(later.tokens).not.toStrictEqual(before.tokens)
  })

  it('reads only the bytes after the last read, and does not see bytes before it changed in place', () => {
    const file = join(folder, 'in-place.jsonl')
    const first = anAnswer('msg_1', 10, { input_tokens: 5, cache_read_input_tokens: 1, cache_creation_input_tokens: 2, output_tokens: 1 })
    const firstChanged = anAnswer('msg_1', 10, { input_tokens: 7, cache_read_input_tokens: 1, cache_creation_input_tokens: 2, output_tokens: 1 })
    const next = anAnswer('msg_2', 20, { input_tokens: 30, cache_read_input_tokens: 10, cache_creation_input_tokens: 20, output_tokens: 10 })
    expect(firstChanged.length).toBe(first.length)
    writeFileSync(file, `${first}\n`)
    const before = readOnAsAWholeRead(file, START, undefined)
    writeFileSync(file, `${firstChanged}\n${next}\n`)
    const read = claudeCodeTokensSoFarReadOn(file, START, before)
    const asItWasRead = `${first}\n${next}\n`
    expect(read.tokens).toStrictEqual(claudeCodeTokensSoFar(asItWasRead, START))
    expect(read.receipt).toStrictEqual(claudeTranscriptUsage([asItWasRead], START))
    expect(read.tokens).not.toStrictEqual(claudeCodeTokensSoFar(readFileSync(file, 'utf8'), START))
  })
})
