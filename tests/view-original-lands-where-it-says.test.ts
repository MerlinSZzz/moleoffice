// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * *VIEW ORIGINAL* LANDS WHERE IT SAYS IT LANDED, PRESSED IN A REAL BROWSER.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO FALSE SENTENCES THIS HOLDS SHUT, BOTH MEASURED 1 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * HALF A — A CONTAINER CALLED ABSENT WHILE THE PAGE DRAWS IT. The press asked for the part's own
 * element, then for the nearest drawn thing ABOVE it, and then gave up. It never asked what the
 * part CONTAINS. So `data` — the whole body of a report, which is the natural thing to record a
 * whole-report label as standing for, and which the write door accepts — answered *"is not drawn on
 * this page and nothing on this page holds it, so there is nowhere here to go to"* while twelve
 * top-level blocks and 37,246 characters of that very body were on the screen.
 *
 * HALF B — A PART FOLDED AWAY REPORTED AS SHOWN. `section.links` is drawn by `LinkPanel` inside a
 * closed `<details class="rd-fold">`, which is the state of the links panel on every record until
 * somebody opens it. An element existed, so the press answered *"Showing the section “Links” these
 * words stand for, with the whole report drawn."* Measured at that instant: `window.scrollY` 0
 * before and 0 three and a half seconds after, rect top 13,079 in a 1,200-tall window,
 * `checkVisibility()` false, `innerText` empty. Nothing moved and nothing was shown.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A BROWSER AND NOT A STAND-IN
 * ---------------------------------------------------------------------------------------
 *
 * Both halves are about pixels. Whether a closed `<details>` hides its contents, whether a smooth
 * scroll arrives, what a rect says once it has — none of those is a fact a fixture can hold
 * honestly, and the first defect got past a suite of 9,900 tests precisely because everything that
 * touched this file worked in stand-ins. `tests/a-landing-and-a-mark-agree-about-one-page.test.ts`
 * keeps the tree walking honest without a browser; this keeps the LOOKING honest with one.
 *
 * THE MOMENT THE LOOKING HAPPENS IS THE POINT, AND IT IS CHOSEN AND NOT ASSUMED. A rect is a fact
 * about one instant and a smooth scroll is not an instant, so measuring straight after the press
 * would call every scroll in flight "off the screen". The landing samples `window.scrollY` until
 * two readings agree — the first moment the page has stopped moving — and measures then. These
 * tests read the answer the landing gives at that moment AND take their own rect afterwards, so a
 * landing that measured at a convenient moment and a landing that measured at the right one do not
 * look alike here.
 *
 * ---------------------------------------------------------------------------------------
 * AND THE COMPOSER'S OWN SENTENCE, WHICH THE CONCLUSION CAN NOW PRESS. A whole-record form with no
 * recorded parts stands for the whole record by the owner's rule of 2 September 2026, so the
 * composer on the conclusion now offers *View original* and it lands on the whole report. Problem
 * The press a reader meets after the reader floor; what this file holds is
 * the sentence and the press on the conclusion, and the landing is held in the file the section at
 * the foot names.
 * ---------------------------------------------------------------------------------------
 *
 * The last describe opens the COMPOSER on the conclusion and reads the sentence and the buttons it
 * draws. Measured on 1 September 2026: deleting line 1862 of src/web/components/agent/TalkBox.tsx —
 * the line `{went === null ? null : <p className="px-talk-said">…}` — left typecheck clean and the
 * whole suite green, including the seven tests of
 * tests/the-composer-says-what-a-projection-stands-for.test.ts. That file's survey counted
 * `WhatThisStandsFor` as ONE sentence when it draws TWO, and the second is the one Act 3 turns on:
 * it is the only place a reader is told what the press did.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { DETAIL_KEY_EVERYWHERE, READER_FLOOR } from '../src/shared/detail.ts'
import { sectionRegionId } from '../src/shared/regions.ts'
import { SUMMARY_LINE_KEY } from '../src/shared/sections.ts'
import { targetAttributeValue } from '../src/shared/targets.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const HUMAN = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

const LABEL = 'Bench, round nine'

