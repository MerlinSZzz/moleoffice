// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A labelled stand-in office and repository. No model and no live office are used. */
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import type { FastifyInstance } from 'fastify'
import { KEY_HEADER } from '../src/config/key-header.mjs'
import { keysPathFrom } from '../src/config/settings.mjs'
import { THE_MOST_RECORDS_A_CHECK_CARRIES } from '../src/config/check-records.mjs'
import { THE_MOST_DECISIONS_A_CHECK_CARRIES } from '../src/config/check-records.mjs'
import { FROM_THE_CONTAINER_TO_THE_HOST } from './container-path-on-the-host.ts'

/**
 * A native executable stand-in's probe. Commands and record reads are real.
 * Outside-write decisions interpret received native flags or synthetic Docker mounts;
 * they are NOT evidence that a native sandbox or an OS mount enforced a refusal.
 * A host path is compared with a mount's host source, and a container path with its container destination: a check runs
 * with TMPDIR /check/tmp, so a test's host paths can lie under a container destination too (refusal lKszwtLUB9C0).
 * recordFiles are container paths, mapped to the host once; heldOnTheHost are host paths already, and are not mapped.
 */
export const INSPECTOR_VERIFICATION_PROBE = String.raw`
function verificationProbe(program, argv, workFile, recordFiles, outsidePaths = [], heldOnTheHost = []) {
  const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process')
  const flag = name => argv.includes(name) ? argv[argv.indexOf(name) + 1] : null
  const codex = program === 'codex'
  const mounts = JSON.parse(process.env.INSPECTOR_TEST_MOUNTS ?? '[]')
  const inContainer = mounts.length > 0
  const sameDirectory = given => given !== null && fs.realpathSync(given) === fs.realpathSync(process.cwd())
  const nativeReadOnlyContract = codex && !inContainer && flag('-s') === 'read-only' && flag('-a') === 'never'
    && argv.includes('sandbox_mode="read-only"') && argv.includes('approval_policy="never"') && !argv.includes('--add-dir')
  const nativeWriteContract = codex
    ? inContainer && flag('-s') === 'danger-full-access' && flag('-a') === 'never' && sameDirectory(flag('-C'))
        && !argv.includes('sandbox_mode="read-only"') && !argv.includes('sandbox_mode="workspace-write"') && !argv.includes('--add-dir')
    : flag('--permission-mode') === 'bypassPermissions' && flag('--tools') === 'default'
      && argv.includes('--strict-mcp-config') && flag('--mcp-config') === '{"mcpServers":{}}'
  const toTheHost = ${FROM_THE_CONTAINER_TO_THE_HOST}
  const onTheHost = recordFiles.map(file => toTheHost(file, mounts.map(m => [m.Destination, m.Source]))).concat(heldOnTheHost)
  const opened = onTheHost.map(file => {
    if (!codex && flag('--add-dir') !== path.dirname(file)) return { file, error: 'Synthetic record-directory permission refusal' }
    try { const held = JSON.parse(fs.readFileSync(file, 'utf8')); return { file, id: held.id, kind: held.kind, data: held.data ?? null } }
    catch (error) { return { file, error: String(error.code ?? error) } }
  })
  const before = fs.readFileSync(workFile)
  let shellOutput = null, ownTestExits = []
  if (nativeWriteContract) {
    const test = () => cp.spawnSync(process.execPath, ['-e', 'process.exit(require("fs").readFileSync(process.argv[1]).toString("base64") === process.argv[2] ? 0 : 1)', workFile, before.toString('base64')]).status
    ownTestExits.push(test())
    fs.writeFileSync(workFile, 'Synthetic red mutation\n')
    ownTestExits.push(test())
    fs.writeFileSync(workFile, before)
    ownTestExits.push(test())
    shellOutput = cp.execFileSync('sh', ['-c', 'cp "$1" "$1.probe-backup"; printf "Synthetic mutation\\n" > "$1"; cat "$1"; mv "$1.probe-backup" "$1"', 'synthetic-check', workFile], { encoding: 'utf8' })
  }
  const outside = outsidePaths.map(file => {
    const within = (inner, outer) => { const r = path.relative(outer, inner); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)) }
    const mount = mounts.filter(m => m.Source && within(file, m.Source)).sort((a, b) => b.Source.length - a.Source.length)[0]
    const decision = nativeReadOnlyContract ? 'native-contract-refusal'
      : mount === undefined ? 'unreachable' : mount.Type === 'tmpfs' ? 'unreachable'
      : mount.RW === false ? 'read-only-mount-contract' : 'writable'
    return { file, decision, evidence: 'Stand-in interpretation; no OS refusal was tested' }
  })
  let dependencies = null
  const dep = path.join(process.cwd(), 'node_modules', 'fixture-dependency', 'index.js')
  if (inContainer && fs.existsSync(dep)) {
    const original = fs.readFileSync(dep)
    const test = () => cp.spawnSync(process.execPath, ['-e', 'process.exit(require(process.argv[1]) === 42 ? 0 : 1)', dep]).status
    const exits = [test()]
    fs.writeFileSync(dep, 'module.exports = 43\n'); exits.push(test())
    fs.writeFileSync(dep, original); exits.push(test())
    dependencies = { physical: !fs.lstatSync(path.join(process.cwd(), 'node_modules')).isSymbolicLink() && fs.statSync(dep).nlink === 1, containedLink: fs.realpathSync(path.join(process.cwd(), 'node_modules', '.bin', 'fixture-dependency')).startsWith(process.cwd() + '/node_modules/'), exits }
  }
  const independentGit = inContainer && fs.existsSync(path.join(process.cwd(), '.git')) ? { directory: fs.lstatSync(path.join(process.cwd(), '.git')).isDirectory(), alternates: fs.existsSync(path.join(process.cwd(), '.git/objects/info/alternates')), common: fs.existsSync(path.join(process.cwd(), '.git/commondir')) } : null
  const protectedInputs = onTheHost.map(file => ({ file, readonly: mounts.some(m => m.RW === false && (file === m.Source || file.startsWith(m.Source + '/'))), evidence: 'Synthetic mount contract only' }))
  return { dependencies, independentGit, protectedInputs, ownTestExits, nativeReadOnlyContract, nativeWriteContract, opened, shellOutput, restored: fs.readFileSync(workFile).equals(before), outside }
}
`

