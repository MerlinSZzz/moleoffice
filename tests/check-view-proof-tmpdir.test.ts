// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Probe verdicts with a synthetic private HOME and TMPDIR. This is not a Docker proof. */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { CHECK_VIEW_PROBE } from '../tools/check-view-proof.mjs'

it.each(['outside', 'home', 'under home'])('checks a Node temporary write and rejects TMPDIR at %s', location => {
  const root = mkdtempSync(join(tmpdir(), 'mole-office-proof-tmpdir-'))
  try {
    const home = join(root, 'home')
    const temporary = location === 'home' ? home : location === 'under home' ? join(home, 'tmp') : join(root, 'tmp')
    mkdirSync(home)
    mkdirSync(temporary, { recursive: true, mode: 0o700 })
    execFileSync('git', ['init', '-q', root])
    writeFileSync(join(root, 'own.txt'), 'original\n')
    writeFileSync(join(root, 'config.json'), JSON.stringify({ protected: [] }))
    // Observe mkdtempSync separately so a green step cannot merely claim it wrote something.
    const observer = `
const observedFs = require('fs'), realMkdtemp = observedFs.mkdtempSync
observedFs.mkdtempSync = (...args) => {
  const made = realMkdtemp(...args)
  console.log(JSON.stringify({ createdTemporary:made }))
  return made
}
`
    writeFileSync(join(root, 'probe.cjs'), observer + CHECK_VIEW_PROBE)
    const ran = spawnSync(process.execPath, [join(root, 'probe.cjs'), join(root, 'config.json')], {
      cwd: root, env: { ...process.env, HOME: home, TMPDIR: temporary }, encoding: 'utf8', timeout: 10_000,
    })
    expect(ran.error).toBeUndefined()
    const lines = ran.stdout.trim().split('\n').map(line => JSON.parse(line))
    const step = lines.find(line => line.own === 'temporary folder')
    const outside = location === 'outside'
    expect(step).toMatchObject({ result: outside ? 'passed' : 'failed' })
    expect(lines.at(-1)).toMatchObject({ summary: true, ownFailures: outside ? 0 : 1, passed: outside })
    expect(ran.status, ran.stderr).toBe(outside ? 0 : 1)
    if (outside) {
      expect(step.path.startsWith(temporary + '/')).toBe(true)
      expect(lines.filter(line => line.createdTemporary)).toEqual([{ createdTemporary: step.path }])
      expect(existsSync(step.path)).toBe(false)
      expect(readdirSync(temporary)).toEqual([])
    } else {
      expect(step.why).toContain(temporary)
      expect(step.why).toContain('HOME')
      expect(lines.filter(line => line.createdTemporary)).toEqual([])
    }
  } finally { rmSync(root, { recursive: true, force: true }) }
})
