// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FORM WITH NO RECORDED PARTS STANDS FOR THE WHOLE RECORD, AND ITS PRESS LANDS THERE.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH HALF WAS ALREADY BUILT, AND WHICH HALF THIS FILE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * THE SENTENCE WAS ALREADY BUILT, and it is not what this file was written to change.
 * `whatItStandsFor` in src/shared/zoom.ts answers *Stands for the whole report.* for a whole-record
 * form with no recorded parts, at about line 882, and its comment above it gives the reason:
 *
 *   the summary of a whole Report stands for the whole Report,
 *   no summary or lower level has to be mapped to particular paragraphs,
 *   and source-region coverage may be optional provenance.
 *
 * The test in this file that repeats that sentence exists so it cannot quietly stop being true; the
 * sentence itself was correct before this file was written.
 *
 * THE PRESS WAS NOT BUILT. `canGo` in src/web/components/agent/TalkBox.tsx refused to offer *View
 * original* whenever `standsFor.parts` was null, which is every whole-record form nobody recorded
 * parts for. So the form said it stood for the whole record and then offered no press. Measured on
 * a live page before the change: the composer on the conclusion drew one sentence, *Stands for the
 * whole report.*, and a button list with no *View original* in it. The press is what this file now
 * holds, alongside the two neighbouring cases that were already right and must stay right:
 *
 *   a form whose recorded parts are ALL GONE keeps its own sentence and its own refusal, and does
 *   not fall back to the whole record; and
 *   a form with LIVE recorded parts still lands on those parts, which
 *   tests/view-original-lands-where-it-says.test.ts drives across three recorded parts.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * Whether a button is drawn, whether pressing it moves the page, and whether what it lit is on the
 * screen are facts about pixels. `viewTheOriginal` is called here twice: once by really pressing
 * the button the composer draws, and once directly so the sentence it hands back can be read — a
 * click throws that answer into React state nothing outside the component can see, which is the
 * same reason tests/view-original-lands-where-it-says.test.ts presses directly for its landings.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { SHORT_FORM_SPECS, whatItStandsFor, type SourceRegion } from '../src/shared/zoom.ts'
import { DETAIL_KEY_EVERYWHERE, READER_FLOOR } from '../src/shared/detail.ts'
import { RECORD_ROOT_ID, sectionRegionId } from '../src/shared/regions.ts'
import { SUMMARY_LINE_KEY } from '../src/shared/sections.ts'
import { targetAttributeValue } from '../src/shared/targets.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const HUMAN = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/** Long enough that the record does not fit one screen, so landing somewhere is a real distance. */
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
    name: 'no-recorded-parts',
    viewport: { width: 1440, height: 1200 },
    // THE DEV SERVER, because the page imports `/components/agent/original.ts` inside the browser
    // to drive it directly. That address is a source file, which a dev server serves and a build
    // does not: a build has that module inside a hashed chunk under a name nobody can write down.
    theDevServerBecause: 'it imports a source module inside the page, which only a dev server serves by that name',
  })
  page = app.page
  const made = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: HUMAN,
    body: JSON.stringify({
      kind: 'report',
      title: 'A report whose summary records no source parts',
      data: { blocks: BLOCKS },
      summary:
        'A whole-report summary written so the conclusion is a reading length with no recorded source parts.',
    }),
  })
  if (!made.ok) throw new Error(`seeding the report answered ${String(made.status)}: ${await made.text()}`)
  reportId = ((await made.json()) as { record: { id: string } }).record.id
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Open the record at the conclusion and right-click the summary line to open the composer. */
async function openTheComposerOnTheConclusion(): Promise<void> {
  await page.goto(`${app.site}/#/r/${reportId}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.evaluate(
    ([key, length]) => void window.localStorage.setItem(key as string, length as string),
    [DETAIL_KEY_EVERYWHERE, READER_FLOOR],
  )
  await page.evaluate(() => {
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
}

/** What the composer's stands-for area is drawing: its sentences, and every button on the box. */
async function theComposerSaid(): Promise<{ sentences: string[]; buttons: string[] }> {
  return page.evaluate(() => {
    const talk = [...document.querySelectorAll('.px-talk')].find(
      (one) => one.getAttribute('data-target') === 'uiSurface/composer',
    )
    return {
      sentences: [...(talk?.querySelectorAll('.px-talk-stands .px-talk-said') ?? [])].map((e) =>
        (e.textContent ?? '').trim(),
      ),
      buttons: [...(talk?.querySelectorAll('button') ?? [])].map((e) => (e.textContent ?? '').trim()),
    }
  })
}

/**
 * A WHOLE-RECORD FORM NOBODY RECORDED PARTS FOR: the sentence is the rule, and the press is offered.
 */
describe('a whole-record form with no recorded parts', () => {
  it('says it stands for the whole record and offers View original', async () => {
    await openTheComposerOnTheConclusion()
    const said = await theComposerSaid()
    // THE SENTENCE WAS ALREADY CORRECT. It is repeated here so it cannot stop being so: the file
    // and line that produce it are named in this file's header.
    expect(said.sentences, 'the composer did not say what the conclusion stands for').toContain(
      'Stands for the whole report.',
    )
    // AND THE PRESS IS OFFERED. Before this change the button list here held no *View original*
    // because `canGo` was false for a null recorded-parts list.
    expect(said.buttons, `the composer offered: ${said.buttons.join(', ')}`).toContain('View original')
  }, 180_000)

  it('lands on the whole record when the press the composer draws is really pressed', async () => {
    await openTheComposerOnTheConclusion()
    const talk = page.locator('.px-talk[data-target="uiSurface/composer"]')
    await talk.getByRole('button', { name: 'View original' }).click({ timeout: 15_000 })
    // THE LIGHT IS PUT ON BEFORE THE SCROLL, so it is waited for rather than sampled once, and the
    // rect is read after the scroll has had time to finish. Four seconds is how long the light
    // burns; the readings below are taken well inside that.
    await page.waitForFunction(() => document.querySelector('.px-original-here') !== null, undefined, {
      timeout: 10_000,
    })
    await sleep(1500)
    const lit = await page.evaluate(() => {
      const on = document.querySelector('.px-original-here')
      if (on === null) return { found: false, inView: false, insideAClosedFold: false, top: 0 }
      let up = on.parentElement
      let folded = false
      while (up !== null) {
        if (up.tagName === 'DETAILS' && (up as HTMLDetailsElement).open !== true) folded = true
        up = up.parentElement
      }
      const box = on.getBoundingClientRect()
      return {
        found: true,
        inView:
          box.bottom > 0 && box.top < window.innerHeight && box.right > 0 && box.left < window.innerWidth &&
          !(box.width === 0 && box.height === 0) && on.checkVisibility(),
        insideAClosedFold: folded,
        top: Math.round(box.top),
      }
    })
    expect(lit.found, 'pressing View original lit nothing on the page').toBe(true)
    expect(lit.insideAClosedFold, 'the press left the landing inside a shut fold').toBe(false)
    expect(lit.inView, `the landing was at rect top ${String(lit.top)} in a 1,200-tall window`).toBe(true)
  }, 180_000)

  /**
   * THE LANDED SENTENCE, read off the same call the button makes. The call is the button's own call
   * with the whole record the form stands for, and it is made directly because a click puts the
   * answer into React state this test cannot read from outside the component.
   */
  it('says it is showing the whole report and that the whole report is drawn', async () => {
    await page.goto(`${app.site}/#/r/${reportId}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    const done = await page.evaluate(
      async ({ record, module, rootId }) => {
        const load = new Function('m', 'return import(m)') as (m: string) => Promise<unknown>
        const original = (await load(module)) as {
          viewTheOriginal: (
            record: string,
            parts: readonly { regionId: string; name: string; stillThere: boolean }[],
            onDone: (x: { landing: string; showing: string; says: string }) => void,
          ) => void
        }
        window.scrollTo(0, 0)
        return new Promise<{ landing: string; showing: string; says: string }>((resolve) => {
          original.viewTheOriginal(
            record,
            [{ regionId: rootId, name: 'the whole report', stillThere: true }],
            resolve,
          )
        })
      },
      { record: reportId, module: '/components/agent/original.ts', rootId: RECORD_ROOT_ID },
    )
    expect(done.landing, 'the whole record was called nowhere to go').not.toBe('nowhere')
    expect(done.says, 'the press claimed the page had nowhere to go for the whole record').not.toContain(
      'there is nowhere here to go to',
    )
    // AND THE SENTENCE IS ABOUT THE WHOLE REPORT, not about one of its parts. The page draws no
    // element for the record as a whole, so it lands on the first drawn thing inside it and says so;
    // `insteadOf` is where that sentence comes from and this is the same answer a recorded `data`
    // part gets in tests/view-original-lands-where-it-says.test.ts.
    expect(done.says).toContain('the whole report')
    expect(done.says, 'the press did not read back how much of the report was drawn').toContain(
      'The whole report is drawn.',
    )
  }, 120_000)
})

