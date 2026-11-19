// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LANDING MARKS NO POINT OF THE PACKAGE ITS RUN HANDED BACK.
 *
 * Everything here is made up: the agents, the run, the package, its points, the git trees and every word in them. No
 * model, provider or real office is used. `freshDb` makes a throwaway database, and the keys written beside it are random
 * bytes. The git trees are made in the test's own temporary folder.
 *
 * A secretary makes a package, a supervisor takes it inside in its run and hands every point back as done, the person
 * finishes the run, and its merge entry lands. A package's points are ticked by its maker's acceptance, at the accept
 * door, and not by a landing. WHAT IS PROVED: the entry is merged, and no point, the task and no plan block linked to the
 * task changes. Each point stays as it was, with no landing entry and no landing commit. The maker is sent no landed
 * notice, and the landing's answer names no point.
 */

import { aMadeUpModuleForPackage, injectedPackageFixture } from './module-package-fixture.ts'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { THE_MESSAGE_WORKER_ID } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const pushFixture = vi.hoisted(() => ({ folder: '', remote: '' }))
vi.mock('../tools/merge-tool/arguments.mjs', async () => ({
  THE_OFFICE_CONFIGURATION: (await import('../tools/merge-tool/config.mjs')).theOfficeConfiguration({
    repository: process.cwd(), commitEmail: (await import('./the-test-commit-address.mjs')).THE_MERGE_TOOLS_TEST_ADDRESS,
  }),
  get WORKDIR() { return join(pushFixture.folder, 'logs') },
  GIT_IDENTITY: {},
  chosen: { entry: 'made-up-entry', pinOnly: false, get sandboxes() { return join(pushFixture.folder, 'sandboxes') } },
  theMainMirrorOf: () => pushFixture.remote,
  // The private copy's address, read as arguments.mjs reads it: through settings.mjs, when the push asks.
  thePrivateOrigin: (await import('../src/config/settings.mjs')).settingValue.bind(null, 'MOLE_OFFICE_PRIVATE_ORIGIN'),
}))
vi.mock('../tools/merge-tool/log-and-state.mjs', () => ({ fail: (message: string) => { throw new Error(message) }, log: () => {} }))

/** Made-up keys, written beside the throwaway database before the server is built. */
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')

/**
 * THE PRIVATE COPY'S ADDRESS, made up here. It is set as MOLE_OFFICE_PRIVATE_ORIGIN in this test process only, for the
 * push, and never in a .env file: the push reads that setting when it runs, and the setting has no default.
 */
const A_MADE_UP_PRIVATE_COPY = 'git@github.com:a-made-up-owner/a-made-up-copy.git'

const WORKSPACE = 'default'
const MAKER = 'makes-packages-m'
const SUPERVISOR = 'takes-packages-s'
const WORDS = { forTheOutside: 'Do the made-up work and hand it back.', acceptance: 'The made-up work is done.' }
const AT = '2026-11-12 21:00:00'
const PERSON = { type: 'human', id: THE_PERSON } as const

type Outcome = 'done' | 'part' | 'not'
interface APackage { task: string; title: string; points: string[] }
interface ARun { id: string; key: string; handle: string; dir: string; mainAt: string; tip: string }
interface AnEntry { id: string; run: string; tip: string; mainAt: string }

let t: TestDb
let app: FastifyInstance
let door: typeof import('../src/server/lib/merge-entry-door.ts')
let home: string
const savedHome = process.env.HOME
const idOf: Record<string, string> = {}
const keyOf: Record<string, string> = {}

const asThePerson = (): Record<string, string> => ({
  'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-key': A_MADE_UP_PERSON_KEY,
})
const asAgent = (handle: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-key': keyOf[handle]!,
})
const asTheOffice = (): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': THE_MESSAGE_WORKER_ID, 'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-key': A_MADE_UP_OFFICE_KEY,
})
const asTheRun = (run: ARun): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': run.handle, 'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-session': run.id, 'x-mole-office-key': run.key,
})

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

/** The made-up work area of the supervisor, which its run's seal reads. */
const WORK_AREA = 'src'

async function register(handle: string, role: string, headers: Record<string, string>): Promise<void> {
  const reply = await app.inject({
    method: 'POST', url: '/api/agents/started', headers,
    payload: { handle, name: handle, role, chapters: ['5:full'], ...(handle === SUPERVISOR ? { workArea: [WORK_AREA] } : {}) },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  idOf[handle] = String(reply.json().agent.id)
  keyOf[handle] = String(reply.json().whatToGiveIt?.key ?? '')
  expect(keyOf[handle], `no key was given to ${handle}`).not.toBe('')
}

async function file(kind: string, title: string, data: Record<string, unknown> = {}, headers = asThePerson()): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind, title, data: kind === 'decision' ? { replaces: [], ...data } : data } })
  expect(reply.statusCode, reply.body).toBe(201)
  return String(reply.json().record.id)
}

