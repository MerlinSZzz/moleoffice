// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REFUSAL SAYS MOLE OFFICE'S OWN ROW HOLDS NO CARD, and does not call it a worker. Wave 13s round 210.
 *
 * Mole Office's own row sits in the agent registry and holds no card. Seven refusals read a row with no card as the
 * worker card, which is right for an agent's row, and their words then said the product "holds the worker card". The
 * permission each one decides stays exactly as it was: the same refusal, with the same status. Only the words for the
 * office's own row change, and each sentence keeps its own words. A row with no card that is an ordinary agent's is
 * still named as holding the worker card.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. The agents are made-up
 * agents with made-up handles, registered by the test's person. The office's key is the test office's own. Every
 * record here is synthetic. The register door writes the worker card on a row when no card is named, so the card is
 * then taken off plain-one's row in the scratch database: Mole Office's own row is not the only row with no card, and a
 * check that asks only whether a row has no card cannot pass for the check that asks whether it is the office's.
 *
 *   1. A notebook for "mole-office" (src/server/lib/records/notebook-entries.ts, checkTheNotebook).
 *   2. The person's raise of "mole-office" (src/server/api/roles.ts, POST /api/roles/elevation/:handle).
 *   3. The person's grant of a role request that names the office's row as the one that answers it, filed through the
 *      record door (src/server/api/roles.ts, answerARoleRequest).
 *   4. Duties naming the office's row as the secretary (src/server/lib/grant/secretary-duties.ts, theSecretaryRow).
 *   5. Duties naming the office's row as a supervisor (src/server/lib/grant/secretary-duties.ts, checkTheSupervisors).
 *   6. A claim made with the office's key (src/server/lib/claims.ts, fileAClaim, with words in src/shared/claims.ts).
 *   7. A retire made with the office's key (src/server/lib/participants.ts, whoMayRetireByTheCards).
 *   8. The same seven doors with an ordinary agent's row that holds no card, its role empty on the row: the words still
 *      name the worker card.
 *
 * MUTATIONS (each after a control run; the commit message has the runs and the logs):
 *   - lib/records.ts the notebook check never asks whether the row is the office's: case 1 red.
 *   - api/roles.ts the raise never asks whether the row is the office's: case 2 red.
 *   - api/roles.ts the grant never asks whether the answerer is the office's row: case 3 red.
 *   - lib/grant/secretary-duties.ts the secretary check never asks whether the row is the office's: case 4 red.
 *   - lib/grant/secretary-duties.ts the supervisors check never asks whether the row is the office's: case 5 red.
 *   - lib/claims.ts the claim check never asks whether the row is the office's: case 6 red.
 *   - lib/participants.ts the retire rule never asks whether the caller is the office's row: case 7 red.
 *   - all seven sites use the office's words for every row: case 8 red, at all seven doors.
 *   - lib/records.ts the notebook check asks whether the row has no card, not whether it is the office's: case 8 red,
 *     at the notebook.
 *   - all seven sites ask whether the row has no card, not whether it is the office's: case 8 red, at all seven doors.
 *   - the card is left on plain-one's row: case 8 red, at the row's role.
 *   - api/roles.ts the grant's sentence for the office's row answers 409 instead of 403: case 3 red at the status.
 *   - lib/participants.ts the retire sentence leaves out the shared words for the office's row: case 7 red.
 *   - api/roles.ts the raise lets the office's row through its card check: case 2 red, at a 409 from a later step.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { NOTEBOOK_KIND } from '../src/shared/notebook.ts'
import { THE_WORKER } from '../src/shared/roles.ts'
import { apiApp, freshDb, theOfficesKeyHeader, thePersonsKeyHeader, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
const keys = new Map<string, string>()
const ids = new Map<string, string>()
let run = ''

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const THE_OFFICE = () => ({ 'content-type': 'application/json', 'x-mole-office-workspace': 'default', ...theOfficesKeyHeader() })
const AN_AGENT = (handle: string) => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
})

async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: object) {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  const said = reply.json() as { error?: unknown; record?: { id?: unknown }; agent?: { id?: unknown }; whatToGiveIt?: { key?: unknown } }
  return { status: reply.statusCode, error: typeof said.error === 'string' ? said.error : '', said, raw: reply.body }
}

async function register(handle: string, role?: string): Promise<void> {
  const made = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, ...(role === undefined ? {} : { role }) })
  expect(made.status, made.raw).toBe(201)
  keys.set(handle, String(made.said.whatToGiveIt?.key ?? ''))
  ids.set(handle, String(made.said.agent?.id ?? ''))
}

