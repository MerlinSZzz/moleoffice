// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Role chapters are read through cards and briefs. Shared chapters remain in the standing load. */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chapterFromRecord, theEnglishHashOfAChapter, theEnglishHashOfARule, type ARecordAsRead } from '../src/shared/office-rules.ts'
import { theDefaultSetFromRecords } from '../src/shared/default-set.ts'
import { chapterPointerBlock, withChapterPointers } from '../src/worker/rules.ts'
import { SHIPPED_CHAPTER_NUMBERS } from '../src/shared/chapter-check.ts'
import { enWave13r } from '../src/shared/words/en-wave-13r.ts'
import { freshDb, type TestDb } from './helpers.ts'

/** MADE-UP chapters with numbers unrelated to the repository's chapter count. */
function record(n: number, forRole?: string): ARecordAsRead {
  const heading = `MADE-UP rule ${n}`
  const text = `MADE-UP work ${n} is recorded.`
  const made = {
    id: `made-up-chapter-${n}`, kind: 'module', title: `MADE-UP duties for chapter ${n}`, summary: `MADE-UP work for chapter ${n} is recorded.`,
    data: {
      extra: { chapter: n, ...(forRole === undefined ? {} : { forRole }) },
      context: `MADE-UP context ${n}.`, source: 'MADE-UP scenario.',
      shortForms: { label: { text: `MADE-UP chapter ${n}` } },
      summaryBlocks: [{ id: 'r-1', type: 'text', heading, text, neutral: {
        heading, text, zh: { heading: `测试规则 ${n}`, text: `测试工作 ${n} 已记录。` },
        zhFrom: 'written for the default set', from: theEnglishHashOfARule({ name: heading, text }),
      } }],
    },
  }
  const chapter = chapterFromRecord(made)!
  return { ...made, data: { ...made.data, neutral: {
    label: chapter.label, title: chapter.title, conclusion: chapter.conclusion, context: chapter.context,
    zh: { label: `测试章节 ${n}`, title: `测试职责 ${n}`, conclusion: `测试章节 ${n} 适用。` },
    from: theEnglishHashOfAChapter(chapter),
  } } }
}

const RECORDS = [record(2), record(17, 'worker'), record(29, 'inspector')]
/** The block's line for each shipped number the office does not hold, in CODE.md's words (round 16, item C). */
const notHeld = (numbers: readonly number[]): string[] => numbers.map((n) => `- This office holds no chapter ${String(n)}. It was not exported.`)
/** The words file's sentence for an office whose every chapter is for a role. */
const everyChapterIsForARole = (): string => {
  const sentence: unknown = (enWave13r as Record<string, unknown>)['rulesFile.everyChapterIsForARole']
  if (typeof sentence !== 'string' || sentence.trim() === '') throw new Error('src/shared/words/en-wave-13r.ts has no sentence rulesFile.everyChapterIsForARole.')
  return sentence
}
let t: TestDb
let scratch: string
let chapters: typeof import('../src/server/lib/chapters.ts')
let copier: typeof import('../src/server/lib/default-regulations.ts')

beforeAll(async () => {
  t = await freshDb()
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-role-chapters-'))
  chapters = await import('../src/server/lib/chapters.ts')
  copier = await import('../src/server/lib/default-regulations.ts')
})
afterAll(() => { t?.close(); if (scratch) rmSync(scratch, { recursive: true, force: true }) })

