// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readTheHookDetails } from './hook-details.ts'
/**
 * Real session-hook.mjs in a temporary checkout, a loopback fake office and shell scripts named
 * claude. All cases stay; delayed responses and the hook clocks run at half their shipped times.
 */
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { execFile, type ChildProcess } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { databaseIdentity } from '../src/config/database-identity.mjs'
import { HOOK_CLOCK_HEADER } from '../src/config/hook-clock-header.mjs'
import { startTimeOf } from '../src/config/session-process.mjs'
import { localStampOf } from '../src/config/stopped-run-cause.mjs'
import { WORLD_HEADER, formatWorldHeader } from '../src/config/world-header.mjs'
import { aTestDatabaseFolder } from './a-test-folder.ts'
import { copyBootstrapSettings } from './stable-bootstrap-clone-fixture.ts'

const repo = fileURLToPath(new URL('..', import.meta.url))
const conversation = 'this-conversation'
const CLOCK_SCALE = 0.5
const hookMs = (ms: number) => ms * CLOCK_SCALE
type RecordRow = { id: string; kind: string; title: string; workspaceId: string; data: Record<string, unknown> }
type Hold = { session: string; handle: string; state: string }
let scratch: string
let checkout: string
let database: string
let server: Server
let api: string
let records: RecordRow[]
let holds: Hold[]
let reads: { path: string; workspace: string }[]
let writes: { path: string; workspace: string; method: string; body: unknown }[]
let delayBrief: number | 'never'
let delayResources: number
let keptSays: string | null
let delaySetup: number
let quietHandle: boolean
let closedBriefAfter: number
let briefSentAt: number | null
let closedResourcesAfter: number
let claudePid: number | null
let processSource: 'stamp' | 'none'
let wrongStart: boolean
let wrongPid: boolean
let mentionsTheStart: boolean
let sessionsRunning: { recordId: string; state: string }[]
let onboardingProject: Record<string, unknown>
const timers = new Set<ReturnType<typeof setTimeout>>()
const children: ChildProcess[] = []

