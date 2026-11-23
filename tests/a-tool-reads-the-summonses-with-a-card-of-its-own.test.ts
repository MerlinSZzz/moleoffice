// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The owner's tool reads the summonses with their personal tool key, and nothing else of the office.
 * Two decisions, on H-forI_Vk5H7, change the agent/card rule of a third.
 *
 * The cases keep the summons shape, cursor, forged-mark refusal, same-second ordering and broken
 * summons behaviour covered, with a person-tool key rather than a registered mailer. Worker and
 * secretary keys are refused by identity; the tool key is refused at all other doors.
 * The existing case 6 about the cards themselves stays unchanged for 13k. Wave 13k changed it on
 * 1 October 2026, when the mailer card and its power left the declaration:
 * it now says that no live card is the mailer and no power reads the summonses.
 *
 * The new proof and every-door mutations are in the-mail-tool-is-installed-by-the-persons-press.test.ts.
 *
 * Historical mutations restored from git log -p before adbbc872d (header at adbbc872d^).
 * Each was replayed alone after a passing control, then restored and the full file passed.
 * “Originally” records that header’s claim; “now” records this replay. Superseded claims are marked.
 *
 * - the power added to the tree’s first step in design/permissions/roles.json, so every card on the tree holds it:
 *   originally 3; now no case goes red.
 *   Replay changes the loaded declaration in lib/roles.ts, leaving design/ untouched. No longer holds:
 *   the door refuses worker and secretary identities directly, regardless of their powers.
 * - the reading door’s key check taken out (api/summons.ts):
 *   originally 3; now case 3 goes red.
 * - the summonses of one second ordered by their random ids (lib/summons.ts):
 *   originally 7, save once in 120; now cases 1, 4, 5, 7, 8 go red.
 *   Random ids make the exact failing set vary. These are the cases observed in this replay; the ordering
 *   defect remains.
 * - the mark left off the summons message (lib/summons.ts):
 *   originally 1 and every other case reading a summons; now cases 1, 2, 3, 4, 5, 7, 8 go red.
 * - a caller’s mark kept in createRecord (lib/records.ts):
 *   originally 4, 5, 7; now cases 4, 5, 7, 8 go red.
 * - the refusal of acts no power names taken out (lib/rolegate.ts):
 *   originally 5; now no case goes red.
 *   No longer holds for the owner's personal tool: its key is refused other doors before the card gate.
 * - the mailer’s card counted again in theCardOffTheTree (shared/roles.ts):
 *   originally 6; now case 6 goes red.
 * - the tool’s card given the checker’s first task (lib/cardmessage.ts):
 *   originally 6; now case 6 goes red.
 * - the card’s own check of refusedEverythingElse taken out (shared/roles.ts):
 *   originally the adjacent card-validation case; now the adjacent card-validation case goes red.
 *   Replay is tests/a-role-card-has-all-its-parts.test.ts, not this file; the named validation case still
 *   goes red.
 * - a summons lacking a part read as whole again (lib/summons.ts), added for problem 3E3Ygyzz-zwO:
 *   originally 8; now case 8 goes red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_TOOLSET_SENTENCE } from '../src/shared/toolset.ts'
import { KNOWLEDGE_WORDS } from '../src/shared/words/en-wave-13u.ts'

let t: TestDb
let app: FastifyInstance
const made: string[] = []
/** The key the registration door minted for each agent, by handle. */
const keys = new Map<string, string>()

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})
/** An agent proved by its own key alone, as the mail tool sends it. */
const byItsKey = (handle: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-key': String(keys.get(handle)),
})

