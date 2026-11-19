// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY BLOCK PANELX SAYS IT CAN STORE IS A BLOCK PANELX DRAWS, AND EVERY WAY OF SETTING A PAGE IS
 * ONE A PERSON CAN CHOOSE.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO GAPS THIS FILE EXISTS TO CLOSE
 * ---------------------------------------------------------------------------------------
 *
 * 1. A BLOCK TYPE CAN BE DECLARED, VALIDATED, PUBLISHED AND NEVER DRAWN. tests/summary-schema.ts
 *    proves the write path accepts every type it lists, and tests/kinds-api.ts proves the schema
 *    publishes them. Nothing proved the renderer had an arm for one. The failure is quiet in the
 *    worst way: the block validates, it stores, and the reader gets "Block 3 not shown" on a page
 *    they cannot fix — the drawer's own honest refusal, standing in for the writing.
 *
 * 2. A PRESENTATION PROFILE CAN EXIST AND BE UNREACHABLE. Six times in this campaign something was
 *    built and connected to nothing, and green tests caught none of them. So the profiles are held
 *    to three things here: each has a block of tokens in the stylesheet, each such block declares
 *    ONLY tokens — the moment an ordinary declaration appears in one, a profile has become a second
 *    design rather than a set of values — and the control a reader chooses with is built from the
 *    same list, so a profile that exists is a profile that can be picked.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIXTURE IS KEYED BY BLOCK TYPE ON PURPOSE
 * ---------------------------------------------------------------------------------------
 *
 * `DRAWN` below has one entry per declared type and the test throws when a type has none, exactly
 * as tests/summary-schema.ts does for the write path. Adding a twenty-first block type therefore
 * fails here until somebody has drawn it and said what a reader should see.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE FIRST SENTENCE OF THIS FILE SAID UNTIL 28 AUGUST 2026, AND WHAT IT SAYS NOW
 * ---------------------------------------------------------------------------------------
 *
 * It said: EVERY BLOCK MOLE OFFICE SAYS IT CAN STORE IS A BLOCK MOLE OFFICE DRAWS. One rule, and a
 * declared type with no drawing failed by name.
 *
 * It now says: every block Mole Office can store is either drawn, or listed in `NOT_DRAWN_YET` and
 * visibly refused to the reader. Two ways to pass instead of one, and the second is written down
 * rather than left as silence.
 *
 * WHY IT CHANGED. A block type is built in more than one commit: the storage, the schema and the
 * region model land before the drawing does, and between those commits the type is real. The old
 * rule left two choices in that gap and both are bad — ship a half-drawing so a test goes green, or
 * hold the storage back until the whole thing is finished and lose the ability to build in steps.
 * The design for the composition block (design/problem-01/COMPOSITION-DESIGN.md, build order D and
 * F) puts them four commits apart on purpose.
 *
 * WHY THIS IS NOT THE CHECK BEING WEAKENED. The gap was always reachable; it was simply unnamed.
 * What the second way to pass demands is stricter than nothing in three respects: the type has to
 * be listed, with a reason and a date; the reader has to GET Mole Office's own visible refusal, which
 * is asserted here against real drawn markup; and the entry CLEARS ITSELF — the moment a renderer
 * lands, the refusal stops appearing and the assertion below goes red until the entry is moved into
 * `DRAWN`. The one thing it gives up is the `data-target` assertion, because a block with no
 * drawing has nothing on the page to point at, and that consequence is said out loud here rather
 * than discovered by somebody trying to leave a comment on one.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { readFileSync } from 'node:fs'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { LEAST_REM } from '../src/shared/beside.ts'
import { SUMMARY_BLOCK_TYPES, type SummaryBlock } from '../src/shared/types.ts'
import * as detail from '../src/shared/detail.ts'

type SummaryBlocksModule = typeof import('../src/web/components/SummaryBlocks.tsx')

let sb: SummaryBlocksModule

beforeAll(async () => {
  // The smallest stand-in that lets the browser modules load, as tests/report-document.ts uses.
  // The reading-style chooser reads and writes this store, so it is a real map rather than a stub
  // that forgets: a test that could not remember a choice could not tell a fault from a default.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  sb = await import('../src/web/components/SummaryBlocks.tsx')
})

/** The record these blocks pretend to be stored in, so every drawn thing can say where it is. */
const IN_RECORD = { recordId: 'rec-1', kind: 'report' }

