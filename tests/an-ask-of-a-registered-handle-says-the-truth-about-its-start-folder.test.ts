// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ASK OF A REGISTERED HANDLE SAYS THE TRUTH ABOUT ITS START FOLDER. Wave 13y round 135, item 75.
 *
 * An agent whose first ask carried a start folder asks the self-registration door again once it is admitted, and is
 * answered the registration it has. That answer's startFolderSays said the folder "was not recorded" even when it was
 * the very folder recorded for the handle, so a second user's Mac check read a true state as a failure. It now says:
 *
 *   · the folder recorded already: it is recorded, and nothing changed;
 *   · any other folder: it was not recorded, and the folder that is recorded is named, or that none is.
 *
 * The words are read from startFolderSaysToARegisteredHandle, the door's own function, and not copied here. Before the
 * words are compared, each case checks a fact that does not depend on them: the record's folder is unchanged, the same
 * folder and another folder are not answered with one sentence, and a differing ask names the recorded folder.
 *
 * Red before the code: case 1 found one sentence for the recorded folder and for another one, and case 2 found the
 * recorded folder not named.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { AddressInfo } from 'node:net'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

type Participants = typeof import('../src/server/api/participants.ts')

/** A made-up person key, so each first ask is admitted at once and the second ask finds the handle registered. */
const PERSON_KEY = randomBytes(32).toString('hex')

/** Two folders that are neither the root nor a home, so an agent may register either. */
const FOLDER = '/tmp/mole-office-registered-folder-test/first'
const OTHER = '/tmp/mole-office-registered-folder-test/second'
/** The folder each ask says the session is working in, which a registration must name. */
const WORKING = '/tmp/mole-office-registered-folder-test/work'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let t: TestDb
let app: FastifyInstance
let here: string
/** The door's own words, read once the test database is named: the module opens the database when it loads. */
let startFolderSaysToARegisteredHandle: Participants['startFolderSaysToARegisteredHandle']

/** `POST /api/agents/register-myself` is a `local` route, so it is asked over the loopback listener. */
async function registerMyself(body: Record<string, unknown>): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const res = await fetch(`${here}/api/agents/register-myself`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-workspace': 'default',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': String(body['handle']),
      'x-mole-office-key': PERSON_KEY,
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, json: JSON.parse(text) as Record<string, unknown>, text }
}

/** Register a handle, then ask again as the same handle: the second reply's words about the folder, and the record. */
async function askedAgain(handle: string, first: string | null, again: string): Promise<{ says: string; record: string }> {
  const made = await registerMyself({
    handle,
    name: `Test agent ${handle}`,
    workingDirectory: WORKING,
    ...(first === null ? {} : { startFolder: first }),
  })
  expect(made.status, made.text.slice(0, 300)).toBe(201)
  return { says: await saysAgain(handle, again), record: String(made.json['record']) }
}

async function saysAgain(handle: string, again: string): Promise<string> {
  const reply = await registerMyself({ handle, name: `Test agent ${handle}`, workingDirectory: WORKING, startFolder: again })
  expect(reply.status, reply.text.slice(0, 300)).toBe(200)
  expect(reply.json['alreadyRegistered']).toBe(true)
  return String(reply.json['startFolderSays'])
}

/** The folder an agent record keeps, read back through the door anybody reads it through. */
async function folderOn(recordId: string): Promise<unknown> {
  const res = await app.inject({ method: 'GET', url: `/api/records/${recordId}`, headers: AS_THE_OWNER })
  expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
  return (res.json() as { record: { data: Record<string, unknown> } }).record.data['startFolder']
}

/** A reply with both folders' names taken out, so two replies can be compared for what they say about them. */
const withoutTheFolders = (says: string): string => says.split(FOLDER).join('<a folder>').split(OTHER).join('<a folder>')

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: PERSON_KEY, office: randomBytes(32).toString('hex'), providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  ;({ startFolderSaysToARegisteredHandle } = await import('../src/server/api/participants.ts'))
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

describe('an ask of a registered handle says what is true of the start folder it names', () => {
  it('says the folder recorded already is recorded, and that nothing changed', async () => {
    const { says: same, record } = await askedAgain('rf-same', FOLDER, FOLDER)
    const other = await saysAgain('rf-same', OTHER)
    expect(await folderOn(record)).toBe(FOLDER)
    expect(withoutTheFolders(same), 'the recorded folder and another one are answered with one sentence').not.toBe(
      withoutTheFolders(other),
    )
    expect(same).toBe(startFolderSaysToARegisteredHandle('rf-same', FOLDER, FOLDER))
  })

  it('says another folder was not recorded, and names the folder that is, or says none is', async () => {
    const other = await askedAgain('rf-other', FOLDER, OTHER)
    expect(other.says, 'the reply does not name the folder that is recorded').toContain(`"${FOLDER}"`)
    expect(await folderOn(other.record)).toBe(FOLDER)
    expect(other.says).toBe(startFolderSaysToARegisteredHandle('rf-other', OTHER, FOLDER))

    const none = await askedAgain('rf-none', null, OTHER)
    expect(await folderOn(none.record)).toBeUndefined()
    expect(none.says).toBe(startFolderSaysToARegisteredHandle('rf-none', OTHER, null))
  })
})
