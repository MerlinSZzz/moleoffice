// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The server-side zod schemas for curated summary blocks.
 *
 * These cover `src/server/lib/summary.ts`, which is what refuses a bad block on an HTTP write.
 * `scripts/seed.ts` still holds a hand-rolled validator of its own, which refuses one on a seed
 * write. Two validators for one stored shape is a temporary state, recorded in
 * src/server/api/index-additions.md with the plan for collapsing them.
 *
 * THIS IS NOW THE ONLY TEST OF EITHER. `tests/summary.test.ts` made the same claims about the
 * seed's copy, so breaking the door in `src/server/lib/summary.ts` left it green; it was deleted on
 * 3 September 2026 under decision `AckYjtD6ZiuN`, and the three claims it made that
 * nothing here covered are the last describe block in this file.
 *
 * While the two validators exist, the FIRST describe block below is the one that matters most: it
 * runs every block the seed actually writes through the zod schemas. If the two definitions
 * ever drift apart, that test goes red rather than the API quietly refusing data the seed
 * script happily stores.
 *
 * What is really being tested elsewhere here is the ERROR MESSAGE, not just the refusal. A
 * validator that says "invalid input" has moved the problem rather than solved it: the agent
 * that wrote the bad block still has to guess which of forty numbers on the page it got wrong.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'

type SummaryApi = typeof import('../src/server/lib/summary.ts')
type SeedApi = typeof import('../scripts/seed.ts')

let t: TestDb
let s: SummaryApi

/**
 * The office is made once for the file. Most cases check the schemas in memory; the two that run
 * the seed against it take the seeded content from the same database.
 */
beforeAll(async () => {
  // freshDb sets MOLE_OFFICE_DB and migrates, so importing summary.ts (and through it records.ts,
  // and through that the SQLite client) opens a throwaway file rather than the real one.
  t = await freshDb()
  s = await import('../src/server/lib/summary.ts')
}, 60_000)

afterAll(() => t.close())

/** Run a validation that must fail, and hand back the message so the test can read it. */
function rejection(blocks: unknown): string {
  try {
    s.validateSummaryBlocks(blocks)
  } catch (err) {
    if (!(err instanceof t.api.PanelError)) throw new Error(`expected a PanelError, got ${String(err)}`)
    expect(err.status).toBe(400)
    return err.message
  }
  throw new Error('expected the blocks to be refused, but they were accepted')
}

/** One valid block of every type, as a factory so a test editing its copy cannot affect another. */
const goodBlocks = (): unknown[] => [
  { id: 'b-text', type: 'text', heading: 'What broke', text: 'The shell cracked at effort 15.' },
  {
    id: 'b-chart',
    type: 'chart',
    spec: {
      kind: 'line',
      x: { label: 'effort' },
      y: { label: 'grip force', unit: 'N' },
      series: [{ id: 's1', name: 'v3 shell', points: [{ x: 12, y: 11.2 }, { x: 15, y: 15.9 }], state: 'failed', dashed: true }],
      annotations: [{ id: 'need', axis: 'y', value: 12, label: '12 N needed' }],
    },
    caption: 'Illustrative.',
  },
  { id: 'b-math', type: 'math', tex: 'F \\ge \\frac{m g}{2 \\mu}', caption: 'F per finger.' },
  {
    id: 'b-table',
    type: 'table',
    columns: [{ label: 'effort', align: 'right' }, { label: 'outcome' }],
    rows: [{ cells: [15, 'cracked'], state: 'failed' }],
  },
  {
    id: 'b-image',
    type: 'image',
    path: `${THE_TEST_FIXTURE_ROOT}/PROJECTS/proj_1st_baseline/docs/overlay_05.png`,
    alt: 'The bench with two 50 mm cubes on it.',
  },
]

// ------------------------------------------------------- agreement with the seed's validator

