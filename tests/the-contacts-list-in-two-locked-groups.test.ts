// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CONTACTS LIST IN TWO LOCKED TOP GROUPS — CRITERIA M119 TO M124.
 *
 * The groups are rebuilt. The first level is two groups, human and agent, kept apart: their names
 * cannot be changed, and an agent cannot go into the human group or a human into the agent group. Criterion M119.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT EACH HALF PROVES, AND THE MUTATION THAT TURNS IT RED
 * ---------------------------------------------------------------------------------------
 *
 *   (a) the server refuses a move across the line, both ways          mutation: the refusal dropped
 *   (b) the agent groups are role groups in the owner's order, newest first   mutation: the order broken
 *   (c) retired is folded by default and a fold survives a reload
 *       with the browser's own storage cleared                        mutation: the fold kept locally
 *   (d) the New agent press is beside Agent and nowhere else          mutation: the header button back
 *   (e) no group heading draws a count                                mutation: a count drawn
 *   (f) the filter box is in the row a scroll up shows above the list,
 *       and it narrows the rows                                       mutations: the row always shown;
 *                                                                     the row never shown
 *
 * THE CONTROL RUN COMES FIRST for every case: the unmutated file passes, then the mutation is made,
 * the failing line is read, and the mutation is restored. A run that never started looks exactly
 * like a run that failed, which is why the control is stated rather than assumed.
 *
 * ---------------------------------------------------------------------------------------
 * THIS FILE REPLACES `the-contacts-list-is-grouped.test.ts`
 * ---------------------------------------------------------------------------------------
 *
 * That file asserted the arrangement before M119: three first-level groups `human`, `agent` and
 * `special`, an `Arrange` press above the list, and a built-in `human` group renamed by hand. Every
 * one of those is what M119 to M123 replaced, so its still-true cases — a group somebody made, a
 * default one renamed, a contact moved within its side, one arrangement per person — are carried
 * here, and its obsolete assertions are gone rather than left failing.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { CONTACT_SIDES } from '../src/shared/contacts.ts'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': 'default',
}

