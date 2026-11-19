// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ADAPTABLE TIMERS ARE A COPY OF THE OFFICE'S COUNTERS THAT ANYBODY MAY CHANGE, AND THEY KEEP THE COUNTERS' RULES.
 *
 * tools/adaptable-timers.mjs is the toolset's adaptable copy of the office's own timers and triggers (the owner's
 * decision on the toolset's principles, and the coordinator's choice of a first version that holds timers and
 * hand-added counts only). Each test here runs the tool as a process of its own, in a folder made for the test, and
 * reads what it printed and the one state file it keeps there:
 *   - a count is added to by hand, and an addition with no reason is refused;
 *   - the four triggers keep the counters' rules: count at n, amount at m (which needs what is measured), quiet, and
 *     every (from the last firing, or from `from` in steps), and every waits for a count of 1 unless it is a timer;
 *   - one action runs when a trigger holds, and the count starts again from zero;
 *   - a message or a task says it was neither sent nor filed, because the tool holds no key, and a command runs;
 *   - the state is one JSON file in the folder the caller names, and two processes never write it at once;
 *   - watch fires while it runs;
 *   - the toolset entry's example is a call the tool takes.
 *
 * Time is moved by rewriting the stamps in the state file, never by waiting. Every child process is started with no
 * office variables, so nothing here can write to an office.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ENTRIES } from '../tools/file-the-basic-toolset.mjs'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(ROOT, 'tools', 'adaptable-timers.mjs')
const STATE = 'adaptable-timers.json'

let folder = ''

beforeEach(() => {
  folder = aTestDatabaseFolder('adaptable-timers')
})

afterEach(() => {
  removeThisTestFolder(folder)
})

/** The tool's environment: a path to find `sh` and node, and no office variable at all. */
function anEnvironmentWithNoOffice(): NodeJS.ProcessEnv {
  return { PATH: process.env['PATH'] ?? '', HOME: folder, ...(process.env['TZ'] === undefined ? {} : { TZ: process.env['TZ'] }) }
}

function run(...args: string[]): { status: number | null; out: string; err: string } {
  const done = spawnSync(process.execPath, [TOOL, ...args], { cwd: folder, env: anEnvironmentWithNoOffice(), encoding: 'utf8', timeout: 20_000 })
  return { status: done.status, out: done.stdout, err: done.stderr }
}

/** One call in the folder made for this test. */
function timers(command: string, ...args: string[]): { status: number | null; out: string; err: string } {
  return run(command, ...args, '--folder', folder)
}

interface Row {
  kind: string
  at: string
  reason?: string
  count?: number
  amount?: number
  exit?: number | null
}

interface Timer {
  made: string
  rows: Row[]
}

function theState(): { timers: Record<string, Timer> } {
  return JSON.parse(readFileSync(join(folder, STATE), 'utf8')) as { timers: Record<string, Timer> }
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function aLocalStamp(at: Date): string {
  return `${String(at.getFullYear())}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`
}

function theMomentOf(stamp: string): Date {
  const [day = '', time = '00:00:00'] = stamp.split(' ')
  const [y, mo, d] = day.split('-').map(Number)
  const [h, mi, s] = time.split(':').map(Number)
  return new Date(y ?? 0, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0, s ?? 0)
}

/** Moves every moment one timer has recorded back by `minutes`, as if that much time had passed. */
function moveBack(name: string, minutes: number): void {
  const state = theState()
  const timer = state.timers[name]
  if (timer === undefined) throw new Error(`No timer named ${name} in the state file.`)
  const back = (stamp: string): string => aLocalStamp(new Date(theMomentOf(stamp).getTime() - minutes * 60_000))
  timer.made = back(timer.made)
  for (const row of timer.rows) row.at = back(row.at)
  // WRITTEN WHOLE AND THEN RENAMED, so a watch reading the file at that moment never reads half of it.
  writeFileSync(join(folder, `${STATE}.moved`), JSON.stringify(state, null, 2))
  renameSync(join(folder, `${STATE}.moved`), join(folder, STATE))
}

function firings(name: string): Row[] {
  return (theState().timers[name]?.rows ?? []).filter((row) => row.kind === 'firing')
}

function everyFileUnder(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) everyFileUnder(path, out)
    else if (/\.(ts|tsx|mts|mjs|js|cjs|vue)$/.test(name)) out.push(path)
  }
  return out
}

