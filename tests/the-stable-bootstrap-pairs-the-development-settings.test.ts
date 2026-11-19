// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fixture } from './stable-bootstrap-step-fixture.ts'

it('pairs after the stop and storage steps while preserving every other settings byte', async () => {
  const f = await fixture(), before = lstatSync(f.envFile), result = await f.handoff()
  expect(result.state, JSON.stringify(result)).toBe('published')
  const rows = readFileSync(f.paths.journal, 'utf8').trim().split('\n').map(line => JSON.parse(line))
  const paired = rows.find(row => row.step === 'pair-development-with-stable' && row.phase === 'observed')
  expect(paired).toBeDefined()
  expect(paired.before.withoutTheLine).toBe(paired.after.withoutTheLine)
  expect(paired.before.sha256).toBe(createHash('sha256').update(f.originalEnv).digest('hex'))
  expect(paired.after.sha256).toBe(f.envHash())
  expect(paired.identity.sha256).toBe(f.envHash())
  expect(paired.before.mode).toBe(0o640); expect(paired.after.mode).toBe(before.mode & 0o777)
  expect(paired.before.uid).toBe(before.uid); expect(paired.after.uid).toBe(before.uid)
  expect(lstatSync(f.envFile).gid).toBe(before.gid)
  expect(dirname(paired.backup)).toBe(dirname(f.envFile))
  expect(readFileSync(paired.backup)).toEqual(f.originalEnv)
  expect(readFileSync(f.envFile, 'utf8')).toContain(`MOLE_OFFICE_STABLE_CHECKOUT=${f.valid.config.stableCheckout}`)
  const steps = f.events.filter(event => event.phase === 'before').map(event => event.step)
  for (const step of ['stop-original-supervisor', 'verified-sanitized-backup', 'private-exact-rollback-image', 'checkpoint-real-database']) expect(steps.indexOf(step)).toBeLessThan(steps.indexOf('pair-development-with-stable'))
  expect(steps.indexOf('pair-development-with-stable')).toBeLessThan(steps.indexOf('real-write-excluded-check'))
  for (const name of ['real-write-excluded-check', 'publish-stable']) expect(f.groups.find(group => group.name === name).env.MOLE_OFFICE_DEVELOPMENT_CHECKOUT).toBe(f.valid.config.developmentRepository)
  expect(f.groups.find(group => group.name === 'private-write-excluded-check').env.MOLE_OFFICE_DEVELOPMENT_CHECKOUT).toBeUndefined()
}, 60000)

it('restores the whole settings hash before restarting after the pairing write', async () => {
  const f = await fixture([{ step: 'pair-development-with-stable', phase: 'after' }]), result = await f.handoff()
  expect(result.state, JSON.stringify(result)).toBe('restored')
  expect(f.envHash()).toBe(createHash('sha256').update(f.originalEnv).digest('hex'))
  expect(f.serving()).toBe(f.valid.config.developmentRepository)
  const steps = f.events.filter(event => event.phase === 'before').map(event => event.step)
  expect(steps.indexOf('restore-development-settings')).toBeGreaterThan(steps.indexOf('pair-development-with-stable'))
  expect(steps.indexOf('restore-development-settings')).toBeLessThan(steps.indexOf('recover-development'))
  expect(f.groups.find(group => group.name === 'recover-development').env.MOLE_OFFICE_DEVELOPMENT_CHECKOUT).toBeUndefined()
}, 60000)

it('retains paths and never restarts when the settings backup cannot be restored', async () => {
  const f = await fixture([{ step: 'pair-development-with-stable', phase: 'after' }], null, null, true)
  const result = await f.handoff()
  expect(result.state, JSON.stringify(result)).toBe('NOT RESTORED')
  expect(result.settings.file).toBe(f.envFile)
  expect(result.settings.backup).toBe(`${f.envFile}.before-${f.valid.config.candidateTag}`)
  expect(result.paths.work).toBe(f.paths.work)
  expect(existsSync(result.settings.backup)).toBe(true)
  expect(f.groups.some(group => group.name === 'recover-development')).toBe(false)
  expect(f.serving()).toBeNull()
}, 60000)
