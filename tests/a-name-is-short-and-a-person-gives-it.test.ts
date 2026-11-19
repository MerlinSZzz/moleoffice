// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PARTICIPANT'S NAME IS A FEW WORDS, AND THE LONG ONES ARE PUT TO THE PERSON AS A LIST THEY PRESS ONCE.
 *
 * The names agents have are too long: a short name is enough, with a role after it if wanted, such as
 * "[the agent's name] - the coordinator", and no account of what the agent does. Criterion M35 of
 * design/messages/ACCEPTANCE.md section 9e; problem `FzDeyUZUiOIh`.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE HALVES, AND WHY EACH IS MEASURED APART
 * ---------------------------------------------------------------------------------------
 *
 * 1. THE DOOR REFUSES A LONG NAME, with the budget in the sentence. The budget is the level-1 label
 *    of src/shared/zoom.ts and is asked for rather than restated, so this reads the refusal for the
 *    budget's own words instead of for a number typed here.
 *
 * 2. REGISTERING AN AGENT WHOSE RECORD TITLE IS A DESCRIPTION does not put that description in the
 *    registry. A title may run to fifteen words; a name may not, and the handle is what a reader
 *    sees until a person gives it a name. The title stays on the record, which this checks, because
 *    a fix that shortened the title would have lost what somebody wrote.
 *
 * 3. THE LONG NAMES ALREADY THERE ARE THE PERSON'S TO CHANGE. An agent cannot rename itself or anything else,
 *    so the proposal is a row the person presses. It was a list on the person's settings page until 6 September 2026,
 *    when criterion M50 took it out of settings, where it was not needed. It is now on each
 *    agent's own page, which is where a name is chosen. This drives that press in a browser and
 *    reads the registry afterwards.
 *
 * ---------------------------------------------------------------------------------------
 * THE CONTROL
 * ---------------------------------------------------------------------------------------
 *
 * The refusal case first renames somebody to a short name and watches it work, so "the door refuses"
 * is not passing because the door refuses everything. The list case asserts the rows are drawn and
 * names the agents before it presses, so "the names changed" is not passing on an empty list.
 *
 * ---------------------------------------------------------------------------------------
 * EACH CASE SETS THE NAMES IT READS
 * ---------------------------------------------------------------------------------------
 *
 * No case relies on a name an earlier case gave. Until 25 September 2026 the last case read the
 * name the browser case had pressed, so on a run where the page did not start the last case failed
 * too, although the door it tests had answered correctly. A failure now shows only in the case
 * where it happened.
 */

import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { PROPOSED_NAMES, whyNameIsRefused } from '../src/shared/participants.ts'
import { SHORT_FORM_SPECS } from '../src/shared/zoom.ts'
import { whoPath } from '../src/web/components/router.tsx'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/**
 * A long name of the kind the person was reading in the panel when they asked for this: the one they read,
 * with the person's own name taken out (src/shared/participants.ts quotes it whole).
 */
const THE_LONG_NAME =
  '2026-09-02 — POINTING reopened by its owner: every level a real abstract, click = target = box (agent)'

/** A short name that names nobody, for the cases that need one. */
const A_SHORT_NAME = 'Wren'

/** A name with a little more, which also names nobody: the shape of the person's second example. */
const A_NAME_WITH_A_LITTLE_MORE = 'Wren - the archivist'

/** The registry id of the test office's secretary, registered in beforeAll. The registration mints it. */
let secretary = ''

async function participants(): Promise<{ agents: { id: string; name: string; handle: string }[] }> {
  const got = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  expect(got.status, await got.clone().text()).toBe(200)
  return (await got.json()) as { agents: { id: string; name: string; handle: string }[] }
}

async function rename(id: string, name: string): Promise<Response> {
  return fetch(`${app.api}/api/participants/agent/${id}`, {
    method: 'PATCH',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ name }),
  })
}

