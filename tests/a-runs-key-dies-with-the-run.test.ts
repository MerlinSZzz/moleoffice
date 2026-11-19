// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * A RUN'S KEY DIES WHEN THE RUN DOES. M81 and P83 point 5.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS DRIVEN, AND WHY THE SECOND CASE IS THE ONE THAT MATTERS
 * ---------------------------------------------------------------------------------------
 *
 * The office mints each run its own key when the run starts and revokes it when the run ends. The
 * first case below is a run that finishes normally: the worker reads its answer, patches its session
 * record `finished`, and the key is taken back on the way out.
 *
 * THE CASE THAT MATTERS IS A RUN THAT DIES WITHOUT CLEANING UP. This is the one wave 1 got wrong
 * twice: a key left alive after the thing that held it was over. So the second case makes a run die
 * the way a crash makes it die — the process is gone, nothing patched the record — and lets the
 * REAPER do its work. The reaper is the session sweep, `syncSessions` in
 * src/server/lib/sessions.ts: it discovers sessions on disk, observes each one's state, and patches
 * the observation onto the record. A run whose process has gone and whose transcript has no
 * end-of-session marker is observed `orphaned`, and that patch reaches the same one place a
 * `finished` patch does, where the run's key is revoked. Then the key is driven, and it is dead.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE REAPER CASE IS DRIVEN THROUGH A RECORD WITH A DISCOVERY STAMP
 * ---------------------------------------------------------------------------------------
 *
 * `sweepSessions` ties a record to a transcript by the discovery stamp Mole Office's own session
 * hook writes onto it — `${tool}:${externalId}`. A real run gets that stamp from the hook. Here the
 * run is filed directly, as the office's own worker files it, and the stamp is written with it so
 * the sweep has a record to observe. What is real is the office minting the key, the sweep observing
 * `orphaned` against a real transcript and a real (empty) process list, and the revocation that
 * follows. What is described rather than sampled is the machine, exactly as tests/sessions.test.ts
 * describes it.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF (after a green control)
 * ---------------------------------------------------------------------------------------
 *
 * Remove the `if (nextKind === 'session') { … revokeTheRunKeyRecordedOn … }` block from
 * `patchRecord` in src/server/lib/records.ts. A finished run keeps its key, so the note written
 * after it is filed (by the agent) and the decision is not refused — both cases go red. Restoring
 * the block turns them green.
 */

import type { AddressInfo } from 'node:net'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import type { AdapterEnv } from '../src/server/lib/adapters/types.ts'
import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { supplyRuntimeSubmissions } from './synthetic-submission-fixtures.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

/** A made-up office key, written before the server is built so the test's own writes are the office. */
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')

/** The script saves its environment key in this test's private file, then answers. */
const RECORDING_RUNTIME = `
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
writeFileSync(join(process.env.PROMPT_DIR, String(process.pid) + '.txt'), process.env.MOLE_AGENT_KEY ?? '', { mode: 0o600 })
process.stdout.write(JSON.stringify({ reply: 'I read the prompt and answered.', conversation: 'recording-run-' + String(process.pid) }) + '\\n')
`

/** The moment every "how long ago" in the reaper case is measured against. */
const NOW = new Date('2026-09-13T12:00:00Z')

let t: TestDb
let app: FastifyInstance
let api: string
let scratch: string
let settings: WorkerSettings
const watching: Parameters<typeof onePass>[1] = []

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The office's own worker: an agent actor that proved itself with the office's key. */
const AS_THE_OFFICE_WORKER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'mole-office/the-message-worker',
  'x-mole-office-key': A_MADE_UP_OFFICE_KEY,
}

/** The key and nothing else, so the actor id can only have come from the key. */
const THE_KEY_ALONE = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default' }

async function post(path: string, body: unknown, headers: Record<string, string> = AS_THE_PERSON): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url: path, headers, payload: body as never })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown> }
}

async function register(handle: string, name: string): Promise<string> {
  const registered = await post('/api/agents/started', { handle, name, role: 'worker', runtime: 'claude-code' })
  const key = String((registered.body['whatToGiveIt'] as { key?: string } | undefined)?.key)
  expect(key, `the registration of ${handle} answered no key`).toMatch(/^[0-9a-f]{64}$/)
  return key
}

async function agentIdFor(handle: string): Promise<string> {
  const reply = await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_PERSON })
  const listed = reply.json() as { agents?: { id: string; handle: string }[] }
  return one((listed.agents ?? []).filter((a) => a.handle === handle), `the registry row for ${handle}`).id
}

async function writeWithTheKey(key: string, payload: Record<string, unknown>): Promise<{ status: number; error: string; recordId: string }> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: { ...THE_KEY_ALONE, 'x-mole-office-key': key },
    payload,
  })
  const body = reply.json() as { record?: { id?: string }; error?: string }
  return { status: reply.statusCode, error: body.error ?? '', recordId: body.record?.id ?? '' }
}

