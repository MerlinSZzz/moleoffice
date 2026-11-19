// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Run the merge queue's whole suite on the cloud box. tools/cloud-suite.criteria.md names the contract.
 * The last line is the answer. A door failure exits 75 so the unchanged queue can run locally.
 * MOLE_OFFICE_CLOUD_TRANSPORT names an executable stand-in for SSH in contract tests.
 */
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { constants, closeSync, cpSync, existsSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { isIP } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { aPassedFile } from './a-passed-test-file.mjs'
import { aBoxLoad, BOX_SAMPLED_EVERY_SEC, THE_CPUS_NOT_COUNTED, theBoxUnderTheSuite } from './the-box-under-the-suite.mjs'
import { keepTheStartupJournals, maskTheJournals, ONE_JOURNAL_KEEPS_AT_MOST, THE_JOURNALS_KEEP_AT_MOST, THE_JOURNALS_LOOKED_FOR, theJournalsBeside, theJournalsKept } from './cloud-suite-journals.mjs'
import { carriesTheTestMark, THE_TEST_MARK } from '../src/config/the-test-mark.mjs'
import { theInstalledPart } from './merge-tool/installed-lock.mjs'
import { readSetting } from '../src/config/settings.mjs'

const NOT_RUN = 75
/** The runs alone after a red whole run (criteria 16 to 20): at most this many files, and the words for a file not run. */
const ALONE_LIMIT = 50
const OVER_THE_COUNT = `the limit of ${ALONE_LIMIT} files run alone was reached`
const OUT_OF_TIME = 'the time limit for runs alone was reached'
/**
 * THE QUIET SPELL (criterion 27): a whole run whose suite log, report and CPU time do not move for this long is ended as
 * hung. 45 minutes is longer than the longest time limit any one test of this project sets, 40 minutes, and it still
 * ends a stuck run more than two hours before the 3-hour bound. The CPU moved when the run's processes used, together,
 * a hundredth of the spell since the last move: an idle run uses next to none.
 */
const QUIET_SPELL_SEC = 2700
const QUIET_CPU_SHARE = 100
/** A test's shorter quiet spell, read only under the test mark, as tools/sandbox.mjs reads a wait a test may shorten. */
const A_SHORTER_QUIET_SPELL = 'MOLE_OFFICE_CLOUD_QUIET_SPELL_SECONDS'
const quote = (word) => `'${String(word).replaceAll("'", "'\\''")}'`
const no = (reason) => { throw new Error(reason) }

/** Shared by local output and the remote log filter. Keep this function self-contained except for isIP. */
function maskText(text, host = '', user = '') {
  const punctuation = /^[.:]+$/
  if (user !== '') {
    // Runner logins contain only letters, digits, underscores and hyphens.
    // Mask the whole target before host masking can put spaces inside it.
    text = text.replace(new RegExp(`(?<![\\w.-])${user}@[^\\s/'"\\\\<>]+`, 'g'), (target) => `the cloud box${target.endsWith(':') ? ':' : ''}`)
      .replace(new RegExp(`/home/${user}(?=/|$|[^\\w.-])`, 'g'), '~')
  }
  if (host !== '' && !punctuation.test(host)) text = text.split(host).join('the cloud box')
  return text.replace(/[a-fA-F0-9:.]+(?:%[a-zA-Z0-9_.-]+)?/g, (word) => {
    // Bare :: is the read recorder's separator. Punctuation alone is not an address here.
    if (punctuation.test(word)) return word
    if (isIP(word) !== 0) return 'the cloud box'
    // Sentence punctuation can be part of the candidate without being part of the address.
    let end = word.length
    while (end > 0 && /[.:]/.test(word[end - 1])) {
      end -= 1
      if (isIP(word.slice(0, end)) !== 0) return `the cloud box${word.slice(end)}`
    }
    return word
  })
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, (word) => isIP(word) === 4 ? 'the cloud box' : word)
}

/** A report's names identify the caller's files. Mask its text while keeping those names whole. */
function maskReportText(text, host, user) {
  const original = JSON.parse(text)
  const masked = JSON.parse(maskText(text, host, user))
  if (Array.isArray(original.testResults)) {
    original.testResults.forEach((one, index) => {
      if (typeof one.name === 'string') masked.testResults[index].name = one.name
    })
  }
  return JSON.stringify(masked)
}

/** Validate discovered files and mask other text without changing the producer's file names. */
function maskManifestText(text, clone, host, user) {
  const entries = JSON.parse(text)
  if (!Array.isArray(entries) || entries.length === 0) throw new Error('the test manifest must be a nonempty file list')
  for (const one of entries) {
    if (one === null || typeof one !== 'object' || Array.isArray(one) || typeof one.file !== 'string' ||
        !isAbsolute(one.file) || one.file !== resolve(one.file) || one.file === clone || !within(one.file, clone) ||
        (one.projectName !== undefined && typeof one.projectName !== 'string') ||
        Object.keys(one).some((key) => !['file', 'projectName'].includes(key))) throw new Error('the test manifest must name absolute test files inside the requested clone')
    if (maskText(one.file, host) !== one.file) throw new Error('a manifest file contains an address and cannot be masked without changing its meaning')
  }
  return JSON.stringify(entries.map((one) => ({ ...one, ...(one.projectName === undefined ? {} : { projectName: maskText(one.projectName, host, user) }) })))
}

/** A run alone's report is <alone>/<n>/report.json. Keep this function self-contained except for basename and dirname. */
function aRunAloneReport(path, alone) {
  return alone !== undefined && basename(path) === 'report.json' && dirname(dirname(path)) === alone && /^[1-9][0-9]*$/.test(basename(dirname(path)))
}

/** A run alone cut off at its limit can leave a report that is not JSON. It is masked as text, and nobody reads it as a result. */
function maskRunAloneReportText(text, host, user) {
  try { JSON.parse(text) } catch { return maskText(text, host, user) }
  return maskReportText(text, host, user)
}

const artifactPaths = (run) => [run.report, run.reads, run.log, ...(run.manifest === undefined ? [] : [run.manifest]), ...(run.alone === undefined ? [] : [run.alone]), run.journals]

/** A file named relative to the clone: no leading slash, and no empty, `.` or `..` part. */
const aCleanPathInside = (file) => typeof file === 'string' && file !== '' && !file.startsWith('/') && file.split('/').every((part) => part !== '' && part !== '.' && part !== '..')

/**
 * THE ORDER OF THE RUNS ALONE (criterion 26): the carried-over files that are red again, in their order, then the other
 * red files in sorted order. Self-contained, because the box runs it too.
 */
function theAloneOrder(red, carriedOver) {
  const first = carriedOver.filter((file) => red.includes(file))
  return [...first, ...red.filter((file) => !first.includes(file)).sort()]
}

function aQuietSpellATestMayShorten() {
  const shorter = Number(carriesTheTestMark() ? process.env[A_SHORTER_QUIET_SPELL] : undefined)
  return Number.isInteger(shorter) && shorter > 0 && shorter < QUIET_SPELL_SEC ? shorter : QUIET_SPELL_SEC
}

