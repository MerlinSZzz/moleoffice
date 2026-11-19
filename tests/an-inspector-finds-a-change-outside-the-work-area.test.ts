// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { historicalSession } from './synthetic-submission-fixtures.ts'
/** Eligibility fixture update: old sessions omitted their submitted checkout. Eligible fixtures now record the test checkout as workingDirectory. */
/**
 * AN INSPECTOR FINDS A CHANGE OUTSIDE THE WORK AREA, AND THE SERVER NAMES IT.
 *
 * Criterion C25 of design/rules/ACCEPTANCE.md: *the inspector reads the changes through the work
 * area the worker registered.* A change inside the area is read; a change outside it is named and
 * not read. The server's half of that was tested from the start, in
 * `tests/an-inspector-releases-or-refuses-in-one-act.test.ts`, by posting a made-up list of changes
 * straight to the route. This file tests the other half: the tool that finds the changes with git.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS AND WHAT IT MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * On 7 September 2026 the first real check refused a release and, in the refusal, named the gap:
 * `changesIn()` in tools/the-inspector.mjs handed git the work area as its pathspec, so a change
 * outside the area was never discovered — not filtered, not named. The run under check had changed
 * src/web/pages/RecordPage.tsx outside an area of src/server/lib, src/server/api, src/shared, tools
 * and tests, and the check's own prompt did not carry the name. The server's sorting promised to
 * name an outside change and its only caller never found one to name.
 *
 * So this file runs the REAL tool, with `--dry` so no model runs and nothing is written, against a
 * throwaway git checkout whose branch changed one file inside the area and one outside, and against
 * the REAL server on a port of its own, and reads what the server said the changes were.
 *
 * MUTATION: put `'--', ...area` back on the tool's `git diff --name-only` and the first case goes
 * red, because the outside path is never found. Control run first.
 *
 * ---------------------------------------------------------------------------------------
 * A SECOND CHECKOUT, FOR THE WORK-AREA DECISION
 * ---------------------------------------------------------------------------------------
 *
 * A work area may now name specific files at the repository root, beside folders — `bridge.py`,
 * `test_bridge.py` — where the registering card permits it (criterion P92, `src/shared/roles.ts`).
 * `insideTheWorkArea` already matched a file named exactly; what was missing was a card allowed to
 * register one at all. The second describe block below proves the whole path end to end: a worker
 * registers `["bridge.py","test_bridge.py"]`, a run changes both, and the real tool against the real
 * server lists both inside and none outside.
 *
 * MUTATION: remove the `rule.rootFiles === 'by name'` permission from `src/shared/roles.ts` and the
 * registration in that block's `beforeAll` starts failing its own `expect(...).toBe(201)`, so every
 * case in that block goes red before it can even run. Control run first.
 */
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

/** The area the worker registered: one folder. `outside/` is not in it. */
const THE_AREA = ['inside']

let t: TestDb
let app: FastifyInstance
let api = ''
let checkout = ''

async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** `dir` defaults to the shared checkout; the root-files block below passes its own. */
async function fileARun(handle: string, title: string, dir: string = checkout): Promise<string> {
  // Only the historical no-area refusal is unsealed; valid Git fixtures still take real seals.
  if (handle === 'builder-nowhere') return historicalSession(t, { workspaceId: 'default', kind: 'session', title, actor: { type: 'agent', id: handle }, data: { state: 'finished', servingAgent: handle, workingDirectory: dir, doing: 'building the thing under check' } }).id
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(handle),
    payload: {
      kind: 'session',
      title,
      data: { state: 'finished', servingAgent: handle, workingDirectory: dir, doing: 'building the thing under check' },
    },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { record: { id: string } }).record.id
}

/**
 * WHAT THE REAL SERVER ANSWERED THE REAL TOOL, for each run, captured as it left the server.
 *
 * A hook on the app copies the body of every reply to POST /api/checks/<run>/prompt. That is the
 * production route answering the production tool; nothing here is a stand-in. Reading it from the
 * server's own reply, rather than adding a route to read it back, keeps the product free of a route
 * that only a test would call.
 */
