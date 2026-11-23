// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT THE PERSON OPENS IN ONE OF THE OFFICE'S OWN PANES IS FOUND THERE, ITS PROFILE SHOWS THE COMMAND THAT RESUMES
 * IT, AND A MESSAGE TO IT REACHES IT (wave 13u round 109; the owner's pilot, before any secretary moves into such a pane).
 *
 * The pilot opens one agent in a pane the holder holds, with a fresh conversation. The office must then find its pane,
 * show its resume command on its profile, and deliver its messages. This test does the same with a stand-in for the
 * agent's program, and a real holder, a real scratch server and the real hook and waiter (tests/terminal-holder-stand.ts).
 *
 * THE STAND-IN DOES WHAT A FRESH CONVERSATION DOES. Started as `claude --session-id <uuid>`, it runs the session hook's
 * start, as Claude Code does, before its transcript exists. It then waits for a typed line, its first turn: it writes
 * its transcript, runs the hook's stop, and starts the waiter on the run the office named, printing what the waiter
 * prints. The waiter delivers what is waiting and exits, asking to be started again, so the stand-in starts it again,
 * as an agent does, up to five times. The profile's origin file is read before that first turn, as the office's minute
 * watcher may read it.
 *
 * WHAT IS PROVED: the person's list of terminals names the pane as the agent's own and its profile reads "In a
 * terminal"; the profile's origin line for the run carries the command the way-back rule gives for its folder and
 * conversation; and a message the person sends is printed in the pane and marked delivered.
 *
 * Every name, folder and value is made up.
 */

import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { theClaudeWayBack } from '../src/config/the-way-back.mjs'
import { theAgentsTerminals, type ListedTerminal } from '../src/shared/terminals.ts'
import {
  AS_THE_PERSON,
  aPlace,
  ask,
  groups,
  holder as theHolder,
  startAHolder,
  startAServer,
  stopEverything,
  theStreamsScreen,
  until,
  type Place,
  type ScratchServer,
} from './terminal-holder-stand.ts'
import { A_SLEEP_TIME, thePersonsKeyHeader } from './helpers.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url))
const HOOK = join(CHECKOUT, 'tools', 'session-hook.mjs')
const WAITER = join(CHECKOUT, 'tools', 'hold-the-handle.mjs')
const AGENT = 'pilot-agent'
const SECRETARY = 'pilot-secretary'

let place: Place
let server: ScratchServer
let personsKey: Record<string, string>
let agentId = ''
let folder = ''
/** Where the stand-in writes what the hook and the waiter printed, read when a case fails. */
let theStandInsLog = ''
let conversationOpened = ''

/**
 * The stand-in for the agent's program. The paths it needs are written into it, since the pane gives it only the
 * office's variables: the hook and the waiter of this checkout, the scratch database, a home and a details folder of
 * its own, and where its transcript goes. The hook is given the scratch office's database and port, as a checkout that
 * declares that office would give them, so its check of which office answers passes.
 */
function aStandIn(paths: { home: string; details: string; transcripts: string; log: string }): string {
  return `#!${process.execPath}
const out = (line) => process.stdout.write(line + '\\r\\n')
const HOOK = ${JSON.stringify(HOOK)}
const WAITER = ${JSON.stringify(WAITER)}
const DB = ${JSON.stringify(place.database)}
const PATHS = ${JSON.stringify(paths)}
;(async () => {
  const { spawn, spawnSync } = await import('node:child_process')
  const { appendFileSync, mkdirSync, writeFileSync } = await import('node:fs')
  const args = process.argv.slice(2)
  const at = args.indexOf('--session-id')
  const conversation = at >= 0 ? args[at + 1] : undefined
  out('STAND-IN ARGS ' + JSON.stringify(args))
  if (conversation === undefined) throw new Error('it was started with no conversation id')
  mkdirSync(PATHS.transcripts, { recursive: true })
  const transcript = PATHS.transcripts + '/' + conversation + '.jsonl'
  const env = { ...process.env, HOME: PATHS.home, MOLE_OFFICE_DB: DB, MOLE_OFFICE_PORT: new URL(process.env.MOLE_OFFICE_API).port, MOLE_HOOK_DETAILS_FOLDER: PATHS.details }
  for (const name of ['TMUX_PANE', 'CLAUDE_PID', 'SANDBOX_DIR', 'MOLE_OFFICE_TOOL_CONFIGURATION']) delete env[name]
  delete env.MOLE_AGENT_KEY
  env.MOLE_AGENT_KEY_FILE = ${JSON.stringify(join(place.dir, 'agent.key'))}
  const hook = (mode, more) => {
    const ran = spawnSync(process.execPath, ['--no-experimental-strip-types', HOOK, mode], {
      env,
      input: JSON.stringify({ session_id: conversation, transcript_path: transcript, cwd: process.cwd(), ...more }),
      encoding: 'utf8',
      timeout: 60000,
    })
    appendFileSync(PATHS.log, '--- the hook ' + mode + ' exited ' + String(ran.status) + '\\n' + String(ran.stdout) + '\\n' + String(ran.stderr) + '\\n')
    return ran.status
  }
  out('HOOK START EXITED ' + String(hook('start', { source: 'startup' })))
  out('STAND-IN WAITS FOR A LINE')
  process.stdin.once('data', () => {
    writeFileSync(transcript, '{"type":"user"}\\n')
    out('HOOK STOP EXITED ' + String(hook('stop', {})))
    const e = process.env
    const show = (chunk) => {
      appendFileSync(PATHS.log, String(chunk))
      process.stdout.write(String(chunk).replace(/\\r?\\n/g, '\\r\\n'))
    }
    let starts = 0
    const theWaiter = () => {
      starts += 1
      const waiter = spawn(process.execPath, [WAITER, '--agent', e.MOLE_OFFICE_AGENT, '--session', e.MOLE_OFFICE_SESSION, '--api', e.MOLE_OFFICE_API, '--workspace', e.MOLE_OFFICE_WORKSPACE], { env, stdio: ['ignore', 'pipe', 'pipe'] })
      waiter.stdout.on('data', show)
      waiter.stderr.on('data', show)
      waiter.on('exit', (code) => {
        out('THE WAITER EXITED ' + String(code))
        if (code === 0 && starts < 5) theWaiter()
      })
    }
    theWaiter()
    out('THE WAITER STARTED')
  })
})().catch((err) => out('STAND-IN FAILED ' + String(err)))
setInterval(() => undefined, 1 << 30)
`
}

/** The person's headers with the person's key, for the acts only the person may do. */
const asThePerson = (): Record<string, string> => ({ ...AS_THE_PERSON, ...personsKey })

async function register(handle: string, role: string): Promise<{ id: string; key: string }> {
  const registered = await ask(server.api, '/api/agents/started', { method: 'POST', body: { handle, name: handle, role, runtime: 'claude-code' } })
  expect(registered.status, JSON.stringify(registered.body)).toBe(201)
  return { id: String((registered.body['agent'] as { id: string }).id), key: String((registered.body['whatToGiveIt'] as { key: string }).key) }
}

/** The run's line in the agent's origin file, read through the door the profile reads it through. */
async function theProfilesLineFor(run: string): Promise<Record<string, unknown> | undefined> {
  const read = await fetch(`${server.api}/api/residents/${agentId}/space/file?path=session-origins.jsonl`, { headers: AS_THE_PERSON })
  const text = await read.text()
  expect(read.status, text).toBe(200)
  return text
    .split('\n')
    .filter((one) => one !== '')
    .map((one) => JSON.parse(one) as Record<string, unknown>)
    .find((one) => one['sessionRecordId'] === run)
}

const theLog = (): string => {
  try {
    return readFileSync(theStandInsLog, 'utf8').slice(-4000)
  } catch {
    return '(the stand-in wrote nothing)'
  }
}

beforeAll(async () => {
  place = aPlace('pilot')
  const bin = join(place.dir, 'b')
  mkdirSync(bin)
  theStandInsLog = join(place.dir, 'stand-in.log')
  writeFileSync(
    join(bin, 'claude'),
    aStandIn({ home: place.home, details: join(place.dir, 'details'), transcripts: join(place.dir, 'transcripts'), log: theStandInsLog }),
  )
  chmodSync(join(bin, 'claude'), 0o755)
  await startAHolder(place)
  server = await startAServer(place, undefined, { PATH: `${bin}:${process.env['PATH'] ?? '/usr/bin:/bin'}` })
  personsKey = thePersonsKeyHeader(join(dirname(place.database), 'keys.json'))

  const agent = await register(AGENT, 'worker')
  agentId = agent.id
  writeFileSync(join(place.dir, 'agent.key'), agent.key, { mode: 0o600 })
  folder = join(place.dir, 'w')
  mkdirSync(folder)
  const set = await ask(server.api, `/api/participants/agent/${AGENT}/start-folder`, { method: 'POST', body: { startFolder: folder, because: 'the pilot opens it in a pane' } })
  expect(set.status, JSON.stringify(set.body)).toBe(200)

  // A RESIDENT, SO ITS PROFILE HAS AN ORIGIN FILE: proposed by a secretary with its key, confirmed by the person.
  const secretary = await register(SECRETARY, 'secretary')
  const proposed = await ask(server.api, '/api/residents/proposals', {
    method: 'POST',
    headers: { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': SECRETARY, 'x-mole-office-key': secretary.key },
    body: { agentId, because: 'A made-up reason.', sleepTime: A_SLEEP_TIME },
  })
  expect(proposed.status, JSON.stringify(proposed.body)).toBe(201)
  const confirmed = await ask(server.api, `/api/residents/proposals/${String((proposed.body['proposal'] as { id: string }).id)}/confirm`, { method: 'POST', headers: asThePerson(), body: {} })
  expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200)
}, 180_000)

afterAll(async () => {
  await stopEverything()
  if (conversationOpened !== '') rmSync(join(CHECKOUT, '.logs', `session-${conversationOpened}.json`), { force: true })
}, 60_000)

describe('the pilot: an agent in a pane the holder holds', () => {
  it('is found in its pane, its profile shows the command that resumes it, and a message reaches it', async () => {
    const opened = await ask(server.api, '/api/terminals/agents', { method: 'POST', headers: asThePerson(), body: { agent: AGENT, cols: 200, rows: 40 } })
    expect(opened.status, JSON.stringify(opened.body)).toBe(201)
    const pane = opened.body['terminal'] as ListedTerminal & { pid: number }
    groups.add(pane.pid)
    const run = String(opened.body['session'])
    const conversation = String(opened.body['providerSession'])
    conversationOpened = conversation

    const started = await until(() => theStreamsScreen(server.api, pane.id), (lines) => lines.some((line) => line.includes('STAND-IN WAITS FOR A LINE') || line.includes('STAND-IN FAILED')), 60_000)
    expect(started.join('\n'), theLog()).toContain('HOOK START EXITED 0')

    // THE PROFILE IS READ BEFORE THE FIRST TURN, as the office's minute watcher may read it.
    await theProfilesLineFor(run)

    // ITS FIRST TURN: a line typed into the pane.
    await theHolder(place, { op: 'write', terminal: pane.id, data: 'the first turn\r' })
    const turned = await until(() => theStreamsScreen(server.api, pane.id), (lines) => lines.some((line) => line.includes('THE WAITER STARTED') || line.includes('STAND-IN FAILED')), 60_000)
    expect(turned.join('\n'), theLog()).toContain('HOOK STOP EXITED 0')

    // 1. THE OFFICE FINDS ITS PANE: the person's list names it as the agent's own, and its profile reads it.
    const listed = await ask(server.api, '/api/terminals')
    expect(listed.status, JSON.stringify(listed.body)).toBe(200)
    const own = theAgentsTerminals((listed.body['terminals'] ?? []) as ListedTerminal[], agentId).own
    expect(own.map((one) => one.id)).toEqual([pane.id])
    const profile = await ask(server.api, `/api/participants/agent/${agentId}/profile`)
    expect(profile.status, JSON.stringify(profile.body)).toBe(200)
    expect((profile.body['presence'] as { word: string }).word).toBe('In a terminal')

    // 2. ITS PROFILE SHOWS THE COMMAND THAT RESUMES IT.
    const line = await theProfilesLineFor(run)
    expect(line, `the profile has no line for the run. ${theLog()}`).toBeDefined()
    expect(line?.['resumeCommand'], `the profile shows no resume line. ${theLog()}`).toBe(theClaudeWayBack({ folder, sessionId: conversation }))

    // 3. A MESSAGE TO IT REACHES IT: the waiter in its pane holds its handle, prints the message, and it is delivered.
    const holding = await until(
      async () => ((await ask(server.api, '/api/handles')).body['holds'] ?? []) as { handle: string; session: string; releasedAt: string | null }[],
      (holds) => holds.some((one) => one.handle === AGENT && one.session === run && one.releasedAt === null),
      30_000,
    )
    expect(holding.some((one) => one.session === run), theLog()).toBe(true)
    const sent = await ask(server.api, '/api/records', {
      method: 'POST',
      body: { kind: 'message', title: 'a word for the pilot', data: { body: 'a word for the pilot', to: [{ kind: 'agent', id: agentId }] } },
    })
    expect(sent.status, JSON.stringify(sent.body)).toBe(201)
    const message = String((sent.body['record'] as { id: string }).id)
    const shown = await until(() => theStreamsScreen(server.api, pane.id), (lines) => lines.some((one) => one.includes(message)), 30_000)
    expect(shown.join('\n'), theLog()).toContain(message)
    const read = await ask(server.api, `/api/messages/${message}`)
    const deliveries = ((read.body['message'] as { deliveries?: { mark: string }[] } | undefined)?.deliveries ?? []).map((one) => one.mark)
    expect(deliveries).toEqual(['delivered'])
  }, 240_000)
})
