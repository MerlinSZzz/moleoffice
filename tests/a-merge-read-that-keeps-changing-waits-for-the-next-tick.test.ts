// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'

import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { MERGE_QUEUE_SNAPSHOT_CHANGING } from '@shared/merge-queue-snapshot.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

const NOTHING_DONE = {
  started: [],
  ended: [],
  pickedUp: [],
  stopped: [],
  held: [],
  bounced: [],
  takenBack: [],
  takeBackFailed: [],
}

let outputs: string
let settings: WorkerSettings

beforeAll(() => {
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-merge-poll-'))
  settings = {
    api: 'http://fixture.invalid',
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: aCheckoutForATestRun(),
    runs: 2,
    hops: 3,
    outputRoot: outputs,
    env: {},
    mergesOnly: true,
  }
})

afterAll(() => rmSync(outputs, { recursive: true, force: true }))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

interface Reply {
  status: number
  body: unknown
  headers?: Record<string, string>
}

function standIn(mergeReplies: Reply[]) {
  const calls: { method: string; path: string }[] = []
  let mergesRead = 0
  vi.stubGlobal('fetch', async (url: string, init?: { method?: string }) => {
    const at = new URL(url)
    calls.push({ method: init?.method ?? 'GET', path: at.pathname })
    if (at.pathname === '/api/worker/merges') {
      const reply = mergeReplies[Math.min(mergesRead, mergeReplies.length - 1)]!
      mergesRead += 1
      return new Response(JSON.stringify(reply.body), {
        status: reply.status,
        headers: { 'content-type': 'application/json', ...(reply.headers ?? {}) },
      })
    }
    if (at.pathname === '/api/office/checks-in-merges-only') {
      return new Response(JSON.stringify({ on: true, limits: { checksAtOnce: 1 }, projects: ['default'], machine: {} }), { status: 200 })
    }
    return new Response('{}', { status: 200 })
  })
  return { calls, mergesRead: () => mergesRead }
}

function watchingTheLog() {
  const lines: string[] = []
  vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: unknown) => {
    lines.push(String(chunk))
    return true
  }) as never)
  return lines
}

function toolDoors(calls: { method: string; path: string }[]) {
  return calls.filter((call) =>
    ['/api/worker/merges/', '/api/resources', '/api/records', '/api/merge-queue', '/api/checks'].some(
      (door) => call.path === door || call.path.startsWith(`${door}/`),
    ),
  )
}

it('says nothing, starts and stops nothing, and asks again on the next tick', async () => {
  const stand = standIn([
    {
      status: 503,
      body: { error: 'The queue changed while it was read. Nothing was started or stopped.', code: MERGE_QUEUE_SNAPSHOT_CHANGING, values: {} },
      headers: { 'retry-after': '3' },
    },
    { status: 200, body: { wanted: [], going: [] } },
  ])
  const lines = watchingTheLog()
  const kill = vi.spyOn(process, 'kill')

  const first = await onePass(settings, [], [], [])

  expect(stand.mergesRead()).toBe(1)
  expect(first.merges).toEqual(NOTHING_DONE)
  expect(lines).toEqual([])
  expect(toolDoors(stand.calls)).toEqual([])
  expect(kill).not.toHaveBeenCalled()

  const second = await onePass(settings, [], [], [])

  expect(stand.mergesRead()).toBe(2)
  expect(second.merges).toEqual(NOTHING_DONE)
  expect(lines).toEqual([])
  expect(toolDoors(stand.calls)).toEqual([])
  expect(kill).not.toHaveBeenCalled()
})

it('reports an unrelated 503 as before', async () => {
  standIn([{ status: 503, body: { error: 'Synthetic: the office is paused.', code: 'officePauseNotReady', values: {} } }])
  const lines = watchingTheLog()

  const report = await onePass(settings, [], [], [])

  expect(report.merges).toEqual(NOTHING_DONE)
  expect(lines.length).toBeGreaterThan(0)
  expect(lines.join('')).toContain('Synthetic: the office is paused.')
})

it('does not take the code without a 503 as the temporary refusal', async () => {
  standIn([{ status: 500, body: { error: 'Synthetic: the server broke while reading.', code: MERGE_QUEUE_SNAPSHOT_CHANGING, values: {} } }])
  const lines = watchingTheLog()

  const report = await onePass(settings, [], [], [])

  expect(report.merges).toEqual(NOTHING_DONE)
  expect(lines.length).toBeGreaterThan(0)
  expect(lines.join('')).toContain('Synthetic: the server broke while reading.')
})