/** The office's row, its handle and the words a refusal now uses for it, read from the code after the office is made. */
async function theOffice(): Promise<{ id: string; handle: string; holdsNoCard: string }> {
  const participants = await import('../src/shared/participants.ts')
  const words = participants as unknown as Record<string, unknown>
  return {
    id: participants.moleOfficeId(),
    handle: participants.MOLE_OFFICE_HANDLE,
    holdsNoCard: String(words['MOLE_OFFICES_OWN_ROW_HOLDS_NO_CARD']),
  }
}

/** Whether a refusal says this row holds the worker card, in any of the ways the seven refusals put it. */
function saysItHoldsTheWorkerCard(error: string, handle: string): boolean {
  return [
    `"${handle}" holds the ${THE_WORKER} card`,
    `${handle} holds the ${THE_WORKER} card`,
    `${handle}, which holds the ${THE_WORKER} card`,
    `The agent "${handle}" has no registered work area, and the "${THE_WORKER}" card it holds`,
  ].some((one) => error.includes(one))
}

/** The refusal a starter holding the worker card meets when it gives the supervisor card. */
async function theWorkersOwnRefusalFor(asking: string): Promise<string> {
  const { whyThisRoleMayNotBeGiven } = await import('../src/shared/roles.ts')
  const { theRoleCards } = await import('../src/server/lib/roles.ts')
  return String(whyThisRoleMayNotBeGiven(theRoleCards(), THE_WORKER, asking))
}

