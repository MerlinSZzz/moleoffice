// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** CLI harness and secret boundaries stay end to end; native parsers and command builders read their actual source. No model runs. */
import { randomUUID } from 'node:crypto'
import { chmodSync, existsSync, linkSync, mkdirSync, symlinkSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { aCommandsStartValues, aCodexTierWarning } from '../tools/sandbox-common.mjs'
import { LAUNCHER_MODEL_COMPATIBILITY, THE_RUNTIMES_FAST_MODE, withoutTheProvider } from '../src/config/model-efforts.mjs'
import { HOW_EACH_COMMAND_TAKES_AN_EFFORT } from '../src/config/how-a-command-takes-an-effort.mjs'
import { afterEach, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { readLauncherSelection } from '../src/config/launcher-selection.mjs'
import { TRACED_HOW } from '../src/shared/releasing.ts'
import { inspectionUsageIn, inspectionUsageReceipt, jsonLines, theReceiptWrittenOver } from '../src/config/usage.mjs'
import { aLoginForTheModel, runInside, OPENCODE_CHECK_ENV } from '../tools/inspector-sandbox.mjs'
import { FULL_PERMISSIONS } from '../src/config/run-permissions.mjs'
import { aCommandWithTheHarnessFeaturesOff } from '../tools/harness-features-off.mjs'
import { inspectorViewStandIn } from './inspector-view-stand-in.ts'
import { inspectorFixture, INSPECTOR_VERIFICATION_PROBE } from './inspector-tool-fixture.ts'

const WORKSPACE = 'default'
const codexIsFast = THE_RUNTIMES_FAST_MODE.codex
const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE }
const AS_THE_INSPECTOR = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'inspector-one', 'x-mole-office-workspace': WORKSPACE }

type Fixture = Awaited<ReturnType<typeof inspectorFixture>>
type Runtime = 'claude-code' | 'codex'
let f: Fixture | null = null
afterEach(async () => { await f?.close(); f = null })
const THREAD = '01234567-89ab-cdef-0123-456789abcdef'
const OTHER_THREAD = '12345678-89ab-cdef-0123-456789abcdef'
const RELEASE = { verdict: 'released', check: 'Synthetic check: the requested file write was refused.', chaptersRead: [],
  traced: [{ paths: ['work'], to: 'syntheticAuthority', how: TRACED_HOW[0], said: 'Synthetic authority.' }] }

/**
 * The existing inspector fixture pattern reads actual function declarations without importing
 * the CLI, whose top level starts work. Nothing in shipped code changes for this fixture.
 * Its stand-in top level has no selection, as an older office gives none, so a command is the
 * compatibility list's. It names no provider row either, as whatTheOfficeGivesTheCheck gives
 * `provider: null` when the office names none.
 */
const nativeSource = readFileSync(join(process.cwd(), 'tools/the-inspector.mjs'), 'utf8')
function nativeReaders(runtime: Runtime | 'opencode', over: Record<string, unknown> = {}) {
  const model = runtime === 'codex' ? 'openai/gpt-6.1-sol' : 'anthropic/claude-opus-5-5'
  const errors: string[] = []
  const saved = { runtime, model, run: 'synthetic-run', check: 'native-check', session: THREAD, seal: null, sealHash: null }
  const names = ['theChecksCommand', 'theModelsAnswer', 'theEnvelopeIn', 'checkFrom',
    'theLastFencedObjectIn', 'theVerdictIn', 'theLastObjectIn', 'theRetainedModelState',
    'stoppedByTheClockSays', 'whatTheOfficeGivesTheCheck']
  const definitions = names.map(name => {
    const found = nativeSource.indexOf(`function ${name}(`)
    if (found < 0) throw new Error(`No inspector function ${name}.`)
    const start = nativeSource.slice(found - 6, found) === 'async ' ? found - 6 : found
    const end = nativeSource.indexOf('\n}\n', found) + 3
    if (end < 3) throw new Error(`No end of inspector function ${name}.`)
    return nativeSource.slice(start, end)
  })
  for (const name of ['isAVerdict', 'WHAT_A_VERDICT_HAS']) {
    const line = nativeSource.split('\n').find(one => one.startsWith(`const ${name} =`))
    if (line === undefined) throw new Error(`No inspector declaration ${name}.`)
    definitions.push(line)
  }
  const context = { RUNTIME: runtime, MODEL: model, SELECTION: null, EFFORT: { effort: 'xhigh' }, GIVEN: { effortFrom: 'Casting', provider: null },
    THE_MODEL_SESSION: THREAD, SANDBOX: null, MADE_A_WORKTREE: null, WHERE: '/synthetic/work',
    FULL_PERMISSIONS, aCommandsStartValues, withoutTheProvider, OPENCODE_CHECK_ENV, HOW_EACH_COMMAND_TAKES_AN_EFFORT,
    aCommandWithTheHarnessFeaturesOff, theRecordsFolder: () => '/synthetic/records', jsonLines, aCodexTierWarning,
    RUN_LIMIT_MS: 900, chosen: { as: 'synthetic-inspector', run: 'synthetic-run', onTheHost: true, model: null },
    CHECK_ID: 'native-check', reads: { submission: null }, theModelStateFile: () => '/synthetic/model-state',
    readFileSync: () => JSON.stringify(saved), ask: async () => ({ runtime, model, effort: 'xhigh' }),
    process: { stderr: { write: (said: string) => errors.push(said) }, stdout: { write: () => {} },
      exit: (code: number) => { throw new Error(`Synthetic CLI exit ${code}`) } }, ...over }
  const read = runInNewContext(`${definitions.join('\n')}\n;({${names.join(',')}})`, context)
  return { read, errors, model, saved }
}

