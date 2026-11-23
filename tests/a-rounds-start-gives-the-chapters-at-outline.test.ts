// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHY THIS FILE EXISTS. A round is given its rules at its start, and CODE.md was among them whole: a supervisor's
 * start was over 70 KB, most of it CODE.md, against a target of brief, card and outline under 35 KB. This proves the
 * start now gives CODE.md at outline, made from the saved sections, while the saved selection and the check keep the
 * whole text. No rule word is copied here: the chapter headings come from the saved sections and every sentence from
 * the code's exports. The start's worktree is made up inside its sandbox, because the delivery refuses a rules file
 * outside the sandbox it starts in; its CODE.md is this checkout's real file.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { markdownSections, prepareRoundChapters, ROUND_CHAPTERS_POLICY_FILE } from '../src/shared/round-chapters/delivery.ts'
import {
  bytes, codeChapters, deliveredRoundBrief, roundChaptersOutline, roundChaptersText,
  savedChaptersLine, THE_SAVED_SELECTION_HOLDS_TERRITORIES_IN_FULL,
} from '../src/shared/round-chapters/manifest.ts'
import { THE_FALLBACK_RULE } from '../src/shared/round-start-pack.ts'

const REAL_CODE = resolve('src/config/rules/CODE.md')
const scratch: string[] = []
afterEach(() => { for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true }) })

/** Made-up words of exactly this many bytes, with no declaration of a kind anywhere in them. */
const madeUpWords = (size: number) => {
  const sentence = 'Made-up words for a supervisor brief, with no declaration. '
  return sentence.repeat(Math.ceil(size / sentence.length)).slice(0, size)
}

/**
 * A made-up sandbox whose TERRITORIES.md names it, so the pack is made, holding a 12 KB supervisor brief, a 5.7 KB
 * LINE-common.md, a NEXT.md with a section 1, and the real CODE.md in its worktree. No declaration names a kind
 * unless one is given.
 */
function aSupervisorStart(options: { kind?: string; chapters?: number[] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'round-start-outline-'))
  scratch.push(dir)
  const worktree = join(dir, 'worktrees', 'w13q-1118-start-outline')
  mkdirSync(join(worktree, 'src/config/rules'), { recursive: true })
  mkdirSync(join(dir, 'briefs'))
  copyFileSync(REAL_CODE, join(worktree, 'src/config/rules/CODE.md'))
  const brief = join(dir, 'briefs', 'task.md')
  writeFileSync(brief, madeUpWords(12 * 1024))
  writeFileSync(join(dir, 'briefs/LINE-common.md'), madeUpWords(Math.round(5.7 * 1024)))
  writeFileSync(join(dir, 'briefs/TERRITORIES.md'),
    `# Territories\n\n## The lines\n\n### 13q, a made-up line (sandbox ${basename(dir)})\nOWN FILE is this line's.\n\n${THE_FALLBACK_RULE}, for every changed file not named: made-up rule words.\n`)
  writeFileSync(join(dir, 'briefs/NEXT.md'), '# Made-up next\n\n## 1. Next work\n\nMADE-UP ITEM one.\n')
  if (options.kind !== undefined) {
    writeFileSync(brief + '.round.json', JSON.stringify({ kind: options.kind }))
    const selectors = (options.chapters ?? []).map(chapter => ({ chapter, descendants: true }))
    writeFileSync(join(dir, ROUND_CHAPTERS_POLICY_FILE), JSON.stringify({ version: 1, kinds: { [options.kind]: {
      'CODE.md': selectors, 'LINE-common.md': '*', 'TERRITORIES.md': '*',
    } } }))
  }
  return { dir, worktree, brief }
}

/** Every chapter heading of a saved code source, taken from the sections the start saved rather than a typed list. */
const chapterHeadings = (sections: Parameters<typeof codeChapters>[0]) => codeChapters(sections).map(chapter => chapter.text.split('\n')[0]!)

describe("a round's start gives CODE.md at outline", () => {
  it('is under the target, names the door and the path, and keeps the saved selection whole for the check', () => {
    const f = aSupervisorStart()
    const { manifest, brief } = prepareRoundChapters({ sandboxDir: f.dir, worktree: f.worktree, brief: f.brief })
    const delivered = readFileSync(brief, 'utf8')

    expect(delivered).toBe(deliveredRoundBrief(manifest))
    expect(bytes(delivered)).toBeLessThan(35_000)
    expect(delivered).toContain('GET /api/office-regulations')

    const code = manifest.sources[0]!
    const real = readFileSync(REAL_CODE, 'utf8')
    expect(code.text).toBe(code.sections.map(section => section.text).join(''))
    expect(code.text).toBe(real)
    expect(code.bytes).toBe(bytes(real))
    const named = savedChaptersLine(manifest).named
    expect(named).not.toBeNull()
    expect(named!.map(one => one.chapter)).toEqual(codeChapters(code.sections).map(one => one.chapter))
    expect(roundChaptersText(manifest)).toContain(code.text)

    const headings = chapterHeadings(code.sections)
    expect(headings.length).toBeGreaterThan(0)
    for (const heading of headings) expect(delivered.split(heading), heading).toHaveLength(2)
    expect(delivered).toContain(roundChaptersOutline(manifest))
    expect(delivered).not.toContain(code.text)
  })

  it('gives only the chapters a policy selects, at outline, and no other chapter heading', () => {
    const every = codeChapters(markdownSections(readFileSync(REAL_CODE, 'utf8'))).map(chapter => chapter.chapter)
    const chosen = every.slice(0, 2)
    const f = aSupervisorStart({ kind: 'development', chapters: chosen })
    const { manifest, brief } = prepareRoundChapters({ sandboxDir: f.dir, worktree: f.worktree, brief: f.brief })
    const delivered = readFileSync(brief, 'utf8')

    expect(manifest.chapters.map(chapter => chapter.chapter)).toEqual(chosen)
    expect(delivered).toBe(deliveredRoundBrief(manifest))
    // THE CHAPTERS ARE GIVEN AT OUTLINE, beside the line's own part of TERRITORIES.md. A heading names the sandbox and the
    // policy gives '*', so the saved selection is already the line's own section, and does not hold the file in full.
    expect(delivered).toContain(roundChaptersOutline(manifest))
    expect(delivered).not.toContain(THE_SAVED_SELECTION_HOLDS_TERRITORIES_IN_FULL)

    const given = chapterHeadings(manifest.sources[0]!.sections)
    expect(given.map(heading => seen(delivered, heading))).toEqual(given.map(() => 1))
    const others = chapterHeadings(markdownSections(readFileSync(REAL_CODE, 'utf8'))).filter(heading => !given.includes(heading))
    expect(others.length).toBeGreaterThan(0)
    for (const heading of others) expect(delivered).not.toContain(heading)
  })
})

/** How many times a whole line appears in a text. */
const seen = (text: string, line: string) => text.split(line).length - 1
