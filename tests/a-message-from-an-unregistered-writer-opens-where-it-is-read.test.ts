// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MESSAGES PAGE ROW WHOSE WRITER NOBODY REGISTERED OPENS IN ITS CONVERSATION, LIKE ANY OTHER.
 *
 * Criterion M27 of design/messages/ACCEPTANCE.md section 9a: *a message opens in its conversation
 * from there*. The gap Builder AZ named when they handed the cluster back: M25 gave a writer nobody
 * registered a conversation of its own, and the Messages page could not offer it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, AND THE TWO SHAPES IT TOOK
 * ---------------------------------------------------------------------------------------
 *
 * `theOtherSide` on that page answered a participant reference or nothing, and a writer nobody
 * registered is neither.
 *
 * 1. A WRITER THAT CLAIMED AN ACTOR ID no registry holds got a press that opened a private
 *    conversation with somebody who does not exist. The panel then drew an empty conversation under
 *    a stored id.
 * 2. A WRITER THAT TYPED ONLY A `from` LINE got no press at all, because the only other party on
 *    the message was the reader themself.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIX IS ONE RULE, NOT A SECOND COPY OF ONE
 * ---------------------------------------------------------------------------------------
 *
 * `unregisteredWriterOf` decided this for the contacts list and the panel, in the server library.
 * It reads nothing but its arguments, so it moved into `@shared/messages.ts` and the page asks the
 * same function. A copy in the page would be the defect CLAUDE.md names as this repository's own:
 * the same fact worked out in two places, free to disagree with nothing failing.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { join } from 'node:path'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { unregisteredKey, unregisteredWriterOf, type MessageOnTheWire } from '../src/shared/messages.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/**
 * THE LINE A WRITER NOBODY REGISTERED TYPED.
 *
 * `sentBy` is deliberately absent on such a message — the door leaves it out rather than inventing a
 * sender for an actor no registry holds — so the `from` line is the only name there is. That is the
 * shape the twenty-five legacy messages have, and it is what M25 shows the writer under.
 */
const THE_LINE_IT_TYPED = 'a-process-nobody-registered'

/** What that message says, so the panel can be checked for having really opened at it. */
const WHAT_IT_SAID = 'A line from a writer nobody registered.'

/**
 * THE MESSAGE IS PUT INTO THE DATABASE, NOT WRITTEN THROUGH THE DOOR, AND THAT IS THE POINT.
 *
 * The door refuses this act since criterion M59 on 6 September 2026: a message to a PERSON comes
 * from an agent somebody registered, because the person has to be able to see who is writing to them. What
 * this test is about is the twenty-five messages of this shape that are already in the person's database,
 * written before the refusal existed. They are still there, they still have to open where they are
 * read, and no new one can be made through the door — so the row is built the way those rows now
 * only exist: written by a registered agent, then given the shape of a legacy one.
 */
beforeAll(async () => {
  app = await liveApp({ name: 'unregistered-opens', viewport: { width: 1440, height: 1000 } })
  const said = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON },
    body: JSON.stringify({
      kind: 'message',
      title: 'a line from nobody',
      data: { body: WHAT_IT_SAID, from: THE_LINE_IT_TYPED, to: [{ kind: 'person', id: THE_PERSON }] },
    }),
  })
  const body = await said.text()
  expect(said.status, body).toBe(201)
  const written = (JSON.parse(body) as { record: { id: string } }).record.id

  // NO SENDER, WHICH IS WHAT SUCH A ROW HOLDS. The door leaves `sentBy` out for an actor no registry
  // answers to rather than inventing one, so the typed `from` line is the only name on the message.
  const db = new Database(join(app.dir, 'panelx.db'))
  db.prepare("UPDATE records SET data = json_remove(data, '$.sentBy') WHERE id = ?").run(written)
  db.prepare('UPDATE changes SET actor_type = ?, actor_id = ? WHERE record_id = ?').run(
    'agent',
    THE_LINE_IT_TYPED,
    written,
  )
  db.close()
}, 300_000)

afterAll(async () => {
  await app.stop()
})

// ============================================================================ the rule itself

