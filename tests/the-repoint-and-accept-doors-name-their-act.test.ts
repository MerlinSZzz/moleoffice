// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TWO DOORS WHOSE PERSON CHECK IS IN src/server/lib/ NAME THEIR OWN ACT WHEN IT REFUSES.
 *
 * PATCH /api/implementation/repositories/:id and POST /api/implementation/:id/accept are kept on this computer, and
 * each declares its act beside its route, in `keptHere.act`. Their handlers do not ask for the person themselves. They
 * call `updateRepository` in src/server/lib/repositories.ts and `acceptGuess` in src/server/lib/implementation.ts,
 * which ask `assertMayRepointARepository` and `assertMayAcceptAGuess` in src/server/lib/records/implementation-map-gates.ts. Each of those ends
 * with `assertThePersonIsProved`, whose refusal starts with the act it is given, and "This act" when it is given none.
 * The scan in tests/a-door-names-its-act-once.test.ts does not read a check in src/server/lib/, so this file asks
 * both doors for real and expects each refusal to start with the act its route declares, read from the route table.
 *
 * WHICH REQUEST REACHES THOSE CHECKS AS A PERSON WHO IS NOT PROVED. A request that names the person and carries no
 * key does not, through the app. `app.inject` is the office itself and is proved. Over a socket, `actorFrom` in
 * src/server/lib/http.ts proves it while the open key window covers this computer's own program, and otherwise
 * refuses it before any handler runs. A request that carries the office's key and names the person does reach them:
 * the office's key is a proof, and it is not the person's. So this file writes a made-up key file beside its
 * database and sends the office's key under the person's name.
 *
 * THE SECOND CASE IS THE CONTROL. The same two asks with the person's key are answered 200 and do what they say, so
 * the refusals in the first case come from the person check and not from a request the doors cannot read.
 *
 * MUTATIONS, 22 October 2026, each after a control run in which both cases passed. Each takes away one step that
 * carries the act from the route to the refusal. Each turns case 1 red naming its own door alone, answered 403 with
 * "This act is the person's own act", and leaves case 2 green. Restored, both cases are green.
 *   - In the PATCH handler in src/server/api/implementation.ts, `theAct: theActKeptHere(req)` taken out of the call to
 *     `updateRepository`: red, naming PATCH /api/implementation/repositories/:id.
 *   - In the accept handler there, `theActKeptHere(req)` taken out of the call to `acceptGuess`: red, naming
 *     POST /api/implementation/:id/accept.
 *   - In `updateRepository`, `opts.theAct` not passed to `assertMayRepointARepository`: red, naming the PATCH door.
 *   - In `acceptGuess`, `theAct` not passed to `assertMayAcceptAGuess`: red, naming the accept door.
 *   - In `assertMayAcceptAGuess`, `assertThePersonIsProved(actor)` called without `theAct`: red, naming the accept
 *     door.
 *   - In `assertMayRepointARepository`, the same: red, naming the PATCH door.
 */
import { randomBytes } from 'node:crypto'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { AGENT, apiApp, freshDb, type TestDb } from './helpers.ts'
import type { ApiRoute } from '../src/server/api/kinds.ts'

/** Made-up values. Nothing here is, or was ever, a key any office issued. */
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')

const NAMES_THE_PERSON = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
const PERSON = { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true } as const

let t: TestDb
let app: FastifyInstance
let routes: readonly ApiRoute[]
const madeDirs: string[] = []
let repository: string
let guess: string

function aDirectory(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'mole-office-two-doors-')))
  madeDirs.push(dir)
  return dir
}

function theActOf(method: string, path: string): string {
  const act = routes.find((one) => one.method.toUpperCase() === method && one.path === path)?.keptHere?.act
  if (act === undefined) throw new Error(`${method} ${path} declares no act, so this test cannot read one`)
  return act
}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  const built = await apiApp()
  app = built.app
  await app.ready()
  routes = built.listApiRoutes()

  // A REPOSITORY THAT HAS BEEN SCANNED, which is what makes re-pointing it the person's act.
  const repos = await import('../src/server/lib/repositories.ts')
  const root = aDirectory()
  repository = repos.registerRepository({ workspaceId: 'default', name: 'calibration', root, actor: PERSON }).id
  t.client.sqlite
    .prepare(
      'INSERT INTO source_index (workspace_id, repository_id, built_at, built_by, root, scan_ms, skipped) ' +
        `VALUES ('default', ?, '2026-10-22 10:00:00', 'human:${THE_TEST_OFFICES_OWNER.id}', ?, 12, '[]')`,
    )
    .run(repository, root)

  // AND A MACHINE'S GUESS AT WHICH CODE A RECORD OWNS, made by an agent and not yet accepted.
  const map = await import('../src/server/lib/implementation.ts')
  const module = t.api.createRecord({ workspaceId: 'default', kind: 'module', title: 'the mount', actor: PERSON }).id
  guess = map.declareRelationship({
    workspaceId: 'default',
    recordId: module,
    repositoryId: repository,
    pattern: 'src/mount.ts',
    proposing: true,
    actor: AGENT,
  }).row.id
})

afterAll(async () => {
  await app.close()
  t.close()
  for (const dir of madeDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** The two doors, each asked once with the key given. */
async function askBothDoors(key: string): Promise<{ route: string; act: string; status: number; error: string }[]> {
  const asked = [
    {
      method: 'PATCH' as const,
      path: '/api/implementation/repositories/:id',
      url: `/api/implementation/repositories/${repository}`,
      payload: { root: aDirectory() },
    },
    { method: 'POST' as const, path: '/api/implementation/:id/accept', url: `/api/implementation/${guess}/accept` },
  ]
  const answers: { route: string; act: string; status: number; error: string }[] = []
  for (const door of asked) {
    const reply = await app.inject({
      method: door.method,
      url: door.url,
      headers: { ...NAMES_THE_PERSON, 'x-mole-office-key': key },
      ...(door.payload === undefined ? {} : { payload: door.payload }),
    })
    const said = reply.json() as { error?: unknown }
    answers.push({
      route: `${door.method} ${door.path}`,
      act: theActOf(door.method, door.path),
      status: reply.statusCode,
      error: String(said.error ?? ''),
    })
  }
  return answers
}

describe('the re-point and accept doors name their act', () => {
  it("1: the office's key under the person's name is refused, and the refusal starts with the route's act", async () => {
    const wrong = (await askBothDoors(A_MADE_UP_OFFICE_KEY))
      .filter((answer) => answer.status !== 403 || !answer.error.startsWith(`${answer.act} is the person's own act`))
      .map((answer) => `${answer.route} answered ${String(answer.status)} with "${answer.error}" where the act is "${answer.act}"`)
    expect(wrong).toEqual([])
  })

  it("2: the person's own key is answered at both doors, so the refusals above are the person check's", async () => {
    const answers = await askBothDoors(A_MADE_UP_PERSON_KEY)
    expect(answers.map((answer) => `${answer.route} ${String(answer.status)}`)).toEqual([
      'PATCH /api/implementation/repositories/:id 200',
      'POST /api/implementation/:id/accept 200',
    ])
  })
})
