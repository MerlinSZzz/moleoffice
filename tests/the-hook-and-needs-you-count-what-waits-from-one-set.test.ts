// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readTheHookDetails } from './hook-details.ts'
/**
 * THE HOOK AND GET /api/needs-you SAY WHAT WAITS ON THE PERSON FROM ONE SET, GET /api/waiting.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * The session hook counted GET /api/needs-you's `actions` and printed "Nothing is waiting on a
 * person right now." to every agent that started. needs-you lists only forks, card requests and
 * admissions, and when those were empty its note said "Nothing is waiting on you". Both were false
 * whenever GET /api/waiting held items: a record whose move is the person's (problem fnH7QaRvvkd9),
 * an unread message to the owner, a pending credential. Problem MNyo3ZasS50W is the count a report gave
 * and the queue could not produce. The hook also counted a read that failed as zero.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED
 * ---------------------------------------------------------------------------------------
 *
 *   (a) A record whose move is the person's, with no fork and no card request, is counted under
 *       `asked` by GET /api/waiting; needs-you's `waiting` and note give the same counts; the hook
 *       prints the same counts. All three numbers are asserted equal in one office.
 *   (b) With nothing waiting, the hook prints its nothing line and needs-you's note is the empty
 *       sentence with three zeros.
 *   (c) When the office answers GET /api/waiting with an error, the hook says it could not read and
 *       gives no count.
 *   (d) The bootstrap's owner_waiting note, with no fork open, says it counts forks only and
 *       where everything waiting on the person is.
 *   (e) A copy of a project with no open fork says it counts forks only and names no request,
 *       because a copy goes to a reader with no API (criterion B19).
 *
 * IT RUNS THE REAL HOOK, as tests/the-hook-counts-runs-something-stands-behind.test.ts does:
 * `node tools/session-hook.mjs start` against a listening test office on a throwaway database, with
 * HOME set to an empty folder this file made, so nothing reads or writes the real home.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { BUNDLE_RUNGS, SCOPE_NAMES } from '../src/shared/bundles.ts'

const HOOK = fileURLToPath(new URL('../tools/session-hook.mjs', import.meta.url))
/** This case's own project, so GET /api/waiting counts what this case put there. */
let WORKSPACE = 'default'
let PERSON_HEADERS = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': WORKSPACE,
}

let t: TestDb
let server: Awaited<ReturnType<typeof apiApp>> | null = null
/** The second server the error case needs, because a Fastify hook cannot be added after it started. */
let errorServer: Awaited<ReturnType<typeof apiApp>> | null = null
let url: string
let sharedUrl: string
let scratch: string
let emptyHome: string
let realHome: string | undefined
let caseNumber = 0

beforeAll(async () => {
  t = await freshDb()
  server = await apiApp()
  await server.app.listen({ port: 0, host: '127.0.0.1' })
  const address = server.app.server.address()
  sharedUrl = `http://127.0.0.1:${String(typeof address === 'object' && address !== null ? address.port : 0)}`
  url = sharedUrl
  // AN EMPTY HOME, made here, for the server in this process and for the hook child, which
  // inherits it. Nothing this file runs can reach the real home.
  emptyHome = mkdtempSync(join(tmpdir(), 'mole-office-one-waiting-count-home-'))
  realHome = process.env['HOME']
  process.env['HOME'] = emptyHome
}, 60_000)

afterAll(async () => {
  if (server !== null) await server.app.close()
  server = null
  t.close()
  if (realHome === undefined) delete process.env['HOME']
  else process.env['HOME'] = realHome
  rmSync(emptyHome, { recursive: true, force: true })
})

