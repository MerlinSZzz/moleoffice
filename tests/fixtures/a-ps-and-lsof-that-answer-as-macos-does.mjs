// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * A `ps` AND AN `lsof` FOR A TEST ON LINUX, WHICH ANSWER ABOUT ONE OF THIS MACHINE'S REAL PROCESSES AT A TIME, IN
 * THE FORMATS macOS PRINTS.
 *
 * NOT macOS. This reads Linux's /proc and writes what it read in the formats tests/fixtures/macos/sources.json
 * cites: `ps -o pid=,ppid=,pgid=,stat=,lstart=,command=` with lstart as strftime's %c in the C locale, in local
 * time, to the second; nothing printed and exit 1 for a pid nobody has; lsof's -F fields. It lets a test start
 * the real server with the platform set to darwin, so the server reads its own process through the macOS reader.
 *
 * It answers only the questions the macOS reader asks about one process. Anything else exits 2 and says what it
 * was asked, so a question nobody answered is a failure and not a guess. Every call is written, one line each, to
 * the file in MOLE_OFFICE_TEST_MAC_COMMANDS_LOG, so a test can show which questions were asked.
 *
 * NOTHING ABOUT EVERY PROCESS (wave 13u round 104): a test looks only at what it made. `ps -axo` and
 * `lsof -a -d cwd -Fpn` ask about every process on the machine, and exit 2. The servers of the test that starts this
 * ask neither at a start.
 *
 * Run as: node a-ps-and-lsof-that-answer-as-macos-does.mjs ps|lsof <the command's own arguments>
 */
import { appendFileSync, readFileSync, readlinkSync } from 'node:fs'

const [which, ...args] = process.argv.slice(2)
const log = process.env['MOLE_OFFICE_TEST_MAC_COMMANDS_LOG']
if (log !== undefined && log !== '') appendFileSync(log, `${String(which)} ${args.join(' ')}\n`)

/** @param {string} why @returns {never} */
function notAnswered(why) {
  process.stderr.write(`this test's ${String(which)} does not answer ${JSON.stringify(args.join(' '))}: ${why}\n`)
  process.exit(2)
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const two = (/** @type {number} */ n) => String(n).padStart(2, '0')

/** strftime %c in the C locale: %a %b %e %H:%M:%S %Y, in local time. */
function percentC(/** @type {Date} */ d) {
  return `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, ' ')} ${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())} ${String(d.getFullYear())}`
}

const btime = Number(
  (readFileSync('/proc/stat', 'utf8').split('\n').find((line) => line.startsWith('btime ')) ?? '').slice(6),
)

/**
 * One process from /proc, or null when it is gone or cannot be read.
 * @param {number} pid
 */
function aProcess(pid) {
  let stat
  try {
    stat = readFileSync(`/proc/${String(pid)}/stat`, 'utf8')
  } catch {
    return null
  }
  const open = stat.indexOf('(')
  const close = stat.lastIndexOf(')')
  const comm = stat.slice(open + 1, close)
  const f = stat.slice(close + 2).trim().split(/\s+/)
  let command
  try {
    command = readFileSync(`/proc/${String(pid)}/cmdline`, 'utf8').split('\0').filter((a) => a !== '').join(' ')
  } catch {
    command = ''
  }
  const state = f[0] ?? '?'
  // Whole seconds, as lstart has them: the start in ticks of 100 a second, cut down to the second.
  const startedAt = new Date(Math.floor(btime + Number(f[19]) / 100) * 1000)
  return {
    pid,
    ppid: Number(f[1]),
    pgid: Number(f[2]),
    state,
    lstart: percentC(startedAt),
    command: state === 'Z' ? '<defunct>' : command === '' ? `(${comm})` : command,
    ucomm: comm,
  }
}

/** One line of `ps -o <columns>`, the numbers right-aligned and the state left-aligned, as ps pads them. */
function aLine(/** @type {NonNullable<ReturnType<typeof aProcess>>} */ p, /** @type {string[]} */ columns) {
  return columns
    .map((column) => {
      if (column === 'pid' || column === 'ppid' || column === 'pgid') return String(p[column]).padStart(5, ' ')
      if (column === 'stat') return p.state.padEnd(4, ' ')
      if (column === 'lstart') return `${p.lstart}    `
      if (column === 'command' || column === 'ucomm') return p[column]
      return notAnswered(`the column ${column}`)
    })
    .join(' ')
}

const ABOUT_EVERY_PROCESS = 'a question about every process on the machine; this test answers about one process at a time'

if (which === 'ps') {
  if (args.includes('-axo')) notAnswered(ABOUT_EVERY_PROCESS)
  const columnsAt = args.indexOf('-o')
  if (columnsAt === -1) notAnswered('no -o')
  const columns = (args[columnsAt + 1] ?? '').split(',').map((c) => {
    if (!c.endsWith('=')) notAnswered(`a column with a header: ${c}`)
    return c.slice(0, -1)
  })
  if (args[columnsAt + 2] !== '-p') notAnswered('no -p after the columns')
  const p = aProcess(Number(args[columnsAt + 3]))
  // A PID NOBODY HAS: nothing printed, exit 1 (Apple's ps.c: `if (nkept == 0) exit(1)`).
  if (p === null) process.exit(1)
  process.stdout.write(`${aLine(p, columns)}\n`)
  process.exit(0)
}

if (which === 'lsof') {
  const said = args.join(' ')
  const one = /^-a -p (\d+) -d (txt|cwd) -Fn$/.exec(said)
  if (one !== null) {
    const pid = Number(one[1])
    let name
    try {
      name = readlinkSync(`/proc/${String(pid)}/${one[2] === 'txt' ? 'exe' : 'cwd'}`)
    } catch {
      // lsof(8): it returns one when it fails to locate a PID it was asked to list.
      process.exit(1)
    }
    process.stdout.write(`p${String(pid)}\nf${String(one[2])}\nn${name}\n`)
    process.exit(0)
  }
  if (said === '-a -d cwd -Fpn') notAnswered(ABOUT_EVERY_PROCESS)
  notAnswered('not a question the macOS reader or probe asks at a start')
}

notAnswered('neither ps nor lsof')
