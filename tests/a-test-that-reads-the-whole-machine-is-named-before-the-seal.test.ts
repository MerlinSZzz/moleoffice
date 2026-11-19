// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TEST THAT READS THE WHOLE MACHINE IS NAMED BEFORE THE SEAL, AND NEVER REFUSES IT. Wave 13u round 104. The owner's rule:
 * no test may read the machine's whole temporary folder or every process on it; a test looks only at what it made. The
 * check before the seal reminds and does not refuse, and the decision of a person or an agent is the soft criterion:
 * the run fixes the line, or keeps it by writing "machine-wide on purpose:" and a reason on it, and the seal records which.
 * The finder is src/server/lib/machine-wide-scans.ts; the reminder names its items (src/server/lib/before-the-seal-rules.ts)
 * and the seal records the decisions (src/server/lib/before-the-seal.ts).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. A made-up test line the run adds that lists the whole temporary folder gets a likely item, 'machine-wide test',
 *      which names the line, says why it matters and what to do, and refuses nothing.
 *   2. A line that lists a folder of the test's own (a private root) gets none, beside a scan that does.
 *   3. A line that reads every process, through /proc, ps or pgrep, is named, each with its own words; one that names its
 *      own processes is not.
 *   4. "machine-wide on purpose:" and a reason, on the line or on the comment line the run adds just above it, keep the
 *      line: it is still named, with the reason, under the same key. An empty reason, or a marker further up, keeps nothing.
 *   5. The reminder says what the finder cannot see, and says so when the lines were not read.
 *   6. The lines are read at the tip: a scan the run added and then fixed is not named, a scan it added and kept is named
 *      at its line there, and a scan an earlier run added is not this run's.
 *   7. Through the records door, at remind: the reminder names the line, the seal sent after it goes through, and the
 *      seal records the line as not decided.
 *   8. The seal records a line marked after the reminder as kept, with its reason, and a line fixed after the reminder as
 *      no longer found. The reader the run's page uses (src/shared/before-the-seal.ts) reads both back as stored.
 *   9. At block, the seal still goes through over a line nobody decided, and records it so.
 *
 * Every repository and every scratch folder is made here, in a folder of this test's own under the system's temporary
 * folder; every key, report, run and test line is made up. The made-up scans are put together from pieces, so this
 * file's own lines are not scans the finder would name.
 *
 * ---------------------------------------------------------------------------------------
 * CONTROL, MUTATION AND RESTORE: in the round 104 report.
 * ---------------------------------------------------------------------------------------
 */

import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import { readRemindedBeforeTheSeal } from '../src/shared/before-the-seal.ts'
import {
  theCommitsReadWith,
  theMigrationItemsRefusingASeal,
  whatAnInspectorWouldMostLikelyRefuse as judge,
  whatTheReminderSays,
  type TheFactsBeforeTheSeal,
  type TheRunsCommits,
} from '../src/server/lib/before-the-seal-rules.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { aReportInForm } from './a-run-in-form.ts'

/** The marker, as a supervisor writes it. */
const KEPT = 'machine-wide on purpose:'
/** The made-up scans, put together so that no line of this file is one. */
const LIST = (what: string) => ['readdir', `Sync(${what})`].join('')
const THE_TMP = ['tmp', 'dir()'].join('')
const THE_WHOLE_TMP = LIST(THE_TMP)
const THE_WHOLE_PROC = LIST(`'/pr${'oc'}'`)

type Lines = { path: string; added: { line: number; text: string }[] }[]

const facts = (lines: Lines | undefined): TheFactsBeforeTheSeal => ({
  runTitle: 'Round 1',
  testRuns: [],
  git: { commits: [], existedAtTheForkBase: () => true, ...(lines === undefined ? {} : { testLinesAtTheTip: lines }) } as TheRunsCommits,
  reports: [{ id: 'report-1', title: 'What round 1 did', data: { chaptersRead: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], blocks: [] } }],
  sameTitleElsewhere: {},
  mustRead: [1],
  checkAlso: [],
})

/** The machine-wide items the reminder names for these lines. */
const named = (lines: Lines) => judge(facts(lines)).items.filter((one) => (one.about as string) === 'machine-wide test')
const oneFile = (...texts: string[]): Lines => [{ path: 'tests/a.test.ts', added: texts.map((text, n) => ({ line: 4 + n, text })) }]

// ================================================================================================== the finder

