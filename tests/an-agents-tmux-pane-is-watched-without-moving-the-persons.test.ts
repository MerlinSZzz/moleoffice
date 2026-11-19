// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S TMUX PANE IS FOUND FROM ITS RUN, AND SHOWN IN THE OFFICE'S TERMINAL WITHOUT MOVING THE OWNER'S OWN CLIENT.
 * Wave 13u, round 10, way B: GET and POST /api/terminals/agents/:agent/pane
 * (src/server/lib/agent-pane.ts, src/config/tmux-pane-view.mjs).
 *
 * NO REAL TMUX IS USED, because none is installed on the machine this was written on. A stand-in named tmux is put first
 * on the server's PATH. It answers list-panes, display-message, capture-pane, new-session and kill-session from a state
 * file the test writes, plays control mode for `-C attach-session` (sending `%output` lines the test plants), and writes
 * every command it was given, and every line typed to it in control mode, to a log the test reads. What this proves is
 * what the office asks tmux to do. That tmux 3.4 does what its manual says to those commands is not proved here.
 *
 * The agent's process is real: a stand-in claude the office opens in one of its own terminals, so it has a real
 * terminal (/dev/pts/N) that `ps` reads. The stand-in tmux says that terminal is pane %7, recover:1.3.
 *
 *   1. An agent caller is refused 403 with terminalsOnlyThePerson on both doors.
 *   2. Each way a pane is not found is its own answer and its own refusal: no run, a sandbox run, a run whose program
 *      does not run, a process with no terminal, a terminal that is no tmux pane, and no tmux server.
 *   3. The pane is found from the run's process and its terminal, with its id, place, session and size.
 *   4. The press opens a view at the pane's size that shows the pane's screen and only its own output. It asks tmux
 *      for a grouped session of its own and a control-mode attach with ignore-size, and never for a command that
 *      resizes, selects or switches. What the person types is sent to the pane. A second press answers the same view.
 *   5. When the pane closes the view says so and ends, and kills only its own session.
 *
 * MUTATIONS (each after a control run; the commit message has the runs and the logs):
 *   - tmux-pane-view.mjs attaches without `-f ignore-size`: case 4 red.
 *   - tmux-pane-view.mjs shows every pane's %output: case 4 red.
 *   - agent-pane.ts matches a pane without its terminal: cases 2, 3, 4 and 5 red.
 *   - tmux-pane-view.mjs kills the owner's session at the end: case 5 red.
 */

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  AS_AN_AGENT,
  AS_THE_PERSON,
  REPO,
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

/** The viewer the holder runs, as src/server/lib/agent-pane.ts names it (importing that file would open a database). */
const THE_PANE_VIEW = join(REPO, 'src', 'config', 'tmux-pane-view.mjs')

let place: Place
let server: ScratchServer
let bin = ''
let personsKey: Record<string, string> = {}
let stateFile = ''
let callsFile = ''
/** The terminal the shown agent's stand-in runs on, as ps names it. */
let theAgentsTty = ''

interface Pane { id: string; target: string; tty: string; cols: number; rows: number }
interface TmuxState { noServer: boolean; panes: Pane[]; screen: string; cursor: string; outputs: [string, string][] }

const CLAUDE_STAND_IN = `#!${process.execPath}
process.stdout.write('STAND-IN claude ARGS ' + JSON.stringify(process.argv.slice(2)) + '\\r\\n')
setInterval(() => undefined, 1 << 30)
`

/** The stand-in tmux. It reads the state the test writes, and logs every command it is given. */
function aTmuxStandIn(state: string, calls: string): string {
  return `#!${process.execPath}
const fs = require('node:fs')
const args = process.argv.slice(2)
const log = (entry) => fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify(entry) + '\\n')
const state = () => JSON.parse(fs.readFileSync(${JSON.stringify(state)}, 'utf8'))
log({ args })
const flag = (name) => (args.indexOf(name) === -1 ? null : args[args.indexOf(name) + 1])
const pane = (id) => state().panes.find((one) => one.id === id)
const fail = (line) => { process.stderr.write(line + '\\n'); process.exit(1) }
if (args[0] === 'list-panes') {
  if (state().noServer) fail('no server running on /tmp/tmux-test/default')
  for (const one of state().panes) process.stdout.write([one.id, one.target, one.tty, one.cols, one.rows].join(' ') + '\\n')
} else if (args[0] === 'display-message') {
  const one = pane(flag('-t'))
  if (one === undefined) fail("can't find pane: " + flag('-t'))
  process.stdout.write(args[args.length - 1].includes('cursor') ? one.id + ' ' + state().cursor + '\\n' : one.id + '\\n')
} else if (args[0] === 'capture-pane') {
  if (pane(flag('-t')) === undefined) fail("can't find pane: " + flag('-t'))
  process.stdout.write(state().screen + '\\n')
} else if (args[0] === 'new-session' || args[0] === 'kill-session') {
  // Nothing to do: the log is what the test reads.
} else if (args[0] === '-C') {
  process.stdout.write('%begin 1 1 0\\n%end 1 1 0\\n')
  let sent = 0
  setInterval(() => {
    const outputs = state().outputs
    for (; sent < outputs.length; sent += 1) process.stdout.write('%output ' + outputs[sent][0] + ' ' + outputs[sent][1] + '\\n')
  }, 200)
  let typed = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => {
    typed += chunk
    let at
    while ((at = typed.indexOf('\\n')) !== -1) { log({ typed: typed.slice(0, at) }); typed = typed.slice(at + 1) }
  })
  process.stdin.on('end', () => process.exit(0))
} else {
  fail('the stand-in tmux does not know ' + args.join(' '))
}
`
}