const asAnAgent = (handle: string): Record<string, string> => ({
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

/** One contact row as these cases read it. */
interface Row {
  key: string
  group: string
  at: number
  unread: number
  who: { kind: string; id: string } | null
}

interface Reply {
  contacts: Row[]
  contactGroups: { key: string; name: string; at: number; made: boolean; side: string; collapsed: boolean }[]
  contactSides: { key: string; name: string; collapsed: boolean }[]
  unread: number
}

// ============================================================================ the API half

describe('criteria M119 and M120: the server places the contacts and refuses a crossing', () => {
  let t: TestDb
  let app: FastifyInstance

  /**
   * The registry id the office gave each agent, by handle. A contact's key is `agent:<registry id>`,
   * never `agent:<handle>`.
   */
  const idOf = new Map<string, string>()
  const keyOf = (handle: string): string => {
    const id = idOf.get(handle)
    expect(id, `${handle} was not registered by this case`).toBeDefined()
    return `agent:${id}`
  }

  const anAgent = (title: string, handle: string, role: string): void => {
    const record = t.api.createRecord({
      workspaceId: 'default',
      kind: 'agent',
      title,
      data: { handle, runtime: 'claude-code', state: 'active', role },
      actor: { type: 'human', id: THE_PERSON },
    })
    const row = t.client.sqlite.prepare('SELECT agent_id AS id FROM agent_records WHERE record_id = ?').get(record.id) as
      | { id: string }
      | undefined
    expect(row, `${handle} has no registry row`).toBeDefined()
    idOf.set(handle, row!.id)
  }

  const say = async (handle: string, body: string): Promise<void> => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asAnAgent(handle),
      payload: { kind: 'message', title: body.slice(0, 30), data: { body, to: [{ kind: 'person', id: THE_PERSON }] } },
    })
    expect(res.statusCode, res.body).toBe(201)
  }

  const contacts = async (): Promise<Reply> => {
    const res = await app.inject({ method: 'GET', url: '/api/messages/contacts', headers: AS_THE_OWNER })
    expect(res.statusCode, res.body).toBe(200)
    return res.json() as Reply
  }

  const rowsStored = (): { groups: number; placements: number; folds: number } => ({
    groups: (t.client.sqlite.prepare('SELECT count(*) AS n FROM contact_groups').get() as { n: number }).n,
    placements: (t.client.sqlite.prepare('SELECT count(*) AS n FROM contact_placements').get() as { n: number }).n,
    folds: (t.client.sqlite.prepare('SELECT count(*) AS n FROM contact_group_collapses').get() as { n: number }).n,
  })

  beforeEach(async () => {
    t = await freshDb()
    app = (await apiApp()).app
    anAgent('A secretary', 'sec-one', 'secretary')
    anAgent('An inspector', 'insp-one', 'inspector')
    anAgent('A supervisor', 'sup-one', 'supervisor')
    anAgent('A worker', 'work-one', 'worker')
    anAgent('Another worker', 'work-two', 'worker')
    anAgent('A retired worker', 'gone-one', 'worker')
    const retired = await app.inject({
      method: 'POST',
      url: '/api/participants/agent/gone-one/retire',
      headers: AS_THE_OWNER,
      payload: { because: 'a case that needs one retired agent' },
    })
    expect(retired.statusCode, retired.body).toBe(200)
  })

  afterEach(async () => {
    await app.close()
    t.close()
  })

  // ------------------------------------------------------------------ (a) the locked line

  it('refuses moving an agent into a human-side group and a person into an agent-side group', async () => {
    // A GROUP THE PERSON MADE ON THE HUMAN SIDE, so the refusal is about the SIDE and not about the
    // group being one of the declared ones.
    const made = await app.inject({
      method: 'POST',
      url: '/api/messages/contact-groups',
      headers: AS_THE_OWNER,
      payload: { name: 'People I know', side: 'human' },
    })
    expect(made.statusCode, made.body).toBe(201)
    const humanGroup = (made.json() as { group: { key: string } }).group.key

    // AN AGENT INTO IT, through the real move door.
    const agentIntoMade = await app.inject({
      method: 'POST',
      url: '/api/messages/contact-placements',
      headers: AS_THE_OWNER,
      payload: { contact: keyOf('work-one'), group: humanGroup },
    })
    expect(agentIntoMade.statusCode, agentIntoMade.body).toBe(409)
    expect(String((agentIntoMade.json() as { error: string }).error)).toMatch(/Human/)

    // AND INTO THE HUMAN DEFAULT GROUP, so the refusal does not depend on the group being made.
    const agentIntoPeople = await app.inject({
      method: 'POST',
      url: '/api/messages/contact-placements',
      headers: AS_THE_OWNER,
      payload: { contact: keyOf('work-one'), group: 'people' },
    })
    expect(agentIntoPeople.statusCode, agentIntoPeople.body).toBe(409)

    // A PERSON INTO AN AGENT-SIDE GROUP, through the same library the door calls. No door here
    // registers a second person, so the one contact shape a person has is handed in directly.
    const contactsLib = await import('../src/server/lib/contacts.ts')
    const me = { kind: 'person' as const, id: THE_PERSON }
    const agentGroup = contactsLib.groupsOf(me).find((one) => one.side === 'agent')
    expect(agentGroup, 'the agent side has no group at all').toBeDefined()
    expect(() =>
      contactsLib.moveAContact(
        me,
        [{ key: 'person:someone', kind: 'person', id: 'someone', role: null, retired: false }],
        'person:someone',
        agentGroup?.key ?? '',
      ),
    ).toThrow(/Agent/)

    // AND NOTHING WAS WRITTEN BY ANY REFUSED MOVE.
    expect(rowsStored().placements).toBe(0)
  })

  it('refuses renaming or moving the two locked top groups', async () => {
    const renamed = await app.inject({
      method: 'PATCH',
      url: '/api/messages/contact-groups/human',
      headers: AS_THE_OWNER,
      payload: { name: 'People' },
    })
    expect(renamed.statusCode, renamed.body).toBe(409)

    const moved = await app.inject({
      method: 'PATCH',
      url: '/api/messages/contact-groups/agent',
      headers: AS_THE_OWNER,
      payload: { moveBy: -1 },
    })
    expect(moved.statusCode, moved.body).toBe(409)

    const reply = await contacts()
    expect(reply.contactSides.map((one) => one.name)).toEqual(CONTACT_SIDES.map((one) => one.name))
    expect(rowsStored().groups).toBe(0)
  })

  // ------------------------------------------------------------------ (b) the role order

  it('has the agent groups by role, in the owner\'s order, with nothing stored', async () => {
    const reply = await contacts()
    const agentSide = reply.contactGroups.filter((one) => one.side === 'agent').map((one) => one.key)
    // THE ORDER IS WRITTEN OUT HERE rather than read from `AGENT_ROLE_GROUPS`. Reading the same
    // declaration the server orders by would make this assertion follow any change to it, and the
    // mutation that breaks the order would leave the test green — which is the defect this whole
    // exercise is about.
    expect(agentSide).toEqual(['secretary', 'inspector', 'supervisor', 'worker', 'other', 'retired'])
    expect(reply.contactGroups.filter((one) => one.side === 'human').map((one) => one.key)).toEqual(['people'])
    // NOTHING WAS WRITTEN BY READING. An implementation that seeded the default groups would answer
    // the same list.
    expect(rowsStored()).toEqual({ groups: 0, placements: 0, folds: 0 })
  })

  it('puts each agent in its role group, a no-row writer in other, and a retired agent in retired', async () => {
    const reply = await contacts()
    const where = new Map(reply.contacts.map((row) => [row.key, row.group]))
    expect(where.get(keyOf('sec-one'))).toBe('secretary')
    expect(where.get(keyOf('insp-one'))).toBe('inspector')
    expect(where.get(keyOf('sup-one'))).toBe('supervisor')
    expect(where.get(keyOf('work-one'))).toBe('worker')
    expect(where.get(keyOf('gone-one')), 'M114 said not drawn; M121 puts it in the retired group').toBe('retired')

    // A WRITER NOBODY REGISTERED, made the way those rows now only exist: filed by the owner and then
    // given a legacy writer's shape, because the message door refuses a registration-less sender.
    const said = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_OWNER,
      payload: {
        kind: 'message',
        title: 'a line from nobody',
        data: { body: 'a line from nobody', to: [{ kind: 'person', id: THE_PERSON }] },
      },
    })
    expect(said.statusCode, said.body).toBe(201)
    const written = (JSON.parse(said.body) as { record: { id: string } }).record.id
    t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.sentBy') WHERE id = ?").run(written)
    t.client.sqlite
      .prepare("UPDATE changes SET actor_type = 'agent', actor_id = 'nobody-registered' WHERE record_id = ?")
      .run(written)
    const after = await contacts()
    const writer = after.contacts.find((row) => row.who === null)
    expect(writer, 'no unregistered writer reached the contacts at all').toBeDefined()
    expect(writer?.group, 'other holds every address with no registry row').toBe('other')
  })

  it('orders within a group by the last message, newest first', async () => {
    // ONE GROUP WITH TWO CONTACTS: the worker group. The first line is older than the second, so the
    // second contact comes first.
    await say('work-one', 'the older line')
    await say('work-two', 'the newer line')
    const reply = await contacts()
    const workers = reply.contacts.filter((row) => row.group === 'worker').map((row) => row.key)
    expect(workers.indexOf(keyOf('work-two'))).toBeLessThan(workers.indexOf(keyOf('work-one')))
    // AND THE ORDER IS THE GROUP'S, not the whole list's: a secretary with no message at all is not
    // dragged into the worker group by the sort.
    expect(reply.contacts.find((row) => row.key === keyOf('sec-one'))?.group).toBe('secretary')
  })

  // ------------------------------------------------------------------ M120's second level is editable

  it('adds, renames and moves inside one side, and one person does not change another', async () => {
    const made = await app.inject({
      method: 'POST',
      url: '/api/messages/contact-groups',
      headers: AS_THE_OWNER,
      payload: { name: 'Builders', side: 'agent' },
    })
    expect(made.statusCode, made.body).toBe(201)
    const madeGroup = (made.json() as { group: { key: string; side: string } }).group
    expect(madeGroup.side).toBe('agent')

    const moved = await app.inject({
      method: 'POST',
      url: '/api/messages/contact-placements',
      headers: AS_THE_OWNER,
      payload: { contact: keyOf('work-one'), group: madeGroup.key },
    })
    expect(moved.statusCode, moved.body).toBe(200)
    expect((await contacts()).contacts.find((row) => row.key === keyOf('work-one'))?.group).toBe(madeGroup.key)

    const renamed = await app.inject({
      method: 'PATCH',
      url: '/api/messages/contact-groups/worker',
      headers: AS_THE_OWNER,
      payload: { name: 'Builders at work' },
    })
    expect(renamed.statusCode, renamed.body).toBe(200)

    // THE SAME READ AS AN AGENT HAS AN ARRANGEMENT OF ITS OWN AND HAS CHANGED NOTHING.
    const asAnAgentRead = await app.inject({
      method: 'GET',
      url: '/api/messages/contacts',
      headers: asAnAgent('sec-one'),
    })
    expect(asAnAgentRead.statusCode, asAnAgentRead.body).toBe(200)
    const theirs = asAnAgentRead.json() as Reply
    expect(theirs.contactGroups.find((one) => one.key === 'worker')?.name).toBe('Worker')
  })

  it('refuses a group nobody has, a contact nobody has, and a name with nothing in it', async () => {
    const noGroup = await app.inject({
      method: 'PATCH',
      url: '/api/messages/contact-groups/nothing',
      headers: AS_THE_OWNER,
      payload: { name: 'Anything' },
    })
    expect(noGroup.statusCode).toBe(404)

    const noContact = await app.inject({
      method: 'POST',
      url: '/api/messages/contact-placements',
      headers: AS_THE_OWNER,
      payload: { contact: 'agent:nobody', group: 'worker' },
    })
    expect(noContact.statusCode).toBe(404)

    const noName = await app.inject({
      method: 'POST',
      url: '/api/messages/contact-groups',
      headers: AS_THE_OWNER,
      payload: { name: '   ', side: 'agent' },
    })
    expect(noName.statusCode).toBe(400)
    expect(rowsStored()).toEqual({ groups: 0, placements: 0, folds: 0 })
  })
})

