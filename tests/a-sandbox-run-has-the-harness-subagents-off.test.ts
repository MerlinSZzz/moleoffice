// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY RUN THE LAUNCHERS START HAS THE HARNESS'S OWN SUBAGENTS AND WORKFLOWS OFF, so work a run would hand to one goes
 * to a worker registered in the office (REQUIREMENTS.md, "harness subagents and workflows off in every run the launchers
 * start", and "one list of the switched-off harness tools"). One case for each runtime reads what the launcher produced:
 * the words a stand-in program was started with, or the configuration it was given in its environment. More read the
 * brief a worker and a round were given, and the brief of a dsh worker, which says whether they are off by what starts
 * dsh in the sandbox. One starts each harness program with --plain-env, which keeps the launcher's variables out of a
 * command but not the switch.
 *
 * WHAT STARTS DSH IS READ AS CODE. A dsh worker's brief says they are off only when the sandbox's
 * tools/dsh-hooks/run-agent.sh reads DSH_FEATURES_OFF from tools/harness-features-off.mjs and passes it to dsh with
 * --patch, and a file name in a comment counts for nothing (REQUIREMENTS.md, "dsh's starting words must follow
 * run-agent.sh's code"). The sandbox's tools/ here is a folder of links to this checkout's, but for run-agent.sh, which
 * each of these cases writes. The launcher reads that copy. The helper, a link, runs this checkout's own. The cases
 * build the copies from this tree's run-agent.sh and the lines that give dsh the patch, written out below.
 *
 * ONE LIST. The switches live in src/config/harness-features-off.mjs, which the office's own terminal launches read as
 * well. Each runtime's case says the launcher's words are that list's.
 *
 * THE SWITCH IN THE RUN'S HOME AS WELL. A harness started inside a shell's words gets nothing from the command. So
 * every start puts the switch where the program reads it whatever starts it: Claude Code's permissions.deny in its
 * settings file, and Codex's features in its config.toml. The helper refuses a Codex run whose program is a shell, so
 * the case starts that Codex with a start that names no runtime. Each case reads the file the stand-in program would read, by
 * the HOME, CLAUDE_CONFIG_DIR and CODEX_HOME it was given, as a sandbox run has them: HOME is the sandbox's home, and
 * neither of the other two is set. dsh reads its tools from its profile, and the office profile does not take the patch
 * yet, so a dsh started inside a shell's words is told that it has them.
 *
 * THE HOME'S FILES ARE WRITTEN WHOLE, through a new file that takes the old one's place with its mode, and not at all
 * when the switch is all in them. One case starts two runs at once on a home that holds the run hooks and a setting of
 * its own, and then a third. Two starts cannot be made to write at the same instant, so the case keeps a second name for
 * each old file: a file written again where it is shows the new text through it. A file the switch cannot go into
 * stops the start, its words name it, and neither file is written. The run hooks a Claude Code start puts in go in with
 * the switch, in the same file written whole, so the settings are never there with the hooks and without the switch,
 * and a settings file the switch cannot go into is refused before the hooks go in.
 *
 * THE SWITCHES ARE WRITTEN OUT HERE, as the criteria, and not read from the code that puts them in. Each was read from
 * the version in the sandbox image: Claude Code 2.1.281 names its subagent tool Agent and its workflow tool Workflow,
 * and ListAgents and SendMessage only talk to subagents and agent teams, while TaskStop also stops a run's own
 * background commands and stays; it takes permissions.deny in its settings file as well; codex-cli 0.159.2 has the
 * features multi_agent and multi_agent_v2, and reads them under [features] in its config.toml as well; OpenCode 1.18.31
 * reads permission.task; dsh 0.1.5-rc.2 has the rows below in its profiles and takes a patch list with --patch.
 *
 * WHAT IS REAL AND WHAT IS NOT. The launchers are the real tools/sandbox.mjs and tools/sandbox-start.mjs. The office is
 * a stand-in on a loopback port, docker is the shared stand-in, and each program is a stand-in that writes down its
 * words, its standard input and its environment. No real model, login or key is used.
 *
 * THE MUTATIONS, EACH TRIED ALONE AFTER A CONTROL RUN, each turning its case red:
 *   - Claude Code's switch taken out (CLAUDE_CODE_FEATURES_OFF empty);
 *   - Codex's switches taken out (CODEX_FEATURES_OFF empty);
 *   - OpenCode's config left as it was given (no OPENCODE_CONFIG_CONTENT from the switch);
 *   - dsh's --patch taken out;
 *   - the starting words taken out of a worker's and a round's brief;
 *   - the words that say they are off given to a dsh worker whatever starts it;
 *   - the launcher's words chosen by the patch file's name in run-agent.sh's text, as before;
 *   - a --patch counted whatever variable it passes;
 *   - a comment read as code;
 *   - the switches kept out of a --plain-env start;
 *   - the one list without ListAgents and SendMessage;
 *   - Claude Code's switch kept out of the run's home;
 *   - Codex's switch kept out of the run's home;
 *   - Codex's switch put in a [features] table of its own after the one the file has;
 *   - the home's switch given only to a command whose program is the harness's own;
 *   - the home's switch given only at a Claude Code or a Codex start;
 *   - a dsh started inside a shell's words not told that its profile does not carry the switch;
 *   - a home file written again where it is, and not through a new file;
 *   - the run hooks' settings written again where they are, and not through a new file;
 *   - the switch left out of the write that puts the run hooks in;
 *   - the run hooks written into a settings file the switch cannot go into;
 *   - the new file given the mode any new file gets, and not the old one's;
 *   - the new file given the old one's mode only as far as the umask lets it through;
 *   - Claude Code's settings written again when they deny every tool already;
 *   - Codex's config.toml written again when it has both features off already;
 *   - Claude Code's settings written before Codex's config.toml is worked out;
 *   - a home file the switch cannot go into let through, with the start going on;
 *   - the refusal's words without saying that nothing in the file was changed.
 */
import { execFileSync, spawn } from 'node:child_process'
import { chmodSync, copyFileSync, existsSync, linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, onTestFinished } from 'vitest'
import { thePortsATestKeepsOff } from '../tools/live-office-ports.mjs'
import { LEGACY_ROUND_CHAPTERS, writeRoundStartRules } from './round-chapters-fixture.ts'
import { FAKE_DOCKER, withAPrivateTmpToSweep } from './sandbox-stand-ins.ts'
import { syntheticDshReader } from './dsh-native-stand-in.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { THE_FACTS_VARIABLE, prepareClaudeRunHome, theFactsAStartIsGiven, writeInstance } from '../tools/sandbox-common.mjs'
import { THE_MODELS_START_VALUES } from '../src/config/model-efforts.mjs'
import * as theOneList from '../src/config/harness-features-off.mjs'
import { THE_STARTING_WORDS, THE_STARTING_WORDS_WITHOUT_THE_SWITCH, aCommandWithTheHarnessFeaturesOff, aRunnerGivesDshThePatch } from '../tools/harness-features-off.mjs'

/** The tools a Claude Code run must not have, by the names its version gives them. */
const CLAUDE_CODES_SUBAGENT_AND_WORKFLOW_TOOLS = ['Agent', 'Task', 'Workflow', 'ListAgents', 'SendMessage']
/** A tool a Claude Code run keeps: it also stops the run's own background commands. */
const A_TOOL_CLAUDE_CODE_KEEPS = 'TaskStop'
/** The Codex features that give a run its subagent tool. */
const CODEX_SUBAGENT_FEATURES = ['multi_agent', 'multi_agent_v2']
/** The rows of a dsh profile that give a run subagents and workflows. */
const DSH_SUBAGENT_AND_WORKFLOW_ROWS = ['tool-subagent', 'tool-subagent-fork', 'tool-subagent-control', 'tool-subagent-list-agents', 'tool-workflow', 'tool-ralph']
/** What a brief's first chapter must say. */
const THE_STARTING_WORDS_SAY = [/subagents and workflows are off/i, /registered in the office/]
/** The line of run-agent.sh that starts dsh, as it was before it gave dsh the patch. */
const THE_DSH_START_WITHOUT_THE_PATCH = 'nice -n 19 "$D/npm/node_modules/.bin/dsh" --profile office --patch "$HERE/brief-by-path.patch.yml" "${settings_args[@]}" "$BRIEF" < /dev/null >> "$LOG" 2>&1'
/** The comment run-agent.sh has above the lines that give dsh the patch. It names the patch file. */
const THE_COMMENT_NAMING_THE_PATCH = [
  "# THE HARNESS'S OWN SUBAGENTS AND WORKFLOWS OFF: the patch list dsh-harness-features-off.patch.json of the checkout",
  "# this script runs from, read from tools/harness-features-off.mjs, which names it as dsh's switch. It goes right after",
  '# the brief-by-path patch. dsh 0.1.5-rc.2 refuses to start when it cannot read a --patch file.',
]
/** The lines that read the patch from tools/harness-features-off.mjs and start dsh with it. */
const THE_PATCH_READ_AND_THE_DSH_START = [
  `features_off="$(node --input-type=module -e 'const { DSH_FEATURES_OFF } = await import(process.argv[1]); console.log(DSH_FEATURES_OFF[1])' "$HERE/../harness-features-off.mjs")" || {`,
  '  echo "run-agent.sh: tools/harness-features-off.mjs could not be read for dsh\'s patch list (the reason is above), so dsh was not started." >&2',
  '  exit 1',
  '}',
  'nice -n 19 "$D/npm/node_modules/.bin/dsh" --profile office --patch "$HERE/brief-by-path.patch.yml" --patch "$features_off" "${settings_args[@]}" "$BRIEF" < /dev/null >> "$LOG" 2>&1',
]
/** This tree's run-agent.sh. */
const THIS_TREES_RUNNER = readFileSync(join(process.cwd(), 'tools', 'dsh-hooks', 'run-agent.sh'), 'utf8')

const key = 'c4'.repeat(32)
const starterKey = 'd9'.repeat(32)
const agent = 'synthetic-features-worker'
let root = ''
let dir = ''
let worktree = ''
let api = ''
let office: Server
let sequence = 0
/** A model the launcher's own table names, so a start of it needs no native selection from the office. */
const legacyModel = Object.keys(THE_MODELS_START_VALUES)[0]!
const runs = new Map<string, { runtime: string; reads: number; title?: string; data?: Record<string, unknown> }>()
const facts = () => ({
  instance: 'synthetic', template: 'synthetic', templateDir: join(root, 'template'),
  containerRow: 'synthetic-container', container: { name: 'synthetic-container', id: 'synthetic-container' },
  ref: 'main', from: worktree, workspace: 'default',
})
interface Capture {
  argv: string[]
  stdin: string
  allEnv: Record<string, string>
  /** The --patch files the stand-in copied at its own start, and the pid it wrote them with. */
  patches: { file: string; text?: string; missing?: string; pid: number }[]
  pid: number
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'mole-features-off-'))
  dir = join(root, 'synthetic')
  worktree = join(dir, 'worktrees', agent)
  mkdirSync(worktree, { recursive: true })
  writeRoundStartRules(dir, worktree)
  for (const folder of ['bin', 'home', 'tmp', 'repo', 'briefs']) mkdirSync(join(dir, folder), { recursive: true })
  symlinkSync(join(process.cwd(), 'src'), join(dir, 'repo', 'src'))
  // THE CLONE'S TOOLS: a link to each of this checkout's, and a copy of run-agent.sh, which a case may write again.
  const tools = join(process.cwd(), 'tools'), theClones = join(dir, 'repo', 'tools')
  mkdirSync(join(theClones, 'dsh-hooks'), { recursive: true })
  for (const name of readdirSync(tools)) if (name !== 'dsh-hooks') symlinkSync(join(tools, name), join(theClones, name))
  for (const name of readdirSync(join(tools, 'dsh-hooks'))) if (name !== 'run-agent.sh') symlinkSync(join(tools, 'dsh-hooks', name), join(theClones, 'dsh-hooks', name))
  writeFileSync(join(theClones, 'dsh-hooks', 'run-agent.sh'), THIS_TREES_RUNNER, { mode: 0o755 })
  execFileSync('git', ['init', '-q', '-b', 'main', worktree])
  execFileSync('git', ['-C', worktree, '-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-q', '--allow-empty', '-m', 'synthetic'])
  mkdirSync(join(root, 'template'))
  writeFileSync(join(root, 'template', 'devcontainer.json'), '{}')
  writeFileSync(join(root, 'template', 'sandbox.json'), JSON.stringify({ template: 'synthetic' }))
  writeInstance(dir, facts())
  writeFileSync(join(dir, 'bin', 'docker'), FAKE_DOCKER, { mode: 0o755 })
  const program = `#!${process.execPath}
const fs = require('fs')
const argv = process.argv.slice(2)
// dsh reads each --patch file at its own start, and the run's scratch folder that holds one is removed when the run ends.
const patches = argv.flatMap((word, at) => word === '--patch' ? [argv[at + 1]] : []).map(file => {
  try { return { file, text: fs.readFileSync(file, 'utf8'), pid: process.pid } }
  catch (error) { return { file, missing: error.code, pid: process.pid } }
})
fs.writeFileSync(process.env.FEATURES_CAPTURE, JSON.stringify({ argv, patches, pid: process.pid, stdin: fs.readFileSync(0, 'utf8'), allEnv: process.env }))
process.stdout.write('{}')
`
  for (const name of ['claude', 'codex', 'opencode', 'dsh']) {
    writeFileSync(join(dir, 'bin', name), program)
    chmodSync(join(dir, 'bin', name), 0o755)
  }
  office = createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json')
    const run = runs.get(req.url?.split('/').pop() ?? '')
    if (req.url === '/api/participants') {
      res.end(JSON.stringify({ agents: [{ id: agent, handle: agent, name: agent, record: 'synthetic-agent-record' }] }))
    } else if (req.method === 'GET' && req.url?.startsWith('/api/office/run-models/for/')) {
      const query = new URL(req.url, 'http://synthetic.invalid').searchParams
      const model = query.get('model') ?? 'synthetic-model', runtime = query.get('runtime') ?? 'claude-code'
      res.end(JSON.stringify({ model, effort: null, effortFrom: 'none', ...(!query.has('model') || model === legacyModel ? {} : {
        selection: { runtime, model, native: { model, provider: runtime === 'dsh' ? 'deepseek-official' : null, variant: null, effort: null }, casting: null },
      }) }))
    } else if (req.url === `/api/participants/agent/${agent}`) {
      res.end(JSON.stringify({ participant: { id: agent, handle: agent } }))
    } else if (req.url === '/api/kinds/session') {
      res.end(JSON.stringify({ kind: { fields: [{ key: 'adaptedTool' }] } }))
    } else if (req.method === 'POST' && req.url === '/api/records') {
      let body = ''
      for await (const chunk of req) body += chunk
      const { title, data } = JSON.parse(body)
      const id = `verb-${++sequence}`
      runs.set(id, { runtime: data?.runtime ?? 'claude-code', reads: 0, title, data })
      res.statusCode = 201
      res.end(JSON.stringify({ record: { id }, runKey: { key } }))
    } else if (req.method === 'POST' && req.url === `/api/agents/${agent}/hand-run`) {
      res.end('{"cut":null}')
    } else if (req.method === 'GET' && req.url === '/api/resources') {
      res.end('{"resources":[]}')
    } else if (req.url === '/api/toolset/uses') {
      res.statusCode = 201
      res.end('{}')
    } else if (req.method === 'GET' && req.url?.startsWith('/api/checks/')) {
      res.end(JSON.stringify(LEGACY_ROUND_CHAPTERS))
    } else if (req.method === 'PATCH' && run) {
      let body = ''
      for await (const chunk of req) body += chunk
      run.data = { ...(run.data ?? {}), ...JSON.parse(body).dataPatch }
      res.end(JSON.stringify({ record: { kind: 'session', data: run.data } }))
    } else if (req.method === 'GET' && run) {
      const priorReads = run.reads
      if (req.headers['x-mole-office-session'] === req.url?.split('/').pop()) run.reads++
      res.end(JSON.stringify({ record: { kind: 'session', title: run.title, data: {
        ...run.data, state: run.data?.state ?? (priorReads < (run.data ? 2 : 1) ? 'running' : 'finished'), servingAgent: agent, runtime: run.runtime,
        workingDirectory: worktree, cutFrom: 'main', model: run.data?.model ?? 'opus', served: { model: 'synthetic' },
        sandbox: { template: 'synthetic', container: 'synthetic-container', folder: dir },
      } } }))
    } else if (req.method === 'POST' && req.url === '/api/resources') {
      let body = ''
      for await (const chunk of req) body += chunk
      const pgid = JSON.parse(body).pidInContainer as number
      res.statusCode = 201
      res.end(JSON.stringify({ resource: { id: 'synthetic-process', key: String(pgid), pgid } }))
    } else if (req.url === '/api/health') res.end('{"synthetic":true}')
    else {
      res.statusCode = 404
      res.end('{"error":"No synthetic route"}')
    }
  })
  await new Promise<void>(resolve => office.listen(0, '127.0.0.1', resolve))
  api = `http://127.0.0.1:${(office.address() as AddressInfo).port}`
  expect(thePortsATestKeepsOff()).not.toContain(Number(new URL(api).port))
})
afterAll(async () => {
  await new Promise<void>(resolve => office.close(() => resolve()))
  rmSync(root, { recursive: true, force: true })
})

