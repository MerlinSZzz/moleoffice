// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SECRETARY CHANGES THE CASTING TABLE BY ITS OWN CARD, AND NOBODY ELSE BUT THE OWNER DOES. The casting
 * table is one of a secretary's default powers.
 *
 * WHAT IS REAL: a scratch office with a real listener on a port of its own. The coordinator Vale (a secretary), Moss Tally (a
 * worker) and Fern Ledger (a supervisor) are made-up agents, each registered by the person and each holding the key
 * the office answered. The key window stays open, so a request that only names an agent reaches the door.
 *
 *   1. The secretary, with its own key, adds, changes, marks and removes a casting, and each answers success.
 *   2. A worker and a supervisor, each with its own key, are refused at all four doors with a 403 and the code
 *      castingNotOwnerOrSecretary, and nothing is written.
 *   3. A request that names the secretary with no key is refused the same way, and nothing is written.
 *   4. The history of the secretary's casting names the secretary, as an agent, by its registry id, and so does the
 *      row's last change.
 *   5. The person still adds, changes, marks and removes a casting.
 *   6. The refusal names the card that holds the act, read from the role cards the gate reads (problem
 *      XCvn6ypadyMT): the secretary with the cards on disk, and the inspector with a test's own cards that give the
 *      act to the inspector alone. The page draws the name from the code's value.
 *   7. Where more than one card holds the act, the refusal carries the code castingNotOwnerOrACardThatHoldsIt, whose
 *      page sentence names no card, since one card name would leave the others out; its English names each card.
 *   8. A raise opens no Casting door (problem XCvn6ypadyMT). A secretary under the owner's raise writes by its card, and the
 *      row and the history name no raise. With a test's own cards that take the act off the secretary card, the same
 *      raised secretary is refused, and nothing is written.
 *
 * MUTATIONS, NAMED, EACH ALONE AFTER A GREEN CONTROL:
 *   a. "The Casting table" taken off the secretary's step of the tree in design/permissions/roles.json: case 1 goes red;
 *   b. the card check taken out of the mark door in src/server/api/casting.ts: case 2 goes red;
 *   c. `whoWrote` in src/server/lib/casting.ts answering the person for every writer: case 4 goes red;
 *   d. the refusal's card fixed as 'secretary' in src/server/api/casting.ts: case 6 goes red;
 *   e. castingNotOwnerOrSecretary sent whatever the number of cards: case 7 goes red;
 *   f. the gate in src/server/api/casting.ts letting a raise through (aRaiseCarriesIt): case 8 goes red.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { RolesDeclaration } from '../src/shared/roles.ts'
import { forgetTheWorldsOwnAuthority } from '../src/server/lib/worldauthority.ts'

