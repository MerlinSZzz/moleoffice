// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Small per-step stand-ins. The separate actual-office file proves the real topology. */
import { afterEach, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { copyFileSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { localStamp } from '../src/shared/time.ts'
import { versionOf } from '../src/server/lib/version.ts'
import { theFoldersThisFileMakes } from './stable-bootstrap-test-folder.ts'

const folders = theFoldersThisFileMakes()
const modulePath = new URL('../tools/stable/stable-bootstrap-execution.mjs', import.meta.url).href
const dependency = (name: string) => new URL(`../tools/${name}`, import.meta.url).pathname
const settingsPath = new URL('../src/config/settings.mjs', import.meta.url).pathname
const backupPath = new URL('../src/server/lib/backup.ts', import.meta.url).pathname
const commit = 'a'.repeat(40), tree = 'b'.repeat(40)
const pin = { id: 'synthetic-original', seq: 1, contentHash: 'c'.repeat(16) }
export type Event = { step: string; phase: string }
/**
 * THE MADE-UP ELECTRON BINARY. This fixture runs no command. So when the bootstrap's step fetch-electron-binary starts
 * its group, the stand-in writes what the electron package's install.js would write in the stable checkout:
 * node_modules/electron/path.txt, naming THE_MADE_UP_ELECTRON_BINARY, and that file in node_modules/electron/dist,
 * holding THE_MADE_UP_ELECTRON_BYTES. The name and the bytes are made up. They are no program, and nothing is
 * downloaded. A test that calls writeNoElectronPath() gets no path.txt.
 */
export const THE_MADE_UP_ELECTRON_BINARY = 'synthetic-electron'
export const THE_MADE_UP_ELECTRON_BYTES = 'Synthetic per-step stand-in for the Electron binary. Nothing was downloaded.\n'

afterEach(() => {
  vi.doUnmock(dependency('stable/stable-bootstrap-support.mjs')); vi.doUnmock(dependency('stable/stable-bootstrap-storage.mjs'))
  vi.doUnmock(dependency('stable/stable-bootstrap-processes.mjs')); vi.doUnmock(dependency('stable/stable-bootstrap-notices.mjs'))
  vi.doUnmock(dependency('stable/stable-upgrade-evidence.mjs')); vi.doUnmock(dependency('read-only-git-config.mjs')); vi.doUnmock(dependency('stable/stable-bootstrap-launcher.mjs')); vi.doUnmock(dependency('database-holders.mjs'))
  vi.doUnmock(settingsPath); vi.doUnmock(backupPath); vi.resetModules()
  folders.removeEveryOne()
})

export async function fixture(faults: Event[] = [], mismatch: 'missing-publication' | 'unexpected-publication' | 'missing-recovery' | 'unexpected-recovery' | null = null, authorityError: string | null = null, corruptBackup = false) {
  vi.resetModules()
  const folder = folders.make('isolated-steps'), dev = join(folder, 'development'), stable = join(folder, 'stable'), recovery = join(folder, 'recovery'), data = join(folder, 'data')
  for (const path of [dev, recovery, data]) mkdirSync(path, { mode: 0o700 })
  const envFile = join(dev, '.env')
  const originalEnv = Buffer.from('# Synthetic settings with comments.\r\nMOLE_OFFICE_DB=data/example.db\r\n\r\n# Keep every other byte.\r\n')
  writeFileSync(envFile, originalEnv, { mode: 0o640 })
  const envHash = () => createHash('sha256').update(readFileSync(envFile)).digest('hex')
  const database = join(data, 'office.sqlite')
  writeFileSync(database, 'Synthetic per-step SQLite stand-in.\n', { mode: 0o600 }); writeFileSync(join(data, 'keys.json'), 'Synthetic per-step key metadata only.\n', { mode: 0o600 })
  const candidateTag = `stable-${localStamp(new Date()).slice(0, 10)}-isolated`, work = join(recovery, candidateTag)
  const paths = { lock: join(recovery, 'stable-bootstrap.lock'), journal: join(recovery, `${candidateTag}.journal.jsonl`), noticeJournal: join(recovery, `${candidateTag}.notices.jsonl`), work }
  const recorded = (pid: number, cwd = dev) => ({ pid, ppid: 10, pgid: pid, startTime: '1', groupLeader: { pid, startTime: '1' }, cwd, argv: ['node', 'tools/serve-dev.mjs', '--built'] })
  const topology = { supervisor: recorded(100), server: recorded(101), worker: mismatch?.startsWith('missing') ? recorded(102) : null }
  const c: any = { version: 1, mode: 'rehearsal', developmentRepository: dev, stableCheckout: stable, database, targetCommit: commit, targetTree: tree, candidateTag, recoveryRoot: recovery, serviceHome: join(folder, 'home'), serviceSettings: { TZ: 'UTC' }, topology, servicePort: 41111, releaseCheckPort: 41112, listeners: [{ address: '127.0.0.1', port: 41111, role: 'api' }, { address: '127.0.0.1', port: 41113, role: 'redirect' }], evidence: { recordId: pin.id, seq: 1, contentHash: pin.contentHash }, notices: { before: { text: 'Synthetic before words.', approval: pin }, after: { text: 'Synthetic after words.', approval: pin } }, noticeSendIds: { before: 'synthetic-before', after: 'synthetic-after' }, stopAuthority: null, health: { attempts: 1, intervalMs: 1, timeoutMs: 100, stopTimeoutMs: 100, commandTimeoutMs: 100 } }
  const events: Event[] = [], groups: any[] = [], artifacts = { paths: [], plugins: ['example'], identities: {} }
  const settingsChecks: Array<{ prepared: boolean; paired: boolean; expectRefusal: boolean; line: boolean; sha256: string; serving: string | null }> = []
  let rejectPairedProof = false, electronWritesNoPath = false
  let serving: string | null = dev, check: any = null, nextPid = 200, original: any = null
  const remainingFaults = [...faults]
  let faultsArmed = true
  let ordinaryName: string | null = null
  const workerStarted = () => {
    const mismatches = mismatch?.endsWith(ordinaryName === 'recover-development' ? 'recovery' : 'publication') && ordinaryName !== null
    return mismatches ? topology.worker === null : topology.worker !== null
  }
  const onStep = (event: Event) => {
    events.push({ step: event.step, phase: event.phase })
    if (event.step === 'pair-development-with-stable' && event.phase === 'before' && serving !== null) throw new Error('Pairing ran before the original stopped.')
    if (faultsArmed && corruptBackup && event.step === 'pair-development-with-stable' && event.phase === 'after') writeFileSync(`${envFile}.before-${candidateTag}`, 'Synthetic corrupted backup.\n')
    const at = faultsArmed ? remainingFaults.findIndex(f => f.step === event.step && f.phase === event.phase) : -1
    if (at >= 0) { remainingFaults.splice(at, 1); throw new Error(`Synthetic injected ${event.step}/${event.phase}`) }
  }
  const emptyCheck = { holders: [], setAside: [], otherUsersUnreadable: 0, unnamedLocks: [] }
  const madeUpBytes = { sha256: 'made-up sha256 for this fixture', size: 0, wal: { exists: false, size: null }, shm: { exists: false, size: null }, journal: { exists: false, size: null } }
  // Made-up guard values: this per-step fixture never opens a real database.
  vi.doMock(dependency('database-holders.mjs'), () => ({
    theDatabaseHolders: () => structuredClone(emptyCheck),
    theExclusiveLockGuard: async () => ({ taken: true, before: structuredClone(madeUpBytes), after: structuredClone(madeUpBytes) }),
  }))
  const actualSupport = await import(/* @vite-ignore */ dependency('stable/stable-bootstrap-support.mjs'))
  vi.doMock(dependency('stable/stable-bootstrap-support.mjs'), () => ({ ...actualSupport,
    bootstrapGit: (root: string, args: string[]) => {
      if (args[0] === 'clone') mkdirSync(stable, { mode: 0o700 })
      if (args[0] === 'remote') return args[1] === 'get-url' ? '/placeholder/origin.git' : 'origin'
      if (args[0] === 'rev-parse') return args.some(word => word.includes('tree')) ? tree : commit
      if (args[0] === 'symbolic-ref') return root === stable ? 'refs/heads/stable' : 'refs/heads/main'
      return ''
    },
    verifyLocalTopology: (value: any) => { if (serving !== value.developmentRepository) throw new Error('Synthetic exact ordinary topology is absent.') },
    inspectNamedProcess: (identity: any) => { if (!serving || (identity.pid === 100 && serving !== dev)) throw new Error('Synthetic original process is absent.'); return identity },
    bootstrapProcessIdentity: (pid: number) => ({ ...recorded(pid), state: serving || check ? 'S' : 'Z' }),
    readListeners: (ports: number[]) => check && ports.includes(check.port) ? [{ address: '127.0.0.1', port: check.port, pids: [check.group.gate.pid] }] : serving && ports.includes(c.servicePort) ? c.listeners.map((row: any) => ({ ...row, pids: [serving === dev ? 101 : 201] })) : [],
    noDatabaseHolders: () => { if (serving || check) throw new Error('Synthetic database holder remains.'); return structuredClone(emptyCheck) },
  }))
  vi.doMock(dependency('read-only-git-config.mjs'), () => ({ requireReadOnlyGitConfig: () => undefined }))
  const actualSettings = await import(/* @vite-ignore */ settingsPath)
  vi.doMock(settingsPath, () => ({ ...actualSettings, findEnvFile: () => ({ found: false, path: null }) }))
  vi.doMock(dependency('stable/stable-bootstrap-launcher.mjs'), () => ({ verifyBootstrapLauncher: () => ({ synthetic: true }), verifyBootstrapStableSource: () => undefined, verifyBootstrapSettingsSource: (_: unknown, { prepared = false, paired = false, expectRefusal = false } = {}) => {
    const stat = lstatSync(envFile), line = readFileSync(envFile, 'utf8').includes(`MOLE_OFFICE_STABLE_CHECKOUT=${stable}`)
    settingsChecks.push({ prepared, paired, expectRefusal, line, sha256: envHash(), serving })
    if (paired && !line) throw new Error('Synthetic paired proof ran before the pairing line.')
    if (paired && rejectPairedProof) { rejectPairedProof = false; throw new Error('Synthetic paired loader proof failed after the line.') }
    if (expectRefusal && line) throw new Error('Synthetic recovery proof still found the pairing line.')
    return { fileCheck: { found: true, path: envFile },
      ...(paired ? { resolution: { found: true, path: envFile, dataRoot: dev }, moduleResolution: { ENV_FILE: envFile, DATA_ROOT: dev + '/' } } : {}),
      ...(expectRefusal ? { refusal: { code: 'DEVELOPMENT_CHECKOUT_INVALID' } } : {}),
      identity: { dev: stat.dev, ino: stat.ino, mode: stat.mode & 0o777, uid: stat.uid, gid: stat.gid, size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs, sha256: envHash() } }
  } }))
  const actualStorage = await import(/* @vite-ignore */ dependency('stable/stable-bootstrap-storage.mjs'))
  vi.doMock(dependency('stable/stable-bootstrap-storage.mjs'), () => ({ ...actualStorage,
    inspectArtifacts: async () => artifacts, copyAndVerifyArtifacts: async () => undefined, verifyRetainedArtifacts: async () => undefined,
    copyAndVerifySqlite: async (source: string, target: string) => { copyFileSync(source, target); return { path: target, sha256: createHash('sha256').update(readFileSync(target)).digest('hex') } },
    checkpointBootstrapDatabase: async (path: string) => writeFileSync(path, 'Synthetic checkpoint mutation.\n'),
  }))
  vi.doMock(backupPath, () => ({ takeTheBackup: async (source: string, target: string) => { copyFileSync(source, target); return { taken: true } } }))
  const actualProcesses = await import(/* @vite-ignore */ dependency('stable/stable-bootstrap-processes.mjs'))
  vi.doMock(dependency('stable/stable-bootstrap-processes.mjs'), () => ({ ...actualProcesses,
    startGatedBootstrapGroup: async ({ name, cwd, command, args, env, journal, owned, onStep: hook }: any) => journal.step(name, async () => {
      if (name === 'recover-development' && !readFileSync(envFile).equals(originalEnv)) throw new Error('Original start ran before settings rollback.')
      const group: any = { env, command, args, name, gate: recorded(++nextPid, cwd), exit: null, ended: Promise.resolve(), released: { child: false, channel: false } }
      group.child = { connected: false, unref() { group.released.child = true }, channel: { unref() { group.released.channel = true } } }
      groups.push(group); owned.push(group); journal.append(name, 'group-recorded', { process: group.gate }); await hook?.({ step: name, phase: 'gated', process: group.gate })
      if (name.includes('write-excluded-check')) check = { port: Number(env.MOLE_OFFICE_PORT), database: env.MOLE_OFFICE_DB, group }
      else if (args.includes('--prepared')) { serving = cwd; ordinaryName = name }
      else {
        if (name === 'fetch-electron-binary') {
          const electron = join(cwd, 'node_modules/electron')
          mkdirSync(join(electron, 'dist'), { recursive: true })
          if (!electronWritesNoPath) writeFileSync(join(electron, 'path.txt'), THE_MADE_UP_ELECTRON_BINARY)
          writeFileSync(join(electron, 'dist', THE_MADE_UP_ELECTRON_BINARY), THE_MADE_UP_ELECTRON_BYTES)
        }
        group.exit = { code: 0 }
      }
      return group
    }),
    awaitBootstrapCommand: async () => undefined,
    stopBootstrapGroup: async (record: any, { journal, name }: any) => journal.step(name, async () => {
      if (record.pid === 100) serving = null
      else { const group = groups.find(value => value.gate.pid === record.pid); if (group) { group.exit = { code: 0 }; if (check?.group === group) check = null; if (group.name === 'publish-stable' || group.name === 'recover-development') serving = null } }
    }),
    observeBootstrapTopology: (runtime: any, gate: any, cwd: string) => ({ supervisor: { ...gate, cwd }, server: recorded(gate.pid + 1000, cwd), worker: runtime.worker.started ? recorded(gate.pid + 1001, cwd) : null }),
    discoverBootstrapTopology: (gate: any, cwd: string) => ({ supervisor: { ...gate, cwd }, server: recorded(gate.pid + 1000, cwd), worker: null }),
  }))
  vi.doMock(dependency('stable/stable-upgrade-evidence.mjs'), () => ({ verifyUpgradeEvidence: async () => ({ synthetic: true }) }))
  const scope = { version: 1, action: 'stop-serve-dev-for-first-handoff', candidateTag, tree, from: { commit, repository: dev, database, port: c.servicePort }, to: { commit, repository: stable, database, port: c.servicePort } }
  vi.doMock(dependency('stable/stable-bootstrap-notices.mjs'), () => ({ bootstrapStopScope: () => scope, verifyBootstrapStopAuthority: async () => { if (authorityError) throw new Error(authorityError) }, beforeBootstrapRequest: () => ({ synthetic: true }), announceBootstrap: async () => pin, finishBootstrapNotice: async ({ result }: any) => ({ ...result, notices: { state: 'filed' } }) }))
  const officeRequest = Object.assign(async (request: any, destination?: any) => {
    let body: any, status = 200
    const port = destination ? Number(new URL(destination.api).port) : c.servicePort
    if (request.method === 'POST' && request.path === '/api/records') {
      const record = request.body
      const content = { kind: record.kind, title: record.title, summary: null, data: record.data, deletedAt: null }
      original = { recordId: 'synthetic-prepared', seq: 1, op: 'create', contentHash: versionOf(content), content, provedBy: 'an-agent-key', who: { actorType: 'agent', sessionId: 'synthetic-run' } }
      status = 201; body = { record: { id: original.recordId, kind: 'note', origin: 'authored', deletedAt: null } }
    } else if (request.path.endsWith('/revisions/1')) body = original
    else if (check && check.port === port) {
      if (request.path.startsWith('/api/records?')) { status = 503; body = { code: 'RELEASE_CHECK_ONLY' } }
      else body = { ok: true, identity: { commit, repository: stable, database: check.database, port, mode: 'release-check' } }
    } else if (serving) body = request.path === '/api/health' ? { ok: true, world: { repository: serving, database, port: c.servicePort, head: commit.slice(0, 7) } } : { repository: { path: serving, head: { full: commit } }, database: { path: database }, addresses: { api: `http://127.0.0.1:${c.servicePort}` }, process: { pid: serving === dev ? 101 : 201 }, supervisor: { pid: serving === dev ? 100 : 200 }, worker: { started: workerStarted(), ...(workerStarted() ? { pid: serving === dev && ordinaryName === null ? 102 : 1201 } : {}) } }
    else { status = 503; body = { synthetic: 'The ordinary service is stopped.' } }
    return { status, body: JSON.stringify(body), cut: false, location: null }
  }, { identity: { agent: 'synthetic-agent', session: 'synthetic-run', project: 'default' } })
  const { runStableBootstrap } = await import(/* @vite-ignore */ modulePath)
  const options = { phase: 'prepare', officeRequest, onStep }
  const valid: { config: any; paths: typeof paths; liveBlocked: string | null } = { config: c, paths, liveBlocked: null }
  const prepare = () => runStableBootstrap(valid, options)
  const handoff = async () => {
    faultsArmed = false
    const result = await prepare(); expect(result.state, JSON.stringify(result)).toBe('PREPARED')
    c.prepared = result.prepared; c.stopAuthority = { kind: 'owner-decision', decision: pin }; events.length = 0; faultsArmed = true
    return runStableBootstrap(valid, { ...options, phase: 'handoff' })
  }
  return { folder, database, envFile, originalEnv, envHash, paths, events, settingsChecks, failPairedProof: () => { rejectPairedProof = true }, writeNoElectronPath: () => { electronWritesNoPath = true }, remainingFaults, prepare, handoff, serving: () => serving, groups, valid }
}

/**
 * A failed preparation or handoff left the original office serving: the result says it is unchanged or restored, the
 * development settings are as they were, and every group the bootstrap started has ended, except the original's restart.
 */
export function theOriginalServesOn(f: Awaited<ReturnType<typeof fixture>>, failed: any, label: string) {
  expect(['unchanged', 'restored'], `${label}: ${JSON.stringify(failed)}`).toContain(failed.state)
  expect(f.serving()).toContain('development')
  expect(f.envHash()).toBe(createHash('sha256').update(f.originalEnv).digest('hex'))
  expect(f.groups.every(group => group.exit !== null || group.name === 'recover-development')).toBe(true)
}
