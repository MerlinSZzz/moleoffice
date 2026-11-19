// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readTheHookDetails } from './hook-details.ts'
/**
 * THE SESSION HOOK NAMES A DURABLE AGENT FROM ITS REGISTERED START FOLDER, OR NAMES NOBODY AND SAYS
 * WHY. It is part (c) of a decision.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * A terminal has no way of its own to know which agent it is. Measured on 24 September 2026: no `.env`
 * named an agent for three agents, so the hook named none of the three and filed each
 * conversation onto two or three anonymous records. A registered start folder is the third source, read
 * after the environment and after a `.env`.
 *
 * AND A FOLDER IS SHARED, WHICH IS THE DANGER. One folder held ten session records of
 * eight conversations that day and only one of them was the secretary's. So the hook names an agent only when
 * exactly one live agent registered that exact folder and that agent is not already answering in
 * another live session; otherwise it names nobody AND SAYS WHICH of those it was.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED, AND WHY IT IS DRIVEN AS A CHILD PROCESS
 * ---------------------------------------------------------------------------------------
 *
 * The hook is spawned the way Claude Code spawns it, with a payload on stdin, against a listening
 * server, so what is measured is the real line and the real write and not a function called by hand.
 *
 *   1. one live agent at the folder: the hook says so, and the session record it files carries that
 *      agent as the actor that created it;
 *   2. two live agents at the folder: nobody is named, the sentence names both, and the record is
 *      filed under the hook's own name, `THE_SESSION_HOOK_ID` in src/shared/participants.ts;
 *   3. one live agent that is already answering in another live session: nobody is named, the sentence
 *      names that session's record, and the record is filed under the hook's own name;
 *   4. an office that answers the read without its start-folder part: nobody is named, the sentence says
 *      the office did not answer, and the run is still filed under the hook's own name;
 *   5. an agent in the environment wins, and no start-folder sentence is printed at all.
 *
 * FIVE CASES FOR FIVE PATHS, which is what the sentence in the registration reply owes: named, not named
 * because two live agents share the folder, not named because the agent answers elsewhere, not named
 * because the office did not answer, and the environment naming an agent so the folder is never read.
 *
 * `HOME` points at a scratch directory for every run, so the hook never reads or writes the owner's
 * own `~/.claude`. Every run asserts its control first: `MOLE_OFFICE_AGENT` is unset and no `.env`
 * above the start folder names an agent, which is what makes the folder the only thing that could have
 * named one.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THAT TURNS THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * Control: every case green on the unmutated tree.
 *
 *   · remove the start-folder lookup from tools/session-hook.mjs — set `startFolderNote` to null —
 *     and the first three cases are red: no agent is named and no sentence is printed.
 *   · drop the branch in `theStartFolderAnswer` that answers when the read carried no list, and the
 *     fourth case is red: the sentence nobody could otherwise check is not printed.
 *   · put 'claude-code' back as the name `ACTOR` falls back to in for-agents/session-hook.mjs, and the
 *     second, third and fourth cases are red on the name the record is filed under.
 *
 * The file was restored byte-identical after each mutation (sha256 before and after).
 *
 * THE SPAWN IS ASYNCHRONOUS ON PURPOSE. `spawnSync` blocks this process's event loop, and the API the
 * child talks to is listening IN this process, so a synchronous spawn would deadlock the server.
 */

import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_SESSION_HOOK_ID } from '../src/shared/participants.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url))
const HOOK = join(CHECKOUT, 'tools', 'session-hook.mjs')

let t: TestDb
let app: FastifyInstance
let url: string
/** Where the transcripts this file writes live, so a session can be read as answering. */
let transcripts = ''
const notesWritten: string[] = []
const foldersMade: string[] = []

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ port: 0, host: '127.0.0.1' })
  url = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  transcripts = mkdtempSync(join(tmpdir(), 'mole-office-start-folder-logs-'))
  foldersMade.push(transcripts)
}, 60_000)

afterEach(() => {
  const stateDir = join(CHECKOUT, '.logs')
  for (const name of notesWritten.splice(0)) rmSync(join(stateDir, name), { force: true })
})

afterAll(async () => {
  await app.close()
  t.close()
  for (const folder of foldersMade.splice(0)) rmSync(folder, { recursive: true, force: true })
})

/** A scratch folder nothing has registered, kept until the end of the file. */
function aFolder(name: string): string {
  const made = mkdtempSync(join(tmpdir(), `mole-office-start-${name}-`))
  foldersMade.push(made)
  return made
}

/**
 * An agent record, live, with this folder recorded as the one its sessions start in — or with none,
 * when `folder` is null.
 *
 * AN AGENT THE HOOK IS GOING TO WRITE UNDER HAS TO BE REGISTERED. The office refuses a write from an
 * actor id no registry row answers to, so a case that only named a handle in the environment would
 * measure that refusal instead of the rule it is about.
 */
