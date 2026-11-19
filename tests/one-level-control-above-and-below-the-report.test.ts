// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE LEVEL CONTROL, DRAWN ABOVE THE REPORT AND AGAIN BELOW IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE HOLDS
 * ---------------------------------------------------------------------------------------
 *
 * A report used to carry two different controls over one value: four presets above the writing
 * (*All of it*, *The argument*, *Words only*, *The conclusion*) and a numbered control at the foot
 * drawing `1 2 3 4 5 6 Full`. A reader could not tell what the presets meant, or how they related
 * to level 1 through Full.
 *
 * So there is one control, above the report and below it:
 *
 *   a minus and a plus on its left and right set the level; the pictures button needs no word and turns
 *   blue when pressed; the levels between Full and Conclusion read "Level n", and only Full and Conclusion
 *   are words; the label keeps enough room that changing the level never changes the size of the control.
 *
 * Criterion A12 of `design/pointing-reopened/ACCEPTANCE.md`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT EACH HALF OF THIS FILE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * THE RENDER TESTS say what is drawn: the label at each of the seven positions, two instances with
 * two declared names, the ends of the ladder disabled, and a pictures button with no words on it.
 *
 * A READER'S SHORT END MOVED ON 3 SEPTEMBER 2026 and this file moved with it. Criterion A19: the
 * control runs Full, Level 6, Level 5, Level 4, Conclusion, and minus is disabled at Conclusion. The
 * seven rungs are still declared and the label is still written and served; two of them are not a
 * reader's to stand on. `tests/a-reader-goes-no-lower-than-conclusion.test.ts` is that criterion's
 * own file; what changed here is which positions these cases walk.
 *
 * THE BROWSER TESTS say four things no render can. Section 5: the buttons are wired to the value
 * they claim to set — something implemented with nothing wired to it is the defect this project
 * keeps finding, and it passes every render test. Section 6: nothing on the page changes size when
 * the level changes, which is the half of A12 the owner stated in their own words and the half that
 * lived only in a stylesheet. Section 7: the words of a form in the *Shorter forms* panel are as
 * wide as the report's own prose, which is criterion A13 — the test that existed for it asserted
 * that a class name was absent from the markup, and a `max-width` written straight into the rule
 * would have left it green. Section 8: right-clicking either control opens a composer that says
 * which of the two it was.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT PROVE THESE ARE NOT DECORATION
 * ---------------------------------------------------------------------------------------
 *
 *   make `levelLabel` return `positionLabel` again → the seven-label test goes red.
 *   give both instances the same surface id → the two-names test goes red.
 *   drop the `disabled` from the minus button → the ends test goes red.
 *   put the words back on the pictures button → the no-words test goes red.
 *   have minus write `stepFrom(rung, 1)` → the browser test goes red on the first press.
 *   delete `width: 7rem` from `.sb-level-label` → section 6 goes red: the control in the foot is
 *     146.6px wide at five levels and 173.1px at Conclusion.
 *   spread `declaredAttributes(declares)` on `.sb-level` again → section 8 goes red: the chip reads
 *     `Part of Mole Office's own screen / Full` for both controls.
 *   drop the `uiSurface` branch from `wordOnTheChip` → section 8 goes red the other way: the chip
 *     reads `Part of Mole Office's own screen / “Full”` for both.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import {
  asReaderRung,
  DETAIL_KEY_EVERYWHERE,
  detailKeyForHere,
  levelLabel,
  nearestOffered,
  OFFERED_TO_A_READER,
  positionLabel,
  READER_FLOOR,
  READER_RUNGS,
  readerStepFrom,
  RUNGS,
  stepFrom,
  type Rung,
} from '../src/shared/detail.ts'
import { SURFACES } from '../src/shared/surfaces.ts'
import type { SummaryBlock } from '../src/shared/types.ts'

type SummaryBlocksModule = typeof import('../src/web/components/SummaryBlocks.tsx')
let sb: SummaryBlocksModule

const store = new Map<string, string>()

