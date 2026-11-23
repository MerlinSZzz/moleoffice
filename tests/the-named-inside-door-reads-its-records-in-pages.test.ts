// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE NAMED-INSIDE DOOR READS ITS RECORDS WHOLE IN PAGES, and its answer is the answer of one read.
 *
 * GET /api/report-files/named-inside reads the ids of the records that could name the folder first, and then the records
 * whole, NAMED_INSIDE_PAGE_SIZE at a time, so that one ask cannot fill the heap. Here the folder is the top of a real git
 * repository in a temporary folder, and more than two pages of synthetic records name it, read by id from the index of the
 * records' text. In the order the door lists them they are, by place:
 *   · a run's starter session on the first page, which names the folder only in its start lines about a run that has
 *     ended, so it is left out. The ended run's own session is the last record of the last page, so the door must know
 *     every ended run before it reads the first page;
 *   · reports in this project that store a path the commit holds, so they are listed. One of them is the first record of
 *     the second page, exactly on a page's edge;
 *   · reports in another project that store the same path, and reports here whose prose names a path that is no longer
 *     there, so they are counted;
 *   · a message the caller may not read, beside the record on the edge, so it is counted.
 * The case checks the whole answer, and that each record is read whole once, in the order listed, by statements that
 * hand back at most one page.
 *
 * THE MUTATIONS IT IS TO BE PROVED AGAINST, each in the route in src/server/api/reportfiles.ts, run alone and put back:
 *   (1) a page is dropped: the loop over the pages starts at `NAMED_INSIDE_PAGE_SIZE` and not at 0;
 *   (2) a record is read twice: each page's slice ends at `at + NAMED_INSIDE_PAGE_SIZE + 1`, so the record on the edge
 *       is read again;
 *   (3) the ended runs are worked out from the first page alone: theEndedRunsThatWorkedIn is given
 *       `readable.slice(0, NAMED_INSIDE_PAGE_SIZE)`, so the starter is counted and not left out.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { localStamp } from '../src/shared/time.ts'
import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const ELSEWHERE = 'paged-hidden-project'
const headers = { 'x-mole-office-workspace': WORKSPACE }
let t: TestDb
let app: FastifyInstance
let root: string

function git(...args: string[]): string {
  const result = spawnSync('git', args, { encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_NAME: 'Test builder', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test builder', GIT_COMMITTER_EMAIL: 'test@example.invalid' } })
  if (result.status !== 0) throw new Error(result.stderr)
  return result.stdout.trim()
}

async function register(handle: string): Promise<string> {
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle, name: handle, role: 'worker' } })
  expect(made.statusCode, made.body).toBe(201)
  return (made.json() as { agent: { id: string } }).agent.id
}

function aReport(title: string, data: Record<string, unknown>, workspaceId = WORKSPACE): string {
  const row = t.api.createRecord({ workspaceId, kind: 'report', title, actor: t.api.HUMAN })
  writeDataBypassingTheGate(t, row.id, data)
  return row.id
}

function aSession(title: string, data: Record<string, unknown>): string {
  const row = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'session', title, origin: 'fixture', data: { state: 'running', runtime: 'claude-code' }, actor: t.api.HUMAN })
  writeDataBypassingTheGate(t, row.id, { ...row.data, ...data })
  return row.id
}

/**
 * The door's answer for `folder`, asked by `agent`, with the ids among `watched` that each statement reading records whole
 * handed back while it answered.
 */
async function askAndWatch(folder: string, agent: string, watched: ReadonlySet<string>): Promise<{ status: number; body: string; pages: string[][] }> {
  const columns = (t.client.sqlite.prepare('PRAGMA table_info(records)').all() as { name: string }[]).map((one) => `"${one.name}"`)
  const pages: string[][] = []
  const prepare = t.client.sqlite.prepare.bind(t.client.sqlite)
  const spy = vi.spyOn(t.client.sqlite, 'prepare').mockImplementation(((source: string) => {
    const statement = prepare(source)
    const selected = /^select (.*?) from "records"/i.exec(source)?.[1]?.split(', ')
    if (selected !== undefined && columns.every((column) => selected.includes(column))) {
      const at = selected.indexOf('"id"')
      const real = statement.all.bind(statement) as (...values: unknown[]) => unknown[]
      ;(statement as unknown as Record<string, unknown>).all = (...values: unknown[]) => {
        const rows = real(...values)
        pages.push(rows.map((row) => String(Array.isArray(row) ? row[at] : (row as { id: string }).id)).filter((id) => watched.has(id)))
        return rows
      }
    }
    return statement
  }) as never)
  try {
    const reply = await app.inject({ method: 'GET', url: `/api/report-files/named-inside?folder=${encodeURIComponent(folder)}`,
      headers: { ...headers, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': agent } })
    return { status: reply.statusCode, body: reply.body, pages: pages.filter((page) => page.length > 0) }
  } finally {
    spy.mockRestore()
  }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: ELSEWHERE, title: 'Synthetic project the caller does not read' })
  root = realpathSync(mkdtempSync(join(tmpdir(), 'named-inside-in-pages-')))
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(root, { recursive: true, force: true })
})

