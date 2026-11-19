// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A HANDLE STARTS AND ENDS WITH A LETTER OR A DIGIT, AT BOTH DOORS. Problem mnZfYBa1-_aA.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * There were two handle rules. The registry's, `whyHandleIsRefused` in src/shared/participants.ts, took a
 * handle with a dash at either end. The agent record's, `whyThatIsNotAHandle` in src/server/lib/inbox.ts,
 * refused it, and the migration in src/server/db/agent-identity.ts kept a copy of that one. A registration
 * that waits for the person's press asked neither, so it filed a waiting row for such a handle, and the
 * agent record refused it only at the press. This file holds them to one rule:
 *
 *   1. the registry's rule refuses a dash at either end, in a sentence of its own, and the agent
 *      record's rule and the migration's say that same sentence of the same handle;
 *   2. the two registration doors that write an agent at once, POST /api/agents/started and
 *      POST /api/agents/register-myself with the person's key, refuse such a handle with 400 in the
 *      agent record's words, which carry that sentence;
 *   3. a registration with no key, which waits for the person's press, is refused the same way, and
 *      no waiting row is filed;
 *   4. a control: a handle with an inner dash is taken by every rule and every door, as it always was.
 *
 * Every sentence is read from the module that says it, so the words can change without this file.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, EACH AFTER A GREEN CONTROL RUN
 * ---------------------------------------------------------------------------------------
 *
 *   H1. the check of a dash at either end taken out of the shared rule: cases 1, 2 and 3 red.
 *   H2. the end-dash sentence made the same words as the characters sentence: case 1 red.
 *   H3. inbox.ts answers from its old pattern and words again rather than the shared rule: cases 1, 2 and 3 red.
 *   H4. agent-identity.ts answers from its old copy again: case 1 red, at the migration's words.
 *   H5. the handle check taken out of the waiting registration: case 3 red, at the status.
 *   H6. the waiting registration's check made after its row is written: case 3 red, at the count of rows.
 *   H7. the shared rule refusing every dash: case 4 red.
 *   H8. only a dash at the start refused: case 1 red at the end's words, cases 2 and 3 at "strail-" and "wtrail-".
 *   H9. the agent record's rule taking a dash at either end: cases 1, 2 and 3 red. Case 2's door answers 500,
 *       because the agent record is written and the registry refuses its row.
 *   H10. the agent record's write refusing in words of its own: case 2 red, at POST /api/agents/started's words.
 *   H11. the agent record's words leaving out what breaks the rule: cases 1, 2 and 3 red, at "toContain".
 *   H12. the agent record's rule refusing an inner dash: case 4 red, at the agent record's rule.
 *   H13. the migration's rule refusing an inner dash: case 4 red, at the migration's rule.
 *   H14. this file counting rows of a kind nobody files: case 4 red, at the count. So the count case 3 reads is
 *        shown to see a waiting row.
 *   H15. the shared rule taking an underscore: case 1 red, at the wrong character's sentence.
 *   H16. the registration door refusing in words of its own: cases 2 and 3 red, at the words with the person's key
 *        and with none.
 *   H17. the agent record's write refusing an inner dash: case 4 red, at POST /api/agents/started.
 *   H18. the registration with the person's key refusing an inner dash: case 4 red, at that registration.
 *   H19. the waiting registration refusing an inner dash: case 4 red, at the waiting registration.
 *
 * Each source was restored byte for byte after each mutation, and the file was run green once more after the last.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { AddressInfo } from 'node:net'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

/** A made-up person key, so a registration that carries it is admitted at once (decision Nc9QRT9R_IvF). */
const PERSON_KEY = randomBytes(32).toString('hex')
/** A folder that is neither the root nor a home, so a registration may name it. */
const FOLDER = '/tmp/mole-office-handle-rule-test'

let t: TestDb
let app: FastifyInstance
let here: string

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The three rules, read where each lives. Imported after freshDb, because inbox.ts reaches the database. */
async function theRules(): Promise<{
  registry: (handle: string) => string | null
  agentRecord: (handle: unknown) => string | null
  migration: (handle: unknown) => string | null
}> {
  const shared = await import('../src/shared/participants.ts')
  const inbox = await import('../src/server/lib/inbox.ts')
  const migration = await import('../src/server/db/agent-identity.ts')
  return { registry: shared.whyHandleIsRefused, agentRecord: inbox.whyThatIsNotAHandle, migration: migration.whyThatIsNotAHandle }
}

/** POST /api/agents/started, as the person. */
async function startedByThePerson(handle: string): Promise<{ status: number; text: string }> {
  const res = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_OWNER, payload: { handle, name: `Agent ${handle}` } })
  return { status: res.statusCode, text: res.body }
}

