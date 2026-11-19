// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The inspector's ACP client checks dsh's route and effort, reads one turn and ends its own process group.
 * Labelled stand-ins speak ACP; no real model or key is used. Every existing case remains.
 * Case 13 shortens only the input-end wait through the test clock argument. Case 19 still asserts the
 * shipped 20-second wait and its sentence; cases 18 and 19 both keep the real 10 seconds before SIGKILL.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { theTimeLeftIn } from './how-long-a-test-may-take.ts'
import { THE_FEATURES_OFF_BESIDE_THE_CLIENT } from '../tools/inspector-dsh-acp.mjs'

const CLIENT = fileURLToPath(new URL('../tools/inspector-dsh-acp.mjs', import.meta.url))
const STAND_IN = fileURLToPath(new URL('./a-dsh-acp-stand-in.mjs', import.meta.url))

const PROVIDER = 'deepseek-official'
const MODEL = 'deepseek-flash'
const ROUTE = [PROVIDER, MODEL]
const ANOTHER_ROUTE = [PROVIDER, 'deepseek-pro']
const ARGS = ['--provider', PROVIDER, '--model', MODEL]
/** The id the stand-in's session/new answers, and a saved session's id for --resume. Both made up. */
const SESSION = '9b2c4e1a-7d3f-4a5b-8c6d-0e1f2a3b4c5d'
const SAVED = '0f1e2d3c-4b5a-4968-8776-655443322110'
const PROMPT = 'A made-up check prompt for the stand-in.\nIt has a second line, and a word in Chinese: 检查.\n'

/**
 * A made-up turn. The result is the text of the last message that had text, m-2, its two chunks joined; m-1 came
 * before it, the thoughts are not part of it, m-3 is for another session, and m-4 has no text.
 */
const A_TURN = {
  stopReason: 'end_turn',
  updates: [
    { sessionUpdate: 'agent_thought_chunk', messageId: 'm-1', content: { type: 'text', text: 'A made-up thought.' } },
    { sessionUpdate: 'agent_message_chunk', messageId: 'm-1', content: { type: 'text', text: 'A made-up earlier message.' } },
    { sessionUpdate: 'tool_call', toolCallId: 'c-1', title: 'read', kind: 'other', status: 'in_progress', rawInput: {} },
    { sessionUpdate: 'tool_call_update', toolCallId: 'c-1', status: 'completed', content: [] },
    { sessionUpdate: 'agent_message_chunk', messageId: 'm-2', content: { type: 'text', text: 'The made-up last ' } },
    { sessionUpdate: 'agent_thought_chunk', messageId: 'm-2', content: { type: 'text', text: 'Another made-up thought.' } },
    { sessionUpdate: 'agent_message_chunk', messageId: 'm-2', content: { type: 'text', text: 'message.' } },
    { sessionUpdate: 'agent_message_chunk', messageId: 'm-3', content: { type: 'text', text: 'For another session.' }, forSession: 'another-session' },
    { sessionUpdate: 'agent_message_chunk', messageId: 'm-4', content: { type: 'image', mimeType: 'image/png', data: '' } },
    { sessionUpdate: 'usage_update', used: 1200, size: 128000 },
  ],
}
const THE_RESULT = 'The made-up last message.'

const KEYS = ['type', 'sessionId', 'resumed', 'route', 'effortSet', 'effortReported', 'stopReason', 'isError', 'error', 'result']
interface Envelope {
  type: string
  sessionId: string | null
  resumed: boolean
  route: { provider: string; model: string } | null
  effortSet: string | null
  effortReported: string | null
  stopReason: string | null
  isError: boolean
  error: string | null
  result: string
}

interface World { root: string; bin: string; work: string; tmp: string; home: string; log: string; scenario: string }
const worlds: string[] = []
afterEach(() => {
  for (const root of worlds.splice(0)) rmSync(root, { recursive: true, force: true })
})

const shellQuoted = (word: string) => `'${word.replaceAll("'", "'\\''")}'`

