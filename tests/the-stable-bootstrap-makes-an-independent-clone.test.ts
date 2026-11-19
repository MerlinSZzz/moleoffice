// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, lstatSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { localStamp } from '../src/shared/time.ts'
import { theFoldersThisFileMakes } from './stable-bootstrap-test-folder.ts'
import { copyBootstrapSettings } from './stable-bootstrap-clone-fixture.ts'

const folders = theFoldersThisFileMakes()
afterEach(() => folders.removeEveryOne())
const implementation = new URL('../tools/stable/stable-bootstrap-execution.mjs', import.meta.url).href
const launcher = new URL('../tools/stable/stable-bootstrap-launcher.mjs', import.meta.url).href

function git(root: string, args: string[]) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 15000,
    env: { PATH: process.env.PATH, HOME: root, TMPDIR: root, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } })
  if (result.error || result.status !== 0) throw new Error(`Synthetic clone Git: ${result.error?.message ?? result.stderr}`)
  return result.stdout.trim()
}

function fixture() {
  const folder = folders.make('independent-clone'), dev = join(folder, 'development'), stable = join(folder, 'stable')
  mkdirSync(dev); copyBootstrapSettings(dev)
  writeFileSync(join(dev, '.gitignore'), '.env\n.env.*\nnode_modules/\ndist/\n')
  writeFileSync(join(dev, 'package.json'), '{"name":"synthetic-independent-clone","version":"1.0.0"}\n')
  writeFileSync(join(dev, 'package-lock.json'), '{"lockfileVersion":3,"packages":{}}\n')
  git(dev, ['init', '-b', 'main']); git(dev, ['config', 'user.name', 'Synthetic clone fixture']); git(dev, ['config', 'user.email', 'fixture@example.invalid'])
  git(dev, ['remote', 'add', 'origin', '/placeholder/development-origin.git'])
  git(dev, ['add', '.']); git(dev, ['commit', '-m', 'Synthetic clone source'])
  writeFileSync(join(dev, '.env'), '# Synthetic original settings.\nMOLE_OFFICE_DB=data/example.db\n', { mode: 0o640 })
  const c = { developmentRepository: dev, stableCheckout: stable, targetCommit: git(dev, ['rev-parse', 'HEAD']), targetTree: git(dev, ['rev-parse', 'HEAD^{tree}']), candidateTag: `stable-${localStamp(new Date()).slice(0, 10)}-clone` }
  return { folder, dev, stable, c }
}

