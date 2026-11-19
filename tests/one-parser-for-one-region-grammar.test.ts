// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE GRAMMAR FOR A REGION ID, READ IN ONE PLACE, AND PROVED AGAINST EVERY ID THE PRODUCT DERIVES.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IS BEING WATCHED
 * ---------------------------------------------------------------------------------------------
 *
 * A region id is a path — `data.blocks[#b-5].text@412`, `section.summary` — and it is what a stored
 * comment points at. Until 30 August 2026 four separate pieces of code worked out its shape for
 * themselves: `stabilityOf` scanned back from the end for a step opener, `identityOf` and
 * `offsetOf` each looked for the last `@`, and src/server/lib/layout.ts decided containment by
 * "same string, or starts with it and then a dot or a bracket" — written out twice, in `isUnder`
 * and in `boxOf`. This repository's named recurring defect is one grammar implemented twice, and
 * four readings of one grammar is that defect four times over, waiting for the grammar to gain a
 * word. It has now gained one: `section`.
 *
 * So there is one `parseRegionId`, one `spellRegionId`, and the four readings are views of what
 * they answer. THIS FILE IS THE PROOF THAT THE ONE READING DID NOT CHANGE ANY OF THE FOUR ANSWERS.
 *
 * ---------------------------------------------------------------------------------------------
 * HOW IT PROVES IT, WHICH IS BY MUTATION AND NOT BY EXAMPLE
 * ---------------------------------------------------------------------------------------------
 *
 * A corpus of ids is derived by running `recordRegionsOf` over every one of the 26 record kinds,
 * twice — once with every field section written as prose and once as a list — plus a report holding
 * a block of every shape that names a region by position. That is every id form the grammar has:
 * the bare root, name steps, `[#id]` steps, `[n]` steps, `@412` and `@337:1204`, and `section.<key>`.
 *
 * Against that corpus, four things are checked:
 *
 *   1. EVERY ID PARSES. Not one of them becomes a problem.
 *   2. EVERY ID SPELLS BACK. `spellRegionId(parseRegionId(id).read) === id`, character for
 *      character. That is what makes the reader and the writer one grammar rather than two that
 *      happen to agree today.
 *   3. THE THREE VIEWS ANSWER WHAT THE FOUR OLD READERS ANSWERED. The old rules are written out
 *      again HERE, in the test, as the oracle — a test may restate a rule it is checking, because
 *      it is the thing being compared against and not a second production reading of it.
 *   4. CONTAINMENT IS THE SAME QUESTION ASKED TWO WAYS. For every ordered pair of ids in the
 *      corpus, `isInsideRegionId` — the characters-and-a-separator test — agrees with "these steps
 *      extend those steps", which is the grammar's own answer.
 *
 * And then malformed ids are fed in, one for each way an id can be wrong, and each has to come back
 * naming the step that is wrong rather than throwing or being quietly accepted.
 *
 * ---------------------------------------------------------------------------------------------
 * THE CASE THAT MADE THE SEPARATOR LOAD-BEARING IS REAL AND IT IS IN THE CORPUS
 * ---------------------------------------------------------------------------------------------
 *
 * A `problem` record declares both `why` and `why_it_hurts`, so its page derives `section.why` and
 * `section.why_it_hurts`. Without the dot or the bracket in the containment test, hiding one would
 * have hidden the other, silently — no error, nothing on a screen, a paragraph simply gone. The
 * owner named the same shape as `section.about` and `section.aboutness`; this is that shape in the
 * corpus rather than in an example, and both are checked below.
 *
 * ---------------------------------------------------------------------------------------------
 * AND THE SERVER REFUSES A NAME IT CANNOT READ, WITH A 400 AND NOT A 404
 * ---------------------------------------------------------------------------------------------
 *
 * `checkTarget` used to hand a malformed id straight to the region reader, which looked for it,
 * did not find it, and answered `gone` — a 404 saying *there is no part of a report to point at*.
 * That is false: Mole Office never looked, because it could not read the name. The last test here
 * writes both, and checks the status and the sentence.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { expectPanelError, freshDb, type TestDb } from './helpers.ts'
import {
  flatten,
  identityOf,
  isInsideRegionId,
  offsetOf,
  parseRegionId,
  recordRegionsOf,
  sectionRegionId,
  spellRegionId,
  stabilityOf,
  type ReadRegionId,
  type RegionStep,
} from '../src/shared/regions.ts'
import { LINK_RELATION_PHRASES, SECTIONS_OF } from '../src/shared/sections.ts'
import { RECORD_KINDS, type SummaryBlock } from '../src/shared/types.ts'

