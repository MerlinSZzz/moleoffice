// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A shell with no key may give the removal tool a fresh answer from the office. */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const tool = fileURLToPath(new URL('../tools/remove-a-worktree.mjs', import.meta.url))
let root: string
let repository: string
let tree: string
let answerFile: string
let env: NodeJS.ProcessEnv
let office: Server
let api: string
let t: TestDb
let app: FastifyInstance
let answer: { folder: string; records: unknown[]; scope: string; says: string; answeredAt: string }
let body: unknown
let requests: { url: string; headers: IncomingHttpHeaders }[]

function git(...args: string[]) {
  const result = spawnSync('git', args, { env, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr)
  return result.stdout
}

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'keyless-worktree-test-'))
  const home = join(root, 'home')
  mkdirSync(home)
  env = { ...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_NAME: 'Test builder', GIT_AUTHOR_EMAIL: 'test@example.invalid',
    GIT_COMMITTER_NAME: 'Test builder', GIT_COMMITTER_EMAIL: 'test@example.invalid',
    MOLE_OFFICE_AGENT: 'test-worktree-remover', MOLE_OFFICE_SESSION: 'test-removal-run',
    MOLE_OFFICE_WORKSPACE: 'test-project' }
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'MOLE_OFFICE_PORT', 'MOLE_AGENT_KEY', 'MOLE_OFFICE_TOOL_CONFIGURATION']) delete env[key]
  repository = join(root, 'repository')
  tree = join(root, 'tree with spaces')
  answerFile = join(root, 'office answer.json')
  git('init', repository)
  git('-C', repository, 'commit', '--allow-empty', '-m', 'Test root')
  git('-C', repository, 'worktree', 'add', '--detach', tree)
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const reply = await app.inject({ method: 'GET',
    url: `/api/report-files/named-inside?folder=${encodeURIComponent(realpathSync(tree))}`,
    headers: { 'x-mole-office-workspace': 'default' } })
  expect(reply.statusCode, reply.body).toBe(200)
  answer = reply.json()
  writeFileSync(answerFile, reply.body)
  requests = []
  body = answer
  office = createServer((req, res) => {
    req.resume()
    requests.push({ url: req.url ?? '', headers: req.headers })
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  })
  await new Promise<void>((done) => office.listen(0, '127.0.0.1', done))
  api = `http://127.0.0.1:${String((office.address() as AddressInfo).port)}`
})

afterEach(async () => {
  if (office) await new Promise<void>((done) => office.close(() => done()))
  if (app) await app.close()
  if (t) t.close()
  rmSync(root, { recursive: true, force: true })
})

function save(value: unknown) { writeFileSync(answerFile, JSON.stringify(value)) }

/** A made-up key, for a run that asks the office itself rather than giving it an answer file. */
const A_MADE_UP_KEY = { MOLE_AGENT_KEY: 'made-up-test-key' }

