// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The real negative-control command copies a temporary database and cleans up its recorded group
 * after the browser rejects. Small HTTP services stand in for the two offices; the WAL proof uses SQLite. */
import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL, URL } from 'node:url'
import { createServer, type Server } from 'node:http'
import { theFilesBuiltFrom } from '../src/config/import-graph.mjs'
import { formatWorldHeader, WORLD_HEADER } from '../src/config/world-header.mjs'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { aCopyOfALiveDatabase } from '../tools/a-copy-of-a-live-database.mjs'
import { commandThatStopsWithItsOwner } from './helpers.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const repo = fileURLToPath(new URL('..', import.meta.url))

/** The page throws before the command waits for diagnostics. Its close rejects a promise nobody
 * awaits, so the real command takes its rejection exit path and cleans up the group it recorded. */
const STAND_IN_BROWSER = `
const page = {
  async route() {},
  async unroute() {},
  async goto() { throw new Error('synthetic page failure before browser close') },
  async waitForFunction() {},
  async evaluate() {
    return { banner: null, blocked: false }
  },
}

export const chromium = {
  async launch() {
    return {
      async newPage() {
        return page
      },
      async close() {
        // THE FAULT, IN ITS OWN SHAPE. A promise nobody is awaiting rejects, which is what killed
        // the command: Node turns an unhandled rejection into the end of the process.
        void Promise.reject(new Error('route.fetch: Request context disposed.'))
        await new Promise((done) => setTimeout(done, 50))
        throw new Error('the stand-in browser was closed while a request was still in flight')
      },
    }
  },
}
`

/** What the command said about the wrong world it started: its group, its port, its directory. */
interface WhatItStarted {
  group: number
  port: number
  directory: string
}

/**
 * Read the command's own output for what it started.
 *
 * READ FROM THE OUTPUT AND NOT GUESSED. The port and the directory are chosen at run time — a free
 * port from the kernel, a temporary directory from `mkdtemp` — so the only place they exist is the
 * lines the command prints, and those lines are also what a person is told to use.
 */
function whatItStarted(output: string): WhatItStarted | null {
  const where = /served on http:\/\/127\.0\.0\.1:(\d+)\./.exec(output)
  const copy = /a copy of that database at (\/\S+)\/a-copy-of-the-database\.db,/.exec(output)
  const group = /process group (\d+)\./.exec(output)
  if (where === null || copy === null || group === null) return null
  return { group: Number(group[1]), port: Number(where[1]), directory: copy[1] as string }
}

