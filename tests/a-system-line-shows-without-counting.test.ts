// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LINE MOLE OFFICE WROTE MAKES A ROW BOLD AND ENTERS NO COUNT.
 *
 * A system line does not count as unread, but it is still shown: a contact's name is bold when anything
 * is unread, a system line or a real message, and the same rule holds in the two other groups and in
 * agent conversations. Criterion M33 of
 * design/messages/ACCEPTANCE.md section 9e; problem `Rfcu4ZwBU68y`.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO HALVES, AND WHY EACH NEEDS ITS OWN CASE
 * ---------------------------------------------------------------------------------------
 *
 * 1. NO COUNT HOLDS A SYSTEM LINE. It did until now, and on purpose: decision `VsbQJTWDPQAV` put
 *    them into `unreadAmong` so that the circle and the rows would agree about them. The owner's rule
 *    reaches the same agreement by taking them out of both, so this file measures the count with a
 *    system line present and nothing else unread — the number must be nothing.
 *
 * 2. THE ROW IS STILL BOLD. That is the half a build could drop while passing the first: taking
 *    system lines out of the count and drawing nothing for them would satisfy every number here and
 *    lose what the criterion asks for. So boldness is read off the page, in pixels, from the browser's own
 *    computed weight rather than from a class name.
 *
 * ---------------------------------------------------------------------------------------
 * THE CONTROL
 * ---------------------------------------------------------------------------------------
 *
 * Every case asserts the row exists and asserts the OTHER row's weight in the same breath. A page
 * that drew no rows would otherwise pass "this row is not bold", and a page that drew every row
 * plain would pass "the system-line row carries no number".
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { join } from 'node:path'
import { nanoid } from 'nanoid'
import { liveApp, theOfficesOwnIdIn, waitForThePage, type LiveApp, theAnswerToAWriteInATestOffice } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const asAgent = (id: string): Record<string, string> => ({
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

interface Contacts {
  contacts: { who: { kind: string; id: string } | null; unread: number; anythingUnread: boolean }[]
  unread: { messages: number; groups: number }
}

/** Each agent's registry id, by its handle. A contact row carries the id, which is not the handle. */
const idOf = new Map<string, string>()

async function readTheContacts(): Promise<Contacts> {
  const got = await fetch(`${app.api}/api/messages/contacts`, { headers: AS_THE_OWNER })
  expect(got.status, await got.clone().text()).toBe(200)
  return (await got.json()) as Contacts
}

async function file(headers: Record<string, string>, body: unknown, expected: number = theAnswerToAWriteInATestOffice(headers, body)): Promise<string> {
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(made.status, await made.clone().text()).toBe(expected)
  return ((await made.json()) as { record: { id: string } }).record.id
}

/** Read every message this reader has, so nothing an agent wrote is left unread. */
async function readEverything(): Promise<void> {
  const pool = await fetch(`${app.api}/api/messages`, { headers: AS_THE_OWNER })
  expect(pool.status, await pool.clone().text()).toBe(200)
  const said = (await pool.json()) as { messages: { id: string }[] }
  for (const one of said.messages) {
    await fetch(`${app.api}/api/messages/${one.id}/mark`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({ mark: 'seen' }),
    })
  }
}

/**
 * ONE LINE MOLE OFFICE WROTE INTO A ONE-TO-ONE CONVERSATION, made in the database.
 *
 * The write door refuses a message whose `sentBy` is Mole Office from anybody else — a message is
 * somebody speaking, and who sent it is who wrote it. `writeASystemLineToTwo` in
 * src/server/lib/groups.ts is the one thing allowed to write one, and the two things that call it
 * (a run that stopped waiting, a restart that cut a run off) each need a whole worker and a runtime
 * to happen. So what is written here by hand is exactly the row that function writes: a message
 * whose sender is Mole Office, addressed to both sides, with a delivery row for the reader. This is
 * the same argument, and the same shape, as tests/a-system-notice-is-a-block-not-a-message.test.ts.
 */
async function aSystemLineInTheConversationWith(agentId: string): Promise<void> {
  const lineId = await file(AS_THE_OWNER, {
    kind: 'message',
    title: 'Mole Office',
    data: { body: 'Agent run ended', to: [{ kind: 'agent', id: agentId }] },
  })
  const held = new Database(join(app.dir, 'panelx.db'))
  try {
    held
      .prepare("UPDATE records SET data = json_set(data, '$.sentBy', json(?)) WHERE id = ?")
      .run(JSON.stringify({ kind: 'agent', id: theOfficesOwnIdIn(held) }), lineId)
    held
      .prepare(
        'INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(nanoid(12), lineId, 'person', THE_PERSON, 'delivered', '2026-09-04 17:00:00')
  } finally {
    held.close()
  }
}

async function openThePanel(): Promise<void> {
  await app.page.goto(`${app.site}/#/`)
  await app.page.reload()
  await waitForThePage(app.page, 30_000)
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat-tabs', { timeout: 20_000 })
  if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
}

/** Every contact row: whose it is, whether it is marked unread, and what weight the name draws at. */
async function theRows(): Promise<{ contact: string; unread: string | null; weight: string; number: string }[]> {
  return app.page.$$eval('.px-chat-contact', (all) =>
    all.map((one) => {
      const name = one.querySelector('.px-chat-name')
      return {
        contact: one.getAttribute('data-contact') ?? '',
        unread: one.getAttribute('data-unread'),
        weight: name === null ? '' : window.getComputedStyle(name).fontWeight,
        number: one.querySelector('.px-chat-unread')?.textContent ?? '',
      }
    }),
  )
}

beforeAll(async () => {
  app = await liveApp({ name: 'system-line-bold', viewport: { width: 1440, height: 1000 } })

  // TWO AGENTS. One will have a real unread message; the other will have nothing but a line Mole
  // Office wrote into its conversation with the person.
  await file(AS_THE_OWNER, {
    kind: 'agent',
    title: 'Loud Agent',
    data: { handle: 'loud-agent', runtime: 'claude-code', state: 'active' },
  })
  await file(AS_THE_OWNER, {
    kind: 'agent',
    title: 'Quiet Agent',
    data: { handle: 'quiet-agent', runtime: 'claude-code', state: 'active' },
  })
  const registry = await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })
  const agents = ((await registry.json()) as { agents?: { id: string; handle: string }[] }).agents ?? []
  for (const handle of ['loud-agent', 'quiet-agent']) {
    const id = agents.find((one) => one.handle === handle)?.id
    expect(id, `${handle} has no registry row`).toBeTruthy()
    idOf.set(handle, id!)
  }

  // Something each of them said, so both have a conversation with the person at all.
  await file(asAgent('loud-agent'), {
    kind: 'message',
    title: 'from the loud one',
    data: { body: 'The clamp holds at 11.8 N.', to: [{ kind: 'person', id: THE_PERSON }] },
  })
  await file(asAgent('quiet-agent'), {
    kind: 'message',
    title: 'from the quiet one',
    data: { body: 'The mount is printed.', to: [{ kind: 'person', id: THE_PERSON }] },
  })

  // THE PERSON READS EVERYTHING, so the only unread things afterwards are the ones each case makes.
  await readEverything()
}, 240_000)