beforeEach(async () => {
  scratch = aTestDatabaseFolder('held-brief')
  checkout = join(scratch, 'checkout')
  mkdirSync(join(checkout, 'tools'), { recursive: true })
  cpSync(join(repo, 'src/config'), join(checkout, 'src/config'), { recursive: true })
  // The settings loader imports modules outside src/config too; its whole import closure is copied, not a list by hand.
  copyBootstrapSettings(checkout)
  // tools/session-hook.mjs is one line that imports the hook's code from for-agents/session-hook.mjs.
  cpSync(join(repo, 'tools', 'session-hook.mjs'), join(checkout, 'tools', 'session-hook.mjs'))
  // The hook's code imports where-is-the-api.mjs, agent-key.mjs and a-full-list-read.mjs (the shared helper its two
  // session-record searches use) beside it in for-agents/, and src/config. The two files of src/shared it reaches
  // through src/config are in the settings closure copied above.
  for (const tool of ['where-is-the-api.mjs', 'agent-key.mjs', 'a-full-list-read.mjs', 'session-hook.mjs']) {
    cpSync(join(repo, 'for-agents', tool), join(checkout, 'for-agents', tool))
  }
  database = join(scratch, 'fake.db')
  writeFileSync(database, 'only its file identity is read')
  records = []
  holds = []
  reads = []
  writes = []
  delayBrief = 0
  delayResources = 0
  keptSays = null
  delaySetup = 0
  quietHandle = false
  closedBriefAfter = 0
  briefSentAt = null
  closedResourcesAfter = 0
  claudePid = null
  processSource = 'none'
  wrongStart = false
  wrongPid = false
  mentionsTheStart = false
  sessionsRunning = []
  onboardingProject = { id: 'robotics' }
  server = createServer((req, res) => {
    const path = req.url ?? ''
    const workspace = String(req.headers['x-mole-office-workspace'] ?? 'robotics')
    const began = performance.now()
    // The hook's own clock when it sent this read, which it sends while its clock is scaled (src/config/hook-clock-header.mjs).
    const sentAt = req.headers[HOOK_CLOCK_HEADER]
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    res.on('close', () => {
      // THE BRIEF READ'S END ON THE HOOK'S OWN CLOCK, LESS THE TIME THE SETUP READ WAS HELD HERE. The hook gives the read
      // up at a moment on its own clock, which counts from its process start. Counted from the moment the read arrived
      // here instead, each millisecond more of the hook's start (Node, its imports, its earlier reads) was a millisecond
      // less: with the start made 600 ms slower, it came to 2,076 ms where the case wants more than 2,450.
      if (path === '/api/where-you-stand') {
        briefSentAt = typeof sentAt === 'string' ? Number(sentAt) : null
        closedBriefAfter = (briefSentAt ?? Number.NaN) + (performance.now() - began) - delaySetup
      }
      if (path === '/api/resources') closedResourcesAfter = performance.now() - began
    })
    req.on('end', () => answerIt(req.method ?? 'GET', path, workspace, Buffer.concat(chunks).toString('utf8'), res))
  })
  const answerIt = (method: string, path: string, workspace: string, text: string, res: import('node:http').ServerResponse) => {
    let sent: unknown = null
    try { sent = text === '' ? null : JSON.parse(text) } catch { sent = text }
    if (method === 'GET') reads.push({ path, workspace })
    else writes.push({ path, workspace, method, body: sent })
    res.setHeader(WORLD_HEADER, formatWorldHeader({
      database: databaseIdentity(database).id, repository: checkout, port: '12345', head: 'fake', standing: 'scratch',
    }))
    res.setHeader('content-type', 'application/json')
    const realStart = () => {
      const start = claudePid === null ? null : startTimeOf(claudePid)
      return start === null ? null : localStampOf(start)
    }
    const processStamp = () => ({
      pid: wrongPid ? (claudePid ?? 0) + 1000 : claudePid,
      pidStartedAt: wrongStart ? '2000-01-01 00:00:00' : realStart(),
    })
    const rows = () => records.map((row) => processSource === 'stamp' && row.id === 'held-record'
      ? {
          ...row,
          data: {
            ...row.data,
            extra: { discovered: processStamp() },
            // A record whose words mention the real start time is found by the search all the same.
            ...(mentionsTheStart ? { detail: `the claude program began at ${String(realStart())}` } : {}),
          },
        }
      : row)
    // The office's search narrows by words anywhere in the record; the hook checks what it finds.
    const query = new URL(path, 'http://fake').searchParams
    const words = query.get('q')
    let body: unknown = { ok: true }
    let status = 200
    if (path.startsWith('/api/onboarding')) body = { project: onboardingProject, startFolder: { agents: [] } }
    else if (path.startsWith('/api/records?')) {
      body = {
        records: rows().filter((row) => (query.get('projects') === 'all' || row.workspaceId === workspace) &&
          (words === null || JSON.stringify(row).includes(words))),
      }
    }
    else if (path.startsWith('/api/records/')) {
      // AS THE OFFICE ANSWERS (src/server/lib/records.ts, recordInWorkspace): a record asked for under another
      // project is a 404 that names the project it is in; a PATCH writes only in the record's own project.
      const id = path.split('/').at(-1)
      const here = records.find((row) => row.id === id && row.workspaceId === workspace)
      const there = records.find((row) => row.id === id && row.workspaceId !== workspace)
      if (here === undefined) {
        status = 404
        body = there === undefined
          ? { error: `No record with id ${String(id)}.` }
          : { error: 'It is in another project.', elsewhere: { title: there.title, workspaceId: there.workspaceId, recordId: id } }
      } else {
        const patch = (sent as { dataPatch?: Record<string, unknown> } | null)?.dataPatch
        if (method === 'PATCH' && patch !== undefined) here.data = { ...here.data, ...patch }
        body = { record: rows().find((row) => row.id === id) }
      }
    }
    else if (path === '/api/records') body = { record: aRecord('new-record', conversation, workspace) }
    else if (path === '/api/handles' || path.startsWith('/api/handles?')) {
      const asked = new URL(path, 'http://fake')
      const sessions = asked.searchParams.get('session')?.split(',') ?? null
      const states = asked.searchParams.get('state')?.split(',') ?? null
      body = {
        holds: holds.filter((hold) =>
          (sessions === null || sessions.includes(hold.session)) &&
          (states === null || states.includes(hold.state))),
      }
    }
    else if (path.startsWith('/api/handles/')) body = { answering: null }
    else if (path === '/api/resources') body = { resources: [] }
    else if (path === '/api/sessions?only=running') body = { sessions: sessionsRunning }
    // THE BRIEF, THE WAITING COUNTS AND THE OPEN LOOPS COME IN ONE READ (wave 13n's round 39).
    else if (path === '/api/where-you-stand') {
      body = {
        brief: { head: 'The brief opening reached this session.' },
        waiting: { counts: { settle: 0, asked: 0, setAside: 0 } },
        openLoops: { loops: [] },
        workedOut: keptSays === null
          ? { at: '09:00:00', ageSeconds: 0, kept: false, tookMs: 5, says: 'This was worked out for this request.' }
          : { at: '08:59:20', ageSeconds: 40, kept: true, tookMs: 4200, says: keptSays },
      }
    }
    const delay = path === '/api/where-you-stand' ? delayBrief : path === '/api/resources' ? delayResources
      : path.startsWith('/api/onboarding') ? delaySetup : 0
    if (delay === 'never' || (quietHandle && path.startsWith('/api/handles/'))) return
    const answer = () => { res.statusCode = status; res.end(JSON.stringify(body)) }
    if (delay === 0) answer()
    else {
      const timer = setTimeout(() => { timers.delete(timer); answer() }, delay)
      timers.add(timer)
    }
  }
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('fake office has no port')
  api = `http://127.0.0.1:${String(address.port)}`
})

