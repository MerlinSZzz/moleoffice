// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HOOK AFTER A COMPACTION FILES INTO ITS OFFICE.
 *
 * A run launched in a sandbox holds no key in its own environment: the launcher puts the run's key in the file
 * MOLE_OFFICE_TOOL_CONFIGURATION names, for the run's hooks. After a compaction the session hook reads the run its
 * environment names, but the office answering is another world's, so that read was refused, the launched check
 * answered null, and the hook printed the wrong-world warning and recorded nothing. Now the hook takes the key from
 * its office tool configuration when its environment holds none, and when that office holds this session's run as
 * launched in a sandbox that holds this checkout, the hook prints the role, rules and handover first, appends the
 * compaction to that run, and says which office it did that in. Measured with a stand-in office and the hook itself:
 *   1. at the start, the key from a mode-600 office tool configuration lets the hook read the run and say it in one
 *      quiet line; a mode-644 file gives no key, so the warning is printed, the file is named, and no request carries
 *      the key;
 *   2. after a compaction, a launched run is given its role first, then its rules and handover, and its compaction is
 *      appended to the run; no stamp is read or written;
 *   3. a run with no sandbox, a run in a sandbox that does not hold this checkout, and no run named each leave the
 *      warning exactly as it is with no run named, and write nothing;
 *   4. after a compaction, the one read has the time the budget leaves after the margin kept for the reads that follow.
 *
 * Each expected sentence comes from the stand-in or from the hook's own words in another case, so no sentence of the
 * hook is copied here. Every key and record here is made up. No request goes to the live office.
 *
 * MUTATIONS, in for-agents/session-hook.mjs, with the cases each turns red:
 *   - the key is taken only from the environment: cases 1a and 2 go red;
 *   - the office tool configuration is read without its ownership and mode checks: case 1b goes red;
 *   - after a compaction a launched run is said in one quiet line and exits: case 2 goes red, and the older test's case 2;
 *   - a launched run is stamped as before: case 2 goes red;
 *   - the warning's exit after a compaction is removed, so every other world goes on: case 3 goes red;
 *   - the one read's limit is four seconds again: case 4 goes red.
 */
