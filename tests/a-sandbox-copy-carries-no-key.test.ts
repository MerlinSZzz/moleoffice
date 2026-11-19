// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SANDBOX'S COPY OF THE OFFICE CARRIES NO KEY, AND IS PUT ONLY WHERE IT BELONGS.
 *
 * tools/office-copy.mjs is the data copy of the basic toolset (report i69HYz8BQhSx, block b-5 item 4;
 * plan KP0udNekYcAo, block b-14; decision Vt0GdSlApWce for how it is kept and opened). This file
 * drives the real command against a small database it builds itself. It never opens data/panelx.db.
 *
 * What it measures, each by running the command:
 *   - the copy holds no key hash and no visitor token hash, read as rows and read as bytes;
 *   - the database the copy was made from still holds every hash it held;
 *   - `make` and `open` never overwrite a file that is already there;
 *   - every `make` and `open` names the run the copy is for, with --for, and the copy's files carry its id
 *     (tests/a-sandbox-copy-is-made-for-one-run-and-carries-no-address.test.ts measures what that adds);
 *   - `open` writes nowhere but the sandbox's own out folder: not through a name that is a path, and
 *     not through an out folder that is a link;
 *   - a sandboxes folder inside the checkout is refused;
 *   - a folder whose facts the host holds no copy of is refused: one with only the copy in its folder,
 *     which a run there can write, is sent to `tools/sandbox.mjs status`, and one with no copy is no sandbox;
 *   - `scripts/backup.ts --database-only` copies no file from beside the database;
 *   - after a make or an open that worked, a shell with no key and no configuration prints the exact use body
 *     for office_request and sends nothing. The log still says which office variable is missing when one is unset.
 *     A small HTTP server this file starts stands in for the office.
 *
 * EVERY KEY AND TOKEN HERE IS MADE UP, and none is ever printed. The assertions name row counts,
 * paths and whether a hash's bytes are present.
 */

import Database from 'better-sqlite3'
import { spawn, spawnSync } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { COLUMNS_A_COPY_CLEARS, NOT_CARRIED_TABLES, REMOVED_MARK } from '../src/config/what-a-copy-must-not-carry.mjs'
import { writeInstance } from '../tools/sandbox-common.mjs'
import { freshDb, type TestDb } from './helpers.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'office-copy.mjs')
const BACKUP_SCRIPT = join(REPO, 'scripts', 'backup.ts')

/** Made-up values. Nothing here is, or was ever, a key any office issued. */
const MADE_UP_KEY = 'made-up-sandbox-copy-key-3333'

/** The environment a child gets: the test database, and none of the live office's four variables. */
function childEnv(databaseFile: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, MOLE_OFFICE_DB: databaseFile }
  for (const name of ['MOLE_OFFICE_API', 'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_SESSION', 'MOLE_OFFICE_AGENT']) delete env[name]
  return env
}

interface Ran {
  status: number
  stdout: string
  stderr: string
}

function officeCopy(args: readonly string[]): Ran {
  const run = spawnSync(process.execPath, [TOOL, ...args], {
    cwd: REPO,
    encoding: 'utf8',
    env: childEnv(source.file),
    timeout: 120_000,
  })
  return { status: run.status ?? -1, stdout: run.stdout ?? '', stderr: run.stderr ?? '' }
}

/** A folder that looks to the tool like a sandbox: its facts, both copies as up writes them, and an out folder. */
function aSandboxAt(dir: string, withOut = true): void {
  mkdirSync(dir, { recursive: true })
  writeInstance(dir, { instance: 'made by a test' })
  if (withOut) mkdirSync(join(dir, 'out'))
}

let source: TestDb
let place: string
let sandboxes: string
let out: string
let keyHashes: string[]
let tokenHashes: string[]
let madeRun: Ran
let openRun: Ran
let unpacked: string
let run: string