it('runs the preparation clone and tag actions and reaches the upgrade process checks', async () => {
  const { cloneBootstrapStableCheckout, createBootstrapDatedTag } = await import(/* @vite-ignore */ implementation)
  const { verifyBootstrapStableSource } = await import(/* @vite-ignore */ launcher)
  const f = fixture()
  git(f.dev, ['tag', 'stable-2000-01-01-development-only'])
  cloneBootstrapStableCheckout(f.c); createBootstrapDatedTag(f.c)
  expect(lstatSync(join(f.stable, '.git')).isDirectory()).toBe(true)
  expect(git(f.stable, ['symbolic-ref', 'HEAD'])).toBe('refs/heads/stable')
  expect(git(f.stable, ['rev-parse', 'HEAD'])).toBe(f.c.targetCommit)
  expect(git(f.stable, ['branch', '--format=%(refname:short)']).split('\n').sort()).toEqual(['main', 'stable'])
  expect(git(f.dev, ['branch', '--list', 'stable'])).toBe('')
  expect(git(f.stable, ['tag', '--list'])).toBe(f.c.candidateTag)
  expect(git(f.dev, ['tag', '--list', f.c.candidateTag])).toBe('')
  expect(git(f.stable, ['remote', 'get-url', 'origin'])).toBe(git(f.dev, ['remote', 'get-url', 'origin']))
  expect(git(f.stable, ['config', 'remote.origin.tagOpt'])).toBe('--no-tags')
  expect(existsSync(join(f.stable, '.git/objects/info/alternates'))).toBe(false)
  const { requireStorageTheUpgradeAccepts } = await import('../tools/independent-storage.mjs')
  expect(() => requireStorageTheUpgradeAccepts(f.dev, f.stable, git)).not.toThrow()
  expect(() => verifyBootstrapStableSource(f.c)).not.toThrow()

  // Supply ordinary retained artifacts; no service is started. Validation must
  // pass storage, origin, branch and baseline before it asks for a process.
  mkdirSync(join(f.stable, 'node_modules')); mkdirSync(join(f.stable, 'dist/web'), { recursive: true })
  writeFileSync(join(f.stable, 'node_modules/.package-lock.json'), '{"packages":{}}\n')
  writeFileSync(join(f.stable, 'dist/web/index.html'), '<!-- Synthetic retained artifact. -->\n')
  writeFileSync(join(f.stable, 'dist/web/build-stamp.json'), JSON.stringify({ commit: f.c.targetCommit, builtAt: '2000-01-01 00:00:00', builtAtMs: 1 }))
  const home = join(f.folder, 'home'), recovery = join(f.folder, 'recovery'), data = join(f.folder, 'data')
  for (const path of [home, recovery, data]) mkdirSync(path, { mode: 0o700 })
  const database = join(data, 'example.db')
  writeFileSync(database, Buffer.from('SQLite format 3\0Synthetic header; never opened.'), { mode: 0o600 })
  git(f.dev, ['commit', '--allow-empty', '-m', 'Synthetic next upgrade target'])
  const { validateUpgradeConfig } = await import('../tools/stable/stable-upgrade-transaction.mjs')
  expect(() => validateUpgradeConfig({ developmentRepository: f.dev, stableCheckout: f.stable, database,
    targetCommit: git(f.dev, ['rev-parse', 'HEAD']), previousBaselineTag: f.c.candidateTag,
    candidateTag: f.c.candidateTag + '-next', evidence: { recordId: 'synthetic-evidence', seq: 1, contentHash: 'a'.repeat(16) },
    notice: 'Synthetic upgrade notice.', noticeApproval: { id: 'synthetic-approval', seq: 1, contentHash: 'b'.repeat(16) },
    noticeSendIds: { before: 'synthetic-upgrade-before', after: 'synthetic-upgrade-after' }, serviceGroups: [], serviceHome: home, serviceSettings: {},
    recoveryRoot: recovery, servicePort: 41121, releaseCheckPort: 41122,
    health: { attempts: 1, intervalMs: 1, timeoutMs: 100, stopTimeoutMs: 100, commandTimeoutMs: 100 },
  })).toThrow('At least one recorded service group is required.')
}, 60000)

it('refuses changed origins and candidate tags that appear just before tagging', async () => {
  const { cloneBootstrapStableCheckout, createBootstrapDatedTag } = await import(/* @vite-ignore */ implementation)
  const { verifyBootstrapStableSource } = await import(/* @vite-ignore */ launcher)
  const f = fixture()
  cloneBootstrapStableCheckout(f.c); createBootstrapDatedTag(f.c)
  git(f.stable, ['remote', 'set-url', 'origin', '/placeholder/other-origin.git'])
  expect(() => verifyBootstrapStableSource(f.c)).toThrow(/origin/i)
  for (const repository of ['development', 'stable']) {
    const raced = fixture()
    cloneBootstrapStableCheckout(raced.c)
    git(repository === 'development' ? raced.dev : raced.stable, ['tag', raced.c.candidateTag])
    expect(() => createBootstrapDatedTag(raced.c)).toThrow(/tag.*exists/i)
  }
}, 60000)

it('checks the settings file before pairing and proves the loader after pairing', async () => {
  const { cloneBootstrapStableCheckout } = await import(/* @vite-ignore */ implementation)
  const { verifyBootstrapSettingsSource } = await import(/* @vite-ignore */ launcher)
  const f = fixture()
  cloneBootstrapStableCheckout(f.c)
  const checked = verifyBootstrapSettingsSource(f.c, { prepared: true })
  expect(checked.fileCheck).toEqual({ found: true, path: join(f.dev, '.env') })
  expect(checked.moduleResolution).toBeUndefined()
  writeFileSync(join(f.dev, '.env'), `# Synthetic paired settings.\nMOLE_OFFICE_STABLE_CHECKOUT=${f.stable}\n`, { mode: 0o640 })
  const verified = verifyBootstrapSettingsSource(f.c, { prepared: true, paired: true })
  expect(verified.resolution).toEqual({ found: true, path: join(f.dev, '.env'), dataRoot: f.dev })
  expect(verified.identity.mode).toBe(0o640)
  expect(verified.identity.sha256).toMatch(/^[0-9a-f]{64}$/)
}, 60000)

