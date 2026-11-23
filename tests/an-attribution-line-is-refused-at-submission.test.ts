// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ENTRY WHOSE COMMITS CARRY AN ATTRIBUTION LINE IS REFUSED AT SUBMISSION, AND THE REMINDER BEFORE THE SEAL NAMES IT.
 * Wave 13u, item 31.
 *
 * The merge tool refuses to push a landed commit whose message carries an attribution line (tools/merge-tool/push.mjs).
 * Until item 31 it found the line only after the entry had been tested
 * and landed. Now the queue reads every commit an entry brings when the entry is submitted, and the reminder before the
 * seal reads the same commits, both with the one pattern the push reads.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. A sealed run with a Co-Authored-By line in a commit that is not its tip is refused at POST /api/merge-queue with
 *      409, and nothing is written. The refusal names that commit and the line, and also an earlier round's commit on
 *      the branch with a Claude-Session line, because the queue reads every commit from the seal's base to its commit.
 *   2. The run's own first sealing write is answered with a reminder that names the same two commits and their lines.
 *      It names nothing about the clean tip.
 *
 * Every repository is made here in the system's temporary folder, every key is made up, and nothing reaches the live
 * office.
 */
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { aReportInForm } from './a-run-in-form.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const HANDLE = 'a-round-with-attribution-lines'
const REPOSITORY = 'fixture-attribution'
const A_CO_AUTHOR_LINE = 'Co-Authored-By: A made-up helper <helper@example.invalid>'
const A_SESSION_LINE = 'Claude-Session: a-made-up-session'

let t: TestDb
let app: FastifyInstance
const directories: string[] = []

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_THE_OFFICE_WORKER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'mole-office/the-message-worker',
  'x-mole-office-key': A_MADE_UP_OFFICE_KEY,
}

const asTheRun = (session: string, key: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': HANDLE,
  'x-mole-office-session': session,
  'x-mole-office-key': key,
})

const git = (dir: string, ...args: string[]): string => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()

/** Commit everything in `dir` with `message`, written at `at` when it is given, and answer the new commit. */
function commit(dir: string, file: string, words: string, message: string, at?: string): string {
  writeFileSync(join(dir, file), words)
  git(dir, 'add', '.')
  const date = at === undefined ? {} : { GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at }
  execFileSync('git', ['-C', dir, 'commit', '-q', '-F', '-'], { input: message, env: { ...process.env, ...date } })
  return git(dir, 'rev-parse', 'HEAD')
}

interface ARound { id: string; key: string; earlier: string; own: string; tip: string }

/**
 * A run of `HANDLE` on a made-up branch: an earlier round's commit written before the run started, then two commits of
 * the run's own, the second of them the tip. `messages` are the three commits' messages, oldest first.
 */
async function aRound(messages: readonly [string, string, string]): Promise<ARound> {
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-attribution-'))
  directories.push(dir)
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.name', 'Synthetic attribution test')
  git(dir, 'config', 'user.email', 'attribution@example.invalid')
  git(dir, 'config', 'commit.gpgsign', 'false')
  mkdirSync(join(dir, 'work'))
  const base = commit(dir, 'work/a.txt', 'before\n', 'Synthetic base')
  git(dir, 'switch', '-qc', 'worker')
  // AN EARLIER ROUND'S COMMIT, carried on the branch: written in 2020, so it is before this run started.
  const earlier = commit(dir, 'work/b.txt', 'earlier\n', messages[0], '2020-01-01T00:00:00Z')
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_OFFICE_WORKER,
    payload: {
      kind: 'session',
      title: 'Synthetic run with attribution lines',
      data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: HANDLE, doing: 'sealing', workingDirectory: dir, cutFrom: 'main', tip: base },
    },
  })
  expect(filed.statusCode, filed.body.slice(0, 300)).toBe(201)
  const body = filed.json() as { record: { id: string }; runKey?: { key?: string } }
  const key = String(body.runKey?.key)
  expect(key, 'the office minted the run no key, so this file would prove nothing').toMatch(/^[0-9a-f]{64}$/)
  const own = commit(dir, 'work/a.txt', 'after\n', messages[1])
  const tip = commit(dir, 'work/c.txt', 'tip\n', messages[2])
  return { id: body.record.id, key, earlier, own, tip }
}

type TheReminder = { sealed: boolean; items: { key: string; about: string; says: string }[]; notChecked: string[] }