/** Enough of a report that the page is a page, and one block that is not prose. */
// A REPORT LONG ENOUGH TO HAVE EVERY POSITION ON THE LADDER. A record whose own words are already
// as short as one of the reading levels has no levels above that one, since 5 September 2026, so
// three short lines would give the control two positions and this file would be about the length
// rule rather than about the two controls moving one stored choice.
const BLOCKS: SummaryBlock[] = [
  { id: 'b-open', type: 'text', text: 'Three of four printed wrist mounts broke below the load the trials need.' },
  { id: 'b-part', type: 'heading', text: 'What is still open' },
  { id: 'b-work', type: 'text', text: 'Nobody has pulled the aluminium mount, because the blanks are not bought.' },
  {
    id: 'b-long',
    type: 'text',
    text:
      'Four printed clamp mounts were pulled to failure on the bench jig over two afternoons. Three broke at ' +
      'the thin section behind the bolt circle, at 14.2, 15.1 and 15.4 newtons. The transplant trials need ' +
      'twenty newtons and the margin the rig asks for is another five, so the printed part cannot be used for ' +
      'them at all and the print queue for it has been stopped. The fourth sample held to 22 newtons; it had ' +
      'been printed at half the layer height, which was a mistake in the queue rather than a decision anybody ' +
      'made, and nobody has repeated it. One sample is not a finding and it is written down here so that the ' +
      'number is not read as one. An aluminium mount of the same geometry has been ordered.',
  },
]

// THE REPORT AS THE RESOLVER SEES IT. `body` is what says this record holds blocks, and the three
// rungs written by part need it: a part names the blocks it covers, so a record with none has no
// levels 4 to 6. It carries no `ownWords` because nothing counted this record's own length, and
// then `rungsFor` takes no rung away for length — which is what keeps this file about the control's
// stepping rather than about how long a report is.
//
// A TITLE, A SUMMARY, A LABEL AND ONE PART, since 15 September 2026. The owner's act of that day (criterion
// A14a as amended) takes a level nobody wrote off the reader's control, so a fixture with no parts
// would offer only Conclusion and Full and this file's walk across the five would be about the
// narrowing instead of about the control. The words at every level are what make it a page a reader
// can walk; which words they are is what the other files hold.
const STORED = {
  title: 'Wrist mount pull test, round eight',
  summary: 'Three of four printed mounts broke below the trial load, so only the aluminium one is worth another run.',
  declaresShortForms: true,
  shortForms: {
    label: { text: 'Wrist mounts broke', madeFrom: { seq: 1, contentHash: 'aaaa' }, writtenBy: 'agent' },
    parts: {
      madeFrom: { seq: 1, contentHash: 'aaaa' },
      writtenBy: 'agent',
      parts: [
        {
          id: 'p-1',
          heading: 'What the pull test showed',
          text30: 'Three of four printed mounts broke below the load the trials need.',
          text120:
            'Three of four printed clamp mounts broke at the thin section behind the bolt circle, below the load the transplant trials need.',
          covers: ['b-open', 'b-part'],
        },
        {
          id: 'p-2',
          heading: 'The aluminium mount is next',
          text30: 'Nobody has pulled it yet; the blanks are not bought.',
          text120: 'Nobody has pulled the aluminium mount because the blanks are not bought; it is the only candidate left.',
          covers: ['b-work', 'b-long'],
        },
      ],
    },
  },
  body: { field: 'data.blocks', written: true },
}

beforeAll(async () => {
  // THE SHIM GOES FIRST. `SummaryBlocks.tsx` reads `window` while it is being imported, so a plain
  // import at the top of this file would throw before any test ran.
  const shim = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    // BACKED BY THE SAME MAP AS localStorage ABOVE, and it was a no-op stub until now. It was
    // written when whether a report's pictures are drawn lived in localStorage; criterion U5
    // removed that durable key, because NOTHING WROTE IT, and the per-visit key in sessionStorage
    // is what the toggle really writes and reads. A stub that always answers null would make this
    // file's picture cases pass whatever the product did.
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    location: { hash: '', pathname: '/', search: '' },
    matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }
  ;(globalThis as unknown as { window: unknown }).window = shim
  ;(globalThis as unknown as { localStorage: unknown }).localStorage = shim.localStorage
  ;(globalThis as unknown as { sessionStorage: unknown }).sessionStorage = shim.sessionStorage
  sb = await import('../src/web/components/SummaryBlocks.tsx')
}, 60_000)

