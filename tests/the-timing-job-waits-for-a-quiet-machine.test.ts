// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Labelled machine, office and sandbox stand-ins exercise the real runner. */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { timingJobTick, runTimingInSandbox } from '../tools/run-the-timing-job.mjs'
import { timingCounters, TIMING_JOB, TIMING_DEADLINE_MS } from '../src/config/timing-job.mjs'
import { settingNamed } from '../src/config/settings.mjs'

const commit = 'a'.repeat(40)
const measured = { status: 'passed', quiet: true, limitMs: 300, coldFixtureMs: 12_000, machineBefore: { load1: 1, cores: 20 }, machineAfter: { load1: 2, cores: 20 }, runs: [[{ press: 'Collect', ms: 125, doors: ['/api/reviews'] }]] }
function fixture(load = 1, queueBusy = false) {
  const now = new Date('2026-10-08T01:00:00')
  const counters = timingCounters('/synthetic-main').map((one, i) => ({ ...one, id: `counter-${i}`, follows: one.follows ?? [] }))
  const state = new Map<string, any>()
  const ask = vi.fn(async (method: string, path: string, body?: any): Promise<any> => {
    if (path === '/api/counters') return { counters }
    if (path.includes('/counter-0?')) return { rows: [{ seq: 1, what: 'firing', at: '2026-10-08 00:00:00', answer: { kind: 'job', job: TIMING_JOB, finished: false } }], more: false }
    if (path.includes('/counter-1?')) return { rows: [], more: false }
    if (path.startsWith('/api/merge-queue?')) return { lanes: [{ entries: queueBusy ? [{}] : [] }] }
    if (path === '/api/records' && method === 'POST') return { record: { id: 'result' }, body }
    if (path === '/api/records/result/revisions') return { revisions: [{ seq: 1, contentHash: 'synthetic-hash' }] }
    if (path === '/api/records/result/short-forms' && method === 'GET') return { levels: [{ rung: 'outline', why: 'notWritten' }] }
    return {}
  })
  const run = vi.fn(async () => ({ code: 0, commit, measurements: measured }))
  const doors = { ask, reading: () => ({ load1: load, cores: 20, memAvailableKiB: 90_000_000 }), run, load: (key: string) => state.get(key) ?? {}, save: (key: string, value: any) => { state.set(key, value) }, now: () => now, lane: '/synthetic-main', reader: 'wren' as string | null }
  return { doors, ask, run, now, state }
}

it('leaves pending work untouched while either the machine or the merge bus is busy, then starts it when quiet', async () => {
  for (const busy of [fixture(6), fixture(1, true)]) {
    expect(await timingJobTick(busy.doors)).toContain('waits')
    expect(busy.run).not.toHaveBeenCalled()
    expect(busy.ask.mock.calls.some(([, path]) => path.endsWith('/answer'))).toBe(false)
  }
  const quiet = fixture(5)
  expect(await timingJobTick(quiet.doors)).toContain('passed')
  expect(quiet.run).toHaveBeenCalledExactlyOnceWith(null)
  const posted = quiet.ask.mock.calls.find(([method, path]) => method === 'POST' && path === '/api/records')![2]
  expect(posted.data.for).toBe('wren')
  expect(posted.data.extra.timingJob.commit).toBe(commit)
  expect(posted.data.extra.timingJob.measurements).toEqual(measured)
  expect(posted.data.blocks.map((one: any) => one.text).join('\n')).toContain('125 ms against 300 ms (pass)')
  expect(quiet.ask.mock.calls.some(([, path]) => path.endsWith('/answer'))).toBe(true)
})

// NO READER NAMED (decision lLDy-GJmBr1t, which replaces xkZEzm9pjbr3): the report is still filed and still answers the
// firing, addressed to nobody. The tick does everything else it would do with a reader, and then fails once, with a
// sentence that names every such report and the setting, before the tick's own sentence. So the timer shows a failed
// run. No other name takes the setting's place.
it('files the report for nobody and answers the firing, then fails naming MOLE_OFFICE_TIMING_REPORT_READER, while it names no reader', async () => {
  expect(settingNamed('MOLE_OFFICE_TIMING_REPORT_READER')).toMatchObject({ kind: 'word', fallback: null })
  const quiet = fixture()
  quiet.doors.reader = null
  await expect(timingJobTick(quiet.doors)).rejects.toThrow(new Error('The timing report result was filed and answered its firing, but it is addressed to nobody, because MOLE_OFFICE_TIMING_REPORT_READER names no reader. Timing passed; nobody was notified.'))
  const posted = quiet.ask.mock.calls.find(([method, path]) => method === 'POST' && path === '/api/records')![2]
  expect('for' in posted.data).toBe(false)
  expect(quiet.ask.mock.calls.some(([, path]) => path.endsWith('/answer'))).toBe(true)
})

