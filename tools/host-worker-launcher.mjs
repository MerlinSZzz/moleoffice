#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Start one office-filed worker in the host place selected by its supervisor. */
import { spawn, spawnSync } from 'node:child_process'
import { accessSync, closeSync, constants, existsSync, mkdtempSync, openSync, readFileSync, readSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { THE_MESSAGE_WORKER_ID } from '../src/shared/participants.ts'
import { clockStamp } from '../src/shared/time.ts'
import { settingValue } from '../src/config/settings.mjs'
import { aCommandsOfficeTool, aClaudeCommandsOfficeTool, thePermissionsARunGets, OFFICE_MCP_SERVER } from '../src/config/run-permissions.mjs'
import { aCommandsStartFromTheOffice } from '../src/config/sandbox-start-values.mjs'
import { askTheOffice, officeHeaders, theGitIdentity } from './sandbox-common.mjs'
import { useTheLauncher, finishOrCrashTheRun } from './the-end-of-a-run.mjs'

const argv = process.argv.slice(2)
const delimiter = argv.indexOf('--')
const options = delimiter < 0 ? argv : argv.slice(0, delimiter)
const givenCommand = delimiter < 0 ? null : argv.slice(delimiter + 1)
const value = name => {
  const at = options.indexOf(`--${name}`)
  return at < 0 ? null : options[at + 1] ?? null
}
const place = JSON.parse(value('place') ?? 'null')
const agent = value('agent'), runtime = value('runtime'), model = value('model')
const agentId = value('agent-id'), commitAddress = value('commit-address')
const parent = value('parent'), wrapper = value('session'), api = value('api'), workspace = value('workspace')
const brief = value('brief'), output = value('output'), cut = value('cut-from')
const selection = value('selection') === null ? undefined : JSON.parse(value('selection'))
const officeKey = process.env.MOLE_AGENT_KEY
let run = null, runKey = null, configFolder = null, madeWorktree = false, runtimeStarted = false, row = null
let gate = null, gateEnded = null, outputFd = null, endReason = null, toolConfiguration = null
let childEnvironment = {}, startedCommand = [], startValues = null, startedAt = null, starter = null, cutAtStart = null
let commandEnd = { code: 1, signal: null }, theStateItsEndLeft = null
let runtimeEnvironment = {}
const valuesToHide = () => [...new Set([
  officeKey, runKey, toolConfiguration,
  ...[process.env, runtimeEnvironment].flatMap(env => Object.entries(env)
    .filter(([name, value]) => /(KEY|TOKEN|SECRET|PASSWORD)/i.test(name) && typeof value === 'string' && value.length >= 8)
    .map(([, value]) => value),
  ),
].filter(value => typeof value === 'string' && value.length > 0))].sort((a, b) => b.length - a.length)
const log = line => {
  let safe = String(line)
  for (const value of valuesToHide()) safe = safe.split(value).join('[redacted]')
  process.stderr.write(`host-worker-launcher: ${safe}\n`)
}
const fail = line => { throw new Error(line) }
const officeHeadersFor = (session, key = officeKey, who = THE_MESSAGE_WORKER_ID) => officeHeaders({ workspace, agent: who, session, key })
const git = (root, args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' }, stdio: ['ignore', 'pipe', 'pipe'] })
const gitText = (root, args) => {
  const answer = git(root, args)
  if (answer.status !== 0) fail('Git could not read the requested place or commit. Nothing was started.')
  return answer.stdout.trim()
}
function removeOwnWorktree() {
  if (!madeWorktree || runtimeStarted || place?.kind !== 'worktree') return
  const root = place.repository.root, folder = place.folder
  const status = git(root, ['-C', folder, 'status', '--porcelain', '--untracked-files=all'])
  const head = git(root, ['rev-parse', '--verify', `refs/heads/${agent}`])
  if (status.status !== 0 || status.stdout !== '' || head.status !== 0 || head.stdout.trim() !== cut) {
    log(`The worktree ${folder} or its branch is dirty or uncertain and was kept.`)
    return
  }
  const removed = git(root, ['worktree', 'remove', folder])
  if (removed.status !== 0) { log(`The worktree ${folder} could not be safely removed and was kept.`); return }
  const branch = git(root, ['update-ref', '-d', `refs/heads/${agent}`, cut])
  if (branch.status !== 0) log(`The branch ${agent} could not be safely removed and was kept.`)
}
function cleanup() {
  if (configFolder !== null) { rmSync(configFolder, { recursive: true, force: true }); configFolder = null }
  removeOwnWorktree()
}
async function waitForGroup(pid) {
  for (;;) {
    try { process.kill(-pid, 0) } catch (error) {
      if (error?.code === 'ESRCH') return
      throw error
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}
function buildEnvironment() {
  const child = { ...process.env }
  for (const name of Object.keys(child)) {
    if (name.startsWith('SANDBOX_') || name.startsWith('MOLE_OFFICE_') || name === 'OFFICE_TOOL_CONFIGURATION' || name === 'MOLE_AGENT_KEY' || name === 'MOLE_AGENT_KEY_FILE' || (/^MOLE_/i.test(name) && /(KEY|TOKEN|SECRET|PASSWORD)/i.test(name))) delete child[name]
  }
  Object.assign(child, { MOLE_AGENT_KEY: runKey, MOLE_OFFICE_API: api, MOLE_OFFICE_WORKSPACE: workspace, MOLE_OFFICE_SESSION: run, MOLE_OFFICE_AGENT: agent }, theGitIdentity(agent, commitAddress ?? settingValue('MOLE_OFFICE_COMMIT_EMAIL')).env ?? {})
  return child
}
function theExecutableIsUsable(program, env) {
  for (const dir of (env.PATH ?? '').split(':')) {
    const path = program.includes('/') ? program : join(dir || '.', program)
    try {
      accessSync(path, constants.X_OK)
      if (!statSync(path).isFile()) continue
      const fd = openSync(path, 'r')
      let first
      try { const bytes = Buffer.alloc(256); first = bytes.subarray(0, readSync(fd, bytes, 0, bytes.length, 0)).toString('utf8') } finally { closeSync(fd) }
      const interpreter = /^#!\s*(\S+)/.exec(first)?.[1]
      if (interpreter && !existsSync(interpreter)) return false
      return true
    } catch { if (program.includes('/')) return false }
  }
  return false
}
async function main() {
  if (!agent || !runtime || !model || !parent || !wrapper || !api || !workspace || !brief || !output || !officeKey || !place?.folder) fail('The host launcher was not given a complete start. Nothing was started.')
  if (!['codex', 'claude-code', 'opencode'].includes(runtime)) fail('The host launcher starts Codex, Claude Code and OpenCode only. Nothing was started.')
  if (place.kind === 'worktree') {
    const root = place.repository?.root, folder = place.folder
    if (!root || !cut || existsSync(folder) || !statSync(dirname(folder)).isDirectory()) fail('The worktree folder must be absent, its parent present, and its cut named. Nothing was started.')
    const branch = git(root, ['show-ref', '--verify', '--quiet', `refs/heads/${agent}`])
    if (branch.status !== 1) fail('The worker branch already exists or could not be checked. Nothing was started.')
    const resolved = gitText(root, ['rev-parse', '--verify', '--end-of-options', `${cut}^{commit}`])
    if (resolved !== cut) fail('The requested cut is not the named commit. Nothing was started.')
    const made = git(root, ['worktree', 'add', '-b', agent, folder, cut])
    if (made.status !== 0) fail(`The worktree ${folder} could not be made at the requested cut. Any uncertain folder or branch ${agent} was kept. Nothing was started.`)
    madeWorktree = true
  } else if (place.kind !== 'folder') fail('The worker place is not a worktree or folder. Nothing was started.')
  const head = gitText(place.folder, ['rev-parse', 'HEAD'])
  cutAtStart = head
  const startTime = clockStamp()
  startedAt = startTime.instant
  const filed = await askTheOffice(api, '/api/records', { method: 'POST', headers: officeHeadersFor(wrapper), body: { kind: 'session', title: 'Worker run on the host', data: { state: 'running', runtime, adaptedTool: runtime, model, servingAgent: agent, ...(agentId === null ? {} : { servingAgentId: agentId }), workingDirectory: place.folder, tip: head, cutFrom: head, cutFromCommit: { named: head, commit: head }, parentAttachment: parent, startedAt: startTime.stamp, startedTime: startTime } } })
  if (filed.status !== 201 || typeof filed.body?.record?.id !== 'string' || typeof filed.body?.runKey?.key !== 'string') fail(`The office did not file the worker run (${String(filed.status)}). Nothing was started.`)
  run = filed.body.record.id
  runKey = filed.body.runKey.key
  const parentRead = await askTheOffice(api, `/api/records/${encodeURIComponent(parent)}`, { headers: officeHeadersFor(wrapper) })
  starter = parentRead.status === 200 ? (parentRead.body?.record ?? parentRead.body)?.data?.servingAgent ?? null : null
  const env = buildEnvironment()
  childEnvironment = env
  runtimeEnvironment = env
  const permissions = thePermissionsARunGets(runtime, env, { mounted: false, because: 'The host launcher mounts no main-world guard.' })
  for (const [name, change] of Object.entries(permissions.env)) { if (change === null) delete env[name]; else env[name] = change }
  let command = runtime === 'codex' ? ['codex', 'exec', '--json', '--', '-'] : runtime === 'claude-code' ? ['claude', '-p', '--output-format', 'json'] : givenCommand
  if (!command?.length || (runtime === 'opencode' && (command[0] !== 'opencode' || command[1] !== 'run'))) fail('The OpenCode command was not supplied as an exec start. Nothing was started.')
  command = [command[0], ...permissions.args, ...command.slice(1)]
  const selected = await aCommandsStartFromTheOffice(command, { api, agent, workspace, headers: officeHeadersFor(run, runKey, agent), runtime, model, env, ...(selection === undefined ? {} : { selection }) })
  command = selected.command
  startValues = selected.start ?? null
  Object.assign(env, selected.env)
  if (runtime === 'codex') command = aCommandsOfficeTool(command, env).command
  if (runtime === 'claude-code') {
    configFolder = mkdtempSync(join(tmpdir(), 'office-host-mcp-'))
    const configPath = join(configFolder, 'office-mcp.json')
    const withTool = aClaudeCommandsOfficeTool(command, env, configPath, { startsRuns: true })
    if (withTool.configuration === null) fail('The Claude Code office tool could not be prepared. Nothing was started.')
    toolConfiguration = JSON.stringify(withTool.configuration)
    writeFileSync(configPath, `${toolConfiguration}\n`, { mode: 0o600, flag: 'wx' })
    command = withTool.command
  }
  if (runtime === 'opencode') {
    let config
    try { config = JSON.parse(env.OPENCODE_CONFIG_CONTENT ?? '{}') } catch { fail('OpenCode configuration is not a JSON object. Nothing was started.') }
    if (!config || typeof config !== 'object' || Array.isArray(config) || (config.mcp !== undefined && (!config.mcp || typeof config.mcp !== 'object' || Array.isArray(config.mcp)))) fail('OpenCode configuration cannot hold the office tool. Nothing was started.')
    env.OPENCODE_CONFIG_CONTENT = JSON.stringify({ ...config, mcp: { ...config.mcp, mole_office: { type: 'local', command: ['node', OFFICE_MCP_SERVER], enabled: true } } })
    const debug = spawnSync('opencode', ['debug', 'config'], { cwd: place.folder, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000, maxBuffer: 4 * 1024 * 1024 })
    let read
    try { read = JSON.parse(debug.stdout ?? '') } catch { read = null }
    if (debug.status !== 0 || read?.mcp?.mole_office?.type !== 'local' || read.mcp.mole_office.enabled !== true || !Array.isArray(read.mcp.mole_office.command) || !read.mcp.mole_office.command.includes(OFFICE_MCP_SERVER)) fail('OpenCode did not show the office tool in its configuration. Nothing was started.')
  }
  if (!theExecutableIsUsable(command[0], env)) fail('The runtime program or its interpreter is unavailable. Nothing was started.')
  startedCommand = command
  outputFd = openSync(join(dirname(output), 'runtime.txt'), 'a', 0o600)
  const commandInput = runtime === 'opencode' ? null : readFileSync(brief)
  gate = spawn('sh', ['-c', 'IFS= read -r word; [ "$word" = go ] || exit 111; exec "$@"', 'host-gate', ...command], { cwd: place.folder, env, detached: true, stdio: ['pipe', 'pipe', 'pipe'] })
  const stopGroup = () => { if (gate?.pid) { try { process.kill(-gate.pid, 'SIGTERM') } catch {} } }
  process.once('SIGTERM', stopGroup)
  process.once('SIGINT', stopGroup)
  let ended
  gateEnded = new Promise(resolve => { gate.once('error', () => resolve({ code: 127, signal: null })); gate.once('close', (code, signal) => resolve({ code, signal })) })
  gate.stdin.on('error', () => {})
  const secrets = valuesToHide()
  const max = Math.max(...secrets.map(x => x.length), 1)
  for (const stream of [gate.stdout, gate.stderr]) {
    let pending = ''
    const filtered = text => { for (const secret of secrets) text = text.split(secret).join('[redacted]'); return text }
    stream.setEncoding('utf8')
    stream.on('data', chunk => {
      pending += chunk
      if (pending.length <= max * 2) return
      let n = pending.length - max
      for (const secret of secrets) {
        let at = pending.indexOf(secret)
        while (at >= 0 && at < n) { if (at + secret.length > n) n = at; at = pending.indexOf(secret, at + 1) }
      }
      const prefix = pending.slice(0, n)
      pending = pending.slice(n)
      writeFileSync(outputFd, filtered(prefix))
    })
    stream.on('end', () => { if (pending) writeFileSync(outputFd, filtered(pending)) })
  }
  if (!gate.pid) fail('The runtime gate could not be started. Nothing was started.')
  const registered = await askTheOffice(api, '/api/resources', { method: 'POST', headers: officeHeadersFor(run, runKey, agent), body: { type: 'process', key: String(gate.pid), sessionRecordId: run, detail: 'Host worker runtime', startedByTheProduct: true } })
  if (registered.status !== 201 || !registered.body?.resource?.id) {
    endReason = `The process registration was refused (${String(registered.status)}).`
    gate.stdin.end()
    try { process.kill(-gate.pid, 'SIGTERM') } catch {}
    ended = await gateEnded
    await waitForGroup(gate.pid)
    fail(endReason)
  }
  row = registered.body.resource.id
  runtimeStarted = true
  gate.stdin.write('go\n')
  gate.stdin.end(commandInput)
  ended = await gateEnded
  await waitForGroup(gate.pid)
  commandEnd = ended
  closeSync(outputFd)
  outputFd = null
  const released = await askTheOffice(api, `/api/resources/${encodeURIComponent(row)}/release`, { method: 'POST', headers: officeHeadersFor(run, runKey, agent), body: { signalNothing: true, note: 'The host worker process group ended.' } })
  if (released.status !== 200) log(`The process row could not be released (${String(released.status)}).`)
  process.exitCode = ended.code === 0 ? 0 : 1
}
try { await main() } catch (error) {
  if (endReason === null && error instanceof Error) endReason = error.message
  log(error instanceof Error ? error.message : 'The host start failed.')
  process.exitCode = runtimeStarted ? 1 : 2
} finally {
  if (!runtimeStarted && gate?.pid) {
    gate.stdin.end()
    try { process.kill(-gate.pid, 'SIGTERM') } catch {}
    await gateEnded
    await waitForGroup(gate.pid)
  }
  if (outputFd !== null) closeSync(outputFd)
  if (run !== null && runKey !== null) {
    const context = {
      WAIT: false, aboutTheRun: () => officeHeadersFor(run, runKey, agent), api,
      childEnv: childEnvironment, chosen: { brief, command: startedCommand }, command: startedCommand,
      cutFrom: cutAtStart, cwd: place.folder, goWaitEverMarked: false, goWaitWrites: Promise.resolve(),
      headers: session => officeHeadersFor(session), instance: null, instanceDir: null,
      logs: dirname(output), mode: 'agent', outPath: join(dirname(output), 'runtime.txt'), owner: run,
      run, runCutFrom: cutAtStart, runKey, runRuntime: runtime, runWorkingDirectory: place.folder,
      start: { startedAt }, startValues, starter, starterSession: parent,
      theGoWaitIsWritten: () => {}, theProgramAt: () => 0,
      get theStateItsEndLeft() { return theStateItsEndLeft },
      set theStateItsEndLeft(value) { theStateItsEndLeft = value },
      withStartExplanation: detail => runtimeStarted ? detail : `${detail} ${endReason ?? 'The runtime did not start.'}`,
      worktree: place.folder,
    }
    try {
      useTheLauncher(context)
      await finishOrCrashTheRun(commandEnd.code, commandEnd.signal)
    } catch (error) { log(`The run end could not be written: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1 }
  }
  try { cleanup() } catch { log('A folder made for this start could not be removed and was kept.') }
}