/** The report as a reader meets it, at one position on the ladder. */
function page(rung: Rung): string {
  return renderToStaticMarkup(
    h(sb.SummaryBlocks, {
      blocks: BLOCKS,
      layout: 'page',
      drawAt: rung,
      // NULL IS THE HONEST ANSWER HERE: this file has not read the record's links, so it announces
      // no tree rather than a shorter one. See `BlocksInRecord.wholeRecord`.
      inRecord: { recordId: 'rec-1', kind: 'report', stored: STORED, wholeRecord: null },
    }),
  ).replace(/<style[\s\S]*?<\/style>/g, '')
}

/** Every level control on the page, in the order it was drawn, as raw markup. */
function controls(html: string): string[] {
  return [...html.matchAll(/<div class="sb-level"[\s\S]*?<\/svg><\/button><\/div>/g)].map((one) => one[0])
}

/** What the label on one control reads. */
function labelOf(control: string): string {
  return /<span class="sb-level-label"[^>]*>([^<]*)<\/span>/.exec(control)?.[1] ?? ''
}

// ============================================================ 1. what the label reads

describe('the label names the level, in words at the two ends and by number between them', () => {
  it('reads Full, Level 6, Level 5, Level 4, Conclusion, Level 2, Level 1 down the ladder', () => {
    const said = [...RUNGS].reverse().map((rung) => levelLabel(rung))
    expect(said).toEqual(['Full', 'Level 6', 'Level 5', 'Level 4', 'Conclusion', 'Level 2', 'Level 1'])
  })

  /**
   * ON A REPORT THE LABEL READS THE NEAREST OFFERED POSITION. On
   * 16 September 2026 the decision said the control offers exactly Conclusion, Level 6 and Full, so a kept choice of
   * Level 4 or Level 5 is shown at the nearest of those three without the stored choice being
   * touched. A module is not floored and keeps its own label at every one of the seven.
   */
  it('draws the nearest offered label on a report, and its own label at every position on a module', () => {
    for (const rung of RUNGS) {
      const drawn = controls(page(rung))
      expect(drawn.length, `the control is not drawn twice at ${rung}`).toBe(2)
      for (const one of drawn) {
        expect(labelOf(one), `the label at ${rung}`).toBe(levelLabel(nearestOffered(rung)))
        if (nearestOffered(rung) !== rung) {
          expect(one, `the label at ${rung} does not say what was stored`).toContain(
            `Stored at ${levelLabel(rung)}, shown at ${levelLabel(nearestOffered(rung))}.`,
          )
        }
      }
    }
  })

  /**
   * THE NUMERAL IS THE SETTINGS GRID'S OWN NUMERAL AND IS NOT COUNTED AGAIN. A second count of a
   * position would let the control say Level 5 where the grid's column header says 6.
   */
  it('takes the number from the one place a position’s number is decided', () => {
    for (const rung of RUNGS) {
      if (rung === 'full' || rung === 'gist') continue
      expect(levelLabel(rung), `${rung} is numbered twice`).toBe(`Level ${positionLabel(rung)}`)
    }
  })
})

// ============================================================ 2. drawn twice, named twice

describe('the control is drawn twice and the two places have two names', () => {
  it('draws one above the writing and one in the foot', () => {
    const html = page('outline')
    const drawn = controls(html)
    expect(drawn.length, 'the control is not drawn twice').toBe(2)
    // THE SECOND ONE IS INSIDE THE FOOT AND THE FIRST IS NOT.
    const foot = html.indexOf('<div class="sb-foot">')
    expect(foot, 'the report drew no foot at all').toBeGreaterThan(-1)
    expect(html.indexOf(drawn[0] ?? ''), 'the first control is inside the foot').toBeLessThan(foot)
    expect(html.indexOf(drawn[1] ?? ''), 'the second control is not in the foot').toBeGreaterThan(foot)
  })

  /**
   * A RECORD PAGE IS CHECKED AS A TREE OF DECLARED SECTIONS IN WHICH ONE KEY NAMES ONE ELEMENT, and
   * two elements answering to one key was a defect this cluster fixed. One control drawn twice is
   * two regions, so it is two names.
   */
  it('gives the two instances two declared names, both of them in the registry', () => {
    const names = controls(page('outline')).map((one) => /data-target="([^"]*)"/.exec(one)?.[1] ?? '')
    expect(names.filter((one) => one !== '').length, 'a control declares nothing at all').toBe(2)
    expect(new Set(names).size, 'both places on the page answer to one name').toBe(2)
    for (const name of names) {
      const id = name.replace(/^uiSurface[:/]/, '')
      expect(Object.keys(SURFACES), `${id} is a name nobody wrote down`).toContain(id)
    }
  })
})