/** Native output with a tool event holding a verdict, which must never supply the answer. */
function nativeOutput(runtime: Runtime, text = JSON.stringify(RELEASE), options: { failure?: boolean; n?: number; tierWarning?: boolean } = {}) {
  const n = options.n ?? 1
  if (runtime === 'claude-code') return JSON.stringify({ type: 'result', session_id: THREAD, result: text,
    is_error: options.failure ?? false, usage: { input_tokens: 11, output_tokens: 3 }, modelUsage: { 'claude-opus-5-5': {} } })
  return [
    { type: 'thread.started', thread_id: THREAD },
    { type: 'item.completed', item: { type: 'command_execution', aggregated_output: JSON.stringify(RELEASE) } },
    { type: 'item.completed', item: { type: 'agent_message', text } },
    { type: 'turn.completed', usage: { input_tokens: 11 * n, cached_input_tokens: 2 * n, output_tokens: 3 * n } },
    ...(options.tierWarning ? [{ type: 'error', message: 'Configured service tier `fast` is not advertised as supported for model `gpt-6.1-sol` and will be omitted from requests.' }] : []),
    ...(options.failure ? [{ type: 'turn.failed', error: { message: 'Synthetic native failure' } }] : []),
  ].map(event => JSON.stringify(event)).join('\n')
}

/**
 * A synthetic check. `first` is what the model answers on its first run and `second` on every run after it; `answers`, when
 * given, is what each run answers in order, and a run past its end answers as `second` does.
 */
async function setup(runtime: Runtime, options: { first?: string; second?: string; answers?: string[]; failure?: boolean; timeout?: boolean; wrongThread?: boolean; tierWarning?: boolean } = {}) {
  f = await inspectorFixture()
  const fixture = f
  fixture.state.checkModel = { runtime, model: runtime === 'codex' ? 'openai/gpt-6.1-sol' : 'anthropic/claude-opus-5-5', variant: 'xhigh', effort: 'xhigh', effortFrom: 'Casting' }
  fixture.state.modelPrompt = 'Synthetic host request: WRITE FILE forbidden.txt in this checkout, delete work, and commit the change.'
  fixture.state.reading.reports = [{ id: 'native-proof-record', title: 'Synthetic native proof' }]
  fixture.state.records['native-proof-record'] = { status: 200, body: { record: { id: 'native-proof-record', kind: 'report', title: 'Synthetic native proof' } } }
  const original = { bytes: readFileSync(join(fixture.checkout, 'work'), 'utf8'), tip: fixture.git('rev-parse', 'HEAD'), status: fixture.git('status', '--porcelain') }
  fixture.state.records['native-check'] = { status: 200, body: { record: { kind: 'session', data: { runtime: 'inspection-tool' } } } }
  const bin = join(fixture.home, 'bin')
  const runs = join(fixture.home, 'model-runs')
  mkdirSync(bin); mkdirSync(runs)
  const script = `#!${process.execPath}
// Synthetic harness. It evaluates the received permissions; it starts no model.
import * as fs from 'node:fs'
import * as path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
${INSPECTOR_VERIFICATION_PROBE}
const argv = process.argv.slice(2), program = path.basename(process.argv[1])
let prompt = ''
process.stdin.on('data', chunk => { prompt += chunk })
process.stdin.on('end', () => {
  const n = fs.readdirSync(${JSON.stringify(runs)}).length
  const flag = name => argv[argv.indexOf(name) + 1]
  const readonly = program === 'claude'
    ? flag('--tools') === 'Read,Glob,Grep' && flag('--permission-mode') === 'dontAsk' && argv.includes('--strict-mcp-config') && flag('--mcp-config') === '{"mcpServers":{}}'
    : flag('-s') === 'read-only' && flag('-a') === 'never' && argv.includes('sandbox_mode="read-only"') && argv.includes('approval_policy="never"')
  const askedToWrite = prompt.includes('WRITE FILE')
  if (askedToWrite && !readonly) fs.writeFileSync(path.join(process.cwd(), 'forbidden.txt'), 'Synthetic unauthorized write')
  const proof = verificationProbe(program, argv, path.join(process.cwd(), 'work'),
    [${JSON.stringify(join(fixture.pathFor('native-check') + '-records', 'native-proof-record.json'))}],
    [${JSON.stringify(join(fixture.checkout, 'work'))}, ${JSON.stringify(join(fixture.home, 'office-data', 'record.json'))}])
  fs.writeFileSync(path.join(${JSON.stringify(runs)}, n + '.json'), JSON.stringify({ program, argv, prompt, proof, cwd: process.cwd(), refusedWrite: askedToWrite && readonly, effort: process.env.CLAUDE_CODE_EFFORT_LEVEL ?? null }))
  const text = ${JSON.stringify(options.answers ?? [])}[n] ?? (n === 0 ? ${JSON.stringify(options.first ?? JSON.stringify(RELEASE))} : ${JSON.stringify(options.second ?? JSON.stringify(RELEASE))})
  const thread = n > 0 && ${Boolean(options.wrongThread)} ? ${JSON.stringify(OTHER_THREAD)} : ${JSON.stringify(THREAD)}
  if (program === 'claude') process.stdout.write(JSON.stringify({ type: 'result', session_id: thread, result: text, is_error: ${Boolean(options.failure)}, usage: { input_tokens: 11, output_tokens: 3 }, modelUsage: { 'claude-opus-5-5': {} } }))
  else {
    const events = [{ type: 'thread.started', thread_id: thread },
      { type: 'item.completed', item: { type: 'command_execution', aggregated_output: ${JSON.stringify(JSON.stringify(RELEASE))} } },
      { type: 'item.completed', item: { type: 'agent_message', text } },
      { type: 'turn.completed', usage: { input_tokens: 11 * (n + 1), cached_input_tokens: 2 * (n + 1), output_tokens: 3 * (n + 1) } }]
    if (${Boolean(options.tierWarning)}) events.push({ type: 'error', message: ${JSON.stringify('Configured service tier `fast` is not advertised as supported for model `gpt-6.1-sol` and will be omitted from requests.')} })
    if (${Boolean(options.failure)}) events.push({ type: 'turn.failed', error: { message: 'Synthetic native failure' } })
    process.stdout.write(argv.includes('--json') ? events.map(event => JSON.stringify(event)).join('\\n') + '\\n' : text)
  }
  if (${Boolean(options.timeout)}) setTimeout(() => {}, 60000)
  else process.exit(${options.failure ? 1 : 0})
})
`
  for (const name of ['claude', 'codex', 'dsh', 'opencode']) { writeFileSync(join(bin, name), script); chmodSync(join(bin, name), 0o755) }
  const posts: Record<string, any>[] = []
  fixture.state.onRequest = (request, reply) => {
    if (request.method !== 'POST' || request.url !== `/api/checks/${fixture.run}`) return false
    let raw = ''
    request.on('data', part => { raw += part })
    request.on('end', () => {
      posts.push(JSON.parse(raw)); reply.statusCode = 201
      reply.end(JSON.stringify({ verdict: 'released', toTheWorker: 'Synthetic.', toTheStarter: '', group: null }))
    })
    return true
  }
  return { fixture, posts, original, runs: () => readdirSync(runs).sort().map(file => JSON.parse(readFileSync(join(runs, file), 'utf8'))),
    inspect: (flags: string[] = []) => fixture.inspect(['--check', 'native-check', ...flags], { HOME: fixture.home, PATH: `${bin}:${process.env.PATH}`, CLAUDE_CODE_EFFORT_LEVEL: 'inherited-setting' }, true) }
}