describe('the negative control stops the server it started when it dies badly', () => {
  let app: Server
  let source: Database.Database
  let api = ''
  let standIn = ''
  let output = ''
  let exitCode: number | null = null
  let started: WhatItStarted | null = null

  beforeAll(async () => {

    // THE STAND-IN IS WRITTEN INTO A TEMPORARY DIRECTORY and imported by its file URL. No test
    // writes a file into the checkout, and a bare path is not a specifier every Node accepts.
    standIn = aTestDatabaseFolder('negative-control-stand-in')
    source = new Database(join(standIn, 'source.db'))
    source.exec("CREATE TABLE kept (value TEXT); INSERT INTO kept VALUES ('synthetic original')")
    app = createServer((_request, response) => {
      response.setHeader(WORLD_HEADER, formatWorldHeader({ database: 'synthetic-source', repository: standIn, port: '0', head: 'synthetic', standing: 'canonical' }))
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ ok: true, code: { grace: -4 }, world: { standing: { kind: 'canonical' } } }))
    })
    await new Promise<void>(done => app.listen(0, '127.0.0.1', done))
    api = `http://127.0.0.1:${(app.address() as {port: number}).port}`
    // The tools' where-is-the-api.mjs only passes on for-agents/'s, and the walk follows imports into src/ alone, so
    // for-agents/'s is an entry of its own: what it imports from src/ is copied with it.
    for (const part of new Set(['tools/negative-control.mjs', 'tools/where-is-the-api.mjs', 'for-agents/where-is-the-api.mjs', 'tools/the-page-is-ready.mjs', 'tools/a-copy-of-a-live-database.mjs'].flatMap(entry => theFilesBuiltFrom(entry, repo).files))) {
      mkdirSync(dirname(join(standIn, part)), { recursive: true })
      cpSync(join(repo, part), join(standIn, part))
    }
    cpSync(join(repo, 'for-agents'), join(standIn, 'for-agents'), { recursive: true })
    symlinkSync(join(repo, 'node_modules'), join(standIn, 'node_modules'))
    writeFileSync(join(standIn, 'package.json'), '{"type":"module"}')
    mkdirSync(join(standIn, 'src/server'), { recursive: true })
    writeFileSync(join(standIn, 'src/server/index.ts'), `
      import {createServer} from 'node:http'
      import {formatWorldHeader, WORLD_HEADER} from '../config/world-header.mjs'
      const app=createServer((_q,s)=>{
        s.setHeader(WORLD_HEADER,formatWorldHeader({database:'synthetic-copy',repository:process.cwd(),port:process.env.MOLE_OFFICE_PORT,head:'synthetic',standing:'scratch'}))
        s.setHeader('content-type','application/json');s.end(JSON.stringify({ok:true,world:{standing:{kind:'scratch'}}}))
      }); app.listen(Number(process.env.MOLE_OFFICE_PORT),'127.0.0.1')
      process.on('SIGTERM',()=>app.close(()=>process.exit(0)))
    `)
    const module = join(standIn, 'browser.mjs')
    writeFileSync(module, STAND_IN_BROWSER, 'utf8')

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      MOLE_OFFICE_API: api,
      MOLE_OFFICE_WEB: api,
      MOLE_OFFICE_DB: join(standIn, 'source.db'),
      NEGATIVE_CONTROL_BROWSER: pathToFileURL(module).href,
      LOG_LEVEL: 'warn',
    }
    delete env['VITEST']
    delete env['VITEST_WORKER_ID']
    delete env['MOLE_OFFICE_PORT']
    delete env['MOLE_OFFICE_WEB_PORT']
    delete env['MOLE_OFFICE_URL']

    const watched = commandThatStopsWithItsOwner(process.execPath, [join(standIn, 'tools/negative-control.mjs')])
    const run = spawn(watched.command, watched.args, {
      cwd: repo,
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    run.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    run.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    // `close` and not `exit`: `exit` can arrive before the last of the output has been read, and
    // every assertion below is made against what the command said.
    exitCode = await new Promise<number | null>((done) => {
      run.on('close', (code) => {
        done(code)
      })
    })
    started = whatItStarted(output)
  }, 300_000)

  afterAll(async () => {
    // A SAFETY NET, NOT A PASS. If the command failed to stop what it started, the assertions below
    // have already said so; this is here so that a failing test does not leave a server behind.
    if (started !== null) {
      try {
        process.kill(-started.group, 'SIGKILL')
      } catch {
        // Gone, which is what the test wants.
      }
      rmSync(started.directory, { recursive: true, force: true })
    }
    if (standIn !== '') rmSync(standIn, { recursive: true, force: true })
    source?.close()
    await new Promise<void>(done => app?.close(() => done()))
  }, 120_000)

  it('really started a wrong world, so there is something for the cleanup to have done', () => {
    expect(started, `the command never said what it started. It said:\n${output}`).not.toBeNull()
    expect(started?.port).toBeGreaterThan(0)
    expect(started?.group).toBeGreaterThan(0)
    expect(output).toContain('The wrong world is up and answering')
  })

  it('died the way the fault dies, rather than finishing tidily', () => {
    // The proof is only worth something if the command really was killed by the rejection. If the
    // stand-in stopped rejecting, this says so instead of the next two tests passing for free.
    expect(output).toContain('a rejection nobody awaited')
    expect(exitCode).not.toBe(0)
  })

  it('stopped the process group it started', () => {
    const group = started?.group as number
    let gone = false
    try {
      process.kill(-group, 0)
    } catch (err) {
      gone = err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ESRCH'
    }
    expect(gone, `process group ${String(group)} is still running. The command said:\n${output}`).toBe(true)
    expect(app.listening, 'the original service still answers').toBe(true)
    expect(source.prepare('SELECT value FROM kept').all()).toEqual([{ value: 'synthetic original' }])
  })

  it('deleted the copy of the database it made', () => {
    const directory = started?.directory as string
    expect(existsSync(directory), `${directory} is still there. The command said:\n${output}`).toBe(false)
  })

  it('said what it stopped, in the words a person can check it by', () => {
    expect(output).toContain('The wrong world is stopped: process group')
    expect(output).toContain('The copy of the database is deleted')
  })
})

describe('the copy is made by SQLite, so what the temporary source holds in its write-ahead log is in it', () => {
  // MUTATION: copy the file alone again in tools/a-copy-of-a-live-database.mjs, and this goes red: the copy holds no table.
  it('holds the rows the live database has only in its write-ahead log, and changes nothing in it', () => {
    const dir = aTestDatabaseFolder('a-live-copy')
    const live = new Database(join(dir, 'live.db'))
    try {
      live.pragma('journal_mode = WAL')
      live.pragma('wal_autocheckpoint = 0')
      live.exec('CREATE TABLE t (n INTEGER)')
      const add = live.prepare('INSERT INTO t VALUES (?)')
      for (let n = 0; n < 100; n += 1) add.run(n)
      expect(statSync(join(dir, 'live.db-wal')).size, 'the rows are not in the log, so this proves nothing').toBeGreaterThan(0)
      aCopyOfALiveDatabase(join(dir, 'live.db'), join(dir, 'copy.db'))
      const copy = new Database(join(dir, 'copy.db'), { readonly: true })
      try {
        expect((copy.prepare('SELECT count(*) AS n FROM t').get() as { n: number }).n).toBe(100)
      } finally {
        copy.close()
      }
      expect((live.prepare('SELECT count(*) AS n FROM t').get() as { n: number }).n).toBe(100)
    } finally {
      live.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