// ============================================================ 3. the ends of the ladder

describe('minus and plus stop at the ends of the ladder', () => {
  const minus = (control: string): string =>
    /<button[^>]*aria-label="One level shorter"([^>]*)>/.exec(control)?.[1] ?? '(no minus)'
  const plus = (control: string): string =>
    /<button[^>]*aria-label="One level longer"([^>]*)>/.exec(control)?.[1] ?? '(no plus)'

  /**
   * A READER'S SHORT END IS THE CONCLUSION SINCE 3 SEPTEMBER 2026, criterion A19, AND THE OFFER IS
   * THREE SINCE 16 SEPTEMBER 2026. The control answers from the position its
   * label reads, so minus is disabled wherever the label reads Conclusion — the stored conclusion,
   * the two positions below it which the floor raises, AND a kept Level 4, which is shown at the
   * nearest offered position, the conclusion. Only the settings page's preview draws the last two
   * as stored — `drawAt` reaches them and a reader cannot.
   */
  it('disables minus wherever the label reads the conclusion, and nowhere else', () => {
    for (const rung of RUNGS) {
      const shownAtTheFloor = nearestOffered(asReaderRung(rung)) === READER_FLOOR
      for (const one of controls(page(rung))) {
        expect(minus(one).includes('disabled'), `minus at ${rung}`).toBe(shownAtTheFloor)
      }
    }
  })

  it('leaves the seven-rung ladder alone: it is the reader’s walk that stops, not the ladder', () => {
    expect(RUNGS, 'a rung was taken off the ladder').toHaveLength(7)
    expect([...READER_RUNGS], 'the reader’s positions').toEqual(['gist', 'outline', 'sketch', 'digest', 'full'])
    expect(readerStepFrom('gist', -1), 'a reader can step below the conclusion').toBeNull()
    expect(readerStepFrom('gist', 1), 'plus from the conclusion').toBe('outline')
    for (const rung of ['label', 'title'] as const) {
      expect(readerStepFrom(rung, -1), `a reader stepped down from ${rung}`).toBeNull()
      expect(readerStepFrom(rung, 1), `plus from ${rung} skipped the conclusion`).toBe('outline')
    }
  })

  it('disables plus at Full and nowhere else', () => {
    for (const rung of RUNGS) {
      for (const one of controls(page(rung))) {
        expect(plus(one).includes('disabled'), `plus at ${rung}`).toBe(rung === 'full')
      }
    }
  })

  it('has one step in each direction from every position between the ends', () => {
    expect(stepFrom('label', -1), 'there is a position below Level 1').toBeNull()
    expect(stepFrom('full', 1), 'there is a position above Full').toBeNull()
    for (const rung of RUNGS) {
      const shorter = stepFrom(rung, -1)
      if (shorter !== null) expect(stepFrom(shorter, 1), `${rung} does not come back from one step down`).toBe(rung)
    }
  })
})

// ============================================================ 4. the pictures button

describe('the pictures button has no words on it and says what it is to a screen reader', () => {
  const button = (html: string): string[] =>
    [...html.matchAll(/<button[^>]*class="sb-pictures"[\s\S]*?<\/button>/g)].map((one) => one[0])

  it('draws no text of its own, only a drawn icon', () => {
    for (const one of button(page('outline'))) {
      // EVERYTHING BETWEEN THE TAGS, WITH THE MARKUP TAKEN OUT. An icon leaves nothing behind.
      const words = one.replace(/<[^>]*>/g, '').trim()
      expect(words, 'the pictures button still carries words').toBe('')
      expect(one, 'the icon is a file to fetch rather than a drawing').toContain('<svg')
    }
  })

  it('says whether the pictures are drawn, in its accessible name and in aria-pressed', () => {
    store.set('mole-office.pictures.local', 'drawn')
    const on = button(page('outline'))
    store.set('mole-office.pictures.local', 'left out')
    const off = button(page('outline'))
    store.delete('mole-office.pictures.local')
    expect(on.length, 'the pictures button is not drawn twice').toBe(2)
    for (const one of on) {
      expect(one).toContain('aria-pressed="true"')
      expect(one).toContain('aria-label="Pictures drawn"')
    }
    for (const one of off) {
      expect(one).toContain('aria-pressed="false"')
      expect(one).toContain('aria-label="Pictures left out"')
    }
  })
})