/**
 * THE THREE PARTS A FORM IS RECORDED AS STANDING FOR, one per half of this file.
 *
 * `data.blocks` is the WHOLE BODY of the report: no element draws it, nothing on the page holds it,
 * and every block of it is on the screen. That is the container the up-only walk called absent.
 * `section.links` is the part folded away. `data` is the record root, which was above the only tree
 * the page had derived — until 1 September 2026 a press on it was answered *"is not drawn on this
 * page, nothing on this page holds it and this page draws no part of it, so there is nowhere here
 * to go to"* while the page had 30,297 characters of exactly that record on the screen.
 *
 * THEY WERE THREE STORED FORMS AND THEY ARE ONE, WRITTEN THREE TIMES. Until 3 September 2026 the
 * label, a title form and a gist each carried one of these lists. Criterion A14b made reading
 * lengths 2 and 3 the record's own `title` and `summary` columns and retired both keys, so the
 * label is the one whole-record form a writer can record sources for. Each case writes it again
 * with the list that case is about, through the same door, so what is being checked is unchanged:
 * three different recorded parts, three presses, three landings.
 */
const STANDS_FOR = {
  theBody: ['data.blocks'],
  theFold: ['section.links'],
  theRecord: ['data'],
} as const

type WhichPart = keyof typeof STANDS_FOR

/**
 * A REPORT LONG ENOUGH THAT ITS PARTS CANNOT ALL BE ON THE SCREEN AT ONCE, which is the whole
 * situation. Ten blocks of prose put the links fold thousands of pixels below the fold of a
 * 1,200-tall window, so "did the press bring it into view" has a real answer.
 */
const BLOCKS = Array.from({ length: 10 }, (_, i) => ({
  id: `b-${String(i + 1)}`,
  type: 'text',
  heading: `What run ${String(i + 1)} showed`,
  text: Array.from({ length: 12 }, (_, n) => `Sentence ${String(n + 1)} of run ${String(i + 1)}, written out at length so the block has real height on the page.`).join(' '),
}))

let app: LiveApp
let page: Page
let reportId: string

beforeAll(async () => {
  app = await liveApp({
    name: 'view-original-lands',
    viewport: { width: 1440, height: 1200 },
    // THE DEV SERVER, for the reason tests/a-form-with-no-recorded-parts-stands-for-the-whole-record.test.ts
    // gives: this file drives `/components/agent/original.ts` from inside the page, and that
    // address is a source file only a dev server serves.
    theDevServerBecause: 'it imports a source module inside the page, which only a dev server serves by that name',
  })
  page = app.page
  const make = async (title: string, data: unknown, summary?: string) => {
    const made = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: HUMAN,
      body: JSON.stringify({ kind: 'report', title, data, ...(summary === undefined ? {} : { summary }) }),
    })
    if (!made.ok) throw new Error(`seeding "${title}" answered ${String(made.status)}: ${await made.text()}`)
    return ((await made.json()) as { record: { id: string } }).record.id
  }
  // THE SUMMARY IS READING LENGTH 3, criterion A14b, and it is here because the shortest position a
  // reader reaches is now the conclusion — criterion A19. Without it this report has no level 3 at
  // all, the body draws the line saying so, and the section at the foot of this file has nothing to
  // right-click. Nothing else in the file reads it.
  reportId = await make(
    'What the bench said about the wrist mounts, round nine',
    { blocks: BLOCKS },
    'Three of four printed wrist mounts broke below the load the handover trials need, so the ' +
      'aluminium one is the only design still worth a run and the printed one is not worth its blanks.',
  )
  // A LINK, BECAUSE `section.links` ONLY EXISTS ON A RECORD THAT HAS ONE, and the links panel is
  // where the folded-away half of this defect lives.
  const other = await make('The aluminium wrist mount drawings', { blocks: [] })
  const joined = await fetch(`${app.api}/api/links`, {
    method: 'POST',
    headers: HUMAN,
    body: JSON.stringify({ fromId: reportId, toId: other, type: 'relates_to' }),
  })
  if (!joined.ok) throw new Error(`linking the two answered ${String(joined.status)}: ${await joined.text()}`)

  const revisions = (await (await fetch(`${app.api}/api/records/${reportId}/revisions`, { headers: HUMAN })).json()) as {
    revisions: { seq: number; contentHash: string }[]
  }
  const newest = [...revisions.revisions].sort((a, b) => b.seq - a.seq)[0]
  if (newest === undefined) throw new Error('the seeded report has no revision to write a short form from')
  // THE LABEL, WITH THE FIRST OF THE THREE LISTS. `recordSourcesFor` below writes it again with
  // whichever list a case is about, through this same door.
  const wrote = await fetch(`${app.api}/api/records/${reportId}/short-forms`, {
    method: 'POST',
    headers: HUMAN,
    body: JSON.stringify({
      madeFrom: { seq: newest.seq, contentHash: newest.contentHash },
      forms: { label: LABEL },
      standsFor: { label: [...STANDS_FOR.theBody] },
    }),
  })
  if (!wrote.ok) throw new Error(`writing the short forms answered ${String(wrote.status)}: ${await wrote.text()}`)
}, 240_000)