describe('the finder', () => {
  it('1: a made-up line that lists the whole temporary folder gets a likely item, which names it and refuses nothing', () => {
    const items = named(oneFile(`    const left = ${THE_WHOLE_TMP}.filter((name) => name.startsWith('made-up-'))`))
    expect(items).toHaveLength(1)
    expect(items[0]!.mechanical).toBe(false)
    expect(items[0]!.key).toMatch(/^machine-wide:tests\/a\.test\.ts:/u)
    expect(items[0]!.says).toMatch(/^tests\/a\.test\.ts:4 lists the whole temporary folder\. A test looks only at what it made: /u)
    expect(items[0]!.says).toContain('What to do: ')
    expect(items[0]!.says).toContain(`"${KEPT} <why>"`)
    // THE SAME FOLDER WRITTEN OTHER WAYS: os.tmpdir() and '/tmp' itself.
    expect(named(oneFile(`  ${LIST(`os.${THE_TMP}`)}`))).toHaveLength(1)
    expect(named(oneFile(`  ${LIST(`'/t${'mp'}'`)}`))).toHaveLength(1)
    // IT REFUSES NOTHING: no seal gate takes it, and the reminder counts it among the things a person judges.
    expect(theMigrationItemsRefusingASeal(items)).toEqual([])
    expect(whatTheReminderSays(items)).toMatch(/: 0 certain, .* and 1 that needs a person to judge\./u)
  })

  it('2: a line that lists a folder of its own gets none, beside the scan that does', () => {
    expect(named(oneFile(`  const left = ${THE_WHOLE_TMP}`))).toHaveLength(1)
    for (const own of [
      `  const left = ${LIST('own')}`,
      `  const left = ${LIST(`join(${THE_TMP}, 'mine')`)}`,
      `  const left = ${LIST(`\`/pr${'oc'}/\${pid}/task\``)}`,
      `  // ${THE_WHOLE_TMP} is what this test no longer does`,
      `   * ${THE_WHOLE_TMP} in a comment block`,
    ]) {
      expect(named(oneFile(own)), own).toEqual([])
    }
    // ONLY CODE IS READ: a .md or .json file under tests/ names no item.
    expect(named([{ path: 'tests/notes.md', added: [{ line: 1, text: THE_WHOLE_TMP }] }])).toEqual([])
  })

  it('3: a line that reads every process is named, each with its own words; one that names its own processes is not', () => {
    const ps = ['p', 's'].join('')
    const pgrep = ['pg', 'rep'].join('')
    const pkill = ['pk', 'ill'].join('')
    const killall = ['kill', 'all'].join('')
    const cases: [string, RegExp][] = [
      [`  for (const pid of ${THE_WHOLE_PROC}) {`, /^tests\/a\.test\.ts:4 lists every process in \/proc\. /u],
      [`  execFileSync('${ps}', ['-eo', 'pid=,pgid='])`, /^tests\/a\.test\.ts:4 reads every process with ps\. /u],
      [`  execSync('${ps} aux')`, /^tests\/a\.test\.ts:4 reads every process with ps\. /u],
      [`  execFileSync('${pgrep}', ['-f', 'made-up'])`, new RegExp(`^tests/a\\.test\\.ts:4 asks ${pgrep}, ${pkill} or ${killall} about every process, naming no group, parent, session or user\\. `, 'u')],
      [`  execSync('${pkill} -f made-up')`, new RegExp(`^tests/a\\.test\\.ts:4 asks ${pgrep}, ${pkill} or ${killall} about every process`, 'u')],
    ]
    for (const [text, says] of cases) {
      const items = named(oneFile(text))
      expect(items.map((one) => one.says), text).toEqual([expect.stringMatching(says)])
    }
    for (const own of [
      `  execFileSync('${ps}', ['-o', 'pgid=', '-p', String(pid)])`,
      `  execFileSync('${ps}', ['--ppid', String(pid)])`,
      `  execFileSync('${pgrep}', ['-g', String(pgid)])`,
      `  execSync(\`${pkill} -P \${pid} made-up\`)`,
      `  execFileSync('${pkill}', ['-SIGTERM', '-g', String(pgid)])`,
    ]) {
      expect(named(oneFile(own)), own).toEqual([])
    }
  })

  it('4: the marker on the line or on the comment line just above keeps it, named with its reason under the same key', () => {
    const scan = `  const left = ${THE_WHOLE_TMP}`
    const [plain] = named(oneFile(scan))
    const onTheLine = named(oneFile(`${scan} // ${KEPT} it shows the folder is shared`))
    const above = named(oneFile(`  // ${KEPT} it shows the folder is shared`, scan))
    for (const [kept, line] of [[onTheLine, 4], [above, 5]] as const) {
      expect(kept.map((one) => one.key)).toEqual([plain!.key])
      expect(kept[0]!.says).toBe(`tests/a.test.ts:${line} lists the whole temporary folder, and is marked "${KEPT} it shows the folder is shared". The seal records it as kept, with that reason.`)
      expect(kept[0]!.mechanical).toBe(false)
    }
    // AN EMPTY REASON, A MARKER TWO LINES UP, OR ONE AT THE END OF ANOTHER SCAN, KEEPS NOTHING.
    expect(named(oneFile(`${scan} // ${KEPT}`))[0]!.says).toMatch(/^tests\/a\.test\.ts:4 lists the whole temporary folder\. A test/u)
    expect(named(oneFile(`  // ${KEPT} too far up`, '  const other = 1', scan))[0]!.says).toMatch(/^tests\/a\.test\.ts:6 lists the whole temporary folder\. A test/u)
    const two = named(oneFile(`${scan} // ${KEPT} only this one`, `  const again = ${THE_WHOLE_TMP}`))
    expect(two.map((one) => one.says)).toEqual([
      expect.stringMatching(/^tests\/a\.test\.ts:4 lists the whole temporary folder, and is marked/u),
      expect.stringMatching(/^tests\/a\.test\.ts:5 lists the whole temporary folder\. A test/u),
    ])
  })

  it('5: the reminder says what the finder cannot see, and says so when the lines were not read', () => {
    const { notChecked } = judge(facts(oneFile('  const nothing = 1')))
    expect(notChecked).toContainEqual(expect.stringMatching(/^Tests that read the whole machine: looked for one line at a time in the lines this run adds under tests\/\. /u))
    expect(notChecked).toContainEqual(expect.stringMatching(/a scan through a tool the test starts/u))
    expect(judge(facts(undefined)).notChecked).toContainEqual('Tests that read the whole machine: the lines this run adds under tests/ were not read at its tip.')
  })
})