function theState(): TmuxState {
  return JSON.parse(readFileSync(stateFile, 'utf8')) as TmuxState
}
function writeTheState(change: Partial<TmuxState>): void {
  writeFileSync(stateFile, JSON.stringify({ ...theState(), ...change }))
}
function theCalls(): { args?: string[]; typed?: string }[] {
  if (!existsSync(callsFile)) return []
  return readFileSync(callsFile, 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as { args?: string[]; typed?: string })
}

async function register(handle: string, startFolder: string | null): Promise<void> {
  const registered = await ask(server.api, '/api/agents/started', { method: 'POST', body: { handle, name: handle, role: 'worker', runtime: 'claude-code' } })
  expect(registered.status, JSON.stringify(registered.body)).toBe(201)
  if (startFolder !== null) {
    mkdirSync(startFolder, { recursive: true })
    const set = await ask(server.api, `/api/participants/agent/${handle}/start-folder`, { method: 'POST', body: { startFolder, because: 'the test opens it in a terminal' } })
    expect(set.status, JSON.stringify(set.body)).toBe(200)
  }
}

async function aRun(handle: string, data: Record<string, unknown>): Promise<string> {
  const filed = await ask(server.api, '/api/records', {
    method: 'POST',
    headers: { ...AS_THE_PERSON, ...personsKey },
    body: { kind: 'session', title: `Test run of ${handle}`, data: { state: 'running', servingAgent: handle, runtime: 'claude-code', ...data } },
  })
  expect(filed.status, JSON.stringify(filed.body)).toBe(201)
  return String((filed.body['record'] as { id?: string } | undefined)?.id ?? filed.body['id'])
}

const thePane = (handle: string, headers: Record<string, string> = AS_THE_PERSON) => ask(server.api, `/api/terminals/agents/${handle}/pane`, { headers })
async function show(handle: string, headers: Record<string, string> = AS_THE_PERSON) {
  const shown = await ask(server.api, `/api/terminals/agents/${handle}/pane`, { method: 'POST', headers, body: {} })
  const view = shown.body['view'] as { pid?: number } | undefined
  if (typeof view?.pid === 'number') groups.add(view.pid)
  return shown
}

/** A stand-in claude whose arguments name a conversation, run with no terminal, in its own group. */
function aProcessWithNoTerminal(conversation: string): void {
  const started = spawn(join(bin, 'claude'), ['--resume', conversation], { detached: true, stdio: 'ignore' })
  if (started.pid === undefined) throw new Error('The stand-in could not be started.')
  groups.add(started.pid)
}

