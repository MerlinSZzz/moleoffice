// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHECK RECORDS ITS MODEL'S STEPS, READ FROM OPENCODE'S OWN OUTPUT (wave 13n round AK, item 3p4).
 *
 * Until this round a check's session said nothing of what its model did between its start and its end. One function,
 * `theModelsSteps` in src/config/inspection-ending.mjs, now reads the tool calls out of the output OpenCode already
 * prints, which the check tool hands on in its model output line. It runs no model and asks nothing of the office.
 * Whatever ends a check writes its answer to the check's session as `theModelsSteps`: the message worker, and any other
 * program through tools/inspector-the-models-steps.mjs. On the session go
 *   1. how many tool calls the model made, their times added up, and how long at least one of them was running, since
 *      OpenCode runs calls at the same time;
 *   2. the ten longest, longest first, each with its tool, status, start, end and command;
 * and every call goes in a file in the check's out folder, which the session names. Not every call goes on the session:
 * the office tool returns at most 60,000 characters of a record, and one recorded check was already longer.
 * Each command is masked as every printed line is, and only then cut at 200 characters, so a cut never shows the part
 * of a value that the whole line would have masked. When nothing can be read the answer says why, and holds nothing else.
 *
 * THE FIXTURE IS A SAVED OPENCODE OUTPUT: tests/fixtures/a-models-steps holds one, and its README says where it came from
 * and what was cut out of it. The figures pinned below were worked out from that file by a separate program, not by the
 * function: 92 calls, 37,362 ms added up, 36,616 ms while at least one ran, and the ten longest.
 *
 * THE WORKER CASE runs a stand-in check tool, written by this test into a scratch folder, through the worker's real pass
 * and a real office in a scratch database. It prints the fixture as its model output line, and exits 3. No model runs and
 * nothing reaches the live office.
 *
 * MUTATIONS, each after a control run: the time while any ran taken as the sum; the longest in the wrong order, or eleven
 * of them; the cut made before the mask, or in UTF-16 units; no mask; a call that ended in an error left out; every
 * tool's input given as JSON, a bash command too; a line that is not JSON skipped; another runtime's output read as
 * OpenCode's; the tool writing no file; the worker writing no field. Each turns a case red.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { inspectionUsageLine } from '../src/config/usage.mjs'
import { A_COMMANDS_CHARACTERS_KEPT, THE_LONGEST_STEPS_NAMED, THE_MODELS_STEPS_FILE, maskedAsAPrintedLine, theModelsSteps } from '../src/config/inspection-ending.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const FIXTURE = readFileSync(join(REPO, 'tests/fixtures/a-models-steps/opencode-output.jsonl'), 'utf8')
const made: string[] = []

function scratch(what: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `models-steps-${what}-`)))
  made.push(dir)
  return dir
}

afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

/** What the check tool prints when its model ran in OpenCode: the model output line, holding OpenCode's own output. */
function saidByACheck(output: string): string {
  return `Synthetic check tool output.\n${inspectionUsageLine('opencode', output)}\n`
}

/** One tool call as OpenCode prints it, made up for a case. */
function aCall(tool: string, input: Record<string, unknown>, start: number, end: number, status = 'completed'): string {
  return JSON.stringify({ type: 'tool_use', timestamp: end, sessionID: 'ses_synthetic', part: { type: 'tool', tool, callID: 'call_synthetic',
    state: { status, input, time: { start, end } }, id: 'prt_synthetic', sessionID: 'ses_synthetic', messageID: 'msg_synthetic' } })
}

/** The tool calls of the fixture, in the order OpenCode printed them, read here without the function under test. */
const THE_FIXTURES_CALLS = FIXTURE.split('\n').filter((line) => line !== '').map((line) => JSON.parse(line) as { type: string; part: {
  tool: string; state: { status: string; input: Record<string, unknown>; time: { start: number; end: number } } } }).filter((event) => event.type === 'tool_use')

const iso = (ms: number): string => new Date(ms).toISOString()