// ============================================================================ the browser half

/** The names the browser cases look for. */
const RETIRED_NAME = 'Atlas Retired'
const LIVE_NAME = 'Bruno Live'
const SECRETARY_NAME = 'Cora Secretary'

const AS_THE_OWNER_BROWSER = AS_THE_OWNER

async function anAgentOverHttp(app: LiveApp, title: string, handle: string, role: string): Promise<void> {
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER_BROWSER,
    body: JSON.stringify({
      kind: 'agent',
      title,
      data: { handle, runtime: 'claude-code', state: 'active', role },
    }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
}

async function sayOverHttp(app: LiveApp, handle: string, body: string): Promise<void> {
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: asAnAgent(handle),
    body: JSON.stringify({
      kind: 'message',
      title: body.slice(0, 30),
      data: { body, to: [{ kind: 'person', id: THE_PERSON }] },
    }),
  })
  expect(said.status, await said.clone().text()).toBe(201)
}

/** Open the panel on the contacts tab, whatever was open last time. */
async function openTheContacts(app: LiveApp): Promise<void> {
  await app.page.goto(`${app.site}/#/`)
  await waitForThePage(app.page, 30_000)
  if ((await app.page.$('.px-chat')) === null) {
    await app.page.waitForSelector('.px-chat-circle', { timeout: 20_000 })
    await app.page.click('.px-chat-circle')
  }
  await app.page.waitForSelector('.px-chat-tabs', { timeout: 20_000 })
  const back = await app.page.$('.px-chat-back')
  if (back !== null) await back.click()
  await app.page.click('.px-chat-tab[data-tab="contacts"]')
  await app.page.waitForSelector('.px-chat-under-tabs[data-showing="contacts"]', { timeout: 20_000 })
  await app.page.waitForSelector('.px-chat-top-group[data-side="agent"]', { timeout: 20_000 })
}

