// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ARRIVING AGENT IS TOLD HOW THE PERSON WISHES TO BE ADDRESSED. The rule is a
 * decision.
 *
 * GET /api/brief carries `thePerson`, with how the person wishes to be addressed, and its opening (`head`,
 * built by `briefHead` in src/server/api/brief.ts) carries one line saying it when the person has set a part.
 * The session-start hook, tools/session-hook.mjs, prints that opening as it is, so the hook says it
 * too.
 *
 * WHAT IS PROVED HERE:
 *
 *   1. Before the person has set anything, the brief's opening and the hook say nothing about how to
 *      address them, and the body says nobody has set it.
 *   2. Once the person has set parts, the body carries them, the opening carries the one line with
 *      the values as written, and the hook prints that line.
 *
 * The values are made up. None is the owner's own.
 *
 * MUTATION (after a green control run, then restored): `briefHead` never pushes the address line.
 * Case 2 goes red at its first check of the opening.
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

async function theBrief(): Promise<{ head: string; thePerson: Record<string, unknown> }> {
  const reply = await server.app.inject({ method: 'GET', url: '/api/brief', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as { head: string; thePerson: Record<string, unknown> }
}

/** The lines of some printed text that say how the person wishes to be addressed. */
function addressLines(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('How the person '))
}

beforeAll(async () => {
  t = await freshDb()
  server = await apiApp()
  await server.app.listen({ port: 0, host: '127.0.0.1' })
  const address = server.app.server.address()
  url = `http://127.0.0.1:${String(typeof address === 'object' && address !== null ? address.port : 0)}`
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-address-the-person-'))
  const registered = await server.app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle: 'arriving-agent', name: 'Arriving Agent', role: 'worker' },
  })
  expect(registered.statusCode, registered.body).toBe(201)
}, 60_000)

afterAll(async () => {
  await server.app.close()
  t.close()
  rmSync(scratch, { recursive: true, force: true })
  const stateDir = fileURLToPath(new URL('../.logs', import.meta.url))
  for (const name of notesWritten.splice(0)) rmSync(join(stateDir, name), { force: true })
})

describe('the brief and the start hook say how to address the person', () => {
  it('say nothing about it while the person has set nothing', async () => {
    const brief = await theBrief()
    expect(addressLines(brief.head), brief.head).toEqual([])
    expect(brief.thePerson['addressAs']).toEqual({})
    const { HOW_TO_ADDRESS_THE_PERSON_IS_NOT_SET } = await import('../src/server/api/brief.ts')
    expect(String(brief.thePerson['note'])).toContain(HOW_TO_ADDRESS_THE_PERSON_IS_NOT_SET)
    const printed = await runHook('arriving-agent')
    expect(addressLines(printed), printed).toEqual([])
  }, 60_000)

  it('carry the person’s own words once the person has set them, in the body, the opening and the hook', async () => {
    const set = await server.app.inject({
      method: 'PUT',
      url: `/api/participants/person/${THE_PERSON}/address-as`,
      headers: AS_THE_PERSON,
      payload: { name: 'Morgan', thirdPerson: 'they', title: 'head of the bench' },
    })
    expect(set.statusCode, set.body).toBe(200)

    const brief = await theBrief()
    expect(brief.thePerson['addressAs']).toEqual({ name: 'Morgan', thirdPerson: 'they', title: 'head of the bench' })
    const personName = String(brief.thePerson['name'])
    const expected = `How the person ${personName} wishes to be addressed: name "Morgan"; third person "they"; title "head of the bench".`
    expect(addressLines(brief.head), brief.head).toEqual([expected])

    const printed = await runHook('arriving-agent')
    expect(addressLines(printed), printed).toEqual([expected])
  }, 60_000)
})