afterEach(async () => {
  for (const child of children.splice(0)) if (child.exitCode === null) child.kill()
  for (const timer of timers) clearTimeout(timer)
  timers.clear()
  server.closeAllConnections()
  await new Promise<void>((done) => server.close(() => done()))
  rmSync(scratch, { recursive: true, force: true })
})

function aRecord(id = 'held-record', providerSession = conversation, workspaceId = 'panelx'): RecordRow {
  return { id, workspaceId, kind: 'session', title: 'the held work', data: { state: 'running', providerSession } }
}
function heldRecord(providerSession = conversation, state = 'fresh') {
  records.push(aRecord('held-record', providerSession))
  holds.push({ session: 'held-record', handle: 'quill', state })
}
function note(id: string) {
  mkdirSync(join(checkout, '.logs'), { recursive: true })
  writeFileSync(join(checkout, '.logs', `session-${conversation}.json`), JSON.stringify({ id, at: 'before' }))
}
function notedId(): string {
  return theNote().id as string
}
function theNote(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(checkout, '.logs', `session-${conversation}.json`), 'utf8')) as Record<string, unknown>
}
async function run(options: {
  agent?: string; process?: 'walk' | 'fallback'; mode?: 'start' | 'stop' | 'end'; transcript?: boolean; defaultDetails?: boolean
  // null: the session's environment names no project. startIn: the directory the session says it started in.
  workspace?: string | null; startIn?: string
} = {}) {
  const env: NodeJS.ProcessEnv = {
    ...process.env, HOME: scratch, MOLE_OFFICE_API: api, MOLE_OFFICE_DB: database,
    MOLE_OFFICE_PORT: '12345', MOLE_OFFICE_WORKSPACE: options.workspace ?? 'robotics',
    MOLE_HOOK_DETAILS_FOLDER: join(scratch, 'hook-details'),
    MOLE_OFFICE_TEST_HOOK_CLOCK_SCALE: String(CLOCK_SCALE),
  }
  for (const key of ['MOLE_OFFICE_AGENT', 'MOLE_OFFICE_SESSION', 'MOLE_AGENT_KEY', 'CLAUDE_PID', 'TMUX_PANE']) delete env[key]
  if (options.defaultDetails === true) delete env['MOLE_HOOK_DETAILS_FOLDER']
  if (options.workspace === null) delete env['MOLE_OFFICE_WORKSPACE']
  if (options.agent !== undefined) env['MOLE_OFFICE_AGENT'] = options.agent
  const hook = join(checkout, 'tools/session-hook.mjs')
  const mode = options.mode ?? 'start'
  let program = process.execPath
  let args = [hook, mode]
  if (options.process !== undefined) {
    const standIn = join(scratch, 'claude')
    // Keep this shell alive above the hook so /proc names it claude.
    writeFileSync(standIn, '#!/bin/sh\n"$@"\n', { mode: 0o755 })
    program = standIn
    args = [process.execPath, hook, mode]
    if (options.process === 'fallback') {
      // setsid alone changes the session, not the parent chain. Keep a separate
      // claude stand-in waiting on stdin, and start the hook outside its ancestry.
      writeFileSync(standIn, '#!/bin/sh\nread ignored\n', { mode: 0o755 })
      const separateClaude = execFile(standIn, [], { env })
      children.push(separateClaude)
      claudePid = separateClaude.pid ?? null
      env['CLAUDE_PID'] = String(claudePid)
      program = process.execPath
      args = [hook, mode]
    }
  }
  // A TRANSCRIPT ON DISK, so stop can write the discovery stamp: the hook stamps only a file that is there.
  const transcript = options.transcript === true ? join(scratch, 'transcript.jsonl') : null
  if (transcript !== null) writeFileSync(transcript, '')
  const began = performance.now()
  const out = await new Promise<string>((resolve, reject) => {
    const child = execFile(program, args, { env, cwd: checkout, timeout: 12_000 }, (error, stdout, stderr) => {
      if (error !== null) reject(new Error(`${String(error)}\n${stderr}\n${stdout}`))
      else resolve(stdout)
    })
    children.push(child)
    if (options.process !== 'fallback') claudePid = options.process === undefined ? null : child.pid ?? null
    child.stdin?.end(JSON.stringify({ session_id: conversation, cwd: options.startIn ?? checkout, ...(transcript === null ? {} : { transcript_path: transcript }) }))
  })
  return { out, elapsed: performance.now() - began }
}
const named = (out: string) => expect(out).toContain('You are answering as the agent "quill" here.')
const unnamed = (out: string) => expect(out).toContain('The hook cannot tell which durable agent this session is')