// ============================================================================ the corpus of ids

/** Prose holding a paragraph, a bullet group and a markdown table, so it cuts into every shape. */
const PROSE =
  'A first paragraph runs to here.\n\nA second one, and it is longer than the first.\n\n' +
  '- one bullet\n- and another\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```\nsome code\n```\n'

/** A report holding the block shapes whose ids nest: a section, a comparison, tabs, parts, a table. */
const NESTED: SummaryBlock[] = [
  { id: 'b-1', type: 'text', heading: 'The short answer', text: PROSE } as SummaryBlock,
  {
    id: 'b-2',
    type: 'section',
    title: 'A section holding two things',
    blocks: [
      { id: 'b-3', type: 'text', text: PROSE },
      { id: 'b-4', type: 'table', caption: 'A caption', rows: [{ cells: ['head', 'also'] }, { cells: ['one', 'two'] }] },
    ],
  } as unknown as SummaryBlock,
  {
    id: 'b-5',
    type: 'columns',
    columns: [[{ id: 'b-6', type: 'text', text: PROSE }], [{ id: 'b-7', type: 'text', text: 'A short one.' }]],
  } as unknown as SummaryBlock,
  {
    id: 'b-8',
    type: 'tabs',
    tabs: [{ id: 't-1', label: 'First', blocks: [{ id: 'b-9', type: 'text', text: 'Inside a tab.' }] }],
  } as unknown as SummaryBlock,
  {
    id: 'b-10',
    type: 'beside',
    parts: [{ id: 'p-1', label: 'Left', blocks: [{ id: 'b-11', type: 'text', text: 'Inside a part.' }] }],
  } as unknown as SummaryBlock,
  { id: 'b-12', type: 'checklist', items: [{ id: 'c-1', text: 'one thing', state: 'open' }] } as unknown as SummaryBlock,
  { id: 'b-13', type: 'metrics', items: [{ id: 'm-1', label: 'held', value: '9' }] } as unknown as SummaryBlock,
]

/**
 * EVERY ID FORM THE PRODUCT DERIVES, from every kind, written both ways.
 *
 * Every kind is walked because the sections a page has are declared per kind, and a field section
 * is derived only when the record wrote the field — so a corpus built from one kind would carry a
 * handful of section ids and would say nothing about the other twenty-five.
 */
function corpus(): string[] {
  const ids = new Set<string>()
  for (const kind of RECORD_KINDS) {
    for (const asList of [false, true]) {
      const data: Record<string, unknown> = {}
      for (const spec of SECTIONS_OF[kind]) {
        // BOTH FIELD-HOLDING ARMS. A `headlineField` is one stored string drawn by the kind's own
        // panel instead of by the fold stack, and the ids cut out of it are spelled the same way,
        // so leaving it out here would take a whole shape of id out of the corpus.
        if (spec.from.holds === 'field' || spec.from.holds === 'headlineField') {
          data[spec.key] = asList ? ['one line', 'another line'] : PROSE
        }
      }
      data['blocks'] = NESTED
      data['summaryBlocks'] = NESTED
      // EVERY RELATION PHRASE THIS PRODUCT CAN PRINT, so the corpus holds a `section.<phrase>` id
      // for each of the 33 and the parser is put to all of them — including the ones with a space
      // in, which is the shape a name step had never been given before relation sections existed.
      const relations = [...LINK_RELATION_PHRASES]
      // AN ENVELOPE SUMMARY, so `section.summaryLine` is one of the ids the parser is put to.
      for (const region of flatten(
        recordRegionsOf({ kind, data, title: 'One title, so section.titleLine is in the corpus', summary: PROSE, relations }),
      ))
        ids.add(region.id)
    }
  }
  return [...ids]
}

const IDS = corpus()

// ============================================================================ the four old rules

/**
 * THE OLD `stabilityOf`, WRITTEN OUT AGAIN AS THE ORACLE. It scanned back from the end of the id
 * for the first step opener and asked what that step looked like.
 */
function oldStability(id: string): 'identity' | 'position' {
  let start = 0
  for (let at = id.length - 1; at >= 0; at -= 1) {
    const ch = id[at]
    if (ch === '@' || ch === '.') {
      start = at
      break
    }
    if (ch === ']') {
      const open = id.lastIndexOf('[', at)
      start = open === -1 ? at : open
      break
    }
  }
  const step = id.slice(start)
  if (step.startsWith('@')) return 'position'
  if (/^\[\d+\]$/.test(step)) return 'position'
  return 'identity'
}

