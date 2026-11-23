// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NEW AGENT DIALOG'S CREATE: ONE DOOR MAKES THE AGENT AND OPENS IT IN THE CHOSEN TERMINAL.
 * POST /api/agents/new (src/server/api/new-agent.ts).
 *
 * NO REAL AGENT PROGRAM AND NO REAL TERMINAL IS STARTED. Stand-ins named claude, codex, opencode and kimi are put first
 * on the PATH of a scratch server, as in tests/an-agent-opens-in-a-terminal.test.ts. Each prints its arguments and the
 * office variables it was given, and waits. A stand-in named gnome-terminal is first on the same PATH: it writes the
 * words it was given and the office variables to a file in the test's own folder, and ends at once. So on Linux the
 * terminal outside is the stand-in, and nothing opens a window. A real holder and a real scratch server run on a
 * database in the test's own folder (tests/terminal-holder-stand.ts), on 127.0.0.1.
 *
 * THE MADE-UP OFFICE. Every Casting row of the worker card is removed, and two are added for every project: a marked
 * Claude Code row and a Codex row. One inspector row is added for a made-up project. One agent is registered first,
 * so its name is taken.
 *
 *   1. An agent caller is refused 403, and nothing is made.
 *   2. Each refused value is refused before anything is made, and the refusal names it: an agent tool the office does
 *      not know, a model the chosen tool is not cast with, an effort the chosen model is not cast at, a role that is
 *      not a card, a project that is not there, a name that is not a handle, and a taken name. No agent record is
 *      written and no terminal is opened.
 *   3. With every value chosen, the agent is made with each of them, read back from the office's own records: its
 *      name, its handle, its agent tool, its role and its project. It opens in the office's own terminal, and the
 *      session record carries the chosen model and effort. The terminal's arguments carry the same two words, after the
 *      flags the office already uses for that tool.
 *   4. With nothing but a name, the agent is made with the defaults: the marked Casting row in force for the worker
 *      card in the project being read, the worker card, that project, and the office's own terminal.
 *   5. On Linux, opened outside on the person's own press: the office asks gnome-terminal to start the agent in its
 *      folder, with the chosen model and effort and the office's variables. The agent is given a key file of its own,
 *      private, beside the office's key file, holding the one live key of that agent, which the office takes. Only
 *      MOLE_AGENT_KEY_FILE, the file's path, is on the command line, and the key is nowhere on it or in the answer. No
 *      terminal of the office's own is opened.
 *   6. On Linux, when the terminal outside ends with an error: the agent is made, and the answer says so, says the
 *      terminal was not opened, and gives the terminal's own words. No terminal of the office's own is opened instead.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
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
  theStreamsScreen,
  until,
  type Place,
  type ScratchServer,
} from './terminal-holder-stand.ts'
import { thePersonsKeyHeader } from './helpers.ts'
import { CLAUDE_CODE_FEATURES_OFF, CODEX_FEATURES_OFF } from '../src/config/harness-features-off.mjs'
import { CODEX_SHELL_SNAPSHOT_OFF } from '../src/config/run-permissions.mjs'

let place: Place
let server: ScratchServer
let asThePerson: Record<string, string>

const GARDEN = 'made-up-garden'

/** The agent the stand-in terminal outside fails to open. */
const UNOPENED = 'unopened-heron'

/** The Casting rows the made-up office holds, in the order they are added. The first of each scope is marked. */
const ROWS = [
  { role: 'worker', project: null, program: 'claude-code', model: 'claude-opus-5-5', effort: 'high' },
  { role: 'worker', project: null, program: 'codex', model: 'gpt-6.1-sol', effort: 'low' },
  { role: 'inspector', project: GARDEN, program: 'codex', model: 'gpt-6.1-sol', effort: 'medium' },
] as const

/** A stand-in agent program: it prints what it was given and never the key, then waits until it is stopped. */
function aStandIn(name: string): string {
  return `#!${process.execPath}
const out = (line) => process.stdout.write(line + '\\r\\n')
out('STAND-IN ${name} ARGS ' + JSON.stringify(process.argv.slice(2)))
out('EFFORT ' + (process.env.CLAUDE_CODE_EFFORT_LEVEL ?? '(unset)'))
out('MOLE_OFFICE_AGENT=' + (process.env.MOLE_OFFICE_AGENT ?? '(unset)'))
out('STAND-IN READY')
setInterval(() => undefined, 1 << 30)
`
}

