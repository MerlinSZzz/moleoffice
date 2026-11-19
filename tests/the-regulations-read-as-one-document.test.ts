// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE REGULATIONS READ AS ONE DOCUMENT, WITH THE CHAPTER LIST BESIDE IT.
 *
 * Wave 13q round 9b (on the regulations), task 9fzq6VSDKm06, plan 7FEOshq3mBGG. The design is block
 * b-13 of report n9Mjk3c_sJRu with its question 14, taken under two
 * decisions. The page is one document read from top to bottom along one left
 * edge, the chapter list stands beside it on a wide screen and above it on a narrow one, and Revoke sits on a
 * regulation's own row and still asks why before anything is written.
 *
 * WHAT THIS FILE PROVES, in a test office with made-up records, in a real browser:
 *   1. every chapter heading, rule line and rule text in the document starts at one left edge;
 *   2. pressing a chapter in the list brings that chapter's heading to the top and gives it focus,
 *      with the list beside the document at 1440 and above it at 660;
 *   3. Revoke is on the regulation's row, and pressing it asks why and writes nothing until the
 *      reason is written and confirmed;
 *   5. the person saves a regulation's Chinese title in one press and sees it without reloading;
 *      an agent sees no field, and the server refuses the agent's write.
 *
 * THE THREE RUNS are in the commit that adds this file: a control run, one guarded line broken per
 * test, and the restore.
 *
 * Set W13Q_REGULATIONS_SHOTS to a folder to photograph the page at 1440, 990, 660 and 390 in both
 * looks, at 1440 in Chinese and at 1440 in the test language. The ordinary run takes no picture.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { englishHash } from '../src/shared/english-hash.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { en } from '../src/shared/words/en.ts'