/** The fixture with no reader, whose weekly counter holds the firings `at`, and whose reports are result-1, result-2 and on. */
function twoFiringsForNobody(at: string[]) {
  const f = fixture()
  f.doors.reader = null
  const asked = f.ask.getMockImplementation()!
  let filed = 0
  f.ask.mockImplementation(async (method: string, path: string, body?: any) => {
    if (path.includes('/counter-0?')) return { rows: at.map((when, i) => ({ seq: i + 1, what: 'firing', at: when, answer: { kind: 'job', job: TIMING_JOB, finished: false } })), more: false }
    if (path === '/api/records' && method === 'POST') return { record: { id: `result-${String(++filed)}` } }
    if (/^\/api\/records\/result-\d+\/revisions$/.test(path)) return { revisions: [{ seq: 1, contentHash: 'synthetic-hash' }] }
    if (/^\/api\/records\/result-\d+\/short-forms$/.test(path) && method === 'GET') return { levels: [] }
    return asked(method, path, body)
  })
  const answered = () => f.ask.mock.calls.filter(([method, path]) => method === 'POST' && path.endsWith('/answer')).map(([, path, body]) => [path, body.result])
  return { ...f, answered }
}

// ONE TICK, ONE FAILURE (decision lLDy-GJmBr1t): with no reader, a firing behind the first is not left for the next
// tick. Both firings past their deadline are answered, and then the tick fails once, naming both reports.
it('answers both firings past their deadline in one tick, then fails once naming both reports, while it names no reader', async () => {
  const f = twoFiringsForNobody(['2026-10-04 00:00:00', '2026-10-05 00:00:00'])
  await expect(timingJobTick(f.doors)).rejects.toThrow(new Error('The timing reports result-1 and result-2 were filed and answered their firings, but they are addressed to nobody, because MOLE_OFFICE_TIMING_REPORT_READER names no reader. Timing firings wait for the next tick, or were answered at their deadline.'))
  expect(f.answered()).toEqual([['/api/counters/counter-0/firings/1/answer', 'result-1'], ['/api/counters/counter-0/firings/2/answer', 'result-2']])
  expect(f.run).not.toHaveBeenCalled()
})

// A TICK THAT ALSO FAILS FOR ANOTHER REASON gives that reason, after the sentence naming the reports it filed for
// nobody: here the first firing is past its deadline, and the merge queue then cannot be read for the second.
it('names the report it filed for nobody before the reason, when the tick also fails for another reason', async () => {
  const why = 'Merge entry made-up-unreadable does not hold what the merge queue writes: it names nobody as its submitter.'
  const f = twoFiringsForNobody(['2026-10-04 00:00:00', '2026-10-08 00:00:00'])
  const asked = f.ask.getMockImplementation()!
  f.ask.mockImplementation(async (method: string, path: string, body?: any) =>
    path.startsWith('/api/merge-queue?') ? { lanes: [{ entries: [] }], unreadable: [{ id: 'made-up-unreadable', title: 'A made-up entry', why }] } : asked(method, path, body))
  await expect(timingJobTick(f.doors)).rejects.toThrow(new Error(`The timing report result-1 was filed and answered its firing, but it is addressed to nobody, because MOLE_OFFICE_TIMING_REPORT_READER names no reader. The merge queue could not read every entry, so whether the lane is busy cannot be told: ${why}`))
  expect(f.answered()).toEqual([['/api/counters/counter-0/firings/1/answer', 'result-1']])
  expect(f.run).not.toHaveBeenCalled()
})

// THE LIST LEAVES OUT AN ENTRY IT CANNOT READ,
// and that entry may be the one testing, so the lane is not taken to be quiet.
it('starts nothing, and says why, while the merge queue names an entry of the lane it cannot read', async () => {
  const why = 'Merge entry made-up-unreadable does not hold what the merge queue writes: it names nobody as its submitter.'
  const quiet = fixture(1)
  const asked = quiet.ask.getMockImplementation()!
  quiet.ask.mockImplementation(async (method: string, path: string, body?: any) =>
    path.startsWith('/api/merge-queue?') ? { lanes: [{ entries: [] }], unreadable: [{ id: 'made-up-unreadable', title: 'A made-up entry', why }] } : asked(method, path, body))
  await expect(timingJobTick(quiet.doors)).rejects.toThrow(why)
  expect(quiet.run).not.toHaveBeenCalled()
})

