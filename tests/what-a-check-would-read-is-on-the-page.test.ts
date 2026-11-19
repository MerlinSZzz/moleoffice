// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Eligibility fixture update: old sessions omitted their submitted checkout. Eligible fixtures now record the test checkout as workingDirectory. */
/**
 * WHAT THE DRY RUN PRINTS IS READABLE IN MOLE OFFICE, NOT ONLY IN A TERMINAL.
 *
 * THE RULE, from the same message that asked C28's question: a user may never be asked to run a
 * command in a terminal, and everything must be possible inside Mole Office.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED FIRST
 * ---------------------------------------------------------------------------------------
 *
 * `node tools/the-inspector.mjs --run <run> --as <handle> --dry` prints five things: the prompt's
 * size in bytes, what the whole code of law at full would have been, which chapters were written
 * out further and at what cost, how many changed files are inside the work area and how many
 * outside it, and the base they were read against. Before this change none of the five was in
 * `GET /api/checks/<run>`: that reply carried the run, the brief, the chapters, the precedents, the
 * reports, what the run wrote and the work area, and stopped there. The five existed only in
 * whatever terminal the tool had been run in.
 *
 * TWO OF THE FIVE THE SERVER CANNOT WORK OUT FOR ITSELF. The file list and the base need a checkout
 * on disk, and nothing under src/ reads a working tree. So the process
 * that can read one is the one that says, through POST /api/checks/<run>/assembled, and the reply
 * to the read hands it back.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED WHEN THE CODE IS REMOVED. Control run first.
 * ---------------------------------------------------------------------------------------
 *
 *   - Take `whatTheCheckWouldRead` off the reply of GET /api/checks/:run, and the first two cases go
 *     red.
 *   - Have the tool skip its POST to /assembled, and the first case goes red: the run says nobody
 *     has assembled one, which is then a false answer rather than a true one.
 *   - Answer an empty object instead of the sentence where nobody has assembled a check, and the
 *     last case goes red — "nobody has looked" and "there is nothing there" must not read alike.
 *   - Drop `base` from what is remembered, and the case that reads the base back goes red.
 */
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const INSPECTOR = join(REPO, 'tools', 'the-inspector.mjs')
const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': WORKSPACE,
}
const asAgent = (id: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
  'x-mole-office-workspace': WORKSPACE,
})

/** The area the worker registered: `work` is in it, `elsewhere` is not. */
const THE_AREA = ['work']

let t: TestDb
let app: FastifyInstance
let api = ''
let checkout = ''

interface WouldRead {
  at: string
  bytes: number
  wholeCodeBytes: number
  chaptersAt: { chapter: number; level: string; bytes: number }[]
  inside: string[]
  outside: string[]
  base?: { ref: string; how: string; says: string }
  says: string
}

async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
}

async function fileARun(handle: string, title: string): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(handle),
    payload: {
      kind: 'session',
      title,
      data: { state: 'finished', servingAgent: handle, workingDirectory: checkout, doing: 'building the thing under check' },
    },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { record: { id: string } }).record.id
}

/** What a person reading this run in Mole Office is shown. Nothing here runs git. */
async function thePage(run: string): Promise<{ whatTheCheckWouldRead: WouldRead | null; whatTheCheckWouldReadSays: string }> {
  const reply = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as { whatTheCheckWouldRead: WouldRead | null; whatTheCheckWouldReadSays: string }
}