/**
 * Exercise the real record writer without executing the inspector's top-level CLI.
 * Today's source caps sum to less than the aggregate ceiling. This labelled fixture
 * enlarges only the session-task source cap to reach aggregate overflow. Files are
 * real; there is no model, network, or substitute implementation of the writer.
 */
export async function writeManyRecordsFixture(folder: string, count: number, unread = 0) {
  const source = readFileSync(join(process.cwd(), 'tools/the-inspector.mjs'), 'utf8')
  const start = source.indexOf('async function writeTheRecordsForTheModel(')
  if (start < 0) throw new Error('The inspector record writer was not found')
  const end = source.indexOf('\n}\n', start) + 3
  const tasks = Array.from({ length: count }, (_, n) => ({ record: { id: `taskN${String(n).padStart(7, '0')}`, kind: 'task', title: `Fixture task ${n}` } }))
  const notUsed = () => { throw new Error('This fixture must read only the records held whole in the brief') }
  const write = runInNewContext(`(${source.slice(start, end)})`, {
    rmSync, mkdirSync, writeFileSync, join,
    THE_MOST_RECORDS_A_CHECK_CARRIES,
    THE_MOST_DECISIONS_A_CHECK_CARRIES,
    THE_MOST_OF_ONE_SORT: count + unread,
    THE_MOST_WORDS_ASKED: 0,
    theTextsIn: notUsed, askAndHear: notUsed,
    process: { stdout: { write: () => {} } },
  }) as (reads: unknown, folder: string) => Promise<{
    written: { path: string; id: string; kind: string; title: string; as: string }[]
    couldNotCarry: { id: string; as: string; why: string }[]
  }>
  return write({ brief: { sessionTasks: [...tasks, ...Array.from({ length: unread }, () => ({ record: { id: 'not/plain' } }))] } }, folder)
}

/** A labelled stand-in for the seat doors when a case is about other check behavior. */
export function aFixtureSeatDoor(request: IncomingMessage, reply: ServerResponse): boolean {
  if (request.method !== 'POST') return false
  const answer = request.url === '/api/slots/acquire'
    ? { slot: { id: 'fixture-test-seat', state: 'granted' }, asked: 'new', says: 'Fixture seat granted.' }
    : request.url === '/api/slots/fixture-test-seat/release' ? { released: true, id: 'fixture-test-seat' } : null
  if (answer === null) return false
  request.resume()
  reply.setHeader('content-type', 'application/json')
  reply.end(JSON.stringify(answer))
  return true
}