function argumentsOf(words) {
  const options = {}
  if (words.shift() !== 'run') no('use run with clone, commit, report, reads, log and timeout')
  while (words.length > 0) {
    const name = words.shift()
    if (!['--clone', '--commit', '--report', '--reads', '--log', '--timeout', '--manifest', '--alone', '--carried-over', '--box-sampled-every'].includes(name) || options[name] !== undefined || words.length === 0) no('the cloud suite arguments are incomplete or repeated')
    options[name] = words.shift()
  }
  for (const name of ['--clone', '--report', '--reads', '--log']) {
    if (typeof options[name] !== 'string' || !isAbsolute(options[name]) || options[name] !== resolve(options[name]) || options[name] === '/') no('the clone and artifact paths must be absolute paths below a folder')
  }
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(options['--commit'] ?? '')) no('the commit must be a full git commit hash')
  const seconds = Number(options['--timeout'])
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds * 1000 > 2147483647) no('timeout must be a positive number of seconds within the timer limit')
  const clone = options['--clone'], report = options['--report'], reads = options['--reads'], log = options['--log']
  if (new Set([clone, report, reads, log]).size !== 4 || within(clone, reads) || within(report, reads) || within(log, reads)) no('the clone and output paths overlap')
  const manifest = options['--manifest']
  if (manifest !== undefined && (!isAbsolute(manifest) || manifest !== resolve(manifest) || manifest === '/' || within(clone, manifest) ||
      [report, reads, log].includes(manifest) || within(manifest, reads) || within(reads, manifest) || [report, log].some((path) => within(path, manifest) || within(manifest, path)))) no('the manifest must be an absolute file path separate from the clone and other artifacts')
  const alone = options['--alone']
  if (alone !== undefined && manifest === undefined) no('the runs alone need the manifest')
  if (alone !== undefined && (!isAbsolute(alone) || alone !== resolve(alone) || alone === '/' ||
      [clone, report, reads, log, manifest].some((path) => within(alone, path) || within(path, alone)))) no('the alone folder must be an absolute folder path separate from the clone and other artifacts')
  // The files the last receipt left not run alone (criterion 26), as a JSON list of distinct files inside the clone.
  let carriedOver
  if (options['--carried-over'] !== undefined) {
    if (alone === undefined) no('the carried-over files need the runs alone')
    try { carriedOver = JSON.parse(options['--carried-over']) } catch { carriedOver = null }
    if (!Array.isArray(carriedOver) || new Set(carriedOver).size !== carriedOver.length || !carriedOver.every(aCleanPathInside)) no('the carried-over files must be a list of distinct files inside the clone')
  }
  // The startup journals (criterion 22) go in the folder beside the log. Like the log, it may lie inside the clone.
  const journals = theJournalsBeside(log)
  if (within(clone, journals) || [report, reads, log, manifest, alone].some((path) => path !== undefined && (within(journals, path) || within(path, journals)))) no('the startup journals folder beside the log must be separate from the clone and the other outputs')
  // A test's shorter interval, never a longer one. The queue's door and the periodic suite never pass it, so a real run is
  // read every BOX_SAMPLED_EVERY_SEC.
  const sampled = options['--box-sampled-every']
  if (sampled !== undefined && (!/^[1-9][0-9]*$/u.test(sampled) || Number(sampled) > BOX_SAMPLED_EVERY_SEC)) no('the box sample interval must be a whole number of seconds above 0')
  if (!lstatSync(clone).isDirectory()) no('the local clone is not a directory')
  return { clone, report, reads, log, ...(manifest === undefined ? {} : { manifest }), ...(alone === undefined ? {} : { alone }), ...(carriedOver === undefined ? {} : { carriedOver }), journals, commit: options['--commit'], seconds, ...(sampled === undefined ? {} : { sampledEverySec: Number(sampled) }) }
}

/** lstat refuses links; O_NOFOLLOW and fstat also check the file actually opened. Never source runner.env. */
function runnerAt(file) {
  const valid = (stat) => stat.isFile() && stat.uid === process.getuid() && (stat.mode & 0o7777) === 0o600
  let stat
  try { stat = lstatSync(file) } catch (error) {
    if (error.code === 'ENOENT') no('no runner file is configured for the cloud box')
    no('the runner file could not be read')
  }
  if (!valid(stat)) no('the runner file must be a regular file owned by this user with mode 0600')
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  let text
  try {
    if (!valid(fstatSync(fd))) no('the runner file must be a regular file owned by this user with mode 0600')
    text = readFileSync(fd, 'utf8')
  } finally { closeSync(fd) }
  const values = {}
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue
    const match = line.match(/^\s*(RUNNER_HOST|RUNNER_USER|RUNNER_KEY|RUNNER_WORKERS)\s*=\s*(.*?)\s*$/)
    if (match === null || values[match[1]] !== undefined) no('the runner file must contain the four runner settings once each')
    let value = match[2]
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    values[match[1]] = value
  }
  const host = values.RUNNER_HOST, user = values.RUNNER_USER, key = values.RUNNER_KEY, workers = Number(values.RUNNER_WORKERS)
  if (typeof host !== 'string' || (isIP(host) === 0 && !/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(host)) || typeof user !== 'string' || !/^[a-z_][a-z0-9_-]*$/.test(user) || typeof key !== 'string' || !isAbsolute(key) || !Number.isSafeInteger(workers) || workers <= 0) no('the runner file has incomplete or invalid runner settings')
  return { host, user, key, workers }
}

function within(path, folder) {
  const rel = relative(folder, path)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

/** Every child gets a small environment. Office settings and credentials never enter git or SSH. */
function childEnvironment() {
  return { PATH: process.env.PATH, HOME: homedir(), LANG: 'C.UTF-8', GIT_CONFIG_NOSYSTEM: '1', ...(carriesTheTestMark() ? { [THE_TEST_MARK]: process.env[THE_TEST_MARK] } : {}) }
}

function callerTimeZone() {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (typeof zone !== 'string' || !/^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/.test(zone)) throw new Error('invalid zone')
    // Validate the reported name without choosing a different zone.
    new Intl.DateTimeFormat('en', { timeZone: zone })
    return zone
  } catch { no('the calling machine did not return a valid time zone') }
}

/**
 * WHETHER THE WHOLE RUN GETS THE RUNNER'S SHARE-A-PROCESS SWITCH (criterion 25): only when this door's own environment
 * sets it to exactly on. The setting refuses every word but on and off, and a refused word passes nothing, as an unset
 * one does, so the box gets the script it gets without it. The answer says which.
 */
function theRunnerSharesProcesses() {
  try {
    return readSetting('MOLE_OFFICE_TEST_FILES_SHARE_A_PROCESS', process.env).value === 'on'
  } catch {
    return false
  }
}

/** A child owns a recorded process group. Text is decoded by line before masking, including split addresses. */
function command(program, words, { env, input = '', deadline, host, user, sink = null }) {
  return new Promise((done, reject) => {
    const remaining = deadline - Date.now()
    if (remaining <= 0) { reject(new Error('timeout')); return }
    const child = spawn(program, words, { env, detached: true, stdio: ['pipe', 'pipe', 'pipe'] })
    const group = child.pid
    let timedOut = false
    let spawnError = false
    let sinkError = false
    let last = ''
    const output = (stream, remember) => {
      const decoder = new StringDecoder('utf8')
      let pending = ''
      const take = (text) => {
        if (remember && text.trim() !== '') last = text
        if (text !== '') process.stdout.write(`${maskText(text, host, user)}\n`)
      }
      stream.on('data', (chunk) => {
        pending += decoder.write(chunk)
        let at
        while ((at = pending.indexOf('\n')) !== -1) {
          take(pending.slice(0, at)); pending = pending.slice(at + 1)
        }
      })
      stream.on('end', () => take(pending + decoder.end()))
    }
    if (sink === null) output(child.stdout, true)
    else {
      child.stdout.pipe(sink.stdin)
      sink.stdin.on('error', () => { sinkError = true })
    }
    output(child.stderr, false)
    // stdin can close early when SSH fails; close/exit, rather than EPIPE, is the outcome.
    child.stdin.on('error', () => {})
    child.stdin.end(input)
    const timer = setTimeout(() => {
      timedOut = true
      if (group !== undefined) {
        try { process.kill(-group, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') spawnError = true }
      }
    }, remaining)
    child.on('error', () => { spawnError = true })
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      if (timedOut) reject(new Error('timeout'))
      else done({ code, signal, last, error: spawnError || sinkError })
    })
  })
}

