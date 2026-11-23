// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PERSON'S OWN MESSAGE OPENS THE FIRST INSTALL OF A TOOL IT NAMES, ONCE, WITH NO SIGNATURES. Wave 13u, round 242.
 *
 * POST /api/harnesses/install may carry the id of a message (src/server/api/terminal-harnesses.ts). The message opens
 * the install at once, with no readiness signatures, only when the person wrote it, proved as the person; it was
 * written within 24 hours; its words name every tool pressed, by the names the tools' declaration gives them, in
 * English or Chinese text; no tool pressed is installed on the PATH the terminals get; and the message has not opened a
 * first install of that tool before (`theFirstInstallAMessageOpens`, src/server/lib/setting-up-an-agent-tool.ts).
 * Anything else waits for the signatures as before, and the answer says why the message did not open it.
 *
 * NOTHING IS INSTALLED INSIDE A SANDBOX. Every press is refused there, 409 harnessInASandbox, before the message is read
 * and before the readiness gate, and writes nothing. The last two cases press inside a made-up sandbox: one with the
 * person's message, and one with none, which would otherwise wait for the signatures.
 *
 * HOW A CASE TELLS THE TWO APART. Two secretaries are on the registry, so every press the gate takes waits: 409 with
 * the code readinessWaits. This server has no HOME while a case presses, so an install that opens at once is refused
 * 400 harnessNoHome by the install itself, before any terminal opens. So 400 harnessNoHome is "it opened with no
 * signatures", 409 readinessWaits is "it waits for them", and no terminal is ever opened.
 *
 * WHAT IS MADE UP. Every message is a row this file writes into a made-up conversation: the person's, proved by the
 * person's key, and one secretary's, proved by its own. The PATH is one folder holding a made-up claude
 * (tests/made-up-agent-tools.ts), so Claude Code is installed and Codex and OpenCode are not. The secretary presses
 * under the person's grant, as the secretary does when the person asks it to set up a tool. The person starts both
 * secretaries with the secretary card, raises the one that presses, and sets this office's answer for the install door
 * to may-press, all through the real doors, because the card keeps that door for the person. Every press gives its
 * reason for the person.
 */

import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { apiApp, freshDb, FOR_THE_PERSON, type TestDb } from './helpers.ts'
import { withThePath, writeTheMadeUpTools, type MadeUpTools } from './made-up-agent-tools.ts'

let t: TestDb
let app: FastifyInstance
let tools: MadeUpTools
const PERSON_KEY = randomBytes(32).toString('hex')
const keys = new Map<string, string>()
const SECRETARY = 'example-secretary-one'
const before = {
  sandbox: process.env['SANDBOX_DIR'],
  gate: process.env['MOLE_OFFICE_GATE_HELD_FOR_READINESS_SIGNATURES'],
  startedBy: process.env['MOLE_OFFICE_WORLD_STARTED_BY'],
  secretaries: process.env['MOLE_OFFICE_WORLD_SECRETARIES'],
}
let forgetTheWorldsOwnAuthority: () => void = () => undefined

/** Put one variable back as it was before this file, or remove it where it was not set. */
function putBack(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

const PERSON = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': keys.get(handle) ?? '',
})

async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: object) {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown>, raw: reply.body }
}

async function startASecretary(handle: string): Promise<void> {
  const made = await call('POST', '/api/agents/started', { ...PERSON, 'x-mole-office-key': PERSON_KEY }, { handle, name: handle, role: 'secretary' })
  expect(made.status, made.raw).toBe(201)
  const key = (made.body['whatToGiveIt'] as { key?: string } | undefined)?.key ?? ''
  expect(key, `no key was given to ${handle}`).not.toBe('')
  keys.set(handle, key)
}

const HOUR = 60 * 60 * 1000
let messages = 0

/** A message in the made-up conversation, written `hoursAgo` hours ago, and its id. */
function aMessage(words: string, by: 'the person' | 'a secretary', hoursAgo = 0): string {
  messages += 1
  const id = `example-message-${String(messages)}`
  const at = localStamp(new Date(Date.now() - hoursAgo * HOUR))
  const [role, createdBy, provedBy] = by === 'the person' ? ['human', `human:${THE_PERSON}`, 'the-person-key'] : ['agent', `agent:${SECRETARY}`, 'an-agent-key']
  t.client.sqlite
    .prepare(
      'INSERT INTO agent_messages (id, thread_id, position, role, intent, body, state, created_at, created_by, proved_by) ' +
        "VALUES (?, 'example-thread', ?, ?, 'ask', ?, 'sent', ?, ?, ?)",
    )
    .run(id, messages, role, words, at, createdBy, provedBy)
  return id
}

