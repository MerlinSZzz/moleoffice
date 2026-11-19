// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE STAND-INS FOR DOCKER AND THE DEVCONTAINER CLI, shared by the tests that run tools/sandbox.mjs end to end:
 * tests/sandbox-launcher.test.ts and tests/a-second-round-waits-for-the-first.test.ts. They are written once here, so
 * the two tests cannot come to mean different things by "docker" (USER.md, invariant 9).
 *
 *   - `devcontainer up` (FAKE_DEVCONTAINER) reads the instance copy of devcontainer.json the launcher wrote, and makes a
 *     "container" in a state file with the mounts that file asks for. It also asks the office, at the moment it is
 *     started, whether the container's ledger row is already there.
 *   - `docker exec` (FAKE_DOCKER) runs the command on this machine, with only the environment docker would give it (the
 *     container's own, the env file and the -e values), and records its own command line and the env file. The provider
 *     router's socket, named where the container's mount puts it, is put back at the host folder that mount was made from.
 *   - `docker inspect`, `rm`, `top` and `stop` read and change the same state file.
 *   - `npm` (aFakeNpm) installs a made-up package where it is run, and writes each call down (item 2f).
 *   - The office's machine probe (theFakeMachine) is the real Linux one, except that it lists the fake containers and
 *     says every process is in the sandbox's pid namespace with the pid this machine gives it.
 *
 * Both programs find the state file through FAKE_DOCKER_DIR, which the test sets in the tool's environment.
 */
import { SYNTHETIC_DSH_READER } from './dsh-native-stand-in.ts'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')

export const FAKE_DEVCONTAINER = String.raw`#!/usr/bin/env node
const fs = require('fs'), path = require('path'), crypto = require('crypto')
const stateFile = path.join(process.env.FAKE_DOCKER_DIR, 'state.json')
const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
const argv = process.argv.slice(2)
const at = (flag) => argv[argv.indexOf(flag) + 1]
const fill = (s) => String(s).replace(/\$\{localEnv:([A-Z_]+)\}/g, (_, n) => process.env[n] ?? '')
;(async () => {
  const config = JSON.parse(fs.readFileSync(at('--config'), 'utf8'))
  const name = (config.runArgs.find((a) => a.startsWith('--name=')) || '').slice('--name='.length)
  const said = await fetch(state.api + '/api/resources', { headers: { 'x-mole-office-workspace': state.workspace } }).then((r) => r.json())
  const rowSeen = said.resources.some((r) => r.type === 'container' && r.key === name && r.releasedAt === null)
  const mounts = [config.workspaceMount, ...config.mounts].map((text) => {
    const m = {}
    for (const part of fill(text).split(',')) { const [k, ...v] = part.split('='); m[k] = v.length ? v.join('=') : true }
    const readonly = m.readonly === true || m.readonly === 'true'
    return { Type: m.type, Source: m.source ?? '', Destination: m.target, RW: state.bugs.writableRo && m.type === 'bind' ? true : !readonly }
  })
  const labels = { [at('--id-label').split('=')[0]]: at('--id-label').split('=')[1] }
  for (const a of config.runArgs) if (a.startsWith('--label=')) { const [k, v] = a.slice(8).split('='); labels[k] = v }
  const id = crypto.randomBytes(32).toString('hex')
  const containerEnv = Object.entries(config.containerEnv ?? {}).map(([k, v]) => k + '=' + fill(v))
  // AS DOCKER DOES, an --env= run argument is in the container's own environment; the zoneDropped bug leaves TZ out.
  for (const a of config.runArgs) if (a.startsWith('--env=') && !(state.bugs.zoneDropped && a.startsWith('--env=TZ='))) containerEnv.push(a.slice(6))
  // AS DOCKER DOES, the last --network= or --net= run argument is the container's network, and none means docker's
  // default; the networkIgnored bug leaves it on the host's whatever was asked.
  const nets = config.runArgs.filter((a) => /^--net(work)?=/.test(a)).map((a) => a.slice(a.indexOf('=') + 1))
  const NetworkMode = state.bugs.networkIgnored ? 'host' : (nets.pop() || 'default')
  // AS DOCKER DOES, --hostname= names the container's host name. Without it the name is the host's own on the host's
  // network and the id's first twelve elsewhere. The hostNameIgnored bug drops the --hostname= that was passed.
  const given = state.bugs.hostNameIgnored ? '' : (config.runArgs.find((a) => a.startsWith('--hostname=')) || '').slice('--hostname='.length)
  const Hostname = given || (NetworkMode === 'host' ? require('os').hostname() : id.slice(0, 12))
  // AS THE DEVCONTAINER CLI DOES, docker's init is asked for only when devcontainer.json says "init": true, and docker
  // records null when it was not asked for.
  const Init = config.init === true ? true : null
  state.containers[name] = { Id: id, Name: '/' + name, State: { Running: true, Status: 'running', Pid: 999999 }, Config: { Labels: labels, Env: containerEnv, Hostname }, HostConfig: { NetworkMode, Init, DeviceRequests: config.runArgs.some((a) => /^--gpus(=|$)/.test(a)) ? [{ Capabilities: [['gpu']] }] : [] }, Mounts: mounts }
  state.calls.push({ tool: 'devcontainer', argv, config: at('--config'), rowSeen, env: { SANDBOX_DIR: process.env.SANDBOX_DIR, SANDBOX_MAIN_CHECKOUT: process.env.SANDBOX_MAIN_CHECKOUT }, runArgs: config.runArgs, mounts: config.mounts })
  fs.writeFileSync(stateFile, JSON.stringify(state))
  process.stderr.write('[fake devcontainer] started ' + name + '\n')
  process.stdout.write(JSON.stringify({ outcome: 'success', containerId: id, remoteUser: '1000:1000' }) + '\n')
})()
`

/** The file, beside a container loader, that lists the fake container's own processes (theFakeContainersProcesses). */
const THE_PROCESSES_FILE = 'container-processes'

/**
 * THE FAKE CONTAINER'S OWN PROCESSES, as a real container's /proc lists only its own: the pids in this file, beside the
 * loader, and every process they started, read from each one's /proc/<pid>/task/<tid>/children. Each process that loads
 * the loader writes its own pid here, and the fake docker exec writes the pid of the command it starts. A case writes the
 * pid of a process it leaves on purpose, in its own session, which is no longer a child of anything here once its command
 * has ended. A test looks only at what it made, and a helper's scratch checks
 * read every process on this machine without this: a process another test left, or one not yet reaped, kept a folder.
 */
export function theFakeContainersProcesses(folder: string): string {
  return join(folder, THE_PROCESSES_FILE)
}

/**
 * A synthetic container's /tmp is private even when a nested helper inherits a run's TMPDIR, and its scratch checks read
 * only its own processes (theFakeContainersProcesses), when `view` is true. Both are bound in the process, in the source
 * the loader gives node, and nothing in tools/ reads the list: a start without this loader reads every process, as a real
 * one does. A text the loader binds that is not found exactly once stops the load.
 */
function aContainerLoader(view: boolean): string {
  return String.raw`import { registerHooks } from 'node:module'
import { appendFileSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const here = dirname(fileURLToPath(import.meta.url))
const binds = { '/tools/sweep-run-scratch.mjs': ["root = '/tmp'", 'root = ' + JSON.stringify(join(here, 'tmp')), 'the container scratch root'] }
if (${String(view)}) {
  const listed = join(here, ${JSON.stringify(THE_PROCESSES_FILE)})
  appendFileSync(listed, process.pid + '\n')
  const view = Symbol.for('mole-office.the-fake-containers-processes')
  globalThis[view] = (proc) => {
    try { readFileSync(proc + '/' + process.pid + '/task/' + process.pid + '/children') }
    catch (error) { throw new Error('The stand-in cannot read which processes a process started (' + error.code + '), so it cannot list the fake container\'s.') }
    const seen = new Set()
    const under = (pid) => {
      if (seen.has(pid)) return
      seen.add(pid)
      let threads = []
      try { threads = readdirSync(proc + '/' + pid + '/task') } catch (error) { if (error.code === 'ENOENT' || error.code === 'ESRCH') return; throw error }
      for (const thread of threads) {
        let children = ''
        try { children = readFileSync(proc + '/' + pid + '/task/' + thread + '/children', 'utf8') } catch (error) { if (error.code === 'ENOENT' || error.code === 'ESRCH') continue; throw error }
        for (const child of children.split(' ')) if (child.trim() !== '') under(child.trim())
      }
    }
    for (const pid of readFileSync(listed, 'utf8').split('\n')) if (pid !== '') under(pid)
    return [...seen]
  }
  binds['/tools/scratch-folder-checks.mjs'] = ['for (const pid of readdirSync(proc))', 'for (const pid of globalThis[Symbol.for(' + JSON.stringify(view.description) + ')](proc))', "the fake container's processes"]
}
registerHooks({ load(url, context, next) {
  const loaded = next(url, context)
  const file = Object.keys(binds).find((end) => url.endsWith(end))
  if (file === undefined) return loaded
  const [before, after, what] = binds[file]
  const source = typeof loaded.source === 'string' ? loaded.source : Buffer.from(loaded.source).toString()
  if (source.split(before).length !== 2) throw new Error('The stand-in cannot bind ' + what + '.')
  return { ...loaded, source: source.replace(before, () => after) }
} })
`
}

export const CONTAINER_TMP_LOADER = aContainerLoader(true)

/** The loader the seesTheHostsProcesses bug gives: the private /tmp alone, so the scratch checks read every process. */
const A_LOADER_THAT_SEES_THE_HOST = aContainerLoader(false)

/**
 * `env` WITH A PRIVATE /tmp FOR THE SCRATCH SWEEP of a helper a test starts on this machine, as the fake container gives
 * one: `folder`/tmp, bound by CONTAINER_TMP_LOADER. Without it the helper's sweep (tools/sweep-run-scratch.mjs) walks
 * this machine's /tmp, and asks the test's office about every old run folder there, 2 s apart. It goes in NODE_OPTIONS,
 * so the background copy the helper starts of itself keeps it too.
 */
export function withAPrivateTmpToSweep(env: NodeJS.ProcessEnv, folder: string): NodeJS.ProcessEnv {
  mkdirSync(join(folder, 'tmp'), { recursive: true })
  const loader = join(folder, 'container-tmp.mjs')
  writeFileSync(loader, CONTAINER_TMP_LOADER)
  return { ...env, NODE_OPTIONS: [env['NODE_OPTIONS'], `--import=${pathToFileURL(loader).href}`].filter(Boolean).join(' ') }
}

export const FAKE_DOCKER = String.raw`#!/usr/bin/env node
const fs = require('fs'), path = require('path'), { spawn } = require('child_process')
const stateFile = path.join(process.env.FAKE_DOCKER_DIR, 'state.json')
const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
// THE STATE FILE IS WRITTEN WHOLE, a new file renamed over the old one: an isolated run's start writes it when its
// command ends while the launcher's inspect reads it, and a file read half-written is a docker that answers nothing.
const writeWhole = (value) => { const next = stateFile + '.' + process.pid + '.next'; fs.writeFileSync(next, JSON.stringify(value)); fs.renameSync(next, stateFile) }
const save = () => writeWhole(state)
const argv = process.argv.slice(2)
const find = (key) => Object.values(state.containers).find((c) => c.Name === '/' + key || c.Id === key)
const verb = argv[0]
if (verb === 'ps') {
  if (state.bugs && state.bugs.gpuListFails) {
    process.stderr.write('synthetic GPU list failure\n'); process.exit(1)
  }
  const filters = argv.flatMap((a, i) => a === '--filter' ? [argv[i + 1]] : [])
  const containers = Object.values(state.containers).filter((c) => c.State.Running && filters.every((f) => {
    if (!f.startsWith('label=')) throw new Error('unsupported ps filter: ' + f)
    const [name, ...value] = f.slice(6).split('=')
    const labels = c.Config.Labels ?? {}
    return name in labels && (value.length === 0 || labels[name] === value.join('='))
  }))
  process.stdout.write(containers.map((c) => c.Id).join('\n') + '\n'); process.exit(0)
}
if (verb === 'inspect') {
  // THE inspectFailsThrice BUG: the first three questions about an isolated run's container get an error that is not
  // "No such container", as from a daemon that could not answer. The tally is a file of its own, not the state.
  const tally = path.join(process.env.FAKE_DOCKER_DIR, 'inspect-failures')
  if (state.bugs && state.bugs.inspectFailsThrice && argv[argv.length - 1].startsWith('mole-office-isolated-') && (fs.existsSync(tally) ? fs.readFileSync(tally, 'utf8').length : 0) < 3) {
    fs.appendFileSync(tally, 'x')
    process.stderr.write('Error response from daemon: the stand-in daemon could not answer\n'); process.exit(1)
  }
  const c = find(argv[argv.length - 1])
  if (!c) { process.stderr.write('Error: No such container: ' + argv[argv.length - 1] + '\n'); process.exit(1) }
  process.stdout.write(JSON.stringify([c]))
  process.exit(0)
}
if (verb === 'rm') {
  const c = find(argv[1])
  state.calls.push({ tool: 'docker', argv })
  if (!c || c.State.Running) { save(); process.exit(1) }
  delete state.containers[c.Name.slice(1)]
  save(); process.exit(0)
}
if (verb === 'top') {
  // THE FIRST PROCESS IS DOCKER'S INIT ONLY WHEN DOCKER WAS ASKED FOR ONE. Without it, the first process is the image's own
  // command, which in mole-office-dev, the one template without docker's init, is its keep-alive.
  const first = find(argv[1])?.HostConfig?.Init === true ? '/sbin/docker-init -- /bin/sh -c echo Container started' : '/usr/bin/perl /usr/local/lib/mole-office/keep-alive'
  process.stdout.write('PID PGID COMMAND\n999999 999999 ' + first + '\n')
  process.exit(0)
}
if (verb === 'stop') { state.calls.push({ tool: 'docker', argv }); save(); process.exit(0) }
if (verb === 'exec') {
  const env = { PATH: process.env.PATH }
  let i = 1, cwd = '/', envFile = null
  for (; i < argv.length; i++) {
    if (argv[i] === '--env-file') { envFile = argv[++i]; for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) { const k = line.indexOf('='); if (k > 0) env[line.slice(0, k)] = line.slice(k + 1) } }
    else if (argv[i] === '-e') { const kv = argv[++i]; const k = kv.indexOf('='); env[kv.slice(0, k)] = kv.slice(k + 1) }
    else if (argv[i] === '-w') cwd = argv[++i]
    else if (argv[i] === '-u') i++
    else break
  }
  const c = find(argv[i])
  // The container's own environment comes first, as docker gives it, then what exec adds.
  for (const kv of (c && c.Config.Env) || []) { const k = kv.indexOf('='); if (!(kv.slice(0, k) in env) || kv.slice(0, k) === 'PATH') env[kv.slice(0, k)] = env[kv.slice(0, k)] ?? kv.slice(k + 1) }
  // THE PROVIDER ROUTER'S SOCKET WHERE THE CONTAINER'S MOUNT PUTS IT. A real container sees the sandbox's router folder at
  // the place up mounted it; nothing is mounted here, so the socket the launcher names inside is put back at the host's
  // folder that mount was made from, and the helper's bridge reaches the router a test runs.
  if (typeof env.SANDBOX_PROVIDER_ROUTER === 'string') {
    let line = null
    try { line = JSON.parse(env.SANDBOX_PROVIDER_ROUTER) } catch { line = null }
    const mount = line && typeof line.socket === 'string' ? ((c && c.Mounts) || []).find((one) => one.Type === 'bind' && line.socket.startsWith(one.Destination + '/')) : undefined
    if (mount) env.SANDBOX_PROVIDER_ROUTER = JSON.stringify({ ...line, socket: mount.Source + line.socket.slice(mount.Destination.length) })
  }
  // THE CONTAINER'S TEMPORARY FOLDER, which a real container has at /tmp: here a folder in the test's own fakes folder,
  // so what a command makes in it goes when the test's folder goes (problem _ELVBQk9HWLA).
  const containerTmp = path.join(process.env.FAKE_DOCKER_DIR, 'tmp')
  fs.mkdirSync(containerTmp, { recursive: true })
  if (!('TMPDIR' in env)) env.TMPDIR = containerTmp
  const nativeReader = path.join(containerTmp, 'synthetic-dsh-reader.mjs')
  fs.writeFileSync(nativeReader, ${JSON.stringify(SYNTHETIC_DSH_READER)})
  env.SANDBOX_DSH_NATIVE_READER = nativeReader
  // THE seesTheHostsProcesses BUG gives the command a loader that binds the private /tmp alone, so its scratch checks read
  // every process on this machine, as a start without the stand-in's loader does. It is a file of its own, so a command
  // already running keeps the loader it was given.
  const seesTheHost = Boolean(state.bugs && state.bugs.seesTheHostsProcesses)
  const loader = path.join(process.env.FAKE_DOCKER_DIR, seesTheHost ? 'container-tmp-sees-the-host.mjs' : 'container-tmp.mjs')
  fs.writeFileSync(loader, seesTheHost ? ${JSON.stringify(A_LOADER_THAT_SEES_THE_HOST)} : ${JSON.stringify(CONTAINER_TMP_LOADER)})
  env.NODE_OPTIONS = [env.NODE_OPTIONS, '--import=' + require('node:url').pathToFileURL(loader).href].filter(Boolean).join(' ')
  // THE ENV FILE'S BYTES, as their sha256 only, so a test can compare them with the bytes it expects while no value is
  // kept in the state file.
  const record = { tool: 'docker', argv, envFile, envFileMode: envFile ? (fs.statSync(envFile).mode & 0o777) : null,
    envFileSha256: envFile ? require('crypto').createHash('sha256').update(fs.readFileSync(envFile)).digest('hex') : null }
  state.calls.push(record); save()
  if (!c || !c.State.Running) { process.stderr.write('Error: container is not running\n'); process.exit(1) }
  const child = spawn(argv[i + 1], argv.slice(i + 2), { cwd, env, stdio: 'inherit' })
  // THE COMMAND IS ONE OF THE FAKE CONTAINER'S PROCESSES, node or not (theFakeContainersProcesses).
  if (child.pid !== undefined) fs.appendFileSync(path.join(process.env.FAKE_DOCKER_DIR, ${JSON.stringify(THE_PROCESSES_FILE)}), child.pid + '\n')
  child.on('exit', (code, signal) => process.exit(code ?? 128))
} else if (verb === 'create') {
  // AS DOCKER DOES, the env file is read when the container is made, so the launcher may delete it straight after.
  const valued = new Set(['--name', '--user', '--network', '--cap-add', '--sysctl', '--dns', '--env-file', '--label', '-w', '--mount', '--entrypoint', '--gpus', '-e'])
  const opts = { mounts: [], capAdd: [], sysctls: [], dns: [], labels: [], env: [] }
  let i = 1, envFile = null, envFileMode = null
  for (; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--rm') { opts.rm = true; continue }
    if (a === '--init') { opts.init = true; continue }
    // THE SANDBOX LIMITS, in the one form the launcher writes them, --name=value (problem
    // TotXlPFHFduz), kept by their docker names.
    const limit = /^--(memory|memory-swap|cpus|cpu-shares|pids-limit)=(.+)$/.exec(a)
    if (limit) { opts.limits = { ...(opts.limits ?? {}), [limit[1]]: limit[2] }; continue }
    // THE ONE SLICE ALL SANDBOXES ARE HELD IN (SANDBOX_SLICE), in the same form.
    if (a.startsWith('--cgroup-parent=')) { opts.cgroupParent = a.slice('--cgroup-parent='.length); continue }
    // THE ROOM FOR PICTURES, in the same form (theRoomForPictures; problem TKH0KMph-bMR).
    if (a.startsWith('--shm-size=')) { opts.shmSize = a.slice('--shm-size='.length); continue }
    if (a.startsWith('--gpus=')) { opts.gpus = a.slice(7); continue }
    if (!valued.has(a)) break
    const v = argv[++i]
    if (a === '--gpus') opts.gpus = v
    else if (a === '--name') opts.name = v
    else if (a === '--user') opts.user = v
    else if (a === '--network') opts.network = v
    else if (a === '--cap-add') opts.capAdd.push(v)
    else if (a === '--sysctl') opts.sysctls.push(v)
    else if (a === '--dns') opts.dns.push(v)
    else if (a === '--label') opts.labels.push(v)
    else if (a === '-w') opts.workdir = v
    else if (a === '--mount') opts.mounts.push(v)
    else if (a === '--entrypoint') opts.entrypoint = v
    else if (a === '-e') opts.env.push(v)
    else if (a === '--env-file') { envFile = v; envFileMode = fs.statSync(v).mode & 0o777; for (const line of fs.readFileSync(v, 'utf8').split('\n')) if (line.indexOf('=') > 0) opts.env.push(line) }
  }
  const image = argv[i]
  const command = argv.slice(i + 1)
  const id = require('crypto').randomBytes(32).toString('hex')
  state.containers[opts.name] = { Id: id, Name: '/' + opts.name, State: { Running: false, Status: 'created', Pid: 0 }, Config: { Image: image, Env: opts.env, User: opts.user, Labels: Object.fromEntries(opts.labels.map((label) => { const at = label.indexOf('='); return [label.slice(0, at), label.slice(at + 1)] })) }, HostConfig: { NetworkMode: opts.network, CapAdd: opts.capAdd, Sysctls: opts.sysctls, Dns: opts.dns, Init: opts.init === true, AutoRemove: opts.rm === true, Limits: opts.limits ?? {}, CgroupParent: opts.cgroupParent ?? '', DeviceRequests: opts.gpus ? [{ Capabilities: [['gpu']] }] : [] }, Mounts: [], created: { entrypoint: opts.entrypoint, command, workdir: opts.workdir, mounts: opts.mounts } }
  // THE ENVIRONMENT'S NAMES ARE RECORDED, never its values: a test asks what reached the container, not a secret.
  state.calls.push({ tool: 'docker', argv, envFile, envFileMode, envNames: opts.env.map((kv) => kv.slice(0, kv.indexOf('='))) })
  save(); process.stdout.write(id + '\n'); process.exit(0)
} else if (verb === 'start') {
  // THE ISOLATED RUN'S GATE CANNOT RUN HERE (it sets routes, as root), so the stand-in runs what comes after the gate's
  // "--", with the container's environment, in its working folder, and keeps the container's state as docker would.
  const name = argv[argv.length - 1]
  const c = find(name)
  if (!c) { process.stderr.write('Error: No such container: ' + name + '\n'); process.exit(1) }
  const all = c.created.command
  const cut = all.indexOf('--')
  const command = cut === -1 ? all : all.slice(cut + 1)
  const env = { PATH: process.env.PATH }
  for (const kv of c.Config.Env) { const k = kv.indexOf('='); env[kv.slice(0, k)] = kv.slice(k + 1) }
  state.calls.push({ tool: 'docker', argv, gate: cut === -1 ? null : all.slice(0, cut) })
  const child = spawn(command[0], command.slice(1), { cwd: c.created.workdir || '/', env, stdio: 'inherit' })
  // THE firstProcessGone BUG answers a pid no Linux gives (2^22, the largest pid_max, is itself never a pid), as docker
  // answers the pid of a first process that has ended by the time the launcher reads it. THE neverSeenRunning BUG
  // answers the container as made and not running for as long as its command runs, as a launcher sees a container
  // whose command it never catches: the look for the command then ends on the container going, or on its time.
  c.State = state.bugs && state.bugs.neverSeenRunning
    ? { Running: false, Status: 'created', Pid: 0 }
    : { Running: true, Status: 'running', Pid: state.bugs && state.bugs.firstProcessGone ? 4194304 : child.pid }
  save()
  child.on('exit', (code) => {
    const now = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
    if (now.containers[name]) {
      if (now.containers[name].HostConfig.AutoRemove) delete now.containers[name]
      else now.containers[name].State = { Running: false, Status: 'exited', Pid: 0 }
    }
    writeWhole(now)
    process.exit(code ?? 1)
  })
} else {
  process.stderr.write('fake docker does not know ' + verb + '\n'); process.exit(2)
}
`

/** What the fake docker holds, read from its state file in `fakes`. */
export function theFakeState(fakes: string): {
  containers: Record<string, { Id: string; State: { Running: boolean; Status?: string }; Mounts: { Destination: string; RW: boolean }[] }>
  calls: { tool: string; argv: string[] }[]
} {
  return JSON.parse(readFileSync(join(fakes, 'state.json'), 'utf8'))
}

/** Every start.json under an instance folder's logs/, as tools/sandbox-start.mjs wrote it. */
export function startsOf(dir: string): { hostPgid: number; hostPid: number; processRow: string }[] {
  const logs = join(dir, 'logs')
  if (!existsSync(logs)) return []
  return readdirSync(logs)
    .map((l) => join(logs, l, 'start.json'))
    .filter((f) => existsSync(f))
    .map((f) => JSON.parse(readFileSync(f, 'utf8')))
}

/**
 * The probe the office reads the machine with: the real one, but the containers are the fakes'. `where` answers the
 * test's fakes folder and sandboxes folder when the probe is asked, since a test makes them after it sets the probe.
 */
export function theFakeMachine(real: ResourcesLib['LINUX_PROBE'], where: { fakes: () => string; sandboxes: () => string }): ResourcesLib['LINUX_PROBE'] {
  const probe = Object.create(real) as ResourcesLib['LINUX_PROBE']
  Object.assign(probe, {
    listeningPorts: () => [],
    containers: () => ({
      available: true,
      containers: Object.entries(theFakeState(where.fakes()).containers)
        .filter(([, c]) => c.State.Running)
        .map(([name, c]) => ({ id: c.Id, name, image: 'vsc-fake', status: 'Up 1 second' })),
    }),
    containerFirstProcess: () => ({ ok: true, pid: process.pid }),
    pidNamespaceOf: (pid: number) => ({ namespace: 'pid:[4026539999]', nspid: [pid] }),
    stopContainer: (name: string) => {
      const now = theFakeState(where.fakes())
      const c = now.containers[name]
      if (c === undefined) throw new Error(`no fake container ${name}`)
      c.State = { ...c.State, Running: false, Status: 'exited' }
      now.calls.push({ tool: 'ledger-stop', argv: [name] })
      writeFileSync(join(where.fakes(), 'state.json'), JSON.stringify(now))
      // DOCKER STOP ENDS EVERYTHING INSIDE: every group a start.json of this instance names.
      for (const start of startsOf(join(where.sandboxes(), name.replace('mole-office-sandbox-', '')))) {
        try {
          process.kill(-start.hostPgid, 'SIGKILL')
        } catch {
          // already gone
        }
      }
    },
  })
  return probe
}

/** A keep-running stand-in watches the test, even across sandbox-start's detached helper.
 * Embed the pid in the program because docker deliberately passes only the sandbox environment.
 * Ending the command lets sandbox-start observe its exit through its ordinary command handler.
 */
export function keepRunningWhileOwnerLives(ownerPid = process.pid): string {
  if (!Number.isSafeInteger(ownerPid) || ownerPid <= 0) throw new Error('The stand-in needs a positive owner pid.')
  return `setInterval(() => {
    try { process.kill(${String(ownerPid)}, 0) }
    catch (error) {
      if (error.code !== 'ESRCH') throw error
      process.exit(0)
    }
  }, 1000)`
}

/** df and du read synthetic decimal-byte figures from the same state as docker; no host disk is measured. */
export const FAKE_DF = String.raw`#!/usr/bin/env node
const fs = require('fs'), path = require('path')
const file = path.join(process.env.FAKE_DOCKER_DIR, 'state.json')
const state = JSON.parse(fs.readFileSync(file, 'utf8'))
state.calls.push({ tool: 'df', argv: process.argv.slice(2) })
fs.writeFileSync(file, JSON.stringify(state))
if (state.dfError) { process.stderr.write(state.dfError); process.exit(1) }
process.stdout.write('Avail\n' + (state.freeBytes ?? 100000000000) + '\n')
`

/**
 * FREE AS THE LAUNCHER'S MEMORY ADMISSION READS IT (free -b, its "available" column): the figure is state.memoryAvailable
 * (64 GiB when unset), and state.freeError makes it fail. Each call is recorded, as df's is.
 */
export const FAKE_FREE = String.raw`#!/usr/bin/env node
const fs = require('fs'), path = require('path')
const file = path.join(process.env.FAKE_DOCKER_DIR, 'state.json')
const state = JSON.parse(fs.readFileSync(file, 'utf8'))
state.calls.push({ tool: 'free', argv: process.argv.slice(2) })
fs.writeFileSync(file, JSON.stringify(state))
if (state.freeError) { process.stderr.write(state.freeError); process.exit(1) }
const available = state.memoryAvailable ?? 68719476736
process.stdout.write('               total        used        free      shared  buff/cache   available\n' +
  'Mem:     100000000000 30000000000 30000000000 0 40000000000 ' + available + '\nSwap:    8000000000 0 8000000000\n')
`

export const FAKE_DU = String.raw`#!/usr/bin/env node
const fs = require('fs'), path = require('path')
const file = path.join(process.env.FAKE_DOCKER_DIR, 'state.json')
const state = JSON.parse(fs.readFileSync(file, 'utf8'))
const argv = process.argv.slice(2), folder = argv[argv.length - 1]
state.calls.push({ tool: 'du', argv })
fs.writeFileSync(file, JSON.stringify(state))
const size = state.sizes?.[folder]
if (size && typeof size === 'object') { setTimeout(() => process.stdout.write(size.bytes + '\t' + folder + '\n'), size.delayMs); return }
if (typeof size !== 'number') { process.stderr.write(typeof size === 'string' ? size : 'synthetic missing size for ' + folder); process.exit(1) }
process.stdout.write(size + '\t' + folder + '\n')
`

/**
 * A STAND-IN FOR NPM, for a sandbox's own node_modules (item 2f). It reaches no registry: `npm ci` makes
 * node_modules/a-made-up-package in the folder it runs in. Each call is written down as one JSON line in npm-calls.jsonl
 * in the test's fakes folder: the folder, the arguments, the HOME it ran with and the package-lock.json it found there.
 * The fakes folder is written into the program, since `docker exec` gives a command only the container's environment.
 * While npm-fails is in the fakes folder, it says so and exits 1, and makes nothing.
 */
export function aFakeNpm(fakes: string): string {
  return String.raw`#!/usr/bin/env node
const fs = require('fs'), path = require('path')
const fakes = ${JSON.stringify(fakes)}
const lockfile = fs.existsSync('package-lock.json') ? fs.readFileSync('package-lock.json', 'utf8') : null
fs.appendFileSync(path.join(fakes, 'npm-calls.jsonl'), JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), home: process.env.HOME ?? null, lockfile }) + '\n')
if (fs.existsSync(path.join(fakes, 'npm-fails'))) { process.stderr.write('npm stand-in: told to fail\n'); process.exit(1) }
fs.mkdirSync(path.join('node_modules', 'a-made-up-package'), { recursive: true })
fs.writeFileSync(path.join('node_modules', 'a-made-up-package', 'index.js'), 'module.exports = 1\n')
`
}

/** Every call the npm stand-in wrote down in `fakes`, oldest first. */
export function theNpmCalls(fakes: string): { argv: string[]; cwd: string; home: string | null; lockfile: string | null }[] {
  const file = join(fakes, 'npm-calls.jsonl')
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line))
}

/** A package.json and the package-lock.json npm would write for it, with no dependencies: `version` tells two apart. */
export function aMadeUpPackage(version = '1.0.0'): { 'package.json': string; 'package-lock.json': string } {
  const name = 'a-made-up-checkout'
  return {
    'package.json': JSON.stringify({ name, version, private: true }, null, 2) + '\n',
    'package-lock.json': JSON.stringify({ name, version, lockfileVersion: 3, requires: true, packages: { '': { name, version } } }, null, 2) + '\n',
  }
}