import { zh } from '../src/shared/words/zh.ts'
import { deleteTheCopiedDefaultChapters, liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp
let titleRegulationId = ''
const shots = process.env.W13Q_REGULATIONS_SHOTS
const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** Made-up chapters of a made-up lighthouse office. Each has a Conclusion and its rules. */
const CHAPTERS = [
  { n: 1, label: 'Shared light', title: 'The lamp room', conclusion: 'The lamp is shared. Read this before you climb to it.', rules: [
    ['The lamp is shared', 'Ask the keeper on watch before you touch the lamp.'],
    ['Clean the glass at dawn', 'Salt on the glass dims the beam by evening.'],
    ['Write down every new wick', 'The log says when the wick was changed, and by whom.'],
  ] },
  { n: 2, label: 'Fuel stores', title: 'Oil and the store', conclusion: 'Oil is counted in and counted out.', rules: [
    ['Count the barrels on Monday', 'Write the count in the store book before noon.'],
    ['Never carry oil up the stair alone', 'Two keepers carry it, one above and one below.'],
  ] },
  { n: 3, label: 'Fog signals', title: 'The fog bell', conclusion: 'The bell rings whenever the far rock cannot be seen.', rules: [
    ['Ring every thirty seconds in fog', 'Keep the count with the sand glass, not by feel.'],
  ] },
  { n: 4, label: 'Safe mooring', title: 'Boats and the jetty', conclusion: 'A boat is tied twice before anybody steps out.', rules: [
    ['Two ropes, always', 'One rope holds a boat until the tide turns.'],
    ['Say who is out', 'Chalk the name on the board when a boat leaves.'],
  ] },
  { n: 5, label: 'Keeper notes', title: 'The keepers log', conclusion: 'What happened is written where the next keeper reads it.', rules: [
    ['Write it in the log', 'A note on the wall is gone by the next storm.'],
    ['Say what you did not check', 'A lamp nobody looked at is not a lamp that was fine.'],
  ] },
  { n: 6, label: 'Welcoming visitors', title: 'Visitors on the rock', conclusion: 'A visitor is met at the jetty and never left alone.', rules: [
    ['Meet them at the jetty', 'Nobody climbs the path without a keeper.'],
    ['The lamp room stays closed to visitors', 'They may look at the lamp from the gallery.'],
  ] },
] as const

/** Made-up regulations: two that stand and one that was revoked. */
const REGULATIONS = [
  { title: 'Test tide rule', sentence: 'Nobody rows out after the evening tide turns.', binds: 'person', since: '2026-08-02' },
  { title: 'Test bell rule', sentence: 'The keeper on watch rings the bell, and nobody else.', binds: 'role', role: 'the watch keeper', since: '2026-09-05' },
  { title: 'Test gull rule', sentence: 'Feed no gull from the gallery.', binds: 'person', since: '2026-07-01' },
  { title: 'Test woven-net rule', sentence: 'The loom keeper records each finished net.', binds: 'person', since: '2026-09-08' },
] as const
const TITLE_REGULATION_ZH = '编网规则'

async function request(path: string, body?: unknown, method = 'POST'): Promise<any> {
  const response = await fetch(`${app.api}${path}`, {
    method: body === undefined ? 'GET' : method,
    headers: HEADERS,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  expect(response.ok, `${method} ${path}: ${await response.clone().text()}`).toBe(true)
  return response.json()
}

async function open(language = 'en', width = 1440, theme: 'light' | 'dark' = 'light'): Promise<void> {
  await app.page.setViewportSize({ width, height: 900 })
  await app.page.goto(`${app.site}/?lang=${language}#/regulations`)
  await app.page.evaluate((one) => localStorage.setItem('mole-office.preset.theme', one), theme)
  await app.page.reload()
  await waitForThePage(app.page, 60_000)
  await app.page.getByText('Test bell rule').first().waitFor({ timeout: 30_000 })
}

beforeAll(async () => {
  app = await liveApp({ name: 'regulations-document', viewport: { width: 1440, height: 900 } })
  // This test files its own chapters, so it deletes the default chapters a fresh office copies at its
  // first start (wave 13s round 7; tests/a-fresh-office-copies-the-default-regulations.test.ts covers those).
  await deleteTheCopiedDefaultChapters(app.api)
  for (const one of REGULATIONS) {
    const filed = (await request('/api/records', { kind: 'regulation', title: one.title, data: { ...one, title: undefined } })).record
    if (one.title === 'Test woven-net rule') titleRegulationId = filed.id
    if (one.title === 'Test gull rule') {
      await request(`/api/records/${filed.id}`, { dataPatch: { revoked_at: '2026-09-20', revoked_because: 'the gulls moved to the cliff' } }, 'PATCH')
    }
  }
  for (const one of CHAPTERS) {
    const filed = await request('/api/records', {
      kind: 'module',
      title: one.title,
      summary: one.conclusion,
      data: {
        context: 'Made up for this test.',
        parts: [{ id: 'p1', name: 'Part one', items: [] }],
        extra: { chapter: one.n },
        summaryBlocks: one.rules.map(([heading, text], i) => ({ id: `r-${String(i + 1)}`, type: 'text', heading, text })),
        source: 'made up for this test',
      },
    })
    const newest = (await request(`/api/records/${filed.record.id}/revisions`)).revisions[0]
    await request(`/api/records/${filed.record.id}/short-forms`, { madeFrom: { seq: newest.seq, contentHash: newest.contentHash }, forms: { label: one.label } })
  }
}, 240_000)
afterAll(async () => {
  await app?.stop()
})

describe('pictures', () => {
  it.runIf(shots !== undefined && shots !== '')('photographs the page at four widths, both looks, Chinese and the test language', async () => {
    const folder = shots as string
    mkdirSync(folder, { recursive: true })
    for (const width of [1440, 990, 660, 390]) {
      for (const theme of ['light', 'dark'] as const) {
        await open('en', width, theme)
        await app.page.screenshot({ path: join(folder, `regulations-${String(width)}-${theme}.png`), fullPage: true })
      }
    }
    await open('zh', 1440, 'light')
    await app.page.screenshot({ path: join(folder, 'regulations-1440-light-zh.png'), fullPage: true })
    await open('xx', 1440, 'light')
    await app.page.screenshot({ path: join(folder, 'regulations-1440-light-xx.png'), fullPage: true })
  }, 300_000)
})

describe('the regulations page', () => {
  it('draws the document along one left edge: chapter headings, rule lines and rule text', async () => {
    for (const width of [1440, 390]) {
      await open('en', width)
      const edges = await app.page.locator('.ofc-doc').evaluate((doc) => {
        const found: { left: number; text: string }[] = []
        for (const block of doc.querySelectorAll('h3, p')) {
          const range = document.createRange()
          range.selectNodeContents(block)
          const first = range.getClientRects()[0]
          if (first !== undefined) found.push({ left: Math.round(first.left), text: (block.textContent ?? '').slice(0, 40) })
        }
        return found
      })
      expect(edges.length, `${String(width)}px: the document drew no heading and no rule`).toBeGreaterThan(20)
      const lefts = [...new Set(edges.map((one) => one.left))]
      expect(lefts, `${String(width)}px: the document's text starts at more than one edge: ${JSON.stringify(edges)}`).toHaveLength(1)
    }
  }, 120_000)

  it('jumps to a chapter from the list, which is beside the document when wide and above it when narrow', async () => {
    for (const width of [1440, 660]) {
      await open('en', width)
      const list = await app.page.locator('.ofc-toc').boundingBox()
      const doc = await app.page.locator('.ofc-doc').boundingBox()
      expect(list !== null && doc !== null).toBe(true)
      if (width === 1440) expect(list!.x, 'at 1440 the chapter list is not beside the document').toBeGreaterThanOrEqual(doc!.x + doc!.width)
      else expect(list!.y + list!.height, 'at 660 the chapter list is not above the document').toBeLessThanOrEqual(doc!.y)
      // THE LAST CHAPTER STARTS BELOW THE WINDOW, so only a jump can bring it into view. It cannot
      // always reach the very top, because the page may end first; it must be wholly in view.
      const heading = app.page.locator('#ofc-ch-6')
      expect((await heading.boundingBox())?.y ?? 0, 'the last chapter is already in view, so a jump proves nothing').toBeGreaterThan(900)
      await app.page.locator('.ofc-toc-go[data-chapter="6"]').click()
      const inView = async (): Promise<boolean> => {
        const box = await heading.boundingBox()
        return box !== null && box.y >= 0 && box.y + box.height <= 900
      }
      await expect.poll(inView, { timeout: 5_000 }).toBe(true)
      expect(await heading.evaluate((node) => document.activeElement === node), 'the chapter heading did not take focus').toBe(true)
      expect(await heading.innerText()).toContain('Welcoming visitors')
    }
  }, 120_000)

  // PROBLEM VDpNHQUSEbAR: a chapter's heading read "Chapter 1The lamp room", its number run into its
  // name. Ended on main by commit 657e5b3c; this is the check that says so (wave 13q round 10,
  // on the notes fixes). Each heading is its number, one space, then its name, at a desk and a phone.
  it('separates each chapter heading\'s number from its name by a space', async () => {
    for (const width of [1440, 390]) {
      await open('en', width)
      for (const one of CHAPTERS) {
        const heading = app.page.locator(`#ofc-ch-${String(one.n)}`)
        expect((await heading.innerText()).trim(), `${String(width)}px: chapter ${String(one.n)}'s heading`).toBe(`${String(one.n)} ${one.label}`)
      }
    }
  }, 120_000)

  it('puts Revoke on the regulation row, and asks why before it writes anything', async () => {
    await open('en', 1440)
    const row = app.page.locator('.ofc-reg', { hasText: 'Test tide rule' })
    const press = row.locator('.ofc-revoke button')
    const sentence = row.locator('.ofc-reg-words')
    const pressBox = await press.boundingBox()
    const sentenceBox = await sentence.boundingBox()
    const rowBox = await row.boundingBox()
    expect(pressBox !== null && sentenceBox !== null && rowBox !== null).toBe(true)
    // ON THE ROW: at the row's right, level with the row's own words rather than under them.
    expect(pressBox!.x, 'Revoke is not at the right of the sentence').toBeGreaterThan(sentenceBox!.x + sentenceBox!.width)
    expect(pressBox!.y, 'Revoke sits below the row').toBeLessThan(sentenceBox!.y + sentenceBox!.height)
    expect(pressBox!.y + pressBox!.height).toBeLessThanOrEqual(rowBox!.y + rowBox!.height)

    const writes: string[] = []
    await app.page.route('**/api/records/**', async (route) => {
      if (route.request().method() === 'PATCH') writes.push(route.request().postData() ?? '')
      await route.fallback()
    })
    try {
      await press.click()
      const form = row.locator('.ofc-revoke-form')
      await form.waitFor()
      expect(writes, 'pressing Revoke wrote before asking why').toEqual([])
      expect(await form.innerText()).toContain(en['unrowedPages.regulations.revokeWhy'])
      await form.locator('textarea').fill('the tide table changed')
      await form.locator('button[data-variant="danger"]').click()
      await expect.poll(() => writes.length, { timeout: 10_000 }).toBe(1)
      const sent = JSON.parse(writes[0] as string) as { dataPatch: Record<string, string> }
      expect(sent.dataPatch.revoked_because).toBe('the tide table changed')
      await row.getByText(/revoked \d{4}-\d{2}-\d{2}/).waitFor({ timeout: 10_000 })
    } finally {
      await app.page.unroute('**/api/records/**')
    }
  }, 120_000)

  it('saves a Chinese title once, draws it immediately, and hides the field from an agent', async () => {
    await open('zh', 1440)
    const title = app.page.locator('.ofc-reg', { hasText: 'The loom keeper records each finished net.' })
    const editor = title.locator('.ofc-reg-title-edit')
    expect(await editor.count()).toBe(1)
    const normalWords = await app.page.locator('.page.ofc').innerText()
    expect(normalWords).not.toContain(titleRegulationId)
    expect(normalWords).not.toMatch(/data\.zh|englishHash|office-regulations|127\.0\.0\.1|\.db/)
    const addressBefore = app.page.url()
    const navigationsBefore = await app.page.evaluate(() => performance.getEntriesByType('navigation').length)
    await editor.locator('input').fill(TITLE_REGULATION_ZH)
    await editor.getByRole('button', { name: String(zh['regZh.saveTitle']) }).click()
    await expect.poll(() => title.locator('.ofc-reg-link').innerText(), { timeout: 10_000 }).toBe(TITLE_REGULATION_ZH)
    expect(app.page.url()).toBe(addressBefore)
    expect(await app.page.evaluate(() => performance.getEntriesByType('navigation').length)).toBe(navigationsBefore)

    const storedReply = await request(`/api/records/${titleRegulationId}`)
    const stored = (storedReply.record ?? storedReply) as { data: { zh: { title: string; from: string } } }
    expect(stored.data.zh).toEqual({ title: TITLE_REGULATION_ZH, from: englishHash(['Test woven-net rule']) })

    await app.page.evaluate(() => {
      localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'agent', id: 'made-up-agent' }))
    })
    try {
      await app.page.reload()
      await waitForThePage(app.page, 60_000)
      const agentRow = app.page.locator('.ofc-reg', { hasText: 'The loom keeper records each finished net.' })
      expect(await agentRow.locator('.ofc-reg-title-edit').count()).toBe(0)
      const refused = await fetch(`${app.api}/api/records/${titleRegulationId}`, {
        method: 'PATCH',
        headers: {
          ...HEADERS,
          'x-mole-office-actor-type': 'agent',
          'x-mole-office-actor-id': 'made-up-agent',
        },
        body: JSON.stringify({ dataPatch: { zh: { title: '另一个标题', from: englishHash(['Test woven-net rule']) } } }),
      })
      expect(refused.status).toBe(403)
      expect((await request(`/api/records/${titleRegulationId}`)).record.data.zh.title).toBe(TITLE_REGULATION_ZH)
    } finally {
      await app.page.evaluate((personId) => {
        localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: personId }))
      }, THE_PERSON)
      await app.page.reload()
      await waitForThePage(app.page, 60_000)
    }
  }, 120_000)
})