beforeAll(async () => {
  place = aPlace('agent-pane')
  bin = join(place.dir, 'b')
  mkdirSync(bin)
  stateFile = join(place.dir, 'tmux-state.json')
  callsFile = join(place.dir, 'tmux-calls.log')
  writeFileSync(stateFile, JSON.stringify({ noServer: false, panes: [], screen: '', cursor: '0 0', outputs: [] } satisfies TmuxState))
  writeFileSync(join(bin, 'claude'), CLAUDE_STAND_IN)
  writeFileSync(join(bin, 'tmux'), aTmuxStandIn(stateFile, callsFile))
  chmodSync(join(bin, 'claude'), 0o755)
  chmodSync(join(bin, 'tmux'), 0o755)
  await startAHolder(place)
  server = await startAServer(place, undefined, { PATH: `${bin}:${process.env['PATH'] ?? '/usr/bin:/bin'}` })
  personsKey = thePersonsKeyHeader(join(dirname(place.database), 'keys.json'))
  await register(AS_AN_AGENT['x-mole-office-actor-id']!, null)
  for (const handle of ['pane-norun', 'pane-sandbox', 'pane-stopped', 'pane-noterminal']) await register(handle, null)
  await register('pane-shown', join(place.dir, 'w'))
  await aRun('pane-sandbox', { providerSession: randomUUID(), workingDirectory: '/workspace/test', sandbox: { template: 'test-template', folder: '/test/sandboxes/test-instance' } })
  await aRun('pane-stopped', { providerSession: randomUUID(), workingDirectory: join(place.dir, 'w') })
  const noTerminal = randomUUID()
  await aRun('pane-noterminal', { providerSession: noTerminal, workingDirectory: join(place.dir, 'w') })
  aProcessWithNoTerminal(noTerminal)

  // THE SHOWN AGENT RUNS IN ONE OF THE OFFICE'S TERMINALS, so its process has a real terminal.
  const opened = await ask(server.api, '/api/terminals/agents', { method: 'POST', body: { agent: 'pane-shown', cols: 100, rows: 30 } })
  expect(opened.status, JSON.stringify(opened.body)).toBe(201)
  const pid = (opened.body['terminal'] as { pid: number }).pid
  groups.add(pid)
  // Model a newer run in tmux using this stand-in process, without an office-terminal binding.
  await aRun('pane-shown', { providerSession: opened.body['providerSession'], workingDirectory: join(place.dir, 'w') })
  theAgentsTty = await new Promise<string>((done) => {
    const ps = spawn('ps', ['-o', 'tty=', '-p', String(pid)])
    let out = ''
    ps.stdout.on('data', (chunk) => (out += String(chunk)))
    ps.on('close', () => done(out.trim()))
  })
  expect(theAgentsTty).toMatch(/^pts\/\d+$/)
}, 180_000)

afterAll(stopEverything, 60_000)