/** The run's own first sealing write, answered with the reminder, and the same write again, which seals. The run's report is in form. */
async function sealIt(round: ARound): Promise<TheReminder> {
  await aReportInForm(t, round.id, HANDLE)
  const payload = { dataPatch: { state: 'finished', tip: round.tip } }
  const first = await app.inject({ method: 'PATCH', url: `/api/records/${round.id}`, headers: asTheRun(round.id, round.key), payload })
  expect(first.statusCode, first.body.slice(0, 600)).toBe(200)
  const reminded = (first.json() as { beforeTheSeal?: TheReminder }).beforeTheSeal
  expect(reminded?.sealed, 'the first write was not reminded, so the reminder was not asked').toBe(false)
  const second = await app.inject({ method: 'PATCH', url: `/api/records/${round.id}`, headers: asTheRun(round.id, round.key), payload })
  expect(second.statusCode, second.body.slice(0, 600)).toBe(200)
  expect(t.api.getRecord(round.id)!.data['sealedTip'], 'the run was not sealed').toEqual(expect.any(String))
  return reminded!
}

async function submit(run: string) {
  const r = await app.inject({ method: 'POST', url: '/api/merge-queue', headers: AS_THE_PERSON, payload: { run, changeset: { adapter: 'git', repository: REPOSITORY } } })
  return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
}

function mergeEntryCount(): number {
  return (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'merge_entry'").get() as { n: number }).n
}

const theItemsNaming = (reminded: TheReminder, commit: string) => reminded.items.filter((one) => one.about === 'commit' && one.says.includes(commit.slice(0, 9)))

beforeAll(async () => {
  t = await freshDb()
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: HANDLE, name: HANDLE, role: 'worker', runtime: 'claude-code', workArea: ['work'] } })
  expect(registered.statusCode, registered.body.slice(0, 300)).toBe(201)
  const checkout = mkdtempSync(join(tmpdir(), 'mole-office-attribution-checkout-'))
  directories.push(checkout)
  const { registerRepository } = await import('../src/server/lib/repositories.ts')
  registerRepository({ workspaceId: 'default', name: REPOSITORY, root: realpathSync(checkout), actor: { type: 'human', id: THE_PERSON } })
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
})

describe('an attribution line in a commit an entry brings', () => {
  it('1 and 2: is named by the reminder before the seal, and refuses the submission, naming each commit and its line', async () => {
    const round = await aRound([
      `Synthetic earlier round\n\nIts body.\n${A_SESSION_LINE}\n`,
      `Synthetic own commit\n\nIts body.\n${A_CO_AUTHOR_LINE}\n`,
      'Synthetic clean tip\n',
    ])

    // 2. THE REMINDER names both commits and their lines, the earlier round's as well as the run's own, and not the tip.
    const reminded = await sealIt(round)
    const own = theItemsNaming(reminded, round.own)
    expect(own, JSON.stringify(reminded.items)).toHaveLength(1)
    expect(own[0]!.says).toContain(A_CO_AUTHOR_LINE)
    expect(own[0]!.says).toContain('Synthetic own commit')
    const earlier = theItemsNaming(reminded, round.earlier)
    expect(earlier, JSON.stringify(reminded.items)).toHaveLength(1)
    expect(earlier[0]!.says).toContain(A_SESSION_LINE)
    expect(theItemsNaming(reminded, round.tip)).toEqual([])

    // 1. THE SUBMISSION is refused before anything is written, and the refusal names each commit and its line.
    const before = mergeEntryCount()
    const refused = await submit(round.id)
    expect(refused.status, refused.raw).toBe(409)
    const says = String(refused.body['error'])
    expect(says).toContain(round.own.slice(0, 9))
    expect(says).toContain(A_CO_AUTHOR_LINE)
    expect(says).toContain(round.earlier.slice(0, 9))
    expect(says).toContain(A_SESSION_LINE)
    expect(says).not.toContain(round.tip.slice(0, 9))
    expect(says).toContain('Nothing was written.')
    expect(mergeEntryCount()).toBe(before)
  })
})

// ============================================================================ 4. one pattern

type Node = { type: string; [key: string]: unknown }
const isNode = (value: unknown): value is Node => typeof value === 'object' && value !== null && typeof (value as Node).type === 'string'

function walk(node: Node, visit: (node: Node) => void): void {
  visit(node)
  for (const value of Object.values(node)) {
    for (const child of Array.isArray(value) ? value : [value]) if (isNode(child)) walk(child, visit)
  }
}

/** Every source file under a folder, as a path from the checkout's root. */
function sourcesUnder(folder: string): string[] {
  return readdirSync(join(ROOT, folder)).flatMap((name) => {
    const path = `${folder}/${name}`
    if (statSync(join(ROOT, path)).isDirectory()) return name === 'node_modules' ? [] : sourcesUnder(path)
    return /\.(ts|tsx|mjs|js)$/u.test(name) ? [path] : []
  })
}