/**
 * THE WATCH (criterion 27), run on the box's host beside the run. While the worker's marker says the whole run's npm test
 * runs, it reads the processes under the container's init, by its process id from docker, and the sizes of the suite log
 * and the report. A run that moves none of them for the quiet spell is hung: it writes the answer, with each vitest
 * worker's kernel wait and the test file it holds, and each process left behind whose test is gone, and then ends the
 * run's own process group, TERM and then KILL. A moment it cannot read starts the spell again. Self-contained, because
 * the box runs it.
 */
function watchTheWholeRun(state, group, container, log, report, reads, quietSec, everySec, cpuShare) {
  const fs = require('node:fs'), { execFileSync } = require('node:child_process'), { join } = require('node:path')
  const nap = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
  const read = (path) => { try { return fs.readFileSync(path, 'utf8') } catch { return null } }
  const alive = () => { try { process.kill(-group, 0); return true } catch (error) { return error.code === 'EPERM' } }
  const outputs = () => [log, report].map((path) => { try { const stat = fs.statSync(path); return `${stat.size}:${stat.mtimeMs}` } catch { return 'none' } }).join(' ')
  let ticks
  try { ticks = Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }).trim()) } catch { ticks = NaN }
  // Without the clock rate the CPU time cannot be read, so the run is left to its time bound.
  if (!Number.isInteger(ticks) || ticks <= 0) return
  const aProcess = (pid) => {
    const stat = read(`/proc/${pid}/stat`)
    if (stat === null) return null
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
    let tasks = []
    try { tasks = fs.readdirSync(`/proc/${pid}/task`) } catch {}
    const children = tasks.flatMap((task) => (read(`/proc/${pid}/task/${task}/children`) ?? '').trim().split(/\s+/).filter((word) => word !== '').map(Number))
    return { pid, command: stat.slice(stat.indexOf('(') + 1, stat.lastIndexOf(')')), cpu: Number(fields[11]) + Number(fields[12]), started: Number(fields[19]), children }
  }
  const theRun = () => {
    let init
    try { init = Number(execFileSync('docker', ['inspect', '--format', '{{.State.Pid}}', container], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10_000 }).trim()) } catch { return null }
    const top = Number.isSafeInteger(init) && init > 0 ? aProcess(init) : null
    if (top === null) return null
    const all = new Map([[init, top]])
    const next = [...top.children]
    while (next.length > 0) {
      const pid = next.shift()
      const one = all.has(pid) ? null : aProcess(pid)
      if (one !== null) { all.set(pid, one); next.push(...one.children) }
    }
    return { top, all }
  }
  // The test file a worker holds: when vitest starts a test file, the worker reads its snapshot file, and the last such
  // read in the worker's own record names it. The record is named by the worker's process id inside the container.
  const theFile = (pid) => {
    const inside = /^NSpid:\s*(.+)$/m.exec(read(`/proc/${pid}/status`) ?? '')?.[1].trim().split(/\s+/).at(-1)
    let names = []
    try { names = fs.readdirSync(reads).filter((name) => inside !== undefined && name.startsWith(`${inside}-`)) } catch {}
    if (names.length === 0) return { file: null, because: 'no record of what this worker read was found' }
    let file = null
    for (const name of names) for (const line of (read(join(reads, name)) ?? '').split('\n')) {
      const snapshot = /^R (.+)\/__snapshots__\/([^/]+)\.snap$/.exec(line)
      if (snapshot !== null) file = `${snapshot[1]}/${snapshot[2]}`
    }
    return file === null ? { file: null, because: 'the record of what this worker read names no test file it started' } : { file }
  }
  let quietSince = Date.now(), used = 0, seen = new Map(), last = null
  while (fs.existsSync(state) && alive()) {
    nap(everySec * 1000)
    const now = Date.now()
    const run = fs.existsSync(join(state, 'suite-running')) ? theRun() : null
    const said = outputs()
    if (run === null) { quietSince = now; used = 0; seen = new Map(); last = said; continue }
    for (const [pid, one] of run.all) {
      const before = seen.get(pid)
      used += before === undefined || before.started !== one.started ? one.cpu : Math.max(0, one.cpu - before.cpu)
    }
    seen = run.all
    if (said !== last || used >= (quietSec / cpuShare) * ticks) { quietSince = now; used = 0; last = said; continue }
    if (now - quietSince < quietSec * 1000) continue
    const waitOf = (pid) => (read(`/proc/${pid}/wchan`) ?? '').trim()
    const workers = [...run.all.values()]
      .filter((one) => (read(`/proc/${one.pid}/cmdline`) ?? '').split('\0').some((word) => word.endsWith('/vitest/dist/workers/forks.js')))
      .map((one) => ({ pid: one.pid, wait: waitOf(one.pid), ...theFile(one.pid) }))
      .filter((one) => one.wait !== '')
    // The init's first child is the run's own command. A later one came to it when the test that started it was gone.
    const leftBehind = run.top.children.map((pid) => run.all.get(pid)).filter((one) => one !== undefined)
      .sort((a, b) => a.started - b.started || a.pid - b.pid).slice(1)
      .map((one) => ({ pid: one.pid, command: one.command, wait: waitOf(one.pid) }))
      .filter((one) => one.wait !== '')
    const named = workers.length === 0 ? 'no vitest worker was found' : workers.map((one) => `${one.file ?? `a worker whose file is unknown (${one.because})`} waits in ${one.wait}`).join('; ')
    const answer = { ran: false, reason: `the whole run did not move for ${quietSec} s and was ended as hung: ${named}`, phase: 'test', buildExitCode: 0, hung: { quietSec, workers, leftBehind } }
    fs.writeFileSync(join(state, 'hung.json.part'), JSON.stringify(answer))
    fs.renameSync(join(state, 'hung.json.part'), join(state, 'hung.json'))
    try { process.kill(-group, 'SIGTERM') } catch {}
    const until = Date.now() + 10_000
    while (alive() && Date.now() < until) nap(100)
    if (alive()) try { process.kill(-group, 'SIGKILL') } catch {}
    return
  }
}

