// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, linkSync, mkdirSync, readFileSync, readdirSync, renameSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { localStamp } from '../src/shared/time.ts'
import { theStableCheckoutFolder } from '../src/config/sandbox-folder.mjs'
import { theFoldersThisFileMakes } from './stable-bootstrap-test-folder.ts'
import { copyBootstrapSettings } from './stable-bootstrap-clone-fixture.ts'

// A computed URL keeps this criterion-only commit independently compilable.
const implementation = new URL('../tools/stable/stable-bootstrap-transaction.mjs', import.meta.url).href
const execution = new URL('../tools/stable/stable-bootstrap-execution.mjs', import.meta.url).href
const load = () => import(/* @vite-ignore */ implementation)
const folders = theFoldersThisFileMakes()
afterEach(() => { folders.removeEveryOne() })

function refuseThroughCli(f: Awaited<ReturnType<typeof fixture>>, config: unknown, reason: RegExp, extra: Record<string, string> = {}): void {
  const file = join(f.folder, 'private-config.json')
  writeFileSync(file, JSON.stringify(config), { mode: 0o600 })
  const result = spawnSync(process.execPath, [
    '--import', new URL('../node_modules/tsx/dist/loader.mjs', import.meta.url).href,
    fileURLToPath(new URL('../tools/stable/bootstrap-stable.mjs', import.meta.url)), '--config', file, '--prepare', '--dry',
  ], {
    cwd: f.source, encoding: 'utf8', timeout: 15_000,
    env: { PATH: process.env.PATH, HOME: f.home, LANG: 'C', MOLE_OFFICE_DB: f.database, MOLE_OFFICE_PORT: String(f.config.servicePort), ...extra },
  })
  expect(result.error).toBeUndefined()
  expect(result.status, result.stderr).toBe(1)
  expect(result.stderr).toMatch(reason)
  expect(existsSync(join(f.source, 'data'))).toBe(false)
  expect(existsSync(join(f.home, 'data'))).toBe(false)
}

function git(root: string, ...args: string[]): string {
  const result = spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8', timeout: 15_000,
    env: { PATH: process.env.PATH, HOME: root, LANG: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_OPTIONAL_LOCKS: '0' },
  })
  if (result.status !== 0 || result.error) throw new Error(`Fixture Git failed: ${result.error?.message ?? result.stderr}`)
  return result.stdout.trim()
}