describe('a count is added to by hand, with a reason', () => {
  it('fires its message at the count, says it was not sent, and starts again from zero', () => {
    expect(timers('make', 'reviews', '--count', '3', '--action', 'message', '--words', 'Three reviews are waiting.').status).toBe(0)
    expect(timers('add', 'reviews', '--reason', 'the first review came in').status).toBe(0)
    const second = timers('add', 'reviews', '--reason', 'the second review came in')
    expect(second.out).not.toMatch(/fired/i)
    const third = timers('add', 'reviews', '--reason', 'the third review came in')
    expect(third.status).toBe(0)
    expect(third.out).toMatch(/fired/i)
    expect(third.out).toContain('Three reviews are waiting.')
    expect(third.out).toMatch(/NOT SENT/)
    expect(third.out).toMatch(/holds no key/)
    expect(firings('reviews')).toHaveLength(1)
    expect(timers('list').out).toMatch(/reviews: count 0\b/)
    const rows = theState().timers['reviews']?.rows ?? []
    expect(rows.filter((row) => row.kind === 'addition').map((row) => row.reason)).toEqual(['the first review came in', 'the second review came in', 'the third review came in'])
  })

  it('adds the number it is given', () => {
    timers('make', 'pages', '--count', '5', '--action', 'message', '--words', 'Five pages.')
    expect(timers('add', 'pages', '--reason', 'four pages at once', '--count', '4').out).not.toMatch(/fired/i)
    expect(timers('add', 'pages', '--reason', 'one more page').out).toMatch(/fired/i)
  })

  it('refuses an addition with no reason, and keeps the count as it was', () => {
    timers('make', 'reviews', '--count', '1', '--action', 'message', '--words', 'One review.')
    const refused = timers('add', 'reviews')
    expect(refused.status).toBe(2)
    expect(refused.err).toMatch(/reason/)
    expect(theState().timers['reviews']?.rows).toEqual([])
  })

  it('refuses a call that names no folder, and a folder where nothing was made', () => {
    const noFolder = run('list')
    expect(noFolder.status).toBe(2)
    expect(noFolder.err).toMatch(/--folder/)
    const nothing = timers('add', 'reviews', '--reason', 'a review')
    expect(nothing.status).toBe(2)
    expect(nothing.err).toContain(folder)
    expect(existsSync(join(folder, STATE))).toBe(false)
  })
})

describe('the amount trigger', () => {
  it('needs to know what is measured', () => {
    const refused = timers('make', 'spend', '--amount', '10', '--action', 'task', '--title', 'Look at the spending')
    expect(refused.status).toBe(2)
    expect(refused.err).toMatch(/--amount-is/)
    expect(existsSync(join(folder, STATE))).toBe(false)
  })

  it('fires its task when the amount reaches m, and says the task was not filed', () => {
    timers('make', 'spend', '--amount', '10', '--amount-is', 'dollars', '--action', 'task', '--title', 'Look at the spending')
    expect(timers('add', 'spend', '--reason', 'a model call', '--amount', '6').out).not.toMatch(/fired/i)
    const fired = timers('add', 'spend', '--reason', 'a second model call', '--amount', '4.5')
    expect(fired.out).toMatch(/fired/i)
    expect(fired.out).toContain('Look at the spending')
    expect(fired.out).toMatch(/NOT FILED/)
    expect(timers('list').out).toMatch(/spend: count 0, amount 0 dollars\b/)
  })
})

describe('the quiet trigger: nobody added for N minutes, with a count of at least 1', () => {
  it('runs its command once nobody has added for the minutes it names', () => {
    const mark = join(folder, 'the-command-ran.txt')
    timers('make', 'settle', '--quiet', '30', '--action', 'command', '--command', `printf '%s %s' "$ADAPTABLE_TIMER_NAME" "$ADAPTABLE_TIMER_COUNT" > '${mark}'`)
    timers('add', 'settle', '--reason', 'a change')
    timers('add', 'settle', '--reason', 'another change')
    expect(timers('tick').out).not.toMatch(/fired/i)
    moveBack('settle', 29)
    expect(timers('tick').out).not.toMatch(/fired/i)
    moveBack('settle', 2)
    const fired = timers('tick')
    expect(fired.status).toBe(0)
    expect(fired.out).toMatch(/fired/i)
    expect(readFileSync(mark, 'utf8')).toBe('settle 2')
    expect(firings('settle')[0]?.exit).toBe(0)
  })

  it('never fires on a count of zero', () => {
    timers('make', 'settle', '--quiet', '30', '--action', 'message', '--words', 'Settled.')
    moveBack('settle', 120)
    expect(timers('tick').out).not.toMatch(/fired/i)
    expect(firings('settle')).toEqual([])
  })

  it('says a command that failed, and exits 1', () => {
    timers('make', 'settle', '--quiet', '1', '--action', 'command', '--command', 'exit 3')
    timers('add', 'settle', '--reason', 'a change')
    moveBack('settle', 2)
    const failed = timers('tick')
    expect(failed.status).toBe(1)
    expect(failed.out).toMatch(/exit code 3/)
    expect(firings('settle')[0]?.exit).toBe(3)
  })
})