function anAgentStartingIn(handle: string, folder: string | null): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'agent',
    title: handle,
    data: { handle, state: 'active', runtime: 'claude-code', ...(folder === null ? {} : { startFolder: folder }) },
    actor: { type: 'human', id: THE_PERSON },
  }).id
}

/**
 * A SESSION THIS AGENT IS REALLY ANSWERING IN: a run record whose transcript grew just now, with the
 * agent's handle held by it.
 *
 * The transcript is what makes it answering. A hold whose waiter is beating is not enough — the office
 * asks the session itself (criterion M106) — so the file below is written with this instant on its last
 * line, which is the same way tests/the-chats-presence-mark-is-true.test.ts makes one.
 */
async function aSessionAnsweringAs(handle: string, agentRecordId: string): Promise<string> {
  const logPath = join(transcripts, `${handle}.jsonl`)
  writeFileSync(
    logPath,
    `${JSON.stringify({
      type: 'assistant',
      timestamp: new Date().toISOString(),
      message: { role: 'assistant', content: [{ type: 'text', text: 'the answer' }] },
    })}\n`,
  )
  const session = t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: `${handle} is answering somewhere else`,
    data: {
      state: 'running',
      runtime: 'claude-code',
      ranAs: [{ workspaceId: 'default', agentId: agentRecordId }],
      extra: { discovered: { tool: 'claude-code', externalId: `${handle}-elsewhere`, logPath } },
    },
    actor: { type: 'human', id: THE_PERSON },
  }).id
  const held = await app.inject({
    method: 'POST',
    url: `/api/handles/${handle}/hold`,
    headers: AS_THE_OWNER,
    payload: { session, machine: 'a-machine', runtime: 'claude-code' },
  })
  expect(held.statusCode, held.body.slice(0, 300)).toBe(201)
  // THE OFFICE'S OWN READING, ASKED HERE, so a case about "already answering" cannot pass against a
  // session the office does not read as answering.
  const door = await app.inject({ method: 'GET', url: `/api/handles/${handle}`, headers: AS_THE_OWNER })
  expect(door.statusCode, door.body.slice(0, 300)).toBe(200)
  const answering = (door.json() as { answering: { how: string; session: string | null } }).answering
  expect(answering.how, 'the office does not read this session as answering, so the case would prove nothing').toBe('a live session')
  expect(answering.session).toBe(session)
  return session
}

/**
 * AN OFFICE THAT ANSWERS EVERYTHING EXCEPT THE START-FOLDER PART OF THE ONBOARDING READ.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS THE HONEST WAY TO REACH THE FOURTH SENTENCE
 * ---------------------------------------------------------------------------------------
 *
 * The hook says one thing when it cannot learn who is registered at a folder, and that sentence has to
 * be drawn by something or nobody has checked it. There are three ways to reach it: the office not
 * answering at all, the read answering an error, and the read answering a reply with no `startFolder`
 * part. The third is the one that really happens. Claude Code invokes the hook by the checkout's
 * absolute path, so the hook is the checkout's code while the office is whatever is still running;
 * between a pull and a restart, a hook that asks about start folders talks to an office that has never
 * heard of them. This stands that office up: every request is forwarded to the real one, and the
 * onboarding reply comes back with its `startFolder` key removed and nothing else touched.
 *
 * NOTHING ELSE IS FAKED. The world header, the brief, the record write and every other read are the
 * real server's own answers, forwarded whole, so the case measures the one missing part and not a
 * hand-built office.
 */
async function anOfficeThatSaysNothingAboutStartFolders(): Promise<{ address: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    void (async () => {
      const asked = req.url ?? '/'
      const body: Buffer[] = []
      for await (const chunk of req) body.push(chunk as Buffer)
      const headers: Record<string, string> = {}
      for (const [name, value] of Object.entries(req.headers)) {
        if (typeof value === 'string' && name !== 'host' && name !== 'content-length') headers[name] = value
      }
      const answer = await fetch(`${url}${asked}`, {
        method: req.method ?? 'GET',
        headers,
        ...(body.length === 0 ? {} : { body: Buffer.concat(body) }),
      })
      let text = await answer.text()
      if (asked.startsWith('/api/onboarding')) {
        const said = JSON.parse(text) as Record<string, unknown>
        expect(said, 'the real read no longer carries a startFolder part, so removing it proves nothing').toHaveProperty(
          'startFolder',
        )
        delete said['startFolder']
        text = JSON.stringify(said)
      }
      for (const [name, value] of answer.headers) {
        if (name !== 'content-length' && name !== 'content-encoding' && name !== 'transfer-encoding') {
          res.setHeader(name, value)
        }
      }
      res.statusCode = answer.status
      res.end(text)
    })().catch((err: unknown) => {
      res.statusCode = 500
      res.end(JSON.stringify({ error: String(err) }))
    })
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', () => done()))
  const port = (server.address() as AddressInfo).port
  return {
    address: `http://127.0.0.1:${String(port)}`,
    close: async () => await new Promise<void>((done) => server.close(() => done())),
  }
}

