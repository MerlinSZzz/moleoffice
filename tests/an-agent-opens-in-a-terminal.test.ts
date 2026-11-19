// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PERSON OPENS A REGISTERED AGENT IN ONE OF THE OFFICE'S TERMINALS, AND IT COMES BACK AFTER THE HOLDER RESTARTS.
 * Wave 13u, round 3: POST /api/terminals/agents (src/server/api/terminal-agents.ts, src/server/lib/terminal-agents.ts).
 *
 * NO REAL AGENT PROGRAM IS STARTED. Stand-ins named claude, codex, opencode and kimi are put first on the PATH the
 * scratch server gives its terminals. Each prints its arguments, its folder and the office variables it was given;
 * of the key it prints only whether it is set and its length. With a key it asks GET /api/handles/<handle>/waiting
 * with that key and with a wrong one, and prints both statuses. A real
 * holder and a real scratch server run on a database in the test's own folder (tests/terminal-holder-stand.ts).
 *
 *   1. An agent caller is refused 403 with the code terminalsOnlyThePerson, and nothing opens.
 *   2. An agent with no start folder asked to "resume" is refused with terminalAgentNoStartFolder, and a dsh agent
 *      with terminalAgentDshNotInteractive; nothing opens. Until wave 13s round 205 any open of an agent with no start
 *      folder was refused; since then the office makes one of its own for it
 *      (tests/an-agent-with-no-start-folder-opens-in-its-own-folder.test.ts), and only a resume, which has no
 *      conversation to continue, is refused.
 *   3. With the person's key, a claude-code agent opens in its start folder as `claude --session-id <uuid>`, after the
 *      switch that turns the harness's own subagents off (src/config/harness-features-off.mjs, wave 13s round 209), its
 *      terminal names the agent, and its environment carries the office's address, the project, the handle, the session
 *      record and a key. The stand-in's request to the waiting door with that key is answered, and the office marks the
 *      run key row the record names as used, which says the key the terminal got is that run key. (A scratch office's
 *      key window is open, so a wrong key is answered too, and only the row can say which key arrived.) The session
 *      record carries the runtime, folder, agent, conversation id, terminal and holder. Its profile reads "In a terminal".
 *   4. Without the person's key the agent opens with no key, and the answer says so. A codex agent's only arguments
 *      are its switch. Closing its terminal ends its run, and the end carries a usage receipt saying why a fresh Codex
 *      run's holds no numbers (wave 13s round 40).
 *   5. The holder is stopped by its group and a new one started: the claude agent opens again as
 *      `claude --resume <uuid>`, after the switch, with a new key that works, its record names the new terminal and
 *      holder, and the person gets one message naming it, and naming the kimi agent whose folder was removed as not
 *      opened again, whose record is closed with a usage receipt in words. A server restart against the same holder
 *      opens nothing again.
 *
 * MUTATIONS (each after a control run; the commit message has the runs and the logs):
 *   - lib/terminal-agents.ts theSameHolder answers true: nothing is opened again, case 5 goes red.
 *   - lib/terminal-agents.ts giveAKey is false: no key, cases 3 and 5 go red.
 *   - lib/terminal-agents.ts an end by SIGHUP ends the run at once: the holder's stop ends the run, case 5 goes red.
 *   - lib/presence.ts the terminal is not read: the profile says Inactive, case 3 goes red.
 *   - api/terminal-agents.ts the person check's refusal is swallowed: the agent opens one, case 1 goes red.
 *   - lib/terminal-agents.ts a resume with no start folder is answered 400, or given another code, or other words:
 *     case 2 goes red, each at its own expect.
 *   - lib/terminal-agents.ts endTheRunOf leaves the usage receipt out of its patch: cases 4 and 5 go red.
 *   - lib/terminal-agents.ts withTheHarnessFeaturesOff leaves claude-code's arguments as they are: case 3 goes red at
 *     the terminal's arguments, and case 5 with it; with codex's left: case 4 goes red at the terminal's arguments.
 *   - holder/index.mjs starts the program without its first argument and lists the arguments it was asked for: cases 3
 *     and 4 go red at the stand-in's screen. Only for a terminal the office opens: case 5 goes red at the screen.
 *   - lib/terminal-agents.ts the reopening gives the holder the resume command without the switch: case 5 goes red at
 *     the terminal's arguments; it names the command without the switch: case 5 goes red at the message.
 */