it('accepts a server started at an older commit only when no file that restarts the server or its worker changed since', async () => {
  const { verifyBootstrapServing } = await import(/* @vite-ignore */ implementation)
  const repo = join(folders.make('older-head'), 'development'), database = join(repo, 'data/example.db'), port = 41123
  for (const folder of ['src/server/lib', 'src/worker', 'tools']) mkdirSync(join(repo, folder), { recursive: true })
  writeFileSync(join(repo, 'src/server/index.ts'), "import { a } from './lib/a.ts'\nexport const server = a\n")
  writeFileSync(join(repo, 'src/server/lib/a.ts'), 'export const a = 1\n')
  writeFileSync(join(repo, 'src/worker/index.ts'), 'export const worker = 1\n')
  writeFileSync(join(repo, 'tools/a-tool.mjs'), '// Synthetic tool.\n')
  git(repo, ['init', '-b', 'main']); git(repo, ['config', 'user.name', 'Synthetic serving fixture']); git(repo, ['config', 'user.email', 'fixture@example.invalid'])
  const commit = (path: string, text: string) => { writeFileSync(join(repo, path), text); git(repo, ['add', '.']); git(repo, ['commit', '-q', '-m', `Synthetic change to ${path}`]); return git(repo, ['rev-parse', 'HEAD']) }
  git(repo, ['add', '.']); git(repo, ['commit', '-q', '-m', 'Synthetic serving source'])
  const started = git(repo, ['rev-parse', 'HEAD'])
  // The server answers with the head it started at in its world and the checkout's head in its runtime, as the live one does.
  const serving = (head: string, now: string) => async ({ path }: { path: string }) => ({ status: 200, cut: false, location: null, body: JSON.stringify(path === '/api/runtime'
    ? { repository: { head: { full: now }, path: repo }, database: { path: database }, addresses: { api: `http://127.0.0.1:${port}` } }
    : { ok: true, world: { repository: repo, database, port, head: head.slice(0, 7) } }) })
  const check = (head: string, now: string) => verifyBootstrapServing(serving(head, now), { commit: now, repository: repo, database, port })
  await expect(check(started, started)).resolves.toBeTruthy()
  const toolsOnly = commit('tools/a-tool.mjs', '// Synthetic tool, changed.\n')
  await expect(check(started, toolsOnly)).resolves.toBeTruthy()
  const serverChange = commit('src/server/lib/a.ts', 'export const a = 2\n')
  await expect(check(started, serverChange)).rejects.toThrow(/commit, checkout, database or port differs/)
  const workerChange = commit('src/worker/index.ts', 'export const worker = 2\n')
  await expect(check(serverChange, workerChange)).rejects.toThrow(/commit, checkout, database or port differs/)
  const lockChange = commit('package-lock.json', '{"lockfileVersion":3,"packages":{}}\n')
  await expect(check(workerChange, lockChange)).rejects.toThrow(/commit, checkout, database or port differs/)
  // A head on another line of history is not an older state of this checkout, even when only tools differ from it.
  git(repo, ['checkout', '-q', '-b', 'elsewhere', lockChange]); const elsewhere = commit('tools/a-tool.mjs', '// Synthetic tool, elsewhere.\n'); git(repo, ['checkout', '-q', 'main'])
  const later = commit('tools/a-tool.mjs', '// Synthetic tool, later.\n')
  await expect(check(lockChange, later)).resolves.toBeTruthy()
  await expect(check(elsewhere, later)).rejects.toThrow(/commit, checkout, database or port differs/)
}, 60000)