// ================================================================================================== the reader

const git = (dir: string, ...args: string[]): string => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' })

function write(dir: string, path: string, text: string): void {
  mkdirSync(dirname(join(dir, path)), { recursive: true })
  writeFileSync(join(dir, path), text)
}

/** Commit everything at a given author time, in seconds since 1970. */
function commitAt(dir: string, seconds: number, message: string): string {
  git(dir, 'add', '.')
  execFileSync('git', ['-C', dir, 'commit', '-qm', message], { env: { ...process.env, GIT_AUTHOR_DATE: `@${seconds} +0000`, GIT_COMMITTER_DATE: `@${seconds} +0000` } })
  return git(dir, 'rev-parse', 'HEAD').trim()
}

/** The folder of this file's own, under the system's temporary folder, that every repository here is made in. */
let own = ''
beforeAll(() => {
  own = mkdtempSync(join(tmpdir(), 'mole-office-machine-wide-'))
})
afterAll(() => {
  if (own !== '') rmSync(own, { recursive: true, force: true })
})

function aRepository(name: string): string {
  const dir = join(own, name)
  mkdirSync(dir)
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.name', 'Synthetic machine-wide test')
  git(dir, 'config', 'user.email', 'machine-wide@example.invalid')
  git(dir, 'config', 'commit.gpgsign', 'false')
  return dir
}

describe('the reader', () => {
  it('6: the lines are read at the tip: fixed is not named, kept is named at its line there, an earlier run\'s is not', () => {
    const dir = aRepository('the-reader')
    write(dir, 'src/a.ts', 'one\n')
    const base = commitAt(dir, 1_000_000, 'Synthetic base')
    git(dir, 'switch', '-qc', 'worker')
    // AN EARLIER RUN on the same branch adds a scan: not this run's to answer for.
    write(dir, 'tests/earlier.test.ts', `const left = ${THE_WHOLE_TMP}\n`)
    commitAt(dir, 1_000_100, 'Synthetic earlier run adds a scan')
    // THIS RUN, started at 1_000_500: two scans, then one of them fixed in a later commit.
    write(dir, 'tests/mine.test.ts', `const a = 1\nconst left = ${THE_WHOLE_TMP}\nconst all = ${THE_WHOLE_PROC}\n`)
    commitAt(dir, 1_000_600, 'Synthetic scans')
    write(dir, 'tests/mine.test.ts', `const a = 1\nconst b = 2\nconst left = ${LIST('own')}\nconst all = ${THE_WHOLE_PROC}\n`)
    const tip = commitAt(dir, 1_000_700, 'Synthetic fix of one')

    const read = theCommitsReadWith((...args) => git(dir, ...args), base, tip, 1_000_500_000)
    expect(Reflect.get(read, 'testLinesAtTheTip')).toEqual([
      { path: 'tests/mine.test.ts', added: [{ line: 1, text: 'const a = 1' }, { line: 2, text: 'const b = 2' }, { line: 3, text: `const left = ${LIST('own')}` }, { line: 4, text: `const all = ${THE_WHOLE_PROC}` }] },
    ])
    const items = judge({ ...facts(undefined), git: read }).items.filter((one) => (one.about as string) === 'machine-wide test')
    expect(items.map((one) => one.says)).toEqual([expect.stringMatching(/^tests\/mine\.test\.ts:4 lists every process in \/proc\. /u)])
  })
})

