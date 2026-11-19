// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { contentOfChapter, rulesFileWithChapter } from '../src/shared/chapter-check.ts'
import { CHAPTERS_SOURCE, SKILL_SOURCE, USER_PART_SOURCE, chaptersFrom } from '../src/worker/rules.ts'
let db: TestDb, scratch: string, copy: typeof import('../src/server/lib/default-regulations.ts')
beforeEach(async () => {
  db = await freshDb(); scratch = mkdtempSync(join(tmpdir(), 'mole-checked-default-copy-'))
  for (const file of [SKILL_SOURCE, CHAPTERS_SOURCE]) { mkdirSync(dirname(join(scratch, file)), { recursive: true }); copyFileSync(file, join(scratch, file)) }
  copy = await import('../src/server/lib/default-regulations.ts')
})
afterEach(() => { db.close(); rmSync(scratch, { recursive: true, force: true }) })
/** How many chapters the shipped file declares. Wave 13w round 9 (444515533) reads a count from its declaration, not a fixed ten. */
const SHIPPED = (JSON.parse(readFileSync('src/config/rules/default-regulations.json', 'utf8')) as { chapters: unknown[] }).chapters.length
const snapshot = () => JSON.stringify(['records', 'revisions', 'changes'].map(table => db.client.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()))

it('checks and copies the shipped defaults, including a folder with no user part of the rules', () => {
  expect(copy.readTheDefaultRegulations()).toHaveLength(SHIPPED)
  expect(copy.readTheDefaultRegulations(undefined, scratch)).toHaveLength(SHIPPED)
  const chapters = chaptersFrom(scratch), first = chapters[0]!
  expect(rulesFileWithChapter(first.n, contentOfChapter(first), chapters, scratch)).toEqual({ notMeasured: expect.stringContaining(USER_PART_SOURCE) })
  expect(copy.copyTheDefaultRegulationsOnce(undefined, scratch).copied).toBe(SHIPPED)
  const held = snapshot(); expect(copy.copyTheDefaultRegulationsOnce(undefined, scratch).copied).toBe(0); expect(snapshot()).toBe(held)
})

it('refuses bad default sources before copying any chapter, then copies a valid source', () => {
  // A chapter's number is read from the file it comes from (message APSAHr6Qo_BT), so a number the shipped file does
  // not hold is read. Two chapters with one number are still refused.
  for (const fault of ['id', 'required-rule', 'number', 'size'] as const) {
    const source = JSON.parse(readFileSync('src/config/rules/default-regulations.json', 'utf8'))
    if (fault === 'id') source.chapters[0].outline[0].id = 'not-a-rule-id'
    if (fault === 'required-rule') { const chapter = source.chapters.find((one: { n: number }) => one.n === 7); chapter.outline = chapter.outline.filter((one: { id: string }) => one.id !== 'r-8') }
    if (fault === 'number') source.chapters[1].n = source.chapters[0].n
    if (fault === 'size') source.chapters[0].conclusion = 'Invented size control. '.repeat(2000)
    const file = join(scratch, 'bad-defaults.json'); writeFileSync(file, JSON.stringify(source))
    const held = snapshot(), checkout = fault === 'size' ? process.cwd() : scratch
    expect(() => copy.copyTheDefaultRegulationsOnce(file, checkout)).toThrow(fault === 'id' ? 'positive whole number' : fault === 'required-rule' ? 'needs rule r-8' : fault === 'number' ? `chapter ${String(source.chapters[0].n)} appears twice` : 'headroom')
    expect(snapshot()).toBe(held); expect(copy.chapterRecordsEverHeld()).toBe(0)
  }
  expect(copy.copyTheDefaultRegulationsOnce(undefined, scratch).copied).toBe(SHIPPED)
})

it('reads only the chapter numbers once the office holds every one, and still stops a start at a file it cannot read', () => {
  expect(copy.copyTheDefaultRegulationsOnce(undefined, scratch).copied).toBe(SHIPPED)
  const held = snapshot()
  // A FILE THAT IS NOT JSON stops every start, and the error names the file, though the office holds every chapter.
  const broken = join(scratch, 'broken-defaults.json'); writeFileSync(broken, '{ "chapters": [')
  expect(() => copy.copyTheDefaultRegulationsOnce(broken, scratch)).toThrow(broken)
  expect(snapshot()).toBe(held)
  // A FAULT INSIDE A CHAPTER is not read when every number of the file is held: the start copies nothing and goes on.
  const source = JSON.parse(readFileSync(copy.THE_DEFAULT_REGULATIONS_FILE, 'utf8'))
  source.chapters[0].outline[0].id = 'not-a-rule-id'
  const faulty = join(scratch, 'faulty-defaults.json'); writeFileSync(faulty, JSON.stringify(source))
  expect(copy.copyTheDefaultRegulationsOnce(faulty, scratch).copied).toBe(0)
  expect(snapshot()).toBe(held)
})
