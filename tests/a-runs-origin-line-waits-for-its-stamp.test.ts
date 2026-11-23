// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RESIDENT'S SESSION-ORIGIN LINE FOR A LIVE RUN WAITS FOR THE RUN'S STAMP, FOR AT MOST 30 MINUTES (wave 13u round
 * 109, the owner's pilot of an agent in one of the office's own panes).
 *
 * The office files an agent's run before the program in its pane starts, and the run's stamp, which carries the command
 * that resumes it, comes at the program's first stop. The origin file wrote a line for every new run as soon as it saw
 * one, and a line once written is never rewritten. So the line of a run in a pane was written before its stamp, said
 * the command was unknown, and said so for good.
 *
 * WHAT IS PROVED HERE (every name, path and value is made up):
 *   1. a live run that names its conversation and has no stamp gets no line yet, and once its stamp is on it, its line
 *      carries the command;
 *   2. a later run is not written before it, so the file stays in the order the runs were filed;
 *   3. a run filed more than 30 minutes ago that still has no stamp is written, with the command unknown and a sentence
 *      saying why;
 *   4. a run that has ended with no stamp is written at once, with a sentence saying why;
 *   5. a run that names no conversation is written at once, as before, with no such sentence.
 *
 * MUTATIONS (each after a green control run, then restored), named in the commit that adds this file.
 */

import type { FastifyInstance } from 'fastify'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { A_SLEEP_TIME, apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string, key: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': key,
})

async function inject(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; json: Record<string, any>; text: string }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  let json: Record<string, any> = {}
  try {
    json = reply.json() as Record<string, any>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, json, text: reply.body }
}

const agents = new Map<string, { id: string; key: string }>()
async function started(handle: string, role: string): Promise<void> {
  const reply = await inject('POST', '/api/agents/started', AS_THE_PERSON, { handle, name: handle, role })
  expect(reply.status, reply.text).toBe(201)
  agents.set(handle, { id: String(reply.json['agent'].id), key: String(reply.json['whatToGiveIt'].key) })
}

/** A local stamp `minutes` before now. */
const minutesAgo = (minutes: number): string => localStamp(new Date(Date.now() - minutes * 60_000))

function aSession(createdAt: string, data: Record<string, unknown>): string {
  const id = `ses-${Math.random().toString(36).slice(2, 12)}`
  t.client.sqlite
    .prepare(
      "INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data) VALUES (?, 'default', ?, ?, ?, 'session', ?, NULL, ?)",
    )
    .run(id, THE_PERSON, createdAt, createdAt, `a made-up run ${id}`, JSON.stringify(data))
  return id
}

/** Put a stamp on a run, as the hook's stop puts one: the three naming keys and the command. */
function stamp(id: string, conversation: string): string {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
  const data = JSON.parse(row.data) as Record<string, unknown>
  const resumeCommand = `claude --resume ${conversation}`
  data['extra'] = { discovered: { tool: 'claude-code', externalId: conversation, logPath: '/made/up/pane/transcript.jsonl', resumeCommand } }
  t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), id)
  return resumeCommand
}

function theFileOf(handle: string): string {
  return join(dirname(t.file), 'personal-spaces', agents.get(handle)!.id, 'session-origins.jsonl')
}

/** The agent made a resident, after its first run, so that run is the file's first line and the floor of later ones. */
async function aResidentWithAnOldRun(handle: string): Promise<void> {
  await started(handle, 'worker')
  aSession(minutesAgo(120), { servingAgentId: agents.get(handle)!.id, state: 'finished', runtime: 'codex' })
  const secretary = agents.get('sec-waits')!
  const proposed = await inject('POST', '/api/residents/proposals', asAgent('sec-waits', secretary.key), { agentId: agents.get(handle)!.id, because: 'A made-up reason.', sleepTime: A_SLEEP_TIME })
  expect(proposed.status, proposed.text).toBe(201)
  const confirmed = await inject('POST', `/api/residents/proposals/${String(proposed.json['proposal'].id)}/confirm`, AS_THE_PERSON)
  expect(confirmed.status, confirmed.text).toBe(200)
}

