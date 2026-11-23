// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Synthetic office and stdio client; no model, credentials or real messages are used. */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { createInterface } from 'node:readline'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { THE_LONGEST_REPLY } from '../tools/office-request.mjs'
import { PENDING_TEXT_PER_CHECKPOINT, workerCheckpoint } from '../tools/worker-delivery/checkpoint.mjs'
import { CHECKPOINT_RUNTIMES, OPENCODE_TOOL_OUTPUT_MAX_BYTES, OPENCODE_TOOL_OUTPUT_MAX_LINES } from '../src/shared/worker-delivery/contract.mjs'

let server: Server
let api: string
let failRead = false
let failMark = false
let loseAcknowledgement = false
let supportsCheckpoint = true
let servingId = 'synthetic-worker-id'
let answerBody = '{"syntheticAnswer":"kept exactly"}'
let calls: { method: string; path: string; body: any }[]
let marks: string[]
let mail: any[]
const children: ChildProcessWithoutNullStreams[] = []
const letter = (id = 'synthetic-letter', body = 'Synthetic note: keep every word.\nThe second line stays.') => ({
  id, body, saidInFull: 'Synthetic explanation in full.', workspaceId: 'default',
  whoSentIt: 'Synthetic supervisor', sentBy: { kind: 'agent', id: 'synthetic-starter-id' },
  deliveries: [{ to: { kind: 'agent', id: 'synthetic-worker-id' }, mark: 'queued' }],
})

beforeEach(async () => {
  failRead = false; failMark = false; loseAcknowledgement = false; supportsCheckpoint = true; servingId = 'synthetic-worker-id'; answerBody = '{"syntheticAnswer":"kept exactly"}'; calls = []; marks = []; mail = [letter()]
  server = createServer((req, res) => {
    let raw = ''
    req.on('data', chunk => { raw += chunk })
    req.on('end', async () => {
      const url = new URL(req.url!, 'http://synthetic-office')
      const body = raw ? JSON.parse(raw) : null
      calls.push({ method: req.method!, path: req.url!, body })
      res.setHeader('content-type', 'application/json')
      if (url.pathname === '/api/records/synthetic-run') {
        res.end(JSON.stringify({ record: { id: 'synthetic-run', kind: 'session', data: {
          state: 'running', servingAgent: 'synthetic-worker', servingAgentId: servingId,
        } } })); return
      }
      if (url.pathname === '/api/messages') {
        if (failRead) { res.statusCode = 503; res.end('{"error":"synthetic read failure"}'); return }
        const limit = Number(url.searchParams.get('limit'))
        const pending = mail.filter(m => m.deliveries[0].mark === 'queued')
        const page = pending.slice(0, limit || pending.length)
        res.end(JSON.stringify({ messages: page, left: pending.length - page.length,
          ...(supportsCheckpoint && url.searchParams.get('checkpoint') === '1' ? { checkpoint: { run: 'synthetic-run', agent: servingId } } : {}),
        })); return
      }
      const marking = /^\/api\/messages\/([^/]+)\/mark$/.exec(url.pathname)
      if (marking) {
        if (failMark) { res.statusCode = 503; res.end('{"error":"synthetic mark failure"}'); return }
        marks.push(marking[1]!)
        const one = mail.find(m => m.id === marking[1])
        if (one) one.deliveries[0].mark = body.mark
        if (loseAcknowledgement) { res.destroy(); return }
        res.end(JSON.stringify({ mark: body.mark, changed: true })); return
      }
      const reading = /^\/api\/messages\/([^/]+)$/.exec(url.pathname)
      if (reading) { res.end(JSON.stringify({ message: mail.find(m => m.id === reading[1]) })); return }
      res.end(answerBody)
    })
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterEach(async () => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      const closed = new Promise(done => child.once('close', done))
      child.kill('SIGTERM'); await closed
    }
  }
  await new Promise<void>(done => server.close(() => done()))
})

function client(runtime = 'codex') {
  const child = spawn(process.execPath, ['tools/office-mcp.mjs'], {
    env: { ...process.env, MOLE_OFFICE_API: api, MOLE_OFFICE_AGENT: 'synthetic-worker',
      MOLE_OFFICE_SESSION: 'synthetic-run', MOLE_OFFICE_WORKSPACE: 'default', MOLE_OFFICE_RUNTIME: runtime },
    stdio: 'pipe',
  })
  children.push(child)
  let serial = 0
  const waiting = new Map<number, { resolve: (reply: any) => void; reject: (why: Error) => void }>()
  child.stderr.resume()
  child.on('error', why => { for (const pending of waiting.values()) pending.reject(why); waiting.clear() })
  child.on('close', () => { for (const pending of waiting.values()) pending.reject(new Error('Synthetic MCP closed before its reply.')); waiting.clear() })
  createInterface({ input: child.stdout }).on('line', line => {
    const reply = JSON.parse(line); waiting.get(reply.id)?.resolve(reply); waiting.delete(reply.id)
  })
  const request = (method: string, params?: unknown) => new Promise<any>((resolve, reject) => {
    const id = ++serial
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error('Synthetic MCP did not reply.')) }, 10_000)
    waiting.set(id, { resolve: reply => { clearTimeout(timer); resolve(reply) }, reject: why => { clearTimeout(timer); reject(why) } })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
  return { child, request, checkpoint: () => request('tools/call', { name: 'office_request', arguments: { method: 'GET', path: '/api/health' } }) }
}
const words = (reply: any) => reply.result.content.map((c: any) => c.text).join('\n')
const answerOf = (reply: any) => reply.result.content.at(-1).text

