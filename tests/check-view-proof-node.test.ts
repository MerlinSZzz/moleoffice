// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Real child Node work in a temporary copy. This test does not claim Docker enforcement. */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { CHECK_VIEW_PROBE } from '../tools/check-view-proof.mjs'

it.each([false, true])('runs the private Node test and counts its failure: failing assertion %s', failing => {
  const root = mkdtempSync(join(tmpdir(), 'mole-office-proof-node-'))
  try {
    execFileSync('git', ['init', '-q', root])
    writeFileSync(join(root, 'own.txt'), 'original\n')
    writeFileSync(join(root, 'config.json'), JSON.stringify({ protected: [] }))
    // Observe the real child and optionally plant a failing assertion in the synthetic work copy.
    const prologue = `
const nodeFs = require('fs'), nodeCp = require('child_process')
const realWrite = nodeFs.writeFileSync, realSpawn = nodeCp.spawnSync
nodeFs.writeFileSync = (file, bytes, ...rest) => realWrite(file,
  ${failing} && String(file).endsWith('own.test.cjs') ? "require('node:assert/strict').equal(1, 2)" : bytes, ...rest)
nodeCp.spawnSync = (program, args, options) => {
  const result = realSpawn(program, args, options)
  if (program === process.execPath && args[0] === '--test')
    realWrite('node-result.json', JSON.stringify({program, args, cwd:process.cwd(), status:result.status}))
  return result
}
`
    writeFileSync(join(root, 'probe.cjs'), prologue + CHECK_VIEW_PROBE)
    const ran = spawnSync(process.execPath, [join(root, 'probe.cjs'), join(root, 'config.json')], { cwd: root, encoding: 'utf8', timeout: 10_000 })
    expect(ran.error).toBeUndefined()
    const lines = ran.stdout.trim().split('\n').map(line => JSON.parse(line))
    expect(lines.find(row => row.own === 'node test')).toMatchObject({ result: failing ? 'failed' : 'passed' })
    expect(JSON.parse(readFileSync(join(root, 'node-result.json'), 'utf8'))).toEqual({
      program: process.execPath, args: ['--test', join(root, 'own.test.cjs')], cwd: root, status: failing ? 1 : 0,
    })
    expect(lines.at(-1)).toMatchObject({ summary: true, ownFailures: failing ? 1 : 0, passed: !failing })
    expect(ran.status, ran.stderr).toBe(failing ? 1 : 0)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
