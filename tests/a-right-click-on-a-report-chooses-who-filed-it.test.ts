// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RIGHT-CLICK ON A PASSAGE OF A REPORT AN AGENT FILED OPENS ADDRESSED TO THAT AGENT. Problem
 * Nu0y2IKdzPcw, and item 5 of a decision.
 *
 * The owner right-clicked a passage in report YcJRwBmhvppQ, which the secretary filed. The composer opened with
 * nobody chosen and the owner had to press again to choose the secretary. The composer now chooses the first agent
 * of the one ranking (src/shared/recipient-ranking.ts), says why beside the name, and one press on
 * another contact changes it.
 *
 * The other half is held as well: a report the person filed has nobody on the ranking, and the
 * composer opens with nobody chosen, as it did before.
 *
 * How to tell it is back: right-click a passage in a report an agent filed, and no recipient is chosen.
 *
 * Test change (wave 13y round 169, point RC-3 of the right-click box): after his first use of the box, the owner asked
 * that the contact list lose its explanations, put the record's creator first with "submitted this record", and pin
 * the department's secretary. The words "filed this" beside To go, and nothing stands beside the chosen name. The list
 * opens with the agent that filed the record first, saying it submitted this record. Then come the secretaries with
 * duties in the record's project, each saying it is this project's secretary, in the order the duties door answers
 * them; a secretary with no duties in the project is not pinned. Then the chat's contacts follow in the chat's order,
 * with no words beside the names and no pinned contact drawn twice. On a report the person filed, only the secretary
 * is pinned. The made-up secretaries are registered here, since a test office has none.
 *
 * PICTURES. When R20_SHOTS names a folder, the composer is photographed open on the agent's report, its recipient chosen,
 * at 1440, 990, 660 and 390 in both looks and at 1440 in Chinese, with the person renamed so no picture carries the
 * test's own name. The ordinary run takes none.
 */
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { mkdirSync } from 'node:fs'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp, governsTheWholeProject } from './helpers.ts'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_OWNER } from '../src/shared/kinds.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_SECRETARY } from '../src/shared/roles.ts'

let app: LiveApp
let page: Page
let byTheAgent = ''
let byThePerson = ''
const names = new Map<string, string>()
/** The names of the secretaries with duties in this project, in the order the duties door answers them. */
let pinnedSecretaries: string[] = []
/** The made-up secretaries: one with duties in this project, and one with none, which is not pinned. */
const WITH_DUTIES = { handle: 'made-up-project-secretary', name: 'Made-up Project Secretary' }
const WITHOUT_DUTIES = { handle: 'made-up-idle-secretary', name: 'Made-up Idle Secretary' }
/** The words the box draws, read by their keys. */
const { t } = createI18n('en')

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS = (handle: string) => ({ ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })

async function write(headers: Record<string, string>, body: unknown): Promise<string> {
  const res = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
  const text = await res.text()
  expect(res.status, text).toBe(201)
  return (JSON.parse(text) as { record: { id: string } }).record.id
}

const report = (title: string) => ({
  kind: 'report',
  title,
  data: {
    for: 'Robin Vale',
    date: '2026-09-30',
    blocks: [
      { id: 'b-1', type: 'text', heading: 'What I found', text: 'The mount holds calibration through a full handover.' },
      { id: 'b-2', type: 'text', heading: 'What moved', text: 'The mast is the part that moved between the two runs.' },
    ],
  },
})