/**
 * THE AGENTS THE PROPOSALS NAME ARE LEGACY ROWS, WRITTEN STRAIGHT INTO THE STACK'S OWN DATABASE.
 *
 * `PROPOSED_NAMES` holds the ids of agents on the person's installation that were registered before the mint,
 * so each one's id is its handle. A registration through a door today mints a new id, which no
 * proposal names. So the fixture writes the rows in the shape those agents have, with the long title
 * as their name, the way `a-contacts-row-says-the-state-of-the-conversation` writes rows the ordinary
 * write path does not produce. `join(app.dir, 'panelx.db')` is the file the live server opens.
 */
function writeTheLegacyAgents(): void {
  const db = new Database(join(app.dir, 'panelx.db'))
  try {
    const at = '2026-09-02 10:00:00'
    for (const one of PROPOSED_NAMES) {
      db.prepare(
        'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
          "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, " +
          "'generated') ON CONFLICT(id) DO NOTHING",
      ).run(`avatar-default-agent-${one.id}`, at)
      db.prepare(
        'INSERT INTO agents (id, name, handle, avatar_asset_id, retired, created_at, started_by_kind, started_by_id) ' +
          "VALUES (?, ?, ?, ?, 0, ?, 'person', ?)",
      ).run(one.id, THE_LONG_NAME.slice(0, 90), one.id, `avatar-default-agent-${one.id}`, at, THE_PERSON)
    }
  } finally {
    db.close()
  }
}

/**
 * GIVE AN AGENT A NAME BY WRITING IT INTO THE STACK'S DATABASE, the way the fixture above does.
 *
 * The door cannot be used for this, because a long name is exactly what the door refuses. The name
 * is read back through the door, so a write the server did not see fails here and not later.
 */
async function nameInTheDatabase(id: string, name: string): Promise<void> {
  const db = new Database(join(app.dir, 'panelx.db'))
  try {
    const changed = db.prepare('UPDATE agents SET name = ? WHERE id = ?').run(name, id).changes
    expect(changed, `there is no agent ${id} to name`).toBe(1)
  } finally {
    db.close()
  }
  const held = (await participants()).agents.find((one) => one.id === id)
  expect(held?.name, `the server does not read the name written for ${id}`).toBe(name)
}

/** Give an agent a name through the door, as the owner, and check the door took it. */
async function renameAsTheOwner(id: string, name: string): Promise<void> {
  const took = await rename(id, name)
  expect(took.status, await took.clone().text()).toBe(200)
}

beforeAll(async () => {
  app = await liveApp({ name: 'short-names', viewport: { width: 1440, height: 1000 } })
  // EVERY AGENT THE PROPOSALS NAME, under a name as long as the one the person complained about, so the list
  // has something to propose.
  writeTheLegacyAgents()
  // AND ONE AGENT FILED THROUGH THE RECORDS DOOR UNDER THAT LONG TITLE, so the registration rule has
  // something to fall back from.
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'agent',
      title: THE_LONG_NAME.slice(0, 90),
      data: { handle: 'builder-long-title', runtime: 'claude-code', state: 'active' },
    }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  // AND THE TEST OFFICE'S SECRETARY, whom the rename cases rename. Its id is minted, so it is read back.
  const registered = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'agent',
      title: THE_TEST_OFFICES_SECRETARY.name,
      data: { handle: THE_TEST_OFFICES_SECRETARY.handle, runtime: 'claude-code', state: 'active' },
    }),
  })
  expect(registered.status, await registered.clone().text()).toBe(201)
  secretary = (await participants()).agents.find((one) => one.handle === THE_TEST_OFFICES_SECRETARY.handle)?.id ?? ''
  expect(secretary, 'the secretary did not register').not.toBe('')
}, 240_000)

afterAll(async () => {
  await app.stop()
})