describe('the tool calls in a saved OpenCode output', () => {
  const folder = scratch('fixture')
  const answer = theModelsSteps({ said: saidByACheck(FIXTURE), folder })

  it('counts every call, adds up their times, and gives how long at least one of them was running', () => {
    expect(THE_FIXTURES_CALLS).toHaveLength(92)
    expect(answer).toMatchObject({ count: 92, totalMs: 37_362, whileAnyRanMs: 36_616 })
    expect(answer.says).toBe("OpenCode's output holds 92 tool calls by the model. Their times add up to 37.4 seconds. At least one of them was running for 36.6 seconds. longest holds the 10 longest, longest first. The file holds all 92, in the order OpenCode printed them.")
  })

  it('names the ten longest, longest first, each with its tool, start, end and command', () => {
    expect(THE_LONGEST_STEPS_NAMED).toBe(10)
    // [the call's place in the order OpenCode printed them, from 0; its tool; its milliseconds; its start, on 17 October 2026 UTC]
    const TEN = [
      [62, 'bash', 8653, '16:13:49.024Z'],
      [17, 'mole_office_office_request', 3029, '16:09:00.423Z'],
      [91, 'mole_office_office_request', 2571, '16:17:16.481Z'],
      [4, 'mole_office_office_request', 1979, '16:08:33.612Z'],
      [90, 'mole_office_office_request', 1886, '16:17:05.671Z'],
      [1, 'mole_office_office_request', 1726, '16:08:29.422Z'],
      [54, 'bash', 1360, '16:12:53.586Z'],
      [56, 'bash', 1336, '16:13:13.159Z'],
      [60, 'bash', 1244, '16:13:37.095Z'],
      [44, 'bash', 1218, '16:12:15.538Z'],
    ] as const
    expect(answer.longest?.map((one) => [one.tool, one.ms, one.start])).toEqual(TEN.map(([, tool, ms, start]) => [tool, ms, `2026-10-17T${start}`]))
    expect(answer.longest?.[0]).toEqual({ tool: 'bash', status: 'completed', start: '2026-10-17T16:13:49.024Z', end: '2026-10-17T16:13:57.677Z', ms: 8653,
      command: 'OUT=~/.cache/mole-office/sandboxes/w13n/out/w13n-no-answer-go; npx tsc --noEmit -p . > "$OUT/tsc.log" 2>&1; echo "tsc exit=$?"; tail -5 "$OUT/tsc.log"' })
    // A call that is not bash has no command line, so its command is the tool's name and its input as JSON.
    expect(answer.longest?.[5]?.command).toBe('mole_office_office_request {"method":"GET","path":"/api/project/bootstrap"}')
    const file = JSON.parse(readFileSync(join(folder, THE_MODELS_STEPS_FILE), 'utf8')) as { steps: unknown[] }
    for (const [place] of TEN) expect(answer.longest).toContainEqual(file.steps[place])
  })

  it('writes every call to the file in the check\'s folder, in the order OpenCode printed them, and names the file', () => {
    expect(THE_MODELS_STEPS_FILE).toBe('the-models-steps.json')
    expect(answer.file).toBe(join(folder, 'the-models-steps.json'))
    const file = JSON.parse(readFileSync(answer.file!, 'utf8')) as { count: number; totalMs: number; whileAnyRanMs: number; steps: { tool: string; status: string; start: string; end: string; ms: number }[] }
    expect(file).toMatchObject({ count: 92, totalMs: 37_362, whileAnyRanMs: 36_616 })
    expect(file.steps.map((one) => [one.tool, one.status, one.start, one.end, one.ms])).toEqual(THE_FIXTURES_CALLS.map(({ part }) =>
      [part.tool, part.state.status, iso(part.state.time.start), iso(part.state.time.end), part.state.time.end - part.state.time.start]))
  })

  it('counts a call that ended in an error as one of them', () => {
    const file = JSON.parse(readFileSync(answer.file!, 'utf8')) as { steps: { tool: string; status: string; ms: number }[] }
    expect(file.steps.filter((one) => one.status !== 'completed')).toEqual([expect.objectContaining({ tool: 'grep', status: 'error', ms: 20 })])
    expect(file.steps[20]).toMatchObject({ tool: 'grep', status: 'error' })
  })

  it('keeps the session short: what goes on it is a summary, and the calls are in the file', () => {
    expect(JSON.stringify(answer).length).toBeLessThan(6_000)
    expect(readFileSync(answer.file!, 'utf8').length).toBeGreaterThan(JSON.stringify(answer).length * 3)
  })
})