// OpenCode 1.18.31 joins a tool reply's text parts with nothing between them. It keeps the whole reply when it is at
// most 2,000 lines and at most 51,200 UTF-8 bytes; otherwise it keeps whole lines from the start while both limits
// hold, saves the rest to a file, and says the output was truncated.
function opencodeCut(content: { type: string; text: string }[]): string {
  const whole = content.map(part => part.text).join('')
  const bytes = (text: string) => Buffer.byteLength(text, 'utf8')
  const lines = whole.split('\n')
  if (lines.length <= OPENCODE_TOOL_OUTPUT_MAX_LINES && bytes(whole) <= OPENCODE_TOOL_OUTPUT_MAX_BYTES) return whole
  const kept: string[] = []
  for (const line of lines) {
    const next = [...kept, line]
    if (next.length > OPENCODE_TOOL_OUTPUT_MAX_LINES || bytes(next.join('\n')) > OPENCODE_TOOL_OUTPUT_MAX_BYTES) break
    kept.push(line)
  }
  return kept.join('\n')
}

// A one-line JSON answer of exactly this many UTF-8 bytes, with fewer than 60,000 characters so the office tool does
// not cut it before OpenCode sees it.
function aLongAnswer(bytes: number): string {
  const prefix = '{"syntheticAnswer":"'
  const suffix = '"}'
  const room = bytes - Buffer.byteLength(prefix) - Buffer.byteLength(suffix)
  const cjk = Math.floor(room / 3)
  return prefix + 'a'.repeat(room - cjk * 3) + '中'.repeat(cjk) + suffix
}

it('a locally refused call neither acknowledges presented mail nor starts a mailbox read', async () => {
  const c = client()
  await c.checkpoint()
  const before = calls.length
  const refused = await c.request('tools/call', { name: 'office_request', arguments: { method: 'GET', path: '/api/../outside' } })
  expect(refused.result.isError).toBe(true)
  expect(calls).toHaveLength(before)
  expect(marks).toEqual([])
  expect(mail[0].deliveries[0].mark).toBe('queued')
  await c.checkpoint()
  expect(marks).toEqual([mail[0].id])
})