beforeAll(async () => {
  source = await freshDb()
  const keys = await import('../src/server/lib/keys.ts')
  keys.holdTheKeyWhoseHashIs('agent', 'a-made-up-agent', keys.keyHash(MADE_UP_KEY), null)
  const visitors = await import('../src/server/lib/visitors.ts')
  visitors.issueACredential({
    handle: 'a-made-up-visitor',
    name: 'A made-up visitor',
    role: 'worker',
    world: null,
    machine: 'a-machine.example',
    machineHow: 'an address',
    facts: { conversationPath: null, startDirectory: null, runtime: null, sessionRecord: null },
  })
  keyHashes = (source.client.sqlite.prepare('SELECT key_hash AS h FROM held_keys').all() as { h: string }[]).map((r) => r.h)
  tokenHashes = (source.client.sqlite.prepare('SELECT token_hash AS h FROM visitor_credentials').all() as { h: string }[]).map((r) => r.h)
  // THE RUN EVERY COPY HERE IS FOR. It is still going, so no sweep removes its copies.
  run = source.api.createRecord({
    kind: 'session',
    title: 'A made-up run the copies are for',
    workspaceId: 'default',
    actor: { type: 'agent', id: 'copy-tester' },
    origin: 'fixture',
    data: { state: 'running' },
  }).id

  place = mkdtempSync(join(tmpdir(), 'office-copy-test-'))
  sandboxes = join(place, 'sandboxes')
  aSandboxAt(join(sandboxes, 'sb'))
  out = join(sandboxes, 'sb', 'out')
  unpacked = join(out, `office-copy-${run}.db`)

  madeRun = officeCopy(['make', '--to', 'sb', '--for', run, '--sandboxes', sandboxes])
  openRun = officeCopy(['open', '--in', 'sb', '--for', run, '--sandboxes', sandboxes])
}, 180_000)

afterAll(() => {
  source?.close()
  if (place !== undefined) rmSync(place, { recursive: true, force: true })
})

describe('make and open', () => {
  it('make writes the compressed copy and nothing else but its log', () => {
    expect(madeRun.status, madeRun.stderr).toBe(0)
    expect(readdirSync(out).sort()).toEqual([`office-copy-${run}.db`, `office-copy-${run}.db.gz`, 'office-copy.log'])
    expect(readFileSync(join(out, 'office-copy.log'), 'utf8')).toContain('make: copied')
  })

  it('open unpacks it into the out folder, and the copy holds the records', () => {
    expect(openRun.status, openRun.stderr).toBe(0)
    const copy = new Database(unpacked, { readonly: true, fileMustExist: true })
    try {
      const records = (copy.prepare('SELECT count(*) AS n FROM records').get() as { n: number }).n
      const sourceRecords = (source.client.sqlite.prepare('SELECT count(*) AS n FROM records').get() as { n: number }).n
      expect(records).toBe(sourceRecords)
    } finally {
      copy.close()
    }
  })
})

describe('the copy carries no key', () => {
  it('the source held key hashes and token hashes, or this proves nothing', () => {
    expect(keyHashes.length).toBeGreaterThan(0)
    expect(tokenHashes.length).toBeGreaterThan(0)
  })

  it('holds no row in a table a copy must not carry', () => {
    const copy = new Database(unpacked, { readonly: true, fileMustExist: true })
    try {
      for (const table of NOT_CARRIED_TABLES) {
        expect((copy.prepare(`SELECT count(*) AS n FROM "${table}"`).get() as { n: number }).n, table).toBe(0)
      }
    } finally {
      copy.close()
    }
  })

  it('holds every visitor credential, with its token hash replaced by the mark', () => {
    const copy = new Database(unpacked, { readonly: true, fileMustExist: true })
    try {
      for (const { table, column } of COLUMNS_A_COPY_CLEARS) {
        const values = (copy.prepare(`SELECT "${column}" AS v FROM "${table}"`).all() as { v: string }[]).map((r) => r.v)
        expect(values.length, `${table} lost its rows`).toBe(tokenHashes.length)
        for (const value of values) expect(value.startsWith(REMOVED_MARK), `${table}.${column} was not cleared`).toBe(true)
      }
    } finally {
      copy.close()
    }
  })

  it('holds none of the hashes anywhere in its bytes, deleted pages included', () => {
    const bytes = readFileSync(unpacked).toString('latin1')
    for (const hash of [...keyHashes, ...tokenHashes]) {
      expect(bytes.includes(hash), 'a hash of the source is still in the copy’s bytes').toBe(false)
    }
  })

  it('leaves the source holding every hash it held', () => {
    const nowKeys = (source.client.sqlite.prepare('SELECT key_hash AS h FROM held_keys').all() as { h: string }[]).map((r) => r.h)
    const nowTokens = (source.client.sqlite.prepare('SELECT token_hash AS h FROM visitor_credentials').all() as { h: string }[]).map((r) => r.h)
    expect(nowKeys.sort()).toEqual([...keyHashes].sort())
    expect(nowTokens.sort()).toEqual([...tokenHashes].sort())
  })
})

