// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TIMING JOB READS ITS REPORT'S READER FROM THE SETTING, AND ITS ENTRY FAILS A RUN THAT TOLD NOBODY.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * tools/run-the-timing-job.mjs addresses its result report to the agent MOLE_OFFICE_TIMING_REPORT_READER names. With
 * no reader it files the report addressed to nobody and answers the firing, and the run fails (decision lLDy-GJmBr1t).
 * The tick's own tests hand it a reader through doors of their own. Nothing proved that the doors the timer builds read
 * the setting, or that the command the timer runs exits 1 when a report went to nobody.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS REAL
 * ---------------------------------------------------------------------------------------
 *
 * The tool's own productionDoors(), and the tool's entry, run by node in a child process as the timer runs it. The
 * office is a stand-in of this file's own on 127.0.0.1, at a port the system picks. It writes down what it is asked,
 * and answers as an office whose weekly timing counter has one firing four days old. That firing is past its three-day
 * deadline, so the tick answers it and runs nothing. The workspace, agent, session and key are made up, and the key is
 * in a file of this test's own folder.
 *
 * THE CHILD'S WORLD. The child gets an environment built here, and nothing else of this process's: PATH, the test
 * mark, a HOME and a TMPDIR inside this test's own folder, the stand-in's address, the made-up names, the key file and
 * the reader setting. The sandboxes folder is under HOME, so the child's state folder is in this test's folder too. The
 * folder is removed after the tests, and when this process ends (tests/a-test-folder.ts).
 *
 * NO READER, WITHOUT A SETTINGS FILE. settingValue takes a name the environment holds over the settings file, even
 * when its value is empty. So the child is told there is no reader by an empty value, whatever a settings file says.
 * The doors' unset case cannot be told that way, so productionDoors takes the settings file to read as an argument.
 * This file passes a path in its own folder at which nothing is written.
 *
 * THE START CHECK. The entry first calls stopAnUnpairedStableStart. It stops only the stable checkout, on branch
 * stable at a dated stable tag, started without the pairing. A worktree, or a checkout on any other branch, is never
 * stopped by it, so the child runs here. In the stable checkout itself, cases 2 and 3 would see exit 2.
 *
 *   1. The doors carry the reader the setting names, and null when the setting is empty, blank or not set.
 *   2. With no reader, the entry files the report addressed to nobody, answers the firing, and exits 1 with a sentence
 *      that names the report and the setting.
 *   3. With a reader, the entry files the report for that reader, answers the firing, and exits 0.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF (after a green control), each alone
 * ---------------------------------------------------------------------------------------
 *
 *   a. productionDoors reads no reader (`reader: null`): case 1's named reader goes red, and so does case 3.
 *   b. productionDoors keeps an empty value (`?? null` for `|| null`): case 1's empty and blank values go red. So does
 *      case 2, on the exit: the report goes to an empty name, and the run passes.
 *   c. The entry leaves the exit code at 0 when the tick throws: case 2 goes red on the exit.
 *   d. timingJobTick does not throw for the reports it filed for nobody: case 2 goes red on the exit.
 *
 * NOT PROVED HERE: that the doors read the settings file they are given. If productionDoors read this machine's own
 * settings file instead, every case would stay green on a machine whose settings file names no reader.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { REPO_ROOT } from '../src/config/settings.mjs'
import { THE_TEST_MARK } from '../src/config/the-test-mark.mjs'
import { TIMING_DEADLINE_MS, TIMING_JOB, timingCounters } from '../src/config/timing-job.mjs'
import { localStamp } from '../src/shared/time.ts'
import { productionDoors } from '../tools/run-the-timing-job.mjs'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'

/** MADE UP. No office's key, agent, session or reader. */
const THE_KEY = 'c'.repeat(64)
const THE_AGENT = 'clerk'
const THE_SESSION = 'quill-note'
const THE_READER = 'lark'

/** The stand-in office's counters, firing and report. */
const WEEKLY = 'counter-weekly'
const LANDING = 'counter-landing'
const REPORT = 'timing-report'
const ANSWER = `/api/counters/${WEEKLY}/firings/1/answer`