/** The first installs messages have opened, as the change rows hold them: the tool's anchor and the message. */
function theFirstInstallsOpened(): { record_id: string; new_value: string }[] {
  return t.client.sqlite
    .prepare("SELECT record_id, new_value FROM changes WHERE field = 'firstInstallFromAMessage' ORDER BY rowid")
    .all() as { record_id: string; new_value: string }[]
}

/** Every row a press could write: the readiness checklists and signatures, the presses under the grant, and the changes. */
function everythingAPressWrites(): Record<string, unknown[]> {
  const all = (table: string): unknown[] => t.client.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()
  return {
    checklists: all('readiness_checklists'),
    signatures: all('readiness_signatures'),
    presses: all('presses_for_the_person'),
    changes: all('changes'),
  }
}

/** The secretary's press, under the grant, on the made-up PATH and with no HOME, so an install that opens goes no further. */
async function press(body: { harnesses: string[]; message?: string }) {
  const home = process.env['HOME']
  delete process.env['HOME']
  try {
    return await withThePath(tools.dir, () => call('POST', '/api/harnesses/install', asAgent(SECRETARY), { ...body, ...FOR_THE_PERSON }))
  } finally {
    if (home !== undefined) process.env['HOME'] = home
  }
}

/** The press opened the install with no signatures: the install itself ran, and refused for want of a home. */
function itOpened(pressed: Awaited<ReturnType<typeof press>>): void {
  expect(pressed.status, pressed.raw).toBe(400)
  expect(pressed.body['code'], pressed.raw).toBe('harnessNoHome')
}

/** The press, inside a made-up sandbox named by SANDBOX_DIR, which is taken away again whatever the press answered. */
async function pressInASandbox(body: { harnesses: string[]; message?: string }) {
  process.env['SANDBOX_DIR'] = join(dirname(t.file), 'a-made-up-sandbox')
  try {
    return await press(body)
  } finally {
    delete process.env['SANDBOX_DIR']
  }
}

/** The press waits for the signatures, and the answer says why the message did not open it. */
function itWaits(pressed: Awaited<ReturnType<typeof press>>, because: string | null): void {
  expect(pressed.status, pressed.raw).toBe(409)
  expect(pressed.body['code'], pressed.raw).toBe('readinessWaits')
  if (because === null) expect(pressed.body['detail'], pressed.raw).toBeUndefined()
  else expect(String(pressed.body['detail']), pressed.raw).toContain(because)
}