/**
 * The record's own stored words. Passing them is what makes the component draw a REPORT rather
 * than a run of blocks, and the control above the writing is only on a report.
 */
const STORED = { title: 'A report', declaresShortForms: true }

/** The markup with the stylesheet taken out, so a class named in CSS is never the evidence. */
function draw(blocks: SummaryBlock[], layout?: string, asAReport = false): string {
  return renderToStaticMarkup(
    h(sb.SummaryBlocks, {
      blocks,
      inRecord: asAReport ? { ...IN_RECORD, stored: STORED } : IN_RECORD,
      ...(layout === undefined ? {} : { layout }),
    } as never),
  ).replace(/<style[\s\S]*?<\/style>/g, '')
}



/** The words a reader sees, with the markup taken out and the entities put back. */
function readable(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * ONE OF EVERY DECLARED BLOCK TYPE, AND WHAT A READER MUST SEE OF IT.
 *
 * `shows` is checked against the WORDS ON THE SCREEN rather than against the markup, because a
 * class name is not evidence that anybody can read anything. Where the point of a block is a piece
 * of markup — a table is a table, a grid holds the blocks it was given — `markup` says so.
 */
const DRAWN: Record<string, { block: SummaryBlock; shows: string[]; markup?: RegExp[] }> = {
  text: {
    block: { id: 'b-text', type: 'text', text: 'The shell cracked on the third print.' },
    shows: ['The shell cracked on the third print.'],
  },
  heading: {
    block: { id: 'b-heading', type: 'heading', text: 'What was measured' },
    shows: ['What was measured'],
  },
  finding: {
    block: { id: 'b-finding', type: 'finding', text: 'The mount holds calibration.', state: 'done' },
    shows: ['The mount holds calibration.'],
  },
  callout: {
    block: {
      id: 'b-callout',
      type: 'callout',
      tone: 'warning',
      title: 'The speed only latches on a fresh session',
      text: 'Re-sending it to a running session changes nothing, and nothing says so.',
    },
    // THE WORD IS THE TEST. A warning that is only a coloured edge is not a warning in the mono
    // theme, in greyscale, or to somebody who cannot tell two edges apart.
    shows: ['Warning', 'The speed only latches on a fresh session', 'Re-sending it to a running session'],
  },
  metrics: {
    block: { id: 'b-metrics', type: 'metrics', items: [{ id: 'm1', label: 'reprojection error', value: '0.4', unit: 'px' }] },
    shows: ['reprojection error', '0.4', 'px'],
  },
  keyvalue: {
    block: {
      id: 'b-kv',
      type: 'keyvalue',
      items: [
        { id: 'kv-machine', label: 'machine', value: 'build-box (192.0.2.17)' },
        { id: 'kv-commit', label: 'commit', value: '7a0a57c' },
      ],
    },
    shows: ['machine', 'build-box (192.0.2.17)', 'commit', '7a0a57c'],
  },
  list: {
    block: { id: 'b-list', type: 'list', items: ['first', 'second'] },
    shows: ['first', 'second'],
  },
  checklist: {
    block: {
      id: 'b-check',
      type: 'checklist',
      items: [
        { id: 'c1', text: 'The limit is re-sent on every fresh session', state: 'done' },
        { id: 'c2', text: 'The audit of silent failures', state: 'blocked', note: 'Waiting on the bench.' },
      ],
    },
    // The state is drawn as a word, not only as a colour, which is the chip's whole rule.
    shows: ['The limit is re-sent on every fresh session', 'Done', 'Blocked', 'Waiting on the bench.'],
  },
  code: {
    block: { id: 'b-code', type: 'code', code: 'npm test', language: 'bash' },
    shows: ['npm test'],
  },
  quote: {
    block: { id: 'b-quote', type: 'quote', text: 'Report tables are still not real tables.', source: 'the owner' },
    shows: ['Report tables are still not real tables.', 'the owner'],
  },
  path: {
    block: { id: 'b-path', type: 'path', label: 'The run log', path: `${THE_TEST_FIXTURE_ROOT}/run.txt` },
    shows: ['The run log', `${THE_TEST_FIXTURE_ROOT}/run.txt`],
  },
  // A FILE A REPORT CARRIES. Criterion R3. This one is a zip, so it is the FETCH drawing: a static
  // render runs no effect, and a text-like file would show only its asking state. The code drawing
  // is measured in tests/a-file-block-is-drawn-as-a-file.test.ts, in a browser.
  file: {
    block: {
      id: 'b-file',
      type: 'file',
      path: `${THE_TEST_FIXTURE_ROOT}/report-files/XyZ789.zip`,
      name: 'project-archive.zip',
      size: 20_480,
      hash: '0a1b2c3d4e5f6071',
    },
    // A person reads the name and the size; the hash and the path are drawn in developer mode only
    // (wave 13s round 12).
    shows: ['project-archive.zip', '20.5 kB'],
    markup: [/sb-file-open/],
  },
  // A SOUND AND A FILM THE REPORT PLAYS. A static render runs no effect, so
  // the person's media choice has not been read and the player is not drawn: what is asserted here
  // is the file's name and size and the block saying what it plays. Playing is measured in a browser,
  // in tests/a-report-plays-its-audio-and-video.test.ts.
  audio: {
    block: {
      id: 'b-audio',
      type: 'audio',
      path: `${THE_TEST_FIXTURE_ROOT}/report-files/Vo1ce5ample.wav`,
      name: 'voice-sample-zh.wav',
      size: 1_764_044,
      hash: '5b0e7c21d9a4f316',
      alt: 'A woman reads the opening line in Chinese.',
    },
    shows: ['voice-sample-zh.wav', '1.8 MB', 'A woman reads the opening line in Chinese.'],
    markup: [/data-media="audio"/],
  },
  video: {
    block: {
      id: 'b-video',
      type: 'video',
      path: `${THE_TEST_FIXTURE_ROOT}/report-files/SampleF1lm0.webm`,
      name: 'sample-film.webm',
      size: 4_194_304,
      hash: 'a41c07e9b2d85f60',
      alt: 'A robot arm puts a red cube in a box.',
    },
    shows: ['sample-film.webm', '4.2 MB', 'A robot arm puts a red cube in a box.'],
    markup: [/data-media="video"/],
  },
  // A TEST WORLD IN A HANDBACK. Criterion C31. Whether it is up is read from the ledger when the
  // page draws, so what is asserted here is what the block itself says: what to look at, why, and
  // the address the press goes to.
  world: {
    block: {
      id: 'b-world',
      type: 'world',
      label: 'The check panel on a run that was refused',
      web: 'http://127.0.0.1:41573',
      because: 'Whether the words on the five standings are the ones the owner wants a reader to see.',
    },
    shows: [
      'The check panel on a run that was refused',
      // Server rendering has not yet measured which interface the reader arrived on.
      'Address unknown',
      'http://127.0.0.1:41573',
      'Whether the words on the five standings',
    ],
  },
  chart: {
    block: {
      id: 'b-chart',
      type: 'chart',
      spec: {
        kind: 'line',
        x: { label: 'effort' },
        y: { label: 'grip force', unit: 'N' },
        series: [{ id: 's1', name: 'v3 shell', points: [{ x: 12, y: 11.2 }, { x: 18, y: 19.4 }] }],
      },
      caption: 'Three prints.',
    },
    shows: ['Three prints.'],
    markup: [/<svg/],
  },
  math: {
    block: { id: 'b-math', type: 'math', tex: 'F = ma', caption: 'Newton.' },
    shows: ['Newton.'],
  },
  table: {
    block: {
      id: 'b-table',
      type: 'table',
      columns: [{ label: 'effort' }, { label: 'force (N)', align: 'right' }],
      rows: [{ cells: ['12', 11.2] }],
    },
    shows: ['effort', 'force (N)'],
    markup: [/<table/, /<td[^>]*>11.2/],
  },
  timeline: {
    block: {
      id: 'b-timeline',
      type: 'timeline',
      items: [
        { id: 't1', when: '14 August, morning', text: 'The third print cracked.', state: 'failed' },
        { id: 't2', when: 'after the driver was rolled back', text: 'Forty handovers, none lost.', detail: 'Error under 0.5 px.' },
      ],
    },
    // The "when" is kept exactly as written, including the one that is not a date at all.
    shows: ['14 August, morning', 'The third print cracked.', 'after the driver was rolled back', 'Error under 0.5 px.'],
  },
  image: {
    block: { id: 'b-image', type: 'image', path: `${THE_TEST_FIXTURE_ROOT}/grip.png`, alt: 'The gripper holding the cube' },
    // The picture's own description. Its path is drawn in developer mode only (wave 13s round 12).
    shows: ['The gripper holding the cube'],
  },
  section: {
    block: {
      id: 'b-section',
      type: 'section',
      title: 'What was measured',
      blocks: [{ id: 'b-in-section', type: 'text', text: 'Forty handovers.' }],
    },
    shows: ['What was measured', 'Forty handovers.'],
  },
  beside: {
    block: {
      id: 'b-beside',
      type: 'beside',
      parts: [
        {
          id: 'p-words',
          share: 3,
          measure: 'narrow',
          blocks: [{ id: 'pw', type: 'text', text: 'The mast moved 4mm under load.' }],
        },
        { id: 'p-shot', share: 2, blocks: [{ id: 'ps', type: 'image', path: `${THE_TEST_FIXTURE_ROOT}/mast.png`, alt: 'the mast' }] },
      ],
    },
    shows: ['The mast moved 4mm under load.', 'the mast'],
    // WHAT THE REPORT ASKED FOR AND WHAT MOLE OFFICE MADE OF IT, both on the element and neither
    // instead of the other. The measure is on the PART and the stylesheet applies it to the blocks
    // inside; there is no width anywhere in the markup, which is the whole point of the layer.
    markup: [
      /class="sb-block sb-beside"/,
      /data-parts="2"/,
      /data-share-by="the report"/,
      /class="sb-beside-part"[^>]*data-asked="3"[^>]*data-share="3"/,
      /--sb-measure/,
    ],
  },
  columns: {
    block: {
      id: 'b-columns',
      type: 'columns',
      columns: [
        [{ id: 'b-left', type: 'text', heading: 'Before', text: 'The mast moved.' }],
        [{ id: 'b-right', type: 'text', heading: 'After', text: 'The mast holds.' }],
      ],
    },
    shows: ['Before', 'The mast moved.', 'After', 'The mast holds.'],
  },
  grid: {
    block: {
      id: 'b-grid',
      type: 'grid',
      across: 3,
      blocks: [
        { id: 'g1', type: 'image', path: `${THE_TEST_FIXTURE_ROOT}/one.png`, alt: 'the first shot' },
        { id: 'g2', type: 'image', path: `${THE_TEST_FIXTURE_ROOT}/two.png`, alt: 'the second shot' },
      ],
    },
    shows: ['the first shot', 'the second shot'],
    markup: [/data-across="3"/],
  },
  tabs: {
    block: {
      id: 'b-tabs',
      type: 'tabs',
      tabs: [
        { id: 'tab-thor', label: 'thor', blocks: [{ id: 'tb1', type: 'text', text: 'Ran clean, 40 of 40.' }] },
        { id: 'tab-yumi', label: 'yumi', blocks: [{ id: 'tb2', type: 'text', text: 'Stopped at run 12.' }] },
      ],
    },
    // Both labels are on the screen — a reader has to be able to see what else there is — and only
    // the open tab's writing is. What is behind an unopened tab is not on the page, and this pins
    // that, because a page that drew it hidden would let a comment point at unseen words.
    shows: ['thor', 'yumi', 'Ran clean, 40 of 40.'],
    markup: [/role="tab"/],
  },
  // THE QUESTIONS A REPORT ASKS THE PERSON. Drawn here with
  // no report page around them, so their controls are off and they say where answers are kept.
  // Proved on 2 October 2026 by taking the choice arm out of Block(): the choice then drew the refusal
  // and carried no data-target, and two cases here went red.
  choice: {
    block: {
      id: 'b-choice',
      type: 'choice',
      question: 'Which glaze goes on the spring bowls?',
      options: [
        { id: 'a', label: 'The celadon', recommended: true },
        { id: 'b', label: 'The tenmoku' },
      ],
    },
    shows: ['Which glaze goes on the spring bowls?', 'The celadon', 'The tenmoku', 'Recommended'],
    markup: [/type="radio"/],
  },
  fillin: {
    block: { id: 'b-fillin', type: 'fillin', asks: 'How many bowls fit on one shelf?', lines: 'many' },
    shows: ['How many bowls fit on one shelf?'],
    markup: [/<textarea/],
  },
  button: {
    block: { id: 'b-button', type: 'button', label: 'Start the firing' },
    shows: ['Start the firing'],
    markup: [/class="px-btn"/],
  },
  box: {
    block: {
      id: 'b-box',
      type: 'box',
      title: 'The firing',
      blocks: [{ id: 'bx-fillin', type: 'fillin', asks: 'Which shelf goes in first?' }],
    },
    // A BOX HAS NO SUBMIT OF ITS OWN: one send press for the whole report, in wave 13u round
    // 19. This entry said the box drew its foot, class "rq-box-foot",
    // with the line "Answers are kept only on the report's own page." Drawn away from the report's
    // page, a box now draws its title and its questions, as a question in no box always did.
    shows: ['The firing', 'Which shelf goes in first?'],
    markup: [/class="rq-box-body"/],
  },
}

/**
 * A TYPE THIS BUILD CAN STORE AND CANNOT YET DRAW, with a date and a reason.
 *
 * EMPTY IS THE NORMAL STATE OF THIS TABLE. An entry is a promise to a reader that they will get
 * Mole Office's own refusal rather than a blank space, and the test below holds this build to it
 * against real markup. It is not an excuse list: nothing here passes quietly, and the entry has to
 * be taken out again the moment the drawing exists, because the refusal it asserts stops appearing.
 */
const NOT_DRAWN_YET: Partial<Record<string, { block: SummaryBlock; because: string }>> = {}

describe('every block type Mole Office will store is one it draws, or one it visibly refuses', () => {
  it('has a drawing and a reader-visible result for every declared type', () => {
    for (const type of SUMMARY_BLOCK_TYPES) {
      const entry = DRAWN[type]
      if (entry === undefined) {
        if (NOT_DRAWN_YET[type] !== undefined) continue
        throw new Error(`${type} is a declared block type with no drawing here — add one, do not delete the type`)
      }
      const html = draw([entry.block])
      expect(html, `${type} drew Mole Office's own refusal instead of the block`).not.toContain('sb-fail')
      const text = readable(html)
      for (const words of entry.shows) {
        expect(text, `a reader cannot see "${words}" on a drawn ${type}`).toContain(words)
      }
      for (const pattern of entry.markup ?? []) {
        expect(html, `a drawn ${type} has nothing matching ${String(pattern)}`).toMatch(pattern)
      }
    }
  })

  /**
   * A TYPE THAT IS STORED AND NOT DRAWN GIVES THE READER MOLE OFFICE'S OWN REFUSAL, IN WORDS.
   *
   * This is the other half of the rule, and it is what stops `NOT_DRAWN_YET` being a place to hide.
   * It also clears itself: when the drawing lands, the refusal stops appearing and this goes red
   * until the entry moves into `DRAWN` above. A type in both tables is refused here as well, since
   * that would be two answers to one question.
   */
  it('says so on the page for a type it stores and cannot draw', () => {
    for (const [type, entry] of Object.entries(NOT_DRAWN_YET)) {
      if (entry === undefined) continue
      expect(DRAWN[type], `${type} is listed as not drawn yet and also has a drawing`).toBeUndefined()
      const html = draw([entry.block])
      expect(html, `a stored ${type} drew nothing at all rather than Mole Office's refusal`).toContain('sb-fail')
      const text = readable(html)
      expect(text, `the refusal for a ${type} does not name the type, so a reader cannot say what is missing`).toContain(
        type,
      )
      expect(text, `the refusal for a ${type} does not say this build has no renderer for it`).toContain(
        'no renderer for it',
      )
    }
  })

  /**
   * WHAT IS BEHIND AN UNOPENED TAB IS NOT ON THE PAGE. The honest half of what a tab is: hidden
   * markup would let somebody's comment be anchored to words nobody could see, and the page would
   * then claim they had pointed at something on their screen.
   */
  it('draws only the open tab, and says what the others are called', () => {
    const text = readable(draw([DRAWN['tabs']?.block as SummaryBlock]))
    expect(text).toContain('Ran clean, 40 of 40.')
    expect(text, 'a closed tab put its writing on the page').not.toContain('Stopped at run 12.')
  })

  /**
   * EVERY BLOCK SAYS WHAT IT IS, so a person can point at it without the component opting in.
   * `data-target` on the block itself is what the one document-level listener walks up to find.
   */
  it('marks every block with what it is, from the type alone', () => {
    for (const type of SUMMARY_BLOCK_TYPES) {
      // A type with no drawing has nothing on the page to point at. The test above is what holds
      // this build to telling the reader so; there is no `data-target` to assert on a refusal.
      if (NOT_DRAWN_YET[type] !== undefined) continue
      const entry = DRAWN[type]
      if (entry === undefined) throw new Error(`${type} has no drawing in this file`)
      expect(draw([entry.block]), `a ${type} block carries no data-target`).toContain(
        `data-target="reportBlock/rec-1/${entry.block.id}"`,
      )
    }
  })

  /**
   * A CONTAINER USES THE ONE BLOCK RENDERER, one level down, and does not draw content itself.
   *
   * The test is a table inside each container: a table is the most machinery any block has, so a
   * container that had grown a second, simpler drawing of its children would show it here as a
   * paragraph of pipes or as nothing at all.
   */
  it('draws the same table inside every container as it draws outside one', () => {
    const table: SummaryBlock = {
      id: 'b-inner-table',
      type: 'table',
      columns: [{ label: 'run' }, { label: 'error', align: 'right' }],
      rows: [{ cells: ['before', 0.4] }],
    }
    const containers: SummaryBlock[] = [
      { id: 'b-s', type: 'section', title: 'inside a section', blocks: [table] },
      { id: 'b-c', type: 'columns', columns: [[table], [{ id: 'b-other', type: 'text', text: 'beside it' }]] },
      { id: 'b-g', type: 'grid', blocks: [table] },
      { id: 'b-t', type: 'tabs', tabs: [
        { id: 'tab-1', label: 'the table', blocks: [table] },
        { id: 'tab-2', label: 'nothing', blocks: [{ id: 'b-empty-ish', type: 'text', text: 'nothing here' }] },
      ] },
    ]
    for (const container of containers) {
      const html = draw([container])
      expect(html, `a table inside a ${container.type} is not drawn as a table`).toMatch(/<table/)
      expect(readable(html), `a table inside a ${container.type} lost its heading`).toContain('run')
      expect(html, `a ${container.type} refused what it holds`).not.toContain('sb-fail')
    }
  })

  /**
   * THE WORDS OF A NEW BLOCK SAY WHERE THEY ARE STORED, which is what makes a passage of one
   * quotable. The path is spelled the way the server's reader and the change log spell one — by id
   * where every item has one — so the browser and the server cannot disagree about what a field is
   * called.
   */
  it('says which stored string each new kind of item drew its words from', () => {
    const cases: { block: SummaryBlock; fields: string[] }[] = [
      { block: DRAWN['callout']?.block as SummaryBlock, fields: ['data.blocks[#b-callout].text', 'data.blocks[#b-callout].title'] },
      { block: DRAWN['keyvalue']?.block as SummaryBlock, fields: ['data.blocks[#b-kv].items[#kv-machine].label', 'data.blocks[#b-kv].items[#kv-machine].value'] },
      { block: DRAWN['checklist']?.block as SummaryBlock, fields: ['data.blocks[#b-check].items[#c1].text', 'data.blocks[#b-check].items[#c2].note'] },
      { block: DRAWN['timeline']?.block as SummaryBlock, fields: ['data.blocks[#b-timeline].items[#t1].when', 'data.blocks[#b-timeline].items[#t2].detail'] },
    ]
    for (const one of cases) {
      const html = draw([one.block])
      for (const field of one.fields) {
        expect(html, `nothing on a drawn ${one.block.type} says it came from ${field}`).toContain(
          `data-text-field="${field}"`,
        )
      }
    }
  })

  /** And a run of blocks nobody stored claims nothing at all. Absence is the honest state. */
  it('claims no storage for blocks that are not in a record', () => {
    const html = renderToStaticMarkup(
      h(sb.SummaryBlocks, { blocks: [DRAWN['checklist']?.block as SummaryBlock] } as never),
    )
    expect(html).not.toContain('data-target=')
    expect(html).not.toContain('data-text-field=')
  })
})

/**
 * A COMPARISON AND A COMPOSITION ARE ONE MECHANISM, AND THIS IS WHAT WOULD CATCH A SECOND ONE.
 *
 * A `columns` block and a `beside` block both put blocks side by side. Until 29 August 2026 they
 * did it two different ways: a composition asked each part what it held and stacked when the floors
 * stopped fitting, while a comparison switched between one, two, three and four equal tracks at a
 * fixed 30, 45 or 60rem whatever its columns held. There is now one mechanism.
 *
 * WHAT WENT WRONG WITH THE FIXED THRESHOLD, MEASURED. On report ulbs6FHMndo2 at 1440 a two-column
 * block inside a 573px part of a composition drew columns of 277.5px each — the stylesheet's own
 * comment said two 180px columns are not a comparison, and nothing was checking. It stacks there
 * now, because two columns of writing need 20rem each.
 *
 * THE THREE THINGS ASSERTED, AND WHY EACH ONE IS NOT VACUOUS. The first reads the resolved
 * stylesheet and requires the rule that decides stacking to name both a part and a column, so a
 * second set of declarations for columns would go red. The second requires the width a comparison
 * used to ask for to be gone from the source, which is the fault the fold removed. The third draws
 * three comparisons whose columns hold different things and checks the width each stacks below is
 * the floors of what it holds — a build that went back to a fixed threshold could not produce three
 * different answers.
 */
describe('a comparison is drawn by the same mechanism as a composition', () => {
  const source = readFileSync(new URL('../src/web/components/SummaryBlocks.tsx', import.meta.url), 'utf8')

  it('lays a column out in the same rule that lays a part of a composition out', () => {
    // The declaration that decides when a row stacks is the one that decides how it is arranged.
    // Both selectors have to sit on it, or the two arrangements are two mechanisms again.
    const rule = /([^{}]*)\{[^{}]*flex-basis:\s*calc\(\(var\(--row-least\) - 100%\) \* 999\)/.exec(sb.SUMMARY_CSS)
    expect(rule, 'no rule in the stylesheet lays a row of parts out at all').not.toBeNull()
    expect(rule?.[1], 'a composition part is not laid out by this rule').toContain('.sb-beside-part')
    expect(rule?.[1], 'a column of a comparison is laid out somewhere else').toContain('.sb-column')
  })

  it('has no width of its own for a comparison, and no track list decided by a column count', () => {
    expect(source, 'the width a comparison asks for is declared in the stylesheet again').not.toContain('lane-need')
    expect(sb.SUMMARY_CSS, 'the number of columns still decides something in CSS').not.toMatch(
      /\.sb-columns\[data-columns/,
    )
  })

  /**
   * The stacking width is `--row-least` on the row, in rem, and the renderer writes it from the
   * floors of what each column holds. 40rem for two columns of writing, 30rem for three pictures,
   * 35rem for a table beside a paragraph. None of those three numbers is written here: they are
   * added up from LEAST_REM, which is the one place a floor is declared.
   */
  it('stacks a comparison below the floors of what its columns hold, and says so on the row', () => {
    const text = (id: string): SummaryBlock => ({ id, type: 'text', text: 'The mast moved 4mm under load.' })
    const shot = (id: string): SummaryBlock => ({ id, type: 'image', path: `${THE_TEST_FIXTURE_ROOT}/${id}.png`, alt: id })
    const grid = (id: string): SummaryBlock => ({
      id,
      type: 'table',
      columns: [{ label: 'run' }],
      rows: [{ cells: [1] }],
    })
    const cases: { what: string; block: SummaryBlock; leasts: string[]; rem: number }[] = [
      {
        what: 'two columns of writing',
        block: { id: 'b-w', type: 'columns', columns: [[text('w1')], [text('w2')]] },
        leasts: ['sentence', 'sentence'],
        rem: LEAST_REM.sentence * 2,
      },
      {
        what: 'three columns of pictures',
        block: { id: 'b-p', type: 'columns', columns: [[shot('p1')], [shot('p2')], [shot('p3')]] },
        leasts: ['figure', 'figure', 'figure'],
        rem: LEAST_REM.figure * 3,
      },
      {
        what: 'a table beside a paragraph',
        block: { id: 'b-m', type: 'columns', columns: [[grid('m1')], [text('m2')]] },
        leasts: ['panel', 'sentence'],
        rem: LEAST_REM.panel + LEAST_REM.sentence,
      },
    ]
    for (const one of cases) {
      const html = draw([one.block])
      // The control: something was drawn, so an empty render cannot pass the checks below.
      expect(html, `${one.what} drew nothing`).toContain('sb-columns')
      expect(html, `${one.what} does not say the width it stops fitting at`).toContain(
        `--row-least:calc(${String(one.rem)}rem + ${String(one.leasts.length - 1)} * var(--sb-gut))`,
      )
      const seen = [...html.matchAll(/class="sb-column" data-least="([a-z]+)"/g)].map((m) => m[1])
      expect(seen, `${one.what} does not say what each of its columns holds`).toEqual(one.leasts)
      expect(html, `${one.what} was drawn from a track list`).not.toContain('grid-template-columns')
    }
  })
})

describe('a presentation profile is a set of tokens a reader can choose', () => {
  /** The declarations inside one profile's own CSS block, or the empty string when it has none. */
  function tokensOf(profile: string): string {
    return new RegExp(`\\.sb\\[data-profile="${profile}"\\]\\s*\\{([^}]*)\\}`).exec(sb.SUMMARY_CSS)?.[1] ?? ''
  }

  /**
   * THE PAGE PROFILE DECLARES NO WIDTH AND MUST NOT GROW ONE. The reading measure is `--read`,
   * declared once in tokens.css. A profile that set it would be the six declarations coming back.
   */
  it('lets neither profile declare a width of its own', () => {
    for (const profile of sb.BLOCKS_PROFILES) {
      expect(tokensOf(profile.id), `${profile.id} declares a width of its own`).not.toContain('--read')
    }
  })

  it('draws the chosen style onto the blocks themselves', () => {
    for (const profile of sb.BLOCKS_PROFILES) {
      const html = draw([DRAWN['text']?.block as SummaryBlock], profile.id)
      expect(html, `nothing on the page says it is set as ${profile.id}`).toContain(`data-profile="${profile.id}"`)
      // A profile that owns its width takes the page's own maximum; a panel's summary does not.
      expect(html.includes('sb sb-doc'), `${profile.id} draws as the wrong kind of thing`).toBe(profile.ownsWidth)
    }
  })

  /**
   * AND IT IS A THING A PERSON CAN ACTUALLY PRESS. This is the defect this campaign has found six
   * times: something implemented, nothing wired to it.
   *
   * THIS USED TO NAME THE FOUR PRESETS. They were removed, so what a report offers
   * above the writing is one level control, and the label it draws
   * says which level the report is being read at.
   */
  it('offers the level control above the writing, and no text size of its own', () => {
    const page = draw([DRAWN['text']?.block as SummaryBlock], 'page', true)
    const words = readable(page)
    expect(page, 'a report offers no level control above the writing').toContain('class="sb-level"')
    // THE LABEL IS THE RUNG THE PAGE ACTUALLY OPENS A REPORT AT, WORKED OUT THE WAY THE PAGE WORKS
    // IT OUT, and not a rung named here. This line read `levelLabel('full')` and was true while
    // nothing set meant Full. It went red on the owner's act 3a of 15 September 2026, which made
    // `DETAIL_DEFAULTS.reportContent` the authored summary line and let criterion A19's floor raise a
    // report from there to the conclusion. It went red again on the owner's
    // act of 16 September 2026, which puts a report's opening back at Full.
    // The owner kept the surface's level-2 default for modules.
    // Naming the rung here would move the same brittleness one act along, so the expectation asks
    // the same three things the page asks: what this surface says when nobody has said otherwise,
    // which kind is being drawn, and where the floor applies.
    expect(words, 'the control says nothing about the level this report is being read at')
      .toContain(detail.levelLabel(detail.rungFor(detail.FLOORED_SURFACE, detail.FLOORED_KIND).rung))
    // AND NO SECOND TEXT SIZE. The appearance bar has one, with these three words on it. A report
    // growing its own would be two controls with one name, which is the defect at the top of
    // CLAUDE.md wearing a preference.
    for (const word of ['Small', 'Default', 'Large']) {
      expect(words, `the report grew a text size of its own, offering ${word}`).not.toContain(word)
    }
  })

  /**
   * THE TWO AXES MAY NOT FUSE. A reading style says how writing is SET; the detail axis says how
   * much of it there IS. `Compact` was on both at once until this step: a density word offered as a
   * reading style. This is the test that stops the next one arriving.
   */
  it('never names a reading style after a position on the detail axis', () => {
    const axis = new Set<string>()
    for (const rung of detail.RUNGS) {
      const spec = detail.RUNG_SPECS[rung]
      axis.add(rung.toLowerCase())
      axis.add(spec.noun.toLowerCase())
      for (const word of spec.phrase.toLowerCase().split(/[^a-z]+/)) if (word.length > 3) axis.add(word)
    }
    // The word the appearance bar owns. It was a reading style until this step and it is the case
    // that produced this test, so it is named rather than left to the loop above to imply.
    axis.add('compact')
    for (const profile of sb.BLOCKS_PROFILES) {
      expect(axis.has(profile.id.toLowerCase()), `the profile id "${profile.id}" is a word on the detail axis`)
        .toBe(false)
      expect(axis.has(profile.name.toLowerCase()), `the profile name "${profile.name}" is a word on the detail axis`)
        .toBe(false)
    }
  })
})