// ============================================================ one report, one app, three browser sections

/** The headers a person's own write carries. */
const HUMAN = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/**
 * THE ONE WHOLE-RECORD FORM STILL WRITTEN BESIDE A RECORD, and the two the record itself carries.
 *
 * It was three forms written through the short-forms route: a label, a title and a gist. Criterion
 * A14b — a title of at most 15 words and a summary of 20 to 60 — made reading
 * length 2 the record's own `title` column and length 3 its own `summary`, and retired both keys.
 * So the label goes through the route and the other two are filed with the record. Nothing below
 * turns on how many lengths are written; what it needs is a page with words at more than one of
 * them, so the control can be pressed between two lengths that draw different things.
 */
const WRITTEN = {
  label: 'Wrist mounts broke',
} as const

/**
 * THE REPORT'S PARTS, WHICH ARE LEVELS 4, 5 AND 6.
 *
 * THE OWNER'S ACT OF 15 SEPTEMBER 2026 (criterion A14a as amended) takes a level nobody wrote off the
 * reader's control, so the report this file seeds has to have all five positions a reader reaches,
 * or section 5's presses from Level 4 would step to the conclusion instead. The words are written
 * for the parts and are not cuts of the report: the write door refuses a part whose text is a run of
 * the block it covers, and every block is covered exactly once.
 */
const PARTS = [
  {
    id: 'p-1',
    heading: 'The printed mounts gave way',
    text30: 'Most of the printed parts gave way before the load the rig needs.',
    text120:
      'Most printed clamp mounts gave way where the bolt circle is thinnest, under the load the transplant ' +
      'trials ask for, so the queue that made them was stopped.',
    covers: ['b-open', 'b-part'],
  },
  {
    id: 'p-2',
    heading: 'The aluminium mount is next',
    text30: 'The replacement has been ordered and nobody has pulled it.',
    text120:
      'A mount cut from aluminium is on order and has not arrived, and the blanks for it are not bought.',
    covers: ['b-work', 'b-long'],
  },
]

const RECORD_TITLE = 'Printed wrist mounts broke below the trial load'
const RECORD_SUMMARY =
  'Three of four printed wrist mounts broke below the load the handover trials need, so only the ' +
  'aluminium one is worth another run and the printed design is not worth its blanks.'

let app: LiveApp
let browser: Page
let reportId: string

beforeAll(async () => {
  app = await liveApp({ name: 'level-control', viewport: { width: 1440, height: 1200 } })
  browser = app.page
  const made = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: HUMAN,
    body: JSON.stringify({
      kind: 'report',
      // THE TITLE IS READING LENGTH 2 AND THE SUMMARY IS LENGTH 3, criterion A14b, so both are
      // filed with the record and neither goes through the short-forms route.
      title: RECORD_TITLE,
      summary: RECORD_SUMMARY,
      data: { blocks: BLOCKS },
    }),
  })
  if (!made.ok) throw new Error(`seeding the report answered ${String(made.status)}: ${await made.text()}`)
  reportId = ((await made.json()) as { record: { id: string } }).record.id

  const ledger = (await (
    await fetch(`${app.api}/api/records/${reportId}/revisions`, { headers: HUMAN })
  ).json()) as { revisions: { seq: number; contentHash: string }[] }
  const newest = [...ledger.revisions].sort((a, b) => b.seq - a.seq)[0]
  if (newest === undefined) throw new Error('the seeded report has no revision to write a short form from')
  const wrote = await fetch(`${app.api}/api/records/${reportId}/short-forms`, {
    method: 'POST',
    headers: HUMAN,
    body: JSON.stringify({ madeFrom: { seq: newest.seq, contentHash: newest.contentHash }, forms: { label: WRITTEN.label, parts: PARTS } }),
  })
  if (!wrote.ok) throw new Error(`writing the label answered ${String(wrote.status)}: ${await wrote.text()}`)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Open the report page with one reading length stored as the reader's own choice, and wait for it. */
async function openAt(rung: Rung, language: 'en' | 'zh' = 'en') {
  await browser.goto(`${app.site}/${language === 'zh' ? '?lang=zh' : ''}#/r/${reportId}`, { timeout: 60_000 })
  await waitForThePage(browser, 60_000)
  await browser.evaluate(
    ([everywhere, here, length]) => {
      window.localStorage.setItem(everywhere as string, length as string)
      window.sessionStorage.removeItem(here as string)
    },
    [DETAIL_KEY_EVERYWHERE, detailKeyForHere('reportContent'), rung],
  )
  await browser.reload({ timeout: 60_000 })
  await waitForThePage(browser, 60_000)
  await browser.waitForSelector('.sb-level', { timeout: 30_000 })
}