it('brief at 3.5 s: restoring the fixed 3000 ms brief limit drops its opening', async () => {
  delayBrief = hookMs(3500)
  const { out } = await run()
  expect(out).toContain('The brief opening reached this session.')
  expect(out).not.toContain('did not answer the brief')
})
it('brief never answers: removing its finite deadline overruns 10 seconds', async () => {
  delayBrief = 'never'
  const { out, elapsed } = await run()
  expect(elapsed).toBeLessThan(hookMs(10_000))
  expect(readTheHookDetails(out)).toContain('did not answer the brief')
})
it('other reads keep 3 s: giving the resources read the brief limit delays its abort', async () => {
  delayResources = hookMs(8000)
  const { out } = await run()
  expect(out).toContain('The brief opening reached this session.')
  expect(closedResourcesAfter).toBeGreaterThan(hookMs(2800))
  expect(closedResourcesAfter).toBeLessThan(hookMs(3500))
})
it('elapsed budget and margin: dropping the 3500 ms reserve leaves no time for the handle read', async () => {
  delaySetup = hookMs(1000)
  delayBrief = 'never'
  quietHandle = true
  const { out, elapsed } = await run({ agent: 'environment' })
  expect(readTheHookDetails(out)).toContain('did not answer the brief')
  expect(briefSentAt, 'the hook sent its own clock with the brief read').not.toBeNull()
  expect(closedBriefAfter).toBeGreaterThan(hookMs(4900))
  expect(closedBriefAfter).toBeLessThan(hookMs(5700))
  expect(elapsed).toBeLessThan(hookMs(10_000))
})
it('provider session: removing providerSession ownership loses a held agent without a note', async () => {
  heldRecord()
  const { out } = await run()
  named(out)
  expect(out).toContain(`That record names this conversation in data.providerSession (${conversation}).`)
  expect(notedId()).toBe('held-record')
  expect(writes.filter((one) => one.path === '/api/records')).toEqual([])
})
it('process stamp: removing the waiter stamp match loses the held agent', async () => {
  heldRecord('different-conversation')
  processSource = 'stamp'
  const { out } = await run({ process: 'walk' })
  named(out)
  expect(out).toContain(`That record names this session's running claude program (pid ${String(claudePid)}, started `)
  expect(notedId()).toBe('held-record')
})
it('narrow reads: listing every session record instead of searching asks for the whole office', async () => {
  heldRecord()
  processSource = 'stamp'
  named((await run({ process: 'walk' })).out)
  const lists = reads.filter((one) => one.path.startsWith('/api/records?'))
  expect(lists.length).toBeGreaterThan(0)
  for (const one of lists) expect(new URL(one.path, 'http://fake').searchParams.get('q')).not.toBeNull()
})
it('CLAUDE_PID: using only the parent walk loses a detached hook whose waiter holds its handle', async () => {
  heldRecord('different-conversation')
  processSource = 'stamp'
  named((await run({ process: 'fallback' })).out)
})
it('one record: leaving thisStart on the old note stamps the wrong record and leaves the note wrong', async () => {
  heldRecord()
  records.push(aRecord('old-record', conversation, 'robotics'))
  note('old-record')
  const { out } = await run()
  named(out)
  expect(notedId()).toBe('held-record')
  expect(writes).toEqual([])
  expect(out).toContain('No new record was filed: the waiter holds this session\'s handle on record held-record')
  // A second start follows the repaired note, too.
  named((await run()).out)
  expect(notedId()).toBe('held-record')
  expect(writes).toEqual([])
})
it('held project: keeping the folder project reads the brief from robotics instead of panelx', async () => {
  heldRecord()
  note('old-record')
  const { out } = await run()
  named(out)
  expect(out).toContain('This session is in the project "panelx", from the record its waiter holds.')
  expect(reads.filter((one) => one.path === '/api/where-you-stand')).toEqual([{ path: '/api/where-you-stand', workspace: 'panelx' }])
  expect(reads.filter((one) => one.path === '/api/records/held-record').every((one) => one.workspace === 'panelx')).toBe(true)
})
it('two handles: choosing the first handle names someone when provider and process records disagree', async () => {
  heldRecord('different-conversation')
  processSource = 'stamp'
  records.push(aRecord('provider-record'))
  holds.push({ session: 'provider-record', handle: THE_TEST_OFFICES_SECRETARY.handle, state: 'fresh' })
  const { out } = await run({ process: 'walk' })
  unnamed(out)
  expect(out).toContain('2 handles are held')
  expect(out).not.toContain('You are answering as the agent')
})
it('environment still wins: reading the hold despite MOLE_OFFICE_AGENT replaces the environment name', async () => {
  heldRecord()
  const { out } = await run({ agent: 'environment' })
  expect(out).toContain('You are answering as the agent "environment" here.')
  expect(out).not.toContain('You are answering as the agent "quill" here.')
})
it('someone else: treating every held record as own names a foreign providerSession and process', async () => {
  heldRecord('somebody-else')
  processSource = 'stamp'
  wrongPid = true
  const { out } = await run({ process: 'walk' })
  unnamed(out)
  expect(out).not.toContain('You are answering as the agent')
})
it('process alone: using a process without a hold invents an agent', async () => {
  heldRecord('different-conversation')
  holds = []
  processSource = 'stamp'
  unnamed((await run({ process: 'walk' })).out)
})
it('kept hold: counting only fresh holds loses a kept handle', async () => {
  heldRecord(conversation, 'kept')
  named((await run()).out)
})
it('lapsed hold: counting lapsed holds names an agent whose waiter no longer holds it', async () => {
  heldRecord(conversation, 'lapsed')
  unnamed((await run()).out)
})
it('process start time: ignoring pidStartedAt names a reused pid the search found by its words', async () => {
  heldRecord('different-conversation')
  processSource = 'stamp'
  wrongStart = true
  mentionsTheStart = true
  unnamed((await run({ process: 'walk' })).out)
})
it('stop and end across projects: reading the noted record in the folder project loses the stamp and the close', async () => {
  // An agent's case (problem uEpCGFcsM4Z6; the refusal of check tGSC1GMzXgPv): the folder is robotics, the hold is on
  // a panelx record, and the note named a robotics record of this conversation before the takeover.
  heldRecord()
  records.push(aRecord('old-record', conversation, 'robotics'))
  note('old-record')
  named((await run()).out)
  expect(theNote()).toMatchObject({ id: 'held-record', workspace: 'panelx' })
  await run({ mode: 'stop', transcript: true })
  await run({ mode: 'end', transcript: true })
  // Wave 13p round 26: stop and end also write the usage receipt (milestone M8); those writes are set aside here, and the
  // last check below still holds them to the panelx project.
  const onHeld = writes.filter((one) => one.path === '/api/records/held-record' && (one.body as { dataPatch?: { usageReceipt?: unknown } } | undefined)?.dataPatch?.usageReceipt === undefined)
  expect(onHeld.map((one) => one.workspace)).toEqual(['panelx', 'panelx'])
  expect(onHeld[0]?.body).toMatchObject({ dataPatch: { extra: { discovered: { externalId: conversation } } } })
  expect(onHeld[1]?.body).toMatchObject({ dataPatch: { state: 'finished', closedHow: 'provider-event' } })
  expect([...reads, ...writes].filter((one) => one.path === '/api/records/held-record' && one.workspace !== 'panelx')).toEqual([])
})
it('the old record is closed: leaving it out of the note, or asking for it outside its project, leaves it open or detours', async () => {
  heldRecord()
  records.push(aRecord('old-record', conversation, 'robotics'))
  note('old-record')
  const { out } = await run()
  expect(out).toContain('The record the start was on before, old-record, names this conversation too')
  expect(theNote()).toMatchObject({ supersedes: 'old-record', supersedesWorkspace: 'robotics', supersededBecause: 'held' })
  reads = []
  await run({ mode: 'stop', transcript: true })
  const closed = writes.filter((one) => one.path === '/api/records/old-record')
  expect(closed).toHaveLength(1)
  expect(closed[0]).toMatchObject({ workspace: 'robotics', method: 'PATCH', body: { dataPatch: { state: 'finished' } } })
  const detail = String((closed[0]?.body as { dataPatch: { detail: unknown } }).dataPatch.detail)
  expect(detail).toContain('Superseded by held-record')
  expect(detail).toContain('which the hook took over and its note names now.')
  expect(detail).not.toContain('problem ')
  expect(reads.filter((one) => one.path === '/api/records/old-record').map((one) => one.workspace)).toEqual(['robotics'])
  expect(theNote()).toMatchObject({ id: 'held-record', workspace: 'panelx' })
  expect(theNote()).not.toHaveProperty('supersedes')
})
it("an old record of another conversation is left alone: superseding every record the note named would close someone's run", async () => {
  heldRecord()
  records.push(aRecord('old-record', 'another-conversation', 'robotics'))
  note('old-record')
  const { out } = await run()
  named(out)
  expect(out).toContain('The record the start was on before, old-record, does not name this conversation, so it is left as it is.')
  expect(theNote()).not.toHaveProperty('supersedes')
  await run({ mode: 'stop', transcript: true })
  expect(writes.filter((one) => one.path === '/api/records/old-record')).toEqual([])
})
it('a superseded record in another project is followed there: taking the 404 that names its project as gone leaves it open', async () => {
  // A note naming no project for the record it supersedes, as an older hook or tools/register-myself.mjs writes one.
  heldRecord()
  records.push(aRecord('old-record', conversation, 'robotics'))
  mkdirSync(join(checkout, '.logs'), { recursive: true })
  writeFileSync(join(checkout, '.logs', `session-${conversation}.json`),
    JSON.stringify({ id: 'held-record', at: 'before', workspace: 'panelx', supersedes: 'old-record' }))
  await run({ mode: 'stop', transcript: true })
  expect(writes.filter((one) => one.path === '/api/records/old-record')).toMatchObject([
    { workspace: 'robotics', method: 'PATCH', body: { dataPatch: { state: 'finished' } } },
  ])
  expect(theNote()).not.toHaveProperty('supersedes')
})

