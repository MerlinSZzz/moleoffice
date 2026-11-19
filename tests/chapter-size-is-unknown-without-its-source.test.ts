// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { SHIPPED_CHAPTER_NUMBERS, contentOfChapter, problemsWithAChapter, rulesFileWithChapter } from '../src/shared/chapter-check.ts'
import { CHAPTERS_SOURCE, SKILL_SOURCE, USER_PART_SOURCE, chaptersFrom, rulesTextFrom } from '../src/worker/rules.ts'
let db: TestDb, checkout: string
beforeAll(async () => {
  db = await freshDb(); checkout = mkdtempSync(join(tmpdir(), 'mole-chapter-no-source-'))
  for (const file of [SKILL_SOURCE, CHAPTERS_SOURCE]) { mkdirSync(dirname(join(checkout, file)), { recursive: true }); copyFileSync(file, join(checkout, file)) }
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBe(SHIPPED_CHAPTER_NUMBERS.length)
})
afterAll(() => { db.close(); rmSync(checkout, { recursive: true, force: true }) })

it('the selector and chapter check keep all other checks and explicitly say size was not measured without the user part of the rules', async () => {
  const chapters = chaptersFrom(process.cwd()), chapter = chapters[0]!, content = contentOfChapter(chapter)
  const size = rulesFileWithChapter(chapter.n, content, chapters, checkout)
  expect(size).toEqual({ notMeasured: expect.stringContaining(USER_PART_SOURCE) }); expect('bytes' in size).toBe(false)
  expect(problemsWithAChapter(chapter.n, content, chapters, checkout)).toEqual([])
  expect(problemsWithAChapter(chapter.n, { ...content, rules: [] }, chapters, checkout)).toContain('The chapter has no rules.')
  const { theSelectedChapters } = await import('../src/server/lib/office-regulations.ts')
  const selected = theSelectedChapters(checkout)
  expect(selected.chapters).toHaveLength(SHIPPED_CHAPTER_NUMBERS.length); expect(selected.chapters.every(one => one.inUse === 'stored')).toBe(true)
  expect(selected.says).toContain('not measured'); expect(selected.says).toContain(USER_PART_SOURCE)
  // The reading can recover chapters. The run's writer still requires its real source: a folder with no CLAUDE.md is
  // read as an installation, whose rules are written from the user part, and this one has none.
  expect(() => rulesTextFrom(checkout, chapters)).toThrow(`${USER_PART_SOURCE} is not there`)
})