/**
 * Run the hook the way Claude Code runs it, from `cwd`, and hand back what it printed and the record
 * it filed.
 *
 * THE CONTROL IS ASSERTED HERE, on every run: `MOLE_OFFICE_AGENT` is unset unless a case asks for it,
 * and no `.env` at or above the start folder names an agent. Without both, a case could pass on the
 * environment while the start folder did nothing.
 */
async function runHook(
  cwd: string,
  agent: string | null = null,
  /** Which office to talk to. Absent means the real one this file is serving. */
  api: string = url,
): Promise<{ out: string; record: string | null }> {
  for (let at = cwd; ; at = dirname(at)) {
    expect(existsSync(join(at, '.env')), `a .env at ${at} could name an agent for this run`).toBe(false)
    if (dirname(at) === at) break
  }
  const sessionId = `sf-${String(Date.now())}-${String(Math.random()).slice(2)}`
  notesWritten.push(`session-${sessionId}.json`)
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: mkdtempSync(join(tmpdir(), 'mole-office-start-home-')),
    MOLE_OFFICE_API: api,
    MOLE_OFFICE_WORKSPACE: 'default',
    MOLE_OFFICE_DB: t.file,
  }
  env['MOLE_HOOK_DETAILS_FOLDER'] = join(String(env['HOME']), 'hook-details')
  foldersMade.push(String(env['HOME']))
  if (agent === null) delete env['MOLE_OFFICE_AGENT']
  else env['MOLE_OFFICE_AGENT'] = agent
  expect(env['MOLE_OFFICE_AGENT'], 'the environment names an agent for a run that is about a folder').toBe(
    agent ?? undefined,
  )

  const out = await new Promise<string>((resolve, reject) => {
    const child = execFile('node', [HOOK, 'start'], { encoding: 'utf8', env }, (error, stdout) => {
      if (error !== null) reject(error)
      else resolve(stdout)
    })
    child.stdin?.end(JSON.stringify({ session_id: sessionId, cwd }))
  })
  const note = join(CHECKOUT, '.logs', `session-${sessionId}.json`)
  const record = existsSync(note) ? String((JSON.parse(readFileSync(note, 'utf8')) as { id?: unknown }).id ?? '') : null
  return { out, record: record === '' ? null : record }
}

/** Who the office recorded as making the first write to this record. */
async function whoCreated(recordId: string): Promise<string> {
  const res = await app.inject({ method: 'GET', url: `/api/records/${recordId}/revisions`, headers: AS_THE_OWNER })
  expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
  const revisions = (res.json() as { revisions: { op: string; who: { actorId: string } }[] }).revisions
  const created = revisions.find((one) => one.op === 'create')
  expect(created, 'the record has no create revision').toBeDefined()
  return created!.who.actorId
}

describe('one live agent registered at the folder names the session', () => {
  it('says which folder named it, and files the record as that agent', async () => {
    const folder = aFolder('one')
    anAgentStartingIn('sfh-one', folder)

    const ran = await runHook(folder)
    expect(ran.out).toContain('MOLE OFFICE —')
    expect(ran.out).toContain('You are answering as the agent "sfh-one" here.')
    // THE SENTENCE, WORD FOR WORD. MUTATION: remove the lookup from the hook and neither this nor the
    // line above is printed.
    expect(ran.out).toContain(
      `Neither this session's environment nor a .env names an agent here, so "sfh-one" is named by its registered ` +
        `start folder, "${folder}".`,
    )
    // AND THE WRITE CARRIES THE NAME, not only the line on screen. This is the whole point: a session
    // that is a durable agent should have its record filed as that agent's.
    expect(ran.record, 'the hook filed no record').not.toBeNull()
    expect(await whoCreated(ran.record!)).toBe('sfh-one')
  })
})

