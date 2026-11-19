// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** _VDR6BJbiaoF. Every repository, office, and process here belongs to this test under tmpdir(). */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { apiServerArguments, freshDb, type TestDb } from './helpers.ts'
import { aFixtureSeatDoor, aMadeUpCheckSession, fixtureOfficeDatabase } from './inspector-tool-fixture.ts'
import { theOwnersEffort } from '../src/config/model-efforts.mjs'

/**
 * THE OFFICE HERE IS AN OLDER ONE: its run-models door gives no native selection, so the tool starts the check from the
 * compatibility list (src/config/launcher-model-compatibility.json). The model is one that list names, and the door
 * answers it at its start value, as such an office does. A model the list does not name is refused before anything starts.
 */
const THE_MODEL = 'claude-sonnet-5'

const children = new Set<ChildProcess>()
let database: TestDb | undefined

afterEach(async () => {
  for (const child of children) {
    if (child.exitCode !== null || child.signalCode !== null) continue
    const ended = once(child, 'close')
    child.kill('SIGTERM')
    await ended
  }
  children.clear()
  database?.client.sqlite.close()
  database = undefined
})

function world() {
  const home = mkdtempSync(join(tmpdir(), 'mole-office-check-worktrees-'))
  const repo = join(home, 'repository')
  const worktrees = join(home, '.cache/mole-office/worktrees')
  mkdirSync(repo)
  mkdirSync(worktrees, { recursive: true })
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '-q', '-b', 'main')
  git('config', 'user.name', 'Synthetic check fixture')
  git('config', 'user.email', 'fixture@example.invalid')
  writeFileSync(join(repo, 'work'), 'A synthetic repository.\n')
  git('add', '.')
  git('-c', 'commit.gpgsign=false', 'commit', '-qm', 'Synthetic base')
  git('checkout', '-qb', 'fixture-work')
  writeFileSync(join(repo, 'work'), 'A synthetic change.\n')
  git('-c', 'commit.gpgsign=false', 'commit', '-qam', 'Synthetic change')
  const tree = (check: string, root = worktrees) => {
    mkdirSync(root, { recursive: true })
    const at = join(root, `a-check-of-fixture-run-${check}`)
    git('worktree', 'add', '--detach', at, 'HEAD')
    return at
  }
  return { home, repo, worktrees, git, tree }
}

/** A fresh test database made the office, as the office's own database is: the sweep runs only there. */
async function anOfficeDatabase(): Promise<TestDb> {
  const made = await freshDb()
  const { registerWorldHere } = await import('../src/server/lib/office.ts')
  const identity = (await import('../src/server/lib/world.ts')).theWorldThisDatabaseIs()
  if (identity === null) throw new Error('the test database has no identity, so the office cannot be placed in it')
  registerWorldHere({
    name: 'synthetic office', purpose: 'the check worktree sweep test', kind: 'home',
    startedBy: { kind: 'agent', id: 'fixture-inspector' }, checkout: tmpdir(), head: '0000000',
    databaseIdentity: identity, address: 'http://127.0.0.1:1', addressForOtherMachines: null,
    standing: 'scratch', parentWorld: null, installation: 'a-synthetic-installation',
  })
  return made
}

async function checkRecord(state: string) {
  database ??= await anOfficeDatabase()
  return database.api.createRecord({ kind: 'session', title: 'Synthetic check', workspaceId: 'default',
    data: { state, runtime: 'inspection-tool' }, actor: { type: 'agent', id: 'fixture-inspector' } }).id
}