async function fixture() {
  const listeners = await Promise.all([aListener(), aListener(), aListener()])
  const [api, redirect, check] = listeners.map(listener => listener.port) as [number, number, number]
  await Promise.all(listeners.map(listener => listener.close()))
  // This is a configuration fixture, not an actual-office rehearsal.
  const folder = folders.make('config')
  const source = join(folder, 'development'), data = join(folder, 'data'), recovery = join(folder, 'recovery'), home = join(folder, 'home')
  for (const path of [source, data, recovery, home]) mkdirSync(path, { mode: 0o700 })
  // The stable checkout goes in its one folder under this made-up home, so its parent must exist.
  mkdirSync(join(home, '.cache', 'mole-office'), { recursive: true, mode: 0o700 })
  copyBootstrapSettings(source)
  writeFileSync(join(source, '.gitignore'), '.env\n.env.*\n')
  git(source, 'init', '-b', 'main')
  git(source, 'remote', 'add', 'origin', '/placeholder/upstream.git')
  git(source, 'config', 'user.name', 'Synthetic bootstrap config')
  git(source, 'config', 'user.email', 'fixture@example.invalid')
  writeFileSync(join(source, 'package.json'), '{"name":"synthetic-bootstrap-config","version":"1.0.0"}\n')
  writeFileSync(join(source, 'package-lock.json'), '{"lockfileVersion":3,"packages":{}}\n')
  git(source, 'add', '.')
  git(source, 'commit', '-m', 'Synthetic configuration fixture')
  writeFileSync(join(source, '.git/info/exclude'), '.env\n')
  writeFileSync(join(source, '.env'), '# SYNTHETIC made-up settings fixture.\n', { mode: 0o600 })
  const database = join(data, 'office.db'), keys = join(data, 'keys.json')
  // These bytes deliberately are not SQLite. Initial config validation reads
  // file metadata only, and must not open an existing database during dry.
  writeFileSync(database, 'Synthetic metadata fixture; not SQLite.\n', { mode: 0o600 })
  writeFileSync(keys, '{"fixture":"fresh made-up identity; never a live key"}\n', { mode: 0o600 })
  const identity = { pid: 100001, ppid: 1, pgid: 100000, startTime: '100', groupLeader: { pid: 100000, startTime: '99' }, cwd: source, argv: ['node', 'tools/serve-dev.mjs', '--built'] }
  const config = {
    version: 1, mode: 'rehearsal', developmentRepository: source, stableCheckout: theStableCheckoutFolder(home), database,
    targetCommit: git(source, 'rev-parse', 'HEAD'), targetTree: git(source, 'rev-parse', 'HEAD^{tree}'),
    candidateTag: `stable-${localStamp(new Date()).slice(0, 10)}-synthetic`,
    evidence: { recordId: 'synthetic-receipt', seq: 1, contentHash: '1234567890abcdef' },
    recoveryRoot: recovery, serviceHome: home, serviceSettings: { MOLE_OFFICE_WORKSPACE: 'synthetic', MOLE_OFFICE_MESSAGE_WORKER: 'off', MOLE_OFFICE_API: `http://127.0.0.1:${api}`, MOLE_OFFICE_WEB: `http://127.0.0.1:${redirect}`, MOLE_OFFICE_WEB_PORT: String(redirect), MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES: 'none' },
    topology: { supervisor: identity, server: { ...identity, pid: 100002, ppid: 100001, pgid: 100002, startTime: '101', groupLeader: { pid: 100002, startTime: '101' }, argv: ['node', '--import', 'tsx', 'src/server/index.ts', '--stop-with-pid=100001'] }, worker: null },
    servicePort: api, listeners: [{ address: '127.0.0.1', port: api, role: 'api' }, { address: '127.0.0.1', port: redirect, role: 'redirect' }], releaseCheckPort: check,
    notices: {
      before: { text: 'Synthetic first handoff. The code stays the same; no feature changes.', approval: { id: 'synthetic-approval', seq: 1, contentHash: '1234567890abcdef' } },
      after: { text: 'Synthetic first handoff verified. The code stayed the same; no feature changed.', approval: { id: 'synthetic-after-approval', seq: 1, contentHash: '1234567890abcdef' } },
    },
    noticeSendIds: { before: 'synthetic-before', after: 'synthetic-after' },
    stopAuthority: null,
    health: { attempts: 10, intervalMs: 50, timeoutMs: 1000, stopTimeoutMs: 10000, commandTimeoutMs: 60000 },
  }
  return { folder, source, data, recovery, home, database, keys, config }
}

/** The configuration with its API, redirect and scratch check ports moved, and its address settings moved with them. */
function onPorts(config: Awaited<ReturnType<typeof fixture>>['config'], ports: { api?: number; redirect?: number; check?: number }) {
  const { api = config.servicePort, redirect = config.listeners[1]!.port, check = config.releaseCheckPort } = ports
  return { ...config, servicePort: api, releaseCheckPort: check,
    listeners: [{ address: '127.0.0.1', port: api, role: 'api' }, { address: '127.0.0.1', port: redirect, role: 'redirect' }],
    serviceSettings: { ...config.serviceSettings, MOLE_OFFICE_API: `http://127.0.0.1:${api}`, MOLE_OFFICE_WEB: `http://127.0.0.1:${redirect}`, MOLE_OFFICE_WEB_PORT: String(redirect) } }
}

/** A valid number outside this configuration's ports; nothing needs to listen on it. */
function outsidePorts(config: Awaited<ReturnType<typeof fixture>>['config']): number {
  const used = new Set([config.servicePort, config.listeners[1]!.port, config.releaseCheckPort])
  let port = 1
  while (used.has(port)) port += 1
  return port
}

/** A server of this test's own on a free loopback port, so that something on this machine listens there. */
async function aListener(port = 0): Promise<{ port: number; close: () => Promise<void> }> {
  const server = createServer()
  await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', done) })
  return { port: (server.address() as AddressInfo).port, close: () => new Promise<void>(done => server.close(() => done())) }
}

