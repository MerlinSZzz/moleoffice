// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SLOW NAMED-INSIDE CALL SAYS WHICH PART TOOK THE TIME.
 *
 * GET /api/report-files/named-inside runs on the thread that answers every request, and one call on the live office took
 * 15.4 s. Nobody could say which part took the time. A call of NAMED_INSIDE_SLOW_MS (1 s) or more now writes one warning
 * to the server's log. The warning gives the folder's last segment, the total, and the time of each part: finding the
 * records that could name the folder, narrowing them to this project and this reader, the pages read whole without the
 * comparison, and the comparison with git. It also gives the rest, so the parts add up to the total. Every time is a
 * whole number of milliseconds. A faster call writes no line, and so does a refused one. The answer does not change.
 *
 * HOW THE CLOCK IS MOVED. Every case goes through the real door with `app.inject` and reads the line from the
 * `logStream` that `buildApp` takes, so each case proves the line reaches the server's log. While a case asks,
 * `performance.now` answers from a clock this file holds. The clock moves only inside the parts:
 *   · finding: in `theRecordsThatMayHoldOneOf`;
 *   · narrowing: in `theMessagesHiddenFrom`;
 *   · a page: in each statement after that one that reads records whole, where the paging test watches the pages;
 *   · the comparison: in `theWorktreeAsGitHoldsIt`, once, and in `theFirstClassOf`, once for each record compared;
 *   · making the answer: in `clockStamp`.
 * So each part's time is known before the call. No case waits, and none depends on the machine being slow. The door
 * is not split into a function that takes a clock, because one case would still have to go through the real door to
 * reach the log, and the door stays as it was apart from its clock reads. records.ts is not mocked. It re-exports values
 * that change while the office runs, and a mock's copy of the module would freeze them. So a page is moved at its
 * statement instead.
 *
 * THE MUTATIONS IT MUST GO RED FOR, each alone in src/server/api/reportfiles.ts:
 *   (1) the limit compared with `>`: "one line for a call of exactly the limit";
 *   (2) a line for a fast call, the limit's test taken out: "no line for a fast call";
 *   (3) the fallback reported as the index's: "names the fallback";
 *   (4) the comparison counted inside the pages, the pages' time taken as the whole span of the loop: "times the
 *       comparison with git apart from the pages";
 *   (5) a part left out of the line, such as narrowing: "one warning for a slow call";
 *   (6) a time written with its fraction, the clock read without rounding down to a whole millisecond: "every time a
 *       whole number";
 *   (7) a second segment, a record id, a title, a stored path, the project, the agent or the session in the line,
 *       such as the folder written whole: "nothing else of the path";
 *   (8) a line for a refused call, the warning written in a `finally` around the whole door: "no line for a refused
 *       call";
 *   (9) the line written before the answer is made: "one warning for a slow call", whose rest is the time making it;
 *  (10) the line written at info and not as a warning: "one warning for a slow call";
 *  (11) the pages or the records miscounted, such as a page counted for each record: "one warning for a slow call"
 *       and "names the fallback";
 *  (12) a worktree said to be looked for when no record was compared: "no worktree looked for";
 *  (13) the root written as an empty segment: "names the fallback".
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'

/** How far each part moves the clock on one call, in milliseconds. */
interface Moves {
  finding: number
  narrowing: number
  page: number
  git: number
  eachClass: number
  answer: number
}

const STILL: Moves = { finding: 0, narrowing: 0, page: 0, git: 0, eachClass: 0, answer: 0 }

/**
 * THE CLOCK THE DOOR READS WHILE A CASE ASKS, and how far each part moves it. `narrowed` says the door has narrowed, so a
 * statement reading records whole after it is a page.
 */
const theClock = vi.hoisted(() => ({
  now: 1_000,
  narrowed: false,
  // True: the index gives no ids, as it does past the door's own number. That number is 50,000, too many records to
  // write in a test, so the mock gives what the index gives past it.
  noIds: false,
  moves: { finding: 0, narrowing: 0, page: 0, git: 0, eachClass: 0, answer: 0 },
}))

