// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CRASHED CHECK SAYS WHY, ON ITS SESSION RECORD (wave 13n round AJ, item 3p5).
 *
 * Until this round a check that crashed left only its `doing` line: nothing said how far it got, how its process ended,
 * or what it said last. One function, `whyTheCheckCrashed` in src/config/inspection-ending.mjs, now works that out, and
 * whatever ends a check writes its answer to the check's session as `whyTheCheckCrashed`: the message worker, and any
 * other program through tools/inspector-why-it-crashed.mjs. It holds
 *   1. the stage the check reached, read from the process rows of its commands: before the first process row, during
 *      the checkout, after the checkout, during the model or after the model, or not known when the office did not
 *      carry enough of the record to say;
 *   2. the exit code or signal, from the exit file the worker writes;
 *   3. the launcher's own refusal when the error stream holds one (the disk floor, free space that could not be read,
 *      no seat, which names E2BIG for an argument that is too long), and otherwise the last 2 KB of the error stream,
 *      with a sentence saying which, or that the stream was empty, or that nothing kept it.
 * Every kind of answer is stored by the office: it refuses an empty string, so an empty stream gives no last lines.
 * Everything taken from the error stream is masked as every printed line is: the value of a name holding KEY, TOKEN,
 * SECRET or PASSWORD, the shapes of keys, logins, home folders and addresses.
 *
 * THE STAGES ARE READ FROM RECORDED SESSIONS, never from a live check: tests/fixtures/checks-that-crashed holds three
 * replies of the office for real check sessions, and its README says where they came from. Two stages no recorded check
 * ended in are made from them by leaving out the newest changes, and `asReadBefore` below says so where it does it.
 *
 * THE WORKER CASE runs a stand-in check tool, written by this test into a scratch folder, through the worker's real pass
 * and a real office in a scratch database. No model runs and nothing reaches the live office.
 *
 * THE LABELS OF A CHECK'S COMMANDS are tools/the-inspector.mjs's, which writes them as text rather than as a constant.
 *
 * MUTATIONS, each after a control run: the newest command taken as the oldest; an open model row read as released; a
 * cut record read as complete; the masking done after the cut, or with the named values left in; the cap at 2,049 bytes
 * or cut inside a letter; the first refusal kept instead of the last; the worker writing no field; an empty stream
 * given as an empty string; a runtime the inspector takes that the stage reader does not know. Each turns a case red.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import {
  THE_LAST_LINES_KEPT,
  maskedAsAPrintedLine,
  whyTheCheckCrashed,
} from '../src/config/inspection-ending.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const FIXTURES = join(REPO, 'tests/fixtures/checks-that-crashed')
const made: string[] = []

interface Change { op: string; field: string | null; oldValue: string | null; newValue: string | null; at: string; appendOrder: number }
interface Reply { changes: Change[]; changesCarried: { carried: number; total: number; budgetBytes: number; next: string | null } }

function fixture(name: string): Reply {
  return JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), 'utf8')) as Reply
}

/**
 * THE SAME RECORD AS THE OFFICE WOULD HAVE ANSWERED BEFORE ONE CHANGE WAS WRITTEN: that change and every newer one are left
 * out, and the carry says it holds every change that is left. This is how the two stages no recorded check ended in are
 * made: during the checkout, and during the model.
 */
function asReadBefore(reply: Reply, appendOrder: number): Reply {
  const changes = reply.changes.filter((one) => one.appendOrder < appendOrder)
  return { changes, changesCarried: { ...reply.changesCarried, carried: changes.length, total: changes.length, next: null } }
}

function scratch(what: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `crashed-check-${what}-`)))
  made.push(dir)
  return dir
}

afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

const BEFORE_ANY_ROW = 'No process row was written for any command of this check. It crashed before its first command, or it ran its commands on the host, where no such row is written.'

