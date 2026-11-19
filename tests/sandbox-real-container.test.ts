// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * THE SANDBOX LAUNCHER AGAINST A REAL CONTAINER. OPT-IN: it needs a docker daemon and builds an image.
 *
 * tests/sandbox-launcher.test.ts proves the launcher's rules with fake docker and devcontainer
 * programs. This file proves what only a real container can: that a process started inside through
 * tools/sandbox-start.mjs is found by the office under its HOST pid, that the ledger holds its host
 * process group, and that releasing the row from the host ends the processes inside the container
 * (T2 of the spec, on a real pid namespace). It also runs an agent's run filing inside the
 * container, which needs git to work there through the read-only checkout. And it proves, inside a
 * real container, that the office's key file in the checkout cannot be read (acceptance finding 13):
 * a made-up key file is planted where the office keeps its own, and nothing inside can open it,
 * list it, find its values, or be handed its office key by `theOfficeKey()`, which the dsh hooks ask.
 *
 * IT RUNS ONLY WHEN SANDBOX_REAL_TEMPLATE names a template under sandboxes/, for example
 * `SANDBOX_REAL_TEMPLATE=mole-office-dev`. The suite never builds an image or needs a daemon on its
 * own. The devcontainer CLI builds the template's image (from its layer cache when the image has
 * been built before). The container and the image it makes carry the label `mole-office.sv1=launcher`,
 * and both are removed by their exact ids at the end.
 *
 * The checkout the sandbox is made from is a small repository made here, holding the folders
 * reached by the in-container tools' imports (problem 7NnrMh63IzNG). The helper that runs inside
 * is the one under test, uncommitted changes included. The office is the product's own API on a
 * port of its own, with the real machine probe. Nothing here talks to the owner's server.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { spawn, execFileSync, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
// WHERE AN OFFICE SERVED FROM A CHECKOUT KEEPS ITS KEY FILE, from the one declaration of it.
import { REPO_ROOT, databasePathFrom, keysPathFrom } from '../src/config/settings.mjs'
// Problem 7NnrMh63IzNG: reuse the repository's reader rather than another parser of imports.
import { dynamicImportsIn, importsIn } from '../src/config/import-graph.mjs'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

/** The key file an office served from `checkout` with nothing set would keep: beside its database. */
function theKeyFileOf(checkout: string): string {
  return keysPathFrom({ MOLE_OFFICE_DB: join(checkout, relative(REPO_ROOT, databasePathFrom({}))) })
}

/**
 * A MADE-UP KEY FILE, in the shape the office writes, planted where an office served from the
 * sandbox's checkout keeps its own. Never a real key: 32 random bytes each, made for this run.
 */
const MADE_UP_KEYS = { person: randomBytes(32).toString('hex'), office: randomBytes(32).toString('hex'), providers: {} }

const TEMPLATE = process.env['SANDBOX_REAL_TEMPLATE'] ?? ''
const REPO = fileURLToPath(new URL('..', import.meta.url))
// THE DOCKERFILE devcontainer.json builds, resolved from the template's folder as the launcher and
// sandbox-template.test.ts resolve it. No template is read when this opt-in suite is not requested.
const templateFolder = join(REPO, 'sandboxes', TEMPLATE)
const templateConfig = TEMPLATE === '' ? null : JSON.parse(readFileSync(join(templateFolder, 'devcontainer.json'), 'utf8')) as { build?: { dockerfile?: string }; init?: boolean }
const buildsDevImage = templateConfig !== null && resolve(templateFolder, templateConfig.build?.dockerfile ?? 'Dockerfile') === join(REPO, 'sandboxes', 'mole-office-dev', 'Dockerfile')
const TOOL = join(REPO, 'tools', 'sandbox.mjs')
// Problem 7NnrMh63IzNG: the helper, its subprocess, and the key reader called directly inside.
const OFFICE_KEY_READER = 'src/config/office-key.mjs'
const IN_CONTAINER_TOOLS = ['tools/sandbox-start.mjs', 'tools/register-a-run.mjs', OFFICE_KEY_READER]

/** Problem 7NnrMh63IzNG: follow every relative import, including lazy ones, and stop cycles. */
function inContainerFiles(): string[] {
  const files = new Set(IN_CONTAINER_TOOLS.map((file) => join(REPO, file)))
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const extension = extname(file)
    for (const specifier of [...importsIn(text, extension), ...dynamicImportsIn(text, extension)]) {
      if (specifier.startsWith('.')) files.add(resolve(dirname(file), specifier))
    }
  }
  return [...files].map((file) => relative(REPO, file)).sort()
}

