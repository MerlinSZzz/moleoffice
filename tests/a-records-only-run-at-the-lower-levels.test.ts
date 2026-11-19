// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN THAT CHANGED ONLY RECORDS IS NEITHER SEALED NOR CHECKED AT `none` AND `light`.
 *
 * Criterion C35 of design/rules/ACCEPTANCE.md, on a decision. At `full` such a run
 * is sealed as C34 says and checked; at `none` and `light` it finishes on the secretary's word.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS TESTED AT THE FINISH DOOR, FOR EACH OF THE THREE LEVELS
 * ---------------------------------------------------------------------------------------
 *
 * The finish door is `PATCH /api/records/<run>` with `state: finished`. Two things happen there and
 * they are separate doors with separate answers, which is why each level is checked for both:
 *
 *   THE SEAL, in `runSubmitsWork` and `sealFinishedRun` (src/server/lib/sealed-tip.ts), called from
 *   the patch path in src/server/lib/records.ts.
 *   THE CHECK, in `theOfficeStartsTheCheck` (src/server/lib/inspection.ts), called from the PATCH
 *   route in src/server/api/records.ts.
 *
 * ---------------------------------------------------------------------------------------
 * WHY CODE WORK IS STILL SEALED AT EVERY LEVEL, WHICH IS THE OTHER HALF OF C35
 * ---------------------------------------------------------------------------------------
 *
 * The rule is that the seal stays and blocks nobody, and C35 exempts only a run that
 * changed ONLY RECORDS. The difference is not a preference. A seal of a records-only run is a
 * manifest of revisions the database already holds, made for a check that is not going to happen. A
 * seal of code work names a commit and the hash of every changed file, and NOTHING ELSE IN THE
 * DATABASE HOLDS THAT: it is the only record of what was on disk when the run finished. Dropping it
 * would lose evidence rather than save work. The last case here holds that line.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED WHEN THE CODE IS REMOVED. Control run first, then the mutation, then restored.
 * ---------------------------------------------------------------------------------------
 *
 *   - Delete the `if (recordsOnly && theReviewLevel(run.workspaceId) !== 'full') return false` line
 *     from `runSubmitsWork` in src/server/lib/sealed-tip.ts, and the two cases that say a
 *     records-only run is not sealed at `none` and at `light` go red.
 *   - Change that same line's `!== 'full'` to `=== 'full'`, and the case that says a records-only
 *     run IS sealed at `full` goes red — which is the half proving the level is read rather than
 *     the seal simply switched off.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { ReviewLevel } from '../src/shared/workspaces.ts'

const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

let t: TestDb
let app: FastifyInstance
let seals: typeof import('../src/server/lib/sealed-tip.ts')
const directories: string[] = []
const actor = { type: 'agent' as const, id: 'c35-worker' }

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

/** A synthetic repository with one committed change, so a code finish has something to seal. */
function tree(): string {
  mkdirSync('.logs', { recursive: true })
  const dir = mkdtempSync(join(process.cwd(), '.logs', 'c35-fixture-'))
  directories.push(dir)
  git(dir, 'init', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic C35 fixture')
  // THE FILE LIVES IN A FOLDER, because criterion P92's worker grain is folders and the work area
  // registered below is that folder. A bare `a.txt` at the root would have no folder to register.
  mkdirSync(join(dir, 'work'), { recursive: true })
  writeFileSync(join(dir, 'work', 'a.txt'), 'before\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-m', 'Synthetic baseline')
  git(dir, 'switch', '-c', 'work')
  writeFileSync(join(dir, 'work', 'a.txt'), 'submitted\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-m', 'Synthetic submission')
  return dir
}

async function setTheLevel(level: ReviewLevel): Promise<void> {
  const reply = await app.inject({
    method: 'PATCH',
    url: `/api/workspaces/${WORKSPACE}`,
    headers: AS_THE_PERSON,
    payload: { reviewLevel: level },
  })
  expect(reply.statusCode, reply.body).toBe(200)
}

function aRecordsOnlyRun(): { run: string; record: string } {
  const record = t.api.createRecord({
    kind: 'note',
    title: `Synthetic record work ${String(Math.random())}`,
    workspaceId: WORKSPACE,
    actor,
    origin: 'fixture',
    data: {},
  })
  const run = t.api.createRecord({
    kind: 'session',
    title: 'Synthetic records-only run',
    workspaceId: WORKSPACE,
    actor,
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'c35-worker', submission: { kind: 'records', records: [record.id] } },
  }).id
  t.api.patchRecord(record.id, { summary: 'What this run wrote' }, { ...actor, sessionId: run })
  return { run, record: record.id }
}