describe('the stage a crashed check reached, read from recorded check sessions', () => {
  const crashedEarly = fixture('crashed-before-the-first-process-row')
  const crashedAfterTheCheckout = fixture('crashed-after-the-checkout')
  const finished = fixture('finished-after-the-model')
  // The release of the checkout's process row in the second file, and of the model's (OpenCode's) in the third.
  const THE_CHECKOUTS_RELEASE = 559110
  const THE_MODELS_RELEASE = 552840
  const THE_MODELS_START = 552775

  it.each([
    ['before the first process row', 'crashed-before-the-first-process-row.json, whole', crashedEarly, BEFORE_ANY_ROW],
    ['during the checkout', 'crashed-after-the-checkout.json, read before its checkout was released',
      asReadBefore(crashedAfterTheCheckout, THE_CHECKOUTS_RELEASE), 'The process row of the checkout was still open when the record was read.'],
    ['after the checkout', 'crashed-after-the-checkout.json, whole', crashedAfterTheCheckout,
      'The newest command of this check with a process row was the checkout, and its row was released.'],
    ['after the checkout', 'finished-after-the-model.json, read before its model started', asReadBefore(finished, THE_MODELS_START),
      'The newest command of this check with a process row was try-the-view, and its row was released.'],
    ['during the model', 'finished-after-the-model.json, read before its model was released', asReadBefore(finished, THE_MODELS_RELEASE),
      "The process row of the model's command, opencode, was still open when the record was read."],
    ['after the model', 'finished-after-the-model.json, whole', finished, "The process row of the model's command, opencode, was released."],
  ] as const)('reads %s from %s', (stage, _from, record, says) => {
    expect(whyTheCheckCrashed({ record, exit: '1', errorStream: '' })).toMatchObject({ stage, stageSays: says })
  })

  it('reads the stage from the newest changes when the office left older ones out, since it carries the newest first', () => {
    const newest = finished.changes.filter((one) => one.appendOrder >= 552770)
    const record = { changes: newest, changesCarried: { carried: newest.length, total: finished.changes.length, budgetBytes: 4_096, next: 'older' } }
    expect(whyTheCheckCrashed({ record, exit: '1', errorStream: '' }).stage).toBe('after the model')
  })

  it('says the stage is not known when the record was not read, came without its changes, or was cut before any command row', () => {
    expect(whyTheCheckCrashed({ record: null, exit: '1', errorStream: '' })).toMatchObject({
      stage: 'not known', stageSays: 'The session record was not read, so the stage is not known.' })
    expect(whyTheCheckCrashed({ record: {}, exit: '1', errorStream: '' })).toMatchObject({
      stage: 'not known', stageSays: 'The session record came without its changes, so the stage is not known.' })
    const cut = { changes: crashedAfterTheCheckout.changes.slice(0, 2), changesCarried: { carried: 2, total: 9, budgetBytes: 1_024, next: 'older' } }
    expect(whyTheCheckCrashed({ record: cut, exit: '1', errorStream: '' })).toMatchObject({ stage: 'not known',
      stageSays: "None of the 2 changes the office carried is a process row of a check's command, and it left out 7 older ones, so the stage is not known." })
    // The same five changes that read as "before the first process row" above, with no word on whether they are all.
    expect(whyTheCheckCrashed({ record: { changes: crashedEarly.changes }, exit: '1', errorStream: '' })).toMatchObject({ stage: 'not known',
      stageSays: "None of the session's 5 changes is a process row of a check's command, and the reply did not say whether it carried them all, so the stage is not known." })
  })
})

describe('how the check process ended', () => {
  const record = fixture('crashed-after-the-checkout')
  it.each([
    ['1', 1, null, "The check's process exited with code 1."],
    ['137\n', 137, null, "The check's process exited with code 137."],
    ['signal:SIGTERM', null, 'SIGTERM', "The check's process was ended by the signal SIGTERM."],
    [null, null, null, "Nothing recorded how the check's process ended: there was no exit file."],
    ['signal:unknown', null, null, 'The exit file held "signal:unknown", which is neither an exit code nor a signal.'],
  ] as const)('reads the exit file %j', (exit, code, signal, says) => {
    expect(whyTheCheckCrashed({ record, exit, errorStream: '' })).toMatchObject({ code, signal, exitSays: says })
  })
})

