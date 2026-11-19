// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import * as os from '../src/worker/runtimes/os.ts'
import * as rules from '../src/worker/rules.ts'
import { CodexAdapter } from '../src/worker/runtimes/codex.ts'
import { pickUpRunsAlreadyGoing, startOne } from '../src/worker/index.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

const scratch = mkdtempSync(join(tmpdir(), 'session-first-probe-'))
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
const waiting = { messageId: 'message', to: { kind: 'agent', id: 'agent' }, handle: 'agent', runtime: 'codex', model: 'made-up-model', body: 'Made-up message', sentAt: '2026-11-09 00:00:00', resume: null, hops: 0 }
const settings = { api: 'http://stand-in.invalid', workspace: 'default', session: null, stopWithPid: null, checkout: aCheckoutForATestRun(), outputRoot: scratch, env: { PATH: '/stand-in' }, runs: 1, hops: 1 }

it.skipIf(process.platform !== 'linux')('does not admit a session if the witness cannot be created', async () => {
  const outputRoot = join(scratch, 'unusable-output-root')
  writeFileSync(outputRoot, 'a file, not a directory')
  const calls: string[] = []
  const probe = vi.spyOn(os, 'theGatedProgramThatRan')
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') calls.push(new URL(url).pathname)
    return new Response('{}', { status: 200 })
  })
  await expect(startOne(waiting as Parameters<typeof startOne>[0], { ...settings, outputRoot } as Parameters<typeof startOne>[1], [])).rejects.toThrow()
  expect(calls).not.toContain('/api/records')
  expect(probe).not.toHaveBeenCalled()
})

it('does not probe if the session admission is refused', async () => {
  const probe = vi.spyOn(os, 'theProgramThatRan')
  const gatedProbe = vi.spyOn(os, 'theGatedProgramThatRan')
  vi.stubGlobal('fetch', async (url: string) => new URL(url).pathname === '/api/records'
    ? new Response('Waiting starter change', { status: 409 })
    : new Response('{}', { status: 200 }))
  const result = await startOne(waiting as Parameters<typeof startOne>[0], settings as Parameters<typeof startOne>[1], [])
  expect(result.ok).toBe(false)
  expect(probe).not.toHaveBeenCalled()
  expect(gatedProbe).not.toHaveBeenCalled()
})

it('records the probe after admission and closes the session on a later failure', async () => {
  const steps: string[] = []
  const patches: unknown[] = []
  let filed: { data: { extra: unknown } } | undefined
  vi.spyOn(os, 'theProgramThatRan').mockImplementation(() => { steps.push('probe'); return { path: '/stand-in/codex', version: 'stand-in version', versionWasRead: true } })
  vi.spyOn(os, 'theGatedProgramThatRan').mockImplementation(async () => { steps.push('probe'); return { path: '/stand-in/codex', version: 'stand-in version', versionWasRead: true } })
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname
    const method = init?.method ?? 'GET'
    if (path === '/api/records' && method === 'POST') { filed = JSON.parse(String(init?.body)); steps.push('admitted'); return new Response(JSON.stringify({ record: { id: 'run' } }), { status: 201 }) }
    if (path === '/api/records/run' && method === 'PATCH') { const body = JSON.parse(String(init?.body)); patches.push(body); steps.push(body.dataPatch.state === 'crashed' ? 'closed' : body.dataPatch.extra?.messageWorkerStart === 'probing' ? 'probing' : 'version'); return new Response('{}', { status: 200 }) }
    if (path === '/api/office-regulations/chapters') return new Response('unavailable', { status: 503 })
    return new Response('{}', { status: 200 })
  })
  const result = await startOne(waiting as Parameters<typeof startOne>[0], settings as Parameters<typeof startOne>[1], [])
  expect(result.ok).toBe(false)
  expect(steps).toEqual(['admitted', 'probing', 'probe', 'version', 'closed'])
  expect(filed?.data.extra).toMatchObject({ messageWorkerStart: 'preparing' })
  expect(patches[1]).toEqual({ dataPatch: { ranProgram: '/stand-in/codex', ranProgramVersion: 'stand-in version', extra: { messageWorkerStart: 'preparing', ...(process.platform === 'linux' ? { startupGroup: null } : {}) } } })
  expect(patches[2]).toMatchObject({ dataPatch: { state: 'crashed' } })
})

