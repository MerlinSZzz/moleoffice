// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SANDBOXED RUN'S STEPS ARE READ FROM ITS CONVERSATION AS IT IS WRITTEN, AND NEVER ITS THINKING. Wave 13u, round 10,
 * way C: GET /api/terminals/agents/:agent/steps (src/server/lib/agent-steps.ts, theStepsOfALine
 * in src/server/lib/adapters/claude-code.ts, readFrom in src/server/lib/adapters/logfile.ts).
 *
 * The conversation files are written by the test, in the shape Claude Code writes, in a sandbox folder of the test's:
 * `.claude/projects/<the working directory, flattened>/<id>.jsonl` in the sandbox's own home folder. The sandbox
 * folder is in the scratch server's own sandboxes folder, under the HOME the test gives it, as the sandbox tool makes
 * one. No sandbox runs.
 *
 *   1. An agent caller is refused 403 with terminalsOnlyThePerson.
 *   2. Each way there are no steps is its own state: no run, a run not in a sandbox, a run that ended, and a run whose
 *      conversation is not there. An unknown agent is refused 404, and an offset that is not a number 400.
 *   3. The first read holds what this run read, ran, wrote, said and used, in order. It holds nothing of its thinking,
 *      of what tools answered, of a sub-agent, of an earlier round in the same conversation, or of a line still being
 *      written.
 *   4. A read with `after` holds only what was written since, and the line finished since is read whole. An offset past
 *      the end of the file reads it again from its end and says so.
 *   5. An isolated run's conversation is read from the home named by its run, and not from the sandbox's.
 *   6. A step holding a key is answered with a marker where the key was (round 10b), in a command and in words said.
 *   7. A record that leads outside its run's own sandbox home is refused with stepsOutsideTheHome, and nothing of the
 *      file it names is answered (round 10b): a folder that is not a sandbox folder, a conversation id with .. in it,
 *      and a conversation that is a link to a file outside the home.
 *
 * MUTATIONS (each after a control run; the commit message has the runs and the logs):
 *   - theStepsOfALine keeps a thinking block's words as `said`: cases 3 and 4 red.
 *   - readFrom reads the line still being written: cases 3 and 4 red.
 *   - the first read keeps steps from before the run started: cases 3 and 4 red.
 *   - the isolated home is not looked for: case 5 red.
 *   - the door does not ask for the person: case 1 red.
 *   - theStepsOfALine does not screen a step's text (round 10b): case 6 red.
 *   - isInsideTheHome answers true for every path (round 10b): case 7 red.
 *   - theRunsOwnHome does not ask that the folder be in the sandboxes folder (round 10b): case 7 red.
 */

import { appendFileSync, mkdirSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AS_AN_AGENT, AS_THE_PERSON, aPlace, ask, startAServer, stopEverything, type Place, type ScratchServer } from './terminal-holder-stand.ts'
import { thePersonsKeyHeader } from './helpers.ts'

let place: Place
let server: ScratchServer
let personsKey: Record<string, string> = {}
let sandbox = ''
let liveFile = ''
let isolatedRun = ''

/** The working directory the planted runs name, and the folder Claude Code flattens it to. */
const WORKING_DIRECTORY = '/test/worktrees/steps-agent'
const FLATTENED = '-test-worktrees-steps-agent'
const ISOLATED_CONVERSATION = '00000000-0000-4000-8000-00000000test'
/** A made-up key in the shape of an API key, for this test only. It opens no account. */
const TEST_KEY = 'sk-test0000000000000000000000000000'
/** Words in a conversation outside every run's home, which no answer may hold. */
const OUTSIDE = 'TEST-OUTSIDE-THE-HOME-NEVER-READ'