for (const runtime of ['claude-code', 'codex'] as const) describe(`the inspector on ${runtime}`, () => {
  it('uses the Casting harness and shared effort values, and its stand-in refuses a prompted file write', async () => {
    const check = await setup(runtime)
    const ran = await check.inspect()
    expect(ran.code, ran.err).toBe(0)
    const run = check.runs()[0]!
    expect(run.program).toBe(runtime === 'codex' ? 'codex' : 'claude')
    expect(run.refusedWrite).toBe(true)
    expect(run.proof.nativeWriteContract).toBe(false)
    expect(run.proof.shellOutput).toBeNull()
    expect(run.proof.restored).toBe(true)
    expect(existsSync(join(run.cwd, 'forbidden.txt'))).toBe(false)
    expect(readFileSync(join(check.fixture.checkout, 'work'), 'utf8')).toBe('After\n')
    if (runtime === 'codex') {
      expect(run.proof.nativeReadOnlyContract).toBe(true)
      expect(run.proof.outside.map((one: { decision: string }) => one.decision)).toEqual(['native-contract-refusal', 'native-contract-refusal'])
      expect(run.argv).toContain('gpt-6.1-sol')
      expect(run.argv).toContain('model_reasoning_effort=xhigh')
      expect(run.argv.includes('service_tier=fast')).toBe(codexIsFast)
    } else { expect(run.argv).toContain('claude-opus-5-5'); expect(run.effort).toBe('xhigh') }
    expect(run.proof.opened).toEqual([{ file: join(check.fixture.pathFor('native-check') + '-records', 'native-proof-record.json'), id: 'native-proof-record', kind: 'report', data: null }])
    expect({ bytes: readFileSync(join(check.fixture.checkout, 'work'), 'utf8'), tip: check.fixture.git('rev-parse', 'HEAD'), status: check.fixture.git('status', '--porcelain') }).toEqual(check.original)
    expect(check.posts).toHaveLength(1)
    const native = inspectionUsageIn(ran.out)
    expect(native?.runtime).toBe(runtime)
    expect(inspectionUsageReceipt(native!)).toMatchObject({ inputTokens: 11, outputTokens: 3, runtime })
  })

  it('reads the native verdict and records native usage even when the model fails', async () => {
    const { read } = nativeReaders(runtime)
    const output = nativeOutput(runtime, JSON.stringify(RELEASE), { failure: true })
    const parsed = read.theModelsAnswer(output)
    expect(parsed.envelope.is_error).toBe(true)
    expect(read.theVerdictIn(parsed.envelope).verdict).toEqual(RELEASE)
    const receipt = inspectionUsageReceipt({ runtime, output })
    expect(receipt).toMatchObject({ runtime, inputTokens: 11, outputTokens: 3 })
    if (runtime === 'codex') { expect(receipt.cachedInputTokens).toBe(2); expect(receipt.costUsd).toBeUndefined() }
  })

  // Neither native answer may take a tool event for a verdict; the correction uses the same session.
  it('explains a missing verdict and never uses a tool event as a verdict', async () => {
    const { read } = nativeReaders(runtime)
    for (const text of ['Synthetic: I have no verdict.', 'Synthetic: I still have no verdict.']) {
      const parsed = read.theModelsAnswer(nativeOutput(runtime, text))
      const answer = read.theVerdictIn(parsed.envelope)
      expect(answer.verdict).toBeNull()
      expect(answer.why).toContain('it holds no JSON object that is a verdict')
    }
    expect(read.theChecksCommand(THREAD).command).toContain(THREAD)
  })

  it('corrects a malformed fenced verdict in the same native session with the same model, effort and permissions', async () => {
    const { read } = nativeReaders(runtime)
    const first = nativeOutput(runtime, '```json\n{"verdict":\n```')
    expect(read.theVerdictIn(read.theModelsAnswer(first).envelope)).toMatchObject({ verdict: null, fenced: true })
    const second = nativeOutput(runtime, JSON.stringify(RELEASE), { n: 2 })
    expect(read.theVerdictIn(read.theModelsAnswer(second).envelope).verdict).toEqual(RELEASE)
    const given = read.theChecksCommand(THREAD)
    expect(given.command).toContain(THREAD)
    expect(given.command).toContain(runtime === 'codex' ? 'gpt-6.1-sol' : 'claude-opus-5-5')
    expect(inspectionUsageReceipt({ runtime, output: first + '\n' + second })).toMatchObject({ inputTokens: 22, outputTokens: 6, runtime })
    if (runtime === 'codex') {
      const beforeResume = given.command.slice(0, given.command.indexOf('resume'))
      expect(beforeResume).toContain('model_reasoning_effort=xhigh')
      expect(beforeResume).toContain('sandbox_mode="read-only"')
      expect(beforeResume).toContain('approval_policy="never"')
    } else {
      expect(given.env.CLAUDE_CODE_EFFORT_LEVEL).toBe('xhigh')
      expect(given.command).toContain('dontAsk')
      expect(given.command).toContain('Read,Glob,Grep')
    }
  })

  it('stops a timed-out check and keeps its native usage without posting a verdict', async () => {
    const { read } = nativeReaders(runtime)
    expect(read.stoppedByTheClockSays()).toContain('was stopped by this tool, so nothing was written')
    const output = nativeOutput(runtime)
    expect(read.theModelsAnswer(output).envelope.session_id).toBe(THREAD)
    expect(inspectionUsageReceipt({ runtime, output })).toMatchObject({ inputTokens: 11, outputTokens: 3, runtime })
  })
})