describe('neither command overwrites', () => {
  it('make refuses when the compressed copy is already there, and leaves it as it was', () => {
    const before = statSync(join(out, `office-copy-${run}.db.gz`))
    const again = officeCopy(['make', '--to', 'sb', '--for', run, '--sandboxes', sandboxes])
    expect(again.status).toBe(2)
    expect(again.stderr).toContain('never overwrites')
    const after = statSync(join(out, `office-copy-${run}.db.gz`))
    expect(after.mtimeMs).toBe(before.mtimeMs)
    expect(after.size).toBe(before.size)
  })

  it('open refuses when the unpacked copy is already there, and leaves it as it was', () => {
    const before = statSync(unpacked)
    const again = officeCopy(['open', '--in', 'sb', '--for', run, '--sandboxes', sandboxes])
    expect(again.status).toBe(2)
    expect(again.stderr).toContain('never overwrites an unpacked copy')
    const after = statSync(unpacked)
    expect(after.mtimeMs).toBe(before.mtimeMs)
    expect(after.size).toBe(before.size)
  })
})

describe('open writes only into the sandbox’s own out folder', () => {
  it('refuses a name that is a path, even when the path leads to something that looks like a sandbox', () => {
    // A sandbox-shaped folder BESIDE the sandboxes folder, holding a copy to unpack. Without the
    // name check, "../outside" would reach it and unpack there.
    const outside = join(place, 'outside')
    aSandboxAt(outside)
    writeFileSync(join(outside, 'out', `office-copy-${run}.db.gz`), readFileSync(join(out, `office-copy-${run}.db.gz`)))
    const refused = officeCopy(['open', '--in', '../outside', '--for', run, '--sandboxes', sandboxes])
    expect(refused.status).toBe(2)
    expect(refused.stderr).toContain('is a path')
    expect(existsSync(join(outside, 'out', `office-copy-${run}.db`))).toBe(false)
  })

  it('refuses an out folder that is a link to another folder', () => {
    const elsewhere = join(place, 'elsewhere')
    mkdirSync(elsewhere)
    writeFileSync(join(elsewhere, `office-copy-${run}.db.gz`), readFileSync(join(out, `office-copy-${run}.db.gz`)))
    aSandboxAt(join(sandboxes, 'linked'), false)
    symlinkSync(elsewhere, join(sandboxes, 'linked', 'out'))
    const refused = officeCopy(['open', '--in', 'linked', '--for', run, '--sandboxes', sandboxes])
    expect(refused.status).toBe(2)
    expect(refused.stderr).toContain('is a link')
    expect(existsSync(join(elsewhere, `office-copy-${run}.db`))).toBe(false)
  })

  it('refuses a sandboxes folder inside the checkout, before writing anything', () => {
    const refused = officeCopy(['make', '--to', 'sb', '--for', run, '--sandboxes', join(REPO, 'tests')])
    expect(refused.status).toBe(2)
    expect(refused.stderr).toContain('inside this checkout')
  })
})