// ============================================================ the label in a picture with a kept outline


// ============================================================ 5. the presses, in a browser

/**
 * THE WIRING, WHICH NO RENDER CAN SHOW. A control that draws the right label and writes nothing is
 * exactly the defect this project keeps finding, and it passes every test above.
 */
describe('pressing minus and plus moves the reader’s own stored choice by one position', () => {
  /** Open the page at one length, press one button on one of the two controls, and read both. */
  async function press(from: Rung, which: 'One level shorter' | 'One level longer', instance: number) {
    // `openAt` CLEARS THE PER-VISIT CHOICE, WHICH IS WHAT A PRESS WRITES AND WHAT WINS OVER THE
    // STORED ONE. Without that each test would start from where the last one's press left the page,
    // and the second press of the file would read as a control that moves two positions.
    await openAt(from)
    await browser.locator(`.sb-level button[aria-label="${which}"]`).nth(instance).click()
    await browser.waitForTimeout(300)
    return browser.evaluate(() =>
      [...document.querySelectorAll('.sb-level-label')].map((one) => (one.textContent ?? '').trim()),
    )
  }

  /**
   * THE PRESS ANSWERS FROM WHERE THE LABEL READS. The offer is three, so a
   * press starts from one the control offers and lands on the next one of the three.
   */
  it('moves one position shorter from the control above the report', async () => {
    expect(await press('digest', 'One level shorter', 0)).toEqual([levelLabel('gist'), levelLabel('gist')])
  }, 120_000)

  it('moves one position longer from the control below the report', async () => {
    expect(await press('gist', 'One level longer', 1)).toEqual([levelLabel('digest'), levelLabel('digest')])
  }, 120_000)

  /**
   * BOTH INSTANCES WRITE ONE VALUE, which is what makes them one control rather than two. A second
   * store would leave the foot saying Level 6 while the top said Conclusion.
   */
  it('moves the label on both instances, from a press on either one', async () => {
    const fromTheFoot = await press('digest', 'One level shorter', 1)
    expect(new Set(fromTheFoot).size, 'the two controls disagree about the level').toBe(1)
    expect(fromTheFoot[0]).toBe(levelLabel('gist'))
  }, 120_000)
})

// ============================================================ 6. nothing changes size when the level does

/**
 * THE HALF OF A12 ABOUT SIZE: the label keeps enough room that changing the level never changes the
 * size of the control. The label is the only thing on the control whose words change, so it is given a fixed
 * width in the stylesheet and everything beside it stays where it is.
 *
 * NOTHING READ THAT RULE UNTIL THIS TEST. Deleting `width: 7rem` from `.sb-level-label`, or turning
 * it into a `min-width`, left all sixty tests in the five files of that build green — problem
 * `7anOzYmzR4oO`. A rule stated only in a stylesheet is a rule the next change to the font, the
 * density or the wording can take away with nothing failing.
 *
 * THE MUTATION: delete the `width: 7rem` line from `.sb-level-label` in
 * `src/web/components/SummaryBlocks.tsx`. The label then shrinks to fit its words, so it is 46px at
 * Full and 79px at Conclusion, the control in the foot changes width with it and both pictures
 * buttons move sideways. Restore the line and this goes green again.
 *
 * WHY IT IS MEASURED IN A BROWSER AND NOT READ OUT OF THE STYLESHEET: a test that greps for
 * `width: 7rem` passes on a rule a later selector overrides, and fails on a rule that was replaced
 * by a better one that does the same job. What is required is that the page does not change
 * size, and that is a measurement.
 */