it('refuses a correction that switches Codex threads', async () => {
  const { read } = nativeReaders('codex')
  expect(() => read.theChecksCommand(OTHER_THREAD)).toThrow('does not belong to this check')
})

it.each(['not-a-harness', null])('explicitly refuses unsupported or unnamed harness %s', async runtime => {
  const { read, errors } = nativeReaders('codex', { ask: async () => ({ runtime, model: 'openai/gpt-6.1-sol' }) })
  await expect(read.whatTheOfficeGivesTheCheck()).rejects.toThrow('Synthetic CLI exit 1')
  expect(errors.join('')).toContain('Supported inspector harnesses are claude-code, codex, opencode and dsh')
})

it.each(['runtime', 'model'] as const)('keeps the same check session and refuses a changed %s on retry', async field => {
  const reader = nativeReaders('codex')
  const saved = { ...reader.saved, [field]: field === 'runtime' ? 'claude-code' : 'openai/gpt-6-astra' }
  const { read } = nativeReaders('codex', { readFileSync: () => JSON.stringify(saved) })
  expect(() => read.theRetainedModelState()).toThrow('It cannot resume on')
})

it('resumes a retained Codex check in its own thread when the Casting pair stays the same', async () => {
  const { read } = nativeReaders('codex')
  const saved = read.theRetainedModelState()
  expect(saved.session).toBe(THREAD)
  const given = read.theChecksCommand(saved.session)
  expect(given.command).toContain('resume')
  expect(given.command).toContain(THREAD)
})

it('uses an existing sandbox Codex login, refuses its absence, and never copies a host Claude login for Codex', async () => {
  f = await inspectorFixture()
  const templateDir = join(f.home, 'template')
  const sandboxHome = join(f.home, 'sandbox-home')
  mkdirSync(templateDir); mkdirSync(sandboxHome)
  writeFileSync(join(templateDir, 'sandbox.json'), JSON.stringify({ template: 'Synthetic', secrets: { names: [] } }))
  const sandbox = { home: sandboxHome, templateDir, login: null }
  expect(() => aLoginForTheModel(sandbox, { runtime: 'codex', minutes: 1, home: f!.home })).toThrow('has no Codex login')
  mkdirSync(join(sandboxHome, '.codex'))
  writeFileSync(join(sandboxHome, '.codex', 'auth.json'), '{"synthetic":true}')
  expect(aLoginForTheModel(sandbox, { runtime: 'codex', minutes: 1, home: f.home })).toContain('Codex uses its sandbox login')
  expect(existsSync(join(sandboxHome, '.claude'))).toBe(false)
  expect(sandbox.login).toBeNull()
})