it.each(CHECKPOINT_RUNTIMES.slice(0, 1))('presents full pending words at a checkpoint and acknowledges at the next: %s', async runtime => {
  const c = client(runtime)
  await c.request('initialize')
  await c.request('tools/list')
  expect(calls).toEqual([])
  const first = await c.checkpoint()
  expect(answerOf(first)).toBe('200\n{"syntheticAnswer":"kept exactly"}')
  expect(first.result.content.slice(0, -1).every((part: any) => part.text.endsWith('\n'))).toBe(true)
  const kept = opencodeCut(first.result.content)
  expect(kept.indexOf(mail[0].body)).toBeGreaterThanOrEqual(0)
  expect(kept.indexOf(mail[0].body)).toBeLessThan(kept.indexOf('200\n{"syntheticAnswer":"kept exactly"}'))
  expect(words(first)).toContain(mail[0].id)
  expect(words(first)).toContain(mail[0].body)
  expect(words(first)).toContain(mail[0].whoSentIt)
  expect(words(first)).toContain(mail[0].saidInFull)
  expect(marks).toEqual([])
  expect(mail[0].deliveries[0].mark).toBe('queued')
  const second = await c.checkpoint()
  expect(marks).toEqual([mail[0].id])
  expect(mail[0].deliveries[0].mark).toBe('delivered')
  expect(words(second)).not.toContain(mail[0].body)
  await c.checkpoint()
  expect(marks).toEqual([mail[0].id])
  expect(calls.filter(c => c.path.startsWith('/api/messages?')).every(c => {
    const q = new URL(c.path, api).searchParams
    return Number(q.get('limit')) > 0 && !q.has('markDelivered')
  })).toBe(true)
  expect(calls.filter(c => c.method === 'POST').every(c => c.body.mark === 'delivered')).toBe(true)
})

it('a failed read and a process ending before its next checkpoint leave the original pending', async () => {
  const c = client()
  failRead = true
  const failed = await c.checkpoint()
  expect(words(failed)).toContain('503')
  expect(failed.result.content[0].text).toContain('could not be read')
  const failedKept = opencodeCut(failed.result.content)
  expect(failedKept).toContain('could not be read')
  expect(failedKept).toContain('GET /api/messages?only=waiting-for-me')
  expect(answerOf(failed)).toBe('200\n{"syntheticAnswer":"kept exactly"}')
  expect(marks).toEqual([])
  failRead = false
  expect(words(await c.checkpoint())).toContain(mail[0].body)
  const closed = new Promise(done => c.child.once('close', done))
  c.child.kill('SIGTERM'); await closed
  expect(marks).toEqual([])
  const restarted = client()
  expect(words(await restarted.checkpoint())).toContain(mail[0].body)
  expect(marks).toEqual([])
  await restarted.checkpoint()
  expect(marks).toEqual([mail[0].id])
})

it('a message OpenCode would cut stays queued and the line at the top is kept', async () => {
  answerBody = aLongAnswer(64_733)
  expect(Buffer.byteLength(answerBody, 'utf8')).toBe(64_733)
  const c = client('opencode')
  const first = await c.checkpoint()
  expect(answerOf(first)).toBe(`200\n${answerBody}`)
  const kept = opencodeCut(first.result.content)
  expect(kept).not.toContain(mail[0].body)
  expect(kept).toContain(mail[0].id)
  expect(kept).toContain('stays queued')
  expect(kept).toContain('GET /api/messages?only=waiting-for-me')
  expect(marks).toEqual([])
  expect(mail[0].deliveries[0].mark).toBe('queued')
  answerBody = '{"syntheticAnswer":"kept exactly"}'
  const second = await c.checkpoint()
  expect(opencodeCut(second.result.content)).toContain(mail[0].body)
  expect(marks).toEqual([])
  await c.checkpoint()
  expect(marks).toEqual([mail[0].id])
})

