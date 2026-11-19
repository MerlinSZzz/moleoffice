// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FILE SEARCH READS ONLY THE RECORDS THAT HOLD A RUN OF THE FILE'S NAME, AND ANSWERS AS THE WHOLE WALK DID. Wave 13y
 * round 34, item 1.
 *
 * MEASURED FIRST, on 15 October 2026, on a copy of an office with 43,987 records, 16,179 of them in the project asked
 * in: one `GET /api/file` for a picture a record names took 0.65 to 0.78 s and read 338 MB, with the heap 330 MB higher
 * at its end; for a path nothing names, 1.15 to 1.23 s and 493 MB. Before it touches the file, the route looks for a
 * record that stores the path (`referencesTo` in src/server/api/files.ts), and for a path no record of the project
 * stores, for one in another project (`referencedElsewhere`). Each read every record it may see and walked its data.
 *
 * WHAT THIS HOLDS, through `GET /api/file`, with a stored path in each spelling that names the same file today:
 *   1. a record storing "<root>/a//double.png", "<root>/a/./dot.png" or "<root>/a/trailing.png/" authorises the file
 *      asked for without the extra slash or dot, and the file is served;
 *   2. so does a record whose stored text writes a letter of the file's name as a "\u" escape, in this project, and in
 *      another project it is still named in the refusal;
 *   3. so does a record storing a path whose last segment has no letter, digit, ".", "_" or "-" in it;
 *   4. the refusals are the ones the whole walk gave: a deleted record, a record that says another machine, a record
 *      in another project, prose that names the path, and nothing at all;
 *   5. for a file whose name has a run of those characters, the reads of records for one request hand back fewer rows
 *      than the 150 records in each project that store some other path, also when the first run of the name is a
 *      letter every record's text holds ("a long-name.png"). The rows are counted at the database: each
 *      statement prepared while the request runs that reads the `data` of `records` is wrapped, and the rows its reads
 *      give are added up.
 *
 * WHAT IT DOES NOT HOLD. How long a request takes; the times are in the round's report. The confinement of what is
 * served, which tests/file-preview.test.ts holds.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Response as LightMyRequestResponse } from 'light-my-request'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const PICTURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7, 7])
/** The records in each project that store a path no request here asks for. */
const OTHERS = 150

let t: TestDb
let app: FastifyInstance
let root = ''
const at = (name: string): string => join(root, name)
/** The id of the record each case expects to authorise its file. */
const by: Record<string, string> = {}

async function ask(path: string): Promise<LightMyRequestResponse> {
  return app.inject({ method: 'GET', url: `/api/file?path=${encodeURIComponent(path)}` })
}

/** A record straight into SQLite, so that its data can be any text and its project need not be this one. */
function insert(id: string, workspaceId: string, data: string, deleted = false): void {
  t.client.sqlite
    .prepare(
      `INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
       VALUES (?, ?, 'owner', '2026-10-15 09:00:00', '2026-10-15 09:00:00', 'note', ?, NULL, ?, ?, 'fixture')`,
    )
    .run(id, workspaceId, `A made-up note ${id}`, data, deleted ? '2026-10-15 09:30:00' : null)
}

const storing = (path: string, more: Record<string, unknown> = {}): string => JSON.stringify({ paths: [{ id: 'p', label: 'A made-up path', path, kind: 'image', ...more }] })

beforeAll(async () => {
  t = await freshDb()
  root = realpathSync(mkdtempSync(join(tmpdir(), 'mole-office-file-search-')))
  for (const name of ['a/double.png', 'a/dot.png', 'a/trailing.png', 'a/escaped.png', 'a/elsewhere-escaped.png', '图片/照片', 'a/deleted.png', 'a/orin.png', 'a/elsewhere.png', 'a/prose.png', 'a/nobody.png', 'a/a long-name.png']) {
    mkdirSync(dirname(at(name)), { recursive: true })
    writeFileSync(at(name), PICTURE)
  }

  insert((by['double'] = 'fs-double'), 'default', storing(`${root}/a//double.png`))
  insert((by['dot'] = 'fs-dot'), 'default', storing(`${root}/a/./dot.png`))
  insert((by['trailing'] = 'fs-trailing'), 'default', storing(`${root}/a/trailing.png/`))
  // "e" IS "e", written as JSON may write it. The stored text then does not hold "escaped.png".
  insert((by['escaped'] = 'fs-escaped'), 'default', storing(`${root}/a/escaped.png`).replace('escaped.png', '\\u0065scaped.png'))
  insert((by['no run'] = 'fs-no-run'), 'default', storing(`${root}/图片/照片`))
  insert('fs-deleted', 'default', storing(`${root}/a/deleted.png`), true)
  insert('fs-orin', 'default', storing(`${root}/a/orin.png`, { machine: 'orin' }))
  insert('fs-elsewhere', 'elsewhere', storing(`${root}/a/elsewhere.png`))
  insert('fs-elsewhere-escaped', 'elsewhere', storing(`${root}/a/elsewhere-escaped.png`).replace('elsewhere-escaped.png', 'elsewhere-\\u0065scaped.png'))
  insert((by['spaced'] = 'fs-spaced'), 'default', storing(`${root}/a/a long-name.png`))
  insert('fs-prose', 'default', JSON.stringify({ body: `Have a look at ${root}/a/prose.png when you get a moment.` }))
  for (let i = 0; i < OTHERS; i++) {
    insert(`fs-other-${String(i)}`, 'default', storing(`${root}/others/other-${String(i)}.dat`))
    insert(`fs-elsewhere-other-${String(i)}`, 'elsewhere', storing(`${root}/others/elsewhere-${String(i)}.dat`))
  }

  const files = await import('../src/server/api/files.ts')
  const http = await import('../src/server/lib/http.ts')
  app = Fastify({ logger: false })
  http.installErrorHandling(app)
  await app.register(files.fileRoutes, { prefix: '/api' })
  await app.ready()
  process.env.MOLE_OFFICE_PREVIEW_ROOTS = root
}, 60_000)

