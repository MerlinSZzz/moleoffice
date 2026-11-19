// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PERSON READS THE WAY BACK TO AN AGENT'S RUN, AND ONE PRESS RUNS IT IN A TERMINAL THE OFFICE HOLDS.
 * Wave 13u, round 10: GET and POST /api/terminals/agents/:agent/way-back
 * (src/server/api/terminal-agents.ts, src/server/lib/terminal-agents.ts, src/config/the-way-back.mjs).
 *
 * NO REAL AGENT PROGRAM IS STARTED. A stand-in named claude is put first on the PATH the scratch server gives its
 * terminals; it prints its arguments and its folder, then waits. A real holder and a real scratch server run on a
 * database in the test's own folder (tests/terminal-holder-stand.ts). The runs are session records the person files,
 * shaped as the session hook files them: no resume command stored, the start's command line in the discovery stamp.
 *
 *   1. An agent caller is refused 403 with terminalsOnlyThePerson on both doors, and nothing opens.
 *   2. The GET answers what a press would do: ready with the command and the kept flags; sandbox with the command and
 *      nothing the press needs; none with why; running while a process's arguments name the run's conversation; and
 *      no run at all.
 *   3. Each refusal of the press carries its code, and nothing opens: no run, another agent's run, no way back, a
 *      sandbox, a run that still runs, and a folder that is gone.
 *   4. The press opens the stand-in in the run's folder as `claude --resume <id>` with the kept flags, after the switch
 *      that turns the harness's own subagents off, as every launch in the office's terminal has (wave 13s round 209).
 *      The way back's own command, which case 2 reads and the new record keeps, has no switch: it is worked out from
 *      the run alone. The press files a new session record naming the run it brings back. The GET then says the
 *      agent's newest run is running, and a second press on the first run is refused because the brought-back program
 *      names its conversation.
 *
 * MUTATIONS (each after a control run; the commit message has the runs and the logs):
 *   - lib/terminal-agents.ts theProcessNamingTheConversation answers null: the running run reads ready, case 2 red,
 *     its press opens, case 3 red, and the second press of case 4 opens, case 4 red.
 *   - lib/terminal-agents.ts the press leaves extra.wayBackOf off: case 4 red.
 *   - api/terminal-agents.ts the GET does not ask onlyThePerson: case 1 red.
 *   - lib/terminal-agents.ts withTheHarnessFeaturesOff leaves claude-code's arguments as they are: case 4 red at the
 *     terminal's arguments.
 *   - holder/index.mjs starts the program without its first argument and lists the arguments it was asked for: case 4
 *     red at the stand-in's screen.
 */

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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
import { CLAUDE_CODE_FEATURES_OFF } from '../src/config/harness-features-off.mjs'

let place: Place
let server: ScratchServer
let bin = ''
let personsKey: Record<string, string> = {}
/** Each test agent's handle, and the session record of its run. */
const runs: Record<string, string> = {}
/** Made-up conversation ids, for this test only. */
const conversations = { ready: randomUUID(), running: randomUUID(), sandbox: randomUUID(), gone: randomUUID() }

const STAND_IN = `#!${process.execPath}
const out = (line) => process.stdout.write(line + '\\r\\n')
out('STAND-IN claude ARGS ' + JSON.stringify(process.argv.slice(2)))
out('CWD ' + process.cwd())
out('STAND-IN READY')
setInterval(() => undefined, 1 << 30)
`

function theRecord(id: string): { kind: string; data: Record<string, unknown> } {
  const db = new Database(place.database, { readonly: true, fileMustExist: true })
  try {
    const row = db.prepare('SELECT kind, data FROM records WHERE id = ?').get(id) as { kind: string; data: string }
    return { kind: row.kind, data: JSON.parse(row.data) as Record<string, unknown> }
  } finally {
    db.close()
  }
}

async function theTerminalCount(): Promise<number> {
  const listed = await ask(server.api, '/api/terminals')
  expect(listed.status, JSON.stringify(listed.body)).toBe(200)
  return ((listed.body['terminals'] ?? []) as unknown[]).length
}

async function register(handle: string, runtime: string): Promise<void> {
  const registered = await ask(server.api, '/api/agents/started', { method: 'POST', body: { handle, name: handle, role: 'worker', runtime } })
  expect(registered.status, JSON.stringify(registered.body)).toBe(201)
}

/** A run of an agent, filed by the person in the shape the session hook files one. */
async function aRun(handle: string, data: Record<string, unknown>): Promise<string> {
  const filed = await ask(server.api, '/api/records', {
    method: 'POST',
    headers: { ...AS_THE_PERSON, ...personsKey },
    body: { kind: 'session', title: `Test run of ${handle}`, data: { state: 'running', servingAgent: handle, runtime: 'claude-code', ...data } },
  })
  expect(filed.status, JSON.stringify(filed.body)).toBe(201)
  return String((filed.body['record'] as { id?: string } | undefined)?.id ?? filed.body['id'])
}

