// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT GET /api/records/:id/layout SAYS, AND WHAT A READER OF THAT AUDIENCE IS ACTUALLY DRAWN.
 *
 * ---------------------------------------------------------------------------------------
 * THE FAULT THIS FILE EXISTS FOR
 * ---------------------------------------------------------------------------------------
 *
 * A `beside` block's parts are filtered by audience before they are drawn. `SummaryBlocks.tsx`
 * keeps a part only when at least one of its own blocks is one this reader sees, and when fewer
 * than two parts are left it draws what remains as ordinary blocks across the whole box — there is
 * no row, no share and no composition on the screen at all.
 *
 * THE ROUTE DID NOT KNOW THAT. It counted every part of every composition, whoever was reading, and
 * called a two-part row honoured while a normal reader was being drawn one plain full-width block.
 * Measured in Chromium on 29 August 2026, on the fixture below at a 1440 pixel window with an
 * 1164 pixel report body:
 *
 *   · a normal reader is drawn NO `.sb-beside` element and one block 1164px wide;
 *   · the route said two parts, 687.6 and 458.4 pixels, honoured, `unhonoured` empty.
 *
 * So the answer named a part no reader of that audience is shown, gave a width nothing was drawn
 * at, and reported as honoured a share that reader never receives. It is the owner's own acceptance
 * test — "state a preference the layout must refuse, and check that it refuses it for a stated
 * reason" — inverted a second time, in the same route, for a different cause.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT TAKES A BROWSER AND A ROUTE IN ONE FILE
 * ---------------------------------------------------------------------------------------
 *
 * The claim under test is that two independent statements agree: what the renderer draws, and what
 * the route says it draws. Either half alone can be made green by writing the same mistake twice.
 * So every number below is read off the screen first and then asked of the route, and the test is
 * the comparison rather than either reading.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

let app: LiveApp
let apiPort: number
let webPort: number
let page: Page
let reportId: string

/** The composition whose second part is written for developers. */
const MIXED = 'data.blocks[#b-mixed]'
/** The part everybody is shown, and the part only a developer is shown. */
const OPEN = `${MIXED}.parts[#p-open]`
const DEV = `${MIXED}.parts[#p-dev]`
/** A composition neither part of which is filtered: the control for every assertion below. */
const BOTH = 'data.blocks[#b-both]'

const PROSE =
  'The mast moved four millimetres under load on every one of the forty runs, and it moved at the ' +
  'same joint each time, which is what makes this a fixing problem rather than a stiffness one.'

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`http://127.0.0.1:${String(apiPort)}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as Record<string, unknown>
}

/** What one part of one composition was drawn at, by the region id the route reports it under. */
interface Drawn {
  /** How wide the report body is, which is the box every composition in this fixture stands in. */
  body: number
  gutter: number
  rem: number
  read: number
  /** Every `beside` row on the page, by the region id it was drawn from. */
  rows: string[]
  /** Every part of every row, by region id, with what it was drawn at. */
  parts: { regionId: string; px: number }[]
  /** How wide the one block inside the part everybody is shown was drawn. */
  openBlock: number
}

/**
 * Open the report as one of the two readers a browser can be and hand back what was drawn.
 *
 * `?mode=inspect` is the address form of the developer view, which `src/web/lib/mode.ts` reads
 * before the first paint and deliberately does not store. Leaving it off is a normal reader.
 */
async function drawn(as: 'normal' | 'developer', width: number): Promise<Drawn> {
  const mode = as === 'developer' ? '?mode=inspect' : ''
  await page.setViewportSize({ width, height: 1000 })
  await page.goto(`http://127.0.0.1:${String(webPort)}/${mode}#/r/${reportId}`)
  await waitForThePage(page)
  await page.locator('.sb').first().waitFor({ timeout: 30_000 })
  await page.waitForTimeout(700)
  return page.evaluate(() => {
    const w = (el: Element | null): number =>
      el === null ? -1 : Math.round(el.getBoundingClientRect().width * 100) / 100
    const row = document.querySelector('.sb-beside')
    return {
      body: w(document.querySelector('.sb')),
      gutter: row === null ? -1 : parseFloat(getComputedStyle(row).columnGap),
      rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
      read: (() => {
        const probe = document.createElement('div')
        probe.style.width = getComputedStyle(document.documentElement).getPropertyValue('--read')
        probe.style.position = 'absolute'
        probe.style.visibility = 'hidden'
        document.body.append(probe)
        const px = probe.getBoundingClientRect().width
        probe.remove()
        return px
      })(),
      rows: [...document.querySelectorAll('.sb-beside')].map((el) => el.getAttribute('data-drawn-from') ?? ''),
      parts: [...document.querySelectorAll('.sb-beside-part')].map((el) => ({
        regionId: el.getAttribute('data-drawn-from') ?? '',
        px: w(el),
      })),
      openBlock: w(document.querySelector('[data-drawn-from="data.blocks[#b-mixed].parts[#p-open].blocks[#bo]"]')),
    }
  })
}