/** Made-up values. Nothing here is, or was ever, a key any office issued. */
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const WORKSPACE = { 'x-mole-office-workspace': 'default' }
const THE_PERSON_ASKS = { ...WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-key': A_MADE_UP_PERSON_KEY }

let t: TestDb
let app: FastifyInstance
let roles: typeof import('../src/server/lib/roles.ts')
let guardActKeys: (string | null)[] = []
/** The folders `withTheseCards` made, each holding one changed declaration. Removed after all. */
const made: string[] = []
let door = ''
const keys = new Map<string, string>()
const ids = new Map<string, string>()

async function ask(method: string, path: string, headers: Record<string, string>, body?: unknown): Promise<{ status: number; body: Record<string, any>; error: string }> {
  const res = await fetch(`${door}${path}`, {
    method,
    headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const read = (await res.json()) as Record<string, any>
  return { status: res.status, body: read, error: typeof read['error'] === 'string' ? read['error'] : '' }
}

/** An agent by its handle, with its own key. */
function as(handle: string): Record<string, string> {
  return { ...WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-key': keys.get(handle) ?? '' }
}

/** An agent by its handle, and no key. */
function named(handle: string): Record<string, string> {
  return { ...WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle }
}

/** Both casting tables, whole, to prove a refused write changed nothing. */
function stored(): string {
  return JSON.stringify([
    t.client.sqlite.prepare('SELECT * FROM casting_rows ORDER BY id').all(),
    t.client.sqlite.prepare('SELECT * FROM casting_row_changes ORDER BY id').all(),
  ])
}

/**
 * THE CARDS ON DISK WITH ONE CHANGE, read through the reader the server uses, while `act` runs; the cards on disk are
 * read back afterwards, so the next case and the next file see them. Nothing is written to design/permissions/roles.json.
 */
async function withTheseCards(change: (decl: RolesDeclaration) => void, act: () => Promise<void>): Promise<void> {
  const decl = JSON.parse(readFileSync(roles.theRoleCardsFile(), 'utf8')) as RolesDeclaration
  change(decl)
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-casting-cards-'))
  made.push(dir)
  const file = join(dir, 'roles.json')
  writeFileSync(file, JSON.stringify(decl, null, 2))
  roles.forgetTheRoleCards()
  roles.readTheRoleCards({ guardActKeys, file })
  try {
    await act()
  } finally {
    roles.forgetTheRoleCards()
    roles.readTheRoleCards({ guardActKeys })
  }
}

const CASTING = 'The Casting table'
/** The act taken off the secretary's step of the tree. */
const offTheSecretary = (decl: RolesDeclaration): void => {
  const step = decl.tree.find((one) => one.role === 'secretary')
  if (step === undefined || !step.adds.includes(CASTING)) throw new Error(`the secretary's step no longer adds ${CASTING}; this test needs reading again`)
  step.adds = step.adds.filter((one) => one !== CASTING)
}
/** The act given to the inspector alone, a card off the tree. */
const toTheInspectorAlone = (decl: RolesDeclaration): void => {
  offTheSecretary(decl)
  const inspector = decl.cards.find((one) => one.name === 'inspector')
  if (inspector === undefined || !Array.isArray(inspector.powers)) throw new Error('the inspector card names no powers of its own; this test needs reading again')
  inspector.powers = [...inspector.powers, CASTING]
}
/** The act moved down to the supervisor's step, so the supervisor card and the secretary card above it both hold it. */
const toTheSupervisorsStep = (decl: RolesDeclaration): void => {
  offTheSecretary(decl)
  const step = decl.tree.find((one) => one.role === 'supervisor')
  if (step === undefined) throw new Error('the tree has no supervisor step; this test needs reading again')
  step.adds = [...step.adds, CASTING]
}

/** The four writes, on one role and one casting, as one caller asks them. */
async function theFourWrites(headers: Record<string, string>, role: string, casting: number): Promise<Record<string, { status: number; code: unknown; error: string }>> {
  const one = async (method: string, path: string, body?: unknown) => {
    const said = await ask(method, path, headers, body)
    return { status: said.status, code: said.body['code'], error: said.error }
  }
  return {
    add: await one('POST', `/api/casting/${role}`, { model: { value: 'sample-model-refused' } }),
    change: await one('PATCH', `/api/casting/rows/${String(casting)}`, { effort: { value: 'high' } }),
    mark: await one('POST', `/api/casting/rows/${String(casting)}/mark`),
    remove: await one('DELETE', `/api/casting/rows/${String(casting)}`),
  }
}

beforeAll(async () => {
  delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
  delete process.env.MOLE_OFFICE_WORLD_SECRETARIES
  forgetTheWorldsOwnAuthority()
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`, { mode: 0o600 })
  app = (await apiApp()).app
  await app.ready()
  roles = await import('../src/server/lib/roles.ts')
  const { GOVERNANCE_GUARDS } = await import('../src/server/lib/records.ts')
  guardActKeys = GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct])
  await app.listen({ host: '127.0.0.1', port: 0 })
  door = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  for (const [handle, name, role] of [[`${THE_TEST_OFFICES_SECRETARY.handle}-vale`, `${THE_TEST_OFFICES_SECRETARY.name} Vale`, 'secretary'], ['moss-tally', 'Moss Tally', 'worker'], ['fern-ledger', 'Fern Ledger', 'supervisor']] as const) {
    const made = await ask('POST', '/api/agents/started', THE_PERSON_ASKS, { handle, name, role })
    expect(made.status, made.error).toBe(201)
    keys.set(handle, String(made.body['whatToGiveIt']?.key ?? ''))
    ids.set(handle, String(made.body['agent']?.id ?? ''))
  }
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

describe('the secretary, by its own card', () => {
  it('1: adds, changes, marks and removes a casting, and each answers success', async () => {
    const first = await ask('POST', '/api/casting/worker', as(`${THE_TEST_OFFICES_SECRETARY.handle}-vale`), { program: { value: 'claude-code' }, model: { value: 'sample-model-a' }, why: { value: "The test's own sample casting." } })
    expect(first.status, first.error).toBe(201)
    const second = await ask('POST', '/api/casting/worker', as(`${THE_TEST_OFFICES_SECRETARY.handle}-vale`), { program: { value: 'codex' }, model: { value: 'sample-model-b' } })
    expect(second.status, second.error).toBe(201)
    const id = Number(second.body['casting'].id)
    const changed = await ask('PATCH', `/api/casting/rows/${String(id)}`, as(`${THE_TEST_OFFICES_SECRETARY.handle}-vale`), { effort: { value: 'max' } })
    expect(changed.status, changed.error).toBe(200)
    expect(changed.body['casting'].cells.effort.value).toBe('max')
    const marked = await ask('POST', `/api/casting/rows/${String(id)}/mark`, as(`${THE_TEST_OFFICES_SECRETARY.handle}-vale`))
    expect(marked.status, marked.error).toBe(200)
    expect(marked.body['casting'].marked).toBe(true)
    const removed = await ask('DELETE', `/api/casting/rows/${String(first.body['casting'].id)}`, as(`${THE_TEST_OFFICES_SECRETARY.handle}-vale`))
    expect(removed.status, removed.error).toBe(200)
    const left = (await ask('GET', '/api/casting/for/worker', THE_PERSON_ASKS)).body
    expect(left['casting']?.id, 'the tools take the casting the secretary marked').toBe(id)
  })
})

describe('nobody else but the owner', () => {
  it('2: refuses a worker and a supervisor, each with its own key, at all four doors, with the code, and writes nothing', async () => {
    const made = await ask('POST', '/api/casting/supervisor', THE_PERSON_ASKS, { model: { value: 'sample-model-c' } })
    expect(made.status, made.error).toBe(201)
    const casting = Number(made.body['casting'].id)
    for (const handle of ['moss-tally', 'fern-ledger']) {
      const before = stored()
      const said = await theFourWrites(as(handle), 'supervisor', casting)
      for (const [door, answer] of Object.entries(said)) {
        expect(answer.status, `${handle} ${door}: ${answer.error}`).toBe(403)
        expect(answer.code, `${handle} ${door}`).toBe('castingNotOwnerOrSecretary')
        expect(answer.error, `${handle} ${door}`).toContain('Changing the Casting table is for the owner, or for an agent holding the secretary card.')
      }
      expect(stored(), `${handle} wrote something`).toBe(before)
    }
  })

  it("3: refuses a request that names the secretary with no key, with the code, and writes nothing", async () => {
    const casting = Number((await ask('GET', '/api/casting/for/supervisor', THE_PERSON_ASKS)).body['casting'].id)
    const before = stored()
    const said = await theFourWrites(named(`${THE_TEST_OFFICES_SECRETARY.handle}-vale`), 'supervisor', casting)
    for (const [door, answer] of Object.entries(said)) {
      expect(answer.status, `${door}: ${answer.error}`).toBe(403)
      expect(answer.code, door).toBe('castingNotOwnerOrSecretary')
      expect(answer.error, door).toContain('only when its own key proves it')
    }
    expect(stored(), 'a name with no key wrote something').toBe(before)
  })
})

describe('the history', () => {
  it("4: names the secretary as an agent, by its registry id, on each change and on the row's last change", async () => {
    const added = await ask('POST', '/api/casting/inspector', as(`${THE_TEST_OFFICES_SECRETARY.handle}-vale`), { model: { value: 'sample-model-d' } })
    expect(added.status, added.error).toBe(201)
    const id = Number(added.body['casting'].id)
    const changed = await ask('PATCH', `/api/casting/rows/${String(id)}`, as(`${THE_TEST_OFFICES_SECRETARY.handle}-vale`), { why: { value: "The test's own reason." } })
    expect(changed.status, changed.error).toBe(200)
    const secretary = { kind: 'agent', id: ids.get(`${THE_TEST_OFFICES_SECRETARY.handle}-vale`) }
    expect(secretary.id, 'the registration answered an id').toBeTruthy()
    const history = (await ask('GET', `/api/casting/inspector/history?casting=${String(id)}`, THE_PERSON_ASKS)).body
    expect(history['changes'].map((one: { what: string; by: unknown }) => [one.what, one.by])).toEqual([
      ['change', secretary],
      ['add', secretary],
    ])
    expect(changed.body['casting'].lastChange.by).toEqual(secretary)
  })
})

describe('the person', () => {
  it('5: still adds, changes, marks and removes a casting', async () => {
    // ON THE SECRETARY CARD, which no case above uses. It was the mailer card until that card left the
    // declaration on 1 October 2026, and a casting is refused for a card nobody declares.
    const first = await ask('POST', '/api/casting/secretary', THE_PERSON_ASKS, { model: { value: 'sample-model-e' } })
    expect(first.status, first.error).toBe(201)
    const second = await ask('POST', '/api/casting/secretary', THE_PERSON_ASKS, { model: { value: 'sample-model-f' } })
    expect(second.status, second.error).toBe(201)
    const id = Number(second.body['casting'].id)
    expect((await ask('PATCH', `/api/casting/rows/${String(id)}`, THE_PERSON_ASKS, { effort: { value: 'low' } })).status).toBe(200)
    expect((await ask('POST', `/api/casting/rows/${String(id)}/mark`, THE_PERSON_ASKS)).status).toBe(200)
    const removed = await ask('DELETE', `/api/casting/rows/${String(first.body['casting'].id)}`, THE_PERSON_ASKS)
    expect(removed.status, removed.error).toBe(200)
    const history = (await ask('GET', `/api/casting/secretary/history?casting=${String(id)}`, THE_PERSON_ASKS)).body
    expect(history['changes'].every((one: { by: { kind: string; id: string } }) => one.by.kind === 'human' && one.by.id === THE_PERSON)).toBe(true)
  })
})

describe('the card the refusal names', () => {
  it('6: is the card that holds the act, read from the role cards the gate reads', async () => {
    const casting = Number((await ask('GET', '/api/casting/for/supervisor', THE_PERSON_ASKS)).body['casting'].id)
    const now = await ask('POST', '/api/casting/supervisor', as('moss-tally'), { model: { value: 'sample-model-refused' } })
    expect(now.status, now.error).toBe(403)
    expect(now.body).toMatchObject({ code: 'castingNotOwnerOrSecretary', values: { card: 'secretary' } })
    await withTheseCards(toTheInspectorAlone, async () => {
      const before = stored()
      for (const [door, answer] of Object.entries(await theFourWrites(as('moss-tally'), 'supervisor', casting))) {
        expect(answer.status, `${door}: ${answer.error}`).toBe(403)
        expect(answer.code, door).toBe('castingNotOwnerOrSecretary')
        expect(answer.error, door).toContain('Changing the Casting table is for the owner, or for an agent holding the inspector card.')
      }
      const one = await ask('POST', '/api/casting/supervisor', as(`${THE_TEST_OFFICES_SECRETARY.handle}-vale`), { model: { value: 'sample-model-refused' } })
      expect(one.status, one.error).toBe(403)
      expect(one.body).toMatchObject({ code: 'castingNotOwnerOrSecretary', values: { card: 'inspector' } })
      expect(stored(), 'a refused write wrote something').toBe(before)
    })
  })

  it('7: is no one card in the page sentence, and every card in the English, where more than one card holds it', async () => {
    await withTheseCards(toTheSupervisorsStep, async () => {
      const before = stored()
      const refused = await ask('POST', '/api/casting/worker', as('moss-tally'), { model: { value: 'sample-model-refused' } })
      expect(refused.status, refused.error).toBe(403)
      expect(refused.body['code'], 'one card name would leave the other card out').toBe('castingNotOwnerOrACardThatHoldsIt')
      expect(refused.body['values']).toEqual({})
      expect(refused.error).toContain('Changing the Casting table is for the owner, or for an agent holding the supervisor or the secretary card.')
      expect(stored(), 'a refused write wrote something').toBe(before)
      // THE SUPERVISOR CARD HOLDS IT NOW, so the cards really were read again.
      const allowed = await ask('POST', '/api/casting/worker', as('fern-ledger'), { model: { value: 'sample-model-by-the-supervisor' } })
      expect(allowed.status, allowed.error).toBe(201)
    })
  })
})

describe('a raise', () => {
  it('8: opens no Casting door, so no casting write names a raise', async () => {
    const pressed = await ask('POST', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}-vale`, THE_PERSON_ASKS, { reason: 'a test raises it', endsWhen: 'when you say' })
    expect(pressed.status, pressed.error).toBe(201)
    try {
      // BY ITS CARD, NOT BY THE RAISE: the row and the history name no authority.
      const added = await ask('POST', '/api/casting/inspector', as(`${THE_TEST_OFFICES_SECRETARY.handle}-vale`), { model: { value: 'sample-model-under-a-raise' } })
      expect(added.status, added.error).toBe(201)
      const id = Number(added.body['casting'].id)
      expect(added.body['casting'].lastChange.authority).toBeNull()
      const history = (await ask('GET', `/api/casting/inspector/history?casting=${String(id)}`, THE_PERSON_ASKS)).body
      expect(history['changes'].map((one: { what: string; authority: unknown }) => [one.what, one.authority])).toEqual([['add', null]])
      // AND WITH THE ACT OFF ITS CARD, THE RAISE DOES NOT LET IT IN.
      await withTheseCards(toTheInspectorAlone, async () => {
        const before = stored()
        for (const [door, answer] of Object.entries(await theFourWrites(as(`${THE_TEST_OFFICES_SECRETARY.handle}-vale`), 'inspector', id))) {
          expect(answer.status, `a raised secretary at ${door}: ${answer.error}`).toBe(403)
          expect(answer.code, door).toBe('castingNotOwnerOrSecretary')
        }
        expect(stored(), 'a raised secretary wrote something').toBe(before)
      })
    } finally {
      await ask('DELETE', `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}-vale`, THE_PERSON_ASKS)
    }
  })
})