import { spawn } from 'node:child_process'
import { chmodSync, existsSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { A_COMPACTION_REPORTED_BY_CLAUDE_CODE } from '../src/config/a-reported-compaction.mjs'
import { databaseIdentity } from '../src/config/database-identity.mjs'
import { KEY_HEADER } from '../src/config/key-header.mjs'
import { WORLD_HEADER, formatWorldHeader } from '../src/config/world-header.mjs'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const repo = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const hook = join(repo, 'tools/session-hook.mjs')
const MARK = 'MOLE OFFICE —'
const AGENT = 'aStandInAgent'
const RUN = 'aStandInRun'
const KEY = `a-stand-in-key-${Math.random().toString(36).slice(2)}`
const ANSWERED_AT = '2026-11-09 17:00:00'
const ROLE_SAYS = 'The stand-in says this session is its worker.'
const RULES_SAYS = 'The stand-in says these rules apply to this session.'
const HANDOVER_SAYS = 'The stand-in says this is what the session was doing.'
const HANDOVER_TEXT = 'Finish the stand-in work, then report it in the stand-in office.'
let scratch: string
let database: string
let port: string
let fake: Server | null
let api: string
let conversation: string
let asked: string[]
/** Whether each request carried the stand-in key, in the order asked. */
let carriedTheKey: boolean[]
/** What the stand-in answers to GET /api/records/<RUN>: a status and a body, or null for no such record. */
let theRun: { status: number; body: unknown } | null
/** The status the stand-in answered to the run read, or null because it was never asked. */
let answeredTheRunRead: number | null
/** What the stand-in says to the after-a-compaction read. */
let theAfterReply: unknown
/** What each PATCH to the run carried, parsed. */
let thePatches: unknown[]
/** The world header every reply from the stand-in carries. */
let theWorld: string
/** Whether the stand-in refuses every request without the key, but health. */
let keyIsRequired: boolean
/** How long the stand-in waits before answering the after-a-compaction read. */
let waitBeforeTheOneReadMs: number
let theToolFile: string

beforeEach(async () => {
  scratch = aTestDatabaseFolder('the-hook-after-a-compaction')
  database = join(scratch, 'stand-in.db')
  writeFileSync(database, 'a stand-in database file, only its identity is read')
  port = '12345'
  conversation = `the-hook-after-a-compaction-${Math.random().toString(36).slice(2)}`
  asked = []
  carriedTheKey = []
  theRun = null
  answeredTheRunRead = null
  thePatches = []
  keyIsRequired = true
  waitBeforeTheOneReadMs = 0
  // THE RUN'S OFFICE TOOL CONFIGURATION, as the launcher writes it: the key in the file, mode 600, and the run's own
  // agent and run named in it.
  theToolFile = join(scratch, 'office-mcp.json')
  writeFileSync(theToolFile, JSON.stringify({
    mcpServers: { mole_office: { env: { MOLE_OFFICE_AGENT: AGENT, MOLE_OFFICE_SESSION: RUN, MOLE_AGENT_KEY: KEY } } },
  }), { mode: 0o600 })
  chmodSync(theToolFile, 0o600)
  // ANOTHER WORLD ANSWERS, as the live office answers a sandbox's session: another database, checkout and port.
  theWorld = formatWorldHeader({
    database: '9999999999999999', repository: '/somewhere/else', port: '23456', head: 'abc1234', standing: 'canonical',
  })
  expect(databaseIdentity(database).id).not.toBe('9999999999999999')
  theAfterReply = {
    answeredAt: ANSWERED_AT,
    role: { says: ROLE_SAYS },
    rules: { says: RULES_SAYS },
    handover: { says: HANDOVER_SAYS, current: { text: HANDOVER_TEXT } },
    run: { id: RUN, title: 'a launched round', state: 'running', stamped: false, discovered: null, compactions: [] },
  }
  fake = createServer((req, res) => {
    const method = req.method ?? ''
    const url = req.url ?? ''
    asked.push(`${method} ${url}`)
    carriedTheKey.push(req.headers[KEY_HEADER] === KEY)
    const answer = (status: number, body: unknown): void => {
      res.statusCode = status
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(body))
    }
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      res.setHeader(WORLD_HEADER, theWorld)
      if (method === 'GET' && url === '/api/health') {
        answer(200, { ok: true })
        return
      }
      if (keyIsRequired && req.headers[KEY_HEADER] !== KEY) {
        answer(403, { error: 'the stand-in answers this request only with the run’s key' })
        return
      }
      if (method === 'GET' && (url === '/api/after-a-compaction' || url === `/api/after-a-compaction?run=${RUN}`)) {
        const reply = (): void => answer(200, theAfterReply)
        if (waitBeforeTheOneReadMs > 0) {
          const timer = setTimeout(reply, waitBeforeTheOneReadMs)
          res.on('close', () => clearTimeout(timer))
        } else reply()
        return
      }
      if (method === 'GET' && url === `/api/records/${RUN}`) {
        answeredTheRunRead = theRun?.status ?? 404
        answer(answeredTheRunRead, theRun?.body ?? { error: 'the stand-in holds no such record' })
        return
      }
      if (method === 'PATCH' && url === `/api/records/${RUN}`) {
        const text = Buffer.concat(chunks).toString()
        thePatches.push(text === '' ? null : JSON.parse(text))
        answer(200, { record: { id: RUN } })
        return
      }
      if (method === 'GET' && url === '/api/where-you-stand') {
        answer(200, {})
        return
      }
      answer(404, { error: 'the stand-in holds no such door' })
    })
  })
  await new Promise<void>((done) => fake!.listen(0, '127.0.0.1', done))
  const address = fake.address()
  if (address === null || typeof address === 'string') throw new Error('the stand-in has no port')
  api = `http://127.0.0.1:${String(address.port)}`
})