it('reads each installed package folder, not the hidden list npm keeps of its last install', async () => {
  const { requireInstalledPackagesMatchTheLock } = await import('../tools/independent-storage.mjs')
  const root = folders.make('installed-packages'), install = (path: string, name: string, version: string) => {
    mkdirSync(join(root, path), { recursive: true }); writeFileSync(join(root, path, 'package.json'), JSON.stringify({ name, version }))
  }
  // Made-up packages: one plain, one scoped, one nested, one alias, and one optional package for another machine, left out.
  writeFileSync(join(root, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: {
    '': { name: 'synthetic-installed-packages', version: '1.0.0' },
    'node_modules/plain': { version: '1.0.0' }, 'node_modules/@scope/inner': { version: '2.0.0' },
    'node_modules/plain/node_modules/nested': { version: '3.0.0' }, 'node_modules/alias': { name: 'real-name', version: '4.0.0' },
    'node_modules/other-machine': { version: '5.0.0', optional: true, os: ['made-up-os'] },
  } }))
  install('node_modules/plain', 'plain', '1.0.0'); install('node_modules/@scope/inner', '@scope/inner', '2.0.0')
  install('node_modules/plain/node_modules/nested', 'nested', '3.0.0'); install('node_modules/alias', 'real-name', '4.0.0')
  mkdirSync(join(root, 'node_modules/.bin')); writeFileSync(join(root, 'node_modules/a-file-is-not-a-package.txt'), 'Synthetic.\n')
  symlinkSync('a-file-is-not-a-package.txt', join(root, 'node_modules/a-link-to-a-file-is-not-either'))
  // The hidden list is stale: it names an older version and a package that is no longer there.
  writeFileSync(join(root, 'node_modules/.package-lock.json'), JSON.stringify({ packages: { 'node_modules/plain': { version: '0.9.0' }, 'node_modules/gone': { version: '1.0.0' } } }))
  expect(() => requireInstalledPackagesMatchTheLock(root)).not.toThrow()

  install('node_modules/@scope/inner', '@scope/inner', '2.0.1')
  expect(() => requireInstalledPackagesMatchTheLock(root)).toThrow('Installed dependencies differ from the exact package lock: node_modules/@scope/inner is at 2.0.1, not 2.0.0.')
  install('node_modules/@scope/inner', '@scope/inner', '2.0.0'); install('node_modules/plain/node_modules/extra', 'extra', '1.0.0')
  expect(() => requireInstalledPackagesMatchTheLock(root)).toThrow('Installed dependencies contain an unpinned package: node_modules/plain/node_modules/extra.')
  rmSync(join(root, 'node_modules/plain/node_modules/extra'), { recursive: true }); symlinkSync('plain', join(root, 'node_modules/linked'))
  expect(() => requireInstalledPackagesMatchTheLock(root)).toThrow('Installed dependencies contain an unpinned package: node_modules/linked.')
})

it('retains each artifact folder with its own mode, not the mode the umask gives a new folder', async () => {
  const { artifactIdentity } = await import('../tools/independent-storage.mjs')
  const { copyAndVerifyArtifacts } = await import('../tools/stable/stable-bootstrap-storage.mjs')
  const folder = folders.make('artifact-modes'), source = join(folder, 'development'), saved = join(folder, 'saved'), installed = join(source, 'node_modules')
  // Made-up packages in four folder modes. Whatever the umask, at least three differ from the mode it gives a new folder.
  const modes = { 'a-755': 0o755, 'a-775': 0o775, 'a-700': 0o700, 'a-750': 0o750 }
  for (const [name, mode] of Object.entries(modes)) {
    mkdirSync(join(installed, name, 'lib'), { recursive: true }); writeFileSync(join(installed, name, 'lib/index.js'), `// ${name}\n`)
    chmodSync(join(installed, name), mode)
  }
  chmodSync(installed, 0o775)
  const artifacts = { paths: ['node_modules'], identities: { node_modules: artifactIdentity(installed, source, [installed]) } }
  await copyAndVerifyArtifacts(source, saved, artifacts)
  for (const [name, mode] of Object.entries(modes)) expect(lstatSync(join(saved, 'node_modules', name)).mode & 0o777).toBe(mode)
  expect(lstatSync(join(saved, 'node_modules')).mode & 0o777).toBe(0o775)
})

