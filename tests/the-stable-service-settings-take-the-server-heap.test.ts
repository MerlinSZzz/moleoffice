// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE STABLE OFFICE'S SERVER HEAP IS A RECORDED SERVICE SETTING, AND ONLY A WHOLE NUMBER OF MEGABYTES IN ITS RANGE.
 *
 * MOLE_OFFICE_SERVER_HEAP_MB is one of the service settings a stable upgrade and a first handoff
 * record. Both validators read every recorded setting through src/config/settings.mjs, so a value
 * outside the range is refused there, with the setting's own sentence, before any process is read.
 * A configuration without the setting is taken as it was before.
 *
 * No upgrade or handoff runs. The upgrade's configuration comes from tests/stable-upgrade-fixture.ts,
 * whose made-up stable office is serving. The first handoff's is a rehearsal of made-up folders and
 * free loopback ports, made as tests/the-stable-bootstrap-refuses-unsafe-config.test.ts makes it.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer, type AddressInfo } from 'node:net'
import { join } from 'node:path'
import { SERVER_HEAP_MB_BOUNDS, readSetting } from '../src/config/settings.mjs'
import { theStableCheckoutFolder } from '../src/config/sandbox-folder.mjs'
import { localStamp } from '../src/shared/time.ts'
import { STABLE_SERVICE_SETTINGS } from '../tools/stable/stable-service-settings.mjs'
import { validateBootstrapConfig } from '../tools/stable/stable-bootstrap-transaction.mjs'
import { validateUpgradeConfig } from '../tools/stable/stable-upgrade-transaction.mjs'
import { copyBootstrapSettings } from './stable-bootstrap-clone-fixture.ts'
import { theFoldersThisFileMakes } from './stable-bootstrap-test-folder.ts'
import { stableUpgradeFixture } from './stable-upgrade-fixture.ts'

const HEAP = 'MOLE_OFFICE_SERVER_HEAP_MB'
const ALLOWED = '12288'
const REFUSED = ['1024', '40000', '12g']

const folders = theFoldersThisFileMakes()
afterEach(() => { folders.removeEveryOne() })

/** What a refusal said, or null when there was none. */
function refusal(attempt: () => unknown): string | null {
  try { attempt(); return null } catch (error) { return (error as Error).message }
}

/** The refusal names the setting, the value and both ends of the range, and is the sentence settings.mjs says for it. */
function expectTheRangeRefusal(said: string | null, value: string): void {
  expect(said, `${HEAP}=${value} was taken`).not.toBeNull()
  expect(said).toContain(HEAP)
  expect(said).toContain(value)
  expect(said).toContain(String(SERVER_HEAP_MB_BOUNDS.fewest))
  expect(said).toContain(String(SERVER_HEAP_MB_BOUNDS.most))
  expect(said).toBe(refusal(() => readSetting(HEAP, { [HEAP]: value })))
}

function git(root: string, ...args: string[]): string {
  const result = spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8', timeout: 15_000,
    env: { PATH: process.env.PATH, HOME: root, LANG: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_OPTIONAL_LOCKS: '0' },
  })
  if (result.status !== 0 || result.error) throw new Error(`Fixture Git failed: ${result.error?.message ?? result.stderr}`)
  return result.stdout.trim()
}

/** A server of this test's own on a free loopback port, closed again before the configuration is read. */
async function aListener(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = createServer()
  await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done) })
  return { port: (server.address() as AddressInfo).port, close: () => new Promise<void>(done => server.close(() => done())) }
}