// A run in a sandbox can write the copy of the facts in its folder, so only the host's copy makes a folder a sandbox.
describe('a sandbox the host holds no copy of the facts of', () => {
  // MUTATION: take the copy in the sandbox's folder when the host holds none. The copy is then made.
  it("refuses one with only the copy in its folder, names the launcher's status, and writes nothing", () => {
    const dir = join(sandboxes, 'only-its-own-copy')
    mkdirSync(join(dir, 'out'), { recursive: true })
    writeFileSync(join(dir, 'instance.json'), JSON.stringify({ instance: 'made by a test' }))
    const refused = officeCopy(['make', '--to', 'only-its-own-copy', '--for', run, '--sandboxes', sandboxes])
    expect(refused.status, refused.stderr).toBe(2)
    expect(refused.stderr).toContain(`The sandbox at ${dir} was made before the host kept its own copy of a sandbox's facts.`)
    expect(refused.stderr).toContain('node tools/sandbox.mjs status only-its-own-copy checks the copy in its folder once and keeps it')
    expect(readdirSync(join(dir, 'out'))).toEqual([])
  })

  // MUTATION: the same. A folder with no copy at all is refused then as well, in the words of the folder's copy.
  it('refuses one with no copy at all as no sandbox, and writes nothing', () => {
    const dir = join(sandboxes, 'no-copy-at-all')
    mkdirSync(join(dir, 'out'), { recursive: true })
    const refused = officeCopy(['make', '--to', 'no-copy-at-all', '--for', run, '--sandboxes', sandboxes])
    expect(refused.status, refused.stderr).toBe(2)
    expect(refused.stderr).toContain(`No sandbox is at ${dir}: the host holds no copy of its facts, which tools/sandbox.mjs up writes. Nothing was written.`)
    expect(readdirSync(join(dir, 'out'))).toEqual([])
  })
})

describe('scripts/backup.ts --database-only', () => {
  it('copies the database and no file from beside it, and says so', () => {
    const beside = join(dirname(source.file), 'report-files')
    mkdirSync(beside, { recursive: true })
    writeFileSync(join(beside, 'a-made-up-report-file.txt'), 'made up\n')
    const to = join(place, 'alone.db')
    const run = spawnSync('npx', ['tsx', BACKUP_SCRIPT, '--to', to, '--database-only'], {
      cwd: REPO,
      encoding: 'utf8',
      env: childEnv(source.file),
      timeout: 60_000,
    })
    expect(run.status, run.stderr).toBe(0)
    expect(existsSync(to)).toBe(true)
    expect(existsSync(join(place, 'alone.files'))).toBe(false)
    expect(existsSync(join(place, 'alone.left-out.txt'))).toBe(false)
    expect(run.stdout).toContain('--database-only asked for the database alone')
  })
})

// ============================================================================ the use line

/** One request the stand-in office was sent. */
interface Heard {
  method: string
  url: string
  headers: Record<string, string | string[] | undefined>
  body: Record<string, unknown>
}

/** The tool as a child, asynchronously, so the stand-in office in this process can answer it. */
function officeCopyAnswering(args: readonly string[], office: Record<string, string>): Promise<Ran> {
  return new Promise((done) => {
    const env = childEnv(source.file)
    delete env['MOLE_AGENT_KEY']
    const child = spawn(process.execPath, [TOOL, ...args], { cwd: REPO, env: { ...env, ...office } })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += String(chunk)))
    child.stderr.on('data', (chunk) => (stderr += String(chunk)))
    child.on('close', (status) => done({ status: status ?? -1, stdout, stderr }))
  })
}

