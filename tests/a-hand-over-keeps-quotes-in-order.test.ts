// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { randomBytes, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, it } from 'vitest'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { nameTarget } from '../src/shared/targets.ts'
import { promptFor } from '../src/worker/prompt.ts'
import { workerCheckpoint } from '../tools/worker-delivery/checkpoint.mjs'
import { messageBlock } from '../tools/dsh-hooks/office.mjs'

const recipient = randomUUID()
const runId = randomUUID()
const messageId = randomUUID()
const sourceId = randomUUID()
const agent = randomUUID()
const body = 'start_ middle_ end_'
const blockId = randomUUID()
const field = `data.blocks[#${blockId}].text`
const selected = 'chosen_\nEND QUOTE'
const quotes = [
  { target: { kind: 'reportBlock' as const, recordId: sourceId, blockId }, span: { quote: selected, from: 0, to: selected.length, field } },
  { target: { kind: 'record' as const, recordId: sourceId, workspaceId: 'default' } },
]
const message = (positions: number[] | null) => ({ id: messageId, body, quotes, quotePositions: positions, sentBy: null, whoSentIt: agent, workspaceId: 'default', deliveries: [{ to: { kind: 'agent', id: recipient }, mark: 'queued' }] })
const placed = [7, 15]

function readsInOrder(said: string, positions: number[] | null): void {
  const from = nameTarget(quotes[0]!.target)
  const first = sayInEnglish('agent.quote.fromField', { source: from, field })
  const second = sayInEnglish('agent.quote.empty', { source: nameTarget(quotes[1]!.target) })
  const end = sayInEnglish('agent.quote.end')
  const words = positions === null
    ? [first, '> chosen_', '> END QUOTE', end, second, body]
    : ['start_', first, '> chosen_', '> END QUOTE', end, 'middle_', second, 'end_']
  let at = 0
  for (const part of words) {
    const found = said.indexOf(part, at)
    expect(found, `missing or out of order: ${part}\n${said}`).toBeGreaterThanOrEqual(at)
    at = found + part.length
  }
}

it.each([{ positions: placed }, { positions: null }])('the office checkpoint hands an agent the message in order, positions $positions', async ({ positions }) => {
  const env = { MOLE_OFFICE_API: 'http://127.0.0.1:1', MOLE_OFFICE_AGENT: agent, MOLE_OFFICE_SESSION: runId, MOLE_OFFICE_WORKSPACE: 'default' }
  const fetchImpl = async () => new Response(JSON.stringify({ checkpoint: { run: runId, agent: recipient }, messages: [message(positions)], left: 0 }), { status: 200 })
  const result = await workerCheckpoint().append({ content: [], isError: false }, { env, fetchImpl })
  readsInOrder(result.content.map((item: { text: string }) => item.text).join('\n'), positions)
})

it.each([{ positions: placed }, { positions: null }])('the dsh hook hands an agent the message in order, positions $positions', ({ positions }) => {
  readsInOrder(messageBlock(message(positions), { id: recipient }), positions)
})

it.each([{ positions: placed }, { positions: null }])('the prompt for a started run hands it the message in order, positions $positions', ({ positions }) => {
  const prompt = promptFor({ agent, workspace: 'default', api: 'http://127.0.0.1:1', messageId, body, quotes, quotePositions: positions, from: agent, carryingOn: false, howToLead: '', knows: null, brief: '' })
  readsInOrder(prompt, positions)
})

async function theWaiterReads(positions: number[] | null, opencode: boolean): Promise<string> {
  const prompts: string[] = []
  let waits = 0
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
    const answer = (status: number, value: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)) }
    if (path === '/tui/append-prompt') {
      let raw = ''
      req.on('data', (chunk) => { raw += String(chunk) })
      req.on('end', () => { prompts.push(JSON.parse(raw).text); answer(200, {}) })
    } else if (path === '/tui/submit-prompt' || path.endsWith('/release')) answer(200, {})
    else if (path.endsWith('/hold')) answer(201, { hold: { agent: { kind: 'agent', id: recipient }, handle: agent, session: runId, state: 'fresh' }, beatEvery: 60, lapsesAfter: 120 })
    else if (path.endsWith('/waiting')) {
      waits += 1
      if (opencode && waits > 1) return
      answer(200, { waiting: [{ messageId, urgent: false }] })
    } else if (path.endsWith('/took')) answer(200, { whoSentIt: agent })
    else if (path === `/api/records/${runId}`) answer(200, { record: { id: runId, workspaceId: 'default', data: {} } })
    else if (path === `/api/records/${messageId}`) answer(200, { record: { data: { body, quotes, quotePositions: positions } } })
    else answer(404, {})
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const child = spawn(process.execPath, ['tools/hold-the-handle.mjs', '--agent', agent, '--session', runId, '--api', url, '--workspace', 'default', ...(opencode ? ['--runtime', 'opencode', '--wake', url] : [])], { env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', MOLE_AGENT_KEY: randomBytes(32).toString('hex'), MOLE_OFFICE_API: url, MOLE_OFFICE_AGENT: agent, MOLE_OFFICE_SESSION: runId, MOLE_OFFICE_WORKSPACE: 'default' } })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += String(chunk) })
  child.stderr.on('data', (chunk) => { stderr += String(chunk) })
  const ended = new Promise<number | null>((done) => child.on('close', done))
  child.stdin.end('{}')
  try {
    if (opencode) {
      const deadline = Date.now() + 10_000
      while (prompts.length === 0 && Date.now() < deadline) await new Promise((done) => setTimeout(done, 20))
      expect(prompts, stderr).toHaveLength(1)
      child.kill('SIGTERM')
    }
    expect(await ended, stderr).toBe(0)
    return opencode ? prompts[0]! : stdout
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
    server.closeAllConnections()
    await new Promise<void>((done) => server.close(() => done()))
  }
}

it.each([{ positions: placed }, { positions: null }])('the terminal waiter hands an agent the message in order, positions $positions', async ({ positions }) => {
  readsInOrder(await theWaiterReads(positions, false), positions)
}, 30_000)

it.each([{ positions: placed }, { positions: null }])('the OpenCode waiter hands an agent the message in order, positions $positions', async ({ positions }) => {
  readsInOrder(await theWaiterReads(positions, true), positions)
}, 30_000)

// The direct prompt cases above check the rendering; a separate real-worker test also checks that
// the worker reads the quote data from the stored message before it starts a run.