it('only the messages that fit are shown and the rest stay queued', async () => {
  answerBody = aLongAnswer(45_500)
  mail = [letter('synthetic-first', 'A'.repeat(3_000)), letter('synthetic-second', 'B'.repeat(3_000))]
  const c = client('opencode')
  const first = await c.checkpoint()
  expect(answerOf(first)).toBe(`200\n${answerBody}`)
  const kept = opencodeCut(first.result.content)
  expect(kept).toContain(mail[0].body)
  expect(kept).not.toContain(mail[1].body)
  expect(kept).toContain(mail[1].id)
  expect(kept).toContain('stays queued')
  expect(marks).toEqual([])
  expect(mail[0].deliveries[0].mark).toBe('queued')
  expect(mail[1].deliveries[0].mark).toBe('queued')
  answerBody = '{"syntheticAnswer":"kept exactly"}'
  const second = await c.checkpoint()
  expect(marks).toEqual([mail[0].id])
  expect(mail[0].deliveries[0].mark).toBe('delivered')
  expect(mail[1].deliveries[0].mark).toBe('queued')
  expect(opencodeCut(second.result.content)).toContain(mail[1].body)
  await c.checkpoint()
  expect(marks).toEqual([mail[0].id, mail[1].id])
})

it('a short answer says the text limit held the next message, not that the answer was too long', async () => {
  mail = [letter('synthetic-text-limit-first', 'A'.repeat(15_000)), letter('synthetic-text-limit-second', 'B'.repeat(15_000))]
  const c = client('opencode')
  const first = await c.checkpoint()
  const kept = opencodeCut(first.result.content)
  expect(kept).toContain(mail[0].body)
  expect(kept).not.toContain(mail[1].body)
  expect(kept).toContain(`Pending message ${mail[1].id} stays queued: one office call carries at most ${PENDING_TEXT_PER_CHECKPOINT.toLocaleString('en-GB')} characters of messages, counted in the order they came, and this call reached that limit by this message. The next office call shows it, or read it with GET /api/messages?only=waiting-for-me.`)
  expect(kept).not.toContain('this answer was too long')
  expect(marks).toEqual([])
  expect(mail[0].deliveries[0].mark).toBe('queued')
  expect(mail[1].deliveries[0].mark).toBe('queued')
  const second = await c.checkpoint()
  expect(marks).toEqual([mail[0].id])
  expect(mail[0].deliveries[0].mark).toBe('delivered')
  expect(mail[1].deliveries[0].mark).toBe('queued')
  expect(opencodeCut(second.result.content)).toContain(mail[1].body)
  await c.checkpoint()
  expect(marks).toEqual([mail[0].id, mail[1].id])
})

it('a long answer that holds back a message for each reason gives each reason its own line', async () => {
  answerBody = aLongAnswer(45_500)
  mail = [letter('synthetic-answer-too-long', 'A'.repeat(8_000)), letter('synthetic-text-limit-held', 'B'.repeat(16_500))]
  const c = client('opencode')
  const first = await c.checkpoint()
  expect(answerOf(first)).toBe(`200\n${answerBody}`)
  const kept = opencodeCut(first.result.content)
  expect(kept).not.toContain(mail[0].body)
  expect(kept).not.toContain(mail[1].body)
  expect(kept).not.toContain('These full messages were presented')
  const topLines = kept.split('\n').filter(line => line.startsWith('Pending message'))
  expect(topLines).toEqual([
    `Pending message ${mail[0].id} stays queued: this answer was too long to show it with this reply. The next short office call shows it, or read it with GET /api/messages?only=waiting-for-me.`,
    `Pending message ${mail[1].id} stays queued: one office call carries at most ${PENDING_TEXT_PER_CHECKPOINT.toLocaleString('en-GB')} characters of messages, counted in the order they came, and this call reached that limit by this message. The next office call shows it, or read it with GET /api/messages?only=waiting-for-me.`,
  ])
  expect(marks).toEqual([])
  expect(mail[0].deliveries[0].mark).toBe('queued')
  expect(mail[1].deliveries[0].mark).toBe('queued')
})