function actorOnTheChange(recordId: string): { type: string; id: string } | undefined {
  return t.client.sqlite
    .prepare('SELECT actor_type AS type, actor_id AS id FROM changes WHERE record_id = ? ORDER BY at DESC LIMIT 1')
    .get(recordId) as { type: string; id: string } | undefined
}

/** The registry id of the agent bearing `handle`. Since criterion I1 a new agent's id is not its handle. */
function idOf(handle: string): string {
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
}

/** The key the recording run was handed, once the file it wrote is there. */
async function theRunKey(promptDir: string): Promise<string> {
  const deadline = Date.now() + 20_000
  for (;;) {
    let names: string[] = []
    try {
      names = readdirSync(promptDir)
    } catch {
      names = []
    }
    for (const name of names) {
      const key = /^[0-9a-f]{64}$/.exec(readFileSync(join(promptDir, name), 'utf8'))?.[0]
      if (key !== undefined) return key
    }
    if (Date.now() >= deadline) throw new Error('the recording run never saved its key')
    await new Promise((go) => setTimeout(go, 100))
  }
}

beforeAll(async () => {
  t = await freshDb()
  // THE KEY FILE IS WRITTEN BEFORE THE SERVER IS BUILT, so the office key this test sends is the one
  // the server reads and the test's own session write is proved as the office's.
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  // A FAKE RUNTIME RUN SUBMITS A FIXTURE COMPLETION, so finishing it does not need a Git work area.
  supplyRuntimeSubmissions(t, app)
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-run-dies-'))
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(scratch, { recursive: true, force: true })
})

describe('a run that finishes normally loses its key on the way out', () => {
  it('is driven with its key while it lives, and refused once its record says finished', async () => {
    const promptDir = join(scratch, 'prompts-finished')
    mkdirSync(promptDir, { recursive: true })
    const recording = join(scratch, 'recording-runtime.mjs')
    writeFileSync(recording, RECORDING_RUNTIME, 'utf8')
    settings = {
      api,
      workspace: 'default',
      session: null,
      stopWithPid: null,
      checkout: aCheckoutForATestRun(),
      runs: 1,
      hops: 3,
      outputRoot: join(scratch, 'runs'),
      env: { ...withoutInheritedEffort(), MOLE_OFFICE_DB: t.file, MOLE_OFFICE_FAKE_RUNTIME: recording, PROMPT_DIR: promptDir },
    }

    const handle = 'run-finished'
    await register(handle, 'Run Finished')
    const agentId = await agentIdFor(handle)
    const filed = await post('/api/records', {
      kind: 'message',
      title: 'answer and end',
      data: { body: 'Answer this and end.', to: [{ kind: 'agent', id: agentId }] },
    })
    const messageId = String((filed.body['record'] as { id: string }).id)
    await post(`/api/messages/${messageId}/start-an-agent`, {})

    const report = await onePass(settings, watching)
    const started = one(report.started, 'the run that was started')
    const key = await theRunKey(promptDir)
    expect(key).toMatch(/^[0-9a-f]{64}$/)

    // CONTROL: while the run is alive its key is that agent's.
    const before = await writeWithTheKey(key, {
      kind: 'note',
      title: 'While the run is alive',
      data: { body: 'The run key names me.' },
    })
    expect(before.status, before.error).toBe(201)
    expect(actorOnTheChange(before.recordId)).toEqual({ type: 'agent', id: idOf(handle) })

    // LET THE RUN BE READ AND ITS RECORD PATCHED. A fresh list so the run is read as ended.
    let state = 'running'
    for (let i = 0; i < 100 && state !== 'finished'; i += 1) {
      await onePass(settings, watching)
      const read = await app.inject({ method: 'GET', url: `/api/records/${started.session}`, headers: AS_THE_PERSON })
      state = String(((read.json() as { record?: { data?: Record<string, unknown> } }).record?.data ?? {})['state'] ?? '')
      if (state !== 'finished') await new Promise((go) => setTimeout(go, 50))
    }
    expect(state, 'the run was never marked finished').toBe('finished')

    // THE KEY IS DEAD: the same note is refused, and so is the person's own act. In the fifteen minutes after a finish a
    // run's key still reports that run's own end and is refused everything else (message 0upwNAzS4yqT,
    // tests/a-finished-runs-key-reports-its-end-for-fifteen-minutes.test.ts), so the note is refused rather than filed
    // as nobody.
    const after = await writeWithTheKey(key, {
      kind: 'note',
      title: 'After the run ended',
      data: { body: 'The run key names nobody now.' },
    })
    expect(after.status, `the finished run’s key filed a note: ${after.recordId}`).toBe(403)
    const refused = await writeWithTheKey(key, {
      kind: 'decision',
      title: 'The dead run key cannot decide',
      data: { because: 'it is the person’s' },
    })
    expect(refused.status, `the dead run key wrote a decision: ${refused.recordId}`).toBe(403)

    // AND THE ROW SAYS WHAT TOOK IT BACK, naming the run.
    const row = t.client.sqlite
      .prepare('SELECT revoked_because FROM held_keys WHERE whose_id = ? AND revoked_at IS NOT NULL ORDER BY made_at DESC LIMIT 1')
      .get(idOf(handle)) as { revoked_because: string | null } | undefined
    expect(row?.revoked_because, 'no reason was written for the revocation').not.toBeNull()
    expect(String(row?.revoked_because), 'the reason does not name the run').toContain(started.session)
  }, 60_000)
})

