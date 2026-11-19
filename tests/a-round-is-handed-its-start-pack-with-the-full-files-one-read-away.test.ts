// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHY THIS FILE EXISTS. A round whose sandbox one heading of TERRITORIES.md names is handed what its line needs at its
 * start, and the full files are named one read away. The pack must give the line's open items as NEXT.md's section 1
 * lists them, its own section of TERRITORIES.md and the fallback rule, the rule chapters at outline, and NEXT.md, while
 * the check keeps the saved selection. Each case below was proved by one mutation, run alone after a green control and
 * restored after (8 November 2026):
 *   - the open items are taken from the heading that begins "2." instead of "1.": the section-1 case is red;
 *   - the line's section stops at the next heading of any level: the section case is red;
 *   - the fallback rule's paragraph is dropped from the pack: the fallback case is red;
 *   - CODE.md is given whole from disk instead of as the saved selection gives it: the chapters case is red;
 *   - NEXT.md is left out of the pack, and in a second run it is given even when it is the brief: the NEXT.md cases are red;
 *   - roundChaptersText returns the pack's text instead of the saved selection: the check case is red;
 *   - one full path is left out of the one-read-away sentence: that case is red;
 *   - one chapter is left out of the pack's CODE.md part: the savedChaptersLine case is red;
 *   - more than one heading naming the sandbox no longer refuses the start: the two-headings case is red;
 *   - a declared line that differs from the heading's no longer refuses the start: that case is red;
 *   - a heading naming another sandbox is taken as the line's: the no-heading case is red;
 *   - readRoundChapters no longer checks a pack's byte count: the malformed-pack case is red.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { prepareRoundChapters, ROUND_CHAPTERS_POLICY_FILE } from '../src/shared/round-chapters/delivery.ts'
import { deliveredRoundBrief, readRoundChapters, roundChaptersGivenText, roundChaptersOutline, roundChaptersText, savedChaptersLine, type RoundChapters } from '../src/shared/round-chapters/manifest.ts'
import {
  declaredLineDiffers, nextIsTheBrief, nextWhole, oneReadAway, THE_FALLBACK_RULE, theFallbackRuleMissing, theMissingLine,
  theNextMissing, theOpenItemsMissing, THE_PACK_REFUSAL, theRoundStartPackHead, twoHeadings, withTheRoundStartPack,
} from '../src/shared/round-start-pack.ts'

const NEXT_TEXT =
  '# Made-up next\n\n## 1. Next work, in this order\n\nFIRST ITEM one.\nSECOND ITEM two.\n\n### A detail\n\nDETAIL three.\n\n## 2. Keep to the budget\n\nBUDGET.\n'

const scratch: string[] = []
afterEach(() => { for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true }) })

/**
 * A made-up sandbox whose TERRITORIES.md names it, so the pack is made. The fallback rule sits under the other line's
 * heading, so it is in the selected TERRITORIES.md text but not in this line's own section.
 */