/** The only shell here runs on the box. Local spawn always takes an argument array. */
function remoteScript(action, run, runner, token, secondsLeft = run.seconds, sampledEverySec = BOX_SAMPLED_EVERY_SEC) {
  const outputPaths = ['"$report"', '"$reads"', '"$log"', ...(run.manifest === undefined ? [] : ['"$manifest"']), ...(run.alone === undefined ? [] : ['"$alone"']), '"$journals"'].join(' ')
  const filter = `const {isIP}=require('node:net'); const maskText=${maskText.toString()}; const host=${JSON.stringify(runner.host)}; const user=${JSON.stringify(runner.user)}; require('node:readline').createInterface({input:process.stdin}).on('line',line=>console.log(maskText(line,host,user)));`
  const preface = `# cloud-suite: ${action}
set -eu
umask 077
clone=${quote(run.clone)}
report=${quote(run.report)}
reads=${quote(run.reads)}
log=${quote(run.log)}
${run.manifest === undefined ? '' : `manifest=${quote(run.manifest)}`}
${run.alone === undefined ? '' : `alone=${quote(run.alone)}`}
journals=${quote(run.journals)}
run_home=${quote(join(dirname(run.clone), `.cloud-home-${token}`))}
container=${quote(`mole-cloud-${token}`)}
cache="$HOME/.cache/mole-office/cloud-suite"
state="$cache/runs/${token}"
repository=${quote(`/home/${runner.user}/PROJECTS/mole-office`)}
not_run() { printf '{"ran":false,"reason":"%s"}\\n' "$1"; }
fail() { not_run "$1"; exit 75; }
`
  const hostChecks = `
for program in node docker git flock timeout tar sha256sum; do
  if ! command -v "$program" >/dev/null 2>&1; then fail "the cloud box has no $program on its host"; fi
done
`
  if (action === 'check') return `${preface}${hostChecks}`
  const cleanupBody = `
set -o pipefail
git -C "$repository" update-ref -d ${quote(`refs/door/${run.commit}`)} || exit 1
if [ ! -d "$state" ]; then exit 0; fi
if [ -f "$state/pgid" ]; then
  group=$(cat "$state/pgid")
  case "$group" in ''|*[!0-9]*) exit 1;; esac
  kill -TERM -- "-$group" 2>/dev/null || { kill -0 -- "-$group" 2>/dev/null && exit 1; true; }
  for turn in 1 2 3 4 5 6 7 8 9 10; do
    if ! kill -0 -- "-$group" 2>/dev/null; then break; fi
    sleep 0.1
  done
  if kill -0 -- "-$group" 2>/dev/null; then kill -KILL -- "-$group"; fi
fi
docker_failed=0
docker_output=''
if [ -f "$state/container" ]; then
  if docker_output=$(docker rm -f "$container" 2>&1); then :; else
    case "$docker_output" in *'No such container'*) :;; *) docker_failed=1;; esac
  fi
fi
if [ -f "$state/clone" ]; then rm -rf -- "$clone" || exit 1; fi
if [ -f "$state/home" ]; then rm -rf -- "$run_home" || exit 1; fi
if [ -f "$state/outputs" ]; then rm -rf -- ${outputPaths} || exit 1; fi
if [ -f "$state/partial" ]; then rm -rf -- "$(cat "$state/partial")" || exit 1; fi
# Folder removal precedes optional masking. Neither the filter nor its exit decides cleanup.
if command -v node >/dev/null 2>&1; then
  if ! printf '%s\\n' "$docker_output" | node -e ${quote(filter)} >"$state/docker-error" 2>/dev/null; then
    rm -f -- "$state/docker-error"
  fi
fi
if [ "$docker_failed" -ne 0 ]; then
  echo 'the cloud box could not stop the run container' >&2
  exit 1
fi
rm -rf -- "$state"
`
  if (action === 'cleanup') return `${preface}${cleanupBody}`
  if (action === 'artifacts') return `${preface}
test -f "$state/result"
paths=()
for file in ${outputPaths}; do
  if [ -e "$file" ]; then paths+=("\${file#/}"); fi
done
tar -C / -cf - -- "\${paths[@]}"
`
  const cloneParent = dirname(run.clone)
  const mountFolders = [...new Set([cloneParent, ...artifactPaths(run).map(dirname)])]
    .filter((folder) => folder === cloneParent || !within(folder, cloneParent))
  // A run alone never gets the share-a-process switch (criteria 17 and 25); discovery reads what the whole run reads.
  const suiteEnvironmentReading = (reads, shared = false) => `"NODE_OPTIONS=--import=$clone/tools/record-what-tests-read.mjs" "TEST_READ_ROOT=$clone" "TEST_READ_RECORD=${reads}"${run.manifest === undefined ? '' : ' "MOLE_OFFICE_WHOLE_SUITE=yes"'}${shared ? ' "MOLE_OFFICE_TEST_FILES_SHARE_A_PROCESS=on"' : ''}`
  const suiteEnvironment = suiteEnvironmentReading('$reads', run.filesShareAProcess)
  // The runs alone keep a tenth of the door's time left, at least 10 s and at most 300 s, for the return (criterion 18).
  const aloneSeconds = Math.floor(secondsLeft) - Math.min(300, Math.max(10, Math.floor(secondsLeft / 10)))
  const aloneRuns = run.alone === undefined ? '' : `
  # Runs alone (criteria 17 to 19): every file the whole run did not pass, one at a time, in the same clone, image,
  # mounts, HOME, TZ and suite environment. Only the read record and the output move. The whole run's code stays.
  alone_until=$(( $(date +%s) + 1800 ))
  if [ "$alone_until" -gt "$(( worker_started + ${aloneSeconds} ))" ]; then alone_until=$(( worker_started + ${aloneSeconds} )); fi
  mkdir -- "$alone"
  node - "$report" "$clone" "$code" "$state/alone-plan.json" >"$state/alone-plan" <<'CLOUD_ALONE_PLAN'
const fs = require('node:fs'); const {relative}=require('node:path');
const aPassedFile=${aPassedFile.toString()};
const theAloneOrder=${theAloneOrder.toString()};
const [report, clone, code, plan]=process.argv.slice(2);
let files=[];
// A whole run that exited 0 runs nothing alone. The door refuses a report it cannot read on return, so nothing is run alone for one.
if(code!=='0') {
  try {
    const read=JSON.parse(fs.readFileSync(report,'utf8'));
    if(Array.isArray(read.testResults)) files=theAloneOrder([...new Set(read.testResults.filter(one=>!aPassedFile(one)).map(one=>relative(clone,one.name)))], ${JSON.stringify(run.carriedOver ?? [])});
  } catch {}
}
fs.writeFileSync(plan, JSON.stringify(files));
process.stdout.write(files.slice(0, ${ALONE_LIMIT}).map(file=>file+'\\0').join(''));
CLOUD_ALONE_PLAN
  : >"$state/alone-done"
  n=0
  while IFS= read -r -d '' file; do
    n=$((n + 1))
    left=$(( alone_until - $(date +%s) ))
    if [ "$left" -le 0 ]; then printf '%s time\\n' "$n" >>"$state/alone-done"; continue; fi
    mkdir -- "$alone/$n"
    run_log="$alone/$n/run.log"
    if run_logged env ${suiteEnvironmentReading('$alone/$n/reads')} timeout --signal=TERM --kill-after=10 "$left" npm test -- --no-file-parallelism --reporter=default --reporter=json "--outputFile.json=$alone/$n/report.json" "$file" </dev/null; then alone_code=0; else alone_code=$?; fi
    run_log="$log"
    printf '%s %s\\n' "$n" "$alone_code" >>"$state/alone-done"
  done <"$state/alone-plan"
  node - "$state/alone-plan.json" "$state/alone-done" "$alone/index.json" <<'CLOUD_ALONE_INDEX'
const fs = require('node:fs');
const [plan, done, index]=process.argv.slice(2);
const said=new Map(fs.readFileSync(done,'utf8').split('\\n').filter(line=>line!=='').map(line=>line.split(' ')));
fs.writeFileSync(index, JSON.stringify({files: JSON.parse(fs.readFileSync(plan,'utf8')).map((file, at) => {
  if(at >= ${ALONE_LIMIT}) return {file, notRun: ${JSON.stringify(OVER_THE_COUNT)}};
  const outcome=said.get(String(at + 1));
  if(outcome === 'time') return {file, notRun: ${JSON.stringify(OUT_OF_TIME)}};
  if(!/^[0-9]+$/.test(outcome ?? '')) throw new Error('a file to run alone has no outcome');
  return {file, n: at + 1, code: Number(outcome)};
})}));
CLOUD_ALONE_INDEX
`
  const discovery = run.manifest === undefined ? '' : `
build_code=$code
reason=''
if [ "$code" -eq 0 ]; then
  phase=discovery
  if run_logged env ${suiteEnvironment} node_modules/.bin/vitest list --filesOnly --json "$manifest" "--maxWorkers=$workers"; then discovery_code=0; else discovery_code=$?; fi
  if [ "$discovery_code" -ne 0 ]; then
    reason='the cloud box test-file discovery failed'
  elif ! node - "$manifest" "$clone" >>"$log" 2>&1 <<'CLOUD_DISCOVERY'
const fs = require('node:fs'); const {isIP}=require('node:net');
const {isAbsolute, relative, resolve, sep}=require('node:path');
const within=${within.toString()};
const maskText=${maskText.toString()};
const maskManifestText=${maskManifestText.toString()};
try {
  if(!fs.lstatSync(process.argv[2]).isFile()) throw new Error('discovery did not write a regular file');
  const text=maskManifestText(fs.readFileSync(process.argv[2],'utf8'),process.argv[3],${JSON.stringify(runner.host)},${JSON.stringify(runner.user)});
  fs.writeFileSync(process.argv[2],text);
} catch {
  console.error('discovery did not return a valid nonempty test manifest');
  process.exitCode=1;
}
CLOUD_DISCOVERY
  then
    reason='the cloud box test-file discovery returned no valid nonempty manifest'
  fi
  # Discovery is not a test run. Its recorder output cannot stand in for suite reads.
  rm -rf -- "$reads"
  if [ "$reason" != '' ]; then
    rm -rf -- "$manifest"
    code=75
  fi
fi
`
  const resultLine = run.manifest === undefined
    ? `printf '{"phase":"%s","code":%s}\\n' "$phase" "$code" >"$state/result"`
    : `if [ "$phase" = discovery ]; then
  printf '{"ran":false,"phase":"discovery","code":75,"buildExitCode":%s,"reason":"%s"}\\n' "$build_code" "$reason" >"$state/result"
elif [ "$phase" = test ]; then
  printf '{"phase":"test","code":%s,"buildExitCode":%s,"suiteExitCode":%s}\\n' "$code" "$build_code" "$code" >"$state/result"
else
  printf '{"phase":"build","code":%s,"buildExitCode":%s}\\n' "$code" "$build_code" >"$state/result"
fi`
  return `${preface}
set -E
trap 'fail "the cloud box could not prepare or run the suite"' ERR
${hostChecks}
box_started=$(date +%s%3N)
mkdir -p "$cache/runs" || fail 'the cloud box could not make its cache folder'
exec 9>"$cache/suite.lock" || fail 'the cloud box could not open its suite lock file'
if ! flock -n 9; then
  echo '{"ran":false,"reason":"the cloud box is busy with another suite"}'
  exit 75
fi
mkdir "$state" || fail 'the cloud box could not make its run state folder'
export clone report reads log ${run.manifest === undefined ? '' : 'manifest'} ${run.alone === undefined ? '' : 'alone'} journals run_home container cache state repository
cleanup_remote() (
${cleanupBody}
)
trap 'cleanup_remote || true; fail "the cloud box run was interrupted"' HUP TERM INT
# The remote timeout also works if the local SSH connection disappears.
setsid timeout --signal=TERM --kill-after=3 ${quote(secondsLeft)} bash -s <<'CLOUD_WORKER' &
set -Eeu
fail() { printf '%s\\n' "$1" >"$state/reason"; exit 75; }
trap 'fail "the cloud box could not prepare or run the suite"' ERR
${run.alone === undefined ? '' : 'worker_started=$(date +%s)'}
while [ ! -f "$state/go" ]; do sleep 0.02; done
# THE BOX'S CPUS (criterion 24), counted on the host before anything is made, with the two variables nproc would print
# taken out. The suite runs at the runner file's worker count or at the CPUs, whichever is fewer.
cpus=$(env -u OMP_NUM_THREADS -u OMP_THREAD_LIMIT nproc) || fail ${quote(THE_CPUS_NOT_COUNTED)}
case "$cpus" in ''|*[!0-9]*|0*) fail ${quote(THE_CPUS_NOT_COUNTED)} ;; esac
workers=$(( cpus < ${runner.workers} ? cpus : ${runner.workers} ))
printf '%s %s\\n' "$cpus" "$workers" >"$state/cpus"
mkdir -p -- "$(dirname "$clone")" || fail 'the cloud box could not prepare the run clone'
mkdir -- "$clone" || fail 'the cloud box could not prepare the run clone'
touch "$state/clone"
git clone --no-checkout -- "$repository" "$clone" || fail 'the cloud box could not prepare the run clone'
git -C "$clone" checkout --detach ${quote(run.commit)} || fail 'the cloud box could not prepare the run clone'
test "$(git -C "$clone" rev-parse HEAD)" = ${quote(run.commit)} || fail 'the cloud box could not prepare the run clone'
mkdir -- "$run_home" || fail 'the cloud box could not make the run home'
touch "$state/home"
mkdir -p -- ${artifactPaths(run).map((path) => quote(dirname(path))).join(' ')} || fail 'the cloud box could not prepare the output paths'
for path in ${outputPaths}; do
  if [ -e "$path" ] || [ -L "$path" ]; then fail 'the cloud box already has a requested output path'; fi
done
touch "$state/outputs"
touch "$log" || fail 'the cloud box could not prepare the output paths'
image="mole-office-dev:$(sha256sum "$clone/sandboxes/mole-office-dev/Dockerfile" | cut -c 1-12)"
if ! docker image inspect "$image" >/dev/null 2>&1; then
  docker build -t "$image" "$clone/sandboxes/mole-office-dev"
fi
docker_args=(docker run --rm --name "$container" --init --network host -u 1000:1000
  ${mountFolders.map((folder) => `-v ${quote(`${folder}:${folder}`)}`).join('\n  ')}
  -v "$cache:$cache" -e "HOME=$run_home" -e ${quote(`TZ=${run.timeZone}`)})
touch "$state/container"
run_log="$log"
run_logged() {
  rm -f "$state/command-exit"
  "\${docker_args[@]}" -w "$working" "$image" bash -c 'set +e; exit_file=$1; shift; if ! command -v "$1" >/dev/null; then exit 75; fi; "$@"; code=$?; printf "%s\\n" "$code" >"$exit_file"; exit "$code"' cloud-suite "$state/command-exit" "$@" 2>&1 | node -e ${quote(filter)} >>"$run_log"
  codes=("\${PIPESTATUS[@]}")
  if [ "\${codes[1]}" -ne 0 ]; then echo 'the cloud box could not mask the suite log' >&2; exit 76; fi
  if [ ! -f "$state/command-exit" ]; then echo 'the cloud box did not start or finish the command' >&2; exit 75; fi
  npm_code=$(cat "$state/command-exit")
  if [ "$npm_code" != "\${codes[0]}" ]; then echo 'the cloud box command and container exits disagree' >&2; exit 75; fi
  return "$npm_code"
}
lock_hash=$(sha256sum "$clone/package-lock.json" | cut -d ' ' -f 1)
dependencies="$cache/dependencies/$lock_hash"
if [ ! -f "$dependencies/complete" ]; then
  mkdir -p "$cache/dependencies"
  partial="$cache/dependencies/.$lock_hash-${token}"
  echo "$partial" >"$state/partial"
  mkdir "$partial"
  cp "$clone/package.json" "$clone/package-lock.json" "$partial/"
  working="$partial"
  if ! run_logged npm ci; then exit 75; fi
  touch "$partial/complete"
  mv -- "$partial" "$dependencies"
  rm -- "$state/partial"
fi
cp -al -- "$dependencies/node_modules" "$clone/node_modules"
# THE LOCK OF WHAT THE INSTALL PUT IN node_modules (criterion 23), as npm wrote it, taken before anything runs there,
# with a copy of it for the hash of its packages.
if [ -f "$clone/node_modules/.package-lock.json" ]; then sha256sum "$clone/node_modules/.package-lock.json" | cut -d ' ' -f 1 >"$state/installed-lock"; cp -- "$clone/node_modules/.package-lock.json" "$state/installed-record"; fi
working="$clone"
if run_logged npm run build; then code=0; else code=$?; fi
phase=build
${discovery}
if [ "$code" -eq 0 ]; then
  phase=test
  # THE BOX UNDER THE SUITE (criterion 21): its 1-minute load and available memory, read on the host while npm test runs.
  sample_the_box() {
    set +eu
    trap - ERR
    nap=''
    trap 'kill "$nap" 2>/dev/null; exit 0' TERM
    while :; do
      load='' available=''
      read -r load _ </proc/loadavg
      while read -r key value _; do if [ "$key" = MemAvailable: ]; then available=$value; fi; done </proc/meminfo
      printf '%s %s\\n' "$load" "$available" >>"$state/box-load"
      sleep ${sampledEverySec} &
      nap=$!
      wait "$nap"
    done
  }
  sample_the_box </dev/null >/dev/null 2>&1 &
  sampler=$!
  # The watch reads this marker (criterion 27): only the whole run's npm test is watched.
  touch "$state/suite-running"
  if run_logged env ${suiteEnvironment} npm test -- "--maxWorkers=$workers" --reporter=default --reporter=json "--outputFile.json=$report"; then code=0; else code=$?; fi
  rm -f -- "$state/suite-running"
  kill "$sampler" 2>/dev/null || true
  wait "$sampler" || true
${aloneRuns}
  # THE STARTUP JOURNALS (criterion 22), copied out of the clone, bounded, before the clone is removed.
  node - "$clone" "$journals" <<'CLOUD_JOURNALS'
const fs = require('node:fs');
const keepTheStartupJournals = ${keepTheStartupJournals.toString()};
keepTheStartupJournals(fs, process.argv[2], process.argv[3], ${ONE_JOURNAL_KEEPS_AT_MOST}, ${THE_JOURNALS_KEEP_AT_MOST}, ${JSON.stringify(THE_JOURNALS_LOOKED_FOR)});
CLOUD_JOURNALS
fi
${resultLine}
# Mask the returned text, including assertion messages and command lines the read recorder saw.
node - ${outputPaths} <<'CLOUD_MASK'
const fs = require('node:fs'); const {isIP}=require('node:net');
const {basename, dirname, isAbsolute, relative, resolve, sep}=require('node:path');
const within=${within.toString()};
const maskText = ${maskText.toString()};
const maskReportText = ${maskReportText.toString()};
const maskManifestText = ${maskManifestText.toString()};
const aRunAloneReport = ${aRunAloneReport.toString()};
const maskRunAloneReportText = ${maskRunAloneReportText.toString()};
const host = ${JSON.stringify(runner.host)};
const user = ${JSON.stringify(runner.user)};
const alone = ${run.alone === undefined ? 'undefined' : JSON.stringify(run.alone)};
if(fs.existsSync(process.argv[2])) {
  const report=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
  if(Array.isArray(report.testResults) && report.testResults.some(one=>typeof one.name==='string' && maskText(one.name,host)!==one.name)) throw new Error('a report path contains an address and cannot be masked without changing its meaning');
}
function maskFile(path) {
  const stat=fs.lstatSync(path);
  if(stat.isDirectory()) { for(const name of fs.readdirSync(path)) maskFile(require('node:path').join(path,name)); return; }
  if(!stat.isFile()) throw new Error('a returned artifact is not a regular file');
  const text=fs.readFileSync(path,'utf8');
  if(aRunAloneReport(path,alone)) {
    let report=null;
    try { report=JSON.parse(text) } catch {}
    if(report!==null && Array.isArray(report.testResults) && report.testResults.some(one=>typeof one.name==='string' && maskText(one.name,host)!==one.name)) throw new Error('a report path contains an address and cannot be masked without changing its meaning');
  }
  fs.writeFileSync(path,path===process.argv[2] ? maskReportText(text,host,user) : path===process.argv[5] ? maskManifestText(text,${JSON.stringify(run.clone)},host,user) : aRunAloneReport(path,alone) ? maskRunAloneReportText(text,host,user) : maskText(text,host,user));
}
for(const path of process.argv.slice(2)) if(fs.existsSync(path)) maskFile(path);
CLOUD_MASK
CLOUD_WORKER
group=$!
echo "$group" >"$state/pgid"
node - "$state" "$group" "$container" "$log" "$report" "$reads" >/dev/null 2>&1 <<'CLOUD_WATCH' &
const [state, group, container, log, report, reads] = process.argv.slice(2);
(${watchTheWholeRun.toString()})(state, Number(group), container, log, report, reads, ${run.quietSec}, ${Math.max(1, Math.min(30, Math.floor(run.quietSec / 10)))}, ${QUIET_CPU_SHARE});
CLOUD_WATCH
watcher=$!
touch "$state/go"
if wait "$group"; then group_code=0; else group_code=$?; fi
kill "$watcher" 2>/dev/null || true
wait "$watcher" 2>/dev/null || true
# A run the watch ended as hung answers with its records, after the same cleanup as any other end.
# The group id stays, so the cleanup ends what is left of the run's own group if the watch was stopped before its KILL.
if [ -f "$state/hung.json" ]; then
  hung=$(cat "$state/hung.json")
  cleanup_remote || true
  printf '%s\n' "$hung"
  exit 75
fi
if [ "$group_code" -eq 0 ]; then
  rm "$state/pgid"
  node - "$state/result" "$box_started" "$state/box-load" "$state/installed-lock" "$state/cpus" "$state/installed-record" <<'CLOUD_TIME'
const fs = require('node:fs');
const theBoxUnderTheSuite = ${theBoxUnderTheSuite.toString()};
const theInstalledPart = ${theInstalledPart.toString()};
const file = process.argv[2];
const result = JSON.parse(fs.readFileSync(file, 'utf8'));
result.wallSec = (Date.now() - Number(process.argv[3])) / 1000;
if (result.phase === 'test') result.boxLoad = theBoxUnderTheSuite(fs.existsSync(process.argv[4]) ? fs.readFileSync(process.argv[4], 'utf8') : '', ${sampledEverySec});
if (result.phase === 'test' && fs.existsSync(process.argv[5])) result.installedLock = fs.readFileSync(process.argv[5], 'utf8').trim();
if (result.phase === 'test' && fs.existsSync(process.argv[7])) {
  try { result.installedPackages = require('node:crypto').createHash('sha256').update(theInstalledPart(fs.readFileSync(process.argv[7], 'utf8'))).digest('hex'); }
  catch (error) { result.installedPackagesUnread = String(error instanceof Error ? error.message : error).slice(0, 200) || 'it gave no reason'; }
}
const [cpus, workers] = fs.readFileSync(process.argv[6], 'utf8').trim().split(' ').map(Number);
Object.assign(result, { cpus, workers });
fs.writeFileSync(file, JSON.stringify(result));
console.log(JSON.stringify(result));
CLOUD_TIME
else
  status=$group_code
  reason='the cloud box could not prepare or run the suite'
  if [ -f "$state/reason" ]; then reason=$(cat "$state/reason"); fi
  rm -f "$state/pgid"
  cleanup_remote || true
  if [ "$status" -eq 124 ] || [ "$status" -eq 137 ]; then
    echo ${quote(JSON.stringify({ ran: false, reason: `timed out after ${run.seconds} s` }))}
  else
    not_run "$reason"
  fi
  exit 75
fi
`
}

