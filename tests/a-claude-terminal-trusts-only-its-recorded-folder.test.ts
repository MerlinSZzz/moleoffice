// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Trust is written before any Claude terminal or run is made. Every path and settings byte here
 * belongs to a made-up home. The concurrent writer uses Claude's mkdir lock protocol, never Claude.
 */
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { chmodSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { trustTheRecordedClaudeFolder } from '../src/server/lib/terminals/claude-folder-trust.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { moleOffice } from '../src/shared/participants.ts'
import { DEFAULT_WORKSPACE } from '../src/shared/workspaces.ts'
import { THE_HOLDER_PROTOCOL } from '../src/config/the-terminal-holder.mjs'

const places: string[] = []
function place() {
  const dir = mkdtempSync(join(tmpdir(), 'claude-trust-'))
  places.push(dir)
  const home = join(dir, 'home'), folder = join(dir, 'project'), file = join(home, '.claude.json')
  mkdirSync(home); mkdirSync(folder)
  return { dir, home, folder, file, env: { HOME: home } }
}
type Place = ReturnType<typeof place>
const trust = (p: Place, folder = p.folder, recordedFolder: string | null = p.folder) => trustTheRecordedClaudeFolder({ folder, recordedFolder, env: p.env })
const bytes = (p: Place) => readFileSync(p.file, 'utf8')
const data = (p: Place) => JSON.parse(bytes(p).replace(/^\uFEFF/, '')) as { projects: Record<string, { hasTrustDialogAccepted: boolean }> }

afterAll(() => { for (const dir of places) rmSync(dir, { recursive: true, force: true }) })

describe('the recorded Claude folder', () => {
  it('creates only one trust entry when there is no settings file', () => {
    const p = place()
    trust(p)
    expect(data(p)).toEqual({ projects: { [p.folder]: { hasTrustDialogAccepted: true } } })
    expect(lstatSync(p.file).mode & 0o777).toBe(0o600)
    expect(readdirSync(p.home)).toEqual(['.claude.json'])
  })

  it('replaces only the false token, keeping all other bytes and permissions', () => {
    const p = place()
    const before = '\uFEFF{\r\n "large": 9007199254740993001, "exponent":1e+02, "escaped":"\\u0061", "unicode":"猫", "projects": {' +
      JSON.stringify(p.folder) + ': {"other": [1,{"keep":"  }  "}], "hasTrustDialogAccepted" : false}, "/another": {"hasTrustDialogAccepted":false}}\r\n}\n'
    writeFileSync(p.file, before); chmodSync(p.file, 0o640)
    const inode = lstatSync(p.file).ino
    trust(p)
    expect(bytes(p)).toBe(before.replace('"hasTrustDialogAccepted" : false', '"hasTrustDialogAccepted" : true'))
    expect(lstatSync(p.file).mode & 0o777).toBe(0o640)
    expect(lstatSync(p.file).ino).not.toBe(inode)
    expect(readdirSync(p.home)).toEqual(['.claude.json'])
  })

  for (const before of ['{ "keep":1e2 \n}', '{"projects": { }, "keep":9007199254740993001}', '{"projects": {"/elsewhere":{"keep":true}}}']) {
    it('inserts a missing entry without rewriting existing tokens: ' + before, () => {
      const p = place(); writeFileSync(p.file, before)
      trust(p)
      expect(data(p).projects[p.folder]?.hasTrustDialogAccepted).toBe(true)
      const after = bytes(p)
      // Deleting the one insertion must recover the entire original byte sequence.
      const insertion = before.includes('"projects"')
        ? (before.includes('"/elsewhere"') ? ',' : '') + JSON.stringify(p.folder) + ':{"hasTrustDialogAccepted":true}'
        : ',"projects":{' + JSON.stringify(p.folder) + ':{"hasTrustDialogAccepted":true}}'
      expect(after.replace(insertion, '')).toBe(before)
    })
  }

  it('adds only the missing trust property to an existing project', () => {
    const p = place(), before = '{"projects":{' + JSON.stringify(p.folder) + ':{ "keep":1e9 \n}}}'
    writeFileSync(p.file, before); trust(p)
    expect(bytes(p).replace(',"hasTrustDialogAccepted":true', '')).toBe(before)
  })

  it('leaves already trusted settings untouched, including inode and modification time', () => {
    const p = place(), before = '{"projects":{' + JSON.stringify(p.folder) + ':{"hasTrustDialogAccepted": true}}}\n'
    writeFileSync(p.file, before); utimesSync(p.file, 100, 100)
    const old = lstatSync(p.file)
    trust(p)
    expect(bytes(p)).toBe(before)
    expect(lstatSync(p.file).ino).toBe(old.ino)
    expect(lstatSync(p.file).mtimeMs).toBe(old.mtimeMs)
  })

  it('trusts only the real target of a recorded symlink, without trusting its parent', () => {
    const p = place(), alias = join(p.dir, 'alias')
    symlinkSync(p.folder, alias)
    expect(trust(p, alias, alias)).toBe(p.folder)
    expect(Object.keys(data(p).projects)).toEqual([p.folder])
  })

  it('refuses a missing folder, a mismatch, an absent recording, root, home and a symlink to home', () => {
    const p = place(), alias = join(p.dir, 'home-alias')
    symlinkSync(p.home, alias)
    for (const [folder, recorded] of [[join(p.dir, 'missing'), join(p.dir, 'missing')], [p.folder, p.home], [p.folder, null], ['/', '/'], [p.home, p.home], [alias, alias]]) {
      expect(() => trust(p, folder!, recorded)).toThrow()
      expect(existsSync(p.file)).toBe(false)
    }
  })

  for (const text of ['{', 'null', '[]', '{"projects":[]}', '{"projects":{},"projects":{}}', '{"projects":{"x":{},"\\u0078":{}}}', '{"bad":NaN}']) {
    it('refuses malformed or ambiguous settings unchanged: ' + text, () => {
      const p = place(); writeFileSync(p.file, text)
      expect(() => trust(p)).toThrow()
      expect(bytes(p)).toBe(text)
      expect(readdirSync(p.home)).toEqual(['.claude.json'])
    })
  }

  it('refuses an ill-typed project, trust value and invalid UTF-8 without changing bytes', () => {
    const p = place()
    for (const value of ['null', '[]', '{"hasTrustDialogAccepted":"false"}']) {
      const before = '{"projects":{' + JSON.stringify(p.folder) + ':' + value + '}}'
      writeFileSync(p.file, before)
      expect(() => trust(p)).toThrow(); expect(bytes(p)).toBe(before)
    }
    const before = Buffer.from([123, 34, 120, 34, 58, 34, 255, 34, 125])
    writeFileSync(p.file, before)
    expect(() => trust(p)).toThrow(); expect(readFileSync(p.file)).toEqual(before)
  })

  it('refuses settings symlinks and hard links, leaving their targets unchanged', () => {
    const p = place(), target = join(p.dir, 'stand-in.json')
    writeFileSync(target, '{}'); symlinkSync(target, p.file)
    expect(() => trust(p)).toThrow(); expect(readFileSync(target, 'utf8')).toBe('{}')
    rmSync(p.file); linkSync(target, p.file)
    expect(() => trust(p)).toThrow(); expect(readFileSync(target, 'utf8')).toBe('{}')
  })

  it('uses the legacy config location when it exists, without touching the newer file', () => {
    const p = place(), legacy = join(p.home, '.claude', '.config.json')
    mkdirSync(join(p.home, '.claude')); writeFileSync(legacy, '{}'); writeFileSync(p.file, '{"keep":1}')
    trust(p)
    expect(JSON.parse(readFileSync(legacy, 'utf8')).projects[p.folder].hasTrustDialogAccepted).toBe(true)
    expect(bytes(p)).toBe('{"keep":1}')
  })

  it('refuses a settings directory symlink, and never steals an old native lock', () => {
    const p = place(), config = join(p.dir, 'config')
    mkdirSync(config); writeFileSync(join(config, '.config.json'), '{}')
    symlinkSync(config, join(p.home, '.claude'))
    expect(() => trust(p)).toThrow()
    expect(readFileSync(join(config, '.config.json'), 'utf8')).toBe('{}')
    rmSync(join(p.home, '.claude'))
    mkdirSync(p.file + '.lock'); utimesSync(p.file + '.lock', 100, 100)
    expect(() => trust(p)).toThrow()
    expect(existsSync(p.file + '.lock')).toBe(true)
    expect(existsSync(p.file)).toBe(false)
  })

  it('accepts a repository root but refuses a native trust key that would cover another folder', () => {
    const p = place(), nested = join(p.folder, 'nested')
    mkdirSync(join(p.folder, '.git')); mkdirSync(nested)
    expect(() => trust(p, nested, nested)).toThrow()
    expect(existsSync(p.file)).toBe(false)
    trust(p)
    expect(Object.keys(data(p).projects)).toEqual([p.folder])
    rmSync(p.file); rmSync(join(p.folder, '.git'), { recursive: true })
    writeFileSync(join(p.folder, '.git'), 'gitdir: /a-made-up-common-checkout/worktrees/linked\n')
    expect(() => trust(p)).toThrow()
    expect(existsSync(p.file)).toBe(false)
  })

  it('removes its staging file and lock if the recorded symlink changes before publication', () => {
    const p = place(), alias = join(p.dir, 'changing-alias')
    symlinkSync(p.folder, alias); writeFileSync(p.file, '{}')
    let reads = 0
    expect(() => trustTheRecordedClaudeFolder({ folder: alias, env: p.env, recordedFolder: () => {
      if (++reads === 2) { rmSync(alias); symlinkSync(p.home, alias) }
      return alias
    } })).toThrow()
    expect(bytes(p)).toBe('{}')
    expect(readdirSync(p.home)).toEqual(['.claude.json'])
  })

  it('publishes nothing if the recorded folder cannot be re-read after staging', () => {
    const p = place(), before = '{ "keep":1e+2 }\n'
    writeFileSync(p.file, before)
    let reads = 0
    expect(() => trustTheRecordedClaudeFolder({ folder: p.folder, env: p.env, recordedFolder: () => {
      if (++reads === 2) throw new Error('stand-in read failure')
      return p.folder
    } })).toThrow()
    expect(bytes(p)).toBe(before)
    expect(readdirSync(p.home)).toEqual(['.claude.json'])
  })

  // Problem i5iWViv0JYRJ: a red in a whole suite said only "changed or its safe writing time elapsed".
  // The words and the limit are read from the module, by name, so this case is red until it exports them.
  it('says which reason ended the locked part, and how long it had held the lock', async () => {
    const theModule: object = await import('../src/server/lib/terminals/claude-folder-trust.ts')
    const limit: unknown = Reflect.get(theModule, 'MAX_LOCKED_MS')
    expect(typeof limit, 'claude-folder-trust.ts exports no MAX_LOCKED_MS').toBe('number')
    for (const [reason, name] of [['slow', 'theLockWasHeldTooLong'], ['moved', 'theLockWasReplaced']] as const) {
      const sentence: unknown = Reflect.get(theModule, name)
      if (typeof sentence !== 'function') throw new Error(`claude-folder-trust.ts exports no ${name}`)
      const p = place(); writeFileSync(p.file, '{}')
      let reads = 0, because = ''
      try {
        trustTheRecordedClaudeFolder({ folder: p.folder, env: p.env, recordedFolder: () => {
          if (++reads === 2) {
            if (reason === 'slow') { const until = performance.now() + (limit as number) + 50; while (performance.now() < until) { /* hold the lock past its limit */ } }
            else { renameSync(p.file + '.lock', p.file + '.lock-moved'); mkdirSync(p.file + '.lock') }
          }
          return p.folder
        } })
      } catch (error) { if (!(error instanceof Error)) throw error; because = error.message }
      const heldMs = Number(/(\d+) ms/.exec(because)?.[1])
      expect(because, `a ${reason} lock was not refused with a held time`).toMatch(/\d+ ms/)
      expect(because, `a ${reason} lock was refused with other words`).toBe((sentence as (ms: number) => string)(heldMs))
      if (reason === 'slow') expect(heldMs, 'the held time is below the limit it is refused for').toBeGreaterThanOrEqual(limit as number)
      expect(bytes(p)).toBe('{}')
    }
  })

  it('coordinates with an active writer using Claude\'s own directory lock, then reads its newest bytes', async () => {
    const p = place(); writeFileSync(p.file, '{}')
    const child = spawn(process.execPath, ['-e', `
      const fs = require('node:fs'), file = process.argv[1];
      fs.mkdirSync(file + '.lock'); process.stdout.write('held');
      const timer = setTimeout(() => process.exit(2), 10000);
      process.stdin.once('data', () => { fs.writeFileSync(file, '{"writer":1e+3}'); fs.rmdirSync(file + '.lock'); clearTimeout(timer); });
    `, p.file], { detached: true, env: { HOME: p.home, PATH: process.env['PATH'] }, stdio: ['pipe', 'pipe', 'pipe'] })
    const group = child.pid
    const reaped = once(child, 'close')
    try {
      await once(child.stdout!, 'data')
      expect(() => trust(p)).toThrow()
      expect(bytes(p)).toBe('{}')
      expect(existsSync(p.file + '.lock')).toBe(true)
      const ended = once(child, 'exit'); child.stdin!.end('release'); await ended
      trust(p)
      expect(bytes(p).replace(',"projects":{' + JSON.stringify(p.folder) + ':{"hasTrustDialogAccepted":true}}', '')).toBe('{"writer":1e+3}')
    } finally {
      if (group !== undefined && child.exitCode === null && child.signalCode === null) {
        try { process.kill(-group, 'SIGTERM') } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
        }
      }
      await reaped
    }
  })
})

