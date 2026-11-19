// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, truncateSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import Database from 'better-sqlite3'
import { artifactIdentity, validateUpgradeConfig } from '../tools/stable/stable-upgrade-transaction.mjs'
import { localStamp } from '../src/shared/time.ts'

const folders: string[] = []
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }) })
function git(cwd: string, ...args: string[]) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 15_000, env: { PATH: process.env.PATH, HOME: cwd, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } })
  if (result.error || result.status !== 0) throw Error(result.error?.message ?? result.stderr)
  return result.stdout.trim()
}

function upgradeFixture() {
  const folder = mkdtempSync(join(tmpdir(), 'upgrade-baseline-tag-')); folders.push(folder)
  const development = join(folder, 'development'), stable = join(folder, 'stable'), recovery = join(folder, 'recovery'), database = join(folder, 'fixture.sqlite')
  mkdirSync(development); mkdirSync(recovery, { mode: 0o700 })
  git(development, 'init', '-b', 'main')
  git(development, 'config', 'user.name', 'Synthetic tag fixture'); git(development, 'config', 'user.email', 'fixture@example.invalid')
  writeFileSync(join(development, '.gitignore'), 'node_modules/\ndist/\n.env\n')
  writeFileSync(join(development, 'package.json'), JSON.stringify({ name: 'synthetic-tag-fixture', version: '1.0.0' }))
  writeFileSync(join(development, 'package-lock.json'), JSON.stringify({ lockfileVersion: 3, packages: {} }))
  git(development, 'add', '.'); git(development, 'commit', '-m', 'Synthetic baseline')
  const baseline = git(development, 'rev-parse', 'HEAD')
  git(development, 'tag', 'baseline-before-dated-tags')
  writeFileSync(join(development, 'candidate.txt'), 'Synthetic target.\n')
  git(development, 'add', '.'); git(development, 'commit', '-m', 'Synthetic target')
  const target = git(development, 'rev-parse', 'HEAD'), origin = join(folder, 'made-up-origin.git')
  git(development, 'remote', 'add', 'origin', origin)
  git(folder, 'clone', '--no-local', '--no-hardlinks', development, stable)
  git(stable, 'remote', 'set-url', 'origin', origin); git(stable, 'checkout', '-b', 'stable', baseline)
  mkdirSync(join(stable, 'node_modules')); mkdirSync(join(stable, 'dist/web'), { recursive: true })
  writeFileSync(join(stable, 'node_modules/.package-lock.json'), JSON.stringify({ packages: {} }))
  writeFileSync(join(stable, 'dist/web/index.html'), 'Synthetic page.\n')
  writeFileSync(join(stable, 'dist/web/build-stamp.json'), JSON.stringify({ builtAt: '2026-10-01 01:00:00', builtAtMs: 1, newestSourceAt: null, newestSourceAtMs: null, newestSourceFile: null, newestSourceFiles: null, commit: baseline }))
  const db = new Database(database); db.exec('CREATE TABLE records(id TEXT)'); db.close()
  const config = {
    developmentRepository: development, stableCheckout: stable, database, targetCommit: target,
    serviceHome: folder, serviceSettings: {}, recoveryRoot: recovery, serviceGroups: [],
    evidence: { recordId: 'synthetic-evidence', seq: 1, contentHash: 'aaaaaaaaaaaaaaaa' },
    noticeApproval: { id: 'synthetic-approval', seq: 1, contentHash: 'bbbbbbbbbbbbbbbb' },
    noticeSendIds: { before: 'fixture-before', after: 'fixture-after' }, notice: 'Synthetic upgrade notice.',
    previousBaselineTag: 'baseline-before-dated-tags', candidateTag: `stable-${localStamp(new Date()).slice(0, 10)}-candidate`,
    servicePort: 41231, releaseCheckPort: 41232,
    health: { attempts: 1, intervalMs: 1, timeoutMs: 100, stopTimeoutMs: 100, commandTimeoutMs: 1000 },
  }
  return { config, stable, baseline }
}

it('refuses an undated baseline before the lock and leaves stable unchanged', () => {
  const { config, stable, baseline } = upgradeFixture()
  const before = artifactIdentity(stable), lock = join(stable, '.git/stable-upgrade.lock')
  expect(() => validateUpgradeConfig(config)).toThrow(/dated baseline|Recovery refuses/)
  expect(existsSync(lock)).toBe(false); expect(artifactIdentity(stable)).toBe(before)
  // A dated baseline clears this boundary and reaches the deliberate lack of a running office.
  const dated = 'stable-2026-10-01-baseline'; git(stable, 'tag', dated, baseline)
  expect(() => validateUpgradeConfig({ ...config, previousBaselineTag: dated })).toThrow(/recorded service group/)
  expect(existsSync(lock)).toBe(false)
})

// Node will not read a file over 2 GiB whole. The check that the database is a SQLite file reads its first sixteen
// bytes and no more, so a sparse database past 2^31 bytes, which costs no disk, reaches the same boundary.
it('reads only the start of a database over 2 GiB and reaches the same boundary', () => {
  const { config, stable, baseline } = upgradeFixture()
  const dated = 'stable-2026-10-01-baseline'; git(stable, 'tag', dated, baseline)
  truncateSync(config.database, 2 ** 31 + 4096)
  expect(statSync(config.database).blocks * 512, 'the file must be sparse, so the test costs no disk').toBeLessThan(1024 * 1024)
  expect(() => validateUpgradeConfig({ ...config, previousBaselineTag: dated })).toThrow(/recorded service group/)
})