/** Problem 7NnrMh63IzNG: derive the folders to copy from the files the tools actually import. */
function copyInContainerTools(checkout: string): void {
  for (const folder of new Set(inContainerFiles().map(dirname))) {
    mkdirSync(join(checkout, folder), { recursive: true })
    cpSync(join(REPO, folder), join(checkout, folder), { recursive: true })
  }
}

// Problem 7NnrMh63IzNG: this guard needs neither a container nor the opt-in environment variable.
it('the small repository holds every file the in-container tools import', () => {
  const checkout = mkdtempSync(join(tmpdir(), 'mole-office-sandbox-imports-'))
  try {
    copyInContainerTools(checkout)
    const missing = inContainerFiles().filter((file) => !existsSync(join(checkout, file)))
    expect(missing, `the small repository is missing: ${missing.join(', ')}`).toEqual([])
  } finally {
    rmSync(checkout, { recursive: true, force: true })
  }
})
const WORKSPACE = 'default'
const STARTER = 'real-sandbox-starter'
const WORKER = 'real-sandbox-worker'
const LABEL = 'mole-office.sv1=launcher'
const NAME = `real-${Math.random().toString(36).slice(2, 7)}`
const CONTAINER = `mole-office-sandbox-${NAME}`

let t: TestDb
let app: FastifyInstance
let api = ''
let scratch = ''
let from = ''
let sandboxes = ''
let dsh = ''
let originals = ''
let starterSession = ''
// Problem 7NnrMh63IzNG: only the key issued to this starter by this test's office.
let starterKey = ''
let up: { container: string; resource: string; folder: string } | null = null
let imageId: string | null = null
let start: { run: string; innerPid: number; hostPid: number; hostPgid: number; processRow: string } | null = null
const groups = new Set<number>()

interface Ran {
  status: number
  out: string
  err: string
}

/** The tool, as its own process and without blocking: the office answering it lives in this process. */
function sandbox(args: string[], timeoutMs = 600_000): Promise<Ran> {
  const cut = args.indexOf('--')
  const before = cut === -1 ? args : args.slice(0, cut)
  const after = cut === -1 ? [] : args.slice(cut)
  const env: NodeJS.ProcessEnv = { ...withoutInheritedEffort() }
  delete env['MOLE_OFFICE_AGENT']
  delete env['MOLE_OFFICE_SESSION']
  // Problem 7NnrMh63IzNG: the launcher reads its starter's key here; replace any inherited key.
  env['MOLE_AGENT_KEY'] = starterKey
  return new Promise((done) => {
    const child = spawn(
      process.execPath,
      [TOOL, ...before, '--sandboxes', sandboxes, '--api', api, '--workspace', WORKSPACE, '--as', STARTER, '--session', starterSession, ...after],
      { env, detached: true },
    )
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs)
    let out = ''
    let err = ''
    child.stdout.on('data', (c) => (out += c))
    child.stderr.on('data', (c) => (err += c))
    child.on('close', (code) => {
      clearTimeout(timer)
      done({ status: code ?? 1, out, err })
    })
  })
}

