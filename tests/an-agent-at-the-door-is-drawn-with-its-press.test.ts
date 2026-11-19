// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT THAT REGISTERED ITSELF IS DRAWN WHERE THE PERSON LOOKS, WITH ITS PRESS. Problem NXEhOBumu5ZZ.
 *
 * A self-registration waits for the person's press. The office listed it on GET /api/waiting and counted
 * it in Home's "Waiting on you" number, and drew it on no page the person looks at: the only press was on the
 * ask's own record page, which nothing linked to. So a new person's first agent could not be let in.
 *
 * This is a browser test against a real stack. Three made-up agents register themselves through the
 * real door (POST /api/agents/register-myself), one of them in a project other than the one in the
 * switcher. Then:
 *   - the Embassy draws a row for every ask, with who asks, the card, which computer it came from
 *     and the project, and the press;
 *   - Home's Needs you draws a row for every ask, with who asks and the project, and one press, the
 *     row itself, which opens the ask's own page under the Embassy, the approved Home: the card, the
 *     computer and the Let it in press are on the Embassy's side;
 *   - Home's number counts exactly the asks it draws (nothing else waits in this office);
 *   - the ask from the other project is admitted from Home's row, on the page that row opens;
 *   - after the press on the ask's own page, the page says what the press did and what the admitted
 *     agent can do now, where the press was, naming the agent by the office name it registered;
 *   - the admitting press says what it does in the page's words, and not that the ask "proved nobody";
 *   - a press that fails says so on its row;
 *   - on the Embassy one ask is refused and one admitted, and each row says what its press did;
 *   - the whole sentence of where an ask came from shows in developer mode only, on the Embassy;
 *   - a role request's own page is marked under the Embassy in the sidebar, and its middle crumb leads to the Embassy
 *     and says the rail row's word;
 *   - Everything still lists a role request, and its Reports and notes group does not.
 *
 * MUTATIONS (after a green control), each red:
 *   1. give Home's waiting rows no link (HomeSections.tsx, WaitingRow);
 *   2. take the AsksAtTheDoor element out of EmbassyPage.tsx (the Embassy's row);
 *   3. make TheCardAsk report 'grant' after a refusal (TheirCard.tsx);
 *   4. draw TheCardAsk alone again on the ask's own page (RecordPage.tsx), so the page says nothing after
 *      the press;
 *   5. leave out the sentence of what an admitted agent can do now (TheirCard.tsx, whatThePressDid);
 *   6. take the failed press's sentence out of TheCardAsk;
 *   7. make TheCardAsk draw the server's English sentence again, so the Chinese page's card word is gone;
 *   8. make the admitting press's sentence say "proved nobody" again (the English word list);
 *   9. put role_request back into the notes family (src/shared/work.ts, KIND_FAMILIES);
 *  10. take role_request out of THE_PAGE_A_KIND_IS_READ_ON (src/shared/work.ts), so the crumb calls it a gap;
 *  11. name the Embassy crumb with the Role cards row's word (RecordPage.tsx, Crumbs);
 *  12. put role_request back into the notes family and let Crumbs ask the own-page table first, so only Everything's
 *      Reports and notes group can tell.
 *
 * PHOTOGRAPHS at 1440, 990, 660 and 390, light and dark, at 1440 in Chinese and in the test language,
 * and after a press, when DOOR_ASKS_SHOTS names a folder. When ROLE_REQUEST_SHOTS names one, a role request's own page,
 * Reports and notes and Everything at the same four widths in both looks, and Everything searched for the asker.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { AN_ASK_THAT_PROVED_NOTHING } from '../src/shared/what-an-ask-proved.ts'
import { createI18n, sayInEnglish } from '../src/shared/i18n.ts'
import { cardWord } from '../src/shared/card-words.ts'
import { familyWord } from '../src/shared/words.ts'

let app: LiveApp

/** The project in the switcher, and a made-up second project. */
const HERE = 'default'
const ELSEWHERE = 'greenhouse'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': HERE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/**
 * The office name each made-up agent registers under. The admission sentences read this name, while the
 * record and the waiting reading keep the stored handle.
 */
const officeName = (handle: string): string => `The agent ${handle}`

/** A keyless ask at the self-registration door, in one project. It proves nobody and waits for the person's press. */
async function askToRegister(handle: string, project: string): Promise<string> {
  const res = await fetch(`${app.api}/api/agents/register-myself`, {
    method: 'POST',
    headers: {
      ...AS_THE_PERSON,
      'x-mole-office-workspace': project,
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': handle,
    },
    body: JSON.stringify({ handle, name: officeName(handle), workingDirectory: '/tmp', requestedRole: 'worker' }),
  })
  const text = (await res.text()).replace(/[0-9a-f]{64}/g, '<a key>')
  expect(res.status, text).toBe(202)
  return String((JSON.parse(text) as { request: string }).request)
}

/** The title the office gave an ask's record. */
async function theTitleOf(id: string): Promise<string> {
  const res = await fetch(`${app.api}/api/records/${id}`, { headers: AS_THE_PERSON })
  expect(res.status).toBe(200)
  return String(((await res.json()) as { record: { title: string } }).record.title)
}

async function agentExists(handle: string): Promise<boolean> {
  const res = await fetch(`${app.api}/api/participants/agent/${handle}`, { headers: AS_THE_PERSON })
  return res.status === 200
}

/** One row of the one reading, as far as this file reads it. */
interface Waiting {
  id: string
  workspaceTitle: string
  thePress?: { handle: string }
}

/** What the one reading says is waiting on the person. */
async function waitingOnThem(): Promise<Waiting[]> {
  const res = await fetch(`${app.api}/api/waiting`, { headers: AS_THE_PERSON })
  expect(res.status).toBe(200)
  return ((await res.json()) as { items: Waiting[] }).items
}

async function open(path: string, query = ''): Promise<void> {
  await app.page.goto(`${app.site}/${query}#${path}`, { timeout: 60_000 })
  await waitForThePage(app.page, 60_000)
}

/** What a row and the ask's own page say once an admitting press for the worker card is answered. */
const admitted = (handle: string): string =>
  `${sayInEnglish('doorAsks.done.admitted', { handle: officeName(handle), card: cardWord('worker', sayInEnglish) })} ${sayInEnglish('doorAsks.done.admittedCanNow')}`

const row = (handle: string) => app.page.locator(`.door-ask[data-door-ask="${handle}"]`)

/** Home's Needs you row for one ask, found by the ask's id. */
const homeRow = (id: string) => app.page.locator(`[data-home-section="needs"] .hm-needs-item:has([data-home-waiting-id="${id}"])`)
const homeCount = () => app.page.locator('[data-home-section="needs"] .hm-needs-count')

let farAsk = ''
let askedAsks: string[] = []

beforeAll(async () => {
  app = await liveApp({ name: 'door-asks', viewport: { width: 1440, height: 1000 } })
  const made = await fetch(`${app.api}/api/workspaces`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify({ id: ELSEWHERE, title: 'Greenhouse' }),
  })
  expect(made.status, await made.text()).toBeLessThan(300)
  farAsk = await askToRegister('hermit-crab', ELSEWHERE)
  askedAsks = [await askToRegister('barn-owl', HERE), await askToRegister('field-mouse', HERE)]
  // THE SWITCHER READS THE PROJECT THE ASKS WERE NOT ALL FILED IN, in normal mode and the light look.
  await app.page.addInitScript((here) => {
    if (localStorage.getItem('mole-office.workspace') === null) localStorage.setItem('mole-office.workspace', here)
    if (localStorage.getItem('mole-office.preset.theme') === null) localStorage.setItem('mole-office.preset.theme', 'light')
  }, HERE)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('an agent at the door', () => {
  it('is drawn on the Embassy, each row with who, the card, where from and the press', async () => {
    const items = await waitingOnThem()
    const asks = items.filter((item) => item.thePress !== undefined).map((item) => item.thePress!.handle).sort()
    expect(asks).toEqual(['barn-owl', 'field-mouse', 'hermit-crab'])
    // NOTHING ELSE WAITS IN THIS OFFICE, so Home's number is the number of asks.
    expect(items.length).toBe(3)

    for (const page of ['/embassy']) {
      await open(page)
      await row('hermit-crab').waitFor({ state: 'visible', timeout: 30_000 })
      expect(await app.page.locator('.door-ask').count(), `rows on ${page}`).toBe(3)
      for (const handle of asks) {
        const one = row(handle)
        expect(await one.locator('.door-ask-who').textContent()).toBe(handle)
        expect(await one.locator('[data-fact="card"]').textContent()).toBe('worker')
        expect(await one.locator('[data-fact="from-where"]').textContent()).toBe('this computer')
        expect(await one.locator('.tc-ask button', { hasText: 'Admit it' }).count()).toBe(1)
        // IN NORMAL MODE NO ADDRESS AND NO SESSION: the whole sentence is for developer mode.
        expect(await one.locator('[data-fact="came-from"]').count()).toBe(0)
      }
      expect(await row('hermit-crab').locator('[data-fact="project"]').textContent()).toBe('Greenhouse')
    }
  }, 180_000)

  it("is drawn in Home's Needs you, each row with who, the project and one press that opens the ask", async () => {
    const items = (await waitingOnThem()).filter((item) => item.thePress !== undefined)
    expect(items).toHaveLength(3)
    await open('/')
    for (const item of items) {
      const one = homeRow(item.id)
      await one.waitFor({ state: 'visible', timeout: 30_000 })
      const said = await one.innerText()
      expect(said, 'the row does not say who asks').toContain(item.thePress!.handle)
      expect(said, 'the row does not say which project the ask is in').toContain(item.workspaceTitle)
      // ONE PRESS, THE ROW ITSELF, and it opens the ask's own page, where the press to let it in is.
      const presses = one.locator('a, button')
      expect(await presses.count(), 'a Home row has more than one press, or none').toBe(1)
      expect(await presses.first().getAttribute('href')).toBe(`#/r/${item.id}`)
    }
    expect(items.find((item) => item.thePress!.handle === 'hermit-crab')?.workspaceTitle).toBe('Greenhouse')
    expect(await app.page.locator('[data-home-section="needs"] .hm-needs-item').count(), 'rows in Needs you').toBe(3)
    // HOME'S NUMBER COUNTS EXACTLY THE ROWS DRAWN.
    expect(await homeCount().textContent()).toBe('3')
  }, 180_000)

  it('shows where the ask came from in whole in developer mode, on the Embassy', async () => {
    await open('/embassy', '?mode=inspect')
    const cameFrom = row('barn-owl').locator('[data-fact="came-from"]')
    await cameFrom.waitFor({ state: 'visible', timeout: 30_000 })
    expect(await cameFrom.textContent()).toContain(AN_ASK_THAT_PROVED_NOTHING.carriedNoKey)
  }, 120_000)

  it("is admitted from Home's row, on the page it opens, though it was filed in another project", async () => {
    await open('/')
    const one = homeRow(farAsk)
    await one.waitFor({ state: 'visible', timeout: 30_000 })
    expect(await agentExists('hermit-crab')).toBe(false)
    await one.locator('a').click()
    // THE ROW OPENED THE ASK'S OWN PAGE, which the sidebar marks under the Embassy, in the ask's project.
    // Test change (wave 13y round 165): the Embassy is listed on All pages now, so the sidebar marks
    // the All pages entry.
    await expect.poll(async () => app.page.evaluate(() => location.hash), { timeout: 20_000 }).toBe(`#/r/${farAsk}`)
    const embassy = app.page.locator('a.shell-link.shell-all-pages')
    await expect.poll(async () => embassy.getAttribute('aria-current'), { timeout: 30_000 }).toBe('true')
    const admit = app.page.locator('.tc-ask button', { hasText: 'Admit it' })
    await admit.waitFor({ state: 'visible', timeout: 30_000 })
    await admit.click()
    await expect.poll(async () => agentExists('hermit-crab'), { timeout: 20_000 }).toBe(true)
    // THE PAGE SAYS WHAT THE PRESS DID, AND WHAT THE AGENT CAN DO NOW, where the press was.
    const done = app.page.locator('.tc-ask-done')
    await done.waitFor({ state: 'visible', timeout: 20_000 })
    expect(await done.textContent()).toBe(admitted('hermit-crab'))
    // AND HOME'S NUMBER FOLLOWED THE PRESS.
    await open('/')
    await expect.poll(async () => homeCount().textContent(), { timeout: 20_000 }).toBe('2')
    expect(await homeRow(farAsk).count()).toBe(0)
  }, 120_000)

  it("says what the admitting press does in the page's words, and not that the ask proved nobody", async () => {
    const says = row('barn-owl').locator('.tc-ask-says')
    await open('/embassy', '?lang=zh')
    await says.waitFor({ state: 'visible', timeout: 30_000 })
    const chinese = createI18n('zh')
    expect(await says.textContent(), "the card is not named in the page's words").toContain(cardWord('worker', (key) => chinese.t(key)))
    await open('/embassy')
    await says.waitFor({ state: 'visible', timeout: 30_000 })
    expect(await says.textContent()).not.toContain('proved nobody')
  }, 120_000)

  it('says on its row that a press failed', async () => {
    await open('/embassy')
    const mouse = row('field-mouse')
    await mouse.waitFor({ state: 'visible', timeout: 30_000 })
    // THE PRESS NEVER REACHES THE OFFICE: the browser drops it, so nothing in the office changes.
    const door = '**/api/roles/requests/*/grant'
    await app.page.route(door, (route) => route.abort('failed'))
    try {
      await mouse.locator('.tc-ask button', { hasText: 'Admit it' }).click()
      const failed = mouse.locator('.tc-ask-failed')
      await failed.waitFor({ state: 'visible', timeout: 20_000 })
      expect(await failed.textContent()).toBe(sayInEnglish('cardAsk.failed.admit', { handle: officeName('field-mouse') }))
    } finally {
      await app.page.unroute(door)
    }
  }, 120_000)

  it('is refused and admitted on the Embassy in place, each row saying what its press did', async () => {
    await open('/embassy')
    const owl = row('barn-owl')
    await owl.waitFor({ state: 'visible', timeout: 30_000 })
    await owl.locator('.tc-ask button', { hasText: 'Refuse it' }).click()
    await app.page.getByRole('dialog').locator('.tiered-question-acts button').last().click()
    await expect
      .poll(async () => owl.locator('.door-ask-done').textContent().catch(() => null), { timeout: 20_000 })
      .toBe(sayInEnglish('doorAsks.done.refused', { handle: officeName('barn-owl') }))
    expect(await agentExists('barn-owl')).toBe(false)

    const mouse = row('field-mouse')
    await mouse.locator('.tc-ask button', { hasText: 'Admit it' }).click()
    await expect
      .poll(async () => mouse.locator('.door-ask-done').textContent().catch(() => null), { timeout: 20_000 })
      .toBe(admitted('field-mouse'))
    expect(await agentExists('field-mouse')).toBe(true)
    expect(await app.page.evaluate(() => location.hash)).toBe('#/embassy')
    // NOTHING IS WAITING NOW, and Home's Needs you draws no row.
    expect(await waitingOnThem()).toEqual([])
    await open('/')
    await expect.poll(async () => homeCount().textContent(), { timeout: 30_000 }).toBe('0')
    expect(await app.page.locator('[data-home-section="needs"] .hm-needs-item').count()).toBe(0)
  }, 120_000)

  it("opens a role request's own page under the Embassy, and Everything still lists it", async () => {
    await open(`/r/${askedAsks[0]!}`)
    // Test change (wave 13y round 165): the Embassy is listed on All pages, whose entry is marked.
    const embassy = app.page.locator('a.shell-link.shell-all-pages')
    await expect.poll(async () => embassy.getAttribute('aria-current'), { timeout: 30_000 }).toBe('true')
    // The first crumb is Everything; the second is the page the kind is read on, named with the rail row's word.
    const middle = app.page.locator('.rp-crumbs a').nth(1)
    expect(await middle.getAttribute('href'), 'the middle crumb leads to the Embassy').toBe('#/embassy')
    expect((await middle.innerText()).trim(), "the middle crumb says the rail row's word").toBe(sayInEnglish('nav.embassy'))

    // A ROLE REQUEST IS STILL A RECORD, so Everything lists it, though no facet heading holds it.
    const title = await theTitleOf(askedAsks[0]!)
    await open('/records')
    await app.page.getByText(title).first().waitFor({ timeout: 30_000 })
    await app.page.locator('.rec-facet', { hasText: familyWord('notes').text }).first().click()
    await expect
      .poll(async () => (await app.page.locator('main').first().textContent()) ?? '', { timeout: 15_000, message: 'the Reports and notes group lists a role request' })
      .not.toContain(title)
  }, 120_000)
})

describe('photographs', () => {
  it.skipIf(!process.env['DOOR_ASKS_SHOTS'])('photographs Home and the Embassy with an ask waiting', async () => {
    const { mkdirSync } = await import('node:fs')
    const shots = process.env['DOOR_ASKS_SHOTS'] as string
    mkdirSync(shots, { recursive: true })
    await askToRegister('tawny-frog', HERE)
    await askToRegister('grey-heron', ELSEWHERE)
    const take = async (name: string, path: string, width: number, theme: 'light' | 'dark', query = '') => {
      await app.page.setViewportSize({ width, height: 1000 })
      await app.page.evaluate((look) => localStorage.setItem('mole-office.preset.theme', look), theme)
      await open(path, query)
      await app.page.reload({ timeout: 60_000 })
      await waitForThePage(app.page, 60_000)
      if (path === '/') {
        await app.page.locator('[data-home-section="needs"] .hm-needs-item').first().waitFor({ state: 'visible', timeout: 30_000 })
        await app.page.locator('[data-home-section="needs"]').scrollIntoViewIfNeeded()
      } else {
        await row('tawny-frog').waitFor({ state: 'visible', timeout: 30_000 })
        await app.page.locator('.door-asks').first().scrollIntoViewIfNeeded()
      }
      await app.page.screenshot({ path: `${shots}/${name}.png`, fullPage: false })
    }
    for (const [name, path] of [['home', '/'], ['embassy', '/embassy']] as const) {
      for (const width of [1440, 990, 660, 390]) {
        for (const theme of ['light', 'dark'] as const) await take(`${name}-${String(width)}-${theme}`, path, width, theme)
      }
      await take(`${name}-1440-zh`, path, 1440, 'light', '?lang=zh')
      await take(`${name}-1440-xx`, path, 1440, 'light', '?lang=xx')
    }
    // AND ONE AFTER A PRESS, on the Embassy, where the press is since the approved Home.
    await take('embassy-1440-light-before-press', '/embassy', 1440, 'light')
    await row('tawny-frog').locator('.tc-ask button', { hasText: 'Admit it' }).click()
    await row('tawny-frog').locator('.door-ask-done').waitFor({ state: 'visible', timeout: 20_000 })
    await app.page.screenshot({ path: `${shots}/embassy-1440-light-after-press.png`, fullPage: false })
  }, 900_000)

  it.skipIf(!process.env['ROLE_REQUEST_SHOTS'])("photographs a role request's own page, Reports and notes and Everything", async () => {
    const { mkdirSync } = await import('node:fs')
    const shots = process.env['ROLE_REQUEST_SHOTS'] as string
    mkdirSync(shots, { recursive: true })
    const ask = await askToRegister('grey-wagtail', HERE)
    const title = await theTitleOf(ask)
    const take = async (name: string, path: string, width: number, theme: 'light' | 'dark', search = '') => {
      await app.page.setViewportSize({ width, height: 1000 })
      await app.page.evaluate((look) => localStorage.setItem('mole-office.preset.theme', look), theme)
      await open(path)
      await app.page.reload({ timeout: 60_000 })
      await waitForThePage(app.page, 60_000)
      if (search !== '') {
        // The search is asked after the typing, so the picture waits for the count beside Everything to change.
        const all = app.page.locator('.rec-facet').first()
        await all.waitFor({ state: 'visible', timeout: 30_000 })
        const before = await all.textContent()
        await app.page.getByLabel(sayInEnglish('g7a.records.search')).fill(search)
        await expect.poll(async () => all.textContent(), { timeout: 30_000 }).not.toBe(before)
      }
      if (path === '/records') await app.page.getByText(title).first().waitFor({ state: 'visible', timeout: 30_000 })
      else if (path === '/notes') await app.page.locator('main a[href^="#/r/"]').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined)
      else await app.page.locator('.rp-crumbs').first().waitFor({ state: 'visible', timeout: 30_000 })
      await app.page.screenshot({ path: `${shots}/${name}-${String(width)}-${theme}.png`, fullPage: false })
    }
    for (const [name, path] of [['role-request', `/r/${ask}`], ['reports-and-notes', '/notes'], ['everything', '/records']] as const) {
      for (const width of [1440, 990, 660, 390]) {
        for (const theme of ['light', 'dark'] as const) await take(name, path, width, theme)
      }
    }
    for (const theme of ['light', 'dark'] as const) await take('everything-searched', '/records', 1440, theme, 'grey-wagtail')
  }, 900_000)
})