it('closes the admitted session if the probe throws', async () => {
  vi.spyOn(os, 'theProgramThatRan').mockImplementation(() => { throw new Error('made-up probe failure') })
  vi.spyOn(os, 'theGatedProgramThatRan').mockImplementation(async () => { throw new Error('made-up probe failure') })
  const patches: unknown[] = []
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname
    if (path === '/api/records' && init?.method === 'POST') return new Response(JSON.stringify({ record: { id: 'run' } }), { status: 201 })
    if (path === '/api/records/run' && init?.method === 'PATCH') patches.push(JSON.parse(String(init.body)))
    return new Response('{}', { status: 200 })
  })
  const result = await startOne(waiting as Parameters<typeof startOne>[0], settings as Parameters<typeof startOne>[1], [])
  expect(result.ok).toBe(false)
  expect(patches).toEqual([{ dataPatch: { extra: { messageWorkerStart: 'probing' } } }, { dataPatch: { state: 'crashed', doing: expect.stringContaining('made-up probe failure') } }])
})

it.skipIf(process.platform !== 'linux')('keeps an admitted session when an authorized probe fails with an unknown lifetime', async () => {
  const patches: { dataPatch: Record<string, unknown> }[] = []
  vi.spyOn(os, 'theGatedProgramThatRan').mockImplementation(async (_command, _path, _witness, recorded) => {
    // After this write the gate may have run code that escaped its group.
    await recorded(12345)
    throw new Error('probe result could not be read')
  })
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname
    if (path === '/api/records' && init?.method === 'POST') return new Response(JSON.stringify({ record: { id: 'run' } }), { status: 201 })
    if (path === '/api/records/run' && init?.method === 'PATCH') patches.push(JSON.parse(String(init.body)))
    return new Response('{}', { status: 200 })
  })
  await startOne(waiting as Parameters<typeof startOne>[0], settings as Parameters<typeof startOne>[1], [])
  expect(patches.some(patch => (patch.dataPatch.extra as { startupGroup?: number } | undefined)?.startupGroup === 12345)).toBe(true)
  expect(patches.some(patch => patch.dataPatch.state === 'crashed')).toBe(false)
})

it('closes an admitted session on an unexpected preparation error', async () => {
  vi.spyOn(os, 'theProgramThatRan').mockReturnValue({ path: '/stand-in/codex', version: 'stand-in version', versionWasRead: true })
  vi.spyOn(os, 'theGatedProgramThatRan').mockResolvedValue({ path: '/stand-in/codex', version: 'stand-in version', versionWasRead: true })
  const patches: { dataPatch: Record<string, unknown> }[] = []
  const outputRoot = join(scratch, 'unexpected-preparation')
  mkdirSync(outputRoot)
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname
    if (path === '/api/records' && init?.method === 'POST') { writeFileSync(join(outputRoot, 'run'), 'stand-in'); return new Response(JSON.stringify({ record: { id: 'run' } }), { status: 201 }) }
    if (path === '/api/records/run' && init?.method === 'PATCH') patches.push(JSON.parse(String(init.body)))
    return new Response('{}', { status: 200 })
  })
  const result = await startOne(waiting as Parameters<typeof startOne>[0], { ...settings, outputRoot } as Parameters<typeof startOne>[1], [])
  expect(result.ok).toBe(false)
  expect(patches.at(-1)?.dataPatch.state).toBe('crashed')
})

it.skipIf(process.platform !== 'linux')('closes a later preparation failure after the recorded probe completed', async () => {
  vi.spyOn(os, 'theGatedProgramThatRan').mockImplementation(async (_command, _path, _witness, recorded) => {
    await recorded(12345)
    return { path: '/stand-in/codex', version: 'stand-in version', versionWasRead: true }
  })
  const patches: { dataPatch: Record<string, unknown> }[] = []
  const outputRoot = join(scratch, 'after-completed-probe')
  mkdirSync(outputRoot)
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname
    if (path === '/api/records' && init?.method === 'POST') { writeFileSync(join(outputRoot, 'run'), 'stand-in'); return new Response(JSON.stringify({ record: { id: 'run' } }), { status: 201 }) }
    if (path === '/api/records/run' && init?.method === 'PATCH') patches.push(JSON.parse(String(init.body)))
    return new Response('{}', { status: 200 })
  })
  const result = await startOne(waiting as Parameters<typeof startOne>[0], { ...settings, outputRoot } as Parameters<typeof startOne>[1], [])
  expect(result.ok).toBe(false)
  expect(patches.at(-1)?.dataPatch.state).toBe('crashed')
})

