// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN THE LAUNCHER FILES CARRIES A DOING LINE, AND A RUN FILED BEFORE THE HELPER SEES IT GETS ONE ONLY WHEN IT HAS NONE.
 *
 * The launcher files a run through fileARun, which runs register-a-run.mjs. The create body that reaches the office has
 * to say what the run is doing, made from the agent's handle, the run's title and the heading of the brief's own chapter
 * after the starting words. A run somebody filed before the helper saw it has no such line, and the helper writes one
 * only when the record holds none; a line it already holds is never overwritten.
 *
 * THE OFFICE IS A STAND-IN MADE IN THIS FILE, on an ephemeral port of its own. It answers the reads register-a-run.mjs
 * makes and keeps the create and patch bodies it is sent. fileARun waits for register-a-run.mjs with spawnSync, so it
 * runs in a worker thread: the stand-in's answers come from this process, which would otherwise be held still.
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { createServer as createHttpServer, type Server } from 'node:http'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { beforeAll, describe, expect, it } from 'vitest'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { THE_STARTING_WORDS } from '../tools/harness-features-off.mjs'
import {
  THE_DOING_LINES_MOST_CHARACTERS,
  fileARun,
  theDoingLineOfARun,
  writeTheDoingLineIfTheRunHasNone,
} from '../tools/file-a-run.mjs'

const WORKSPACE = 'default'
const HANDLE = 'doing-line-worker'
const TITLE = 'the run that says what it is doing'
const HEADING = 'the heading of the briefs own chapter'
const RUNTIME = 'dsh'
const THE_RUN = 'the-pre-filed-run'
const THE_TOOL = new URL('../tools/file-a-run.mjs', import.meta.url).href

/** The filing call runs in a worker because fileARun blocks on register-a-run.mjs while this process answers. */
const THE_FILING_WORKER = `
const { parentPort, workerData } = require('node:worker_threads')
import(workerData.tool).then(({ fileARun }) => {
  try { parentPort.postMessage({ filed: fileARun(workerData.run) }) }
  catch (error) { parentPort.postMessage({ failed: String((error && error.stack) || error) }) }
}).catch((error) => parentPort.postMessage({ failed: String((error && error.stack) || error) }))
`

let scratch = ''
let brief = ''
let checkout = ''

const git = (directory: string, ...words: string[]): string => execFileSync('git', ['-C', directory, ...words], { encoding: 'utf8' }).trim()

/** A checkout of its own with one commit on main, so register-a-run.mjs can read a tip and a cut. */
function aCheckout(): string {
  const directory = mkdtempSync(join(scratch, 'checkout-'))
  git(directory, 'init', '-q', '-b', 'main')
  git(directory, 'config', 'user.email', 'a-test@example.invalid')
  git(directory, 'config', 'user.name', 'A test')
  git(directory, 'config', 'commit.gpgsign', 'false')
  writeFileSync(join(directory, 'the-work.txt'), 'the work\n')
  git(directory, 'add', 'the-work.txt')
  git(directory, 'commit', '-q', '-m', 'the work')
  return directory
}

beforeAll(() => {
  scratch = aTestDatabaseFolder('a-run-with-a-doing-line')
  checkout = aCheckout()
  brief = join(scratch, 'brief.md')
  writeFileSync(brief, `${THE_STARTING_WORDS}\n\n---\n\n# ${HEADING}\n\nThe brief's own words.\n`)
})

interface WhatWasSent {
  readonly method: string
  readonly path: string
  readonly body: Record<string, unknown>
}

interface AStandInOffice {
  readonly api: string
  readonly creates: Record<string, unknown>[]
  readonly patches: WhatWasSent[]
  readonly close: () => Promise<void>
}

/** The office register-a-run.mjs reads, files against and labels, with every create and patch kept. */
async function aStandInOffice(): Promise<AStandInOffice> {
  const creates: Record<string, unknown>[] = []
  const patches: WhatWasSent[] = []
  const server: Server = createHttpServer((request, response) => {
    const answer = (status: number, body: unknown): void => {
      response.writeHead(status, { 'content-type': 'application/json' })
      response.end(JSON.stringify(body))
    }
    const whole = (): Promise<string> => new Promise((ok) => {
      let text = ''
      request.on('data', (part: Buffer) => { text += part.toString('utf8') })
      request.on('end', () => ok(text))
    })
    const path = request.url ?? ''
    if (request.method === 'GET' && path === '/api/participants') {
      answer(200, { agents: [{ id: 'the-doing-line-workers-id', handle: HANDLE, name: 'The doing line worker', record: 'the-doing-line-workers-record', retired: false }] })
      return
    }
    if (request.method === 'GET' && path === '/api/kinds/session') {
      answer(200, { kind: { kind: 'session', fields: [{ key: 'state' }, { key: 'runtime' }, { key: 'doing' }, { key: 'adaptedTool' }, { key: 'cutFromCommit' }] } })
      return
    }
    if (request.method === 'POST' && path === '/api/records') {
      void whole().then((text) => {
        creates.push(JSON.parse(text) as Record<string, unknown>)
        answer(201, { record: { id: 'the-filed-run' } })
      })
      return
    }
    if (request.method === 'GET' && path === '/api/records/the-filed-run/short-forms') {
      answer(200, { newestRevision: 1, version: 'the-version-the-label-was-read-from' })
      return
    }
    if (request.method === 'POST' && path === '/api/records/the-filed-run/short-forms') {
      void whole().then(() => answer(200, {}))
      return
    }
    if (request.method === 'PATCH' && path.startsWith('/api/records/')) {
      void whole().then((text) => {
        patches.push({ method: 'PATCH', path, body: JSON.parse(text) as Record<string, unknown> })
        answer(200, { record: { id: decodeURIComponent(path.slice('/api/records/'.length)) } })
      })
      return
    }
    void whole().then(() => answer(404, { error: 'the stand-in office does not answer this request' }))
  })
  await new Promise<void>((ok, fail) => {
    server.once('error', fail)
    server.listen(0, '127.0.0.1', () => ok())
  })
  const where = server.address()
  if (where === null || typeof where === 'string') throw new Error('the stand-in office has no port')
  return {
    api: `http://127.0.0.1:${String(where.port)}`,
    creates,
    patches,
    close: () => new Promise<void>((ok) => {
      server.closeAllConnections()
      server.close(() => ok())
    }),
  }
}