/** Run the real office startup, and stop its own pid once the startup sweep has reported. */
async function startup(home: string, said = 'Check worktree sweep:') {
  const portHolder = createServer()
  await new Promise<void>((done) => portHolder.listen(0, '127.0.0.1', done))
  const address = portHolder.address()
  if (address === null || typeof address === 'string') throw new Error('The fixture has no port.')
  await new Promise<void>((done) => portHolder.close(() => done()))
  const child = spawn(process.execPath, apiServerArguments(['--import', 'tsx']), {
    env: { ...process.env, HOME: home, MOLE_OFFICE_DB: database!.file, MOLE_OFFICE_PORT: String(address.port),
      MOLE_OFFICE_API: `http://127.0.0.1:${address.port}`, MOLE_OFFICE_WORKSPACE: 'default',
      MOLE_OFFICE_MESSAGE_WORKER: 'off', MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES: 'none', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.add(child)
  let out = ''
  let err = ''
  const ended = once(child, 'close')
  const timer = setTimeout(() => child.kill('SIGTERM'), 20_000)
  child.stdout.on('data', (part) => {
    out += String(part)
    if (out.includes(said)) child.kill('SIGTERM')
  })
  child.stderr.on('data', (part) => { err += String(part) })
  await ended
  clearTimeout(timer)
  expect(out, err).toContain(said)
  return out
}

it('removes and prunes after a filed verdict, and reports retained or failed removals truthfully', async () => {
  const w = world()
  const bin = join(w.home, 'bin')
  mkdirSync(bin)
  writeFileSync(join(bin, 'claude'), '#!/usr/bin/env node\nprocess.stdin.resume(); process.stdin.on("end", () => console.log(JSON.stringify({result: JSON.stringify({verdict: "released", check: "Synthetic verdict."})})))\n', { mode: 0o755 })
  let accepted = true
  let lock = false
  let filed = 0
  const office = createServer(async (request, reply) => {
    if (aFixtureSeatDoor(request, reply)) return
    reply.setHeader('content-type', 'application/json')
    let raw = ''
    for await (const part of request) raw += String(part)
    if (request.url?.endsWith('/eligibility')) return reply.end(JSON.stringify({ eligible: true }))
    if (request.url?.startsWith('/api/office/run-models/for/')) return reply.end(JSON.stringify({ runtime: 'claude-code', model: THE_MODEL, variant: theOwnersEffort(THE_MODEL) }))
    if (request.method === 'GET') return reply.end(JSON.stringify({ title: 'Synthetic run', workArea: ['work'], checkout: { cutFrom: 'main' } }))
    if (request.url?.endsWith('/prompt')) return reply.end(JSON.stringify({ prompt: 'Synthetic prompt.', bytes: 17 }))
    if (request.url === '/api/checks/fixture-run') {
      if (!accepted) {
        reply.statusCode = 409
        return reply.end(JSON.stringify({ error: 'Synthetic verdict refusal.' }))
      }
      const body = JSON.parse(raw)
      expect(existsSync(body.read.worktree)).toBe(true)
      if (lock) w.git('worktree', 'lock', body.read.worktree)
      filed += 1
      return reply.end(JSON.stringify({ verdict: 'released', group: null }))
    }
    reply.end(JSON.stringify({ ok: true }))
  })
  await new Promise<void>((done) => office.listen(0, '127.0.0.1', done))
  const address = office.address()
  if (address === null || typeof address === 'string') throw new Error('The fixture has no port.')
  async function inspect(check: string, dry = false) {
    const child = spawn(process.execPath, ['tools/the-inspector.mjs', '--run', 'fixture-run', '--check', check,
      '--as', 'fixture-inspector', '--api', `http://127.0.0.1:${(address as { port: number }).port}`,
      '--checkout', w.repo, '--model', THE_MODEL, dry ? '--dry' : '--on-the-host'], {
      env: { ...process.env, HOME: w.home, MOLE_OFFICE_DB: fixtureOfficeDatabase(w.home), MOLE_OFFICE_CHECK_WORKTREES: w.worktrees, PATH: `${bin}:${process.env.PATH}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    children.add(child)
    let out = '', err = ''
    child.stdout.on('data', (part) => { out += String(part) })
    child.stderr.on('data', (part) => { err += String(part) })
    await once(child, 'close')
    return { code: child.exitCode, out, err, at: join(w.worktrees, `a-check-of-fixture-run-${check}`) }
  }
  try {
    const done = await inspect(aMadeUpCheckSession())
    expect(done.code, done.err).toBe(0)
    expect(filed).toBe(1)
    expect(existsSync(done.at)).toBe(false)
    expect(w.git('worktree', 'list', '--porcelain')).not.toContain(done.at)
    expect(done.out).toContain(`${done.at} is removed. Its repository was pruned.`)
    expect(done.out.indexOf('is removed.')).toBeLessThan(done.out.indexOf('The check answered:'))

    accepted = false
    const refused = await inspect(aMadeUpCheckSession())
    expect(refused.code).toBe(1)
    expect(existsSync(refused.at)).toBe(true)
    expect(refused.err).toContain('is kept because verdict delivery has not completed')
    expect(refused.out).not.toContain('is removed.')

    const dry = await inspect(aMadeUpCheckSession(), true)
    expect(dry.code).toBe(0)
    expect(existsSync(dry.at)).toBe(false)
    expect(dry.out).toContain('--dry was given, so no model ran and no verdict was written.')
    expect(dry.out).toContain(`${dry.at} is removed.`)
    expect(filed).toBe(1)

    accepted = true
    lock = true
    const failed = await inspect(aMadeUpCheckSession())
    expect(failed.code).toBe(1)
    expect(existsSync(failed.at)).toBe(true)
    expect(failed.err).toContain(`${failed.at} could not be removed`)
    expect(failed.out).not.toContain('is removed.')
  } finally {
    await new Promise<void>((done) => office.close(() => done()))
  }
})

it('the startup sweep keeps a worktree occupied by a live process and removes a finished sandbox check', async () => {
  const w = world()
  const occupied = w.tree(await checkRecord('finished'))
  const inside = join(occupied, 'nested')
  mkdirSync(inside)
  const child = spawn(process.execPath, ['-e', 'process.stdout.write("ready"); setInterval(() => {}, 1000)'], { cwd: inside, stdio: ['ignore', 'pipe', 'pipe'] })
  children.add(child)
  await once(child.stdout, 'data')
  const sandbox = join(w.home, '.cache/mole-office/sandboxes/inspector-fixture/worktrees')
  const finished = w.tree(await checkRecord('finished'), sandbox)
  const out = await startup(w.home)
  expect(existsSync(occupied)).toBe(true)
  expect(out).toContain(`PID ${child.pid} (cwd ${inside})`)
  expect(() => process.kill(child.pid!, 0)).not.toThrow()
  expect(existsSync(finished)).toBe(false)
  expect(w.git('worktree', 'list', '--porcelain')).not.toContain(finished)
  expect(out).toContain('Check worktree sweep: removed 1; kept 1.')
})

it('the startup sweep keeps checks that have not ended and names an absent check record', async () => {
  const w = world()
  const running = w.tree(await checkRecord('running'))
  const unknown = w.tree(await checkRecord('unknown'))
  const missing = w.tree('no-record')
  const finished = w.tree(await checkRecord('crashed'))
  const out = await startup(w.home)
  for (const at of [running, unknown, missing]) expect(existsSync(at)).toBe(true)
  expect(out).toContain(`Kept check worktree ${running}:`)
  expect(out).toContain('is recorded as running; only finished or crashed checks are swept.')
  expect(out).toContain('is recorded as unknown; only finished or crashed checks are swept.')
  expect(out).toContain(`Kept check worktree ${missing}: the office cannot find its check record.`)
  expect(existsSync(finished)).toBe(false)
  expect(out).toContain('Check worktree sweep: removed 1; kept 3.')
})

it('a database that is not the office sweeps nothing, even for a check its records say ended', async () => {
  // A world served from a copy of the office's data carries the office's check records and runs on this machine.
  // Its start must not remove the machine's check worktrees. Added by the supervisor when joining round 12.
  database ??= await freshDb()
  const check = database.api.createRecord({ kind: 'session', title: 'Synthetic check', workspaceId: 'default',
    data: { state: 'finished', runtime: 'inspection-tool' }, actor: { type: 'agent', id: 'fixture-inspector' } }).id
  const w = world()
  const finished = w.tree(check)
  const out = await startup(w.home, 'Check worktrees were not swept')
  expect(existsSync(finished)).toBe(true)
  expect(out).toContain('Check worktrees were not swept: this database is not the office')
  expect(out).not.toContain('Check worktree sweep:')
})