describe('the use line on the calling run', () => {
  let office: Server
  let api = ''
  const heard: Heard[] = []

  beforeAll(async () => {
    office = createServer((req, res) => {
      let text = ''
      req.on('data', (chunk) => (text += String(chunk)))
      req.on('end', () => {
        const body = (text === '' ? {} : JSON.parse(text)) as Record<string, unknown>
        heard.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers, body })
        res.setHeader('content-type', 'application/json')
        if (req.headers['x-mole-office-session'] === 'a-refused-run') {
          res.statusCode = 404
          res.end(JSON.stringify({ error: 'No live tool in this project has the slug "data-copy".' }))
          return
        }
        res.statusCode = 201
        res.end(JSON.stringify({ run: String(req.headers['x-mole-office-session']), uses: heard.length }))
      })
    })
    await new Promise<void>((ready) => office.listen(0, '127.0.0.1', ready))
    api = `http://127.0.0.1:${String((office.address() as { port: number }).port)}`
  })

  afterAll(async () => {
    await new Promise<void>((closed) => office.close(() => closed()))
  })

  const named = (session: string): Record<string, string> => ({
    MOLE_OFFICE_API: api,
    MOLE_OFFICE_SESSION: session,
    MOLE_OFFICE_WORKSPACE: 'default',
    MOLE_OFFICE_AGENT: 'copy-tester',
  })

  it('prints the first line of what make and open did for office_request, and sends nothing', async () => {
    aSandboxAt(join(sandboxes, 'with-a-run'))
    const before = heard.length
    const made = await officeCopyAnswering(['make', '--to', 'with-a-run', '--for', run, '--sandboxes', sandboxes], named('the-calling-run'))
    expect(made.status, made.stderr).toBe(0)
    const opened = await officeCopyAnswering(['open', '--in', 'with-a-run', '--for', run, '--sandboxes', sandboxes], named('the-calling-run'))
    expect(opened.status, opened.stderr).toBe(0)

    expect(heard.slice(before)).toEqual([])
    for (const [ran, prefix] of [[made, 'make: copied '], [opened, 'open: unpacked ']] as const) {
      const body = JSON.parse(ran.stdout.split('\n').find((line) => line.startsWith('{')) ?? '') as { tool: string; said: string }
      expect(body.tool).toBe('data-copy')
      expect(body.said.startsWith(prefix)).toBe(true)
      expect(ran.stdout).toContain('POST /api/toolset/uses')
      expect(ran.stdout).toContain('Nothing was sent.')
    }
    const log = readFileSync(join(sandboxes, 'with-a-run', 'out', 'office-copy.log'), 'utf8')
    const bodies = log.split('\n').filter((line) => line.startsWith('{')).map((line) => JSON.parse(line) as { tool: string; said: string })
    expect(bodies).toEqual([made, opened].map((ran) => JSON.parse(ran.stdout.split('\n').find((line) => line.startsWith('{')) ?? '')))
    expect(log.match(/Nothing was sent\./g)?.length).toBe(2)
  }, 120_000)

  it('posts nothing, and the log says no run was named, when MOLE_OFFICE_SESSION is not set', async () => {
    aSandboxAt(join(sandboxes, 'with-no-run'))
    const before = heard.length
    const office = named('')
    delete office['MOLE_OFFICE_SESSION']
    const made = await officeCopyAnswering(['make', '--to', 'with-no-run', '--for', run, '--sandboxes', sandboxes], office)
    expect(made.status, made.stderr).toBe(0)
    expect(heard.length).toBe(before)
    expect(readFileSync(join(sandboxes, 'with-no-run', 'out', 'office-copy.log'), 'utf8')).toContain(
      'no run was named, because MOLE_OFFICE_SESSION is not set',
    )
  }, 120_000)

  it('says no office was named when neither variable is set', () => {
    expect(readFileSync(join(out, 'office-copy.log'), 'utf8')).toContain('no office was named, because MOLE_OFFICE_API is not set')
  })

  it('keeps the copy and exit 0 when the use is unsent, without asking the refusing office', async () => {
    aSandboxAt(join(sandboxes, 'with-a-refusal'))
    const before = heard.length
    const made = await officeCopyAnswering(['make', '--to', 'with-a-refusal', '--for', run, '--sandboxes', sandboxes], named('a-refused-run'))
    expect(made.status, made.stderr).toBe(0)
    expect(existsSync(join(sandboxes, 'with-a-refusal', 'out', `office-copy-${run}.db.gz`))).toBe(true)
    expect(readFileSync(join(sandboxes, 'with-a-refusal', 'out', 'office-copy.log'), 'utf8')).toContain(
      'Nothing was sent.',
    )
    expect(heard.slice(before)).toEqual([])
  }, 120_000)
})