/** fileARun in a worker thread, so the stand-in office in this process can answer the tool it starts. */
function fileARunWhereThisProcessAnswers(run: Parameters<typeof fileARun>[0]): Promise<ReturnType<typeof fileARun>> {
  return new Promise((ok, fail) => {
    const worker = new Worker(THE_FILING_WORKER, { eval: true, workerData: { tool: THE_TOOL, run } })
    worker.once('message', (answered: { filed?: ReturnType<typeof fileARun>; failed?: string }) => {
      if (answered.failed !== undefined) fail(new Error(answered.failed))
      else if (answered.filed === undefined) fail(new Error('the filing worker answered nothing'))
      else ok(answered.filed)
    })
    worker.once('error', fail)
    worker.once('exit', (code) => {
      if (code !== 0) fail(new Error(`the filing worker exited ${String(code)}`))
    })
  })
}

describe('a run is filed with its doing line', () => {
  it('a run the launcher files carries a doing line made from its handle, its title and its briefs own heading', async () => {
    const office = await aStandInOffice()
    try {
      const filed = await fileARunWhereThisProcessAnswers({
        api: office.api,
        workspace: WORKSPACE,
        as: 'the-supervisor',
        session: 'the-supervisors-run',
        brief,
        handle: HANDLE,
        worktree: checkout,
        cutFrom: 'main',
        runtime: RUNTIME,
        model: 'a-model',
        title: TITLE,
        sandbox: { template: 'a-template', container: 'a-container', folder: scratch },
        keyFolder: scratch,
      })
      expect(filed.ok, filed.ok ? '' : filed.says).toBe(true)
      const create = office.creates[0]
      expect(create, 'the stand-in office received no create').toBeDefined()
      const data = create?.['data'] as Record<string, unknown> | undefined
      expect(typeof data?.['doing'], JSON.stringify(create)).toBe('string')
      const line = String(data?.['doing'])
      expect(line).toBe(theDoingLineOfARun(HANDLE, TITLE, brief))
      expect(line).not.toContain('\n')
      expect(line.length).toBeLessThanOrEqual(THE_DOING_LINES_MOST_CHARACTERS)
      expect(line).toContain(HANDLE)
      expect(line).toContain(TITLE)
      expect(line).toContain(HEADING)
      expect(line.indexOf(HANDLE)).toBeLessThan(line.indexOf(TITLE))
      expect(line.indexOf(TITLE)).toBeLessThan(line.indexOf(HEADING))
      expect(line, 'the doing line kept the starting words instead of the briefs own heading').not.toContain(THE_STARTING_WORDS.split('\n')[0]!)
    } finally {
      await office.close()
    }
  })

  it('a pre-filed run with no doing line gets one', async () => {
    const office = await aStandInOffice()
    try {
      const line = theDoingLineOfARun(HANDLE, TITLE, brief)
      const answered = await writeTheDoingLineIfTheRunHasNone(
        office.api,
        WORKSPACE,
        { 'content-type': 'application/json', 'x-mole-office-workspace': WORKSPACE },
        THE_RUN,
        { state: 'running' },
        line,
      )
      expect(answered.written).toBe(true)
      expect(answered.kept).toBe(false)
      expect(office.patches).toHaveLength(1)
      expect(office.patches[0]?.method).toBe('PATCH')
      expect(office.patches[0]?.path).toBe(`/api/records/${THE_RUN}`)
      expect(office.patches[0]?.body).toEqual({ dataPatch: { doing: line } })
    } finally {
      await office.close()
    }
  })

  it('a pre-filed run with a doing line keeps it', async () => {
    const office = await aStandInOffice()
    try {
      const answered = await writeTheDoingLineIfTheRunHasNone(
        office.api,
        WORKSPACE,
        { 'content-type': 'application/json', 'x-mole-office-workspace': WORKSPACE },
        THE_RUN,
        { state: 'running', doing: 'the doing line the run already carried' },
        theDoingLineOfARun(HANDLE, TITLE, brief),
      )
      expect(answered.kept).toBe(true)
      expect(answered.written).toBe(false)
      expect(office.patches).toHaveLength(0)
    } finally {
      await office.close()
    }
  })
})