it('asks the sandbox launcher only for the selected harness secrets', async () => {
  const view = inspectorViewStandIn()
  try {
    for (const runtime of ['claude-code', 'codex']) {
      const argv = runtime === 'codex' ? ['codex', ...FULL_PERMISSIONS.codex!.args, 'exec', '--', 'synthetic task'] : ['synthetic-model']
      const ran = await runInside(view.sandbox, { runtime, label: runtime, cwd: view.work, argv, limitMs: 1000, launcher: view.launcher })
      expect(ran.code, ran.why ?? '').toBe(0)
    }
    const calls = view.calls.map(call => call.words)
    expect(calls[0]).toContain('CLAUDE_CODE_OAUTH_TOKEN')
    expect(calls[1]).toContain('CODEX_API_KEY')
    expect(calls[1]).toContain('OPENAI_API_KEY')
    expect(calls[1]).not.toContain('CLAUDE_CODE_OAUTH_TOKEN')
  } finally { view.close() }
})


it('reports the native Codex tier omission warning and keeps its verdict', async () => {
  const { read, errors } = nativeReaders('codex')
  const parsed = read.theModelsAnswer(nativeOutput('codex', JSON.stringify(RELEASE), { tierWarning: true }))
  expect(errors.join('')).toContain('Codex reported that model gpt-6.1-sol does not support service tier fast; the tier will be omitted from requests.')
  expect(parsed.envelope.is_error).toBe(false)
  expect(read.theVerdictIn(parsed.envelope).verdict).toEqual(RELEASE)
})


it('clears fields omitted by the native receipt when storing the manual check patch', async () => {
  const fresh = inspectionUsageReceipt({ runtime: 'codex', output: nativeOutput('codex') })
  const patch = theReceiptWrittenOver({ costUsd: 9, reasoningTokens: 7, inputTokens: 99 }, fresh)
  expect(patch).toMatchObject({ runtime: 'codex', inputTokens: 11, outputTokens: 3, costUsd: null, reasoningTokens: null })
})


it('refuses OpenCode on the host in one sentence before starting a model', async () => {
  const { read, errors } = nativeReaders('codex', { ask: async () => ({ runtime: 'opencode', model: 'opencode-go/deepseek-v4.1-flash' }) })
  await expect(read.whatTheOfficeGivesTheCheck()).rejects.toThrow('Synthetic CLI exit 1')
  expect(errors.join('').trim()).toBe('OpenCode inspection requires the private per-check container view, so --on-the-host is refused.')
})

it('requires declared OPENCODE_API_KEY and refuses shared or private OpenCode auth-file seeds', async () => {
  f = await inspectorFixture()
  const templateDir = join(f.home, 'template'), sharedHome = join(f.home, 'shared'), privateHome = join(f.home, 'private')
  const secretFile = join(f.home, 'synthetic-secrets')
  mkdirSync(templateDir); mkdirSync(privateHome)
  writeFileSync(join(templateDir, 'sandbox.json'), JSON.stringify({ template: 'Synthetic', secrets: {
    hostFile: secretFile, names: [{ name: 'OPENCODE_API_KEY', readBy: ['opencode'] }],
  } }))
  const sandbox: any = { home: privateHome, sharedHome, templateDir, login: null }
  expect(() => aLoginForTheModel(sandbox, { runtime: 'opencode', model: 'opencode-go/deepseek-v4.1-flash', minutes: 1, home: f!.home })).toThrow('OPENCODE_API_KEY')
  const source = join(sharedHome, '.local/share/opencode/auth.json')
  mkdirSync(join(sharedHome, '.local/share/opencode'), { recursive: true })
  writeFileSync(source, '{"synthetic":{"type":"oauth","refresh":"synthetic-only"}}', { mode: 0o600 })
  expect(() => aLoginForTheModel(sandbox, { runtime: 'opencode', model: 'opencode-go/deepseek-v4.1-flash', minutes: 1, home: f!.home })).toThrow('OPENCODE_API_KEY')
  const privateAuth = join(privateHome, '.local/share/opencode/auth.json')
  mkdirSync(join(privateHome, '.local/share/opencode'), { recursive: true })
  writeFileSync(privateAuth, '{"synthetic":{"type":"api","key":"synthetic-only"}}', { mode: 0o600 })
  expect(() => aLoginForTheModel(sandbox, { runtime: 'opencode', model: 'opencode-go/deepseek-v4.1-flash', minutes: 1, home: f!.home })).toThrow('OPENCODE_API_KEY')
  writeFileSync(secretFile, 'OPENCODE_API_KEY=synthetic-only\n', { mode: 0o600 })
  expect(aLoginForTheModel(sandbox, { runtime: 'opencode', model: 'opencode-go/deepseek-v4.1-flash', minutes: 1, home: f.home })).toContain('OPENCODE_API_KEY')
  expect(sandbox.loginSeeds ?? []).toEqual([])
  expect(existsSync(join(privateHome, '.config/opencode/opencode.json'))).toBe(false)
  expect(existsSync(join(privateHome, '.claude'))).toBe(false)
  expect(existsSync(join(privateHome, '.codex'))).toBe(false)
  expect(readFileSync(source, 'utf8')).toBe('{"synthetic":{"type":"oauth","refresh":"synthetic-only"}}')
  expect(readFileSync(privateAuth, 'utf8')).toBe('{"synthetic":{"type":"api","key":"synthetic-only"}}')
})