describe('the registries refuse a name that is a description', () => {
  it('takes a short one, so the refusal below is about the length', async () => {
    const took = await rename(secretary, A_SHORT_NAME)
    expect(took.status, await took.clone().text()).toBe(200)
    const held = (await participants()).agents.find((one) => one.id === secretary)
    expect(held?.name).toBe(A_SHORT_NAME)
  }, 60_000)

  it('refuses a longer one, and says the budget in the sentence', async () => {
    await renameAsTheOwner(secretary, A_SHORT_NAME)
    const refused = await rename(secretary, THE_LONG_NAME)
    expect(refused.status).toBe(400)
    const said = await refused.text()
    // THE BUDGET'S OWN WORDS, not a number written in this test. What a label is allowed is declared
    // once, in src/shared/zoom.ts, and the refusal carries that declaration's sentence.
    const budget = SHORT_FORM_SPECS.label
    expect(said, 'the refusal does not say how many words a name may be').toContain(
      `${String(budget.minWords)} to ${String(budget.maxWords)} words`,
    )
    expect(said, 'the refusal does not say what a name is for').toContain(budget.what)
    // AND THE NAME DID NOT MOVE.
    const held = (await participants()).agents.find((one) => one.id === secretary)
    expect(held?.name).toBe(A_SHORT_NAME)
  }, 60_000)

  it('takes a one-word name and one with a little more, the two shapes of the person’s examples', async () => {
    expect(whyNameIsRefused(A_SHORT_NAME)).toBeNull()
    expect(whyNameIsRefused(A_NAME_WITH_A_LITTLE_MORE)).toBeNull()
    // EVERY NAME THE PRODUCT PROPOSES IS ONE THE DOOR TAKES, read from the list rather than written here.
    for (const one of PROPOSED_NAMES) expect(whyNameIsRefused(one.name), one.id).toBeNull()
    expect(whyNameIsRefused(THE_LONG_NAME)).not.toBeNull()
    expect(whyNameIsRefused('')).toBe('A name cannot be empty.')
  })
})

describe('a record whose title is a description registers under its handle', () => {
  it('keeps the whole title on the record and puts the handle in the registry', async () => {
    // FOUND BY HANDLE: a new agent's registry id is minted, so it is not the handle.
    const held = (await participants()).agents.find((one) => one.handle === 'builder-long-title')
    expect(held, 'the agent did not register at all').toBeDefined()
    // THE NAME IS THE HANDLE, because the title is not a name. A cut of the title would have been a
    // name nobody wrote.
    expect(held?.name, 'a description was written into the registry as a name').toBe('builder-long-title')
    expect(whyNameIsRefused(held?.name ?? ''), 'the registered name is itself over the budget').toBeNull()

    // AND THE RECORD STILL SAYS THE WHOLE TITLE, which is where the long form belongs.
    const found = await fetch(`${app.api}/api/records?kind=agent&shape=full`, { headers: AS_THE_OWNER })
    expect(found.status, await found.clone().text()).toBe(200)
    const listed = (await found.json()) as { records: { title: string; data: Record<string, unknown> }[] }
    const record = listed.records.find((one) => one.data['handle'] === 'builder-long-title')
    expect(record?.title, 'the record title was shortened, so somebody’s words were lost').toBe(
      THE_LONG_NAME.slice(0, 90),
    )
  }, 60_000)

  it('still takes a title that IS a name', async () => {
    const filed = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({
        kind: 'agent',
        title: 'Builder Short',
        data: { handle: 'builder-short', runtime: 'claude-code', state: 'active' },
      }),
    })
    expect(filed.status, await filed.clone().text()).toBe(201)
    const held = (await participants()).agents.find((one) => one.handle === 'builder-short')
    expect(held?.name, 'a title that is a name was thrown away').toBe('Builder Short')
  }, 60_000)
})

