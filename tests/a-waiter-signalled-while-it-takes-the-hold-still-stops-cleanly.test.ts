// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A signal after the office writes the hold must still stop the waiter cleanly.
 *
 * The hold reply is kept at the server while SIGTERM reaches the real waiter. This puts the
 * signal before startup can continue beyond the hold request. The waiter must wait for that
 * reply before releasing the hold, then exit with its stopped line and leave no live hold.
 * Installing the handlers after the hold makes this red: Node kills the child with SIGTERM,
 * nothing prints the stopped line, and the hold remains taken.
 */
import { spawn } from 'node:child_process'
import type { AddressInfo } from 'node:net'
import { setTimeout as pause } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, aTestAgentsKeyEnvironment, type TestDb } from './helpers.ts'

const HANDLE = 'signal-during-hold'
const AS_THE_OWNER = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let t: TestDb
let app: FastifyInstance
let api = ''
let keyEnv: NodeJS.ProcessEnv = {}
let waiter: ReturnType<typeof startTheWaiter> | undefined
let holdWasWritten = false
let signalled = false
let holdReplyReady = false
let releasedBeforeHoldReply = false

async function post(path: string, body: unknown): Promise<{ record: { id: string } }> {
  const reply = await app.inject({ method: 'POST', url: path, headers: AS_THE_OWNER, payload: body as never })
  expect(reply.statusCode, reply.body).toBe(201)
  return reply.json() as { record: { id: string } }
}

async function liveHolds(): Promise<{ handle: string; releasedAt: string | null }[]> {
  const reply = await app.inject({ method: 'GET', url: '/api/handles', headers: AS_THE_OWNER })
  expect(reply.statusCode, reply.body).toBe(200)
  const listed = reply.json() as { holds: { handle: string; releasedAt: string | null }[] }
  return listed.holds.filter((hold) => hold.handle === HANDLE && hold.releasedAt === null)
}

/** Capture both streams and wait for close, so the final assertion includes every stdout byte. */
function startTheWaiter(session: string) {
  const child = spawn(
    process.execPath,
    [
      fileURLToPath(new URL('../tools/hold-the-handle.mjs', import.meta.url)),
      '--agent', HANDLE, '--session', session, '--api', api, '--workspace', 'default',
    ],
    { detached: true, env: { ...keyEnv, MOLE_OFFICE_HANDLE_BEAT_SECONDS: '1' } },
  )
  // detached gives this child its own process group. Every signal uses the group recorded here.
  const pgid = child.pid
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => (stdout += String(chunk)))
  child.stderr.on('data', (chunk) => (stderr += String(chunk)))
  const ended = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code, signal) => resolve({ code, signal }))
  })
  return { child, pgid, stdout: () => stdout, stderr: () => stderr, ended }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  app.addHook('onRequest', async (request) => {
    if (request.url === `/api/handles/${HANDLE}/release` && !holdReplyReady) releasedBeforeHoldReply = true
  })
  app.addHook('onSend', async (request, reply, payload) => {
    if (request.url !== `/api/handles/${HANDLE}/hold` || reply.statusCode !== 201) return payload
    holdWasWritten = (await liveHolds()).length === 1
    if (waiter?.pgid === undefined) throw new Error('The waiter has no recorded process group')
    process.kill(-waiter.pgid, 'SIGTERM')
    signalled = true
    // Keep the answer in flight while the child can act on the signal. The old waiter dies here.
    await Promise.race([waiter.ended, pause(500)])
    holdReplyReady = true
    return payload
  })
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  keyEnv = await aTestAgentsKeyEnvironment(app, HANDLE, dirname(t.file))
})

afterAll(async () => {
  if (waiter?.pgid !== undefined && waiter.child.exitCode === null && waiter.child.signalCode === null) {
    process.kill(-waiter.pgid, 'SIGTERM')
    await waiter.ended
  }
  await app?.close()
  t?.close()
})

it('waits for the hold answer, releases the hold and exits stopped after SIGTERM during the request', async () => {
  const session = await post('/api/records', {
    kind: 'session', title: 'A terminal stopped while taking the hold',
    data: { state: 'running', runtime: 'claude-code', doing: 'answering as signal-during-hold' },
  })
  waiter = startTheWaiter(session.record.id)
  const ended = await waiter.ended
  const output = `${waiter.stdout()}\n${waiter.stderr()}`

  expect.soft(holdWasWritten, 'The office had written the hold before SIGTERM').toBe(true)
  expect.soft(signalled, 'SIGTERM was sent before the hold reply').toBe(true)
  expect.soft(ended, output).toEqual({ code: 0, signal: null })
  expect.soft(waiter.stdout().trimEnd().split('\n').at(-1), output).toBe('exiting: stopped')
  expect.soft(await liveHolds(), 'No hold remains taken after the waiter exits').toEqual([])
  expect(releasedBeforeHoldReply, 'Release must wait until the hold has answered').toBe(false)
})
