// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE GROUP LINE REACHES AN AGENT WOKEN BY THE WAITER OR BY DSH. This is item 5 of a decision, with 13n's
 * ExgRp9L2BdPC. A group message handed over opens with the office's own group line
 * (DELIVERY_ENVELOPE.fromAGroup), and a direct one has none. The groups' news is not here: it waits for the office to
 * work its summary out in one place and serve it (the inspector's refusal of run KNZLF9DUpCk9, invariant 9). Real tool
 * processes, against a fake office on a free port, as in the handle-tool retry cases. Every message and identity here
 * is synthetic.
 */
import { randomBytes } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer, type ServerResponse } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

import { DELIVERY_ENVELOPE } from '../src/shared/messages.ts'

const WAITER = fileURLToPath(new URL('../tools/hold-the-handle.mjs', import.meta.url))
const START = fileURLToPath(new URL('../tools/dsh-hooks/session-start.mjs', import.meta.url))
const GROUP = { id: 'synthetic-group', name: 'Synthetic discussion' }
const AGENT = 'synthetic-reader'
// The real hold door returns HoldOnTheWire.agent (api/handles.ts); handles are addresses.
const HELD_AGENT = { kind: 'agent', id: randomBytes(9).toString('base64url') } as const
const SESSION = 'synthetic-session'
const GROUP_MESSAGE = 'synthetic-group-message'
const DIRECT_MESSAGE = 'synthetic-direct-message'
const GROUP_BODY = 'Synthetic group delivery.\nIts second line stays whole. 尾  '
const DIRECT_BODY = 'Synthetic direct delivery.\nIts second line also stays whole. 尾  '
const children: ChildProcess[] = []

function answer(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

async function fakeOffice(options: { opencode?: boolean } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'mole-group-dsh-'))
  const deliveredReads: string[] = []
  const marked: string[] = []
  const sentPrompts: string[] = []
  let waits = 0
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://synthetic-office')
    const path = url.pathname
    if (path === '/tui/append-prompt') {
      let body = ''
      req.on('data', (chunk) => { body += String(chunk) })
      req.on('end', () => {
        sentPrompts.push((JSON.parse(body) as { text: string }).text)
        answer(res, 200, {})
      })
      return
    }
    if (path === '/tui/submit-prompt' || path === `/api/handles/${AGENT}/release`) {
      answer(res, 200, {})
      return
    }
    if (path === `/api/handles/${AGENT}/hold`) {
      answer(res, 201, { hold: { agent: HELD_AGENT, handle: AGENT, session: SESSION, state: 'fresh' }, beatEvery: 60, lapsesAfter: 120 })
      return
    }
    if (path === `/api/handles/${AGENT}/waiting`) {
      waits += 1
      if (options.opencode && waits > 1) return // Hold the next wake until the test stops its waiter.
      answer(res, 200, { waiting: [{ messageId: GROUP_MESSAGE, urgent: false }, { messageId: DIRECT_MESSAGE, urgent: false }] })
      return
    }
    if (path === `/api/handles/${AGENT}/took`) {
      let body = ''
      req.on('data', (chunk) => { body += String(chunk) })
      req.on('end', () => {
        const asked = JSON.parse(body) as { message: string }
        answer(res, 200, { whoSentIt: 'Synthetic sender', fromGroup: asked.message === GROUP_MESSAGE ? GROUP : null })
      })
      return
    }
    if (path.endsWith('/mark')) {
      marked.push(path)
      answer(res, 200, { mark: 'seen' })
      return
    }
    if (path === '/api/messages') {
      if (url.searchParams.get('markDelivered') === '1') deliveredReads.push(req.url ?? '')
      answer(res, 200, { messages: [
        { id: GROUP_MESSAGE, fromGroup: GROUP, whoSentIt: 'Synthetic sender', body: GROUP_BODY, workspaceId: 'message-centre' },
        { id: DIRECT_MESSAGE, fromGroup: null, whoSentIt: 'Synthetic sender', body: DIRECT_BODY, workspaceId: 'message-centre' },
      ] })
      return
    }
    if (path === `/api/records/${SESSION}`) {
      answer(res, 200, { record: { id: SESSION, workspaceId: 'default', data: {} } })
      return
    }
    if (path === `/api/records/${GROUP_MESSAGE}` || path === `/api/records/${DIRECT_MESSAGE}`) {
      answer(res, 200, { record: { data: { body: path.endsWith(GROUP_MESSAGE) ? GROUP_BODY : DIRECT_BODY } } })
      return
    }
    answer(res, 404, { error: `Synthetic office has no answer for ${path}.` })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    marked, sentPrompts, cwd, deliveredReads,
    close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => { rmSync(cwd, { recursive: true, force: true }); resolve() }) }),
  }
}

