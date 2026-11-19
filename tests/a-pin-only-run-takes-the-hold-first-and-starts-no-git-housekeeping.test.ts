// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PIN-ONLY RUN OF THE MERGE TOOL TAKES THE ENTRY'S HOLD BEFORE IT DOES ANYTHING, AND EVERY GIT COMMAND IT RUNS
 * CARRIES `-c gc.auto=0`.
 *
 * Two of the merge tool keeper's conditions for `--pin-only` (message yf17WKvB1SCR), which tests/the-merger.test.ts did
 * not reach:
 *   - the entry's hold comes first (tools/the-merger.mjs, takeTheEntrysHold in tools/merge-tool/office-keeper.mjs), so
 *     no request reaches the office and no git command runs before the hold names this run, and a second run started
 *     while the first holds the entry is refused and asks the office nothing;
 *   - a pin-only run works in the lane's root while another entry's run may work there, so every git command it runs
 *     starts with `-c gc.auto=0` (tools/merge-tool/git.mjs).
 *
 * tools/the-merger.mjs is run as a separate process, as the message worker runs it, against a stand-in office on a
 * loopback port that answers only what a pin-only run asks, and writes down who asked and whether the hold was there
 * yet. A stand-in git, first on the run's PATH, writes down each git command and whether the hold was there, and then
 * runs the real git. Everything here is synthetic: the repository, the entry, the seal and the office's answers.
 * MUTATION PROOFS: kept with the round's report.
 */

import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'the-merger.mjs')
const ENDED = 'MOLE-OFFICE-MERGE-TOOL-ENDED '
const REAL_GIT = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim()

let scratch: string
let office: Server
let api: string

/** One request the stand-in office received, with the holds that were in the entry's workdir when it came. */
interface Asked {
  session: string
  method: string
  url: string
  holds: { file: string; session: string; pid: number }[]
}

/** A synthetic entry the stand-in office serves. */
interface Entry {
  id: string
  root: string
  base: string
  commit: string
  sealed: { path: string; hash: string }[]
  state: 'submitted' | 'pinned'
  asked: Asked[]
  /** A session whose first read of the entry the office answers only when the test lets it go. */
  heldBack: { session: string; arrived: boolean; letGo: () => void; gate: Promise<void> } | null
}

const entries = new Map<string, Entry>()
const workdirOf = (id: string) => join(scratch, 'work', id)
const gitLogOf = (id: string) => join(scratch, `git-calls-${id}.log`)

function holdsIn(id: string): Asked['holds'] {
  const folder = join(workdirOf(id), 'holds')
  if (!existsSync(folder)) return []
  return readdirSync(folder)
    .filter((one) => /^[0-9]+\.json$/.test(one))
    .sort()
    .map((file) => {
      const held = JSON.parse(readFileSync(join(folder, file), 'utf8')) as { session: string; pid: number }
      return { file, session: held.session, pid: held.pid }
    })
}

