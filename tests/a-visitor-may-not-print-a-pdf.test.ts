// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A VISITOR MAY NOT PRINT A PDF HERE.
 *
 * Each print starts a program on the office's computer, so the PDF door's act, report-pdf.print, carries the mark
 * `refusedToVisitors` in src/shared/ops.ts. The visitor check in src/server/lib/visitorgate.ts reads that mark and
 * refuses a request under a working visitor's credential before the door is reached.
 *
 *   6. A CONFIRMED VISITOR'S PRINT is refused with 403. The error is exactly the sentence
 *      `actRefusedToVisitorsRefusal` makes from the credential and the act's own mark. The request is written down
 *      in visitor_requests as refused with that sentence, and as having written nothing. No print folder is left.
 *   7. THE CONTROL: the office's own made-up agent, with no credential, reaches the door. On Linux with no screen
 *      and no xvfb-run, the door refuses it with 409 and reportPdfNoDisplay, so the refusal in case 6 is the
 *      visitor check's and not the door's.
 *   8. A PENDING VISITOR'S PRINT is refused with the pending sentence, as every request under a pending credential
 *      is, and not with the visitor sentence: a credential that may not work at all is told that first.
 *
 * ---------------------------------------------------------------------------------------
 * TWO REAL DOORS AND NOT ONE `app.inject()`
 * ---------------------------------------------------------------------------------------
 *
 * The shape tests/a-credential-past-its-ends-at-is-refused.test.ts uses: a visitor is an agent on another machine,
 * and an injected request is on no socket at all. So this file opens two listeners onto one built app. The loquat
 * listener stamps each request as from another machine, and only it carries a credential.
 *
 * On Linux each case unsets DISPLAY and WAYLAND_DISPLAY and sets PATH to an empty folder of its own, so a request
 * that does reach the door is refused there before anything is printed. TMPDIR is a folder of the test's own in
 * each case, so the print folders the door would make are counted where nothing else is. The four are put back
 * whatever happens.
 *
 * Before a visitor is refused here, case 6 fails: the visitor reaches the door, and neither the mark nor the
 * sentence exists. Cases 7 and 8 hold before and after.
 */