describe('two live agents registered at one folder name nobody', () => {
  it('names both, says it does not choose, and files the record under the hook’s own name', async () => {
    const folder = aFolder('two')
    anAgentStartingIn('sfh-two-a', folder)
    anAgentStartingIn('sfh-two-b', folder)

    const ran = await runHook(folder)
    expect(ran.out).toContain(
      `Neither this session's environment nor a .env names an agent here, and 2 live agents are registered as ` +
        `starting in "${folder}": sfh-two-a, sfh-two-b. The hook does not choose between them, so this session ` +
        'answers as nobody. Set MOLE_OFFICE_AGENT=<handle> in the environment this session starts with, or register ' +
        'another start folder for all but one of them.',
    )
    expect(ran.out, 'the hook chose one of the two').not.toContain('You are answering as the agent "sfh-two-a"')
    expect(ran.out, 'the hook chose one of the two').not.toContain('You are answering as the agent "sfh-two-b"')
    expect(ran.record).not.toBeNull()
    expect(await whoCreated(ran.record!)).toBe(THE_SESSION_HOOK_ID)
  })
})

describe('a folder whose agent is answering elsewhere names nobody', () => {
  it('names the session it is answering in, and files the record under the hook’s own name', async () => {
    const folder = aFolder('elsewhere')
    const agentRecord = anAgentStartingIn('sfh-elsewhere', folder)
    const elsewhere = await aSessionAnsweringAs('sfh-elsewhere', agentRecord)

    const ran = await runHook(folder)
    expect(ran.out).toContain(
      `"${folder}" is the registered start folder of "sfh-elsewhere", and "sfh-elsewhere" is already answering in ` +
        `the session filed as record ${elsewhere}, so this session is not named "sfh-elsewhere". Set ` +
        'MOLE_OFFICE_AGENT=sfh-elsewhere in its environment if it should be.',
    )
    expect(ran.out, 'the hook named an agent that is answering in another session').not.toContain(
      'You are answering as the agent "sfh-elsewhere" here.',
    )
    expect(ran.record).not.toBeNull()
    expect(await whoCreated(ran.record!)).toBe(THE_SESSION_HOOK_ID)
  })
})

describe('an office that does not answer about start folders names nobody', () => {
  it('says the office did not answer, names nobody, and still files what it files today', async () => {
    const folder = aFolder('quiet')
    anAgentStartingIn('sfh-quiet', folder)

    // THE CONTROL FOR THIS CASE IS THE SAME FOLDER AGAINST THE REAL OFFICE. Without it, a case that saw
    // nobody named could be passing because the folder was never registered rather than because the
    // reply said nothing about it.
    const answered = await runHook(folder)
    expect(answered.out).toContain('You are answering as the agent "sfh-quiet" here.')

    const office = await anOfficeThatSaysNothingAboutStartFolders()
    try {
      const ran = await runHook(folder, null, office.address)
      // MUTATION: drop this branch from `theStartFolderAnswer` and only this case goes red.
      expect(readTheHookDetails(ran.out)).toContain(
        `Mole Office did not answer which agent is registered as starting in "${folder}", so nothing names a ` +
          'durable agent for this session.',
      )
      // AND NOBODY IS NAMED. An unanswered read must not be read as a folder that named somebody, and it
      // must not be read as a folder nobody registered either — those are different facts and only the
      // sentence above says which this is.
      expect(ran.out, 'the hook named an agent from a read that did not answer').not.toContain(
        'You are answering as the agent "sfh-quiet" here.',
      )
      expect(ran.out).toContain('The hook cannot tell which durable agent this session is, so it names none and claims no handle:')
      // A READ THAT DID NOT ANSWER IS NOT LISTED AS A PLACE THAT NAMED NOBODY (problem ihekMM954ojG).
      expect(ran.out).not.toContain('no registered start folder names one')
      // AND THE SESSION IS STILL FILED, as anonymously as it was before this feature existed. A read that
      // did not answer is not a reason to stop filing the run.
      expect(ran.record, 'the hook filed no record').not.toBeNull()
      expect(await whoCreated(ran.record!)).toBe(THE_SESSION_HOOK_ID)
    } finally {
      await office.close()
    }
  })
})

describe('an agent named in the environment wins over a start folder', () => {
  it('names the environment’s agent and says nothing about a start folder', async () => {
    const folder = aFolder('environment')
    anAgentStartingIn('sfh-in-the-folder', folder)
    anAgentStartingIn('sfh-in-the-environment', null)

    const ran = await runHook(folder, 'sfh-in-the-environment')
    expect(ran.out).toContain('You are answering as the agent "sfh-in-the-environment" here.')
    expect(ran.record, 'the hook filed no record').not.toBeNull()
    // NO START-FOLDER SENTENCE AT ALL. The order is the environment, then a `.env`, then a start
    // folder, so the folder is not even asked about and nothing is said about it.
    expect(ran.out, 'the hook read the start folder though the environment named an agent').not.toContain(
      'start folder',
    )
    expect(ran.out).not.toContain('sfh-in-the-folder')
    expect(await whoCreated(ran.record!)).toBe('sfh-in-the-environment')
  })
})