const post = (task: string, door: string, payload: Record<string, unknown>, headers: Record<string, string>) =>
  app.inject({ method: 'POST', url: `/api/delegation/${task}/${door}`, headers, payload })

/** A git tree with a main commit and one commit of work on top, and a running run of the supervisor working in it. */
async function aRunOfTheSupervisor(title: string): Promise<ARun> {
  const dir = mkdtempSync(join(home, 'tree-'))
  git(dir, 'init', '-q', '-b', 'main'); git(dir, 'config', 'user.name', 'Synthetic fixture'); git(dir, 'config', 'user.email', 'fixture@example.invalid')
  writeFileSync(join(dir, 'baseline'), 'baseline')
  git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'Synthetic main')
  const mainAt = git(dir, 'rev-parse', 'HEAD')
  git(dir, 'switch', '-q', '-c', 'work')
  mkdirSync(join(dir, WORK_AREA))
  writeFileSync(join(dir, WORK_AREA, 'work.txt'), title)
  git(dir, 'add', '.'); git(dir, 'commit', '-qm', 'Synthetic work')
  const tip = git(dir, 'rev-parse', 'HEAD')
  const reply = await app.inject({
    method: 'POST', url: '/api/records', headers: asTheOffice(),
    payload: { kind: 'session', title, data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: idOf[SUPERVISOR], doing: title, workingDirectory: dir, cutFrom: 'main', submission: { kind: 'git' } } },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const key = String(reply.json().runKey?.key ?? '')
  expect(key, 'the office made no run key').not.toBe('')
  return { id: String(reply.json().record.id), key, handle: SUPERVISOR, dir, mainAt, tip }
}

/** A package the maker makes, under a parent task the maker answers for, with one backlog item per point. */
async function aPackage(title: string, says: string[]): Promise<APackage> {
  const decision = await file('decision', `${title}: the decision above it`)
  const points: string[] = []
  for (const one of says) {
    points.push(await file('backlog_item', one, { line: 'a-made-up-line', number: one, placedBy: { kind: 'person', id: THE_PERSON }, why: 'Made up for this test.', doneWhen: 'Made up.', state: 'todo' }))
  }
  const parent = await file('task', `${title}: the parent`, {}, asAgent(MAKER))
  const parentPackaged = await post(parent, 'package', { ...WORDS, moduleIds: [await aMadeUpModuleForPackage(injectedPackageFixture(app, WORKSPACE))], parent: { kind: 'decision', id: decision }, pointIds: points }, asAgent(MAKER))
  expect(parentPackaged.statusCode, parentPackaged.body).toBe(201)
  const task = await file('task', title, {}, asAgent(MAKER))
  const packaged = await post(task, 'package', { ...WORDS, moduleIds: [await aMadeUpModuleForPackage(injectedPackageFixture(app, WORKSPACE))], parent: { kind: 'task', id: parent }, pointIds: points }, asAgent(MAKER))
  expect(packaged.statusCode, packaged.body).toBe(201)
  return { task, title, points }
}

/** Taken inside by the run and aligned with the maker. */
async function takenAndAligned(pkg: APackage, run: ARun): Promise<void> {
  for (const [door, payload, headers] of [
    ['take-inside', {}, asTheRun(run)],
    ['align', { restated: 'I will do the made-up work.', plan: 'Do it.' }, asTheRun(run)],
    ['align-answer', { answer: 'aligned', words: 'Yes.' }, asAgent(MAKER)],
  ] as const) {
    const reply = await post(pkg.task, door, payload, headers)
    expect(reply.statusCode, `${door}: ${reply.body}`).toBe(201)
  }
}

/** Handed back by the run, one outcome and words for each point in the package's order. */
async function handedBack(pkg: APackage, run: ARun, said: { outcome: Outcome; words: string }[]): Promise<void> {
  const reply = await post(pkg.task, 'hand-back', { points: pkg.points.map((pointId, at) => ({ pointId, outcome: said[at]!.outcome, words: said[at]!.words })) }, asTheRun(run))
  expect(reply.statusCode, reply.body).toBe(201)
}