/** A first handoff's rehearsal configuration for its preparation, with every folder and file made up. */
async function aFirstHandoffConfig() {
  const listeners = await Promise.all([aListener(), aListener(), aListener()])
  const [api, redirect, check] = listeners.map(listener => listener.port) as [number, number, number]
  await Promise.all(listeners.map(listener => listener.close()))
  const folder = folders.make('server-heap')
  const source = join(folder, 'development'), data = join(folder, 'data'), recovery = join(folder, 'recovery'), home = join(folder, 'home')
  for (const path of [source, data, recovery, home]) mkdirSync(path, { mode: 0o700 })
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
  const database = join(data, 'office.db')
  // Not SQLite: the validation reads the file's metadata only.
  writeFileSync(database, 'Synthetic metadata fixture; not SQLite.\n', { mode: 0o600 })
  writeFileSync(join(data, 'keys.json'), '{"fixture":"fresh made-up identity; never a live key"}\n', { mode: 0o600 })
  const identity = { pid: 100001, ppid: 1, pgid: 100000, startTime: '100', groupLeader: { pid: 100000, startTime: '99' }, cwd: source, argv: ['node', 'tools/serve-dev.mjs', '--built'] }
  return {
    version: 1, mode: 'rehearsal', developmentRepository: source, stableCheckout: theStableCheckoutFolder(home), database,
    targetCommit: git(source, 'rev-parse', 'HEAD'), targetTree: git(source, 'rev-parse', 'HEAD^{tree}'),
    candidateTag: `stable-${localStamp(new Date()).slice(0, 10)}-synthetic`,
    evidence: { recordId: 'synthetic-receipt', seq: 1, contentHash: '1234567890abcdef' },
    recoveryRoot: recovery, serviceHome: home,
    serviceSettings: { MOLE_OFFICE_WORKSPACE: 'synthetic', MOLE_OFFICE_MESSAGE_WORKER: 'off', MOLE_OFFICE_API: `http://127.0.0.1:${api}`, MOLE_OFFICE_WEB: `http://127.0.0.1:${redirect}`, MOLE_OFFICE_WEB_PORT: String(redirect), MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES: 'none' } as Record<string, string>,
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
}

it('lists the server heap among the service settings an upgrade and a first handoff record', () => {
  expect(STABLE_SERVICE_SETTINGS).toContain(HEAP)
  expect(STABLE_SERVICE_SETTINGS).not.toContain('NODE_OPTIONS')
})

describe('a stable upgrade', () => {
  // The fixture builds and starts a made-up stable office, about 20 seconds here; the limit leaves room for a slower machine.
  it('refuses a heap outside the range, takes a configuration without one, and takes 12288 the serving office runs with', async () => {
    const f = await stableUpgradeFixture()
    const withTheHeap = (value: string) => ({ ...f.config, serviceSettings: { ...f.config.serviceSettings, [HEAP]: value } })
    for (const value of REFUSED) expectTheRangeRefusal(refusal(() => validateUpgradeConfig(withTheHeap(value))), value)
    expect(refusal(() => validateUpgradeConfig(f.config))).toBeNull()
    // The upgrade compares each recorded setting with the serving office's own, so a heap that office does not run with is refused, and not for its range.
    const notServed = refusal(() => validateUpgradeConfig(withTheHeap(ALLOWED)))
    expect(notServed).toContain(HEAP)
    expect(notServed).not.toContain(String(SERVER_HEAP_MB_BOUNDS.most))
    // The serving office reads the development .env, so a heap written there is the one it runs with.
    appendFileSync(join(f.dev, '.env'), `${HEAP}=${ALLOWED}\n`)
    expect(refusal(() => validateUpgradeConfig(withTheHeap(ALLOWED)))).toBeNull()
  }, 120_000)
})

describe('a first handoff', () => {
  it('refuses a heap outside the range, takes 12288, and takes a configuration without one', async () => {
    const config = await aFirstHandoffConfig()
    const withTheHeap = (value: string) => ({ ...config, serviceSettings: { ...config.serviceSettings, [HEAP]: value } })
    for (const value of REFUSED) expectTheRangeRefusal(refusal(() => validateBootstrapConfig(withTheHeap(value))), value)
    expect(validateBootstrapConfig(withTheHeap(ALLOWED)).config.serviceSettings[HEAP]).toBe(ALLOWED)
    expect(refusal(() => validateBootstrapConfig(config))).toBeNull()
  }, 60_000)
})