beforeEach(() => {
  caseNumber += 1
  WORKSPACE = `panelx-case-${String(caseNumber)}`
  PERSON_HEADERS = { ...PERSON_HEADERS, 'x-mole-office-workspace': WORKSPACE }
  const at = '2026-08-14 09:00:00'
  t.client.sqlite
    .prepare('INSERT INTO workspaces (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(WORKSPACE, `A test project ${String(caseNumber)}`, at, at)
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-one-waiting-count-'))
  // WHAT GET /api/waiting COUNTS IS NOT NARROWED TO A PROJECT, so each case starts with its own problems and none
  // left by the case before.
  t.client.sqlite.prepare("DELETE FROM records WHERE kind = 'problem'").run()
})

afterEach(async () => {
  if (errorServer !== null) await errorServer.app.close()
  errorServer = null
  url = sharedUrl
  rmSync(scratch, { recursive: true, force: true })
})

/** The notes the hook leaves beside the checkout, removed so one test cannot see another's. */
const notesWritten: string[] = []
afterEach(() => {
  const stateDir = fileURLToPath(new URL('../.logs', import.meta.url))
  for (const name of notesWritten.splice(0)) rmSync(join(stateDir, name), { force: true })
})

/**
 * Start the test office. `waitingFails` makes it answer GET /api/where-you-stand, the one read that
 * carries the hook's waiting counts, with a 500 and nothing else changes, which is the error reply
 * case (c) needs.
 */
/**
 * Point this case's hook at the office. The shared office already answers; the error case needs a second one, because a
 * Fastify hook has to be added before the server starts.
 */
async function startOffice(options: { waitingFails?: boolean } = {}): Promise<void> {
  if (options.waitingFails !== true) return
  errorServer = await apiApp()
  errorServer.app.addHook('onRequest', async (req, reply) => {
    if (req.url.split('?')[0] === '/api/where-you-stand') {
      await reply.code(500).send({ error: 'the test broke this reading on purpose' })
    }
  })
  await errorServer.app.listen({ port: 0, host: '127.0.0.1' })
  const address = errorServer.app.server.address()
  url = `http://127.0.0.1:${String(typeof address === 'object' && address !== null ? address.port : 0)}`
}

async function get(path: string): Promise<{ status: number; body: any }> {
  const office = errorServer ?? server
  if (office === null) throw new Error('the test office is not started')
  const res = await office.app.inject({ method: 'GET', url: path, headers: PERSON_HEADERS })
  return { status: res.statusCode, body: res.json() }
}

/** Run the hook the way Claude Code runs it, and return what it printed. */
async function runHook(): Promise<string> {
  const id = `test-${Math.random().toString(36).slice(2)}-${Date.now()}`
  notesWritten.push(`session-${id}.json`)
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    MOLE_OFFICE_API: url,
    MOLE_OFFICE_WORKSPACE: WORKSPACE,
    MOLE_OFFICE_DB: t.file,
    MOLE_HOOK_DETAILS_FOLDER: join(scratch, 'hook-details'),
  }
  delete env['TMUX_PANE']
  return await new Promise<string>((resolve, reject) => {
    const child = execFile('node', [HOOK, 'start'], { encoding: 'utf8', env }, (error, stdout) => {
      if (error !== null) reject(error)
      else resolve(stdout)
    })
    child.stdin?.end(JSON.stringify({ session_id: id, cwd: scratch }))
  })
}

/** Every line the hook printed about what is waiting on a person, whichever of the three it is. */
function waitingLines(printed: string): string[] {
  return readTheHookDetails(printed)
    .split('\n')
    .filter(
      (line) =>
        line.startsWith('Waiting on a person') ||
        line.startsWith('Nothing is waiting on a person') ||
        line.startsWith('Could not read what is waiting on a person'),
    )
}