const answered = new Map<string, { workArea: string[] | null; inside: { path: string; changes: string }[]; outside: string[]; says: string }>()
const PROMPT_ROUTE = /^\/api\/checks\/([^/]+)\/prompt$/u

function whatTheServerAnswered(run: string): { workArea: string[] | null; inside: { path: string; changes: string }[]; outside: string[]; says: string } {
  const it = answered.get(run)
  if (it === undefined) throw new Error(`the server answered no prompt for run ${run}`)
  return it
}

/** Run the tool dry against a checkout (the shared one by default) and hand back what it printed and how it ended. */
function inspectDry(run: string, dir: string = checkout): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((done) => {
    const child: ChildProcess = spawn(
      process.execPath,
      [INSPECTOR, '--run', run, '--as', 'inspector-one', '--api', api, '--workspace', WORKSPACE, '--checkout', dir, '--dry'],
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
  app = (await apiApp()).app
  app.addHook('onSend', (request, _reply, payload, done) => {
    const at = PROMPT_ROUTE.exec(request.url.split('?')[0] ?? '')
    if (at !== null && request.method === 'POST' && typeof payload === 'string') {
      answered.set(at[1] ?? '', (JSON.parse(payload) as { changes: { workArea: string[] | null; inside: { path: string; changes: string }[]; outside: string[]; says: string } }).changes)
    }
    done(null, payload)
  })
  await app.ready()
  // THE REAL SERVER ON A PORT OF ITS OWN, because the tool is a separate process and reaches the
  // office over HTTP. Port 0 is whatever is free; nothing here touches the live office's port.
  api = await app.listen({ port: 0, host: '127.0.0.1' })
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(AS_THE_PERSON, { handle: 'inspector-one', name: 'Inspector One', role: 'inspector' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'builder-in-an-area', name: 'Builder In An Area', role: 'worker', workArea: THE_AREA })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'builder-nowhere', name: 'Builder Nowhere', role: 'worker' })

  // A CHECKOUT OF ITS OWN: main holds two files, a branch off it changes both. The tool's default
  // base is the merge base with main, so both changes are the branch's.
  checkout = mkdtempSync(join(tmpdir(), 'mole-office-a-checkout-with-an-outside-change-'))
  const git = (...argv: string[]): void => {
    execFileSync('git', argv, { cwd: checkout, stdio: 'ignore' })
  }
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'a-test@example.invalid')
  git('config', 'user.name', 'A test')
  mkdirSync(join(checkout, 'inside'))
  mkdirSync(join(checkout, 'outside'))
  writeFileSync(join(checkout, 'inside', 'the-work.txt'), 'What the worker was asked to build.\n')
  writeFileSync(join(checkout, 'outside', 'a-page.txt'), 'A page the worker was not asked to touch.\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'Before the work')
  git('checkout', '-q', '-b', 'the-work')
  writeFileSync(join(checkout, 'inside', 'the-work.txt'), 'What the worker was asked to build.\nAND WHAT IT BUILT INSIDE.\n')
  writeFileSync(join(checkout, 'outside', 'a-page.txt'), 'A page the worker was not asked to touch.\nAND WHAT IT CHANGED OUTSIDE.\n')
  git('commit', '-qam', 'The work, and a change outside the area')
})

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(checkout, { recursive: true, force: true })
})

