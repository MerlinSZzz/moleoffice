// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readTheHookDetails } from './hook-details.ts'
/**
 * THE HOOK SAYS WHERE YOU ARE WHEN THE SESSION IS NOT IN THE CHECKOUT.
 *
 * F15 point 1, criterion C3. The hook resolves the API and the checkout it belongs to from an
 * absolute path, so it already runs from anywhere. What it could not say was which project an
 * arbitrary directory belongs to, because that answer is in the records rather than in the
 * checkout. It now asks wave 1's read — `GET /api/onboarding?directory=` — with the project header
 * LEFT OFF, so the directory decides.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED, AND WHY IT IS DRIVEN AS A CHILD PROCESS
 * ---------------------------------------------------------------------------------------
 *
 * The hook is spawned the way Claude Code spawns it, with a payload on stdin, against a listening
 * server, so what is measured is the real line and not a function called by hand:
 *
 *   1. a directory a registered repository root holds is named as that project;
 *   2. a directory nothing holds says nothing matched and asks for a project, and never says the
 *      directory is in the default project or in any other. The record the start files is in a project
 *      all the same, so the start says which one, that it is there for now, and how to move it. Until
 *      13 October 2026 this point said "never names the default", and the start said nothing of where
 *      its record went. Answer IoAiAKB7s690: a record filed in a project with no word is a
 *      silent default, and what the old point protects is that the hook never claims the folder
 *      belongs to that project;
 *   3. the line says which agent this session answers as, agreeing with the checkout's own
 *      declaration of that fact;
 *   4. after a compaction (problem ihekMM954ojG), the environment's agent and run, or the handle a waiter
 *      holds on the session's own record, name the session; when nothing names it the hook says it
 *      cannot tell and claims nothing; and a throw inside the hook still exits 0 and says what failed.
 *      The three-run proof of each of these is written above its case.
 *   5. an unnamed owner's sentence from onboarding comes first on both start paths; named owners,
 *      older or unreadable replies and absent sentences leave the other start lines as they were. The
 *      kept answer's sentence, which says its own age, is left out of those comparisons.
 *
 * `HOME` points at a scratch directory for every run, so the hook never reads or writes the owner's
 * own `~/.claude`.
 *
 * THE SPAWN IS ASYNCHRONOUS ON PURPOSE. `spawnSync` blocks this process's event loop, and the API
 * the child talks to is listening IN this process, so a synchronous spawn would deadlock the server
 * and every fetch would time out. `execFile` + a promise is what lets the child reach it.
 */

import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { fromEnvFile } from '../tools/where-is-the-api.mjs'
import { THE_PERSON } from '../src/shared/person.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url))
const HOOK = join(CHECKOUT, 'tools', 'session-hook.mjs')

let t: TestDb
let server: Awaited<ReturnType<typeof apiApp>>
let url: string
const notesWritten: string[] = []
const hookHomes: string[] = []
let changeOnboarding: ((body: Record<string, unknown>) => void) | null = null
const unreadableRoutes = new Set<string>()
let onboardingReads = 0
let refuseFiling = false
let timeoutStanding = false

beforeAll(async () => {
  t = await freshDb()
  server = await apiApp()
  server.app.addHook('onRequest', async (request, reply) => {
    if (timeoutStanding && request.url === '/api/where-you-stand') {
      reply.hijack()
      return reply
    }
    if (refuseFiling && request.method === 'POST' && request.url === '/api/records') {
      return reply.code(503).send({ error: 'This test office is not accepting session records.' })
    }
  })
  // Change only the specified reply from this case's office. The hook still makes real requests,
  // reads the world's header and prints through either of its two start-message paths.
  server.app.addHook('onSend', async (request, _reply, payload) => {
    const route = request.url.split('?')[0] ?? ''
    if (route === '/api/onboarding') onboardingReads++
    if (unreadableRoutes.has(route)) return 'The test office could not answer with JSON.'
    if (route === '/api/onboarding' && changeOnboarding !== null && typeof payload === 'string') {
      const body = JSON.parse(payload) as Record<string, unknown>
      changeOnboarding(body)
      return JSON.stringify(body)
    }
    return payload
  })
  await server.app.listen({ port: 0, host: '127.0.0.1' })
  const address = server.app.server.address()
  url = `http://127.0.0.1:${String(typeof address === 'object' && address !== null ? address.port : 0)}`
}, 60_000)