const holder = vi.hoisted(() => ({
  reached: vi.fn(() => { throw new Error('stand-in holder reached') }),
  asked: vi.fn(async () => ({ terminals: [] })),
}))
vi.mock('../src/server/lib/terminals.ts', async (original) => ({
  ...await original<typeof import('../src/server/lib/terminals.ts')>(),
  theHolder: holder.reached,
  askTheHolderFor: holder.asked,
}))

describe('the actual agent opening path', () => {
  let db: TestDb, app: Awaited<ReturnType<typeof apiApp>>, p: Place
  let agentId: string
  const saved = new Map<string, string | undefined>()
  const headers = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
  beforeAll(async () => {
    p = place()
    for (const [name, value] of Object.entries({ HOME: p.home, PATH: p.dir + ':' + process.env['PATH'] })) {
      saved.set(name, process.env[name]); process.env[name] = value
    }
    writeFileSync(join(p.dir, 'claude'), '#!/bin/sh\nexit 99\n'); chmodSync(join(p.dir, 'claude'), 0o700)
    db = await freshDb(); app = await apiApp(); await app.app.ready()
    const registered = await app.app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle: 'trust-target', name: 'Trust target', runtime: 'claude-code', role: 'worker' } })
    expect(registered.statusCode).toBe(201)
    agentId = registered.json<{ agent: { id: string } }>().agent.id
    const start = await app.app.inject({ method: 'POST', url: '/api/participants/agent/trust-target/start-folder', headers, payload: { startFolder: p.folder, because: 'a made-up project' } })
    expect(start.statusCode).toBe(200)
    holder.reached.mockClear()
  })
  afterAll(async () => {
    await app?.app.close(); db?.close()
    for (const [name, value] of saved) { if (value === undefined) delete process.env[name]; else process.env[name] = value }
  })
  const open = () => app.app.inject({ method: 'POST', url: '/api/terminals/agents', headers, payload: { agent: 'trust-target' } })
  const runs = () => db.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind='session'").get()
  const keyRows = () => db.client.sqlite.prepare('SELECT count(*) AS n FROM held_keys').get()
  const fileRun = (folder: string, state = 'crashed', extra: Record<string, unknown> = {}) => db.api.createRecord({
    kind: 'session', title: 'A stand-in prior run', workspaceId: DEFAULT_WORKSPACE,
    actor: { type: 'system', id: moleOffice().id },
    data: { state, runtime: 'claude-code', workingDirectory: folder, servingAgent: 'trust-target', servingAgentId: agentId, providerSession: randomUUID(), extra },
  })

  it('fails closed before reaching the holder or making a run if settings are malformed or locked', async () => {
    for (const locked of [false, true]) {
      writeFileSync(p.file, locked ? '{}' : '{')
      if (locked) mkdirSync(p.file + '.lock')
      const before = runs()
      const keys = keyRows()
      const reply = await open()
      expect(reply.statusCode).toBe(409)
      expect(holder.reached).not.toHaveBeenCalled()
      expect(runs()).toEqual(before)
      expect(keyRows()).toEqual(keys)
      if (locked) rmSync(p.file + '.lock', { recursive: true })
    }
  })
  it('records trust before the first holder call, while the run still does not exist', async () => {
    writeFileSync(p.file, '{}')
    const before = runs()
    await open()
    expect(holder.reached).toHaveBeenCalledOnce()
    expect(data(p).projects[p.folder]?.hasTrustDialogAccepted).toBe(true)
    expect(runs()).toEqual(before)
  })

  it('checks trust on a resume, and refuses a historical run in a different folder', async () => {
    fileRun(p.folder)
    writeFileSync(p.file, '{'); holder.reached.mockClear()
    const keys = keyRows(), before = runs()
    const resumed = await app.app.inject({ method: 'POST', url: '/api/terminals/agents', headers, payload: { agent: 'trust-target', resume: true } })
    expect(resumed.statusCode).toBe(409)
    const other = join(p.dir, 'previous-folder'); mkdirSync(other)
    const prior = fileRun(other)
    writeFileSync(p.file, '{}')
    const back = await app.app.inject({ method: 'POST', url: '/api/terminals/agents/trust-target/way-back', headers, payload: { session: prior.id } })
    expect(back.statusCode).toBe(409)
    expect(holder.reached).not.toHaveBeenCalled()
    expect(keyRows()).toEqual(keys)
    expect(bytes(p)).toBe('{}')
    // Only the explicit fixture run above was added; the resume and way-back made none.
    expect(runs()).toEqual({ n: (before as { n: number }).n + 1 })
  })

  it('refuses holder-restart reopening before rotating a key or sending an open request', async () => {
    const prior = fileRun(p.folder, 'running', { inATerminal: { terminal: 'stand-in-terminal', holder: { pid: 1, startedAt: null } } })
    writeFileSync(p.file, '{'); holder.asked.mockClear()
    const keys = keyRows(), before = runs()
    const { reconcileTheAgentsInTerminals } = await import('../src/server/lib/terminal-agents.ts')
    await reconcileTheAgentsInTerminals({ protocol: THE_HOLDER_PROTOCOL, pid: 2, startedAt: null, database: db.file })
    expect(holder.asked).not.toHaveBeenCalled()
    expect(keyRows()).toEqual(keys)
    expect(runs()).toEqual(before)
    expect(db.api.getRecord(prior.id)?.data['state']).toBe('crashed')
  })
})