describe('a run that dies without revoking leaves no live key behind', () => {
  it('is observed orphaned by the session reaper, and its key is refused', async () => {
    const handle = 'run-orphaned'
    await register(handle, 'Run Orphaned')
    const agentId = await agentIdFor(handle)

    // A REAL CLAUDE CODE TRANSCRIPT on a machine this test describes: one prompt, no end-of-session
    // marker, twenty hours old, and no process anywhere.
    const home = join(scratch, 'home-orphan')
    // Claude Code names a transcript's folder after the working folder below, with each / written as -.
    const projectDir = join(home, '.claude', 'projects', `${THE_TEST_FIXTURE_ROOT.replaceAll('/', '-')}-test-claude`)
    mkdirSync(projectDir, { recursive: true })
    const externalId = 'cccccccc-0000-0000-0000-0000000000aa'
    const logPath = join(projectDir, `${externalId}.jsonl`)
    writeFileSync(
      logPath,
      `${JSON.stringify({
        parentUuid: null,
        isSidechain: false,
        type: 'user',
        message: { role: 'user', content: 'collate the force tables' },
        timestamp: new Date(NOW.getTime() - 20 * 60 * 60 * 1000).toISOString(),
        userType: 'external',
        entrypoint: 'cli',
        cwd: `${THE_TEST_FIXTURE_ROOT}/test_claude`,
        version: '2.1.223',
      })}\n`,
    )

    // THE RUN IS FILED THE WAY THE OFFICE'S OWN WORKER FILES ONE, and the office mints its key. The
    // discovery stamp is the tie to the transcript above, which in a real run the session hook
    // writes.
    const filed = await post(
      '/api/records',
      {
        kind: 'session',
        title: `${handle} answering a message`,
        data: {
          state: 'running',
          runtime: 'claude-code',
          startedByMoleOffice: true,
          servingAgent: agentId,
          doing: 'reading a message and answering it',
          extra: {
            discovered: {
              tool: 'claude-code',
              externalId,
              logPath,
              observedState: 'running',
              at: '2026-09-13 11:00:00',
            },
          },
        },
      },
      AS_THE_OFFICE_WORKER,
    )
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)
    const session = String((filed.body['record'] as { id: string }).id)
    const key = String((filed.body['runKey'] as { key?: string } | undefined)?.key)
    expect(key, 'the office minted the run no key, so this test would prove nothing').toMatch(/^[0-9a-f]{64}$/)

    // CONTROL: the fresh run key is that agent's.
    const before = await writeWithTheKey(key, {
      kind: 'note',
      title: 'While the orphan-to-be is running',
      data: { body: 'The run key names me.' },
    })
    expect(before.status, before.error).toBe(201)
    expect(actorOnTheChange(before.recordId)).toEqual({ type: 'agent', id: idOf(handle) })

    // THE REAPER. It observes the transcript as `orphaned` and patches that onto the record.
    const { syncSessions } = await import('../src/server/lib/sessions.ts')
    const env: AdapterEnv = {
      homeDir: home,
      now: new Date(NOW),
      scanProcesses: () => ({ ok: true, processes: [] }),
      runningWithinSeconds: 5 * 60,
      orphanAfterSeconds: 6 * 60 * 60,
    }
    const report = syncSessions({ type: 'agent', id: 'the-reaper' }, 'default', env, join(scratch, 'no-hook-notes'))
    expect(report.updated + report.created, 'the sweep never wrote the orphaned run').toBeGreaterThan(0)

    const read = await app.inject({ method: 'GET', url: `/api/records/${session}`, headers: AS_THE_PERSON })
    const data = ((read.json() as { record?: { data?: Record<string, unknown> } }).record?.data ?? {}) as Record<string, unknown>
    expect(data['state'], 'the reaper did not observe the run as orphaned').toBe('orphaned')

    // DEAD: an act with the key no longer names the agent, and the person's own act is refused.
    const after = await writeWithTheKey(key, {
      kind: 'note',
      title: 'After the reaper found it',
      data: { body: 'The run key names nobody now.' },
    })
    expect(after.status, after.error).toBe(201)
    expect(actorOnTheChange(after.recordId), 'the orphaned run’s key still named that agent').not.toEqual({ type: 'agent', id: idOf(handle) })
    const refused = await writeWithTheKey(key, {
      kind: 'decision',
      title: 'The dead orphan key cannot decide',
      data: { because: 'it is the person’s' },
    })
    expect(refused.status, `the dead run key wrote a decision: ${refused.recordId}`).toBe(403)
  }, 60_000)
})