afterEach(() => {
  changeOnboarding = null
  unreadableRoutes.clear()
  refuseFiling = false
  timeoutStanding = false
  for (const home of hookHomes.splice(0)) rmSync(home, { recursive: true, force: true })
  const stateDir = join(CHECKOUT, '.logs')
  for (const name of notesWritten.splice(0)) rmSync(join(stateDir, name), { force: true })
})

afterAll(async () => {
  await server.app.close()
  t.close()
})

/**
 * Run the hook the way Claude Code runs it, from `cwd`, and hand back everything it printed.
 *
 * `agent` overrides `MOLE_OFFICE_AGENT` for this run. Absent means the checkout's own declaration
 * answers, which on this machine may name an agent. `more` sets further variables, `sessionId` fixes
 * the conversation id so a case can write the note an earlier start would have written, and a
 * non-zero exit rejects, so every case also proves the hook exited 0.
 */
async function runHook(
  cwd: string,
  agent: string | null = null,
  more: { env?: NodeJS.ProcessEnv; sessionId?: string } = {},
): Promise<string> {
  const sessionId = more.sessionId ?? `test-${String(Date.now())}-${String(Math.random()).slice(2)}`
  notesWritten.push(`session-${sessionId}.json`)
  const home = mkdtempSync(join(tmpdir(), 'mole-office-hook-home-'))
  hookHomes.push(home)
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    MOLE_HOOK_DETAILS_FOLDER: join(home, 'details'),
    MOLE_OFFICE_API: url,
    MOLE_OFFICE_WORKSPACE: 'default',
    MOLE_OFFICE_DB: t.file,
  }
  // THE RUN AND THE KEY ARE THE CASE'S TO SET. The test runner removes both already; this says so here
  // too, so no case can pass on a run or a key it did not name.
  delete env['MOLE_OFFICE_SESSION']
  delete env['MOLE_AGENT_KEY']
  if (agent === null) delete env['MOLE_OFFICE_AGENT']
  else env['MOLE_OFFICE_AGENT'] = agent
  Object.assign(env, more.env ?? {})

  return await new Promise<string>((resolve, reject) => {
    const child = execFile('node', [HOOK, 'start'], { encoding: 'utf8', env }, (error, stdout) => {
      if (error !== null) reject(error)
      else {
        resolve(stdout)
      }
    })
    child.stdin?.end(JSON.stringify({ session_id: sessionId, cwd }))
  })
}

/** The five reads the hook makes to say where a session stands, the one read last. */
const EVERY_START_READ = ['/api/resources/orphans', '/api/sessions', '/api/handles', '/api/resources', '/api/where-you-stand']

/**
 * THE START TEXT WITHOUT THE KEPT ANSWER'S SENTENCE, for the cases that compare two hook runs line by line.
 * When the office is busy, GET /api/where-you-stand gives the answer it kept, and the hook prints the office's
 * sentence saying when that answer was worked out and how many seconds before the request. Two runs a second
 * apart then differ in that number, and a refresh between them can leave the sentence in one and not the
 * other. The first answer in a new test process can take longer than the 1,500 ms that makes the office busy,
 * so these comparisons were red alone on main (wave 13y round 58). The sentence and its blank line are taken
 * out of both texts, and every other line is still compared word for word. The sentence itself is proved in
 * tests/a-compacted-session-is-told-where-it-stands-under-load.test.ts.
 */
function withoutTheKeptSentence(text: string): string {
  return text.replace(/\n\nThis was worked out at [^\n]*, and kept, because the office was busy: [^\n]* answer what holds now\.(?=\n|$)/, '')
}

