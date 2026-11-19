// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW MUCH REVIEW A FINISHED RUN GETS, SET PER PROJECT: none, light, full.
 *
 * This follows a decision and the answers on how the three levels meet the chain the office already
 * has. What each level means:
 *
 *   none   The office starts no inspector, and the secretary confirms the finished run directly.
 *   light  The report goes to the secretary, who answers. No inspector.
 *   full   The inspector runs exactly as it does today.
 *
 * THE SEAL STAYS AND BLOCKS NOBODY AT ANY LEVEL.
 *
 * THE VALUE BEFORE ANYBODY CHOOSES IS `full`, so nothing changed on the day the column landed. That
 * is the first case below, and it is the one that matters most: a migration that had quietly turned
 * the inspector off on every project would have looked exactly like a migration that worked.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED FIRST
 * ---------------------------------------------------------------------------------------
 *
 * The release door, `POST /api/checks/:run/release` at src/server/api/inspection.ts:345, admits two
 * callers and nobody else: the holder of the inspector card, or the participant recorded as the
 * starter of the agent the run serves. The secretary is neither in the ordinary chain, so at level
 * `none` nothing would ever release the run — and `confirmTheReport` refused a confirmation with no
 * release, so the run could not be closed at all. The secretary's decision of 11 September 2026 is the
 * branch this file proves: at `none` and `light` the confirmation stops needing a release and
 * carries the seal, its hash and the tip itself, so a closure still says WHICH WORK was accepted.
 * It never says anybody checked it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED WHEN THE CODE IS REMOVED. Control run first, then each mutation, then restored.
 * ---------------------------------------------------------------------------------------
 *
 *   - `REVIEW_LEVEL_BEFORE_ANYBODY_CHOOSES` in src/shared/workspaces.ts from 'full' to 'none', and
 *     "a project nobody has chosen for is checked exactly as it was before" goes red.
 *   - Delete the `if (level !== 'full')` block in `theOfficeStartsTheCheck`
 *     (src/server/lib/inspection.ts), and the two cases that say no inspector is started go red.
 *   - `const mustBeReleasedFirst = level === 'full'` in `confirmTheReport` to `= true`, and
 *     "the secretary closes a run at none with no release" goes red.
 *   - The same line to `= false`, and "a confirmation at full still needs a release" goes red —
 *     which is the half that proves the guard was narrowed and not removed.
 */
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { REVIEW_LEVEL_BEFORE_ANYBODY_CHOOSES, reviewLevelOf, type ReviewLevel } from '../src/shared/workspaces.ts'

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
const directories: string[] = []

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

/** A synthetic repository with one committed change, so a finish has something real to seal. */
function tree(): string {
  mkdirSync('.logs', { recursive: true })
  const dir = mkdtempSync(join(process.cwd(), '.logs', 'review-level-fixture-'))
  directories.push(dir)
  git(dir, 'init', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic review-level fixture')
  // A FOLDER, because criterion P92's worker grain is folders and the area registered below is one.
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

async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
}

async function setTheLevel(level: ReviewLevel | null): Promise<Record<string, unknown>> {
  const reply = await app.inject({
    method: 'PATCH',
    url: `/api/workspaces/${WORKSPACE}`,
    headers: AS_THE_PERSON,
    payload: { reviewLevel: level },
  })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as Record<string, unknown>
}

interface TheCheck {
  askedAt: string
  askedOf?: string
  message?: string
  reviewLevel?: string
  says: string
}

/** A run that is still going, in a real working tree so its finish can be sealed. */
async function aRunStillGoing(title: string, directory: string): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent('the-worker'),
    payload: {
      kind: 'session',
      title,
      data: {
        state: 'running',
        servingAgent: 'the-worker',
        workingDirectory: directory,
        cutFrom: 'main',
        doing: 'building the thing under review',
      },
    },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { record: { id: string } }).record.id
}

async function sayItIsFinished(run: string): Promise<{ theCheck?: TheCheck }> {
  const reply = await app.inject({
    method: 'PATCH',
    url: `/api/records/${run}`,
    headers: asAgent('the-worker'),
    payload: { dataPatch: { state: 'finished', doing: 'the work is done' } },
  })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as { theCheck?: TheCheck }
}

interface Stands {
  standing: string
  waitingFor: string | null
  says: string
  confirmed: { by: { id: string }; because: string; read?: Record<string, unknown> } | null
  released: unknown
}

async function readTheRun(run: string): Promise<{ theCheck: TheCheck | null; stands: Stands }> {
  const reply = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as { theCheck: TheCheck | null; stands: Stands }
}

