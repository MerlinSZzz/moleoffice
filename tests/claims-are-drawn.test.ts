// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO IS WORKING ON THIS, ON THE RECORD PAGE AND ON THE CLAIMS PAGE, IN A REAL BROWSER.
 *
 * Criterion M13 of design/messages/ACCEPTANCE.md: *Claims are drawn on the record and on the
 * dashboard.* And the human act, section 7.3 item 5: *Two agents claim the same module; a group
 * opens with the owner in it and a system line says why.*
 *
 * WHY THIS NEEDS A BROWSER. A read that runs and a line that draws are two different claims, and
 * the second one is what the owner was promised. The conflict colour is the part that cannot be checked
 * anywhere else at all: `data-conflict` is set from the overlap the server reports, and a page that
 * fetched the overlap and drew nothing red would pass every other kind of test.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

let app: LiveApp
let page: Page
let theModule = ''
let groupName = ''

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

function asAgent(handle: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
  }
}

async function post(path: string, body: unknown, headers: Record<string, string>): Promise<unknown> {
  const res = await fetch(`${app.api}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return await res.json()
}

beforeAll(async () => {
  app = await liveApp({ name: 'claims-are-drawn', viewport: { width: 1440, height: 1000 } })
  page = app.page

  const made = (await post(
    '/api/records',
    { kind: 'module', title: 'The gripper module', summary: 'Calibrating effort into grip force.', data: {} },
    AS_THE_OWNER,
  )) as { record: { id: string } }
  theModule = made.record.id

  const runs: Record<string, string> = {}
  for (const handle of ['builder-x', 'checker-y']) {
    await post('/api/records', { kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code', workArea: ['src'] } }, AS_THE_OWNER)
    const run = (await post(
      '/api/records',
      { kind: 'session', title: `${handle} on the gripper`, data: { state: 'running', runtime: 'claude-code' } },
      asAgent(handle),
    )) as { record: { id: string } }
    runs[handle] = run.record.id
  }

  // BOTH AGENTS CLAIM THE SAME MODULE. The second claim is what opens the group, and nobody is
  // asked: after a conflict, the group opens and the person is added to it automatically.
  await post(
    '/api/claims',
    { run: runs['builder-x'], things: [{ what: 'record', id: theModule }] },
    asAgent('builder-x'),
  )
  const second = (await post(
    '/api/claims',
    { run: runs['checker-y'], things: [{ what: 'record', id: theModule }] },
    asAgent('checker-y'),
  )) as { groupsOpened: string[] }
  expect(second.groupsOpened, 'the second claim opened no group, so there is no conflict to draw').toHaveLength(1)

  const groups = (await (
    await fetch(`${app.api}/api/groups`, { headers: AS_THE_OWNER })
  ).json()) as { groups: { id: string; name: string }[] }
  groupName = groups.groups.find((one) => one.id === second.groupsOpened[0])?.name ?? ''
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the record page says who is working on this', () => {
  it('draws a line per claim, and marks both of them as being in conflict', async () => {
    await page.goto(`${app.site}/#/r/${theModule}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.waitForSelector('.claims-row', { timeout: 30_000 })
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('.claims-row')].map((one) => ({
        conflict: one.getAttribute('data-conflict'),
        text: (one as HTMLElement).innerText,
      })),
    )
    expect(rows).toHaveLength(2)
    expect(rows.every((one) => one.conflict === 'yes')).toBe(true)
    expect(rows.map((one) => one.text).join(' ')).toContain('builder-x')
    expect(rows.map((one) => one.text).join(' ')).toContain('checker-y')
    // THE LEASE LINE SAYS WHICH INPUT ANSWERED, so a reader is never shown a strength the answer
    // does not have. Neither run registered a process, so both say the weak one.
    expect(rows.map((one) => one.text).join(' ')).toContain('Nothing was registered for this run')
    const heading = await page.evaluate(() => document.body.innerText)
    expect(heading).toContain('Who is working on this')
  }, 120_000)

  it('draws nothing at all on a record nobody has claimed', async () => {
    const other = (await post(
      '/api/records',
      { kind: 'note', title: 'A note nobody is working on', data: { body: 'Nothing claims this.' } },
      AS_THE_OWNER,
    )) as { record: { id: string } }
    await page.goto(`${app.site}/#/r/${other.record.id}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.waitForTimeout(1500)
    const rows = await page.evaluate(() => document.querySelectorAll('.claims-row').length)
    expect(rows, 'an empty panel on every record would be permanent furniture').toBe(0)
    const said = await page.evaluate(() => document.body.innerText)
    expect(said).not.toContain('Who is working on this')
  }, 120_000)
})

// THE CLAIMS PAGE DRAWS THE CLAIMS, ONE PRESS FROM HOME'S AGENTS AT WORK. They were put in Agents at
// work. Another decision moved them to their own page and left a press to it
// in that section. So the press is followed from Home, and the claims are
// looked for on the page it opens and nowhere else.
describe('the Claims page, one press from Agents at work, draws what each agent has claimed', () => {
  it('draws both claims, the conflict in the conflict colour, and names the group it is being sorted out in', async () => {
    await page.goto(`${app.site}/#/`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    await page.locator('[data-home-section="agents"] [data-home-goes="claims"]').click({ timeout: 30_000 })
    await page.waitForSelector('[data-away-from-home="claims"] .hm-claim', { timeout: 30_000 })
    const drawn = await page.evaluate(() => {
      const section = document.querySelector('[data-away-from-home="claims"]')!
      return {
        rows: [...section.querySelectorAll('.hm-claim')].map((one) => one.getAttribute('data-conflict')),
        who: [...section.querySelectorAll('.hm-claim')].map((one) => (one as HTMLElement).innerText),
        conflict: [...section.querySelectorAll('.hm-claim-conflict')].map((one) => (one as HTMLElement).innerText),
        colour: [...section.querySelectorAll('.hm-claim-conflict')].map((one) => getComputedStyle(one).color),
        heading: (section.querySelector('.hm-claims-title') as HTMLElement | null)?.innerText ?? '',
      }
    })
    expect(drawn.rows).toHaveLength(2)
    expect(drawn.rows.every((one) => one === 'yes')).toBe(true)
    expect(drawn.who.join(' ')).toContain('builder-x')
    expect(drawn.who.join(' ')).toContain('checker-y')
    expect(drawn.who.join(' '), 'a claim row does not say what was claimed').toContain('The gripper module')
    expect(drawn.heading, 'the claims are drawn with no heading saying what they are').toMatch(/^Claimed in /)
    expect(drawn.conflict.join(' ')).toContain('Two agents are working on this at the same time.')
    expect(drawn.conflict.join(' ')).toContain(groupName)
    // THE COLOUR THAT MEANS SOMETHING, read off the live page rather than off the stylesheet. A rule
    // that never reached the element would leave this the ordinary ink.
    const ordinary = await page.evaluate(() => getComputedStyle(document.body).color)
    expect(drawn.colour[0], 'the conflict is drawn in the same colour as everything else').not.toBe(ordinary)
  }, 120_000)
})