describe('when only the one read misses', () => {
  // MUTATION: taking the "not answering" exit when only GET /api/where-you-stand failed, as it was taken
  // when only the waiting read failed. Under load that read is the slow one, and the office is answering.
  it('says which read missed and never that the office is not answering', async () => {
    refuseFiling = true
    const directory = mkdtempSync(join(tmpdir(), 'mole-office-hook-one-read-'))
    try {
      unreadableRoutes.add('/api/where-you-stand')
      const out = await runHook(directory)
      expect(out).not.toContain('Mole Office is not answering')
      expect(readTheHookDetails(out)).toContain('GET /api/where-you-stand, which carries it, answered')
      expect(readTheHookDetails(out)).toContain('GET /api/waiting answers it alone.')
      expect(readTheHookDetails(out)).toContain('GET /api/open-loops answers it alone.')
      expect(readTheHookDetails(out)).toContain('Mole Office did not answer the brief, so this run was told nothing about the project. GET /api/brief.')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})

describe.each([
  { path: 'the usual start message', waitingFails: false },
  { path: 'the start message when no start read answers', waitingFails: true },
])('the owner comes first in $path', ({ waitingFails }) => {
  let directory: string
  let ownerSays: string
  let withoutOwner: string
  let previousOwner: { id: string; name: string; office_owner: string }

  beforeEach(async () => {
    // Keep the office's session counts stable across the two output comparisons. Refusing writes
    // also leaves id null, which the failed reads need to reach the other start path.
    refuseFiling = true
    // Most tests install a named owner. Make this case's database unnamed and put it back after
    // the case, so the real onboarding route supplies the sentence rather than a copied fixture.
    previousOwner = t.client.sqlite.prepare('SELECT id, name, office_owner FROM people WHERE office_owner IS NOT NULL').get() as typeof previousOwner
    t.client.sqlite.prepare("UPDATE people SET office_owner = 'unnamed' WHERE id = ?").run(previousOwner.id)
    directory = mkdtempSync(join(tmpdir(), 'mole-office-hook-owner-'))
    const reply = await fetch(`${url}/api/onboarding?directory=${encodeURIComponent(directory)}`)
    expect(reply.status).toBe(200)
    const body = await reply.json() as { owner: { named: boolean; says: string } }
    expect(body.owner.named).toBe(false)
    ownerSays = body.owner.says
    expect(ownerSays).toContain('#/welcome')
    // NOTHING ANSWERS: the one read and the four small ones. The hook says the office is not answering
    // only then (a condition, message xc233fjcrLe2).
    if (waitingFails) for (const route of EVERY_START_READ) unreadableRoutes.add(route)
    changeOnboarding = (body) => { delete body.owner }
    withoutOwner = withoutTheKeptSentence(readTheHookDetails(await runHook(directory)))
    expect(withoutOwner.split('\n')[0]).toMatch(/^MOLE OFFICE —/)
    changeOnboarding = null
  })

  afterEach(() => {
    t.client.sqlite.prepare('UPDATE people SET name = ?, office_owner = ? WHERE id = ?').run(previousOwner.name, previousOwner.office_owner, previousOwner.id)
    rmSync(directory, { recursive: true, force: true })
  })

  // MUTATIONS: the line left out; the line printed after the other lines instead of first.
  it('prints the unnamed office’s sentence word for word as the first line, before every other line', async () => {
    const readsBefore = onboardingReads
    const out = await runHook(directory)
    expect(onboardingReads - readsBefore, 'the hook must reuse its one onboarding read').toBe(1)
    expect(out.split('\n')[0]).toBe(ownerSays)
    expect(withoutTheKeptSentence(readTheHookDetails(out))).toBe(`${ownerSays}\n${withoutOwner}`)
  })

  // MUTATION: the line printed when the owner is named. Keep a stale says field in the reply too,
  // so the test proves the named guard rather than passing because a named reply lacks that field.
  it('prints no owner sentence once the person has named themselves, even with stale says in the reply', async () => {
    const owner = t.client.sqlite.prepare('SELECT id, name, office_owner FROM people WHERE office_owner IS NOT NULL').get() as {
      id: string; name: string; office_owner: string
    }
    try {
      const named = await server.app.inject({
        method: 'POST', url: '/api/office/owner',
        headers: { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': owner.id },
        payload: { name: 'Hook test owner' },
      })
      expect(named.statusCode, named.body).toBe(200)
      // Naming the owner changes the brief's size. Compare with the same named office's output.
      changeOnboarding = (body) => { delete body.owner }
      const namedWithoutOwner = withoutTheKeptSentence(readTheHookDetails(await runHook(directory)))
      changeOnboarding = (body) => {
        expect(body.owner).toMatchObject({ named: true, name: 'Hook test owner' })
        const namedOwner = body.owner as Record<string, unknown>
        namedOwner.says = ownerSays
      }
      expect(withoutTheKeptSentence(readTheHookDetails(await runHook(directory)))).toBe(namedWithoutOwner)
    } finally {
      t.client.sqlite.prepare('UPDATE people SET name = ?, office_owner = ? WHERE id = ?').run(owner.name, owner.office_owner, owner.id)
    }
  })

  it('prints the same other lines for an older reply with no owner', async () => {
    changeOnboarding = (body) => { delete body.owner }
    expect(withoutTheKeptSentence(readTheHookDetails(await runHook(directory)))).toBe(withoutOwner)
  })

  it.each([undefined, '', '   ', 42])('prints the same other lines when owner.says is missing, empty or not a string (%s)', async (says) => {
    changeOnboarding = (body) => { body.owner = { named: false, says } }
    expect(withoutTheKeptSentence(readTheHookDetails(await runHook(directory)))).toBe(withoutOwner)
  })

  it('prints no owner sentence when the onboarding read fails, and keeps the other start lines', async () => {
    unreadableRoutes.add('/api/onboarding')
    const out = await runHook(directory)
    expect(out).not.toContain(ownerSays)
    const startFolder = `Mole Office did not answer which agent is registered as starting in "${directory}", so nothing names a durable agent for this session.`
    const expected = withoutOwner.replace(
      `Nothing matched the directory "${directory}" to a project, so none is assumed. Name one with x-mole-office-workspace before you write anything.`,
      `Mole Office did not answer which project "${directory}" is in, so nothing is claimed about it.`,
    ).replace('; no registered start folder names one.', `.\n${startFolder}`)
    // WHEN NO START READ ANSWERS, the line about handles is printed where the hook first finds it missing,
    // before the line about the start folder.
    const handlesMissed = 'Mole Office did not answer which handles are held, so whether a waiter holds one for this session was not read.'
    expect(withoutTheKeptSentence(readTheHookDetails(out))).toBe(waitingFails ? expected.replace(`${startFolder}\n${handlesMissed}`, `${handlesMissed}\n${startFolder}`) : expected)
  })
})

it('says the office did not answer the project when onboarding fails and the record is filed in the hook\'s own project', async () => {
  unreadableRoutes.add('/api/onboarding')
  const directory = mkdtempSync(join(tmpdir(), 'mole-office-hook-unread-project-'))
  try {
    const out = readTheHookDetails(await runHook(directory, null, { env: { MOLE_OFFICE_WORKSPACE: undefined } }))
    expect(out).toContain(`Mole Office did not answer which project "${directory}" is in, so nothing is claimed about it.`)
    expect(out).toContain('because Mole Office did not answer which project the start folder is in, and that is the project this hook itself writes in')
    expect(out).not.toContain('because nothing named a project for it')
    expect(out).toMatch(/This session's record was filed in the project "[^"]+" for now, /)
    expect(out).toMatch(/To move it, send POST \/api\/records\/[A-Za-z0-9_-]+\/workspace /)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

it('keeps the failed endpoint line when the standing read times out and other reads answer', async () => {
  refuseFiling = true
  timeoutStanding = true
  const directory = mkdtempSync(join(tmpdir(), 'mole-office-hook-partial-'))
  mkdirSync(join(directory, '.claude', 'skills', 'mole-office'), { recursive: true })
  writeFileSync(join(directory, '.claude', 'skills', 'mole-office', 'SKILL.md'), 'Test skill fixture.')
  try {
    const out = await runHook(directory)
    expect(out).toContain('Mole Office could not read GET /api/where-you-stand. Details: ')
    expect(out).not.toContain('Mole Office did not answer (')
    const path = out.match(/Details: (.+)/)?.[1]
    expect(path).toBeDefined()
    const details = readFileSync(path!, 'utf8')
    expect(details).toContain('GET /api/where-you-stand:')
    expect(details).toMatch(/(?:timeout|aborted)/i)
    readTheHookDetails(out)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}, 30_000)

it('prints no owner sentence when the office does not answer, and still says where the session stands', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mole-office-hook-offline-'))
  mkdirSync(join(directory, '.claude', 'skills', 'mole-office'), { recursive: true })
  writeFileSync(join(directory, '.claude', 'skills', 'mole-office', 'SKILL.md'), 'Test skill fixture.')
  // Port zero cannot have a listening office; this never probes the live office or another server.
  try {
    const out = await runHook(directory, null, { env: { MOLE_OFFICE_API: 'http://127.0.0.1:0' } })
    expect(out.trim().split('\n')).toHaveLength(1)
    expect(out).toMatch(/^Mole Office did not answer \(\d+ requests tried, none answered\)\. Details: .+\n$/)
    const failures = out.split('\n').filter((line) => line.includes('Details: '))
    expect(failures).toHaveLength(1)
    expect(new Set(failures.map((line) => line.split('Details: ')[1])).size).toBe(1)
    expect(out).not.toContain('Mole Office did not answer which project')
    const detailsPath = failures[0]!.split('Details: ')[1]!
    expect(readFileSync(detailsPath, 'utf8')).toContain('Failed requests:')
    const details = readFileSync(detailsPath, 'utf8')
    for (const endpoint of ['/api/health', '/api/onboarding?', '/api/handles', '/api/records', ...EVERY_START_READ]) expect(details).toContain(endpoint)
    expect(out).not.toContain('#/welcome')
    expect(readTheHookDetails(out)).toContain(`Mole Office did not answer which project "${directory}" is in, so nothing is claimed about it.`)
    expect(readTheHookDetails(out)).toContain(`Read GET /api/onboarding?directory=${encodeURIComponent(directory)} next`)
    rmSync(join(directory, '.claude', 'skills', 'mole-office', 'SKILL.md'))
    const missingSkill = await runHook(directory, null, { env: { MOLE_OFFICE_API: 'http://127.0.0.1:0' } })
    expect(missingSkill.split('\n').filter((line) => line.startsWith('Mole Office did not answer ('))).toHaveLength(1)
    expect(missingSkill).toContain('YOU DO NOT HAVE THE MOLE OFFICE SKILL')
    readTheHookDetails(missingSkill)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

/**
 * PUT A SCRATCH `.env` IN THIS CHECKOUT, AND HAND BACK WHAT PUTS IT BACK.
 *
 * The checkout's declaration is what these cases are about, and the owner's own checkout carries
 * one. Writing the file bare and deleting it would destroy the owner's `.env` when this suite runs there,
 * so the bytes that were there are kept and put back. In a worktree there is no file, and the
 * restore removes the one this made.
 */
function withScratchEnv(agent: string): () => void {
  const file = join(CHECKOUT, '.env')
  const had = existsSync(file)
  const before = had ? readFileSync(file, 'utf8') : null
  writeFileSync(file, `MOLE_OFFICE_AGENT=${agent}\n`, 'utf8')
  return () => {
    if (had) writeFileSync(file, before ?? '', 'utf8')
    else rmSync(file, { force: true })
  }
}

describe('the hook names the project a directory is in', () => {
  it('says so, by name, for a directory a registered repository root holds', async () => {
    const made = await server.app.inject({
      method: 'POST',
      url: '/api/workspaces',
      payload: { id: 'a-hook-project', title: 'A hook project' },
    })
    expect(made.statusCode, made.body).toBe(201)

    const root = mkdtempSync(join(tmpdir(), 'mole-office-hook-root-'))
    try {
      const registered = await server.app.inject({
        method: 'POST',
        url: '/api/implementation/repositories',
        headers: { 'x-mole-office-workspace': 'a-hook-project' },
        payload: { name: 'the-hook-root', root },
      })
      expect(registered.statusCode, registered.body.slice(0, 300)).toBe(201)

      const inside = join(root, 'src', 'deep')
      const out = await runHook(inside)
      expect(out).toContain('MOLE OFFICE —')
      expect(out).toContain('This directory is in the project "a-hook-project".')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  // THE RECORD IS FILED IN "default" HERE BECAUSE THE ENVIRONMENT NAMES IT (runHook sets MOLE_OFFICE_WORKSPACE).
  // tests/the-session-hook-gets-the-brief-and-finds-the-held-record.test.ts holds the case where nothing names one.
  //   CONTROL  red on the hook before this change: it said nothing of where the record was filed.
  //   MUTATION `whereItWasFiled` answers null when the folder matched no project, as before: red here.
  //   MUTATION the line says "This directory is in the project" for the project the record was filed in: red here.
  //   MUTATION the reason for the hook's own project left out of the line: green here, because the environment names
  //            this case's project; the other file's case is red.
  //   RESTORE  green, the hook restored byte-identical (cmp).
  it('says nothing matched and never that the directory is in a project, and says where its record was filed for now and how to move it', async () => {
    const nowhere = mkdtempSync(join(tmpdir(), 'mole-office-hook-nowhere-'))
    try {
      const out = await runHook(nowhere)
      expect(out).toContain(`Nothing matched the directory "${nowhere}" to a project`)
      expect(out).toContain('Name one with x-mole-office-workspace')
      expect(out, 'the hook said the directory is in a project').not.toContain('This directory is in the project')
      const filed = new RegExp(
        String.raw`This session's record was filed in the project "default" for now, the one its environment names \(MOLE_OFFICE_WORKSPACE\)\. ` +
          String.raw`To move it, send POST /api/records/([A-Za-z0-9_-]+)/workspace \{"to":"<project>"\} with the header x-mole-office-workspace: default\.`,
      ).exec(out)
      expect(filed, 'the hook filed a record and did not say where, or how to move it').not.toBeNull()
      const record = await server.app.inject({ method: 'GET', url: `/api/records/${String(filed?.[1])}`, headers: AS_THE_OWNER })
      expect(record.statusCode, 'the line names a record that is not in the project it names').toBe(200)
      expect((record.json() as { record: { kind: string } }).record.kind).toBe('session')
    } finally {
      rmSync(nowhere, { recursive: true, force: true })
    }
  })

  it('says what to read next: the onboarding read for this directory', async () => {
    const nowhere = mkdtempSync(join(tmpdir(), 'mole-office-hook-next-'))
    try {
      const out = await runHook(nowhere)
      expect(readTheHookDetails(out)).toContain(`Read GET /api/onboarding?directory=${encodeURIComponent(nowhere)} next`)
    } finally {
      rmSync(nowhere, { recursive: true, force: true })
    }
  })
})

describe('the hook says who this session is here', () => {
  it('names nobody, claims no handle and names no record, outside every checkout', async () => {
    // THE CHECKOUT'S OWN .env NAMES AN AGENT. Problem `JsxXlrodyydX`: the hook used to read it for a
    // session in another repository and tell that session it answered as this checkout's agent. The
    // control for this case is measured below: the same run inside the checkout does read it. The
    // file is made here rather than read from the checkout, because a worktree has none and the
    // owner's own checkout must not be touched.
    //
    // THE SCRATCH FILE IS READ BACK BY ITS OWN PATH (problem Y2LVU0dqBt1S, 28 September 2026). This process
    // worked out once, when src/config/settings.mjs loaded, which .env it reads, and in a worktree with no
    // .env of its own that is the main checkout's. So the read with no path named the main checkout's
    // agent, not the one just written, and the case failed in every worktree before it reached the hook.
    // The hook itself starts after the file is written, so it finds this one.
    const name = 'hook-outside-scratch-agent'
    const restore = withScratchEnv(name)
    const nowhere = mkdtempSync(join(tmpdir(), 'mole-office-hook-who-'))
    try {
      const declared = fromEnvFile('MOLE_OFFICE_AGENT', join(CHECKOUT, '.env'))
      expect(declared, 'the scratch .env this case just wrote was not read back').toBe(name)
      const out = await runHook(nowhere)
      expect(out).toContain(
        'The hook cannot tell who this session is: nothing names a durable agent for it, so no handle was claimed and no session record was named.',
      )
      expect(out, 'the hook read the checkout’s agent from a session outside the checkout').not.toContain(
        `You are answering as the agent "${String(declared)}" here.`,
      )
      expect(out, 'the hook offered the checkout’s handle to an outside session').not.toContain(`--agent ${String(declared)}`)
      expect(out, 'the hook named a session record to an outside session').not.toMatch(/filed as record [A-Za-z0-9_-]+/)
    } finally {
      rmSync(nowhere, { recursive: true, force: true })
      restore()
    }
  })

  it('reads the agent of a scratch .env this checkout carries when the session is inside it', async () => {
    const name = 'hook-inside-scratch-agent'
    const restore = withScratchEnv(name)
    try {
      const out = await runHook(CHECKOUT)
      expect(out).toContain(`You are answering as the agent "${name}" here.`)
    } finally {
      restore()
    }
  })

  it('names the agent the environment overrides, so the line follows the shell and not a constant', async () => {
    const nowhere = mkdtempSync(join(tmpdir(), 'mole-office-hook-who-named-'))
    try {
      const out = await runHook(nowhere, 'a-named-session-agent')
      expect(out).toContain('You are answering as the agent "a-named-session-agent" here.')
    } finally {
      rmSync(nowhere, { recursive: true, force: true })
    }
  })
})

// ============================================================================ after a compaction

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** A live agent record, so the office accepts writes under its handle. */
function anAgent(handle: string): void {
  t.api.createRecord({
    workspaceId: 'default',
    kind: 'agent',
    title: handle,
    data: { handle, state: 'active', runtime: 'claude-code' },
    actor: { type: 'human', id: THE_PERSON },
  })
}

/** A running session record, as the start before the compaction left it. */
function aRunningSession(title: string): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title,
    data: { state: 'running', runtime: 'claude-code' },
    actor: { type: 'human', id: THE_PERSON },
  }).id
}

/** How many session records the office holds, so a case can say the hook filed none. */
async function howManySessions(): Promise<number> {
  const res = await server.app.inject({ method: 'GET', url: '/api/records?kind=session', headers: AS_THE_OWNER })
  expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
  return (res.json() as { records: unknown[] }).records.length
}

describe('after a compaction the hook works out who the session is before the process tree', () => {
  /*
   * THE PROCESS TREE HERE DOES NOT LEAD TO THE SESSION. The hook is started by vitest, not by a claude
   * program, which is what a compaction can leave behind. The case does not assert the process line,
   * because what sits above vitest differs between machines; the point is that the name and the record
   * come from the environment whatever the tree says.
   *
   * Three runs, with the control first:
   *   CONTROL  green on the unmutated hook.
   *   MUTATION delete the first line of `theRecordThisStartIsFor` (the environment's run is taken as this
   *            start's record): red, the hook files a new record and names it instead of the run.
   *   RESTORE  green, the hook restored byte-identical (cmp).
   */
  it('names the agent and the run the environment names, and files no second record', async () => {
    const handle = 'hook-compacted-env-agent'
    anAgent(handle)
    const run = aRunningSession('the run the environment names')
    const nowhere = mkdtempSync(join(tmpdir(), 'mole-office-hook-compacted-env-'))
    try {
      const before = await howManySessions()
      const out = await runHook(nowhere, handle, { env: { MOLE_OFFICE_SESSION: run } })
      expect(out).toContain(`You are answering as the agent "${handle}" here.`)
      expect(out).toContain(`This session is filed as record ${run}, the run its environment names (MOLE_OFFICE_SESSION).`)
      expect(out, 'the waiter the hook offers holds some other record').toContain(`--agent ${handle} --session ${run}`)
      expect(await howManySessions(), 'the hook filed a second record for a run that already has one').toBe(before)
    } finally {
      rmSync(nowhere, { recursive: true, force: true })
    }
  })

  /*
   * THE ENVIRONMENT NAMES NOBODY, AND THE WAITER STILL HOLDS THE HANDLE ON THIS SESSION'S RECORD. That
   * is the secretary after a compaction: its terminal was started with no MOLE_OFFICE_AGENT, the start before
   * the compaction wrote its note, and the waiter goes on beating the hold on that record.
   *
   * Three runs, with the control first:
   *   CONTROL  green on the unmutated hook.
   *   MUTATION `const heldNote = null` in place of the read of the hold: red, the hook says it cannot tell.
   *   RESTORE  green, the hook restored byte-identical (cmp).
   */
  it('names the agent whose waiter holds its handle on this session\'s own record', async () => {
    const handle = 'hook-compacted-held-agent'
    anAgent(handle)
    const record = aRunningSession('the record the start before the compaction filed')
    const held = await server.app.inject({
      method: 'POST',
      url: `/api/handles/${handle}/hold`,
      headers: AS_THE_OWNER,
      payload: { session: record, machine: 'a-machine', runtime: 'claude-code' },
    })
    expect(held.statusCode, held.body.slice(0, 300)).toBe(201)
    const sessionId = `compacted-${String(Date.now())}-${String(Math.random()).slice(2)}`
    // THE NOTE THE START BEFORE THE COMPACTION WROTE, naming the record the waiter holds.
    mkdirSync(join(CHECKOUT, '.logs'), { recursive: true })
    writeFileSync(join(CHECKOUT, '.logs', `session-${sessionId}.json`), JSON.stringify({ id: record }), 'utf8')
    const nowhere = mkdtempSync(join(tmpdir(), 'mole-office-hook-compacted-held-'))
    try {
      const out = await runHook(nowhere, null, { sessionId })
      expect(out).toContain(`You are answering as the agent "${handle}" here.`)
      expect(out).toContain(
        `The environment names no agent, so "${handle}" is named by the handle its waiter holds on this session's record ${record}.`,
      )
      expect(out).toContain(`This session is already filed as record ${record}`)
      // THE HOOK'S OWN SENTENCES, which all say "the hook cannot tell". Chapter 7's rule for a question
      // from the person, which the brief's opening prints, also holds the words "cannot tell".
      expect(out).not.toMatch(/the hook cannot tell/i)
    } finally {
      rmSync(nowhere, { recursive: true, force: true })
    }
  })

  /*
   * NOTHING NAMES THE SESSION: no variable, no hold, no .env above the folder and no start folder. This
   * checkout carries a scratch .env naming an agent, which is the guess the hook once made (problem
   * JsxXlrodyydX) and must not make.
   *
   * Three runs, with the control first:
   *   CONTROL  green on the unmutated hook.
   *   MUTATION the `.env` read given no directory, `theAgentAnEnvFileNames(undefined)`, so it falls back
   *            to this checkout's own .env: red, the hook names the scratch agent.
   *   RESTORE  green, the hook restored byte-identical (cmp).
   */
  it('says it cannot tell, and claims no agent, no handle and no record', async () => {
    const restore = withScratchEnv('hook-a-guess-it-must-not-make')
    const nowhere = mkdtempSync(join(tmpdir(), 'mole-office-hook-cannot-tell-'))
    try {
      const out = await runHook(nowhere)
      expect(out).toContain(
        'The hook cannot tell which durable agent this session is, so it names none and claims no handle: ' +
          'the environment names none (MOLE_OFFICE_AGENT); this session had no record yet for a waiter to hold a handle on; ' +
          'no .env names one; no registered start folder names one.',
      )
      expect(out, 'the hook guessed an agent').not.toContain('You are answering as')
      expect(out, 'the hook offered a handle').not.toContain('--agent ')
      expect(out, 'the hook named a record as this session\'s').not.toMatch(/filed as record [A-Za-z0-9_-]+/)
    } finally {
      rmSync(nowhere, { recursive: true, force: true })
      restore()
    }
  })

  /*
   * A THROW INSIDE THE HOOK. An empty MOLE_OFFICE_AGENT is refused by the configuration declaration with
   * a throw, which is a real way the hook met one (measured on 27 September 2026: it exited 1 with a
   * stack trace). `runHook` rejects on any exit but 0.
   *
   * Three runs, with the control first:
   *   CONTROL  green on the unmutated hook.
   *   MUTATION delete `process.on('uncaughtException', theHookStopped)`: red, the hook exits 1.
   *   RESTORE  green, the hook restored byte-identical (cmp).
   */
  it('exits 0 and says what failed when something inside it throws', async () => {
    const nowhere = mkdtempSync(join(tmpdir(), 'mole-office-hook-throws-'))
    try {
      const out = await runHook(nowhere, '')
      expect(out).toContain('MOLE OFFICE — the session hook stopped part way through, and this session goes on without it.')
      expect(out).toContain('What failed: MOLE_OFFICE_AGENT is set to an empty value')
    } finally {
      rmSync(nowhere, { recursive: true, force: true })
    }
  })
})

// MUTATION: leave all old details files in place after writing the new one.
it('keeps the twenty newest hook details and leaves every other entry untouched', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mole-office-hook-retention-'))
  const detailsFolder = join(directory, 'details')
  mkdirSync(detailsFolder)
  const stamp = Date.now() - 100_000
  const old = Array.from({ length: 25 }, (_, i) => `session-start-${stamp + i}-123.txt`)
  for (const name of old) writeFileSync(join(detailsFolder, name), `Synthetic details ${name}`, { mode: 0o600 })
  const otherFiles = ['session-note.json', 'session-start-old-123.txt', 'session-start-1234567890123-0.txt', 'unrelated.txt']
  for (const name of otherFiles) writeFileSync(join(detailsFolder, name), `Synthetic other ${name}`)
  const otherDirectory = `session-start-${stamp - 1}-123.txt`
  mkdirSync(join(detailsFolder, otherDirectory))
  writeFileSync(join(detailsFolder, otherDirectory, 'kept.txt'), 'Synthetic directory contents')
  try {
    const out = await runHook(directory, null, { env: { MOLE_OFFICE_API: 'http://127.0.0.1:0', MOLE_HOOK_DETAILS_FOLDER: detailsFolder } })
    const details = out.match(/Details: (.+)/)?.[1]
    expect(details, out).toBeDefined()
    const made = details!.split('/').at(-1)!
    expect(statSync(details!).mode & 0o777).toBe(0o600)
    expect(readdirSync(detailsFolder).sort()).toEqual([...old.slice(6), made, ...otherFiles, otherDirectory].sort())
    for (const name of old.slice(6)) expect(readFileSync(join(detailsFolder, name), 'utf8')).toBe(`Synthetic details ${name}`)
    for (const name of otherFiles) expect(readFileSync(join(detailsFolder, name), 'utf8')).toBe(`Synthetic other ${name}`)
    expect(readFileSync(join(detailsFolder, otherDirectory, 'kept.txt'), 'utf8')).toBe('Synthetic directory contents')
    readTheHookDetails(out)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