/**
 * WRITE THE LABEL AGAIN, RECORDING THE PART THIS CASE IS ABOUT, THROUGH THE WRITE DOOR.
 *
 * It names the newest revision each time, because writing a short form moves the record and a
 * `madeFrom` naming an older one would be stored as out of date — true, and beside the point here.
 */
async function recordSourcesFor(which: WhichPart): Promise<void> {
  const ledger = (await (
    await fetch(`${app.api}/api/records/${reportId}/revisions`, { headers: HUMAN })
  ).json()) as { revisions: { seq: number; contentHash: string }[] }
  const newest = [...ledger.revisions].sort((a, b) => b.seq - a.seq)[0]
  if (newest === undefined) throw new Error('the report has no revision to write a short form from')
  const wrote = await fetch(`${app.api}/api/records/${reportId}/short-forms`, {
    method: 'POST',
    headers: HUMAN,
    body: JSON.stringify({
      madeFrom: { seq: newest.seq, contentHash: newest.contentHash },
      forms: { label: LABEL },
      standsFor: { label: [...STANDS_FOR[which]] },
    }),
  })
  if (!wrote.ok) throw new Error(`recording ${which} answered ${String(wrote.status)}: ${await wrote.text()}`)
}

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** What one press did, and — separately — what a reader could actually see when it had finished. */
interface Press {
  landing: string
  showing: string
  says: string
  /** Read off the document AFTER the press answered, so the two cannot be the same reading. */
  lit: { found: boolean; inView: boolean; insideAClosedFold: boolean; top: number; targetOpen: boolean | null }
}

/**
 * Open the record at one reading length and press *View original* for one short form, from the
 * *Shorter forms* panel row that names it.
 *
 * The press is made through the product's own function rather than by clicking the button, because
 * the answer this file is about is the one the function hands back and a click throws it away into
 * a React state nothing outside the component can read. The BUTTON is pressed in the last describe,
 * where the sentence it prints is what is being checked.
 */
