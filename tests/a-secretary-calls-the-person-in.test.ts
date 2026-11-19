// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SECRETARY CALLS THE PERSON INTO THE OFFICE, AND NOTHING ELSE LEAVES. The office only summons, and the mail is
 * the mail tool's. The doors are src/server/api/summons.ts and
 * the summons is src/server/lib/summons.ts. Until 28 September 2026 this file was
 * tests/a-secretary-calls-the-person-in-with-one-fixed-mail.test.ts, when the office still sent the mail itself; the
 * letter and its sending are now tests/the-mail-tool-mails-each-summons.test.ts.
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *   · A secretary's summons writes one message to the person in the office, from the secretary: who calls, how urgent, the
 *     title, and what became of the push. The reply counts the devices told and names no address.
 *   · A worker is refused by the role gate, and a caller no registry holds is refused by the door, before anything is
 *     written.
 *   · A title with a link, a mail address, a machine address or a second line is refused before anything is written.
 *   · The office holds no mail setting: the three settings doors are gone, and the summons entries an earlier office
 *     wrote into the person's key file stay exactly as they were, read by nothing.
 *   · The letter's words the tool sends are kept in src/config/the-summons-mail.mjs, and are checked here, on the words
 *     themselves: the subject says who calls and how urgent, for both urgencies; the body names the caller and the
 *     title; no letter the tool sends (a summons, the test letter, the letter for a summons the office cannot read)
 *     holds a link or an address; every address is taken out of what a server said; and a long subject folds into
 *     encoded words that read back whole. The mail tool's own test compares each letter it sent with these words, so it
 *     cannot catch a wrong word in them (the inspector's refusal of 28 September 2026, check 5O83xXKra38G).
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN
 * ---------------------------------------------------------------------------------------
 *   1. src/server/api/summons.ts, `whoCalls`: answer the actor's id instead of refusing an unregistered caller. The
 *      unregistered case goes red, because a message is written.
 *   2. design/permissions/roles.json: move "Calling the person in" from the secretary's step down to rung 1's `adds`
 *      (the tree refuses a power added twice). The worker case goes red.
 *   3. src/server/lib/summons.ts, `aTitleTheMailMayCarry`: drop the link test. The title case goes red on the link.
 *   4. src/config/the-summons-mail.mjs, `withoutAddresses`: drop the mail address rule. The words case goes red, and
 *      the title case with it on the address.
 *   5. src/server/lib/summons.ts, `summonThePerson`: answer `mailed: false` again. The first case goes red.
 *   6. src/server/lib/summons.ts, `summonThePerson`: write "The mail was not sent." into the message again. The first
 *      case goes red.
 *   7. src/config/the-summons-mail.mjs, `theSummonsMail`: the office's address put into the body. The letters case goes
 *      red.
 *   8. The same, the subject: the words of "soon" said for either urgency. The letters case goes red.
 *   9. The same, the body: the title left out. The letters case goes red.
 *  10. `theTestMail`: an address put into its body. The letters case goes red.
 */

import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { keysPathFrom } from '../src/config/settings.mjs'
import { headerWords, theSummonsMail, theTestMail, theUnreadableSummonsMail, withoutAddresses } from '../src/config/the-summons-mail.mjs'

const SENDER = 'office-bell@example.test'
const PERSON_ADDRESS = 'person@example.test'
const PASSWORD = 'not-a-real-password-1234'

let t: TestDb
let app: FastifyInstance
let secretaryId: string

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

async function post(path: string, body: unknown, headers: Record<string, string>): Promise<{ code: number; said: Record<string, unknown>; text: string }> {
  const reply = await app.inject({ method: 'POST', url: path, headers, payload: body as object })
  return { code: reply.statusCode, said: reply.json() as Record<string, unknown>, text: reply.body }
}

async function get(path: string, headers: Record<string, string>): Promise<{ code: number; said: Record<string, unknown>; text: string }> {
  const reply = await app.inject({ method: 'GET', url: path, headers })
  return { code: reply.statusCode, said: reply.json() as Record<string, unknown>, text: reply.body }
}

/** The message a summons wrote, as the person reads it. */
async function theMessage(id: string): Promise<{ title: string; body: string; to: unknown; sentBy: unknown }> {
  const read = await get(`/api/records/${id}`, AS_THE_PERSON)
  expect(read.code, read.text.slice(0, 300)).toBe(200)
  const record = (read.said['record'] ?? read.said) as { kind: string; title: string; data: Record<string, unknown> }
  expect(record.kind).toBe('message')
  return { title: record.title, body: String(record.data['body']), to: record.data['to'], sentBy: record.data['sentBy'] }
}

/** How many messages the office holds, to compare before and after a request that must write none. */
function howManyMessages(): number {
  return (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'message'").get() as { n: number }).n
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  const idOf = (said: Record<string, unknown>): string => (said as { agent: { id: string } }).agent.id
  secretaryId = idOf((await post('/api/agents/started', { handle: 'sec-one', name: 'Secretary One', role: 'secretary' }, AS_THE_PERSON)).said)
  await post('/api/agents/started', { handle: 'w-one', name: 'Worker One', role: 'worker' }, asAgent('sec-one'))
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a secretary calls the person in', () => {
  it('writes one message to the person from the secretary, and the reply names no address', async () => {
    const called = await post('/api/office/summon', { title: 'The nightly build is red', urgency: 'now' }, asAgent('sec-one'))
    expect(called.code, called.text.slice(0, 300)).toBe(200)
    // WHAT THE REPLY CARRIES: the message, how many devices were told, and a sentence. No word of mail.
    expect(called.said).toMatchObject({ told: 0 })
    expect(typeof called.said['message']).toBe('string')
    expect(called.said).not.toHaveProperty('mailed')
    expect(called.text).not.toMatch(/@|mail was/i)

    const message = await theMessage(String(called.said['message']))
    expect(message.title).toBe('召唤：The nightly build is red')
    expect(message.body).toContain('Secretary One 叫你到 office 来（急，请尽快来）：The nightly build is red')
    expect(message.body).not.toMatch(/mail was|mail server/i)
    expect(message.to).toEqual([{ kind: 'person', id: THE_PERSON }])
    expect(message.sentBy).toEqual({ kind: 'agent', id: secretaryId })
  })

  it('says a summons that is not urgent as not urgent', async () => {
    const called = await post('/api/office/summon', { title: 'A question when you have time', urgency: 'soon' }, asAgent('sec-one'))
    expect(called.code).toBe(200)
    expect((await theMessage(String(called.said['message']))).body).toContain('（不急，有空时来）')
  })

  it('refuses a worker at the role gate, before anything is written', async () => {
    const before = howManyMessages()
    const refused = await post('/api/office/summon', { title: 'Help' }, asAgent('w-one'))
    expect(refused.code).toBe(403)
    expect(refused.text).toContain('Call the person into the office')
    expect(howManyMessages()).toBe(before)
  })

  it('refuses a caller no registry holds, before anything is written', async () => {
    const before = howManyMessages()
    const refused = await post('/api/office/summon', { title: 'Help' }, asAgent('nobody-registered'))
    expect(refused.code, refused.text.slice(0, 300)).toBe(403)
    expect(refused.text).toContain('Nothing in either registry answers')
    expect(howManyMessages()).toBe(before)
  })

  it('refuses a title with a link, an address or a second line, before anything is written', async () => {
    const before = howManyMessages()
    for (const title of [
      'Look at https://example.test/run/1',
      'Write to person@example.test',
      'The box at 192.0.2.10 is down',
      'First line\nsecond line',
      'x'.repeat(121),
      '   ',
    ]) {
      const refused = await post('/api/office/summon', { title }, asAgent('sec-one'))
      expect(refused.code, `${JSON.stringify(title)}: ${refused.text.slice(0, 200)}`).toBe(400)
      expect(refused.text).toContain('Nothing was sent')
    }
    expect(howManyMessages()).toBe(before)
  })
})

describe('the office holds no mail setting', () => {
  it('has no settings doors, and leaves the summons entries in the person\'s key file exactly as they were', async () => {
    // THE ENTRIES AN EARLIER OFFICE WROTE, put in the key file the way it wrote them.
    const { setProviderSecret } = await import('../src/server/lib/keys.ts')
    setProviderSecret('summons-from', SENDER)
    setProviderSecret('summons', PASSWORD)
    setProviderSecret('summons-to', PERSON_ADDRESS)
    const file = keysPathFrom(process.env)
    const before = readFileSync(file)
    for (const [method, url] of [
      ['GET', '/api/office/summons'],
      ['POST', '/api/office/summons/set'],
      ['POST', '/api/office/summons/test'],
    ] as const) {
      const reply = await app.inject({ method, url, headers: AS_THE_PERSON, ...(method === 'POST' ? { payload: {} } : {}) })
      expect(reply.statusCode, `${method} ${url}: ${reply.body.slice(0, 200)}`).toBe(404)
    }
    const called = await post('/api/office/summon', { title: 'A summons after the settings left' }, asAgent('sec-one'))
    expect(called.code, called.text.slice(0, 300)).toBe(200)
    expect(called.text).not.toContain(SENDER)
    expect(called.text).not.toContain(PERSON_ADDRESS)
    expect(readFileSync(file).equals(before), 'the key file changed').toBe(true)
    const kept = JSON.parse(readFileSync(file, 'utf8')) as { providers: Record<string, string> }
    expect(kept.providers['summons-from']).toBe(SENDER)
    expect(kept.providers['summons-to']).toBe(PERSON_ADDRESS)
    expect(kept.providers['summons']).toBe(PASSWORD)
  })
})

describe("the letter's words, kept for the mail tool in src/config/the-summons-mail.mjs", () => {
  it('says who calls, how urgent and the title, for both urgencies, and no letter holds a link or an address', () => {
    // THE WORDS THEMSELVES, and not a letter the tool sent compared with theSummonsMail(), which is what the mail tool's
    // test does and which a wrong word here would pass.
    const now = theSummonsMail({ who: 'Secretary One', title: 'The nightly build is red', urgency: 'now' })
    expect(now.subject).toBe('Mole Office：Secretary One 叫你（急，请尽快来）')
    expect(now.body).toContain('Secretary One 在 Mole Office 里叫你')
    expect(now.body).toContain('The nightly build is red')
    const soon = theSummonsMail({ who: 'Secretary One', title: 'A question when you have time', urgency: 'soon' })
    expect(soon.subject).toBe('Mole Office：Secretary One 叫你（不急，有空时来）')
    expect(soon.body).toContain('Secretary One 在 Mole Office 里叫你')
    expect(soon.body).toContain('A question when you have time')
    // NO LETTER THE TOOL SENDS CARRIES A LINK OR AN ADDRESS, of the office or of anybody.
    for (const letter of [now, soon, theTestMail(), theUnreadableSummonsMail('AbCdEfGhIjKl')]) {
      expect(`${letter.subject}\n${letter.body}`).not.toMatch(/https?:|@|127\.0\.0\.1|localhost/)
    }
  })

  it('takes every address out of what a server or the network said, and leaves a clock time alone', () => {
    expect(withoutAddresses('550 5.1.1 <person@example.test> no such user')).toBe('550 5.1.1 <<a mail address>> no such user')
    expect(withoutAddresses('connect ECONNREFUSED 192.0.2.7:465')).toBe('connect ECONNREFUSED <a machine address>')
    expect(withoutAddresses('connect ECONNREFUSED ::1:25')).not.toContain('::1')
    expect(withoutAddresses('connect ETIMEDOUT 2001:db8::5')).toBe('connect ETIMEDOUT <a machine address>')
    expect(withoutAddresses('ended at 13:59:32')).toBe('ended at 13:59:32')
  })

  it('folds a long subject into encoded words of at most 75 characters that read back whole', () => {
    const subject = 'Mole Office：Secretary One 叫你（急，请尽快来）'.repeat(3)
    const folded = headerWords(subject)
    for (const word of folded.split('\r\n ')) expect(word.length).toBeLessThanOrEqual(75)
    const back = folded
      .split('\r\n ')
      .map((word) => Buffer.from(/=\?UTF-8\?B\?([^?]*)\?=/.exec(word)?.[1] ?? '', 'base64').toString('utf8'))
      .join('')
    expect(back).toBe(subject)
  })
})