/** What the route says one reader is drawn, in the box the browser drew. */
async function said(at: Drawn, reader: string): Promise<Record<string, any>> {
  const query =
    `?width=${String(at.body)}&gutter=${String(at.gutter === -1 ? 18 : at.gutter)}` +
    `&rem=${String(at.rem)}&read=${String(at.read)}&reader=${reader}`
  const res = await fetch(`http://127.0.0.1:${String(apiPort)}/api/records/${reportId}/layout${query}`)
  if (!res.ok) throw new Error(`the layout route answered ${String(res.status)}: ${await res.text()}`)
  const body = (await res.json()) as { compositions: Record<string, any>[] }
  const byId: Record<string, any> = {}
  for (const composition of body.compositions) byId[composition['regionId'] as string] = composition
  return byId
}

beforeAll(async () => {
  app = await liveApp({ opensAt: 'full', name: 'audience-layout', viewport: { width: 1440, height: 1000 } })
  apiPort = app.apiPort
  webPort = app.webPort
  page = app.page

  const made = (await post('/api/records', {
    kind: 'report',
    title: 'What the mast did on forty runs',
    summary: 'It moved at the same joint every time.',
    data: {
      date: '2026-08-29',
      blocks: [
        // TWO PARTS, ONE OF THEM WRITTEN FOR DEVELOPERS. A normal reader is shown one of the two,
        // which is fewer than a composition needs, so the renderer draws what is left as ordinary
        // blocks across the whole box.
        {
          id: 'b-mixed',
          type: 'beside',
          parts: [
            { id: 'p-open', share: 6, blocks: [{ id: 'bo', type: 'text', text: PROSE }] },
            {
              id: 'p-dev',
              share: 4,
              blocks: [{ id: 'bd', type: 'text', audience: 'developers', text: PROSE }],
            },
          ],
        },
        // THE CONTROL: the same shape with nothing filtered, so a change that emptied every
        // composition for every reader cannot pass this file.
        {
          id: 'b-both',
          type: 'beside',
          parts: [
            { id: 'p-a', share: 6, blocks: [{ id: 'ba', type: 'text', text: PROSE }] },
            { id: 'p-b', share: 4, blocks: [{ id: 'bb', type: 'text', text: PROSE }] },
          ],
        },
      ],
    },
  })) as { record: { id: string } }
  reportId = made.record.id
}, 240_000)

afterAll(async () => {
  await app?.stop()
})

