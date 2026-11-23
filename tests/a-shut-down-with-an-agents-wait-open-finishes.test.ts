// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SHUT DOWN WITH AN AGENT'S WAIT OPEN FINISHES: the server exits 0, its lock is gone, and nothing failed on the way.
 *
 * A beta tester's Shut down took long or did not finish while an agent waited for its messages. The tester's agent
 * read the log as this: the database closed, then the agent's held connection closed and tried to write who is online,
 * on the closed database. Read from the code, not measured: two pieces of work run when a held connection closes. The
 * waiting door reads what it hands the agent after the agent has left, and a stream that closes looks at who is
 * online. Both read the database. On Windows with a person's page open, the look waits for a reading of every process
 * first, so it could run after the database closed. The way out (src/server/index.ts) now waits for that work before
 * it closes the database, and the closed database skips a write and refuses a read in its own words
 * (src/server/db/a-closed-database.ts).
 *
 * WHAT IS MEASURED, on an office of this file's own, on a throw-away database under the system's temporary folder: an
 * agent waits on the waiting door and holds its stream open, as tools/hold-the-handle.mjs does both, and a person's
 * page is open. The person presses Shut down. Then the server exits 0 within 90 seconds, its service lock is gone, it
 * says it ended the 3 held open and that what they did as they closed was done, it says the stop finished, and after
 * the press it wrote no error-level line, skipped no write and refused no read on the closed database.
 *
 * WHAT IT DOES NOT MEASURE. It runs on Linux, where the look runs the moment the stream closes, so the order before
 * this change would very likely pass it too: nothing here holds that work back until after the close. Windows and the
 * Mac are walked by hand. Which of the two lines comes first in the output is not asserted: the stop's own lines and
 * the log's are written by two writers.
 */

import { afterAll, expect, it } from 'vitest'
import { KEY_HEADER } from '../src/config/key-header.mjs'
import { theOfficeKey } from '../src/config/office-key.mjs'
import { serviceLockPathFrom } from '../src/config/settings.mjs'
import { readTheServiceLock } from '../src/config/the-service-lock.mjs'
import { CONNECTION_IS_COUNTED, CONNECTION_TAG_PARAM } from '../src/shared/events.ts'
import { AS_THE_PERSON, aPlace, ask, sleep, startAServer, stopEverything } from './terminal-holder-stand.ts'

/** Every request this file holds open, aborted at its end whatever happened. */
const held: AbortController[] = []

afterAll(async () => {
  for (const one of held) one.abort()
  await stopEverything()
}, 60_000)

/** Open GET /api/events with `headers` and read it until the server says it is counted. It stays open. */
async function aStreamOpenAndCounted(url: string, headers: Record<string, string>): Promise<void> {
  const controller = new AbortController()
  held.push(controller)
  const opening = setTimeout(() => controller.abort(), 15_000)
  try {
    const reply = await fetch(url, { headers: { ...headers, accept: 'text/event-stream' }, signal: controller.signal })
    expect(reply.status, reply.ok ? '' : await reply.text()).toBe(200)
    const reader = reply.body!.getReader()
    const decoder = new TextDecoder()
    let read = ''
    while (!read.includes(`: ${CONNECTION_IS_COUNTED}\n`)) {
      const { value, done } = await reader.read()
      if (done) break
      read += decoder.decode(value, { stream: true })
    }
    expect(read, 'the stream ended before the server counted it').toContain(`: ${CONNECTION_IS_COUNTED}\n`)
    // THE REST IS READ AND DROPPED until the server ends the stream, which is what this file waits for, so that read
    // failing then is the expected end and not a fault.
    void (async () => {
      for (;;) if ((await reader.read()).done) return
    })().catch(() => undefined)
  } finally {
    clearTimeout(opening)
  }
}

it("finishes a Shut down with an agent's wait open: exit 0, the lock gone, no error after the press", async () => {
  const place = aPlace('shut-waiting')
  const server = await startAServer(place, undefined, { MOLE_OFFICE_MESSAGE_WORKER: 'off', LOG_LEVEL: 'info' })
  const lockPath = serviceLockPathFrom({ MOLE_OFFICE_DB: place.database })
  expect(readTheServiceLock(lockPath).state, 'the server took no lock').toBe('read')

  const handle = 'a-waiting-agent'
  const filed = await ask(server.api, '/api/records', {
    method: 'POST',
    body: { kind: 'agent', title: 'An agent that waits for its messages', data: { handle, runtime: 'claude-code', state: 'active' } },
  })
  expect(filed.status, JSON.stringify(filed.body)).toBe(201)
  // THE HEADERS THE WAITER SENDS for an agent with no key of its own: its name, and the office's key.
  const officeKey = theOfficeKey(server.env).key
  expect(officeKey, 'the office made no key beside its database').not.toBeNull()
  const asTheAgent: Record<string, string> = {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
    [KEY_HEADER]: officeKey!,
  }

  await aStreamOpenAndCounted(`${server.api}/api/events`, AS_THE_PERSON)
  await aStreamOpenAndCounted(`${server.api}/api/events?${CONNECTION_TAG_PARAM}=hold-the-handle-a-test-session`, asTheAgent)
  const theWait = new AbortController()
  held.push(theWait)
  let theWaitEnded: string | null = null
  void fetch(`${server.api}/api/handles/${encodeURIComponent(handle)}/waiting?wait=30`, { headers: asTheAgent, signal: theWait.signal }).then(
    async (reply) => {
      theWaitEnded = `answered ${String(reply.status)}: ${await reply.text()}`
    },
    () => {
      theWaitEnded = 'ended by the server'
    },
  )
  await sleep(2_000)
  expect(theWaitEnded, 'the wait answered before the Shut down, so it was not held').toBeNull()

  const before = server.output().length
  const shut = await ask(server.api, '/api/office/shut-down', { method: 'POST', body: { why: 'this test shuts its own office down while an agent waits' } })
  expect(shut.status, JSON.stringify(shut.body)).toBe(200)
  const ended = await Promise.race([server.exited, sleep(90_000).then(() => null)])
  const said = server.output().slice(before)
  expect(ended, `the server did not end within 90 seconds. It printed: ${said.slice(-3000)}`).not.toBeNull()
  expect(ended!.code, said.slice(-3000)).toBe(0)
  expect(readTheServiceLock(lockPath).state, 'the server ended and left its lock').toBe('absent')
  expect(theWaitEnded, 'the wait was not ended by the Shut down').toBe('ended by the server')

  expect(said, said.slice(-3000)).toContain('ended the 3 held open on purpose')
  expect(said, said.slice(-3000)).toMatch(/shutdown: what the 3 ended waits did as they closed was done, \d+ ms after they were ended\./)
  expect(said, said.slice(-3000)).toContain('shutdown: closing the database')
  expect(said, said.slice(-3000)).toContain('shutdown: finished')
  // NOTHING FAILED AFTER THE PRESS: no line at the log's error or fatal level, no write skipped and no read refused on
  // the closed database, and no look at who is online left unfinished.
  expect(said, said.slice(-3000)).not.toMatch(/"level":(?:50|60)\b/u)
  expect(said, said.slice(-3000)).not.toContain('The database connection is not open')
  expect(said, said.slice(-3000)).not.toContain('because the shut-down had closed the database')
  expect(said, said.slice(-3000)).not.toContain('was not finished')
  expect(said, said.slice(-3000)).not.toContain('shutdown: ended with')
}, 240_000)
