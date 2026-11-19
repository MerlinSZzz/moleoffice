// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REGISTRATION RECORDS THE FOLDER THIS AGENT'S SESSIONS START IN. Part (c) of a
 * decision.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * A terminal has no way of its own to know which agent it is. The session hook reads the
 * environment, then a `.env`, then a registered start folder, then nobody. This file drives the real
 * server and measures the writing half of that third source:
 *
 *   · a folder written with a trailing slash is stored in the one spelling the office keeps, and the
 *     reply says what was recorded;
 *   · a relative folder is refused, by name, and nothing at all is registered;
 *   · a second agent may register the same folder — it is recorded and the reply names the first,
 *     because refusing would stop that agent registering at all (the secretary's answer to open question 12);
 *   · an agent may not change its own start folder, by the door or by a plain write of the field, and
 *     a holder of the secretary card may, with a reason, which is recorded on the record.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * Control: every case green on the unmutated tree.
 *
 *   · drop the `startFolder` write from `registerTheSessionItself` in
 *     src/server/lib/selfregistration.ts → the first case is red, because nothing is recorded.
 *   · drop `checkNobodyIsChangingAStartFolder` from the patch path in src/server/lib/records.ts →
 *     the plain-write half of the last case is red, because the agent changes its own folder.
 *   · put the measurement's own first reply back — the one that predicts the hook names this agent →
 *     the first case is red, because the reply no longer carries the condition.
 *
 * The file was restored byte-identical after each mutation (sha256 before and after).
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { AddressInfo } from 'node:net'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { writeFileSync } from 'node:fs'

/**
 * A MADE-UP PERSON KEY, sent with every self-registration here: a new handle whose request proves
 * nobody waits for the owner’s press (decision Nc9QRT9R_IvF), and these cases are about one admitted at once.
 */
const PERSON_KEY = randomBytes(32).toString('hex')
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let here: string

/** A folder that is neither the root nor a home, so it is one an agent may register. */
const FOLDER = '/tmp/mole-office-start-folder-test'

const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/**
 * Register a session as itself, through the listening server.
 *
 * `POST /api/agents/register-myself` is a `local` route, so it is asked over the loopback listener
 * rather than by injection, exactly as tests/self-registration.test.ts asks it.
 */
async function registerMyself(body: Record<string, unknown>): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const res = await fetch(`${here}/api/agents/register-myself`, {
    method: 'POST',
    headers: { ...asAgent(String(body['handle'])), 'x-mole-office-key': PERSON_KEY },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: res.status, json, text }
}

async function post(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const res = await app.inject({ method: 'POST', url, headers, payload: body })
  return { status: res.statusCode, json: res.json() as Record<string, unknown>, text: res.body }
}

async function patch(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<{ status: number; text: string }> {
  const res = await app.inject({ method: 'PATCH', url, headers, payload: body })
  return { status: res.statusCode, text: res.body }
}

/** The data of one record, read back through the door anybody reads it through. */
async function dataOf(recordId: string): Promise<Record<string, unknown>> {
  const res = await app.inject({ method: 'GET', url: `/api/records/${recordId}`, headers: AS_THE_OWNER })
  expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
  return (res.json() as { record: { data: Record<string, unknown> } }).record.data
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
  // A SECRETARY, REGISTERED BY THE PERSON, because only the person appoints one. It is the third of the three
  // the change door allows and the one that is neither the owner nor this agent's starter.
  const made = await post('/api/agents/started', { handle: 'sf-secretary', name: 'A secretary', role: 'secretary' }, AS_THE_OWNER)
  expect(made.status, made.text.slice(0, 300)).toBe(201)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a registration records the folder its sessions start in', () => {
  it('stores a folder written with a trailing slash in one spelling, and says what it recorded', async () => {
    const made = await registerMyself({
      handle: 'sf-one',
      name: 'Start folder one',
      workingDirectory: '/tmp/mole-office-start-folder-test/work',
      startFolder: `${FOLDER}/`,
    })
    expect(made.status, made.text.slice(0, 400)).toBe(201)
    // THE STORED SPELLING, IN THE REPLY AND ON THE RECORD. Both, because a reply that said one thing
    // and a record that held another would be the drift this project keeps finding.
    expect(made.json['startFolder']).toBe(FOLDER)
    const data = await dataOf(String(made.json['record']))
    expect(data['startFolder']).toBe(FOLDER)
    // AND THE REPLY SAYS SO IN WORDS. MUTATION: drop the write in `registerTheSessionItself` and
    // both of the two above are absent.
    expect(String(made.json['startFolderSays'])).toContain(
      `"${FOLDER}" is recorded as the folder this agent's sessions start in.`,
    )
    /**
     * THE WHOLE CONDITION, WORD FOR WORD, AND NOT ONLY THE HANDLE.
     *
     * These are the words wave 10's supervisor settled on 24 September 2026 (message IJ-SxOyi6Mgl). What
     * they replaced predicted one outcome — "the start hook names <h> for a session started there when
     * neither its environment nor a .env names an agent" — which is false while another live agent
     * shares the folder, while <h> answers in another live session, and when the office does not answer
     * the hook's read. A reply that went quietly back to predicting one outcome would pass a check on
     * the handle alone, so the condition and the "otherwise" are both asserted here.
     */
    expect(String(made.json['startFolderSays'])).toContain(
      'When a session starts there and neither its environment nor a .env names an agent, the start hook names ' +
        '"sf-one" if "sf-one" is the only live agent registered as starting there and is not already answering in ' +
        'another live session. Otherwise it names no agent and says why.',
    )
    // AND IT PREDICTS NOTHING. The exact words above would also fail if the old sentence came back, and
    // this says what the fault would be rather than leaving a reader to work it out from a diff.
    expect(String(made.json['startFolderSays']), 'the reply predicts one outcome again').not.toContain(
      'for a session started there when neither its environment nor a .env names an agent',
    )
  })

  it('refuses a relative folder by name, and registers nothing at all', async () => {
    const made = await registerMyself({
      handle: 'sf-relative',
      name: 'Start folder relative',
      workingDirectory: '/tmp/mole-office-start-folder-test/work',
      startFolder: 'work/here',
    })
    expect(made.status, made.text.slice(0, 400)).toBe(400)
    expect(made.text).toContain('is not an absolute path')
    expect(made.text).toContain('Nothing was registered.')
    // NOTHING WAS WRITTEN, which is what the refusal claims. The row is the cheapest proof of it.
    const rows = t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM agents WHERE handle = ?').get('sf-relative') as { n: number }
    expect(rows.n, 'a refused registration left an agent row behind').toBe(0)
  })

  it('records a second agent at the same folder and names the first in the reply', async () => {
    const made = await registerMyself({
      handle: 'sf-two',
      name: 'Start folder two',
      workingDirectory: '/tmp/mole-office-start-folder-test/work',
      startFolder: FOLDER,
    })
    expect(made.status, made.text.slice(0, 400)).toBe(201)
    expect(made.json['startFolder']).toBe(FOLDER)
    const says = String(made.json['startFolderSays'])
    expect(says).toContain(`"${FOLDER}" is also the registered start folder of sf-one.`)
    expect(says).toContain('While more than one live agent has it, the start hook names none of them there.')
  })

  it('refuses the agent its own start folder, by the door and by a plain write, and lets a secretary change it', async () => {
    const record = String(
      (
        await post(
          '/api/agents/started',
          { handle: 'sf-changed', name: 'Start folder changed', role: 'worker', workArea: ['src'] },
          AS_THE_OWNER,
        )
      ).json['record'],
    )

    // THE AGENT ITSELF, THROUGH THE DOOR. `whoMayChangeItsAreas` allows the owner, the starter or a
    // secretary, and this agent is none of the three.
    const byItself = await post(
      '/api/participants/agent/sf-changed/start-folder',
      { startFolder: `${FOLDER}/deep`, because: 'I would like to be recognised' },
      asAgent('sf-changed'),
    )
    expect(byItself.status, byItself.text.slice(0, 300)).toBe(403)
    expect(byItself.text).toContain('may change its start folder')

    // AND THE AGENT ITSELF, BY A PLAIN WRITE OF THE FIELD, which is the other route to it. MUTATION:
    // drop `checkNobodyIsChangingAStartFolder` from the patch path and this write is accepted.
    const byHand = await patch(`/api/records/${record}`, { dataPatch: { startFolder: `${FOLDER}/deep` } }, asAgent('sf-changed'))
    expect(byHand.status, byHand.text.slice(0, 300)).toBe(403)
    expect(byHand.text).toContain('/start-folder')
    expect(await dataOf(record)).not.toHaveProperty('startFolder')

    // AND A SECRETARY MAY, WITH A REASON, and the record says which of the three it was.
    const bySecretary = await post(
      '/api/participants/agent/sf-changed/start-folder',
      { startFolder: `${FOLDER}/deep`, because: `${THE_TEST_OFFICES_SECRETARY.handle} asked for this worker to be recognised in its own folder` },
      asAgent('sf-secretary'),
    )
    expect(bySecretary.status, bySecretary.text.slice(0, 300)).toBe(200)
    expect(bySecretary.json['startFolder']).toBe(`${FOLDER}/deep`)
    const data = await dataOf(record)
    expect(data['startFolder']).toBe(`${FOLDER}/deep`)
    const mark = (data['extra'] as Record<string, unknown>)['startFolderChange'] as Record<string, unknown>
    expect(mark['how']).toBe('a-secretary')
    expect(mark['because']).toContain(`${THE_TEST_OFFICES_SECRETARY.handle} asked for this worker`)
    expect(mark['before']).toBe(null)
    expect(mark['after']).toBe(`${FOLDER}/deep`)

    // A REASON IS NOT OPTIONAL, because a change nobody explained is one nobody can argue with.
    const noReason = await post(
      '/api/participants/agent/sf-changed/start-folder',
      { startFolder: FOLDER, because: '   ' },
      asAgent('sf-secretary'),
    )
    expect(noReason.status, noReason.text.slice(0, 300)).toBe(400)
    expect(noReason.text).toContain('Say why the start folder changed.')
  })
})