// PROBLEM vya7xFG93ern. On 6 October 2026 a start filed record u6-p8C0uzTF6 in panelx while two live records already
// named its conversation: the one its note named, moved to robotics that morning, and one in default. The start read the
// note's record in panelx and took the 404 for "no record", and its search for the conversation read panelx alone.
// Ruling T2Vy7Dt9_bil: this round finds the record in its own project (B) and files a new record in the project
// the start folder matched unless the session's own environment or its own .env names one (A).
const greenhouse = { kind: 'matched', id: 'greenhouse', because: 'The directory is inside a repository registered to greenhouse.' }
const filings = () => writes.filter((one) => one.path === '/api/records')
const standsIn = () => reads.filter((one) => one.path === '/api/where-you-stand').map((one) => one.workspace)

it("a note whose record moved is followed there: taking the 404 that names its project as no record leaves the session on none, or files a third", async () => {
  records.push(aRecord('moved-record', conversation, 'greenhouse'))
  records.push(aRecord('other-record', conversation, 'default'))
  note('moved-record')
  const { out } = await run()
  expect(filings()).toEqual([])
  expect(theNote()).toMatchObject({ id: 'moved-record', workspace: 'greenhouse' })
  expect(out).toContain('This session is already filed as record moved-record, from earlier in the same run.')
  expect(out).toContain('Record moved-record, which this session\'s note names, is in the project "greenhouse" now and not in ' +
    '"robotics", so the hook read it there and wrote that project into the note.')
  expect(out).toContain('This session is in the project "greenhouse", where the record its note names is.')
  expect(standsIn()).toEqual(['greenhouse'])
  // The next stop finds it through the note, and stamps it there.
  writes = []
  await run({ mode: 'stop', transcript: true })
  const onIt = writes.filter((one) => one.path === '/api/records/moved-record')
  expect(onIt.map((one) => one.workspace)).toContain('greenhouse')
  expect(onIt.every((one) => one.workspace === 'greenhouse')).toBe(true)
  expect(onIt[0]?.body).toMatchObject({ dataPatch: { extra: { discovered: { externalId: conversation } } } })
})
// ROUND 50, ITEM 3. Round 49 made the start follow a record moved to another project. A stop and an end asked only in the
// note's project, so a record moved during a session lost its stamp, its usage receipt and its close until the next start.
//   CONTROL  red on the hook before this change: the stop read the record in "robotics", was answered 404, and wrote nothing.
//   MUTATION the stop and the end follow the record but do not write its project into the note: red here.
//   MUTATION the stop and the end do not follow it: red here.
//   RESTORE  green, the hook restored byte-identical (cmp).
it("a record moved during the session is followed by stop and end: asking in the note's project alone loses the stamp and the close", async () => {
  records.push(aRecord('moved-record', conversation, 'greenhouse'))
  const notedIn = (project: string) => {
    mkdirSync(join(checkout, '.logs'), { recursive: true })
    writeFileSync(join(checkout, '.logs', `session-${conversation}.json`), JSON.stringify({ id: 'moved-record', at: 'before', workspace: project }))
  }
  const onIt = () => writes.filter((one) => one.path === '/api/records/moved-record')
  notedIn('robotics')
  await run({ mode: 'stop', transcript: true })
  expect(onIt().length, 'the stop wrote nothing on the record it moved').toBeGreaterThan(0)
  expect(onIt().map((one) => one.workspace)).toEqual(onIt().map(() => 'greenhouse'))
  expect(onIt()[0]?.body).toMatchObject({ dataPatch: { extra: { discovered: { externalId: conversation } } } })
  expect(theNote()).toMatchObject({ id: 'moved-record', at: 'before', workspace: 'greenhouse' })
  // The end follows it as well, with the note still naming the project it was moved from.
  notedIn('robotics')
  writes = []
  await run({ mode: 'end', transcript: true })
  const closes = onIt().filter((one) => (one.body as { dataPatch?: { state?: unknown } } | null)?.dataPatch?.state !== undefined)
  expect(closes.map((one) => one.workspace)).toEqual(['greenhouse'])
  expect(theNote()).toMatchObject({ id: 'moved-record', workspace: 'greenhouse' })
})
it('a live record in another project that names this conversation is taken over there: searching the asked project alone files a second', async () => {
  records.push(aRecord('elsewhere-record', conversation, 'greenhouse'))
  const { out } = await run()
  expect(filings()).toEqual([])
  expect(theNote()).toMatchObject({ id: 'elsewhere-record', workspace: 'greenhouse' })
  expect(out).toContain(`No new record was filed: record elsewhere-record was still open and already named this conversation (${conversation}), ` +
    'so the hook took it over and wrote its note for this session.')
  expect(out).toContain('This session is in the project "greenhouse", where the record it took over is.')
  // Taking it over stamps this process on it, and that read is made in its own project, as is every read after.
  expect(reads.filter((one) => one.path === '/api/records/elsewhere-record').map((one) => one.workspace)).toEqual(['greenhouse'])
  expect(standsIn()).toEqual(['greenhouse'])
})
it("a new record goes in the project its start folder matched: filing it in the hook's own project puts it where the session is not", async () => {
  onboardingProject = greenhouse
  const { out } = await run({ workspace: null })
  expect(filings()).toMatchObject([{ workspace: 'greenhouse', method: 'POST', body: { kind: 'session', data: { workspace: 'greenhouse' } } }])
  expect(theNote()).toMatchObject({ id: 'new-record', workspace: 'greenhouse' })
  expect(out).toContain('This directory is in the project "greenhouse".')
  expect(out).not.toContain("This session's record was filed in the project")
  expect(standsIn()).toEqual(['greenhouse'])
})
it("the environment's project comes before the start folder's: putting the folder first files the record outside the project the session was given", async () => {
  onboardingProject = greenhouse
  const { out } = await run()
  expect(filings()).toMatchObject([{ workspace: 'robotics', body: { data: { workspace: 'robotics' } } }])
  expect(theNote()).toMatchObject({ workspace: 'robotics' })
  expect(out).toContain('This directory is in the project "greenhouse".')
  expect(out).toContain('This session\'s record was filed in the project "robotics", the one its environment names (MOLE_OFFICE_WORKSPACE).')
})
it("a .env above a start folder outside the checkout comes before the folder: leaving it out files the record where that .env did not say", async () => {
  const elsewhere = join(scratch, 'elsewhere')
  mkdirSync(join(elsewhere, 'work'), { recursive: true })
  writeFileSync(join(elsewhere, '.env'), 'MOLE_OFFICE_WORKSPACE=panelx\n')
  onboardingProject = greenhouse
  const { out } = await run({ workspace: null, startIn: join(elsewhere, 'work') })
  expect(filings()).toMatchObject([{ workspace: 'panelx', body: { data: { workspace: 'panelx' } } }])
  expect(theNote()).toMatchObject({ workspace: 'panelx' })
  expect(out).toContain(`This session's record was filed in the project "panelx", the one ${join(elsewhere, '.env')} names (MOLE_OFFICE_WORKSPACE).`)
})
it("nothing names a project and the folder matched none: the record goes in the hook's own project for now, and leaving that unsaid files it in a silent default", async () => {
  // tests/the-hook-says-where-you-are.test.ts holds the rule this keeps: when nothing matched, the start asks the session
  // to name a project and never says the directory is in one (the 14 September 2026 failure). Until 13 October 2026 this
  // case also said the start never names the default, so the record went there with no word. The answer
  // IoAiAKB7s690: a record filed with no word is a silent default, so the start says where it is for now and how to move it.
  //   CONTROL  red on the hook before this change: no line said where the record was filed.
  //   MUTATION `whereItWasFiled` answers null when the folder matched no project, as before: red here.
  //   MUTATION the line says "This directory is in the project" for the project the record was filed in: red here.
  //   MUTATION the reason for the hook's own project left out of the line: red here.
  //   RESTORE  green, the hook restored byte-identical (cmp).
  onboardingProject = { kind: 'nothing-matched', id: null, because: 'No project has a repository or a work area here.' }
  const { out } = await run({ workspace: null })
  expect(filings()).toMatchObject([{ workspace: 'default' }])
  expect(out).toContain(`Nothing matched the directory "${checkout}" to a project, so none is assumed.`)
  expect(out).not.toContain('This directory is in the project')
  expect(out).toContain('This session\'s record was filed in the project "default" for now, because nothing named a project ' +
    'for it and that is the project this hook itself writes in. To move it, send POST /api/records/new-record/workspace ' +
    '{"to":"<project>"} with the header x-mole-office-workspace: default.')
})
it('where you stand goes last: sending it before the four small reads makes them wait behind it on the one thread', async () => {
  // Wave 13n's round 39: when the office has nothing kept for this session, GET /api/where-you-stand is the one slow read,
  // and the four small reads sent before it are answered before it holds the office's thread.
  await run()
  const stand = reads.findIndex((one) => one.path === '/api/where-you-stand')
  expect(stand).toBeGreaterThanOrEqual(0)
  for (const small of ['/api/resources/orphans', '/api/sessions?only=running', '/api/handles', '/api/resources']) {
    const at = reads.findIndex((one) => one.path === small || (small === '/api/handles' && one.path.startsWith('/api/handles?')))
    expect(at, small).toBeGreaterThanOrEqual(0)
    expect(at, small).toBeLessThan(stand)
  }
  expect(reads.map((one) => one.path)).not.toContain('/api/brief')
  expect(reads.map((one) => one.path)).not.toContain('/api/waiting')
  expect(reads.map((one) => one.path)).not.toContain('/api/open-loops')
})
it('a kept answer says how old it is: leaving out its sentence tells a session an old brief as if it were current', async () => {
  keptSays = 'This was worked out at 08:59:20, 40 seconds before this request, and kept.'
  const { out } = await run()
  const lines = out.split('\n')
  const says = lines.indexOf(keptSays)
  expect(says).toBeGreaterThanOrEqual(0)
  expect(says).toBeLessThan(lines.indexOf('The brief opening reached this session.'))
})
it('a fresh answer says nothing about age: printing the sentence for every answer calls a fresh brief kept', async () => {
  const { out } = await run()
  expect(out).toContain('The brief opening reached this session.')
  expect(out).not.toContain('This was worked out')
})
it('the one read missed: each of its three parts names the read that missed and the door that answers it alone', async () => {
  delayBrief = 'never'
  const { out } = await run()
  expect(readTheHookDetails(out)).toContain('Mole Office did not answer the brief, so this run was told nothing about the project. GET /api/brief.')
  expect(readTheHookDetails(out)).toMatch(/Could not read what is waiting on a person: GET \/api\/where-you-stand, which carries it, answered .+\. GET \/api\/waiting answers it alone\./)
  expect(readTheHookDetails(out)).toMatch(/did not answer what is still open, so this run knows nothing about it: GET \/api\/where-you-stand, which carries it, answered .+\. GET \/api\/open-loops answers it alone\./)
  expect(out).not.toMatch(/\d+ to settle/)
})