describe('each command is masked, then cut at 200 characters', () => {
  const folder = scratch('masked')

  it('cuts a long command at 200 characters and says how many it left out', () => {
    expect(A_COMMANDS_CHARACTERS_KEPT).toBe(200)
    const longest = theModelsSteps({ said: saidByACheck(FIXTURE), folder }).longest!
    const whole = THE_FIXTURES_CALLS[56]!.part.state.input['command'] as string
    expect(whole).toHaveLength(431)
    expect(longest[7]).toMatchObject({ command: whole.slice(0, 200), leftOut: 231 })
    expect(longest.filter((one) => 'leftOut' in one).map((one) => one.ms)).toEqual([1360, 1336, 1244, 1218])
  })

  it('cuts on a whole letter, so a letter outside the basic plane counts as one', () => {
    const said = saidByACheck(aCall('bash', { command: `${'a'.repeat(199)}😀😀` }, 1_000, 2_000))
    expect(theModelsSteps({ said, folder }).longest).toEqual([expect.objectContaining({ command: `${'a'.repeat(199)}😀`, leftOut: 1 })])
  })

  it('masks before it cuts, so a value the whole line would mask is not shown in part', () => {
    // Cut first, the 200 characters would end in "Bearer syn", which is no longer the shape of a bearer token.
    const said = saidByACheck(aCall('bash', { command: `${'x'.repeat(170)} -H "Authorization: Bearer synthetic0123456789abcdefghij"` }, 1_000, 2_000))
    const [one] = theModelsSteps({ said, folder }).longest!
    expect(one).toMatchObject({ command: `${'x'.repeat(170)} -H "Authorization: <a bearer `, leftOut: 18 })
  })

  it('masks a secret-shaped value in a bash command and in the input of another tool, on the session and in the file', () => {
    const said = saidByACheck([
      aCall('bash', { command: 'curl -H "Authorization: Bearer sk-ant-synthetic0123456789abcdefghij" https://example.invalid/x && OPENAI_API_KEY=sk-synthetic0123456789abcdefghijklmnop node run.mjs' }, 1_000, 4_000),
      aCall('mole_office_office_request', { method: 'POST', path: '/api/records', body: { title: 'Synthetic', data: { token: 'synthetic-value-123', apiKey: 'abc' } } }, 1_500, 3_000),
      aCall('read', { filePath: '/home/someone/work/a.txt' }, 3_000, 3_500),
      aCall('bash', { command: '  ssh someone@203.0.113.9 ls\n' }, 4_000, 4_100),
    ].join('\n'))
    const answer = theModelsSteps({ said, folder })
    expect(answer.longest?.map((one) => one.command)).toEqual([
      'curl -H "Authorization: <a bearer token, not shown>" https://example.invalid/x && OPENAI_API_KEY=<not shown> node run.mjs',
      'mole_office_office_request {"method":"POST","path":"/api/records","body":{"title":"Synthetic","data":{"token":<not shown>,"apiKey":<not shown>}}}',
      'read {"filePath":"~/work/a.txt"}',
      'ssh someone@<an address, not shown> ls',
    ])
    expect(answer).toMatchObject({ count: 4, totalMs: 5_100, whileAnyRanMs: 3_100 })
    for (const written of [JSON.stringify(answer), readFileSync(answer.file!, 'utf8')]) {
      for (const secret of ['sk-ant-synthetic', 'sk-synthetic', 'synthetic-value-123', '"abc"', '/home/someone', '203.0.113.9']) {
        expect(written, `${secret} came through`).not.toContain(secret)
      }
    }
    expect(maskedAsAPrintedLine('OPENAI_API_KEY=sk-synthetic0123456789abcdefghijklmnop')).toBe('OPENAI_API_KEY=<not shown>')
  })
})