/** A role request filed through the record door, asked by w-two and answered by `answerer`. */
async function aRequestAnsweredBy(answerer: string): Promise<string> {
  const filed = await call('POST', '/api/records', PERSON, {
    kind: 'role_request',
    title: 'w-two asks for the supervisor card',
    data: { asking: 'supervisor', holding: THE_WORKER, asker: { kind: 'agent', id: ids.get('w-two') }, answersTo: { kind: 'agent', id: answerer } },
  })
  expect(filed.status, filed.raw).toBe(201)
  return String(filed.said.record?.id)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await register('sec-one', 'secretary')
  await register('w-two', THE_WORKER)
  await register('w-three', THE_WORKER)
  await register('plain-one')
  // AN ORDINARY ROW WITH NO CARD. The register door gave plain-one the worker card, so it is taken off here.
  t.client.sqlite.prepare('UPDATE agents SET role = NULL WHERE id = ?').run(ids.get('plain-one'))
  const session = await call('POST', '/api/records', PERSON, { kind: 'session', title: 'A made-up run for a claim', data: { state: 'running' } })
  expect(session.status, session.raw).toBe(201)
  run = String(session.said.record?.id)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe("a refusal says Mole Office's own row holds no card", () => {
  it('1. a notebook for the office is refused in words that say its row holds no card', async () => {
    const office = await theOffice()
    const filed = await call('POST', '/api/records', PERSON, { kind: NOTEBOOK_KIND, title: 'A notebook', data: { agentHandle: office.handle, entries: [] } })
    expect({ status: filed.status, saysWorker: saysItHoldsTheWorkerCard(filed.error, office.handle), saysNoCard: filed.error.includes(office.holdsNoCard) }, filed.raw)
      .toEqual({ status: 400, saysWorker: false, saysNoCard: true })
  })

  it("2. the person's raise of the office is refused in words that say its row holds no card", async () => {
    const office = await theOffice()
    const raised = await call('POST', `/api/roles/elevation/${office.handle}`, { ...PERSON, ...thePersonsKeyHeader() }, { reason: 'A made-up raise.', endsWhen: 'when you say' })
    expect({ status: raised.status, saysWorker: saysItHoldsTheWorkerCard(raised.error, office.handle), saysNoCard: raised.error.includes(office.holdsNoCard) }, raised.raw)
      .toEqual({ status: 403, saysWorker: false, saysNoCard: true })
  })

  it('3. a grant of a request the office answers is refused in words that name the office and say its row holds no card', async () => {
    const office = await theOffice()
    const request = await aRequestAnsweredBy(office.id)
    const granted = await call('POST', `/api/roles/requests/${request}/grant`, { ...PERSON, ...thePersonsKeyHeader() }, {})
    const workers = await theWorkersOwnRefusalFor('supervisor')
    expect({ status: granted.status, opensAsAWorker: granted.error.startsWith(workers), saysNoCard: granted.error.includes(`"${office.handle}" ${office.holdsNoCard}`) }, granted.raw)
      .toEqual({ status: 403, opensAsAWorker: false, saysNoCard: true })
  })

  it('4. duties naming the office as the secretary are refused in words that say its row holds no card', async () => {
    const office = await theOffice()
    const filed = await call('POST', '/api/records', PERSON, {
      kind: 'secretary_duties',
      title: 'Made-up duties',
      data: { secretary: { kind: 'agent', id: office.id }, area: 'A made-up area.', restsOn: ['a-made-up-decision'] },
    })
    expect({ status: filed.status, saysWorker: saysItHoldsTheWorkerCard(filed.error, office.handle), saysNoCard: filed.error.includes(office.holdsNoCard) }, filed.raw)
      .toEqual({ status: 400, saysWorker: false, saysNoCard: true })
  })

  it('5. duties naming the office as a supervisor are refused in words that say its row holds no card', async () => {
    const office = await theOffice()
    const filed = await call('POST', '/api/records', PERSON, {
      kind: 'secretary_duties',
      title: 'Made-up duties',
      data: {
        secretary: { kind: 'agent', id: ids.get('sec-one') },
        area: 'A made-up area.',
        restsOn: ['a-made-up-decision'],
        supervisors: [{ agent: { kind: 'agent', id: office.id }, area: 'A made-up area.' }],
      },
    })
    expect({ status: filed.status, saysWorker: saysItHoldsTheWorkerCard(filed.error, office.handle), saysNoCard: filed.error.includes(office.holdsNoCard) }, filed.raw)
      .toEqual({ status: 400, saysWorker: false, saysNoCard: true })
  })

  it("6. a claim made with the office's key is refused in words that say its row holds no card", async () => {
    const office = await theOffice()
    const claimed = await call('POST', '/api/claims', THE_OFFICE(), { run, things: [{ what: 'path', id: 'src/a-made-up-file.ts' }] })
    expect({ status: claimed.status, saysWorker: saysItHoldsTheWorkerCard(claimed.error, office.handle), saysNoCard: claimed.error.includes(office.holdsNoCard) }, claimed.raw)
      .toEqual({ status: 403, saysWorker: false, saysNoCard: true })
  })

  it("7. a retire made with the office's key is refused in words that say its row holds no card", async () => {
    const office = await theOffice()
    const retired = await call('POST', '/api/participants/agent/w-two/retire', THE_OFFICE(), { because: 'A made-up retire.' })
    expect({ status: retired.status, saysWorker: saysItHoldsTheWorkerCard(retired.error, office.handle), saysNoCard: retired.error.includes(office.holdsNoCard) }, retired.raw)
      .toEqual({ status: 403, saysWorker: false, saysNoCard: true })
  })

  it('8. the same seven doors still say an ordinary row with no card holds the worker card', async () => {
    const office = await theOffice()
    const plain = 'plain-one'
    const id = ids.get(plain)
    const read = (one: { status: number; error: string }) => ({
      status: one.status,
      saysWorker: saysItHoldsTheWorkerCard(one.error, plain),
      saysNoCard: one.error.includes(office.holdsNoCard),
    })
    const request = await aRequestAnsweredBy(String(id))
    const granted = await call('POST', `/api/roles/requests/${request}/grant`, { ...PERSON, ...thePersonsKeyHeader() }, {})
    const workers = await theWorkersOwnRefusalFor('supervisor')
    const said = {
      role: t.client.sqlite.prepare('SELECT role FROM agents WHERE id = ?').get(id),
      notebook: read(await call('POST', '/api/records', PERSON, { kind: NOTEBOOK_KIND, title: 'A notebook', data: { agentHandle: plain, entries: [] } })),
      raise: read(await call('POST', `/api/roles/elevation/${plain}`, { ...PERSON, ...thePersonsKeyHeader() }, { reason: 'A made-up raise.', endsWhen: 'when you say' })),
      grant: { status: granted.status, opensAsAWorker: granted.error.startsWith(workers), saysNoCard: granted.error.includes(office.holdsNoCard) },
      secretary: read(await call('POST', '/api/records', PERSON, {
        kind: 'secretary_duties',
        title: 'Made-up duties',
        data: { secretary: { kind: 'agent', id }, area: 'A made-up area.', restsOn: ['a-made-up-decision'] },
      })),
      supervisor: read(await call('POST', '/api/records', PERSON, {
        kind: 'secretary_duties',
        title: 'Made-up duties',
        data: { secretary: { kind: 'agent', id: ids.get('sec-one') }, area: 'A made-up area.', restsOn: ['a-made-up-decision'], supervisors: [{ agent: { kind: 'agent', id }, area: 'A made-up area.' }] },
      })),
      claim: read(await call('POST', '/api/claims', AN_AGENT(plain), { run, things: [{ what: 'path', id: 'src/a-made-up-file.ts' }] })),
      retire: read(await call('POST', '/api/participants/agent/w-three/retire', AN_AGENT(plain), { because: 'A made-up retire.' })),
    }
    const refusedAsAWorker = (status: number) => ({ status, saysWorker: true, saysNoCard: false })
    expect(said).toEqual({
      role: { role: null },
      notebook: refusedAsAWorker(400),
      raise: refusedAsAWorker(403),
      grant: { status: 403, opensAsAWorker: true, saysNoCard: false },
      secretary: refusedAsAWorker(400),
      supervisor: refusedAsAWorker(400),
      claim: refusedAsAWorker(403),
      retire: refusedAsAWorker(403),
    })
  })
})