it('only running sessions: reading every session sends thousands of rows the hook drops, and under load past its limit', async () => {
  // Wave 13n's round 35 (BuHUg7uEz6WP): GET /api/sessions answers with every run, about 6,500 rows and 8.5 MB on a copy the
  // size of the live office, and the hook keeps only the rows in state "running". ?only=running answers exactly those
  // (isRunning in src/server/api/sessions.ts), so the runs line says the same from a fraction of the bytes.
  sessionsRunning = [{ recordId: 'someone-elses-run', state: 'running' }]
  const { out } = await run()
  expect(reads.map((one) => one.path)).toContain('/api/sessions?only=running')
  expect(reads.map((one) => one.path)).not.toContain('/api/sessions')
  expect(out).toContain('1 row says running with nothing behind them.')
})

it('a fresh hold is what makes a running row alive, even when no live resource names it', async () => {
  // The handles read now returns the holds themselves, not a reply object. A running row that only a
  // fresh hold stands behind must still be counted alive; reading the array as if it were the reply
  // finds no hold and tells the session the row has nothing behind it.
  sessionsRunning = [{ recordId: 'held-only-run', state: 'running' }]
  holds.push({ session: 'held-only-run', handle: 'quill', state: 'fresh' })
  const { out } = await run()
  expect(out).toContain('1 other agent run is alive.')
  expect(out).not.toContain('nothing behind them')
})