it('copies the check database while another connection keeps writing to it, and the copy is intact', async () => {
  const { default: Database } = await import('better-sqlite3')
  const { copyAndVerifySqlite } = await import('../tools/stable/stable-bootstrap-storage.mjs')
  const folder = folders.make('busy-database'), source = join(folder, 'office.db'), target = join(folder, 'check.sqlite')
  // A made-up office database in WAL mode, a few hundred pages, so a copy of 100 pages a step takes several steps.
  const db = new Database(source)
  db.pragma('journal_mode = WAL')
  db.exec('CREATE TABLE records (id INTEGER PRIMARY KEY, body TEXT NOT NULL)')
  const insert = db.prepare('INSERT INTO records (body) VALUES (?)')
  db.transaction(() => { for (let i = 0; i < 3000; i++) insert.run(`Synthetic record ${i} `.padEnd(1000, '.')) })()
  // The office writes between every step of the copy, from its own connection, as the live one does.
  let writing = true
  const writer = new Promise<void>(done => { const write = () => { if (!writing) return done(); insert.run('Written during the copy.'); setImmediate(write) }; setImmediate(write) })
  const copy = copyAndVerifySqlite(source, target)
  const outcome = await Promise.race([copy.then(() => 'copied'), new Promise(done => setTimeout(() => done('still copying after 5 seconds'), 5000))])
  writing = false; await writer; await copy.catch(() => undefined); db.close()
  expect(outcome).toBe('copied')
  const copied = new Database(target, { readonly: true, fileMustExist: true })
  try { expect((copied.prepare('SELECT count(*) AS n FROM records').get() as { n: number }).n).toBeGreaterThanOrEqual(3000) } finally { copied.close() }
})

it('leaves the two tool caches in node_modules out of the identity, the checks and the copy, and nothing else', async () => {
  const { artifactIdentity, requireIndependentArtifactTargets } = await import('../tools/independent-storage.mjs')
  const { copyAndVerifyArtifacts } = await import('../tools/stable/stable-bootstrap-storage.mjs')
  const folder = folders.make('tool-caches'), source = join(folder, 'development'), installed = join(source, 'node_modules')
  const write = (path: string, text: string) => { mkdirSync(join(source, path, '..'), { recursive: true }); writeFileSync(join(source, path), text) }
  // Made-up packages, and the files Vitest and Vite write while a test runs from a checkout that uses this node_modules.
  write('node_modules/plain/index.js', '// plain\n'); write('node_modules/plain/node_modules/.vite/kept.json', '{}\n')
  write('node_modules/.vite/vitest/da39a3ee/results.json', '{"version":"4.1.10","results":[]}\n')
  mkdirSync(join(installed, '.vite-temp'))
  const identity = () => artifactIdentity(installed, source, [installed])
  const before = identity()
  write('node_modules/.vite/vitest/da39a3ee/results.json', '{"version":"4.1.10","results":[["a test file",{"duration":12}]]}\n')
  write('node_modules/.vite-temp/vitest.config.ts.timestamp-1-0.mjs', 'export default {}\n')
  expect(identity()).toBe(before)
  symlinkSync('../../../outside-the-checkout', join(installed, '.vite-temp/a-link-the-checks-would-refuse'))
  expect(identity()).toBe(before)
  expect(() => requireIndependentArtifactTargets(source, ['node_modules'])).not.toThrow()
  const saved = join(folder, 'saved')
  await copyAndVerifyArtifacts(source, saved, { paths: ['node_modules'], identities: { node_modules: identity() } })
  expect(existsSync(join(saved, 'node_modules/.vite'))).toBe(false)
  expect(existsSync(join(saved, 'node_modules/.vite-temp'))).toBe(false)
  expect(existsSync(join(saved, 'node_modules/plain/node_modules/.vite/kept.json'))).toBe(true)
  // A folder of the same name deeper down, or in another artifact, still counts.
  write('node_modules/plain/node_modules/.vite/kept.json', '{"changed":true}\n')
  expect(identity()).not.toBe(before)
  write('dist/index.html', '<!doctype html>\n')
  const built = artifactIdentity(join(source, 'dist'), source)
  write('dist/.vite/manifest.json', '{}\n')
  expect(artifactIdentity(join(source, 'dist'), source)).not.toBe(built)
})