const theWayBack = (handle: string, headers: Record<string, string> = AS_THE_PERSON) =>
  ask(server.api, `/api/terminals/agents/${handle}/way-back`, { headers })

async function press(handle: string, session: string, headers: Record<string, string> = AS_THE_PERSON) {
  const pressed = await ask(server.api, `/api/terminals/agents/${handle}/way-back`, { method: 'POST', headers, body: { session, cols: 160, rows: 40 } })
  const terminal = pressed.body['terminal'] as { pid?: number } | undefined
  if (typeof terminal?.pid === 'number') groups.add(terminal.pid)
  return pressed
}

beforeAll(async () => {
  place = aPlace('way-back')
  bin = join(place.dir, 'b')
  mkdirSync(bin)
  writeFileSync(join(bin, 'claude'), STAND_IN)
  chmodSync(join(bin, 'claude'), 0o755)
  await startAHolder(place)
  server = await startAServer(place, undefined, { PATH: `${bin}:${process.env['PATH'] ?? '/usr/bin:/bin'}` })
  personsKey = thePersonsKeyHeader(join(dirname(place.database), 'keys.json'))
  // THE AGENT CALLER OF CASE 1 IS REGISTERED, so its press reaches the person check and is not refused before it.
  await register(AS_AN_AGENT['x-mole-office-actor-id']!, 'claude-code')
  for (const handle of ['wb-ready', 'wb-running', 'wb-sandbox', 'wb-none', 'wb-gone', 'wb-norun']) await register(handle, 'claude-code')
  mkdirSync(join(place.dir, 'w'))
  const recorded = await ask(server.api, '/api/participants/agent/wb-ready/start-folder', { method: 'POST', body: { startFolder: join(place.dir, 'w'), because: 'The synthetic resume starts only in its recorded folder.' } })
  expect(recorded.status, JSON.stringify(recorded.body)).toBe(200)
  runs['wb-ready'] = await aRun('wb-ready', {
    providerSession: conversations.ready,
    workingDirectory: join(place.dir, 'w'),
    extra: { discovered: { tool: 'claude-code', externalId: conversations.ready, pidCommand: 'claude --dangerously-skip-permissions --model test-model -p say hello' } },
  })
  runs['wb-running'] = await aRun('wb-running', { providerSession: conversations.running, workingDirectory: join(place.dir, 'w') })
  runs['wb-sandbox'] = await aRun('wb-sandbox', {
    providerSession: conversations.sandbox,
    workingDirectory: '/workspace/test',
    sandbox: { template: 'test-template', folder: '/test/sandboxes/test-instance' },
  })
  runs['wb-none'] = await aRun('wb-none', { workingDirectory: join(place.dir, 'w') })
  runs['wb-gone'] = await aRun('wb-gone', { providerSession: conversations.gone, workingDirectory: join(place.dir, 'not-here') })
  // A PROGRAM WHOSE ARGUMENTS NAME THE RUNNING RUN'S CONVERSATION, as a run resumed by hand would be. Its own group.
  const running = spawn(join(bin, 'claude'), ['--resume', conversations.running], { detached: true, stdio: 'ignore' })
  if (running.pid === undefined) throw new Error('The stand-in for a running run could not be started.')
  groups.add(running.pid)
}, 180_000)

afterAll(stopEverything, 60_000)