it('reads more than two pages once each, at most a page at a time, and answers as one read would', async () => {
  // Imported here, after freshDb() has named the test database: the route's module opens the database when it loads.
  const { NAMED_INSIDE_PAGE_SIZE: PAGE } = await import('../src/server/api/reportfiles.ts')
  const folder = join(root, 'paged-tree')
  mkdirSync(folder)
  writeFileSync(join(folder, 'kept.txt'), 'Synthetic tracked file.\n')
  git('init', '-q', folder)
  git('-C', folder, 'add', '--', '.')
  git('-C', folder, 'commit', '-q', '-m', 'Synthetic root')
  const head = git('-C', folder, 'rev-parse', 'HEAD')
  await register('paged-sender')
  const recipient = await register('paged-recipient')
  await register('paged-stranger')

  const kept = `${folder}/kept.txt`
  const theBlock = { blocks: [{ id: 'evidence', type: 'image', path: kept, alt: 'Synthetic evidence' }] }
  const count = 2 * PAGE + 2
  const theEdge = PAGE
  const ended = aSession('Synthetic ended run', { state: 'crashed', workingDirectory: folder })
  const starter = aSession('Synthetic starter', {
    workingDirectory: join(root, 'the-starter'),
    workerRuns: { 'paged-worker': {
      state: 'started', handle: 'paged-worker', started: { at: '2026-10-17 15:00:00', run: ended, runKeyId: 'synthetic-key' },
      starting: { at: '2026-10-17 14:59:00', cutSays: `The worktree ${folder} was there already, so it is used as it stands.` },
      launcher: { at: '2026-10-17 15:30:00', ok: true, says: `The launcher started a run in ${folder}.` },
    } },
  })
  const message = t.api.createRecord({ workspaceId: WORKSPACE, kind: 'message', title: 'Synthetic private picture',
    actor: { type: 'agent', id: 'paged-sender' }, data: { body: 'Only the recipient may read this.', to: [{ kind: 'agent', id: recipient }] } })
  writeDataBypassingTheGate(t, message.id, { ...message.data, pictures: [{ id: 'private-picture', type: 'image', path: kept, alt: 'Private' }] })

  const listed: string[] = []
  const inOrder: string[] = []
  let elsewhere = 0
  let prose = 0
  for (let place = 0; place < count; place += 1) {
    let id: string
    if (place === 0) id = starter
    else if (place === count - 1) id = ended
    else if (place === theEdge + 1) id = message.id
    else if (place === theEdge || place % 3 === 0) {
      id = aReport(`Synthetic listed report ${String(place)}`, theBlock)
      listed.push(id)
    } else if (place % 3 === 1) {
      id = aReport(`Synthetic report in another project ${String(place)}`, theBlock, ELSEWHERE)
      elsewhere += 1
    } else {
      id = aReport(`Synthetic prose report ${String(place)}`, { blocks: [{ id: 'note', type: 'text', text: `Synthetic: the log was ${folder}/gone.txt.` }] })
      prose += 1
    }
    // Each record is a second older than the one before it, so the door lists them in this order.
    t.client.sqlite.prepare('UPDATE records SET updated_at = ? WHERE id = ?').run(localStamp(new Date(2026, 0, 15, 12, 0, -place)), id)
    inOrder.push(id)
  }
  expect(listed, 'the record on the edge is not listed').toContain(inOrder[theEdge])

  const reply = await askAndWatch(folder, 'paged-stranger', new Set(inOrder))
  expect(reply.status, reply.body).toBe(200)
  const hiddenCount = elsewhere + prose + 1
  const aStartLine = `a start line about run ${ended}, which has ended (crashed) and worked in this folder`
  expect(JSON.parse(reply.body)).toEqual({
    folder,
    records: listed.map((id) => ({ id, kind: 'report', title: t.api.getRecord(id)!.title,
      paths: [{ where: 'data.blocks[#evidence].path', path: kept }], names: 'trackedFilesOnly' })),
    hiddenCount,
    hiddenCiters: { notCompared: 0, anotherPath: 0, aPathNotThere: prose, trackedFilesOnly: elsewhere + 1, theFolderOnly: 0 },
    comparedWith: head,
    notComparedBecause: null,
    narrowedByPermission: null,
    leftOut: [
      { id: starter, kind: 'session', title: 'Synthetic starter', setAside: [
        { where: 'data.workerRuns.paged-worker.starting.cutSays', rule: aStartLine },
        { where: 'data.workerRuns.paged-worker.launcher.says', rule: aStartLine },
      ] },
      { id: ended, kind: 'session', title: 'Synthetic ended run', setAside: [
        { where: 'data.workingDirectory', rule: `run ${ended} has ended (crashed) and this folder is its working directory` },
      ] },
    ],
    scope: expect.stringContaining('Readable live records in this project name their stored paths.'),
    answeredAt: expect.any(String),
    says: `${String(listed.length)} readable records list files inside ${folder}; ` +
      `${String(hiddenCount)} other live records name the folder or a path inside it; ` +
      'leftOut lists 2 readable records that name it only in places a rule sets aside.',
  })
  expect(reply.pages.filter((page) => page.length > PAGE), 'statements that read more than a page whole').toEqual([])
  expect(reply.pages.flat(), 'the records here read whole, in order').toEqual(inOrder)
})