vi.mock('../src/server/lib/record-text-index.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/server/lib/record-text-index.ts')>()
  return {
    ...real,
    theRecordsThatMayHoldOneOf: (...args: Parameters<typeof real.theRecordsThatMayHoldOneOf>) => {
      theClock.now += theClock.moves.finding
      return theClock.noIds ? undefined : real.theRecordsThatMayHoldOneOf(...args)
    },
  }
})

vi.mock('../src/server/lib/messages.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/server/lib/messages.ts')>()
  return {
    ...real,
    theMessagesHiddenFrom: (...args: Parameters<typeof real.theMessagesHiddenFrom>) => {
      theClock.now += theClock.moves.narrowing
      const hidden = real.theMessagesHiddenFrom(...args)
      theClock.narrowed = true
      return hidden
    },
  }
})

vi.mock('../src/server/lib/what-a-record-names-inside.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/server/lib/what-a-record-names-inside.ts')>()
  return {
    ...real,
    theWorktreeAsGitHoldsIt: (...args: Parameters<typeof real.theWorktreeAsGitHoldsIt>) => {
      theClock.now += theClock.moves.git
      return real.theWorktreeAsGitHoldsIt(...args)
    },
    theFirstClassOf: (...args: Parameters<typeof real.theFirstClassOf>) => {
      theClock.now += theClock.moves.eachClass
      return real.theFirstClassOf(...args)
    },
  }
})

vi.mock('../src/shared/time.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/shared/time.ts')>()
  return {
    ...real,
    clockStamp: (...args: Parameters<typeof real.clockStamp>) => {
      theClock.now += theClock.moves.answer
      return real.clockStamp(...args)
    },
  }
})

/** Pino's number for a warning. */
const WARN = 40

/** How the line begins, so it is told from every other line of the server's log. */
const THE_LINE_BEGINS = 'The named-inside door took '

/**
 * A PLACE FOR THE LOG LINES TO LAND, as tests/a-slow-request-says-so-in-the-log.test.ts keeps one, with each line's level
 * as well as its words.
 */
class RecordingStream {
  private readonly whole: string[] = []
  private waiting = ''

  write(msg: string): void {
    this.waiting += msg
    let end = this.waiting.indexOf('\n')
    while (end !== -1) {
      const line = this.waiting.slice(0, end)
      this.waiting = this.waiting.slice(end + 1)
      if (line.trim() !== '') this.whole.push(line)
      end = this.waiting.indexOf('\n')
    }
  }

  /** The level and `msg` of every line written so far, oldest first. */
  lines(): { level: number; msg: string }[] {
    return this.whole.map((line) => {
      const parsed = JSON.parse(line) as { level?: unknown; msg?: unknown }
      return { level: typeof parsed.level === 'number' ? parsed.level : -1, msg: typeof parsed.msg === 'string' ? parsed.msg : '' }
    })
  }

  clear(): void {
    this.whole.length = 0
    this.waiting = ''
  }
}

const AS_THE_PERSON = { 'x-mole-office-workspace': 'default' }

let t: TestDb
let app: FastifyInstance
let log: RecordingStream
let root: string
let NAMED_INSIDE_SLOW_MS: number
let NAMED_INSIDE_PAGE_SIZE: number

const pause = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

function git(...args: string[]): string {
  const result = spawnSync('git', args, { encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_NAME: 'Test builder', GIT_AUTHOR_EMAIL: 'test@example.invalid', GIT_COMMITTER_NAME: 'Test builder', GIT_COMMITTER_EMAIL: 'test@example.invalid' } })
  if (result.status !== 0) throw new Error(result.stderr)
  return result.stdout.trim()
}