describe('what the check said last: the launcher\'s refusal, or else the last lines', () => {
  const record = fixture('crashed-before-the-first-process-row')
  const DETAILS = ' Details: /home/someone/.cache/mole-office/sandboxes/inspector-someone/logs/a-check/launch.txt'
  const DISK = 'the machine has 3.1 GB free where the sandboxes are, under the 20 GB a new build or test run needs.'
  const UNKNOWN = 'the free space where the sandboxes are is unknown: df could not read /srv/sandboxes (exit 1; invalid available-byte figure).'
  const E2BIG = 'No codex seat was given (tools/slot.mjs could not be started: E2BIG, the error Linux gives for arguments that are too long; one argument may hold at most 131,071 bytes).'

  it.each([
    ['the disk floor', `Check view could not start (exit 75): sandbox: ${DISK}${DETAILS}`, DISK],
    ['free space that could not be read', `Check view could not start (exit 75): sandbox: ${UNKNOWN}${DETAILS}`, UNKNOWN],
    ['no seat, for an argument that is too long', `starting the model\nCheck view could not start (exit 1): sandbox-start: ${E2BIG}${DETAILS}\nthe check ended`, E2BIG],
  ])('gives the refusal for %s, and no last lines', (_about, errorStream, refusal) => {
    const why = whyTheCheckCrashed({ record, exit: '1', errorStream })
    expect(why.refusal).toBe(refusal)
    expect(why.errorStreamSays).toBe('The sandbox launcher started nothing, and refusal is its sentence saying why.')
    expect('lastLines' in why).toBe(false)
  })

  it('gives the last refusal when the error stream holds two', () => {
    const errorStream = `sandbox: ${DISK}${DETAILS}\ntried again\nsandbox-start: ${E2BIG}${DETAILS}\n`
    expect(whyTheCheckCrashed({ record, exit: '1', errorStream }).refusal).toBe(E2BIG)
  })

  it('gives the whole error stream when it is short, no last lines when it is empty or blank, and null when there was none', () => {
    expect(whyTheCheckCrashed({ record, exit: '1', errorStream: 'one\ntwo\n' })).toMatchObject({
      errorStreamSays: 'lastLines is the whole error stream, masked.', lastLines: 'one\ntwo', leftOut: 0 })
    for (const errorStream of ['', ' \n\n']) {
      const empty = whyTheCheckCrashed({ record, exit: '1', errorStream })
      expect(empty.errorStreamSays).toBe("The check's error stream was empty or blank.")
      expect('lastLines' in empty || 'leftOut' in empty || 'refusal' in empty).toBe(false)
    }
    const none = whyTheCheckCrashed({ record, exit: '1', errorStream: null })
    expect(none.errorStreamSays).toBe("Nothing kept the check's error stream, so what it said last is not known.")
    expect(none.lastLines).toBeNull()
    expect('leftOut' in none || 'refusal' in none).toBe(false)
  })

  it('keeps at most 2,048 bytes, from the start of a line, and says how many bytes it left out', () => {
    expect(THE_LAST_LINES_KEPT).toBe(2_048)
    const errorStream = Array.from({ length: 60 }, (_, n) => `line ${String(n)}: ${'€'.repeat(20)}`).join('\n')
    const why = whyTheCheckCrashed({ record, exit: '1', errorStream: `${errorStream}\n` })
    const kept = why.lastLines as string
    expect(Buffer.byteLength(kept)).toBeLessThanOrEqual(2_048)
    expect(kept.startsWith('line ')).toBe(true)
    expect(kept.endsWith(`line 59: ${'€'.repeat(20)}`)).toBe(true)
    expect(errorStream.endsWith(kept)).toBe(true)
    expect(why.leftOut! + Buffer.byteLength(kept)).toBe(Buffer.byteLength(errorStream))
    expect(why.errorStreamSays).toBe(`lastLines is the last ${String(Buffer.byteLength(kept))} bytes of the error stream, masked. The ${String(why.leftOut)} bytes before them were left out.`)
  })

  it('cuts one line longer than the cap on a whole letter', () => {
    // 1,000 letters of 3 bytes: 3,000 bytes. The last 2,048 start inside a letter, so the next whole one starts the text.
    const why = whyTheCheckCrashed({ record, exit: '1', errorStream: '€'.repeat(1_000) })
    expect(why).toMatchObject({ lastLines: '€'.repeat(682), leftOut: 954 })
  })
})

