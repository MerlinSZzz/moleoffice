// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * frbukDZtsdvB: the real handle tool must drain both pipes before it exits. Each case names the
 * mutation it guards. A slow reader makes queued output observable; every office is loopback.
 */
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const TOOL = fileURLToPath(new URL('../for-agents/hold-the-handle.mjs', import.meta.url))
const AGENT = 'whole-hand'
// The real hold door returns HoldOnTheWire.agent (api/handles.ts); handles are addresses.
const HELD_AGENT = { kind: 'agent', id: randomBytes(9).toString('base64url') } as const
const SESSION = 'whole-session'
const LETTERS = Array.from({ length: 476 }, (_, n) => ({
  id: `letter-${n}`,
  body: `BEGIN letter-${n} ${'字'.repeat(512)} END letter-${n}`,
}))

function answer(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

async function runTheTool(mode: 'delivery' | 'refusal' | 'error') {
  const folder = mkdtempSync(join(tmpdir(), 'whole-handle-'))
  const sentence = `BEGIN ${mode} ${'字'.repeat(180_000)} END ${mode}`
  const taken: string[] = []
  const marked: string[] = []
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://fake').pathname
    if (path === `/api/records/${SESSION}`) {
      // THE SHAPE THE SERVER GIVES TO WHAT WAS ASKED: `?shape=where` is the record's id, kind and project, and a
      // session's runtime word when its record names one (wave 13y round 15), and the waiter asks for that. This fake
      // leaves the runtime word out, so the waiter takes no word from the record and holds as the `--runtime codex`
      // it was started with.
      const workspaceId = mode === 'error' ? sentence : 'default'
      const where = new URL(req.url ?? '/', 'http://fake').searchParams.get('shape') === 'where'
      answer(res, 200, where ? { id: SESSION, kind: 'session', workspaceId } : { record: { id: SESSION, workspaceId } })
    } else if (path === `/api/handles/${AGENT}/hold`) {
      answer(res, mode === 'refusal' ? 403 : 201, mode === 'refusal'
        ? { error: sentence }
        : { hold: { agent: HELD_AGENT, handle: AGENT, session: SESSION, state: 'fresh' }, beatEvery: 60, lapsesAfter: 120 })
    } else if (path === `/api/handles/${AGENT}/waiting`) {
      answer(res, 200, { waiting: LETTERS.map(({ id }) => ({ messageId: id, urgent: false })) })
    } else if (path === `/api/handles/${AGENT}/took`) {
      let body = ''
      req.on('data', (chunk) => { body += String(chunk) })
      req.on('end', () => {
        taken.push((JSON.parse(body) as { message: string }).message)
        answer(res, 200, { whoSentIt: 'agent fake-sender', writtenIn: { id: 'default', name: 'Default' } })
      })
    } else if (path === '/api/messages/groups') {
      // THE GROUPS' NEWS A HAND-OVER READS (message RFv1V8oxkYGF): none here, so nothing is printed for it.
      answer(res, 200, { summary: { groups: [] }, text: '' })
    } else if (path.startsWith('/api/messages/')) {
      // A READ OF THE MESSAGE IS NOT A MARK: the waiter asks what its flag asks with GET, and only a
      // POST to /mark is the session marking it seen. The GET answers a message with no flag.
      if (req.method === 'POST' && path.endsWith('/mark')) {
        marked.push(path.split('/')[3]!)
        answer(res, 200, { mark: 'seen' })
      } else {
        answer(res, 200, { message: { id: path.split('/')[3], intent: null, label: null } })
      }
    } else if (path.startsWith('/api/records/letter-')) {
      const letter = LETTERS.find(({ id }) => path === `/api/records/${id}`)!
      answer(res, 200, { record: { id: letter.id, data: { body: letter.body } } })
    } else if (path === '/api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write(': fake presence\n\n')
    } else {
      answer(res, 404, { error: `unexpected fake request: ${path}` })
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const child = spawn(process.execPath, [TOOL, '--agent', AGENT, '--session', SESSION,
    '--api', api, '--workspace', 'default', '--runtime', 'codex', '--kept-by-the-kit'], {
    cwd: folder,
    env: { PATH: process.env.PATH ?? '', HOME: folder, MOLE_OFFICE_API: api,
      MOLE_AGENT_KEY: 'fake-key', MOLE_OFFICE_WORKSPACE: 'default' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  // Keep each pipe blocked briefly when its large write arrives. An immediate exit loses the tail.
  const readSlowly = (stream: typeof child.stdout, collect: (text: string) => void, delay: number) => {
    stream!.on('data', (chunk: string) => {
      collect(chunk.toString())
      stream!.pause()
      setTimeout(() => stream!.resume(), delay)
    })
  }
  // Decode UTF-8 in the stream, so a split character at the pipe boundary stays whole.
  child.stdout!.setEncoding('utf8')
  child.stderr!.setEncoding('utf8')
  readSlowly(child.stdout, (text) => { stdout += text }, 5)
  readSlowly(child.stderr, (text) => { stderr += text }, 20)
  const timeout = setTimeout(() => child.kill('SIGKILL'), 20_000)
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      child.on('error', reject)
      // close waits for the pipes as well as the process, unlike exit.
      child.on('close', resolve)
    })
    return { code, stdout, stderr, sentence, taken, marked }
  } finally {
    clearTimeout(timeout)
    child.kill('SIGKILL')
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    rmSync(folder, { recursive: true, force: true })
  }
}

describe('a large hand-over reaches the session whole', () => {
  it('removing the first-exit guard schedules a second ending while the pipes are draining', () => {
    // Exercise the real helper with writes whose callbacks we control: two asynchronous exit
    // paths can reach it before either pipe drains. No process is exited by this unit case.
    const source = readFileSync(TOOL, 'utf8')
    const helper = source.slice(source.indexOf('let leaving = false'), source.indexOf("if (argv.includes('--help')"))
    const writes: { stream: string; text: string; done: () => void }[] = []
    const exits: number[] = []
    const stream = (name: string) => ({ write: (text: string, done: () => void) => { writes.push({ stream: name, text, done }) } })
    runInNewContext(`${helper}\nwriteThenExit(1, 'refused: first'); writeThenExit(2, 'error: second')`, {
      process: { stdout: stream('stdout'), stderr: stream('stderr'), exit: (code: number) => { exits.push(code) } },
    })
    expect(writes.map(({ stream, text }) => [stream, text])).toEqual([
      ['stdout', 'exiting: refused: first\n'], ['stderr', ''],
    ])
    expect(exits).toEqual([])
    writes[0]!.done()
    expect(exits).toEqual([])
    writes[1]!.done()
    expect(exits).toEqual([1])
  })

  it('immediate delivery exit drops the big hand-over and its delivered ids', async () => {
    const run = await runTheTool('delivery')
    expect(run.code).toBe(0)
    expect(Buffer.byteLength(LETTERS.map(({ body }) => body).join('\n'))).toBeGreaterThan(200_000)
    for (const letter of LETTERS) expect(run.stdout, letter.id).toContain(letter.body)
    expect(run.stdout.trimEnd().split('\n').at(-1)).toBe(`exiting: delivered ${LETTERS.map(({ id }) => id).join(' ')}`)
    expect(run.taken).toEqual(LETTERS.map(({ id }) => id))
    expect(run.marked).toEqual([])
    expect(run.stderr).toBe('')
  }, 30_000)

  it('immediate refusal exit drops the office sentence and its last line through pipes', async () => {
    const run = await runTheTool('refusal')
    expect(run.code).toBe(1)
    expect(run.stdout.trimEnd().split('\n').at(-1)).toBe(`exiting: refused: ${run.sentence}`)
    expect(run.stderr).toBe(`The handle "${AGENT}" was not held: ${run.sentence}\n`)
    expect(run.taken).toEqual([])
  }, 30_000)

  it('skipping the stderr callback drops the error explanation through a pipe', async () => {
    const run = await runTheTool('error')
    expect(run.code).toBe(2)
    const explanation = `--workspace default disagrees with the session record: "${SESSION}" is in ` +
      `"${run.sentence}". Nothing was held. Name the project the session is really in, or leave ` +
      '--workspace off and this takes it from the record.'
    expect(run.stdout).toBe(`exiting: error: ${explanation}\n`)
    expect(run.stderr).toBe(`${explanation}\n`)
    expect(run.taken).toEqual([])
  }, 30_000)
})