describe('the every trigger', () => {
  it('fires a timer every so many hours from its last firing, with no count', () => {
    timers('make', 'hourly', '--every', '1', '--timer', '--action', 'message', '--words', 'An hour has passed.')
    expect(timers('tick').out).not.toMatch(/fired/i)
    moveBack('hourly', 61)
    expect(timers('tick').out).toContain('An hour has passed.')
    expect(timers('tick').out).not.toMatch(/fired/i)
    moveBack('hourly', 59)
    expect(timers('tick').out).not.toMatch(/fired/i)
    moveBack('hourly', 2)
    expect(timers('tick').out).toMatch(/fired/i)
    expect(firings('hourly')).toHaveLength(2)
  })

  it('waits for a count of 1 when it is not a timer', () => {
    timers('make', 'digest', '--every', '1', '--action', 'message', '--words', 'The digest.')
    moveBack('digest', 61)
    expect(timers('tick').out).not.toMatch(/fired/i)
    expect(timers('add', 'digest', '--reason', 'an item for the digest').out).not.toMatch(/fired/i)
    expect(timers('tick').out).toContain('The digest.')
  })

  it('counts its steps from `from` when it names one', () => {
    const from = new Date(Date.now() - 90 * 60_000)
    const fromStamp = aLocalStamp(from).slice(0, 16)
    timers('make', 'stepped', '--every', '1', '--from', fromStamp, '--timer', '--action', 'message', '--words', 'A step.')
    moveBack('stepped', 25)
    // `from` was 90 minutes ago, so its steps fall 30 minutes ago and in 30 minutes. Made 25 minutes ago, the timer is
    // next due in 30 minutes, and with no `from` it would be due in 35.
    expect(timers('tick').out).not.toMatch(/fired/i)
    moveBack('stepped', 7)
    // Made 32 minutes ago, it was due 30 minutes ago, at a step of `from`. With no `from` it would be due in 28.
    expect(timers('tick').out).toMatch(/fired/i)
  })

  it('a timer takes no addition and no trigger that needs one', () => {
    timers('make', 'hourly', '--every', '1', '--timer', '--action', 'message', '--words', 'An hour.')
    const added = timers('add', 'hourly', '--reason', 'by mistake')
    expect(added.status).toBe(2)
    expect(added.err).toMatch(/timer/)
    const counted = timers('make', 'counted', '--every', '1', '--count', '2', '--timer', '--action', 'message', '--words', 'Two.')
    expect(counted.status).toBe(2)
    expect(Object.keys(theState().timers)).toEqual(['hourly'])
  })
})

describe('one state file, written by one process at a time', () => {
  it('keeps everything in one JSON file in the folder named, and nothing else there', () => {
    timers('make', 'reviews', '--count', '2', '--action', 'message', '--words', 'Two reviews.')
    timers('add', 'reviews', '--reason', 'a review')
    expect(readdirSync(folder)).toEqual([STATE])
  })

  it('refuses to write while another process holds the state, and says which file to look at', () => {
    timers('make', 'reviews', '--count', '2', '--action', 'message', '--words', 'Two reviews.')
    writeFileSync(join(folder, `${STATE}.lock`), 'another process')
    const busy = timers('add', 'reviews', '--reason', 'a review')
    expect(busy.status).toBe(75)
    expect(busy.err).toContain(`${STATE}.lock`)
    expect(theState().timers['reviews']?.rows).toEqual([])
  })

  it('refuses to make a second timer of the same name', () => {
    timers('make', 'reviews', '--count', '2', '--action', 'message', '--words', 'Two reviews.')
    const again = timers('make', 'reviews', '--count', '9', '--action', 'message', '--words', 'Nine.')
    expect(again.status).toBe(2)
    expect(theState().timers['reviews']).toBeDefined()
  })
})

describe('it fires only while its process runs', () => {
  it('watch checks the triggers again and again until it is stopped', async () => {
    timers('make', 'hourly', '--every', '1', '--timer', '--action', 'message', '--words', 'An hour has passed.')
    moveBack('hourly', 61)
    const watching = spawn(process.execPath, [TOOL, 'watch', '--folder', folder, '--seconds', '1'], { cwd: folder, env: anEnvironmentWithNoOffice() })
    let out = ''
    watching.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf8')
    })
    try {
      const until = Date.now() + 15_000
      while (firings('hourly').length === 0 && Date.now() < until) await new Promise((done) => setTimeout(done, 200))
      expect(firings('hourly')).toHaveLength(1)
      moveBack('hourly', 61)
      const again = Date.now() + 15_000
      while (firings('hourly').length < 2 && Date.now() < again) await new Promise((done) => setTimeout(done, 200))
      expect(firings('hourly')).toHaveLength(2)
      expect(out).toContain('An hour has passed.')
    } finally {
      watching.kill('SIGTERM')
    }
  })
})

describe('what it says about the office', () => {
  const entry = ENTRIES.find((one) => one.data.slug === 'adaptable-timers')

  it('the entry’s example is a call the tool takes', () => {
    const calls = String(entry?.data.example ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('node tools/adaptable-timers.mjs '))
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      const done = spawnSync('sh', ['-c', call.replace('node tools/adaptable-timers.mjs', `"${process.execPath}" "${TOOL}"`)], {
        cwd: folder,
        env: anEnvironmentWithNoOffice(),
        encoding: 'utf8',
        timeout: 20_000,
      })
      expect({ call, status: done.status, err: done.stderr }).toEqual({ call, status: 0, err: '' })
    }
  })
})