/** A run of `runtime` started by the real helper, as the launcher starts it: what the program was started with. */
async function launched(command: string[], runtime: string, env: Record<string, string | undefined> = {}, model = legacyModel, { plain = false } = {}) {
  const { code, err, label, capturePath } = await aStart(command, runtime, env, model, { plain })
  expect(code, err).toBe(0)
  await expect.poll(() => existsSync(capturePath)).toBe(true)
  return { ...JSON.parse(readFileSync(capturePath, 'utf8')) as Capture, label }
}

/** The same start, whether or not the helper refused it: how it ended, and where the program would write down its words. */
async function aStart(command: string[], runtime: string, env: Record<string, string | undefined> = {}, model = legacyModel, { plain = false } = {}) {
  const label = `synthetic-${++sequence}`
  const capturePath = join(dir, `${label}.json`)
  runs.set(label, { runtime, reads: 0, data: { model } })
  // A plain start is a caller's own command, which the host has registered: its row is in the handshake folder.
  const handshake = join(dir, `${label}-handshake`)
  if (plain) {
    mkdirSync(handshake)
    writeFileSync(join(handshake, 'row.json'), '{"id":"synthetic-process"}')
  }
  const child = spawn(process.execPath, [
    'tools/sandbox-start.mjs', '--in-background', '--instance', dir, '--cwd', worktree,
    '--as', 'synthetic-starter', '--session', 'synthetic-starter-session', '--workspace', 'default', '--api', api,
    ...(plain ? ['--handshake', handshake, '--wait', '--timeout', '5', '--plain-env'] : [
      '--agent', agent, '--runtime', runtime, '--model', model, '--worktree', worktree, '--cut-from', 'main', '--filed', label,
    ]),
    '--', ...command,
  ], { env: withAPrivateTmpToSweep({
    ...withoutInheritedEffort(), MOLE_OFFICE_AGENT: agent, MOLE_OFFICE_SESSION: 'synthetic-session', MOLE_OFFICE_WORKSPACE: 'default',
    MOLE_OFFICE_API: api, MOLE_AGENT_KEY: starterKey, SANDBOX_RUN_KEY: plain ? undefined : key, [THE_FACTS_VARIABLE]: theFactsAStartIsGiven(facts()),
    HOME: join(dir, 'home'), CLAUDE_CONFIG_DIR: join(dir, 'home'), CLAUDE_CODE_OAUTH_TOKEN: 'synthetic-login-for-the-stand-in-only',
    MOLE_OFFICE_COMMIT_EMAIL: 'synthetic@example.invalid', PATH: join(dir, 'bin') + ':' + process.env['PATH'],
    FEATURES_CAPTURE: capturePath, TMPDIR: join(dir, 'tmp'), ...env,
  }, join(dir, 'a-private-tmp')) })
  let err = ''
  child.stderr.on('data', chunk => { err += String(chunk) })
  const code = await new Promise<number | null>(resolve => child.on('close', resolve))
  return { code, err, label, capturePath }
}