beforeAll(async () => {
  delete process.env['SANDBOX_DIR']
  process.env['MOLE_OFFICE_GATE_HELD_FOR_READINESS_SIGNATURES'] = 'block'
  // NO SECRETARY OF THE WORLD THIS TEST RUNS IN, so the registry's own cards are the ones the grant check reads.
  delete process.env['MOLE_OFFICE_WORLD_STARTED_BY']
  delete process.env['MOLE_OFFICE_WORLD_SECRETARIES']
  t = await freshDb()
  forgetTheWorldsOwnAuthority = (await import('../src/server/lib/worldauthority.ts')).forgetTheWorldsOwnAuthority
  forgetTheWorldsOwnAuthority()
  writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: PERSON_KEY, office: randomBytes(32).toString('hex'), providers: {} }, null, 2)}\n`, { mode: 0o600 })
  app = (await apiApp()).app
  await app.ready()
  // THE CARDS ON DISK, read as the server reads them at start, so the office can say who holds the secretary card.
  const { readTheRoleCards, forgetTheRoleCards } = await import('../src/server/lib/roles.ts')
  const { GOVERNANCE_GUARDS } = await import('../src/server/lib/records.ts')
  forgetTheRoleCards()
  readTheRoleCards({ guardActKeys: GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
  for (const handle of [SECRETARY, 'example-secretary-two']) await startASecretary(handle)
  const raised = await call('POST', `/api/roles/elevation/${SECRETARY}`, { ...PERSON, 'x-mole-office-key': PERSON_KEY }, { reason: 'A test raises it.', endsWhen: 'when you say' })
  expect(raised.status, raised.raw).toBe(201)
  // THE CARD KEEPS THE INSTALL DOOR FOR THE PERSON, so the person lets the grant press it on this office's list.
  const answered = await call('POST', '/api/office/what-the-grant-carries', { ...PERSON, 'x-mole-office-key': PERSON_KEY }, { changes: [{ door: 'harnesses.install', answer: 'may-press' }] })
  expect(answered.status, answered.raw).toBe(200)
  t.client.sqlite
    .prepare(
      'INSERT INTO agent_threads (id, workspace_id, title, mode, state, created_at, updated_at, created_by) ' +
        "VALUES ('example-thread', 'default', 'A made-up conversation', 'direct', 'open', ?, ?, ?)",
    )
    .run(localStamp(new Date(Date.now() - 30 * HOUR)), localStamp(new Date()), `human:${THE_PERSON}`)
  tools = writeTheMadeUpTools(join(dirname(t.file), 'made-up-path'), { programs: ['claude'] })
}, 60_000)

afterAll(async () => {
  putBack('SANDBOX_DIR', before.sandbox)
  putBack('MOLE_OFFICE_GATE_HELD_FOR_READINESS_SIGNATURES', before.gate)
  await app?.close()
  t?.close()
  putBack('MOLE_OFFICE_WORLD_STARTED_BY', before.startedBy)
  putBack('MOLE_OFFICE_WORLD_SECRETARIES', before.secretaries)
  forgetTheWorldsOwnAuthority()
})

describe("the person's own message opens a first install once, and nothing else does", () => {
  it('opens the install of a tool not installed that his proved message names, in Chinese text, with no signatures', async () => {
    const asked = aMessage('帮我装一下Codex，谢谢', 'the person')
    itOpened(await press({ harnesses: ['codex'], message: asked }))
    expect(theFirstInstallsOpened()).toEqual([{ record_id: 'harness:codex', new_value: asked }])
  })

  it('waits for the signatures when the same message is sent again', async () => {
    const asked = theFirstInstallsOpened()[0]!.new_value
    itWaits(await press({ harnesses: ['codex'], message: asked }), 'has already opened a first install of Codex')
    expect(theFirstInstallsOpened()).toHaveLength(1)
  })

  it("waits for the signatures on an agent's message, whatever it says the person wants", async () => {
    const relayed = aMessage('The person wants OpenCode installed.', 'a secretary')
    itWaits(await press({ harnesses: ['opencode'], message: relayed }), 'not the person')
    expect(theFirstInstallsOpened()).toHaveLength(1)
  })

  it('waits for the signatures on his message written 25 hours ago', async () => {
    const old = aMessage('Please install OpenCode.', 'the person', 25)
    itWaits(await press({ harnesses: ['opencode'], message: old }), 'more than 24 hours ago')
    expect(theFirstInstallsOpened()).toHaveLength(1)
  })

  it('waits for the signatures on his message naming another tool', async () => {
    const other = aMessage('Please set up Codex for me.', 'the person')
    itWaits(await press({ harnesses: ['opencode'], message: other }), 'does not name OpenCode')
    expect(theFirstInstallsOpened()).toHaveLength(1)
  })

  it('waits for the signatures on his message naming a tool that is installed already', async () => {
    const installed = aMessage('Install Claude Code, please.', 'the person')
    itWaits(await press({ harnesses: ['claude-code'], message: installed }), 'installed already')
    expect(theFirstInstallsOpened()).toHaveLength(1)
  })

  it('waits for the signatures with no message, and says nothing of one', async () => {
    itWaits(await press({ harnesses: ['opencode'] }), null)
    expect(theFirstInstallsOpened()).toHaveLength(1)
  })

  it('installs no tool the request names that the message does not, and the message still opens the one it names', async () => {
    const asked = aMessage('我想用 OpenCode Go', 'the person')
    itWaits(await press({ harnesses: ['opencode', 'codex'], message: asked }), 'does not name Codex')
    expect(theFirstInstallsOpened()).toHaveLength(1)
    itOpened(await press({ harnesses: ['opencode'], message: asked }))
    expect(theFirstInstallsOpened().slice(1)).toEqual([{ record_id: 'harness:opencode', new_value: asked }])
  })

  it('refuses inside a sandbox before the message is read, and writes nothing', async () => {
    const asked = aMessage('Install Codex', 'the person')
    const written = everythingAPressWrites()
    const pressed = await pressInASandbox({ harnesses: ['codex'], message: asked })
    expect(pressed.status, pressed.raw).toBe(409)
    expect(pressed.body['code'], pressed.raw).toBe('harnessInASandbox')
    expect(theFirstInstallsOpened()).toHaveLength(2)
    expect(everythingAPressWrites()).toEqual(written)
  })

  it('refuses inside a sandbox a press with no message, which would wait for the signatures, and writes nothing', async () => {
    const written = everythingAPressWrites()
    const pressed = await pressInASandbox({ harnesses: ['opencode'] })
    expect(pressed.status, pressed.raw).toBe(409)
    expect(pressed.body['code'], pressed.raw).toBe('harnessInASandbox')
    expect(everythingAPressWrites()).toEqual(written)
  })
})