beforeAll(async () => {
  app = await liveApp({ opensAt: 'full', name: 'r20-recipient', viewport: { width: 1440, height: 1000 } })
  page = app.page
  for (const [title, handle] of [
    [`${THE_TEST_OFFICES_SECRETARY.name} the reviewer`, `${THE_TEST_OFFICES_SECRETARY.handle}-r20`],
    ['Vela the wiring agent', 'vela-r20'],
  ] as const) {
    await write(AS_THE_PERSON, { kind: 'agent', title, data: { handle, runtime: 'claude-code', state: 'active' } })
  }
  // TWO MADE-UP SECRETARIES, registered with the secretary's card as tests/a-duties-page-names-its-secretary-and-its-doors
  // registers one. Only the first has duties in this project, resting on a made-up decision of the owner's.
  const secretaryIds: string[] = []
  for (const one of [WITH_DUTIES, WITHOUT_DUTIES]) {
    const started = await fetch(`${app.api}/api/agents/started`, {
      method: 'POST',
      headers: AS_THE_PERSON,
      body: JSON.stringify({ handle: one.handle, name: one.name, role: THE_SECRETARY }),
    })
    const text = await started.text()
    expect(started.status, text).toBe(201)
    secretaryIds.push((JSON.parse(text) as { agent: { id: string } }).agent.id)
  }
  const decision = await write(AS_THE_PERSON, {
    kind: 'decision',
    title: 'Made-up decision: the made-up project secretary keeps this project',
    data: { option_taken: 'Made-up: the made-up project secretary keeps this project.', because: 'Made-up reason.', decided_by: THE_OWNER,
      ...governsTheWholeProject(), replaces: [] },
  })
  await write(AS_THE_PERSON, {
    kind: 'secretary_duties',
    title: 'Made-up duties of the made-up project secretary',
    data: { secretary: { kind: 'agent', id: secretaryIds[0] }, area: 'Made-up: this project, kept by the made-up project secretary.', restsOn: [decision] },
  })
  // BOTH AGENTS WRITE TO THE PERSON, so both are contacts in the chat and in the composer's list.
  for (const handle of [`${THE_TEST_OFFICES_SECRETARY.handle}-r20`, 'vela-r20']) {
    await write(AS(handle), {
      kind: 'message',
      title: 'A note',
      data: { body: 'The harness for the second arm is labelled now.', to: [{ kind: 'person', id: THE_PERSON }] },
    })
  }
  const registries = (await (await fetch(`${app.api}/api/participants`, { headers: AS_THE_PERSON })).json()) as {
    agents: { id: string; handle: string; name: string }[]
  }
  for (const one of registries.agents) names.set(one.handle, one.name)
  // WHO IS PINNED IS THE DOOR'S ANSWER for this project, without scope=office: each secretary with duties here.
  const duties = (await (await fetch(`${app.api}/api/secretaries/duties`, { headers: AS_THE_PERSON })).json()) as {
    secretaries: { agent: { id: string; name: string }; duties: unknown }[]
  }
  expect(duties.secretaries.map((one) => [one.agent.id, one.duties !== null]), 'the door lists both made-up secretaries').toEqual(
    expect.arrayContaining([
      [secretaryIds[0], true],
      [secretaryIds[1], false],
    ]),
  )
  pinnedSecretaries = duties.secretaries.filter((one) => one.duties !== null).map((one) => one.agent.name)
  expect(pinnedSecretaries, 'the secretaries with duties in this project').toEqual([WITH_DUTIES.name])
  byTheAgent = await write(AS(`${THE_TEST_OFFICES_SECRETARY.handle}-r20`), report('What the second calibration run showed'))
  byThePerson = await write(AS_THE_PERSON, report('What the third calibration run showed'))
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

async function rightClickAPassageOf(reportId: string): Promise<void> {
  await page.goto(`${app.site}/#/r/${reportId}`, { timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  const run = '[data-text-field="data.blocks[#b-2].text"]'
  await page.locator(run).waitFor({ timeout: 30_000 })
  await page.locator(run).evaluate((el) => el.scrollIntoView({ block: 'center' }))
  const at = await page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel)
    if (el === null) throw new Error('the paragraph is not drawn')
    const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode() as Text
    const range = document.createRange()
    range.setStart(node, 0)
    range.setEnd(node, 25)
    const s = window.getSelection()
    s?.removeAllRanges()
    s?.addRange(range)
    const r = range.getClientRects()[0]
    if (r === undefined) throw new Error('the words have no box')
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  }, run)
  await page.mouse.click(at.x, at.y, { button: 'right' })
  await page.locator('.px-talk').waitFor({ timeout: 20_000 })
}

const theToButton = () => page.locator('.px-talk .px-talk-to-btn')
/** Any words about why a contact is chosen, beside To: the old line and its rung, by either of its marks. */
const anyWhyBesideTo = () => page.locator('.px-talk .px-talk-why-chosen, .px-talk .px-talk-to [data-rung]')

/** Open the box's contact list and read each row: its name, and the words beside the name, or null for none. */
async function theListAsDrawn(): Promise<{ name: string; relation: string | null }[]> {
  await theToButton().click()
  await page.locator('.px-talk .px-talk-contact').first().waitFor({ timeout: 20_000 })
  return await page.locator('.px-talk .px-talk-contact').evaluateAll((all) =>
    all.map((one) => {
      const words = [...one.querySelectorAll<HTMLElement>('.px-talk-contact-relation')].map((each) => each.innerText.trim())
      return {
        name: (one.querySelector<HTMLElement>('.px-talk-contact-name')?.innerText ?? '').trim(),
        relation: words.length === 0 ? null : words.join(' '),
      }
    }),
  )
}

/** The name the registry gives a handle, which must be there. */
const nameOf = (handle: string): string => {
  const name = names.get(handle) ?? ''
  expect(name, `the registry names ${handle}`).not.toBe('')
  return name
}

describe('a right-click on a passage of a report', () => {
  it('opens addressed to the agent that filed the report, with no words beside the name', async () => {
    const filer = nameOf(`${THE_TEST_OFFICES_SECRETARY.handle}-r20`)
    await rightClickAPassageOf(byTheAgent)
    await expect.poll(async () => (await theToButton().innerText()).replace(/\s+/g, ' ').trim(), { timeout: 20_000 }).toBe(
      `${filer} ▾`,
    )
    expect(await anyWhyBesideTo().count(), 'words beside To about why the contact is chosen').toBe(0)
    expect(await page.locator('.px-talk .px-talk-refusal').count(), 'Send is not refused for want of a reader').toBe(0)
  }, 180_000)

  it('opens the list with the agent that filed the report first, then this project\'s secretary, then the rest with no words', async () => {
    const filer = nameOf(`${THE_TEST_OFFICES_SECRETARY.handle}-r20`)
    await rightClickAPassageOf(byTheAgent)
    await expect.poll(async () => (await theToButton().innerText()).replace(/\s+/g, ' ').trim(), { timeout: 20_000 }).toBe(
      `${filer} ▾`,
    )
    const rows = await theListAsDrawn()
    expect(rows.slice(0, 1 + pinnedSecretaries.length), 'the pinned rows').toEqual([
      { name: filer, relation: t('talk.contacts.submittedThisRecord') },
      ...pinnedSecretaries.map((name) => ({ name, relation: t('talk.contacts.thisProjectsSecretary') })),
    ])
    const rest = rows.slice(1 + pinnedSecretaries.length)
    expect(rest.filter((one) => one.relation !== null), 'words beside a name after the pinned rows').toEqual([])
    expect(rest.map((one) => one.name), 'the rest holds the other contact').toContain(nameOf('vela-r20'))
    expect(rest.map((one) => one.name), 'a pinned contact is not drawn twice').not.toContain(filer)
    for (const name of pinnedSecretaries) expect(rest.map((one) => one.name), 'a pinned secretary is not drawn twice').not.toContain(name)
    expect(rows.some((one) => one.name === WITHOUT_DUTIES.name && one.relation !== null), 'a secretary with no duties here is pinned').toBe(false)
    await page.keyboard.press('Escape')
  }, 180_000)

  it('lets the person choose another contact, and no words stand beside it', async () => {
    const vela = nameOf('vela-r20')
    await rightClickAPassageOf(byTheAgent)
    await expect.poll(async () => (await theToButton().innerText()).replace(/\s+/g, ' ').trim(), { timeout: 20_000 }).toBe(
      `${nameOf(`${THE_TEST_OFFICES_SECRETARY.handle}-r20`)} ▾`,
    )
    await theToButton().click()
    await page.locator('.px-talk-contact', { hasText: vela }).first().click()
    await expect.poll(async () => (await theToButton().innerText()).replace(/\s+/g, ' ').trim(), { timeout: 20_000 }).toBe(
      `${vela} ▾`,
    )
    expect(await anyWhyBesideTo().count(), 'no reason is drawn for a choice the person made').toBe(0)
  }, 180_000)

  it('opens with nobody chosen on a report the person filed, where the ranking names nobody, and pins only the secretary', async () => {
    // THE BOX'S OWN RANKING ANSWER IS WAITED FOR, so "nobody" is the answer and not a read still in flight.
    const ranked = page.waitForResponse(
      (reply) => reply.request().method() === 'GET' && reply.url().includes('/api/agent/recipients/agents'),
      { timeout: 20_000 },
    )
    await rightClickAPassageOf(byThePerson)
    expect(((await (await ranked).json()) as { agents: unknown[] }).agents).toEqual([])
    const answer = (await (
      await fetch(`${app.api}/api/agent/recipients/agents?record=${byThePerson}`, { headers: AS_THE_PERSON })
    ).json()) as { agents: unknown[] }
    expect(answer.agents).toEqual([])
    expect((await theToButton().innerText()).replace(/\s+/g, ' ').trim()).toBe('Choose a contact ▾')
    expect(await anyWhyBesideTo().count()).toBe(0)
    const rows = await theListAsDrawn()
    expect(rows.slice(0, pinnedSecretaries.length), 'the pinned rows').toEqual(
      pinnedSecretaries.map((name) => ({ name, relation: t('talk.contacts.thisProjectsSecretary') })),
    )
    expect(rows.slice(pinnedSecretaries.length).filter((one) => one.relation !== null), 'words beside a name after the pinned rows').toEqual([])
    await page.keyboard.press('Escape')
  }, 180_000)
})

describe('the pictures', () => {
  it.skipIf(!process.env['R20_SHOTS'])('photographs the composer open on the agent\'s report, its recipient chosen', async () => {
    const dir = process.env['R20_SHOTS'] as string
    mkdirSync(dir, { recursive: true })
    const renamed = await fetch(`${app.api}/api/participants/person/${THE_PERSON}`, {
      method: 'PATCH',
      headers: AS_THE_PERSON,
      body: JSON.stringify({ name: 'Morgan Vale' }),
    })
    expect(renamed.status, await renamed.text()).toBe(200)
    const shots: [number, 'light' | 'dark', 'en' | 'zh'][] = [
      ...[1440, 990, 660, 390].flatMap((width) => (['light', 'dark'] as const).map((look) => [width, look, 'en'] as [number, 'light' | 'dark', 'en'])),
      [1440, 'light', 'zh'],
      [1440, 'dark', 'zh'],
    ]
    for (const [width, look, lang] of shots) {
      const one = await app.browser.newPage({ viewport: { width, height: 1000 } })
      await one.addInitScript((theme) => localStorage.setItem('mole-office.preset.theme', theme), look)
      const keep = page
      page = one
      try {
        await one.goto(`${app.site}/${lang === 'en' ? '' : `?lang=${lang}`}#/r/${byTheAgent}`, { timeout: 60_000 })
        await waitForThePage(one, 60_000)
        const run = '[data-text-field="data.blocks[#b-2].text"]'
        await one.locator(run).waitFor({ timeout: 30_000 })
        await one.locator(run).evaluate((el) => el.scrollIntoView({ block: 'center' }))
        const at = await one.evaluate((sel) => {
          const el = document.querySelector<HTMLElement>(sel)
          if (el === null) throw new Error('the paragraph is not drawn')
          const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode() as Text
          const range = document.createRange()
          range.setStart(node, 0)
          range.setEnd(node, 25)
          window.getSelection()?.removeAllRanges()
          window.getSelection()?.addRange(range)
          const r = range.getClientRects()[0]
          if (r === undefined) throw new Error('the words have no box')
          return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
        }, run)
        await one.mouse.click(at.x, at.y, { button: 'right' })
        await one.locator('.px-talk .px-talk-to-btn').waitFor({ timeout: 20_000 })
        await one.screenshot({ path: `${dir}/composer-${String(width)}-${look}-${lang}.png` })
      } finally {
        page = keep
        await one.close()
      }
    }
  }, 600_000)
})
