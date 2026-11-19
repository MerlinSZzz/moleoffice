// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SEAL READS THE NEWER OF `main` AND `origin/main`, AND A RESEAL AFTER A REBASE READS ONLY THE RUN'S OWN CHANGES.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Wave 13s, round 26 (run ERIHTS94j3bk, seal BDfAxJ4B3Ckk). The run's record named cutFrom `main`. Its sandbox clone's
 * local `main` stood at 4b6580caf and moved only when somebody pulled; the branch had been rebased onto `origin/main`,
 * 8ee38b7d1. The seal read the fork base off the local `main`, so it held 23 paths, and 21 of them were other people's
 * work already in `origin/main`. Read against `origin/main`, the same commit holds 2.
 *
 * The secretary's decision hgWHD-oVVVRk: the trunk is the newer of `main` and `origin/main`; where they have diverged the seal
 * refuses and names both commits; where there is no `origin/main` it is `main`, as before (part b). A run sealed again
 * after it was rebased onto a newer trunk reads its fork base again, and one sealed again without a rebase keeps its
 * first fork base, as before (part a).
 *
 * These cases drive the real finish door, `PATCH /api/records/:id` with `dataPatch.state = 'finished'`, in scratch
 * repositories under this test's own temporary directory, which it removes.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED WHEN THE CODE IS PUT BACK. Control run first, then each mutation, then restored.
 * ---------------------------------------------------------------------------------------
 *
 *   - Make `theNewerTrunk` answer what it was given: (b1) and (b2) go red, the seal holds the other person's file;
 *     (b4) seals instead of refusing; and every (a) case goes red, because each first seal reads the stale main.
 *   - Make it never take `origin/<branch>` when the local one contains it, i.e. drop the `contains(local, far)`
 *     line: (b3) goes red, the office's own case is refused as diverged.
 *   - Make it choose the local branch where the two have diverged: (b4) goes red, a seal instead of a refusal.
 *   - Make it answer `origin/<branch>` where there is no origin: (b5) goes red, git cannot resolve it.
 *   - Put `captureGit(dir, prior?.forkBase ?? named, area, prior != null)` back in `sealFinishedRun`: (a1) goes red,
 *     the reseal holds the other person's later file.
 *   - Make the reseal read against the trunk's tip instead of a merge base, i.e. `captureGit(directory,
 *     'origin/main', area, true)` in `theGitOfASeal`: (a2) goes red, the trunk's later file reads as deleted, and so
 *     do (a3) and (a4).
 *   - Drop `theCommitIsUnder(directory, prior.forkBase, again.forkBase)` from `theGitOfASeal`: (a3) goes red, a
 *     branch moved onto an older base is sealed against it where it was refused before.
 *   - Drop `again.forkBase !== again.commit` from `theGitOfASeal`: (a4) goes red, a tip already in the trunk is
 *     sealed as holding no files.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let seals: typeof import('../src/server/lib/sealed-tip.ts')

const WORKSPACE = 'default'
const actor = { type: 'agent' as const, id: 'newer-worker' }
const headers = {
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'newer-worker',
}

/** Every scratch directory this file makes, removed in one place when it is done. */
const scratch: string[] = []

function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  scratch.push(dir)
  return dir
}

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

function configure(dir: string): void {
  git(dir, 'config', 'user.email', 'a-test@example.invalid')
  git(dir, 'config', 'user.name', 'A test')
  git(dir, 'config', 'commit.gpgsign', 'false')
}

function write(dir: string, path: string, text: string, message: string): void {
  mkdirSync(join(dir, 'work'), { recursive: true })
  writeFileSync(join(dir, path), text)
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '-m', message)
}

/** A run in the working directory given. */
function runIn(directory: string, extra: Record<string, unknown> = {}): string {
  return t.api.createRecord({
    kind: 'session',
    title: 'Synthetic newer-trunk run',
    workspaceId: WORKSPACE,
    actor,
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'newer-worker', workingDirectory: directory, ...extra },
  }).id
}

async function finish(id: string) {
  return app.inject({ method: 'PATCH', url: '/api/records/' + id, headers, payload: { dataPatch: { state: 'finished' } } })
}

const sealedPaths = (id: string) => seals.readRunSeal(id)!.seal.git!.files.map((one) => one.path)

/**
 * A bare origin whose `main` has one commit, and a clone of it. The clone's local `main` stays at that commit. Then
 * somebody else's commit lands on origin's `main` and the clone fetches it, so `origin/main` is one commit newer than
 * the local `main`: a sandbox clone nobody pulled in. `other` is a second clone, standing for that somebody.
 */
function aStaleClone(): { clone: string; other: string } {
  const origin = tmp('mole-office-newer-origin-')
  git(origin, 'init', '-q', '--bare', '-b', 'main')
  const other = tmp('mole-office-newer-other-')
  git(other, 'init', '-q', '-b', 'main')
  configure(other)
  write(other, 'work/before.txt', 'before\n', 'Before anything')
  git(other, 'remote', 'add', 'origin', origin)
  git(other, 'push', '-q', 'origin', 'main')
  const clone = tmp('mole-office-newer-clone-')
  execFileSync('git', ['clone', '-q', origin, clone], { encoding: 'utf8' })
  configure(clone)
  write(other, 'work/somebody-elses.txt', 'somebody else\n', 'Somebody else lands on main')
  git(other, 'push', '-q', 'origin', 'main')
  git(clone, 'fetch', '-q', 'origin')
  expect(git(clone, 'rev-parse', 'main')).not.toBe(git(clone, 'rev-parse', 'origin/main'))
  return { clone, other }
}

/** The run's branch, cut from `origin/main` (the wave rebased onto it), with one file of its own. */
function theWorkOnOrigin(clone: string): void {
  git(clone, 'switch', '-q', '-c', 'the-work', 'origin/main')
  write(clone, 'work/mine.txt', 'mine\n', 'The run’s own work')
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  seals = await import('../src/server/lib/sealed-tip.ts')
  const starter = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: { ...headers, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON },
    payload: { handle: 'newer-starter', name: 'Synthetic newer starter' },
  })
  expect(starter.statusCode, starter.body).toBe(201)
  const worker = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: { ...headers, 'x-mole-office-actor-id': 'newer-starter' },
    payload: { handle: 'newer-worker', name: 'Synthetic newer worker', workArea: ['work'] },
  })
  expect(worker.statusCode, worker.body).toBe(201)
})

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true })
})

describe('(b) the trunk is the newer of main and origin/main', () => {
  it('(b1) a stale local main behind origin/main, cutFrom main: the seal holds only the run’s own file', async () => {
    const { clone } = aStaleClone()
    theWorkOnOrigin(clone)
    const id = runIn(clone, { cutFrom: 'main' })
    const reply = await finish(id)
    expect(reply.statusCode, reply.body).toBe(200)
    expect(seals.readRunSeal(id)!.seal.git!.forkBase).toBe(git(clone, 'rev-parse', 'origin/main'))
    expect(sealedPaths(id)).toEqual(['work/mine.txt'])
  })

  it('(b2) the same, with no cutFrom: the trunk read from origin/HEAD is main, and origin/main is the newer', async () => {
    const { clone } = aStaleClone()
    theWorkOnOrigin(clone)
    expect(git(clone, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD')).toBe('origin/main')
    const id = runIn(clone)
    const reply = await finish(id)
    expect(reply.statusCode, reply.body).toBe(200)
    expect(sealedPaths(id)).toEqual(['work/mine.txt'])
  })

  it('(b3) the office’s own case, origin/main behind main: main is read, as before', async () => {
    const { clone } = aStaleClone()
    // THE LOCAL main IS THE QUEUE'S: it takes origin's commit and one more that origin has not seen.
    git(clone, 'switch', '-q', 'main')
    git(clone, 'merge', '-q', '--ff-only', 'origin/main')
    write(clone, 'work/queued.txt', 'queued\n', 'The queue lands a commit on main')
    git(clone, 'switch', '-q', '-c', 'the-work')
    write(clone, 'work/mine.txt', 'mine\n', 'The run’s own work')
    const id = runIn(clone, { cutFrom: 'main' })
    const reply = await finish(id)
    expect(reply.statusCode, reply.body).toBe(200)
    expect(seals.readRunSeal(id)!.seal.git!.forkBase).toBe(git(clone, 'rev-parse', 'main'))
    expect(sealedPaths(id)).toEqual(['work/mine.txt'])
  })

  it('(b4) main and origin/main have diverged: the seal refuses, naming both commits', async () => {
    const { clone } = aStaleClone()
    git(clone, 'switch', '-q', 'main')
    write(clone, 'work/local-only.txt', 'local only\n', 'A commit only the local main has')
    git(clone, 'switch', '-q', '-c', 'the-work')
    write(clone, 'work/mine.txt', 'mine\n', 'The run’s own work')
    const id = runIn(clone, { cutFrom: 'main' })
    const reply = await finish(id)
    expect(reply.statusCode, reply.body).toBe(409)
    expect(reply.body).toContain(git(clone, 'rev-parse', 'main'))
    expect(reply.body).toContain(git(clone, 'rev-parse', 'origin/main'))
    expect(reply.body).toContain('diverged')
    expect(seals.readRunSeal(id)).toBeNull()
    expect(t.api.getRecord(id)?.data['state']).toBe('running')
  })

  it('(b5) no origin at all: main is read, as before', async () => {
    const dir = tmp('mole-office-newer-alone-')
    git(dir, 'init', '-q', '-b', 'main')
    configure(dir)
    write(dir, 'work/before.txt', 'before\n', 'Before the work')
    git(dir, 'switch', '-q', '-c', 'the-work')
    write(dir, 'work/mine.txt', 'mine\n', 'The run’s own work')
    const id = runIn(dir, { cutFrom: 'main' })
    const reply = await finish(id)
    expect(reply.statusCode, reply.body).toBe(200)
    expect(seals.readRunSeal(id)!.seal.git!.forkBase).toBe(git(dir, 'rev-parse', 'main'))
    expect(sealedPaths(id)).toEqual(['work/mine.txt'])
  })
})

describe('(a) a run sealed again', () => {
  it('(a1) after a rebase onto a newer trunk, reads only its own changes', async () => {
    const { clone, other } = aStaleClone()
    theWorkOnOrigin(clone)
    const id = runIn(clone, { cutFrom: 'main' })
    expect((await finish(id)).statusCode).toBe(200)
    const first = seals.readRunSeal(id)!.seal.git!.forkBase
    // THE TRUNK MOVES ON, AND THE RUN REBASES ONTO IT before it is sealed again.
    write(other, 'work/later.txt', 'later\n', 'Somebody else lands again')
    git(other, 'push', '-q', 'origin', 'main')
    git(clone, 'fetch', '-q', 'origin')
    git(clone, 'rebase', '-q', 'origin/main')
    const reply = await finish(id)
    expect(reply.statusCode, reply.body).toBe(200)
    const again = seals.readRunSeal(id)!.seal.git!
    expect(again.commit).toBe(git(clone, 'rev-parse', 'HEAD'))
    expect(again.forkBase).not.toBe(first)
    expect(again.forkBase).toBe(git(clone, 'rev-parse', 'origin/main'))
    expect(again.files.map((one) => one.path)).toEqual(['work/mine.txt'])
  })

  it('(a2) without a rebase, keeps its first fork base, as before', async () => {
    const { clone, other } = aStaleClone()
    theWorkOnOrigin(clone)
    const id = runIn(clone, { cutFrom: 'main' })
    expect((await finish(id)).statusCode).toBe(200)
    const first = seals.readRunSeal(id)!.seal.git!.forkBase
    // THE TRUNK MOVES ON AND THE RUN DOES NOT TAKE IT IN; IT ADDS A COMMIT OF ITS OWN.
    write(other, 'work/later.txt', 'later\n', 'Somebody else lands again')
    git(other, 'push', '-q', 'origin', 'main')
    git(clone, 'fetch', '-q', 'origin')
    write(clone, 'work/mine-too.txt', 'mine too\n', 'More of the run’s own work')
    const reply = await finish(id)
    expect(reply.statusCode, reply.body).toBe(200)
    const again = seals.readRunSeal(id)!.seal.git!
    expect(again.commit).toBe(git(clone, 'rev-parse', 'HEAD'))
    expect(again.forkBase).toBe(first)
    expect(again.files.map((one) => one.path)).toEqual(['work/mine-too.txt', 'work/mine.txt'])
  })

  it('(a3) moved onto a base that does not descend from the first one, is refused as before', async () => {
    const { clone } = aStaleClone()
    theWorkOnOrigin(clone)
    const id = runIn(clone, { cutFrom: 'main' })
    expect((await finish(id)).statusCode).toBe(200)
    const first = seals.readRunSeal(id)!.seal.git!.forkBase
    // THE RUN'S COMMIT IS MOVED ONTO THE LOCAL main, which is older than the first fork base, and origin's main is
    // put back to match. The first fork base is then not under the tip, and the seal refuses, as it always did.
    git(clone, 'rebase', '-q', '--onto', 'main', first)
    git(clone, 'update-ref', 'refs/remotes/origin/main', 'main')
    const reply = await finish(id)
    expect(reply.statusCode, reply.body).toBe(409)
    expect(seals.readRunSeal(id)!.seal.git!.forkBase).toBe(first)
  })

  it('(a4) whose tip is already in the trunk, keeps its first fork base and its files', async () => {
    const { clone } = aStaleClone()
    theWorkOnOrigin(clone)
    const id = runIn(clone, { cutFrom: 'main' })
    expect((await finish(id)).statusCode).toBe(200)
    const first = seals.readRunSeal(id)!.seal.git!
    // THE RUN'S BRANCH LANDS: origin's main moves to the run's tip.
    git(clone, 'push', '-q', 'origin', 'the-work:main')
    git(clone, 'fetch', '-q', 'origin')
    const reply = await finish(id)
    expect(reply.statusCode, reply.body).toBe(200)
    const again = seals.readRunSeal(id)!.seal.git!
    expect(again.forkBase).toBe(first.forkBase)
    expect(again.files.map((one) => one.path)).toEqual(['work/mine.txt'])
  })
})