/**
 * A FORM WHOSE RECORDED PARTS ARE ALL GONE IS A DIFFERENT CASE. It names parts the record no longer
 * holds, so there is nowhere to go; it keeps its own sentence and it does not fall back to the whole
 * record. The sentence is the one `whatItStandsFor` writes, checked here directly so the wording is
 * held; the refusal is the one `viewTheOriginal` answers with, checked in the browser.
 */
describe('a form whose recorded parts are all gone', () => {
  const gone = (regionId: string): SourceRegion => ({
    regionId,
    name: 'a part this record no longer holds',
    stillThere: false,
  })

  it('keeps its own sentence, which is not the whole-record sentence', () => {
    const one = whatItStandsFor(true, [gone('data.blocks[#gone]')], SHORT_FORM_SPECS.label, 'report')
    expect(one.says).toBe('This report no longer holds the one part recorded as what this label stands for.')
    expect(one.says).not.toBe('Stands for the whole report.')
    const two = whatItStandsFor(
      true,
      [gone('data.blocks[#gone-a]'), gone('data.blocks[#gone-b]')],
      SHORT_FORM_SPECS.label,
      'report',
    )
    expect(two.says).toBe('This report no longer holds any of the 2 parts recorded as what this label stands for.')
  })

  it('keeps its refusal and does not fall back to the whole record', async () => {
    await page.goto(`${app.site}/#/r/${reportId}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    const done = await page.evaluate(async ({ module }) => {
      const load = new Function('m', 'return import(m)') as (m: string) => Promise<unknown>
      const original = (await load(module)) as {
        viewTheOriginal: (
          record: string,
          parts: readonly { regionId: string; name: string; stillThere: boolean }[],
          onDone: (x: { landing: string; showing: string; says: string }) => void,
        ) => void
      }
      window.scrollTo(0, 0)
      return new Promise<{ landing: string; showing: string; says: string }>((resolve) => {
        original.viewTheOriginal(
          'a-record-that-is-not-here',
          [{ regionId: 'data.blocks[#gone]', name: 'a part this record no longer holds', stillThere: false }],
          resolve,
        )
      })
    }, { module: '/components/agent/original.ts' })
    expect(done.landing).toBe('nowhere')
    expect(done.showing).toBe('noPlace')
    expect(done.says).toBe('This record no longer holds any of the parts these words were recorded as standing for.')
  }, 60_000)
})