describe('changing the level moves nothing on the page but the things below it', () => {
  /** The three parts of a control whose size the owner would see change, on both instances. */
  const PARTS = ['.sb-level', '.sb-level-label', '.sb-pictures'] as const

  interface Boxes {
    /** For each part, for each of the two instances, its left edge, its width and its height. */
    across: Record<string, { x: number; width: number; height: number }[]>
    /** Whether the words of each label fit inside the box they are drawn in. */
    labelsFit: boolean[]
    /** What each label read, so a failure says which level it was at. */
    labelsSaid: string[]
  }

  const seen = new Map<Rung, Boxes>()

  beforeAll(async () => {
    // A SHORT WINDOW SO THE PAGE SCROLLS AT EVERY LENGTH. At 1200 tall the shortest length nearly
    // fits, and a scrollbar that comes and goes changes every x and width on the page by its own
    // width — which would be this test failing on the browser's furniture rather than on the page's.
    await browser.setViewportSize({ width: 1440, height: 700 })
    // THE THREE THE CONTROL OFFERS since 16 September 2026. It was the five
    // a reader could reach until the offer shrank, and the five a reader can REACH — `READER_RUNGS`
    // — is unchanged in the shared ladder, so measuring the three is where a reader actually stands
    // now. The labels at the three are Conclusion, Level 6 and Full, all inside the label's fixed
    // width, which is the widest thing it has to hold on this control.
    for (const rung of OFFERED_TO_A_READER) {
      await openAt(rung)
      seen.set(
        rung,
        await browser.evaluate((parts) => {
          const boxes: Record<string, { x: number; width: number; height: number }[]> = {}
          for (const sel of parts) {
            boxes[sel] = [...document.querySelectorAll(sel)].map((one) => {
              const box = one.getBoundingClientRect()
              return { x: box.x, width: box.width, height: box.height }
            })
          }
          const labels = [...document.querySelectorAll('.sb-level-label')] as HTMLElement[]
          return {
            across: boxes,
            // `.sb-level-label` HIDES ITS OVERFLOW, so a label too narrow for its words clips them
            // silently. `scrollWidth` is what the words need and `clientWidth` is what they get.
            labelsFit: labels.map((one) => one.scrollWidth <= one.clientWidth),
            labelsSaid: labels.map((one) => (one.textContent ?? '').trim()),
          }
        }, PARTS as unknown as string[]),
      )
    }
  }, 300_000)

  afterAll(async () => {
    await browser.setViewportSize({ width: 1440, height: 1200 })
  })

  it('draws both instances of all three parts at every level the control offers', () => {
    for (const rung of OFFERED_TO_A_READER) {
      const boxes = seen.get(rung)
      if (boxes === undefined) throw new Error(`nothing was measured at ${rung}`)
      for (const sel of PARTS) {
        expect(boxes.across[sel]?.length, `${sel} at ${rung}`).toBe(2)
      }
    }
  })

  it('keeps the left edge, the width and the height of both controls, both labels and both pictures buttons', () => {
    for (const sel of PARTS) {
      for (const instance of [0, 1]) {
        const said = OFFERED_TO_A_READER.map((rung) => {
          const box = seen.get(rung)?.across[sel]?.[instance]
          return `${rung}: ${JSON.stringify(box)}`
        })
        expect(new Set(said.map((one) => one.split(': ')[1])).size, `${sel} #${String(instance)} — ${said.join(' | ')}`).toBe(1)
      }
    }
  })

  it('never clips the label, at any level the control offers', () => {
    for (const rung of OFFERED_TO_A_READER) {
      const boxes = seen.get(rung)
      expect(boxes?.labelsFit, `the label was cut off at ${rung}, reading ${String(boxes?.labelsSaid.join(' and '))}`).toEqual([
        true,
        true,
      ])
    }
  })

  it('changes the words on the label, which is the one thing that is meant to change', () => {
    // WITHOUT THIS THE TEST ABOVE PASSES ON A CONTROL THAT NEVER CHANGED AT ALL. Constant geometry
    // is only worth asserting where the words underneath it moved.
    const said = OFFERED_TO_A_READER.map((rung) => seen.get(rung)?.labelsSaid[0] ?? '')
    expect(said).toEqual(OFFERED_TO_A_READER.map((rung) => levelLabel(rung)))
    expect(new Set(said).size, 'the label read the same at every offered level').toBe(OFFERED_TO_A_READER.length)
  })
})

// ============================================================ 7. the panel is gone

