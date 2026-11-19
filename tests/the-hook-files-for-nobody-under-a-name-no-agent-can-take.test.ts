// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SESSION HOOK FILES A SESSION IT CANNOT NAME UNDER A NAME NO AGENT CAN REGISTER.
 *
 * When the hook cannot tell which agent its session is, it still files the session, under a name of its own. That name
 * was `claude-code`, which is also a handle an agent could register, and that agent would then collide with every
 * session the hook filed for nobody. The name is now `THE_SESSION_HOOK_ID` in src/shared/participants.ts. Its slash is
 * refused by the handle rule at registration, and the office lets it write without a registry row
 * (`AGENT_IDS_THAT_NEED_NO_REGISTRATION` in src/server/lib/records.ts).
 *
 * WHAT IS REAL. The hook is spawned as Claude Code spawns it, from tools/session-hook.mjs, with a payload on stdin,
 * against this file's own office on a free port, with a home folder this test made. Its environment holds only what
 * the case sets, so no agent and no key of the shell that runs this test reaches it. The registration is asked at the
 * real doors with `app.inject`.
 *
 * MUTATION: put 'claude-code' back as the name `ACTOR` falls back to in for-agents/session-hook.mjs. The first case
 * goes red.
 */
import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_SESSION_HOOK_ID } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url))
const HOOK = join(CHECKOUT, 'tools', 'session-hook.mjs')

let t: TestDb
let app: FastifyInstance
let url: string
const notesWritten: string[] = []
const foldersMade: string[] = []

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ port: 0, host: '127.0.0.1' })
  url = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
}, 60_000)

afterAll(async () => {
  for (const name of notesWritten.splice(0)) rmSync(join(CHECKOUT, '.logs', name), { force: true })
  for (const folder of foldersMade.splice(0)) rmSync(folder, { recursive: true, force: true })
  await app?.close()
  t?.close()
})

/**
 * Run the hook's start with no agent named, from a folder nobody registered, and hand back the record it filed.
 *
 * ONLY WHAT THE CASE SETS reaches the hook: every MOLE_ and SANDBOX_ variable of this process is left out, so neither an
 * agent's name nor an agent's key can name the session.
 */
async function theHookStartsWithNoAgent(): Promise<string> {
  const home = mkdtempSync(join(tmpdir(), 'mole-office-hook-for-nobody-home-'))
  const startedIn = mkdtempSync(join(tmpdir(), 'mole-office-hook-for-nobody-start-'))
  foldersMade.push(home, startedIn)
  const env: NodeJS.ProcessEnv = {}
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith('MOLE_') && !name.startsWith('SANDBOX_')) env[name] = value
  }
  Object.assign(env, {
    HOME: home,
    MOLE_OFFICE_API: url,
    MOLE_OFFICE_WORKSPACE: 'default',
    MOLE_OFFICE_DB: t.file,
    MOLE_HOOK_DETAILS_FOLDER: join(home, 'hook-details'),
  })
  expect(env['MOLE_OFFICE_AGENT'], 'an agent is named for a run that is about naming none').toBeUndefined()
  expect(env['MOLE_AGENT_KEY'] === undefined, 'an agent key reaches a run that is about naming no agent').toBe(true)
  const sessionId = `for-nobody-${String(Date.now())}-${String(Math.random()).slice(2)}`
  notesWritten.push(`session-${sessionId}.json`)
  await new Promise<string>((resolve, reject) => {
    const child = execFile('node', [HOOK, 'start'], { encoding: 'utf8', env, cwd: startedIn }, (error, stdout) => {
      if (error !== null) reject(error)
      else resolve(stdout)
    })
    child.stdin?.end(JSON.stringify({ session_id: sessionId, cwd: startedIn, hook_event_name: 'SessionStart' }))
  })
  const note = join(CHECKOUT, '.logs', `session-${sessionId}.json`)
  expect(existsSync(note), 'the hook filed no record, so it wrote no note').toBe(true)
  const id = String((JSON.parse(readFileSync(note, 'utf8')) as { id?: unknown }).id ?? '')
  expect(id, 'the note names no record').not.toBe('')
  return id
}

/** Who the office recorded as making the first write to this record, and what proved it. */
function theFirstWriteOf(recordId: string): { actorType: string; actorId: string; provedBy: string | null } {
  return t.client.sqlite
    .prepare('SELECT actor_type AS actorType, actor_id AS actorId, proved_by AS provedBy FROM revisions WHERE record_id = ? AND seq = 1')
    .get(recordId) as { actorType: string; actorId: string; provedBy: string | null }
}

/** The words of a refusal. */
function said(body: Record<string, unknown>): string {
  return String(body['error'] ?? body['message'] ?? JSON.stringify(body))
}

describe('the hook files a session it cannot name under its own name', () => {
  it('files it under the hook’s own name, proved by the office’s key', async () => {
    const id = await theHookStartsWithNoAgent()
    expect(theFirstWriteOf(id)).toEqual({ actorType: 'agent', actorId: THE_SESSION_HOOK_ID, provedBy: 'the-office-key' })
  }, 60_000)
})

describe('no agent can register the hook’s name', () => {
  // THE HANDLE RULE'S OWN SENTENCE, read from `whyThatIsNotAHandle` in src/server/lib/inbox.ts, so a change to
  // its words alone cannot redden this file. Imported here and not at the top: inbox.ts reaches db/client.ts,
  // which opens what MOLE_OFFICE_DB names when it is imported, and freshDb above points that at a throwaway file.
  let refusal: string
  beforeAll(async () => {
    const { whyThatIsNotAHandle } = await import('../src/server/lib/inbox.ts')
    const why = whyThatIsNotAHandle(THE_SESSION_HOOK_ID)
    expect(why, 'the handle rule takes the hook’s name').not.toBeNull()
    expect(why).toContain(`"${THE_SESSION_HOOK_ID}"`)
    refusal = String(why)
  })

  it('is refused at the door that starts an agent, in the handle rule’s words', async () => {
    const asked = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: AS_THE_PERSON,
      payload: { handle: THE_SESSION_HOOK_ID, name: 'the session hook', runtime: 'claude-code', role: 'worker' },
    })
    expect(asked.statusCode, asked.body.slice(0, 300)).toBe(400)
    expect(said(asked.json() as Record<string, unknown>)).toContain(refusal)
    expect(t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM agents WHERE handle = ?').get(THE_SESSION_HOOK_ID)).toEqual({ n: 0 })
  })

  it('is refused at the door that files an agent record, in the same words', async () => {
    const asked = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_PERSON,
      payload: { kind: 'agent', title: THE_SESSION_HOOK_ID, data: { handle: THE_SESSION_HOOK_ID, state: 'active', runtime: 'claude-code' } },
    })
    expect(asked.statusCode, asked.body.slice(0, 300)).toBe(400)
    expect(said(asked.json() as Record<string, unknown>)).toContain(refusal)
    expect(t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM agents WHERE handle = ?').get(THE_SESSION_HOOK_ID)).toEqual({ n: 0 })
  })
})