describe('the way back is pressed in the office terminal', () => {
  it('1: refuses an agent caller on both doors with its code, and opens nothing', async () => {
    const before = await theTerminalCount()
    const read = await theWayBack('wb-ready', AS_AN_AGENT)
    expect(read.status, JSON.stringify(read.body)).toBe(403)
    expect(read.body['code']).toBe('terminalsOnlyThePerson')
    const pressed = await press('wb-ready', runs['wb-ready']!, AS_AN_AGENT)
    expect(pressed.status, JSON.stringify(pressed.body)).toBe(403)
    expect(pressed.body['code'], JSON.stringify(pressed.body)).toBe('terminalsOnlyThePerson')
    expect(await theTerminalCount()).toBe(before)
  }, 60_000)

  it('2: says what a press would do: ready, sandbox, none, running, and no run', async () => {
    const ready = await theWayBack('wb-ready')
    expect(ready.status, JSON.stringify(ready.body)).toBe(200)
    expect(ready.body['press']).toBe('ready')
    expect((ready.body['run'] as { id: string }).id).toBe(runs['wb-ready'])
    expect(ready.body['way']).toMatchObject({
      way: 'host',
      program: 'claude',
      args: ['--resume', conversations.ready, '--dangerously-skip-permissions', '--model', 'test-model'],
      command: `cd '${join(place.dir, 'w')}' && claude --resume ${conversations.ready} --dangerously-skip-permissions --model test-model`,
      kept: ['--dangerously-skip-permissions', '--model', 'test-model'],
    })
    expect(JSON.stringify(ready.body)).not.toContain('say hello')

    const sandbox = await theWayBack('wb-sandbox')
    expect(sandbox.body['press']).toBe('sandbox')
    expect(sandbox.body['way']).toMatchObject({ way: 'sandbox', sessionId: conversations.sandbox })
    expect(String((sandbox.body['way'] as { command: string }).command)).toContain('tools/sandbox.mjs exec test-instance --tty')
    expect(sandbox.body['way']).not.toHaveProperty('sandbox')

    const none = await theWayBack('wb-none')
    expect(none.body['press']).toBe('none')
    expect(none.body['way']).toEqual({ way: 'none', runtime: 'claude-code', because: 'Nobody recorded which conversation this run was.' })

    const running = await theWayBack('wb-running')
    expect(running.body['press'], JSON.stringify(running.body)).toBe('running')
    expect(String(running.body['says'])).toContain(`names its conversation ${conversations.running}`)

    const noRun = await theWayBack('wb-norun')
    expect(noRun.status).toBe(200)
    expect(noRun.body['run']).toBeNull()
    expect(noRun.body['press']).toBe('none')
  }, 60_000)

  it('3: refuses each press that cannot run with its code, and opens nothing', async () => {
    const before = await theTerminalCount()
    const refusals: [string, string, number, string][] = [
      ['wb-norun', 'testNoSuchRun', 404, 'wayBackNoRun'],
      ['wb-ready', runs['wb-none']!, 409, 'wayBackNotThisAgents'],
      ['wb-none', runs['wb-none']!, 409, 'wayBackNone'],
      ['wb-sandbox', runs['wb-sandbox']!, 409, 'wayBackInASandbox'],
      ['wb-running', runs['wb-running']!, 409, 'wayBackStillRunning'],
      ['wb-gone', runs['wb-gone']!, 409, 'wayBackFolderGone'],
    ]
    for (const [handle, session, status, code] of refusals) {
      const refused = await press(handle, session)
      expect(refused.status, `${handle}: ${JSON.stringify(refused.body)}`).toBe(status)
      expect(refused.body['code'], handle).toBe(code)
      expect(String(refused.body['error']), handle).toContain('Nothing was opened.')
    }
    expect(await theTerminalCount()).toBe(before)
  }, 60_000)

  it('4: the press opens the run again in its folder with its kept flags, and files a run naming the one it brings back', async () => {
    const pressed = await press('wb-ready', runs['wb-ready']!)
    const trust = JSON.parse(readFileSync(join(place.home, '.claude.json'), 'utf8')) as { projects: Record<string, { hasTrustDialogAccepted: boolean }> }
    expect(trust.projects[join(place.dir, 'w')]?.hasTrustDialogAccepted).toBe(true)
    expect(pressed.status, JSON.stringify(pressed.body)).toBe(201)
    expect(JSON.stringify(pressed.body)).not.toMatch(/[0-9a-f]{64}/)
    const terminal = pressed.body['terminal'] as { id: string; args: string[]; folder: string; command: string }
    const args = [...CLAUDE_CODE_FEATURES_OFF, '--resume', conversations.ready, '--dangerously-skip-permissions', '--model', 'test-model']
    expect(terminal.command).toBe(join(bin, 'claude'))
    expect(terminal.args).toEqual(args)
    expect(terminal.folder).toBe(join(place.dir, 'w'))
    const screen = (await until(() => theStreamsScreen(server.api, terminal.id), (lines) => lines.some((line) => line.includes('STAND-IN READY')))).join('\n')
    // THE LINE IS WIDER THAN THE TERMINAL, so it is read with the rows joined.
    expect(screen.split('\n').join('')).toContain(`STAND-IN claude ARGS ${JSON.stringify(args)}`)
    expect(screen).toContain(`CWD ${join(place.dir, 'w')}`)

    const session = String(pressed.body['session'])
    expect(session).not.toBe(runs['wb-ready'])
    const record = theRecord(session)
    expect(record.kind).toBe('session')
    expect(record.data['servingAgent']).toBe('wb-ready')
    expect(record.data['providerSession']).toBe(conversations.ready)
    const extra = record.data['extra'] as { wayBackOf?: string; wayBackCommand?: string; inATerminal?: { terminal: string } }
    expect(extra.wayBackOf).toBe(runs['wb-ready'])
    expect(extra.wayBackCommand).toBe(`cd '${join(place.dir, 'w')}' && claude --resume ${conversations.ready} --dangerously-skip-permissions --model test-model`)
    expect(extra.inATerminal?.terminal).toBe(terminal.id)

    const after = await theWayBack('wb-ready')
    expect((after.body['run'] as { id: string }).id).toBe(session)
    expect(after.body['press']).toBe('running')
    const again = await press('wb-ready', runs['wb-ready']!)
    expect(again.status, JSON.stringify(again.body)).toBe(409)
    expect(again.body['code']).toBe('wayBackStillRunning')
  }, 90_000)
})