// ONE STACK FOR THE WHOLE FILE. Both groups of browser cases read the same office, which starts
// once and holds every agent either group looks for. A case below puts back the folds it inherits.
let app: LiveApp

beforeAll(async () => {
  app = await liveApp({ name: 'contacts-list', viewport: { width: 1440, height: 1000 } })
  await anAgentOverHttp(app, RETIRED_NAME, 'm121-retired', 'worker')
  await anAgentOverHttp(app, LIVE_NAME, 'm121-live', 'worker')
  await sayOverHttp(app, 'm121-retired', 'a line from an agent that is about to retire')
  await sayOverHttp(app, 'm121-live', 'a line from an agent that stays')
  await anAgentOverHttp(app, SECRETARY_NAME, 'm123-sec', 'secretary')
  await anAgentOverHttp(app, LIVE_NAME, 'm123-live', 'worker')
  await sayOverHttp(app, 'm123-live', 'a line that is not marked read, so a heading could count it')
  const retired = await fetch(`${app.api}/api/participants/agent/m121-retired/retire`, {
    method: 'POST',
    headers: AS_THE_OWNER_BROWSER,
    body: JSON.stringify({ because: 'the M121 case needs a retired agent in its group' }),
  })
  expect(retired.status, await retired.clone().text()).toBe(200)
}, 300_000)

