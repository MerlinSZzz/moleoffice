// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Each journal boundary is tested with process and database stand-ins. */
import { expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fixture } from './stable-bootstrap-step-fixture.ts'

it('refuses a live handoff after preparation and before the first stop', async () => {
  const f = await fixture()
  f.valid.liveBlocked = 'Synthetic live block: this handoff must not begin.'
  await expect(f.handoff()).rejects.toThrow('Synthetic live block: this handoff must not begin.')
  expect(f.events.map(event => event.step)).not.toContain('stop-original-supervisor')
  expect(f.serving()).toContain('development')
  expect(f.groups.filter(group => group.exit === null)).toEqual([])
}, 60000)

it('refuses invalid live stop authority before the storage block', async () => {
  const reason = 'Synthetic owner stop decision does not cover this prepared handoff.'
  const f = await fixture([], null, reason)
  f.valid.config.mode = 'live'
  f.valid.liveBlocked = 'Live handoff is refused because the ordinary upgrade would refuse this stable checkout: "Stable must have independent Git storage, not a shared worktree."'
  await expect(f.handoff()).rejects.toThrow(reason)
  expect(f.events).toEqual([])
  expect(f.serving()).toContain('development')
  expect(f.groups.filter(group => group.exit === null)).toEqual([])
}, 60000)

it('recovers isolated failures before and after every preparation and handoff step', async () => {
  for (const phase of ['prepare', 'handoff'] as const) {
    const control = await fixture(), result = await control[phase]()
    expect(result.state).toBe(phase === 'prepare' ? 'PREPARED' : 'published')
    const points = [...new Set(control.events.filter(event => event.phase === 'before').map(event => event.step))]
    expect(points).toContain(phase === 'prepare' ? 'clone-independent-stable-checkout' : 'stop-original-supervisor')
    if (phase === 'handoff') expect(points).toContain('pair-development-with-stable')
    expect(points).toContain('release-lock'); expect(points).toContain('final-descriptor-close')
    for (const step of points) for (const when of ['before', 'after']) {
      const f = await fixture([{ step, phase: when }]), failed = await f[phase]()
      expect(f.remainingFaults, `${phase}:${step}/${when} did not execute`).toHaveLength(0)
      expect(['unchanged', 'restored'], `${phase}:${step}/${when}: ${JSON.stringify(failed)}`).toContain(failed.state)
      expect(f.serving()).toContain('development')
      expect(f.envHash()).toBe(createHash('sha256').update(f.originalEnv).digest('hex'))
      expect(f.groups.every(group => group.exit !== null || group.name === 'recover-development')).toBe(true)
      writeFileSync(join(f.folder, 'isolated-result.json'), JSON.stringify({ phase, step, when, failed, events: f.events }, null, 2), { mode: 0o600 })
    }
  }
  for (const mismatch of ['missing-publication', 'unexpected-publication'] as const) {
    const f = await fixture([], mismatch), failed = await f.handoff()
    expect(failed.state, `${mismatch}: ${JSON.stringify(failed)}`).toBe('restored')
    expect(f.serving()).toContain('development')
  }
}, 180000)

it('retains NOT RESTORED paths when each isolated recovery mutation fails', async () => {
  const failure = { step: 'pair-development-with-stable', phase: 'after' }
  const control = await fixture([failure]), recovered = await control.handoff()
  expect(recovered.state).toBe('restored')
  const start = control.events.findIndex(event => event.step === failure.step && event.phase === failure.phase)
  const points = [...new Set(control.events.slice(start + 1).filter(event => event.phase === 'before').map(event => event.step))]
  expect(points).toContain('restore-development-settings'); expect(points).toContain('restore-private-exact-database'); expect(points).toContain('recover-development')
  let left = 0
  for (const step of points) for (const when of ['before', 'after']) {
    const f = await fixture([failure, { step, phase: when }]), failed = await f.handoff()
    expect(f.remainingFaults, `${step}/${when} did not execute`).toHaveLength(0)
    expect(failed.state, `${step}/${when}: ${JSON.stringify(failed)}`).toBe('NOT RESTORED')
    expect(failed.paths).toEqual(f.paths)
    left += releasesWhatItLeaves(f, failed, `${step}/${when}`)
    writeFileSync(join(f.folder, 'isolated-recovery-failure.json'), JSON.stringify({ step, when, failed, events: f.events }, null, 2), { mode: 0o600 })
  }
  for (const mismatch of ['missing-recovery', 'unexpected-recovery'] as const) {
    const f = await fixture([failure], mismatch), failed = await f.handoff()
    expect(failed.state, `${mismatch}: ${JSON.stringify(failed)}`).toBe('NOT RESTORED')
    expect(failed.paths).toEqual(f.paths)
    left += releasesWhatItLeaves(f, failed, mismatch)
  }
  // At least one NOT RESTORED case must leave a started group running, or the check above proved nothing.
  expect(left).toBeGreaterThan(0)
}, 180000)

it('keeps settings unchanged when recovery starts before the pairing write', async () => {
  const f = await fixture([{ step: 'checkpoint-real-database', phase: 'after' }]), result = await f.handoff()
  expect(result.state, JSON.stringify(result)).toBe('restored')
  expect(f.events.some(event => event.step === 'restore-development-settings')).toBe(false)
  expect(f.envHash()).toBe(createHash('sha256').update(f.originalEnv).digest('hex'))
  expect(f.serving()).toContain('development')
}, 60000)

/** A NOT RESTORED result names every group it leaves running and holds none of them, so its controller can exit. */
function releasesWhatItLeaves(f: Awaited<ReturnType<typeof fixture>>, failed: any, label: string) {
  const running = f.groups.filter(group => group.exit === null)
  expect(failed.remainingGroups, label).toEqual(running.map(group => group.gate))
  expect(running.filter(group => !group.released.child || !group.released.channel).map(group => group.name), `${label} kept a running group referenced`).toEqual([])
  return running.length
}