describe('one rule decides whether a registry answers for a writer', () => {
  it('is in the shared file, so the page and the server ask the same function', () => {
    const registered = [{ who: { kind: 'agent' as const, id: 'builder-x' }, name: 'Builder X', handle: 'builder-x' }]
    const message: MessageOnTheWire = {
      id: 'm1',
      workspaceId: 'default',
      title: 'a line',
      lead: null,
      from: 'builder-x',
      sentBy: { kind: 'agent', id: 'builder-x' },
      // Both are read off the registry when a message is read, and this object is built by hand to
      // ask one shared function a question about the writer. Null is what a hand-built row holds.
      sentByRole: null,
      wentRoundItsStarter: null,
      writtenFrom: null,
      urgent: false,
      onlyOn: null,
      asksThePerson: null,
      to: [],
      toGroup: null,
      body: '',
      sentAt: '2026-09-04 10:00:00',
      target: null,
      // IT QUOTES NOTHING, which a message with no target and no quotes reads as.
      quotes: [],
      quotePositions: null,
      // A LINE MOLE OFFICE WROTE CARRIES A SENTENCE BEHIND ITS FEW WORDS (M34); this is a message
      // somebody wrote, so there is none.
      saidInFull: null,
      // AND IT IS NO KIND OF OFFICE LINE, for the same reason. Null, not the field left off.
      notice: null,
      // NOBODY SAID WHICH RUN THIS CAME OUT OF, which is what a message somebody typed holds.
      ranBy: null,
      // AND IT CARRIES NO PICTURES (M64). Empty rather than null: carrying none is one state,
      // whether the writer sent none or the row was written before a message could carry one.
      pictures: [],
      deliveries: [],
      notSentYet: false,
      // NO PRESS OF SEND IS NAMED on a hand-built row.
      sendId: null,
      edited: null,
      wordsMayChangeUntil: null,
    }
    expect(unregisteredWriterOf(message, registered)).toBe(null)
    const stranger = unregisteredWriterOf({ ...message, sentBy: { kind: 'agent', id: 'nobody' } }, registered)
    expect(stranger).not.toBe(null)
    // AND ITS KEY IS THE ONE THE PANEL OPENS AT, which is what makes the press work at all.
    expect(unregisteredKey(stranger ?? { typed: null, said: null }).startsWith('unregistered:')).toBe(true)
  })
})

// ============================================================================ the page

describe('the Messages page offers the conversation for a writer nobody registered', () => {
  /** Every "open it where it is read" press on the page, with the kind of side it names. */
  async function thePresses(): Promise<{ words: string; other: string | null }[]> {
    await app.page.goto(`${app.site}/#/messages`)
    await app.page.reload()
    await waitForThePage(app.page, 60_000)
    await app.page.waitForSelector('.px-ms-one', { timeout: 30_000 })
    return app.page.$$eval('.px-ms-open', (all) =>
      all.map((one) => ({ words: one.textContent ?? '', other: one.getAttribute('data-other') })),
    )
  }

  it('draws the press on the row, naming the writer by the line it typed', async () => {
    const presses = await thePresses()
    expect(presses.length, 'the page drew no press at all, so nothing was measured').toBeGreaterThan(0)
    const forTheStranger = presses.filter((one) => one.other === 'unregistered')
    expect(forTheStranger.length, 'no row offered the conversation with an unregistered writer').toBeGreaterThan(0)
    expect(forTheStranger[0]?.words).toContain(THE_LINE_IT_TYPED)
  }, 240_000)

  it('opens the panel at that writer, showing what it sent rather than an empty conversation', async () => {
    await thePresses()
    await app.page.click('.px-ms-open[data-other="unregistered"]')
    await app.page.waitForSelector('.px-chat', { timeout: 30_000 })
    await app.page.waitForFunction(
      (words: string) => (document.querySelector('.px-chat')?.textContent ?? '').includes(words),
      WHAT_IT_SAID,
      { timeout: 30_000 },
    )
    // AND IT IS THE UNREGISTERED CONVERSATION, not a private one with somebody who does not exist:
    // the panel says so with the mark it draws on a writer no registry holds.
    const said = (await app.page.textContent('.px-chat')) ?? ''
    expect(said).toContain(THE_LINE_IT_TYPED)
  }, 240_000)
})