it('several messages held by the text limit are counted once in one line', async () => {
  mail = [
    letter('synthetic-first-fits', 'A'.repeat(11_000)),
    letter('synthetic-second-fits', 'B'.repeat(11_000)),
    letter('synthetic-third-held', 'C'.repeat(5_000)),
    letter('synthetic-fourth-held', 'D'.repeat(5_000)),
  ]
  const c = client('opencode')
  const first = await c.checkpoint()
  const kept = opencodeCut(first.result.content)
  expect(kept).toContain(mail[0].body)
  expect(kept).toContain(mail[1].body)
  expect(kept).not.toContain(mail[2].body)
  expect(kept).not.toContain(mail[3].body)
  expect(kept).toContain(`2 pending messages stay queued: one office call carries at most ${PENDING_TEXT_PER_CHECKPOINT.toLocaleString('en-GB')} characters of messages, counted in the order they came, and this call reached that limit by the first of them. The next office call shows them, or read them with GET /api/messages?only=waiting-for-me.`)
  expect(kept).not.toContain('this answer was too long')
})

it('a read that outlasts the checkpoint bound is said at the top and marks nothing', async () => {
  const checkpoint = workerCheckpoint()
  const reads: string[] = []
  const fetchImpl = ((url: any, init: any) => {
    reads.push(String(url))
    return new Promise<Response>((_resolve, reject) => {
      const signal: AbortSignal | undefined = init?.signal
      if (!signal) return reject(new Error('No checkpoint bound was passed.'))
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    })
  }) as unknown as typeof fetch
  const answer = { type: 'text', text: '200\n{"syntheticAnswer":"kept exactly"}' }
  const result = await checkpoint.append({ content: [answer], isError: false }, {
    env: { MOLE_OFFICE_API: 'http://127.0.0.1:1', MOLE_OFFICE_AGENT: 'synthetic-worker', MOLE_OFFICE_SESSION: 'synthetic-run', MOLE_OFFICE_WORKSPACE: 'default' },
    fetchImpl,
  })
  const kept = opencodeCut(result.content)
  expect(kept).toContain('could not be read')
  expect(kept).toContain('GET /api/messages?only=waiting-for-me')
  expect(result.content.at(-1)).toEqual(answer)
  expect(reads).toHaveLength(1)
}, 10_000)

it('a letter too large for any reply is named at the top and stays queued', async () => {
  const checkpoint = workerCheckpoint()
  const fetchImpl = (async () => new Response(JSON.stringify({
    checkpoint: { run: 'synthetic-run', agent: 'synthetic-worker', oversize: ['synthetic-huge-letter'] }, messages: [], left: 1,
  }), { status: 200 })) as unknown as typeof fetch
  const answer = { type: 'text', text: '200\n{"syntheticAnswer":"kept exactly"}' }
  const result = await checkpoint.append({ content: [answer], isError: false }, {
    env: { MOLE_OFFICE_API: 'http://127.0.0.1:1', MOLE_OFFICE_AGENT: 'synthetic-worker', MOLE_OFFICE_SESSION: 'synthetic-run', MOLE_OFFICE_WORKSPACE: 'default' },
    fetchImpl,
  })
  const kept = opencodeCut(result.content)
  expect(kept).toContain('synthetic-huge-letter')
  expect(kept).toContain('stays queued')
  expect(kept).toContain('GET /api/messages?only=waiting-for-me')
  expect(result.content.at(-1)).toEqual(answer)
})

it('a failed acknowledgement stays pending and retries without claiming seen', async () => {
  const c = client()
  await c.checkpoint()
  failMark = true
  expect(words(await c.checkpoint())).toContain('503')
  expect(mail[0].deliveries[0].mark).toBe('queued')
  failMark = false
  await c.checkpoint()
  expect(mail[0].deliveries[0].mark).toBe('delivered')
  expect(marks).toEqual([mail[0].id])
})

