// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Docker replies below are synthetic. These tests check cleanup and the process verdict, not mount protection. */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'

const docker = String.raw`#!/usr/bin/env node
const fs = require('fs'), path = require('path')
const root = process.env.PROOF_CLEANUP_STAND_IN
const config = JSON.parse(fs.readFileSync(path.join(root, 'config.json')))
const args = process.argv.slice(2)
const callsFile = path.join(root, 'calls.json')
const calls = fs.existsSync(callsFile) ? JSON.parse(fs.readFileSync(callsFile)) : []
calls.push(args); fs.writeFileSync(callsFile, JSON.stringify(calls))
if (args[0] === config.race) {
 console.error('Error response from daemon: removal of container synthetic-proof is already in progress')
 process.exit(1)
}
if (args[0] === 'inspect') {
 const inspections = calls.filter(call => call[0] === 'inspect').length
 if (config.goesAway && inspections >= 2) {
  console.error('Error: No such container: synthetic-proof'); process.exit(1)
 }
 console.log(JSON.stringify([{State:{Status:'removing'}}])); process.exit(0)
}
if (['stop','rm'].includes(args[0])) process.exit(0)
console.error('Unexpected stand-in Docker command'); process.exit(93)
`

function finish(race: string, goesAway: boolean, passed = true) {
  const root = mkdtempSync(join(tmpdir(), 'mole-office-proof-cleanup-'))
  const temporary = join(root, 'proof-temporary-files')
  try {
    mkdirSync(temporary); mkdirSync(join(root, 'bin'))
    writeFileSync(join(root, 'bin', 'docker'), docker, { mode: 0o755 })
    writeFileSync(join(root, 'config.json'), JSON.stringify({ race, goesAway }))
    const script = `import { finishProof } from ${JSON.stringify(pathToFileURL(resolve('tools/check-view-proof.mjs')).href)};
await finishProof({ containers: ['synthetic-proof'], root: ${JSON.stringify(temporary)}, passed: ${passed}, timeoutMs: 350, pollMs: 10 });`
    const ran = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...process.env, PATH: join(root, 'bin') + ':' + process.env.PATH, PROOF_CLEANUP_STAND_IN: root },
      encoding: 'utf8', timeout: 5_000,
    })
    const lines = ran.stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
    const calls = existsSync(join(root, 'calls.json')) ? JSON.parse(readFileSync(join(root, 'calls.json'), 'utf8')) as string[][] : []
    return { ...ran, last: lines.at(-1), calls, temporaryExists: existsSync(temporary) }
  } finally { rmSync(root, { recursive: true, force: true }) }
}

it.each(['stop', 'rm'])('passes cleanup when Docker %s reports removal in progress and inspect later reports absence', race => {
  const ran = finish(race, true)
  expect(ran.status, ran.stderr).toBe(0)
  expect(ran.calls.filter(call => call[0] === 'inspect').length).toBeGreaterThanOrEqual(2)
  expect(ran.last).toMatchObject({ final: true, proofPassed: true, cleanupComplete: true, passed: true, exitCode: 0 })
  expect(ran.last.result).toBe('Proof passed and cleanup is complete.')
  expect(ran.temporaryExists).toBe(false)
})

it.each(['stop', 'rm'])('fails cleanup when Docker %s reports removal in progress but the container never disappears', race => {
  const ran = finish(race, false)
  expect(ran.status, ran.stderr).toBe(1)
  expect(ran.calls.filter(call => call[0] === 'inspect').length).toBeGreaterThanOrEqual(2)
  expect(ran.last).toMatchObject({ final: true, proofPassed: true, cleanupComplete: false, passed: false, exitCode: 1 })
  expect(ran.last.result).toBe('Proof passed, but cleanup failed.')
  expect(ran.last.errors.join('\n')).toMatch(/synthetic-proof.*still exists|Could not inspect synthetic-proof during removal/)
  expect(ran.temporaryExists).toBe(false)
})

it('keeps a failed proof red after successful cleanup and says why on the last line', () => {
  const ran = finish('no-race', true, false)
  expect(ran.status, ran.stderr).toBe(1)
  expect(ran.last).toMatchObject({ final: true, proofPassed: false, cleanupComplete: true, passed: false, exitCode: 1 })
  expect(ran.last.result).toBe('Proof failed; cleanup is complete.')
  expect(ran.temporaryExists).toBe(false)
})