afterAll(async () => {
  await app?.stop()
})

// ---------------------------------------------------------------- (c) the fold is the person's

describe('criterion M121: a fold is stored on the server and retired starts folded', () => {
  it('draws retired folded by default, and reads a fold back after storage is cleared', async () => {
    await openTheContacts(app)

    // RETIRED IS FOLDED BY DEFAULT, so its rows are not in the document at all.
    const retiredFold = await app.page.$eval('.px-chat-group-of[data-group="retired"] .px-chat-fold', (one) =>
      one.getAttribute('aria-expanded'),
    )
    expect(retiredFold, 'the retired group is not folded when the page first draws it').toBe('false')
    expect(
      await app.page.$$('.px-chat-group-of[data-group="retired"] .px-chat-contact'),
      'a retired agent is drawn while its group is folded',
    ).toHaveLength(0)

    // AND IT OPENS, so the row really is there and the fold is what hid it.
    await app.page.click('.px-chat-group-of[data-group="retired"] .px-chat-fold')
    await app.page.waitForSelector('.px-chat-group-of[data-group="retired"] .px-chat-contact', { timeout: 20_000 })

    // A FOLD THE PERSON SET ON A GROUP THAT STARTS OPEN. The worker group is folded by this press.
    await app.page.click('.px-chat-group-of[data-group="worker"] .px-chat-fold')
    await app.page.waitForFunction(
      () => document.querySelectorAll('.px-chat-group-of[data-group="worker"] .px-chat-contact').length === 0,
      undefined,
      { timeout: 20_000 },
    )

    // A FRESH PAGE WITH NOTHING KEPT IN THE BROWSER. Clearing both stores is what tells a server
    // fold apart from one the page remembered: if the state were local, this reload would forget it.
    await app.page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
    await openTheContacts(app)
    const workerFold = await app.page.$eval('.px-chat-group-of[data-group="worker"] .px-chat-fold', (one) =>
      one.getAttribute('aria-expanded'),
    )
    expect(workerFold, 'the fold did not survive a fresh page with no browser storage').toBe('false')
    expect(await app.page.$$('.px-chat-group-of[data-group="worker"] .px-chat-contact')).toHaveLength(0)
    // AND THE RETIRED GROUP THE PERSON OPENED IS STILL OPEN, for the same reason.
    const retiredAfter = await app.page.$eval('.px-chat-group-of[data-group="retired"] .px-chat-fold', (one) =>
      one.getAttribute('aria-expanded'),
    )
    expect(retiredAfter, 'the opened retired group was folded again by the reload').toBe('true')
  }, 300_000)
})

// ------------------------------------------- (d), (e), (f): the headings, the press and the filter

