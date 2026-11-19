// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * A NEW SANDBOX HOME HAS THE nvm.sh SHIM (item 32 of briefs/REQUIREMENTS.md). Chapter 9's first rule starts every shell
 * command with `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh";`, written for the host, whose system Node is 18. A
 * sandbox's image has Node 22 at /usr/local/bin/node and no nvm, so in a sandbox that line printed an error in every
 * command. `up` now writes .nvm/nvm.sh in a new home as one line, the launcher's constant THE_NVM_SHIM: a function nvm
 * that says on stderr which Node is used, and succeeds. A home that already has .nvm keeps it as it is.
 *
 * The office is a real one on a port of its own, over a throwaway database. Docker, the devcontainer CLI and npm are the
 * stand-ins of tests/sandbox-stand-ins.ts, and the checkout and the sandboxes are made up in this test's scratch folder.
 * What this pins:
 *
 *   1. a new home has the shim, byte for byte; chapter 9's line loads it with exit 0 and nothing on stderr, in bash and
 *      in sh; `node --version` after it is the Node that was there before it; and nvm, called, succeeds and names the
 *      image's Node on stderr;
 *   2. a home that already has .nvm, before its first up, keeps every file in it as it was, and gains none.
 *
 * MUTATIONS, each after a green control run and each restored, are listed by the code commit that makes them possible.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aTestAddress } from './the-test-commit-address.mjs'