it('requests only secrets declared for OpenCode and still refuses invalid view evidence', async () => {
  f = await inspectorFixture()
  const view = inspectorViewStandIn()
  try {
    const templateDir = join(f.home, 'template')
    mkdirSync(templateDir)
    const secretFile = join(f.home, 'synthetic-secrets')
    writeFileSync(secretFile, 'OPENCODE_API_KEY=synthetic-only\nOPENAI_API_KEY=synthetic-only\nDEEPSEEK_API_KEY=synthetic-only\nCLAUDE_CODE_OAUTH_TOKEN=synthetic-only\nMOLE_AGENT_KEY=synthetic-only\n', { mode: 0o600 })
    writeFileSync(join(templateDir, 'sandbox.json'), JSON.stringify({ template: 'Synthetic', secrets: { hostFile: secretFile, names: [
      { name: 'OPENCODE_API_KEY', readBy: ['opencode'] }, { name: 'OPENAI_API_KEY', readBy: ['opencode'] }, { name: 'DEEPSEEK_API_KEY', readBy: ['opencode'] }, { name: 'CLAUDE_CODE_OAUTH_TOKEN', readBy: ['claude'] },
    ] } }))
    Object.assign(view.sandbox, { templateDir })
    aLoginForTheModel(view.sandbox, { runtime: 'opencode', model: 'opencode-go/deepseek-v4.1-flash', minutes: 1, home: f.home })
    view.changeReceipt(receipt => { receipt.check = 'another-check' })
    const ran = await runInside(view.sandbox, { runtime: 'opencode', label: 'opencode', cwd: view.work, argv: nativeOpenCodeArgv(), limitMs: 1000, launcher: view.launcher })
    expect(ran.code).toBeNull()
    expect(ran.why).toContain('receipt')
    expect(view.calls).toHaveLength(1)
    expect(view.calls[0]!.words.filter((_, i, words) => words[i - 1] === '--secret')).toEqual(['OPENCODE_API_KEY'])
    expect(view.calls[0]!.spec.private.map((m: any) => m.host)).toEqual([view.work, view.sandbox.home, join(view.sandbox.home, '..', 'tmp')])
    expect(view.calls[0]!.spec.readOnly.map((m: any) => m.container)).toEqual(['/inputs/records', '/inputs/commands'])
  } finally { view.close() }
})


it.each(['symlink', 'hard-link'])('refuses an OpenCode private config %s before preparing through it', async kind => {
  const view = inspectorViewStandIn()
  try {
    const sentinel = join(view.root, 'protected-config.json')
    const configDir = join(view.sandbox.home, '.config/opencode')
    mkdirSync(configDir, { recursive: true })
    writeFileSync(sentinel, '{"synthetic":"protected"}')
    const target = join(configDir, 'opencode.json')
    if (kind === 'symlink') symlinkSync(sentinel, target)
    else linkSync(sentinel, target)
    const ran = await runInside(view.sandbox, { runtime: 'opencode', label: 'opencode', cwd: view.work, argv: nativeOpenCodeArgv(), limitMs: 1000, launcher: view.launcher })
    expect(ran.code).toBeNull()
    expect(view.calls).toHaveLength(0)
    expect(readFileSync(sentinel, 'utf8')).toBe('{"synthetic":"protected"}')
  } finally { view.close() }
})


/** The native stdin form owned by this controller, with synthetic model selection. */
function nativeOpenCodeArgv(model = 'opencode-go/deepseek-v4.1-flash', session: string | null = null): string[] {
  const environment = { ...FULL_PERMISSIONS.opencode!.env,
    OPENCODE_DISABLE_PROJECT_CONFIG: '1', OPENCODE_CONFIG: '/check/home/.config/opencode/opencode.json',
    OPENCODE_CONFIG_DIR: '/check/home/.config/opencode', OPENCODE_CONFIG_CONTENT: OPENCODE_CHECK_ENV.OPENCODE_CONFIG_CONTENT, OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX: '64000',
    XDG_STATE_HOME: '/check/home/.local/state' }
  return ['env', ...Object.entries(environment).map(([key, value]) => `${key}=${value}`),
    'opencode', 'run', '--format', 'json', '--dir', '/work', '-m', model, '--pure',
    ...(session === null ? [] : ['--session', session]), '--variant', 'high', '--']
}

