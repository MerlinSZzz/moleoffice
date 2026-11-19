// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The real worker pass against empty readings; no process or office is started. */
import { afterEach, expect, it, vi } from 'vitest'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'

afterEach(() => vi.unstubAllGlobals())

it('asks only for checks in merges-only mode with checks on for its project', async () => {
  const paths: string[] = []
  let on = true
  let projects: string[] | null = ['default']
  vi.stubGlobal('fetch', async (url: string) => {
    const path = new URL(url).pathname + new URL(url).search
    paths.push(path)
    const body = path === '/api/office/checks-in-merges-only'
      ? { on, projects, limits: { checksAtOnce: 2 }, machine: { loadOneMinute: 1, freeBytes: 64 * 1024 ** 3 } }
      : { queue: [], next: null, markedDelivered: path.startsWith('/api/worker/queue?') ? [{ messageId: 'synthetic-settled-ask', to: { kind: 'agent', id: 'synthetic-inspector' }, because: 'Synthetic settled reason.' }] : [], runs: [], waits: [], resumes: [], rounds: [], workerRuns: [], wanted: [], going: [], deadLetters: { rows: [] } }
    return new Response(JSON.stringify(body), { status: 200 })
  })
  const settings: WorkerSettings = { api: 'http://fixture.invalid', workspace: 'default', session: null, stopWithPid: null, checkout: process.cwd(), runs: 2, hops: 3, outputRoot: '/unused', mergesOnly: true, env: {} }
  const pass = await onePass(settings, [], [], [])
  expect(paths.filter((path) => path.startsWith('/api/worker/queue'))).toEqual(['/api/worker/queue?only=checks&markDelivered=1'])
  expect(pass.held).toContainEqual({ messageId: 'synthetic-settled-ask', because: 'Synthetic settled reason.' })
  expect(paths.some(path => path.includes('/needs-no-run'))).toBe(false)
  paths.length = 0
  await onePass({ ...settings, mergesOnly: false }, [], [], [])
  expect(paths.filter((path) => path.startsWith('/api/worker/queue'))).toEqual(['/api/worker/queue?page=1'])
  paths.length = 0
  on = false
  await onePass(settings, [], [], [])
  expect(paths.filter((path) => path.startsWith('/api/worker/queue'))).toEqual([])
  paths.length = 0
  on = true
  projects = ['elsewhere']
  await onePass(settings, [], [], [])
  expect(paths.filter((path) => path.startsWith('/api/worker/queue'))).toEqual([])
})