/** A local stamp `seconds` from now, in the form the office's records hold. */
function aLocalStamp(seconds: number): string {
  const d = new Date(Date.now() + seconds * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
const anIso = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString()

/** One assistant line, in the shape Claude Code writes it. */
function anAssistantLine(seconds: number, content: unknown[], more: Record<string, unknown> = {}): string {
  return JSON.stringify({ type: 'assistant', isSidechain: false, timestamp: anIso(seconds), message: { role: 'assistant', content }, ...more }) + '\n'
}

const THIS_RUN =
  anAssistantLine(-30, [
    { type: 'thinking', thinking: 'TEST-THINKING-NEVER-SHOWN' },
    { type: 'text', text: 'Reading the brief.' },
  ]) +
  anAssistantLine(-29, [{ type: 'tool_use', name: 'Read', input: { file_path: '/test/brief.md' } }]) +
  JSON.stringify({ type: 'user', timestamp: anIso(-28), message: { role: 'user', content: [{ type: 'tool_result', content: 'TEST-TOOL-RESULT-NEVER-SHOWN' }] } }) +
  '\n' +
  anAssistantLine(-27, [{ type: 'tool_use', name: 'Bash', input: { command: 'npm test\n  --silent' } }]) +
  anAssistantLine(-26, [{ type: 'tool_use', name: 'Edit', input: { file_path: '/test/a.ts', old_string: 'x', new_string: 'y' } }]) +
  anAssistantLine(-25, [{ type: 'text', text: 'TEST-SUB-AGENT-NEVER-SHOWN' }], { isSidechain: true }) +
  anAssistantLine(-24, [{ type: 'tool_use', name: 'mcp__test__request', input: { method: 'GET', path: '/api/test' } }]) +
  JSON.stringify({ type: 'mode', mode: 'test' }) +
  '\n'

/** The line still being written when the page first reads: no newline yet. */
const HALF_A_LINE = anAssistantLine(-20, [{ type: 'text', text: 'Finished half a line.' }])

async function register(handle: string): Promise<void> {
  const registered = await ask(server.api, '/api/agents/started', { method: 'POST', body: { handle, name: handle, role: 'worker', runtime: 'claude-code' } })
  expect(registered.status, JSON.stringify(registered.body)).toBe(201)
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

const theSteps = (handle: string, query = '', headers: Record<string, string> = AS_THE_PERSON) =>
  ask(server.api, `/api/terminals/agents/${handle}/steps${query}`, { headers })

beforeAll(async () => {
  place = aPlace('agent-steps')
  const sandboxes = join(place.home, '.cache', 'mole-office', 'sandboxes')
  sandbox = join(sandboxes, 'sb')
  const conversations = join(sandbox, 'home', '.claude', 'projects', FLATTENED)
  mkdirSync(conversations, { recursive: true })
  // AN OLDER CONVERSATION IN THE SAME FOLDER, written before the live one, which is not read.
  writeFileSync(join(conversations, 'older.jsonl'), anAssistantLine(-7200, [{ type: 'text', text: 'TEST-OLDER-CONVERSATION' }]))
  const anHourAgo = new Date(Date.now() - 3_600_000)
  utimesSync(join(conversations, 'older.jsonl'), anHourAgo, anHourAgo)
  liveFile = join(conversations, 'live.jsonl')
  // AN EARLIER ROUND IN THE SAME CONVERSATION, as --continue leaves it.
  writeFileSync(liveFile, anAssistantLine(-3600, [{ type: 'text', text: 'TEST-EARLIER-ROUND' }]) + THIS_RUN + HALF_A_LINE.slice(0, -40))

  server = await startAServer(place)
  personsKey = thePersonsKeyHeader(join(dirname(place.database), 'keys.json'))
  await register(AS_AN_AGENT['x-mole-office-actor-id']!)
  for (const handle of ['steps-live', 'steps-isolated', 'steps-ended', 'steps-host', 'steps-norun', 'steps-nolog', 'steps-key', 'steps-elsewhere', 'steps-dots', 'steps-link']) await register(handle)
  const inTheSandbox = { workingDirectory: WORKING_DIRECTORY, startedAt: aLocalStamp(-60), sandbox: { template: 'test-template', container: 'test-row', folder: sandbox } }
  await aRun('steps-live', inTheSandbox)
  await aRun('steps-ended', { ...inTheSandbox, state: 'crashed' })
  await aRun('steps-host', { workingDirectory: WORKING_DIRECTORY, startedAt: aLocalStamp(-60) })
  await aRun('steps-nolog', { ...inTheSandbox, workingDirectory: '/test/worktrees/nothing-here' })
  isolatedRun = await aRun('steps-isolated', { ...inTheSandbox, providerSession: ISOLATED_CONVERSATION })
  const itsOwn = join(sandbox, 'out', 'isolated', isolatedRun, 'home', '.claude', 'projects', FLATTENED)
  mkdirSync(itsOwn, { recursive: true })
  writeFileSync(join(itsOwn, `${ISOLATED_CONVERSATION}.jsonl`), anAssistantLine(-10, [{ type: 'text', text: 'Said in the isolated run.' }]))

  // A RUN WHOSE STEPS HOLD A KEY, in a sandbox of its own.
  const keyed = join(sandboxes, 'sb-key', 'home', '.claude', 'projects', FLATTENED)
  mkdirSync(keyed, { recursive: true })
  writeFileSync(
    join(keyed, 'keyed.jsonl'),
    anAssistantLine(-10, [{ type: 'tool_use', name: 'Bash', input: { command: `curl --api-key ${TEST_KEY} /test` } }]) +
      anAssistantLine(-9, [{ type: 'text', text: `The key is ${TEST_KEY} here.` }]),
  )
  await aRun('steps-key', { ...inTheSandbox, providerSession: 'keyed', sandbox: { ...inTheSandbox.sandbox, folder: join(sandboxes, 'sb-key') } })

  // A CONVERSATION OUTSIDE EVERY RUN'S HOME, in a folder shaped like a sandbox's but not in the sandboxes folder.
  const elsewhere = join(place.dir, 'elsewhere')
  const outsideFolder = join(elsewhere, 'home', '.claude', 'projects', FLATTENED)
  mkdirSync(outsideFolder, { recursive: true })
  writeFileSync(join(outsideFolder, 'outside.jsonl'), anAssistantLine(-10, [{ type: 'text', text: OUTSIDE }]))
  await aRun('steps-elsewhere', { ...inTheSandbox, providerSession: 'outside', sandbox: { ...inTheSandbox.sandbox, folder: elsewhere } })
  await aRun('steps-dots', { ...inTheSandbox, providerSession: join(relative(conversations, outsideFolder), 'outside') })
  // A LINK IN A RUN'S OWN HOME to that conversation, in a sandbox of its own so it is no other run's newest.
  const linking = join(sandboxes, 'sb-link', 'home', '.claude', 'projects', FLATTENED)
  mkdirSync(linking, { recursive: true })
  symlinkSync(join(outsideFolder, 'outside.jsonl'), join(linking, 'linked.jsonl'))
  await aRun('steps-link', { ...inTheSandbox, providerSession: 'linked', sandbox: { ...inTheSandbox.sandbox, folder: join(sandboxes, 'sb-link') } })
}, 180_000)

afterAll(stopEverything, 60_000)

describe("a sandboxed run's steps", () => {
  it('1: refuses an agent caller with its code', async () => {
    const reply = await theSteps('steps-live', '', AS_AN_AGENT)
    expect(reply.status, JSON.stringify(reply.body)).toBe(403)
    expect(reply.body['code'], JSON.stringify(reply.body)).toBe('terminalsOnlyThePerson')
  }, 60_000)

  it('2: says each way there are no steps, and refuses what it cannot read', async () => {
    for (const [handle, state] of [
      ['steps-norun', 'no-run'],
      ['steps-host', 'not-in-a-sandbox'],
      ['steps-ended', 'ended'],
      ['steps-nolog', 'no-log'],
    ] as const) {
      const reply = await theSteps(handle)
      expect(reply.status, JSON.stringify(reply.body)).toBe(200)
      expect(reply.body['state'], `${handle}: ${JSON.stringify(reply.body)}`).toBe(state)
      expect(reply.body['steps']).toEqual([])
      expect(reply.body['next']).toBeNull()
      expect(String(reply.body['says'])).not.toBe('')
    }
    const unknown = await theSteps('steps-nobody')
    expect(unknown.status, JSON.stringify(unknown.body)).toBe(404)
    expect(unknown.body['code']).toBe('terminalAgentNotFound')
    expect((await theSteps('steps-live', '?after=test')).status).toBe(400)
  }, 60_000)

  it('3: holds what this run read, ran, wrote, said and used, and nothing else', async () => {
    const reply = await theSteps('steps-live')
    expect(reply.status, JSON.stringify(reply.body)).toBe(200)
    expect(reply.body['state'], JSON.stringify(reply.body)).toBe('shown')
    const steps = (reply.body['steps'] as { kind: string; tool: string; what: string; at: string | null }[]).map(({ kind, tool, what }) => ({ kind, tool, what }))
    expect(steps).toEqual([
      { kind: 'said', tool: '', what: 'Reading the brief.' },
      { kind: 'read', tool: 'Read', what: '/test/brief.md' },
      { kind: 'ran', tool: 'Bash', what: 'npm test --silent' },
      { kind: 'wrote', tool: 'Edit', what: '/test/a.ts' },
      { kind: 'used', tool: 'mcp__test__request', what: 'GET /api/test' },
    ])
    const text = JSON.stringify(reply.body)
    for (const never of ['TEST-THINKING-NEVER-SHOWN', 'TEST-TOOL-RESULT-NEVER-SHOWN', 'TEST-SUB-AGENT-NEVER-SHOWN', 'TEST-EARLIER-ROUND', 'TEST-OLDER-CONVERSATION', 'Finished half a line']) {
      expect(text).not.toContain(never)
    }
    expect(reply.body['next']).toBe(statSync(liveFile).size - (HALF_A_LINE.length - 40))
    expect(reply.body['earlier']).toBe(false)
    expect(String(reply.body['says'])).toContain('live.jsonl')
  }, 60_000)

  it('4: reads only what was written since, and reads again from the end when the offset is past it', async () => {
    const first = await theSteps('steps-live')
    const next = first.body['next'] as number
    expect((await theSteps('steps-live', `?after=${String(next)}`)).body['steps']).toEqual([])
    appendFileSync(liveFile, HALF_A_LINE.slice(-40) + anAssistantLine(-5, [{ type: 'tool_use', name: 'Write', input: { file_path: '/test/b.ts', content: 'z' } }]))
    const since = await theSteps('steps-live', `?after=${String(next)}`)
    expect((since.body['steps'] as { kind: string; what: string }[]).map(({ kind, what }) => ({ kind, what }))).toEqual([
      { kind: 'said', what: 'Finished half a line.' },
      { kind: 'wrote', what: '/test/b.ts' },
    ])
    expect(since.body['next']).toBe(statSync(liveFile).size)
    const past = await theSteps('steps-live', `?after=${String(statSync(liveFile).size + 1000)}`)
    expect(past.body['state']).toBe('shown')
    expect((past.body['steps'] as unknown[]).length).toBe(7)
    expect(String(past.body['says'])).toContain('read again from its end')
  }, 60_000)

  it("5: reads an isolated run's conversation from the home named by its run", async () => {
    const reply = await theSteps('steps-isolated')
    expect(reply.body['state'], JSON.stringify(reply.body)).toBe('shown')
    expect(reply.body['steps']).toMatchObject([{ kind: 'said', what: 'Said in the isolated run.' }])
    expect(String(reply.body['says'])).toContain(join('out', 'isolated', isolatedRun, 'home'))
  }, 60_000)

  it('6: a step holding a key is answered with a marker where the key was', async () => {
    const reply = await theSteps('steps-key')
    expect(reply.body['state'], JSON.stringify(reply.body)).toBe('shown')
    expect((reply.body['steps'] as { kind: string; what: string }[]).map(({ kind, what }) => ({ kind, what }))).toEqual([
      { kind: 'ran', what: 'curl --api-key <an API key, not shown> /test' },
      { kind: 'said', what: 'The key is <an API key, not shown> here.' },
    ])
    expect(JSON.stringify(reply.body)).not.toContain('sk-test')
  }, 60_000)

  it('7: a record that leads outside its own sandbox home is refused, and nothing outside is read', async () => {
    for (const handle of ['steps-elsewhere', 'steps-dots', 'steps-link']) {
      const reply = await theSteps(handle)
      expect(reply.status, `${handle}: ${JSON.stringify(reply.body)}`).toBe(400)
      expect(reply.body['code'], `${handle}: ${JSON.stringify(reply.body)}`).toBe('stepsOutsideTheHome')
      expect(JSON.stringify(reply.body)).not.toContain(OUTSIDE)
    }
  }, 60_000)
})
