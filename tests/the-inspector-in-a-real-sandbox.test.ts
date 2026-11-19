// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE INSPECTOR'S CHECK IN A REAL SANDBOX, WITH A REAL MODEL. OPT-IN: it needs a docker daemon, it
 * builds the template's image (from its layer cache when it has been built before), and it SPENDS ONE
 * MODEL CALL.
 *
 * tests/the-inspector-builds-and-runs-its-model-in-a-sandbox.test.ts proves the rules with stand-in
 * docker, devcontainer and claude programs. This file proves what only the real things can: that the
 * image's own claude accepts the login the tool gives it (a copy of this machine's Claude login with
 * no refresh token, or CLAUDE_CODE_OAUTH_TOKEN), runs in its full-permission mode inside the
 * container, and answers; and that the container is stopped and removed afterwards.
 *
 * IT RUNS ONLY WHEN INSPECTOR_REAL_SANDBOX_MODEL names a model, for example
 * `INSPECTOR_REAL_SANDBOX_MODEL=haiku`. Keep it small: the prompt is a real check's prompt over a
 * one-line change (about 30 KB), and the check is given five minutes.
 *
 * WHAT IT READS FROM THIS MACHINE: `~/.claude/.credentials.json`, once. A copy with the refresh token
 * taken out is written into this test's own scratch home at mode 600, and the tool is run with that
 * home, so the owner's secrets file and dsh folder are not used. Nothing is printed from either.
 * The office is the product's own API on a port of its own; nothing talks to the owner's server. The
 * container and its image carry the label `mole-office.inspector=<the instance>` and are removed by
 * their exact ids at the end, and the scratch folder is deleted.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { spawn, execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { CLAUDE_USAGE_LINE } from '../src/config/usage.mjs'

const MODEL = process.env['INSPECTOR_REAL_SANDBOX_MODEL'] ?? ''
const REPO = fileURLToPath(new URL('..', import.meta.url))
const INSPECTOR = join(REPO, 'tools', 'the-inspector.mjs')
const WORKSPACE = 'default'
const HANDLE = `real-inspector-${Math.random().toString(36).slice(2, 7)}`
const INSTANCE = `inspector-${HANDLE}`
const CONTAINER = `mole-office-sandbox-${INSTANCE}`
const LABEL = 'mole-office.inspector'

let t: TestDb
let app: FastifyInstance
let api = ''
let scratch = ''
let home = ''
let from = ''
let sandboxes = ''
let worker = ''
let imageId: string | null = null

const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', ['-C', dir, '-c', 'user.name=A test', '-c', 'user.email=a-test@example.invalid', '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8' }).trim()

function docker(...args: string[]): { status: number; out: string } {
  const r = spawnSync('docker', args, { encoding: 'utf8' })
  return { status: r.status ?? 1, out: r.stdout ?? '' }
}

async function ask(method: string, path: string, actor: { type: string; id: string }, body?: unknown): Promise<{ status: number; body: any }> {
  const r = await fetch(`${api}${path}`, {
    method,
    headers: {
      ...(method === 'GET' ? {} : { 'content-type': 'application/json' }),
      'x-mole-office-workspace': WORKSPACE,
      'x-mole-office-actor-type': actor.type,
      'x-mole-office-actor-id': actor.id,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}

describe.skipIf(MODEL === '')(`a check in a real inspector sandbox, with ${MODEL || 'a model INSPECTOR_REAL_SANDBOX_MODEL names'}`, () => {
  beforeAll(async () => {
    t = await freshDb()
    app = (await apiApp()).app
    await app.listen({ host: '127.0.0.1', port: 0 })
    api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`

    // IN THE TEMPORARY DIRECTORY, as tests/sandbox-real-container.test.ts puts its sandboxes: nothing
    // this file makes goes under the home directory, and all of it is deleted at the end.
    scratch = mkdtempSync(join(tmpdir(), 'mole-office-inspector-real-sandbox-'))
    home = join(scratch, 'home')
    sandboxes = join(scratch, 'sandboxes')
    mkdirSync(join(home, '.claude'), { recursive: true, mode: 0o700 })
    mkdirSync(sandboxes)

    // THIS MACHINE'S CLAUDE LOGIN, WITHOUT ITS REFRESH TOKEN, in the scratch home. Never printed.
    const held = JSON.parse(readFileSync(join(homedir(), '.claude', '.credentials.json'), 'utf8')) as { claudeAiOauth: Record<string, unknown> }
    const { refreshToken: _a, refreshTokenExpiresAt: _b, ...access } = held.claudeAiOauth
    writeFileSync(join(home, '.claude', '.credentials.json'), JSON.stringify({ claudeAiOauth: access }), { mode: 0o600 })
    chmodSync(join(home, '.claude', '.credentials.json'), 0o600)

    // THE CHECKOUT THE SANDBOX IS MADE FROM: this checkout's tools/ and src/config/, copied, so the
    // helper inside is the one under test; and the two paths the template mounts over.
    from = join(scratch, 'from')
    mkdirSync(join(from, 'src'), { recursive: true })
    cpSync(join(REPO, 'tools'), join(from, 'tools'), { recursive: true })
    cpSync(join(REPO, 'src', 'config'), join(from, 'src', 'config'), { recursive: true })
    git(from, 'init', '-q', '-b', 'main')
    git(from, 'add', '-A')
    git(from, 'commit', '-q', '-m', 'the helper under test')
    mkdirSync(join(from, 'node_modules', '.vite-temp'), { recursive: true })
    mkdirSync(join(from, 'data'))
    writeFileSync(join(from, 'data', 'keys.json'), '{}\n', { mode: 0o600 })

    // THE WORK UNDER CHECK: one line, with a build that does nothing.
    worker = join(scratch, 'worker')
    mkdirSync(join(worker, 'work'), { recursive: true })
    git(worker, 'init', '-q', '-b', 'main')
    writeFileSync(join(worker, 'work', 'greeting.txt'), 'Hello.\n')
    writeFileSync(join(worker, 'package.json'), JSON.stringify({ name: 'the-work', private: true, scripts: { build: 'true' } }))
    writeFileSync(join(worker, '.gitignore'), 'node_modules\n')
    git(worker, 'add', '-A')
    git(worker, 'commit', '-q', '-m', 'Before the work')
    git(worker, 'checkout', '-q', '-b', 'the-work')
    writeFileSync(join(worker, 'work', 'greeting.txt'), 'Hello.\nHello again.\n')
    git(worker, 'commit', '-qam', 'Say hello twice')
    symlinkSync(join(from, 'node_modules'), join(worker, 'node_modules'))

    const person = { type: 'human', id: THE_PERSON }
    for (const [handle, role] of [[THE_TEST_OFFICES_SECRETARY.handle, 'secretary'], [HANDLE, 'inspector']] as const) {
      expect((await ask('POST', '/api/agents/started', person, { handle, name: handle, role })).status).toBe(201)
    }
  }, 120_000)

  afterAll(async () => {
    // WHAT THIS FILE MADE IN DOCKER, by exact id and only when it carries this file's label.
    const left = docker('inspect', '--type', 'container', '--format', `{{.Id}} {{index .Config.Labels "${LABEL}"}}`, CONTAINER)
    if (left.status === 0) {
      const [id, label] = left.out.trim().split(' ')
      if (label === INSTANCE && id !== undefined) docker('rm', '-f', id)
    }
    if (imageId !== null) {
      const label = docker('image', 'inspect', '--format', `{{index .Config.Labels "${LABEL}"}}`, imageId)
      if (label.out.trim() === INSTANCE) docker('rmi', imageId)
    }
    for (const pid of readdirSync('/proc').filter((d) => /^\d+$/.test(d))) {
      try {
        if (scratch !== '' && readlinkSync(`/proc/${pid}/cwd`).startsWith(scratch)) {
          const stat = readFileSync(`/proc/${pid}/stat`, 'utf8')
          const pgid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[2])
          if (pgid > 1 && pgid !== process.pid) process.kill(-pgid, 'SIGKILL')
        }
      } catch {
        // gone, or not ours
      }
    }
    await app?.close()
    t?.close()
    if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
  })

  it('runs the image\'s own claude with the copied login and full permissions, and stops the container after', async () => {
    const made = await ask('POST', '/api/agents/started', { type: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle }, { handle: `${HANDLE}-worker`, name: 'the worker', role: 'worker', workArea: ['work'] })
    expect(made.status).toBe(201)
    const run = (await ask('POST', '/api/records', { type: 'agent', id: `${HANDLE}-worker` }, {
      kind: 'session', title: 'Say hello twice',
      data: { state: 'finished', servingAgent: `${HANDLE}-worker`, workingDirectory: worker, doing: 'adding a second greeting', cutFrom: 'main' },
    })).body.record.id as string
    const check = (await ask('POST', '/api/records', { type: 'agent', id: HANDLE }, { kind: 'session', title: 'A real check', data: { state: 'running' } })).body.record.id as string

    const env: NodeJS.ProcessEnv = { ...process.env, HOME: home }
    delete env['MOLE_OFFICE_AGENT']
    delete env['MOLE_OFFICE_SESSION']
    delete env['MOLE_AGENT_KEY']
    const ran = await new Promise<{ code: number | null; out: string; err: string }>((done) => {
      const child = spawn(
        process.execPath,
        [INSPECTOR, '--run', run, '--check', check, '--as', HANDLE, '--api', api, '--workspace', WORKSPACE, '--checkout', worker,
          '--model', MODEL, '--limit', '5', '--sandboxes', sandboxes, '--sandbox-from', from],
        { cwd: REPO, env, stdio: ['ignore', 'pipe', 'pipe'] },
      )
      let out = ''
      let err = ''
      child.stdout.on('data', (d) => (out += String(d)))
      child.stderr.on('data', (d) => (err += String(d)))
      child.on('close', (code) => done({ code, out, err }))
    })
    // Problem h09tYuNl1nd9; Vv6h0HVryXOe: output belongs to this run's scratch folder unless explicitly kept.
    const outputFolder = process.env['INSPECTOR_REAL_SANDBOX_LOGS'] || scratch
    mkdirSync(outputFolder, { recursive: true })
    const outputLog = join(outputFolder, `inspector-real-sandbox-${check}.txt`)
    writeFileSync(outputLog, `exit ${String(ran.code)}\n${ran.out}\n===== stderr\n${ran.err}`)
    const failure = `Real sandbox output: ${outputLog}. Set INSPECTOR_REAL_SANDBOX_LOGS to keep it after teardown.`
    const made2 = docker('images', '--filter', `label=${LABEL}=${INSTANCE}`, '--format', '{{.ID}}').out.trim()
    imageId = made2 === '' ? null : made2.split('\n')[0] ?? null

    // THE MODEL RAN AND ANSWERED: an envelope came back, which a claude that was not signed in, or
    // that refused its permission mode, does not print.
    expect(ran.out, `${failure}\n${ran.err}`).toContain('The model signs in with a copy of this machine\'s Claude login, without its refresh token')
    const usage = ran.out.split('\n').find((line) => line.startsWith(CLAUDE_USAGE_LINE))
    expect(usage, `${failure}\nno envelope came back: ${ran.err.slice(-1500)}`).toBeDefined()
    const envelope = JSON.parse((usage as string).slice(CLAUDE_USAGE_LINE.length)) as { is_error?: boolean; usage?: unknown; session_id?: string }
    expect(envelope.is_error, failure).not.toBe(true)
    expect(envelope.usage, failure).toBeDefined()

    // IN ITS FULL-PERMISSION MODE, as Claude Code itself wrote it down: its transcript is in the
    // sandbox's home, under the session the envelope names, and every mode it records is that one.
    const projects = join(sandboxes, INSTANCE, 'home', '.claude', 'projects')
    const transcript = readdirSync(projects)
      .map((dir) => join(projects, dir, `${String(envelope.session_id)}.jsonl`))
      .find((file) => existsSync(file))
    expect(transcript, `${failure}\nno transcript of session ${String(envelope.session_id)} in ${projects}`).toBeDefined()
    const modes = [...readFileSync(transcript as string, 'utf8').matchAll(/"permissionMode":"([A-Za-z]+)"/g)].map((m) => m[1])
    expect(modes.length, failure).toBeGreaterThan(0)
    expect([...new Set(modes)], failure).toEqual(['bypassPermissions'])

    // AND NOTHING IS LEFT UP: the container was stopped through the ledger and removed.
    expect(docker('inspect', '--type', 'container', CONTAINER).status, failure).not.toBe(0)
    const rows = ((await ask('GET', '/api/resources?includeReleased=true', { type: 'agent', id: HANDLE })).body.resources as any[]).filter((r) => r.sessionRecordId === check)
    expect(rows.map((r) => r.type).sort(), failure).toEqual(['container', 'process', 'process'])
    for (const row of rows) expect(row.releasedAt, failure).not.toBeNull()
    expect(existsSync(join(sandboxes, INSTANCE, 'home', '.claude', '.credentials.json')), failure).toBe(false)
  }, 1_200_000)
})

describe.skipIf(MODEL !== '')('a check in a real inspector sandbox', () => {
  it('is not run unless INSPECTOR_REAL_SANDBOX_MODEL names a model', () => {
    expect(MODEL).toBe('')
  })
})