function runTool(office: Awaited<ReturnType<typeof fakeOffice>>, script = WAITER, opencode = false) {
  const child = spawn(process.execPath, [script, ...(script === WAITER ? [
    '--agent', AGENT, '--session', SESSION, '--api', office.url, '--workspace', 'default',
    ...(opencode ? ['--runtime', 'opencode', '--wake', office.url] : []),
  ] : [])], {
    ...(script === START ? { cwd: office.cwd } : {}),
    env: {
      PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '',
      MOLE_OFFICE_API: office.url, MOLE_OFFICE_AGENT: AGENT, MOLE_OFFICE_SESSION: SESSION,
      MOLE_OFFICE_WORKSPACE: 'default', MOLE_AGENT_KEY: 'synthetic-key', MOLE_OFFICE_HANDLE_BEAT_SECONDS: '60',
    },
  })
  children.push(child)
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += String(chunk) })
  child.stderr.on('data', (chunk) => { stderr += String(chunk) })
  const ended = new Promise<number>((resolve) => child.on('close', (code) => resolve(code ?? -1)))
  child.stdin.end('{}')
  return { said: () => stdout, error: () => stderr, ended, stop: () => child.kill('SIGTERM') }
}

async function output(office: Awaited<ReturnType<typeof fakeOffice>>, script = WAITER): Promise<string> {
  const run = runTool(office, script)
  expect(await run.ended, run.error()).toBe(0)
  if (script === WAITER) return run.said()
  if (run.said() === '') return ''
  return (JSON.parse(run.said()) as { hookSpecificOutput: { additionalContext: string } }).hookSpecificOutput.additionalContext
}

function wholeDelivery(said: string): void {
  expect(said).toContain(`THE MESSAGE, record ${GROUP_MESSAGE}:\n\n${GROUP_BODY}`)
  expect(said).toContain(`THE MESSAGE, record ${DIRECT_MESSAGE}:\n\n${DIRECT_BODY}`)
}

afterAll(() => {
  for (const child of children) {
    if (child.pid === undefined || child.exitCode !== null) continue
    try { process.kill(child.pid, 'SIGKILL') } catch { /* Already gone. */ }
  }
})

describe('the group line reaches the waiter and dsh', () => {
  it('W1: waiter group hand-over opens with the office group line; direct has none [mutation: takeOneAndDescribe drops fromGroup]', async () => {
    const office = await fakeOffice()
    try {
      const said = await output(office)
      wholeDelivery(said)
      expect(office.marked).toEqual([])
      expect(said).toContain(`${DELIVERY_ENVELOPE.fromAGroup(GROUP)}\nWHO SENT IT: Synthetic sender`)
      expect(said.split('FROM A GROUP:')).toHaveLength(2)
      expect(said).toContain(`WHO SENT IT: Synthetic sender\nTHE MESSAGE, record ${DIRECT_MESSAGE}:`)
    } finally { await office.close() }
  })

  it('D1: dsh group hand-over opens with the office group line; direct has none [mutation: messageBlock drops fromGroup]', async () => {
    const office = await fakeOffice()
    try {
      const said = await output(office, START)
      expect(office.deliveredReads).toHaveLength(1)
      expect(office.marked).toEqual([])
      wholeDelivery(said)
      expect(said).toContain(`${DELIVERY_ENVELOPE.fromAGroup(GROUP)}\nWHO SENT IT: Synthetic sender`)
      expect(said.split('FROM A GROUP:')).toHaveLength(2)
      expect(said).toContain(`WHO SENT IT: Synthetic sender\nTHE MESSAGE, record ${DIRECT_MESSAGE}:`)
      expect(await output(office, START)).toBe('')
    } finally { await office.close() }
  })

  it('W7: OpenCode receives the group line, then the direct delivery [mutation: takeOneAndDescribe or the OpenCode envelope drops fromGroup]', async () => {
    const office = await fakeOffice({ opencode: true })
    const run = runTool(office, WAITER, true)
    try {
      const deadline = Date.now() + 3000
      while (office.sentPrompts.length < 2 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20))
      expect(office.sentPrompts, run.error()).toHaveLength(2)
      expect(office.sentPrompts[0]).toContain(`POST /api/messages/${GROUP_MESSAGE}/mark {"mark":"seen"}`)
      expect(office.sentPrompts[1]).toContain(`POST /api/messages/${DIRECT_MESSAGE}/mark {"mark":"seen"}`)
      expect(office.marked).toEqual([])
      expect(office.sentPrompts[0]).toContain(`${DELIVERY_ENVELOPE.fromAGroup(GROUP)}\nWHO SENT IT: Synthetic sender\nTHE MESSAGE, record ${GROUP_MESSAGE}:\n\n${GROUP_BODY}`)
      expect(office.sentPrompts[1]).toContain(`WHO SENT IT: Synthetic sender\nTHE MESSAGE, record ${DIRECT_MESSAGE}:\n\n${DIRECT_BODY}`)
    } finally {
      run.stop()
      expect(await run.ended, run.error()).toBe(0)
      await office.close()
    }
  })
})