it.each([
  ['opencode-go/deepseek-v4.1-flash', 'OPENCODE_API_KEY'], ['deepseek/deepseek-v4.1-flash', 'DEEPSEEK_API_KEY'],
])('OpenCode model %s receives exactly its declared %s', async (model, key) => {
  f = await inspectorFixture()
  const view = inspectorViewStandIn()
  try {
    const templateDir = join(f.home, 'template'), secretFile = join(f.home, 'synthetic-secrets')
    mkdirSync(templateDir)
    const names = ['OPENCODE_API_KEY', 'DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY']
    writeFileSync(secretFile, names.map(name => `${name}=synthetic-only`).join('\n') + '\n', { mode: 0o600 })
    writeFileSync(join(templateDir, 'sandbox.json'), JSON.stringify({ template: 'Synthetic', secrets: { hostFile: secretFile, names: names.map(name => ({ name, readBy: ['opencode'] })) } }))
    Object.assign(view.sandbox, { templateDir })
    expect(aLoginForTheModel(view.sandbox, { runtime: 'opencode', model, minutes: 1, home: f.home })).toContain(key)
    const ran = await runInside(view.sandbox, { runtime: 'opencode', label: 'opencode', cwd: view.work, argv: nativeOpenCodeArgv(model), limitMs: 1000, launcher: view.launcher })
    expect(ran.code, ran.why ?? '').toBe(0)
    expect(view.calls[0]!.words.filter((_, i, words) => words[i - 1] === '--secret')).toEqual([key])
    expect(view.calls[0]!.spec.loginSeeds ?? []).toEqual([])
    expect(JSON.parse(readFileSync(join(view.sandbox.home, '.config/opencode/opencode.json'), 'utf8')).mcp?.mole_office).toBeUndefined()
  } finally { view.close() }
})

it.each(['openai/gpt-6.1-sol', 'opencode/deepseek', 'opencode', 'deepseek', 'deepseek/', '', null])
  ('OpenCode refuses unmapped or missing provider in %s without an auth-file fallback', async model => {
    f = await inspectorFixture()
    const templateDir = join(f.home, 'template'), privateHome = join(f.home, 'private')
    mkdirSync(templateDir); mkdirSync(privateHome)
    const secretFile = join(f.home, 'synthetic-secrets')
    writeFileSync(secretFile, 'OPENCODE_API_KEY=synthetic-only\nDEEPSEEK_API_KEY=synthetic-only\n', { mode: 0o600 })
    writeFileSync(join(templateDir, 'sandbox.json'), JSON.stringify({ template: 'Synthetic', secrets: { hostFile: secretFile, names: [
      { name: 'OPENCODE_API_KEY', readBy: ['opencode'] }, { name: 'DEEPSEEK_API_KEY', readBy: ['opencode'] },
    ] } }))
    const provider = typeof model === 'string' && model.split('/')[0] ? model.split('/')[0] : '(missing)'
    expect(() => aLoginForTheModel({ templateDir, home: privateHome }, { runtime: 'opencode', model, minutes: 1, home: f!.home }))
      .toThrow(`No key is mapped for provider ${provider} in an OpenCode check.`)
  })

it.each(['missing-full-env', 'conflicting-full-env', 'duplicate-full-env', 'missing-pure', 'false-pure', 'wrapped', 'wrong-cwd', 'extra-argument', 'prototype-env'])
  ('OpenCode rejects %s before creating its protected model wrapper', async fault => {
    const view = inspectorViewStandIn()
    try {
      let argv = nativeOpenCodeArgv()
      const env = argv.find(word => word.startsWith('OPENCODE_PERMISSION='))!
      if (fault === 'missing-full-env') argv = argv.filter(word => word !== env)
      if (fault === 'conflicting-full-env') argv[argv.indexOf(env)] = 'OPENCODE_PERMISSION={"bash":"deny"}'
      if (fault === 'duplicate-full-env') argv.splice(1, 0, env)
      if (fault === 'missing-pure') argv = argv.filter(word => word !== '--pure')
      if (fault === 'false-pure') argv[argv.indexOf('--pure')] = '--pure=false'
      if (fault === 'wrapped') argv[argv.indexOf('opencode')] = 'sh'
      if (fault === 'wrong-cwd') argv[argv.indexOf('/work')] = '/outside'
      if (fault === 'extra-argument') argv.push('unverified')
      if (fault === 'prototype-env') argv.splice(1, 0, '__proto__=unverified')
      const ran = await runInside(view.sandbox, { runtime: 'opencode', label: 'opencode', cwd: view.work, argv, limitMs: 1000, launcher: view.launcher })
      expect(ran.code).toBeNull()
      expect(ran.why).toContain('OpenCode')
      expect(view.calls).toHaveLength(0)
      expect(existsSync(join(view.sandbox.checkDir, 'commands/opencode.sh'))).toBe(false)
    } finally { view.close() }
  })