/**
 * The stand-in terminal outside: it writes the words it was given to a file and ends, so no window opens. Asked to
 * start the agent named UNOPENED, it fails as a terminal does that cannot parse its words, and writes nothing.
 */
function aStandInTerminal(file: string): string {
  return `#!${process.execPath}
const args = process.argv.slice(2)
if (args.includes('MOLE_OFFICE_AGENT=${UNOPENED}')) {
  process.stderr.write('# Failed to parse arguments\\n')
  process.exit(1)
}
require('node:fs').writeFileSync(${JSON.stringify(file)}, JSON.stringify({ args }))
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

/** The live agent record with this handle, as the office stored it, or null. */
function theAgentRecord(handle: string): { id: string; title: string; workspace: string; data: Record<string, unknown> } | null {
  const row = theDatabase((db) =>
    db
      .prepare("SELECT id, title, workspace_id AS workspace, data FROM records WHERE kind = 'agent' AND deleted_at IS NULL AND json_extract(data, '$.handle') = ?")
      .get(handle),
  ) as { id: string; title: string; workspace: string; data: string } | undefined
  return row === undefined ? null : { id: row.id, title: row.title, workspace: row.workspace, data: JSON.parse(row.data) as Record<string, unknown> }
}

function theRecordCount(kind: string): number {
  return (theDatabase((db) => db.prepare('SELECT COUNT(*) AS n FROM records WHERE kind = ? AND deleted_at IS NULL').get(kind)) as { n: number }).n
}

/** The registry row an agent record maps to: the id a run's servingAgentId holds, which the registry mints itself. */
function theRegistryRowOf(recordId: string): string | null {
  const row = theDatabase((db) => db.prepare('SELECT agent_id AS id FROM agent_records WHERE record_id = ?').get(recordId)) as { id: string } | undefined
  return row?.id ?? null
}

function theSession(id: string): Record<string, unknown> {
  const row = theDatabase((db) => db.prepare("SELECT data FROM records WHERE id = ? AND kind = 'session'").get(id)) as { data: string }
  return JSON.parse(row.data) as Record<string, unknown>
}

interface Listed {
  id: string
  pid: number
  command: string
  args: string[]
  agent: { kind: string; id: string } | null
  envNames: string[]
}

async function theList(): Promise<Listed[]> {
  const listed = await ask(server.api, '/api/terminals')
  expect(listed.status, JSON.stringify(listed.body)).toBe(200)
  const terminals = (listed.body['terminals'] ?? []) as Listed[]
  for (const one of terminals) groups.add(one.pid)
  return terminals
}

async function create(body: Record<string, unknown>, headers: Record<string, string> = asThePerson): Promise<{ status: number; body: Record<string, unknown> }> {
  const made = await ask(server.api, '/api/agents/new', { method: 'POST', headers, body: { cols: 120, rows: 30, ...body } })
  const terminal = made.body['terminal'] as { pid?: number } | undefined
  if (typeof terminal?.pid === 'number') groups.add(terminal.pid)
  return made
}

/** The word right after a flag in a list of arguments, or null. */
function afterTheFlag(args: readonly string[], flag: string): string | null {
  const at = args.indexOf(flag)
  return at === -1 ? null : (args[at + 1] ?? null)
}

async function theStandInsScreen(terminal: string): Promise<string> {
  return (await until(() => theStreamsScreen(server.api, terminal), (lines) => lines.some((line) => line.includes('STAND-IN READY')))).join('\n')
}

/**
 * The line a stand-in printed that starts with `start`, whole. The terminal breaks a line longer than its width onto
 * the next screen lines, so the screen lines from that line up to the stand-in's next line, which starts with `next`,
 * are joined again with nothing between them. A screen line is read without its trailing spaces, so a break just after
 * a space would lose that space. The line read here holds spaces only in its first words, which fit on one screen line.
 */
function thePrintedLine(screen: string, start: string, next: string): string {
  const lines = screen.split('\n')
  const from = lines.findIndex((line) => line.startsWith(start))
  const to = lines.findIndex((line, at) => at > from && line.startsWith(next))
  expect(from, screen).toBeGreaterThanOrEqual(0)
  expect(to, screen).toBeGreaterThan(from)
  return lines.slice(from, to).join('')
}

beforeAll(async () => {
  place = aPlace('new-agent')
  const bin = join(place.dir, 'b')
  mkdirSync(bin)
  for (const name of ['claude', 'codex', 'opencode', 'kimi']) {
    writeFileSync(join(bin, name), aStandIn(name))
    chmodSync(join(bin, name), 0o755)
  }
  writeFileSync(join(bin, 'gnome-terminal'), aStandInTerminal(join(place.dir, 'outside.json')))
  chmodSync(join(bin, 'gnome-terminal'), 0o755)
  await startAHolder(place)
  server = await startAServer(place, undefined, { PATH: `${bin}:${process.env['PATH'] ?? '/usr/bin:/bin'}` })
  asThePerson = { ...AS_THE_PERSON, ...thePersonsKeyHeader(join(dirname(place.database), 'keys.json')) }

  const made = await ask(server.api, '/api/workspaces', { method: 'POST', headers: asThePerson, body: { id: GARDEN, title: 'Made-up garden project' } })
  expect(made.status, JSON.stringify(made.body)).toBeLessThan(300)
  // EVERY WORKER ROW THE NEW OFFICE HOLDS IS REMOVED, the marked row of each scope last, so only this test's rows are in force.
  const table = await ask(server.api, '/api/casting', { headers: asThePerson })
  const roles = table.body['roles'] as { role: string; scopes: { castings: { id: number; marked: boolean }[] }[] }[]
  for (const scope of roles.find((one) => one.role === 'worker')?.scopes ?? []) {
    for (const row of [...scope.castings].sort((one, other) => Number(one.marked) - Number(other.marked))) {
      const removed = await ask(server.api, `/api/casting/rows/${String(row.id)}`, { method: 'DELETE', headers: asThePerson })
      expect(removed.status, JSON.stringify(removed.body)).toBe(200)
    }
  }
  for (const row of ROWS) {
    const added = await ask(server.api, `/api/casting/${row.role}`, {
      method: 'POST',
      headers: asThePerson,
      body: { project: row.project, program: { value: row.program }, model: { value: row.model }, effort: { value: row.effort } },
    })
    expect(added.status, JSON.stringify(added.body)).toBe(201)
  }
  const taken = await ask(server.api, '/api/agents/started', { method: 'POST', headers: asThePerson, body: { handle: 'taken-heron', name: 'taken-heron', role: 'worker', runtime: 'claude-code' } })
  expect(taken.status, JSON.stringify(taken.body)).toBe(201)
}, 180_000)

afterAll(stopEverything, 60_000)

describe('the new agent door', () => {
  it('1: refuses an agent caller, and makes nothing', async () => {
    const agents = theRecordCount('agent')
    const refused = await create({ name: 'agent-made' }, AS_AN_AGENT)
    expect(refused.status, JSON.stringify(refused.body)).toBe(403)
    expect(theRecordCount('agent')).toBe(agents)
    expect(theAgentRecord('agent-made')).toBeNull()
  }, 60_000)

  it('2: refuses each value it cannot take before anything is made, and names the value', async () => {
    const agents = theRecordCount('agent')
    const sessions = theRecordCount('session')
    const terminals = (await theList()).length
    const cases: { body: Record<string, unknown>; status: number; names: string }[] = [
      { body: { name: 'refused-one', harness: 'no-such-tool', model: 'claude-opus-5-5', effort: 'high', role: 'worker', project: 'default' }, status: 400, names: 'no-such-tool' },
      { body: { name: 'refused-two', harness: 'claude-code', model: 'gpt-6.1-sol', effort: 'high', role: 'worker', project: 'default' }, status: 400, names: 'gpt-6.1-sol' },
      { body: { name: 'refused-three', harness: 'claude-code', model: 'claude-opus-5-5', effort: 'max', role: 'worker', project: 'default' }, status: 400, names: 'max' },
      { body: { name: 'refused-four', role: 'no-such-card' }, status: 400, names: 'no-such-card' },
      { body: { name: 'refused-five', project: 'no-such-project' }, status: 400, names: 'no-such-project' },
      { body: { name: 'Not a handle!' }, status: 400, names: 'Not a handle!' },
      { body: { name: 'taken-heron' }, status: 409, names: 'taken-heron' },
    ]
    for (const one of cases) {
      const refused = await create(one.body)
      expect(refused.status, `${JSON.stringify(one.body)}: ${JSON.stringify(refused.body)}`).toBe(one.status)
      expect(String(refused.body['error'])).toContain(one.names)
      expect(String(refused.body['error'])).toContain('Nothing was made.')
    }
    expect(theRecordCount('agent')).toBe(agents)
    expect(theRecordCount('session')).toBe(sessions)
    expect((await theList()).length).toBe(terminals)
    for (const handle of ['refused-one', 'refused-two', 'refused-three', 'refused-four', 'refused-five']) expect(theAgentRecord(handle)).toBeNull()
  }, 120_000)

  it("3: makes the agent with each chosen value, and opens it in the office's terminal with the chosen model and effort", async () => {
    const made = await create({ name: 'Garden Heron', harness: 'codex', model: 'gpt-6.1-sol', effort: 'medium', role: 'inspector', project: GARDEN, opensIn: 'office' })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    expect(JSON.stringify(made.body)).not.toMatch(/[0-9a-f]{64}/)

    // READ BACK FROM THE OFFICE, not from the answer.
    const agent = theAgentRecord('garden-heron')
    expect(agent).not.toBeNull()
    expect(agent?.title).toBe('Garden Heron')
    expect(agent?.workspace).toBe(GARDEN)
    expect(agent?.data['runtime']).toBe('codex')
    expect(agent?.data['role']).toBe('inspector')
    expect(agent?.data['state']).toBe('active')

    const opened = made.body['terminal'] as { opened: boolean; where: string; id: string; session: string }
    expect(opened.opened).toBe(true)
    expect(opened.where).toBe('office')
    const session = theSession(opened.session)
    expect(session['servingAgentId']).toBe(theRegistryRowOf(String(agent?.id)))
    expect(session['runtime']).toBe('codex')
    expect(session['model']).toBe('gpt-6.1-sol')
    expect(session['effort']).toBe('medium')

    const terminal = (await theList()).find((one) => one.id === opened.id)
    expect(terminal?.command).toBe(join(place.dir, 'b', 'codex'))
    expect(terminal?.args).toEqual([...CODEX_FEATURES_OFF, ...CODEX_SHELL_SNAPSHOT_OFF, '-m', 'gpt-6.1-sol', '-c', 'model_reasoning_effort=medium'])
    expect(afterTheFlag(terminal?.args ?? [], '-m')).toBe(session['model'])
    const screen = await theStandInsScreen(opened.id)
    expect(thePrintedLine(screen, 'STAND-IN codex ARGS ', 'EFFORT ')).toBe(
      `STAND-IN codex ARGS ${JSON.stringify([...CODEX_FEATURES_OFF, ...CODEX_SHELL_SNAPSHOT_OFF, '-m', 'gpt-6.1-sol', '-c', 'model_reasoning_effort=medium'])}`,
    )
    expect(screen).toContain('MOLE_OFFICE_AGENT=garden-heron')
  }, 120_000)

  it("4: with nothing but a name, makes the agent with the defaults and opens it in the office's terminal", async () => {
    const made = await create({ name: 'plain-heron' })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    const agent = theAgentRecord('plain-heron')
    expect(agent?.title).toBe('plain-heron')
    expect(agent?.workspace).toBe('default')
    expect(agent?.data['runtime']).toBe('claude-code')
    expect(agent?.data['role']).toBe('worker')

    const opened = made.body['terminal'] as { opened: boolean; where: string; id: string; session: string }
    expect(opened.opened).toBe(true)
    expect(opened.where).toBe('office')
    const session = theSession(opened.session)
    expect(session['model']).toBe('claude-opus-5-5')
    expect(session['effort']).toBe('high')
    const conversation = String(session['providerSession'])
    const terminal = (await theList()).find((one) => one.id === opened.id)
    expect(terminal?.command).toBe(join(place.dir, 'b', 'claude'))
    expect(terminal?.args).toEqual([...CLAUDE_CODE_FEATURES_OFF, '--session-id', conversation, '--model', 'claude-opus-5-5', '--effort', 'high'])
    expect(terminal?.envNames).toContain('CLAUDE_CODE_EFFORT_LEVEL')
    const screen = await theStandInsScreen(opened.id)
    expect(screen).toContain('EFFORT high')
    expect(screen).toContain('MOLE_OFFICE_AGENT=plain-heron')
  }, 120_000)

  it.skipIf(process.platform !== 'linux')("5: opened outside on the person's own press, asks the terminal outside to start the agent with a key file of its own and no terminal of its own", async () => {
    const { anOutsideAgentsKeyFileBeside } = await import('../src/config/the-entrys-agent.mjs')
    const terminals = (await theList()).length
    const sessions = theRecordCount('session')
    const made = await create({ name: 'outside-heron', harness: 'claude-code', model: 'claude-opus-5-5', effort: 'high', role: 'worker', project: 'default', opensIn: 'outside' })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    const opened = made.body['terminal'] as { opened: boolean; where: string; how: string }
    expect(opened.opened).toBe(true)
    expect(opened.where).toBe('outside')
    expect(opened.how).toContain('gnome-terminal')

    const agent = theAgentRecord('outside-heron')
    expect(agent?.data['runtime']).toBe('claude-code')
    const file = join(place.dir, 'outside.json')
    await until(() => existsSync(file), (there) => there)
    const args = (JSON.parse(readFileSync(file, 'utf8')) as { args: string[] }).args
    expect(args[0]).toMatch(/^--working-directory=\//)
    const started = args.slice(args.indexOf('--') + 1)
    expect(started[0]).toBe('env')
    expect(started).toContain('MOLE_OFFICE_AGENT=outside-heron')
    expect(started).toContain('MOLE_OFFICE_WORKSPACE=default')
    expect(started).toContain(`MOLE_OFFICE_API=${server.api}`)
    expect(started).toContain('CLAUDE_CODE_EFFORT_LEVEL=high')
    expect(started.some((word) => word.startsWith('MOLE_AGENT_KEY='))).toBe(false)

    // ITS OWN KEY FILE, named by its registry id beside the office's key file, and only the path on the command line.
    const registry = theRegistryRowOf(String(agent?.id))
    expect(registry, 'the agent has no registry row').not.toBeNull()
    const keyFile = anOutsideAgentsKeyFileBeside(join(dirname(place.database), 'keys.json'), registry!)
    expect(started.filter((word) => word.startsWith('MOLE_AGENT_KEY_FILE='))).toEqual([`MOLE_AGENT_KEY_FILE=${keyFile}`])
    expect(String(made.body['says'])).toContain(keyFile)
    expect(statSync(keyFile).mode & 0o777, 'the key file is not private').toBe(0o600)
    const live = theDatabase((db) =>
      db.prepare("SELECT mint_proved_by AS mint FROM held_keys WHERE whose_kind = 'agent' AND whose_id = ? AND revoked_at IS NULL").all(registry),
    )
    expect(live, 'the agent does not hold one live key made on the person’s press').toEqual([{ mint: 'the-persons-press' }])
    const key = readFileSync(keyFile, 'utf8').trim()
    expect(started.some((word) => word.includes(key)), 'the key is on the command line').toBe(false)
    expect(JSON.stringify(made.body).includes(key), 'the key is in the answer').toBe(false)
    const asItself = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'outside-heron', 'x-mole-office-key': key }
    const read = await ask(server.api, '/api/records?kind=agent&limit=1', { headers: asItself })
    expect(read.status, 'the office did not take the key in the agent’s key file').toBe(200)

    const program = started.indexOf(join(place.dir, 'b', 'claude'))
    expect(program).toBeGreaterThan(0)
    const startArgs = started.slice(program + 1)
    expect(startArgs.slice(0, CLAUDE_CODE_FEATURES_OFF.length)).toEqual([...CLAUDE_CODE_FEATURES_OFF])
    expect(afterTheFlag(startArgs, '--model')).toBe('claude-opus-5-5')
    expect(afterTheFlag(startArgs, '--effort')).toBe('high')

    // NO TERMINAL OF THE OFFICE'S OWN, AND NO RUN FILED BY THE OFFICE: the agent's own start files its run.
    expect((await theList()).length).toBe(terminals)
    expect(theRecordCount('session')).toBe(sessions)
  }, 120_000)

  it.skipIf(process.platform !== 'linux')('6: when the terminal outside fails to open, says the agent was made and the terminal was not, and why', async () => {
    const terminals = (await theList()).length
    const made = await create({ name: UNOPENED, opensIn: 'outside' })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    expect(theAgentRecord(UNOPENED)?.data['runtime']).toBe('claude-code')
    const agent = made.body['agent'] as { handle: string }
    expect(agent.handle).toBe(UNOPENED)
    const terminal = made.body['terminal'] as { opened: boolean; where: string; says: string }
    expect(terminal.opened).toBe(false)
    expect(terminal.where).toBe('outside')
    expect(terminal.says).toContain('ended with 1')
    expect(terminal.says).toContain('Failed to parse arguments')
    expect(String(made.body['says'])).toContain(UNOPENED)
    expect(String(made.body['says'])).toMatch(/not opened/)
    expect((await theList()).length).toBe(terminals)
  }, 120_000)
})