function madeUpPackRound(options: {
  next?: string | null
  territories?: string | ((sandbox: string) => string)
  policyTerritories?: unknown[]
  briefIsNext?: boolean
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'round-start-pack-')); scratch.push(dir)
  const sandbox = basename(dir)
  const worktree = join(dir, 'worktrees', 'synthetic')
  mkdirSync(join(worktree, 'src/config/rules'), { recursive: true })
  mkdirSync(join(dir, 'briefs'))
  const brief = join(dir, 'briefs', options.briefIsNext ? 'NEXT.md' : 'task.md')
  writeFileSync(brief, 'ORIGINAL task\nwith trailing bytes.\n')
  writeFileSync(join(worktree, 'src/config/rules/CODE.md'), '# Code\n\n## Chapter 2 — Made-up ports\nPORTS\n\n### Child\nCHILD\n\n## Chapter 5 — Made-up tests\nTESTS\n')
  writeFileSync(join(dir, 'briefs/LINE-common.md'), '# Common\nINTRO\n\n## Local\nLOCAL\n\n### Chosen\nCHOSEN\n\n### Omitted\nOMITTED\n\n## Other\nOTHER\n')
  writeFileSync(join(dir, 'briefs/REQUIREMENTS.md'), '# Requirements\n\n2. Made-up item.\n')
  const territories = typeof options.territories === 'function' ? options.territories(sandbox)
    : options.territories ?? `# Territories\n\n## A. The lines\n\n### mu1, made-up line one (sandbox ${sandbox})\nONE-FILE is line one's.\n\n#### Mu1 detail\nONE-DETAIL.\n\n### mu2, made-up line two (sandbox other-sandbox)\nTWO-FILE.\n\n${THE_FALLBACK_RULE}, for every changed file not named below: RULE words.\n`
  writeFileSync(join(dir, 'briefs/TERRITORIES.md'), territories)
  const next = options.next === undefined ? NEXT_TEXT : options.next
  if (next !== null) writeFileSync(join(dir, 'briefs/NEXT.md'), next)
  writeFileSync(brief + '.round.json', JSON.stringify({ kind: 'synthetic', territory: ['garden'] }))
  const policy = { version: 1, kinds: { synthetic: {
    'CODE.md': [{ chapter: 2, descendants: true }, { chapter: 5, descendants: true }],
    'LINE-common.md': [{ path: ['Common', 'Local'] }, { path: ['Common', 'Local', 'Chosen'] }],
    'TERRITORIES.md': options.policyTerritories ?? '*',
  } }, territories: {} }
  writeFileSync(join(dir, ROUND_CHAPTERS_POLICY_FILE), JSON.stringify(policy))
  return { dir, sandbox, worktree, brief }
}

const prepare = (f: ReturnType<typeof madeUpPackRound>) => prepareRoundChapters({ sandboxDir: f.dir, worktree: f.worktree, brief: f.brief })

describe('the open items are NEXT.md section 1', () => {
  it('gives section 1 whole, its heading and every item in the file order', () => {
    // NEXT.md is the brief here, so the pack is the only place its section 1 can come from: the delivered brief
    // holds the brief once, above the pack.
    const f = madeUpPackRound({ briefIsNext: true })
    const { manifest } = prepare(f)
    const pack = manifest.pack!
    expect(pack.text.startsWith(theRoundStartPackHead('mu1'))).toBe(true)
    const section = NEXT_TEXT.slice(NEXT_TEXT.indexOf('## 1.'), NEXT_TEXT.indexOf('## 2.'))
    expect(pack.text).toContain(section)
    const first = pack.text.indexOf('FIRST ITEM one.')
    const second = pack.text.indexOf('SECOND ITEM two.')
    const detail = pack.text.indexOf('DETAIL three.')
    expect(first).toBeGreaterThan(-1)
    expect(second).toBeGreaterThan(first)
    expect(detail).toBeGreaterThan(second)
  })

  it('names the open items missing when NEXT.md has no section 1', () => {
    const f = madeUpPackRound({ next: '# Next\n\n## 2. Other\n\nOTHER\n' })
    const { manifest } = prepare(f)
    const why = theOpenItemsMissing(join(f.dir, 'briefs', 'NEXT.md'), 'no-section')
    expect(manifest.pack!.missing).toContain(why)
    expect(manifest.pack!.text).toContain(theMissingLine(why))
  })

  it('names the open items missing when two headings begin "1."', () => {
    const f = madeUpPackRound({ next: '# Next\n\n## 1. First list\n\nFIRST\n\n## 1. Second list\n\nSECOND\n\n## 2. Other\n\nOTHER\n' })
    const { manifest } = prepare(f)
    const why = theOpenItemsMissing(join(f.dir, 'briefs', 'NEXT.md'), 'two-sections', 2)
    expect(manifest.pack!.missing).toContain(why)
    expect(manifest.pack!.text).toContain(theMissingLine(why))
  })
})