function git(dir: string, ...args: string[]): string {
  return execFileSync(REAL_GIT, ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

/** A synthetic repository with a base commit and an entry's commit on top of it, and the entry the office serves. */
function anEntry(id: string): Entry {
  const root = join(scratch, `repo-${id}`)
  mkdirSync(join(root, 'src'), { recursive: true })
  git(root, 'init', '-q', '-b', 'main')
  git(root, 'config', 'user.email', 'fixture@example.invalid')
  git(root, 'config', 'user.name', 'Synthetic pin-only fixture')
  writeFileSync(join(root, 'src', 'a.txt'), 'a\n')
  git(root, 'add', '-A')
  git(root, 'commit', '-q', '-m', 'Synthetic base')
  const base = git(root, 'rev-parse', 'HEAD')
  git(root, 'switch', '-q', '-c', 'work')
  writeFileSync(join(root, 'src', 'b.txt'), 'b by the synthetic entry\n')
  git(root, 'add', '-A')
  git(root, 'commit', '-q', '-m', 'Synthetic entry')
  const commit = git(root, 'rev-parse', 'HEAD')
  git(root, 'switch', '-q', 'main')
  const entry: Entry = {
    id,
    root,
    base,
    commit,
    sealed: [{ path: 'src/b.txt', hash: createHash('sha256').update('b by the synthetic entry\n').digest('hex') }],
    state: 'submitted',
    asked: [],
    heldBack: null,
  }
  entries.set(id, entry)
  // THE STAND-IN GIT: it writes whether the hold was there and the whole command, then runs the real git.
  const bin = join(scratch, `bin-${id}`)
  mkdirSync(bin, { recursive: true })
  writeFileSync(
    join(bin, 'git'),
    [
      '#!/bin/sh',
      `if [ -e '${join(workdirOf(id), 'holds', '1.json')}' ]; then held=held; else held=not-held; fi`,
      `printf '%s %s\\n' "$held" "$*" >> '${gitLogOf(id)}'`,
      `exec '${REAL_GIT}' "$@"`,
      '',
    ].join('\n'),
  )
  chmodSync(join(bin, 'git'), 0o755)
  return entry
}

const gitCallsOf = (id: string) => (existsSync(gitLogOf(id)) ? readFileSync(gitLogOf(id), 'utf8').split('\n').filter((one) => one !== '') : [])

function answer(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function theEntryAsTheOfficeReadsIt(entry: Entry) {
  return {
    id: entry.id,
    state: entry.state,
    lane: entry.root,
    waitsOn: entry.state === 'pinned' ? 'Synthetic: the inspector' : 'Synthetic: the merge tool',
    seal: { id: `synthetic-seal-${entry.id}` },
    changeset: { adapter: 'git', root: entry.root, base: entry.base, commit: entry.commit, branch: 'work' },
  }
}

/** THE STAND-IN OFFICE: the five requests a pin-only run of a git entry makes, and nothing else. */
async function startTheOffice(): Promise<void> {
  office = createServer(async (req, res) => {
    for await (const _chunk of req) {
      // The body is not read: the stand-in answers by the path.
    }
    const url = req.url ?? '/'
    const session = String(req.headers['x-mole-office-session'] ?? '')
    const match = /^\/api\/(merge-queue|records)\/([^/?]+)(?:\/([a-z-]+))?$/.exec(url)
    const id = match === null ? '' : decodeURIComponent(match[2]!).replace(/^synthetic-seal-/, '')
    const entry = entries.get(id)
    if (match === null || entry === undefined) return answer(res, 404, { error: `Synthetic: the stand-in office does not serve ${req.method ?? ''} ${url}.` })
    entry.asked.push({ session, method: req.method ?? '', url, holds: holdsIn(id) })
    if (match[1] === 'records' && req.method === 'GET') {
      return answer(res, 200, { record: { id: `synthetic-seal-${id}`, data: { seal: { git: { commit: entry.commit, files: entry.sealed } } } } })
    }
    if (req.method === 'GET' && match[3] === undefined) {
      const back = entry.heldBack
      if (back !== null && back.session === session && !back.arrived) {
        back.arrived = true
        await back.gate
      }
      return answer(res, 200, { entry: theEntryAsTheOfficeReadsIt(entry) })
    }
    if (req.method === 'POST' && match[3] === 'step') {
      entry.state = 'pinned'
      return answer(res, 200, { decided: 'Synthetic: the stand-in office took the pinned step.' })
    }
    if (req.method === 'POST' && (match[3] === 'tool-started' || match[3] === 'tool-ended')) return answer(res, 200, {})
    return answer(res, 404, { error: `Synthetic: the stand-in office does not serve ${req.method ?? ''} ${url}.` })
  })
  await new Promise<void>((resolve) => office.listen(0, '127.0.0.1', resolve))
  api = `http://127.0.0.1:${String((office.address() as AddressInfo).port)}`
}

interface Run {
  code: number | null
  out: string
  err: string
  pid: number
  session: string
}

const groups = new Set<number>()

function startAPinOnlyRun(entry: Entry, session: string): { pid: number; done: Promise<Run> } {
  const child = spawn(
    process.execPath,
    [TOOL, '--pin-only', '--entry', entry.id, '--session', session, '--api', api, '--workspace', 'default', '--workdir', workdirOf(entry.id), '--office-for', '30'],
    {
      cwd: REPO,
      env: { ...process.env, PATH: `${join(scratch, `bin-${entry.id}`)}:${process.env['PATH'] ?? ''}`, MOLE_OFFICE_API: api, MOLE_OFFICE_DB: join(scratch, 'no-office.db') },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  groups.add(child.pid!)
  let out = ''
  let err = ''
  child.stdout!.on('data', (chunk: Buffer) => (out += chunk.toString()))
  child.stderr!.on('data', (chunk: Buffer) => (err += chunk.toString()))
  const done = new Promise<Run>((resolve) => {
    child.on('close', (code) => {
      groups.delete(child.pid!)
      resolve({ code, out, err, pid: child.pid!, session })
    })
  })
  return { pid: child.pid!, done }
}

function endingOf(run: Run): { ok: boolean; says: string } {
  const last = run.out.trim().split('\n').at(-1) ?? ''
  expect(last.startsWith(ENDED), `exit ${String(run.code)}:\n${run.out}${run.err}`).toBe(true)
  return JSON.parse(last.slice(ENDED.length)) as { ok: boolean; says: string }
}

async function until(what: string, check: () => boolean, ms = 60_000): Promise<void> {
  const from = Date.now()
  while (!check()) {
    if (Date.now() - from > ms) throw new Error(`waited ${String(ms)} ms for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'a-pin-only-run-'))
  mkdirSync(dirname(workdirOf('x')), { recursive: true })
  await startTheOffice()
})

afterAll(async () => {
  for (const group of groups) {
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // Gone already.
    }
  }
  await new Promise<void>((resolve) => office?.close(() => resolve()))
  if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true })
})

describe('a pin-only run of the merge tool', () => {
  it('takes the hold before it asks the office anything or runs git, and a second run started meanwhile is refused and asks nothing', async () => {
    const entry = anEntry('synthetic-pin-hold')
    let letGo = () => {}
    const gate = new Promise<void>((resolve) => (letGo = resolve))
    entry.heldBack = { session: 'synthetic-session-first', arrived: false, letGo, gate }
    const first = startAPinOnlyRun(entry, 'synthetic-session-first')
    // THE FIRST RUN IS KEPT ALIVE: the office answers its first read of the entry only when the test lets it go.
    await until("the first run's first read of the entry", () => entry.heldBack!.arrived)
    const firstHold = { file: '1.json', session: 'synthetic-session-first', pid: first.pid }
    expect(entry.asked).toEqual([{ session: 'synthetic-session-first', method: 'GET', url: `/api/merge-queue/${entry.id}`, holds: [firstHold] }])
    expect(gitCallsOf(entry.id), 'the first run ran git before its first read').toEqual([])

    const second = await startAPinOnlyRun(entry, 'synthetic-session-second').done
    expect(second.code, second.out + second.err).toBe(1)
    expect(endingOf(second)).toEqual({
      ok: false,
      says: `The merge tool could not go on: Merge tool run synthetic-session-first (process ${String(first.pid)}) holds merge entry ${entry.id} and is still running, so this run touched neither the entry nor its sandbox.`,
    })
    expect(entry.asked.filter((one) => one.session !== 'synthetic-session-first'), 'the refused run asked the office').toEqual([])
    expect(gitCallsOf(entry.id), 'the refused run ran git').toEqual([])
    expect(holdsIn(entry.id)).toEqual([firstHold])

    entry.heldBack!.letGo()
    const firstRun = await first.done
    expect(firstRun.code, firstRun.out + firstRun.err).toBe(0)
    expect(endingOf(firstRun).says).toContain(`merge entry ${entry.id} is now pinned`)
    expect(entry.asked.map((one) => `${one.method} ${one.url.replace(entry.id, 'E')}`)).toEqual([
      'GET /api/merge-queue/E',
      'POST /api/merge-queue/E/tool-started',
      'GET /api/records/synthetic-seal-E',
      'POST /api/merge-queue/E/step',
      'GET /api/merge-queue/E',
      'POST /api/merge-queue/E/tool-ended',
    ])
    expect(entry.asked.every((one) => one.session === 'synthetic-session-first' && JSON.stringify(one.holds) === JSON.stringify([firstHold]))).toBe(true)
    expect(gitCallsOf(entry.id).length).toBeGreaterThan(0)
    expect(gitCallsOf(entry.id).filter((one) => !one.startsWith('held ')), 'a git command ran before the hold').toEqual([])
  }, 120_000)

  it('runs every git command with -c gc.auto=0', async () => {
    const entry = anEntry('synthetic-pin-gc')
    const run = await startAPinOnlyRun(entry, 'synthetic-session-gc').done
    expect(run.code, run.out + run.err).toBe(0)
    expect(entry.state).toBe('pinned')
    const calls = gitCallsOf(entry.id)
    // THE RUN DID ITS GIT WORK: it read the sealed file from the commit and wrote the pinned ref.
    expect(calls.some((one) => one.includes(`cat-file blob ${entry.commit}:src/b.txt`))).toBe(true)
    expect(calls.some((one) => one.includes(`update-ref refs/mole-office/queue/${entry.id} ${entry.commit}`))).toBe(true)
    expect(calls.filter((one) => !one.startsWith(`held -c gc.auto=0 -C ${entry.root} `)), 'a git command without -c gc.auto=0').toEqual([])
    expect(git(entry.root, 'rev-parse', `refs/mole-office/queue/${entry.id}`)).toBe(entry.commit)
  }, 120_000)
})