describe('the zod schemas accept everything scripts/seed.ts writes', () => {
  it('accepts both curated summaries the seed stores, unchanged', async () => {
    const seed: SeedApi = await import('../scripts/seed.ts')

    for (const [name, blocks] of [
      ['SCANNER_SUMMARY', seed.SCANNER_SUMMARY],
      ['OCR_SUMMARY', seed.OCR_SUMMARY],
    ] as const) {
      let checked
      try {
        checked = s.validateSummaryBlocks(blocks)
      } catch (err) {
        // Naming the constant matters: this is the test that catches the two validators drifting.
        throw new Error(`${name} is refused by src/server/lib/summary.ts: ${(err as Error).message}`)
      }
      expect(checked.length, `${name} lost blocks`).toBe(blocks.length)
      // Non-transforming: nothing was trimmed, defaulted or reordered on the way through.
      expect(JSON.parse(JSON.stringify(checked)), `${name} was rewritten`).toEqual(
        JSON.parse(JSON.stringify(blocks)),
      )
    }
  })

  /**
   * The list and the union it names have to be the same five things.
   *
   * This test used to compare summary.ts's SUMMARY_BLOCK_TYPES with the seed's. Both are now
   * re-exports of the one in src/shared/types.ts, so that comparison had become a constant
   * compared with itself — a green test proving nothing, which is worse than no test, because it
   * looks like the copies are being watched.
   *
   * What is worth checking is the join the compiler cannot make: the LIST is a plain array of
   * words, the discriminated union below it is built block by block, and the list is what the
   * refusal message offers to a caller who got the type wrong. A block type in the list that the
   * union does not accept is a documented type that is refused; one the union accepts that the
   * list omits is a working type nobody is told about.
   */
  it('accepts a block of every type it lists, and lists every type it accepts', () => {
    const minimal: Record<string, Record<string, unknown>> = {
      text: { text: 'what happened' },
      heading: { text: 'What happened' },
      finding: { text: 'The mount holds calibration.' },
      callout: { tone: 'warning', text: 'The speed only latches on a fresh session.' },
      metrics: { items: [{ id: 'm1', label: 'error', value: '0.4' }] },
      keyvalue: { items: [{ id: 'kv1', label: 'machine', value: 'thor' }] },
      list: { items: ['one', 'two'] },
      checklist: { items: [{ id: 'c1', text: 'the limit is re-sent', state: 'done' }] },
      code: { code: 'npm test' },
      quote: { text: 'it is still not a table' },
      path: { label: 'The log', path: `${THE_TEST_FIXTURE_ROOT}/run.txt` },
      chart: {
        spec: { kind: 'line', x: { label: 'x' }, y: { label: 'y' }, series: [{ id: 'a', name: 'a', points: [{ x: 1, y: 2 }] }] },
      },
      math: { tex: 'F = ma' },
      table: { columns: [{ label: 'effort' }], rows: [{ cells: [15] }] },
      timeline: { items: [{ id: 't1', when: '14 August', text: 'the third print cracked' }] },
      image: { path: `${THE_TEST_FIXTURE_ROOT}/x.png`, alt: 'a bench' },
      // A FILE CARRIED AS A FILE. Criterion R3. The four facts are what the block is for, and the
      // hash is the store's own short sha256, so the example uses one a store could have produced.
      file: {
        path: `${THE_TEST_FIXTURE_ROOT}/report-files/abc123.ts`,
        name: 'summary.ts',
        size: 20480,
        hash: '0a1b2c3d4e5f6071',
      },
      // A SOUND AND A FILM THE REPORT PLAYS. The same four facts, and what is
      // heard or seen in words; the path ends in a format the block plays.
      audio: { path: `${THE_TEST_FIXTURE_ROOT}/report-files/abc123.wav`, name: 'voice.wav', size: 20480, hash: '0a1b2c3d4e5f6071', alt: 'a voice' },
      video: { path: `${THE_TEST_FIXTURE_ROOT}/report-files/abc123.webm`, name: 'film.webm', size: 20480, hash: '0a1b2c3d4e5f6071', alt: 'a film' },
      section: { blocks: [{ id: 'inside', type: 'text', text: 'inside the section' }] },
      columns: {
        columns: [
          [{ id: 'left', type: 'text', text: 'before' }],
          [{ id: 'right', type: 'text', text: 'after' }],
        ],
      },
      grid: { blocks: [{ id: 'one', type: 'text', text: 'the first of many' }] },
      tabs: {
        tabs: [
          { id: 'tab-a', label: 'thor', blocks: [{ id: 'ta', type: 'text', text: 'ran clean' }] },
          { id: 'tab-b', label: 'yumi', blocks: [{ id: 'tb', type: 'text', text: 'stopped at 12' }] },
        ],
      },
      // NO SHARES ON EITHER PART, which is the smallest a composition can be written: what each
      // part is worth is a preference, and left out Mole Office reads the parts and chooses.
      beside: {
        parts: [
          { id: 'p-words', blocks: [{ id: 'pw', type: 'text', text: 'the mast moved 4mm' }] },
          { id: 'p-shot', blocks: [{ id: 'ps', type: 'image', path: `${THE_TEST_FIXTURE_ROOT}/mast.png`, alt: 'the mast' }] },
        ],
      },
      // A TEST WORLD IN A HANDBACK. Criterion C31. Only the label and the address are needed: the
      // API, the ledger row and the reason are all things a world may not have, and each absence is
      // said on the page rather than being a gap.
      world: { label: 'The check panel on a run that was refused', web: 'http://127.0.0.1:41573' },
      // THE QUESTIONS IN A REPORT: a choice needs two options, and a box needs a question in it.
      choice: { question: 'Which glaze?', options: [{ id: 'a', label: 'Celadon' }, { id: 'b', label: 'Tenmoku' }] },
      fillin: { asks: 'Anything the glazer should know?' },
      button: { label: 'Fire the kiln' },
      box: { blocks: [{ id: 'q-in-box', type: 'fillin', asks: 'Which shelf?' }] },
    }

    for (const type of s.SUMMARY_BLOCK_TYPES) {
      const body = minimal[type]
      if (body === undefined) {
        throw new Error(`${type} is a declared block type with no example here — add one, do not delete the type`)
      }
      expect(() => s.validateSummaryBlocks([{ id: `b-${type}`, type, ...body }]), type).not.toThrow()
    }

    // And the message a wrong type gets names exactly the list, so the two cannot say different
    // things to a caller who is guessing.
    // A TYPE NO BUILD HAS. This was 'video' until the video block came.
    const refusal = rejection([{ id: 'b-hologram', type: 'hologram', src: '/tmp/clip.mp4' }])
    expect(refusal).toContain(s.SUMMARY_BLOCK_TYPES.join(', '))
  })

  it('reads the stored summaryBlocks back off a seeded module and re-validates them', async () => {
    await import('../scripts/seed.ts') // importing runs the seed against the throwaway database
    const scanner = t.api.getRecordByTitle('Microfilm scanner station', 'default')
    if (!scanner) throw new Error('the seed wrote no module called "Microfilm scanner station"')
    const blocks = s.validateSummaryBlocks(scanner.data['summaryBlocks'])
    expect(blocks.length).toBeGreaterThan(0)
    // The gate used by the API has to accept the same record the seed just wrote.
    expect(() => s.checkModuleSummary('module', scanner.data)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------- the good case

describe('a well-formed curated summary', () => {
  it('accepts one block of every type', () => {
    expect(s.validateSummaryBlocks(goodBlocks())).toHaveLength(5)
  })

  it('accepts an empty summary', () => {
    // A module with no findings written up yet is a normal state, not an error.
    expect(s.validateSummaryBlocks([])).toEqual([])
  })

  it('returns the blocks unchanged, adding nothing and trimming nothing', () => {
    // This test exists so that nobody later adds a "helpful" .trim() or a default and starts
    // silently rewriting stored data.
    const blocks = [{ id: 'a', type: 'text', text: '  spaces are preserved  ' }]
    expect(s.validateSummaryBlocks(blocks)).toEqual(blocks)
  })

  it('keeps Chinese text intact', () => {
    const blocks = [{ id: 'a', type: 'text', heading: '夹具标定', text: '标定 gripper calibration' }]
    expect(s.validateSummaryBlocks(blocks)).toEqual(blocks)
  })

  it('keeps numeric table cells as numbers', () => {
    const blocks = s.validateSummaryBlocks([
      { id: 't', type: 'table', columns: [{ label: 'n' }], rows: [{ cells: [15] }] },
    ])
    const block = blocks[0]
    if (block?.type !== 'table') throw new Error('expected a table block')
    // Coercing 15 to "15" would lose the right-alignment the align column asks for.
    expect(block.rows[0]?.cells[0]).toBe(15)
  })
})

// ---------------------------------------------------------------------------- messages

describe('what a refusal says', () => {
  it('names the block index, its type and the field', () => {
    const msg = rejection([
      { id: 'ok', type: 'text', text: 'fine' },
      {
        id: 'bad',
        type: 'chart',
        spec: {
          kind: 'line',
          x: { label: 'effort' },
          y: { label: 'force' },
          series: [{ id: 's', name: 's', points: [{ x: 0, y: 'nope' }] }],
        },
      },
    ])
    expect(msg).toContain('summary block 1 (chart)')
    expect(msg).toContain('spec.series.0.points.0.y')
    expect(msg).toContain('must be a finite number')
  })

  it('lists the types that exist when the type is unknown', () => {
    const msg = rejection([{ id: 'z', type: 'histogram', bins: 3 }])
    expect(msg).toContain('summary block 0 (histogram)')
    for (const kind of s.SUMMARY_BLOCK_TYPES) expect(msg).toContain(kind)
  })

  it('names the row when a table row is the wrong length', () => {
    const msg = rejection([
      {
        id: 't',
        type: 'table',
        columns: [{ label: 'a' }, { label: 'b' }, { label: 'c' }],
        rows: [{ cells: ['1', '2', '3'] }, { cells: ['1'] }],
      },
    ])
    expect(msg).toContain('rows.1')
    expect(msg).toContain('row 1 has 1 cell but the table has 3 columns')
  })

  it('names the block that reused an id and the one it clashes with', () => {
    const msg = rejection([
      { id: 'a', type: 'text', text: 'one' },
      { id: 'a', type: 'text', text: 'two' },
    ])
    expect(msg).toContain('summary block 1 (text)')
    expect(msg).toContain('id "a" is already used by block 0')
  })

  /**
   * A BLOCK INSIDE A SECTION IS STILL A BLOCK SOMEBODY POINTS AT BY ITS ID, so two of them sharing
   * one is the same fault one level down. The check walks the whole tree rather than the top row.
   */
  it('names a duplicate id inside a section, not only one at the top', () => {
    const msg = rejection([
      { id: 'a', type: 'text', text: 'one' },
      { id: 's', type: 'section', blocks: [{ id: 'a', type: 'text', text: 'two' }] },
    ])
    expect(msg).toContain('summary block 1 (section): blocks.0.id')
    expect(msg).toContain('id "a" is already used by block 0')
  })

  it('says which key was not recognised rather than dropping it', () => {
    // A colour on a block would be a hard-coded colour outside the token system. Refusing it as
    // an unknown key also means no misspelt field is ever silently discarded.
    const msg = rejection([{ id: 'a', type: 'text', text: 'x', colour: '#f00' }])
    expect(msg).toContain('summary block 0 (text)')
    expect(msg).toContain('colour')
  })

  it('refuses words of a box’s own for its submit, because the page draws its own word there', () => {
    // WAVE 13K ROUND 30. A box's submit was once labelled by the report's writer, and that label stayed
    // English on a Chinese page. The page now always draws its own word, in its own language, so a
    // field it would not draw is refused rather than kept and ignored. Mutation, 3 October 2026:
    // `submitLabel` put back on boxBlock in src/server/lib/summary.ts, and this goes red.
    const msg = rejection([
      { id: 'box', type: 'box', submitLabel: 'Send these', blocks: [{ id: 'q', type: 'fillin', asks: 'Which shelf?' }] },
    ])
    expect(msg).toContain('summary block 0 (box)')
    expect(msg).toContain('submitLabel')
  })

  it('says what a block is when it is not an object at all', () => {
    expect(rejection([42])).toContain('summary block 0 (a number)')
    expect(rejection([null])).toContain('summary block 0 (null)')
  })

  it('refuses a summary that is not an array', () => {
    expect(rejection({ id: 'a', type: 'text', text: 'x' })).toContain('must be an array of blocks')
  })
})

// ---------------------------------------------------------------------------- silent failures

describe('the blocks that would render as nothing', () => {
  const chart = (spec: unknown) => [{ id: 'c', type: 'chart', spec }]
  const axes = { x: { label: 'effort' }, y: { label: 'force' } }

  it('refuses a chart with no series', () => {
    expect(rejection(chart({ kind: 'line', ...axes, series: [] }))).toContain(
      'a chart needs at least one series',
    )
  })

  it('refuses a series with no points', () => {
    const msg = rejection(chart({ kind: 'line', ...axes, series: [{ id: 's', name: 's', points: [] }] }))
    expect(msg).toContain('a legend entry on the chart for a line that is not there')
  })

  it('refuses an unlabelled axis', () => {
    // An unlabelled axis is a number with no unit, which is how a plot lies.
    const msg = rejection(
      chart({ kind: 'line', x: {}, y: { label: 'force' }, series: [{ id: 's', name: 's', points: [{ x: 0, y: 1 }] }] }),
    )
    expect(msg).toContain('x')
    expect(msg).toContain('label')
  })

  it('refuses an inverted axis range, which would draw the chart inside out', () => {
    const msg = rejection(
      chart({
        kind: 'line',
        x: { label: 'effort' },
        y: { label: 'force', min: 10, max: 1 },
        series: [{ id: 's', name: 's', points: [{ x: 0, y: 1 }] }],
      }),
    )
    expect(msg).toContain('y.min (10) must be less than y.max (1)')
  })

  it('refuses two series sharing an id, which makes the legend address the wrong line', () => {
    const msg = rejection(
      chart({
        kind: 'line',
        ...axes,
        series: [
          { id: 'v3', name: 'first', points: [{ x: 0, y: 1 }] },
          { id: 'v3', name: 'second', points: [{ x: 0, y: 2 }] },
        ],
      }),
    )
    expect(msg).toContain('series id "v3" is already used by series 0')
  })

  it('refuses a reference line with no label', () => {
    const msg = rejection(
      chart({
        kind: 'line',
        ...axes,
        series: [{ id: 's', name: 's', points: [{ x: 0, y: 1 }] }],
        annotations: [{ id: 'a', axis: 'y', value: 12 }],
      }),
    )
    expect(msg).toContain('label')
  })

  it('refuses an image with no alternative text', () => {
    expect(rejection([{ id: 'i', type: 'image', path: '/x/y.png' }])).toContain('alt')
  })

  it('refuses a relative image path', () => {
    const msg = rejection([{ id: 'i', type: 'image', path: 'docs/y.png', alt: 'a bench' }])
    expect(msg).toContain('must be absolute')
  })

  it('refuses empty prose, which renders as a gap', () => {
    expect(rejection([{ id: 'a', type: 'text', text: '   ' }])).toContain('must not be empty')
  })

  it('refuses a table with no rows', () => {
    expect(rejection([{ id: 't', type: 'table', columns: [{ label: 'a' }], rows: [] }])).toContain(
      'at least one row',
    )
  })

  it('refuses a cell that is neither text nor a number', () => {
    const msg = rejection([
      { id: 't', type: 'table', columns: [{ label: 'a' }], rows: [{ cells: [{ nested: true }] }] },
    ])
    expect(msg).toContain('rows.0.cells.0')
  })
})

// ---------------------------------------------------------------------------- LaTeX

describe('LaTeX structure', () => {
  it('accepts balanced tex', () => {
    expect(s.texProblem('\\frac{a}{b}')).toBeNull()
    expect(s.texProblem('x_{i}^{2} + \\sqrt{y}')).toBeNull()
    expect(s.texProblem('F \\ge \\frac{m g}{2 \\mu}')).toBeNull()
  })

  it('does not look at command names, only at structure', () => {
    // A command MathText cannot render must still be storable, so it can be shown as source
    // rather than dropped. That is the rule scripts/seed.ts states, and it holds here.
    expect(s.texProblem('\\notarealcommand{x}')).toBeNull()
  })

  it('does not count escaped braces or dollars', () => {
    expect(s.texProblem('a \\{ b')).toBeNull()
    expect(s.texProblem('cost \\$5')).toBeNull()
  })

  it('catches an unclosed brace', () => {
    expect(s.texProblem('\\frac{a}{b')).toBe('one "{" was opened and never closed')
    expect(s.texProblem('{{x')).toBe('2 "{" were opened and never closed')
  })

  it('catches a closing brace with nothing to close', () => {
    expect(s.texProblem('a}b')).toContain('with no matching')
  })

  it('catches an odd number of dollar signs', () => {
    expect(s.texProblem('$x')).toContain('odd number of "$"')
  })

  it('refuses a math block whose tex is not closed', () => {
    const msg = rejection([{ id: 'm', type: 'math', tex: '\\frac{a}{b' }])
    expect(msg).toContain('summary block 0 (math)')
    expect(msg).toContain('tex is not closed')
  })
})

// ---------------------------------------------------------------------------- the write gate

describe('checkModuleSummary, the gate on a record write', () => {
  it('ignores records that are not modules', () => {
    // A note whose data happens to have a summaryBlocks field is none of this gate's business.
    expect(() => s.checkModuleSummary('note', { summaryBlocks: [{ nonsense: true }] })).not.toThrow()
  })

  it('ignores a module write that does not touch the curated summary', () => {
    expect(() => s.checkModuleSummary('module', { context: 'why this exists' })).not.toThrow()
    expect(() => s.checkModuleSummary('module', undefined)).not.toThrow()
  })

  it('does not confuse the one-line summary with the block list', () => {
    // ModuleData.summary is the generated one-liner, a plain string. Blocks live in
    // summaryBlocks. Checking the wrong field would refuse every module that has a one-liner.
    expect(() => s.checkModuleSummary('module', { summary: 'one line about the gripper' })).not.toThrow()
  })

  it('accepts clearing the curated summary', () => {
    expect(() => s.checkModuleSummary('module', { summaryBlocks: null })).not.toThrow()
  })

  it('validates the blocks in full', () => {
    expect(() => s.checkModuleSummary('module', { summaryBlocks: goodBlocks() })).not.toThrow()
    expect(() => s.checkModuleSummary('module', { summaryBlocks: [{ id: 'a', type: 'text' }] })).toThrow(
      /summary block 0 \(text\)/,
    )
  })

  it('refuses summaryBlocks that are not an array', () => {
    expect(() => s.checkModuleSummary('module', { summaryBlocks: 7 })).toThrow(/must be an array of blocks/)
    expect(() => s.checkModuleSummary('module', { summaryBlocks: { id: 'a' } })).toThrow(
      /must be an array of blocks/,
    )
  })
})

// ------------------------------------------------- what a block keeps, and what it may not draw

/**
 * THREE CLAIMS MOVED HERE FROM tests/summary.test.ts, WHICH IS DELETED.
 *
 * That file made the same claims about the hand-written validator inside `scripts/seed.ts`, so
 * breaking the product's own door in `src/server/lib/summary.ts` left it green. These three were
 * the ones nothing else here covered; the rest of that file either repeated a case above or
 * asserted the shape of the demo corpus, which goes red when somebody edits the demo and says
 * nothing about the product. Decision `AckYjtD6ZiuN`.
 */
describe('what survives a write, and what is refused for being nothing at all', () => {
  it('keeps the fields that carry a state without colour: a row’s state and a column’s alignment', () => {
    // A FAILED ROW CARRIES THE SAME TOKEN AS THE FAILED CHECKLIST ITEM ABOVE IT, and a right
    // alignment is what makes a column of numbers readable. Both are optional fields, which is
    // exactly the sort a validator drops while still accepting the block.
    const written = [
      {
        id: 'b-table',
        type: 'table',
        columns: [{ label: 'effort', align: 'right' }, { label: 'outcome' }],
        rows: [{ cells: [15, 'cracked'], state: 'failed' }],
      },
      {
        id: 'b-chart',
        type: 'chart',
        spec: {
          kind: 'line',
          x: { label: 'effort' },
          y: { label: 'grip force', unit: 'N' },
          series: [
            { id: 's1', name: 'v3 shell', points: [{ x: 12, y: 11.2 }], state: 'failed', dashed: true },
          ],
          annotations: [{ id: 'need', axis: 'y', value: 12, label: '12 N needed' }],
        },
      },
    ]
    const read = s.validateSummaryBlocks(written)
    expect(JSON.parse(JSON.stringify(read)), 'a field was dropped, defaulted or rewritten').toEqual(
      JSON.parse(JSON.stringify(written)),
    )
  })

  it('keeps maths it cannot draw, exactly as written, and lets the blocks around it through', () => {
    // RULE: VALIDATION THAT DROPPED WHAT IT COULD NOT DRAW WOULD DELETE THE AUTHOR'S MATHS.
    // Refusing to render is visible; deleting is not. A cases environment with an aligned pair of
    // inequalities is well outside any small subset a renderer supports.
    const hard =
      '\\begin{cases} F \\ge \\dfrac{m g}{2 \\mu} & \\text{static hold} \\\\ ' +
      'F \\ge \\dfrac{m g + F_{\\text{pull}}}{2 \\mu} & \\text{handover} \\end{cases}'
    const set = [
      { id: 'b-text', type: 'text', text: 'The two load cases.' },
      { id: 'b-hard', type: 'math', tex: hard, caption: 'The two load cases.' },
      { id: 'b-after', type: 'text', text: 'And what follows from them.' },
    ]
    const read = s.validateSummaryBlocks(set)
    expect(read, 'a block set was cut down because one expression could not be drawn').toHaveLength(3)
    const math = read[1]
    if (math?.type !== 'math') throw new Error('expected a math block')
    // Character for character. A validator that tidied the source would silently change what the
    // equation says, which is worse than refusing to draw it.
    expect(math.tex, 'the expression was rewritten on the way in').toBe(hard)
    expect(math.caption).toBe('The two load cases.')
  })

  it('refuses a maths block with no expression at all, because that is a missing block', () => {
    // The other half of the rule above. Keeping what cannot be drawn is not the same as accepting
    // nothing: an empty expression renders as a gap in the middle of the page.
    const msg = rejection([{ id: 'b-empty', type: 'math', tex: '' }])
    expect(msg).toContain('summary block 0 (math)')
    expect(msg.toLowerCase()).toContain('tex')
  })
})