/** A worker or a round started by the real host launcher through the docker stand-in: the record it printed. */
async function startedVerb(verb: 'worker' | 'round', brief: string, capturePath: string, runtime = 'claude-code') {
  writeFileSync(join(dir, 'state.json'), JSON.stringify({ containers: {
    'synthetic-container': { Id: 'synthetic-container', State: { Running: true }, Mounts: [], Config: { Env: [
      `HOME=${join(dir, 'home')}`, `FEATURES_CAPTURE=${capturePath}`, `TMPDIR=${join(dir, 'tmp')}`,
      'CLAUDE_CODE_OAUTH_TOKEN=synthetic-login-for-the-stand-in-only', 'DEEPSEEK_API_KEY=synthetic-deepseek-key-for-the-stand-in-only',
    ] } },
  }, calls: [], bugs: {} }))
  const child = spawn(process.execPath, ['tools/sandbox.mjs', verb, 'synthetic',
    '--sandboxes', root, '--api', api, '--workspace', 'default',
    '--as', 'synthetic-starter', '--session', 'synthetic-starter-session',
    '--agent', agent, '--brief', brief, '--runtime', runtime, ...(verb === 'worker' ? ['--model', runtime === 'dsh' ? 'deepseek-v4.1-flash' : 'opus'] : []), '--json',
  ], { env: { ...withoutInheritedEffort(), HOME: join(dir, 'home'), MOLE_AGENT_KEY: starterKey,
    MOLE_OFFICE_COMMIT_EMAIL: 'synthetic@example.invalid', FAKE_DOCKER_DIR: dir,
    PATH: join(dir, 'bin') + ':' + process.env['PATH'],
  } })
  let out = '', err = ''
  child.stdout.on('data', chunk => { out += String(chunk) })
  child.stderr.on('data', chunk => { err += String(chunk) })
  const code = await new Promise<number | null>(resolve => child.on('close', resolve))
  expect(code, err).toBe(0)
  return JSON.parse(out.trim()) as { run: string; command: string[] }
}