describe('a long name is proposed to the person on that agent’s own page', () => {
  it('draws the row for that agent and nobody else’s', async () => {
    const first = PROPOSED_NAMES[0]
    expect(first, 'nothing is proposed, so nothing below is measured').toBeDefined()
    if (first === undefined) return
    await nameInTheDatabase(first.id, THE_LONG_NAME.slice(0, 90))
    await app.page.goto(`${app.site}/#${whoPath('agent', first.id)}`)
    await waitForThePage(app.page, 30_000)
    await app.page.waitForSelector('.prn-row', { timeout: 20_000 })
    const rows = await app.page.$$eval('.prn-row', (all) =>
      all.map((one) => ({
        agent: one.getAttribute('data-agent') ?? '',
        now: one.querySelector('.prn-now')?.textContent ?? '',
        next: one.querySelector('.prn-next')?.textContent ?? '',
        because: one.querySelector('.prn-because')?.textContent ?? '',
      })),
    )
    // THE CONTROL: exactly one row, and it is this agent's. Before M50 every proposal was drawn on
    // one page, so a build that ignored `only` would draw all three here and this is what says so.
    expect(rows.map((one) => one.agent), 'this page draws a name that is not about this agent').toEqual([first.id])
    expect(rows[0]?.next).toBe(first.name)
    expect(rows[0]?.now, 'the row does not say what it is called now').not.toBe('')
    expect(rows[0]?.because, 'the row does not say why this name').not.toBe('')
  }, 120_000)

  it('applies each of them from that agent’s page, through the participants door', async () => {
    for (const one of PROPOSED_NAMES) await nameInTheDatabase(one.id, THE_LONG_NAME.slice(0, 90))
    for (const one of PROPOSED_NAMES) {
      await app.page.goto(`${app.site}/#${whoPath('agent', one.id)}`)
      await app.page.reload()
      await waitForThePage(app.page, 30_000)
      await app.page.waitForSelector('.prn-apply', { timeout: 20_000 })
      await app.page.click('.prn-apply')
      await app.page.waitForFunction(() => document.querySelectorAll('.prn-row').length === 0, undefined, {
        timeout: 20_000,
      })
    }

    // THE REGISTRY IS WHAT IS READ, not the page: a press that only changed a drawing would pass
    // every assertion about the page.
    const held = (await participants()).agents
    for (const one of PROPOSED_NAMES) {
      expect(held.find((row) => row.id === one.id)?.name, `${one.id} was not renamed`).toBe(one.name)
    }
  }, 300_000)

  it('draws no such panel once the name is what was proposed', async () => {
    const first = PROPOSED_NAMES[0]
    if (first === undefined) return
    await renameAsTheOwner(first.id, first.name)
    await app.page.goto(`${app.site}/#${whoPath('agent', first.id)}`)
    await app.page.reload()
    await waitForThePage(app.page, 30_000)
    // THE CONTROL: the page really drew, so an absent panel means the panel is absent rather than
    // the page having failed to load at all.
    await app.page.waitForSelector('.prof-name', { timeout: 20_000 })
    expect(await app.page.$$eval('.prn-row', (all) => all.length)).toBe(0)
    expect(await app.page.$$eval('.prn-apply', (all) => all.length), 'the press is still there with nothing to do').toBe(
      0,
    )
  }, 120_000)
})

describe('an agent may not give a name, not even its own', () => {
  it('refuses the rename and says who a name belongs to', async () => {
    await renameAsTheOwner(secretary, A_NAME_WITH_A_LITTLE_MORE)
    const refused = await fetch(`${app.api}/api/participants/agent/${secretary}`, {
      method: 'PATCH',
      headers: {
        ...AS_THE_OWNER,
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': THE_TEST_OFFICES_SECRETARY.handle,
      },
      body: JSON.stringify({ name: `${A_SHORT_NAME} the Magnificent` }),
    })
    expect(refused.status).toBe(403)
    expect(await refused.text()).toContain('only a person gives one')
    const held = (await participants()).agents.find((one) => one.id === secretary)
    expect(held?.name, 'an agent renamed itself').toBe(A_NAME_WITH_A_LITTLE_MORE)
  }, 60_000)
})