/** The file's lines after the resident is read through its door, which brings the file up to date. */
async function theLinesAfterARead(handle: string): Promise<Record<string, any>[]> {
  const read = await inject('GET', `/api/residents/${handle}`, AS_THE_PERSON)
  expect(read.status, read.text).toBe(200)
  return readFileSync(theFileOf(handle), 'utf8')
    .split('\n')
    .filter((one) => one !== '')
    .map((one) => JSON.parse(one) as Record<string, any>)
}

const theRuns = (lines: Record<string, any>[]): string[] => lines.slice(1).map((one) => String(one['sessionRecordId']))

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await started('sec-waits', 'secretary')
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the origin line of a live run waits for its stamp', () => {
  it('1 and 2: no line before the stamp, a later run waits behind it, and the line carries the command once it is stamped', async () => {
    await aResidentWithAnOldRun('waits-one')
    const id = agents.get('waits-one')!.id
    const conversation = '0b4c7a52-3d0e-4f7a-9a51-6c2b0d1e8f40'
    const inThePane = aSession(minutesAgo(1), { servingAgentId: id, state: 'running', runtime: 'claude-code', providerSession: conversation, workingDirectory: '/made/up/pane' })
    expect(theRuns(await theLinesAfterARead('waits-one')), 'a line was written before the run was stamped').toEqual([])

    const later = aSession(minutesAgo(0), { servingAgentId: id, state: 'running', runtime: 'codex' })
    expect(theRuns(await theLinesAfterARead('waits-one')), 'a later run was written before the one waiting for its stamp').toEqual([])

    const command = stamp(inThePane, conversation)
    const lines = await theLinesAfterARead('waits-one')
    expect(theRuns(lines)).toEqual([inThePane, later])
    expect(lines[1]!['resumeCommand']).toBe(command)
    expect(lines[1]!['resumeCommandUnknownBecause']).toBeNull()
  })

  it('3: a run filed more than 30 minutes ago with no stamp is written, with the command unknown and why', async () => {
    await aResidentWithAnOldRun('waits-three')
    const id = agents.get('waits-three')!.id
    const unstamped = aSession(minutesAgo(31), { servingAgentId: id, state: 'running', runtime: 'claude-code', providerSession: '6f1d2e3c-4b5a-4c6d-8e7f-9a0b1c2d3e4f' })
    const lines = await theLinesAfterARead('waits-three')
    expect(theRuns(lines)).toEqual([unstamped])
    expect(lines[1]!['resumeCommand']).toBeNull()
    expect(lines[1]!['unknown']).toContain('resumeCommand')
    expect(String(lines[1]!['resumeCommandUnknownBecause'])).toContain('30 minutes')
  })

  it('4: a run that has ended with no stamp is written at once, with why', async () => {
    await aResidentWithAnOldRun('waits-four')
    const id = agents.get('waits-four')!.id
    const ended = aSession(minutesAgo(1), { servingAgentId: id, state: 'crashed', runtime: 'claude-code', providerSession: '7a2e3f4d-5c6b-4d7e-9f80-a1b2c3d4e5f6' })
    const lines = await theLinesAfterARead('waits-four')
    expect(theRuns(lines)).toEqual([ended])
    expect(lines[1]!['resumeCommand']).toBeNull()
    expect(String(lines[1]!['resumeCommandUnknownBecause'])).toContain('ended')
  })

  it('5: a run that names no conversation is written at once, with no sentence about a stamp', async () => {
    await aResidentWithAnOldRun('waits-five')
    const id = agents.get('waits-five')!.id
    const unnamed = aSession(minutesAgo(1), { servingAgentId: id, state: 'running', runtime: 'dsh' })
    const lines = await theLinesAfterARead('waits-five')
    expect(theRuns(lines)).toEqual([unnamed])
    expect(lines[1]!['resumeCommandUnknownBecause']).toBeNull()
  })
})