/** Run the tool dry, exactly as a person would, and hand back what it printed. */
function inspectDry(run: string): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((done) => {
    const child: ChildProcess = spawn(
      process.execPath,
      [INSPECTOR, '--run', run, '--as', 'inspector-one', '--api', api, '--workspace', WORKSPACE, '--checkout', checkout, '--dry'],
      { cwd: REPO, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let out = ''
    let err = ''
    child.stdout?.on('data', (d) => {
      out += String(d)
    })
    child.stderr?.on('data', (d) => {
      err += String(d)
    })
    child.on('close', (code) => {
      done({ code, out, err })
    })
  })
}

beforeAll(async () => {
  t = await freshDb()
  // THE DEFAULT SET, COPIED AS A NEW OFFICE DOES AT ITS FIRST START: the check measures the whole of the regulations from
  // the office's own chapter records (wave 13w). Imported after freshDb, which resets the modules.
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  app = (await apiApp()).app
  await app.ready()
  api = await app.listen({ port: 0, host: '127.0.0.1' })
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(AS_THE_PERSON, { handle: 'inspector-one', name: 'Inspector One', role: 'inspector' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'the-worker', name: 'The Worker', role: 'worker', workArea: THE_AREA })

  // A CHECKOUT OF ITS OWN, with one change inside the area and one outside it.
  checkout = mkdtempSync(join(tmpdir(), 'mole-office-what-a-check-would-read-'))
  const quiet = (...argv: string[]): void => {
    execFileSync('git', argv, { cwd: checkout, stdio: 'ignore' })
  }
  quiet('init', '-q', '-b', 'main')
  quiet('config', 'user.email', 'a-test@example.invalid')
  quiet('config', 'user.name', 'A test')
  mkdirSync(join(checkout, 'work'))
  mkdirSync(join(checkout, 'elsewhere'))
  writeFileSync(join(checkout, 'work', 'the-work.txt'), 'Before.\n')
  writeFileSync(join(checkout, 'elsewhere', 'a-page.txt'), 'Before.\n')
  quiet('add', '-A')
  quiet('commit', '-q', '-m', 'Before the work')
  quiet('checkout', '-q', '-b', 'the-work')
  writeFileSync(join(checkout, 'work', 'the-work.txt'), 'Before.\nAND AFTER, inside the area.\n')
  writeFileSync(join(checkout, 'elsewhere', 'a-page.txt'), 'Before.\nAND AFTER, outside it.\n')
  quiet('commit', '-qam', 'The work, and a change outside the area')
})

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(checkout, { recursive: true, force: true })
})

describe('what a check of this run would read', () => {
  it('is on the run after a dry run, so a person reads it without the terminal', async () => {
    const run = await fileARun('the-worker', 'A run whose check has been assembled once')

    // BEFORE: nobody has assembled one, and the page says exactly that.
    const before = await thePage(run)
    expect(before.whatTheCheckWouldRead).toBe(null)
    expect(before.whatTheCheckWouldReadSays).toContain('Nobody has assembled a check for this run yet')

    const ran = await inspectDry(run)
    expect(ran.code, ran.err).toBe(0)

    // AFTER: the five things the terminal printed are answered by the read, with no git anywhere.
    const after = await thePage(run)
    const read = after.whatTheCheckWouldRead
    expect(read).not.toBe(null)
    expect(read?.bytes).toBeGreaterThan(0)
    expect(read?.wholeCodeBytes).toBeGreaterThan(0)
    expect(read?.inside).toEqual(['work/the-work.txt'])
    expect(read?.outside).toEqual(['elsewhere/a-page.txt'])
    expect(read?.base?.how).toBe('fork point')
    expect(Array.isArray(read?.chaptersAt)).toBe(true)
  })

  it('answers the same numbers the terminal printed, so the two cannot disagree', async () => {
    const run = await fileARun('the-worker', 'A run to compare the terminal and the page on')
    const ran = await inspectDry(run)
    expect(ran.code, ran.err).toBe(0)

    const read = (await thePage(run)).whatTheCheckWouldRead
    expect(read).not.toBe(null)
    // The tool prints "The prompt is N bytes." and the page must hold the same N.
    expect(ran.out).toContain(`The prompt is ${String(read?.bytes ?? -1)} bytes.`)
    expect(ran.out).toContain(
      `Changed files: ${String(read?.inside.length ?? -1)} inside the work area, ${String(read?.outside.length ?? -1)} outside it.`,
    )
    expect(ran.out).toContain(`The base is ${read?.base?.ref ?? 'nothing'},`)
    // And the sentence a person reads carries the same two figures rather than a second reading.
    expect(read?.says).toContain(String(read?.bytes ?? -1))
    expect(read?.says).toContain(String(read?.wholeCodeBytes ?? -1))
  })

  it('says nobody has looked rather than showing an empty check, for a run nobody assembled', async () => {
    const run = await fileARun('the-worker', 'A run nobody has ever assembled a check for')
    const page = await thePage(run)

    expect(page.whatTheCheckWouldRead).toBe(null)
    // THE DIFFERENCE THIS SENTENCE HOLDS: a check nobody looked at, not a check with nothing in it.
    expect(page.whatTheCheckWouldReadSays).toContain('nothing here can say what one would read')
    expect(page.whatTheCheckWouldReadSays).toContain('not a check with nothing in it')
    expect(page.whatTheCheckWouldReadSays).not.toContain('0 bytes')
  })
})