it('a cut pending read never acknowledges a partial letter', async () => {
  mail = [letter('synthetic-long-letter', 'z'.repeat(THE_LONGEST_REPLY * 2))]
  const c = client()
  expect(words(await c.checkpoint())).toMatch(/split/i)
  await c.checkpoint()
  expect(marks).toEqual([])
  expect(mail[0].deliveries[0].mark).toBe('queued')
})

it('one complete transport-sized letter larger than the normal checkpoint budget is presented whole', async () => {
  mail = [letter('synthetic-larger-letter', 'L'.repeat(PENDING_TEXT_PER_CHECKPOINT + 1))]
  const c = client()
  expect(words(await c.checkpoint())).toContain(mail[0].body)
  expect(marks).toEqual([])
  await c.checkpoint()
  expect(marks).toEqual([mail[0].id])
})

it('an older office without the bounded checkpoint protocol keeps the requested answer and leaves mail untouched', async () => {
  supportsCheckpoint = false
  const c = client()
  const first = await c.checkpoint()
  expect(answerOf(first)).toBe('200\n{"syntheticAnswer":"kept exactly"}')
  expect(words(first)).not.toContain(mail[0].body)
  expect(words(first)).toMatch(/checkpoint/i)
  await c.checkpoint()
  expect(marks).toEqual([])
})

it('concurrent office calls preserve response order and acknowledge only the preceding presentation', async () => {
  const c = client()
  const [first, second] = await Promise.all([c.checkpoint(), c.checkpoint()])
  expect(first.id).toBeLessThan(second.id)
  expect(words(first)).toContain(mail[0].body)
  expect(words(second)).not.toContain(mail[0].body)
  expect(marks).toEqual([mail[0].id])
})

it('a failed stdout presentation never becomes an acknowledgement on an already queued next call', async () => {
  const c = client()
  c.child.stdout.destroy()
  const ended = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Synthetic MCP did not close its failed output.')), 10_000)
    c.child.once('close', () => { clearTimeout(timer); resolve() })
  })
  const call = { jsonrpc: '2.0', method: 'tools/call', params: { name: 'office_request', arguments: { method: 'GET', path: '/api/health' } } }
  c.child.stdin.write(JSON.stringify({ ...call, id: 1 }) + '\n' + JSON.stringify({ ...call, id: 2 }) + '\n')
  await ended
  expect(marks).toEqual([])
  expect(mail[0].deliveries[0].mark).toBe('queued')
})

it('a pending delivery belonging to another canonical agent is never presented or acknowledged', async () => {
  servingId = 'synthetic-other-worker-id'
  const c = client()
  expect(words(await c.checkpoint())).not.toContain(mail[0].body)
  await c.checkpoint()
  expect(marks).toEqual([])
})

it('explicit seen after action is retained on later checkpoints', async () => {
  const c = client()
  await c.checkpoint()
  await c.request('tools/call', { name: 'office_request', arguments: { method: 'POST', path: `/api/messages/${mail[0].id}/mark`, body: { mark: 'seen' } } })
  expect(mail[0].deliveries[0].mark).toBe('seen')
  await c.checkpoint()
  expect(mail[0].deliveries[0].mark).toBe('seen')
})

it('a lost acknowledgement reply is read back before another mark is attempted', async () => {
  const c = client()
  await c.checkpoint()
  loseAcknowledgement = true
  await c.checkpoint()
  expect(marks).toEqual([mail[0].id])
  loseAcknowledgement = false
  await c.checkpoint()
  expect(marks).toEqual([mail[0].id])
  expect(calls.some(c => c.method === 'GET' && c.path === `/api/messages/${mail[0].id}`)).toBe(true)
})