/** The old `identityOf`: everything before the last `@`. */
function oldIdentity(id: string): string {
  const at = id.lastIndexOf('@')
  return at === -1 ? id : id.slice(0, at)
}

/** The old `offsetOf`: the number after the last `@`, up to any `:`. */
function oldOffset(id: string): number | null {
  const at = id.lastIndexOf('@')
  if (at === -1) return null
  const step = id.slice(at + 1)
  const colon = step.indexOf(':')
  const from = Number(colon === -1 ? step : step.slice(0, colon))
  return Number.isInteger(from) && from >= 0 ? from : null
}

/** Whether two steps are the same step. */
function sameStep(a: RegionStep, b: RegionStep): boolean {
  if (a.form === 'name' && b.form === 'name') return a.name === b.name
  if (a.form === 'key' && b.form === 'key') return a.key === b.key
  if (a.form === 'index' && b.form === 'index') return a.index === b.index
  return false
}

/**
 * CONTAINMENT ASKED OF THE GRAMMAR RATHER THAN OF THE CHARACTERS: the inner id's steps begin with
 * the outer id's steps and go further.
 *
 * A CHARACTER COUNT IS NOT A STEP. An id that only adds `@412` is not inside the one without it:
 * a stored field is a place ids are cut FROM, and it is not a region, so nothing is under it.
 */
function insideByGrammar(innerId: string, outerId: string, inner: ReadRegionId, outer: ReadRegionId): boolean {
  if (innerId === outerId) return true
  if (outer.at !== null) return false
  if (inner.root !== outer.root) return false
  if (inner.steps.length <= outer.steps.length) return false
  return outer.steps.every((step, at) => {
    const mine = inner.steps[at]
    return mine !== undefined && sameStep(step, mine)
  })
}

/** The read of one id, or a failure naming it, so no test silently skips an id it could not read. */
function read(id: string): ReadRegionId {
  const answer = parseRegionId(id)
  if (answer.read === undefined) throw new Error(`"${id}" did not parse: ${answer.problem.why}`)
  return answer.read
}

// ============================================================================ the proof

