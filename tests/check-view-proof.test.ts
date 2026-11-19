// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Probe accounting with synthetic EROFS errors. This is not the real Docker boundary proof. */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { CHECK_VIEW_PROBE, snapshotProtected } from '../tools/check-view-proof.mjs'

it('records content hashes, sizes, modes, inodes and directory listings before and after probes', () => {
  const root = mkdtempSync(join(tmpdir(), 'mole-office-proof-snapshot-'))
  try {
    writeFileSync(join(root, 'file'), 'before')
    const before = snapshotProtected([root])
    const file = statSync(join(root, 'file'))
    expect(before[0].entries[0].listing).toEqual(['file'])
    expect(before[0].entries[1]).toMatchObject({ path: 'file', size: 6, mode: file.mode, inode: file.ino, sha256: createHash('sha256').update('before').digest('hex') })
    expect(snapshotProtected([root])).toEqual(before)
    writeFileSync(join(root, 'file'), 'after!')
    expect(snapshotProtected([root])).not.toEqual(before)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it('counts every protected operation, absence, own work, and an exposed writable source', () => {
  const root = mkdtempSync(join(tmpdir(), 'mole-office-proof-accounting-'))
  try {
    execFileSync('git', ['init', '-q', root])
    const protectedPath = '/synthetic-readonly'
    const prologue = String.raw`
const fakeFs = require('fs')
const isProtected = p => String(p).startsWith('/synthetic-readonly') || String(p).includes('/alias-')
const realExists = fakeFs.existsSync
fakeFs.existsSync = p => String(p)==='/synthetic-readonly' || realExists(p)
const realRead = fakeFs.readFileSync
fakeFs.readFileSync = (p,...args) => String(p)==='/synthetic-readonly/file' ? Buffer.from('synthetic carried record') : realRead(p,...args)
for (const name of ['writeFileSync','truncateSync','appendFileSync','renameSync','unlinkSync','chmodSync']) {
 const real = fakeFs[name]; fakeFs[name] = (p,...args) => { if(isProtected(p)) throw Object.assign(new Error('synthetic read-only mount'),{code:'EROFS'}); return real(p,...args) }
}
`
    for (const scenario of ['read-only', 'exposed', 'wrong-busy']) {
      const exposed = scenario === 'exposed', wrongBusy = scenario === 'wrong-busy'
      rmSync(join(root, 'alias-9'), { force: true })
      const writable = join(root, 'exposed')
      mkdirSync(writable, { recursive: true }); writeFileSync(join(writable, 'file'), 'synthetic protected source')
      writeFileSync(join(root, 'own.txt'), 'original\n')
      const config = join(root, 'config.json')
      writeFileSync(config, JSON.stringify({ protected: [exposed ? writable : protectedPath, '/absent-source'] }))
      const script = join(root, 'probe.cjs')
      const errors = wrongBusy ? "code:'EBUSY'" : "code: name === 'renameSync' && String(p) === '/synthetic-readonly' ? 'EBUSY' : 'EROFS'"
      writeFileSync(script, (exposed ? '' : prologue.replace("code:'EROFS'", errors)) + CHECK_VIEW_PROBE)
      const ran = spawnSync(process.execPath, [script, config], { cwd: root, encoding: 'utf8' })
      const lines = ran.stdout.trim().split('\n').map(row => JSON.parse(row))
      const summary = lines.find(row => row.summary)
      expect(lines.filter(row => row.operation)).toHaveLength(18)
      expect(lines.filter(row => row.result === 'absent')).toHaveLength(9)
      expect(lines.filter(row => row.own)).toHaveLength(6)
      expect(lines.find(row => row.own === 'node test')).toEqual({ own: 'node test', result: 'passed' })
      expect(lines.filter(row => row.read)).toHaveLength(1)
      expect(summary).toMatchObject({ attempts: 18, ownFailures: 0, passed: !exposed && !wrongBusy })
      expect(summary.protectedWrites).toBe(exposed ? 7 : 0)
      expect(ran.status, ran.stderr).toBe(exposed || wrongBusy ? 1 : 0)
    }
  } finally { rmSync(root, { recursive: true, force: true }) }
})