// ================================================================================================== the seal

const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const HANDLE = 'a-round-whose-test-reads-the-machine'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_THE_OFFICE_WORKER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'mole-office/the-message-worker',
  'x-mole-office-key': A_MADE_UP_OFFICE_KEY,
}

const asTheRun = (session: string, key: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': HANDLE,
  'x-mole-office-session': session,
  'x-mole-office-key': key,
})

let runs = 0

/** The test file a made-up run's commit adds. */
const THE_RUNS_TEST = 'tests/made-up.test.ts'

/** A run filed by the office's worker at commit A, with commit B on its branch adding THE_RUNS_TEST with these lines. */
async function aRunWhoseTestSays(lines: string[]): Promise<{ id: string; key: string; dir: string; b: string }> {
  runs += 1
  const dir = aRepository(`run-${runs}`)
  write(dir, 'work/a.txt', 'before\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-qm', 'Synthetic commit A')
  const a = git(dir, 'rev-parse', 'HEAD').trim()
  git(dir, 'switch', '-qc', 'worker')
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_OFFICE_WORKER,
    payload: {
      kind: 'session',
      title: 'Synthetic run whose test reads the machine',
      data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: HANDLE, doing: 'sealing', workingDirectory: dir, cutFrom: 'main', tip: a },
    },
  })
  expect(filed.statusCode, filed.body.slice(0, 300)).toBe(201)
  const body = filed.json() as { record: PanelRecord; runKey?: { key?: string } }
  const key = String(body.runKey?.key)
  expect(key, 'the office minted the run no key, so this file would prove nothing').toMatch(/^[0-9a-f]{64}$/)
  write(dir, THE_RUNS_TEST, `${lines.join('\n')}\n`)
  return { id: body.record.id, key, dir, b: commitAt(dir, Math.ceil(Date.now() / 1000) + 1, 'Synthetic commit B') }
}

const theFinish = (tip: string) => ({ dataPatch: { state: 'finished', tip } })

/** The machine-wide item the reminder's reply named, which there must be exactly one of. */
function theItemNamed(reply: { json: () => unknown }): { key: string; says: string; mechanical?: boolean } {
  const items = (reply.json() as { beforeTheSeal?: { items?: { key: string; about: string; says: string; mechanical?: boolean }[] } }).beforeTheSeal?.items ?? []
  const found = items.filter((one) => one.about === 'machine-wide test')
  expect(found, JSON.stringify(items).slice(0, 600)).toHaveLength(1)
  return found[0]!
}

/** What the seal stored, read from the run as the office keeps it. */
function whatTheSealKept(id: string): Record<string, unknown> {
  const held = t.api.getRecord(id)!.data['remindedBeforeTheSeal'] as { atTheSeal?: Record<string, unknown> } | undefined
  if (held?.atTheSeal === undefined) throw new Error(`no seal on the line: ${JSON.stringify(held)}`)
  return held.atTheSeal
}

/** The decisions, through the reader the run's page uses. Read with Reflect.get, because the field is the code's to add. */
function whatThePageReads(id: string): unknown {
  const read = readRemindedBeforeTheSeal(t.api.getRecord(id)!.data['remindedBeforeTheSeal'])
  return read?.reminded === true && read.atTheSeal !== null ? Reflect.get(read.atTheSeal, 'machineWideScans') : 'no seal was read'
}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: HANDLE, name: HANDLE, role: 'worker', runtime: 'claude-code', workArea: ['work', 'tests'] } })
  expect(registered.statusCode, registered.body.slice(0, 300)).toBe(201)
}, 60_000)

afterAll(async () => {
  vi.unstubAllEnvs()
  await app?.close()
  t?.close()
})

