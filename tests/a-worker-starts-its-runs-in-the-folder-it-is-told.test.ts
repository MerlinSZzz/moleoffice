// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MESSAGE WORKER STARTS ITS RUNS IN THE FOLDER MOLE_OFFICE_WORKER_CHECKOUT NAMES, AND IN THE INSTALL'S OWN
 * WHEN NOBODY NAMES ONE.
 *
 * Round 15, finding 8 and held item 1, which the secretary approved. A worker started as its own process, as an
 * office starts it, took the install's root as the folder its runs work in, read from where
 * src/config/settings.mjs is. A test that started an office could not give that worker another folder, so
 * the worker wrote each run's rules file as AGENTS.md at the worktree's root. Cases 1 to 4 read the folder
 * through `workerSettingsFrom` in src/worker/index.ts, the one place a worker reads it from.
 *
 *   1. Nobody names one: the install's root, without its last slash, as before.
 *   2. A folder named whole is that folder. A relative one is resolved against the install's root, not
 *      against the working directory.
 *   3. A folder only a `.env` names is read as set.
 *   4. The worker's settings take the folder from the environment they are given. The fake runtime's
 *      relative path is still resolved against the install's root, not against the runs' folder.
 *
 * THE SERVER READS THE SAME FOLDER. GET /api/office/interrupted-runs says a paused run can be resumed only
 * when it worked in the folder the worker's runs work in (src/server/lib/interrupted.ts), so the server
 * and the worker must work it out the same way (invariant 9; Withaiw7X4tQ). Cases 5 and 6 ask that
 * door of an office of their own, in process, with every record made up here:
 *
 *   5. Nobody names one: a run in the install's root can be resumed, as before, and a run in another
 *      folder cannot.
 *   6. MOLE_OFFICE_WORKER_CHECKOUT names a folder: a run in that folder can be resumed, and a run in the
 *      install's root cannot.
 *
 * A CHANGE TO THE FOLDER NEEDS THE OFFICE RESTARTED. The worker reads the folder once, when it starts
 * (`watchTheQueue` in src/worker/index.ts). Each pass reads its runs, hops and environment again, but not the
 * folder. The Office controls page says "Used on the next read. No restart is needed." of every setting the
 * server does not mark restartRequired, and it said that of this one (8IKVfQAGmm1y). Case 7 asks the
 * server's settings door of an office of its own, in process:
 *
 *   7. GET /api/office/settings says restartRequired true for MOLE_OFFICE_WORKER_CHECKOUT.
 */

import type { FastifyInstance } from 'fastify'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { REPO_ROOT, mergedEnvironment } from '../src/config/settings.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { workerSettingsFrom } from '../src/worker/index.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const THE_INSTALL = REPO_ROOT.replace(/\/$/, '')

