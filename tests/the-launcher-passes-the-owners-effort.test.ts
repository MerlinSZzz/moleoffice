// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { CONTAINER_TMP_LOADER, withAPrivateTmpToSweep } from './sandbox-stand-ins.ts'
import { syntheticDshReader, CAPTURE_DSH_SELECTION } from './dsh-native-stand-in.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { aTestAddress } from './the-test-commit-address.mjs'
import { NAME_THE_PROCESS_THAT_LOADS_THIS, removeTheFolderOnceItsProcessesHaveEnded } from './the-processes-a-fixture-started.ts'
/**
 * LAUNCHER FOLLOW-UP A, the brief of 13 October 2026.
 *
 * Before: a current helper asks for effort without the starter's key, so a closed key window loses Casting's effort.
 * Now: the host asks with its starter's key and hands the effort, source, asked model and availability to the helper.
 * The helper does not ask again. Without that handoff it still asks and uses the rule on 401/403. The handoff contains
 * no key and never reaches the agent's environment. The start line names the source of the effort.
 *
 * A SOL CAPACITY EXIT IS NEVER STARTED AGAIN (18 October 2026). Before: a Codex gpt-6.1-sol run that ended
 * within ten minutes with "at capacity" in its output started again once on openai/gpt-6-astra, on the owner's older
 * decision. The owner's decision replaced that: no Astra, and Sol only for hard
 * pieces. The restart also started again a run that had already committed, reported and
 * messaged (review point 0HidD_if1_fz). Now the run ends as any failed run ends, crashed, with nothing started again on
 * any model, at any time after its start; its starter is told once, in one plain sentence that names capacity, and its
 * supervisor chooses what comes next. Since 18 October 2026 the office tells it, not the launcher (problem
 * Grbb87VX3pND, way (c)): the crash write carries the notice kind 'sol-capacity', and the launcher sends no message
 * under the run's key. Capacity is read only from Codex's own final error event, never from words that an agent's
 * message or a command's output happens to hold (the inspector's refusal luJMYqhYQoH-). Every new test gets a green
 * control, its named mutation red, then restoration.
 *
 * THE CODEX STOPS ARE READ FOR EVERY CODEX MODEL (wave 13n round CA, 1 November 2026). Before: the launcher read a list of
 * model names, so only Sol was told at capacity and only Luna at a usage limit, another model at capacity was left as it
 * was, and the two sentences named Sol and Luna. Now a Codex run of any model that ends at capacity sends the notice kind
 * 'codex-capacity', and one that ends at a rate or usage limit sends 'codex-usage-limit', each with the run's model as
 * `theModelItRanOn`. The sentence names that model. A usage limit on a model with an entry in the compatibility table's
 * askAgainAfterACodexUsageLimit says where to ask again, as Luna's always did; any other stop says that nothing was started
 * again. synthetic-unknown is in no table, so its cases prove that no list of model names is read. A run that is not Codex
 * is told nothing, as before.
 * An office older than this change refuses the two notice fields with 400. The launcher sends its crash write once, so
 * the run is left unmarked, and finish.log says what the office said.
 *
 * MUTATIONS OF THE CODEX STOPS FOR EVERY MODEL, ONE PER CASE. A stop only for a model the table names (a list of names read
 * again): the synthetic-unknown capacity and usage-limit cases go red. The capacity branch dropped: the Sol, Astra and
 * synthetic-unknown capacity cases. The model's name left off the crash write: every stop case. The Codex check dropped
 * (runtime and program), so a Claude Code run's usage limit is read as Codex's: the Claude Code rows. Luna's entry not
 * read: the Luna cases. The resend put back, so the crash write is sent twice: the older-office case.
 *
 * MUTATION, RUN ON 18 OCTOBER 2026 (run Xa4apWAhUUjs; problem Grbb87VX3pND), before the kinds were for every model. A control run first: all green. Then the Sol
 * crash write sent without 'sol-capacity', and the old message sent under the run's key instead: the three Sol cases went
 * red. The same for Luna, without 'luna-limit': the four Luna cases went red. Each restored, and the control run again:
 * green.
 */