import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  AS_AN_AGENT,
  AS_THE_PERSON,
  aPlace,
  ask,
  groups,
  startAHolder,
  startAServer,
  stopEverything,
  stopTheGroup,
  stopTheServer,
  theStreamsScreen,
  until,
  type Place,
  type ScratchServer,
  type StartedHolder,
} from './terminal-holder-stand.ts'
import { theOfficesOwnIdIn, thePersonsKeyHeader } from './helpers.ts'
import { CLAUDE_CODE_FEATURES_OFF, CODEX_FEATURES_OFF } from '../src/config/harness-features-off.mjs'

let place: Place
let server: ScratchServer
let holder: StartedHolder
let personsKey: Record<string, string>
const ids: Record<string, string> = {}
let theClaudeRun = { session: '', terminal: '', conversation: '', key: '' }

/** A stand-in agent program: it prints what it was given and never the key, then waits until it is stopped. */
function aStandIn(name: string): string {
  return `#!${process.execPath}
const out = (line) => process.stdout.write(line + '\\r\\n')
out('STAND-IN ${name} ARGS ' + JSON.stringify(process.argv.slice(2)))
out('CWD ' + process.cwd())
for (const n of ['MOLE_OFFICE_API', 'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_AGENT', 'MOLE_OFFICE_SESSION']) out(n + '=' + (process.env[n] ?? '(unset)'))
const key = process.env.MOLE_AGENT_KEY
out('KEY ' + (key === undefined ? 'unset' : 'set') + ' LENGTH ' + String(key === undefined ? 0 : key.length))
const ask = async (k) => {
  const got = await fetch(process.env.MOLE_OFFICE_API + '/api/handles/' + process.env.MOLE_OFFICE_AGENT + '/waiting', {
    headers: { 'x-mole-office-workspace': process.env.MOLE_OFFICE_WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': process.env.MOLE_OFFICE_AGENT, 'x-mole-office-session': process.env.MOLE_OFFICE_SESSION, 'x-mole-office-key': k },
  })
  return got.status
}
;(async () => {
  if (key !== undefined) {
    out('WAITING WITH ITS KEY ' + String(await ask(key)))
    out('WAITING WITH A WRONG KEY ' + String(await ask('0'.repeat(64))))
  }
  out('STAND-IN READY')
})().catch((err) => out('STAND-IN FAILED ' + String(err)))
setInterval(() => undefined, 1 << 30)
`
}

/** Read the scratch office's database, read-only. */
function theDatabase<T>(read: (db: Database.Database) => T): T {
  const db = new Database(place.database, { readonly: true, fileMustExist: true })
  try {
    return read(db)
  } finally {
    db.close()
  }
}

function theRecord(id: string): { kind: string; data: Record<string, unknown> } {
  const row = theDatabase((db) => db.prepare('SELECT kind, data FROM records WHERE id = ?').get(id)) as { kind: string; data: string }
  return { kind: row.kind, data: JSON.parse(row.data) as Record<string, unknown> }
}

/** The run key row a session record names. */
function theRunKeyOf(session: string): string {
  return String((theRecord(session).data['extra'] as { runKeyId?: unknown }).runKeyId)
}

/** Whether a held key row is live, and whether the office recorded a use of it. Never the key or its hash. */
function theKeyRow(id: string): { live: boolean; used: boolean } {
  const row = theDatabase((db) => db.prepare('SELECT revoked_at AS revoked, last_used_at AS used FROM held_keys WHERE id = ?').get(id)) as { revoked: string | null; used: string | null }
  return { live: row.revoked === null, used: row.used !== null }
}