it('keeps a busy measurement pending without new office records, and ends it at the three-day deadline', async () => {
  const f = fixture()
  f.run.mockResolvedValue({ code: 3, commit, measurements: { ...measured, quiet: false, status: 'unqualified: machine busy' } })
  expect(await timingJobTick(f.doors)).toContain('unqualified')
  expect(f.ask.mock.calls.some(([method, path]) => method === 'POST' && path === '/api/records')).toBe(false)
  f.now.setTime(f.now.getTime() + TIMING_DEADLINE_MS)
  await timingJobTick(f.doors)
  expect(f.run).toHaveBeenCalledTimes(1)
  expect(f.ask.mock.calls.find(([method, path]) => method === 'POST' && path === '/api/records')![2].data.extra.timingJob.status).toBe('not-run')
})

it('treats an over-budget fixture or press as a failure even if the process claims green', async () => {
  for (const measurements of [{ ...measured, coldFixtureMs: 60_001 }, { ...measured, runs: [[{ press: 'Collect', ms: 301, doors: [] }]] }]) {
    const f = fixture()
    f.run.mockResolvedValue({ code: 0, commit, measurements })
    expect(await timingJobTick(f.doors)).toContain('failed')
    expect(f.ask.mock.calls.find(([method, path]) => method === 'POST' && path === '/api/records')![2].data.extra.timingJob.status).toBe('failed')
  }
})

it('advances the dedicated clone and runs the exact timing group only through the sandbox door', async () => {
  const root = mkdtempSync(join(tmpdir(), 'scheduled-timing-stand-in-'))
  mkdirSync(join(root, '.logs'))
  const command = vi.fn((program: string, args: string[], _timeout: number, _env?: Record<string, string>) => {
    let stdout = ''
    if (program === 'git' && args.includes('rev-parse')) stdout = commit
    if (program !== 'git' && args.includes('tools/run-named-tests.mjs')) writeFileSync(join(root, '.logs', 'timing-synthetic.json'), JSON.stringify(measured))
    return { pid: 0, output: [], stdout, stderr: '', status: 0, signal: null } as any
  })
  try {
    expect((await runTimingInSandbox(root, '/synthetic-main', null, command)).commit).toBe(commit)
    const [checkout, sandbox, ...more] = command.mock.calls.filter(([program]) => program !== 'git')
    expect(more).toEqual([])
    expect(sandbox![1]).toEqual(['/synthetic-main/tools/sandbox.mjs', 'exec', 'timing', '--wait', '--timeout', '600', '--plain-env', '--cwd', root, '--', 'node', 'tools/run-named-tests.mjs', '--list', 'timing'])
    // The clone is one the timing sandbox writes: the checkout, and the look for changes before it, run inside it.
    expect(checkout![1].slice(0, 10)).toEqual(['/synthetic-main/tools/sandbox.mjs', 'exec', 'timing', '--wait', '--timeout', '120', '--plain-env', '--cwd', root, '--'])
    expect(checkout![1].slice(10, 12)).toEqual(['sh', '-c'])
    expect(checkout![1][12]).toContain('git status --porcelain')
    expect(checkout![1][12]).toContain('git checkout -q --detach "$1"')
    expect(checkout![1].slice(13)).toEqual(['timing-checkout', commit])
    // Git on the host reads only refs and fetches, with the guard.
    const onTheHost = command.mock.calls.filter(([program]) => program === 'git')
    expect(onTheHost.map(([, args]) => args.slice(args.indexOf(root) + 1, args.indexOf(root) + 2)[0])).toEqual(['fetch', 'rev-parse'])
    for (const [, args, , env] of onTheHost) {
      expect(args).toContain('core.hooksPath=/dev/null')
      expect(env).toMatchObject({ GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_ALLOW_PROTOCOL: 'file' })
    }
  } finally { rmSync(root, { recursive: true, force: true }) }
})

it('does not advance a clone with changes, as the sandbox found it, and runs no timing', async () => {
  const root = mkdtempSync(join(tmpdir(), 'scheduled-timing-stand-in-'))
  const command = vi.fn((program: string, args: string[]) => {
    const status = program !== 'git' && args.includes('timing-checkout') ? 3 : 0
    return { pid: 0, output: [], stdout: program === 'git' ? commit : '', stderr: '', status, signal: null } as any
  })
  try {
    await expect(runTimingInSandbox(root, '/synthetic-main', null, command)).rejects.toThrow('The timing clone has changes; it was not advanced.')
    expect(command.mock.calls.some(([, args]) => args.includes('tools/run-named-tests.mjs'))).toBe(false)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