/** Synthetic programs and office replies only. Office stand-ins listen on free ports, never the live office port. */
import { spawn, execFileSync } from 'node:child_process'
import { closeSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { thePortsATestKeepsOff } from '../tools/live-office-ports.mjs'
import { expectRoundRulesSaved, LEGACY_ROUND_CHAPTERS, linkSourceWithLocalRoundRules, writeRoundStartRules } from './round-chapters-fixture.ts'
import { deliveredRoundBrief, savedRoundChapters } from '../src/shared/round-chapters/manifest.ts'
import { stripTypeScriptTypes } from 'node:module'
import { THE_FACTS_VARIABLE, THE_MODELS_START_VALUES, THE_OPENCODE_DATABASE_VARIABLE, THE_OPENCODE_OFFICE_CALL_WAIT_MS, THE_SHARED_OPENCODE_DATABASE, UNKNOWN_STOP_CAUSE, aCommandsStartValues, readHostInstance, theFactsAStartIsGiven, theOpenCodeDatabaseOf, writeInstance } from '../tools/sandbox-common.mjs'
import { codexCapacityAtTheEnd, theStopCauseAtTheEndOfTheTranscript } from '../src/config/stopped-run-cause.mjs'
import { startModelRun } from '../src/worker/runtimes/common.ts'
import { CodexAdapter } from '../src/worker/runtimes/codex.ts'
import { OpenCodeAdapter } from '../src/worker/runtimes/opencode.ts'
import { openCodeGuard } from '../src/config/main-world-guard.mjs'
import { settingNamed } from '../src/config/settings.mjs'
import { THE_COMPACTION_SETTINGS, THE_COMPACTION_VARIABLE } from '../src/config/the-compaction-window.mjs'
import { LAUNCHER_MODEL_COMPATIBILITY, THE_RUNTIMES_FAST_MODE } from '../src/config/model-efforts.mjs'
import { DSH_FEATURES_OFF, THE_STARTING_WORDS } from '../tools/harness-features-off.mjs'

let root = ''
let instance = ''
let env: NodeJS.ProcessEnv
const groups = new Set<number>()
const thread = '0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e'
const repo = process.cwd()
// A worker's or a round's brief starts with the starting words. dsh starts through tools/dsh-hooks/run-agent.sh, which
// gives dsh the patch that switches the harness's own subagents and workflows off, so its words are every runtime's.
const withTheStartingWords = (brief: string) => `${THE_STARTING_WORDS}\n\n---\n\n${brief}`
const networkFetch = globalThis.fetch
const git = (dir: string, ...args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()

// Every request is answered from synthetic files. An unexpected address or door throws instead of reaching a server.
const fixture = String.raw`
import { readFileSync, writeFileSync, existsSync, appendFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
const root = process.env.EFFORT_FIXTURE
${NAME_THE_PROCESS_THAT_LOADS_THIS}
const networkFetch = globalThis.fetch
// A run file is published whole, so a reader in another process never sees half of it: a new temporary name in the
// same folder, made new ('wx') so a link left there is never written through, then renamed onto the path.
const writeWhole = (file, text) => {
  const temporary = file + '.' + Math.random().toString(16).slice(2) + '.writing'
  writeFileSync(temporary, text, { flag: 'wx' })
  renameSync(temporary, file)
}
// Advance only the helper's clock when fake Codex reports a late capacity exit. The host and test clock stay real.
if (process.argv[1]?.endsWith('/sandbox-start.mjs')) {
  const now = Date.now
  Date.now = () => now() + (existsSync(join(root, 'capacity-late')) ? 600001 : 0)
}
globalThis.fetch = async (address, init = {}) => {
  const url = new URL(address)
  if (url.origin !== 'http://synthetic.invalid') throw new Error('test refused network: ' + url.origin)
  const path = url.pathname, method = init.method ?? 'GET'
  if (path.startsWith('/api/office/run-models/for/')) {
    const nativeSelection = join(root, 'native-selection')
    if (existsSync(nativeSelection)) return new Response(readFileSync(nativeSelection, 'utf8'), { status: 200 })
    const officeFile = join(root, 'effort-office')
    if (existsSync(officeFile)) return networkFetch(readFileSync(officeFile, 'utf8') + path + url.search, init)
    return new Response('{}', { status: 503, headers: { 'x-mole-office-stand-in': 'synthetic' } })
  }
  if (method === 'GET' && /^\/api\/casting\/rows\/\d+\/selection$/.test(path)) {
    const nativeSelection = join(root, 'native-selection')
    if (existsSync(nativeSelection)) return new Response(readFileSync(nativeSelection, 'utf8'), { status: 200 })
  }
  const body = init.body ? JSON.parse(init.body) : {}
  appendFileSync(join(root, 'requests'), JSON.stringify({ path, method, body }) + '\n')
  const answer = (value, status = 200) => new Response(JSON.stringify(value), { status })
  if (method === 'GET' && path.startsWith('/api/checks/')) return answer(${JSON.stringify(LEGACY_ROUND_CHAPTERS)})
  if (method === 'POST' && path.startsWith('/api/agents/') && path.endsWith('/hand-run')) return answer({ cut: null })
  if (path === '/api/participants') return answer({ agents: ['synthetic-claude', 'synthetic-codex', 'synthetic-exec', 'synthetic-dsh', 'synthetic-opencode', 'synthetic-stale-dsh'].map(handle => ({ id: handle, handle, record: handle, name: handle, retired: false })) })
  if (path === '/api/kinds/session') return answer({ kind: { fields: [{ key: 'adaptedTool' }, { key: 'effort' }] } })
  if (path.startsWith('/api/participants/agent/')) return answer({ participant: { retired: false } })
  if (path === '/api/resources' && method === 'GET') return answer({ resources: [], rows: [] })
  if (path === '/api/resources' && method === 'POST') return answer({ resource: { id: 'synthetic-process-' + process.pid, key: String(body.pidInContainer), pgid: body.pidInContainer } }, 201)
  if (path.startsWith('/api/resources/') && path.endsWith('/release')) return answer({ released: true })
  if (path === '/api/toolset/uses') return answer({ written: true }, 201)
  if (path === '/api/records' && method === 'GET') return answer({ records: [] })
  if (path === '/api/records' && method === 'POST') {
    const id = (body.kind === 'message' ? 'synthetic-message-' : 'synthetic-run-') + process.pid
    const record = { ...body, id }
    writeWhole(join(root, id + '.json'), JSON.stringify(record))
    return answer({ record, ...(body.kind === 'session' && existsSync(join(root, 'native-selection')) ? { runKey: { key: 'c'.repeat(64) } } : {}) }, 201)
  }
  // AN OFFICE OLDER THAN THE CODEX STOPS FOR EVERY MODEL, when a case asks for one: its strict body refuses theModelItRanOn,
  // and its list of kinds refuses the new ones, with 400. It records the refused write and leaves the run as it was.
  if (method === 'PATCH' && existsSync(join(root, 'an-older-office')) && ('theModelItRanOn' in body || String(body.tellTheStarter ?? '').startsWith('codex-'))) return answer({ error: 'Synthetic older office: Unrecognized key: "theModelItRanOn"' }, 400)
  const id = path.slice('/api/records/'.length)
  const file = join(root, id + '.json')
  if (path.startsWith('/api/records/') && existsSync(file)) {
    const record = JSON.parse(readFileSync(file, 'utf8'))
    if (method === 'PATCH') { record.data = { ...record.data, ...body.dataPatch }; writeWhole(file, JSON.stringify(record)) }
    return answer({ record })
  }
  throw new Error('No synthetic reply for ' + method + ' ' + path)
}
`

const docker = String.raw`#!/usr/bin/env node
const fs = process.getBuiltinModule('node:fs'), path = process.getBuiltinModule('node:path'), cp = process.getBuiltinModule('node:child_process')
const args = process.argv.slice(2), root = process.env.EFFORT_FIXTURE
if (args[0] === 'inspect') {
  const instance = JSON.parse(fs.readFileSync(path.join(root, 'sandboxes/synthetic/instance.json')))
  console.log(JSON.stringify([{ State: { Running: true }, Config: { Env: [] }, Mounts: [], HostConfig: {}, ...instance.container }]))
} else if (args[0] === 'exec') {
  const env = { ...process.env }
  delete env.MOLE_AGENT_KEY // Docker does not inherit the host starter's key.
  let i = 1, cwd = root
  while (args[i].startsWith('-')) {
    const flag = args[i++], value = args[i++]
    if (flag === '-e') { const at = value.indexOf('='); env[value.slice(0, at)] = value.slice(at + 1) }
    else if (flag === '--env-file') {
      const lines = fs.readFileSync(value, 'utf8').trim().split('\n')
      fs.appendFileSync(path.join(root, 'env-files'), JSON.stringify(lines) + '\n')
      for (const line of lines) { const at = line.indexOf('='); env[line.slice(0, at)] = line.slice(at + 1) }
    }
    else if (flag === '-w') cwd = value
    else throw new Error('Unknown synthetic docker flag ' + flag)
  }
  i++
  const containerTmp = path.join(root, 'tmp'); fs.mkdirSync(containerTmp, { recursive: true })
  if (!env.TMPDIR) env.TMPDIR = containerTmp
  const loader = path.join(root, 'container-tmp.mjs'); fs.writeFileSync(loader, ${JSON.stringify(CONTAINER_TMP_LOADER)})
  env.NODE_OPTIONS = [env.NODE_OPTIONS, '--import=' + process.getBuiltinModule('node:url').pathToFileURL(loader).href].filter(Boolean).join(' ')
  fs.appendFileSync(path.join(root, 'helper-environments'), JSON.stringify(env) + '\n')
  const child = cp.spawn(args[i], args.slice(i + 1), { cwd, env, stdio: 'inherit' })
  child.on('close', code => process.exit(code ?? 1))
} else throw new Error('Unknown synthetic docker command ' + args[0])
`

beforeAll(() => {
  vi.stubGlobal('fetch', (address: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => String(address).startsWith('http://synthetic.invalid')
    ? Promise.resolve(new Response('{}', { status: 503, headers: { 'x-mole-office-stand-in': 'synthetic' } })) : networkFetch(address, init))
  mkdirSync(join(repo, '.logs'), { recursive: true })
  root = mkdtempSync(join(repo, '.logs/effort-fixture-'))
  instance = join(root, 'sandboxes', 'synthetic')
  for (const dir of ['repo', 'home/.codex', 'out', 'briefs']) mkdirSync(join(instance, dir), { recursive: true })
  const checkout = join(instance, 'repo')
  git(checkout, 'init', '-q', '-b', 'main')
  git(checkout, 'config', 'user.name', 'Synthetic test')
  git(checkout, 'config', 'user.email', 'synthetic@example.invalid')
  git(checkout, 'config', 'commit.gpgsign', 'false')
  for (const dir of ['tools', 'for-agents']) symlinkSync(join(repo, dir), join(checkout, dir))
  linkSourceWithLocalRoundRules(repo, checkout)
  writeRoundStartRules(instance, checkout)
  git(checkout, 'add', '.')
  git(checkout, 'commit', '-qm', 'Synthetic checkout')
  git(checkout, 'remote', 'add', 'origin', checkout)
  const template = join(root, 'template')
  mkdirSync(template)
  writeFileSync(join(template, 'devcontainer.json'), '{}')
  writeFileSync(join(template, 'sandbox.json'), JSON.stringify({ template: 'synthetic', secrets: { hostFile: join(root, 'secrets'), names: [{ name: 'CLAUDE_CODE_OAUTH_TOKEN', readBy: ['claude'] }, { name: 'DEEPSEEK_API_KEY', readBy: ['dsh'] }] } }))
  writeFileSync(join(root, 'secrets'), 'CLAUDE_CODE_OAUTH_TOKEN=synthetic-token\nDEEPSEEK_API_KEY=synthetic-deepseek-key\n', { mode: 0o600 })
  writeFileSync(join(instance, 'home/.codex/auth.json'), '{}')
  // THE CONVERSATIONS A ROUND CONTINUES, in the sandbox's own home, where Codex and OpenCode keep them. Both are
  // synthetic and say so: the stand-in programs here print a thread and sessions but keep nothing of their own. The
  // rollout is named after the thread, as Codex names it; the database has OpenCode's session table, with the two
  // sessions the rounds below continue.
  const day = join(instance, 'home/.codex/sessions/2026/10/17')
  mkdirSync(day, { recursive: true })
  writeFileSync(join(day, `rollout-2026-10-17T00-00-00-${thread}.jsonl`), JSON.stringify({ type: 'session_meta', payload: { id: thread, synthetic: true } }) + '\n')
  mkdirSync(join(instance, 'home/.local/share/opencode'), { recursive: true })
  execFileSync(process.execPath, ['--no-warnings', '-e', String.raw`
const { DatabaseSync } = require('node:sqlite')
const db = new DatabaseSync(process.argv[1])
db.exec('CREATE TABLE session (id TEXT PRIMARY KEY, title TEXT NOT NULL)')
const add = db.prepare('INSERT INTO session (id, title) VALUES (?, ?)')
for (const id of ['ses_syntheticOwned01', 'ses_selectedOlder01']) add.run(id, 'synthetic session of this test')
db.close()
`, join(instance, 'home/.local/share/opencode/opencode.db')])
  // Both copies of the facts, as up writes them: the launcher reads the host's, the helper the folder's.
  writeInstance(instance, { instance: 'synthetic', template: 'synthetic', templateDir: template, workspace: 'default', from: checkout, ref: 'main', containerRow: 'synthetic-container', container: { name: 'synthetic-container' } })
  mkdirSync(join(root, 'bin'))
  writeFileSync(join(root, 'fetch.mjs'), fixture)
  writeFileSync(join(root, 'bin/docker'), docker, { mode: 0o755 })
  mkdirSync(join(instance, 'dsh/npm/node_modules/.bin'), { recursive: true })
  symlinkSync(join(root, 'bin/dsh'), join(instance, 'dsh/npm/node_modules/.bin/dsh'))
  const nativeReader = syntheticDshReader(root)
  for (const program of ['claude', 'codex', 'opencode', 'dsh']) {
    writeFileSync(join(root, 'bin', program), `#!${process.execPath}
${CAPTURE_DSH_SELECTION}
const fs = process.getBuiltinModule('node:fs'), path = process.getBuiltinModule('node:path')
const file = path.join(process.env.EFFORT_FIXTURE, 'seen-' + process.env.MOLE_OFFICE_SESSION + '.json')
const args = process.argv.slice(2)
const selectedPatch = args.reduce((last, word, i) => word === '--patch' ? args[i + 1] : last, null)
let settings
if (selectedPatch && selectedPatch.endsWith('.json')) {
  const rows = JSON.parse(fs.readFileSync(selectedPatch, 'utf8'))
  settings = captureDshSelection(fs.readFileSync(rows.find(row => row.id === 'settings').config.path, 'utf8'))
}
const observed = { settings, brief: ${program === 'dsh' ? "fs.existsSync(args.at(-1)) ? fs.readFileSync(args.at(-1), 'utf8') : null" : "fs.fstatSync(0).isFile() ? fs.readFileSync(0, 'utf8') : null"}, argv: args, effort: process.env.CLAUDE_CODE_EFFORT_LEVEL, env: process.env, cwd: process.cwd(), run: process.env.MOLE_OFFICE_SESSION }
fs.writeFileSync(file + '.part', JSON.stringify(observed))
fs.renameSync(file + '.part', file)
fs.appendFileSync(path.join(process.env.EFFORT_FIXTURE, 'program-calls'), JSON.stringify(observed) + '\\n')
const genericEnding = path.join(process.env.EFFORT_FIXTURE, 'generic-ending')
if (fs.existsSync(genericEnding)) {
  const ending = JSON.parse(fs.readFileSync(genericEnding, 'utf8'))
  console.log(JSON.stringify({ type: 'error', message: ending.said }))
  process.exit(1)
}
${program === 'opencode' ? `console.log(JSON.stringify({ type: 'step_start', sessionID: 'ses_syntheticOwned01' })); console.log(JSON.stringify({ type: 'step_finish', sessionID: 'ses_syntheticOwned01', part: { tokens: { input: 1, output: 2 }, cost: 0 } }))` : ''}
${program === 'codex' ? `console.log(JSON.stringify({ type: 'thread.started', thread_id: '${thread}' })); console.log(JSON.stringify({ type: 'error', message: 'Configured service tier \u0060fast\u0060 is not advertised as supported for model \u0060gpt-6.1-sol\u0060 and will be omitted from requests.' }))` : ''}
const lunaScenario = path.join(process.env.EFFORT_FIXTURE, 'luna-case')
if (fs.existsSync(lunaScenario)) {
  const scenario = JSON.parse(fs.readFileSync(lunaScenario, 'utf8'))
  const calls = fs.readFileSync(path.join(process.env.EFFORT_FIXTURE, 'program-calls'), 'utf8').trim().split(String.fromCharCode(10)).map(line => JSON.parse(line)).filter(call => call.run === process.env.MOLE_OFFICE_SESSION)
  if (calls.length > 2) { console.log(JSON.stringify({ type: 'event_msg', payload: { type: 'task_complete', error: { codex_error_info: 'transport_error', message: 'Synthetic third attempt stops the defective restart loop' } } })); process.exit(1) }
  if (scenario.prose) console.log(JSON.stringify({ type: 'agent_message', message: 'Synthetic discussion: usage limit' }))
  else if (scenario.stream === 'error') console.log(JSON.stringify({ type: 'error', message: "You've hit your usage limit." }))
  else if (scenario.stream === 'turn.failed') console.log(JSON.stringify({ type: 'turn.failed', error: { message: 'Rate limit reached.' } }))
  else console.log(JSON.stringify({ type: 'event_msg', payload: { type: 'task_complete', error: { message: 'Synthetic provider ending', codex_error_info: scenario.code ?? 'rate_limit_exceeded' } } }))
  process.exit(1)
}
${program === 'codex' ? `const scenario = path.join(process.env.EFFORT_FIXTURE, 'capacity-case')
if (fs.existsSync(scenario)) {
  const { late = false, prose = false, stderr = false } = JSON.parse(fs.readFileSync(scenario, 'utf8'))
  if (late) fs.writeFileSync(path.join(process.env.EFFORT_FIXTURE, 'capacity-late'), '')
  // What codex exec --json wrote when Sol was at capacity (w13m run 1dSiDsrMtC1S, 15 October 2026): an error event, then
  // turn.failed with the same words and no code. The two other endings only mention capacity and end for another reason.
  const said = 'Selected model is at capacity. Please try a different model.'
  if (prose) {
    console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Synthetic discussion: yesterday the model was at capacity.' } }))
    console.log(JSON.stringify({ type: 'turn.failed', error: { message: 'Synthetic transport ending', codex_error_info: 'transport_error' } }))
  } else if (stderr) console.error('Synthetic provider: at capacity')
  else { console.log(JSON.stringify({ type: 'error', message: said })); console.log(JSON.stringify({ type: 'turn.failed', error: { message: said } })) }
  process.exit(1)
}` : ''}
`, { mode: 0o755 })
  }
  // THE LAUNCHER'S MODULES ARE COMPILED ONCE FOR THE WHOLE FILE. The launcher, tools/register-a-run.mjs and the helper load
  // the same modules in about five hundred processes here. Node keeps their compiled code in a folder inside the fixture,
  // which is empty at the start of each run of this file and is removed with the fixture in the afterAll. Node compiles a
  // changed module again, and no case reads the folder.
  env = withAPrivateTmpToSweep({ ...withoutInheritedEffort(), SANDBOX_DSH_NATIVE_READER: nativeReader, HOME: join(instance, 'home'), PATH: join(root, 'bin') + ':' + process.env['PATH'], EFFORT_FIXTURE: root, NODE_OPTIONS: '--import=' + join(root, 'fetch.mjs'), NODE_COMPILE_CACHE: join(root, 'compile-cache'), MOLE_OFFICE_AGENT: 'synthetic-starter', MOLE_OFFICE_SESSION: 'synthetic-starter-run', MOLE_OFFICE_COMMIT_EMAIL: aTestAddress('fixture'), MOLE_OFFICE_API: 'http://synthetic.invalid', MOLE_OFFICE_WORKSPACE: 'default' }, root)
  delete env['MOLE_AGENT_KEY']
  delete env['CLAUDE_CODE_EFFORT_LEVEL']
  // ONLY THE LAUNCHER MAY GIVE A COMMAND THE OUTPUT CAP. A check runs this file inside its own OpenCode, whose environment
  // has carried OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX since merge entry nVpjcB3k0n8R; copied on, it made the OpenCode
  // cases pass with the launcher's line deleted and the Codex and Claude case fail (the check's refusal of run
  // oWpoow_cxTd6, 19 October 2026).
  delete env['OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX']
  // The same for the database file: an OpenCode worker that runs this file carries its own agent's file name, and copied
  // on, it would let a start the launcher gave no name pass as one given a name.
  delete env[THE_OPENCODE_DATABASE_VARIABLE]
  env['CLAUDE_CODE_OAUTH_TOKEN'] = 'synthetic-token'
})

// THE FOLDER GOES ONLY AFTER EVERY PROCESS THAT LOADED THE FIXTURE HAS ENDED (wave 13s round 117).
// OLD: the afterAll sent SIGTERM to the groups and removed the folder at once with rmSync. The tests wait for the
// launcher's start line and the record it writes, and the launcher's background helper still writes lines in the run's
// log folder after them, so the removal raced those lines and failed with ENOTEMPTY after every other case had passed.
// The host launchers get a private /tmp, withAPrivateTmpToSweep, because without it each helper's sweep asked the fake
// office about every run folder in this machine's /tmp, 2 s apart, and outlived the ten-second wait. With it the
// direct-wait case no longer runs out of its 30 s either, because its helper was the one sweeping.
// MUTATIONS: a helper that writes finish.log for 2 s after its run is finished, timed on the real clock because this
// fixture fakes Date.now for a late capacity case, turns the old clean-up red with ENOTEMPTY and leaves this one green;
// a helper that stays 15 s after its run is finished turns this one red, naming it.
afterAll(async () => {
  vi.unstubAllGlobals()
  for (const group of groups) {
    try { process.kill(-group, 'SIGTERM') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error }
  }
  await removeTheFolderOnceItsProcessesHaveEnded(root)
})

async function launch(args: string[]) {
  const at = args.indexOf('--')
  const before = at === -1 ? args : args.slice(0, at)
  const after = at === -1 ? [] : args.slice(at)
  const child = spawn(process.execPath, ['tools/sandbox.mjs', ...before, '--sandboxes', join(root, 'sandboxes'), '--api', 'http://synthetic.invalid', '--workspace', 'default', ...after], { env })
  let out = '', err = ''
  child.stdout.on('data', chunk => { out += chunk })
  child.stderr.on('data', chunk => { err += chunk })
  const code = await new Promise<number | null>(done => child.on('close', done))
  return { code, out, err }
}

/**
 * Direct helper calls are a supported sandbox start too. HOME is this fixture's own home, never the caller's. The helper
 * is given the sandbox's facts as the launcher gives them, from the host's copy, and its scratch sweep reads the
 * fixture's own tmp, the folder the fake docker binds for an exec start.
 */
const theFactsGiven = () => ({ [THE_FACTS_VARIABLE]: theFactsAStartIsGiven(readHostInstance(instance)) })
const aDirectStartsEnv = () => withAPrivateTmpToSweep({ ...env, ...theFactsGiven() }, root)
async function directStart(args: string[]) {
  const child = spawn(process.execPath, ['tools/sandbox-start.mjs', '--instance', instance, ...args], { env: aDirectStartsEnv(), detached: true })
  if (child.pid !== undefined) groups.add(child.pid)
  let out = '', err = ''
  child.stdout.on('data', chunk => { out += chunk }); child.stderr.on('data', chunk => { err += chunk })
  const code = await new Promise<number | null>(done => child.on('close', done))
  return { code, out, err }
}

/**
 * A DIRECT START SWEEPS ONLY THIS FIXTURE'S OWN SCRATCH ROOT, never the /tmp of the machine the test runs on (wave 13n
 * round AA, item 2r). In real use the helper runs inside a container, and its sweep reads the container's /tmp. Here it
 * runs on this machine. A --wait start returns only after its sweep, and the sweep waits 2 s between asks. Without the
 * stand-in, it asked the synthetic office about every run folder in this machine's /tmp, and the direct-wait case
 * below ran out at 30 s where that /tmp held many.
 */
it('a direct --wait start sweeps the fixture’s own tmp and asks about no folder outside it', async () => {
  const id = 'syntheticSwp', folder = join(root, 'tmp', id + '-ABC123')
  const requests = () => existsSync(join(root, 'requests')) ? readFileSync(join(root, 'requests'), 'utf8') : ''
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(root, id + '.json'), JSON.stringify({ id, kind: 'session', data: { state: 'running' } }))
  const before = requests().length
  try {
    const ran = await directStart(['--wait', '--', 'true'])
    expect(ran.code, ran.err).toBe(0)
    expect(readFileSync(join(instance, 'logs', id, 'finish.log'), 'utf8')).toContain(`scratch sweep folder ${folder} is kept: the run has not ended`)
    const asked = requests().slice(before).split('\n').filter(Boolean).map(line => (JSON.parse(line) as { path: string }).path)
      .flatMap(path => /^\/api\/records\/([A-Za-z0-9_-]{12})$/.exec(path)?.[1] ?? [])
    expect(asked, 'the sweep asked about a folder outside the fixture’s tmp').toEqual([id])
  } finally {
    rmSync(folder, { recursive: true, force: true })
    rmSync(join(root, id + '.json'), { force: true })
    rmSync(join(instance, 'logs', id), { recursive: true, force: true })
  }
}, 30_000)

const opencodeFile = () => join(instance, 'home', '.config', 'opencode', 'opencode.json')
const emptyOpenCode = () => rmSync(join(instance, 'home', '.config', 'opencode'), { recursive: true, force: true })
const OPENCODE_NOTICE = 'OpenCode config now allows external-directory permission.'
const OPEN_CODE_MODEL = 'opencode-go/deepseek-v4.1-flash'
const openCodeModes = ['agent', 'agent-human', 'plain', 'env', 'wait', 'existing-run', 'direct-agent', 'direct-plain', 'direct-wait', 'direct-existing-run'] as const
let openCodeSequence = 0

async function anOpenCodeStart(mode: typeof openCodeModes[number], runtime = 'opencode') {
  const model = runtime === 'opencode' ? OPEN_CODE_MODEL : runtime === 'codex' ? 'openai/gpt-6-luna' : 'claude-opus-5-5'
  const program = runtime === 'claude-code' ? 'claude' : runtime
  const command = program === 'claude' ? [program, '-p', 'Synthetic brief', '--model', model]
    : [program, program === 'codex' ? 'exec' : 'run', '-m', model, 'Synthetic brief']
  const flags: string[] = []
  // An agent's run works in that agent's own worktree, never in the sandbox's shared checkout.
  if (mode.endsWith('agent') || mode === 'agent-human') flags.push('--agent', 'synthetic-exec', '--runtime', runtime, '--model', model, '--worktree', join(instance, 'worktrees', 'synthetic-exec'))
  else if (mode.endsWith('existing-run')) {
    const id = 'synthetic-opencode-existing-' + (++openCodeSequence)
    writeFileSync(join(root, id + '.json'), JSON.stringify({ id, kind: 'session', data: { state: 'running', runtime, model, workingDirectory: join(instance, 'repo'), cutFrom: 'main' } }))
    flags.push('--run', id)
  } else if (mode.endsWith('wait')) flags.push('--wait')
  const waited = mode.endsWith('wait')
  const argv = [...flags, ...(waited || mode.startsWith('direct-') || mode === 'agent-human' ? [] : ['--json']), '--', ...(mode === 'env' ? ['env', 'SYNTHETIC_OPENCODE_TAG=1'] : []), ...command]
  const ran = mode.startsWith('direct-') ? await directStart(argv) : await launch(['exec', 'synthetic', ...argv])
  if (ran.code === 0) {
    const humanRun = mode === 'agent-human' ? /run (\S+) of /.exec(ran.out)?.[1] : null
    const line = humanRun ? readFileSync(join(instance, 'logs', humanRun, 'start.json'), 'utf8') : waited ? ran.err.split('\n').find(line => line.startsWith('sandbox-start: started '))?.slice('sandbox-start: started '.length) : ran.out.trim()
    const start = JSON.parse(line ?? '{}')
    if (typeof start.hostPgid === 'number') groups.add(start.hostPgid)
    if (typeof start.run === 'string' && !waited) await until(() => existsSync(join(instance, 'logs', start.run, 'finish.log')) && readFileSync(join(instance, 'logs', start.run, 'finish.log'), 'utf8').includes("run's scratch folder"))
  }
  return ran
}

describe('an OpenCode run prepares a sandbox that was already up (bQVD4FzEZj4N)', () => {
  afterEach(emptyOpenCode)
  it('keeps the guard and Go plugins inline beside the refreshed office tool in the home config', async () => {
    emptyOpenCode(); mkdirSync(join(instance, 'home', '.config', 'opencode'), { recursive: true })
    const held = { theme: 'synthetic-held-theme', plugin: ['synthetic-held-plugin'] }
    writeFileSync(opencodeFile(), JSON.stringify(held))
    const guard = openCodeGuard('synthetic-exec')
    const inherited = Object.fromEntries(Object.keys(guard).map(key => [key, env[key]]))
    Object.assign(env, guard)
    try {
      const ran = await anOpenCodeStart('agent')
      expect(ran.code, ran.err).toBe(0)
      const start = JSON.parse(ran.out.trim())
      const seen = JSON.parse(readFileSync(join(root, 'seen-' + start.run + '.json'), 'utf8')) as { env: Record<string, string> }
      const inline = JSON.parse(seen.env['OPENCODE_CONFIG_CONTENT']!) as { plugin: string[] }
      expect(inline.plugin.some(plugin => plugin.endsWith('/tools/guard/opencode-plugin.mjs'))).toBe(true)
      expect(inline.plugin.some(plugin => plugin.endsWith('/tools/opencode-go-limit-plugin.mjs'))).toBe(true)
      expect(JSON.parse(readFileSync(opencodeFile(), 'utf8'))).toMatchObject({ ...held,
        mcp: { mole_office: { type: 'local', command: ['node', join(instance, 'repo/tools/office-mcp.mjs')], enabled: true } } })
    } finally {
      for (const [key, value] of Object.entries(inherited)) {
        if (value === undefined) delete env[key]
        else env[key] = value
      }
    }
  })
  // Mutation RUN_HOME_UP_ONLY: prepare at up only, never at a run's start. Each path goes red.
  it.each(openCodeModes)('%s writes a missing OpenCode config and says so once on the same launch line', async mode => {
    emptyOpenCode()
    const ran = await anOpenCodeStart(mode)
    expect(ran.code, ran.err).toBe(0)
    expect(JSON.parse(readFileSync(opencodeFile(), 'utf8'))).toEqual({ permission: { external_directory: 'allow' }, mcp: { mole_office: { type: 'local', command: ['node', join(instance, 'repo/tools/office-mcp.mjs')], enabled: true, timeout: THE_OPENCODE_OFFICE_CALL_WAIT_MS } } })
    expect((ran.out + ran.err).split(OPENCODE_NOTICE)).toHaveLength(2)
    if (mode.endsWith('wait')) expect(ran.err.split('\n').find(line => line.startsWith('sandbox-start: started '))).toContain(OPENCODE_NOTICE)
    else expect(ran.out.trim().split('\n')).toHaveLength(1)
    const unchanged = readFileSync(opencodeFile(), 'utf8')
    const next = await anOpenCodeStart(mode)
    expect(next.code, next.err).toBe(0)
    expect(next.out + next.err).not.toContain(OPENCODE_NOTICE)
    expect(readFileSync(opencodeFile(), 'utf8')).toBe(unchanged)
  }, 30_000)

  // Mutation RUN_HOME_OVERWRITE: replace the existing config. The schema and other keys must survive.
  it.each(['agent', 'direct-agent', 'existing-run'] as const)('%s preserves existing OpenCode keys while changing the permission', async mode => {
    emptyOpenCode(); mkdirSync(join(instance, 'home', '.config', 'opencode'), { recursive: true })
    const held = { $schema: 'https://opencode.ai/config.json', theme: 'synthetic-theme', permission: { bash: 'deny', external_directory: 'ask' } }
    writeFileSync(opencodeFile(), JSON.stringify(held))
    const ran = await anOpenCodeStart(mode)
    expect(ran.code, ran.err).toBe(0)
    expect(JSON.parse(readFileSync(opencodeFile(), 'utf8'))).toEqual({ ...held, permission: { ...held.permission, external_directory: 'allow' }, mcp: { mole_office: { type: 'local', command: ['node', join(instance, 'repo/tools/office-mcp.mjs')], enabled: true, timeout: THE_OPENCODE_OFFICE_CALL_WAIT_MS } } })
  })

  // Mutation RUN_HOME_EVERY_RUNTIME: drop the runtime check. Claude Code and Codex must leave this file absent.
  it.each(['claude-code', 'codex'])('%s leaves OpenCode config alone through the host and direct helper', async runtime => {
    for (const mode of ['agent', 'direct-agent'] as const) {
      emptyOpenCode()
      const ran = await anOpenCodeStart(mode, runtime)
      expect(ran.code, ran.err).toBe(0)
      expect(existsSync(opencodeFile())).toBe(false)
      expect(ran.out + ran.err).not.toContain(OPENCODE_NOTICE)
    }
  })

  it.each(['agent', 'direct-agent', 'existing-run', 'direct-existing-run'] as const)('%s refuses a non-object config before filing anything', async mode => {
    for (const value of [[], null, 'synthetic wrong config']) {
      emptyOpenCode(); mkdirSync(join(instance, 'home', '.config', 'opencode'), { recursive: true })
      const bytes = JSON.stringify(value); writeFileSync(opencodeFile(), bytes)
      const before = readFileSync(join(root, 'requests'), 'utf8').split('\n').filter(Boolean).length
      const ran = await anOpenCodeStart(mode)
      expect(ran.code).not.toBe(0)
      expect(ran.err).toContain('must hold a JSON object')
      expect(readFileSync(opencodeFile(), 'utf8')).toBe(bytes)
      const wrote = readFileSync(join(root, 'requests'), 'utf8').split('\n').filter(Boolean).slice(before).map(line => JSON.parse(line)).filter(call => call.method !== 'GET')
      expect(wrote).toEqual([])
    }
  })
})

async function until(check: () => boolean, what = 'the synthetic program to finish') {
  const end = Date.now() + 10_000
  while (Date.now() < end) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 5)) }
  throw new Error('Waited ten seconds for ' + what)
}

async function started(args: string[], humanLine = false) {
  const ran = await launch(args)
  expect(ran.code, ran.err).toBe(0)
  const run = humanLine ? /run (\S+) of /.exec(ran.out)?.[1] : null
  if (humanLine) expect(run).toBeDefined()
  const start = JSON.parse(humanLine ? readFileSync(join(instance, 'logs', run!, 'start.json'), 'utf8') : ran.out.trim())
  groups.add(start.hostPgid)
  const file = join(root, 'seen-' + start.run + '.json')
  await until(() => existsSync(file) && existsSync(join(instance, 'logs', start.run, 'finish.log')) && readFileSync(join(instance, 'logs', start.run, 'finish.log'), 'utf8').includes("run's scratch folder")).catch(error => {
    const diagnostics = ['finish.log', 'helper.log', 'dsh.log', 'out'].map(name => { const path = join(instance, 'logs', start.run, name); return name + ': ' + (existsSync(path) ? readFileSync(path, 'utf8').slice(-2000) : '(missing)') }).join('\n')
    throw new Error(String(error) + '\n' + diagnostics)
  })
  if (args[0] === 'round') expectRoundRulesSaved(JSON.parse(readFileSync(join(root, start.run + '.json'), 'utf8')).data)
  return { ran, start, seen: JSON.parse(readFileSync(file, 'utf8')) as { argv: string[]; effort?: string; env: Record<string, string>; cwd: string } }
}