it('commits the launching marker before asking the adapter to start', async () => {
  const steps: string[] = []
  vi.spyOn(os, 'theProgramThatRan').mockReturnValue({ path: '/stand-in/codex', version: 'stand-in version', versionWasRead: true })
  vi.spyOn(os, 'theGatedProgramThatRan').mockResolvedValue({ path: '/stand-in/codex', version: 'stand-in version', versionWasRead: true })
  vi.spyOn(rules, 'chaptersSelectedForRun').mockReturnValue([])
  vi.spyOn(rules, 'writeRulesInto').mockReturnValue({ file: 'AGENTS.md', path: '/stand-in/AGENTS.md', written: true, because: 'A stand-in.' })
  vi.spyOn(rules, 'howToLead').mockReturnValue('A stand-in.')
  vi.spyOn(CodexAdapter.prototype, 'start').mockImplementation(async () => { steps.push('adapter'); throw new Error('made-up start failure') })
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname
    if (path === '/api/records' && init?.method === 'POST') return new Response(JSON.stringify({ record: { id: 'run' } }), { status: 201 })
    if (path === '/api/records/run' && init?.method === 'PATCH') {
      const patch = JSON.parse(String(init.body)).dataPatch
      if (patch.extra?.messageWorkerStart === 'launching') steps.push('launching')
      if (patch.state === 'crashed') steps.push('closed')
    }
    return new Response('{}', { status: 200 })
  })
  const result = await startOne(waiting as Parameters<typeof startOne>[0], settings as Parameters<typeof startOne>[1], [])
  expect(result.ok).toBe(false)
  expect(steps).toEqual(['launching', 'adapter', 'closed'])
})

it('closes a recovered ordinary pre-spawn session without signalling a process', async () => {
  const calls: { path: string; method: string; body: unknown }[] = []
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname
    const method = init?.method ?? 'GET'
    calls.push({ path, method, body: init?.body ? JSON.parse(String(init.body)) : null })
    if (path === '/api/worker/runs') return new Response(JSON.stringify({ runs: [{ session: 'interrupted', runtime: 'codex', startupFailed: { reason: 'The worker ended before its tool could start.' } }] }), { status: 200 })
    return new Response('{}', { status: 200 })
  })
  expect(await pickUpRunsAlreadyGoing(settings as Parameters<typeof pickUpRunsAlreadyGoing>[0], [])).toEqual(['interrupted'])
  expect(calls).toEqual([
    { path: '/api/worker/runs', method: 'GET', body: null },
    { path: '/api/records/interrupted', method: 'PATCH', body: { dataPatch: { state: 'crashed', doing: 'The worker ended before its tool could start.' } } },
  ])
})

function probeWithinTestProcessGroup(directory: string) {
  return os.theProgramThatRan('stand-in-probe', directory)
}

it.skipIf(process.platform !== 'linux')('observes the version probe group and its timeout using a stand-in', () => {
  const groupOf = (pid: number) => Number(readFileSync(`/proc/${String(pid)}/stat`, 'utf8').replace(/^.*\) /, '').split(' ')[2])
  const directory = join(scratch, 'real-version-probe')
  const marker = join(directory, 'observed.json')
  mkdirSync(directory)
  const command = join(directory, 'stand-in-probe')
  writeFileSync(command, `#!${process.execPath}\nconst fs = require('node:fs'); const stat = fs.readFileSync('/proc/self/stat', 'utf8').replace(/^.*\\) /, '').split(' '); fs.writeFileSync(${JSON.stringify(marker)}, JSON.stringify({pid: process.pid, parent: process.ppid, group: Number(stat[2])})); setTimeout(() => process.exit(0), 30000);\n`)
  chmodSync(command, 0o755)
  const result = probeWithinTestProcessGroup(directory)
  const observed = JSON.parse(readFileSync(marker, 'utf8')) as { pid: number; parent: number; group: number }
  expect(observed.parent).toBe(process.pid)
  expect(observed.group).toBe(groupOf(process.pid))
  expect(result.versionWasRead).toBe(false)
  expect(result.version).toContain('ETIMEDOUT')
  expect(() => process.kill(observed.pid, 0)).toThrow()
}, 20_000)

import { afterAll } from 'vitest'
afterAll(() => rmSync(scratch, { recursive: true, force: true }))
