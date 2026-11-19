// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WOKEN AGENT IS HANDED THE NEW MESSAGES OF THE GROUPS IT IS IN, AND OF NO OTHER GROUP. One of the owner's
 * decisions, at item 5, agrees to step 3 of block b-6 of the secretary's report: when
 * an agent wakes, it reads what its groups gained. The door that answers that,
 * GET /api/messages/groups (`whatTheGroupsGained` in src/server/lib/messages.ts), was connected to
 * nothing.
 *
 * It is connected through the brief. GET /api/brief, read for an agent, carries `newInYourGroups`,
 * and its opening (`head`, built by `briefHead` in src/server/api/brief.ts) prints the new messages.
 * The session-start hook, tools/session-hook.mjs, prints that opening as it is, and the message
 * worker puts it at the top of every run's prompt.
 *
 * WHAT IS PROVED HERE:
 *
 *   1. An agent in a group, which the person wrote to, is handed that message: in the brief's body,
 *      in its opening, and in what the session-start hook prints for that agent.
 *   2. A group the agent is not in is not read: the message there is in none of the three.
 *
 * THE MESSAGE IN THE OTHER GROUP IS WRITTEN BY THE OTHER AGENT, not by the person. The brief's opening
 * also prints the person's newest words to a secretary (`hisWords` in src/server/api/brief.ts), so a
 * message the person wrote there could reach the opening by that road and turn case 2 red on timing
 * alone. Written by an agent, it can reach the opening only through the group news.
 *
 * THE AGENT IS A SECRETARY, on purpose. A secretary may read every message,
 * so the rule on who may read a message does not keep the other group out of its brief. Only the
 * reading of the groups it is in does, and case 2 is about that reading.
 *
 * The names are made up.
 *
 * MUTATIONS (each after a green control run, then restored):
 *   - case 1: `whatYourGroupsGained` keeps no group (its filter on groups with new messages answers
 *     false). Case 1 goes red.
 *   - case 2: `whatTheGroupsGained` reads the groups the person is in instead of the groups the reader
 *     is in (`groupsFor({ kind: 'person', id: THE_PERSON }, which)` for `groupsFor(me, which)`). Case 2
 *     goes red.
 */

import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HOOK = fileURLToPath(new URL('../tools/session-hook.mjs', import.meta.url))
const WORKSPACE = 'default'
const AGENT = 'group-news-reader'

let t: TestDb
let server: Awaited<ReturnType<typeof apiApp>>
let url = ''
let scratch = ''

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_THE_AGENT = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': AGENT,
}

const notesWritten: string[] = []
function aSessionId(): string {
  const id = `test-${Math.random().toString(36).slice(2)}-${String(Date.now())}`
  notesWritten.push(`session-${id}.json`)
  return id
}

/** Run the hook the way Claude Code runs it, as one named agent, and answer what it printed. */
async function runHook(as: string): Promise<string> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    MOLE_OFFICE_API: url,
    MOLE_OFFICE_WORKSPACE: WORKSPACE,
    MOLE_OFFICE_DB: t.file,
    MOLE_HOOK_DETAILS_FOLDER: join(scratch, 'hook-details'),
    MOLE_OFFICE_AGENT: as,
  }
  delete env['TMUX_PANE']
  delete env['MOLE_OFFICE_SESSION']
  return await new Promise<string>((resolve, reject) => {
    const child = execFile('node', [HOOK, 'start'], { encoding: 'utf8', env }, (error, stdout) => {
      if (error !== null) reject(error)
      else resolve(stdout)
    })
    child.stdin?.end(JSON.stringify({ session_id: aSessionId(), cwd: scratch }))
  })
}

/** Register an agent through the starter door and answer its registry id. */
async function started(handle: string, name: string, role: 'worker' | 'secretary'): Promise<string> {
  const reply = await server.app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle, name, role },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { agent: { id: string } }).agent.id
}