/** The records of a run the box's watch ended as hung (criterion 27), taken only in the shape the watch writes them. */
function theHungRecords(hung, quietSec) {
  const wrong = () => no('the cloud box returned hung records it could not account for')
  const keys = (one, ...names) => one !== null && typeof one === 'object' && !Array.isArray(one) && Object.keys(one).sort().join() === names.join()
  const aPid = (pid) => Number.isSafeInteger(pid) && pid > 0
  const aWord = (word) => typeof word === 'string' && word.trim() !== ''
  if (!keys(hung, 'leftBehind', 'quietSec', 'workers') || hung.quietSec !== quietSec || !Array.isArray(hung.workers) || !Array.isArray(hung.leftBehind)) wrong()
  for (const one of hung.workers) {
    const named = keys(one, 'file', 'pid', 'wait') && aCleanPathInside(one.file)
    const unnamed = keys(one, 'because', 'file', 'pid', 'wait') && one.file === null && aWord(one.because)
    if (!(named || unnamed) || !aPid(one.pid) || !aWord(one.wait)) wrong()
  }
  for (const one of hung.leftBehind) if (!keys(one, 'command', 'pid', 'wait') || !aPid(one.pid) || typeof one.command !== 'string' || !aWord(one.wait)) wrong()
  return hung
}