describe('the line\'s own section and its fallback rule', () => {
  it('gives the line\'s section and its descendants, and no other line\'s text', () => {
    const f = madeUpPackRound()
    const { manifest } = prepare(f)
    const pack = manifest.pack!
    expect(pack.text).toContain("ONE-FILE is line one's.")
    expect(pack.text).toContain('ONE-DETAIL.')
    expect(pack.text).not.toContain('TWO-FILE.')
  })

  it('gives the one paragraph that begins with the fallback rule', () => {
    const f = madeUpPackRound()
    const { manifest } = prepare(f)
    const pack = manifest.pack!
    expect(pack.text).toContain(`${THE_FALLBACK_RULE}, for every changed file not named below: RULE words.`)
    expect(pack.missing.some(one => one.startsWith('the fallback rule'))).toBe(false)
  })

  it.each([0, 2])('names the fallback rule missing when %i paragraphs begin with it', paragraphs => {
    const paragraph = `${THE_FALLBACK_RULE}, rule words.`
    const f = madeUpPackRound({
      territories: sandbox => `# Territories\n\n## A. The lines\n\n### mu1, made-up line one (sandbox ${sandbox})\nONE-FILE is line one's.\n\n${paragraphs > 0 ? paragraph + '\n\n' : ''}${paragraphs > 1 ? paragraph + '\n\n' : ''}### mu2, made-up line two (sandbox other-sandbox)\nTWO-FILE.\n`,
    })
    const { manifest } = prepare(f)
    const why = theFallbackRuleMissing(join(f.dir, 'briefs', 'TERRITORIES.md'), paragraphs)
    expect(manifest.pack!.missing).toContain(why)
    expect(manifest.pack!.text).toContain(theMissingLine(why))
  })
})

describe('the rule chapters at outline, NEXT.md, and the one-read-away sentence', () => {
  it('gives CODE.md at outline, and not whole', () => {
    const f = madeUpPackRound()
    const { manifest } = prepare(f)
    const pack = manifest.pack!
    expect(pack.text).toContain(roundChaptersGivenText(manifest))
    expect(pack.text).toContain(roundChaptersOutline(manifest))
    expect(pack.text).not.toContain(manifest.sources[0]!.text)
    expect(pack.text).toContain('CODE reading levels: 2 at outline')
    expect(pack.text).toContain('5 at outline')
  })

  it('gives NEXT.md whole when it is not the brief, and says so when it is', () => {
    const f = madeUpPackRound()
    const { manifest } = prepare(f)
    const path = join(f.dir, 'briefs', 'NEXT.md')
    expect(manifest.pack!.text).toContain(`${nextWhole(path)}\n\n${NEXT_TEXT}`)

    const g = madeUpPackRound({ briefIsNext: true })
    const withBrief = prepare(g).manifest
    expect(withBrief.pack!.text).toContain(nextIsTheBrief())
    expect(withBrief.pack!.text).not.toContain(nextWhole(join(g.dir, 'briefs', 'NEXT.md')))
    expect(deliveredRoundBrief(withBrief).split(NEXT_TEXT).length - 1).toBe(1)
  })

  it('names NEXT.md missing, with the error code, when it cannot be read', () => {
    const f = madeUpPackRound({ next: null })
    const { manifest } = prepare(f)
    const path = join(f.dir, 'briefs', 'NEXT.md')
    expect(manifest.pack!.missing).toContain(theNextMissing(path, 'ENOENT'))
    expect(manifest.pack!.missing).toContain(theOpenItemsMissing(path, 'unreadable', 0, 'ENOENT'))
  })

  it('names every full file one read away', () => {
    const f = madeUpPackRound()
    const { manifest } = prepare(f)
    const paths = [
      join(f.dir, 'briefs', 'REQUIREMENTS.md'), join(f.dir, 'briefs', 'TERRITORIES.md'),
      join(f.worktree, 'src/config/rules/CODE.md'), join(f.dir, 'briefs', 'LINE-common.md'), join(f.dir, 'briefs', 'NEXT.md'),
    ]
    expect(manifest.pack!.text).toContain(oneReadAway(paths))
  })
})