describe('one call, no call, and nothing read', () => {
  it('says what one call and no call are, in words that fit them', () => {
    const one = theModelsSteps({ said: saidByACheck(aCall('read', { filePath: 'a.txt' }, 1_000, 1_250)), folder: scratch('one') })
    expect(one).toMatchObject({ count: 1, totalMs: 250, whileAnyRanMs: 250,
      says: "OpenCode's output holds 1 tool call by the model. It ran for 0.3 seconds, and longest holds it. The file holds it as well." })
    const none = theModelsSteps({ said: saidByACheck('{"type":"step_start","timestamp":1}\n{"type":"text","timestamp":2}'), folder: scratch('none') })
    expect(none).toMatchObject({ count: 0, totalMs: 0, whileAnyRanMs: 0, longest: [],
      says: "OpenCode's output holds no tool call by the model, so longest is empty. The file holds an empty list." })
    expect(JSON.parse(readFileSync(none.file!, 'utf8'))).toEqual({ count: 0, totalMs: 0, whileAnyRanMs: 0, steps: [] })
  })

  it.each([
    ['nothing kept the output', null, "Nothing kept the check tool's output, so no tool call of its model was read."],
    ['the tool printed no model output line', 'Synthetic check tool output with no model line.\n',
      'The check tool printed no model output line, so its model did not run, or the check ended before the tool printed the line.'],
    ['the model ran in another runtime', `${inspectionUsageLine('claude-code', '{"type":"result","result":"Synthetic"}')}\n`,
      "This check's model ran in claude-code. Only OpenCode's output is read for tool calls, so none was read."],
    ['the model output line is not JSON', 'INSPECTION-MODEL-OUTPUT {"runtime":"opencode",\n',
      "The check tool's model output line could not be read, so no tool call was read: The check tool printed an inspection output line that is not JSON."],
    ['a call has no end time', saidByACheck(`${aCall('read', {}, 1, 2)}\n${aCall('bash', { command: 'ls' }, 5, 6).replace('"end":6', '"end":null')}`),
      "OpenCode's output holds a tool call that could not be read, so none was counted. Tool call 2 has no end time."],
    ['a call ends before it starts', saidByACheck(aCall('bash', { command: 'ls' }, 9, 6)),
      "OpenCode's output holds a tool call that could not be read, so none was counted. Tool call 1 ends before it starts."],
    ['a line is cut short', saidByACheck(`${aCall('read', {}, 1, 2)}\n{"type":"tool_use","timestamp":3,"part":{"tool":"ba`),
      "1 line of OpenCode's output starts with { and is not JSON. It may have been a tool call, so none was counted."],
  ])('says why when %s, and writes no file', (_when, said, says) => {
    const folder = scratch('nothing')
    expect(theModelsSteps({ said, folder })).toEqual({ says })
    expect(readdirSync(folder)).toEqual([])
  })

  it('keeps the summary and says so when the file cannot be written', () => {
    const folder = join(scratch('no-folder'), 'not-there')
    const answer = theModelsSteps({ said: saidByACheck(FIXTURE), folder })
    expect(answer).toMatchObject({ count: 92, totalMs: 37_362, whileAnyRanMs: 36_616 })
    expect(answer.longest).toHaveLength(10)
    expect('file' in answer).toBe(false)
    expect(answer.says).toBe(`OpenCode's output holds 92 tool calls by the model. Their times add up to 37.4 seconds. At least one of them was running for 36.6 seconds. longest holds the 10 longest, longest first. The file ${join(folder, 'the-models-steps.json')} could not be written (ENOENT), so only this summary is kept.`)
    expect(existsSync(folder)).toBe(false)
  })
})

describe('the same answer from tools/inspector-the-models-steps.mjs', () => {
  const TOOL = join(REPO, 'tools/inspector-the-models-steps.mjs')

  it('prints what the function gives, as JSON, and writes the same file into the folder it is named', () => {
    const dir = scratch('tool')
    const said = join(dir, 'said.txt')
    writeFileSync(said, saidByACheck(FIXTURE))
    const byTheTool = join(dir, 'by-the-tool'); mkdirSync(byTheTool)
    const byTheFunction = join(dir, 'by-the-function'); mkdirSync(byTheFunction)
    const printed = JSON.parse(execFileSync(process.execPath, [TOOL, '--said', said, '--folder', byTheTool], { encoding: 'utf8' })) as Record<string, unknown>
    const answer = theModelsSteps({ said: readFileSync(said, 'utf8'), folder: byTheFunction })
    expect(printed).toEqual({ ...answer, file: join(byTheTool, THE_MODELS_STEPS_FILE) })
    expect(readFileSync(join(byTheTool, THE_MODELS_STEPS_FILE), 'utf8')).toBe(readFileSync(join(byTheFunction, THE_MODELS_STEPS_FILE), 'utf8'))
  })

  it('takes a missing --said as nothing kept, and refuses a missing --folder or a --said file that is not there', () => {
    const dir = scratch('tool-refuses')
    const printed = execFileSync(process.execPath, [TOOL, '--folder', dir], { encoding: 'utf8' })
    expect(JSON.parse(printed)).toEqual(theModelsSteps({ said: null, folder: dir }))
    const noFolder = spawnSync(process.execPath, [TOOL], { encoding: 'utf8' })
    expect(noFolder.status).toBe(2)
    expect(noFolder.stdout).toBe('')
    expect(noFolder.stderr).toContain('--folder')
    const notThere = spawnSync(process.execPath, [TOOL, '--said', join(dir, 'not-there.txt'), '--folder', dir], { encoding: 'utf8' })
    expect(notThere.status).toBe(2)
    expect(notThere.stdout).toBe('')
    expect(notThere.stderr).toContain('not-there.txt')
    expect(readdirSync(dir)).toEqual([])
  })
})

