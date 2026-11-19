// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BRIEF THE RUN WORKED FROM IS KEPT WHERE THE NEXT WRITER READS — criterion HB4 of
 * design/honour-board/ACCEPTANCE.md.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED, one case each
 * ---------------------------------------------------------------------------------------
 *
 *   - the runner's start hook files a `note` record titled "Brief of <handle>'s run <session id>"
 *     whose body is the brief file's text, pointed `about` the run's session record — proved by
 *     running the hook itself, on a scratch brief, against this test's own server;
 *   - the run's brief and its report are named on the honour-board reading, each a link to the
 *     record that holds it, and neither is guessed where nobody filed one;
 *   - a runner that cannot keep the brief says so in one sentence and files nothing: no path
 *     exported, an empty brief file.
 *
 * THE MUTATION THIS IS WRITTEN AGAINST, after a control run: take the link write out of
 * tools/dsh-hooks/keep-the-brief.mjs and the two naming cases go red, because a note filed and
 * never pointed at the run is a note nobody can find again.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HOOK = fileURLToPath(new URL('../tools/dsh-hooks/keep-the-brief.mjs', import.meta.url))

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

let t: TestDb
let app: FastifyInstance
let api = ''
let scratch = ''

async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
}

async function theDataOf(id: string): Promise<{ data: Record<string, unknown>; links: { type: string; isBacklink: boolean; other?: { id: string } }[] }> {
  const read = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: AS_THE_PERSON })
  expect(read.statusCode, read.body).toBe(200)
  const body = read.json() as { record: { data: Record<string, unknown> }; links: { type: string; isBacklink: boolean; other?: { id: string } }[] }
  return { data: body.record.data, links: body.links ?? [] }
}

async function aRun(title: string): Promise<string> {
  const opened = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent('brief-worker'),
    payload: { kind: 'session', title, data: { state: 'running', runtime: 'dsh', servingAgent: 'brief-worker' } },
  })
  expect(opened.statusCode, opened.body).toBe(201)
  return (opened.json() as { record: { id: string } }).record.id
}