/** Return files through tar into a temporary folder, then install only validated plain artifacts. */
async function artifacts({ program, ssh, env, run, runner, token, deadline, phase }) {
  const stage = mkdtempSync(join(tmpdir(), 'cloud-suite-return-'))
  try {
    const unpack = spawn('tar', ['-xf', '-', '-C', stage], { env, stdio: ['pipe', 'ignore', 'pipe'] })
    let unpackError = false
    unpack.on('error', () => { unpackError = true })
    // tar diagnostics contain no binary data and are masked before anything is printed.
    const decoder = new StringDecoder('utf8')
    let diagnostics = ''
    unpack.stderr.on('data', (chunk) => { diagnostics += decoder.write(chunk) })
    const finished = new Promise((done) => unpack.on('close', (code) => done(code)))
    let fetched, fetchError
    try { fetched = await command(program, ssh, { env, input: remoteScript('artifacts', run, runner, token), deadline, host: runner.host, user: runner.user, sink: unpack }) }
    catch (error) { fetchError = error }
    finally { unpack.stdin.end() }
    const unpackCode = await finished
    if (fetchError) throw fetchError
    if (diagnostics !== '') process.stdout.write(`${maskText(diagnostics + decoder.end(), runner.host, runner.user).trim()}\n`)
    if (fetched.error || fetched.code !== 0 || unpackError || unpackCode !== 0) no('the cloud box artifacts could not be copied back')
    const sources = artifactPaths(run).filter((path) => existsSync(join(stage, path)))
    if (!sources.includes(run.log)) no('the cloud box returned no suite log')
    const suiteRan = phase === 'test'
    if (suiteRan && !sources.includes(run.report)) no('the cloud box returned no readable Vitest report at the requested path')
    if (suiteRan && (!sources.includes(run.reads) || !lstatSync(join(stage, run.reads)).isDirectory() || readdirSync(join(stage, run.reads)).length === 0)) no('the cloud box returned no record of what the suite read')
    if (run.manifest !== undefined && suiteRan && !sources.includes(run.manifest)) no('the cloud box returned no expected test manifest at the requested path')
    if (run.manifest !== undefined && suiteRan && !lstatSync(join(stage, run.manifest)).isFile()) no('the cloud box returned no expected test manifest at the requested path')
    if (run.manifest !== undefined && !suiteRan && sources.some((path) => path !== run.log)) no('the cloud box returned test artifacts before running the suite')
    if (run.alone !== undefined && suiteRan && (!sources.includes(run.alone) || !lstatSync(join(stage, run.alone)).isDirectory())) no('the cloud box returned no runs alone at the requested path')
    if (suiteRan && (!sources.includes(run.journals) || !lstatSync(join(stage, run.journals)).isDirectory())) no('the cloud box returned no startup journals beside the suite log')
    const check = (path) => {
      const stat = lstatSync(path)
      if (stat.isDirectory()) for (const name of readdirSync(path)) check(join(path, name))
      else if (!stat.isFile()) no('the cloud box returned an artifact that is not a regular file')
      else {
        const text = readFileSync(path, 'utf8')
        const masked = path === join(stage, run.report) ? maskReportText(text, runner.host, runner.user)
          : run.manifest !== undefined && path === join(stage, run.manifest) ? maskManifestText(text, run.clone, runner.host, runner.user)
          : run.alone !== undefined && aRunAloneReport(path, join(stage, run.alone)) ? maskRunAloneReportText(text, runner.host, runner.user)
          : maskText(text, runner.host, runner.user)
        if (masked !== text) no('the cloud box returned an unmasked address or login')
      }
    }
    for (const path of sources) check(join(stage, path))
    // The box masked the journals as it masks every returned text. Here they are masked as every printed line is, too.
    if (sources.includes(run.journals)) maskTheJournals(join(stage, run.journals))
    // Remove prior local results only after checking this transfer. A stale report cannot fill a missing result.
    for (const path of artifactPaths(run)) rmSync(path, { force: true, recursive: true })
    for (const path of sources) {
      mkdirSync(dirname(path), { recursive: true })
      rmSync(path, { force: true, recursive: true })
      cpSync(join(stage, path), path, { recursive: true })
    }
  } finally { rmSync(stage, { recursive: true, force: true }) }
}