async function confirm(run: string, by: string, because: string): Promise<{ status: number; said: Record<string, unknown> }> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/checks/${run}/confirm`,
    headers: asAgent(by),
    payload: { because },
  })
  return { status: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  // ONLY THE PERSON APPOINTS AN INSPECTOR. An agent that tried would be appointing its own checker.
  await register(AS_THE_PERSON, { handle: 'inspector-one', name: 'Inspector One', role: 'inspector' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), {
    handle: 'the-worker',
    name: 'The Worker',
    role: 'worker',
    workArea: ['work'],
  })
})

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const dir of directories) rmSync(dir, { recursive: true, force: true })
})

describe('the level a project is at before anybody chooses', () => {
  it('is full, in one place, and reads as full from a row holding nothing', () => {
    expect(REVIEW_LEVEL_BEFORE_ANYBODY_CHOOSES).toBe('full')
    expect(reviewLevelOf(null)).toBe('full')
    expect(reviewLevelOf(undefined)).toBe('full')
  })

  it('refuses a stored word that is not one of the three rather than reading it as full', () => {
    // A SILENT SUBSTITUTION IS THE SECOND INVARIANT. A row holding "strict" got there outside the
    // door that validates, and answering "full" for it would hide that.
    expect(() => reviewLevelOf('strict')).toThrow(/not one of none, light, full/)
  })

  it('checks a run exactly as it was checked before, because nobody has chosen', async () => {
    const read = await app.inject({ method: 'GET', url: '/api/workspaces', headers: AS_THE_PERSON })
    expect(read.statusCode, read.body).toBe(200)
    const here = (read.json() as { workspaces: { id: string; reviewLevel: string | null }[] }).workspaces.find(
      (one) => one.id === WORKSPACE,
    )
    expect(here?.reviewLevel, 'a fresh database has chosen no level').toBeNull()

    const run = await aRunStillGoing('A run in a project nobody has chosen a level for', tree())
    const patched = await sayItIsFinished(run)
    expect(patched.theCheck?.askedOf).toBe('inspector-one')
    expect(patched.theCheck).not.toHaveProperty('reviewLevel')
  })
})

describe('the door that sets it', () => {
  it('takes the three words, puts the project back to nobody having chosen, and refuses anything else', async () => {
    expect(await setTheLevel('light')).toMatchObject({ id: WORKSPACE, reviewLevel: 'light' })
    expect(await setTheLevel('none')).toMatchObject({ id: WORKSPACE, reviewLevel: 'none' })
    expect(await setTheLevel('full')).toMatchObject({ id: WORKSPACE, reviewLevel: 'full' })
    expect(await setTheLevel(null)).toMatchObject({ id: WORKSPACE, reviewLevel: null })

    const bad = await app.inject({
      method: 'PATCH',
      url: `/api/workspaces/${WORKSPACE}`,
      headers: AS_THE_PERSON,
      payload: { reviewLevel: 'strict' },
    })
    expect(bad.statusCode, bad.body).toBe(400)
  })
})

describe('light — the report goes to the secretary, who answers. No inspector.', () => {
  it('starts no inspector, tells the secretary, and says on the run which level did it', async () => {
    await setTheLevel('light')
    const run = await aRunStillGoing('A run in a project at Light', tree())
    const patched = await sayItIsFinished(run)

    expect(patched.theCheck?.reviewLevel).toBe('light')
    expect(patched.theCheck?.askedOf, 'the secretary, not an inspector').toBe(THE_TEST_OFFICES_SECRETARY.handle)
    expect(patched.theCheck?.says).toContain('started no check')

    const read = await readTheRun(run)
    expect(read.stands.standing).toBe('inspecting')
    expect(read.stands.waitingFor).toContain('answer its report')
    expect(read.stands.waitingFor).toContain('Light')
  })
})

describe('none — the office starts no inspector and the secretary confirms directly', () => {
  it('starts no inspector and says the secretary is being asked to confirm it', async () => {
    await setTheLevel('none')
    const run = await aRunStillGoing('A run in a project at None', tree())
    const patched = await sayItIsFinished(run)

    expect(patched.theCheck?.reviewLevel).toBe('none')
    expect(patched.theCheck?.askedOf).toBe(THE_TEST_OFFICES_SECRETARY.handle)

    const read = await readTheRun(run)
    expect(read.stands.waitingFor).toContain('confirm it')
    expect(read.stands.waitingFor).toContain('None')
  })

  it('closes on a confirmation with no release, and the confirmation names the seal, its hash and the tip', async () => {
    await setTheLevel('none')
    const dir = tree()
    const run = await aRunStillGoing('A run closed at None', dir)
    await sayItIsFinished(run)

    const answered = await confirm(run, THE_TEST_OFFICES_SECRETARY.handle, 'Read the work. Nothing is owed.')
    expect(answered.status, JSON.stringify(answered.said)).toBe(201)

    const read = await readTheRun(run)
    expect(read.stands.standing).toBe('closed')
    expect(read.stands.released, 'nothing released it, and nothing pretended to').toBeNull()
    // AND IT LEAVES THE STARTER'S LIST. A closed run is not a finish nobody answered for, and
    // before this it would have sat there for ever while its own page said it was closed.
    expect((read.stands as unknown as { unreleasedFinish: boolean }).unreleasedFinish).toBe(false)

    // WHICH WORK WAS ACCEPTED. The half a confirmation can prove.
    const said = read.stands.confirmed?.read
    expect(said, 'a confirmation made with no release carries what it accepted').toBeTruthy()
    expect(said?.['tip']).toBe(git(dir, 'rev-parse', 'HEAD'))
    expect(said?.['worktree']).toBe(dir)
    expect(String(said?.['sealHash'])).toHaveLength(64)
    // AND IT NEVER CLAIMS A CHECK. `ofItsOwn` false is a real answer: nothing read a worktree here.
    expect(said?.['ofItsOwn']).toBe(false)

    // AND THE CLOSING SENTENCE SAYS SO, wherever a release's words would be drawn.
    expect(read.stands.says).toContain('Confirmed, not checked')
    expect(read.stands.says).toContain('nothing read it against the office regulations')
  })
})

describe('full — the guard is narrowed and not removed', () => {
  it('still refuses a confirmation of a run no check released', async () => {
    await setTheLevel('full')
    const run = await aRunStillGoing('A run at Full nobody released', tree())
    await sayItIsFinished(run)

    const refused = await confirm(run, THE_TEST_OFFICES_SECRETARY.handle, 'Closing it anyway.')
    expect(refused.status, JSON.stringify(refused.said)).toBe(409)
    expect(String(refused.said['error'] ?? refused.said['message'])).toContain('not a way round the check')
  })
})