function theMessagesAboutAgentsInTerminals(): { id: string; data: Record<string, unknown> }[] {
  const rows = theDatabase((db) =>
    db.prepare("SELECT id, data FROM records WHERE kind = 'message' AND deleted_at IS NULL AND json_extract(data, '$.extra.agentsInTerminals') IS NOT NULL").all(),
  ) as { id: string; data: string }[]
  return rows.map((row) => ({ id: row.id, data: JSON.parse(row.data) as Record<string, unknown> }))
}

interface Listed {
  id: string
  pid: number
  command: string
  args: string[]
  folder: string
  agent: { kind: string; id: string } | null
  who: { kind: string; id: string } | null
  envNames: string[]
  state: string
  keeping: boolean
}

async function theList(): Promise<Listed[]> {
  const listed = await ask(server.api, '/api/terminals')
  expect(listed.status, JSON.stringify(listed.body)).toBe(200)
  const terminals = (listed.body['terminals'] ?? []) as Listed[]
  for (const one of terminals) groups.add(one.pid)
  return terminals
}

/** Register an agent as the person, with a runtime and, when given, a start folder. Answers its registry id. */
async function register(handle: string, runtime: string, startFolder: string | null): Promise<string> {
  const registered = await ask(server.api, '/api/agents/started', { method: 'POST', body: { handle, name: handle, role: 'worker', runtime } })
  expect(registered.status, JSON.stringify(registered.body)).toBe(201)
  const id = String((registered.body['agent'] as { id: string }).id)
  if (startFolder !== null) {
    mkdirSync(startFolder, { recursive: true })
    const set = await ask(server.api, `/api/participants/agent/${handle}/start-folder`, { method: 'POST', body: { startFolder, because: 'the test opens it in a terminal' } })
    expect(set.status, JSON.stringify(set.body)).toBe(200)
  }
  return id
}

async function openTheAgent(agent: string, headers: Record<string, string>, resume = false): Promise<{ status: number; body: Record<string, unknown> }> {
  const opened = await ask(server.api, '/api/terminals/agents', { method: 'POST', headers, body: { agent, cols: 200, rows: 40, ...(resume ? { resume } : {}) } })
  const terminal = opened.body['terminal'] as { pid?: number } | undefined
  if (typeof terminal?.pid === 'number') groups.add(terminal.pid)
  return opened
}

/** Wait until the terminal's screen shows the stand-in is ready, and answer its lines. */
async function theStandInsScreen(terminal: string): Promise<string[]> {
  return until(() => theStreamsScreen(server.api, terminal), (lines) => lines.some((line) => line.includes('STAND-IN READY') || line.includes('STAND-IN FAILED')))
}

beforeAll(async () => {
  place = aPlace('agents')
  const bin = join(place.dir, 'b')
  mkdirSync(bin)
  for (const name of ['claude', 'codex', 'opencode', 'kimi']) {
    writeFileSync(join(bin, name), aStandIn(name))
    chmodSync(join(bin, name), 0o755)
  }
  holder = await startAHolder(place)
  server = await startAServer(place, undefined, { PATH: `${bin}:${process.env['PATH'] ?? '/usr/bin:/bin'}` })
  personsKey = thePersonsKeyHeader(join(dirname(place.database), 'keys.json'))
  ids['claude'] = await register('term-claude', 'claude-code', join(place.dir, 'w'))
  ids['codex'] = await register('term-codex', 'codex', join(place.dir, 'x'))
  ids['kimi'] = await register('term-kimi', 'kimi', join(place.dir, 'k'))
  ids['nofolder'] = await register('term-nofolder', 'claude-code', null)
  ids['dsh'] = await register('term-dsh', 'dsh', join(place.dir, 'd'))
  const agentRegistered = await ask(server.api, '/api/agents/started', {
    method: 'POST',
    body: { handle: AS_AN_AGENT['x-mole-office-actor-id'], name: 'Some agent', role: 'worker' },
  })
  expect(agentRegistered.status, JSON.stringify(agentRegistered.body)).toBe(201)
}, 180_000)

afterAll(stopEverything, 60_000)