async function pressViewOriginal(which: WhichPart, atLength: string): Promise<Press> {
  await recordSourcesFor(which)
  const level = 'label'
  await page.goto(`${app.site}/#/r/${reportId}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.evaluate(
    ([key, length]) => void window.localStorage.setItem(key as string, length as string),
    [DETAIL_KEY_EVERYWHERE, atLength],
  )
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await sleep(1500)
  return page.evaluate(
    async ({ record, which, module, api, target }) => {
      // THE MODULE VITE IS SERVING TO THIS PAGE, which is the module the reader's browser runs.
      // LOADED THROUGH A FUNCTION BUILT AT RUN TIME, because the test runner rewrites a plain
      // `import()` in this file into its own server-side loader and that loader does not exist in
      // a browser. This is the browser's own dynamic import, reached the one way the rewriter
      // cannot see.
      const load = new Function('m', 'return import(m)') as (m: string) => Promise<unknown>
      const original = (await load(module)) as {
        LANDED_ON: string
        viewTheOriginal: (
          record: string,
          parts: readonly { regionId: string; name: string; stillThere: boolean }[],
          onDone: (x: { landing: string; showing: string; says: string }) => void,
        ) => void
      }
      // THE CLASS THE LANDING LIGHTS, READ OFF THE MODULE THAT WRITES IT. Spelling it in this file
      // would be a second opinion about which element the press went to, which is the defect the
      // file next door exists to hold shut.
      const landedOn = original.LANDED_ON
      // THE API'S OWN ADDRESS, handed in with the rest. Vite does not proxy `/api/`: the page calls
      // the API on the host it was served from and the API's port.
      const forms = (await (await fetch(`${api}/api/records/${record}/short-forms`)).json()) as {
        levels: { level: string; standsFor: { parts: { regionId: string; name: string; stillThere: boolean }[] | null } }[]
      }
      const here = forms.levels.find((one) => one.level === which)
      if (here?.standsFor.parts == null) throw new Error(`nothing recorded what the ${which} stands for`)
      window.scrollTo(0, 0)
      const landed = await new Promise<{ landing: string; showing: string; says: string }>((done) => {
        original.viewTheOriginal(record, here.standsFor.parts ?? [], (x) =>
          done({ landing: x.landing, showing: x.showing, says: x.says }),
        )
      })
      const on = document.querySelector(`.${landedOn}`)
      if (on === null) {
        return { ...landed, lit: { found: false, inView: false, insideAClosedFold: false, top: 0, targetOpen: null } }
      }
      // THE WALK STARTS AT THE LIT ELEMENT ITSELF. A declared section is drawn ON the <details>,
      // so the fold a press must open can be the landing element and not an ancestor of it.
      let up: Element | null = on
      let folded = false
      while (up !== null) {
        if (up.tagName === 'DETAILS' && (up as HTMLDetailsElement).open !== true) folded = true
        up = up.parentElement
      }
      // AND THE ELEMENT THE SECTION IS DECLARED ON, READ BY ITS data-target, so a press on a fold
      // is proved to have opened that fold and not only something above it.
      const declared = document.querySelector(`[data-target="${target}"]`)
      const targetOpen = declared === null || declared.tagName !== 'DETAILS' ? null : (declared as HTMLDetailsElement).open
      const box = on.getBoundingClientRect()
      const inView =
        box.bottom > 0 && box.top < window.innerHeight && box.right > 0 && box.left < window.innerWidth &&
        !(box.width === 0 && box.height === 0) && on.checkVisibility()
      return { ...landed, lit: { found: true, inView, insideAClosedFold: folded, top: Math.round(box.top), targetOpen } }
    },
    // THE MODULE VITE SERVES TO THE PAGE. Its root is src/web and the checker's is the repository,
    // so the path is handed in rather than written as a literal the checker would try to resolve.
    {
      record: reportId,
      which: level,
      module: '/components/agent/original.ts',
      api: app.api,
      target: targetAttributeValue({
        kind: 'region',
        recordId: reportId,
        regionId: STANDS_FOR[which][0],
      }),
    },
  )
}

// ============================================================ half A: the container

describe('a part the page draws no element for, and holds inside nothing', () => {
  it('lands inside the body of the report rather than calling the whole body absent', async () => {
    const done = await pressViewOriginal('theBody', 'label')
    expect(done.says, 'the reader was told the report they were reading is not on the page').not.toContain(
      'there is nowhere here to go to',
    )
    expect(done.landing).toBe('aPartOfIt')
    expect(done.says).toContain('This page does not draw')
    expect(done.says, 'the sentence did not say it is showing a part of the thing and not the thing').toContain(
      'inside it.',
    )
    // AND THE SECOND SENTENCE IS THE LOOKING, NOT THE INTENTION. The press puts the reading length
    // to Full and used to SAY the whole report was drawn whatever the page did; this browser keeps
    // the setting, so the true answer here is that it is drawn — and it is read off the drawing.
    expect(done.says, 'the press asserted how much was drawn instead of reading it back').toContain(
      'The whole report is drawn.',
    )
    // THE PIXEL LANDING. The body's part was put in front of the reader, not only named.
    expect(done.showing).toBe('onTheScreen')
    expect(done.lit.found, 'nothing on the page was lit, so the press went nowhere').toBe(true)
    expect(done.lit.inView, `the press claimed to be showing something whose rect top was ${String(done.lit.top)}`).toBe(true)
  }, 120_000)
})

// ============================================================ half B: the fold

/**
 * THE FOLD CAN BE THE LANDING ELEMENT ITSELF. A declared section is drawn ON its <details>, not
 * inside one, so a walk that starts at the lit element's parent cannot see the fold the press had
 * to open. This case now walks from the lit element and reads the element carrying the section's
 * own data-target: the press opens every shut fold over the part, the part's own fold included.
 *
 * The criterion was "the folds above the part are opened"; it is now "every shut fold over the
 * part, including the fold the part is drawn on, is opened". The old walk let a press that left
 * the links fold shut pass, and the problem record measured exactly that with no code change.
 */
describe('a part drawn inside a fold that is shut', () => {
  it('opens the fold and brings it onto the screen, rather than claiming it was already there', async () => {
    const done = await pressViewOriginal('theFold', 'full')
    expect(done.lit.found, 'nothing was lit for a part the page has an element for').toBe(true)
    // THE KINDER ANSWER IS THE ONE ASKED FOR: open it. Before this landed, the fold stayed shut,
    // `scrollY` stayed 0, and the sentence said the section was being shown.
    expect(done.lit.insideAClosedFold, 'a fold over the part was left shut').toBe(false)
    // THE FOLD THE SECTION IS DRAWN ON IS THE TARGET, so it is the one the press must open.
    expect(done.lit.targetOpen, 'the fold the section is drawn on was left shut').toBe(true)
    expect(done.showing).toBe('onTheScreen')
    expect(done.lit.inView, `the part's rect top was ${String(done.lit.top)} in a 1,200-tall window`).toBe(true)
    expect(done.says).toContain('Showing')
  }, 120_000)

})