describe('C25 — the tool finds a change outside the work area and the server names it', () => {
  it('names the outside path, reads the inside diff, and reads nothing of the outside one', async () => {
    const run = await fileARun('builder-in-an-area', 'Builder In An Area, the run under check')
    const ran = await inspectDry(run)
    expect(ran.code, ran.err).toBe(0)
    expect(ran.out).toContain('Changed files: 1 inside the work area, 1 outside it.')
    expect(ran.out).toContain('no model ran and no verdict was written')

    const changes = whatTheServerAnswered(run)
    // THE WHOLE POINT: the outside change is found and named, where before it was never found.
    expect(changes.outside).toEqual(['outside/a-page.txt'])
    expect(changes.says).toContain('outside/a-page.txt')
    expect(changes.says).toContain('named but not read here')
    // The inside change is read: its diff is the real one git gave, not a sentence about it.
    expect(changes.inside.map((one) => one.path)).toEqual(['inside/the-work.txt'])
    expect(changes.inside[0]?.changes).toContain('+AND WHAT IT BUILT INSIDE.')
    // And the outside file's words were never read into the request at all.
    expect(JSON.stringify(changes)).not.toContain('AND WHAT IT CHANGED OUTSIDE')
  })

  it('still names every change when nobody recorded a work area, so a run nobody can check this way is not one with nothing to check', async () => {
    const run = await fileARun('builder-nowhere', 'Builder Nowhere, the run under check')
    const ran = await inspectDry(run)
    // Old wording: “still names every change when nobody recorded a work area”.
    // A decision now refuses this start before reading changes or allocating a
    // worktree.
    expect(ran.code).toBe(1)
    expect(ran.err).toContain('CHECK_NOT_ELIGIBLE')
    expect(ran.err).toContain('registered work area')
    expect(ran.out).not.toContain('The check reads its own worktree')
  })
})

describe('C25 — a worker registers files at the repository root, and both read inside', () => {
  /** One of the owner's decisions, of 14 September 2026: named root files beside folders. */
  const ROOT_AREA = ['bridge.py', 'test_bridge.py']
  let rootCheckout = ''

  beforeAll(async () => {
    await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'builder-root-files', name: 'Builder Root Files', role: 'worker', workArea: ROOT_AREA })

    // A SECOND CHECKOUT OF ITS OWN, holding only the two root files the area names, so the diff
    // between main and the branch is exactly the two changes this proves are read inside.
    rootCheckout = mkdtempSync(join(tmpdir(), 'mole-office-a-checkout-with-root-files-'))
    const git = (...argv: string[]): void => {
      execFileSync('git', argv, { cwd: rootCheckout, stdio: 'ignore' })
    }
    git('init', '-q', '-b', 'main')
    git('config', 'user.email', 'a-test@example.invalid')
    git('config', 'user.name', 'A test')
    writeFileSync(join(rootCheckout, 'bridge.py'), '# the bridge\n')
    writeFileSync(join(rootCheckout, 'test_bridge.py'), '# its test\n')
    git('add', '-A')
    git('commit', '-q', '-m', 'Before the work')
    git('checkout', '-q', '-b', 'the-work')
    writeFileSync(join(rootCheckout, 'bridge.py'), '# the bridge\n# AND WHAT IT BUILT.\n')
    writeFileSync(join(rootCheckout, 'test_bridge.py'), '# its test\n# AND WHAT IT PROVED.\n')
    git('commit', '-qam', 'The work, entirely at the repository root')
  })

  afterAll(() => {
    rmSync(rootCheckout, { recursive: true, force: true })
  })

  it('lists both root files inside the work area and none outside', async () => {
    const run = await fileARun('builder-root-files', 'Builder Root Files, the run under check', rootCheckout)
    const ran = await inspectDry(run, rootCheckout)
    expect(ran.code, ran.err).toBe(0)
    expect(ran.out).toContain('Changed files: 2 inside the work area, 0 outside it.')

    const changes = whatTheServerAnswered(run)
    // THE WHOLE POINT: both root files are inside the area, and none is outside it.
    expect(changes.workArea).toEqual(ROOT_AREA)
    expect(changes.outside).toEqual([])
    expect(changes.inside.map((one) => one.path).sort()).toEqual(['bridge.py', 'test_bridge.py'])
    expect(changes.says).toBe('2 of 2 changed files are inside the work area (bridge.py, test_bridge.py).')
  })
})