/** Only the seat doors are synthetic; the rest of this test office remains real. */
export function giveFixtureSeats(app: FastifyInstance): void {
  app.addHook('onRequest', async (request, reply) => {
    if (request.method !== 'POST') return
    if (request.url === '/api/slots/acquire') {
      return reply.send({ slot: { id: 'fixture-test-seat', state: 'granted' }, asked: 'new', says: 'Fixture seat granted.' })
    }
    if (request.url === '/api/slots/fixture-test-seat/release') {
      return reply.send({ released: true, id: 'fixture-test-seat' })
    }
  })
}

/** A made-up office key beside a database path owned by this fixture. */
export function fixtureOfficeDatabase(home: string): string {
  const file = join(home, 'fixture.db')
  writeFileSync(keysPathFrom({ MOLE_OFFICE_DB: file }), JSON.stringify({ office: 'synthetic-office-key' }))
  return file
}

let checksNamed = 0
/**
 * A made-up session for a check that runs a model, which must name one with --check (gap 2, hYSaAc6dw4_Y). It has
 * a record id's shape, so the verdict door reads it, and it names no record. Each call gives a new one, so two checks of
 * one run do not share a worktree folder.
 */
export const aMadeUpCheckSession = () => `synthChk${String(++checksNamed).padStart(4, '0')}`

/**
 * THE SELECTION AN OFFICE OF THIS BRANCH GIVES A CHECK beside its model, when the inspector's Casting row carries native
 * data that names the model (answer() in src/server/lib/run-models.ts). The row's id and revision are made up. A run-models
 * answer without one stands for an older office, or a row with no native data, and the tool then goes by the
 * compatibility list, which names none of the made-up models here.
 */
export function aCheckRowsSelection(model: string, effort: string | null = null) {
  return { runtime: 'claude-code', model, native: { model, provider: null, variant: null, effort }, casting: { id: 1, revision: 'a-made-up-revision' } }
}

/**
 * THE INSPECTOR'S CASTING ROW IN A REAL TEST OFFICE, given native data that names `model` for Claude Code, so that office,
 * which is of this branch, answers a check with the row's selection. The row in force for the headers' workspace is
 * changed when there is one, and one is added when there is none. `asThePerson` are the test's own headers for the person,
 * who casts a role, with its workspace and, where its office holds one, the person's key.
 */
export async function theInspectorsRowNames(app: FastifyInstance, model: string, asThePerson: Record<string, string>): Promise<void> {
  const workspace = asThePerson['x-mole-office-workspace'] ?? 'default'
  const row = { program: { value: 'claude-code' }, model: { value: model }, effort: { value: null }, native: { model, provider: null, variant: null } }
  const taken = (await app.inject({ method: 'GET', url: `/api/casting/for/inspector?project=${encodeURIComponent(workspace)}`, headers: asThePerson })).json() as { casting: { id: number } | null }
  const written = taken.casting === null
    ? await app.inject({ method: 'POST', url: '/api/casting/inspector', headers: asThePerson, payload: row })
    : await app.inject({ method: 'PATCH', url: `/api/casting/rows/${String(taken.casting.id)}`, headers: asThePerson, payload: row })
  if (written.statusCode !== 200 && written.statusCode !== 201) throw new Error(`The inspector's Casting row was not written: ${written.body}`)
}

