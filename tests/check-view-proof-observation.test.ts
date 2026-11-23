// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Protocol evidence only: real proof and launcher, synthetic Docker, no mount enforcement. */
import { spawnSync } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { FAKE_DF, FAKE_FREE } from './sandbox-stand-ins.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'

const limits = { Memory: 345678912, MemorySwap: -1, NanoCpus: 1250000000, PidsLimit: 73,
  ReadonlyRootfs: true, CapDrop: ['ALL'], SecurityOpt: ['no-new-privileges'], NetworkMode: 'none' }
const unlimited = { Memory: 0, MemorySwap: 0, NanoCpus: 0, PidsLimit: -1,
  ReadonlyRootfs: false, CapDrop: null, SecurityOpt: null, NetworkMode: 'bridge' }

const docker = String.raw`#!/usr/bin/env node
const fs = require('fs'), path = require('path')
const root = process.env.PROOF_OBSERVATION_STAND_IN
const config = JSON.parse(fs.readFileSync(path.join(root, 'config.json')))
const argv = process.argv.slice(2), name = argv[argv.indexOf('--name') + 1]
const log = event => fs.appendFileSync(path.join(root, 'calls.jsonl'), JSON.stringify(event) + '\n')
const printed = () => fs.readFileSync(path.join(root, 'stdout'), 'utf8').includes('"observation":"view-container-limits"')
log({ argv, umask: process.umask() })
if (argv[0] === 'image' && argv[1] === 'inspect') {
 console.log(JSON.stringify([{Config:{Labels:{'mole-office.sandbox-template':'mole-office-dev'}}}])); process.exit(0)
}
if (argv[0] === 'inspect') {
 const target = argv.at(-1), view = target.startsWith('mole-office-checkview-')
 if (view) {
  if (config.scenario === 'missing' || fs.existsSync(path.join(root, 'removed'))) {
   console.error('Error: No such container: ' + target); process.exit(1)
  }
  if (config.scenario === 'malformed') { console.log('{broken'); process.exit(0) }
  if (config.scenario === 'empty') { console.log('[]'); process.exit(0) }
  const HostConfig = {...config.limits}
  if (config.scenario === 'missing-field') delete HostConfig.NanoCpus
  if (config.scenario === 'wrong-type') HostConfig.ReadonlyRootfs = 'true'
  console.log(JSON.stringify([{ Id: 'synthetic-view-id', Name: '/' + (config.scenario === 'wrong-identity' ? 'another-container' : target), HostConfig }])); process.exit(0)
 }
 // Deliberately different from both observed view profiles and launcher defaults.
 console.log(JSON.stringify([{Id:'synthetic-source-id', Name:'/' + target, State:{Running:true},
  Config:{Image:'synthetic-proof-image', User:'1000:1000', Env:[]}, HostConfig:{NetworkMode:'none', Memory:1}}])); process.exit(0)
}
if (argv[0] === 'top') {
 const pid = fs.readFileSync(path.join(root, 'pid'), 'utf8')
 console.log('PID PGID\n' + pid + ' ' + pid); process.exit(0)
}
if (argv[0] === 'run') {
 if (!name.startsWith('mole-office-checkview-')) { console.log('synthetic-source-id'); process.exit(0) }
 fs.writeFileSync(path.join(root, 'pid'), String(process.pid))
 const at = argv.indexOf('-e'), gate = JSON.parse(argv[at + 2])
 process.stderr.write(gate.ready + process.pid + '\n')
 process.stdin.resume()
 process.stdin.on('data', () => {
  // The probe result is synthetic. This test proves the host protocol, never protection.
  console.log(JSON.stringify({summary:true, passed:true}))
 })
 process.stdin.on('end', () => {
  log({ autoRemove: name, printedBeforeRemoval: printed() })
  fs.writeFileSync(path.join(root, 'removed'), name); process.exit(0)
 })
 return
}
if (['stop','rm'].includes(argv[0])) { log({ removal: argv.at(-1), printedBeforeStop: printed() }); process.exit(0) }
console.error('Unexpected synthetic Docker operation'); process.exit(93)
`