function handoffFixture(f: Awaited<ReturnType<typeof fixture>>) {
  const work = join(f.recovery, f.config.candidateTag)
  mkdirSync(work, { mode: 0o700 })
  writeFileSync(join(f.recovery, `${f.config.candidateTag}.journal.jsonl`), '{"synthetic":"metadata-only PREPARED fixture"}\n', { mode: 0o600 })
  const path = join(work, 'prepared-state.json')
  writeFileSync(path, '{"synthetic":"not an actual prepared handoff"}\n', { mode: 0o600 })
  return { ...f.config, stopAuthority: { kind: 'owner-decision', decision: { id: 'synthetic-stop', seq: 1, contentHash: '1234567890abcdef' } },
    prepared: { path, sha256Base64: Buffer.alloc(32, 7).toString('base64'), event: { id: 'synthetic-prepared', seq: 1, contentHash: '1234567890abcdef' } } }
}

const literally = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const refusedBy = (rule: 'a' | 'b', port: number) => new RegExp(`rule \\(${rule}\\) refused port ${port}\\b`)
const keepingClear = (ports: string) => ({ env: { MOLE_OFFICE_REHEARSAL_KEEP_CLEAR_PORTS: ports } })

describe('first-handoff configuration', () => {
  it('validates with its own ports while another configuration has an occupied API port', async () => {
    const { validateBootstrapConfig } = await load()
    const first = await fixture(), held = await aListener(first.config.servicePort)
    try {
      const second = await fixture()
      expect(second.config.servicePort).not.toBe(held.port)
      expect(validateBootstrapConfig(second.config).config.targetCommit).toBe(second.config.targetCommit)
    } finally { await held.close() }
  })

  it('validates the equal source commit without opening SQLite or creating stable', async () => {
    const { validateBootstrapConfig } = await load()
    const f = await fixture(), before = readFileSync(f.database)
    const valid = validateBootstrapConfig(f.config)
    expect(valid.config.targetCommit).toBe(git(f.source, 'rev-parse', 'HEAD'))
    expect(valid.config.targetTree).toBe(git(f.source, 'rev-parse', 'HEAD^{tree}'))
    expect(Object.isFrozen(valid.config)).toBe(true)
    expect(readFileSync(f.database)).toEqual(before)
    expect(readdirSync(f.data).sort()).toEqual(['keys.json', 'office.db'])
    expect(existsSync(f.config.stableCheckout)).toBe(false)
    expect(git(f.source, 'branch', '--list', 'stable')).toBe('')
    expect(() => validateBootstrapConfig({ ...f.config, targetTree: 'a'.repeat(40) })).toThrow(/tree/i)
  })

  it('refuses a relative or missing database without creating database companions', async () => {
    const { validateBootstrapConfig } = await load()
    const f = await fixture(), before = readdirSync(f.data).sort()
    for (const database of ['office.db', join(f.data, 'absent.db')]) {
      expect(() => validateBootstrapConfig({ ...f.config, database })).toThrow(/database/i)
      refuseThroughCli(f, { ...f.config, database }, /database/i)
    }
    expect(readdirSync(f.data).sort()).toEqual(before)
    expect(existsSync(f.config.stableCheckout)).toBe(false)
  })

  it('refuses missing adjacent keys without regenerating an identity', async () => {
    const { validateBootstrapConfig } = await load()
    const f = await fixture()
    renameSync(f.keys, join(f.data, 'retained-fixture-keys.json'))
    expect(() => validateBootstrapConfig(f.config)).toThrow(/keys\.json/i)
    refuseThroughCli(f, f.config, /keys\.json/i)
    expect(existsSync(f.keys)).toBe(false)
    expect(existsSync(f.config.stableCheckout)).toBe(false)
    expect(readFileSync(f.database, 'utf8')).toContain('not SQLite')
  })

  it('accepts an original owner decision pin as the evidence and refuses every other evidence shape', async () => {
    const { validateBootstrapConfig } = await load()
    const f = await fixture()
    const decision = { id: 'synthetic-evidence-decision', seq: 1, contentHash: '1234567890abcdef' }
    expect(validateBootstrapConfig({ ...f.config, evidence: { kind: 'owner-decision', decision } }).config.evidence).toEqual({ kind: 'owner-decision', decision })
    for (const evidence of [{ kind: 'owner-decision' }, { kind: 'owner-decision', decision: { ...decision, seq: 2 } }, { kind: 'owner-decision', decision, recordId: decision.id },
      { kind: 'another-kind', decision }, { ...f.config.evidence, kind: 'owner-decision' }]) {
      expect(() => validateBootstrapConfig({ ...f.config, evidence })).toThrow(/Evidence/)
    }
  })

  it('refuses secret overrides unknown fields aliases and overlapping recovery storage', async () => {
    const { validateBootstrapConfig } = await load()
    const f = await fixture()
    expect(() => validateBootstrapConfig({ ...f.config, surprise: true })).toThrow(/unknown/i)
    expect(() => validateBootstrapConfig({ ...f.config, serviceSettings: { ...f.config.serviceSettings, OPENAI_API_KEY: 'synthetic-do-not-inherit' } })).toThrow(/unknown|allowlist|setting/i)
    const alias = join(f.folder, 'source-alias')
    symlinkSync(f.source, alias)
    expect(() => validateBootstrapConfig({ ...f.config, developmentRepository: alias })).toThrow(/canonical|alias/i)
    const nested = join(f.source, 'private')
    mkdirSync(nested, { mode: 0o700 })
    expect(() => validateBootstrapConfig({ ...f.config, recoveryRoot: nested })).toThrow(/separate|overlap/i)
    chmodSync(f.recovery, 0o755)
    expect(() => validateBootstrapConfig(f.config)).toThrow(/0700|private/i)
  })

  it('refuses changed source dirty work and existing stable refs before mutation', async () => {
    const { validateBootstrapConfig } = await load()
    const f = await fixture()
    writeFileSync(join(f.source, 'untracked.txt'), 'synthetic dirty source')
    expect(() => validateBootstrapConfig(f.config)).toThrow(/dirty|clean/i)
    renameSync(join(f.source, 'untracked.txt'), join(f.folder, 'retained-untracked.txt'))
    git(f.source, 'branch', 'stable')
    expect(() => validateBootstrapConfig(f.config)).toThrow(/stable.*exist|exist.*stable/i)
    // Separate fixtures retain every rejected branch/tag rather than deleting it.
    const tagged = await fixture()
    git(tagged.source, 'tag', tagged.config.candidateTag)
    expect(() => validateBootstrapConfig(tagged.config)).toThrow(/tag.*exist|exist.*tag/i)
    const moved = await fixture()
    git(moved.source, 'commit', '--allow-empty', '-m', 'Synthetic source advancement')
    expect(() => validateBootstrapConfig(moved.config)).toThrow(/HEAD|commit|source/i)
  })

  it('refuses non-loopback rehearsal listeners duplicate ports and malformed recorded identities', async () => {
    const { validateBootstrapConfig } = await load()
    const f = await fixture()
    expect(() => validateBootstrapConfig({ ...f.config, listeners: [{ ...f.config.listeners[0], address: '0.0.0.0' }, f.config.listeners[1]] })).toThrow(/loopback/i)
    expect(() => validateBootstrapConfig({ ...f.config, releaseCheckPort: f.config.listeners[0]!.port })).toThrow(/port/i)
    expect(() => validateBootstrapConfig({ ...f.config, topology: { ...f.config.topology, supervisor: { ...f.config.topology.supervisor, startTime: '' } } })).toThrow(/identity|startTime/i)
    expect(() => validateBootstrapConfig({ ...f.config, topology: { ...f.config.topology, server: { ...f.config.topology.server, pid: f.config.topology.supervisor.pid } } })).toThrow(/identity|duplicate|distinct/i)
    expect(() => validateBootstrapConfig({ ...f.config, topology: { ...f.config.topology, supervisor: { ...f.config.topology.supervisor, argv: ['node', 'unrelated.mjs'] } } })).toThrow(/argv|serve-dev/i)
  })

  it('refuses a development checkout on another branch at the same exact commit', async () => {
    const { validateBootstrapConfig } = await load()
    const f = await fixture()
    git(f.source, 'switch', '-c', 'same-commit-other-branch')
    expect(git(f.source, 'rev-parse', 'HEAD')).toBe(f.config.targetCommit)
    expect(() => validateBootstrapConfig(f.config)).toThrow(/branch|refs\/heads\/main/i)
    expect(existsSync(f.config.stableCheckout)).toBe(false)
  })

  it('refuses a rehearsal data directory that is not private mode 0700', async () => {
    const { validateBootstrapConfig } = await load()
    const f = await fixture()
    chmodSync(f.data, 0o755)
    expect(() => validateBootstrapConfig(f.config)).toThrow(/data.*0700|0700.*data|private.*data|data.*private/i)
    expect(existsSync(f.config.stableCheckout)).toBe(false)
    expect(readdirSync(f.data).sort()).toEqual(['keys.json', 'office.db'])
  })

  it('refuses a stable checkout anywhere but its one folder under serviceHome, the folder the sandbox launcher refuses', async () => {
    const { validateBootstrapConfig } = await load()
    const f = await fixture(), elsewhere = join(f.folder, 'stable')
    expect(validateBootstrapConfig(f.config).config.stableCheckout).toBe(theStableCheckoutFolder(f.home))
    const named = new RegExp(`stableCheckout must be ${literally(theStableCheckoutFolder(f.home))}\\b.*names ${literally(elsewhere)}\\.`)
    expect(() => validateBootstrapConfig({ ...f.config, stableCheckout: elsewhere })).toThrow(named)
    refuseThroughCli(f, { ...f.config, stableCheckout: elsewhere }, named)
    // The same folder under a home the stable office does not start with.
    const otherHome = join(f.folder, 'other-home')
    mkdirSync(join(otherHome, '.cache', 'mole-office'), { recursive: true, mode: 0o700 })
    expect(() => validateBootstrapConfig({ ...f.config, stableCheckout: theStableCheckoutFolder(otherHome) })).toThrow(/stableCheckout must be /)
    // A path the rules before it refuse keeps their reason.
    expect(() => validateBootstrapConfig({ ...f.config, stableCheckout: 'stable' })).toThrow(/canonical absolute destination/)
    for (const path of [elsewhere, f.config.stableCheckout, theStableCheckoutFolder(otherHome)]) expect(existsSync(path)).toBe(false)
  })

  it('refuses a rehearsal port something on this machine already listens on, by rule (a)', async () => {
    const { validateBootstrapConfig } = await load()
    const f = await fixture(), held = await aListener()
    try {
      // This test's own process holds the port, and the recorded topology does not name it.
      expect(() => validateBootstrapConfig(onPorts(f.config, { check: held.port }), { env: {} })).toThrow(refusedBy('a', held.port))
      expect(() => validateBootstrapConfig(onPorts(f.config, { redirect: held.port }), { env: {} })).toThrow(refusedBy('a', held.port))
      refuseThroughCli(f, onPorts(f.config, { check: held.port }), refusedBy('a', held.port))
      // The throwaway office's own listener is not refused: a process the topology records may hold a listener port.
      const own = onPorts(f.config, { api: held.port })
      own.topology = { ...own.topology, server: { ...own.topology.server, pid: process.pid } }
      expect(validateBootstrapConfig(own, { env: {} }).config.servicePort).toBe(held.port)
      // Two ports refused by two rules are both named, each with its rule.
      let said = ''
      try { validateBootstrapConfig(onPorts(f.config, { check: held.port }), keepingClear(String(f.config.listeners[1]!.port))) } catch (error) { said = (error as Error).message }
      expect(said).toMatch(refusedBy('a', held.port))
      expect(said).toMatch(refusedBy('b', f.config.listeners[1]!.port))
    } finally { await held.close() }
    // Once nothing listens there, the same configuration passes, so the refusal was the listener's.
    expect(validateBootstrapConfig(onPorts(f.config, { check: held.port }), { env: {} }).config.releaseCheckPort).toBe(held.port)
    expect(existsSync(f.config.stableCheckout)).toBe(false)
  })

  it('refuses a scratch check port held even by a process the topology records, by rule (a)', async () => {
    const { validateBootstrapConfig } = await load()
    const f = await fixture(), held = await aListener()
    // This test's own process holds the port and is recorded as the throwaway office's server.
    const recorded = (config: ReturnType<typeof onPorts>) => ({ ...config, topology: { ...config.topology, server: { ...config.topology.server, pid: process.pid } } })
    try {
      // A listener port may be held by a recorded process, so the same holder passes as the redirect listener.
      expect(validateBootstrapConfig(recorded(onPorts(f.config, { redirect: held.port })), { env: {} }).config.listeners[1].port).toBe(held.port)
      // The scratch check port may be held by nothing, not even by a recorded process.
      expect(() => validateBootstrapConfig(recorded(onPorts(f.config, { check: held.port })), { env: {} })).toThrow(refusedBy('a', held.port))
      refuseThroughCli(f, recorded(onPorts(f.config, { check: held.port })), refusedBy('a', held.port))
    } finally { await held.close() }
    expect(existsSync(f.config.stableCheckout)).toBe(false)
  })

  it('refuses a port its caller names to keep clear, by rule (b)', async () => {
    const { validateBootstrapConfig } = await load()
    const f = await fixture()
    const check = f.config.releaseCheckPort, redirect = f.config.listeners[1]!.port
    // A different configured port gives the keep-clear list a harmless non-matching entry.
    expect(() => validateBootstrapConfig(f.config, keepingClear(String(check)))).toThrow(refusedBy('b', check))
    expect(() => validateBootstrapConfig(f.config, keepingClear(`${check}, ${redirect}`))).toThrow(refusedBy('b', redirect))
    expect(() => validateBootstrapConfig(f.config, keepingClear(`${check},no-port`))).toThrow(/"no-port".*not a port/)
    for (const env of [{}, { MOLE_OFFICE_REHEARSAL_KEEP_CLEAR_PORTS: '' }, { MOLE_OFFICE_REHEARSAL_KEEP_CLEAR_PORTS: String(outsidePorts(f.config)) }]) {
      expect(validateBootstrapConfig(f.config, { env }).config.releaseCheckPort).toBe(check)
    }
    refuseThroughCli(f, f.config, refusedBy('b', check), { MOLE_OFFICE_REHEARSAL_KEEP_CLEAR_PORTS: String(check) })
    expect(existsSync(f.config.stableCheckout)).toBe(false)
  })

  it('validates live preparation without creating stable refs or recovery entries', async () => {
    const { validateBootstrapConfig } = await load()
    const f = await fixture(), recoveryBefore = readdirSync(f.recovery)
    expect(validateBootstrapConfig(f.config).liveBlocked).toBeNull()
    expect(validateBootstrapConfig({ ...f.config, mode: 'live' }).liveBlocked).toBeNull()
    expect(existsSync(f.config.stableCheckout)).toBe(false)
    expect(git(f.source, 'branch', '--list', 'stable')).toBe('')
    expect(git(f.source, 'tag', '--list', f.config.candidateTag)).toBe('')
    expect(readdirSync(f.recovery)).toEqual(recoveryBefore)
  })

  it('blocks live handoff with the ordinary upgrade storage refusal', async () => {
    const { validateBootstrapConfig } = await load()
    const f = await fixture()
    git(f.source, 'worktree', 'add', '-b', 'stable', '--', f.config.stableCheckout, f.config.targetCommit)
    git(f.source, 'worktree', 'lock', '--reason', 'synthetic prepared source', f.config.stableCheckout)
    git(f.source, 'tag', f.config.candidateTag)
    const work = join(f.recovery, f.config.candidateTag)
    mkdirSync(work, { mode: 0o700 })
    writeFileSync(join(f.recovery, `${f.config.candidateTag}.journal.jsonl`), '{"synthetic":"metadata-only PREPARED fixture"}\n', { mode: 0o600 })
    const preparedPath = join(work, 'prepared-state.json')
    writeFileSync(preparedPath, '{"synthetic":"not an actual prepared handoff"}\n', { mode: 0o600 })
    const handoff = { ...f.config,
      stopAuthority: { kind: 'owner-decision', decision: { id: 'synthetic-stop', seq: 1, contentHash: '1234567890abcdef' } },
      prepared: { path: preparedPath, sha256Base64: Buffer.alloc(32, 7).toString('base64'), event: { id: 'synthetic-prepared', seq: 1, contentHash: '1234567890abcdef' } },
    }
    expect(validateBootstrapConfig({ ...handoff, mode: 'live' }, { phase: 'handoff' }).liveBlocked).toBe(
      'Live handoff is refused because the ordinary upgrade would refuse this stable checkout: "Stable must have independent Git storage, not a shared worktree."',
    )
    expect(() => validateBootstrapConfig(handoff, { phase: 'handoff' })).toThrow(/independent Git storage/)
    const independent = await fixture()
    const { cloneBootstrapStableCheckout, createBootstrapDatedTag } = await import(/* @vite-ignore */ execution)
    cloneBootstrapStableCheckout(independent.config); createBootstrapDatedTag(independent.config)
    expect(validateBootstrapConfig({ ...handoffFixture(independent), mode: 'live' }, { phase: 'handoff' }).liveBlocked).toBeNull()
  })

  it('shares the upgrade storage rule for linked worktrees alternates and independent clones', async () => {
    const storageModule = new URL('../tools/independent-storage.mjs', import.meta.url).href
    const { requireStorageTheUpgradeAccepts } = await import(/* @vite-ignore */ storageModule)
    const f = await fixture(), readGit = (root: string, args: string[]) => git(root, ...args)
    git(f.source, 'worktree', 'add', '-b', 'stable', '--', f.config.stableCheckout, f.config.targetCommit)
    git(f.source, 'worktree', 'lock', '--reason', 'synthetic prepared source', f.config.stableCheckout)
    expect(() => requireStorageTheUpgradeAccepts(f.source, f.config.stableCheckout, readGit)).toThrow('Stable must have independent Git storage, not a shared worktree.')
    const independent = join(f.folder, 'independent')
    git(f.folder, 'clone', '--no-local', '--', f.source, independent)
    expect(existsSync(join(independent, '.git/objects/info/alternates'))).toBe(false)
    expect(() => requireStorageTheUpgradeAccepts(f.source, independent, readGit)).not.toThrow()
    for (const root of [f.source, independent]) {
      // Each alternate is in a separate fixture clone, leaving the accepted pair untouched.
      const alternate = join(f.folder, root === f.source ? 'development-alternates' : 'stable-alternates')
      git(f.folder, 'clone', '--no-local', '--', root, alternate)
      writeFileSync(join(alternate, '.git/objects/info/alternates'), `${join(root, '.git/objects')}\n`)
      expect(() => requireStorageTheUpgradeAccepts(root === f.source ? alternate : f.source, root === f.source ? independent : alternate, readGit)).toThrow('Shared Git object alternates are refused.')
    }
    const object = join(independent, '.git/objects/synthetic-object')
    writeFileSync(object, 'Synthetic object inode; never read as a Git object.\n')
    linkSync(object, join(f.folder, 'external-object-name'))
    expect(() => requireStorageTheUpgradeAccepts(f.source, independent, readGit)).toThrow(/hard links/)
  })

  it('refuses rehearsal address overrides pointing outside its own loopback listeners', async () => {
    const { validateBootstrapConfig } = await load()
    const f = await fixture(), outside = outsidePorts(f.config)
    for (const [name, value] of [
      // A port this configuration does not have, and a documentation address.
      ['MOLE_OFFICE_API', `http://127.0.0.1:${outside}`], ['MOLE_OFFICE_WEB', `http://127.0.0.1:${outside}`],
      ['MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES', '192.0.2.1'], ['MOLE_OFFICE_WEB_PORT', String(outside)],
    ]) {
      expect(() => validateBootstrapConfig({ ...f.config, serviceSettings: { ...f.config.serviceSettings, [name!]: value } })).toThrow(/rehearsal|loopback|listener|port/i)
    }
    expect(existsSync(f.config.stableCheckout)).toBe(false)
  })

  it('refuses post-preparation tracked staged or untracked stable source before handoff', async () => {
    const { validateBootstrapConfig } = await load()
    for (const change of ['tracked', 'staged', 'untracked']) {
      const f = await fixture()
      const { cloneBootstrapStableCheckout, createBootstrapDatedTag } = await import(/* @vite-ignore */ execution)
      cloneBootstrapStableCheckout(f.config); createBootstrapDatedTag(f.config)
      const work = join(f.recovery, f.config.candidateTag)
      mkdirSync(work, { mode: 0o700 })
      writeFileSync(join(f.recovery, `${f.config.candidateTag}.journal.jsonl`), '{"synthetic":"metadata-only PREPARED fixture"}\n', { mode: 0o600 })
      const preparedPath = join(work, 'prepared-state.json')
      writeFileSync(preparedPath, '{"synthetic":"not an actual prepared handoff"}\n', { mode: 0o600 })
      const handoff = { ...f.config,
        stopAuthority: { kind: 'owner-decision', decision: { id: 'synthetic-stop', seq: 1, contentHash: '1234567890abcdef' } },
        prepared: { path: preparedPath, sha256Base64: Buffer.alloc(32, 7).toString('base64'), event: { id: 'synthetic-prepared', seq: 1, contentHash: '1234567890abcdef' } },
      }
      expect(validateBootstrapConfig(handoff, { phase: 'handoff' }).config.targetCommit).toBe(f.config.targetCommit)
      const path = join(f.config.stableCheckout, change === 'untracked' ? 'unexpected-source.mjs' : 'package.json')
      writeFileSync(path, change === 'untracked' ? '// Synthetic untracked executable source.\n' : '{"name":"synthetic-source-edit","version":"1.0.0"}\n')
      if (change === 'staged') git(f.config.stableCheckout, 'add', 'package.json')
      expect(() => validateBootstrapConfig(handoff, { phase: 'handoff' })).toThrow(/stable.*(dirty|clean)|(?:dirty|clean).*stable/i)
      expect(git(f.source, 'rev-parse', 'HEAD')).toBe(f.config.targetCommit)
    }
  })

  it('refuses a rehearsal that omits an explicit local launch address override', async () => {
    const { validateBootstrapConfig } = await load()
    const f = await fixture()
    for (const name of ['MOLE_OFFICE_API', 'MOLE_OFFICE_WEB', 'MOLE_OFFICE_WEB_PORT', 'MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES']) {
      const serviceSettings: Record<string, string> = { ...f.config.serviceSettings }
      delete serviceSettings[name]
      expect(() => validateBootstrapConfig({ ...f.config, serviceSettings })).toThrow(/explicit|override|required/i)
    }
    expect(existsSync(f.config.stableCheckout)).toBe(false)
  })
  it('requires one existing ordinary main settings file', async () => {
    const { validateBootstrapConfig } = await load()
    for (const kind of ['missing', 'directory', 'link']) {
      const f = await fixture(), settings = join(f.source, '.env'), retained = join(f.folder, 'retained-synthetic.env')
      renameSync(settings, retained)
      if (kind === 'directory') mkdirSync(settings)
      if (kind === 'link') symlinkSync(retained, settings)
      expect(() => validateBootstrapConfig(f.config), kind).toThrow(/settings|\.env|ordinary/i)
      expect(existsSync(f.config.stableCheckout)).toBe(false)
    }
  })

  it('refuses every stable local settings candidate including dangling links', async () => {
    const helper = new URL('../tools/stable/stable-bootstrap-launcher.mjs', import.meta.url).href
    const { verifyBootstrapSettingsSource } = await import(/* @vite-ignore */ helper)
    for (const kind of ['ordinary', 'same-file', 'dangling']) {
      const f = await fixture()
      const { cloneBootstrapStableCheckout } = await import(/* @vite-ignore */ execution)
      cloneBootstrapStableCheckout(f.config)
      expect(() => verifyBootstrapSettingsSource(f.config, { prepared: true })).not.toThrow()
      const local = join(f.config.stableCheckout, '.env')
      if (kind === 'ordinary') writeFileSync(local, '# SYNTHETIC second settings candidate.\n')
      else symlinkSync(kind === 'same-file' ? join(f.source, '.env') : join(f.folder, 'absent-synthetic.env'), local)
      expect(() => verifyBootstrapSettingsSource(f.config, { prepared: true }), kind).toThrow(/settings|\.env|candidate/i)
    }
  })

  it('refuses prepare without a development origin', async () => {
    const { validateBootstrapConfig } = await load()
    const f = await fixture()
    git(f.source, 'remote', 'remove', 'origin')
    expect(() => validateBootstrapConfig(f.config)).toThrow(/origin/i)
    expect(existsSync(f.config.stableCheckout)).toBe(false)
    expect(readdirSync(f.recovery)).toEqual([])
  })

  it('refuses prepare and handoff when development already names a stable checkout', async () => {
    const { validateBootstrapConfig } = await load()
    const { cloneBootstrapStableCheckout, createBootstrapDatedTag } = await import(/* @vite-ignore */ execution)
    const f = await fixture()
    writeFileSync(join(f.source, '.env'), `# Synthetic preexisting pairing.\nMOLE_OFFICE_STABLE_CHECKOUT=${f.config.stableCheckout}\n`)
    expect(() => validateBootstrapConfig(f.config)).toThrow(/MOLE_OFFICE_STABLE_CHECKOUT|already.*pair/i)
    cloneBootstrapStableCheckout(f.config); createBootstrapDatedTag(f.config)
    expect(() => validateBootstrapConfig(handoffFixture(f), { phase: 'handoff' })).toThrow(/MOLE_OFFICE_STABLE_CHECKOUT|already.*pair/i)
  })

})