export async function inspectorFixture() {
  // Problem h09tYuNl1nd9; Vv6h0HVryXOe: each fixture owns its home, inside the checkout for API readers.
  mkdirSync(join(process.cwd(), '.logs'), { recursive: true })
  const home = mkdtempSync(join(process.cwd(), '.logs', 'inspector-tool-fixture-'))
  const fixtureDatabase = fixtureOfficeDatabase(home)
  const checkout = join(home, 'worker')
  mkdirSync(checkout)
  const git = (...args: string[]) => execFileSync('git', args, { cwd: checkout, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '-q', '-b', 'main')
  git('config', 'user.name', 'A fixture')
  git('config', 'user.email', 'fixture@example.invalid')
  writeFileSync(join(checkout, 'work'), 'Before\n')
  git('add', '.')
  git('commit', '-qm', 'Fixture base')
  const base = git('rev-parse', 'HEAD')
  git('checkout', '-qb', 'the-work')
  writeFileSync(join(checkout, 'work'), 'After\n')
  git('commit', '-qam', 'Fixture work')
  const state = {
    cutFrom: 'main',
    forwardTo: undefined as string | undefined,
    writes: [] as { path: string; body: Record<string, any> }[],
    onPrompt: undefined as undefined | (() => Promise<void>),
    modelPrompt: 'Fixture, not a real check.',
    readDelayMs: 0,
    /** Tj0gSo-y1I6h: a test may stop its own listener or drop an accepted request. True means it handled the reply. */
    onRequest: undefined as undefined | ((request: IncomingMessage, reply: ServerResponse) => boolean | void),
    requests: [] as { method: string; path: string }[],
    onAssembled: undefined as undefined | ((body: Record<string, any>, check?: string) => Promise<void>),
    // WHAT THE RUN'S READING CARRIES AS ITS SUBMISSION AND ITS AREA. Unset: no seal, and the area the
    // fixture's own repository changes. A files seal's check is tested by setting both.
    submission: undefined as undefined | Record<string, any>,
    workArea: ['work'] as string[],
    /**
     * WHAT THE STAND-IN ANSWERS WHEN A NEEDS-JUDGMENT LIST IS POSTED TO THE PROMPT DOOR. The real door keeps the
     * paths the sealed change touches and drops the rest (whatNeedsJudgment in src/server/lib/inspection.ts).
     * Undefined: the paths the posted changes name, which is that rule; null: no list at all, which a test uses to
     * drive the tool into its stop; a list: exactly those paths are kept and the rest dropped.
     */
    judgedPaths: undefined as string[] | null | undefined,
    /** The handed-back packages the prompt door lists; unset leaves the answer exactly as it was. */
    packages: undefined as undefined | { packages: { task: string; title: string; points: { pointId: string; says: string | null; outcome: 'done' | 'part' | 'not'; words: string }[] }[]; unread: { task: string; title: string }[] },
    /** The run's agent's files area, as the office's check door hands it for a files seal (acceptance finding 52). */
    filesArea: undefined as undefined | { written: string; resolved: string }[],
    /**
     * WHAT GET /api/records/created-between ANSWERS, as the door's list. Empty until a test sets it.
     * The tool asks this door for the window its model ran in; the default of nothing is the honest
     * answer for a test that runs no model.
     */
    createdBetween: [] as Record<string, any>[],
    /**
     * HOW MANY RECORDS THE WINDOW DOOR SAYS IT MATCHED, when a test wants a window the door cut short. Null
     * is a window it listed whole. More than the list is a door that answers `truncated`.
     */
    createdBetweenMatched: null as number | null,
    /**
     * WHAT GET /api/office/run-models/for/<agent> ANSWERS, criterion U2: the model the office gives a
     * check when the tool is started with no --model. A test sets it to what its office would name;
     * `modelAsked` holds every path the tool asked, so a test can read which agent and place it named.
     * Unset, it is an office of this branch whose inspector row names a made-up model with native data, and so gives
     * the row's selection. A test that sets it without a selection stands for an older office.
     */
    checkModel: {
      model: 'the-fixture-office-model', from: 'the role', says: "The fixture office's Casting row names this model.",
      selection: aCheckRowsSelection('the-fixture-office-model'),
    } as Record<string, unknown>,
    modelAsked: [] as string[],
    /** THE OFFICE KEY HEADER ON EVERY REQUEST THE TOOL MADE, or undefined where it sent none. Held in memory, never printed. */
    keysSent: [] as (string | undefined)[],
    /**
     * WHAT THE RUN'S READING NAMES FOR THE CHECK'S MODEL (problem YxzFRQIpx9Pz): its reports by id, what its agent wrote and
     * its brief. Unset, the reading names none of them, as before.
     */
    reading: {} as { reports?: { id: string; title: string }[]; wrote?: { id: string; kind: string; title: string; when: string }[]; brief?: Record<string, unknown> },
    /**
     * WHAT GET /api/records/<id> ANSWERS for the records the tool reads whole for its model, by id: a status and a body. An id
     * not here is answered as every other read is. A key `<project>:<id>` answers only a read asked in that project (the
     * x-mole-office-workspace header), and comes before the id alone, so a test can file a record in another project.
     */
    records: {} as Record<string, { status: number; body: Record<string, unknown> }>,
    /** EACH READ OF ONE RECORD, with the project it was asked in, in the order asked. */
    recordReads: [] as { id: string; project: string | undefined }[],
  }
  const office = createServer(async (request, reply) => {
    state.requests.push({ method: request.method ?? 'GET', path: request.url ?? '' })
    if (state.onRequest?.(request, reply) === true) return
    const key = request.headers[KEY_HEADER]
    state.keysSent.push(typeof key === 'string' ? key : undefined)
    reply.setHeader('content-type', 'application/json')
    // Tests of the seat door can override the fixture's grant in onRequest.
    if (aFixtureSeatDoor(request, reply)) return
    // A real-office mode lets browser cases use the actual tool and API while controlling
    // the instant after assembly, before the tool is allowed to clean up its worktree.
    if (state.forwardTo !== undefined) {
      try {
        let raw = ''
        for await (const part of request) raw += String(part)
        const headers = Object.fromEntries(Object.entries(request.headers).filter(([key, value]) =>
          key.startsWith('x-mole-office-') && typeof value === 'string')) as Record<string, string>
        headers['content-type'] = 'application/json'
        const response = await fetch(`${state.forwardTo}${request.url}`, {
          method: request.method ?? 'GET', headers, ...(raw === '' ? {} : { body: raw }),
        })
        const text = await response.text()
        if (response.ok && request.url?.endsWith('/assembled')) {
          const check = request.headers['x-mole-office-session']
          await state.onAssembled?.(JSON.parse(raw) as Record<string, any>, typeof check === 'string' ? check : undefined)
        }
        reply.statusCode = response.status
        reply.end(text)
      } catch (error) {
        reply.statusCode = 502
        reply.end(JSON.stringify({ error: `Fixture proxy failed: ${String(error)}` }))
      }
      return
    }
    if (request.url?.endsWith('/eligibility')) return reply.end(JSON.stringify({ eligible: true }))
    // THE MODEL DOOR, answered at once and never delayed: a test of the read delay is about the
    // check's own reads, and this is asked before any of them.
    if (request.url?.startsWith('/api/office/run-models/for/')) {
      state.modelAsked.push(request.url)
      return reply.end(JSON.stringify({ runtime: 'claude-code', ...state.checkModel }))
    }
    // THE WINDOW DOOR the tool asks after its model ends. A test sets `state.createdBetween` to the
    // rows the office would list; the default is an empty window, which is a model that wrote nothing.
    if (request.url?.startsWith('/api/records/created-between')) {
      return reply.end(JSON.stringify({
        records: state.createdBetween,
        matched: state.createdBetweenMatched ?? state.createdBetween.length,
        returned: state.createdBetween.length,
        truncated: (state.createdBetweenMatched ?? state.createdBetween.length) > state.createdBetween.length,
        from: new URL(request.url, 'http://fixture').searchParams.get('from') ?? '',
        to: new URL(request.url, 'http://fixture').searchParams.get('to') ?? '',
        says: state.createdBetween.length === 0 ? 'The fixture lists no record in this window.' : 'The fixture lists these records for the window.',
      }))
    }
    if (request.method === 'GET' && request.url?.startsWith('/api/records/')) {
      const id = decodeURIComponent(request.url.slice('/api/records/'.length).split('?')[0] ?? '')
      const asked = request.headers['x-mole-office-workspace']
      const project = typeof asked === 'string' ? asked : undefined
      state.recordReads.push({ id, project })
      const one = (project === undefined ? undefined : state.records[`${project}:${id}`]) ?? state.records[id]
      if (one !== undefined) {
        reply.statusCode = one.status
        return reply.end(JSON.stringify(one.body))
      }
    }
    if (request.method === 'GET') {
      if (state.readDelayMs) await new Promise(resolve => setTimeout(resolve, state.readDelayMs))
      return reply.end(JSON.stringify({ title: 'Fixture run', workArea: state.workArea, checkout: { cutFrom: state.cutFrom }, ...(state.submission === undefined ? {} : { submission: state.submission }), ...(state.filesArea === undefined ? {} : { filesArea: state.filesArea }), ...state.reading }))
    }
    let raw = ''
    for await (const part of request) raw += String(part)
    const body = JSON.parse(raw) as Record<string, any>
    state.writes.push({ path: request.url ?? '', body })
    if (request.url?.endsWith('/prompt')) {
      await state.onPrompt?.()
      const asked = Array.isArray(body.needsJudgment) ? body.needsJudgment as { path: string }[] : null
      const judged = state.judgedPaths === undefined
        ? (Array.isArray(body.changes) ? body.changes as { path: string }[] : []).map((one) => one.path)
        : state.judgedPaths
      return reply.end(JSON.stringify({
        prompt: state.modelPrompt,
        bytes: Buffer.byteLength(state.modelPrompt),
        changes: { inside: ['work'], outside: [] },
        ...(state.packages === undefined ? {} : { packages: state.packages }),
        // THE FILTER AS THIS STAND-IN ANSWERS IT (the real one is whatNeedsJudgment): a path it judges is kept and
        // the rest is dropped, so a test can drive the tool's preliminary read. No list is answered with none.
        needsJudgment: asked === null ? null : judged === null ? undefined : {
          used: asked.filter((one) => judged.includes(one.path)).map((one) => one.path),
          dropped: asked.filter((one) => !judged.includes(one.path)).map((one) => one.path),
        },
      }))
    }
    if (request.url?.endsWith('/assembled')) await state.onAssembled?.(body)
    reply.end(JSON.stringify({ ok: true }))
  })
  await new Promise<void>((resolve) => office.listen(0, '127.0.0.1', resolve))
  const address = office.address()
  if (address === null || typeof address === 'string') throw new Error('Fixture has no port')
  const api = `http://127.0.0.1:${address.port}`
  const stopOffice = () => new Promise<void>(resolve => office.close(() => resolve()))
  const startOffice = () => new Promise<void>((resolve, reject) => {
    office.once('error', reject)
    office.listen(address.port, '127.0.0.1', () => {
      office.off('error', reject)
      resolve()
    })
  })
  const run = 'fixture-run'
  /**
   * DRIVE THE REAL TOOL against this fixture office. `--dry` by default, so a test that only measures
   * the assembly runs no build and no model. Two spellings of running the model, one per piece of the
   * wave of 23 September 2026 that needed it: `true` swaps `--dry` for `--on-the-host` (the piece
   * that made the inspector read only); `{ dry: false }` leaves `--dry` out and the caller names `--on-the-host`
   * itself (A2's copy test). Either way the `claude` run is whatever the caller put first on PATH:
   * a test's stand-in, never a model. `hear` is given the tool's whole output so far each time it prints, so a case can
   * act on what the tool has said rather than on a time.
   */
  function inspect(flags: string[] = [], env: Record<string, string> = {}, how: boolean | { dry?: boolean } = {}, hear?: (out: string) => void) {
    const runModel = how === true
    const dry = typeof how === 'object' ? how.dry !== false : !runModel
    return new Promise<{ code: number | null; out: string; err: string }>((resolve) => {
      const child = spawn(process.execPath, [join(process.cwd(), 'tools/the-inspector.mjs'), '--run', run, '--as', 'fixture-inspector', '--api', api, '--workspace', 'panelx', '--checkout', checkout, ...(runModel ? ['--on-the-host'] : dry ? ['--dry'] : []), ...flags], {
        cwd: process.cwd(), env: { ...process.env, MOLE_OFFICE_DB: fixtureDatabase, MOLE_OFFICE_CHECK_WORKTREES: join(home, '.cache/mole-office/worktrees'), ...env }, stdio: ['ignore', 'pipe', 'pipe'],
      })
      let out = ''
      let err = ''
      child.stdout.on('data', (data) => { out += String(data); hear?.(out) })
      child.stderr.on('data', (data) => { err += String(data) })
      child.on('close', (code) => resolve({ code, out, err }))
    })
  }
  return { home, checkout, base, git, run, api, state, inspect, stopOffice, startOffice,
    pathFor: (check: string) => join(home, '.cache/mole-office/worktrees', `a-check-of-${run}-${check}`),
    async close() {
      await new Promise<void>((resolve) => office.close(() => resolve()))
      rmSync(home, { recursive: true, force: true })
    },
  }
}