function aCodeRun(): string {
  return t.api.createRecord({
    kind: 'session',
    title: 'Synthetic code run',
    workspaceId: WORKSPACE,
    actor,
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'c35-worker', workingDirectory: tree(), cutFrom: 'main' },
  }).id
}

interface TheCheck { askedOf?: string; reviewLevel?: string; says: string }

async function finish(run: string): Promise<{ theCheck?: TheCheck }> {
  const reply = await app.inject({
    method: 'PATCH',
    url: `/api/records/${run}`,
    headers: asAgent('c35-worker'),
    payload: { dataPatch: { state: 'finished' } },
  })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as { theCheck?: TheCheck }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  seals = await import('../src/server/lib/sealed-tip.ts')
  const starter = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle: 'c35-secretary', name: 'Synthetic secretary', role: 'secretary' },
  })
  expect(starter.statusCode, starter.body).toBe(201)
  const inspector = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle: 'c35-inspector', name: 'Synthetic inspector', role: 'inspector' },
  })
  expect(inspector.statusCode, inspector.body).toBe(201)
  const worker = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: asAgent('c35-secretary'),
    payload: { handle: 'c35-worker', name: 'Synthetic C35 worker', workArea: ['work'] },
  })
  expect(worker.statusCode, worker.body).toBe(201)
})

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const dir of directories) rmSync(dir, { recursive: true, force: true })
})

describe('C35 at the finish door, for each of the three levels', () => {
  it('at none: a records-only run is neither sealed nor checked', async () => {
    await setTheLevel('none')
    const { run } = aRecordsOnlyRun()
    const patched = await finish(run)

    expect(seals.readRunSeal(run), 'nothing sealed it').toBeNull()
    expect(t.api.getRecord(run)!.data['sealedTip'], 'and the run names no seal').toBeUndefined()
    expect(patched.theCheck?.askedOf, 'the secretary was told; no inspector was started').toBe('c35-secretary')
    expect(patched.theCheck?.reviewLevel).toBe('none')
    expect(patched.theCheck?.says).toContain('started no check')
  })

  it('at light: a records-only run is neither sealed nor checked', async () => {
    await setTheLevel('light')
    const { run } = aRecordsOnlyRun()
    const patched = await finish(run)

    expect(seals.readRunSeal(run)).toBeNull()
    expect(t.api.getRecord(run)!.data['sealedTip']).toBeUndefined()
    expect(patched.theCheck?.askedOf).toBe('c35-secretary')
    expect(patched.theCheck?.reviewLevel).toBe('light')
  })

  it('at full: the same run is sealed as C34 says, and an inspector is asked', async () => {
    await setTheLevel('full')
    const { run, record } = aRecordsOnlyRun()
    const patched = await finish(run)

    const held = seals.readRunSeal(run)
    expect(held, 'a records-only run is sealed at full').not.toBeNull()
    expect(held!.seal.kind).toBe('records')
    expect(held!.seal.git).toBeNull()
    expect(held!.seal.records!.records.map((one) => one.id)).toEqual([record])
    // AND IT IS SEALED AS C34 SAYS: pointers and hashes, never a copied row.
    expect(Object.keys(held!.seal.records!.records[0]!.after).sort()).toEqual(['hash', 'id', 'record', 'seq'])

    expect(patched.theCheck?.askedOf, 'the inspector, not the secretary').toBe('c35-inspector')
    expect(patched.theCheck).not.toHaveProperty('reviewLevel')
  })
})

describe('code work is sealed at every level, because nothing else records what was on disk', () => {
  it('seals a git run at none and at light, and the seal blocks nobody', async () => {
    for (const level of ['none', 'light'] as const) {
      await setTheLevel(level)
      const run = aCodeRun()
      const patched = await finish(run)

      const held = seals.readRunSeal(run)
      expect(held, `a git run is sealed at ${level}`).not.toBeNull()
      expect(held!.seal.git!.commit).toMatch(/^[a-f0-9]{40}$/)
      expect(held!.seal.git!.files.map((one) => one.path)).toEqual(['work/a.txt'])

      // AND THE SEAL BLOCKED NOTHING: the finish went through and the secretary was told.
      expect(patched.theCheck?.askedOf).toBe('c35-secretary')
      expect(patched.theCheck?.reviewLevel).toBe(level)
    }
  })
})