describe('the layout route answers about the reader who asked', () => {
  /**
   * THE CONTROL, AND IT COMES FIRST. Everything below is about one composition being drawn and
   * another one not being drawn. A page that drew neither would satisfy half these assertions by
   * accident, so this says the fixture reached the screen at all.
   */
  it('draws the unfiltered composition for both readers, which is the control', async () => {
    for (const as of ['normal', 'developer'] as const) {
      const at = await drawn(as, 1440)
      expect(at.body, `as a ${as} reader the report body was not drawn`).toBeGreaterThan(900)
      expect(at.rows, `as a ${as} reader the unfiltered composition was not drawn`).toContain(BOTH)
      const parts = at.parts.filter((p) => p.regionId.startsWith(`${BOTH}.parts[#`))
      expect(parts.map((p) => p.regionId), `as a ${as} reader the control lost a part`).toEqual([
        `${BOTH}.parts[#p-a]`,
        `${BOTH}.parts[#p-b]`,
      ])
    }
  })

  /**
   * WHAT A NORMAL READER IS DRAWN, MEASURED. No row, no part, and the surviving block across the
   * whole box — which is the width the route has to agree with.
   */
  it('draws no row at all for a normal reader, and the survivor across the whole box', async () => {
    const at = await drawn('normal', 1440)
    expect(at.rows, 'a normal reader was drawn the filtered composition as a row').not.toContain(MIXED)
    expect(
      at.parts.map((p) => p.regionId).filter((id) => id.startsWith(`${MIXED}.parts[#`)),
      'a normal reader was drawn a part of the filtered composition',
    ).toEqual([])
    expect(at.openBlock, 'the surviving block was not drawn across the whole report body').toBe(at.body)
  })

  /** And a developer is drawn both parts, at the shares the report asked for. */
  it('draws both parts for a developer, at the shares the report asked for', async () => {
    const at = await drawn('developer', 1440)
    expect(at.rows, 'a developer was not drawn the filtered composition').toContain(MIXED)
    const parts = at.parts.filter((p) => p.regionId.startsWith(`${MIXED}.parts[#`))
    expect(parts.map((p) => p.regionId)).toEqual([OPEN, DEV])
    expect(parts[0]?.px, 'the part that asked for 6 of 10 is not six tenths of the row').toBeCloseTo(
      ((at.body - at.gutter) * 6) / 10,
      1,
    )
  })

  /**
   * THE ASSERTION THE WHOLE FILE IS FOR. Asked as a normal reader, the route says the same thing
   * the screen does: this is not drawn beside anything, the developer part is named as one this
   * reader is not shown, and the survivor is drawn across the whole box.
   */
  it('tells a normal reader the filtered composition is not drawn beside anything', async () => {
    const at = await drawn('normal', 1440)
    const answer = await said(at, 'normal')
    const mixed = answer[MIXED]
    expect(mixed, 'the route did not report the composition at all, which hides it rather than describing it')
      .toBeDefined()
    expect(mixed['besideEachOther'], 'the route still says this reader is shown parts beside each other').toBe(
      false,
    )
    expect(mixed['notShownToThisReader'], 'the route did not name the part this reader is not shown').toEqual([
      DEV,
    ])
    expect(mixed['drawnAcrossTheWholeBox'], 'the route did not name what is drawn instead').toEqual([OPEN])
    expect(mixed['parts'], 'the route still lists parts for a reader who is shown no row').toBeUndefined()
    expect(mixed['across'], 'the route drew the survivor at a width the browser did not').toEqual([
      { regionId: OPEN, px: at.body },
    ])
    expect(mixed['unhonoured'], 'the route reported nothing refused about a share nobody was given').toHaveLength(
      1,
    )
    expect(String(mixed['unhonoured'][0].because)).toContain('not shown')
  })

  /** And the same route, asked as a developer, still reports the two-part row it draws. */
  it('tells a developer the two parts, at the shares the browser drew them at', async () => {
    const at = await drawn('developer', 1440)
    const answer = await said(at, 'developer')
    const mixed = answer[MIXED]
    expect(mixed['besideEachOther']).toBe(true)
    expect(mixed['notShownToThisReader']).toEqual([])
    expect(mixed['parts'].map((p: any) => p.regionId)).toEqual([OPEN, DEV])
    const wide = at.parts.find((p) => p.regionId === OPEN)?.px
    expect(mixed['across'][0].px, 'the route and the browser disagree about the wide part').toBeCloseTo(
      wide ?? -1,
      1,
    )
    expect(mixed['unhonoured'], 'nothing should have been refused at 1440').toEqual([])
  })


  /** The reader has to be named, for the same reason the width does: nobody here can guess it. */
  it('refuses to answer without being told which reader is asking', async () => {
    const at = await drawn('normal', 1440)
    const query = `?width=${String(at.body)}&gutter=18&rem=${String(at.rem)}&read=${String(at.read)}`
    const res = await fetch(`http://127.0.0.1:${String(apiPort)}/api/records/${reportId}/layout${query}`)
    expect(res.status, 'the route answered without being told who is reading').toBe(400)
    expect(await res.text()).toContain('reader')
  })
})