/** The same, for a run whose program is the stand-in: what that program was given. */
async function launchedVerb(verb: 'worker' | 'round', brief: string) {
  const capturePath = join(dir, `verb-capture-${++sequence}.json`)
  const record = await startedVerb(verb, brief, capturePath)
  // Its last line: every run here ends with no commits and no report, and that line is written after its last request.
  const finished = join(dir, 'logs', record.run, 'finish.log')
  await expect.poll(() => existsSync(finished) && readFileSync(finished, 'utf8').includes('with no report')).toBe(true)
  return JSON.parse(readFileSync(capturePath, 'utf8')) as Capture
}

/** The tools a Claude Code command's --disallowedTools names, or null when it has none. */
function theToolsClaudeCodeIsDenied(argv: string[]) {
  const at = argv.findIndex(word => word === '--disallowedTools' || word.startsWith('--disallowedTools='))
  if (at < 0) return null
  return (argv[at] === '--disallowedTools' ? argv[at + 1]! : argv[at]!.slice('--disallowedTools='.length)).split(/[,\s]+/)
}

/** The features a Codex command turns off before exec. */
function theFeaturesCodexTurnsOff(argv: string[]) {
  return argv.slice(0, Math.max(argv.indexOf('exec'), 0)).flatMap((word, at, words) => word === '--disable' ? [words[at + 1]] : [])
}

/** The settings file a Claude Code run reads, by the environment it was started with. */
function theFileClaudeCodeReads(env: Record<string, string>) {
  return join(env['CLAUDE_CONFIG_DIR'] || join(env['HOME']!, '.claude'), 'settings.json')
}

/** The config file a Codex run reads, by the environment it was started with. */
function theFileCodexReads(env: Record<string, string>) {
  return join(env['CODEX_HOME'] || join(env['HOME']!, '.codex'), 'config.toml')
}

