// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN'S RULES FILE READS A ROLE CHAPTER UNDER ITS OWN NUMBER.
 *
 * The office is getting role chapters: a chapter record whose role mark names a role card. Such a chapter may have a
 * number the shipped regulations file lacks, and the export tool writes it into the chapters file and lists its number in that
 * file's selection. The reader that builds a run's rules file checked every chapter against the shipped numbers alone,
 * so an export holding a role chapter stopped it and no rules file could be written from that checkout. This file checks
 * that the reader takes the numbers its export selected, that a chapter the selection does not list is still refused,
 * and that an export written before the selection existed keeps the shipped numbers.
 *
 * Every chapter made here is MADE-UP; none is a chapter of this office. The file starts from the checkout's own
 * chapters file in every case and changes only what the case names.
 *
 * Cases 1, 2 and 5 are red before the change. Cases 3 and 4 are green before the change and stay green after it.
 *
 * Case 2 builds the role line from every chapter the checkout's chapters file marks for a role, and 17, because that
 * file holds role chapters of its own.
 */
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { sayInEnglish } from '../src/shared/i18n.ts'
import type { OfficeChapter } from '../src/shared/office-rules.ts'
import {
  CHAPTERS_SOURCE,
  RULES_SOURCE,
  SKILL_SOURCE,
  USER_PART_SOURCE,
  chaptersFrom,
  rulesTextFrom,
  type CodeOfLaw,
} from '../src/worker/rules.ts'

const CHECKOUT = process.cwd()
let scratch: string

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), 'mole-rules-role-chapter-'))
  for (const file of [RULES_SOURCE, USER_PART_SOURCE, SKILL_SOURCE]) {
    mkdirSync(dirname(join(scratch, file)), { recursive: true })
    copyFileSync(join(CHECKOUT, file), join(scratch, file))
  }
})
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

/** Chapter 17 as the chapters file holds one, every word of it MADE-UP, with a made-up role mark. */
function madeUpChapter17(): OfficeChapter & { forRole: string } {
  return {
    n: 17,
    forRole: 'worker',
    id: 'made-up-chapter-17',
    label: 'MADE-UP chapter 17, a role chapter made for this test',
    title: 'MADE-UP duties that only this made-up chapter describes',
    conclusion: 'MADE-UP conclusion of chapter 17: this made-up chapter belongs to a role card.',
    outline: [{ id: 'r-1', name: 'MADE-UP rule of chapter 17', text: 'MADE-UP work of chapter 17 is recorded.' }],
    context: 'MADE-UP context for chapter 17.',
    source: 'MADE-UP source for chapter 17.',
  }
}

/** Start from the checkout's own chapters file, let a case change it, and write it where the reader looks. */
function writeTheChaptersFile(change: (file: CodeOfLaw) => void): string {
  const path = join(scratch, CHAPTERS_SOURCE)
  mkdirSync(dirname(path), { recursive: true })
  const file = JSON.parse(readFileSync(join(CHECKOUT, CHAPTERS_SOURCE), 'utf8')) as CodeOfLaw
  change(file)
  writeFileSync(path, JSON.stringify(file))
  return path
}

/** The checkout's chapters plus the made-up role chapter, and the selection listing that number. */
function writeTheRoleChapterAndItsSelection(): void {
  const made = madeUpChapter17()
  writeTheChaptersFile((file) => {
    file.chapters = [...file.chapters, made]
    file.selection = [...(file.selection ?? []), { n: 17, inUse: 'stored', notUsed: null }]
  })
}

it('reads a role chapter the selection lists', () => {
  writeTheRoleChapterAndItsSelection()
  const read = chaptersFrom(scratch)
  expect(read).toEqual([...chaptersFrom(CHECKOUT), madeUpChapter17()])
  expect(read.find((chapter) => chapter.n === 17)).toHaveProperty('forRole', 'worker')
})

it('writes the rules file from it, and 17 is no pointer line', () => {
  writeTheRoleChapterAndItsSelection()
  const text = rulesTextFrom(scratch)
  expect(text).not.toContain(madeUpChapter17().conclusion)
  const marked = chaptersFrom(CHECKOUT).filter((chapter) => chapter.forRole !== undefined).map((chapter) => chapter.n)
  expect(marked.length, 'the checkout holds role chapters of its own, so this case is not about 17 alone').toBeGreaterThan(0)
  const numbers = [...marked, 17].sort((a, b) => a - b)
  const roleLine = sayInEnglish('rulesFile.roleChapters', {
    n: numbers.length,
    numbers: numbers.map(String).join(sayInEnglish('sentence.listGap')),
  })
  expect(text).toContain(roleLine)
})

it('refuses a chapter the selection does not list, and names the file', () => {
  const made = madeUpChapter17()
  const path = writeTheChaptersFile((file) => { file.chapters = [...file.chapters, made] })
  expect(() => chaptersFrom(scratch)).toThrow(path)
})

it('holds the shipped numbers only when the file has no selection, and refuses a chapter they do not list', () => {
  const path = writeTheChaptersFile((file) => { delete file.selection })
  expect(chaptersFrom(scratch)).toEqual(chaptersFrom(CHECKOUT))
  const made = madeUpChapter17()
  writeTheChaptersFile((file) => { delete file.selection; file.chapters = [...file.chapters, made] })
  expect(() => chaptersFrom(scratch)).toThrow(path)
})

it('refuses a selection that is not a list of chapter numbers, and names the file', () => {
  const path = writeTheChaptersFile((file) => { (file as unknown as { selection: unknown }).selection = 'all' })
  expect(() => chaptersFrom(scratch)).toThrow(path)
  writeTheChaptersFile((file) => { (file as unknown as { selection: unknown }).selection = [{ inUse: 'stored', notUsed: null }] })
  expect(() => chaptersFrom(scratch)).toThrow(path)
})