it('the resources read missed: a run it would have checked is not called empty, and the read is named', async () => {
  // Wave 13y round 22: at 00:54 on 11 October 2026 GET /api/resources and GET /api/handles both ran out of time on the
  // live office, and the hook still said "44 rows say running with nothing behind them", as if both had answered empty.
  sessionsRunning = [{ recordId: 'someone-elses-run', state: 'running' }]
  delayResources = hookMs(8000)
  const { out } = await run()
  expect(out).not.toContain('nothing behind them')
  expect(out).not.toContain('No other agent run is alive.')
  expect(out).toContain('Whether another agent run is alive is not known.')
  expect(out).toContain('1 row says running and could not be checked.')
  expect(out).toContain('Mole Office could not read GET /api/resources.')
  expect(readTheHookDetails(out)).toContain('Mole Office did not answer which registered processes are still running, so no run was found dead or alive by one.')
})

// MUTATION: the test-marked hook creates a temporary details folder again.
it('a test-marked hook writes no details anywhere when no details folder was named', async () => {
  delayBrief = 'never'
  const logs = join(checkout, '.logs')
  mkdirSync(logs, { recursive: true })
  const stamp = Date.now() - 100_000
  const names = Array.from({ length: 25 }, (_, i) => `session-start-${stamp + i}-123.txt`)
  for (const name of names) writeFileSync(join(logs, name), `Synthetic existing details ${name}`, { mode: 0o600 })
  const temporaryEntries = () => readdirSync(tmpdir()).filter((name) => name.startsWith('mole-office-hook-details-')).sort()
  const before = temporaryEntries()
  const { out } = await run({ defaultDetails: true })
  try {
    expect(temporaryEntries()).toEqual(before)
    expect(readdirSync(logs).filter((name) => name.startsWith('session-start-')).sort()).toEqual(names.sort())
    for (const name of names) expect(readFileSync(join(logs, name), 'utf8')).toBe(`Synthetic existing details ${name}`)
    expect(readdirSync(scratch, { recursive: true }).filter((name) => String(name).startsWith('hook-details/'))).toEqual([])
    expect(out).not.toContain('Details:')
    expect(out).toContain('Mole Office could not read GET /api/where-you-stand.')
    expect(out).toContain('Details were not kept because the test suite named no folder (MOLE_HOOK_DETAILS_FOLDER).')
  } finally {
    // A mutation may create one; remove only the folder this hook's own output names.
    const details = out.match(/Details: (.+)/)?.[1]
    if (details !== undefined && dirname(details).startsWith(join(tmpdir(), 'mole-office-hook-details-'))) rmSync(dirname(details), { recursive: true, force: true })
  }
})