/** A temporary folder of this test's own, with the stand-in on PATH as `dsh` and its scenario written. */
function aWorld(scenario: Record<string, unknown> = {}): World {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-acp-client-')))
  worlds.push(root)
  const bin = join(root, 'bin')
  const work = join(root, 'work')
  const tmp = join(root, 'tmp')
  const home = join(root, 'home')
  for (const folder of [bin, work, tmp, join(home, '.dsh')]) mkdirSync(folder, { recursive: true })
  writeFileSync(join(bin, 'dsh'), `#!/bin/sh\nexec ${shellQuoted(process.execPath)} ${shellQuoted(STAND_IN)} "$@"\n`, { mode: 0o755 })
  writeFileSync(join(tmp, 'somebody-elses-file'), 'Left here by the test. The client must not remove it.\n')
  const log = join(root, 'stand-in.log')
  const file = join(root, 'scenario.json')
  writeFileSync(file, JSON.stringify({ log, sessionId: SESSION, routeOnNew: ROUTE, routeOnResume: ROUTE, prompt: A_TURN, ...scenario }))
  return { root, bin, work, tmp, home, log, scenario: file }
}

interface Ran { code: number | null; out: string; err: string; endedInTime: boolean }

/** Stop a process group the test recorded, when it is still there. */
function stopTheGroup(group: number, signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM'): void {
  try {
    process.kill(-group, signal)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
  }
}

/**
 * Run the client as the check view does, in its own process group, stopped by that group when its budget ends.
 * `started` is told that group as soon as the client is started.
 */
async function runTheClient(world: World, args: readonly string[], prompt: string, budget: number, started?: (group: number) => void): Promise<Ran> {
  const child = spawn(process.execPath, [CLIENT, ...args], {
    cwd: world.work,
    detached: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      PATH: `${world.bin}:${process.env.PATH ?? ''}`,
      HOME: world.home,
      TMPDIR: world.tmp,
      DSH_HOME: join(world.home, '.dsh'),
      DSH_PERMISSION_MODE: 'danger-full-access',
      DSH_ACP_STAND_IN_SCENARIO: world.scenario,
    },
  })
  const group = child.pid
  if (group !== undefined) started?.(group)
  let out = ''
  let err = ''
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => { out += chunk })
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => { err += chunk })
  // A client that refuses its arguments may end before it reads its input; that pipe error is not this test's.
  child.stdin.on('error', () => {})
  child.stdin.end(prompt)
  let endedInTime = true
  const timer = setTimeout(() => {
    endedInTime = false
    if (group !== undefined) stopTheGroup(group)
  }, budget)
  const code = await new Promise<number | null>((done) => child.on('close', (exit) => done(exit)))
  clearTimeout(timer)
  return { code, out, err, endedInTime }
}

/** Case 16, asked in every case: stdout is exactly one line, the envelope, and the exit code follows isError. */
function theEnvelope(ran: Ran): Envelope {
  expect(ran.endedInTime, `the client did not end within its budget. Its stderr:\n${ran.err}`).toBe(true)
  expect(ran.out.endsWith('\n'), `stdout does not end with a line end: ${JSON.stringify(ran.out)}`).toBe(true)
  const lines = ran.out.slice(0, -1).split('\n')
  expect(lines, 'stdout holds exactly one line').toHaveLength(1)
  const envelope = JSON.parse(lines[0] ?? '') as Envelope
  expect(Object.keys(envelope)).toEqual(KEYS)
  expect(envelope.type).toBe('dsh-acp-result')
  expect(typeof envelope.result).toBe('string')
  expect(ran.code, `exit code for isError ${String(envelope.isError)}; stderr:\n${ran.err}`).toBe(envelope.isError ? 1 : 0)
  return envelope
}

type Entry = { at: string; [field: string]: any }
const theLog = (world: World): Entry[] =>
  existsSync(world.log) ? readFileSync(world.log, 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as Entry) : []
const framesIn = (log: Entry[]): any[] => log.filter((entry) => entry.at === 'frame').map((entry) => entry.frame)
/** The methods the client sent, requests and notifications, in order. */
const sentIn = (log: Entry[]): string[] => framesIn(log).filter((frame) => frame.method !== undefined).map((frame) => frame.method as string)
const paramsOf = (log: Entry[], method: string): any[] => framesIn(log).filter((frame) => frame.method === method).map((frame) => frame.params)