describe('the role mark reaches every standing-load reader', () => {
  it('exports the role mark and writes no new field on an unmarked chapter', () => {
    expect(chapterFromRecord(RECORDS[0]!)).not.toHaveProperty('forRole')
    expect(chapterFromRecord(RECORDS[1]!)).toHaveProperty('forRole', 'worker')
    expect(chapterFromRecord(RECORDS[2]!)).toHaveProperty('forRole', 'inspector')
  })

  it('carries the role mark into the default set and keeps every chapter and rule', () => {
    const made = theDefaultSetFromRecords(RECORDS)
    if (!made.made) throw new Error(JSON.stringify(made.why))
    expect(made.set.chapters.map((one) => one.n)).toEqual([2, 17, 29])
    expect(made.set.chapters[0]).not.toHaveProperty('forRole')
    expect(made.set.chapters[1]).toHaveProperty('forRole', 'worker')
    expect(made.set.chapters[2]).toHaveProperty('forRole', 'inspector')
    expect(made.set.chapters.map((one) => one.outline.map((rule) => rule.id))).toEqual([['r-1'], ['r-1'], ['r-1']])
  })

  it('keeps the shared pointer, omits the role pointers, and keeps the same omission in the generated block', () => {
    const all = RECORDS.map((one) => chapterFromRecord(one)!)
    const pointers = chapterPointerBlock(all)
    // The shared chapter's pointer, then each shipped number this made-up office does not hold. 17 and 29
    // are held, for roles, so neither is named as absent and neither has a pointer.
    expect(pointers).toBe([`- **${all[0]!.label}** — ${all[0]!.conclusion}`, ...notHeld(SHIPPED_CHAPTER_NUMBERS.filter((n) => n !== all[0]!.n))].join('\n'))
    expect(pointers).not.toContain(all[1]!.label)
    expect(pointers).not.toContain(all[2]!.label)
    const generated = withChapterPointers('<!-- chapters:start -->\n\n<!-- chapters:end -->', all)
    expect(generated).toContain(pointers)
    expect(generated).not.toContain(all[1]!.label)
    expect(generated).not.toContain(all[2]!.label)
    // Only role chapters: no pointer line, the sentence that says why, then every shipped number as not held.
    expect(chapterPointerBlock(all.slice(1))).toBe([`- ${everyChapterIsForARole()}`, ...notHeld(SHIPPED_CHAPTER_NUMBERS)].join('\n'))
  })

  it('keeps shared chapters in the inspector standing load and omits role chapters', () => {
    const all = RECORDS.map((one) => ({ ...chapterFromRecord(one)!, zh: null, outline: [] }))
    const standing = chapters.everyChapterAtItsName(all)
    expect(standing.text).toBe(`2. ${all[0]!.label} — ${all[0]!.title}`)
    expect(standing.text).not.toContain(all[1]!.title)
    expect(standing.text).not.toContain(all[2]!.title)
  })

  it('reads and copies role marks into a fresh office without adding a mark to its shared chapter', () => {
    const defaults = RECORDS.map((one) => {
      const c = chapterFromRecord(one)!
      const held = one.data as { neutral: { zh: { label: string; title: string; conclusion: string } }; summaryBlocks: { neutral: { zh: { heading: string; text: string } } }[]; extra: { forRole?: string } }
      return { n: c.n, label: c.label, title: c.title, conclusion: c.conclusion, context: c.context,
        ...(held.extra.forRole === undefined ? {} : { forRole: held.extra.forRole }),
        zh: held.neutral.zh, outline: c.outline.map((r, i) => ({ ...r,
          zh: { name: held.summaryBlocks[i]!.neutral.zh.heading, text: held.summaryBlocks[i]!.neutral.zh.text }, zhFrom: 'written for the default set',
        })) }
    })
    const file = join(scratch, 'default-regulations.json')
    writeFileSync(file, JSON.stringify({ chapters: defaults }))
    const read = copier.readTheDefaultRegulations(file)
    expect(read[0]).not.toHaveProperty('forRole')
    expect(read[1]).toHaveProperty('forRole', 'worker')
    expect(read[2]).toHaveProperty('forRole', 'inspector')
    expect(copier.copyTheDefaultRegulationsOnce(file).copied).toBe(defaults.length)
    const copied = t.api.listRecords({ workspaceId: 'default', kind: 'module' })
      .map((one) => one.data['extra'] as { chapter: number; forRole?: string }).sort((a, b) => a.chapter - b.chapter)
    expect(copied.map((one) => one.chapter)).toEqual([2, 17, 29])
    expect(copied[0]).not.toHaveProperty('forRole')
    expect(copied[1]).toHaveProperty('forRole', 'worker')
    expect(copied[2]).toHaveProperty('forRole', 'inspector')
  })
})