afterAll(async () => {
  await app.stop()
})

describe('a line Mole Office wrote never enters a count', () => {
  it('leaves the circle and the row at nothing while making the row bold', async () => {
    // THE CONTROL: with everything read, nothing is unread and no row is bold.
    const quiet = await readTheContacts()
    expect(quiet.unread.messages, 'something was already unread, so the case below proves nothing').toBe(0)
    expect(quiet.contacts.every((one) => !one.anythingUnread), 'a row was already marked unread').toBe(true)

    // A LINE MOLE OFFICE WROTE INTO THE CONVERSATION WITH THE QUIET AGENT, and nothing else.
    await aSystemLineInTheConversationWith('quiet-agent')

    const held = await readTheContacts()
    const theQuietOne = held.contacts.find((one) => one.who?.id === idOf.get('quiet-agent'))
    expect(theQuietOne, 'the quiet agent has no contact row').toBeDefined()
    expect(theQuietOne?.unread, 'the system line was counted as an unread message').toBe(0)
    expect(theQuietOne?.anythingUnread, 'the system line is not shown at all').toBe(true)
    expect(held.unread.messages, 'the circle counted the system line').toBe(0)
    expect(held.unread.groups, 'the circle counted the system line as an unread group').toBe(0)
  }, 120_000)

  it('draws that row bold and the read one plain', async () => {
    await openThePanel()
    await app.page.waitForFunction(
      () => document.querySelectorAll('.px-chat-contact[data-unread="yes"]').length > 0,
      undefined,
      { timeout: 20_000 },
    )
    const rows = await theRows()
    const quiet = rows.find((one) => one.contact === `agent:${idOf.get('quiet-agent')}`)
    const loud = rows.find((one) => one.contact === `agent:${idOf.get('loud-agent')}`)
    expect(quiet, 'the quiet agent is not drawn as a row').toBeDefined()
    expect(loud, 'the loud agent is not drawn as a row').toBeDefined()

    // THE ROW WITH THE SYSTEM LINE IS BOLD AND CARRIES NO NUMBER.
    expect(quiet?.unread).toBe('yes')
    expect(quiet?.number, 'the system line put a number on the row').toBe('')
    // AND THE ONE THE PERSON HAS READ IS PLAIN, which is the half that was wrong: every contact was bold.
    expect(loud?.unread).toBe('no')
    expect(Number(quiet?.weight), 'the row holding a system line is not drawn heavier').toBeGreaterThan(
      Number(loud?.weight),
    )
  }, 120_000)

  it('goes plain again once the person has read the system line, and a real message still counts', async () => {
    await readEverything()
    const nothing = await readTheContacts()
    expect(nothing.contacts.every((one) => !one.anythingUnread), 'a row is still marked unread').toBe(true)

    await file(asAgent('loud-agent'), {
      kind: 'message',
      title: 'a real one',
      data: { body: 'The second reading was 12.1 N.', to: [{ kind: 'person', id: THE_PERSON }] },
    })
    const held = await readTheContacts()
    const loud = held.contacts.find((one) => one.who?.id === idOf.get('loud-agent'))
    expect(loud?.unread, 'a message somebody wrote is not counted').toBe(1)
    expect(loud?.anythingUnread).toBe(true)
    expect(held.unread.messages, 'the circle does not count a message somebody wrote').toBe(1)

    await openThePanel()
    await app.page.waitForFunction(
      () => document.querySelectorAll('.px-chat-contact[data-unread="yes"]').length > 0,
      undefined,
      { timeout: 20_000 },
    )
    const rows = await theRows()
    const loudRow = rows.find((one) => one.contact === `agent:${idOf.get('loud-agent')}`)
    const quietRow = rows.find((one) => one.contact === `agent:${idOf.get('quiet-agent')}`)
    expect(loudRow?.unread).toBe('yes')
    expect(loudRow?.number, 'the row carries no number for a message somebody wrote').toBe('1')
    expect(quietRow?.unread, 'the row the person has read is still marked unread').toBe('no')
    expect(Number(loudRow?.weight)).toBeGreaterThan(Number(quietRow?.weight))
  }, 120_000)
})