/** One table of a config.toml, key by key, for the plain lines Codex writes. The table must be there once. */
function theTomlTable(text: string, table: string) {
  const keys: Record<string, string> = {}
  let current = '', seen = 0
  for (const line of text.split('\n')) {
    const header = /^\s*\[([^[\]]+)\]\s*(#.*)?$/.exec(line)
    if (header) {
      current = header[1]!.trim()
      if (current === table) seen++
      continue
    }
    const pair = /^\s*([A-Za-z0-9_-]+)\s*=\s*(.*?)\s*(#.*)?$/.exec(line)
    if (pair && current === table) keys[pair[1]!] = pair[2]!
  }
  expect(seen, `[${table}] is in the file once:\n${text}`).toBe(1)
  return keys
}

/** What the helper said about a run it started, from the run's launch log. */
function whatTheStartSaid(label: string) {
  const file = join(dir, 'logs', label, 'launch.txt')
  return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

/** The brief's first chapter: what comes before the first rule between chapters. */
function theFirstChapter(text: string) {
  const at = text.indexOf('\n\n---\n\n')
  expect(at, 'the brief has more than one chapter').toBeGreaterThan(0)
  return text.slice(0, at)
}

describe('each runtime the launcher starts has the harness subagents and workflows off', () => {
  it('Claude Code: the command carries --disallowedTools naming Agent, Task, Workflow, ListAgents and SendMessage, from the one list', async () => {
    const { argv } = await launched(['claude', '-p', 'a synthetic prompt'], 'claude-code')
    expect(theToolsClaudeCodeIsDenied(argv), JSON.stringify(argv)).toEqual(expect.arrayContaining(CLAUDE_CODES_SUBAGENT_AND_WORKFLOW_TOOLS))
    expect(theToolsClaudeCodeIsDenied(argv)).not.toContain(A_TOOL_CLAUDE_CODE_KEEPS)
    expect(argv).toEqual(expect.arrayContaining([...theOneList.CLAUDE_CODE_FEATURES_OFF]))
    expect(argv).toEqual(expect.arrayContaining(['-p', 'a synthetic prompt']))
  })

  it('Codex: --disable names both subagent features, before exec', async () => {
    const { argv } = await launched(['codex', 'exec', 'a synthetic prompt'], 'codex')
    const exec = argv.indexOf('exec')
    expect(exec, JSON.stringify(argv)).toBeGreaterThan(0)
    expect(theFeaturesCodexTurnsOff(argv)).toEqual(expect.arrayContaining(CODEX_SUBAGENT_FEATURES))
    expect(argv.slice(0, theOneList.CODEX_FEATURES_OFF.length), 'the one list\'s switches, first').toEqual([...theOneList.CODEX_FEATURES_OFF])
    expect(argv.slice(exec)).toContain('a synthetic prompt')
  })

  it("OpenCode: its config denies the task tool, and keeps what it was given", async () => {
    const given = { plugin: ['synthetic-plugin'], permission: { bash: 'allow' } }
    const { argv, allEnv } = await launched(['opencode', 'run', 'a synthetic prompt'], 'opencode', { OPENCODE_CONFIG_CONTENT: JSON.stringify(given) })
    expect(argv.slice(0, 1)).toEqual(['run'])
    const config = JSON.parse(allEnv['OPENCODE_CONFIG_CONTENT'] ?? '{}')
    expect(config.permission?.task).toBe('deny')
    expect(config.permission).toMatchObject(theOneList.OPENCODE_FEATURES_OFF.permission)
    expect(config.permission?.bash).toBe('allow')
    expect(config.plugin).toEqual(expect.arrayContaining(given.plugin))
  })

  it('dsh: --patch names a list that disables the subagent and workflow rows', async () => {
    // A model dsh maps, with the stand-in of its settings reader: the launcher hands dsh that selection as a patch as well.
    const { argv, patches: copies, pid } = await launched(['dsh', '--profile', 'office', 'a synthetic prompt'], 'dsh', {
      DEEPSEEK_API_KEY: 'synthetic-deepseek-key-for-the-stand-in-only', SANDBOX_DSH_NATIVE_READER: syntheticDshReader(join(root, 'reader')),
    }, 'deepseek-v4.1-flash')
    const patches = argv.flatMap((word, at) => word === '--patch' ? [argv[at + 1]!] : [])
    // The stand-in took each copy at its own start: dsh reads a --patch then, and the run's scratch folder is gone by now.
    expect(copies.map(copy => copy.file), JSON.stringify(argv)).toEqual(patches)
    expect(copies.filter(copy => copy.missing !== undefined), JSON.stringify(copies)).toEqual([])
    for (const copy of copies) expect(copy.pid, 'the copy was not taken by the running stand-in').toBe(pid)
    const disabled = copies.flatMap(copy => {
      const rows = JSON.parse(copy.text!)
      return Array.isArray(rows) ? rows.filter(row => row?.disabled === true).map(row => row.id) : []
    })
    expect(disabled, JSON.stringify(argv)).toEqual(expect.arrayContaining(DSH_SUBAGENT_AND_WORKFLOW_ROWS))
  })
})

describe("the switch is in the run's home as well, whatever the command starts", () => {
  it("Claude Code: the settings file it reads denies the same tools, and keeps everything else it held", async () => {
    // A sandbox run has no CLAUDE_CONFIG_DIR, so Claude Code reads the settings in the sandbox's home.
    const held = join(dir, 'home', '.claude', 'settings.json')
    mkdirSync(join(dir, 'home', '.claude'), { recursive: true })
    writeFileSync(held, JSON.stringify({ synthetic: 'kept', permissions: { allow: ['Read'], deny: ['Bash(rm -rf:*)'] } }))
    const { allEnv } = await launched(['claude', '-p', 'a synthetic prompt'], 'claude-code', { CLAUDE_CONFIG_DIR: undefined })
    expect(allEnv['CLAUDE_CONFIG_DIR']).toBeUndefined()
    const file = theFileClaudeCodeReads(allEnv)
    expect(file).toBe(held)
    const settings = JSON.parse(readFileSync(file, 'utf8'))
    expect(settings.permissions.deny).toEqual(expect.arrayContaining([...CLAUDE_CODES_SUBAGENT_AND_WORKFLOW_TOOLS, ...theOneList.CLAUDE_CODE_TOOLS_OFF, 'Bash(rm -rf:*)']))
    expect(settings.permissions.deny).not.toContain(A_TOOL_CLAUDE_CODE_KEEPS)
    expect(new Set(settings.permissions.deny).size, 'a name is denied twice').toBe(settings.permissions.deny.length)
    expect(settings.permissions.allow).toEqual(['Read'])
    expect(settings.synthetic).toBe('kept')
  })

  it('Codex: the config.toml it reads sets both subagent features false, and keeps its other lines', async () => {
    const held = join(dir, 'home', '.codex', 'config.toml')
    mkdirSync(join(dir, 'home', '.codex'), { recursive: true })
    const projects = '[projects."/synthetic/repo"]\ntrust_level = "trusted"\n'
    writeFileSync(held, `model = "synthetic"\n\n${projects}\n[features]\n# a synthetic comment\nshell_snapshot = true\nmulti_agent = true\n\n[tui]\nsynthetic = 1\n`)
    const { allEnv } = await launched(['codex', 'exec', 'a synthetic prompt'], 'codex')
    expect(allEnv['CODEX_HOME']).toBeUndefined()
    const file = theFileCodexReads(allEnv)
    expect(file).toBe(held)
    const text = readFileSync(file, 'utf8')
    const features = theTomlTable(text, 'features')
    for (const feature of [...CODEX_SUBAGENT_FEATURES, ...theOneList.CODEX_FEATURE_NAMES_OFF]) expect(features[feature], `${feature}:\n${text}`).toBe('false')
    expect(features['shell_snapshot']).toBe('true')
    expect(text).toContain(projects)
    expect(text).toContain('# a synthetic comment\n')
    expect(text.startsWith('model = "synthetic"\n')).toBe(true)
    expect(theTomlTable(text, 'tui')).toEqual({ synthetic: '1' })
  })

  it("a harness started inside a shell's words gets the switch from its home, and a dsh is told it has them", async () => {
    rmSync(join(dir, 'home', '.claude', 'settings.json'), { force: true })
    rmSync(join(dir, 'home', '.codex', 'config.toml'), { force: true })
    const claude = await launched(['sh', '-c', 'exec claude -p "a synthetic prompt"'], 'claude-code', { CLAUDE_CONFIG_DIR: undefined })
    // Nothing in its words, since the launcher does not rewrite a shell's.
    expect(theToolsClaudeCodeIsDenied(claude.argv), JSON.stringify(claude.argv)).toBeNull()
    expect(JSON.parse(readFileSync(theFileClaudeCodeReads(claude.allEnv), 'utf8')).permissions?.deny).toEqual(expect.arrayContaining(CLAUDE_CODES_SUBAGENT_AND_WORKFLOW_TOOLS))
    // The helper refuses a Codex run whose program it cannot read, so a Codex inside a shell's words comes from a start that
    // names no runtime, which still puts the switch in the home. The start above wrote this file too, so it goes first.
    rmSync(join(dir, 'home', '.codex', 'config.toml'), { force: true })
    const codex = await launched(['sh', '-c', 'exec codex exec "a synthetic prompt"'], 'codex', {}, legacyModel, { plain: true })
    expect(theFeaturesCodexTurnsOff(codex.argv), JSON.stringify(codex.argv)).toEqual([])
    const features = theTomlTable(readFileSync(theFileCodexReads(codex.allEnv), 'utf8'), 'features')
    for (const feature of CODEX_SUBAGENT_FEATURES) expect(features[feature]).toBe('false')
    // OpenCode's switch is its environment, which reaches it inside a shell as well.
    const opencode = await launched(['sh', '-c', 'exec opencode run "a synthetic prompt"'], 'opencode')
    expect(JSON.parse(opencode.allEnv['OPENCODE_CONFIG_CONTENT'] ?? '{}').permission?.task).toBe('deny')
    // dsh's profile does not take the patch yet: the start says the run has them, and never that they are off. A shell
    // cannot carry a native model's selection, so this one is a model the launcher's own table names.
    const dsh = await launched(['sh', '-c', 'exec dsh --profile office "a synthetic prompt"'], 'dsh', {
      DEEPSEEK_API_KEY: 'synthetic-deepseek-key-for-the-stand-in-only',
    })
    expect(dsh.argv).not.toContain('--patch')
    expect(whatTheStartSaid(dsh.label)).toMatch(/dsh's own profile does not carry it/)
    expect(whatTheStartSaid(dsh.label)).toMatch(/the run has them/)
  })
})

describe("the home's files are written whole, and only when the switch is not all in them", () => {
  const settingsFile = () => join(dir, 'home', '.claude', 'settings.json')
  const configFile = () => join(dir, 'home', '.codex', 'config.toml')
  /** The two files as the case finds them, with a mode the usual umask does not give a new file; gone when it ends. */
  function seeded(settings: string, config: string) {
    for (const [file, text] of [[settingsFile(), settings], [configFile(), config]] as const) {
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, text)
      chmodSync(file, 0o664)
    }
    onTestFinished(() => { rmSync(settingsFile(), { force: true }); rmSync(configFile(), { force: true }) })
  }

  it('two starts at once leave each file whole with the switch in it and every other byte as it was, and a third start writes neither', async () => {
    // The run hooks, as a Claude Code start puts them in, beside a setting of the person's own, and without the switch,
    // as a home whose hooks went in before the switch did holds them.
    seeded(`${JSON.stringify({ synthetic: 'kept' }, null, 2)}\n`, 'model = "synthetic"\n\n[tui]\nsynthetic = 1\n')
    expect(prepareClaudeRunHome(join(dir, 'home'), join(dir, 'repo'))).not.toBeNull()
    const { permissions: _, ...withTheHooks } = JSON.parse(readFileSync(settingsFile(), 'utf8'))
    writeFileSync(settingsFile(), `${JSON.stringify(withTheHooks, null, 2)}\n`)
    const settingsBefore = readFileSync(settingsFile(), 'utf8'), configBefore = readFileSync(configFile(), 'utf8')
    expect(JSON.parse(settingsBefore).hooks?.SessionStart, 'the run hooks are in the file').toBeDefined()
    // A second name for each file as it is now, which a file written again where it is would show the new text through.
    const seen = [join(root, 'settings before'), join(root, 'config before')]
    for (const [at, file] of [settingsFile(), configFile()].entries()) {
      rmSync(seen[at]!, { force: true })
      linkSync(file, seen[at]!)
    }
    const folders = () => [readdirSync(dirname(settingsFile())).sort(), readdirSync(dirname(configFile())).sort()]
    const foldersBefore = folders()
    await Promise.all([
      launched(['claude', '-p', 'a synthetic prompt'], 'claude-code', { CLAUDE_CONFIG_DIR: undefined }),
      launched(['codex', 'exec', 'a synthetic prompt'], 'codex'),
    ])
    const settingsAfter = readFileSync(settingsFile(), 'utf8'), configAfter = readFileSync(configFile(), 'utf8')
    // Settings that parse, with the switch after the text they held, byte for byte up to its closing brace.
    const { permissions, ...kept } = JSON.parse(settingsAfter)
    expect(permissions.deny).toEqual(expect.arrayContaining(CLAUDE_CODES_SUBAGENT_AND_WORKFLOW_TOOLS))
    expect(kept).toEqual(JSON.parse(settingsBefore))
    expect(settingsAfter.startsWith(settingsBefore.replace(/\n\}\n$/, ',\n')), settingsAfter).toBe(true)
    // A config.toml with the lines it held and one [features] table after them.
    expect(configAfter).toBe(`${configBefore}\n[features]\nmulti_agent = false\nmulti_agent_v2 = false\n`)
    // Each is a new file that took the old one's place, with the old one's mode, and nothing is left beside it.
    expect(seen.map(file => readFileSync(file, 'utf8')), 'a file was written again where it was').toEqual([settingsBefore, configBefore])
    expect([settingsFile(), configFile()].map(file => statSync(file).mode & 0o777)).toEqual([0o664, 0o664])
    expect(folders()).toEqual(foldersBefore)
    // A third start finds the switch all there, and writes neither file.
    const inodes = () => [statSync(settingsFile()).ino, statSync(configFile()).ino]
    const written = inodes()
    await launched(['claude', '-p', 'a synthetic prompt'], 'claude-code', { CLAUDE_CONFIG_DIR: undefined })
    expect(inodes(), 'a file with the switch all in it was written again').toEqual(written)
    expect([readFileSync(settingsFile(), 'utf8'), readFileSync(configFile(), 'utf8')]).toEqual([settingsAfter, configAfter])
  })

  it("a Claude Code start's run hooks go in with the switch, in one file written whole, and not into a file the switch cannot go into", () => {
    seeded(`${JSON.stringify({ synthetic: 'kept' }, null, 2)}\n`, '')
    const before = readFileSync(settingsFile(), 'utf8')
    const seen = join(root, 'settings before the hooks')
    rmSync(seen, { force: true })
    linkSync(settingsFile(), seen)
    const folder = readdirSync(dirname(settingsFile())).sort()
    expect(prepareClaudeRunHome(join(dir, 'home'), join(dir, 'repo'))).toMatch(/denies Claude Code's own subagent and workflow tools/)
    const after = JSON.parse(readFileSync(settingsFile(), 'utf8'))
    expect(after.permissions?.deny, 'the run hooks went in without the switch').toEqual(expect.arrayContaining(CLAUDE_CODES_SUBAGENT_AND_WORKFLOW_TOOLS))
    expect(after.hooks?.SessionStart, 'the run hooks are in the file').toBeDefined()
    expect(after.synthetic).toBe('kept')
    expect(readFileSync(seen, 'utf8'), 'the file was written again where it was').toBe(before)
    expect(statSync(settingsFile()).mode & 0o777).toBe(0o664)
    expect(readdirSync(dirname(settingsFile())).sort()).toEqual(folder)
    // Settings whose deny is not a list: refused before the hooks go in, so nothing in the file changes.
    const refused = `${JSON.stringify({ synthetic: 'kept', permissions: { deny: 'Agent' } }, null, 2)}\n`
    writeFileSync(settingsFile(), refused)
    expect(() => prepareClaudeRunHome(join(dir, 'home'), join(dir, 'repo'))).toThrow(/Nothing in it was changed/)
    expect(readFileSync(settingsFile(), 'utf8'), 'the run hooks went into a file the switch cannot go into').toBe(refused)
  })

  it('a file the switch cannot go into stops the start, and its words name it and say nothing in it was changed', async () => {
    /** A Codex start, which reads no run hooks into the settings first, and what it left in both files. */
    async function aRefusedStart(file: string) {
      const before = [readFileSync(settingsFile(), 'utf8'), readFileSync(configFile(), 'utf8')]
      const start = await aStart(['codex', 'exec', 'a synthetic prompt'], 'codex')
      expect(start.code, start.err).not.toBe(0)
      expect(existsSync(start.capturePath), 'the program was started').toBe(false)
      const said = whatTheStartSaid(start.label)
      expect(said).toContain(file)
      expect(said).toMatch(/Nothing in it was changed/)
      expect([readFileSync(settingsFile(), 'utf8'), readFileSync(configFile(), 'utf8')], 'a file was changed').toEqual(before)
    }
    seeded('{"synthetic": ', '[features]\nshell_snapshot = true\n')
    await aRefusedStart(settingsFile())
    // Two [features] tables, beside settings the switch would go into: neither file is written.
    seeded(`${JSON.stringify({ synthetic: 'kept' }, null, 2)}\n`, '[features]\nshell_snapshot = true\n\n[features]\nsynthetic = 1\n')
    await aRefusedStart(configFile())
  })
})

describe("a run's starting words say they are off", () => {
  it("a worker's brief begins with them, and its own text follows whole", async () => {
    const brief = join(root, 'worker brief.md')
    const text = '# Synthetic worker\nDo the synthetic thing.\n'
    writeFileSync(brief, text)
    const { stdin } = await launchedVerb('worker', brief)
    for (const words of THE_STARTING_WORDS_SAY) expect(theFirstChapter(stdin)).toMatch(words)
    expect(stdin.endsWith(text)).toBe(true)
  })

  it("a round's brief begins with them as well", async () => {
    const brief = join(root, 'round brief.md')
    writeFileSync(brief, '# Synthetic next round\nCarry on.\n')
    await launchedVerb('worker', brief)
    const { stdin } = await launchedVerb('round', brief)
    for (const words of THE_STARTING_WORDS_SAY) expect(theFirstChapter(stdin)).toMatch(words)
    expect(stdin).toContain('Carry on.')
  })
})

describe("a dsh worker's starting words follow what run-agent.sh does, and not a file name in its text", () => {
  it('a run-agent.sh with the comment that names the patch and no --patch on the dsh line gives the words without the switch', async () => {
    expect(await aDshWorkersFirstChapter(aRunnerWith([...THE_COMMENT_NAMING_THE_PATCH, THE_DSH_START_WITHOUT_THE_PATCH]))).toBe(THE_STARTING_WORDS_WITHOUT_THE_SWITCH)
  })

  it('one with the --patch line and no comment gives the starting words', async () => {
    expect(await aDshWorkersFirstChapter(aRunnerWith(THE_PATCH_READ_AND_THE_DSH_START))).toBe(THE_STARTING_WORDS)
  })

  it("run-agent.sh as it gives dsh the patch gives the starting words, and this tree's own gives the words its dsh line earns", async () => {
    const theOneWithThePatch = aRunnerWith([...THE_COMMENT_NAMING_THE_PATCH, ...THE_PATCH_READ_AND_THE_DSH_START])
    expect(await aDshWorkersFirstChapter(theOneWithThePatch)).toBe(THE_STARTING_WORDS)
    // This tree's own run-agent.sh is one of the two this test knows (theRunnerBeforeThePatch says which, or fails).
    const earned = THIS_TREES_RUNNER === theOneWithThePatch ? THE_STARTING_WORDS : THE_STARTING_WORDS_WITHOUT_THE_SWITCH
    expect(await aDshWorkersFirstChapter(THIS_TREES_RUNNER)).toBe(earned)
  })

  it('a --patch in a comment, a read of the patch in a comment, a --patch of a variable read from elsewhere, and a second dsh start without it count for nothing', () => {
    const [read, ...rest] = THE_PATCH_READ_AND_THE_DSH_START
    const start = rest[rest.length - 1]!
    expect(aRunnerGivesDshThePatch(aRunnerWith(THE_PATCH_READ_AND_THE_DSH_START))).toBe(true)
    expect(aRunnerGivesDshThePatch(aRunnerWith([read!, ...rest.slice(0, -1), `${THE_DSH_START_WITHOUT_THE_PATCH} # --patch "$features_off"`]))).toBe(false)
    expect(aRunnerGivesDshThePatch(aRunnerWith([`# ${read!}`, start]))).toBe(false)
    expect(aRunnerGivesDshThePatch(aRunnerWith(['features_off="$HERE/elsewhere.patch.json"', start]))).toBe(false)
    expect(aRunnerGivesDshThePatch(aRunnerWith([...THE_PATCH_READ_AND_THE_DSH_START, THE_DSH_START_WITHOUT_THE_PATCH]))).toBe(false)
  })
})

describe('a dsh start through run-agent.sh is told the truth about its subagents and workflows', () => {
  let theClonesHelper = ''

  beforeAll(() => {
    // THE HELPER AS A REAL FILE IN THE CLONE, not a link: the command it builds names the clone's own run-agent.sh,
    // which each case writes, as a start inside a sandbox does.
    theClonesHelper = join(dir, 'repo', 'tools', 'sandbox-start.mjs')
    rmSync(theClonesHelper, { force: true })
    copyFileSync(join(process.cwd(), 'tools', 'sandbox-start.mjs'), theClonesHelper)
  })
  afterAll(() => {
    rmSync(theClonesHelper, { force: true })
    symlinkSync(join(process.cwd(), 'tools', 'sandbox-start.mjs'), theClonesHelper)
  })

  /** A dsh start of the helper itself: a brief and no command, so the helper builds the run-agent.sh command. */
  async function aDshHelperStart(runner: string, brief: string, capture: string) {
    const runnerFile = join(dir, 'repo', 'tools', 'dsh-hooks', 'run-agent.sh')
    writeFileSync(runnerFile, runner)
    onTestFinished(() => writeFileSync(runnerFile, THIS_TREES_RUNNER))
    const label = `synthetic-${++sequence}`
    runs.set(label, { runtime: 'dsh', reads: 0, data: { model: 'deepseek-v4.1-flash' } })
    const child = spawn(process.execPath, [theClonesHelper, '--in-background', '--instance', dir, '--cwd', worktree,
      '--as', 'synthetic-starter', '--session', 'synthetic-starter-session', '--workspace', 'default', '--api', api,
      '--agent', agent, '--runtime', 'dsh', '--model', 'deepseek-v4.1-flash', '--worktree', worktree, '--cut-from', 'main', '--filed', label,
      '--brief', brief,
    ], { env: withAPrivateTmpToSweep({
      ...withoutInheritedEffort(), MOLE_OFFICE_AGENT: agent, MOLE_OFFICE_SESSION: 'synthetic-session', MOLE_OFFICE_WORKSPACE: 'default',
      MOLE_OFFICE_API: api, MOLE_AGENT_KEY: starterKey, SANDBOX_RUN_KEY: key, [THE_FACTS_VARIABLE]: theFactsAStartIsGiven(facts()),
      HOME: join(dir, 'home'), CLAUDE_CONFIG_DIR: join(dir, 'home'), CLAUDE_CODE_OAUTH_TOKEN: 'synthetic-login-for-the-stand-in-only',
      MOLE_OFFICE_COMMIT_EMAIL: 'synthetic@example.invalid', PATH: join(dir, 'bin') + ':' + process.env['PATH'],
      TMPDIR: join(dir, 'tmp'), BRIEF_CAPTURE: capture,
      SANDBOX_START_EFFORT: JSON.stringify({ effort: null, effortFrom: 'none', model: 'deepseek-v4.1-flash', askedModel: 'deepseek-v4.1-flash', unavailable: false, predatesEffort: false }),
    }, join(dir, 'a-private-tmp')) })
    let err = ''
    child.stderr.on('data', chunk => { err += String(chunk) })
    const code = await new Promise<number | null>(resolve => child.on('close', resolve))
    expect(code, err).toBe(0)
    await expect.poll(() => existsSync(capture)).toBe(true)
    return { err, label }
  }

  /** The command the helper started, from its own start.json. */
  function theStartCommand(label: string) {
    return JSON.parse(readFileSync(join(dir, 'logs', label, 'start.json'), 'utf8')).command as string[]
  }

  /** A brief file with this text, and its path. */
  function aBriefFile(text: string) {
    const file = join(root, `dsh-helper-brief-${++sequence}.md`)
    writeFileSync(file, text)
    return file
  }

  /** The runner that writes down the brief it was given and stops before it starts dsh. */
  function aRunnerThatWritesItsBrief(runner: string) {
    return runner.replace('#!/bin/bash\n', '#!/bin/bash\ncp "$2" "$BRIEF_CAPTURE"\nexit 0\n')
  }

  /** The warning the switch says about this shell, from the same call the helper makes. */
  function theWarningFor(script: string) {
    return aCommandWithTheHarnessFeaturesOff(['bash', script], {}, 'dsh').says
  }

  it('a runner that gives dsh the patch gets the starting words, and the run is not warned that it has them', async () => {
    const briefText = '# Synthetic dsh helper\nDo the synthetic thing.\n'
    const brief = aBriefFile(briefText)
    const capture = join(root, `dsh-helper-given-${++sequence}.md`)
    const runner = aRunnerThatWritesItsBrief(aRunnerWith(THE_PATCH_READ_AND_THE_DSH_START))
    expect(aRunnerGivesDshThePatch(runner)).toBe(true)
    const { err, label } = await aDshHelperStart(runner, brief, capture)
    const given = readFileSync(capture, 'utf8')
    expect(given.startsWith(THE_STARTING_WORDS), given).toBe(true)
    expect(given.endsWith(briefText)).toBe(true)
    const command = theStartCommand(label)
    const newBrief = command[3]!
    expect(newBrief).not.toBe(brief)
    expect(dirname(newBrief)).toBe(join(dir, 'logs', label))
    expect(statSync(newBrief).mode & 0o777).toBe(0o600)
    for (const sentence of theWarningFor(join(dir, 'repo', 'tools', 'dsh-hooks', 'run-agent.sh'))) {
      expect(err).not.toContain(sentence)
    }
  })

  it('a runner that does not give dsh the patch keeps the warning and gets the words without the switch', async () => {
    const briefText = '# Synthetic dsh helper\nDo the other thing.\n'
    const brief = aBriefFile(briefText)
    const capture = join(root, `dsh-helper-given-${++sequence}.md`)
    const runner = aRunnerThatWritesItsBrief(aRunnerWith([...THE_COMMENT_NAMING_THE_PATCH, THE_DSH_START_WITHOUT_THE_PATCH]))
    expect(aRunnerGivesDshThePatch(runner)).toBe(false)
    const { err } = await aDshHelperStart(runner, brief, capture)
    const given = readFileSync(capture, 'utf8')
    expect(given.startsWith(THE_STARTING_WORDS_WITHOUT_THE_SWITCH), given).toBe(true)
    expect(given.endsWith(briefText)).toBe(true)
    const warning = theWarningFor(join(dir, 'repo', 'tools', 'dsh-hooks', 'run-agent.sh'))
    expect(warning.length).toBeGreaterThan(0)
    for (const sentence of warning) expect(err).toContain(sentence)
  })

  it('a brief that already begins with the starting words reaches the runner once, not twice', async () => {
    const already = `${THE_STARTING_WORDS}\n\n---\n\n# Synthetic dsh helper\nIt already has them.\n`
    const brief = aBriefFile(already)
    const capture = join(root, `dsh-helper-given-${++sequence}.md`)
    const runner = aRunnerThatWritesItsBrief(aRunnerWith(THE_PATCH_READ_AND_THE_DSH_START))
    expect(aRunnerGivesDshThePatch(runner)).toBe(true)
    const { err, label } = await aDshHelperStart(runner, brief, capture)
    const given = readFileSync(capture, 'utf8')
    expect(given).toBe(already)
    expect(given.split(THE_STARTING_WORDS).length - 1).toBe(1)
    expect(theStartCommand(label)[3]).toBe(brief)
    for (const sentence of theWarningFor(join(dir, 'repo', 'tools', 'dsh-hooks', 'run-agent.sh'))) {
      expect(err).not.toContain(sentence)
    }
  })
})

/** This tree's run-agent.sh as it was before it gave dsh the patch. One that starts dsh with another line fails here. */
function theRunnerBeforeThePatch() {
  const withThePatch = `${[...THE_COMMENT_NAMING_THE_PATCH, ...THE_PATCH_READ_AND_THE_DSH_START].join('\n')}\n`
  if (THIS_TREES_RUNNER.includes(withThePatch)) return THIS_TREES_RUNNER.replace(withThePatch, `${THE_DSH_START_WITHOUT_THE_PATCH}\n`)
  expect(THIS_TREES_RUNNER, 'run-agent.sh starts dsh with neither of the two lines this test knows, so write its cases again').toContain(`${THE_DSH_START_WITHOUT_THE_PATCH}\n`)
  return THIS_TREES_RUNNER
}

/** That run-agent.sh with `lines` in place of the line that starts dsh. */
function aRunnerWith(lines: string[]) {
  return theRunnerBeforeThePatch().replace(`${THE_DSH_START_WITHOUT_THE_PATCH}\n`, `${lines.join('\n')}\n`)
}

/** The first chapter of the brief a dsh worker was given, started by the real launcher with `runner` as the clone's run-agent.sh. */
async function aDshWorkersFirstChapter(runner: string) {
  const theClones = join(dir, 'repo', 'tools', 'dsh-hooks', 'run-agent.sh')
  writeFileSync(theClones, runner)
  onTestFinished(() => writeFileSync(theClones, THIS_TREES_RUNNER))
  const brief = join(root, 'dsh brief.md')
  writeFileSync(brief, '# Synthetic dsh worker\nDo it.\n')
  const { command } = await startedVerb('worker', brief, join(dir, `verb-capture-${++sequence}.json`), 'dsh')
  const given = command.find(word => word.startsWith(join(dir, 'briefs') + '/'))
  expect(given, JSON.stringify(command)).toBeDefined()
  expect(readFileSync(given!, 'utf8')).toContain('Synthetic dsh worker')
  return theFirstChapter(readFileSync(given!, 'utf8'))
}

describe('a --plain-env start keeps the launcher’s variables out, and not the switch', () => {
  it('a harness program started plain has the harness subagents and workflows off as well', async () => {
    const claude = await launched(['claude', '-p', 'a synthetic prompt'], 'claude-code', {}, legacyModel, { plain: true })
    // A plain start: the launcher put none of its variables in.
    expect(claude.allEnv['SANDBOX_DIR']).toBeUndefined()
    expect(theToolsClaudeCodeIsDenied(claude.argv), JSON.stringify(claude.argv)).toEqual(expect.arrayContaining(CLAUDE_CODES_SUBAGENT_AND_WORKFLOW_TOOLS))
    const codex = await launched(['codex', 'exec', 'a synthetic prompt'], 'codex', {}, legacyModel, { plain: true })
    expect(theFeaturesCodexTurnsOff(codex.argv), JSON.stringify(codex.argv)).toEqual(expect.arrayContaining(CODEX_SUBAGENT_FEATURES))
    const opencode = await launched(['opencode', 'run', 'a synthetic prompt'], 'opencode', {}, legacyModel, { plain: true })
    expect(JSON.parse(opencode.allEnv['OPENCODE_CONFIG_CONTENT'] ?? '{}').permission?.task).toBe('deny')
  })
})