describe('the worker writes it on a check, and the office declares it', () => {
  let t: TestDb
  let app: FastifyInstance
  let settings: WorkerSettings
  let tree: string
  let line: string
  const watching: Parameters<typeof onePass>[1] = []
  const as = (type: 'agent' | 'human', id: string) => ({ 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': type, 'x-mole-office-actor-id': id })
  const person = as('human', THE_PERSON)
  const worker = as('agent', 'worker-w')
  async function call(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown, headers = person) {
    const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
    return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
  }
  function git(...args: string[]): string { return execFileSync('git', ['-C', tree, ...args], { encoding: 'utf8' }).trim() }
  function aRun(title: string): string {
    return t.api.createRecord({ kind: 'session', title, workspaceId: 'default', origin: 'fixture', actor: { type: 'agent', id: 'worker-w' },
      data: { state: 'running', servingAgent: 'worker-w', workingDirectory: tree, cutFrom: 'main', doing: 'Synthetic fixture changes work/a.txt.' } }).id
  }

  beforeAll(async () => {
    t = await freshDb()
    app = (await apiApp()).app
    await app.listen({ host: '127.0.0.1', port: 0 })
    for (const [headers, data] of [
      [person, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' }],
      [person, { handle: 'inspector-one', name: 'Synthetic Inspector', role: 'inspector' }],
      [person, { handle: 'super-r', name: 'Synthetic Supervisor', role: 'supervisor' }],
      [as('agent', 'super-r'), { handle: 'worker-w', name: 'Synthetic Worker', role: 'worker', workArea: ['work'] }],
    ] as const) {
      const registered = await call('POST', '/api/agents/started', data, headers)
      expect(registered.status, registered.raw).toBe(201)
    }
    tree = scratch('tree')
    git('init', '-q', '-b', 'main'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'Synthetic models-steps fixture')
    mkdirSync(join(tree, 'work')); writeFileSync(join(tree, 'work/a.txt'), 'Synthetic before.\n')
    git('add', '.'); git('commit', '-q', '-m', 'Synthetic baseline'); git('switch', '-q', '-c', 'work')
    writeFileSync(join(tree, 'work/a.txt'), 'Synthetic after.\n'); git('commit', '-q', '-am', 'Synthetic work')
    // A STAND-IN CHECK TOOL: it prints the saved OpenCode output as its model output line, as tools/the-inspector.mjs does
    // after OpenCode ends, and exits 3. It runs no model and writes no verdict.
    line = join(scratch('line'), 'model-output-line.txt')
    writeFileSync(line, saidByACheck(FIXTURE))
    const tool = join(scratch('tool'), 'a-check-whose-model-ran-in-opencode.mjs')
    writeFileSync(tool, `import { readFileSync } from 'node:fs'\nprocess.stdout.write(readFileSync(${JSON.stringify(line)}, 'utf8'))\nprocess.exitCode = 3\n`)
    settings = { api: `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`, workspace: 'default', session: null, stopWithPid: null,
      checkout: aCheckoutForATestRun(), runs: 9, hops: 3, outputRoot: scratch('output'), env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_INSPECTION_TOOL: tool,
        MOLE_OFFICE_FAKE_RUNTIME: join(process.cwd(), 'tests/fake-runtime.mjs'), MOLE_OFFICE_INSPECTION_MODEL: 'sonnet' } }
  }, 60_000)

  afterAll(async () => {
    for (const r of watching) if (r.adapter.alive(r.handle)) r.adapter.stop(r.handle, 'Synthetic models-steps test ended.')
    await app?.close(); t?.close()
  }, 60_000)

  // ONLY A CHECK THAT CRASHED IS DRIVEN HERE: an answered check needs a verdict filed through the check door, which this
  // stand-in does not file. The worker reads the steps the same way for either ending.
  it("writes theModelsSteps on the check's session, and the file in the check's out folder", async () => {
    const run = aRun('Synthetic run whose check prints its model output')
    const ended = await call('PATCH', `/api/records/${run}`, { dataPatch: { state: 'finished' } }, worker)
    expect(ended.status, ended.raw).toBe(200)
    const check = () => t.api.getRecord(run)!.data['theCheck'] as { message?: string; execution?: { session: string } }
    if (!check().message) {
      const asked = await call('POST', `/api/checks/${run}/ask-again`, {}, person)
      expect(asked.status, asked.raw).toBe(200)
    }
    const pass = await onePass(settings, watching)
    const session = check().execution?.session
    expect(pass.started.some((one) => one.session === session), JSON.stringify(pass)).toBe(true)
    const started = watching.find((one) => one.session === session)!
    const until = Date.now() + 15_000
    while (started.adapter.alive(started.handle) && Date.now() < until) await new Promise((r) => setTimeout(r, 25))
    expect(started.adapter.alive(started.handle), 'the stand-in check tool did not end').toBe(false)
    await onePass(settings, watching)
    const data = t.api.getRecord(session!)!.data
    expect(data['state']).toBe('crashed')
    const elsewhere = scratch('elsewhere')
    const expected = theModelsSteps({ said: readFileSync(line, 'utf8'), folder: elsewhere })
    const file = join(settings.outputRoot, session!, THE_MODELS_STEPS_FILE)
    expect(data['theModelsSteps']).toEqual({ ...expected, file })
    expect(readFileSync(file, 'utf8')).toBe(readFileSync(join(elsewhere, THE_MODELS_STEPS_FILE), 'utf8'))
    expect(data['theModelsSteps']).toMatchObject({ count: 92, totalMs: 37_362, whileAnyRanMs: 36_616 })
  }, 60_000)

  it('declares the field on the session kind and its two shapes, in GET /api/kinds/session', async () => {
    const kinds = await call('GET', '/api/kinds/session')
    expect(kinds.status, kinds.raw).toBe(200)
    const field = (kinds.body['kind'] as { fields: { key: string; type: string; required: boolean }[] }).fields.find((one) => one.key === 'theModelsSteps')
    expect(field).toMatchObject({ type: 'ModelSteps', required: false })
    const shapes = kinds.body['shapes'] as { name: string; fields: { key: string; type: string; required: boolean }[] }[]
    const shape = (name: string) => shapes.find((one) => one.name === name)?.fields.map((one) => [one.key, one.type, one.required])
    expect(shape('ModelSteps')).toEqual([
      ['says', 'string', true],
      ['count', 'number', false],
      ['totalMs', 'number', false],
      ['whileAnyRanMs', 'number', false],
      ['longest', 'ModelStep[]', false],
      ['file', 'string', false],
    ])
    expect(shape('ModelStep')).toEqual([
      ['tool', 'string', true],
      ['status', 'string', true],
      ['start', 'string', true],
      ['end', 'string', true],
      ['ms', 'number', true],
      ['command', 'string', true],
      ['leftOut', 'number', false],
    ])
  })

  // EACH ANSWER ON A SESSION OF ITS OWN: a dataPatch merges into an answer already stored, so a second answer over a first
  // would keep the keys of the first that it does not hold. Whatever ends a check writes the field once.
  it('stores every kind of answer the function gives, and refuses a call whose time is not a number', async () => {
    const answers = [
      theModelsSteps({ said: saidByACheck(FIXTURE), folder: scratch('stored') }),
      theModelsSteps({ said: saidByACheck(FIXTURE), folder: join(scratch('stored'), 'not-there') }),
      theModelsSteps({ said: saidByACheck(''), folder: scratch('stored') }),
      theModelsSteps({ said: null, folder: scratch('stored') }),
      theModelsSteps({ said: saidByACheck(aCall('bash', { command: 'ls' }, 9, 6)), folder: scratch('stored') }),
    ]
    expect(answers.map((one) => [one.count ?? 'absent', one.longest?.length ?? 'absent', 'file' in one])).toEqual([
      [92, 10, true], [92, 10, false], [0, 0, true], ['absent', 'absent', false], ['absent', 'absent', false],
    ])
    for (const [n, steps] of answers.entries()) {
      const run = aRun(`Synthetic session ${String(n + 1)} that holds its model's steps`)
      const stored = await call('PATCH', `/api/records/${run}`, { dataPatch: { theModelsSteps: steps } }, worker)
      expect(stored.status, stored.raw).toBe(200)
      expect(t.api.getRecord(run)!.data['theModelsSteps']).toEqual(steps)
    }
    const run = aRun("Synthetic session that is given a call whose time is not a number")
    const steps = answers[0]!
    const refused = await call('PATCH', `/api/records/${run}`, { dataPatch: { theModelsSteps: { ...steps, longest: [{ ...steps.longest![0]!, ms: 'long' }] } } }, worker)
    expect(refused.status, refused.raw).toBe(400)
    expect(refused.raw).toContain('theModelsSteps.longest[0].ms')
  })
})