afterEach(async () => {
  if (fake !== null) await new Promise<void>((done) => fake!.close(() => done()))
  rmSync(join(repo, '.logs', `session-${conversation}.json`), { force: true })
  rmSync(scratch, { recursive: true, force: true })
})

/** A run record as the stand-in holds it. */
function aRun(kind: string, sandbox: unknown): { status: number; body: unknown } {
  return {
    status: 200,
    body: {
      record: {
        id: RUN,
        kind,
        title: 'a launched round',
        data: { state: 'running', ...(sandbox === undefined ? {} : { sandbox }) },
      },
    },
  }
}
const aSandbox = (folder: string) => ({ template: 'mole-office-dev', container: 'aContainerRow', folder })

interface Ran {
  out: string
  err: string
}

/**
 * The hook, started as Claude Code starts it, with the run's agent and office tool configuration named unless a case
 * takes them out. `source` is the SessionStart source.
 */
function runHook(options: {
  source?: string
  agent?: string | null
  session?: string | null
  toolConfiguration?: string | null
  clockScale?: number
} = {}): Promise<Ran> {
  const { source, agent = AGENT, session = RUN, toolConfiguration = theToolFile, clockScale } = options
  return new Promise((done, fail) => {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: scratch,
      MOLE_OFFICE_API: api,
      MOLE_OFFICE_PORT: port,
      MOLE_OFFICE_DB: database,
      MOLE_HOOK_DETAILS_FOLDER: join(scratch, 'hook-details'),
      MOLE_OFFICE_WORKSPACE: 'default',
    }
    for (const name of ['MOLE_OFFICE_AGENT', 'MOLE_OFFICE_SESSION', 'MOLE_AGENT_KEY', 'MOLE_AGENT_KEY_FILE',
      'MOLE_OFFICE_TOOL_CONFIGURATION', 'TMUX_PANE', 'MOLE_OFFICE_TEST_HOOK_CLOCK_SCALE']) delete env[name]
    if (agent !== null) env['MOLE_OFFICE_AGENT'] = agent
    if (session !== null) env['MOLE_OFFICE_SESSION'] = session
    if (toolConfiguration !== null) env['MOLE_OFFICE_TOOL_CONFIGURATION'] = toolConfiguration
    if (clockScale !== undefined) env['MOLE_OFFICE_TEST_HOOK_CLOCK_SCALE'] = String(clockScale)
    const child = spawn(process.execPath, [hook, 'start'], { cwd: repo, env })
    let out = ''
    let err = ''
    child.stdout.on('data', (chunk: Buffer) => { out += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { err += chunk.toString() })
    child.on('error', fail)
    child.on('close', (code) => code === 0
      ? done({ out: out.trim(), err })
      : fail(new Error(`hook exited ${String(code)}: ${err}`)))
    child.stdin.end(JSON.stringify({ session_id: conversation, ...(source === undefined ? {} : { source }) }))
  })
}

const writes = () => asked.filter((one) => !one.startsWith('GET '))
const note = () => join(repo, '.logs', `session-${conversation}.json`)

/** The hook's words, and what it asked, with no run and no office tool configuration named: the warning as it was before. */
async function theWarning(source?: string): Promise<{ said: string; asked: string[] }> {
  const { out } = await runHook({ agent: null, session: null, toolConfiguration: null, source })
  const then = [...asked]
  asked = []
  carriedTheKey = []
  return { said: out, asked: then }
}