describe('the folder a message worker starts its runs in', () => {
  it('is the install\'s root, without its last slash, when nobody names one', () => {
    expect(THE_INSTALL).not.toBe(REPO_ROOT)
    expect(workerSettingsFrom([], {}).checkout).toBe(THE_INSTALL)
  })

  it('is the folder MOLE_OFFICE_WORKER_CHECKOUT names, and a relative one is read from the install\'s root', () => {
    const folder = join(tmpdir(), 'a-made-up-folder-for-runs')
    expect(workerSettingsFrom([], { MOLE_OFFICE_WORKER_CHECKOUT: folder }).checkout).toBe(folder)
    expect(workerSettingsFrom([], { MOLE_OFFICE_WORKER_CHECKOUT: 'a-made-up-folder-for-runs' }).checkout).toBe(resolve(REPO_ROOT, 'a-made-up-folder-for-runs'))
  })

  it('is read as set when only a .env names it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mole-office-worker-folder-env-'))
    try {
      const file = join(dir, '.env')
      writeFileSync(file, `MOLE_OFFICE_WORKER_CHECKOUT=${join(dir, 'runs')}\n`)
      expect(workerSettingsFrom([], mergedEnvironment({}, file)).checkout).toBe(join(dir, 'runs'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reaches the worker\'s settings from the environment they are given, and the fake runtime is still found from the install\'s root', () => {
    const folder = join(tmpdir(), 'a-made-up-folder-for-runs')
    const was = process.env['MOLE_OFFICE_FAKE_RUNTIME']
    process.env['MOLE_OFFICE_FAKE_RUNTIME'] = 'tests/fake-runtime.mjs'
    try {
      const told = workerSettingsFrom([], { MOLE_OFFICE_WORKER_CHECKOUT: folder })
      expect(told.checkout).toBe(folder)
      expect(told.env['MOLE_OFFICE_FAKE_RUNTIME']).toBe(join(THE_INSTALL, 'tests', 'fake-runtime.mjs'))
    } finally {
      if (was === undefined) delete process.env['MOLE_OFFICE_FAKE_RUNTIME']
      else process.env['MOLE_OFFICE_FAKE_RUNTIME'] = was
    }
  })
})

describe('the folder the server says an interrupted run can be resumed in', () => {
  const HERE = 'default'
  const OWNER = { 'x-mole-office-workspace': HERE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
  const ELSEWHERE = join(tmpdir(), 'a-made-up-folder-for-runs')
  let t: TestDb
  let app: FastifyInstance
  let agent = ''

  beforeAll(async () => {
    t = await freshDb()
    app = (await apiApp()).app
    await app.ready()
    const made = await app.inject({ method: 'POST', url: '/api/records', headers: { ...OWNER, 'content-type': 'application/json' }, payload: { kind: 'agent', title: 'made-up-reader', data: { handle: 'made-up-reader', state: 'active', runtime: 'opencode' } } })
    expect(made.statusCode, made.body).toBe(201)
    const listed = (await app.inject({ method: 'GET', url: '/api/participants', headers: OWNER })).json() as { agents?: { id: string; handle: string }[] }
    agent = (listed.agents ?? []).find((one) => one.handle === 'made-up-reader')!.id
  })

  afterAll(async () => {
    await app?.close()
    t?.close()
  })

  /** A message of its own to the made-up agent, and a paused run for it that worked in `folder`, filed as the worker files one. */
  function aPausedRunIn(folder: string): string {
    const message = t.api.createRecord({
      kind: 'message',
      title: 'A made-up message for a paused run',
      workspaceId: HERE,
      data: { body: 'Made up for this test.', to: [{ kind: 'agent', id: agent }] },
      actor: { type: 'human', id: THE_PERSON } as never,
    }).id
    return t.api.createRecord({
      kind: 'session',
      title: 'A made-up paused run',
      workspaceId: HERE,
      data: {
        state: 'paused',
        runtime: 'opencode',
        startedByMoleOffice: true,
        servingAgent: 'made-up-reader',
        servingAgentId: agent,
        deliveringMessage: message,
        providerSession: 'a-made-up-conversation',
        workingDirectory: folder,
        paused: { at: '2026-10-19 05:00:00', by: { kind: 'person', id: THE_PERSON }, because: 'Made up: the office was shut down.' },
      },
      actor: { type: 'agent', id: 'mole-office/the-message-worker' } as never,
    }).id
  }

  /** What GET /api/office/interrupted-runs says of resuming `run`. */
  async function whatItSaysOf(run: string): Promise<unknown> {
    const reply = await app.inject({ method: 'GET', url: '/api/office/interrupted-runs', headers: OWNER })
    expect(reply.statusCode, reply.body).toBe(200)
    const runs = (reply.json() as { runs: { session: string; resume: unknown }[] }).runs
    expect(runs.map((one) => one.session), 'the run is listed').toContain(run)
    return runs.find((one) => one.session === run)?.resume
  }

  it('resumes a run in the install\'s root, as before, and not a run in another folder, when nobody names one', async () => {
    expect(process.env['MOLE_OFFICE_WORKER_CHECKOUT'], 'this case is about the setting unset').toBeUndefined()
    const here = aPausedRunIn(THE_INSTALL)
    const elsewhere = aPausedRunIn(ELSEWHERE)
    expect(await whatItSaysOf(here)).toEqual({ can: true })
    expect(await whatItSaysOf(elsewhere)).toEqual({ can: false, because: 'another-folder' })
  })

  it('resumes a run in the folder MOLE_OFFICE_WORKER_CHECKOUT names, and not a run in the install\'s root', async () => {
    const there = aPausedRunIn(ELSEWHERE)
    const root = aPausedRunIn(THE_INSTALL)
    process.env['MOLE_OFFICE_WORKER_CHECKOUT'] = ELSEWHERE
    try {
      expect(await whatItSaysOf(there)).toEqual({ can: true })
      expect(await whatItSaysOf(root)).toEqual({ can: false, because: 'another-folder' })
    } finally {
      delete process.env['MOLE_OFFICE_WORKER_CHECKOUT']
    }
  })
})

describe('what the server says a change to the folder needs', () => {
  const OWNER = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
  let t: TestDb
  let app: FastifyInstance

  beforeAll(async () => {
    t = await freshDb()
    app = (await apiApp()).app
    await app.ready()
  })

  afterAll(async () => {
    await app?.close()
    t?.close()
  })

  it('says the office must be restarted, because the worker reads the folder only when it starts', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/office/settings', headers: OWNER })
    expect(reply.statusCode, reply.body).toBe(200)
    const row = (reply.json() as { settings: { name: string; restartRequired: boolean }[] }).settings.find((one) => one.name === 'MOLE_OFFICE_WORKER_CHECKOUT')
    expect(row, 'the setting is declared').toBeDefined()
    expect(row?.restartRequired, 'the Office controls page reads this to say whether a restart is needed').toBe(true)
  })
})