/**
 * THE RUNS ALONE THE BOX RETURNED (criterion 19): its index names each file the whole run did not pass, in the order of
 * criterion 26 and once, as run with its exit or as not run with the reason. A whole run that exited 0 has none. Anything else is
 * refused, and so is a run the index names that left no log.
 */
function theRunsAlone(run, report, code) {
  const red = code === 0 ? [] : theAloneOrder([...new Set(report.testResults.filter((one) => !aPassedFile(one)).map((one) => relative(run.clone, one.name)))], run.carriedOver ?? [])
  const wrong = () => no('the cloud box returned runs alone that do not match the red files')
  let index
  try { index = JSON.parse(readFileSync(join(run.alone, 'index.json'), 'utf8')) } catch { wrong() }
  if (index === null || typeof index !== 'object' || Object.keys(index).join() !== 'files' || !Array.isArray(index.files) || index.files.length !== red.length) wrong()
  index.files.forEach((one, at) => {
    const keys = one !== null && typeof one === 'object' && !Array.isArray(one) ? Object.keys(one).sort().join() : ''
    const ran = keys === 'code,file,n' && at < ALONE_LIMIT && one.n === at + 1 && Number.isInteger(one.code) && one.code >= 0 && one.code <= 255 &&
      existsSync(join(run.alone, String(one.n), 'run.log'))
    const notRun = keys === 'file,notRun' && one.notRun === (at < ALONE_LIMIT ? OUT_OF_TIME : OVER_THE_COUNT)
    if (one?.file !== red[at] || (!ran && !notRun)) wrong()
  })
  return index.files
}