/**
 * POST /api/agents/register-myself, over the loopback listener because it is a `local` route. With the person's key the
 * agent is admitted at once; with no key the registration waits for the person's press.
 */
async function registerMyself(handle: string, withThePersonsKey: boolean): Promise<{ status: number; text: string }> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
  }
  if (withThePersonsKey) headers['x-mole-office-key'] = PERSON_KEY
  const res = await fetch(`${here}/api/agents/register-myself`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ handle, name: `Agent ${handle}`, workingDirectory: `${FOLDER}/${handle}` }),
  })
  return { status: res.status, text: await res.text() }
}

/** The refusal's words, read from a 400's body. */
function wordsOf(answer: { status: number; text: string }): string {
  expect(answer.status, answer.text.slice(0, 400)).toBe(400)
  return String((JSON.parse(answer.text) as { error?: unknown }).error)
}

/** How many registrations wait for the person's press: the role requests in the store. */
function waitingRows(): number {
  return (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM records WHERE kind = ?').get('role_request') as { n: number }).n
}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: PERSON_KEY, office: randomBytes(32).toString('hex'), providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  here = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a handle starts and ends with a letter or a digit, by one rule', () => {
  it('1. the registry refuses a dash at either end in a sentence of its own, and the agent record and the migration say it too', async () => {
    const rules = await theRules()
    const atTheStart = rules.registry('-lead')
    const atTheEnd = rules.registry('trail-')
    expect(atTheStart, 'the registry takes a handle that starts with a dash').not.toBeNull()
    expect(atTheEnd, 'the registry gives a dash at the end other words than a dash at the start').toBe(atTheStart)
    // ITS OWN SENTENCE: not the one a handle with a character no handle holds is refused with.
    const aWrongCharacter = rules.registry('lead_x')
    expect(aWrongCharacter).not.toBeNull()
    expect(atTheStart).not.toBe(aWrongCharacter)
    for (const handle of ['-lead', 'trail-']) {
      const said = rules.agentRecord(handle)
      expect(said, `the agent record's rule takes ${handle}`).not.toBeNull()
      expect(String(said), `the agent record's rule says other words of ${handle}`).toContain(String(atTheStart))
      expect(rules.migration(handle), `the migration's rule disagrees about ${handle}`).toBe(said)
    }
  })

  it('2. the doors that register an agent at once refuse a dash at either end in the agent record\'s words', async () => {
    const rules = await theRules()
    for (const handle of ['-slead', 'strail-']) {
      const sentence = rules.registry(handle)
      expect(sentence, `the registry takes ${handle}`).not.toBeNull()
      const started = wordsOf(await startedByThePerson(handle))
      expect(started).toBe(rules.agentRecord(handle))
      expect(started).toContain(String(sentence))
    }
    for (const handle of ['-klead', 'ktrail-']) {
      const sentence = rules.registry(handle)
      expect(sentence, `the registry takes ${handle}`).not.toBeNull()
      const keyed = wordsOf(await registerMyself(handle, true))
      expect(keyed).toBe(rules.agentRecord(handle))
      expect(keyed).toContain(String(sentence))
    }
  })

  it('3. a registration that waits for the person\'s press is refused the same way, and files no waiting row', async () => {
    const rules = await theRules()
    for (const handle of ['-wlead', 'wtrail-']) {
      const before = waitingRows()
      const answer = await registerMyself(handle, false)
      expect(answer.status, `a waiting registration was taken for ${handle}: ${answer.text.slice(0, 300)}`).toBe(400)
      expect(waitingRows(), `a waiting row was filed for ${handle}`).toBe(before)
      expect(wordsOf(answer)).toBe(rules.agentRecord(handle))
      expect(wordsOf(answer)).toContain(String(rules.registry(handle)))
    }
  })

  it('4. a handle with an inner dash is taken by every rule and every door', async () => {
    const rules = await theRules()
    expect(rules.registry('in-ner')).toBeNull()
    expect(rules.agentRecord('in-ner')).toBeNull()
    expect(rules.migration('in-ner')).toBeNull()
    const started = await startedByThePerson('sin-ner')
    expect(started.status, started.text.slice(0, 300)).toBe(201)
    const keyed = await registerMyself('kin-ner', true)
    expect(keyed.status, keyed.text.slice(0, 300)).toBe(201)
    const before = waitingRows()
    const waiting = await registerMyself('win-ner', false)
    expect(waiting.status, waiting.text.slice(0, 300)).toBe(202)
    expect(waitingRows()).toBe(before + 1)
  })
})
