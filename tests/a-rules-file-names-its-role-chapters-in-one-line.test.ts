// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RULES FILE NAMES ITS ROLE CHAPTERS IN ONE LINE, AFTER THE SHARED POINTERS (decision 65Rakwbgy26O and
 * the role-chapter plan's step 4).
 *
 * A chapter marked for a role is left out of the pointer lines every agent carries
 * (tests/role-chapters-stay-out-of-the-standing-load.test.ts). Until this change nothing in the general file
 * said such a chapter existed, so an agent reading only `CLAUDE.md` or `AGENTS.md` could not tell that its
 * role had a chapter of its own. Now the chapter block ends with one line from the words file that names the
 * role chapters by number and says the agent's card names the one that is its own. The numbers come from the
 * chapters, never from a typed list, so the line is absent while the office holds no role chapter.
 *
 * THE LINE IS NOT A POINTER LINE. C9 keeps the shared pointer lines (`chapterPointerBlock`) under 1,400 bytes,
 * and they are 1,389 bytes today. The line goes after them in `chapterBlockWithTheRoleLine`, so C9 measures
 * what it measured before and its limit is not raised.
 *
 * Every chapter here is MADE-UP; none is a chapter of this office.
 *
 * MUTATIONS: `chapterBlockWithTheRoleLine` returns the pointer block alone: cases 1, 2, 3, 5 and 6 red.
 * The line uses the many form for one chapter: cases 2 and 6 red. The numbers are not put in order: case 3
 * red. The line is written when no chapter is for a role: case 4 red. `withChapterPointers` writes the
 * pointer block alone: cases 1 and 6 red. The installation's text writes the pointer block alone: case 6 red.
 */
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { OfficeChapter } from '../src/shared/office-rules.ts'
import { enWave13s } from '../src/shared/words/en-wave-13s.ts'
import {
  CHAPTERS_END,
  CHAPTERS_START,
  SKILL_SOURCE,
  USER_PART_SOURCE,
  chapterBlockWithTheRoleLine,
  chapterPointerBlock,
  chaptersFrom,
  rulesTextFrom,
  withChapterPointers,
} from '../src/worker/rules.ts'

const CHECKOUT = process.cwd()
const made: string[] = []
afterAll(() => { for (const folder of made) rmSync(folder, { recursive: true, force: true }) })

function aMadeUpChapter(n: number, forRole?: string): OfficeChapter {
  return {
    n,
    id: `made-up-chapter-${String(n)}`,
    ...(forRole === undefined ? {} : { forRole }),
    label: `MADE-UP chapter ${String(n)}`,
    title: `MADE-UP duties for chapter ${String(n)}`,
    conclusion: `MADE-UP work for chapter ${String(n)} is recorded.`,
    outline: [],
    context: '',
    source: '',
  }
}

/** The words file's line for the role chapters, in the form for one chapter or for several, with the numbers put in. */
function theRoleLine(form: 'one' | 'other', numbers: string): string {
  const word: unknown = (enWave13s as Record<string, unknown>)['rulesFile.roleChapters']
  const forms = word as Partial<Record<'one' | 'other', unknown>> | undefined
  const sentence = forms?.[form]
  if (typeof sentence !== 'string' || !sentence.includes('{numbers}')) {
    throw new Error(`src/shared/words/en-wave-13s.ts has no "${form}" form of rulesFile.roleChapters with a {numbers} mark.`)
  }
  return sentence.replace('{numbers}', numbers)
}

/** A folder of an installation's shape, as tests/an-installed-office-writes-the-general-rules-for-each-tool.test.ts makes one. */
function anInstallation(): string {
  const folder = mkdtempSync(join(tmpdir(), 'mole-office-role-line-install-'))
  made.push(folder)
  cpSync(join(CHECKOUT, dirname(SKILL_SOURCE)), join(folder, dirname(SKILL_SOURCE)), { recursive: true })
  for (const file of [USER_PART_SOURCE, join('src', 'config', 'rules', 'default-regulations.json')]) {
    mkdirSync(dirname(join(folder, file)), { recursive: true })
    copyFileSync(join(CHECKOUT, file), join(folder, file))
  }
  return folder
}

describe('the chapter block ends with one line naming the role chapters', () => {
  it('names them after the shared pointers, and the pointer lines C9 measures do not hold it', () => {
    const chapters = [aMadeUpChapter(2), aMadeUpChapter(17, 'worker'), aMadeUpChapter(29, 'inspector')]
    const line = theRoleLine('other', '17, 29')
    expect(chapterBlockWithTheRoleLine(chapters)).toBe(`${chapterPointerBlock(chapters)}\n\n${line}`)
    expect(chapterPointerBlock(chapters)).not.toContain(line)
    expect(withChapterPointers(`${CHAPTERS_START}\n\n${CHAPTERS_END}`, chapters)).toBe(
      `${CHAPTERS_START}\n\n${chapterPointerBlock(chapters)}\n\n${line}\n\n${CHAPTERS_END}`,
    )
  })

  it('writes the form for one chapter when the office holds a single role chapter', () => {
    const chapters = [aMadeUpChapter(2), aMadeUpChapter(11, 'secretary')]
    expect(chapterBlockWithTheRoleLine(chapters)).toBe(`${chapterPointerBlock(chapters)}\n\n${theRoleLine('one', '11')}`)
  })

  it('names the numbers in order, whatever order the chapters come in', () => {
    const chapters = [aMadeUpChapter(14, 'inspector'), aMadeUpChapter(1), aMadeUpChapter(11, 'secretary'), aMadeUpChapter(13, 'worker'), aMadeUpChapter(12, 'supervisor')]
    expect(chapterBlockWithTheRoleLine(chapters)).toBe(`${chapterPointerBlock(chapters)}\n\n${theRoleLine('other', '11, 12, 13, 14')}`)
  })

  it('writes no line when no chapter held is for a role', () => {
    const chapters = [aMadeUpChapter(1), aMadeUpChapter(2)]
    expect(chapterBlockWithTheRoleLine(chapters)).toBe(chapterPointerBlock(chapters))
    expect(withChapterPointers(`${CHAPTERS_START}\n\n${CHAPTERS_END}`, chapters)).toBe(
      `${CHAPTERS_START}\n\n${chapterPointerBlock(chapters)}\n\n${CHAPTERS_END}`,
    )
  })

  it('writes the line after the sentence for an office whose every chapter is for a role', () => {
    const chapters = [aMadeUpChapter(17, 'worker'), aMadeUpChapter(29, 'inspector')]
    expect(chapterBlockWithTheRoleLine(chapters)).toBe(`${chapterPointerBlock(chapters)}\n\n${theRoleLine('other', '17, 29')}`)
  })

  it('carries the line into the rules file of a developer checkout and of an installation', () => {
    // The checkout's own role chapters are left out, so the one MADE-UP role chapter is the only one the line names
    // however many role chapters the checkout ships.
    const chapters = [...chaptersFrom(CHECKOUT).filter(chapter => chapter.forRole === undefined), aMadeUpChapter(17, 'worker')]
    const line = theRoleLine('one', '17')
    const developer = rulesTextFrom(CHECKOUT, chapters)
    expect(developer).toContain(`${chapterPointerBlock(chapters)}\n\n${line}\n\n${CHAPTERS_END}`)
    expect(developer.split(line)).toHaveLength(2)
    const installed = rulesTextFrom(anInstallation(), chapters)
    expect(installed).toContain(`${chapterPointerBlock(chapters)}\n\n${line}`)
    expect(installed.split(line)).toHaveLength(2)
  })
})