// ============================================================ half C: the record root

/**
 * THE TOP OF THE TREE, WHICH IS THE PART THE PAGE DRAWS MOST OF AND USED TO CALL ABSENT.
 *
 * The page announced the tree `regionsOf` derives, whose root is `data.blocks`. The write door
 * accepts — and this file records — `data`, whose tree is `recordRegionsOf`'s. The record root was
 * above everything the page had derived, so `nearestDrawn` walked up from a region the tree did not
 * hold and `firstDrawnInside` walked down into nothing, and both answered null. Hand-pressed on the
 * owner's own report on 1 September 2026: `data` with 23 drawn descendants and
 * `section.summary` with 12 both printed "is not drawn on this page, nothing on this page holds it
 * and this page draws no part of it, so there is nowhere here to go to", with 30,297 characters of
 * that record on the screen. 100% of the "nowhere" sentences that report could print were false.
 */
describe('the record itself, which is the part the page draws most of', () => {
  it('lands inside the record rather than telling the reader the record is not on the page', async () => {
    const done = await pressViewOriginal('theRecord', 'full')
    expect(done.says, 'the reader was told the record they are looking at is not on this page').not.toContain(
      'there is nowhere here to go to',
    )
    expect(done.landing, 'the top of the tree was called absent while the page drew it').not.toBe('nowhere')
    expect(done.lit.found, 'nothing on the page was lit, so the press went nowhere').toBe(true)
    expect(done.lit.inView, `the press claimed to be showing something whose rect top was ${String(done.lit.top)}`).toBe(
      true,
    )
  }, 120_000)

})

// ============================================================ the composer prints what happened

/**
 * THE COMPOSER ON THE CONCLUSION NOW OFFERS THE PRESS, BECAUSE THE FORM STANDS FOR THE WHOLE RECORD.
 *
 * THE CASE THAT WENT read `prints a sentence about the press, under the sentence about what the
 * form stands for`. It opened the record at Level 1, right-clicked the label, counted one sentence
 * in the composer, pressed *View original*, and asserted a second sentence appeared saying where
 * the press had gone. The label is no longer the only whole-record form a reader meets.
 *
 * WHAT CHANGED, AND WHY. `canGo` in src/web/components/agent/TalkBox.tsx used to offer the button
 * only where the thing pressed carried recorded source parts. It was then settled
 * that a whole-record form with no recorded parts stands for the whole record by rule — the ruling
 * is quoted in `whatItStandsFor` in src/shared/zoom.ts — so the conclusion, which is the record's
 * own summary column, does stand for the whole report and the press has somewhere to go. The old
 * expectation here encoded the opposite: that a form with no recorded parts offers no press.
 *
 * THE LANDING IS HELD IN THE NEW FILE.
 * `tests/a-form-with-no-recorded-parts-stands-for-the-whole-record.test.ts` presses the button the
 * composer draws and measures where it lands. What this case asserts is the half a reader meets
 * first: the composer opens on the conclusion, says what it stands for, and the press it offers is
 * there to press.
 *
 * The rest of this file is unchanged and still green: `pressViewOriginal` calls the press directly
 * and proves where it lands, recorded parts and all.
 */