/** Whether a process is still running. A zombie has exited, and nothing may have reaped it yet. */
function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false
    throw error
  }
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
    return stat.slice(stat.lastIndexOf(')') + 2)[0] !== 'Z'
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function goneWithin(pid: number, ms: number): Promise<boolean> {
  const until = Date.now() + ms
  while (isRunning(pid)) {
    if (Date.now() > until) return false
    await new Promise((done) => setTimeout(done, 50))
  }
  return true
}

describe('the DSH check\'s ACP client', () => {
  it('1. a new session with no effort: the route patch, initialize, session/new, the prompt, the result and the clean-up', async ({ task }) => {
    const world = aWorld()
    const ran = await runTheClient(world, ARGS, PROMPT, theTimeLeftIn(task).forAWait('the client to end'))
    const envelope = theEnvelope(ran)
    expect(envelope).toEqual({ type: 'dsh-acp-result', sessionId: SESSION, resumed: false, route: { provider: PROVIDER, model: MODEL },
      effortSet: null, effortReported: 'high', stopReason: 'end_turn', isError: false, error: null, result: THE_RESULT })
    const log = theLog(world)
    const start = log.find((entry) => entry.at === 'start')!
    expect(start.argv).toEqual(['--profile', 'acp', '--patch', start.patch.path, '--patch', join(dirname(CLIENT), THE_FEATURES_OFF_BESIDE_THE_CLIENT)])
    expect(JSON.parse(start.patch.content)).toEqual([{ id: 'acp', config: { provider: PROVIDER, model: MODEL } }])
    expect(start.patch.mode.toString(8)).toBe('600')
    expect(start.cwd).toBe(world.work)
    expect(dirname(start.patch.path).startsWith(world.tmp + '/')).toBe(true)
    expect(sentIn(log)).toEqual(['initialize', 'session/new', 'session/prompt', 'session/close'])
    expect(paramsOf(log, 'initialize')).toEqual([{ protocolVersion: 1, clientCapabilities: {} }])
    expect(paramsOf(log, 'session/new')).toEqual([{ cwd: world.work, mcpServers: [] }])
    expect(paramsOf(log, 'session/prompt')).toEqual([{ sessionId: SESSION, prompt: [{ type: 'text', text: PROMPT }] }])
    expect(paramsOf(log, 'session/close')).toEqual([{ sessionId: SESSION }])
    expect(ran.err).toContain('No effort was named, so none was set; dsh reported high as its effort.')
    expect(ran.err).toContain('dsh: a-dsh-acp-stand-in: started\n')
    expect(existsSync(dirname(start.patch.path))).toBe(false)
    expect(readdirSync(world.tmp)).toEqual(['somebody-elses-file'])
  })

  it('2. --effort low is set after session/new and before session/prompt', async ({ task }) => {
    const world = aWorld()
    const ran = await runTheClient(world, [...ARGS, '--effort', 'low'], PROMPT, theTimeLeftIn(task).forAWait('the client to end'))
    const envelope = theEnvelope(ran)
    expect(envelope).toMatchObject({ isError: false, effortSet: 'low', effortReported: 'low', result: THE_RESULT })
    const log = theLog(world)
    expect(sentIn(log)).toEqual(['initialize', 'session/new', 'session/set_config_option', 'session/prompt', 'session/close'])
    expect(paramsOf(log, 'session/set_config_option')).toEqual([{ sessionId: SESSION, configId: 'reasoning_effort', value: 'low' }])
    expect(ran.err).not.toContain('No effort was named')
  })

  it('3. an effort dsh refuses ends the check with dsh\'s own words, sent once, and no prompt is sent', async ({ task }) => {
    const words = `unknown reasoning effort for ${PROVIDER}/${MODEL}: low`
    const world = aWorld({ refuseEffort: words })
    const ran = await runTheClient(world, [...ARGS, '--effort', 'low'], PROMPT, theTimeLeftIn(task).forAWait('the client to end'))
    const envelope = theEnvelope(ran)
    expect(envelope).toMatchObject({ isError: true, effortSet: null, effortReported: 'high', stopReason: null, result: '' })
    expect(envelope.error).toContain(`Invalid params: ${words}`)
    const log = theLog(world)
    expect(sentIn(log).filter((method) => method === 'session/set_config_option')).toHaveLength(1)
    expect(sentIn(log)).not.toContain('session/prompt')
  })

  it('3b. an effort the old list did not hold goes to dsh as typed, and dsh\'s refusal of it is said in dsh\'s words', async ({ task }) => {
    const world = aWorld({ refuseEffort: `unknown reasoning effort for ${PROVIDER}/${MODEL}: medium` })
    const ran = await runTheClient(world, [...ARGS, '--effort', 'medium'], PROMPT, theTimeLeftIn(task).forAWait('the client to end'))
    const envelope = theEnvelope(ran)
    expect(envelope.isError).toBe(true)
    expect(envelope.error).toContain('dsh refused the effort medium')
    expect(envelope.error).toContain(`Invalid params: unknown reasoning effort for ${PROVIDER}/${MODEL}: medium`)
    const log = theLog(world)
    expect(paramsOf(log, 'session/set_config_option')).toEqual([{ sessionId: SESSION, configId: 'reasoning_effort', value: 'medium' }])
    expect(sentIn(log)).not.toContain('session/prompt')
  })

  it('4. an effort accepted but reported back as another value ends the check, and no prompt is sent', async ({ task }) => {
    const world = aWorld({ effortBack: 'max' })
    const ran = await runTheClient(world, [...ARGS, '--effort', 'low'], PROMPT, theTimeLeftIn(task).forAWait('the client to end'))
    const envelope = theEnvelope(ran)
    expect(envelope).toMatchObject({ isError: true, effortSet: null, effortReported: 'max' })
    expect(envelope.error).toContain('low')
    expect(envelope.error).toContain('max')
    expect(sentIn(theLog(world))).not.toContain('session/prompt')
  })

  it('5. a route on session/new that is not the one asked for ends the check, naming both, before any effort or prompt', async ({ task }) => {
    const world = aWorld({ routeOnNew: ANOTHER_ROUTE })
    const ran = await runTheClient(world, [...ARGS, '--effort', 'low'], PROMPT, theTimeLeftIn(task).forAWait('the client to end'))
    const envelope = theEnvelope(ran)
    expect(envelope).toMatchObject({ isError: true, sessionId: SESSION, route: null, effortSet: null })
    expect(envelope.error).toBe(`dsh's ACP session reports the model route ${PROVIDER}/deepseek-pro, but this check asked for ${PROVIDER}/${MODEL}. No prompt was sent.`)
    expect(sentIn(theLog(world))).toEqual(['initialize', 'session/new', 'session/close'])
  })

  it('5b. a session/new that reports no model route ends the check the same way', async ({ task }) => {
    const world = aWorld({ routeOnNew: null })
    const ran = await runTheClient(world, [...ARGS, '--effort', 'low'], PROMPT, theTimeLeftIn(task).forAWait('the client to end'))
    const envelope = theEnvelope(ran)
    expect(envelope).toMatchObject({ isError: true, route: null })
    expect(envelope.error).toContain('reported no model route')
    expect(envelope.error).toContain('No prompt was sent.')
    expect(sentIn(theLog(world))).toEqual(['initialize', 'session/new', 'session/close'])
  })

  it('6. --resume sends session/resume and not session/new, checks the route, and sets the effort again', async ({ task }) => {
    const world = aWorld()
    const ran = await runTheClient(world, [...ARGS, '--effort', 'low', '--resume', SAVED], PROMPT, theTimeLeftIn(task).forAWait('the client to end'))
    const envelope = theEnvelope(ran)
    expect(envelope).toEqual({ type: 'dsh-acp-result', sessionId: SAVED, resumed: true, route: { provider: PROVIDER, model: MODEL },
      effortSet: 'low', effortReported: 'low', stopReason: 'end_turn', isError: false, error: null, result: THE_RESULT })
    const log = theLog(world)
    expect(sentIn(log)).toEqual(['initialize', 'session/resume', 'session/set_config_option', 'session/prompt', 'session/close'])
    expect(paramsOf(log, 'session/resume')).toEqual([{ sessionId: SAVED, cwd: world.work, mcpServers: [] }])
    expect(paramsOf(log, 'session/set_config_option')).toEqual([{ sessionId: SAVED, configId: 'reasoning_effort', value: 'low' }])
  })

  it('7. a route on session/resume that is not the one asked for ends the check, naming both, and no prompt is sent', async ({ task }) => {
    const world = aWorld({ routeOnResume: ANOTHER_ROUTE })
    const ran = await runTheClient(world, [...ARGS, '--effort', 'low', '--resume', SAVED], PROMPT, theTimeLeftIn(task).forAWait('the client to end'))
    const envelope = theEnvelope(ran)
    expect(envelope).toMatchObject({ isError: true, sessionId: SAVED, resumed: true, route: null })
    expect(envelope.error).toBe(`dsh's ACP session reports the model route ${PROVIDER}/deepseek-pro, but this check asked for ${PROVIDER}/${MODEL}. No prompt was sent.`)
    expect(sentIn(theLog(world))).toEqual(['initialize', 'session/resume', 'session/close'])
  })

  it.for(['max_tokens', 'cancelled'])('8. a stop reason of %s is an error', async (reason, { task }) => {
    const world = aWorld({ prompt: { ...A_TURN, stopReason: reason } })
    const ran = await runTheClient(world, ARGS, PROMPT, theTimeLeftIn(task).forAWait('the client to end'))
    const envelope = theEnvelope(ran)
    expect(envelope).toMatchObject({ isError: true, stopReason: reason, error: `dsh ended the turn with ${reason}.` })
  })

  it('9. a prompt dsh rejects is an error carrying dsh\'s words', async ({ task }) => {
    const words = 'turn failed: the stand-in\'s made-up provider refused the request'
    const world = aWorld({ prompt: { updates: [], error: words } })
    const ran = await runTheClient(world, ARGS, PROMPT, theTimeLeftIn(task).forAWait('the client to end'))
    const envelope = theEnvelope(ran)
    expect(envelope).toMatchObject({ isError: true, stopReason: null })
    expect(envelope.error).toContain(`Internal error: ${words}`)
  })

  it('10. a permission request is answered cancelled, session/cancel is sent, and the check is an error', async ({ task }) => {
    const world = aWorld({ askPermission: true })
    const ran = await runTheClient(world, ARGS, PROMPT, theTimeLeftIn(task).forAWait('the client to end'))
    const envelope = theEnvelope(ran)
    expect(envelope).toMatchObject({ isError: true,
      error: 'dsh asked for permission although the check runs with full access; the check refused it and stopped.' })
    const log = theLog(world)
    const answered = log.find((entry) => entry.at === 'answer' && entry.method === 'session/request_permission')
    expect(answered?.frame.result).toEqual({ outcome: { outcome: 'cancelled' } })
    expect(answered?.frame.error).toBeUndefined()
    expect(paramsOf(log, 'session/cancel')).toEqual([{ sessionId: SESSION }])
    const frames = framesIn(log)
    const theAnswer = frames.findIndex((frame) => frame.method === undefined && frame.id === answered?.frame.id)
    expect(theAnswer).toBeGreaterThanOrEqual(0)
    expect(theAnswer).toBeLessThan(frames.findIndex((frame) => frame.method === 'session/cancel'))
  })

  it('11. any other request from dsh is answered method not found, and the check goes on', async ({ task }) => {
    const world = aWorld({ otherRequest: 'fs/read_text_file' })
    const ran = await runTheClient(world, ARGS, PROMPT, theTimeLeftIn(task).forAWait('the client to end'))
    const envelope = theEnvelope(ran)
    expect(envelope).toMatchObject({ isError: false, result: THE_RESULT })
    const answered = theLog(world).find((entry) => entry.at === 'answer' && entry.method === 'fs/read_text_file')
    expect(answered?.frame.error?.code).toBe(-32601)
    expect(answered?.frame.result).toBeUndefined()
  })

  it('12. dsh exiting before it answers session/new is an error naming session/new and the exit code', async ({ task }) => {
    const world = aWorld({ exitBefore: 'session/new', exitCode: 3 })
    const ran = await runTheClient(world, ARGS, PROMPT, theTimeLeftIn(task).forAWait('the client to end'))
    const envelope = theEnvelope(ran)
    expect(envelope).toMatchObject({ isError: true, sessionId: null, route: null })
    expect(envelope.error).toContain('session/new')
    expect(envelope.error).toContain('exit code 3')
    expect(sentIn(theLog(world))).toEqual(['initialize', 'session/new'])
  })

  // This case shortens only the initial exit wait; case 19 keeps the shipped wait and its sentence.
  it('13. dsh ignoring the end of its input is stopped by its own group, its child with it, and nothing outside that group', { timeout: 60_000 }, async ({ task }) => {
    const world = aWorld({ ignoreEndOfStdin: true, startAChild: true })
    const outside = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' })
    const outsidePid = outside.pid
    expect(outsidePid).toBeTypeOf('number')
    let standInGroup: number | null = null
    try {
      const ran = await runTheClient(world, [...ARGS, '--exit-within-ms', '200'], PROMPT, theTimeLeftIn(task).forAWait('the client to stop dsh'))
      const log = theLog(world)
      const start = log.find((entry) => entry.at === 'start')
      standInGroup = start?.group ?? null
      const envelope = theEnvelope(ran)
      expect(envelope).toMatchObject({ isError: false, result: THE_RESULT })
      expect(ran.err).toContain('dsh did not exit within 0.2 seconds')
      const child = log.find((entry) => entry.at === 'child')
      expect(start?.group, 'dsh was started as the leader of its own process group').toBe(start?.pid)
      expect(child?.group, "the stand-in's child is in the stand-in's group").toBe(start?.pid)
      expect(log.map((entry) => entry.at)).toContain('stdin-end')
      expect(log.map((entry) => entry.at)).toContain('signal')
      expect(log.map((entry) => entry.at)).toContain('child-signal')
      expect(await goneWithin(start!.pid, 5_000), 'the stand-in is gone').toBe(true)
      expect(await goneWithin(child!.pid, 5_000), "the stand-in's child is gone").toBe(true)
      expect(isRunning(outsidePid!), 'the process outside that group is still running').toBe(true)
    } finally {
      if (standInGroup !== null) stopTheGroup(standInGroup)
      if (outsidePid !== undefined) stopTheGroup(outsidePid)
    }
  })

  // The client waits 20 seconds for dsh to exit after the end of its input. The stop comes inside that wait, so this
  // case is given a minute as case 13 is.
  it('17. a client stopped from outside sends dsh\'s group a SIGTERM, so the stand-in and its child are gone, and says it was stopped', { timeout: 60_000 }, async ({ task }) => {
    const world = aWorld({ ignoreEndOfStdin: true, startAChild: true })
    let clientGroup: number | null = null
    let standInGroup: number | null = null
    try {
      const running = runTheClient(world, ARGS, PROMPT, theTimeLeftIn(task).forAWait('the client to end after it is stopped'), (group) => { clientGroup = group })
      // THE MOMENT OF THE STOP: the turn is over, dsh has the end of its input and keeps running, and the client waits.
      const until = Date.now() + 10_000
      while (!theLog(world).some((entry) => entry.at === 'stdin-end') || !theLog(world).some((entry) => entry.at === 'child')) {
        if (Date.now() > until) throw new Error('the stand-in did not log the end of its input and its child within 10 seconds')
        await new Promise((done) => setTimeout(done, 50))
      }
      const log = theLog(world)
      const start = log.find((entry) => entry.at === 'start')
      const child = log.find((entry) => entry.at === 'child')
      standInGroup = start?.group ?? null
      // THE CASE'S OWN PREMISE: dsh leads a group of its own, so a SIGTERM to the client's group does not reach it.
      expect(start?.group).toBe(start?.pid)
      expect(start?.group).not.toBe(clientGroup)
      stopTheGroup(clientGroup!)
      const ran = await running
      expect(await goneWithin(start!.pid, 5_000), 'the stand-in is gone').toBe(true)
      expect(await goneWithin(child!.pid, 5_000), "the stand-in's child is gone").toBe(true)
      const envelope = theEnvelope(ran)
      expect(envelope).toMatchObject({ isError: true, error: `The client was stopped by SIGTERM, so dsh's process group ${String(start?.group)} was sent SIGTERM.` })
      expect(theLog(world).map((entry) => entry.at)).toEqual(expect.arrayContaining(['signal', 'child-signal']))
      expect(ran.err).not.toContain('dsh did not exit within 20 seconds')
      expect(readdirSync(world.tmp)).toEqual(['somebody-elses-file'])
    } finally {
      if (standInGroup !== null) stopTheGroup(standInGroup)
    }
  })

  // The client gives dsh's group 10 seconds after its SIGTERM, so this case is given a minute as case 17 is.
  it('18. a client stopped from outside waits for dsh\'s group, sends SIGKILL to a group that ignores SIGTERM, and exits only when the stand-in and its child are gone', { timeout: 60_000 }, async ({ task }) => {
    const world = aWorld({ ignoreEndOfStdin: true, ignoreSigterm: true, startAChild: true, childIgnoresSigterm: true })
    let clientGroup: number | null = null
    let standInGroup: number | null = null
    try {
      const running = runTheClient(world, ARGS, PROMPT, theTimeLeftIn(task).forAWait('the client to end after it is stopped'), (group) => { clientGroup = group })
      const until = Date.now() + 10_000
      while (!theLog(world).some((entry) => entry.at === 'stdin-end') || !theLog(world).some((entry) => entry.at === 'child')) {
        if (Date.now() > until) throw new Error('the stand-in did not log the end of its input and its child within 10 seconds')
        await new Promise((done) => setTimeout(done, 50))
      }
      const log = theLog(world)
      const start = log.find((entry) => entry.at === 'start')
      const child = log.find((entry) => entry.at === 'child')
      standInGroup = start?.group ?? null
      expect(start?.group).toBe(start?.pid)
      expect(child?.group).toBe(start?.pid)
      expect(start?.group).not.toBe(clientGroup)
      const stoppedAt = performance.now()
      stopTheGroup(clientGroup!)
      const ran = await running
      const took = performance.now() - stoppedAt
      // AT THE MOMENT THE CLIENT HAS EXITED, with no wait of the test's own: that is what "the client has exited"
      // must mean (item (a)).
      expect(isRunning(start!.pid), 'the stand-in is still running when the client has exited').toBe(false)
      expect(isRunning(child!.pid), "the stand-in's child is still running when the client has exited").toBe(false)
      expect(theLog(world).map((entry) => entry.at), 'both were sent SIGTERM first').toEqual(expect.arrayContaining(['signal', 'child-signal']))
      expect(took, 'SIGTERM was given 10 seconds before SIGKILL').toBeGreaterThanOrEqual(10_000)
      const envelope = theEnvelope(ran)
      expect(envelope).toMatchObject({ isError: true,
        error: `The client was stopped by SIGTERM, so dsh's process group ${String(start?.group)} was sent SIGTERM, and SIGKILL when it had not ended 10 seconds later.` })
      expect(readdirSync(world.tmp)).toEqual(['somebody-elses-file'])
    } finally {
      // This stand-in and its child ignore SIGTERM, so a red run would leave them running after a SIGTERM.
      if (standInGroup !== null) stopTheGroup(standInGroup, 'SIGKILL')
    }
  })

  // The client waits 20 seconds for dsh to exit, then 10 seconds for its group to end after SIGTERM, so this case is
  // given a minute and a half.
  it('19. dsh ignoring the end of its input and SIGTERM is sent SIGKILL 10 seconds after the SIGTERM, and is gone with its child when the client has exited', { timeout: 90_000 }, async ({ task }) => {
    const world = aWorld({ ignoreEndOfStdin: true, ignoreSigterm: true, startAChild: true, childIgnoresSigterm: true })
    let standInGroup: number | null = null
    try {
      const ran = await runTheClient(world, ARGS, PROMPT, theTimeLeftIn(task).forAWait('the client to end dsh'))
      const log = theLog(world)
      const start = log.find((entry) => entry.at === 'start')
      const child = log.find((entry) => entry.at === 'child')
      standInGroup = start?.group ?? null
      expect(start?.group).toBe(start?.pid)
      expect(child?.group).toBe(start?.pid)
      expect(isRunning(start!.pid), 'the stand-in is still running when the client has exited').toBe(false)
      expect(isRunning(child!.pid), "the stand-in's child is still running when the client has exited").toBe(false)
      expect(log.map((entry) => entry.at), 'both were sent SIGTERM first').toEqual(expect.arrayContaining(['stdin-end', 'signal', 'child-signal']))
      const envelope = theEnvelope(ran)
      expect(envelope).toMatchObject({ isError: false, result: THE_RESULT })
      expect(ran.err).toContain(`dsh did not exit within 20 seconds of the end of its input, so its process group ${String(start?.group)} was sent SIGTERM.`)
      expect(ran.err).toContain(`dsh's process group ${String(start?.group)} was still there 10 seconds after the SIGTERM, so it was sent SIGKILL, and it is gone.`)
    } finally {
      // This stand-in and its child ignore SIGTERM, so a red run would leave them running after a SIGTERM.
      if (standInGroup !== null) stopTheGroup(standInGroup, 'SIGKILL')
    }
  })

  it('20. dsh exiting by itself with a child left in its group: the client sends the group SIGKILL, says so, and the child is gone when the client has exited', async ({ task }) => {
    const world = aWorld({ startAChild: true })
    let standInGroup: number | null = null
    try {
      const ran = await runTheClient(world, ARGS, PROMPT, theTimeLeftIn(task).forAWait('the client to end'))
      const log = theLog(world)
      const start = log.find((entry) => entry.at === 'start')
      const child = log.find((entry) => entry.at === 'child')
      standInGroup = start?.group ?? null
      expect(start?.group).toBe(start?.pid)
      expect(child?.group, "the stand-in's child is in the stand-in's group").toBe(start?.pid)
      expect(log.map((entry) => entry.at), 'the stand-in exited by itself at the end of its input').toEqual(expect.arrayContaining(['stdin-end', 'exit']))
      expect(isRunning(child!.pid), "the stand-in's child is still running when the client has exited").toBe(false)
      expect(log.map((entry) => entry.at), 'the child was sent SIGKILL, not SIGTERM').not.toContain('child-signal')
      const envelope = theEnvelope(ran)
      expect(envelope).toMatchObject({ isError: false, result: THE_RESULT })
      expect(ran.err).toContain(`dsh exited, but its process group ${String(start?.group)} was not empty, so it was sent SIGKILL, and it is gone.`)
      expect(ran.err).not.toContain('dsh did not exit within')
    } finally {
      if (standInGroup !== null) stopTheGroup(standInGroup, 'SIGKILL')
    }
  })

  it.for([
    ['a missing --model', ['--provider', PROVIDER]],
    ['--model before --provider', ['--model', MODEL, '--provider', PROVIDER]],
    ['an empty --effort', [...ARGS, '--effort', '']],
    ['--resume with an id that is not a UUID', [...ARGS, '--resume', 'not-a-session-id']],
    ['an argument after --resume <id>', [...ARGS, '--resume', SAVED, '--effort', 'low']],
  ] as const)('14. refuses %s before dsh is started', async ([, args], { task }) => {
    const world = aWorld()
    const ran = await runTheClient(world, args, PROMPT, theTimeLeftIn(task).forAWait('the client to end'))
    const envelope = theEnvelope(ran)
    expect(envelope).toMatchObject({ isError: true, sessionId: null, resumed: false, route: null, effortSet: null, effortReported: null, stopReason: null, result: '' })
    expect(envelope.error).toContain('dsh was not started')
    expect(existsSync(world.log), 'the stand-in was started').toBe(false)
    expect(readdirSync(world.tmp)).toEqual(['somebody-elses-file'])
  })

  it.for([['an empty prompt', ''], ['a blank prompt', ' \n\t \n']] as const)('15. refuses %s before dsh is started', async ([, prompt], { task }) => {
    const world = aWorld()
    const ran = await runTheClient(world, ARGS, prompt, theTimeLeftIn(task).forAWait('the client to end'))
    const envelope = theEnvelope(ran)
    expect(envelope).toMatchObject({ isError: true, sessionId: null, route: null, result: '' })
    expect(envelope.error).toContain('dsh was not started')
    expect(existsSync(world.log), 'the stand-in was started').toBe(false)
  })

  it('refuses an invalid --exit-within-ms before dsh is started', async ({ task }) => {
    for (const value of ['0', '1.5']) {
      const world = aWorld()
      const ran = await runTheClient(world, [...ARGS, '--exit-within-ms', value], PROMPT, theTimeLeftIn(task).forAWait('the client to refuse its clock'))
      const envelope = theEnvelope(ran)
      expect(envelope.isError).toBe(true)
      expect(envelope.error).toContain('--exit-within-ms')
      expect(envelope.error).toContain(JSON.stringify(value))
      expect(existsSync(world.log), 'the stand-in was started').toBe(false)
      expect(readdirSync(world.tmp)).toEqual(['somebody-elses-file'])
    }
  })

})