function remove(args: string[] = ['--answer', answerFile], path = tree, more: NodeJS.ProcessEnv = {}): Promise<{ code: number | null; output: string }> {
  return new Promise((done, bad) => {
    const child = spawn(process.execPath, [tool, path, ...args], {
      cwd: root, env: { ...env, MOLE_OFFICE_API: api, ...more }, stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (bytes) => { output += String(bytes) })
    child.stderr.on('data', (bytes) => { output += String(bytes) })
    child.on('error', bad)
    child.on('close', (code) => done({ code, output }))
  })
}

it('removes with a fresh matching answer from the real door without asking the stub office', async () => {
  expect(answer.answeredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/)
  expect(answer.records).toEqual([])
  const missing = join(root, 'missing answer.json')
  for (const file of [missing, answerFile]) {
    writeFileSync(answerFile, '{bad JSON')
    const refused = await remove(['--answer', file])
    expect(refused.code, refused.output).toBe(1)
    expect(refused.output).toContain(file)
    expect(existsSync(tree)).toBe(true)
  }
  save({ ...answer, records: [{}] })
  const malformed = await remove()
  expect(malformed.code, malformed.output).toBe(1)
  expect(malformed.output).toContain('did not give the named-inside answer')
  expect(existsSync(tree)).toBe(true)
  save(answer)
  const alias = join(root, 'alias')
  symlinkSync(tree, alias)
  const out = await remove(['--answer', answerFile], alias)
  expect(out.code, out.output).toBe(0)
  expect(existsSync(tree)).toBe(false)
  expect(git('-C', repository, 'worktree', 'list', '--porcelain')).not.toContain(tree)
  expect(requests).toEqual([])
  expect(out.output).toContain(answerFile)
  expect(out.output).toContain(answer.answeredAt)
  expect(out.output.indexOf(answerFile)).toBeLessThan(out.output.indexOf(answer.says))
})

it('refuses an answer six minutes old and says its age, keeping the worktree', async () => {
  save({ ...answer, answeredAt: new Date(Date.now() - 6 * 60_000).toISOString() })
  const out = await remove()
  expect(out.code, out.output).toBe(1)
  expect(out.output).toMatch(/6(?:\.\d+)? minutes old/)
  expect(out.output).toContain('asked again')
  expect(existsSync(tree)).toBe(true)
  const oldDoor = { ...answer } as Partial<typeof answer>
  delete oldDoor.answeredAt
  const refusals = [
    [oldDoor, 'predates'],
    [{ ...answer, answeredAt: new Date(Date.now() - 5 * 60_000).toISOString() }, '5'],
    [{ ...answer, answeredAt: new Date(Date.now() + 60_000).toISOString() }, 'later than now'],
    [{ ...answer, answeredAt: '2026-10-14T12:00:00' }, 'offset'],
    [{ ...answer, answeredAt: '2026-02-30T12:00:00+00:00' }, 'offset'],
    [{ ...answer, answeredAt: 'not a time' }, 'offset'],
  ] as const
  for (const [value, words] of refusals) {
    save(value)
    const refused = await remove(['--even-so', 'An unusable answer gives no permission.', '--answer', answerFile])
    expect(refused.code, refused.output).toBe(1)
    expect(refused.output).toContain(words)
    expect(existsSync(tree)).toBe(true)
  }
  expect(requests).toEqual([])
})

it('refuses a fresh answer for another real folder and names both folders', async () => {
  const other = realpathSync(repository)
  save({ ...answer, folder: other })
  const out = await remove()
  expect(out.code, out.output).toBe(1)
  expect(existsSync(tree)).toBe(true)
  expect(out.output).toContain(other)
  expect(out.output).toContain(realpathSync(tree))
  expect(out.output).not.toContain('did not give the named-inside answer')
  expect(requests).toEqual([])
})

it('keeps a worktree when hiddenCount is above zero, including with an answer file and even-so', async () => {
  const hidden = { ...answer, hiddenCount: 1 }
  save(hidden)
  const out = await remove()
  expect(out.code, out.output).toBe(2)
  expect(existsSync(tree)).toBe(true)
  expect(out.output).toContain(`Nothing was removed: 1 record names files inside ${realpathSync(tree)}, 0 you can read and 1 you may not.`)
  expect(requests).toEqual([])
  body = hidden
  const direct = await remove([], tree, A_MADE_UP_KEY)
  expect(direct.code, direct.output).toBe(2)
  expect(direct.output).toContain(`Nothing was removed: 1 record names files inside ${realpathSync(tree)}, 0 you can read and 1 you may not.`)
  expect(existsSync(tree)).toBe(true)
  expect(requests).toHaveLength(1)
  for (const hiddenCount of [-1, 0.5, '1', null]) {
    body = { ...answer, hiddenCount }
    save(body)
    for (const args of [[], ['--answer', answerFile]]) {
      const refused = await remove(args, tree, args.length === 0 ? A_MADE_UP_KEY : {})
      expect(refused.code, refused.output).toBe(1)
      expect(refused.output).toContain('did not give the named-inside answer')
      expect(existsSync(tree)).toBe(true)
    }
  }
  save(hidden)
  for (const args of [
    ['--answer', answerFile, '--even-so', 'The files were copied.'],
    ['--even-so', 'The files were copied.', '--answer', answerFile],
  ]) {
    const kept = await remove(args)
    expect(kept.code, kept.output).toBe(2)
    expect(kept.output).toContain(`Nothing was removed: 1 record names files inside ${realpathSync(tree)}, 0 you can read and 1 you may not.`)
    expect(existsSync(tree)).toBe(true)
  }
})

it('removes with a fresh answer file when the key is empty, without asking the office', async () => {
  const out = await remove(['--answer', answerFile], tree, { MOLE_AGENT_KEY: '' })
  expect(out.code, out.output).toBe(0)
  expect(existsSync(tree)).toBe(false)
  expect(git('-C', repository, 'worktree', 'list', '--porcelain')).not.toContain(tree)
  expect(requests).toEqual([])
})

it('refuses an answer file in a shell with a key without asking the office', async () => {
  env.MOLE_AGENT_KEY = 'made-up-test-key'
  const out = await remove()
  expect(out.code, out.output).toBe(1)
  expect(existsSync(tree)).toBe(true)
  expect(out.output).toContain('a shell with a key asks the office itself')
  // Round 48: the refusal also says why a run with a key does not read a file.
  expect(out.output).toContain('A run with a key has no reason to trust a file it could have been handed.')
  expect(requests).toEqual([])
})

// WITH NO KEY AND NO ANSWER FILE THE TOOL ASKS NOBODY (wave 13s round 118). A request with no key would be answered as
// nobody, and in a sandbox the address it goes to may be another copy's office. An empty key is no key: none would be sent.
// Red before the code, when the tool asked the stand-in office and removed the worktree. Red again with the check left
// out, and with the check reading only whether MOLE_AGENT_KEY is set, which lets the empty key ask. With the tool
// refusing every run that gives no --answer, key or not, the case above went red at its direct read.
it('refuses with no key and no answer file, and makes no request to the stand-in office', async () => {
  for (const [args, more] of [
    [[], {}],
    [['--even-so', 'A because is not a key.'], {}],
    [[], { MOLE_AGENT_KEY: '' }],
  ] as const) {
    const out = await remove([...args], tree, more)
    expect(out.code, out.output).toBe(1)
    expect(out.output).toContain("pass --answer <file>, or run where the run's key is")
    expect(out.output).toContain('Nothing was removed.')
    expect(existsSync(tree)).toBe(true)
  }
  expect(requests).toEqual([])
})

it('keeps a worktree with a fresh matching real-door answer file that counts an omitted reference', async () => {
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: 'synthetic-other-project', title: 'Synthetic other project' })
  t.api.createRecord({ workspaceId: 'synthetic-other-project', kind: 'module',
    title: 'Synthetic reference in another project', actor: t.api.HUMAN,
    data: { summaryBlocks: [{ id: 'held', type: 'image', path: join(tree, 'held.png'), alt: 'Synthetic file reference' }] } })
  const reply = await app.inject({ method: 'GET',
    url: `/api/report-files/named-inside?folder=${encodeURIComponent(realpathSync(tree))}`,
    headers: { 'x-mole-office-workspace': 'default' } })
  expect(reply.statusCode, reply.body).toBe(200)
  expect(reply.json()).toMatchObject({ folder: realpathSync(tree), records: [], hiddenCount: 1 })
  expect(reply.json().answeredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/)
  writeFileSync(answerFile, reply.body)
  const kept = await remove()
  expect(kept.code, kept.output).toBe(2)
  expect(kept.output).toContain(`Nothing was removed: 1 record names files inside ${realpathSync(tree)}, 0 you can read and 1 you may not.`)
  expect(existsSync(tree)).toBe(true)
  expect(git('-C', repository, 'worktree', 'list', '--porcelain')).toContain(tree)
  expect(requests).toEqual([])
})