async function main() {
  let host = '', user = ''
  let answer, exit = NOT_RUN
  let evidence = {}, hung
  const started = Date.now()
  let cleanup = null
  let run
  try {
    const defaultFile = join(homedir(), '.cache', 'mole-office', 'cloud-runner', 'runner.env')
    // Use only the calling environment. The office's .env is not a source for this door's runner.
    const named = readSetting('MOLE_OFFICE_CLOUD_RUNNER_FILE', process.env).value
    const transport = readSetting('MOLE_OFFICE_CLOUD_TRANSPORT', process.env).value
    if (carriesTheTestMark() && (!named || resolve(named) === defaultFile || !transport)) no('a run the test suite started never reaches the real cloud box')
    run = argumentsOf(process.argv.slice(2))
    const runner = runnerAt(named || defaultFile)
    host = runner.host
    user = runner.user
    run.timeZone = callerTimeZone()
    run.filesShareAProcess = theRunnerSharesProcesses()
    run.quietSec = aQuietSpellATestMayShorten()
    for (const path of [run.clone, ...artifactPaths(run), ...(run.carriedOver ?? [])]) if (maskText(path, host) !== path) no('a requested path contains an address and cannot be masked without changing its meaning')
    if (transport && (!isAbsolute(transport) || !lstatSync(transport).isFile())) no('the cloud box stand-in transport must name a regular executable file')
    const program = transport || 'ssh'
    const sshOptions = ['-i', runner.key, '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15']
    const ssh = [...sshOptions, `${runner.user}@${host}`, 'bash', '-s']
    const env = childEnvironment()
    const deadline = started + run.seconds * 1000
    const checked = await command(program, ssh, { env, input: remoteScript('check', run, runner, ''), deadline, host, user })
    if (checked.error || checked.code === 255) no('the cloud box could not be reached to receive the commit')
    if (checked.code !== 0) {
      let result
      try { result = JSON.parse(checked.last) } catch { no('the cloud box did not return a readable host check result') }
      no(typeof result.reason === 'string' ? result.reason : 'the cloud box host programs could not be checked')
    }
    const gitHost = isIP(host) === 6 ? `[${host}]` : host
    const pushed = await command('git', ['-C', run.clone, '-c', 'core.hooksPath=/dev/null', 'push', `${runner.user}@${gitHost}:/home/${runner.user}/PROJECTS/mole-office`, `${run.commit}:refs/door/${run.commit}`], {
      env: { ...env, GIT_SSH_COMMAND: [program, ...sshOptions].map(quote).join(' '), GIT_SSH_VARIANT: 'ssh' }, deadline, host, user,
    })
    if (pushed.error || pushed.code !== 0) no('the cloud box could not be reached to receive the commit')
    const token = randomBytes(12).toString('hex')
    cleanup = async () => {
      const cleaned = await command(program, ssh, { env, input: remoteScript('cleanup', run, runner, token), deadline: Date.now() + 30_000, host, user })
      return !cleaned.error && cleaned.code === 0
    }
    const remote = await command(program, ssh, { env, input: remoteScript('run', run, runner, token, Math.max(0.001, (deadline - Date.now()) / 1000), run.sampledEverySec), deadline, host, user })
    if (remote.error || remote.code === 255) no('the cloud box could not be reached to run the suite')
    let result
    try { result = JSON.parse(remote.last) } catch { no('the cloud box did not return a readable suite result') }
    // A whole run the watch ended as hung is not run, with its records and the phase and build exit that say it started.
    if (remote.code === NOT_RUN && result.ran === false && Object.hasOwn(result, 'hung')) {
      if (result.phase !== 'test' || result.buildExitCode !== 0 || Object.hasOwn(result, 'suiteExitCode') || typeof result.reason !== 'string') no('the cloud box returned hung records it could not account for')
      hung = theHungRecords(result.hung, run.quietSec)
      evidence = { phase: 'test', buildExitCode: 0 }
    }
    const discoveryFailed = run.manifest !== undefined && result.phase === 'discovery' && result.ran === false && result.code === NOT_RUN && typeof result.reason === 'string' && result.reason.trim() !== ''
    if (remote.code !== 0 || (result.ran === false && !discoveryFailed)) no(typeof result.reason === 'string' ? result.reason : 'the cloud box could not prepare or run the suite')
    const phases = run.manifest === undefined ? ['build', 'test'] : ['build', 'discovery', 'test']
    if (!phases.includes(result.phase) || !Number.isInteger(result.code) || result.code < 0 || result.code > 255 || !Number.isFinite(result.wallSec) || result.wallSec < 0) no('the cloud box returned an invalid suite result')
    if (result.phase === 'test' ? !aBoxLoad(result.boxLoad) : result.boxLoad !== undefined) no('the cloud box returned an invalid suite result')
    if (!Number.isSafeInteger(result.cpus) || result.cpus < 1 || result.workers !== Math.min(result.cpus, runner.workers)) no('the cloud box returned an invalid suite result')
    for (const field of ['installedLock', 'installedPackages']) {
      if (result[field] !== undefined && (result.phase !== 'test' || typeof result[field] !== 'string' || !/^[0-9a-f]{64}$/u.test(result[field]))) no('the cloud box returned an invalid suite result')
    }
    if (result.installedPackagesUnread !== undefined && (result.phase !== 'test' || typeof result.installedPackagesUnread !== 'string' || result.installedPackagesUnread.trim() === '' || result.installedPackages !== undefined)) no('the cloud box returned an invalid suite result')
    if (run.manifest !== undefined) {
      if (!Number.isInteger(result.buildExitCode) || result.buildExitCode < 0 || result.buildExitCode > 255 ||
          (result.phase === 'build' ? result.buildExitCode !== result.code || result.code === 0 : result.buildExitCode !== 0) ||
          (result.phase === 'test' ? result.suiteExitCode !== result.code : result.suiteExitCode !== undefined) ||
          (result.phase === 'discovery' && !discoveryFailed)) no('the cloud box returned invalid build or suite exit evidence')
      evidence = { phase: result.phase, buildExitCode: result.buildExitCode, ...(result.phase === 'test' ? { suiteExitCode: result.suiteExitCode } : {}) }
    }
    await artifacts({ program, ssh, env, run, runner, token, deadline, phase: result.phase })
    if (!existsSync(run.log)) no('the cloud box returned no suite log')
    let files = 0, failed = [], alone, journals
    if (result.phase === 'test') {
      let report
      try { report = JSON.parse(readFileSync(run.report, 'utf8')) } catch { no('the cloud box returned no readable Vitest report at the requested path') }
      if (!Array.isArray(report.testResults) || report.testResults.some((one) => typeof one.name !== 'string' || !isAbsolute(one.name) || one.name === run.clone || !within(one.name, run.clone))) no('the cloud box report names a test outside the requested clone')
      if (!existsSync(run.reads) || readdirSync(run.reads).length === 0) no('the cloud box returned no record of what the suite read')
      files = new Set(report.testResults.map((one) => one.name)).size
      failed = [...new Set(report.testResults.filter((one) => one.status === 'failed').map((one) => relative(run.clone, one.name)))].sort()
      if (run.alone !== undefined) alone = theRunsAlone(run, report, result.code)
      journals = theJournalsKept(run.journals)
    }
    // The carried-over files the box put first in its runs alone, read from its index (criterion 26).
    const listed = (alone ?? []).map((one) => one.file)
    const others = run.carriedOver === undefined ? -1 : listed.findIndex((file) => !run.carriedOver.includes(file))
    const carriedOverFirst = run.carriedOver === undefined ? undefined : listed.slice(0, others < 0 ? listed.length : others)
    answer = { ran: !discoveryFailed, code: result.code, wallSec: result.wallSec, workers: result.workers, cpus: result.cpus, runnerWorkers: runner.workers, filesShareAProcess: run.filesShareAProcess, commit: run.commit, files, failed, ...(alone === undefined ? {} : { alone }), ...(carriedOverFirst === undefined ? {} : { carriedOverFirst }), ...(journals === undefined ? {} : { journals }), ...(result.boxLoad === undefined ? {} : { boxLoad: result.boxLoad }), ...(result.installedLock === undefined ? {} : { installedLock: result.installedLock }), ...(result.installedPackages === undefined ? {} : { installedPackages: result.installedPackages }), ...(result.installedPackagesUnread === undefined ? {} : { installedPackagesUnread: maskText(result.installedPackagesUnread, host, user) }), ...evidence, ...(discoveryFailed ? { reason: maskText(result.reason, host, user) } : {}) }
    exit = result.code
  } catch (error) {
    const reason = error.message === 'timeout' && run ? `timed out after ${run.seconds} s` : error.message
    // System errors can embed targets or paths. Mask the login, host and IP literals here too.
    answer = { ran: false, reason: maskText(reason || 'the cloud suite door could not complete the run', host, user), ...evidence, ...(hung === undefined ? {} : { hung }) }
  }
  if (cleanup !== null) {
    let cleaned = false
    try { cleaned = await cleanup() } catch { /* Report cleanup failure in the answer, never success. */ }
    if (!cleaned) {
      answer = { ran: false, reason: `${answer.ran === false ? `${answer.reason}; ` : ''}the cloud box run folders could not be cleaned up`, ...evidence, ...(hung === undefined ? {} : { hung }) }
      exit = NOT_RUN
    }
  }
  if (!answer.ran) exit = NOT_RUN
  // All child streams and cleanup are finished. This is the last line on either output stream.
  process.stdout.write(`${maskText(JSON.stringify(answer), host, user)}\n`)
  process.exitCode = exit
}

await main()