/**
 * CRITERION A13 SAID THE WORDS OF A FORM IN THE *SHORTER FORMS OF THIS REPORT* PANEL WRAP WHERE THE
 * REPORT'S OWN PROSE WRAPS, not at the 40rem reading cap. Three cases here measured that in a
 * browser at a 1440 window, which is the width the owner read it at.
 *
 * THE PANEL WAS REMOVED ON THE EVENING OF 2 September 2026 and A13 is retired with it, because
 * it repeats what the report body already shows, it is useful for debugging, it is not normal UI,
 * and it goes. §C-3Sept of `design/problem-02/ACCEPTANCE.md`.
 *
 * WHAT THE PANEL'S ABSENCE IS CHECKED BY is `tests/the-record-page-has-no-shorter-forms-panel.test.ts`,
 * which opens a record page in a browser and looks for it. The reading cap it was about is still on
 * the surfaces it was written for; `src/web/tokens.css` says which.
 */

// ============================================================ 8. which of the two was pressed

/**
 * THE COMPOSER NAMES THE CONTROL THAT WAS PRESSED, AND THE TWO ARE TOLD APART.
 *
 * The rule this cluster is built to is that the object under the mouse, the composer's target and
 * the boxed object are one object. The box was already right. What a person read was not:
 * right-clicking either control opened a composer reading *Part of Mole Office's own screen / Full*,
 * word for word the same for both, because the name fell back to the words the control happens to
 * draw — and both controls draw the same label, which changes with the reading length. So an
 * instruction sent about the control below the report arrived saying `Full`. Problem `abpBwHbn-00o`.
 *
 * THE TWO NAMES WERE ALREADY DECLARED in src/shared/surfaces.ts, *How much to read* and *How much
 * to read, below*, and nothing read them. Two things now do. The control spreads `partOfMoleOffice`,
 * the same call every other declared part of this screen uses, which writes the declared name beside
 * the target. And where a press lands on a piece of the control that draws words of its own — the
 * label, either button — the composer keeps a quote of those words, which takes the place on the
 * chip where the name would have gone; so the word in front of the quote is the declared name,
 * through `nameTarget`, the declaration's own namer.
 *
 * WHY BOTH ARE NEEDED, MEASURED ON `FPf58Hfk7_z_` AT FULL. Six presses, one on each control's blank
 * space, label and minus button. With the declaration alone, four of the six read `Part of Mole
 * Office's own screen “Full”` or `“−”`, identical between the two controls. With both, every one of
 * the six names the control it was made on.
 *
 * THE MUTATIONS:
 *   spread `declaredAttributes(declares)` on `.sb-level` again → the control has no declared name,
 *     and the press on its blank space reads `Part of Mole Office's own screen / Full` for both.
 *   drop the `uiSurface` branch from `wordOnTheChip` in src/web/components/agent/context.ts → the
 *     press on the label reads `Part of Mole Office's own screen “Full”` for both.
 */
describe('right-clicking a level control says which of the two it was', () => {
  /** What the chip above the composer reads: the word in front, then what it is called or quotes. */
  interface Chip {
    kind: string | null
    what: string | null
  }

  /** Right-click one of the two controls, or the label inside it, and read the chip. */
  async function rightClick(instance: number, part: 'the control' | 'its label'): Promise<Chip> {
    await openAt('full')
    const where = browser.locator(part === 'its label' ? '.sb-level .sb-level-label' : '.sb-level').nth(instance)
    await where.scrollIntoViewIfNeeded()
    await where.click({ button: 'right' })
    await browser.locator('.px-talk').first().waitFor({ timeout: 15_000 })
    await browser.waitForTimeout(1200)
    return browser.evaluate(() => {
      const talk = [...document.querySelectorAll('.px-talk')].find(
        (one) => one.getAttribute('data-target') === 'uiSurface/composer',
      )
      if (talk === undefined) return { kind: null, what: null }
      const read = (sel: string) => {
        const at = talk.querySelector(sel)
        return at === null ? null : (at.textContent ?? '').trim()
      }
      return { kind: read('.px-talk-chip-kind'), what: read('.px-talk-chip-what') }
    })
  }

  /**
   * AND THE TWO LINES ARE NOT THE SAME LINE, pressed the same way on each. This is the defect stated
   * as a fact about the page rather than as two names: whatever the two are called, a reader must be
   * able to tell which one they pressed.
   */
  it('gives two different lines for the two controls, pressed on the same part of each', async () => {
    const above = await rightClick(0, 'its label')
    const below = await rightClick(1, 'its label')
    expect(`${String(above.kind)} / ${String(above.what)}`).not.toBe(`${String(below.kind)} / ${String(below.what)}`)
  }, 180_000)
})