/** What the child is: the command the timer runs. */
const THE_ENTRY = join(REPO_ROOT, 'tools', 'run-the-timing-job.mjs')
const THE_READER_SETTING = 'MOLE_OFFICE_TIMING_REPORT_READER'
const NO_READER = `The timing report ${REPORT} was filed and answered its firing, but it is addressed to nobody, because MOLE_OFFICE_TIMING_REPORT_READER names no reader.`

interface Asked {
  method: string
  path: string
  body: unknown
  agent: string | string[] | undefined
  status: number
}

let folder = ''
let home = ''
let keyFile = ''
let office: Server
let address = ''
let asked: Asked[] = []

/** The stand-in office's answer to one request, or null for one it has no answer to. */
function theStandInsAnswer(method: string, path: string): unknown {
  const [weekly, landing] = timingCounters(REPO_ROOT)
  const route = `${method} ${path.replace(/\?.*$/, '')}`
  switch (route) {
    case 'GET /api/counters':
      return { counters: [
        { id: WEEKLY, title: weekly!.title, follows: [], action: { kind: 'job', job: TIMING_JOB } },
        { id: LANDING, title: landing!.title, follows: [], action: { kind: 'job', job: TIMING_JOB } },
      ] }
    case `GET /api/counters/${WEEKLY}`: {
      const fired = localStamp(new Date(Date.now() - TIMING_DEADLINE_MS - 24 * 60 * 60_000))
      return { rows: [{ seq: 1, what: 'firing', at: fired, answer: { kind: 'job', job: TIMING_JOB, finished: false } }], more: false }
    }
    case `GET /api/counters/${LANDING}`: return { rows: [], more: false }
    case 'POST /api/records': return { record: { id: REPORT } }
    case 'POST /api/links': return { link: { id: 'made-up-link' } }
    case `GET /api/records/${REPORT}/revisions`: return { revisions: [{ seq: 1, contentHash: 'made-up-hash' }] }
    case `GET /api/records/${REPORT}/short-forms`: return { levels: [] }
    case `POST /api/records/${REPORT}/short-forms`: return {}
    case `POST ${ANSWER}`: return {}
    default: return null
  }
}

beforeAll(async () => {
  folder = aTestDatabaseFolder('timing-reader')
  home = join(folder, 'home')
  mkdirSync(home)
  mkdirSync(join(folder, 'tmp'))
  keyFile = join(folder, 'agent.key')
  writeFileSync(keyFile, `${THE_KEY}\n`, { mode: 0o600 })
  office = createServer((request, response) => {
    let text = ''
    request.setEncoding('utf8')
    request.on('data', (chunk: string) => { text += chunk })
    request.on('end', () => {
      const method = request.method ?? ''
      const path = request.url ?? ''
      const answer = theStandInsAnswer(method, path)
      const status = answer === null ? 404 : 200
      asked.push({ method, path, body: text === '' ? undefined : JSON.parse(text), agent: request.headers['x-mole-office-actor-id'], status })
      response.writeHead(status, { 'content-type': 'application/json' })
      response.end(JSON.stringify(answer ?? { error: `The stand-in office has no answer to ${method} ${path}.` }))
    })
  })
  await new Promise<void>((listening) => office.listen(0, '127.0.0.1', listening))
  address = `http://127.0.0.1:${String((office.address() as AddressInfo).port)}`
})
afterAll(async () => {
  await new Promise<void>((closed) => office.close(() => closed()))
  if (folder !== '') removeThisTestFolder(folder)
})
beforeEach(() => {
  asked = []
})

/** The child's whole environment. `reader` is the reader setting's value: an empty one says there is none. */
function theChildsEnvironment(reader: string): Record<string, string> {
  return {
    PATH: process.env['PATH'] ?? '',
    [THE_TEST_MARK]: process.env[THE_TEST_MARK] ?? String(process.pid),
    HOME: home,
    TMPDIR: join(folder, 'tmp'),
    MOLE_OFFICE_API: address,
    MOLE_OFFICE_WORKSPACE: 'default',
    MOLE_OFFICE_AGENT: THE_AGENT,
    MOLE_OFFICE_SESSION: THE_SESSION,
    MOLE_AGENT_KEY_FILE: keyFile,
    [THE_READER_SETTING]: reader,
  }
}

interface Ran {
  code: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
}