describe("an agent's tmux pane", () => {
  it('1: refuses an agent caller on both doors with its code', async () => {
    for (const reply of [await thePane('pane-shown', AS_AN_AGENT), await show('pane-shown', AS_AN_AGENT)]) {
      expect(reply.status, JSON.stringify(reply.body)).toBe(403)
      expect(reply.body['code'], JSON.stringify(reply.body)).toBe('terminalsOnlyThePerson')
    }
  }, 60_000)

  it('2: says each way a pane is not found, and refuses its press with that code', async () => {
    // THE SHOWN AGENT'S TERMINAL IS NO PANE YET: only another terminal is.
    writeTheState({ panes: [{ id: '%8', target: 'other:0.0', tty: '/dev/pts/test-other', cols: 80, rows: 24 }] })
    const cases: [string, string, string, number][] = [
      ['pane-norun', 'no-run', 'paneNoRun', 404],
      ['pane-sandbox', 'sandbox', 'paneInASandbox', 409],
      ['pane-stopped', 'not-running', 'paneNotRunning', 409],
      ['pane-noterminal', 'not-in-a-terminal', 'paneNotInATerminal', 409],
      ['pane-shown', 'not-in-tmux', 'paneNotInTmux', 409],
    ]
    for (const [handle, state, code, status] of cases) {
      const read = await thePane(handle)
      expect(read.status, JSON.stringify(read.body)).toBe(200)
      expect(read.body['state'], `${handle}: ${JSON.stringify(read.body)}`).toBe(state)
      expect(read.body['pane']).toBeNull()
      const refused = await show(handle)
      expect(refused.status, `${handle}: ${JSON.stringify(refused.body)}`).toBe(status)
      expect(refused.body['code'], handle).toBe(code)
    }
    writeTheState({ noServer: true })
    const noServer = await thePane('pane-shown')
    expect(noServer.body['state']).toBe('not-in-tmux')
    expect(String(noServer.body['says'])).toContain('no server running')
    writeTheState({ noServer: false })
  }, 60_000)

  it('3: finds the pane from the run, its process and its terminal', async () => {
    writeTheState({
      panes: [
        { id: '%8', target: 'other:0.0', tty: '/dev/pts/test-other', cols: 80, rows: 24 },
        { id: '%7', target: 'recover:1.3', tty: `/dev/${theAgentsTty}`, cols: 100, rows: 30 },
      ],
      screen: 'TEST SCREEN LINE ONE\nTEST SCREEN LINE TWO',
      cursor: '0 2',
    })
    const read = await thePane('pane-shown')
    expect(read.status, JSON.stringify(read.body)).toBe(200)
    expect(read.body['state']).toBe('shown')
    expect(read.body['pane']).toEqual({ id: '%7', target: 'recover:1.3', session: 'recover', tty: `/dev/${theAgentsTty}`, cols: 100, rows: 30 })
    expect(read.body['view']).toBeNull()
    expect(String(read.body['says'])).toContain(`/dev/${theAgentsTty}, which is tmux pane %7 (recover:1.3), 100×30`)
  }, 60_000)

  it('4: shows the pane at its size, only its own output, through its own session, and types into the pane', async () => {
    const shown = await show('pane-shown')
    expect(shown.status, JSON.stringify(shown.body)).toBe(201)
    expect(shown.body['opened']).toBe(true)
    const view = shown.body['view'] as { id: string; command: string; args: string[]; cols: number; rows: number }
    expect(view.command).toBe(process.execPath)
    expect(view.args.slice(0, 5)).toEqual([THE_PANE_VIEW, '--session', 'recover', '--pane', '%7'])
    const viewSession = view.args[6]!
    expect(viewSession).toMatch(/^mole-office-view-7-[0-9a-f]{6}$/)
    expect([view.cols, view.rows]).toEqual([100, 30])

    writeTheState({ outputs: [['%8', 'TEST PANE EIGHT\\015\\012'], ['%7', '\\033[1mTEST PANE SEVEN\\033[0m\\015\\012']] })
    const screen = (await until(() => theStreamsScreen(server.api, view.id), (lines) => lines.some((line) => line.includes('TEST PANE SEVEN')))).join('\n')
    expect(screen).toContain('TEST SCREEN LINE ONE')
    expect(screen).toContain('TEST SCREEN LINE TWO')
    expect(screen).toContain('TEST PANE SEVEN')
    expect(screen).not.toContain('\\033')
    expect(screen).not.toContain('TEST PANE EIGHT')

    const asked = theCalls().filter((one) => one.args !== undefined).map((one) => one.args!)
    expect(asked).toContainEqual(['new-session', '-d', '-t', 'recover', '-s', viewSession])
    expect(asked).toContainEqual(['-C', 'attach-session', '-f', 'ignore-size', '-t', viewSession])
    const typed = await ask(server.api, `/api/terminals/${view.id}/input`, { method: 'POST', body: { data: 'hi\r' } })
    expect(typed.status, JSON.stringify(typed.body)).toBe(200)
    const sent = await until(() => theCalls().filter((one) => one.typed !== undefined).map((one) => one.typed!), (lines) => lines.length > 0)
    expect(sent.join('')).toBe('send-keys -t %7 -H 68 69 0d')
    // NOTHING THAT MOVES THE PERSON'S CLIENT, among every command the office gave tmux and every line it typed to it.
    const everything = theCalls().map((one) => (one.args ?? []).join(' ') + (one.typed ?? '')).join('\n')
    for (const moving of ['resize-window', 'resize-pane', 'switch-client', 'select-window', 'select-pane', 'refresh-client', 'attach-session -t recover']) {
      expect(everything).not.toContain(moving)
    }

    const again = await show('pane-shown')
    expect(again.status, JSON.stringify(again.body)).toBe(200)
    expect(again.body['opened']).toBe(false)
    expect((again.body['view'] as { id: string }).id).toBe(view.id)
    expect(((await thePane('pane-shown')).body['view'] as { id: string }).id).toBe(view.id)
  }, 90_000)

  it('5: when the pane closes, the view says so, ends, and kills only its own session', async () => {
    const view = (await thePane('pane-shown')).body['view'] as { id: string; args: string[] }
    const viewSession = view.args[6]!
    writeTheState({ panes: [{ id: '%8', target: 'other:0.0', tty: '/dev/pts/test-other', cols: 80, rows: 24 }] })
    const screen = (await until(() => theStreamsScreen(server.api, view.id), (lines) => lines.some((line) => line.includes('has closed')), 15_000)).join('\n')
    expect(screen).toContain("The agent's tmux pane %7 has closed.")
    const killed = await until(
      () => theCalls().filter((one) => one.args?.[0] === 'kill-session').map((one) => one.args!),
      (all) => all.length > 0,
    )
    expect(killed).toEqual([['kill-session', '-t', viewSession]])
    const listed = await until(
      async () => ((await ask(server.api, '/api/terminals')).body['terminals'] as { id: string; state: string }[]).find((one) => one.id === view.id),
      (one) => one === undefined || one.state === 'ended',
    )
    expect(listed === undefined || listed.state === 'ended').toBe(true)
  }, 60_000)
})