/** The person finishes the run, which seals its tip, and its merge entry is made and tested green. */
async function queued(run: ARun): Promise<AnEntry> {
  t.api.patchRecord(run.id, { dataPatch: { state: 'finished' } }, PERSON)
  const seal = t.api.getRecord(run.id)!.data['sealedTip'] as string
  const sealHash = (t.api.getRecord(seal)!.data['seal'] as { hash: string }).hash
  const id = door.asTheMergeQueue(() => t.api.createRecord({ kind: 'merge_entry', title: `The entry of ${run.id}`, workspaceId: WORKSPACE, origin: 'fixture', actor: PERSON, data: {
    state: 'testing', run: run.id, seal: { id: seal, hash: sealHash }, submittedBy: { kind: 'person', id: THE_PERSON }, occupies: run.dir,
    changeset: { adapter: 'git', root: run.dir, repository: run.dir, branch: 'main', commit: run.tip, base: run.mainAt },
    integration: { mainAt: run.mainAt, result: run.tip, clone: run.dir, files: {}, at: AT }, judged: {}, reinspected: [],
    verdict: { run: run.id, by: { kind: 'person', id: THE_PERSON }, at: AT, how: 'Synthetic released fixture', message: null },
  } })).id
  const entry = { id, run: run.id, tip: run.tip, mainAt: run.mainAt }
  await step(entry, 'tested', { green: true, tip: entry.tip, log: '/synthetic/suite.log' })
  return entry
}

async function step(entry: AnEntry, step: string, facts: Record<string, unknown>) {
  const machine = await import('../src/server/lib/merge-state-machine.ts')
  return machine.stepAMergeEntry({ id: entry.id, workspaceId: WORKSPACE, step: step as Parameters<typeof machine.stepAMergeEntry>[0]['step'], facts, actor: PERSON })
}

async function land(entry: AnEntry) {
  await step(entry, 'landing', { mainAt: entry.mainAt })
  return step(entry, 'landed', { mainAfter: entry.tip })
}

function dataOf(id: string): Record<string, any> {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
  return JSON.parse(row.data) as Record<string, any>
}

/** Every message one agent was handed about one run, by its delivery rows, in the order they were written. */
function noticesTo(agent: string, run: string): { id: string; notice: unknown; title: string; body: string }[] {
  const rows = t.client.sqlite.prepare(
    `SELECT r.id AS id, r.title AS title, r.data AS data FROM message_delivery d JOIN records r ON r.id = d.message_id
      WHERE d.recipient_kind = 'agent' AND d.recipient_id = ? AND r.deleted_at IS NULL AND json_extract(r.data, '$.aboutRun') = ?
      ORDER BY r.rowid`,
  ).all(agent, run) as { id: string; title: string; data: string }[]
  return rows.map((row) => {
    const data = JSON.parse(row.data) as Record<string, unknown>
    return { id: row.id, notice: data['notice'], title: row.title, body: String(data['body']) }
  })
}

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'a-landing-marks-no-point-'))
  process.env.HOME = home
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`, { mode: 0o600 })
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  door = await import('../src/server/lib/merge-entry-door.ts')
  app = (await apiApp()).app
  // The loopback listener takes an unused port chosen by the kernel, never the live office's port.
  await app.listen({ host: '127.0.0.1', port: 0 })
  await register(MAKER, 'secretary', asThePerson())
  await register(SUPERVISOR, 'supervisor', asAgent(MAKER))
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  if (savedHome === undefined) delete process.env.HOME
  else process.env.HOME = savedHome
  rmSync(home, { recursive: true, force: true })
})

describe('a landing marks no point of the package its run handed back', () => {
  it('seals and lands with package inspection on before the package has an opinion', async () => {
    const setting = await app.inject({ method: 'PATCH', url: `/api/workspaces/${WORKSPACE}`, headers: asThePerson(), payload: { packageInspection: true } })
    expect(setting.statusCode, setting.body).toBe(200)
    const run = await aRunOfTheSupervisor('A made-up run with package inspection on')
    const pkg = await aPackage('A made-up package awaiting an opinion', ['A made-up point awaiting an opinion'])
    await takenAndAligned(pkg, run)
    await handedBack(pkg, run, [{ outcome: 'done', words: 'Built.' }])
    expect(dataOf(pkg.task)['package']['checks']).toBeUndefined()
    // queued() supplies a made-up release so this case can exercise landing before any package opinion exists.
    const entry = await queued(run)
    expect(dataOf(run.id)['sealedTip']).toBeDefined()
    expect(dataOf(pkg.task)['package']['checks']).toBeUndefined()
    const landing = await step(entry, 'landing', { mainAt: entry.mainAt })
    expect(landing.entry.state).toBe('landing')
    expect(dataOf(pkg.task)['package']['checks']).toBeUndefined()

    // Redirect the push's network boundary to a local bare repository, as the push fixture does.
    pushFixture.folder = join(home, 'made-up-push')
    pushFixture.remote = join(pushFixture.folder, 'remote.git')
    mkdirSync(join(pushFixture.folder, 'logs'), { recursive: true })
    mkdirSync(pushFixture.remote)
    git(pushFixture.remote, 'init', '-q', '--bare')
    const realGit = execFileSync('which', ['git'], { encoding: 'utf8' }).trim()
    const { pushLanded } = await import('../tools/merge-tool/push.mjs')
    git(run.dir, 'remote', 'add', 'origin', A_MADE_UP_PRIVATE_COPY)
    const bin = join(pushFixture.folder, 'bin')
    mkdirSync(bin)
    writeFileSync(join(bin, 'gh'), "#!/bin/sh\nprintf '%s\n' private\n")
    chmodSync(join(bin, 'gh'), 0o700)
    writeFileSync(join(bin, 'git'), `#!${process.execPath}