describe('the seal', () => {
  it('7: at remind, the reminder names the line, the seal sent after it goes through, and records it as not decided', async () => {
    const { id, key, b } = await aRunWhoseTestSays(['const a = 1', `const left = ${THE_WHOLE_TMP}`])
    // The run's report is in form, so the seal sent after the reminder goes through.
    await aReportInForm(t, id, HANDLE)
    const first = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asTheRun(id, key), payload: theFinish(b) })
    expect(first.statusCode, first.body.slice(0, 600)).toBe(200)
    const item = theItemNamed(first)
    expect(item.says).toMatch(/^tests\/made-up\.test\.ts:2 lists the whole temporary folder\. /u)
    expect(item.mechanical).toBe(false)
    expect(t.api.getRecord(id)!.data['sealedTip']).toBeUndefined()

    const second = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asTheRun(id, key), payload: theFinish(b) })
    expect(second.statusCode, second.body.slice(0, 600)).toBe(200)
    expect(t.api.getRecord(id)!.data['sealedTip']).toEqual(expect.any(String))
    const kept = whatTheSealKept(id)
    expect(kept['stillFound']).toContain(item.key)
    expect(kept['machineWideScans']).toEqual([{ key: item.key, decision: 'not decided' }])
  })

  it('8: the seal records a line marked after the reminder as kept, with its reason, and a line fixed after it as no longer found', async () => {
    const marked = await aRunWhoseTestSays(['const a = 1', `const left = ${THE_WHOLE_TMP}`])
    // Each run's report is in form, so each seal sent after the reminder goes through.
    await aReportInForm(t, marked.id, HANDLE)
    const first = await app.inject({ method: 'PATCH', url: `/api/records/${marked.id}`, headers: asTheRun(marked.id, marked.key), payload: theFinish(marked.b) })
    const item = theItemNamed(first)
    write(marked.dir, THE_RUNS_TEST, `const a = 1\n// ${KEPT} it shows that the folder is shared\nconst left = ${THE_WHOLE_TMP}\n`)
    const c = commitAt(marked.dir, Math.ceil(Date.now() / 1000) + 2, 'Synthetic commit C keeps the line')
    const second = await app.inject({ method: 'PATCH', url: `/api/records/${marked.id}`, headers: asTheRun(marked.id, marked.key), payload: theFinish(c) })
    expect(second.statusCode, second.body.slice(0, 600)).toBe(200)
    expect(t.api.getRecord(marked.id)!.data['sealedTip']).toEqual(expect.any(String))
    expect(whatTheSealKept(marked.id)['machineWideScans']).toEqual([{ key: item.key, decision: 'kept', reason: 'it shows that the folder is shared' }])
    expect(whatThePageReads(marked.id)).toEqual(whatTheSealKept(marked.id)['machineWideScans'])

    const fixed = await aRunWhoseTestSays(['const a = 1', `const left = ${THE_WHOLE_TMP}`])
    await aReportInForm(t, fixed.id, HANDLE)
    const named = theItemNamed(await app.inject({ method: 'PATCH', url: `/api/records/${fixed.id}`, headers: asTheRun(fixed.id, fixed.key), payload: theFinish(fixed.b) }))
    write(fixed.dir, THE_RUNS_TEST, `const a = 1\nconst left = ${LIST('own')}\n`)
    const d = commitAt(fixed.dir, Math.ceil(Date.now() / 1000) + 2, 'Synthetic commit D fixes the line')
    const sealed = await app.inject({ method: 'PATCH', url: `/api/records/${fixed.id}`, headers: asTheRun(fixed.id, fixed.key), payload: theFinish(d) })
    expect(sealed.statusCode, sealed.body.slice(0, 600)).toBe(200)
    expect(whatTheSealKept(fixed.id)['noLongerFound']).toContain(named.key)
    expect(whatTheSealKept(fixed.id)['machineWideScans']).toEqual([{ key: named.key, decision: 'no longer found' }])
    expect(whatThePageReads(fixed.id)).toEqual(whatTheSealKept(fixed.id)['machineWideScans'])
  })

  it('9: at block, the seal still goes through over a line nobody decided, and records it so', async () => {
    vi.stubEnv('MOLE_OFFICE_GATE_BEFORE_THE_SEAL', 'block')
    try {
      const { id, key, b } = await aRunWhoseTestSays([`const left = ${THE_WHOLE_TMP}`])
      const first = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asTheRun(id, key), payload: theFinish(b) })
      expect(first.statusCode, first.body.slice(0, 600)).toBe(200)
      const item = theItemNamed(first)
      // THE CERTAIN ITEMS ANSWERED, as a run at block must, so only the likely items stand at the seal.
      await aReportInForm(t, id, HANDLE)
      const second = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asTheRun(id, key), payload: theFinish(b) })
      expect(second.statusCode, second.body.slice(0, 600)).toBe(200)
      expect(t.api.getRecord(id)!.data['sealedTip']).toEqual(expect.any(String))
      expect(whatTheSealKept(id)['machineWideScans']).toEqual([{ key: item.key, decision: 'not decided' }])
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