describe('an agent in a terminal', () => {
  it('1: refuses an agent caller with its code, and opens nothing', async () => {
    const before = (await theList()).length
    const refused = await openTheAgent('term-claude', AS_AN_AGENT)
    expect(refused.status, JSON.stringify(refused.body)).toBe(403)
    expect(refused.body['code']).toBe('terminalsOnlyThePerson')
    expect((await theList()).length).toBe(before)
  }, 60_000)

  it('2: refuses an agent with no start folder asked to resume, and a dsh agent, each with its code, and opens nothing', async () => {
    const before = (await theList()).length
    const noFolder = await openTheAgent('term-nofolder', { ...AS_THE_PERSON, ...personsKey }, true)
    expect(noFolder.status, JSON.stringify(noFolder.body)).toBe(409)
    expect(noFolder.body['code']).toBe('terminalAgentNoStartFolder')
    expect(String(noFolder.body['error'])).toContain('no start folder')
    const dsh = await openTheAgent('term-dsh', { ...AS_THE_PERSON, ...personsKey })
    expect(dsh.status, JSON.stringify(dsh.body)).toBe(409)
    expect(dsh.body['code']).toBe('terminalAgentDshNotInteractive')
    expect((await theList()).length).toBe(before)
    const sessions = theDatabase((db) => db.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'session' AND json_extract(data, '$.servingAgentId') IN (?, ?)").get(ids['nofolder'], ids['dsh'])) as { n: number }
    expect(sessions.n).toBe(0)
  }, 60_000)

  it("3: opens a claude-code agent in its start folder, as itself, with a run key that works, on the person's key", async () => {
    const opened = await openTheAgent('term-claude', { ...AS_THE_PERSON, ...personsKey })
    expect(opened.status, JSON.stringify(opened.body)).toBe(201)
    // THE KEY NEVER LEAVES IN THE ANSWER: no 64-character hex string is in it.
    expect(JSON.stringify(opened.body)).not.toMatch(/[0-9a-f]{64}/)
    expect((opened.body['key'] as { given: boolean }).given).toBe(true)
    const terminal = opened.body['terminal'] as Listed
    const session = String(opened.body['session'])
    const conversation = String(opened.body['providerSession'])
    expect(conversation).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(terminal.command).toBe(join(place.dir, 'b', 'claude'))
    expect(terminal.args).toEqual([...CLAUDE_CODE_FEATURES_OFF, '--session-id', conversation])
    expect(terminal.folder).toBe(join(place.dir, 'w'))
    expect(terminal.agent).toEqual({ kind: 'agent', id: ids['claude'] })
    expect(terminal.who?.kind).toBe('person')
    for (const name of ['MOLE_OFFICE_API', 'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_AGENT', 'MOLE_OFFICE_SESSION', 'MOLE_AGENT_KEY']) expect(terminal.envNames).toContain(name)

    const screen = (await theStandInsScreen(terminal.id)).join('\n')
    expect(screen).toContain(`STAND-IN claude ARGS ${JSON.stringify([...CLAUDE_CODE_FEATURES_OFF, '--session-id', conversation])}`)
    expect(screen).toContain(`CWD ${join(place.dir, 'w')}`)
    expect(screen).toContain(`MOLE_OFFICE_API=${server.api}`)
    expect(screen).toContain('MOLE_OFFICE_WORKSPACE=default')
    expect(screen).toContain('MOLE_OFFICE_AGENT=term-claude')
    expect(screen).toContain(`MOLE_OFFICE_SESSION=${session}`)
    expect(screen).toContain('KEY set LENGTH 64')
    expect(screen).toContain('WAITING WITH ITS KEY 200')
    // THE OFFICE KNEW THE KEY: the run key's own row, the one the record names, was marked used by the stand-in's
    // request. A scratch office's key window is open, so a wrong key is answered too (the screen prints its status),
    // and only this row says the key the terminal got is the run key the office made.
    expect(theKeyRow(theRunKeyOf(session))).toEqual({ live: true, used: true })

    const record = theRecord(session)
    expect(record.kind).toBe('session')
    expect(record.data['state']).toBe('running')
    expect(record.data['runtime']).toBe('claude-code')
    expect(record.data['workingDirectory']).toBe(join(place.dir, 'w'))
    expect(record.data['servingAgent']).toBe('term-claude')
    expect(record.data['servingAgentId']).toBe(ids['claude'])
    expect(record.data['providerSession']).toBe(conversation)
    const extra = record.data['extra'] as { inATerminal: { terminal: string; holder: { pid: number } }; runKeyId: string }
    expect(extra.inATerminal.terminal).toBe(terminal.id)
    expect(extra.inATerminal.holder.pid).toBe(holder.pid)
    expect(typeof extra.runKeyId).toBe('string')

    // THE PROFILE READS ITS TERMINAL, not "Inactive".
    const profile = await ask(server.api, `/api/participants/agent/${ids['claude']}/profile`)
    expect(profile.status, JSON.stringify(profile.body)).toBe(200)
    const presence = profile.body['presence'] as { word: string; says: string; colour: string }
    expect(presence.word).toBe('In a terminal')
    expect(presence.says).toContain(`at work in one of the office's terminals, in ${join(place.dir, 'w')}`)
    theClaudeRun = { session, terminal: terminal.id, conversation, key: theRunKeyOf(session) }
  }, 90_000)

  it('4: opens an agent with no key when the press did not carry the person key, says so, and ends its run when its terminal closes', async () => {
    const opened = await openTheAgent('term-codex', AS_THE_PERSON)
    expect(opened.status, JSON.stringify(opened.body)).toBe(201)
    expect((opened.body['key'] as { given: boolean; says: string }).given).toBe(false)
    expect((opened.body['key'] as { says: string }).says).toContain('cannot hold its handle until it has a key')
    const terminal = opened.body['terminal'] as Listed
    expect(terminal.args).toEqual([...CODEX_FEATURES_OFF])
    expect(terminal.envNames).not.toContain('MOLE_AGENT_KEY')
    expect(opened.body['providerSession']).toBeNull()
    const screen = (await theStandInsScreen(terminal.id)).join('\n')
    expect(screen).toContain(`STAND-IN codex ARGS ${JSON.stringify(CODEX_FEATURES_OFF)}`)
    expect(screen).toContain('KEY unset LENGTH 0')
    const session = String(opened.body['session'])
    expect(theRecord(session).data['providerSession']).toBeUndefined()

    const closed = await ask(server.api, `/api/terminals/${terminal.id}/close`, { method: 'POST', body: {} })
    expect(closed.status, JSON.stringify(closed.body)).toBe(200)
    const ended = await until(() => theRecord(session).data['state'], (state) => state !== 'running', 10_000)
    expect(ended).toBe('crashed')
    expect(theRecord(session).data['closedHow']).toBe('person-said')
    expect(theRecord(session).data['usageReceipt']).toMatchObject({
      runtime: 'codex',
      source: "read by the office when the run's terminal ended",
      says: "No numbers were read when its terminal ended: Codex picks its own thread id when the office opens it in a terminal, and nothing recorded which thread this run had, so no rollout is this run's own.",
    })
  }, 90_000)

  it('5: after the holder restarts, opens the agent again with its resume command, tells the person once, and not again on a server restart', async () => {
    // A KIMI AGENT WHOSE FOLDER IS GONE BY THEN cannot be opened again, and is said.
    const kimi = await openTheAgent('term-kimi', { ...AS_THE_PERSON, ...personsKey })
    expect(kimi.status, JSON.stringify(kimi.body)).toBe(201)
    const kimiTerminal = kimi.body['terminal'] as Listed
    expect(kimiTerminal.args[0]).toBe('-S')
    await theStandInsScreen(kimiTerminal.id)
    const kimiSession = String(kimi.body['session'])
    // THE PERSON TURNS KEEPING OFF IN THE CLAUDE AGENT'S TERMINAL (wave 13u, round 4), and it stays off when opened again.
    const off = await ask(server.api, `/api/terminals/${theClaudeRun.terminal}/keeping`, { method: 'PUT', body: { on: false } })
    expect(off.status, JSON.stringify(off.body)).toBe(200)
    expect((theRecord(theClaudeRun.session).data['extra'] as { inATerminal: { keeping?: boolean } }).inATerminal.keeping).toBe(false)

    await stopTheGroup(holder.pid)
    rmSync(join(place.dir, 'k'), { recursive: true, force: true })
    holder = await startAHolder(place)

    const listed = await until(theList, (all) => all.some((one) => one.agent?.id === ids['claude']), 20_000)
    const again = listed.find((one) => one.agent?.id === ids['claude'])!
    expect(again.args).toEqual([...CLAUDE_CODE_FEATURES_OFF, '--resume', theClaudeRun.conversation])
    expect(again.folder).toBe(join(place.dir, 'w'))
    expect(again.who).toEqual({ kind: 'agent', id: theDatabase((db) => theOfficesOwnIdIn(db)) })
    expect(again.keeping).toBe(false)
    const screen = (await theStandInsScreen(again.id)).join('\n')
    // THE LINE IS WIDER THAN THE TERMINAL OPENED AGAIN, at the holder's first size, so it is read with the rows joined.
    expect(screen.split('\n').join('')).toContain(`STAND-IN claude ARGS ${JSON.stringify([...CLAUDE_CODE_FEATURES_OFF, '--resume', theClaudeRun.conversation])}`)
    expect(screen).toContain(`MOLE_OFFICE_SESSION=${theClaudeRun.session}`)
    expect(screen).toContain('WAITING WITH ITS KEY 200')
    // A NEW KEY, which the office knew, in place of the old one, which is revoked.
    const newKey = theRunKeyOf(theClaudeRun.session)
    expect(newKey).not.toBe(theClaudeRun.key)
    expect(theKeyRow(newKey)).toEqual({ live: true, used: true })
    expect(theKeyRow(theClaudeRun.key).live).toBe(false)

    const record = theRecord(theClaudeRun.session)
    expect(record.data['state']).toBe('running')
    const extra = record.data['extra'] as { inATerminal: { terminal: string; holder: { pid: number }; reopened: unknown[]; keeping?: boolean } }
    expect(extra.inATerminal.terminal).toBe(again.id)
    expect(extra.inATerminal.keeping).toBe(false)
    expect(extra.inATerminal.holder.pid).toBe(holder.pid)
    expect(extra.inATerminal.reopened).toHaveLength(1)
    expect(listed.some((one) => one.agent?.id === ids['kimi'])).toBe(false)
    expect(theRecord(kimiSession).data['state']).toBe('crashed')
    expect(theRecord(kimiSession).data['usageReceipt']).toMatchObject({ runtime: 'kimi', says: "No numbers were read when its terminal ended: the office has no reader of a kimi run's own log." })

    const told = theMessagesAboutAgentsInTerminals()
    expect(told).toHaveLength(1)
    const message = told[0]!.data
    expect(message['to']).toEqual([{ kind: 'person', id: expect.any(String) }])
    expect(message['sentBy']).toEqual({ kind: 'agent', id: theDatabase((db) => theOfficesOwnIdIn(db)) })
    const said = String(message['saidInFull'])
    expect(said).toContain('Opened again: term-claude')
    expect(said).toContain(`claude ${CLAUDE_CODE_FEATURES_OFF.join(' ')} --resume ${theClaudeRun.conversation}`)
    expect(said).toContain('Not opened again: term-kimi')
    expect(said).toContain('is not a folder on this computer any more')

    // THE SAME HOLDER AFTER A SERVER RESTART: nothing is opened again and nobody is told again.
    await stopTheServer(server)
    server = await startAServer(place, undefined, { PATH: server.env['PATH'] })
    const afterRestart = await theList()
    expect(afterRestart.filter((one) => one.agent?.id === ids['claude']).map((one) => one.id)).toEqual([again.id])
    expect(theMessagesAboutAgentsInTerminals()).toHaveLength(1)
    expect((theRecord(theClaudeRun.session).data['extra'] as { inATerminal: { terminal: string } }).inATerminal.terminal).toBe(again.id)
  }, 180_000)
})
