// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TWO FLOW DOCUMENTS STAY NEUTRAL.
 *
 * docs/the-merge-queue.md and docs/the-check.md tell a newcomer how the merge queue and the check
 * work. They carry the stages only, with no evidence and no handles: the
 * evidence stays in the records in the owner's office. So this test reads both files and fails when one of
 * them names something that belongs to the owner's office rather than to the product:
 *
 *   - an id shaped like one of this office's records: a word of exactly twelve characters from
 *     letters, digits, "_" and "-" that holds a digit or a capital letter after a small one. Names
 *     from the code such as `MERGE_STATES` or `reinspecting` hold neither, so they pass. The rule is
 *     applied to the whole text, not only next to the word "record", because a decision or a run is
 *     named by the same kind of id;
 *   - a path under /home/, or one of the owner's names. The names come from the file of the owner's content
 *     (tests/the-owners-content-list.ts), so they are looked for in a case of their own, which is taken out,
 *     and says why, where no such file was read;
 *   - a live office's port, each port tools/live-office-ports.mjs says a test keeps off (MOLE_OFFICE_PORT where it is
 *     set), unless the same line says it is a default;
 *   - the names of the waves of work;
 *   - the handles of the agents that work in the owner's office. They come from the same file as the owner's names,
 *     so they too are looked for in a case of their own, taken out where no such file was read.
 *
 * The test also fails when either file is missing, so it cannot pass by reading nothing.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { thePortsATestKeepsOff } from '../tools/live-office-ports.mjs'
import { aWordPattern, OWNER_NAMES } from './neutral-names.ts'
import { takenOutWithoutTheOwnersContent } from './the-owners-content-list.ts'

const ROOT = join(import.meta.dirname, '..')
const THE_DOCUMENTS = ['docs/the-merge-queue.md', 'docs/the-check.md'] as const

/** The ports a live office answers on, as tools/live-office-ports.mjs reads them. */
const THE_LIVE_PORTS = thePortsATestKeepsOff().map(String)

/** A word of exactly twelve id characters, with no id character on either side. */
const TWELVE = /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{12}(?![A-Za-z0-9_-])/gu

/** Whether a twelve-character word looks like a generated id rather than a word or a name from the code. */
function looksLikeAnId(word: string): boolean {
  return /[0-9]/u.test(word) || /[a-z][A-Z]/u.test(word)
}

/**
 * Every line of a text that breaks one of the rules, with the rule it breaks. The agent handles are `handles`, from the
 * file of the owner's content; with none, no handle is looked for, because a pattern of no words matches every line. A
 * handle is found as a whole word in any case, as the handles written here were before, and is not repeated.
 */
function whatIsPrivate(text: string, handles: readonly string[] = []): string[] {
  const found: string[] = []
  const handleWords = handles.length === 0 ? null : new RegExp(aWordPattern(handles).source, 'gi')
  text.split('\n').forEach((line, index) => {
    const at = `line ${String(index + 1)}`
    for (const match of line.matchAll(TWELVE)) {
      if (looksLikeAnId(match[0])) found.push(`${at}: "${match[0]}" is shaped like a record id`)
    }
    if (line.includes('/home/')) found.push(`${at}: a path under /home/`)
    for (const port of THE_LIVE_PORTS) if (line.includes(port) && !/default/iu.test(line)) found.push(`${at}: the port ${port}, a live office's, not named as a default`)
    if (handleWords !== null) found.push(...(line.match(handleWords) ?? []).map(() => `${at}: an agent handle`))
    for (const wave of line.match(/\bw?13[a-z]\b/giu) ?? []) found.push(`${at}: the wave name "${wave}"`)
  })
  return found
}

describe('the two flow documents name nothing of the owner\'s office', () => {
  it.each(THE_DOCUMENTS)('%s exists, and names no record id, home path, port of the owner or wave', (path) => {
    const full = join(ROOT, path)
    expect(existsSync(full), `${path} is missing`).toBe(true)
    const text = readFileSync(full, 'utf8')
    expect(text.length).toBeGreaterThan(1000)
    expect(whatIsPrivate(text)).toEqual([])
  })

  it("neither document names the owner", (context) => {
    if (takenOutWithoutTheOwnersContent(context)) return
    if (OWNER_NAMES.length === 0) throw new Error("The file of the owner's content was read, and it gave no names.")
    const names = aWordPattern(OWNER_NAMES)
    const found = THE_DOCUMENTS.flatMap((path) =>
      readFileSync(join(ROOT, path), 'utf8')
        .split('\n')
        .flatMap((line, index) => (names.test(line) ? [`${path} line ${String(index + 1)}: one of the owner's names`] : [])),
    )
    expect(found).toEqual([])
  })


  it('the rules catch what they are for', () => {
    expect(whatIsPrivate('Read record Kl5HI6J-m5U4 first.')).toHaveLength(1)
    expect(whatIsPrivate('The state is reinspecting, as MERGE_STATES says.')).toEqual([])
    // The handles come from a list, never from this file: a made-up one is found as a whole word in any case, and
    // without a list no handle is looked for at all.
    expect(whatIsPrivate('Quill landed it in wave 13p.', ['quill'])).toEqual(['line 1: an agent handle', 'line 1: the wave name "13p"'])
    expect(whatIsPrivate('The quills are sharp.', ['quill'])).toEqual([])
    expect(whatIsPrivate('quill landed it in wave 13p.')).toEqual(['line 1: the wave name "13p"'])
    for (const port of THE_LIVE_PORTS) {
      expect(whatIsPrivate(`The port is ${port}.`)).toContain(`line 1: the port ${port}, a live office's, not named as a default`)
      expect(whatIsPrivate(`The port defaults to ${port} (a default you can change).`)).toEqual([])
    }
  })
})