describe('the hook and needs-you count what waits on the person from GET /api/waiting', () => {
  it('(a) counts a record whose move is the person, with no fork and no card request, the same three ways', async () => {
    await startOffice()
    t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'problem',
      title: 'Somebody has to say which bench this goes on',
      data: { symptom: 'nobody knows which bench', state: 'open', whose_move: 'person' },
      actor: t.api.HUMAN,
    })

    const printed = await runHook()

    const waiting = await get('/api/waiting')
    expect(waiting.status).toBe(200)
    const counts = waiting.body.counts as { settle: number; asked: number; setAside: number }
    expect(counts.asked).toBe(1)

    const needs = await get('/api/needs-you')
    expect(needs.status).toBe(200)
    // NO FORK AND NO CARD REQUEST, so the list of acts is empty, and still something waits.
    expect(needs.body.actions).toEqual([])
    expect(needs.body.waiting).toEqual(counts)
    expect(needs.body.note).not.toContain('Nothing is waiting on you')
    expect(needs.body.note).toBe(
      'No fork is open for a person to settle, and no agent is waiting for a card or an admission. ' +
        'This door lists only those acts. Everything waiting on the person is at GET /api/waiting: ' +
        `${counts.settle} to settle, ${counts.asked} asked of the person, ${counts.setAside} set aside.`,
    )

    // THE HOOK'S NUMBERS ARE GET /api/waiting's NUMBERS, in the same office. Problem MNyo3ZasS50W.
    expect(waitingLines(printed)).toEqual([
      `Waiting on a person (GET /api/waiting): ${counts.settle} to settle, ${counts.asked} asked of a person, ` +
        `${counts.setAside} set aside. These are the person's to answer; you may not settle them.`,
    ])
  })

  it('(b) says nothing is waiting only when all three counts are zero', async () => {
    await startOffice()

    const printed = await runHook()

    const waiting = await get('/api/waiting')
    expect(waiting.body.counts).toEqual({ settle: 0, asked: 0, setAside: 0 })
    expect(waitingLines(printed)).toEqual([
      'Nothing is waiting on a person right now: GET /api/waiting lists nothing for a person to settle, ' +
        'nothing asked of a person and nothing set aside.',
    ])

    const needs = await get('/api/needs-you')
    expect(needs.body.waiting).toEqual({ settle: 0, asked: 0, setAside: 0 })
    expect(needs.body.note).toBe(
      'No fork is open for a person to settle, and no agent is waiting for a card or an admission. ' +
        'This door lists only those acts. Everything waiting on the person is at GET /api/waiting: ' +
        '0 to settle, 0 asked of the person, 0 set aside.',
    )
  })

  it('(c) says it could not read, and gives no count, when the read that carries the counts answers an error', async () => {
    await startOffice({ waitingFails: true })
    const waiting = await get('/api/where-you-stand')
    expect(waiting.status).toBe(500)

    const printed = await runHook()

    // A READ THAT DID NOT HAPPEN IS NEVER A ZERO (invariant 5).
    expect(waitingLines(printed)).toEqual([
      'Could not read what is waiting on a person: GET /api/where-you-stand, which carries it, answered 500 ' +
        '(the test broke this reading on purpose). GET /api/waiting answers it alone.',
    ])
    expect(printed).not.toMatch(/\d+ to settle/)
  })

  it('(d) the bootstrap says its owner_waiting counts forks only when no fork is open', async () => {
    await startOffice()
    t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'problem',
      title: 'Somebody has to say which bench this goes on',
      data: { symptom: 'nobody knows which bench', state: 'open', whose_move: 'person' },
      actor: t.api.HUMAN,
    })
    const boot = await get('/api/project/bootstrap')
    expect(boot.status).toBe(200)
    expect(boot.body.owner_waiting.waiting).toBe(0)
    // SOMETHING IS WAITING ON THE PERSON HERE, and the note must not say otherwise.
    expect(boot.body.owner_waiting.note).toBe(
      'No fork is open in this project. This counts forks only, not everything waiting on the person. ' +
        'Everything waiting on the person is at GET /api/waiting.',
    )
  })

  it('(e) a copy of a project with no open fork says it counts forks only, and names no request', async () => {
    await startOffice()
    t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'problem',
      title: 'Somebody has to say which bench this goes on',
      data: { symptom: 'nobody knows which bench', state: 'open', whose_move: 'person' },
      actor: t.api.HUMAN,
    })
    const aRequest = /\b(GET|POST|PUT|PATCH|DELETE)\s+\/api\//
    for (const detail of BUNDLE_RUNGS) {
      const copy = await get(
        `/api/bundles/preview?preset=custom&slots=${SCOPE_NAMES.join(',')}&detail=${String(detail)}&budgetBytes=262144`,
      )
      expect(copy.status, JSON.stringify(copy.body)).toBe(200)
      const waitingPart = (copy.body.parts as { name: string; says: string }[]).find((part) => part.name === 'waitingOnYou')
      expect(waitingPart?.says, `at ${String(detail)}`).toBe(
        'No fork is open in this project. This counts forks only, not everything waiting on the person.',
      )
      const text = String(copy.body.text)
      expect(text.split('\n').filter((line) => aRequest.test(line)), `at ${String(detail)}`).toEqual([])
    }
  })
})