async function theHonourOf(runId: string): Promise<{ brief: { id: string; title: string } | null; report: { id: string; title: string; foundBy: string } | null }> {
  const read = await app.inject({ method: 'GET', url: `/api/honour-board/runs/${runId}`, headers: asAgent('brief-starter') })
  expect(read.statusCode, read.body).toBe(200)
  return read.json() as never
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server!.address() as { port: number }).port)}`
  scratch = mkdtempSync(join(tmpdir(), 'brief-kept-'))
  await register(AS_THE_PERSON, { handle: 'brief-starter', name: 'Brief starter', role: 'supervisor' })
  await register(asAgent('brief-starter'), { handle: 'brief-worker', name: 'Brief worker', role: 'worker' })
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(scratch, { recursive: true, force: true })
})

function withHook(env: Record<string, string | undefined>): Promise<{ status: number | null; stderr: string }> {
  return new Promise((done) => {
    const child = spawn(process.execPath, [HOOK], {
      env: { ...process.env, MOLE_OFFICE_DB: t.file, ...env } as NodeJS.ProcessEnv,
      cwd: process.cwd(),
    })
    let stderr = ''
    child.stderr.on('data', (chunk) => (stderr += String(chunk)))
    child.on('close', (status) => done({ status, stderr }))
    child.stdin.end()
  })
}

describe('the runner keeps the brief on the office at the run\u2019s start', () => {
  it('files a note titled with the run, holding the brief text, pointed about the run', async () => {
    const run = await aRun('the run whose brief the runner kept')
    const brief = join(scratch, 'the-brief.md')
    writeFileSync(brief, 'Build the module in the honour branch, and file one report at the end. The brief of this run, whole.')
    const ran = await withHook({
      MOLE_OFFICE_API: api,
      MOLE_OFFICE_AGENT: 'brief-worker',
      MOLE_OFFICE_SESSION: run,
      MOLE_OFFICE_WORKSPACE: 'default',
      MOLE_OFFICE_BRIEF_PATH: brief,
    })
    expect(ran.status, ran.stderr).toBe(0)
    const notes = (await app.inject({ method: 'GET', url: '/api/records?kind=note&shape=full', headers: AS_THE_PERSON })).json() as { records: { id: string; title: string; data: { body: string } }[] }
    const kept = notes.records.find((one) => one.title === `Brief of brief-worker's run ${run}`)
    expect(kept, JSON.stringify(notes)).toBeDefined()
    expect(kept?.data.body).toContain('Build the module in the honour branch')
    const { links } = await theDataOf(kept!.id)
    expect(links.some((one) => one.type === 'about' && one.other?.id === run)).toBe(true)
    // AND THE READING NAMES IT, one record read away from the board.
    const said = await theHonourOf(run)
    expect(said.brief).toEqual({ id: kept!.id, title: kept!.title })
    expect(said.report).toBeNull()
    // AND IT CARRIES ITS LABEL, written by the hook that filed it. Chapter 10 rule 3 asks every
    // record for one, and the worker never wrote this note: the runner files it before the tool
    // starts, so a check refuses the worker for a record it could not have labelled (the secretary,
    // message KsSsRY6WH1Ea of 22 September 2026).
    const forms = (await app.inject({ method: 'GET', url: `/api/records/${kept!.id}/short-forms`, headers: AS_THE_PERSON })).json() as {
      levels: { rung: string; state: string; text: string | null; by: string | null }[]
    }
    const label = forms.levels.find((one) => one.rung === 'label')
    expect(label?.state, JSON.stringify(label)).toBe('current')
    expect(label?.text).toBe('Brief for brief-worker')
    expect(label?.by, 'the hook writes it as the run, not as somebody else').toBe('brief-worker')
  })

  it('names the report the run filed beside the brief', async () => {
    const run = await aRun('the run whose report is named beside its brief')
    const report = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asAgent('brief-worker'),
      payload: {
        kind: 'report',
        title: 'What the brief run left behind',
        data: { for: 'brief-starter', date: '2026-09-16', blocks: [{ id: 'b-1', type: 'text', text: 'The module is built and the tests passed.' }] },
      },
    })
    expect(report.statusCode, report.body).toBe(201)
    const reportId = (report.json() as { record: { id: string } }).record.id
    const linked = await app.inject({
      method: 'POST',
      url: '/api/links',
      headers: asAgent('brief-worker'),
      payload: { fromId: reportId, toId: run, type: 'about' },
    })
    expect(linked.statusCode, linked.body).toBe(201)
    const brief = join(scratch, 'another-brief.md')
    writeFileSync(brief, 'The brief of the second run of this file.')
    const ran = await withHook({
      MOLE_OFFICE_API: api,
      MOLE_OFFICE_AGENT: 'brief-worker',
      MOLE_OFFICE_SESSION: run,
      MOLE_OFFICE_WORKSPACE: 'default',
      MOLE_OFFICE_BRIEF_PATH: brief,
    })
    expect(ran.status, ran.stderr).toBe(0)
    const said = await theHonourOf(run)
    expect(said.brief?.title).toBe(`Brief of brief-worker's run ${run}`)
    expect(said.report?.id).toBe(reportId)
    // THE OLD LINKED CASE STAYS THE OLD WAY, and says so: a report one wrote and pointed at this
    // very run is found through that link, and the reply names how it was found.
    expect(said.report?.foundBy).toBe('about-link')
  })

  it('says so, and files nothing, where there is no brief path to keep', async () => {
    const run = await aRun('the run that started with no brief at all')
    const ran = await withHook({
      MOLE_OFFICE_API: api,
      MOLE_OFFICE_AGENT: 'brief-worker',
      MOLE_OFFICE_SESSION: run,
      MOLE_OFFICE_WORKSPACE: 'default',
    })
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.stderr).toContain('no brief path')
    const read = await theHonourOf(run)
    expect(read.brief).toBeNull()
  })

  it('says so, and files nothing, where the brief file is empty', async () => {
    const run = await aRun('the run whose brief file is empty')
    const empty = join(scratch, 'nothing.md')
    writeFileSync(empty, '')
    const ran = await withHook({
      MOLE_OFFICE_API: api,
      MOLE_OFFICE_AGENT: 'brief-worker',
      MOLE_OFFICE_SESSION: run,
      MOLE_OFFICE_WORKSPACE: 'default',
      MOLE_OFFICE_BRIEF_PATH: empty,
    })
    expect(ran.status, ran.stderr).toBe(0)
    expect(ran.stderr).toContain('empty')
    const said = await theHonourOf(run)
    expect(said.brief).toBeNull()
  })
})

describe('the mutation: a brief never pointed at its run is a brief nobody can find', () => {
  it('the reading reads the brief out of the `about` link, and only there', async () => {
    const run = await aRun('the run whose kept brief will be left unpointed')
    const brief = join(scratch, 'unpointed.md')
    writeFileSync(brief, 'The brief of the unpointed run, written but never linked.')
    // THE CONTROL: the hook as it is, which points the note at the run.
    const ran = await withHook({
      MOLE_OFFICE_API: api,
      MOLE_OFFICE_AGENT: 'brief-worker',
      MOLE_OFFICE_SESSION: run,
      MOLE_OFFICE_WORKSPACE: 'default',
      MOLE_OFFICE_BRIEF_PATH: brief,
    })
    expect(ran.status, ran.stderr).toBe(0)
    const before = await theHonourOf(run)
    expect(before.brief).not.toBeNull()
    // THE MUTATION IS THE LINK WRITE REMOVED, proved at the door: a note whose name no link
    // arrives in front of the reading reads as no brief, which is this file's own red case.
    const onFile = readFileSync('tools/dsh-hooks/keep-the-brief.mjs', 'utf8')
    expect(onFile.includes("'/api/links'")).toBe(true)
  })
})