/** A report that stores the path of `file` inside `folder`. */
function aReport(title: string, folder: string, file: string, workspaceId = 'default'): string {
  const row = t.api.createRecord({ workspaceId, kind: 'report', title, actor: t.api.HUMAN })
  writeDataBypassingTheGate(t, row.id, { blocks: [{ id: 'evidence', type: 'image', path: `${folder}/${file}`, alt: 'Synthetic evidence' }] })
  return row.id
}

/** `count` copies of a record, each with its own id, as tests/one-index-of-the-records-text-serves-search-and-named-inside.test.ts makes them. */
function copiesOf(id: string, count: number): void {
  const columns = (t.client.sqlite.prepare('PRAGMA table_info(records)').all() as { name: string }[]).map((one) => `"${one.name}"`)
  const made = columns.map((one) => (one === '"id"' || one === '"title"' ? `${one} || '-' || n.i` : one))
  t.client.sqlite.prepare(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?)
    INSERT INTO records (${columns.join(', ')}) SELECT ${made.join(', ')} FROM records, n WHERE "id" = ?`).run(count, id)
}

/**
 * THE DOOR'S ANSWER FOR `folder`, with the clock moved by `moves` inside the parts. `startAt` is where the clock stands
 * when the case asks, and `eachRead` moves it at every read as well, for a call that reaches none of the parts. `noIds`
 * makes the index give no ids.
 */
async function ask(
  folder: string,
  moves: Partial<Moves>,
  { headers = AS_THE_PERSON, startAt = 1_000, eachRead = 0, noIds = false }: { headers?: Record<string, string>; startAt?: number; eachRead?: number; noIds?: boolean } = {},
): Promise<{ status: number; body: string }> {
  log.clear()
  theClock.now = startAt
  theClock.narrowed = false
  theClock.noIds = noIds
  Object.assign(theClock.moves, STILL, moves)
  const columns = (t.client.sqlite.prepare('PRAGMA table_info(records)').all() as { name: string }[]).map((one) => `"${one.name}"`)
  const prepare = t.client.sqlite.prepare.bind(t.client.sqlite)
  const statements = vi.spyOn(t.client.sqlite, 'prepare').mockImplementation(((source: string) => {
    const statement = prepare(source)
    const selected = /^select (.*?) from "records"/i.exec(source)?.[1]?.split(', ')
    if (selected !== undefined && columns.every((column) => selected.includes(column))) {
      const real = statement.all.bind(statement) as (...values: unknown[]) => unknown[]
      ;(statement as unknown as Record<string, unknown>).all = (...values: unknown[]) => {
        if (theClock.narrowed) theClock.now += theClock.moves.page
        return real(...values)
      }
    }
    return statement
  }) as never)
  const clock = vi.spyOn(performance, 'now').mockImplementation(() => {
    const now = theClock.now
    theClock.now += eachRead
    return now
  })
  try {
    const reply = await app.inject({ method: 'GET', url: `/api/report-files/named-inside?folder=${encodeURIComponent(folder)}`, headers })
    return { status: reply.statusCode, body: reply.body }
  } finally {
    clock.mockRestore()
    statements.mockRestore()
    Object.assign(theClock.moves, STILL)
  }
}

/** The lines the door wrote to the server's log since the case last asked. */
async function theDoorsLines(): Promise<{ level: number; msg: string }[]> {
  await pause(20)
  return log.lines().filter((line) => line.msg.startsWith(THE_LINE_BEGINS))
}

/** An answer without the time it was made, which two calls never share. */
function withoutItsTime(body: string): unknown {
  const { answeredAt: _answeredAt, ...rest } = JSON.parse(body) as Record<string, unknown>
  return rest
}

beforeAll(async () => {
  t = await freshDb()
  const { buildApp } = await import('../src/server/index.ts')
  log = new RecordingStream()
  app = (await buildApp({ production: false, webDir: '/nonexistent', webAppUrl: 'http://localhost:5173', logLevel: 'warn', logStream: log })).app
  await app.ready()
  // Imported here, after freshDb() has named the test database: the route's module opens the database when it loads.
  ;({ NAMED_INSIDE_SLOW_MS, NAMED_INSIDE_PAGE_SIZE } = await import('../src/server/api/reportfiles.ts'))
  root = realpathSync(mkdtempSync(join(tmpdir(), 'slow-named-inside-')))
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(root, { recursive: true, force: true })
})

describe('a slow call writes one line', () => {
  it('writes one warning for a slow call, with each part as the clock gave it, after the answer is made, and the answer unchanged', async () => {
    const folder = '/synthetic-shelves/the-top-shelf/box-of-buttons'
    for (const n of [1, 2, 3]) aReport(`Synthetic button report ${String(n)}`, folder, `button-${String(n)}.txt`)
    const slow = await ask(folder, { finding: 2950, narrowing: 120, page: 1010, git: 25, answer: 5 })
    expect(slow.status, slow.body).toBe(200)
    expect(await theDoorsLines()).toEqual([{ level: WARN, msg: 'The named-inside door took 4110 ms for a folder ending in box-of-buttons: ' +
      'finding 2950 ms by the text index, 3 ids; narrowing 120 ms; pages 1010 ms without the comparison, 1 page, 3 records; ' +
      'comparison 25 ms, a worktree looked for once; the rest 5 ms.' }])
    const still = await app.inject({ method: 'GET', url: `/api/report-files/named-inside?folder=${encodeURIComponent(folder)}`, headers: AS_THE_PERSON })
    expect(still.statusCode, still.body).toBe(200)
    expect((JSON.parse(slow.body) as { records: unknown[] }).records).toHaveLength(3)
    expect(withoutItsTime(slow.body), 'the answer with the clock moved is the answer without').toEqual(withoutItsTime(still.body))
  })

  it('writes no line for a fast call or one a millisecond under the limit, and one line for a call of exactly the limit', async () => {
    expect(NAMED_INSIDE_SLOW_MS, 'the limit is one second').toBe(1000)
    const folder = '/synthetic-shelves/a-box-of-string'
    aReport('Synthetic string report', folder, 'string.txt')
    const fast = await ask(folder, {})
    expect(fast.status, fast.body).toBe(200)
    expect(await theDoorsLines(), 'a fast call').toEqual([])
    const under = await ask(folder, { finding: 400, narrowing: 100, page: 300, git: 150, answer: 49 })
    expect(under.status, under.body).toBe(200)
    expect(await theDoorsLines(), 'a call of 999 ms').toEqual([])
    const atTheLimit = await ask(folder, { finding: 400, narrowing: 100, page: 300, git: 150, answer: 50 })
    expect(atTheLimit.status, atTheLimit.body).toBe(200)
    expect((await theDoorsLines()).map((line) => line.msg)).toEqual(['The named-inside door took 1000 ms for a folder ending in a-box-of-string: ' +
      'finding 400 ms by the text index, 1 id; narrowing 100 ms; pages 300 ms without the comparison, 1 page, 1 record; ' +
      'comparison 150 ms, a worktree looked for once; the rest 50 ms.'])
  })

  it('says no worktree was looked for when no record names the folder', async () => {
    const empty = await ask('/synthetic-shelves/an-empty-crate', { finding: 1000 })
    expect(empty.status, empty.body).toBe(200)
    expect((await theDoorsLines()).map((line) => line.msg)).toEqual(['The named-inside door took 1000 ms for a folder ending in an-empty-crate: ' +
      'finding 1000 ms by the text index, 0 ids; narrowing 0 ms; pages 0 ms without the comparison, 0 pages, 0 records; ' +
      'comparison 0 ms, no worktree looked for; the rest 0 ms.'])
  })

  it('writes every time as a whole number of milliseconds, and the parts add up to the total', async () => {
    const folder = '/synthetic-shelves/a-box-of-beads'
    aReport('Synthetic bead report', folder, 'bead.txt')
    const moves = { finding: 1200.4, narrowing: 0.3, page: 10.6, git: 0.2, answer: 0.7 }
    const asked = await ask(folder, moves, { startAt: 1000.55 })
    expect(asked.status, asked.body).toBe(200)
    const lines = (await theDoorsLines()).map((line) => line.msg)
    expect(lines).toHaveLength(1)
    const line = lines[0]!
    expect(line, 'a time written with its fraction').not.toMatch(/\d\.\d/)
    const found = /^The named-inside door took (\d+) ms for a folder ending in a-box-of-beads: finding (\d+) ms by the text index, 1 id; narrowing (\d+) ms; pages (\d+) ms without the comparison, 1 page, 1 record; comparison (\d+) ms, a worktree looked for once; the rest (\d+) ms\.$/.exec(line)
    expect(found, line).not.toBeNull()
    const [total, finding, narrowing, pages, comparison, rest] = found!.slice(1).map(Number) as [number, number, number, number, number, number]
    expect(total, 'the total, rounded down').toBe(1212)
    expect(finding + narrowing + pages + comparison + rest, 'the parts and the rest add up to the total').toBe(total)
    for (const [part, ms, moved] of [['finding', finding, moves.finding], ['narrowing', narrowing, moves.narrowing], ['pages', pages, moves.page],
      ['comparison', comparison, moves.git], ['the rest', rest, moves.answer]] as const) {
      expect(Math.abs(ms - moved), `${part} is within a millisecond of what the clock moved`).toBeLessThan(1)
    }
  })
})

describe('the line names each way and each part', () => {
  it('names the fallback when the text index gives no ids, as past the door\'s number, and names the root', async () => {
    const { AT_MOST_READ_BY_ID } = await import('../src/server/lib/record-text-index.ts')
    const folder = '/synthetic-shelves/a-box-of-marbles'
    copiesOf(aReport('Synthetic marble report', folder, 'marble.txt'), AT_MOST_READ_BY_ID)
    const asked = await ask(folder, { finding: 700, narrowing: 50, page: 30 }, { noIds: true })
    expect(asked.status, asked.body.slice(0, 2000)).toBe(200)
    expect((JSON.parse(asked.body) as { records: unknown[] }).records).toHaveLength(AT_MOST_READ_BY_ID + 1)
    const lines = await theDoorsLines()
    expect(lines.map((line) => line.level)).toEqual([WARN])
    const line = lines[0]!.msg
    const found = /^The named-inside door took (\d+) ms for a folder ending in a-box-of-marbles: finding 700 ms by a pass over every record, without the text index, (\d+) ids; narrowing 50 ms; pages (\d+) ms without the comparison, (\d+) pages, (\d+) records; comparison 0 ms, a worktree looked for once; the rest 0 ms\.$/.exec(line)
    expect(found, line).not.toBeNull()
    const [total, ids, pagesMs, pages, read] = found!.slice(1).map(Number) as [number, number, number, number, number]
    expect(ids, 'every copy is found').toBeGreaterThan(AT_MOST_READ_BY_ID)
    expect(read, 'each id is read once').toBe(ids)
    expect(pages, 'the pages read').toBe(Math.ceil(ids / NAMED_INSIDE_PAGE_SIZE))
    expect(pagesMs, 'each page moved the clock once').toBe(30 * pages)
    expect(total).toBe(700 + 50 + 30 * pages)

    const atTheRoot = await ask('/', { narrowing: 1000 })
    expect(atTheRoot.status, atTheRoot.body.slice(0, 2000)).toBe(200)
    const rootLines = (await theDoorsLines()).map((one) => one.msg)
    expect(rootLines).toHaveLength(1)
    expect(rootLines[0]).toMatch(/^The named-inside door took \d+ ms for the root folder: finding 0 ms by a pass over every record, without the text index, \d+ ids; narrowing 1000 ms; /)
  }, 120_000)

  it('times the comparison with git apart from the pages', async () => {
    const folder = join(root, 'garden-in-git')
    mkdirSync(folder)
    writeFileSync(join(folder, 'kept.txt'), 'Synthetic tracked file.\n')
    git('init', '-q', folder)
    git('-C', folder, 'add', '--', '.')
    git('-C', folder, 'commit', '-q', '-m', 'Synthetic root')
    const head = git('-C', folder, 'rev-parse', 'HEAD')
    for (const n of [1, 2, 3, 4]) aReport(`Synthetic garden report ${String(n)}`, folder, 'kept.txt')
    const asked = await ask(folder, { finding: 30, narrowing: 20, page: 200, git: 600, eachClass: 50 })
    expect(asked.status, asked.body).toBe(200)
    const answer = JSON.parse(asked.body) as { comparedWith: unknown; records: { names?: unknown }[] }
    expect(answer.comparedWith, 'git was asked').toBe(head)
    expect(answer.records.map((record) => record.names)).toEqual(['trackedFilesOnly', 'trackedFilesOnly', 'trackedFilesOnly', 'trackedFilesOnly'])
    expect((await theDoorsLines()).map((line) => line.msg)).toEqual(['The named-inside door took 1050 ms for a folder ending in garden-in-git: ' +
      'finding 30 ms by the text index, 4 ids; narrowing 20 ms; pages 200 ms without the comparison, 1 page, 4 records; ' +
      'comparison 800 ms, a worktree looked for once; the rest 0 ms.'])
  })
})

describe('the line says nothing else', () => {
  it('names the folder by its last segment alone, and nothing of the path, the records or the caller', async () => {
    const project = 'mossgrove-project'
    const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
    createWorkspace({ id: project, title: 'Synthetic garden project' })
    const handle = 'wexbramble-gardener'
    const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: { 'x-mole-office-workspace': project },
      payload: { handle, name: handle, role: 'worker' } })
    expect(made.statusCode, made.body).toBe(201)
    const agent = (made.json() as { agent: { id: string } }).agent.id
    const folder = '/zorvquill-shelf/plinkbramble-box/fernhollow-garden'
    const ids = [
      aReport('Thistlewump shelf report', folder, 'quorblet-notes.txt', project),
      aReport('Bramblequoy box report', folder, 'quorblet-notes.txt', project),
      aReport('Snorkelwhit garden report', folder, 'vexmoor-list.txt'),
    ]
    const run = 'glimfrond-run'
    const asked = await ask(folder, { finding: 1500 }, { headers: {
      'x-mole-office-workspace': project, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-session': run,
    } })
    expect(asked.status, asked.body).toBe(200)
    const answer = JSON.parse(asked.body) as { records: unknown[]; hiddenCount: number }
    expect(answer.records, 'the two reports in the caller\'s project are listed').toHaveLength(2)
    expect(answer.hiddenCount, 'the report in another project is counted').toBe(1)
    const lines = (await theDoorsLines()).map((line) => line.msg)
    expect(lines).toHaveLength(1)
    const line = lines[0]!
    expect(line).toContain('for a folder ending in fernhollow-garden:')
    const never = ['zorvquill', 'plinkbramble', folder, ...ids, 'Thistlewump', 'Bramblequoy', 'Snorkelwhit', 'quorblet', 'vexmoor',
      'mossgrove', handle, agent, run, 'glimfrond']
    for (const word of never) expect(line, `the line holds ${word}`).not.toContain(word)
  })

  it('writes no line for a refused call, however long the clock says it took', async () => {
    const refused = await ask('/synthetic-shelves/../a-box-of-keys', {}, { eachRead: 1500 })
    expect(refused.status, refused.body).toBe(400)
    expect(await theDoorsLines()).toEqual([])
  })
})