/** Open a group of the person and one agent, write one message into it as `writer`, and answer its id. */
async function aGroupWithAMessage(
  name: string,
  agentId: string,
  body: string,
  writer: Record<string, string> = AS_THE_PERSON,
): Promise<string> {
  const opened = await server.app.inject({
    method: 'POST',
    url: '/api/groups',
    headers: AS_THE_PERSON,
    payload: {
      name,
      because: 'The fixtures are discussed here.',
      members: [
        { who: { kind: 'person', id: THE_PERSON }, because: 'The person opened it.' },
        { who: { kind: 'agent', id: agentId }, because: 'It works on the fixtures.' },
      ],
    },
  })
  expect(opened.statusCode, opened.body).toBe(201)
  const groupId = (opened.json() as { group: { id: string } }).group.id
  const sent = await server.app.inject({
    method: 'POST',
    url: '/api/records',
    headers: writer,
    payload: { kind: 'message', title: body.slice(0, 40), data: { body, toGroup: groupId } },
  })
  expect(sent.statusCode, sent.body).toBe(201)
  return groupId
}

interface TheBrief {
  head: string
  newInYourGroups: { readFor: string | null; groups: { id: string; name: string; newest: { body: string }[] }[] }
}

const IN_MY_GROUP = 'The clamp for fixture four is on the bench.'
const IN_ANOTHER_GROUP = 'The drill press is booked all afternoon.'
let mine = ''
let theirs = ''
let brief: TheBrief
let printed = ''

beforeAll(async () => {
  t = await freshDb()
  server = await apiApp()
  await server.app.listen({ port: 0, host: '127.0.0.1' })
  const address = server.app.server.address()
  url = `http://127.0.0.1:${String(typeof address === 'object' && address !== null ? address.port : 0)}`
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-group-news-'))
  const reader = await started(AGENT, 'Group News Reader', 'secretary')
  const other = await started('group-news-other', 'Group News Other', 'worker')
  mine = await aGroupWithAMessage('The fixture crew', reader, IN_MY_GROUP)
  theirs = await aGroupWithAMessage('The drill crew', other, IN_ANOTHER_GROUP, {
    ...AS_THE_AGENT,
    'x-mole-office-actor-id': 'group-news-other',
  })

  const reply = await server.app.inject({ method: 'GET', url: '/api/brief', headers: AS_THE_AGENT })
  expect(reply.statusCode, reply.body).toBe(200)
  brief = reply.json() as TheBrief
  printed = await runHook(AGENT)
}, 60_000)

afterAll(async () => {
  await server.app.close()
  t.close()
  rmSync(scratch, { recursive: true, force: true })
  const stateDir = fileURLToPath(new URL('../.logs', import.meta.url))
  for (const name of notesWritten.splice(0)) rmSync(join(stateDir, name), { force: true })
})

describe('a woken agent is handed the new messages of its groups', () => {
  it('is handed the new message of the group it is in, in the brief, its opening and the start hook', () => {
    expect(brief.newInYourGroups.readFor).toBe(AGENT)
    const group = brief.newInYourGroups.groups.find((one) => one.id === mine)
    expect(group, JSON.stringify(brief.newInYourGroups)).toBeDefined()
    expect(group?.name).toBe('The fixture crew')
    expect(group?.newest.map((one) => one.body)).toEqual([IN_MY_GROUP])
    expect(brief.head).toContain(`The group "The fixture crew" (group id ${mine})`)
    expect(brief.head).toContain(IN_MY_GROUP)
    expect(printed).toContain(IN_MY_GROUP)
  })

  it('is not handed anything from a group it is not in', () => {
    expect(brief.newInYourGroups.groups.map((one) => one.id)).not.toContain(theirs)
    expect(brief.head).not.toContain(IN_ANOTHER_GROUP)
    expect(brief.head).not.toContain('The drill crew')
    expect(printed).not.toContain(IN_ANOTHER_GROUP)
  })
})