import { THE_TEST_OFFICES_OWNER, THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { mkdirSync, readdirSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { operationNamed } from '../src/shared/ops.ts'
import { actRefusedToVisitorsRefusal, pendingRefusal } from '../src/shared/visitors.ts'
import { THE_PRINT_FOLDER_PREFIX } from '../src/server/api/report-pdf.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

/** The act the PDF door declares. */
const THE_PRINT = 'report-pdf.print'

/** The door. */
const DOOR = '/api/report-pdf'

/** A small made-up page. Nothing here prints it. */
const A_SMALL_PAGE = { html: '<!doctype html><html><head><meta charset="utf-8"></head><body><p>A made-up page.</p></body></html>' }

let t: TestDb
let app: FastifyInstance
let thisMachine: string
let loquat: string
const extraDoors: Server[] = []

async function open(server: Server): Promise<string> {
  extraDoors.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()

  const { stampArrival } = await import('../src/server/lib/http.ts')
  await app.listen({ host: '127.0.0.1', port: 0 })
  thisMachine = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  loquat = await open(
    createServer((raw, res) => {
      stampArrival(raw, 'another machine', 'the caller')
      app.routing(raw, res)
    }),
  )
})

afterAll(async () => {
  for (const server of extraDoors) await new Promise<void>((resolve) => server.close(() => resolve()))
  await app.close()
  t.close()
})

interface Answer {
  status: number
  body: Record<string, unknown>
}

async function ask(
  door: string,
  method: 'GET' | 'POST',
  path: string,
  payload?: unknown,
  headers: Record<string, string> = {},
): Promise<Answer> {
  const res = await fetch(`${door}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

/** The person, as the browser sends them. */
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }

interface Credential {
  id: string
  handle: string
  standing: string
  machine: string | null
}

/** Ask loquat's door for a credential, and hand back the token and the row. */
async function askedFor(handle: string): Promise<{ token: string; credential: Credential }> {
  const asked = await ask(loquat, 'POST', '/api/office/visitors', {
    handle,
    name: `A visitor named ${handle}`,
    role: 'worker',
    conversationPath: `${THE_TEST_FIXTURE_ROOT}/.claude/projects/${handle}/aaa`,
    startDirectory: `${THE_TEST_FIXTURE_ROOT}/work/${handle}`,
    runtime: 'claude-code',
    sessionRecord: `sess-${handle}`,
  })
  expect(asked.status, JSON.stringify(asked.body)).toBe(201)
  return { token: asked.body.token as string, credential: asked.body.credential as Credential }
}

/** Ask for a credential and have the person confirm it on this machine. */
async function askedAndConfirmed(handle: string): Promise<{ token: string; credential: Credential }> {
  const asked = await askedFor(handle)
  const confirmed = await ask(thisMachine, 'POST', `/api/office/visitors/${asked.credential.id}/confirm`, undefined, PERSON)
  expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200)
  return asked
}

/** What a visitor sends on every request: its credential, its two facts, and its own name as the actor. */
function carrying(token: string, handle: string): Record<string, string> {
  return {
    'x-mole-office-credential': token,
    'x-mole-office-conversation': `${THE_TEST_FIXTURE_ROOT}/.claude/projects/${handle}/aaa`,
    'x-mole-office-start-directory': `${THE_TEST_FIXTURE_ROOT}/work/${handle}`,
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
  }
}

/** Every row of visitor_requests for one credential, read from the database and not from a reply. */
function requestRowsFor(credentialId: string): { route: string; operation: string | null; wrote: number; refused_because: string | null }[] {
  return t.client.sqlite
    .prepare('SELECT route, operation, wrote, refused_because FROM visitor_requests WHERE credential_id = ? ORDER BY at')
    .all(credentialId) as { route: string; operation: string | null; wrote: number; refused_because: string | null }[]
}

/**
 * RUN `work` WITH A TMPDIR OF THE TEST'S OWN, AND ON LINUX WITH NO SCREEN AND AN EMPTY PATH. It answers the print
 * folders the door left in that TMPDIR. The four variables are put back, and the folder removed, whatever happens.
 */
async function withNoScreenAndATemporaryFolder<T>(what: string, work: () => Promise<T>): Promise<{ answer: T; printFoldersLeft: string[] }> {
  const folder = aTestDatabaseFolder(what)
  const anEmptyPath = join(folder, 'an-empty-path')
  const temporary = join(folder, 'temporary')
  mkdirSync(anEmptyPath)
  mkdirSync(temporary)
  const kept = { DISPLAY: process.env.DISPLAY, WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY, PATH: process.env.PATH, TMPDIR: process.env.TMPDIR }
  try {
    if (process.platform === 'linux') {
      delete process.env.DISPLAY
      delete process.env.WAYLAND_DISPLAY
      process.env.PATH = anEmptyPath
    }
    process.env.TMPDIR = temporary
    const answer = await work()
    return { answer, printFoldersLeft: readdirSync(temporary).filter((name) => name.startsWith(THE_PRINT_FOLDER_PREFIX)).sort() }
  } finally {
    for (const [name, value] of Object.entries(kept)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    removeThisTestFolder(folder)
  }
}

describe('a visitor may not print a PDF', () => {
  it("6. a confirmed visitor's print is refused with 403 and the act's own sentence, and is written down as refused", async () => {
    const handle = 'loquat-printer'
    const { token, credential } = await askedAndConfirmed(handle)
    // THE MARK IS READ FROM THE ACT'S OWN DECLARATION, so the sentence this case expects is the one the code holds.
    const mark = operationNamed(THE_PRINT)?.refusedToVisitors
    expect(mark, `${THE_PRINT} carries a refusedToVisitors mark`).toBeTypeOf('string')
    const sentence = actRefusedToVisitorsRefusal(credential, String(mark))

    const { answer: refused, printFoldersLeft } = await withNoScreenAndATemporaryFolder('a-visitors-print', () =>
      ask(loquat, 'POST', DOOR, A_SMALL_PAGE, carrying(token, handle)),
    )
    expect(refused.status, JSON.stringify(refused.body)).toBe(403)
    expect(refused.body.error).toBe(sentence)
    expect(sentence).toContain('may not print a PDF')
    expect(printFoldersLeft, 'print folders the door left behind').toEqual([])

    const rows = requestRowsFor(credential.id).filter((row) => row.operation === THE_PRINT)
    expect(rows, 'the rows written down for the print').toEqual([{ route: DOOR, operation: THE_PRINT, wrote: 0, refused_because: sentence }])
  })

  it.skipIf(process.platform !== 'linux')("7. the office's own agent, with no credential, reaches the door, which refuses it for want of a screen", async () => {
    const { answer: reply, printFoldersLeft } = await withNoScreenAndATemporaryFolder('a-print-with-no-credential', () =>
      ask(thisMachine, 'POST', DOOR, A_SMALL_PAGE, {
        'x-mole-office-workspace': 'default',
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': 'a-made-up-printer',
      }),
    )
    expect(reply.status, JSON.stringify(reply.body)).toBe(409)
    expect(reply.body).toMatchObject({ code: 'reportPdfNoDisplay', values: {} })
    expect(printFoldersLeft, 'print folders the door left behind').toEqual([])
  })

  it("8. a pending visitor's print is refused with the pending sentence, and not the visitor one", async () => {
    const handle = 'loquat-pending-printer'
    const { token, credential } = await askedFor(handle)
    expect(credential.standing).toBe('pending')

    const { answer: refused, printFoldersLeft } = await withNoScreenAndATemporaryFolder('a-pending-visitors-print', () =>
      ask(loquat, 'POST', DOOR, A_SMALL_PAGE, carrying(token, handle)),
    )
    expect(refused.status, JSON.stringify(refused.body)).toBe(403)
    expect(refused.body.error).toBe(pendingRefusal(credential))
    expect(String(refused.body.error)).not.toContain('may not print a PDF')
    expect(printFoldersLeft, 'print folders the door left behind').toEqual([])
  })
})