it.each(['fresh', 'correction', 'resume'])('OpenCode validates its %s native array before protected wrapper writing', async kind => {
  const view = inspectorViewStandIn()
  try {
    const said: string[] = []; view.sandbox.asked.say = sentence => { said.push(sentence) }
    const argv = nativeOpenCodeArgv('opencode-go/deepseek-v4.1-flash', kind === 'fresh' ? null : 'ses_Synthetic')
    const ran = await runInside(view.sandbox, { runtime: 'opencode', label: 'opencode', cwd: view.work, argv, limitMs: 1000, launcher: view.launcher })
    expect(ran.code, ran.why ?? '').toBe(0)
    expect(said.join(' ')).toContain('OpenCode native command array was checked')
    expect(readFileSync(join(view.sandbox.checkDir, 'commands/opencode.sh'), 'utf8')).toContain("'--pure'")
    expect(JSON.parse(readFileSync(join(view.sandbox.home, '.config/opencode/opencode.json'), 'utf8')).mcp?.mole_office).toBeUndefined()
    expect(view.calls).toHaveLength(1)
  } finally { view.close() }
})

/** The value after `flag`, where the command has it once; it fails the case when the flag is missing or repeated. */
function theOne(argv: string[], flag: string): string | undefined {
  expect(argv.filter((word) => word === flag), `${flag} in ${JSON.stringify(argv)}`).toHaveLength(1)
  return argv[argv.indexOf(flag) + 1]
}

/** A model, a native model and a variant made up for this run, none of which the compatibility list names. */
function unseen() {
  const key = randomUUID()
  const made = { model: `office-${key}`, nativeModel: `native-${key}`, variant: `variant-${key}` }
  const listed = LAUNCHER_MODEL_COMPATIBILITY as { aliases: Record<string, string>; startValues: Record<string, unknown> }
  for (const name of [made.model, made.nativeModel, made.variant, `deepseek/${made.nativeModel}`]) {
    expect(listed.aliases[name] ?? listed.startValues[name]).toBeUndefined()
  }
  return made
}

// MUTATION: the command builder leaves the selection unread (it names MODEL and takes the effort answer, not the
// selection); the start then goes by the compatibility list, which names none of this row's native values, and this case
// goes red before a command is built.
it('starts an OpenCode check from a row\'s native route and variant, neither named by the compatibility list', async () => {
  const t: TestDb = await freshDb()
  const app = (await apiApp()).app
  await app.ready()
  try {
    const made = unseen()
    // The provider is the part of the native route the private check view maps a key for (OPENCODE_CHECK_KEYS); that is
    // a list of providers, not of models. The native model and the variant are made up for this run.
    const provider = 'deepseek'
    const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON,
      payload: { handle: 'inspector-one', name: 'Inspector One', role: 'inspector' } })
    expect(registered.statusCode, registered.body).toBe(201)
    const written = await app.inject({ method: 'POST', url: '/api/casting/inspector', headers: AS_THE_PERSON, payload: {
      project: WORKSPACE, program: { value: 'opencode' }, model: { value: made.model }, effort: { value: null },
      native: { model: made.nativeModel, provider, variant: made.variant } } })
    expect([200, 201], written.body).toContain(written.statusCode)
    const row = (written.json() as { casting: { id: number } }).casting

    const answered = await app.inject({ method: 'GET', url: '/api/office/run-models/for/inspector-one?place=check', headers: AS_THE_INSPECTOR })
    expect(answered.statusCode, answered.body).toBe(200)
    const said = answered.json() as Record<string, any>
    const exact = (await app.inject({ method: 'GET', url: `/api/casting/rows/${String(row.id)}/selection`, headers: AS_THE_PERSON })).json() as { selection: unknown }
    expect(said['selection']).toEqual(exact.selection)
    expect(said['selection']).toMatchObject({ runtime: 'opencode', model: made.model,
      native: { model: made.nativeModel, provider, variant: made.variant, effort: null }, casting: { id: row.id } })
    expect(said).toMatchObject({ runtime: 'opencode', model: made.model, from: 'the role' })

    const selection = readLauncherSelection(said['selection'])
    const route = selection.native.provider === null ? selection.native.model : `${selection.native.provider}/${selection.native.model}`
    // The tool's own top-level values, as it computes them from the office's answer: the row's selection and route.
    const { read } = nativeReaders('opencode', { MODEL: said['model'], SELECTION: selection, NATIVE_ROUTE: route,
      SANDBOX: {}, EFFORT: { effort: selection.native.effort }, GIVEN: said })
    const given = read.theChecksCommand(null) as { command: string[]; env: Record<string, string> }
    expect(theOne(given.command, '-m')).toBe(route)
    expect(theOne(given.command, '--variant')).toBe(made.variant)
    expect(given.command).not.toContain(made.model)

    // THE PRIVATE CONTAINER VIEW, with this file's launcher stand-in: OpenCode refuses --on-the-host.
    const view = inspectorViewStandIn({ secrets: { DEEPSEEK_API_KEY: 'synthetic-only-not-a-real-key' } })
    try {
      const ran = await runInside(view.sandbox, { runtime: 'opencode', label: 'opencode', cwd: view.work,
        argv: ['env', ...Object.entries(given.env).map(([key, value]) => `${key}=${value}`), ...given.command],
        limitMs: 1000, launcher: view.launcher })
      expect(ran.code, ran.why ?? '').toBe(0)
      const script = readFileSync(join(view.sandbox.checkDir, 'commands/opencode.sh'), 'utf8')
      expect(script).toContain(`'-m' '${route}'`)
      expect(script).toContain(`'--variant' '${made.variant}'`)
      expect(script).not.toContain(made.model)
    } finally { view.close() }
  } finally {
    await app.close()
    t.close()
  }
}, 60_000)