import { spawn, spawnSync, execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { FAKE_DF, FAKE_FREE, FAKE_DU, FAKE_DEVCONTAINER, FAKE_DOCKER, aFakeNpm, aMadeUpPackage, startsOf, theFakeMachine } from './sandbox-stand-ins.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'sandbox.mjs')
const WORKSPACE = 'default'
const STARTER = 'nvm-shim-starter'
/** A sandbox made with a new home (case 1). */
const NEW = 'nvm-shim-new'
/** A sandbox whose home already has .nvm before its first up (case 2). */
const HELD = 'nvm-shim-held'
/** The shim, written out here as the requirement gives it, so a change of the launcher's words turns this file red. */
const THE_SHIM = `nvm() { echo "nvm: not installed in this sandbox; the image's Node $(/usr/local/bin/node --version) at /usr/local/bin/node is used" >&2; return 0; }\n`
/** Chapter 9's line, as every shell command starts with it. */
const CHAPTER_9 = 'export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh";'

let t: TestDb
let app: FastifyInstance
let res: typeof import('../src/server/lib/resources.ts')
let api = ''
let scratch = ''
let sandboxes = ''
let fakes = ''
let main = ''
let template = ''
let starterSession = ''
const groups = new Set<number>()

interface Ran {
  status: number
  out: string
  err: string
}

/** Run tools/sandbox.mjs as its own process, as the starter, with no office variables of this run in its env. */
function sandbox(args: string[]): Promise<Ran> {
  const env: NodeJS.ProcessEnv = { ...withoutInheritedEffort(), PATH: `${join(fakes, 'bin')}:${process.env['PATH'] ?? ''}`, FAKE_DOCKER_DIR: fakes, MOLE_OFFICE_COMMIT_EMAIL: aTestAddress('fixture') }
  delete env['MOLE_OFFICE_AGENT']
  delete env['MOLE_OFFICE_SESSION']
  delete env['MOLE_AGENT_KEY']
  return new Promise((done) => {
    const child = spawn(
      process.execPath,
      [TOOL, ...args, '--sandboxes', sandboxes, '--api', api, '--workspace', WORKSPACE, '--as', STARTER, '--session', starterSession],
      { env, detached: true },
    )
    if (child.pid !== undefined) groups.add(child.pid)
    let out = ''
    let err = ''
    child.stdout.on('data', (c) => (out += c))
    child.stderr.on('data', (c) => (err += c))
    child.on('close', (code) => done({ status: code ?? 1, out, err }))
  })
}

async function ask(method: string, path: string, body: unknown, actor: { type: string; id: string; key?: string }): Promise<{ status: number; body: any }> {
  const r = await fetch(`${api}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-mole-office-workspace': WORKSPACE,
      'x-mole-office-actor-type': actor.type,
      'x-mole-office-actor-id': actor.id,
      ...(actor.key === undefined ? {} : { 'x-mole-office-key': actor.key }),
    },
    body: JSON.stringify(body),
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}

const git = (at: string, ...args: string[]): string => execFileSync('git', ['-C', at, ...args], { encoding: 'utf8' }).trim()

/** A shell command run in a sandbox's home as chapter 9 says to start one; the host's own home is never read. */
function inTheHome(shell: string, home: string, command: string) {
  const ran = spawnSync(shell, ['-c', command], { env: { PATH: process.env['PATH'] ?? '', HOME: home }, encoding: 'utf8' })
  return { status: ran.status, out: ran.stdout, err: ran.stderr }
}

/** Every file under `folder`, by its path inside it, with its bytes. */
function everyFile(folder: string): Record<string, string> {
  const found: Record<string, string> = {}
  const walk = (at: string, inside: string): void => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const path = join(at, entry.name)
      if (entry.isDirectory()) walk(path, join(inside, entry.name))
      else found[join(inside, entry.name)] = readFileSync(path, 'utf8')
    }
  }
  walk(folder, '')
  return found
}

beforeAll(async () => {
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  res.useOsProbe(theFakeMachine(res.LINUX_PROBE, { fakes: () => fakes, sandboxes: () => sandboxes }))

  scratch = realpathSync(mkdtempSync(join(tmpdir(), 'mole-office-nvm-shim-')))
  sandboxes = join(scratch, 'sandboxes')
  fakes = join(scratch, 'fakes')
  mkdirSync(join(fakes, 'bin'), { recursive: true })
  writeFileSync(join(fakes, 'bin', 'devcontainer'), FAKE_DEVCONTAINER, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'docker'), FAKE_DOCKER, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'df'), FAKE_DF, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'free'), FAKE_FREE, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'du'), FAKE_DU, { mode: 0o755 })
  writeFileSync(join(fakes, 'bin', 'npm'), aFakeNpm(fakes), { mode: 0o755 })
  writeFileSync(join(fakes, 'state.json'), JSON.stringify({ api, workspace: WORKSPACE, containers: {}, calls: [], bugs: {} }))

  // THE CHECKOUT A SANDBOX IS MADE FROM: this checkout's own tools/ and src/, a committed made-up package, and the two
  // folders the template covers.
  main = join(scratch, 'main')
  mkdirSync(main)
  git(main, 'init', '-q', '-b', 'main')
  git(main, 'config', 'user.email', 'a-test@example.invalid')
  git(main, 'config', 'user.name', 'A test')
  git(main, 'config', 'commit.gpgsign', 'false')
  symlinkSync(join(REPO, 'tools'), join(main, 'tools'))
  symlinkSync(join(REPO, 'src'), join(main, 'src'))
  writeFileSync(join(main, 'README.md'), 'a checkout for the nvm shim test\n')
  writeFileSync(join(main, '.gitignore'), 'node_modules\n')
  for (const [file, text] of Object.entries(aMadeUpPackage('1.0.0'))) writeFileSync(join(main, file), text)
  git(main, 'add', '-A')
  git(main, 'commit', '-q', '-m', 'the checkout')
  mkdirSync(join(main, 'node_modules', '.vite-temp'), { recursive: true })
  mkdirSync(join(main, 'data'))

  // THE TEMPLATE: the real one's files, with a secrets file of this test's own.
  template = join(scratch, 'template')
  mkdirSync(template)
  const real = join(REPO, 'sandboxes', 'mole-office-dev')
  writeFileSync(join(template, 'devcontainer.json'), readFileSync(join(real, 'devcontainer.json')))
  const office = JSON.parse(readFileSync(join(real, 'sandbox.json'), 'utf8'))
  office.secrets.hostFile = join(scratch, 'sandbox-secrets.env')
  writeFileSync(office.secrets.hostFile, 'CLAUDE_CODE_OAUTH_TOKEN=not-a-real-token\n', { mode: 0o600 })
  writeFileSync(join(template, 'sandbox.json'), JSON.stringify(office, null, 2))

  const made = await ask('POST', '/api/agents/started', { handle: STARTER, name: STARTER, role: 'supervisor' }, { type: 'human', id: THE_TEST_OFFICES_OWNER.id })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  const starterKey = String(made.body?.whatToGiveIt?.key ?? '')
  expect(starterKey, "the person's start of the starter answered no key").toMatch(/\S/)
  const mine = await ask('POST', '/api/records', { kind: 'session', title: 'the starter run', data: { state: 'running' } }, { type: 'agent', id: STARTER, key: starterKey })
  expect(mine.status, JSON.stringify(mine.body)).toBe(201)
  starterSession = mine.body.record.id
}, 180_000)

afterAll(async () => {
  for (const name of [NEW, HELD]) {
    try { for (const start of startsOf(join(sandboxes, name))) groups.add(start.hostPgid) } catch { /* never made */ }
  }
  for (const group of groups) {
    // Only a group whose leader still works in this test's scratch; a number read earlier may belong to somebody
    // else's program by now, and that is never signalled.
    try {
      if (!readlinkSync(`/proc/${group}/cwd`).startsWith(scratch)) continue
      process.kill(-group, 'SIGKILL')
    } catch {
      // gone
    }
  }
  res?.useOsProbe(res.LINUX_PROBE)
  await app?.close()
  t?.close()
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

describe('a new sandbox home has the nvm shim, and a home with .nvm keeps its own', () => {
  it('1: a new home has the shim, chapter 9 loads it with exit 0, and node is the one that was there', async () => {
    const up = await sandbox(['up', template, '--name', NEW, '--from', main, '--no-dsh', '--json'])
    expect(up.status, up.err).toBe(0)
    const home = join(JSON.parse(up.out.trim()).folder, 'home')
    expect(readFileSync(join(home, '.nvm', 'nvm.sh'), 'utf8')).toBe(THE_SHIM)
    expect(Object.keys(everyFile(join(home, '.nvm')))).toEqual(['nvm.sh'])
    for (const shell of ['bash', 'sh']) {
      const without = inTheHome(shell, home, 'node --version')
      expect(without.status, without.err).toBe(0)
      const loaded = inTheHome(shell, home, `${CHAPTER_9} node --version`)
      expect(loaded, shell).toEqual({ status: 0, out: without.out, err: '' })
      // NVM, CALLED AS A HOST'S COMMAND WOULD CALL IT, succeeds, and says which Node is used instead.
      const called = inTheHome(shell, home, `${CHAPTER_9} nvm use 22`)
      const image = execFileSync('/usr/local/bin/node', ['--version'], { encoding: 'utf8' }).trim()
      expect(called, shell).toEqual({ status: 0, out: '', err: `nvm: not installed in this sandbox; the image's Node ${image} at /usr/local/bin/node is used\n` })
    }
    expect((await sandbox(['down', NEW])).status).toBe(0)
  }, 120_000)

  it('2: a home that already has .nvm keeps every file in it, and gains none', async () => {
    const nvm = join(sandboxes, HELD, 'home', '.nvm')
    mkdirSync(join(nvm, 'versions'), { recursive: true })
    writeFileSync(join(nvm, 'nvm.sh'), '# A made-up nvm.sh that is not the shim.\nnvm() { return 3; }\n')
    writeFileSync(join(nvm, 'versions', 'made-up'), 'a made-up file beside it\n')
    const before = everyFile(nvm)
    const up = await sandbox(['up', template, '--name', HELD, '--from', main, '--no-dsh'])
    expect(up.status, up.err).toBe(0)
    expect(everyFile(nvm)).toEqual(before)
    expect((await sandbox(['down', HELD])).status).toBe(0)
  }, 120_000)
})