/** Run the tool's entry once, as the timer runs it, and wait at most a minute for it to end. */
function runTheEntry(reader: string): Promise<Ran> {
  return new Promise((ended, failed) => {
    const child = spawn(process.execPath, [THE_ENTRY], { cwd: folder, env: theChildsEnvironment(reader), stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk })
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk })
    child.on('error', failed)
    child.on('close', (code, signal) => ended({ code, signal, stdout, stderr }))
  })
}

/** The data of the one report the child filed. */
function theReportsData(): Record<string, unknown> {
  const filed = asked.filter((one) => one.method === 'POST' && one.path === '/api/records')
  expect(filed, 'the child filed no report, or more than one').toHaveLength(1)
  return (filed[0]!.body as { data: Record<string, unknown> }).data
}

describe('the timing job reads its reader from the setting, and its entry fails a run that told nobody', () => {
  const SEVEN = ['MOLE_OFFICE_API', 'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_AGENT', 'MOLE_OFFICE_SESSION', 'MOLE_AGENT_KEY', 'MOLE_AGENT_KEY_FILE', THE_READER_SETTING] as const
  let saved: Record<string, string | undefined> = {}
  beforeEach(() => {
    saved = Object.fromEntries(SEVEN.map((name) => [name, process.env[name]]))
    process.env['MOLE_OFFICE_API'] = address
    process.env['MOLE_OFFICE_WORKSPACE'] = 'default'
    process.env['MOLE_OFFICE_AGENT'] = THE_AGENT
    process.env['MOLE_OFFICE_SESSION'] = THE_SESSION
    delete process.env['MOLE_AGENT_KEY']
    process.env['MOLE_AGENT_KEY_FILE'] = keyFile
  })
  afterEach(() => {
    for (const name of SEVEN) {
      if (saved[name] === undefined) delete process.env[name]
      else process.env[name] = saved[name]
    }
  })

  it.each([
    { setting: 'names a reader', value: THE_READER as string | undefined, reader: THE_READER as string | null },
    { setting: 'is empty', value: '', reader: null },
    { setting: 'is blank', value: '   ', reader: null },
    { setting: 'is not set', value: undefined, reader: null },
  ])('case 1: when the setting $setting, the doors carry $reader', ({ value, reader }) => {
    const noSettingsFile = join(folder, 'no-settings-file')
    expect(existsSync(noSettingsFile), 'a settings file is where this test says none is').toBe(false)
    if (value === undefined) delete process.env[THE_READER_SETTING]
    else process.env[THE_READER_SETTING] = value

    expect(productionDoors(noSettingsFile).reader).toBe(reader)
  })

  it('case 2: with no reader, the entry files the report to nobody, answers the firing, and exits 1 naming the setting', async () => {
    const ran = await runTheEntry('')

    expect({ code: ran.code, signal: ran.signal }, ran.stderr).toEqual({ code: 1, signal: null })
    const said = ran.stderr.split('\n').find((line) => line.startsWith('Timing job could not finish: '))
    expect(said, ran.stderr).toContain(NO_READER)
    expect(asked.filter((one) => one.status !== 200), 'the stand-in office had no answer to these').toEqual([])
    expect(Object.hasOwn(theReportsData(), 'for'), 'the report was addressed to somebody').toBe(false)
    expect(asked.filter((one) => one.path === ANSWER).map((one) => one.body)).toEqual([{ result: REPORT, says: `Timing not-run; dated result ${REPORT}.` }])
    expect(new Set(asked.map((one) => one.agent))).toEqual(new Set([THE_AGENT]))
    expect(existsSync(join(home, '.cache', 'mole-office', 'sandboxes', '.timing-job')), 'the child kept its state outside this test\'s folder').toBe(true)
  }, 90_000)

  it('case 3: with a reader, the entry files the report for that reader, answers the firing, and exits 0', async () => {
    const ran = await runTheEntry(THE_READER)

    expect({ code: ran.code, signal: ran.signal }, ran.stderr).toEqual({ code: 0, signal: null })
    expect(ran.stdout.trim()).toBe('Timing firings wait for the next tick, or were answered at their deadline.')
    expect(asked.filter((one) => one.status !== 200), 'the stand-in office had no answer to these').toEqual([])
    expect(theReportsData()['for']).toBe(THE_READER)
    expect(asked.filter((one) => one.path === ANSWER).map((one) => one.body)).toEqual([{ result: REPORT, says: `Timing not-run; dated result ${REPORT}.` }])
  }, 90_000)
})