const {spawnSync}=require('node:child_process');const args=process.argv.slice(2);const c=args.indexOf('-C');const at=c<0?0:c+2;
if(args[at]==='push'||args[at]==='ls-remote'){const target=args.indexOf('origin',at+1);if(target>=0)args[target]=${JSON.stringify(pushFixture.remote)};}
const r=spawnSync(${JSON.stringify(realGit)},args,{stdio:'inherit',env:{...process.env,GIT_ALLOW_PROTOCOL:'file'}});process.exit(r.status??1);
`)
    chmodSync(join(bin, 'git'), 0o700)
    const oldPath = process.env.PATH
    const oldOrigin = process.env.MOLE_OFFICE_PRIVATE_ORIGIN
    process.env.PATH = `${bin}:${oldPath}`
    process.env.MOLE_OFFICE_PRIVATE_ORIGIN = A_MADE_UP_PRIVATE_COPY
    try {
      const pushed = await pushLanded(run.dir, run.tip)
      expect(pushed.ok, pushed.says).toBe(true)
      expect(git(pushFixture.remote, 'rev-parse', 'refs/heads/main')).toBe(run.tip)
      expect(dataOf(pkg.task)['package']['checks']).toBeUndefined()
    } finally {
      process.env.PATH = oldPath
      if (oldOrigin === undefined) delete process.env.MOLE_OFFICE_PRIVATE_ORIGIN
      else process.env.MOLE_OFFICE_PRIVATE_ORIGIN = oldOrigin
    }
    const landed = await step(entry, 'landed', { mainAfter: entry.tip })
    expect(landed.entry.state).toBe('merged')
    expect(dataOf(pkg.task)['package']['checks']).toBeUndefined()
  }, 120_000)

  it('lands the entry and leaves every point, the task and each linked plan block as they were', async () => {
    const run = await aRunOfTheSupervisor('A made-up run that does a whole package')
    const whole = await aPackage('A made-up package handed back whole', ['A made-up first point', 'A made-up second point'])
    const plan = await file('pipeline', 'A made-up plan', { blockIds: [] })
    const block = t.blocks.addBlock(plan, { name: 'A made-up block linked to the task', state: 'doing' }, PERSON).block.id
    t.api.createLink({ fromId: block, toId: whole.task, type: 'relates_to', actor: PERSON })
    await takenAndAligned(whole, run)
    await handedBack(whole, run, [{ outcome: 'done', words: 'Built.' }, { outcome: 'done', words: 'Built too.' }])
    const entry = await queued(run)

    const landed = await land(entry)
    expect(landed.entry.state).toBe('merged')
    expect(dataOf(run.id)['integrated']?.['entry']).toBe(entry.id)

    for (const point of whole.points) {
      expect(dataOf(point)['state'], point).toBe('todo')
      expect(dataOf(point), point).not.toHaveProperty('landedIn')
      expect(dataOf(point)['extra']?.['landingCommit'], point).toBeUndefined()
      expect(landed.decided, point).not.toContain(point)
    }
    expect(landed.decided.endsWith(`${run.id}.`), landed.decided).toBe(true)
    expect(landed.decided).not.toContain(whole.title)
    expect(dataOf(whole.task)['state']).not.toBe('done')
    expect(dataOf(block)['state']).toBe('doing')
    expect(noticesTo(idOf[MAKER]!, run.id).map((one) => one.notice)).not.toContain('packageLanded')
  }, 120_000)
})