describe('criteria M122 to M124: the headings, the one New agent press and the filter', () => {
  // THE FOLD THE CASE ABOVE LEFT, put back: retired folded, worker open, so the filter case can see
  // a worker row it must remove rather than one a fold had already hidden.
  beforeEach(async () => {
    for (const [key, collapsed] of [
      ['worker', false],
      ['retired', true],
    ] as const) {
      const res = await fetch(`${app.api}/api/messages/contact-groups/${key}`, {
        method: 'PATCH',
        headers: AS_THE_OWNER_BROWSER,
        body: JSON.stringify({ collapsed }),
      })
      expect(res.status, await res.text()).toBe(200)
    }
  })

  it('draws the New agent press beside the Agent heading and nowhere else in the panel', async () => {
    await openTheContacts(app)

    // THE HEADER ONE IS GONE. Criterion M122 moved the M115 press; the header keeps the window
    // presses only.
    expect(
      await app.page.$$('.px-chat-chrome .px-chat-new-agent'),
      'the panel header still draws a New agent press',
    ).toHaveLength(0)

    // EXACTLY ONE IN THE PANEL, AND IT IS BESIDE AGENT.
    const inAgent = await app.page.$$('.px-chat-top-group[data-side="agent"] .px-chat-top-heading .px-chat-new-agent')
    expect(inAgent, 'the Agent heading does not carry exactly one New agent press').toHaveLength(1)
    expect(await app.page.$$('.px-chat-new-agent')).toHaveLength(1)
    expect(await app.page.$$('.px-chat-top-group[data-side="human"] .px-chat-new-agent')).toHaveLength(0)

    // THE GREY PLACEHOLDER BESIDE HUMAN, and it is not a press.
    const placeholder = await app.page.$$('.px-chat-top-group[data-side="human"] .px-chat-new-agent-placeholder')
    expect(placeholder, 'the Human heading draws no placeholder').toHaveLength(1)
    expect(await placeholder[0]?.isDisabled()).toBe(true)

    // AND THE ONE PRESS OPENS THE NEW AGENT DIALOG.
    await inAgent[0]?.click()
    await app.page.waitForSelector('.px-new-agent-dialog', { timeout: 20_000 })
    await app.page.click('.px-new-agent-dialog-cancel')
    await app.page.waitForFunction(() => document.querySelector('.px-new-agent-dialog') === null, undefined, {
      timeout: 20_000,
    })
  }, 300_000)

  it('draws no message count on any group heading', async () => {
    await openTheContacts(app)
    // THE CONTROL: the tab itself still carries an unread number, so a page that drew no number at
    // all cannot pass this by drawing nothing.
    expect(await app.page.$$('.px-chat-tab .px-chat-unread')).not.toHaveLength(0)
    const onHeadings = await app.page.$$(
      '.px-chat-top-heading .px-chat-unread, .px-chat-group-name .px-chat-unread',
    )
    expect(onHeadings, 'a group heading draws a message count').toHaveLength(0)
  }, 300_000)

  it('has the filter box in the row a scroll up shows above the list, and it narrows the rows as one types', async () => {
    await openTheContacts(app)
    // CRITERION M124 AS THE OWNER'S LATER WORD CHANGED IT (wave 13y round 113, item 45): the filter shares one row with
    // the project above the list, and that row is hidden until the list is scrolled up. So the box is out of the way
    // as M124 asked, but it no longer scrolls away with the rows.
    const shape = await app.page.evaluate(() => {
      const row = document.querySelector('.px-chat-find')
      const box = document.querySelector('.px-chat-find .px-chat-filter')
      const scroller = document.querySelector('.px-chat-under-tabs')
      if (row === null || box === null || scroller === null) return null
      return { inScroller: scroller.contains(box), shown: row.getAttribute('data-shown') }
    })
    expect(shape, 'no filter box is drawn in a row above the contacts list').not.toBeNull()
    expect(shape?.inScroller, 'the filter box is still inside the scrolling list').toBe(false)
    expect(shape?.shown, 'the row is shown before the list was scrolled up').toBe('no')
    // AND A SCROLL UP SHOWS IT, or a filter that never appears would pass for one hidden until the list is scrolled up.
    await app.page.locator('.px-chat-under-tabs').first().hover()
    await app.page.mouse.wheel(0, -80)
    await expect
      .poll(() => app.page.locator('.px-chat-find').first().getAttribute('data-shown'), {
        message: 'a scroll up over the list did not show the row',
        timeout: 10_000,
      })
      .toBe('yes')

    // AND IT NARROWS. The secretary name matches one contact; every row left must carry it.
    await app.page.fill('.px-chat-filter', SECRETARY_NAME)
    await app.page.waitForFunction(
      (name: string) => {
        const drawn = Array.from(document.querySelectorAll('.px-chat-contact .px-chat-name')).map(
          (one) => one.textContent ?? '',
        )
        return drawn.length > 0 && drawn.every((one) => one.toLowerCase().includes(name.toLowerCase()))
      },
      SECRETARY_NAME,
      { timeout: 20_000 },
    )
    const narrowed = await app.page.$$eval('.px-chat-contact .px-chat-name', (all) =>
      all.map((one) => one.textContent ?? ''),
    )
    expect(narrowed, 'the filter left a row that does not match').toContain(SECRETARY_NAME)
    expect(narrowed.some((one) => one.includes(LIVE_NAME)), 'the filter left the non-matching row').toBe(false)
  }, 300_000)
})