function proof(scenario: string, HostConfig: Record<string, unknown> = limits) {
  const root = mkdtempSync(join(tmpdir(), 'mole-office-proof-observation-'))
  try {
    mkdirSync(join(root, 'bin')); mkdirSync(join(root, 'tmp'))
    writeFileSync(join(root, 'bin/docker'), docker, { mode: 0o755 })
    writeFileSync(join(root, 'bin/df'), FAKE_DF, { mode: 0o755 })
    writeFileSync(join(root, 'bin/free'), FAKE_FREE, { mode: 0o755 })
    writeFileSync(join(root, 'state.json'), JSON.stringify({ freeBytes: 200_000_000_000, memoryAvailable: 200_000_000_000, calls: [], bugs: {} }))
    writeFileSync(join(root, 'config.json'), JSON.stringify({ scenario, limits: HostConfig }))
    const out = openSync(join(root, 'stdout'), 'w'), err = openSync(join(root, 'stderr'), 'w')
    let ran: ReturnType<typeof spawnSync>
    const previous = process.umask(0o077)
    try {
      ran = spawnSync(process.execPath, [resolve('tools/check-view-proof.mjs'), '--image', 'synthetic-proof-image'], {
        env: { ...withoutInheritedEffort(), PATH: join(root, 'bin') + ':' + process.env.PATH,
          TMPDIR: join(root, 'tmp'), FAKE_DOCKER_DIR: root, PROOF_OBSERVATION_STAND_IN: root },
        stdio: ['ignore', out, err], timeout: 20_000,
      })
    } finally { process.umask(previous); closeSync(out); closeSync(err) }
    const stdout = readFileSync(join(root, 'stdout'), 'utf8'), stderr = readFileSync(join(root, 'stderr'), 'utf8')
    const calls = existsSync(join(root, 'calls.jsonl')) ? readFileSync(join(root, 'calls.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line)) : []
    const lines = stdout.trim().split('\n').map(line => JSON.parse(line))
    return { status: ran.status, error: ran.error, stderr, lines, calls,
      scratch: readdirSync(join(root, 'tmp')) }
  } finally { rmSync(root, { recursive: true, force: true }) }
}

it.each([['limited', limits], ['unlimited', unlimited]] as const)('prints the %s view limits and identity before automatic removal and ledger stop', (_profile, HostConfig) => {
  const ran = proof('valid', HostConfig)
  const secure = _profile === 'limited'
  expect(ran.error).toBeUndefined()
  expect(ran.status, ran.stderr + JSON.stringify(ran.lines)).toBe(secure ? 0 : 1)
  const observations = ran.lines.filter(row => row.observation === 'view-container-limits')
  expect(observations).toHaveLength(1)
  const observed = observations[0]
  expect(observed).toEqual({ observation: 'view-container-limits', provenance: 'docker inspect --type container',
    container: expect.stringMatching(/^mole-office-checkview-proof-check-/), Id: 'synthetic-view-id', HostConfig })
  expect(ran.calls.filter(call => call.argv?.[0] === 'inspect' && call.argv.at(-1) === observed.container))
    .toEqual([{ argv: ['inspect', '--type', 'container', observed.container], umask: 0o002 }])
  expect(ran.calls.find(call => call.argv?.[0] === 'run' && call.argv.includes(observed.container)).umask).toBe(0o002)
  const evidence = ran.lines.filter(row => row.observation === 'controller-evidence-mode')
  expect(evidence).toHaveLength(6)
  expect(evidence.map(row => row.path.split('/').at(-1)).sort()).toEqual(['controller.log', 'exit', 'receipt.json', 'start.json', 'stderr', 'stdout'])
  expect(evidence.every(row => row.mode === '0600')).toBe(true)
  expect(ran.calls.find(call => call.autoRemove === observed.container)).toMatchObject({ printedBeforeRemoval: true })
  expect(ran.calls.find(call => call.removal === observed.container)).toMatchObject({ printedBeforeStop: true })
  expect(ran.lines.at(-1)).toMatchObject({ proofPassed: secure, cleanupComplete: true, passed: secure, exitCode: secure ? 0 : 1 })
  if (!secure) expect(ran.lines.at(-1).failures.join('\n')).toMatch(/HostConfig.CapDrop.*ALL[\s\S]*HostConfig.SecurityOpt.*no-new-privileges/)
  expect(ran.scratch).toEqual([])
})

it.each(['missing', 'malformed', 'empty', 'missing-field', 'wrong-type', 'wrong-identity'])('fails visibly on %s view observation and still cleans up', scenario => {
  const ran = proof(scenario)
  expect(ran.error).toBeUndefined()
  expect(ran.status, ran.stderr + JSON.stringify(ran.lines)).toBe(1)
  expect(ran.lines.filter(row => row.observation === 'view-container-limits')).toEqual([])
  expect(JSON.stringify(ran.lines) + ran.stderr).toMatch(/Could not observe view container mole-office-checkview-/)
  expect(ran.calls.some(call => call.argv?.[0] === 'stop' && call.argv.at(-1).startsWith('mole-office-checkview-'))).toBe(true)
  expect(ran.calls.some(call => call.argv?.[0] === 'rm' && call.argv.at(-1).startsWith('mole-office-checkview-'))).toBe(true)
  expect(ran.lines.at(-1)).toMatchObject({ proofPassed: false, cleanupComplete: true, passed: false, exitCode: 1 })
  expect(ran.scratch).toEqual([])
})

it.each([
  ['CapDrop', null, 'ALL'], ['CapDrop', ['NET_RAW'], 'ALL'],
  ['SecurityOpt', null, 'no-new-privileges'],
  ['SecurityOpt', ['seccomp=unconfined'], 'no-new-privileges'],
  ['CapDrop', undefined, 'ALL'], ['SecurityOpt', undefined, 'no-new-privileges'],
] as const)('fails the final verdict when HostConfig.%s is %j', (field, value, required) => {
  const ran = proof('valid', { ...limits, [field]: value })
  expect(ran.error).toBeUndefined()
  expect(ran.status, ran.stderr + JSON.stringify(ran.lines)).toBe(1)
  const observation = ran.lines.find(row => row.observation === 'view-container-limits')
  if (value === undefined) expect(observation).toBeUndefined()
  else expect(observation.HostConfig[field]).toEqual(value)
  expect(ran.lines.at(-1)).toMatchObject({ final: true, proofPassed: false, cleanupComplete: true, passed: false, exitCode: 1 })
  if (value === undefined) expect(ran.lines.at(-1).failures.join('\n')).toContain(`HostConfig.${field} is missing or malformed.`)
  else expect(ran.lines.at(-1).failures).toContain(`HostConfig.${field} does not include ${required}.`)
  expect(ran.scratch).toEqual([])
})