describe('a group and a between-agents row follow the same rule', () => {
  it('makes a group bold for a system line and puts no number on it', async () => {
    // A GROUP THE PERSON IS IN. Opening one writes the line saying so, addressed to every member — which is
    // exactly the case the owner's rule is about: a group whose only unread thing is a line Mole Office
    // wrote.
    const made = await fetch(`${app.api}/api/groups`, {
      method: 'POST',
      headers: AS_THE_OWNER,
      body: JSON.stringify({
        name: 'The wrist camera',
        because: 'so that a group holds a line Mole Office wrote and nothing else',
        members: [
          { who: { kind: 'person', id: THE_PERSON }, because: 'the person opened it' },
          { who: { kind: 'agent', id: 'loud-agent' }, because: 'it is doing the work' },
        ],
      }),
    })
    expect(made.status, await made.clone().text()).toBe(201)

    const listed = await fetch(`${app.api}/api/groups`, { headers: AS_THE_OWNER })
    expect(listed.status, await listed.clone().text()).toBe(200)
    const reply = (await listed.json()) as {
      groups: { id: string; unread: number; anythingUnread: boolean }[]
      yours: string[]
    }
    const their = reply.groups.filter((one) => reply.yours.includes(one.id))
    expect(their.length, 'the person is in no group, so nothing below is measured').toBeGreaterThan(0)
    const one = their[0]
    if (one === undefined) throw new Error('a group expected')
    expect(one.unread, 'the line saying the group was opened was counted as a message').toBe(0)
    expect(one.anythingUnread, 'the line saying the group was opened is not shown at all').toBe(true)

    // AND THE CIRCLE DOES NOT COUNT IT EITHER: a group with nothing but a system line unread is not
    // an unread group.
    const held = await readTheContacts()
    expect(held.unread.groups, 'the circle counted a group whose only unread line is a system one').toBe(0)
  }, 120_000)

  it('marks a between-agents row when the agents have written since the person last looked', async () => {
    // NOTHING HOLDS QUIET AGENT IN THIS TEST OFFICE, so the office stores the message, routes it and answers 409
    // rather than 201; the message is stored all the same, and the row below is made from it.
    await file(asAgent('loud-agent'), {
      kind: 'message',
      title: 'agent to agent',
      data: { body: 'I have the camera mount.', to: [{ kind: 'agent', id: 'quiet-agent' }] },
    }, 409)
    const between = await fetch(`${app.api}/api/messages/between-agents`, { headers: AS_THE_OWNER })
    expect(between.status, await between.clone().text()).toBe(200)
    const listed = (await between.json()) as {
      conversations: { newSince: number; anythingNew: boolean }[]
      mayRead: boolean
    }
    expect(listed.mayRead).toBe(true)
    expect(listed.conversations.length, 'no conversation between two agents exists').toBeGreaterThan(0)
    const one = listed.conversations[0]
    if (one === undefined) throw new Error('a conversation expected')
    expect(one.newSince, 'nothing counts as new in a conversation the person has never opened').toBeGreaterThan(0)
    expect(one.anythingNew).toBe(true)

    await openThePanel()
    await app.page.click('.px-chat-tab[data-tab="between"]')
    await app.page.waitForSelector('.px-chat-under-tabs[data-showing="between"]', { timeout: 20_000 })
    // THE TAB READS ITS LIST WHEN IT IS OPENED, and says it is reading until the list comes. The list is
    // drawn only once that read has come back, so the rows are counted after it and not before.
    await app.page.waitForSelector('.px-chat-under-tabs[data-showing="between"] .px-chat-list', { timeout: 20_000 })
    const rows = await app.page.$$eval('.px-chat-under-tabs .px-chat-contact', (all) =>
      all.map((row) => {
        const name = row.querySelector('.px-chat-name')
        return {
          unread: row.getAttribute('data-unread'),
          weight: name === null ? '' : window.getComputedStyle(name).fontWeight,
        }
      }),
    )
    expect(rows.length, 'the Between agents tab draws no rows').toBeGreaterThan(0)
    expect(rows[0]?.unread, 'the row is not marked as holding something new').toBe('yes')
    expect(Number(rows[0]?.weight), 'the row is not drawn bold').toBeGreaterThan(400)
  }, 120_000)
})