async function ask(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ code: number; said: any; text: string }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  let said: any = null
  try {
    said = reply.json()
  } catch {
    said = null
  }
  return { code: reply.statusCode, said, text: reply.body }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const [handle, name, role] of [
    ['sec-one', 'Secretary One', 'secretary'],
    ['a-worker', 'A worker', 'worker'],
  ] as const) {
    const started = await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle, name, role })
    expect(started.code, started.text.slice(0, 300)).toBe(201)
    const key = String(started.said.whatToGiveIt?.key ?? '')
    expect(key, `the registration answered ${handle} no key`).toMatch(/^[0-9a-f]{64}$/)
    keys.set(handle, key)
  }
  const { holdTheKeyWhoseHashIs, keyHash } = await import('../src/server/lib/keys.ts')
  const key = 'a'.repeat(64)
  holdTheKeyWhoseHashIs('person-tool', 'mail-tool', keyHash(key), 'the-persons-press')
  keys.set('the-mailer', key)
  for (const [title, urgency] of [
    ['The nightly build is red', 'now'],
    ['A review waits for you', 'soon'],
  ] as const) {
    const called = await ask('POST', '/api/office/summon', asAgent('sec-one'), { title, urgency })
    expect(called.code, called.text.slice(0, 300)).toBe(200)
    made.push(String(called.said.message))
  }
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the summonses, read by the person’s own tool', () => {
  it('1: are read by the mailer, oldest first, with who, how urgent, the title and when, and nothing else', async () => {
    const read = await ask('GET', '/api/office/summonses', byItsKey('the-mailer'))
    expect(read.code, read.text.slice(0, 300)).toBe(200)
    expect(read.said.summonses.map((one: { id: string }) => one.id)).toEqual(made)
    expect(read.said.summonses[0]).toMatchObject({ who: 'Secretary One', urgency: 'now', title: 'The nightly build is red' })
    expect(read.said.summonses[1]).toMatchObject({ who: 'Secretary One', urgency: 'soon', title: 'A review waits for you' })
    for (const one of read.said.summonses as Record<string, unknown>[]) {
      expect(Object.keys(one).sort()).toEqual(['at', 'id', 'title', 'urgency', 'who'])
      expect(String(one['at'])).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    }
    // NONE OF THE MESSAGE'S OTHER WORDS: the sentence to the person and what became of the push stay in the office.
    expect(read.text).not.toContain('叫你到 office 来')
    expect(read.text).not.toContain('No device takes notifications yet.')
  })

  it('2: reads on from the last one read, says when there is nothing new, and refuses a place that is no summons', async () => {
    const after = await ask('GET', `/api/office/summonses?after=${made[0]}`, byItsKey('the-mailer'))
    expect(after.code, after.text.slice(0, 300)).toBe(200)
    expect(after.said.summonses.map((one: { id: string }) => one.id)).toEqual([made[1]])
    const none = await ask('GET', `/api/office/summonses?after=${made[1]}`, byItsKey('the-mailer'))
    expect(none.code, none.text.slice(0, 300)).toBe(200)
    expect(none.said.summonses).toEqual([])
    expect(none.said.says).toBe('No summons has been made since the last one read.')
    const lost = await ask('GET', '/api/office/summonses?after=nosuchsummons', byItsKey('the-mailer'))
    expect(lost.code, lost.text.slice(0, 300)).toBe(404)
  })

  it('3: are refused to a worker, a secretary and a claim with no key, and read by the person', async () => {
    // EACH WITH ITS OWN KEY, so the door refuses their identity, with no dependence on a role card.
    for (const who of ['a-worker', 'sec-one']) {
      const refused = await ask('GET', '/api/office/summonses', byItsKey(who))
      expect(refused.code, `${who}: ${refused.text.slice(0, 200)}`).toBe(403)
      expect(refused.said.error).toContain("the mail tool's own key")
    }
    // A CLAIM BY THE MAILER'S NAME WITH NO KEY, which is all a key taken back leaves it.
    const keyless = await ask('GET', '/api/office/summonses', asAgent('the-mailer'))
    expect(keyless.code, keyless.text.slice(0, 300)).toBe(403)
    expect(keyless.said.error).toContain("the mail tool's own key")
    const their = await ask('GET', '/api/office/summonses', AS_THE_PERSON)
    expect(their.code, their.text.slice(0, 300)).toBe(200)
    expect(their.said.summonses).toHaveLength(2)
  })

  it('4: are never made by a writer: a mark sent with a message is dropped, and a patch naming it is refused', async () => {
    const forged = await ask('POST', '/api/records', asAgent('a-worker'), {
      kind: 'message',
      title: 'Not a summons',
      data: { body: 'Come now', to: [{ kind: 'person', id: THE_PERSON }], summons: { who: 'Somebody', urgency: 'now', title: 'Forged' } },
    })
    expect(forged.code, forged.text.slice(0, 300)).toBe(201)
    expect(forged.said.record.data.summons, 'the mark a writer sent was kept').toBeUndefined()
    const read = await ask('GET', '/api/office/summonses', byItsKey('the-mailer'))
    expect(read.said.summonses.map((one: { id: string }) => one.id)).toEqual(made)
    const patched = await ask('PATCH', `/api/records/${made[0]}`, AS_THE_PERSON, { dataPatch: { summons: { who: 'Somebody', urgency: 'now', title: 'Changed' } } })
    expect(patched.code, patched.text.slice(0, 300)).toBe(403)
  })

  it("5: are all the mailer's key may do: an act a power names and acts no power names are refused it", async () => {
    // AN ACT A POWER NAMES: reading a record is under "Reading everything", which the mailer does not hold.
    const named = await ask('GET', `/api/records/${made[0]}`, byItsKey('the-mailer'))
    expect(named.code, named.text.slice(0, 300)).toBe(403)
    // ACTS NO POWER NAMES, which every other card may do: listing records, and taking one away.
    const listed = await ask('GET', '/api/records?kind=message', byItsKey('the-mailer'))
    expect(listed.code, listed.text.slice(0, 300)).toBe(403)
    expect(listed.said.error).toContain('proves only your mail tool')
    const removed = await ask('DELETE', `/api/records/${made[0]}`, byItsKey('the-mailer'))
    expect(removed.code, removed.text.slice(0, 300)).toBe(403)
    const kept = t.client.sqlite.prepare('SELECT deleted_at AS gone FROM records WHERE id = ?').get(made[0]) as { gone: string | null }
    expect(kept.gone, 'the summons was taken away').toBeNull()
    // The owner's tool has one door; a worker’s key still lists these records.
    const worker = await ask('GET', '/api/records?kind=message', byItsKey('a-worker'))
    expect(worker.code, worker.text.slice(0, 300)).toBe(200)
    // AND ITS ONE ACT, WITH THE SAME KEY.
    const read = await ask('GET', '/api/office/summonses', byItsKey('the-mailer'))
    expect(read.code, read.text.slice(0, 300)).toBe(200)
    expect(read.said.summonses.map((one: { id: string }) => one.id)).toEqual(made)
  })

  // CASE 6 SAID UNTIL 1 OCTOBER 2026 that the mailer's card, off the tree too, was not counted as the
  // card that checks. A decision took the mailer card and its power "Reading the summonses"
  // out of design/permissions/roles.json. It now says that neither is a live card or power, and the
  // inspector is the one card off the tree.
  it('6: holds no mailer card and no power that reads the summonses, and leaves the inspector the one card off the tree', async () => {
    const { theRoleCards } = await import('../src/server/lib/roles.ts')
    const { theCardOffTheTree } = await import('../src/shared/roles.ts')
    const { theCardMessageSaidFor } = await import('../src/server/lib/cardmessage.ts')
    const decl = theRoleCards()
    expect([...decl.cards, ...decl.personCards].map((one) => one.name), 'a live card is the mailer').not.toContain('mailer')
    expect(decl.powers.map((one) => one.name), 'a live power is "Reading the summonses"').not.toContain('Reading the summonses')
    expect(decl.powers.flatMap((one) => one.acts.map((act) => act.act)), 'a live power holds the summons read').not.toContain('office.read-summonses')
    for (const card of [...decl.cards, ...decl.personCards]) {
      expect(card.powers ?? [], `the ${card.name} card names "Reading the summonses"`).not.toContain('Reading the summonses')
    }
    expect(decl.cards.filter((one) => one.rung === null).map((one) => one.name)).toEqual(['inspector'])
    expect(theCardOffTheTree(decl)?.name).toBe('inspector')
    expect(theCardMessageSaidFor(decl, 'inspector', null)).toContain('the work you are to check')
    expect(theCardMessageSaidFor(decl, 'inspector', null)).toContain(`${THE_TOOLSET_SENTENCE} ${KNOWLEDGE_WORDS.introduction}`)
  })

  it('7: are read in the order they were made, even when several are made in one second', async () => {
    // FIVE MORE, then each given the second the last one read was made in, as a busy second can.
    const more: string[] = []
    for (const title of ['One', 'Two', 'Three', 'Four', 'Five']) {
      const called = await ask('POST', '/api/office/summon', asAgent('sec-one'), { title: `In one second: ${title}`, urgency: 'soon' })
      expect(called.code, called.text.slice(0, 300)).toBe(200)
      more.push(String(called.said.message))
    }
    const second = (t.client.sqlite.prepare('SELECT created_at AS at FROM records WHERE id = ?').get(made[1]) as { at: string }).at
    const same = t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?')
    for (const id of more) same.run(second, id)
    const read = await ask('GET', `/api/office/summonses?after=${made[1]}`, byItsKey('the-mailer'))
    expect(read.code, read.text.slice(0, 300)).toBe(200)
    expect(read.said.summonses.map((one: { id: string }) => one.id)).toEqual(more)
    // AND ON FROM THE THIRD OF THEM, inside that same second.
    const on = await ask('GET', `/api/office/summonses?after=${more[2]}`, byItsKey('the-mailer'))
    expect(on.said.summonses.map((one: { id: string }) => one.id)).toEqual(more.slice(3))
  })

  it('8: never guess at a summons that cannot be read: the read stops before it, and the next is refused, naming it', async () => {
    // THREE MORE, each then stored lacking one part of its mark, which no door writes: problem 3E3Ygyzz-zwO.
    const broken: { id: string; lacks: string }[] = []
    for (const [title, lacks, path] of [
      ['Lacking its caller', 'who called', '$.summons.who'],
      ['Lacking its urgency', 'how urgent', '$.summons.urgency'],
      ['Lacking its title', 'the title', '$.summons.title'],
    ] as const) {
      const called = await ask('POST', '/api/office/summon', asAgent('sec-one'), { title, urgency: 'soon' })
      expect(called.code, called.text.slice(0, 300)).toBe(200)
      const id = String(called.said.message)
      t.client.sqlite.prepare('UPDATE records SET data = json_remove(data, ?) WHERE id = ?').run(path, id)
      broken.push({ id, lacks })
    }
    // FROM THE FIRST: every whole summons before the first broken one, and none of the broken, with the stop said.
    const whole = await ask('GET', '/api/office/summonses', byItsKey('the-mailer'))
    expect(whole.code, whole.text.slice(0, 300)).toBe(200)
    const read = whole.said.summonses.map((one: { id: string }) => one.id) as string[]
    expect(read.slice(0, 2)).toEqual(made)
    expect(read).toHaveLength(7)
    for (const one of broken) expect(read).not.toContain(one.id)
    expect(whole.said.says).toContain('stops before a summons that cannot be read')
    // THEN EACH BROKEN ONE IN TURN IS REFUSED, NAMED WITH WHAT IT LACKS, and reading on after it goes on.
    let after = read[read.length - 1]
    for (const one of broken) {
      const refused = await ask('GET', `/api/office/summonses?after=${String(after)}`, byItsKey('the-mailer'))
      expect(refused.code, refused.text.slice(0, 300)).toBe(500)
      expect(refused.said.error).toContain(one.id)
      expect(refused.said.error).toContain(`cannot be read: ${one.lacks} is missing`)
      expect(refused.text).not.toContain('"summonses"')
      after = one.id
    }
    const past = await ask('GET', `/api/office/summonses?after=${String(after)}`, byItsKey('the-mailer'))
    expect(past.code, past.text.slice(0, 300)).toBe(200)
    expect(past.said.summonses).toEqual([])
  })
})