describe('every id the product derives goes through the one parser unchanged', () => {
  it('derives a corpus holding every form the grammar has, so the checks below mean something', () => {
    // WRITTEN DOWN SO IT CANNOT QUIETLY SHRINK. A corpus that stopped holding `[n]` steps would
    // pass every check below while proving nothing about them.
    expect(IDS.length).toBeGreaterThan(1000)
    const has = (test: RegExp): number => IDS.filter((id) => test.test(id)).length
    expect(IDS.filter((id) => !id.includes('.') && !id.includes('['))).toEqual(['data'])
    expect(has(/^section\.[^.[@]+$/)).toBeGreaterThan(90)
    expect(has(/\[#[^\]]+\]/)).toBeGreaterThan(20)
    expect(has(/\[\d+\]/)).toBeGreaterThan(100)
    expect(has(/@\d+$/)).toBeGreaterThan(500)
    expect(has(/@\d+:\d+$/)).toBeGreaterThan(300)
  })

  it('reads every one of them, and none of them becomes a problem', () => {
    const refused = IDS.filter((id) => parseRegionId(id).problem !== undefined)
    expect(refused).toEqual([])
  })

  it('spells every one of them back character for character, so the reader and the writer are one grammar', () => {
    const differ = IDS.filter((id) => spellRegionId(read(id)) !== id)
    expect(differ).toEqual([])
  })

  it('answers what the four old readers answered, for every id, so nothing moved', () => {
    const moved: string[] = []
    for (const id of IDS) {
      if (stabilityOf(id) !== oldStability(id)) moved.push(`stability ${id}`)
      if (identityOf(id) !== oldIdentity(id)) moved.push(`identity ${id}`)
      if (offsetOf(id) !== oldOffset(id)) moved.push(`offset ${id}`)
    }
    expect(moved).toEqual([])
  })

  it('finds one id inside another by the same answer whether the characters or the steps are asked', () => {
    const reads = new Map(IDS.map((id) => [id, read(id)] as const))
    const disagreed: string[] = []
    for (const outerId of IDS) {
      const outer = reads.get(outerId)
      if (outer === undefined) continue
      for (const innerId of IDS) {
        const inner = reads.get(innerId)
        if (inner === undefined) continue
        const byCharacters = isInsideRegionId(innerId, outerId)
        const byGrammar = insideByGrammar(innerId, outerId, inner, outer)
        if (byCharacters !== byGrammar) disagreed.push(`${innerId} inside ${outerId}: ${String(byCharacters)} vs ${String(byGrammar)}`)
      }
    }
    expect(disagreed.slice(0, 10)).toEqual([])
  })
})

describe('a section id is a root word and a key, and one section is never inside another by accident', () => {
  it('does not put authority_reference inside authority, which is a pair the corpus really holds', () => {
    // MEASURED RATHER THAN IMAGINED. Across all 26 kinds there are exactly two pairs of section
    // keys where one key is the front of another: `authority` and `authority_reference` on a
    // decision, and `scope` and `scopeRecordId` on a context bundle. Both pairs are declared on ONE
    // kind, so both sections are on ONE page together, which is what makes the separator
    // load-bearing rather than decorative.
    const decision = SECTIONS_OF['decision'].map((spec) => spec.key)
    expect(decision).toContain('authority')
    expect(decision).toContain('authority_reference')
    expect(isInsideRegionId(sectionRegionId('authority_reference'), sectionRegionId('authority'))).toBe(false)
    expect(isInsideRegionId(sectionRegionId('authority'), sectionRegionId('authority_reference'))).toBe(false)

    const bundle = SECTIONS_OF['context_bundle'].map((spec) => spec.key)
    expect(bundle).toContain('scope')
    expect(bundle).toContain('scopeRecordId')
    expect(isInsideRegionId(sectionRegionId('scopeRecordId'), sectionRegionId('scope'))).toBe(false)
  })

  it('has ids in the corpus that are the front of other ids, so the separator is doing real work', () => {
    // If nothing in the corpus were the front of anything else, the containment check above would
    // pass on a test that answered "starts with" and proved nothing.
    const fronts = IDS.filter((a) => IDS.some((b) => b !== a && b.startsWith(a) && !isInsideRegionId(b, a)))
    expect(fronts.length).toBeGreaterThan(0)
  })

  it('does not put aboutness inside about either, which is the pair the owner named', () => {
    expect(isInsideRegionId('section.aboutness', 'section.about')).toBe(false)
    expect(isInsideRegionId('section.about', 'section.aboutness')).toBe(false)
  })

  it('does put what is genuinely inside a section id inside it, so the separator is not just a refusal', () => {
    expect(isInsideRegionId('section.summary', 'section.summary')).toBe(true)
    expect(isInsideRegionId('data.blocks[#b-1].text', 'data.blocks[#b-1]')).toBe(true)
    expect(isInsideRegionId('data.blocks[#b-1]', 'data.blocks')).toBe(true)
    // A CHARACTER COUNT IS NOT A STEP: a field is not a region, so nothing is under it.
    expect(isInsideRegionId('data.summary@0', 'data.summary')).toBe(false)
  })

  it('reads a section id as a root word and one name, with no character count', () => {
    const it1 = read('section.summary')
    expect(it1.root).toBe('section')
    expect(it1.steps).toEqual([{ form: 'name', name: 'summary' }])
    expect(it1.at).toBeNull()
    expect(it1.stability).toBe('identity')
  })

  it('reads the record root, which is the one id with no steps at all', () => {
    expect(read('data')).toMatchObject({ root: 'data', steps: [], at: null, identity: 'data' })
  })

  it('reads a range and a bare offset as the two forms of one step', () => {
    expect(read('data.blocks[#b-5].text@412').at).toEqual({ from: 412, to: null })
    expect(read('data.blocks[#b-5].text@337:1204').at).toEqual({ from: 337, to: 1204 })
    expect(identityOf('data.blocks[#b-5].text@337:1204')).toBe('data.blocks[#b-5].text')
    expect(offsetOf('data.blocks[#b-5].text@337:1204')).toBe(337)
  })
})

describe('an id that breaks the grammar comes back naming the step that broke it', () => {
  /** Every way an id can be wrong, with the step each one has to name and a word from the reason. */
  const BROKEN: readonly { id: string; step: string; says: string }[] = [
    { id: '', step: '', says: 'empty' },
    { id: 'blocks[#b-1]', step: 'blocks', says: '"data"' },
    { id: 'Data.blocks', step: 'Data', says: '"data"' },
    { id: 'data.', step: '.', says: 'followed by nothing' },
    { id: 'data.blocks.', step: '.', says: 'followed by nothing' },
    { id: 'data.blocks[#b-1', step: '[#b-1', says: 'never is' },
    { id: 'data.blocks[]', step: '[]', says: 'counted from zero' },
    { id: 'data.blocks[#]', step: '[#]', says: 'no id is written here' },
    { id: 'data.blocks[b-1]', step: '[b-1]', says: 'counted from zero' },
    { id: 'data.blocks[-1]', step: '[-1]', says: 'counted from zero' },
    { id: 'data.blocks[#b-1].text@', step: '@', says: 'no number follows it' },
    { id: 'data.blocks[#b-1].text@abc', step: '@abc', says: '"abc" is not one' },
    { id: 'data.blocks[#b-1].text@12:', step: '@12:', says: '"" is not one' },
    { id: 'data.blocks[#b-1].text@12:5', step: '@12:5', says: 'cannot end at 5' },
    { id: 'data.blocks[#b-1].text@12.more', step: '@12.more', says: '"12.more" is not one' },
    { id: 'data.blocks[#b-1].text@5@7', step: '@5@7', says: '"5@7" is not one' },
    { id: 'data.blocks[0]x', step: 'x', says: 'starts with none of them' },
    { id: 'data.blocks[#b-1]junk', step: 'junk', says: 'starts with none of them' },
    { id: '[0]', step: '', says: '"data"' },
    { id: 'section', step: 'section', says: 'on its own names no section' },
    { id: 'section.summary.text', step: '.summary.text', says: 'named from "data"' },
    { id: 'section[0]', step: '[0]', says: 'not by an entry of a list' },
    { id: 'section.summary@4', step: 'section.summary@4', says: 'no writing of its own' },
  ]

  it.each(BROKEN)('names the step in $id', ({ id, step, says }) => {
    const answer = parseRegionId(id)
    expect(answer.read).toBeUndefined()
    expect(answer.problem?.id).toBe(id)
    expect(answer.problem?.step).toBe(step)
    expect(answer.problem?.why).toContain(says)
    // AND SAYS WHERE, so a person reading the sentence can find the character.
    expect(answer.problem?.from).toBeGreaterThanOrEqual(0)
    expect(answer.problem?.from).toBeLessThanOrEqual(id.length)
  })

  it('does not throw on any of them, because a browser has no reason to fall over on a typed id', () => {
    for (const one of BROKEN) expect(() => parseRegionId(one.id)).not.toThrow()
  })
})

// ============================================================================ what the server does

const WORKSPACE = 'panelx'
const HUMAN = { type: 'human', id: 'owner' } as const

let t: TestDb
let targets: typeof import('../src/server/lib/targets.ts')

beforeAll(async () => {
  t = await freshDb()
  targets = await import('../src/server/lib/targets.ts')
}, 60_000)

afterAll(() => {
  t.close()
})

describe('the server refuses a name it cannot read, and says so instead of saying the part is gone', () => {
  function report(): string {
    return t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'report',
      title: 'What the review found',
      data: { blocks: [{ id: 'b-1', type: 'text', text: 'The mount holds calibration through a full handover.' }] },
      actor: HUMAN,
    }).id
  }

  it('answers 400 and names the bad step, where it used to answer 404 and say the part is not there', () => {
    const recordId = report()
    const err = expectPanelError(
      t,
      () => targets.checkTarget({ kind: 'region', recordId, regionId: 'data.blocks[#b-1' }, WORKSPACE),
      400,
    )
    expect(err.message).toContain('cannot read')
    expect(err.message).toContain('[#b-1')
    expect(err.message).toContain('never is')
    // AND IT IS NOT THE OTHER SENTENCE. `gone` reads "There is no part of a report to point at",
    // which claims a lookup that could not be made.
    expect(err.message).not.toContain('There is no')
  })

  it('still answers 404 for a name it CAN read that names a part nobody has, because that is true', () => {
    const recordId = report()
    const err = expectPanelError(
      t,
      () => targets.checkTarget({ kind: 'region', recordId, regionId: 'data.blocks[#b-nothing]' }, WORKSPACE),
      404,
    )
    expect(err.message).toContain('There is no')
  })

  it('still accepts every id the record really derives, so the new refusal refuses nothing real', () => {
    const recordId = report()
    for (const id of ['data.blocks[#b-1]', 'data.blocks[#b-1].text@0']) {
      expect(() => targets.checkTarget({ kind: 'region', recordId, regionId: id }, WORKSPACE)).not.toThrow()
    }
  })
})