const worker = (runtime: string, model: string) => ['worker', 'synthetic', '--agent', 'synthetic-' + (runtime === 'claude-code' ? 'claude' : runtime), '--runtime', runtime, '--model', model, '--brief', join(root, 'brief'), '--json']
const config = (argv: string[], value: string) => {
  const at = argv.indexOf(value)
  expect(at, value).toBeGreaterThan(0)
  expect(argv[at - 1]).toBe('-c')
  return at
}
const codexIsFast = THE_RUNTIMES_FAST_MODE.codex
/** Where the fast flag is when the data file gives Codex one; otherwise there is no service_tier word at all. */
const theFastFlagAt = (argv: string[]): number | null => {
  if (!codexIsFast) {
    expect(argv.some((word) => word.startsWith('service_tier='))).toBe(false)
    return null
  }
  return config(argv, 'service_tier=fast')
}

describe('The launcher passes the owner’s start values', () => {
  it.each([
    ['usage_limit_exceeded', 'Synthetic account allowance exhausted', 'session-limit'],
    ['', "You've hit your usage limit.", 'session-limit'],
    ['rate_limit_exceeded', 'Synthetic account rate stop', 'quota'],
    ['', 'Rate limit reached.', 'quota'],
  ])('reads the Codex account error %s by its code or words, without a model name', (code, said, kind) => {
    const path = join(root, 'synthetic-account-stop.jsonl')
    writeFileSync(path, JSON.stringify({ type: 'turn.failed', error: { message: said, codex_error_info: code } }) + '\n')
    expect(theStopCauseAtTheEndOfTheTranscript(path)).toMatchObject({ kind, said })
  })

  // Mutations: a stop only for a model a list of names holds; the capacity branch dropped; the model's name left off.
  it('tells the starter of a Codex capacity stop on a model no table names, and names that model', async () => {
    writeFileSync(join(root, 'brief'), 'Synthetic unknown-model capacity brief. No model call.\n')
    writeFileSync(join(root, 'capacity-case'), '{}')
    writeFileSync(join(root, 'native-selection'), JSON.stringify({selection:{runtime:'codex',model:'openai/synthetic-unknown',native:{model:'synthetic-unknown',provider:null,variant:null,effort:null},casting:null}}))
    try {
      const { start } = await started(worker('codex', 'openai/synthetic-unknown'))
      const data = JSON.parse(readFileSync(join(root, start.run + '.json'), 'utf8')).data
      expect(JSON.stringify(LAUNCHER_MODEL_COMPATIBILITY)).not.toContain('synthetic-unknown')
      expect(data.state).toBe('crashed')
      expect(data.detail).toMatch(/^Its command in sandbox .+ exited 1\./)
      expect(data.detail).not.toContain(UNKNOWN_STOP_CAUSE)
      expect(readFileSync(start.out, 'utf8')).toContain('Selected model is at capacity.')
      expect(data.stopCause).toBeUndefined()
      expect(theStops(start.run)).toEqual([['codex-capacity', 'synthetic-unknown']])
      expect(data.detail.split(capacityNotice('synthetic-unknown'))).toHaveLength(2)
      expect(theLaunchersMessagesAbout(start.run)).toEqual([])
      const calls = readFileSync(join(root, 'program-calls'), 'utf8').trim().split('\n').map(line => JSON.parse(line)).filter(one => one.run === start.run)
      expect(calls).toHaveLength(1)
    } finally { rmSync(join(root, 'capacity-case'), { force: true }); rmSync(join(root,'native-selection'),{force:true}) }
  }, 30_000)

  // Mutations: a stop only for a model a list of names holds; the Codex check dropped; the model's name left off.
  it.each([
    ['claude-code', 'claude-opus-5-5', 'Synthetic provider crash with no known cause.', true, null],
    ['claude-code', 'claude-opus-5-5', "You've hit your usage limit.", false, null],
    ['codex', 'openai/synthetic-unknown', "You've hit your usage limit.", false, 'codex-usage-limit'],
  ])('preserves the error for %s %s, says whether its cause is unknown, and tells the starter only of a Codex stop', async (runtime, model, said, unknown, kind) => {
    writeFileSync(join(root, 'brief'), 'Synthetic failed run. No model call.\n')
    writeFileSync(join(root, 'generic-ending'), JSON.stringify({ said }))
    if (model.endsWith('synthetic-unknown')) writeFileSync(join(root,'native-selection'),JSON.stringify({selection:{runtime,model,native:{model:'synthetic-unknown',provider:null,variant:null,effort:null},casting:null}}))
    try {
      const { start } = await started(worker(runtime, model))
      const data = JSON.parse(readFileSync(join(root, start.run + '.json'), 'utf8')).data
      expect(data.state).toBe('crashed')
      expect(data.detail).toMatch(/^Its command in sandbox .+ exited 1\./)
      expect(data.detail.includes(UNKNOWN_STOP_CAUSE)).toBe(unknown)
      expect(readFileSync(start.out, 'utf8')).toContain(said)
      expect(theStops(start.run)).toEqual([kind === null ? [undefined, undefined] : [kind, 'synthetic-unknown']])
      expect(data.detail.includes(usageLimitNotice('synthetic-unknown'))).toBe(kind !== null)
      expect(data.detail.includes('Codex rate-limited')).toBe(kind !== null)
      expect(data.detail).not.toContain('answered at capacity')
    } finally { rmSync(join(root, 'generic-ending'), { force: true }); rmSync(join(root,'native-selection'),{force:true}) }
  }, 30_000)

  // Mutation: stop passing SANDBOX_START_EFFORT; the keyless helper reads 403 and uses xhigh instead of Casting max.
  it('the host carries a complete native tuple in its separate envelope and keeps it out of native commands', async () => {
    const model='openai/synthetic-host-office'
    const selection={runtime:'codex',model,native:{model:'synthetic-host-native',provider:null,variant:null,effort:'synthetic-effort'},casting:null}
    writeFileSync(join(root,'native-selection'),JSON.stringify({selection}))
    try {
      const {start,seen}=await started(worker('codex',model))
      expect(start.model).toBe(model)
      expect(seen.argv).toContain(selection.native.model)
      const nativeEffort=seen.argv.find((word:string)=>word.startsWith('model_reasoning_effort='))!
      const literal=nativeEffort.slice(nativeEffort.indexOf('=')+1)
      let decoded:unknown=literal
      try {decoded=JSON.parse(literal)} catch { /* This fixture's bare word is Codex's string fallback. */ }
      expect(decoded).toBe(selection.native.effort)
      theFastFlagAt(seen.argv)
      expect(seen.env.SANDBOX_START_SELECTION).toBeUndefined()
      const lines=(readFileSync(join(root,'env-files'),'utf8').trim().split('\n').flatMap(line=>JSON.parse(line)) as string[]).filter(line=>line.startsWith('SANDBOX_START_SELECTION='))
      expect(lines.some(line=>JSON.parse(line.slice(line.indexOf('=')+1)).model===model)).toBe(true)
    } finally {rmSync(join(root,'native-selection'),{force:true})}
  },30_000)

  it('asks on the host with the starter key and hands Casting effort to the keyless helper', async () => {
    const starterKey = 'a'.repeat(64)
    const requests: { key: string | undefined; agent: string | undefined; url: string }[] = []
    const office = createServer((request, response) => {
      const key = request.headers['x-mole-office-key'] as string | undefined
      requests.push({ key, agent: request.headers['x-mole-office-actor-id'] as string | undefined, url: request.url! })
      response.setHeader('content-type', 'application/json')
      response.statusCode = key === starterKey ? 200 : 403
      response.end(JSON.stringify(key === starterKey
        ? { model: 'claude-opus-5-5', effort: 'max', effortFrom: 'Casting' }
        : { error: 'Synthetic office: the key window is closed.' }))
    })
    await new Promise<void>(done => office.listen(0, '127.0.0.1', done))
    const port = (office.address() as AddressInfo).port
    expect(thePortsATestKeepsOff()).not.toContain(port)
    writeFileSync(join(root, 'effort-office'), `http://127.0.0.1:${port}`)
    writeFileSync(join(root, 'brief'), 'Synthetic host handoff brief.\n')
    env['MOLE_AGENT_KEY'] = starterKey
    try {
      const { start, seen } = await started(worker('claude-code', 'claude-opus-5-5'))
      expect(seen.effort).toBe('max')
      expect(start).toMatchObject({ effort: 'max', effortFrom: 'Casting', officeUnavailable: false })
      expect(start.startWords).toContain('effort max (Casting row)')
      expect(requests.length).toBeGreaterThan(0)
      expect(requests.every(one => one.key === starterKey && one.agent === 'synthetic-starter')).toBe(true)
      expect(requests.every(one => one.url.includes('model=claude-opus-5-5'))).toBe(true)
    } finally {
      delete env['MOLE_AGENT_KEY']
      rmSync(join(root, 'effort-office'), { force: true })
      await new Promise<void>((done, fail) => office.close(error => error ? fail(error) : done()))
    }
  }, 30_000)

  // Round 46: the office answers 'Casting roll' when the agent's Casting roll chose a row other than the marked one.
  // Mutation: drop 'Casting roll' from the host's readable sources, or from the keyless helper's. Either refuses the start.
  it('passes an effort from the Casting roll on the host and in the keyless helper', async () => {
    const starterKey = 'b'.repeat(64)
    const office = createServer((request, response) => {
      response.setHeader('content-type', 'application/json')
      response.statusCode = request.headers['x-mole-office-key'] === starterKey ? 200 : 403
      response.end(JSON.stringify(response.statusCode === 200
        ? { model: 'claude-opus-5-5', effort: 'low', effortFrom: 'Casting roll' }
        : { error: 'Synthetic office: the key window is closed.' }))
    })
    await new Promise<void>(done => office.listen(0, '127.0.0.1', done))
    const port = (office.address() as AddressInfo).port
    expect(thePortsATestKeepsOff()).not.toContain(port)
    writeFileSync(join(root, 'effort-office'), `http://127.0.0.1:${port}`)
    writeFileSync(join(root, 'brief'), 'Synthetic Casting roll brief.\n')
    env['MOLE_AGENT_KEY'] = starterKey
    try {
      const { start, seen } = await started(worker('claude-code', 'claude-opus-5-5'))
      expect(seen.effort).toBe('low')
      expect(start).toMatchObject({ effort: 'low', effortFrom: 'Casting roll', officeUnavailable: false })
      expect(start.startWords).toContain('effort from Casting roll')
    } finally {
      delete env['MOLE_AGENT_KEY']
      rmSync(join(root, 'effort-office'), { force: true })
      await new Promise<void>((done, fail) => office.close(error => error ? fail(error) : done()))
    }
  }, 30_000)

  // Mutations: query the starter's effort; validate only the saved model when the command names it.
  it.each(['saved model', 'command model'])('uses the saved run serving agent and model when the host asks effort for exec --run (%s)', async spelling => {
    const asked: string[] = []
    const office = createServer((request, response) => {
      asked.push(request.url!)
      response.setHeader('content-type', 'application/json')
      const served = request.url!.includes('/synthetic-codex?')
      response.end(JSON.stringify({ model: 'openai/gpt-6.1-sol', effort: served ? 'xhigh' : 'max', effortFrom: 'the agent' }))
    })
    await new Promise<void>(done => office.listen(0, '127.0.0.1', done))
    const port = (office.address() as AddressInfo).port
    expect(thePortsATestKeepsOff()).not.toContain(port)
    writeFileSync(join(root, 'effort-office'), `http://127.0.0.1:${port}`)
    writeFileSync(join(root, 'brief'), 'Synthetic saved-run brief.\n')
    try {
      const first = await started(worker('codex', 'openai/gpt-6.1-sol'))
      asked.length = 0
      if (spelling === 'command model') {
        const file = join(root, first.start.run + '.json')
        const record = JSON.parse(readFileSync(file, 'utf8'))
        delete record.data.model
        writeFileSync(file, JSON.stringify(record))
      }
      const ran = await launch(['exec', 'synthetic', '--run', first.start.run, '--cwd', first.start.cwd, '--json', '--', 'codex', 'exec',
        ...(spelling === 'command model' ? ['-m', 'gpt-6.1-sol'] : []), '--', 'Synthetic next command in the saved run'])
      expect(ran.code, ran.err).toBe(0)
      const next = JSON.parse(ran.out.trim())
      groups.add(next.hostPgid)
      await until(() => existsSync(join(instance, 'logs', first.start.run + '-2', 'finish.log')))
      expect(next).toMatchObject({ run: first.start.run, effort: 'xhigh', effortFrom: 'the agent' })
      expect(asked).toHaveLength(1)
      expect(asked[0]).toContain('/synthetic-codex?')
      expect(new URL(asked[0]!, 'http://synthetic.invalid').searchParams.get('model')).toBe(spelling === 'command model' ? 'gpt-6.1-sol' : 'openai/gpt-6.1-sol')
      expect(next.startWords).toContain('effort from the agent')
    } finally {
      rmSync(join(root, 'effort-office'), { force: true })
      await new Promise<void>((done, fail) => office.close(error => error ? fail(error) : done()))
    }
  }, 30_000)

  // Mutation: remove the 403 fallback from aCommandsStartFromTheOffice.
  it('asks and falls back on 403 when a helper has no host effort values', async () => {
    const asked: string[] = []
    const office = createServer((request, response) => {
      asked.push(request.url!)
      expect(request.headers['x-mole-office-key']).toBeUndefined()
      response.statusCode = 403
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ error: 'Synthetic office: the key window is closed.' }))
    })
    await new Promise<void>(done => office.listen(0, '127.0.0.1', done))
    const port = (office.address() as AddressInfo).port
    expect(thePortsATestKeepsOff()).not.toContain(port)
    writeFileSync(join(root, 'effort-office'), `http://127.0.0.1:${port}`)
    try {
      const child = spawn(process.execPath, ['tools/sandbox-start.mjs', '--instance', instance, '--agent', 'synthetic-codex', '--runtime', 'codex', '--model', 'openai/gpt-6.1-sol', '--worktree', join(instance, 'worktrees/synthetic-codex'), '--cut-from', 'main', '--', 'codex', 'exec', '--', 'Synthetic direct helper brief'], { env: aDirectStartsEnv() })
      let out = '', err = ''
      child.stdout.on('data', chunk => { out += chunk })
      child.stderr.on('data', chunk => { err += chunk })
      expect(await new Promise(done => child.on('close', done)), err).toBe(0)
      const start = JSON.parse(out.trim())
      groups.add(start.hostPgid)
      await until(() => existsSync(join(instance, 'logs', start.run, 'finish.log')) && readFileSync(join(instance, 'logs', start.run, 'finish.log'), 'utf8').includes("run's scratch folder"))
      expect(asked.length).toBeGreaterThan(0)
      expect(start).toMatchObject({ effort: 'xhigh', effortFrom: "the owner's rule", officeUnavailable: true })
      expect(start.startWords).toContain("the office could not be asked; effort from the owner's rule")
    } finally {
      rmSync(join(root, 'effort-office'), { force: true })
      await new Promise<void>((done, fail) => office.close(error => error ? fail(error) : done()))
    }
  }, 30_000)

  // Mutation: copy SANDBOX_START_EFFORT into childEnv after the helper consumes it.
  it('keeps the handoff out of the agent environment and the starter key out of the handoff', async () => {
    const starterKey = 'b'.repeat(64)
    env['MOLE_AGENT_KEY'] = starterKey
    const before = existsSync(join(root, 'env-files')) ? readFileSync(join(root, 'env-files'), 'utf8').length : 0
    try {
      const { seen } = await started(worker('codex', 'openai/gpt-6.1-sol'))
      const lines = readFileSync(join(root, 'env-files'), 'utf8').slice(before)
      const handoff = lines.split('\n').filter(Boolean).flatMap(line => JSON.parse(line) as string[]).filter(line => line.startsWith('SANDBOX_START_EFFORT='))
      expect(handoff).toHaveLength(1)
      expect(handoff.join('\n')).not.toContain(starterKey)
      expect(lines).not.toContain(starterKey)
      expect(Object.keys(seen.env).filter(name => name.startsWith('SANDBOX_START_'))).toEqual([])
      expect(Object.values(seen.env)).not.toContain(starterKey)
    } finally { delete env['MOLE_AGENT_KEY'] }
  }, 30_000)

  // Mutations: start again on Astra as before (the second call comes back); leave its starter untold; tell it twice.
  it.each(['direct', 'env'])('a Sol capacity exit starts nothing again, is marked crashed, and asks the office to tell its starter once (%s)', async spelling => {
    const brief = 'Synthetic capacity brief. Preserve every word.\n'
    const worktreeRoot = join(instance, 'worktrees/capacity-' + spelling)
    git(join(instance, 'repo'), 'worktree', 'add', '-b', 'synthetic-capacity-' + spelling, worktreeRoot, 'main')
    const subdir = join(worktreeRoot, 'subdir')
    mkdirSync(subdir)
    writeFileSync(join(root, 'brief'), brief)
    writeFileSync(join(root, 'capacity-case'), '{}')
    try {
      const command = ['codex', 'exec', '--json', '-m', 'gpt-6.1-sol', '--', brief]
      const ran = await launch(['exec', 'synthetic', '--agent', 'synthetic-codex', '--runtime', 'codex', '--model', 'openai/gpt-6.1-sol',
        '--worktree', worktreeRoot, '--cwd', subdir, '--brief', join(root, 'brief'), '--json', '--',
        ...(spelling === 'env' ? ['env', 'SYNTHETIC_CAPACITY_WRAPPER=preserved'] : []), ...command])
      expect(ran.code, ran.err).toBe(0)
      const first = JSON.parse(ran.out.trim())
      groups.add(first.hostPgid)
      const finishFile = join(instance, 'logs', first.run, 'finish.log')
      // The crash PATCH is the run's last write; its line in finish.log comes after it.
      await until(() => existsSync(finishFile) && readFileSync(finishFile, 'utf8').includes(`run ${first.run} is marked crashed`), 'the Sol run to be marked crashed')
      const calls = readFileSync(join(root, 'program-calls'), 'utf8').trim().split('\n').map(line => JSON.parse(line)).filter(one => one.run === first.run)
      expect(calls).toHaveLength(1)
      expect(calls[0].argv[calls[0].argv.indexOf('-m') + 1]).toBe('gpt-6.1-sol')
      expect(existsSync(join(instance, 'logs', first.run + '-2'))).toBe(false)
      expect(readFileSync(finishFile, 'utf8').split(capacityNotice('openai/gpt-6.1-sol'))).toHaveLength(2)
      expect(theLaunchersMessagesAbout(first.run)).toEqual([])
      expect(theStops(first.run)).toEqual([['codex-capacity', 'openai/gpt-6.1-sol']])
      expect(JSON.parse(readFileSync(join(root, first.run + '.json'), 'utf8')).data).toMatchObject({ model: 'openai/gpt-6.1-sol', state: 'crashed' })
      expect(JSON.parse(readFileSync(join(root, first.run + '.json'), 'utf8')).data.detail).toContain(capacityNotice('openai/gpt-6.1-sol'))
      expect(JSON.parse(readFileSync(join(root, first.run + '.json'), 'utf8')).data.detail).not.toContain(UNKNOWN_STOP_CAUSE)
    } finally { rmSync(join(root, 'capacity-case'), { force: true }) }
  }, 30_000)

  // Mutation: tell the starter only within ten minutes of the start, as the old restart window did.
  it('a Sol capacity exit after ten minutes is told the same way, and nothing starts again', async () => {
    writeFileSync(join(root, 'brief'), 'Synthetic late capacity brief.\n')
    writeFileSync(join(root, 'capacity-case'), JSON.stringify({ late: true }))
    try {
      const { start } = await started(worker('codex', 'openai/gpt-6.1-sol'))
      const calls = readFileSync(join(root, 'program-calls'), 'utf8').trim().split('\n').map(line => JSON.parse(line)).filter(one => one.run === start.run)
      expect(calls).toHaveLength(1)
      expect(existsSync(join(instance, 'logs', start.run + '-2'))).toBe(false)
      expect(JSON.parse(readFileSync(join(root, start.run + '.json'), 'utf8')).data.state).toBe('crashed')
      expect(readFileSync(join(instance, 'logs', start.run, 'finish.log'), 'utf8').split(capacityNotice('openai/gpt-6.1-sol'))).toHaveLength(2)
      expect(theLaunchersMessagesAbout(start.run)).toEqual([])
      expect(theStops(start.run)).toEqual([['codex-capacity', 'openai/gpt-6.1-sol']])
    } finally {
      rmSync(join(root, 'capacity-case'), { force: true })
      rmSync(join(root, 'capacity-late'), { force: true })
    }
  }, 30_000)

  // Mutation: decide capacity from any line that says 'at capacity', as 13805b88c did (the inspector's refusal luJMYqhYQoH-).
  it.each([{ prose: true }, { stderr: true }])('a Sol run whose output only mentions capacity, and ends for another reason, gets no capacity sentence (%j)', async scenario => {
    writeFileSync(join(root, 'brief'), 'Synthetic capacity-in-prose brief.\n')
    writeFileSync(join(root, 'capacity-case'), JSON.stringify(scenario))
    try {
      const { start } = await started(worker('codex', 'openai/gpt-6.1-sol'))
      const calls = readFileSync(join(root, 'program-calls'), 'utf8').trim().split('\n').map(line => JSON.parse(line)).filter(one => one.run === start.run)
      expect(calls).toHaveLength(1)
      expect(JSON.parse(readFileSync(join(root, start.run + '.json'), 'utf8')).data.state).toBe('crashed')
      expect(readFileSync(join(instance, 'logs', start.run, 'finish.log'), 'utf8')).not.toContain('answered at capacity')
      expect(theLaunchersMessagesAbout(start.run)).toHaveLength(0)
      expect(theStops(start.run)).toEqual([[undefined, undefined]])
    } finally { rmSync(join(root, 'capacity-case'), { force: true }) }
  }, 30_000)

  // Mutation: a capacity stop only for a model a list of names holds, as the old list held only Sol.
  it('another Codex model at capacity is told the same way, naming its model', async () => {
    writeFileSync(join(root, 'brief'), 'Synthetic other-model capacity brief.\n')
    writeFileSync(join(root, 'capacity-case'), '{}')
    try {
      const { start } = await started(worker('codex', 'openai/gpt-6-astra'))
      const calls = readFileSync(join(root, 'program-calls'), 'utf8').trim().split('\n').map(line => JSON.parse(line)).filter(one => one.run === start.run)
      expect(calls).toHaveLength(1)
      expect(existsSync(join(instance, 'logs', start.run + '-2'))).toBe(false)
      expect(readFileSync(join(instance, 'logs', start.run, 'finish.log'), 'utf8').split(capacityNotice('openai/gpt-6-astra'))).toHaveLength(2)
      expect(theLaunchersMessagesAbout(start.run)).toHaveLength(0)
      expect(theStops(start.run)).toEqual([['codex-capacity', 'openai/gpt-6-astra']])
    } finally { rmSync(join(root, 'capacity-case'), { force: true }) }
  }, 30_000)

  // Mutation: the resend put back.
  it('an office that refuses the notice fields leaves the run unmarked, and finish.log says its words', async () => {
    writeFileSync(join(root, 'brief'), 'Synthetic older-office capacity brief.\n')
    writeFileSync(join(root, 'capacity-case'), '{}')
    writeFileSync(join(root, 'an-older-office'), '')
    try {
      const { start } = await started(worker('codex', 'openai/gpt-6.1-sol'))
      expect(theStops(start.run)).toEqual([['codex-capacity', 'openai/gpt-6.1-sol']])
      const [first] = theCrashWrites(start.run)
      expect(first.body.tellTheStarter).toBe('codex-capacity')
      expect(first.body.theModelItRanOn).toBe('openai/gpt-6.1-sol')
      const data = JSON.parse(readFileSync(join(root, start.run + '.json'), 'utf8')).data
      expect(data.state).not.toBe('crashed')
      const finish = readFileSync(join(instance, 'logs', start.run, 'finish.log'), 'utf8')
      expect(finish).toContain('could not be marked crashed')
      expect(finish).toContain('Synthetic older office: Unrecognized key: "theModelItRanOn"')
      expect(finish).not.toContain('sent again')
      expect(theLaunchersMessagesAbout(start.run)).toEqual([])
    } finally {
      rmSync(join(root, 'capacity-case'), { force: true })
      rmSync(join(root, 'an-older-office'), { force: true })
    }
  }, 30_000)

  it('retries an older office that refuses the model query and uses the rule', async () => {
    const asked: string[] = []
    const office = createServer((request, response) => {
      asked.push(request.url!)
      response.setHeader('content-type', 'application/json')
      if (new URL(request.url!, 'http://synthetic.invalid').searchParams.has('model')) {
        response.statusCode = 400
        response.end(JSON.stringify({ error: 'Which run to answer for Unrecognized key: "model"' }))
      } else response.end(JSON.stringify({ model: 'claude-sonnet-5', from: 'Casting' }))
    })
    await new Promise<void>(done => office.listen(0, '127.0.0.1', done))
    const port = (office.address() as AddressInfo).port
    expect(thePortsATestKeepsOff()).not.toContain(port)
    writeFileSync(join(root, 'effort-office'), `http://127.0.0.1:${port}`)
    writeFileSync(join(root, 'brief'), 'Synthetic brief. No model call.\n')
    try {
      const { start, seen } = await started(worker('codex', 'openai/gpt-6.1-sol'))
      config(seen.argv, 'model_reasoning_effort=xhigh')
      theFastFlagAt(seen.argv)
      expect(seen.argv[seen.argv.indexOf('-m') + 1]).toBe('gpt-6.1-sol')
      expect(start).toMatchObject({ effort: 'xhigh', effortFrom: "the owner's rule", officeUnavailable: false, officePredatesEffort: true })
      expect(JSON.parse(readFileSync(join(instance, 'logs', start.run, 'start.json'), 'utf8'))).toMatchObject({ officeUnavailable: false, officePredatesEffort: true })
      expect(start.startWords).toBe(`effort xhigh, fast mode ${codexIsFast ? 'on' : 'off'}; the office did not give an effort (it predates this change); effort from the owner's rule`)
      const namedAt = asked.findIndex(url => new URL(url, 'http://synthetic.invalid').searchParams.has('model'))
      expect(namedAt).toBeGreaterThanOrEqual(0)
      expect(new URL(asked[namedAt + 1]!, 'http://synthetic.invalid').searchParams.has('model')).toBe(false)
      const line = await started(worker('codex', 'openai/gpt-6.1-sol').slice(0, -1), true)
      expect(line.ran.out).toContain(start.startWords)
    } finally {
      rmSync(join(root, 'effort-office'), { force: true })
      await new Promise<void>((done, fail) => office.close(error => error ? fail(error) : done()))
    }
  }, 30_000)

  it('uses the rule when an older office answers without either effort field', async () => {
    const office = createServer((_request, response) => {
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ model: 'claude-sonnet-5', from: 'Casting' }))
    })
    await new Promise<void>(done => office.listen(0, '127.0.0.1', done))
    const port = (office.address() as AddressInfo).port
    expect(thePortsATestKeepsOff()).not.toContain(port)
    writeFileSync(join(root, 'effort-office'), `http://127.0.0.1:${port}`)
    writeFileSync(join(root, 'brief'), 'Synthetic brief. No model call.\n')
    try {
      const { start, seen } = await started(worker('claude-code', 'claude-opus-5-5'))
      expect(seen.argv.slice(seen.argv.indexOf('--effort'), seen.argv.indexOf('--effort') + 2)).toEqual(['--effort', 'xhigh'])
      expect(seen.effort).toBe('xhigh')
      expect(seen.argv[seen.argv.indexOf('--model') + 1]).toBe('claude-opus-5-5')
      expect(start).toMatchObject({ effort: 'xhigh', effortFrom: "the owner's rule", officeUnavailable: false, officePredatesEffort: true })
      expect(JSON.parse(readFileSync(join(instance, 'logs', start.run, 'start.json'), 'utf8'))).toMatchObject({ officeUnavailable: false, officePredatesEffort: true })
      expect(start.startWords).toBe("effort xhigh, fast mode off; the office did not give an effort (it predates this change); effort from the owner's rule")
      const line = await started(worker('claude-code', 'claude-opus-5-5').slice(0, -1), true)
      expect(line.ran.out).toContain(start.startWords)
    } finally {
      rmSync(join(root, 'effort-office'), { force: true })
      await new Promise<void>((done, fail) => office.close(error => error ? fail(error) : done()))
    }
  }, 30_000)

  it('uses the rule and says why when the office will not answer this caller (401, 403)', async () => {
    // A sandbox's helper asks with no key of its own, and the live office answers 403 (13 October 2026, run
    // X5fgmzTPnJyn). An office that will not answer this caller is one that cannot be asked: remind, not gate.
    for (const status of [401, 403]) {
      const office = createServer((_request, response) => {
        response.statusCode = status
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify({ error: 'Mole Office does not know who sent this request, so it was not answered.' }))
      })
      await new Promise<void>(done => office.listen(0, '127.0.0.1', done))
      const port = (office.address() as AddressInfo).port
      expect(thePortsATestKeepsOff()).not.toContain(port)
      writeFileSync(join(root, 'effort-office'), `http://127.0.0.1:${port}`)
      writeFileSync(join(root, 'brief'), 'Synthetic brief. No model call.\n')
      try {
        const { start, seen } = await started(worker('codex', 'openai/gpt-6.1-sol'))
        config(seen.argv, 'model_reasoning_effort=xhigh')
        theFastFlagAt(seen.argv)
        expect(start).toMatchObject({ effort: 'xhigh', effortFrom: "the owner's rule", officeUnavailable: true })
        expect(start.startWords).toContain("the office could not be asked; effort from the owner's rule")
      } finally {
        rmSync(join(root, 'effort-office'), { force: true })
        await new Promise<void>((done, fail) => office.close(error => error ? fail(error) : done()))
      }
    }
  }, 60_000)

  it('refuses an office answer with a malformed effort source', async () => {
    let fields: Record<string, unknown> = { effort: 'max', effortFrom: 'nonsense' }
    const office = createServer((_request, response) => {
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ model: 'gpt-6.1-sol', ...fields }))
    })
    await new Promise<void>(done => office.listen(0, '127.0.0.1', done))
    const port = (office.address() as AddressInfo).port
    expect(thePortsATestKeepsOff()).not.toContain(port)
    writeFileSync(join(root, 'effort-office'), `http://127.0.0.1:${port}`)
    writeFileSync(join(root, 'brief'), 'Synthetic brief. No model call.\n')
    try {
      const before = readdirSync(root).filter(file => file.startsWith('seen-'))
      for (const malformed of [fields, { effort: 'max' }, { effortFrom: 'Casting' }]) {
        fields = malformed
        const ran = await launch(worker('codex', 'openai/gpt-6.1-sol'))
        expect(ran.code).not.toBe(0)
        expect(ran.err).toContain('The office answered without a readable effort and its source.')
        expect(readdirSync(root).filter(file => file.startsWith('seen-'))).toEqual(before)
      }
    } finally {
      rmSync(join(root, 'effort-office'), { force: true })
      await new Promise<void>((done, fail) => office.close(error => error ? fail(error) : done()))
    }
  }, 30_000)

  it('passes the office effort and reminds when Casting differs from the rule', async () => {
    const asked: string[] = []
    let unnamedModel = 'gpt-6.1-sol'
    let chosenEffort = 'max'
    let changeAfterNextRead = false
    const office = createServer((request, response) => {
      asked.push(request.url!)
      response.setHeader('content-type', 'application/json')
      const model = new URL(request.url!, 'http://synthetic.invalid').searchParams.get('model') ?? unnamedModel
      response.end(JSON.stringify({ model, effort: chosenEffort, effortFrom: 'Casting' }))
      if (changeAfterNextRead) { chosenEffort = 'xhigh'; changeAfterNextRead = false }
    })
    await new Promise<void>(done => office.listen(0, '127.0.0.1', done))
    const port = (office.address() as AddressInfo).port
    expect(thePortsATestKeepsOff()).not.toContain(port)
    writeFileSync(join(root, 'effort-office'), `http://127.0.0.1:${port}`)
    writeFileSync(join(root, 'brief'), 'Synthetic brief. No model call.\n')
    try {
      const workerStart = await started(worker('claude-code', 'claude-opus-5-5'))
      expect(workerStart.seen.argv.slice(workerStart.seen.argv.indexOf('--effort'), workerStart.seen.argv.indexOf('--effort') + 2)).toEqual(['--effort', 'max'])
      expect(workerStart.seen.effort).toBe('max')
      expect(workerStart.start).toMatchObject({ effort: 'max', effortFrom: 'Casting', ruleEffort: 'xhigh' })
      expect(workerStart.start.startWords).toContain("effort max (Casting row), the owner's rule says xhigh for this model")
      const next = await started(['round', ...worker('claude-code', 'claude-opus-5-5').slice(1)])
      expect(next.seen.effort).toBe('max')
      const codex = await started(worker('codex', 'openai/gpt-6.1-sol'))
      config(codex.seen.argv, 'model_reasoning_effort=max')
      theFastFlagAt(codex.seen.argv)
      const line = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        rmSync(join(root, 'seen-undefined.json'), { force: true })
        let recorded = ''
        const native = await new CodexAdapter({ ...env, CLAUDE_CODE_EFFORT_LEVEL: 'xhigh' }, { model: 'gpt-6.1-sol', variant: null }).start({ session: 'synthetic-office-native', agent: 'synthetic-codex', prompt: 'Synthetic task', cwd: instance, api: `http://127.0.0.1:${port}`, workspace: 'default', outputPath: join(root, 'office-native-output'), recordEffort: async effort => {
          expect(existsSync(join(root, 'seen-undefined.json'))).toBe(false)
          recorded = effort
        } })
        expect(recorded).toBe('max')
        groups.add(native.pgid)
        await until(() => existsSync(native.exitCodePath!))
        const seen = JSON.parse(readFileSync(join(root, 'seen-undefined.json'), 'utf8'))
        config(seen.argv, 'model_reasoning_effort=max')
        expect(seen.argv.slice(seen.argv.indexOf('-m'), seen.argv.indexOf('-m') + 2)).toEqual(['-m', 'gpt-6.1-sol'])
        expect(line.mock.calls.flat().join('\n')).toContain("effort max (Casting row), the owner's rule says xhigh for this model")
        // A Codex run the office named no model for is refused, even when an older office answers a model of its own.
        unnamedModel = 'claude-sonnet-5'
        rmSync(join(root, 'seen-undefined.json'), { force: true })
        let otherRecorded = false
        await expect(new CodexAdapter(env).start({ session: 'synthetic-other-native', agent: 'synthetic-codex', prompt: 'Synthetic task', cwd: instance, api: `http://127.0.0.1:${port}`, workspace: 'default', outputPath: join(root, 'other-native-output'), recordEffort: async () => { otherRecorded = true } }))
          .rejects.toThrow("so it is not started on Codex's own configuration.")
        expect(otherRecorded).toBe(false)
        expect(existsSync(join(root, 'seen-undefined.json'))).toBe(false)
        const open = await new OpenCodeAdapter(env, { model: 'deepseek/deepseek-v4.1-flash', variant: 'high' }).start({ session: 'synthetic-office-open', agent: 'synthetic-codex', prompt: 'Synthetic task', cwd: instance, api: `http://127.0.0.1:${port}`, workspace: 'default', outputPath: join(root, 'office-open-output') })
        groups.add(open.pgid)
        await until(() => existsSync(open.exitCodePath!))
        const seenOpen = JSON.parse(readFileSync(join(root, 'seen-undefined.json'), 'utf8'))
        expect(seenOpen.argv.slice(seenOpen.argv.indexOf('--variant'), seenOpen.argv.indexOf('--variant') + 2)).toEqual(['--variant', 'max'])
      } finally { line.mockRestore() }
      const before = readdirSync(root).filter(file => file.startsWith('seen-'))
      const conflict = await launch(['exec', 'synthetic', '--agent', 'synthetic-exec', '--runtime', 'claude-code', '--model', 'claude-opus-5-5', '--json', '--', 'claude', '--effort', 'xhigh'])
      expect(conflict.code).not.toBe(0)
      expect(conflict.err).toContain('caller sets --effort to xhigh')
      expect(conflict.err).toContain('office answers max')
      expect(readdirSync(root).filter(file => file.startsWith('seen-'))).toEqual(before)
      expect(asked.some(url => url.includes('model=claude-opus-5-5'))).toBe(true)
      expect(asked.some(url => url.includes('runtime=codex') && !url.includes('model='))).toBe(true)
      changeAfterNextRead = true
      const changed = await started(worker('claude-code', 'claude-opus-5-5'))
      // A run keeps the host's one answer even if Casting changes before its helper starts.
      expect(changed.seen.effort).toBe('max')
      expect(changed.start.effort).toBe('max')
      const later = await started(worker('claude-code', 'claude-opus-5-5'))
      expect(later.seen.effort).toBe('xhigh')
    } finally {
      rmSync(join(root, 'effort-office'), { force: true })
      await new Promise<void>((done, fail) => office.close(error => error ? fail(error) : done()))
    }
  }, 30_000)

  it('uses the rule and says why when the stand-in office is closed', async () => {
    const office = createServer()
    await new Promise<void>(done => office.listen(0, '127.0.0.1', done))
    const port = (office.address() as AddressInfo).port
    expect(thePortsATestKeepsOff()).not.toContain(port)
    await new Promise<void>((done, fail) => office.close(error => error ? fail(error) : done()))
    writeFileSync(join(root, 'effort-office'), `http://127.0.0.1:${port}`)
    try {
      const { start, seen } = await started(worker('claude-code', 'claude-opus-5-5'))
      expect(seen.effort).toBe('xhigh')
      expect(start.effortFrom).toBe("the owner's rule")
      expect(start.startWords).toContain("the office could not be asked; effort from the owner's rule")
      const line = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        const native = await new CodexAdapter(env, { model: 'gpt-6.1-sol', variant: null }).start({ session: 'synthetic-closed-native', agent: 'synthetic-codex', prompt: 'Synthetic task', cwd: instance, api: `http://127.0.0.1:${port}`, workspace: 'default', outputPath: join(root, 'closed-native-output'), recordEffort: async () => { throw new Error('The closed office cannot file a value.') } })
        groups.add(native.pgid)
        await until(() => existsSync(native.exitCodePath!))
        const seenNative = JSON.parse(readFileSync(join(root, 'seen-undefined.json'), 'utf8'))
        config(seenNative.argv, 'model_reasoning_effort=xhigh')
        theFastFlagAt(seenNative.argv)
        expect(line.mock.calls.flat().join('\n')).toContain("the office could not be asked; effort from the owner's rule")
        // With no model named and no office to ask, a Codex run is refused rather than started on Codex's own configuration.
        rmSync(join(root, 'seen-undefined.json'), { force: true })
        await expect(new CodexAdapter(env).start({ session: 'synthetic-closed-unnamed', agent: 'synthetic-codex', prompt: 'Synthetic task', cwd: instance, api: `http://127.0.0.1:${port}`, workspace: 'default', outputPath: join(root, 'closed-unnamed-output'), recordEffort: async () => { throw new Error('The closed office cannot file a value.') } }))
          .rejects.toThrow("so it is not started on Codex's own configuration. Name one on the agent's profile, or fill in its Casting row on the Casting page. The office could not be asked. Nothing was started.")
        expect(existsSync(join(root, 'seen-undefined.json'))).toBe(false)
      } finally { line.mockRestore() }
    } finally { rmSync(join(root, 'effort-office'), { force: true }) }
  })

  it('loads the shared module in a plain Node process without TypeScript support', () => {
    const plainEnv = { ...withoutInheritedEffort() }
    delete plainEnv['NODE_OPTIONS']
    const plainNode = process.env['MOLE_TEST_PLAIN_NODE'] ?? process.execPath
    const version = execFileSync(plainNode, ['--version'], { env: plainEnv, encoding: 'utf8' }).trim()
    // Node 22 can strip types itself. Turn that off to exercise the host Node 18 import boundary.
    const args = Number(version.slice(1).split('.')[0]) >= 22 ? ['--no-experimental-strip-types'] : []
    const output = execFileSync(plainNode, [...args, '--input-type=module', '-e', "await import('./tools/sandbox-common.mjs'); await import('./src/config/model-efforts.mjs'); console.log('sandbox-common.mjs loaded without a TypeScript loader')"], { cwd: repo, env: plainEnv, encoding: 'utf8' })
    expect(output.trim()).toBe('sandbox-common.mjs loaded without a TypeScript loader')
  })

  it('passes the owner’s Codex values through the native adapter, with the model the office chose', async () => {
    const file = join(root, 'seen-undefined.json')
    rmSync(file, { force: true })
    const adapter = new CodexAdapter(env, { model: 'gpt-6.1-sol', variant: null })
    const line = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const host = await adapter.start({ session: 'synthetic-native', agent: 'synthetic-codex', prompt: 'Synthetic task', cwd: instance, api: 'http://synthetic.invalid', workspace: 'default', outputPath: join(root, 'native-output') })
      groups.add(host.pgid)
      await until(() => existsSync(file) && existsSync(host.exitCodePath!))
      const seen = JSON.parse(readFileSync(file, 'utf8')) as { argv: string[] }
      const effortAt = config(seen.argv, 'model_reasoning_effort=xhigh')
      expect(effortAt).toBeLessThan(seen.argv.indexOf('--'))
      for (let at = 0; at < seen.argv.length; at++) {
        if (seen.argv[at] === '-c' && !['model_reasoning_effort=xhigh', 'service_tier=fast'].includes(seen.argv[at + 1]!)) expect(effortAt).toBeGreaterThan(at)
      }
      const tierAt = theFastFlagAt(seen.argv)
      if (tierAt !== null) expect(tierAt).toBeGreaterThan(effortAt)
      expect(seen.argv.filter(one => one === '-m')).toHaveLength(1)
      expect(seen.argv.slice(seen.argv.indexOf('-m'), seen.argv.indexOf('-m') + 2)).toEqual(['-m', 'gpt-6.1-sol'])
      expect(seen.argv).not.toContain('--model')
      expect(line.mock.calls.flat().join('\n')).toContain(`model gpt-6.1-sol; effort xhigh, fast mode ${codexIsFast ? 'on' : 'off'}`)
      expect(line.mock.calls.flat().join('\n')).not.toContain("Codex's own default")
      expect('variantItWouldUse' in adapter).toBe(false)
    } finally { line.mockRestore() }
    for (const command of [['claude', '-p', 'Synthetic task'], ['opencode', 'run', 'Synthetic task']]) {
      const given = aCommandsStartValues(command)
      expect(given.command).toEqual(command)
      expect(given.env).toEqual({})
    }
    expect(aCommandsStartValues(['dsh', '--profile', 'office']).command).toEqual(['dsh', '--profile', 'office'])
  })

  it('starts a shell wrapper with the Claude effort environment and says which flags could not pass', async () => {
    const { start, seen } = await started(['exec', 'synthetic', '--agent', 'synthetic-exec', '--runtime', 'claude-code', '--model', 'claude-opus-5-5', '--json', '--', 'sh', '-c', 'exec claude --model claude-opus-5-5'])
    expect(seen.effort).toBe('xhigh')
    expect(seen.argv).toEqual(['--model', 'claude-opus-5-5'])
    expect(start.startWords).toContain('effort xhigh, fast mode off')
    expect(start.startWords).toContain('flags could not be passed into a shell-wrapped command')
    const args = ['exec', 'synthetic', '--agent', 'synthetic-exec', '--runtime', 'claude-code', '--model', 'claude-opus-5-5', '--', 'sh', '-c', 'exec claude --model claude-opus-5-5']
    const ran = await launch(args)
    expect(ran.code, ran.err).toBe(0)
    expect(ran.out).toContain('flags could not be passed into a shell-wrapped command')
  }, 30_000)

  it('passes the Claude worker flag and environment', async () => {
    writeFileSync(join(root, 'brief'), 'Synthetic brief. No model call.\n')
    const { start, seen } = await started(worker('claude-code', 'claude-opus-5-5'))
    expect(seen.argv.slice(seen.argv.indexOf('--effort'), seen.argv.indexOf('--effort') + 2)).toEqual(['--effort', 'xhigh'])
    expect(seen.effort).toBe('xhigh')
    expect(start.effort).toBe('xhigh')
    expect(JSON.parse(readFileSync(join(root, start.run + '.json'), 'utf8')).data.effort).toBe('xhigh')
    // The shared host launcher must use the same row; this program is the same stand-in on PATH.
    const request = { session: 'synthetic-host', agent: 'synthetic-claude', prompt: 'Synthetic task', cwd: instance, api: 'http://synthetic.invalid', workspace: 'default', outputPath: join(root, 'host-output') }
    rmSync(join(root, 'seen-undefined.json'), { force: true })
    // A start on the host: the SANDBOX_DIR of a machine this test runs on is not this start's, and in a sandbox a
    // conversation keeps the sandbox's window (wave 13q round 58).
    const onTheHost = Object.fromEntries(Object.entries(env).filter(([name]) => name !== 'SANDBOX_DIR'))
    const host = await startModelRun({ runtime: 'claude-code', commandFor: () => ({ command: 'claude', args: ['--model', 'claude-opus-5-5'] }) }, request, onTheHost)
    groups.add(host.pgid)
    const file = join(root, 'seen-undefined.json')
    await until(() => existsSync(file) && existsSync(host.exitCodePath!))
    const seenHost = JSON.parse(readFileSync(file, 'utf8'))
    // A Claude Code conversation started here is also given its compaction window, from the host's setting at its
    // declared default (wave 13q round 58).
    const theWindow = String(settingNamed(THE_COMPACTION_SETTINGS.host).fallback)
    expect(seenHost.argv).toEqual(['--model', 'claude-opus-5-5', '--effort', 'xhigh', '--settings', JSON.stringify({ env: { [THE_COMPACTION_VARIABLE]: theWindow } })])
    expect(seenHost.effort).toBe('xhigh')
  }, 30_000)

  it('passes both Codex values to a worker and its round after the caller’s configuration, and a round’s before resume', async () => {
    const first = await started(worker('codex', 'openai/gpt-6.1-sol'))
    const next = await started(['round', ...worker('codex', 'openai/gpt-6.1-sol').slice(1)])
    expect(next.seen.argv).toContain('resume')
    expect(next.seen.argv).toContain(thread)
    for (const { seen } of [first, next]) {
      const effort = config(seen.argv, 'model_reasoning_effort=xhigh')
      const tier = theFastFlagAt(seen.argv)
      expect(effort).toBeGreaterThan(seen.argv.indexOf('mcp_servers.mole_office.enabled=true'))
      if (tier !== null) expect(tier).toBeGreaterThan(effort)
    }
    // A -c given to `resume` makes Codex drop every -c given to exec before it, office_request's included (measured on
    // Codex 0.159.2, 13 October 2026), so a round's two values stay among exec's own options.
    const nextTier = theFastFlagAt(next.seen.argv)
    if (nextTier !== null) expect(nextTier).toBeLessThan(next.seen.argv.indexOf('resume'))
    const own = await started(['exec', 'synthetic', '--agent', 'synthetic-exec', '--runtime', 'codex', '--model', 'openai/gpt-6.1-sol', '--json', '--', 'codex', 'exec', '-c', 'synthetic_setting=true', 'Synthetic prompt'])
    expect(config(own.seen.argv, 'model_reasoning_effort=xhigh')).toBeGreaterThan(own.seen.argv.indexOf('synthetic_setting=true'))
    const ownTier = theFastFlagAt(own.seen.argv)
    if (ownTier !== null) expect(ownTier).toBeGreaterThan(own.seen.argv.indexOf('synthetic_setting=true'))
  }, 30_000)

  it('refuses an unknown model when the Office answers with no native selection', async () => {
    // Missing effort now reminds rather than gates; replace the former refusal check.
    const office = createServer((request, response) => {
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ model: new URL(request.url!, 'http://synthetic.invalid').searchParams.get('model'), effort: null, effortFrom: 'none' }))
    })
    await new Promise<void>(done => office.listen(0, '127.0.0.1', done))
    const port = (office.address() as AddressInfo).port
    expect(thePortsATestKeepsOff()).not.toContain(port)
    writeFileSync(join(root, 'effort-office'), `http://127.0.0.1:${port}`)
    try {
      const before = readdirSync(root).filter(file => file.startsWith('seen-'))
      for (const [runtime, model] of [['codex', 'openai/synthetic-unknown'], ['claude-code', 'synthetic-unknown']]) {
        const ran = await launch(worker(runtime!,model!))
        expect(ran.code,ran.err).not.toBe(0)
        expect(ran.err).toMatch(/The office gave no native selection for model/i)
      }
      expect(readdirSync(root).filter(file => file.startsWith('seen-'))).toEqual(before)
    } finally {
      rmSync(join(root, 'effort-office'), { force: true })
      await new Promise<void>((done, fail) => office.close(error => error ? fail(error) : done()))
    }
  }, 30_000)

  it('refuses an unknown model offline when no exact compatibility data exists', async () => {
    const office = createServer()
    await new Promise<void>(done => office.listen(0, '127.0.0.1', done))
    const port = (office.address() as AddressInfo).port
    expect(thePortsATestKeepsOff()).not.toContain(port)
    await new Promise<void>((done, fail) => office.close(error => error ? fail(error) : done()))
    writeFileSync(join(root, 'effort-office'), `http://127.0.0.1:${port}`)
    try {
      const before = readdirSync(root).filter(file => file.startsWith('seen-'))
      for (const [runtime, model] of [['codex', 'openai/synthetic-unknown'], ['claude-code', 'synthetic-unknown']]) {
        const ran = await launch(worker(runtime!,model!))
        expect(ran.code,ran.err).not.toBe(0)
        expect(ran.err).toMatch(/complete native selection|exact legacy compatibility/i)
      }
      expect(readdirSync(root).filter(file => file.startsWith('seen-'))).toEqual(before)
    } finally { rmSync(join(root, 'effort-office'), { force: true }) }
  }, 30_000)

  it('refuses a conflicting caller effort and names both values', async () => {
    const before = readdirSync(root).filter(file => file.startsWith('seen-'))
    const ran = await launch(['exec', 'synthetic', '--agent', 'synthetic-exec', '--runtime', 'codex', '--model', 'openai/gpt-6.1-sol', '--json', '--', 'codex', 'exec', '-c', 'model_reasoning_effort=high', 'Synthetic prompt'])
    expect(ran.code).not.toBe(0)
    expect(ran.err).toContain('caller sets model_reasoning_effort to high')
    expect(ran.err).toContain('table sets it to xhigh')
    expect(readdirSync(root).filter(file => file.startsWith('seen-'))).toEqual(before)
  })

  it('refuses a secret-line effort that differs from the selected row, naming the secret lines and the row', async () => {
    const model = 'claude-opus-5-5'
    const selectedEffort = 'synthetic-row-effort'
    const secretEffort = 'synthetic-secret-effort'
    const selection = { runtime: 'claude-code', model, native: { model: 'synthetic-native', provider: null, variant: null, effort: selectedEffort }, casting: { id: 4242, revision: 'synthetic-revision' } }
    const secretsFile = join(root, 'secrets')
    const templateFile = join(root, 'template', 'sandbox.json')
    const secrets = readFileSync(secretsFile, 'utf8')
    const template = readFileSync(templateFile, 'utf8')
    writeFileSync(join(root, 'native-selection'), JSON.stringify({ selection }))
    writeFileSync(secretsFile, `${secrets}CLAUDE_CODE_EFFORT_LEVEL=${secretEffort}\n`, { mode: 0o600 })
    const declared = JSON.parse(template)
    declared.secrets.names = [...declared.secrets.names, { name: 'CLAUDE_CODE_EFFORT_LEVEL', readBy: ['claude'] }]
    writeFileSync(templateFile, JSON.stringify(declared))
    const requestsFile = join(root, 'requests')
    const requestsBefore = readFileSync(requestsFile, 'utf8').length
    const seenBefore = readdirSync(root).filter(file => file.startsWith('seen-'))
    try {
      const ran = await launch(worker('claude-code', model))
      expect(ran.code).not.toBe(0)
      expect(ran.err).toContain('CLAUDE_CODE_EFFORT_LEVEL')
      expect(ran.err).toContain(secretEffort)
      expect(ran.err).toContain('secret lines')
      expect(ran.err).toContain(selectedEffort)
      expect(ran.err).toContain('4242')
      const details = [...ran.err.matchAll(/Details: (\S+)/g)].map(match => match[1]!)
      expect(ran.err + details.map(file => existsSync(file) ? readFileSync(file, 'utf8') : '').join('')).toContain('Nothing was started.')
      const wrote = readFileSync(requestsFile, 'utf8').slice(requestsBefore).split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(call => call.method !== 'GET')
      expect(wrote).toEqual([])
      expect(readdirSync(root).filter(file => file.startsWith('seen-'))).toEqual(seenBefore)
    } finally {
      rmSync(join(root, 'native-selection'), { force: true })
      writeFileSync(secretsFile, secrets, { mode: 0o600 })
      writeFileSync(templateFile, template)
    }
  }, 30_000)

  it('says the effort and fast mode on the start line', async () => {
    const args = worker('codex', 'openai/gpt-6.1-sol')
    args[args.indexOf('--agent') + 1] = 'synthetic-exec'
    args.pop()
    const ran = await launch(args)
    expect(ran.code, ran.err).toBe(0)
    expect(ran.out).toContain(`effort xhigh, fast mode ${codexIsFast ? 'on' : 'off'}`)
  })

  it('keeps the Codex unsupported-tier warning in the run’s log', async () => {
    const answer = await started(worker('codex', 'openai/gpt-6.1-sol'))
    const log = join(instance, 'logs', answer.start.run, 'helper.log')
    await until(() => existsSync(log) && readFileSync(log, 'utf8').includes('does not support service tier'), 'the unsupported-tier line in helper.log')
    expect(readFileSync(log, 'utf8')).toContain('model gpt-6.1-sol does not support service tier fast')
  }, 30_000)

  it('holds exactly the models the office names', async () => {
    const source = readFileSync(join(repo, 'src/shared/model-names.ts'), 'utf8')
    // Read the private table in memory. The source file is never changed, and its quote style does not matter.
    const reader = stripTypeScriptTypes(source) + '\nexport const namesForTheTest = Object.keys(MODEL_NAMES)\n'
    const names = (await import('data:text/javascript;base64,' + Buffer.from(reader).toString('base64'))).namesForTheTest as string[]
    expect(Object.keys(THE_MODELS_START_VALUES).sort()).toEqual(names.sort())
  })

  it('checks every caller spelling and uses the OpenCode variant', async () => {
    for (const command of [
      ['claude', '--model', 'claude-opus-5-5', '--effort', 'high'],
      ['claude', '--model=claude-opus-5-5', '--effort=high'],
      ['claude', '--model', 'claude-opus-5-5', '--effort', '"xhigh"'],
      ['opencode', '-m', 'deepseek/deepseek-v4.1-flash', '--variant', 'high'],
      ['codex', '-mgpt-6.1-sol', '--config=model_reasoning_effort="high"'],
      ['codex', '-m', 'gpt-6.1-sol', '-cservice_tier=auto'],
      ['env', 'CLAUDE_CODE_EFFORT_LEVEL=high', 'claude', '--model', 'claude-opus-5-5'],
      ['env', 'CLAUDE_CODE_EFFORT_LEVEL="xhigh"', 'claude', '--model', 'claude-opus-5-5'],
    ]) expect(() => aCommandsStartValues(command)).toThrow(/caller sets.*table sets/)
    const open = aCommandsStartValues(['opencode', 'run', '-m', 'deepseek/deepseek-v4.1-flash'])
    expect(open.command.slice(-2)).toEqual(['--variant', 'max'])
    expect(open.start?.words).toBe('effort max, fast mode off')
    const dsh = aCommandsStartValues(['dsh', '--profile', 'office'], { model: 'deepseek-v4.1-flash' })
    expect(dsh.start?.words).toContain('effort max, fast mode off')
    expect(dsh.start?.words).toContain('fresh native session')
    expect(dsh.command).toEqual(['dsh', '--profile', 'office'])
    const openStart = await started(['exec', 'synthetic', '--agent', 'synthetic-exec', '--runtime', 'opencode', '--model', 'deepseek/deepseek-v4.1-flash', '--json', '--', 'opencode', 'run', '-m', 'deepseek/deepseek-v4.1-flash', 'Synthetic prompt'])
    expect(openStart.seen.argv.slice(-2)).toEqual(['--variant', 'max'])
    const dshStart = await started(['exec', 'synthetic', '--agent', 'synthetic-exec', '--runtime', 'dsh', '--model', 'deepseek-v4.1-flash', '--json', '--', 'dsh', '--profile', 'office', '--', join(root, 'brief')])
    expect(dshStart.start.startWords).toContain('effort max, fast mode off')
    expect(dshStart.seen.argv.slice(0, 4)).toEqual([...DSH_FEATURES_OFF, '--profile', 'office'])
    expect(dshStart.seen.argv).toContain('--patch')
  }, 30_000)
})

