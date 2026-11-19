// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TEST-ONLY PRELOAD: one child's own record of the health requests it actually sends.
 *
 * The hook child is started with `node --import tests/health-request-trace.mjs tools/session-hook.mjs
 * start`, so this runs inside that child. It reads Node's native undici diagnostics and writes one
 * line per `GET /api/health` to stderr, where the test reads it and suppresses it on success.
 *
 * Three rows are kept apart:
 *   - `child-call` is `undici:request:create`: the child recorded that it made a call. It carries
 *     no socket, because that channel's payload has only the request.
 *   - `child-producer` is `undici:client:sendHeaders`: the call was sent on a socket, and the payload
 *     carries the request and that socket. Its four endpoint facts are the observed connection.
 *   - `child-detach` is written once on exit after both subscriptions are removed. It carries each
 *     `unsubscribe` result and each channel's own `hasSubscribers`, so the test can prove the
 *     cleanup without copying a listener list.
 *
 * It records no header, credential, response body, environment value or query value. The path is
 * cut at the question mark. If HEALTH_SECOND_FETCH is '1' it sends exactly one extra health request
 * before the hook starts; that is the test-only mutation the one-read criterion is proved against.
 * If HEALTH_TRACE_INCOMPLETE_PRODUCER is '1' it drops the client port from every producer row, so
 * the test can prove a partly observed tuple is never called a match.
 */
import { channel } from 'node:diagnostics_channel'
import { writeSync } from 'node:fs'

const PREFIX = '@@health-request-trace@@ '
const incompleteProducer = process.env.HEALTH_TRACE_INCOMPLETE_PRODUCER === '1'

function writeRow(row) {
  writeSync(2, PREFIX + JSON.stringify(row) + '\n')
}

function pathWithoutQuery(value) {
  const text = String(value ?? '')
  const question = text.indexOf('?')
  return question === -1 ? text : text.slice(0, question)
}

function connectionFrom(socket) {
  if (socket === null || typeof socket !== 'object') return null
  const connection = {
    localAddress: socket.localAddress ?? null,
    localPort: incompleteProducer ? null : (socket.localPort ?? null),
    remoteAddress: socket.remoteAddress ?? null,
    remotePort: socket.remotePort ?? null,
  }
  return Object.values(connection).every((one) => one === null) ? null : connection
}

function isHealthRequest(request) {
  return request?.method === 'GET' && pathWithoutQuery(request?.path) === '/api/health'
}

const createChannel = channel('undici:request:create')
const sendChannel = channel('undici:client:sendHeaders')

function onRequestCreate({ request }) {
  if (!isHealthRequest(request)) return
  writeRow({
    source: 'child-call',
    method: 'GET',
    origin: String(request.origin ?? ''),
    path: '/api/health',
    clock: 'child-monotonic-ms',
    atMs: performance.now(),
  })
}

function onSendHeaders({ request, socket }) {
  if (!isHealthRequest(request)) return
  writeRow({
    source: 'child-producer',
    method: 'GET',
    origin: String(request.origin ?? ''),
    path: '/api/health',
    clock: 'child-monotonic-ms',
    atMs: performance.now(),
    connection: connectionFrom(socket),
  })
}

createChannel.subscribe(onRequestCreate)
sendChannel.subscribe(onSendHeaders)

let detached = false
function detach() {
  if (detached) return
  detached = true
  const removedCreate = createChannel.unsubscribe(onRequestCreate)
  const removedSend = sendChannel.unsubscribe(onSendHeaders)
  try {
    writeRow({
      source: 'child-detach',
      removed: { create: removedCreate === true, send: removedSend === true },
      hasSubscribers: { create: createChannel.hasSubscribers, send: sendChannel.hasSubscribers },
      clock: 'child-monotonic-ms',
      atMs: performance.now(),
    })
  } catch {
    // The child is already leaving; a closed stderr is not a reason to change its exit.
  }
}
process.once('exit', detach)

if (process.env.HEALTH_SECOND_FETCH === '1') {
  const origin = process.env.MOLE_OFFICE_API ?? ''
  if (origin !== '') {
    try {
      const reply = await fetch(`${origin}/api/health`)
      await reply.arrayBuffer()
    } catch {
      // The hook's own failure report is the evidence when the server cannot answer.
    }
  }
}