describe('the composer says what the conclusion stands for and offers the press', () => {
  it('draws the sentence and offers View original, because the form stands for the whole report', async () => {
    await page.goto(`${app.site}/#/r/${reportId}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.evaluate(
      ([key, length]) => void window.localStorage.setItem(key as string, length as string),
      [DETAIL_KEY_EVERYWHERE, READER_FLOOR],
    )
    // AND THE CHOICE THE PRESSES ABOVE LEFT BEHIND IS CLEARED. `viewTheOriginal` puts the reading
    // length to Full through `setDetailHere('reportContent', 'full')`, which is a choice for THIS
    // SURFACE and beats the one for everything. The cases above press it, so without this the page
    // opens at Full — and from 2 September 2026 Full draws no written form, so there is nothing
    // here to right-click.
    await page.evaluate(() => {
      window.localStorage.removeItem('mole-office.detail.reportContent')
      window.sessionStorage.removeItem('mole-office.detail.local.reportContent')
    })
    await page.reload({ timeout: 60_000 })
    await waitForThePage(page, 60_000)
    const where = `[data-target="${targetAttributeValue({
      kind: 'region',
      recordId: reportId,
      regionId: sectionRegionId(SUMMARY_LINE_KEY),
    })}"]`
    await page.locator(where).first().waitFor({ timeout: 30_000 })
    await page.locator(where).first().click({ button: 'right' })
    await page.locator('.px-talk').first().waitFor({ timeout: 15_000 })
    await sleep(1200)

    const said = await page.evaluate(() => {
      const talk = [...document.querySelectorAll('.px-talk')].find(
        (one) => one.getAttribute('data-target') === 'uiSurface/composer',
      )
      return {
        stands: [...(talk?.querySelectorAll('.px-talk-stands .px-talk-said') ?? [])].map((e) =>
          (e.textContent ?? '').trim(),
        ),
        presses: [...(talk?.querySelectorAll('button') ?? [])].map((e) => (e.textContent ?? '').trim()),
      }
    })
    // ONE SENTENCE, AND IT IS ABOUT THE WHOLE REPORT. A column stands for the record, not for a
    // list of blocks, so this is the sentence a reader meets at the shortest position they reach.
    expect(said.stands, 'the composer said nothing about what the conclusion stands for').toHaveLength(1)
    expect(said.stands[0]).toContain('Stands for the whole report.')
    // AND THE PRESS. It is offered because the form stands for the whole record, and the landing it
    // makes is measured in the new file this section's header names.
    expect(said.presses, `the composer offered: ${said.presses.join(', ')}`).toContain('View original')
  }, 180_000)
})

// ============================================================ the twin surface, and where it went

/**
 * THE RECORD PAGE DREW THIS ANSWER TOO, ON THE *SHORTER FORMS OF THIS REPORT* PANEL, AND THE PANEL
 * WAS REMOVED ON 2 September 2026.
 *
 * `StandsForLine` drew the same three things the composer draws: the sentence about what a short
 * form stands for, a *View original* button, and — after a press — the sentence saying where the
 * press went. It was guarded here because it was unguarded: measured on 1 September 2026, cutting
 * the line that drew that sentence left the typecheck clean and the whole suite green.
 *
 * The panel was removed, because it repeated the content shown above it, so the
 * composer above is the one surface that draws this answer, and the describe that pressed the panel
 * went with the panel. Nothing else in this file changed. §C-3Sept of
 * `design/problem-02/ACCEPTANCE.md`.
 */