// A Codex stop ends its run and its starter is told once in its sentence (18 October 2026; for every Codex model
// since 1 November 2026). The office writes it from the crash write's notice kind and model; the launcher keeps it in the
// run's detail and its finish.log. The owner's decision is why nothing is started again.
const NOTHING_STARTED_AGAIN = 'so this run has ended. Nothing was started again on another model; its supervisor chooses what comes next.'
const capacityNotice = (model: string) => `The model ${model} answered at capacity, ${NOTHING_STARTED_AGAIN}`
const usageLimitNotice = (model: string) => `Codex rate-limited ${model}, ${NOTHING_STARTED_AGAIN}`
/** Every message the launcher filed about a run: it sends none for a Codex stop, because the office tells the starter. */
function theLaunchersMessagesAbout(run: string) {
  return readFileSync(join(root, 'requests'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
    .filter(one => one.path === '/api/records' && one.method === 'POST' && one.body.kind === 'message' && one.body.data.aboutRun === run)
}
/** The launcher's writes that crash a run, each with the notice kind it asks the office to tell the starter, if any. */
function theCrashWrites(run: string) {
  return readFileSync(join(root, 'requests'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
    .filter(one => one.path === `/api/records/${run}` && one.method === 'PATCH' && one.body.dataPatch?.state === 'crashed')
}
/** Each crash write's notice kind and the model it names, as a pair: [undefined, undefined] when it asks for no notice. */
function theStops(run: string) {
  return theCrashWrites(run).map(one => [one.body.tellTheStarter, one.body.theModelItRanOn])
}
// WHERE A SOL CAPACITY ANSWER IS READ: only from Codex's own final error event (the inspector's refusal luJMYqhYQoH-).
// Mutations: read any line's words; read words when the event carries a code; read past a later record.
describe('codexCapacityAtTheEnd reads only Codex\'s own final error event', () => {
  const said = 'Selected model is at capacity. Please try a different model.'
  const lines = (...records: unknown[]) => { const file = join(root, 'capacity-unit.jsonl'); writeFileSync(file, records.map(one => typeof one === 'string' ? one : JSON.stringify(one)).join('\n') + '\n'); return file }
  it('is true for the error event and turn.failed Codex wrote at capacity', () => {
    expect(codexCapacityAtTheEnd(lines({ type: 'error', message: said }, { type: 'turn.failed', error: { message: said } }))).toBe(true)
    expect(codexCapacityAtTheEnd(lines({ type: 'turn.failed', error: { message: said } }))).toBe(true)
  })
  it('is false when only prose or plain text says it', () => {
    expect(codexCapacityAtTheEnd(lines({ type: 'item.completed', item: { type: 'agent_message', text: 'the model was at capacity' } }, { type: 'turn.failed', error: { message: 'Synthetic transport ending', codex_error_info: 'transport_error' } }))).toBe(false)
    expect(codexCapacityAtTheEnd(lines('Synthetic provider: at capacity'))).toBe(false)
  })
  it('is false when the final error carries a code, whatever its words say', () => {
    expect(codexCapacityAtTheEnd(lines({ type: 'turn.failed', error: { message: said, codex_error_info: 'transport_error' } }))).toBe(false)
  })
  it('is false when a record follows the error', () => {
    expect(codexCapacityAtTheEnd(lines({ type: 'error', message: said }, { type: 'item.completed', item: { type: 'agent_message', text: 'Synthetic later message' } }))).toBe(false)
  })
})

// Synthetic Codex endings prove the authorized notice branch (6v1KsG2nw-KS). Luna is asked again on OpenCode because of
// the owner's decision, and Luna's entry in the compatibility table's askAgainAfterACodexUsageLimit says where; it is
// read here, so this case follows the table. The sentence names the model as the run's start
// gave it.
type WhereToAskAgain = { runtime: string; model: string }
const lunasEntry = (LAUNCHER_MODEL_COMPATIBILITY as { askAgainAfterACodexUsageLimit?: Record<string, WhereToAskAgain> }).askAgainAfterACodexUsageLimit?.['gpt-6-luna']
const lunaLimitNotice = `Codex rate-limited openai/gpt-6-luna, so ask again with runtime ${lunasEntry?.runtime} and model ${lunasEntry?.model}.`
describe('Luna\'s starter is told how to restart after a Codex limit', () => {
  afterEach(() => rmSync(join(root, 'luna-case'), { force: true }))
  it.each([{ code: 'rate_limit_exceeded' }, { code: 'usage_limit_exceeded' }, { stream: 'error' }, { stream: 'turn.failed' }])('%j gives the exact restart sentence once in finish.log, and asks the office to tell its starter', async scenario => {
    writeFileSync(join(root, 'brief'), 'Synthetic Luna limit brief.\n')
    writeFileSync(join(root, 'luna-case'), JSON.stringify(scenario))
    expect(lunasEntry, "Luna's entry in askAgainAfterACodexUsageLimit").toMatchObject({ runtime: expect.any(String), model: expect.any(String) })
    const { start } = await started(worker('codex', 'openai/gpt-6-luna'))
    const calls = readFileSync(join(root, 'program-calls'), 'utf8').trim().split('\n').map(line => JSON.parse(line)).filter(one => one.run === start.run)
    expect(calls).toHaveLength(1)
    expect(existsSync(join(instance, 'logs', start.run + '-2'))).toBe(false)
    const finish = readFileSync(join(instance, 'logs', start.run, 'finish.log'), 'utf8')
    expect(finish.split(lunaLimitNotice)).toHaveLength(2)
    // THE OFFICE TELLS THE STARTER from the crash write's notice kind; the launcher sends no message (problem Grbb87VX3pND).
    expect(theLaunchersMessagesAbout(start.run)).toEqual([])
    expect(theStops(start.run)).toEqual([['codex-usage-limit', 'openai/gpt-6-luna']])
    expect(JSON.parse(readFileSync(join(root, start.run + '.json'), 'utf8')).data).toMatchObject({ runtime: 'codex', model: 'openai/gpt-6-luna', state: 'crashed' })
  }, 30_000)
  it.each([{ code: 'transport_error' }, { prose: true }])('an ordinary ending %j gives no limit instruction or retry', async scenario => {
    writeFileSync(join(root, 'brief'), 'Synthetic ordinary failure')
    writeFileSync(join(root, 'luna-case'), JSON.stringify(scenario))
    const { start } = await started(worker('codex', 'openai/gpt-6-luna'))
    const calls = readFileSync(join(root, 'program-calls'), 'utf8').trim().split('\n').map(line => JSON.parse(line)).filter(one => one.run === start.run)
    expect(calls).toHaveLength(1)
    expect(existsSync(join(instance, 'logs', start.run + '-2'))).toBe(false)
    expect(readFileSync(join(instance, 'logs', start.run, 'finish.log'), 'utf8')).not.toContain('rate-limited')
    expect(theLaunchersMessagesAbout(start.run)).toHaveLength(0)
    expect(theStops(start.run)).toEqual([[undefined, undefined]])
  })
})

it('a Codex Luna run holds no OpenCode login in its helper, child or logs', async () => {
  const templateFile = join(root, 'template/sandbox.json'), secretsFile = join(root, 'secrets')
  const originalTemplate = readFileSync(templateFile, 'utf8'), originalSecrets = readFileSync(secretsFile, 'utf8')
  const template = JSON.parse(originalTemplate)
  template.secrets.names.push({ name: 'OPENCODE_API_KEY', readBy: ['opencode'] })
  writeFileSync(templateFile, JSON.stringify(template)); writeFileSync(secretsFile, originalSecrets + 'OPENCODE_API_KEY=synthetic-go-login\n')
  writeFileSync(join(root, 'brief'), 'Synthetic private login boundary')
  writeFileSync(join(root, 'luna-case'), JSON.stringify({ code: 'rate_limit_exceeded' }))
  try {
    const { start } = await started(worker('codex', 'openai/gpt-6-luna'))
    const calls = readFileSync(join(root, 'program-calls'), 'utf8').trim().split('\n').map(line => JSON.parse(line)).filter(one => one.run === start.run)
    expect(calls).toHaveLength(1)
    expect(calls[0].env.OPENCODE_API_KEY).toBeUndefined()
    const helpers = readFileSync(join(root, 'helper-environments'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
    expect(helpers.at(-1).OPENCODE_API_KEY).toBeUndefined()
    for (const file of ['start.json', 'finish.log', 'launch.log', 'out']) {
      const name = join(instance, 'logs', start.run, file)
      if (existsSync(name)) expect(readFileSync(name, 'utf8')).not.toContain('synthetic-go-login')
    }
  } finally {
    writeFileSync(templateFile, originalTemplate); writeFileSync(secretsFile, originalSecrets); rmSync(join(root, 'luna-case'), { force: true })
  }
}, 30_000)

// Shell metadata records a request without claiming the native settings handoff consumed it.
it('a shell-started DSH records the unapplied request and the exact explanation without a selection envelope', async () => {
  const model = 'deepseek-v4.1-flash'
  const sentence = "The DSH model and effort selection was not applied because a shell command cannot carry it; DSH's saved settings decide."
  writeFileSync(join(root, 'native-selection'), JSON.stringify({ model, effort: 'high', effortFrom: 'Casting' }))
  try {
    for (const prefix of [[], ['env', 'SYNTHETIC_SHELL=1']]) {
      const command = [...prefix, 'bash', '-lc', 'exec "$1" --profile office', 'synthetic-shell', join(root, 'bin/dsh')]
      const built = aCommandsStartValues(command, { runtime: 'dsh', model, effortAnswer: { effort: 'high', effortFrom: 'Casting' } })
      expect(built.command).toEqual(command)
      expect(built.start).toMatchObject({ model: null, requestedModel: model, effort: null, requestedEffort: 'high', effortFrom: 'Casting', words: sentence })
      expect(built.env).not.toHaveProperty('SANDBOX_DSH_SELECTION')
      const { start, seen, ran } = await started(['exec', 'synthetic', '--agent', 'synthetic-exec', '--runtime', 'dsh', '--model', model, '--', ...command], true)
      expect(start).toMatchObject({ model: null, requestedModel: model, effort: null, requestedEffort: 'high', effortFrom: 'Casting', startWords: sentence })
      expect(ran.out.split(sentence)).toHaveLength(2)
      expect(seen.env).not.toHaveProperty('SANDBOX_DSH_SELECTION')
      expect(seen.env).not.toHaveProperty('MOLE_OFFICE_AGENT_MODEL')
      expect(seen.argv).not.toContain('--patch')
      const filed = JSON.parse(readFileSync(join(root, start.run + '.json'), 'utf8'))
      expect(filed.data.model).toBe(model) // The canonical continuation request stays on the run.
      expect(filed.data.effort == null).toBe(true)
      expect(JSON.stringify(filed.data).split(sentence)).toHaveLength(2)
    }
  } finally { rmSync(join(root, 'native-selection'), { force: true }) }
}, 30_000)

it('direct and env-prefixed DSH still apply the selection through their real private patch', async () => {
  const model = 'deepseek-v4.1-flash'
  writeFileSync(join(root, 'native-selection'), JSON.stringify({ model, effort: 'high', effortFrom: 'Casting' }))
  try {
    for (const prefix of [[], ['env', 'SYNTHETIC_NATIVE=1']]) {
      const { start, seen } = await started(['exec', 'synthetic', '--agent', 'synthetic-exec', '--runtime', 'dsh', '--model', model, '--json', '--', ...prefix, 'dsh', '--profile', 'office'])
      expect(start).toMatchObject({ model, effort: 'high', requestedEffort: 'high', effortFrom: 'Casting' })
      expect(start.startWords).not.toContain('selection was not applied')
      expect(JSON.parse(seen.env.SANDBOX_DSH_SELECTION!)).toMatchObject({ model, effort: 'high' })
      expect(seen.argv).toContain('--patch')
      expect((seen as any).settings).toMatchObject({ 'agent-default-model': { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'high' }, 'llm-deepseek': { reasoningEffort: 'high' } })
      expect(JSON.parse(readFileSync(join(root, start.run + '.json'), 'utf8')).data).toMatchObject({ model, effort: 'high' })
    }
  } finally { rmSync(join(root, 'native-selection'), { force: true }) }
}, 30_000)

// B2/B4: synthetic Office selections and native programs only; no native plugin or model starts.
describe('DSH and OpenCode worker rounds use their own filed run', () => {
  afterEach(() => rmSync(join(root, 'native-selection'), { force: true }))

  it.each(['dsh', 'opencode'])('%s carries Office model, effort, cut, brief and identity through worker and round', async runtime => {
    const model = runtime === 'dsh' ? 'deepseek-v4.1-flash' : 'opencode-go/deepseek-v4.1-flash'
    writeFileSync(join(root, 'native-selection'), JSON.stringify({ model, from: 'the agent', effort: 'high', effortFrom: 'the agent' }))
    const brief = 'Synthetic native brief.\nLast line, without a newline.'
    writeFileSync(join(root, 'brief'), brief)
    env['DEEPSEEK_API_KEY'] = 'synthetic-deepseek-key'
    const args = worker(runtime, model)
    args.splice(args.indexOf('--model'), 2) // Resolve the configured Office model, not a caller default.
    const first = await started([...args, '--cut-from', 'main'])
    const next = await started(['round', 'synthetic', '--agent', 'synthetic-' + runtime, '--runtime', runtime, '--continues', first.start.run, '--brief', join(root, 'brief'), '--json'])
    expect(next.start.run).not.toBe(first.start.run)
    for (const { start, seen } of [first, next]) {
      expect(seen.env).toMatchObject({ MOLE_OFFICE_AGENT: 'synthetic-' + runtime, MOLE_OFFICE_SESSION: start.run, MOLE_AGENT_KEY: 'c'.repeat(64) })
      expect(seen.cwd).toBe(join(instance, 'worktrees', 'synthetic-' + runtime))
      const filed = JSON.parse(readFileSync(join(root, start.run + '.json'), 'utf8'))
      if (start.run === first.start.run) expect((seen as any).brief).toBe(withTheStartingWords(brief))
      else {
        expect((seen as any).brief).toContain(brief)
        expect((seen as any).brief).toBe(withTheStartingWords(deliveredRoundBrief(savedRoundChapters(filed.data)!)))
      }
      expect(start).toMatchObject({ model, effort: 'high', effortFrom: 'the agent' })
      expect(seen.argv).not.toContain('--continue')
      expect(filed.data).toMatchObject({ runtime, model, workingDirectory: seen.cwd })
      expect(filed.data.cutFrom).toBe('main')
    }
    expect(git(next.seen.cwd, 'branch', '--show-current')).toBe('synthetic-' + runtime)
    const calls = readFileSync(join(root, 'requests'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
    const creates = calls.filter(call => call.path === '/api/records' && call.method === 'POST' && call.body.kind === 'session' && call.body.data.servingAgent === 'synthetic-' + runtime)
    expect(creates).toHaveLength(2)
    expect(creates[1].body.links).toContainEqual(expect.objectContaining({ toId: first.start.run, type: 'derived_from' }))
    if (runtime === 'opencode') {
      expect(first.seen.argv).toEqual(expect.arrayContaining(['run', '--format', 'json', '--dir', first.seen.cwd, '-m', model, '--variant', 'high']))
      expect(first.seen.argv).not.toContain('--session')
      expect(next.seen.argv).toContain('ses_syntheticOwned01')
      expect(next.seen.argv[next.seen.argv.indexOf('--session') + 1]).toBe('ses_syntheticOwned01')
    } else {
      expect((next.seen as any).settings).toMatchObject({ 'agent-default-model': { provider: 'deepseek-official', model: 'deepseek-flash', reasoningEffort: 'high' }, 'llm-deepseek': { reasoningEffort: 'high' } })
      expect(next.start.startWords).toContain('Office ancestry is not native resume')
      expect(next.seen.argv).not.toContain('--session')
    }
    delete env['DEEPSEEK_API_KEY']
  }, 30_000)

  // 'unheld' is a session of the right shape that neither of the sandbox's OpenCode databases a round looks in holds,
  // asked inside the container: the agent's own file, which no run of it has made here, and the shared one. Mutation:
  // that question taken out of theOpenCodeSessionOf: red, the round started on it.
  it.each(['missing', 'conflicting', 'invalid', 'unheld'])('OpenCode refuses %s native identity in the selected prior output before filing', async scenario => {
    const model = 'opencode-go/deepseek-v4.1-flash'
    writeFileSync(join(root, 'native-selection'), JSON.stringify({ model, from: 'the agent', effort: 'high', effortFrom: 'the agent' }))
    writeFileSync(join(root, 'brief'), 'Synthetic OpenCode identity brief.')
    const first = await started(worker('opencode', model))
    const events = scenario === 'missing' ? ['prose mentions ses_notAnEvent'] : scenario === 'invalid' ? [JSON.stringify({ type: 'step_start', sessionID: '--latest' })]
      : scenario === 'unheld' ? [JSON.stringify({ type: 'step_start', sessionID: 'ses_notHeldHere01' })] : ['ses_ownedA', 'ses_ownedB'].map(sessionID => JSON.stringify({ type: 'step_start', sessionID }))
    writeFileSync(first.start.out, events.join('\n'))
    const before = readFileSync(join(root, 'requests'), 'utf8')
    const refused = await launch(['round', 'synthetic', '--agent', 'synthetic-opencode', '--runtime', 'opencode', '--continues', first.start.run, '--brief', join(root, 'brief'), '--json'])
    expect(refused.code).not.toBe(0)
    expect(refused.err).toMatch(/OpenCode.*session|session.*OpenCode/)
    if (scenario === 'unheld') {
      const data = join(instance, 'home', '.local', 'share', 'opencode')
      expect(refused.err).toContain(`names an OpenCode session that is not in any OpenCode database a round of synthetic-opencode looks in: ${join(data, 'opencode-agent-synthetic-opencode.db')} (there is no database there) and ${join(data, 'opencode.db')} (its session table holds no session of that id).`)
      expect(refused.err).not.toContain('ses_notHeldHere01')
    }
    const wrote = readFileSync(join(root, 'requests'), 'utf8').slice(before.length).trim().split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(call => call.method !== 'GET')
    expect(wrote).toEqual([])
  }, 30_000)
})

it('OpenCode explicitly continues the older selected run rather than a newer native session', async () => {
  const model = 'opencode-go/deepseek-v4.1-flash'
  writeFileSync(join(root, 'native-selection'), JSON.stringify({ model, from: 'the agent', effort: 'high', effortFrom: 'the agent' }))
  writeFileSync(join(root, 'brief'), 'Synthetic selected older OpenCode run.')
  try {
    const older = await started(worker('opencode', model))
    writeFileSync(older.start.out, JSON.stringify({ type: 'step_start', sessionID: 'ses_selectedOlder01' }) + '\n')
    const newer = await started(worker('opencode', model))
    writeFileSync(newer.start.out, JSON.stringify({ type: 'step_start', sessionID: 'ses_newerUnselected02' }) + '\n')
    const next = await started(['round', 'synthetic', '--agent', 'synthetic-opencode', '--runtime', 'opencode', '--continues', older.start.run, '--brief', join(root, 'brief'), '--json'])
    expect(next.seen.argv[next.seen.argv.indexOf('--session') + 1]).toBe('ses_selectedOlder01')
    expect(next.seen.argv).not.toContain('ses_newerUnselected02')
    const calls = readFileSync(join(root, 'requests'), 'utf8').trim().split('\n').map(line => JSON.parse(line))
    const create = calls.filter(call => call.path === '/api/records' && call.method === 'POST' && call.body.kind === 'session').at(-1)
    expect(create.body.links).toContainEqual({ toId: older.start.run, type: 'derived_from' })
  } finally { rmSync(join(root, 'native-selection'), { force: true }) }
}, 30_000)

// AN OUTPUT LONGER THAN THE LONGEST STRING NODE MAKES (problem J0YjXZvQg7EU), for OpenCode, whose round reads every line
// for the session: the session's event, then a hole of 600 MiB that reads as zeros (a sparse file, almost no disk), then
// one more event. The same session after the hole continues it; another session there is refused as conflicting, which
// shows the line past the hole was read. MUTATIONS, after a control run: the whole output read as one string again (both
// red: the round fails on the string); reading stopped at the first session named (the conflicting case red).
it.each(['same', 'conflicting'])('OpenCode reads its session from an output past the longest string Node makes, after the hole too (%s session)', async scenario => {
  const model = 'opencode-go/deepseek-v4.1-flash'
  writeFileSync(join(root, 'native-selection'), JSON.stringify({ model, from: 'the agent', effort: 'high', effortFrom: 'the agent' }))
  writeFileSync(join(root, 'brief'), 'Synthetic OpenCode run with a long output.')
  try {
    const first = await started(worker('opencode', model))
    writeFileSync(first.start.out, JSON.stringify({ type: 'step_start', sessionID: 'ses_syntheticOwned01' }) + '\n')
    const fd = openSync(first.start.out, 'r+')
    try { writeSync(fd, '\n' + JSON.stringify({ type: 'step_finish', sessionID: scenario === 'same' ? 'ses_syntheticOwned01' : 'ses_ownedB' }) + '\n', 600 * 1024 * 1024) }
    finally { closeSync(fd) }
    const args = ['round', 'synthetic', '--agent', 'synthetic-opencode', '--runtime', 'opencode', '--continues', first.start.run, '--brief', join(root, 'brief'), '--json']
    if (scenario === 'same') {
      const next = await started(args)
      expect(next.seen.argv[next.seen.argv.indexOf('--session') + 1]).toBe('ses_syntheticOwned01')
    } else {
      const refused = await launch(args)
      expect(refused.code).not.toBe(0)
      expect(refused.err).toContain('conflicting identities were found')
    }
    rmSync(first.start.out)
  } finally { rmSync(join(root, 'native-selection'), { force: true }) }
}, 60_000)


// A BRIEF OF ANY SIZE REACHES OPENCODE AND CODEX WHOLE ON STANDARD INPUT. An assembled round brief is about 142 KB, more
// than the 128 KB (131072 bytes) one argument holds, and no brief is given as an argument at all: the helper gives the
// program the brief's file as its standard input. Multibyte text shows that nothing is cut at a byte count. MUTATIONS,
// each after a green control run and each restored, are listed by the code commit.
describe('a brief over 128 KB reaches OpenCode and Codex whole on standard input', () => {
  const MODELS = { opencode: 'opencode-go/deepseek-v4.1-flash', codex: 'openai/gpt-6.1-sol' } as const
  /** The round briefs delivered in this sandbox, by name. */
  const delivered = () => { const folder = join(instance, 'out', 'round-chapters'); return existsSync(folder) ? readdirSync(folder).filter(name => name.endsWith('.md')) : [] }
  /** The words a program was started with that hold a part of a long brief. */
  const theWordsHoldingIt = (argv: string[]) => argv.filter(word => word.includes('é'.repeat(1024)))
  /** A round of `runtime` given `brief`, after a short first run: the round's start, and the one brief it delivered. */
  async function aRound(runtime: keyof typeof MODELS, brief: string) {
    writeFileSync(join(root, 'brief'), 'Synthetic short first run before a round.')
    const first = await started(worker(runtime, MODELS[runtime]))
    writeFileSync(join(root, 'brief'), brief)
    const before = delivered()
    const next = await started(['round', ...worker(runtime, MODELS[runtime]).slice(1), '--continues', first.start.run])
    const made = delivered().filter(name => !before.includes(name))
    expect(made).toHaveLength(1)
    return { next, text: readFileSync(join(instance, 'out', 'round-chapters', made[0]!)) }
  }

  it.each(['opencode', 'codex'] as const)('a 140 KB round brief on %s reaches it on standard input as the starting words and then the delivered brief byte for byte, and no word holds it', async runtime => {
    const { next, text } = await aRound(runtime, '# Synthetic long round brief\n' + 'é'.repeat(70 * 1024) + '\n')
    expect(text.length).toBeGreaterThan(140 * 1024)
    const given = (next.seen as any).brief
    expect(typeof given).toBe('string')
    expect(Buffer.from(given, 'utf8').equals(Buffer.concat([Buffer.from(withTheStartingWords('')), text]))).toBe(true)
    expect(theWordsHoldingIt(next.seen.argv)).toEqual([])
  }, 60_000)

  it('a 140 KB OpenCode worker brief reaches it whole on standard input, and no word holds it', async () => {
    const brief = 'é'.repeat(70 * 1024) + '\n'
    writeFileSync(join(root, 'brief'), brief)
    const { seen } = await started(worker('opencode', MODELS.opencode))
    expect((seen as any).brief).toBe(withTheStartingWords(brief))
    expect(theWordsHoldingIt(seen.argv)).toEqual([])
  }, 30_000)
})


// A valid older public helper protocol that accepts --filed and starts the synthetic native program,
// but has no DSH selection handoff. It never invokes a model, network, plugin or real DSH.
const OLD_DSH_HELPER = String.raw`
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
const args = process.argv.slice(2), flag = name => args[args.indexOf('--' + name) + 1]
const run = flag('filed'), agent = flag('agent'), cwd = flag('worktree'), instance = process.env.SANDBOX_DIR
const logs = join(instance, 'logs', run); mkdirSync(logs, { recursive: true })
const command = ['dsh', '--profile', 'office', flag('brief')]
const env = { ...process.env, MOLE_OFFICE_SESSION: run, MOLE_OFFICE_AGENT: agent, MOLE_AGENT_KEY: process.env.SANDBOX_RUN_KEY }
const child = spawnSync(command[0], command.slice(1), { cwd, env, encoding: 'utf8' })
const out = join(logs, 'out'), details = join(logs, 'launch.txt')
writeFileSync(out, child.stdout ?? ''); writeFileSync(details, 'Synthetic older helper started its native stand-in.\n')
console.log(JSON.stringify({ instance: 'synthetic', run, agent, owner: run, runtime: 'dsh', cwd, command, out, details, hostPid: process.pid, hostPgid: process.pid, processRow: 'synthetic-stale-row', startWords: 'Synthetic old helper: no selection handoff' }))
`

it('a stale DSH helper refuses before filing or making the requested worker worktree', async () => {
  const tools = join(instance, 'repo/tools'), model = 'deepseek-v4.1-flash'
  writeFileSync(join(root, 'brief'), 'Synthetic stale helper task.')
  writeFileSync(join(root, 'native-selection'), JSON.stringify({ model, from: 'the agent', effort: 'high', effortFrom: 'the agent' }))
  const worktree = join(instance, 'worktrees/synthetic-stale-dsh')
  expect(existsSync(worktree)).toBe(false)
  rmSync(tools); cpSync(join(repo, 'tools'), tools, { recursive: true })
  writeFileSync(join(tools, 'sandbox-start.mjs'), OLD_DSH_HELPER)
  try {
    const before = readFileSync(join(root, 'requests'), 'utf8')
    const ran = await launch(['worker', 'synthetic', '--agent', 'synthetic-stale-dsh', '--runtime', 'dsh', '--model', model, '--brief', join(root, 'brief'), '--json'])
    expect(ran.code, ran.err).not.toBe(0)
    expect(ran.err).toContain('DSH settings handoff')
    expect(existsSync(worktree)).toBe(false)
    const writes = readFileSync(join(root, 'requests'), 'utf8').slice(before.length).trim().split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(call => call.method !== 'GET')
    expect(writes).toEqual([])
  } finally {
    rmSync(tools, { recursive: true }); symlinkSync(join(repo, 'tools'), tools)
    rmSync(join(root, 'native-selection'), { force: true })
  }
}, 30_000)

// AN OLDER HELPER, from after the permissions contract and before the start values came from the office, which leaves
// start.json as a link to a file of old bytes. It takes --stdin, which came before the contract. The launcher adds the start values to that start.json once the helper has
// started. It never runs the command, so nothing of a model is started.
const OLD_CODEX_HELPER = String.raw`
import { mkdirSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
export const PERMISSIONS_CONTRACT = 2
const args = process.argv.slice(2), flag = name => args[args.indexOf('--' + name) + 1]
const run = flag('filed'), agent = flag('agent'), cwd = flag('worktree'), instance = process.env.SANDBOX_DIR
const logs = join(instance, 'logs', run); mkdirSync(logs, { recursive: true })
symlinkSync(join(process.env.EFFORT_FIXTURE, 'the-old-start.json'), join(logs, 'start.json'))
const command = ['codex', 'exec', '--', '-'], stdin = flag('stdin')
console.log(JSON.stringify({ instance: 'synthetic', run, agent, owner: run, runtime: 'codex', cwd, command, stdin, out: join(logs, 'out'), details: join(logs, 'launch.txt'), hostPid: process.pid, hostPgid: process.pid, processRow: 'synthetic-old-row', startWords: 'Synthetic old helper: no start values from the office' }))
`

// THE LAUNCHER PUBLISHES ITS REWRITE OF AN OLDER HELPER'S start.json WHOLE, because its status and a waiting caller read
// every start.json. The proof cannot pass by luck: a link left at the path is replaced, and the file it pointed to keeps
// its bytes. MUTATION, alone in tools/sandbox.mjs: the rewrite is a plain writeFileSync, which writes through the link,
// and this goes red.
it("the launcher's rewrite of an older helper's start.json is published whole, over a link left at its path", async () => {
  const tools = join(instance, 'repo/tools'), target = join(root, 'the-old-start.json'), old = '{"old":"the bytes that must survive"}\n'
  writeFileSync(join(root, 'brief'), 'Synthetic older helper brief. No model call.\n')
  writeFileSync(target, old)
  rmSync(tools); cpSync(join(repo, 'tools'), tools, { recursive: true })
  writeFileSync(join(tools, 'sandbox-start.mjs'), OLD_CODEX_HELPER)
  try {
    const ran = await launch(worker('codex', 'openai/gpt-6.1-sol'))
    expect(ran.code, ran.err).toBe(0)
    const start = JSON.parse(ran.out.trim())
    const path = join(instance, 'logs', start.run, 'start.json')
    expect(lstatSync(path).isSymbolicLink(), 'start.json was written through the link').toBe(false)
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({ run: start.run, effort: start.effort, effortFrom: start.effortFrom, startWords: start.startWords })
    expect(start.effort, 'the launcher added no start values, so it did not rewrite start.json').toEqual(expect.any(String))
    expect(readFileSync(target, 'utf8'), 'the file the link pointed to changed').toBe(old)
  } finally {
    rmSync(tools, { recursive: true }); symlinkSync(join(repo, 'tools'), tools)
    rmSync(target, { force: true })
  }
}, 30_000)

it('a stale DSH runner refuses a round before filing another Office run', async () => {
  const model = 'deepseek-v4.1-flash', tools = join(instance, 'repo/tools')
  writeFileSync(join(root, 'brief'), 'Synthetic stale runner task.')
  writeFileSync(join(root, 'native-selection'), JSON.stringify({ model, from: 'the agent', effort: 'high', effortFrom: 'the agent' }))
  const first = await started(worker('dsh', model))
  rmSync(tools); cpSync(join(repo, 'tools'), tools, { recursive: true })
  writeFileSync(join(tools, 'dsh-hooks/run-agent.sh'), '#!/bin/bash\nexport MOLE_OFFICE_AGENT="$4" MOLE_OFFICE_SESSION="$5" MOLE_OFFICE_WORKSPACE="$6"\nexec "$MOLE_OFFICE_DSH_DIR/npm/node_modules/.bin/dsh" --profile office "$2"\n')
  try {
    const before = readFileSync(join(root, 'requests'), 'utf8')
    const ran = await launch(['round', 'synthetic', '--agent', 'synthetic-dsh', '--runtime', 'dsh', '--continues', first.start.run, '--brief', join(root, 'brief'), '--json'])
    if (ran.code === 0) {
      const start = JSON.parse(ran.out.trim()); groups.add(start.hostPgid)
      await until(() => existsSync(join(instance, 'logs', start.run, 'finish.log')) && readFileSync(join(instance, 'logs', start.run, 'finish.log'), 'utf8').includes("run's scratch folder"))
    }
    expect(ran.code, ran.err).not.toBe(0)
    expect(ran.err).toContain('DSH settings handoff')
    const writes = readFileSync(join(root, 'requests'), 'utf8').slice(before.length).trim().split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(call => call.method !== 'GET')
    expect(writes).toEqual([])
  } finally {
    rmSync(tools, { recursive: true }); symlinkSync(join(repo, 'tools'), tools)
    rmSync(join(root, 'native-selection'), { force: true })
  }
}, 30_000)

// A host-only key cannot admit a DSH worker or round; the sandbox must declare its own login.
it.each(['worker', 'round'])('DSH %s refuses an undeclared login before any write and starts with a declared synthetic key', async verb => {
  const templateFile = join(root, 'template/sandbox.json'), secretsFile = join(root, 'secrets')
  const briefFile = join(root, 'brief'), selectionFile = join(root, 'native-selection')
  const originals = [templateFile, secretsFile, briefFile, selectionFile].map(file => existsSync(file) ? readFileSync(file) : null)
  const originalEnv = { ...env }
  const model = 'deepseek-v4.1-flash'
  const brief = 'Synthetic DSH login boundary brief.'
  try {
    writeFileSync(selectionFile, JSON.stringify({ model, from: 'the agent', effort: 'high', effortFrom: 'the agent' }))
    writeFileSync(briefFile, brief)
    // A real completed stand-in run supplies every round preflight after the login check.
    const previous = verb === 'round' ? await started(worker('dsh', model)) : null
    const args = previous === null ? worker('dsh', model) : ['round', 'synthetic', '--agent', 'synthetic-dsh', '--runtime', 'dsh', '--continues', previous.start.run, '--brief', briefFile, '--json']
    const template = JSON.parse(originals[0]!.toString())
    template.secrets.names = template.secrets.names.filter((one: { name: string }) => one.name !== 'DEEPSEEK_API_KEY')
    writeFileSync(templateFile, JSON.stringify(template))
    env['DEEPSEEK_API_KEY'] = 'synthetic-host-only-key'
    const before = readFileSync(join(root, 'requests'), 'utf8')
    const sessions = readdirSync(root).filter(file => file.startsWith('synthetic-run-')).sort()
    const logs = readdirSync(join(instance, 'logs')).filter(file => file.startsWith('synthetic-run-')).sort()
    const nativeFiles = ['program-calls', 'helper-environments', 'env-files']
    const nativeBefore = nativeFiles.map(file => existsSync(join(root, file)) ? readFileSync(join(root, file), 'utf8') : null)
    const refused = await launch([...args, '--verbose'])
    // A disabled refusal must finish its stand-in before the assertion fails and fixture state is restored.
    if (refused.code === 0) {
      const slipped = JSON.parse(refused.out.trim())
      groups.add(slipped.hostPgid)
      await until(() => existsSync(join(instance, 'logs', slipped.run, 'finish.log')) && readFileSync(join(instance, 'logs', slipped.run, 'finish.log'), 'utf8').includes("run's scratch folder"))
    }
    expect(refused.code, refused.err).not.toBe(0)
    const sentence = 'The sandbox synthetic was given no DEEPSEEK_API_KEY for DSH. Nothing was filed or started.'
    expect(refused.err.trim()).toMatch(new RegExp('^sandbox: ' + sentence.replaceAll('.', '\\.') + ' Details: [^\\n]+$'))
    const details = refused.err.trim().split(' Details: ')[1]!
    expect(readFileSync(details, 'utf8').trim().split('\n').at(-1)).toBe('sandbox: ' + sentence)
    const writes = readFileSync(join(root, 'requests'), 'utf8').slice(before.length).trim().split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(call => call.method !== 'GET')
    expect(writes).toEqual([])
    expect(readdirSync(root).filter(file => file.startsWith('synthetic-run-')).sort()).toEqual(sessions)
    expect(readdirSync(join(instance, 'logs')).filter(file => file.startsWith('synthetic-run-')).sort()).toEqual(logs)
    expect(nativeFiles.map(file => existsSync(join(root, file)) ? readFileSync(join(root, file), 'utf8') : null)).toEqual(nativeBefore)

    template.secrets.names.push({ name: 'DEEPSEEK_API_KEY', readBy: ['dsh'] })
    writeFileSync(templateFile, JSON.stringify(template))
    writeFileSync(secretsFile, originals[1]!.toString().replace(/^DEEPSEEK_API_KEY=.*$/m, 'DEEPSEEK_API_KEY=synthetic-declared-login'))
    const { start, seen } = await started(args)
    expect(start).toMatchObject({ runtime: 'dsh', agent: 'synthetic-dsh', model })
    expect(seen.env).toMatchObject({ DEEPSEEK_API_KEY: 'synthetic-declared-login', MOLE_OFFICE_AGENT: 'synthetic-dsh', MOLE_OFFICE_SESSION: start.run, MOLE_AGENT_KEY: 'c'.repeat(64) })
    expect(seen.cwd).toBe(join(instance, 'worktrees/synthetic-dsh'))
    const filed = JSON.parse(readFileSync(join(root, start.run + '.json'), 'utf8'))
    if (verb === 'worker') expect((seen as any).brief).toBe(withTheStartingWords(brief))
    else {
      expect((seen as any).brief).toContain(brief)
      expect((seen as any).brief).toBe(withTheStartingWords(deliveredRoundBrief(savedRoundChapters(filed.data)!)))
    }
    expect(seen.argv.slice(0, 2)).toEqual(['--profile', 'office'])
    expect(seen.argv).toContain('--patch')
    const calls = readFileSync(join(root, 'program-calls'), 'utf8').trim().split('\n').map(line => JSON.parse(line)).filter(call => call.run === start.run)
    expect(calls).toHaveLength(1)
    expect(calls[0].run).toBe(start.run)
    expect(filed.data).toMatchObject({ runtime: 'dsh', model, servingAgent: 'synthetic-dsh', workingDirectory: seen.cwd })
    if (previous !== null) {
      expect(start.run).not.toBe(previous.start.run)
      expect(filed.links).toContainEqual({ toId: previous.start.run, type: 'derived_from' })
    }
  } finally {
    for (const [index, file] of [templateFile, secretsFile, briefFile, selectionFile].entries()) {
      const bytes = originals[index]
      if (bytes === null) rmSync(file, { force: true })
      else writeFileSync(file, bytes!)
    }
    env = originalEnv
  }
}, 30_000)


it('a current DSH handoff asks hand-run before filing its worker', async () => {
  const brief = join(root, 'brief'), selection = join(root, 'native-selection')
  const originals = [brief, selection].map(file => existsSync(file) ? readFileSync(file) : null)
  try {
    const model = 'deepseek-v4.1-flash'
    writeFileSync(brief, 'Synthetic current DSH handoff authorization.')
    writeFileSync(selection, JSON.stringify({ model, from: 'the agent', effort: 'high', effortFrom: 'the agent' }))
    const before = readFileSync(join(root, 'requests'), 'utf8')
    const { start } = await started(worker('dsh', model))
    const calls = readFileSync(join(root, 'requests'), 'utf8').slice(before.length).trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
    const handStarts = calls.filter(call => call.method === 'POST' && call.path === '/api/agents/synthetic-dsh/hand-run')
    expect(handStarts).toHaveLength(1)
    expect(handStarts[0].body.brief.startsWith(join(instance, 'briefs') + '/')).toBe(true)
    expect(readFileSync(handStarts[0].body.brief, 'utf8')).toBe(withTheStartingWords('Synthetic current DSH handoff authorization.'))
    const filing = calls.findIndex(call => call.method === 'POST' && call.path === '/api/records' && call.body.kind === 'session')
    expect(filing).toBeGreaterThan(calls.indexOf(handStarts[0]))
    expect(JSON.parse(readFileSync(join(root, start.run + '.json'), 'utf8')).data.servingAgent).toBe('synthetic-dsh')
  } finally {
    for (const [index, file] of [brief, selection].entries()) {
      if (originals[index] === null) rmSync(file, { force: true })
      else writeFileSync(file, originals[index]!)
    }
  }
}, 30_000)

/**
 * AN OPENCODE RUN ASKS FOR UP TO 64,000 OUTPUT TOKENS A STEP, AS A CHECK DOES (the ask of 19 October 2026, after the
 * check side landed as merge entry nVpjcB3k0n8R). OpenCode 1.18.31 asks for the smaller of the model's output limit and
 * 32,000 unless OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX says otherwise, and in the three days to 19 October 2 of 104
 * OpenCode worker runs ended a step on "length": one with 32,000 reasoning tokens and no output, one with an answer cut at
 * 31,698. The launcher gives every OpenCode command the cap a check has, and a Codex or Claude run nothing new. What the
 * real OpenCode then sends to its model is read in tests/a-workers-opencode-sends-the-raised-output-cap.test.ts. A start
 * with start values says the cap in its words; a plain command has none.
 *
 * MUTATION OUTPUT_CAP_NOT_GIVEN: the launcher sets nothing, and the three OpenCode cases go red; the Codex and Claude case
 * stays green. Restored, all green. MUTATION OUTPUT_CAP_NOT_SAID: the start words leave the cap out, and the worker case
 * goes red.
 */
describe('An OpenCode run asks for up to 64,000 output tokens a step, as a check does', () => {
  const CAP = { OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX: '64000' }
  const model = 'opencode-go/deepseek-v4.1-flash'
  it('gives an OpenCode worker the cap, and says so in its start words', async () => {
    const { seen, start } = await started(worker('opencode', model))
    expect(seen.env).toMatchObject(CAP)
    expect(start.startWords).toContain("; output cap 64000 tokens a step, set by the launcher (OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX); OpenCode asks for the smaller of it and the model's own output limit")
  }, 30_000)
  it('gives an OpenCode command a named agent runs the cap', async () => {
    const { seen } = await started(['exec', 'synthetic', '--agent', 'synthetic-exec', '--runtime', 'opencode', '--model', model, '--json', '--', 'opencode', 'run', '-m', model, 'Synthetic brief'])
    expect(seen.env).toMatchObject(CAP)
  }, 30_000)
  it('gives a plain OpenCode command the cap', async () => {
    // A plain command files no run, so the stand-in writes what it saw under whatever session the command carries, over
    // an earlier file of the same name: the one written after the start is the one this command's program wrote.
    const written = () => new Map(readdirSync(root).filter(file => file.startsWith('seen-')).map(file => [file, statSync(join(root, file)).mtimeMs]))
    const before = written()
    const ran = await anOpenCodeStart('plain')
    expect(ran.code, ran.err).toBe(0)
    const fresh = () => [...written()].filter(([file, at]) => before.get(file) !== at).map(([file]) => file)
    await until(() => fresh().length > 0)
    expect(fresh()).toHaveLength(1)
    expect((JSON.parse(readFileSync(join(root, fresh()[0]!), 'utf8')) as { env: Record<string, string> }).env).toMatchObject(CAP)
  }, 30_000)
  it('gives a Codex or Claude run nothing new', async () => {
    for (const [runtime, named] of [['codex', 'openai/gpt-6.1-sol'], ['claude-code', 'claude-opus-5-5']] as const) {
      const { seen, start } = await started(worker(runtime, named))
      expect(seen.env).not.toHaveProperty('OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX')
      expect(start.startWords).not.toContain('output cap')
    }
  }, 60_000)
})

/**
 * EVERY OPENCODE COMMAND IS GIVEN THE PLUGIN THAT KEEPS THE PROVIDER KEYS OUT OF ITS SHELL (13q round 57;
 * mkofsn195wGD, widened to the five provider keys by MMYiBgR1p7gr and vRE7nNlTQsrB). A worker, a named agent's
 * command and a plain command alike, as each gets the output cap above; a Codex or Claude run is given no OpenCode plugin.
 * What the real OpenCode then gives a command its bash tool runs is read in
 * tests/an-opencode-agents-shell-does-not-see-its-key.test.ts.
 *
 * MUTATION KEY_PLUGIN_NOT_GIVEN: the launcher names no such plugin, and the three OpenCode cases go red; the Codex and
 * Claude case stays green.
 */
describe('Every OpenCode command is given the plugin that keeps the provider keys out of its shell', () => {
  const PLUGIN = '/tools/opencode-shell-without-provider-keys-plugin.mjs'
  const model = 'opencode-go/deepseek-v4.1-flash'
  const plugins = (env: Record<string, string>) => (JSON.parse(env['OPENCODE_CONFIG_CONTENT'] ?? '{}') as { plugin?: string[] }).plugin ?? []
  it('gives an OpenCode worker the plugin', async () => {
    const { seen } = await started(worker('opencode', model))
    expect(plugins(seen.env).filter(plugin => plugin.endsWith(PLUGIN))).toHaveLength(1)
  }, 30_000)
  it('gives an OpenCode command a named agent runs the plugin', async () => {
    const { seen } = await started(['exec', 'synthetic', '--agent', 'synthetic-exec', '--runtime', 'opencode', '--model', model, '--json', '--', 'opencode', 'run', '-m', model, 'Synthetic brief'])
    expect(plugins(seen.env).filter(plugin => plugin.endsWith(PLUGIN))).toHaveLength(1)
  }, 30_000)
  it('gives a plain OpenCode command the plugin', async () => {
    // As for the cap above: the file written after the start is the one this command's program wrote.
    const written = () => new Map(readdirSync(root).filter(file => file.startsWith('seen-')).map(file => [file, statSync(join(root, file)).mtimeMs]))
    const before = written()
    const ran = await anOpenCodeStart('plain')
    expect(ran.code, ran.err).toBe(0)
    const fresh = () => [...written()].filter(([file, at]) => before.get(file) !== at).map(([file]) => file)
    await until(() => fresh().length > 0)
    expect(fresh()).toHaveLength(1)
    const env = (JSON.parse(readFileSync(join(root, fresh()[0]!), 'utf8')) as { env: Record<string, string> }).env
    expect(plugins(env).filter(plugin => plugin.endsWith(PLUGIN))).toHaveLength(1)
  }, 30_000)
  it('gives a Codex or Claude run no such plugin', async () => {
    for (const [runtime, named] of [['codex', 'openai/gpt-6.1-sol'], ['claude-code', 'claude-opus-5-5']] as const) {
      const { seen } = await started(worker(runtime, named))
      expect(plugins(seen.env).filter(plugin => plugin.endsWith(PLUGIN))).toEqual([])
    }
  }, 60_000)
})

/**
 * EACH NAMED AGENT'S OPENCODE RUNS KEEP THEIR OWN DATABASE FILE (item 29 of the 13q requirements). OpenCode 1.18.31 keeps
 * every session of a home in one SQLite file, <data>/opencode.db, unless OPENCODE_DB names another, and a name that is not
 * absolute is taken inside that data folder. One file for every agent of a sandbox cannot be moved off while any of them
 * runs. A named agent's OpenCode start is now given OPENCODE_DB=opencode-agent-<agent>.db, a flat name because SQLite
 * makes no missing folder. A plain command, a start of a run already filed (--run), an isolated run
 * (tests/an-isolated-run-cannot-reach-the-office.test.ts) and an id with any other character keep OpenCode's default
 * file. A round asks the agent's own file for its session first, then the shared opencode.db, where a run started without
 * a file of its own keeps it, and runs on the file that holds it; on the shared file it says so. A session in neither is
 * refused, naming both files, and nothing is started. A sandbox helper from before --opencode-database refuses the flag
 * after the round is filed, and gives OpenCode no database: with such a helper, a round whose session is in the agent's
 * own file is refused before it is filed, and one whose session is in the shared file runs without the flag and says
 * why. Nothing is moved.
 *
 * MUTATIONS, each after a green control and restored after: DATABASE_NOT_GIVEN, the helper gives no OPENCODE_DB (the
 * three named-agent starts red); DATABASE_FOR_EVERY_START, the helper gives the file of the agent it serves to every
 * OpenCode start (the plain and --run case red); ONLY_THE_SHARED_FILE, a round asks only opencode.db (the own-file round
 * red); THE_SHARED_FILE_UNNAMED, a round that found its session in opencode.db runs on the agent's own file and says
 * nothing (the shared-file round red); NEITHER_STARTS_FRESH, a round whose session is in neither file starts without
 * --session (the refusal red); ANY_DATABASE_TAKEN, the helper takes any --opencode-database (its refusal red);
 * OLDER_HELPER_UNCHECKED, a round passes --opencode-database without reading whether the helper takes it (both
 * older-helper rounds red); OLDER_HELPER_SHARED_REFUSED, a round with an older helper is refused whichever file holds its
 * session (the older-helper round on the shared file red).
 */
describe("Each named agent's OpenCode runs keep their own database file", () => {
  const model = 'opencode-go/deepseek-v4.1-flash'
  const data = () => join(instance, 'home', '.local', 'share', 'opencode')
  const OWN_SESSION = 'ses_agentsOwnFile01'
  const own = () => join(data(), 'opencode-agent-synthetic-opencode.db')
  beforeAll(() => {
    execFileSync(process.execPath, ['--no-warnings', '-e', String.raw`
const { DatabaseSync } = require('node:sqlite')
const db = new DatabaseSync(process.argv[1])
db.exec('CREATE TABLE session (id TEXT PRIMARY KEY, title TEXT NOT NULL)')
db.prepare('INSERT INTO session (id, title) VALUES (?, ?)').run(process.argv[2], 'synthetic session of this test')
db.close()
`, own(), OWN_SESSION])
  })
  afterAll(() => rmSync(own(), { force: true }))
  afterEach(() => rmSync(join(root, 'native-selection'), { force: true }))
  const aSelection = (brief: string) => {
    writeFileSync(join(root, 'native-selection'), JSON.stringify({ model, from: 'the agent', effort: 'high', effortFrom: 'the agent' }))
    writeFileSync(join(root, 'brief'), brief)
  }
  const aRound = (run: string) => ['round', 'synthetic', '--agent', 'synthetic-opencode', '--runtime', 'opencode', '--continues', run, '--brief', join(root, 'brief'), '--json']
  // A plain command files no run, so its stand-in writes what it saw under whatever session it carries, over an earlier
  // file of the same name: the one written after the start is the one this command's program wrote.
  const written = () => new Map(readdirSync(root).filter(file => file.startsWith('seen-')).map(file => [file, statSync(join(root, file)).mtimeMs]))
  async function theEnvOfA(mode: typeof openCodeModes[number]) {
    const before = written()
    const ran = await anOpenCodeStart(mode)
    expect(ran.code, ran.err).toBe(0)
    const fresh = () => [...written()].filter(([file, at]) => before.get(file) !== at).map(([file]) => file)
    await until(() => fresh().length > 0)
    expect(fresh()).toHaveLength(1)
    return (JSON.parse(readFileSync(join(root, fresh()[0]!), 'utf8')) as { env: Record<string, string> }).env
  }

  it('names the file by the agent id, and gives no name for an id with any other character', () => {
    // OpenCode 1.18.31 reads its database's name from this variable and from no other.
    expect(THE_OPENCODE_DATABASE_VARIABLE).toBe('OPENCODE_DB')
    expect(THE_SHARED_OPENCODE_DATABASE).toBe('opencode.db')
    expect(theOpenCodeDatabaseOf('synthetic-opencode')).toBe('opencode-agent-synthetic-opencode.db')
    expect(theOpenCodeDatabaseOf('Synthetic_Agent-2')).toBe('opencode-agent-Synthetic_Agent-2.db')
    for (const unsafe of ['', '../synthetic', 'synthetic/agent', 'synthetic.agent', 'synthetic agent', 'synthetic\n', undefined, null, 7]) {
      expect(theOpenCodeDatabaseOf(unsafe as string), JSON.stringify(unsafe)).toBeNull()
    }
  })

  it("gives a named agent's OpenCode start its own file by value, through a worker, exec --agent and a direct start", async () => {
    writeFileSync(join(root, 'brief'), 'Synthetic brief of a named agent.')
    const { seen } = await started(worker('opencode', model))
    expect(seen.env[THE_OPENCODE_DATABASE_VARIABLE]).toBe('opencode-agent-synthetic-opencode.db')
    for (const mode of ['agent', 'direct-agent'] as const) {
      const ran = await anOpenCodeStart(mode)
      expect(ran.code, ran.err).toBe(0)
      const start = JSON.parse(ran.out.trim())
      const env = (JSON.parse(readFileSync(join(root, 'seen-' + start.run + '.json'), 'utf8')) as { env: Record<string, string> }).env
      expect(env[THE_OPENCODE_DATABASE_VARIABLE], mode).toBe('opencode-agent-synthetic-exec.db')
    }
  }, 60_000)

  it('gives a plain OpenCode command and a start of a run already filed no file of their own', async () => {
    for (const mode of ['plain', 'direct-plain', 'existing-run'] as const) {
      expect(Object.keys(await theEnvOfA(mode)), mode).not.toContain(THE_OPENCODE_DATABASE_VARIABLE)
    }
  }, 60_000)

  it("continues a session the agent's own file holds, on that file, and says nothing of the shared one", async () => {
    aSelection('Synthetic round on the agent’s own file.')
    const first = await started(worker('opencode', model))
    writeFileSync(first.start.out, JSON.stringify({ type: 'step_start', sessionID: OWN_SESSION }) + '\n')
    const next = await started(aRound(first.start.run))
    expect(next.seen.argv[next.seen.argv.indexOf('--session') + 1]).toBe(OWN_SESSION)
    expect(next.seen.env[THE_OPENCODE_DATABASE_VARIABLE]).toBe('opencode-agent-synthetic-opencode.db')
    expect(next.start.startWords).not.toContain('shared OpenCode database')
    expect(next.ran.err).not.toContain('shared OpenCode database')
  }, 60_000)

  it('continues a session only the shared file holds, on the shared file, and says so in words', async () => {
    aSelection('Synthetic round on the shared file.')
    const first = await started(worker('opencode', model))
    writeFileSync(first.start.out, JSON.stringify({ type: 'step_start', sessionID: 'ses_syntheticOwned01' }) + '\n')
    const next = await started(aRound(first.start.run))
    expect(next.seen.argv[next.seen.argv.indexOf('--session') + 1]).toBe('ses_syntheticOwned01')
    expect(next.seen.env[THE_OPENCODE_DATABASE_VARIABLE]).toBe('opencode.db')
    const says = `Run ${first.start.run}'s OpenCode session is in the shared OpenCode database, ${join(data(), 'opencode.db')}, and not in synthetic-opencode's own, ${own()}: its session table holds no session of that id. This round runs on the shared file.`
    expect(next.start.startWords).toContain(says)
    expect(JSON.parse(readFileSync(join(instance, 'logs', next.start.run, 'start.json'), 'utf8')).startWords).toContain(says)
    expect(next.ran.err).toContain(says)
  }, 60_000)

  it('refuses a session neither file holds in words, writes nothing and starts nothing', async () => {
    aSelection('Synthetic round on a session no file holds.')
    const first = await started(worker('opencode', model))
    writeFileSync(first.start.out, JSON.stringify({ type: 'step_start', sessionID: 'ses_inNeitherFile01' }) + '\n')
    const requests = readFileSync(join(root, 'requests'), 'utf8')
    const calls = readFileSync(join(root, 'program-calls'), 'utf8')
    const refused = await launch(aRound(first.start.run))
    expect(refused.code).not.toBe(0)
    // The refusal's first sentence goes to stderr, and the whole of it to the launch details that line names.
    const said = `Run ${first.start.run}'s output ${first.start.out} names an OpenCode session that is not in any OpenCode database a round of synthetic-opencode looks in: ${own()} (its session table holds no session of that id) and ${join(data(), 'opencode.db')} (its session table holds no session of that id).`
    expect(refused.err).toContain(`sandbox: ${said} Details: `)
    const details = /Details: (\S+)/.exec(refused.err)?.[1]
    expect(details, refused.err).toBeDefined()
    expect(readFileSync(details!, 'utf8')).toContain(`${said} A round continues only a conversation this sandbox holds. Nothing was started.`)
    const wrote = readFileSync(join(root, 'requests'), 'utf8').slice(requests.length).trim().split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(call => call.method !== 'GET')
    expect(wrote).toEqual([])
    expect(readFileSync(join(root, 'program-calls'), 'utf8')).toBe(calls)
  }, 60_000)

  // AN OLDER HELPER, from after the permissions contract and a run filed on the host, and before --opencode-database. It
  // knows every flag and switch the helper knew then and refuses any other in the helper's words. Given only those, it
  // keeps the words it was given and answers a start, but runs no command, so nothing of a model is started.
  const OLD_OPENCODE_HELPER = String.raw`
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
export const PERMISSIONS_CONTRACT = 2
const args = process.argv.slice(2), flag = name => args[args.indexOf('--' + name) + 1]
const flags = ['instance', 'agent', 'runtime', 'model', 'worktree', 'clone', 'cut-from', 'title', 'brief', 'continues', 'flow', 'filed', 'cwd', 'slot', 'run',
  'as', 'session', 'workspace', 'api', 'timeout', 'handshake', 'stdin', 'verbose', 'wait', 'plain-env', 'no-office-variables', 'starts-runs']
for (const word of args) {
  if (word === '--') break
  if (word.startsWith('--') && !flags.includes(word.slice(2))) { console.error('sandbox-start: I do not know "' + word + '". A command to run goes after --.'); process.exit(2) }
}
const run = flag('filed'), agent = flag('agent'), cwd = flag('worktree'), logs = join(process.env.SANDBOX_DIR, 'logs', run)
mkdirSync(logs, { recursive: true })
writeFileSync(join(process.env.EFFORT_FIXTURE, 'older-helper-' + run + '.json'), JSON.stringify(args))
const command = args.slice(args.indexOf('--') + 1)
console.log(JSON.stringify({ instance: 'synthetic', run, agent, owner: run, runtime: 'opencode', cwd, command, out: join(logs, 'out'), details: join(logs, 'launch.txt'), hostPid: process.pid, hostPgid: process.pid, processRow: 'synthetic-old-row', startWords: 'Synthetic old helper: no OpenCode database' }))
`
  const tools = () => join(instance, 'repo/tools')
  const anOlderHelper = () => {
    rmSync(tools()); cpSync(join(repo, 'tools'), tools(), { recursive: true })
    writeFileSync(join(tools(), 'sandbox-start.mjs'), OLD_OPENCODE_HELPER)
    return join(tools(), 'sandbox-start.mjs')
  }
  const theHelperAsItWas = () => { rmSync(tools(), { recursive: true }); symlinkSync(join(repo, 'tools'), tools()) }

  it("refuses a round before filing when the sandbox helper is from before --opencode-database and the session is in the agent's own file", async () => {
    aSelection('Synthetic round with an older helper.')
    const first = await started(worker('opencode', model))
    writeFileSync(first.start.out, JSON.stringify({ type: 'step_start', sessionID: OWN_SESSION }) + '\n')
    const helper = anOlderHelper()
    try {
      const requests = readFileSync(join(root, 'requests'), 'utf8')
      const calls = readFileSync(join(root, 'program-calls'), 'utf8')
      const refused = await launch(aRound(first.start.run))
      expect(refused.code, refused.err).not.toBe(0)
      const said = `The helper in ${helper} is from before --opencode-database, so it cannot run this round on opencode-agent-synthetic-opencode.db, the OpenCode database that holds run ${first.start.run}'s session.`
      expect(refused.err).toContain(`sandbox: ${said} Details: `)
      const details = /Details: (\S+)/.exec(refused.err)?.[1]
      expect(details, refused.err).toBeDefined()
      expect(readFileSync(details!, 'utf8')).toContain(`${said} Bring this sandbox's checkout of main up to date and start the round again: the main refresh details say why it did not follow at this start. Nothing was started.`)
      const wrote = readFileSync(join(root, 'requests'), 'utf8').slice(requests.length).trim().split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(call => call.method !== 'GET')
      expect(wrote).toEqual([])
      expect(readFileSync(join(root, 'program-calls'), 'utf8')).toBe(calls)
    } finally {
      theHelperAsItWas()
    }
  }, 60_000)

  it('runs a round on the shared file without the flag when the sandbox helper is from before --opencode-database, and says why', async () => {
    aSelection('Synthetic round on the shared file with an older helper.')
    const first = await started(worker('opencode', model))
    writeFileSync(first.start.out, JSON.stringify({ type: 'step_start', sessionID: 'ses_syntheticOwned01' }) + '\n')
    const helper = anOlderHelper()
    try {
      const ran = await launch(aRound(first.start.run))
      expect(ran.code, ran.err).toBe(0)
      const start = JSON.parse(ran.out.trim())
      const given = JSON.parse(readFileSync(join(root, 'older-helper-' + start.run + '.json'), 'utf8')) as string[]
      expect(given).not.toContain('--opencode-database')
      const command = given.slice(given.indexOf('--') + 1)
      expect(command[command.indexOf('--session') + 1]).toBe('ses_syntheticOwned01')
      expect(ran.err).toContain(`the helper in ${helper} is from before --opencode-database, so this round passes it no database: it gives OpenCode none, and OpenCode opens the shared opencode.db, which holds run ${first.start.run}'s session.`)
    } finally {
      theHelperAsItWas()
    }
  }, 60_000)

  it('refuses before filing a direct start that names any other file, or names one without an agent', async () => {
    const command = ['--', 'opencode', 'run', '-m', model, 'Synthetic brief']
    const named = ['--agent', 'synthetic-exec', '--runtime', 'opencode', '--model', model, '--worktree', join(instance, 'repo')]
    for (const [args, says] of [
      [[...named, '--opencode-database', 'opencode-agent-synthetic-opencode.db'], `--opencode-database takes only opencode-agent-synthetic-exec.db or opencode.db for a run of synthetic-exec, and was given "opencode-agent-synthetic-opencode.db".`],
      [[...named, '--opencode-database', '/synthetic/opencode.db'], `--opencode-database takes only opencode-agent-synthetic-exec.db or opencode.db for a run of synthetic-exec, and was given "/synthetic/opencode.db".`],
      [['--opencode-database', 'opencode.db'], "--opencode-database takes only an agent's run (--agent): a plain command and a run started with --run keep OpenCode's default database."],
    ] as const) {
      const requests = readFileSync(join(root, 'requests'), 'utf8')
      const ran = await directStart([...args, ...command])
      expect(ran.code).not.toBe(0)
      expect(ran.err).toContain(says)
      const wrote = readFileSync(join(root, 'requests'), 'utf8').slice(requests.length).trim().split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(call => call.method !== 'GET')
      expect(wrote).toEqual([])
    }
  }, 60_000)
})