async function ask(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  const r = await fetch(`${api}${path}`, {
    method,
    headers: {
      ...(method === 'GET' ? {} : { 'content-type': 'application/json' }),
      'x-mole-office-workspace': WORKSPACE,
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': STARTER,
      // Problem 7NnrMh63IzNG: prove the starter on its filing and all later requests.
      'x-mole-office-key': starterKey,
      ...(starterSession === '' ? {} : { 'x-mole-office-session': starterSession }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}

function docker(...args: string[]): { status: number; out: string; err: string } {
  const r = spawnSync('docker', args, { encoding: 'utf8' })
  return { status: r.status ?? 1, out: r.stdout ?? '', err: r.stderr ?? '' }
}

function membersOf(pgid: number): number[] {
  return readdirSync('/proc')
    .filter((d) => /^\d+$/.test(d))
    .filter((d) => {
      try {
        const stat = readFileSync(`/proc/${d}/stat`, 'utf8')
        return Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[2]) === pgid
      } catch {
        return false
      }
    })
    .map(Number)
}

async function until(what: string, check: () => boolean, ms = 20_000): Promise<void> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (check()) return
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`waited ${ms} ms for ${what}`)
}

const git = (dir: string, ...args: string[]): string => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()

describe.skipIf(TEMPLATE === '')(`a real sandbox from ${TEMPLATE || 'a template SANDBOX_REAL_TEMPLATE names'}`, () => {
  beforeAll(async () => {
    t = await freshDb()
    app = (await apiApp()).app
    await app.listen({ host: '127.0.0.1', port: 0 })
    api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`

    scratch = mkdtempSync(join(tmpdir(), 'mole-office-sandbox-real-'))
    sandboxes = join(scratch, 'sandboxes')
    from = join(scratch, 'from')
    // Problem 7NnrMh63IzNG: the same copy that the guard checks, including newly imported files.
    copyInContainerTools(from)
    git(from, 'init', '-q', '-b', 'main')
    git(from, 'config', 'user.email', 'a-test@example.invalid')
    git(from, 'config', 'user.name', 'A test')
    git(from, 'config', 'commit.gpgsign', 'false')
    git(from, 'add', '-A')
    git(from, 'commit', '-q', '-m', 'the helper under test')
    mkdirSync(join(from, 'node_modules', '.vite-temp'), { recursive: true })
    // THE MADE-UP KEY FILE, where the office would keep its own. Its folder is the one the template
    // covers, and it has to exist on the host for docker to make that cover inside a read-only mount.
    mkdirSync(dirname(theKeyFileOf(from)), { recursive: true })
    writeFileSync(theKeyFileOf(from), `${JSON.stringify(MADE_UP_KEYS)}\n`, { mode: 0o600 })
    dsh = join(scratch, 'dsh')
    mkdirSync(join(dsh, 'home'), { recursive: true })
    writeFileSync(join(dsh, 'env'), 'DEEPSEEK_API_KEY=not-a-real-key\n', { mode: 0o600 })
    originals = join(scratch, 'originals')
    mkdirSync(originals)
    writeFileSync(join(originals, 'a-file'), 'read only\n')

    // Problem 7NnrMh63IzNG: register as the other run-key tests do, then file and start with the
    // issued starter key. The person's key here belongs only to the freshly made test office.
    const made = await fetch(`${api}/api/agents/started`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mole-office-workspace': WORKSPACE,
        'x-mole-office-actor-type': 'human',
        'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
        ...thePersonsKeyHeader(),
      },
      body: JSON.stringify({ handle: STARTER, name: STARTER, role: 'supervisor' }),
    })
    expect(made.status).toBe(201)
    starterKey = String(((await made.json()) as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key ?? '')
    expect(/^[0-9a-f]{64}$/.test(starterKey), 'the test office issued no starter key').toBe(true)
    const mine = await ask('POST', '/api/records', { kind: 'session', title: 'the supervisor run', data: { state: 'running' } })
    expect(mine.status, JSON.stringify(mine.body)).toBe(201)
    starterSession = mine.body.record.id
    const worker = await ask('POST', '/api/agents/started', { handle: WORKER, name: WORKER, role: 'worker', runtime: 'dsh', workArea: ['tools'] })
    expect(worker.status).toBe(201)
  }, 120_000)

  afterAll(async () => {
    // AND ANY PROCESS WORKING INSIDE THIS TEST'S OWN SCRATCH FOLDER, which only this file made: a
    // broken build of the helper may register the wrong group, and its command must not outlive the test.
    for (const pid of readdirSync('/proc').filter((d) => /^\d+$/.test(d))) {
      try {
        if (scratch !== '' && readlinkSync(`/proc/${pid}/cwd`).startsWith(scratch)) {
          const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
          const pgid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[2])
          if (pgid > 1 && pgid !== process.pid) groups.add(pgid)
        }
      } catch {
        // gone, or not ours to read
      }
    }
    for (const group of groups) {
      try {
        if (!readlinkSync(`/proc/${group}/cwd`).startsWith(scratch)) continue
        process.stderr.write(`stopping test group ${group}\n`)
        process.kill(-group, 'SIGKILL')
      } catch {
        // gone
      }
    }
    // WHAT THIS FILE MADE IN DOCKER, by exact id and only when it carries this file's label.
    const left = docker('inspect', '--type', 'container', '--format', '{{.Id}} {{index .Config.Labels "mole-office.sv1"}}', CONTAINER)
    if (left.status === 0) {
      const [id, label] = left.out.trim().split(' ')
      if (label === 'launcher' && id !== undefined) docker('rm', '-f', id)
    }
    if (imageId !== null) {
      const label = docker('image', 'inspect', '--format', '{{index .Config.Labels "mole-office.sv1"}}', imageId)
      if (label.out.trim() === 'launcher') docker('rmi', imageId)
    }
    await app?.close()
    t?.close()
    if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
  })

  it('starts the container registered, with the extra folder read-only', async () => {
    const ran = await sandbox(['up', TEMPLATE, '--name', NAME, '--from', from, '--dsh', dsh, '--ro', originals, '--label', LABEL, '--json'])
    expect(ran.status, ran.err).toBe(0)
    up = JSON.parse(ran.out.trim().split('\n').pop() as string)
    const made = JSON.parse(docker('inspect', '--type', 'container', CONTAINER).out)[0]
    imageId = made.Image
    expect(made.Id).toBe(up?.container)
    expect(made.State.Running).toBe(true)
    expect(made.Config.Labels['mole-office.sv1']).toBe('launcher')
    expect(made.Mounts.find((m: any) => m.Destination === originals)?.RW).toBe(false)
    const row = (await ask('GET', '/api/resources')).body.resources.find((r: any) => r.id === up?.resource)
    expect(row).toMatchObject({ type: 'container', key: CONTAINER })
    expect(row.liveness.state).toBe('alive')
    // INSIDE: the extra folder cannot be written, and the owner's home is not there.
    const write = docker('exec', CONTAINER, 'sh', '-c', `touch ${originals}/new 2>&1; echo exit=$?`)
    expect(write.out).toContain('Read-only file system')
  }, 900_000)

  it("cannot read the office's key file, which holds the person's key: not by path, not by listing, not by its values", async () => {
    const keyFile = theKeyFileOf(from)
    const folder = (up as { folder: string }).folder
    // ON THE HOST THE MADE-UP FILE IS THERE, so what fails inside is the sandbox's doing, not an empty fixture.
    expect((JSON.parse(readFileSync(keyFile, 'utf8')) as { person: string }).person).toBe(MADE_UP_KEYS.person)

    const opened = docker('exec', CONTAINER, 'sh', '-c', 'cat -- "$1" > /dev/null; echo "exit=$?"', 'sh', keyFile)
    expect(opened.out.trim(), `the key file could be read inside: ${opened.err}`).toBe('exit=1')
    expect(opened.err).toContain('No such file or directory')

    const listed = docker('exec', CONTAINER, 'ls', '-A', dirname(keyFile))
    expect(listed.status, listed.err).toBe(0)
    expect(listed.out.trim(), 'the folder the template covers shows something inside').toBe('')

    // NEITHER VALUE IS ANYWHERE IN THE CHECKOUT OR THE INSTANCE FOLDER, as the container sees them.
    for (const value of [MADE_UP_KEYS.person, MADE_UP_KEYS.office]) {
      const found = docker('exec', CONTAINER, 'grep', '-rlF', '--', value, from, folder)
      expect(found.out.trim(), 'a made-up key was found inside the sandbox').toBe('')
    }

    // AND THE READ THE dsh HOOKS MAKE, run inside from the checkout as the hooks run it, answers no key.
    const asked = docker(
      'exec', '-w', from, CONTAINER, 'node', '--input-type=module', '-e',
      // Problem 7NnrMh63IzNG: use the entry whose imports the fixture follows.
      `const { theOfficeKey } = await import(process.cwd() + '/${OFFICE_KEY_READER}'); process.stdout.write(String(theOfficeKey().key === null))`,
    )
    expect(asked.status, asked.err).toBe(0)
    expect(asked.out, 'theOfficeKey() inside the sandbox answered a key').toBe('true')
  }, 120_000)

  it('files an agent run inside, and the ledger holds the host group of the process inside', async () => {
    const folder = (up as { folder: string }).folder
    const ran = await sandbox([
      'exec', NAME, '--agent', WORKER, '--runtime', 'dsh', '--model', 'deepseek/deepseek-chat', '--cut-from', 'main', '--verbose', '--json',
      '--', 'sh', '-c', 'sleep 300 & sleep 300; wait',
    ])
    expect(ran.status, ran.err).toBe(0)
    // Problem 7NnrMh63IzNG: the run holds a key of its own, minted from the starter's, as runs on the live office do.
    // This test's office keeps its key window open, so a run filed without the starter's key still runs, keyless;
    // only this line tells the two apart. Mutation (host run): the starter's key not given to the launcher.
    expect(ran.err).toContain(`is filed here with ${STARTER}'s key, and holds a key of ${WORKER} of its own`)
    start = JSON.parse(ran.out.trim().split('\n').pop() as string)
    const s = start as NonNullable<typeof start>
    groups.add(s.hostPgid)

    // TWO NUMBERS FOR ONE PROCESS: the container's and this machine's, joined by the kernel's NSpid line.
    expect(s.hostPid).not.toBe(s.innerPid)
    const nspid = /^NSpid:\s+(.*)$/m.exec(readFileSync(`/proc/${s.hostPid}/status`, 'utf8'))?.[1]?.trim().split(/\s+/).map(Number)
    expect(nspid?.[0]).toBe(s.hostPid)
    expect(nspid?.[nspid.length - 1]).toBe(s.innerPid)
    expect(s.hostPgid, 'the command is not the leader of its own group').toBe(s.hostPid)
    expect(docker('top', CONTAINER, '-o', 'pid').out.split('\n').map((l) => l.trim())).toContain(String(s.hostPid))
    const row = (await ask('GET', '/api/resources')).body.resources.find((r: any) => r.id === s.processRow)
    expect(row).toMatchObject({ type: 'process', key: String(s.hostPid), pgid: s.hostPgid, sessionRecordId: s.run })

    // THE RUN was filed from inside, with git reading the clone through the read-only checkout.
    const record = (await ask('GET', `/api/records/${s.run}`)).body.record
    expect(record.data).toMatchObject({
      servingAgent: WORKER,
      workingDirectory: join(folder, 'repo'),
      tip: git(join(folder, 'repo'), 'rev-parse', 'HEAD'),
      sandbox: { template: TEMPLATE, container: up?.resource },
    })
  }, 120_000)

  it('ends every process of that group, inside the container, when the row is released from the host', async () => {
    const s = start as NonNullable<typeof start>
    const members = membersOf(s.hostPgid)
    expect(members.length).toBeGreaterThanOrEqual(2)
    const first = await ask('POST', `/api/resources/${s.processRow}/release`, { force: true })
    const phrase = /Send the sentence back as \{"expect": "\.\.\."\}: "([\s\S]+)"$/.exec(String(first.body?.error))?.[1]
    const released = await ask('POST', `/api/resources/${s.processRow}/release`, { force: true, expect: phrase })
    expect(released.status, JSON.stringify(released.body)).toBe(200)
    await until('the group to be gone on the host', () => membersOf(s.hostPgid).length === 0)
    const inside = docker('exec', CONTAINER, 'sh', '-c', `kill -0 ${s.innerPid} 2>/dev/null; echo $?`)
    expect(inside.out.trim()).not.toBe('0')
  }, 60_000)

  it("runs the caller's own command to its end inside, with the container's environment only, and stops it at its limit (finding 17)", async () => {
    const folder = (up as { folder: string }).folder
    const seen = join(folder, 'out', 'real-plain-env.txt')
    const offset = join(folder, 'out', 'real-clock-offset.txt')
    const ran = await sandbox(['exec', NAME, '--wait', '--plain-env', '--', 'sh', '-c', `env > ${seen}; date +%z > ${offset}; test -f /.dockerenv && echo inside; exit 5`])
    expect(ran.status, ran.err).toBe(5)
    expect(ran.out).toBe('inside\n')
    // THE CLOCK INSIDE SAYS THE HOST'S TIME ZONE, not only its environment (acceptance finding 62, the inspector's first
    // note, carried by finding 64's entry): a zone the image cannot read falls back to UTC in silence, so the offset the
    // clock gives is compared first, and then the variable that set it.
    // MUTATION PROOF, 24 September 2026, alone in tools/sandbox.mjs: the zone passed as a name no zone file holds, and
    // this goes red on the offset.
    const east = -new Date().getTimezoneOffset()
    const hostOffset = `${east < 0 ? '-' : '+'}${String(Math.floor(Math.abs(east) / 60)).padStart(2, '0')}${String(Math.abs(east) % 60).padStart(2, '0')}`
    expect(readFileSync(offset, 'utf8').trim(), "the container clock's offset").toBe(hostOffset)
    expect(readFileSync(seen, 'utf8').split('\n')).toContain(`TZ=${Intl.DateTimeFormat().resolvedOptions().timeZone}`)
    const names = readFileSync(seen, 'utf8').split('\n').map((line) => line.slice(0, line.indexOf('=')))
    for (const name of ['SANDBOX_DIR', 'SANDBOX_PROCESS_ROW', 'MOLE_OFFICE_API', 'MOLE_OFFICE_SESSION', 'MOLE_OFFICE_AGENT', 'GIT_AUTHOR_NAME']) {
      expect(names, `${name} reached a --plain-env command`).not.toContain(name)
    }
    const started = Date.now()
    const limited = await sandbox(['exec', NAME, '--wait', '--timeout', '2', '--', 'sh', '-c', 'sleep 300 & sleep 300'])
    expect(limited.status, limited.err).toBe(124)
    expect(Date.now() - started).toBeLessThan(30_000)
    expect(docker('top', CONTAINER, '-o', 'args').out).not.toContain('sleep 300')
  }, 90_000)

  // Mutation proof: run on the host, see the entry's report.
  it.skipIf(!buildsDevImage)(buildsDevImage
    ? 'opens a virtual display with a D-Bus session bus and GTK 3, without systemd (wave 13t, piece H0)'
    : 'opens a virtual display with a D-Bus session bus and GTK 3 (skipped: this template does not build sandboxes/mole-office-dev/Dockerfile)', async () => {
    const seen = join((up as { folder: string }).folder, 'out', 'real-window.txt')
    const ran = await sandbox(['exec', NAME, '--wait', '--plain-env', '--', 'sh', '-c', `dbus-run-session -- xvfb-run -a sh -c '
      printf "DISPLAY=%s\\n" "$DISPLAY"
      if test -n "$DBUS_SESSION_BUS_ADDRESS"; then echo BUS=set; else echo BUS=unset; fi
      ldconfig -p
      if command -v systemctl; then echo SYSTEMCTL=present; else echo SYSTEMCTL=absent; fi
    ' > '${seen}'`])
    expect(ran.status, ran.err).toBe(0)
    const report = readFileSync(seen, 'utf8')
    expect(report).toMatch(/^DISPLAY=:\d+$/m)
    expect(report).toMatch(/^BUS=set$/m)
    expect(report).toMatch(/\blibgtk-3\.so\.0\b/)
    expect(report).toMatch(/^SYSTEMCTL=absent$/m)
    expect(report).not.toMatch(/^SYSTEMCTL=present$/m)
  }, 60_000)

  it('says what it holds, and down stops it through the ledger, removes it and keeps the folder', async () => {
    const folder = (up as { folder: string }).folder
    const status = await sandbox(['status', NAME, '--json'])
    expect(status.status, status.err).toBe(0)
    const [report] = JSON.parse(status.out).reports
    expect(report.container.docker).toBe('running')
    // A RELEASED ROW IS NOT AMONG THE OPEN ROWS, which is all the launcher reads now (acceptance finding 67).
    expect(report.processes.find((p: any) => p.processRow === start?.processRow)?.liveness).toBe('not open')
    // NOTHING ESCAPED: what still runs inside is the container's own, each named from docker's record. A template that
    // asks for docker's init has two: docker's init, and the shell the container was started with. One that does not
    // has one: the command its image starts, which is the first process and keeps the container running.
    expect(report.notInTheLedger.filter((p: any) => p.what === null)).toEqual([])
    const itsOwn =
      templateConfig?.init === true
        ? ["the container's first process (docker's init)", 'the command the container was started with, which keeps it running']
        : ["the container's first process, the command it was started with, which keeps it running"]
    expect(report.notInTheLedger.map((p: any) => p.what)).toEqual(expect.arrayContaining(itsOwn))

    const down = await sandbox(['down', NAME, '--json'])
    expect(down.status, down.err).toBe(0)
    expect(docker('inspect', '--type', 'container', CONTAINER).status).not.toBe(0)
    const row = (await ask('GET', '/api/resources?includeReleased=true')).body.resources.find((r: any) => r.id === up?.resource)
    expect(row.releasedAt).not.toBeNull()
    expect(existsSync(join(folder, 'repo', '.git'))).toBe(true)
    expect(existsSync(join(folder, 'logs', start?.run as string, 'start.json'))).toBe(true)
  }, 180_000)
})

describe.skipIf(TEMPLATE !== '')('a real sandbox', () => {
  it('is not started unless SANDBOX_REAL_TEMPLATE names a template', () => {
    expect(TEMPLATE).toBe('')
  })
})