describe('masked as every printed line', () => {
  const record = fixture('crashed-before-the-first-process-row')
  const SAID = [
    'OPENAI_API_KEY=sk-synthetic0123456789abcdefghijklmnop',
    'export GITHUB_TOKEN="ghp_Synthetic0123456789abcdefghijklmnopqrstu"',
    '{"client_secret": "a synthetic secret with spaces", "db_password":"hunter2"}',
    'Password: hunter2',
    'ghp_Synthetic0123456789abcdefghijklmnopqrstu was sent on its own',
    'from 203.0.113.9:8080 and 2001:db8::7, by someone@example.invalid',
    'in /home/someone/work, /Users/someone/work and /root/.ssh',
    'at 08:58:17 for Error::Read, version 22.11.0 of vitest@4.0.1, on ::1 and fe80::1%eth0.',
  ].join('\n')
  const MASKED = [
    'OPENAI_API_KEY=<not shown>',
    'export GITHUB_TOKEN=<not shown>',
    '{"client_secret": <not shown>, "db_password":<not shown>}',
    'Password: <not shown>',
    '<a GitHub token, not shown> was sent on its own',
    'from <an address, not shown>:8080 and <an address, not shown>, by <a login, not shown>',
    'in ~/work, ~/work and ~/.ssh',
    'at 08:58:17 for Error::Read, version 22.11.0 of vitest@4.0.1, on <an address, not shown> and <an address, not shown>.',
  ].join('\n')

  it('writes the value of every name holding KEY, TOKEN, SECRET or PASSWORD as not shown, and masks keys, addresses, logins and home folders', () => {
    expect(maskedAsAPrintedLine(SAID)).toBe(MASKED)
    const why = whyTheCheckCrashed({ record, exit: '1', errorStream: SAID })
    expect(why.lastLines).toBe(MASKED)
    for (const secret of ['sk-synthetic', 'ghp_', 'a synthetic secret', 'hunter2', '203.0.113.9', '2001:db8', 'someone']) {
      expect(JSON.stringify(why), `${secret} came through`).not.toContain(secret)
    }
  })

  it('masks before it cuts, so a value whose name would be cut off is still not shown', () => {
    // Cut first, the last 2,048 bytes would hold only the value, with no name before it to say it is a secret.
    const errorStream = `${'x'.repeat(100)} API_TOKEN=${'a'.repeat(1_500)}SYNTHETIC${'b'.repeat(1_500)}`
    expect(whyTheCheckCrashed({ record, exit: '1', errorStream })).toMatchObject({ lastLines: `${'x'.repeat(100)} API_TOKEN=<not shown>`, leftOut: 0 })
  })

  it('masks the refusal and the exit file as well', () => {
    const errorStream = 'sandbox-start: No codex seat was given (tools/slot.mjs could not be run: connect ECONNREFUSED 203.0.113.9:8787 as someone@example.invalid). Details: /home/someone/x'
    expect(whyTheCheckCrashed({ record, exit: 'TOKEN=synthetic-value', errorStream })).toMatchObject({
      refusal: 'No codex seat was given (tools/slot.mjs could not be run: connect ECONNREFUSED <an address, not shown>:8787 as <a login, not shown>).',
      exitSays: 'The exit file held "TOKEN=<not shown>", which is neither an exit code nor a signal.',
    })
  })
})

describe('the same answer from tools/inspector-why-it-crashed.mjs', () => {
  const TOOL = join(REPO, 'tools/inspector-why-it-crashed.mjs')
  const RECORD = join(FIXTURES, 'crashed-after-the-checkout.json')

  it('prints what the function gives, as JSON, for a record, an exit and an error stream named on its command line', () => {
    const dir = scratch('tool')
    const stream = join(dir, 'error-stream.txt')
    writeFileSync(stream, 'the model said GH_TOKEN=synthetic-value\nand stopped\n')
    const printed = execFileSync(process.execPath, [TOOL, '--record', RECORD, '--exit', 'signal:SIGKILL', '--error-stream', stream], { encoding: 'utf8' })
    expect(JSON.parse(printed)).toEqual(whyTheCheckCrashed({ record: fixture('crashed-after-the-checkout'), exit: 'signal:SIGKILL', errorStream: readFileSync(stream, 'utf8') }))
    expect(JSON.parse(printed)).toMatchObject({ stage: 'after the checkout', signal: 'SIGKILL', lastLines: 'the model said GH_TOKEN=<not shown>\nand stopped' })
  })

  it('takes a missing exit and a missing error stream as nothing recorded, and refuses a file it was named that is not there', () => {
    const printed = execFileSync(process.execPath, [TOOL, '--record', RECORD], { encoding: 'utf8' })
    expect(JSON.parse(printed)).toEqual(whyTheCheckCrashed({ record: fixture('crashed-after-the-checkout'), exit: null, errorStream: null }))
    const dir = scratch('tool-refuses')
    const refused = spawnSync(process.execPath, [TOOL, '--record', RECORD, '--error-stream', join(dir, 'not-there.txt')], { encoding: 'utf8' })
    expect(refused.status).toBe(2)
    expect(refused.stdout).toBe('')
    expect(refused.stderr).toContain('not-there.txt')
  })
})

