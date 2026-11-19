// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY AGENT THE OFFICE OPENS IN ITS TERMINAL STARTS WITH THE HARNESS'S OWN SUBAGENTS OFF, on each runtime it opens.
 * Wave 13s round 209: POST /api/terminals/agents (src/server/lib/terminal-agents.ts, withTheHarnessFeaturesOff), with
 * the switches of src/config/harness-features-off.mjs.
 *
 * NO REAL AGENT PROGRAM IS STARTED. Stand-ins named claude, codex, opencode and kimi are put first on the PATH the
 * scratch server gives its terminals. Each prints the arguments it was given and its OPENCODE_CONFIG_CONTENT, then
 * waits. A real holder and a real scratch server run on a database in the test's own folder
 * (tests/terminal-holder-stand.ts). Each agent is opened new, its terminal closed, and then opened with "resume".
 *
 *   1. claude-code gets `--disallowedTools=<the list>` before `--session-id <uuid>`, and before `--resume <uuid>`.
 *   2. codex gets `--disable <feature>` for each feature, as its only arguments, and before `resume --last`.
 *   3. opencode gets OPENCODE_CONFIG_CONTENT denying its task tool, with its arguments unchanged, new and resumed.
 *   4. kimi is unchanged: `-S <id>` and no OpenCode config. Nobody has read whether Kimi has a subagent tool.
 *
 * The way back and the reopening after a holder restart are read in tests/the-way-back-is-pressed-in-the-offices-
 * terminal.test.ts and tests/an-agent-opens-in-a-terminal.test.ts.
 *
 * MUTATIONS (each after a control run; the commit message has the runs and the logs):
 *   - lib/terminal-agents.ts withTheHarnessFeaturesOff leaves claude-code's arguments as they are: case 1 red.
 *   - the same with codex's: case 2 red. Codex's switch after its arguments: case 2 red, at the resume.
 *   - the same with opencode's environment: case 3 red.
 *   - kimi is given claude-code's switch: case 4 red.
 */

import { chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AS_THE_PERSON, aPlace, ask, groups, startAHolder, startAServer, stopEverything, theStreamsScreen, until, type Place, type ScratchServer } from './terminal-holder-stand.ts'
import { CLAUDE_CODE_FEATURES_OFF, CODEX_FEATURES_OFF, OPENCODE_FEATURES_OFF } from '../src/config/harness-features-off.mjs'

let place: Place
let server: ScratchServer

/** A stand-in agent program: it prints its arguments and its OpenCode config, then waits until it is stopped. */
function aStandIn(name: string): string {
  return `#!${process.execPath}
const out = (line) => process.stdout.write(line + '\\r\\n')
out('STAND-IN ${name} ARGS ' + JSON.stringify(process.argv.slice(2)))
out('OPENCODE_CONFIG_CONTENT=' + (process.env.OPENCODE_CONFIG_CONTENT ?? '(unset)'))
out('STAND-IN READY')
setInterval(() => undefined, 1 << 30)
`
}

/** Register an agent as the person, with a runtime and a start folder. */
async function register(handle: string, runtime: string): Promise<void> {
  const registered = await ask(server.api, '/api/agents/started', { method: 'POST', body: { handle, name: handle, role: 'worker', runtime } })
  if (registered.status !== 201) throw new Error(`${handle} was not registered: ${JSON.stringify(registered.body)}`)
  const startFolder = join(place.dir, handle)
  mkdirSync(startFolder, { recursive: true })
  const set = await ask(server.api, `/api/participants/agent/${handle}/start-folder`, { method: 'POST', body: { startFolder, because: 'the test opens it in a terminal' } })
  if (set.status !== 200) throw new Error(`${handle}'s start folder was not set: ${JSON.stringify(set.body)}`)
}

/**
 * Open the agent, read what its stand-in was given, and close its terminal. A terminal wide enough that the arguments
 * stay on one row.
 */