describe('the check keeps the saved selection, and every named chapter is in the pack', () => {
  it('leaves roundChaptersText unchanged and rebuilds the delivered brief from the saved record', () => {
    const f = madeUpPackRound()
    const { manifest, brief } = prepare(f)
    const saved = readRoundChapters(JSON.parse(readFileSync(brief.replace(/\.md$/, '.json'), 'utf8')))
    expect(saved.pack?.text).toBe(manifest.pack?.text)
    expect(deliveredRoundBrief(saved)).toBe(readFileSync(brief, 'utf8'))
    expect(roundChaptersText(saved)).toBe(roundChaptersText({ ...saved, pack: undefined }))
  })

  it('writes the pack into the brief file the round is handed', () => {
    const f = madeUpPackRound()
    const { manifest, brief } = prepare(f)
    const handed = readFileSync(brief, 'utf8')
    expect(handed).toContain(theRoundStartPackHead('mu1'))
    expect(handed).toContain(manifest.pack!.text)
    expect(handed).toContain(`${nextWhole(join(f.dir, 'briefs', 'NEXT.md'))}\n\n${NEXT_TEXT}`)
    expect(handed).toContain("ONE-FILE is line one's.")
  })

  it('gives every chapter savedChaptersLine names at outline in the pack text', () => {
    const f = madeUpPackRound()
    const { manifest } = prepare(f)
    const names = savedChaptersLine(manifest).mustRead
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) {
      const chapter = manifest.chapters.find(c => c.chapter === name.chapter)
      expect(chapter, `chapter ${name.chapter} is named but not saved`).toBeDefined()
      const heading = chapter!.text.split('\n')[0]!
      expect(manifest.pack!.text, `chapter ${name.chapter} is named but not given`).toContain(heading)
    }
    expect(manifest.pack!.text).toContain(roundChaptersOutline(manifest))
  })
})

describe('the line is told only when one heading names the sandbox', () => {
  it('refuses two headings for one sandbox', () => {
    const f = madeUpPackRound({
      territories: sandbox => `# Territories\n\n## A. The lines\n\n### mu1, made-up line one (sandbox ${sandbox})\nONE-FILE.\n\n### mu2, made-up line two (sandbox ${sandbox})\nTWO-FILE.\n`,
    })
    expect(() => prepare(f)).toThrow(THE_PACK_REFUSAL(twoHeadings(2, join(f.dir, 'briefs', 'TERRITORIES.md'), f.sandbox)))
  })

  it('refuses a declared line that differs from the heading\'s', () => {
    const f = madeUpPackRound()
    const { manifest } = prepare(f)
    const declared = { ...manifest, backlog: { line: 'other-line', named: [], from: 'the office', items: [], text: '', bytes: 0 } } as RoundChapters
    const why = declaredLineDiffers('other-line', join(f.dir, 'briefs', 'TERRITORIES.md'), f.sandbox, 'mu1')
    expect(() => withTheRoundStartPack(declared, f.dir)).toThrow(THE_PACK_REFUSAL(why))
  })

  it('makes no pack when no heading names the sandbox', () => {
    const f = madeUpPackRound({
      territories: '# Territories\n\n## A. The lines\n\n### mu1, made-up line one (sandbox other-sandbox)\nONE-FILE.\n',
    })
    const { manifest } = prepare(f)
    expect(manifest.pack).toBeUndefined()
    expect(withTheRoundStartPack(manifest, f.dir)).toBe(manifest)
  })

  it('refuses a saved pack whose byte count is not its text\'s', () => {
    const f = madeUpPackRound()
    const { manifest } = prepare(f)
    const bad = structuredClone(manifest) as RoundChapters
    bad.pack!.bytes += 1
    expect(() => readRoundChapters(bad)).toThrow()
  })
})