afterAll(async () => {
  delete process.env.MOLE_OFFICE_PREVIEW_ROOTS
  await app.close()
  rmSync(root, { recursive: true, force: true })
  t.close()
})

/** The rows the reads of records' `data` hand back while `act` runs. */
async function recordsReadDuring(act: () => Promise<unknown>): Promise<number> {
  type Statement = { all: (...args: unknown[]) => unknown[]; get: (...args: unknown[]) => unknown; iterate: (...args: unknown[]) => Iterable<unknown> }
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Statement }
  const original = sqlite.prepare
  let rows = 0
  sqlite.prepare = function (this: unknown, sql: string) {
    const statement = original.call(this, sql)
    if (!/"data"[\s\S]*from "records"/i.test(sql)) return statement
    const all = statement.all.bind(statement)
    const get = statement.get.bind(statement)
    const iterate = statement.iterate.bind(statement)
    statement.all = (...args) => {
      const got = all(...args)
      rows += got.length
      return got
    }
    statement.get = (...args) => {
      const got = get(...args)
      if (got !== undefined) rows += 1
      return got
    }
    statement.iterate = function* (...args) {
      for (const row of iterate(...args)) {
        rows += 1
        yield row
      }
    }
    return statement
  }
  try {
    await act()
  } finally {
    sqlite.prepare = original
  }
  return rows
}

function served(res: LightMyRequestResponse, record: string): void {
  expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
  expect(res.rawPayload.equals(PICTURE), 'the bytes are the file').toBe(true)
  expect(res.headers['x-mole-office-record']).toBe(record)
}

function refused(res: LightMyRequestResponse, status: number, says: RegExp): void {
  expect(res.statusCode, res.body.slice(0, 300)).toBe(status)
  expect(res.rawPayload.includes(PICTURE), 'no byte of the file').toBe(false)
  expect(String((JSON.parse(res.body) as { error?: unknown }).error)).toMatch(says)
}

describe('every spelling of a stored path that names the file today still names it', () => {
  it('1: "/a//double.png", "/a/./dot.png" and "/a/trailing.png/" each authorise the file without them', async () => {
    served(await ask(at('a/double.png')), by['double'] ?? '')
    served(await ask(at('a/dot.png')), by['dot'] ?? '')
    served(await ask(at('a/trailing.png')), by['trailing'] ?? '')
  })

  it('2: a stored text that writes a letter of the name as "\\u0065" still names the file, here and in another project', async () => {
    served(await ask(at('a/escaped.png')), by['escaped'] ?? '')
    refused(await ask(at('a/elsewhere-escaped.png')), 403, /in "elsewhere"/)
  })

  it('3: a last segment with no letter, digit, ".", "_" or "-" in it is found by the whole walk', async () => {
    served(await ask(at('图片/照片')), by['no run'] ?? '')
  })
})

describe('the refusals are the ones the whole walk gave', () => {
  it('4: deleted, another machine, another project, prose, and nothing', async () => {
    refused(await ask(at('a/deleted.png')), 403, /been deleted: "A made-up note fs-deleted" \(fs-deleted\)/)
    refused(await ask(at('a/orin.png')), 409, /says the file is on orin/)
    refused(await ask(at('a/elsewhere.png')), 403, /No record in this project points at .*, and one does in "elsewhere"/)
    refused(await ask(at('a/prose.png')), 403, /^No live record in this project points at/)
    refused(await ask(at('a/nobody.png')), 403, /^No live record in this project points at/)
  })
})

describe('the records read for one request', () => {
  it(`5: are fewer than the ${String(OTHERS)} records of each project that store another path`, async () => {
    for (const [name, status] of [['a/double.png', 200], ['a/a long-name.png', 200], ['a/nobody.png', 403], ['a/elsewhere.png', 403]] as const) {
      let res: LightMyRequestResponse | undefined
      const rows = await recordsReadDuring(async () => {
        res = await ask(at(name))
      })
      expect(res?.statusCode, name).toBe(status)
      expect(rows, `${name}: rows of records read`).toBeLessThan(OTHERS)
    }
  })
})