async function theLaunch(handle: string, resume: boolean): Promise<{ args: string[]; config: string }> {
  const opened = await ask(server.api, '/api/terminals/agents', { method: 'POST', headers: AS_THE_PERSON, body: { agent: handle, cols: 400, rows: 20, ...(resume ? { resume } : {}) } })
  if (opened.status !== 201) throw new Error(`${handle} was not opened: ${JSON.stringify(opened.body)}`)
  const terminal = opened.body['terminal'] as { id: string; pid: number }
  groups.add(terminal.pid)
  const lines = await until(() => theStreamsScreen(server.api, terminal.id), (all) => all.some((line) => line.includes('STAND-IN READY')))
  const argsLine = lines.find((line) => line.startsWith('STAND-IN '))
  const configLine = lines.find((line) => line.startsWith('OPENCODE_CONFIG_CONTENT='))
  if (argsLine === undefined || configLine === undefined) throw new Error(`${handle}'s stand-in printed no arguments: ${lines.join(' | ')}`)
  const closed = await ask(server.api, `/api/terminals/${terminal.id}/close`, { method: 'POST', body: {} })
  if (closed.status !== 200) throw new Error(`${handle}'s terminal was not closed: ${JSON.stringify(closed.body)}`)
  return { args: JSON.parse(argsLine.slice(argsLine.indexOf(' ARGS ') + 6)) as string[], config: configLine.slice('OPENCODE_CONFIG_CONTENT='.length) }
}

beforeAll(async () => {
  place = aPlace('subagents-off')
  const bin = join(place.dir, 'b')
  mkdirSync(bin)
  for (const name of ['claude', 'codex', 'opencode', 'kimi']) {
    writeFileSync(join(bin, name), aStandIn(name))
    chmodSync(join(bin, name), 0o755)
  }
  await startAHolder(place)
  server = await startAServer(place, undefined, { PATH: `${bin}:${process.env['PATH'] ?? '/usr/bin:/bin'}` })
  await register('off-claude', 'claude-code')
  await register('off-codex', 'codex')
  await register('off-opencode', 'opencode')
  await register('off-kimi', 'kimi')
}, 180_000)

afterAll(stopEverything, 60_000)

describe('every launch in the office terminal has the harness subagents off', () => {
  it('1: claude-code gets its switch before its conversation, new and resumed', async () => {
    const fresh = await theLaunch('off-claude', false)
    const conversation = String(fresh.args[fresh.args.length - 1])
    const resumed = await theLaunch('off-claude', true)
    expect([fresh.args, resumed.args]).toEqual([
      [...CLAUDE_CODE_FEATURES_OFF, '--session-id', conversation],
      [...CLAUDE_CODE_FEATURES_OFF, '--resume', conversation],
    ])
  }, 90_000)

  it('2: codex gets its switch as its only arguments, and before resume', async () => {
    const fresh = await theLaunch('off-codex', false)
    const resumed = await theLaunch('off-codex', true)
    expect([fresh.args, resumed.args]).toEqual([[...CODEX_FEATURES_OFF], [...CODEX_FEATURES_OFF, 'resume', '--last']])
  }, 90_000)

  it('3: opencode gets its task tool denied in its config, with its arguments unchanged, new and resumed', async () => {
    const fresh = await theLaunch('off-opencode', false)
    const resumed = await theLaunch('off-opencode', true)
    const off = JSON.stringify(OPENCODE_FEATURES_OFF)
    expect([fresh, resumed]).toEqual([
      { args: [], config: off },
      { args: ['--continue'], config: off },
    ])
  }, 90_000)

  it('4: kimi is opened as it was, with no switch and no OpenCode config', async () => {
    const fresh = await theLaunch('off-kimi', false)
    expect(fresh).toEqual({ args: ['-S', expect.stringMatching(/^mole-office-terminal-[0-9a-f]{12}$/)], config: '(unset)' })
  }, 90_000)
})