describe('the worker writes it on a check that crashed, and the office declares it', () => {
  let t: TestDb
  let app: FastifyInstance
  let settings: WorkerSettings
  let tree: string
  const watching: Parameters<typeof onePass>[1] = []
  const as = (type: 'agent' | 'human', id: string) => ({ 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': type, 'x-mole-office-actor-id': id })
  const person = as('human', THE_PERSON)
  const worker = as('agent', 'worker-w')
  async function call(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown, headers = person) {
    const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
    return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
  }
  function git(...args: string[]): string { return execFileSync('git', ['-C', tree, ...args], { encoding: 'utf8' }).trim() }
  function aRun(title: string): string {
    return t.api.createRecord({ kind: 'session', title, workspaceId: 'default', origin: 'fixture', actor: { type: 'agent', id: 'worker-w' },
      data: { state: 'running', servingAgent: 'worker-w', workingDirectory: tree, cutFrom: 'main', doing: 'Synthetic fixture changes work/a.txt.' } }).id
  }

  beforeAll(async () => {
    t = await freshDb()
    app = (await apiApp()).app
    await app.listen({ host: '127.0.0.1', port: 0 })
    for (const [headers, data] of [
      [person, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' }],
      [person, { handle: 'inspector-one', name: 'Synthetic Inspector', role: 'inspector' }],
      [person, { handle: 'super-r', name: 'Synthetic Supervisor', role: 'supervisor' }],
      [as('agent', 'super-r'), { handle: 'worker-w', name: 'Synthetic Worker', role: 'worker', workArea: ['work'] }],
    ] as const) {
      const registered = await call('POST', '/api/agents/started', data, headers)
      expect(registered.status, registered.raw).toBe(201)
    }
    tree = scratch('tree')
    git('init', '-q', '-b', 'main'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'Synthetic crashed-check fixture')
    mkdirSync(join(tree, 'work')); writeFileSync(join(tree, 'work/a.txt'), 'Synthetic before.\n')
    git('add', '.'); git('commit', '-q', '-m', 'Synthetic baseline'); git('switch', '-q', '-c', 'work')
    writeFileSync(join(tree, 'work/a.txt'), 'Synthetic after.\n'); git('commit', '-q', '-am', 'Synthetic work')
    // A STAND-IN CHECK TOOL: it prints a line with a secret-shaped value, an address, a login and a home folder on its
    // error stream, and exits 3. It runs no model and writes no verdict.
    const tool = join(scratch('tool'), 'a-check-that-crashes.mjs')
    writeFileSync(tool, "process.stderr.write('Synthetic: OPENAI_API_KEY=sk-synthetic0123456789abcdefghijklmnop was refused by 203.0.113.9 for someone@example.invalid in /home/someone/work.\\n')\nprocess.exitCode = 3\n")
    settings = { api: `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`, workspace: 'default', session: null, stopWithPid: null,
      checkout: aCheckoutForATestRun(), runs: 9, hops: 3, outputRoot: scratch('output'), env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_INSPECTION_TOOL: tool,
        MOLE_OFFICE_FAKE_RUNTIME: join(process.cwd(), 'tests/fake-runtime.mjs'), MOLE_OFFICE_INSPECTION_MODEL: 'sonnet' } }
  }, 60_000)

  afterAll(async () => {
    for (const r of watching) if (r.adapter.alive(r.handle)) r.adapter.stop(r.handle, 'Synthetic crashed-check test ended.')
    await app?.close(); t?.close()
  }, 60_000)

  it('writes whyTheCheckCrashed on the session of a check whose tool exited non-zero, masked', async () => {
    const run = aRun('Synthetic run whose check crashes')
    const ended = await call('PATCH', `/api/records/${run}`, { dataPatch: { state: 'finished' } }, worker)
    expect(ended.status, ended.raw).toBe(200)
    const check = () => t.api.getRecord(run)!.data['theCheck'] as { message?: string; execution?: { session: string } }
    if (!check().message) {
      const asked = await call('POST', `/api/checks/${run}/ask-again`, {}, person)
      expect(asked.status, asked.raw).toBe(200)
    }
    const pass = await onePass(settings, watching)
    const session = check().execution?.session
    expect(pass.started.some((one) => one.session === session), JSON.stringify(pass)).toBe(true)
    const started = watching.find((one) => one.session === session)!
    const until = Date.now() + 15_000
    while (started.adapter.alive(started.handle) && Date.now() < until) await new Promise((r) => setTimeout(r, 25))
    expect(started.adapter.alive(started.handle), 'the stand-in check tool did not end').toBe(false)
    await onePass(settings, watching)
    const data = t.api.getRecord(session!)!.data
    expect(data['state']).toBe('crashed')
    expect(data['whyTheCheckCrashed']).toEqual({
      stage: 'before the first process row',
      stageSays: BEFORE_ANY_ROW,
      code: 3,
      signal: null,
      exitSays: "The check's process exited with code 3.",
      errorStreamSays: 'lastLines is the whole error stream, masked.',
      lastLines: 'Synthetic: OPENAI_API_KEY=<not shown> was refused by <an address, not shown> for <a login, not shown> in ~/work.',
      leftOut: 0,
    })
  }, 60_000)

  it('declares the field on the session kind and its shape, in GET /api/kinds/session', async () => {
    const kinds = await call('GET', '/api/kinds/session')
    expect(kinds.status, kinds.raw).toBe(200)
    const field = (kinds.body['kind'] as { fields: { key: string; type: string; required: boolean }[] }).fields.find((one) => one.key === 'whyTheCheckCrashed')
    expect(field).toMatchObject({ type: 'CheckCrash', required: false })
    const shape = (kinds.body['shapes'] as { name: string; fields: { key: string; type: string; required: boolean }[] }[]).find((one) => one.name === 'CheckCrash')
    expect(shape?.fields.map((one) => [one.key, one.type, one.required])).toEqual([
      ['stage', "'before the first process row' | 'during the checkout' | 'after the checkout' | 'during the model' | 'after the model' | 'not known'", true],
      ['stageSays', 'string', true],
      ['code', 'number | null', true],
      ['signal', 'string | null', true],
      ['exitSays', 'string', true],
      ['errorStreamSays', 'string', true],
      ['refusal', 'string', false],
      ['lastLines', 'string | null', false],
      ['leftOut', 'number', false],
    ])
  })

  // EACH ANSWER ON A SESSION OF ITS OWN: a dataPatch merges into an answer already stored, and a null in it takes the key
  // out (src/server/api/roles.ts says so), so a second answer over a first is not this case. Whatever ends a check writes
  // the field once.
  it('stores every kind of answer the function gives, and refuses a stage it does not name', async () => {
    const E2BIG = 'sandbox-start: No codex seat was given (tools/slot.mjs could not be started: E2BIG, the error Linux gives for arguments that are too long; one argument may hold at most 131,071 bytes).'
    const answers = [
      whyTheCheckCrashed({ record: fixture('finished-after-the-model'), exit: 'signal:SIGTERM', errorStream: 'the end' }),
      whyTheCheckCrashed({ record: fixture('crashed-after-the-checkout'), exit: '1', errorStream: '' }),
      whyTheCheckCrashed({ record: null, exit: null, errorStream: null }),
      whyTheCheckCrashed({ record: fixture('crashed-before-the-first-process-row'), exit: '1', errorStream: `${E2BIG}\n` }),
      whyTheCheckCrashed({ record: { changes: [] }, exit: 'neither', errorStream: `${'€'.repeat(1_000)}\n` }),
    ]
    expect(answers.map((one) => [one.stage, 'refusal' in one, one.lastLines === undefined ? 'absent' : one.lastLines === null ? 'null' : 'text'])).toEqual([
      ['after the model', false, 'text'], ['after the checkout', false, 'absent'], ['not known', false, 'null'],
      ['before the first process row', true, 'absent'], ['not known', false, 'text'],
    ])
    for (const [n, why] of answers.entries()) {
      const run = aRun(`Synthetic session ${String(n + 1)} that holds why its check crashed`)
      const stored = await call('PATCH', `/api/records/${run}`, { dataPatch: { whyTheCheckCrashed: why } }, worker)
      expect(stored.status, stored.raw).toBe(200)
      expect(t.api.getRecord(run)!.data['whyTheCheckCrashed']).toEqual(why)
    }
    const run = aRun('Synthetic session that is given a stage the shape does not name')
    const why = answers[0]!
    const refused = await call('PATCH', `/api/records/${run}`, { dataPatch: { whyTheCheckCrashed: { ...why, stage: 'somewhere' } } }, worker)
    expect(refused.status, refused.raw).toBe(400)
    expect(refused.raw).toContain('whyTheCheckCrashed.stage')
  })
})