describe('the hook after a compaction files into its office', () => {
  it('1a: at the start, the key from a mode-600 office tool configuration reads the run and says it in one quiet line', async () => {
    theRun = aRun('session', aSandbox(dirname(repo)))
    const { out, err } = await runHook()
    expect(out).not.toContain('\n')
    expect(out.startsWith(`${MARK} `)).toBe(true)
    expect(out).toContain(RUN)
    expect(asked).toEqual(['GET /api/health', `GET /api/records/${RUN}`])
    expect(answeredTheRunRead).toBe(200)
    expect(out + err).not.toContain(KEY)
  })

  it('1b: at the start, a mode-644 office tool configuration gives no key, so the warning is printed and the file is named', async () => {
    chmodSync(theToolFile, 0o644)
    const warning = await theWarning()
    const { out, err } = await runHook()
    expect(out).toBe(warning.said)
    expect(carriedTheKey).not.toContain(true)
    expect(writes()).toEqual([])
    expect(existsSync(note())).toBe(false)
    expect(err).toContain(theToolFile)
    expect(out + err).not.toContain(KEY)
  })

  it('2: after a compaction, a launched run is given its role first and its compaction is filed into the office that holds it', async () => {
    const warning = await theWarning('compact')
    theRun = aRun('session', aSandbox(dirname(repo)))
    const { out, err } = await runHook({ source: 'compact' })
    const firstLineOfTheWarning = warning.said.split('\n')[0]!
    const itsOpening = firstLineOfTheWarning.slice(0, firstLineOfTheWarning.indexOf('.') + 1)
    expect(itsOpening.startsWith(`${MARK} `)).toBe(true)
    const lines = out.split('\n')
    expect(lines[0]!.startsWith(`${itsOpening} `)).toBe(true)
    expect(lines[0]).toContain(ROLE_SAYS)
    expect(out).toContain(RULES_SAYS)
    expect(out).toContain(HANDOVER_SAYS)
    expect(out).toContain(HANDOVER_TEXT)
    expect(out).not.toContain(warning.said.split('\n')[1]!)
    expect(asked).toEqual([
      `GET /api/after-a-compaction?run=${RUN}`,
      `GET /api/records/${RUN}`,
      `PATCH /api/records/${RUN}`,
      'GET /api/where-you-stand',
    ])
    expect(thePatches).toEqual([
      { dataPatch: { compactions: [{ at: ANSWERED_AT, what: A_COMPACTION_REPORTED_BY_CLAUDE_CODE }] } },
    ])
    expect(out + err).not.toContain(KEY)
  })

  it.each([
    ['a run with no sandbox', () => aRun('session', undefined)],
    ['a run in a sandbox whose folder does not hold this checkout', () => aRun('session', aSandbox(join(dirname(repo), 'another-sandbox')))],
  ])('3: after a compaction, %s leaves the warning exactly as it is with no run named', async (_, run) => {
    const warning = await theWarning('compact')
    theRun = run()
    const { out } = await runHook({ source: 'compact' })
    expect(out).toBe(warning.said)
    expect(writes()).toEqual([])
    expect(existsSync(note())).toBe(false)
  })

  it('3: after a compaction with no run named, the warning is exactly as it is with no run named', async () => {
    const warning = await theWarning('compact')
    const { out } = await runHook({ source: 'compact', session: null })
    expect(out).toBe(warning.said)
    expect(writes()).toEqual([])
    expect(existsSync(note())).toBe(false)
  })

  it('4: after a compaction, the one read has the time the budget leaves, not four seconds', async () => {
    // THIS CHECKOUT'S DECLARED WORLD ANSWERS, with no agent, run or key, and the reply names no run.
    theWorld = formatWorldHeader({
      database: databaseIdentity(database).id, repository: repo, port, head: 'abc1234', standing: 'canonical',
    })
    keyIsRequired = false
    theAfterReply = {
      answeredAt: ANSWERED_AT,
      role: { says: ROLE_SAYS },
      rules: { says: RULES_SAYS },
      handover: { says: HANDOVER_SAYS, current: { text: HANDOVER_TEXT } },
    }
    const answered = () => runHook({ source: 'compact', agent: null, session: null, toolConfiguration: null, clockScale: 2 })
    // CONTROL: the world header is taken as this checkout's, so an answer at once gives the role first.
    const control = await answered()
    expect(control.out.split('\n')[0]!).toContain(ROLE_SAYS)
    // THE OLD LIMIT WAS EIGHT SECONDS AT THIS SCALE. This answer takes 8500 ms.
    waitBeforeTheOneReadMs = 8_500
    const slow = await answered()
    expect(slow.out.split('\n')[0]!).toContain(ROLE_SAYS)
  }, 30_000)
})
