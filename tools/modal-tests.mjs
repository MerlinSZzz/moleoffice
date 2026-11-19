#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Run named tests on a Modal VM: --repo <checkout> --commit <sha> --out <report.json> -- <files>.
 * Plan-only keeps its temporary snapshot and context at the printed paths.
 * Use --all for every tracked tests/*.test.ts, or --plan-only to print the plan without calling the driver.
 * Sends one commit's tree, no history, no .env, no database and no office key.
 * Writes the report and one receipt line under ~/.cache/mole-office/modal/receipts.jsonl.
 * Receipts count sandbox seconds only. Image builds, including each commit’s npm ci, are billed separately.
 * A monthly cap based on receipts must leave room for image builds.
 * Never opens the network inside the sandbox or leaves a sandbox running.
 * Exits 0 for passed files, 1 for a red file, 75 for no result, and 2 for refused input.
 */
import { spawn, spawnSync } from 'node:child_process'
import { accessSync, constants, cpSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync, openSync, closeSync, writeSync, fchmodSync, fstatSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { localStamp } from '../src/shared/time.ts'
import { settingValue, MERGE_WORKERS_BOUNDS, MODAL_FOLDER } from '../src/config/settings.mjs'
import { stopAnUnpairedStableStart } from '../src/config/the-office-tool-environment.mjs'

// These rates estimate sandbox seconds only; billed image builds are excluded. A monthly cap must leave room for them.
export const VM_SANDBOX_RATES = Object.freeze({ at: '2026-10-11', cpuPerCoreSecond: 0.00003942, memoryPerGiBSecond: 0.00000667 })
export const VM_CHECKOUT = '/srv/sandbox/work/mole-office'
export const VM_REPORT = '/srv/sandbox/work/vitest.json'
/** The VM's size and time limit unless a flag names others. The merge queue's budget check reads them from here. */
export const VM_DEFAULTS = Object.freeze({ cpu: 10, memoryMiB: 32768, limitSeconds: 3600 })
/** The driver lets a sandbox live this many seconds past the limit, so a run may be billed for limit plus this. */
export const VM_SANDBOX_GRACE_SECONDS = 600
/** Where every run's receipt is appended, under the home folder of whoever runs it. */
export function receiptsFile() { return join(homedir(), MODAL_FOLDER, 'receipts.jsonl') }
/** The files both the runner and the second opinion check, and whether each came from a setting. */
export function modalRunnerFiles(setting = settingValue) {
  const file = (name, relative) => {
    const value = setting(name)
    return { name, path: value ?? join(homedir(), MODAL_FOLDER, relative), source: value == null ? 'the default' : 'the setting' }
  }
  return { token: file('MOLE_OFFICE_MODAL_TOKEN_FILE', 'token.toml'), python: file('MOLE_OFFICE_MODAL_PYTHON', 'venv/bin/python') }
}
export function commandList({ workers, files, zone = Intl.DateTimeFormat().resolvedOptions().timeZone }) {
  if (!zone) throw new Error('The launcher could not read its time zone.')
  return ['unshare', '--pid', '--fork', '--mount-proc', 'tini', '--', 'setpriv', '--reuid=1000', '--regid=1000', '--clear-groups', 'env', '-i',
    'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'HOME=/srv/sandbox/home', 'HOSTNAME=mole-office-tests', `TZ=${zone}`,
    'DEBIAN_FRONTEND=noninteractive', 'DISABLE_AUTOUPDATER=1', 'NPM_CONFIG_UPDATE_NOTIFIER=false', 'npm_config_nodedir=/usr/local', 'PLAYWRIGHT_BROWSERS_PATH=/ms-playwright',
    'npm', 'test', '--', `--maxWorkers=${workers}`, '--reporter=default', '--reporter=json', `--outputFile.json=${VM_REPORT}`, ...files.map(f => `${VM_CHECKOUT}/${f}`)]
}
export function estimateUSD(seconds, cpu, memoryMiB) {
  return seconds * (cpu * VM_SANDBOX_RATES.cpuPerCoreSecond + memoryMiB / 1024 * VM_SANDBOX_RATES.memoryPerGiBSecond)
}
export function readMonthReceipts(file, month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/u.test(month)) throw new Error('Name a calendar month as YYYY-MM.')
  let source
  try { source = readFileSync(file, 'utf8') } catch (error) { if (error.code === 'ENOENT') return 0; throw error }
  return source.split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(row => row.at.slice(0, 7) === month).reduce((sum, row) => {
    if (!Number.isFinite(row.estimatedUSD) || row.estimatedUSD < 0) throw new Error('A receipt has no valid estimate.')
    return sum + row.estimatedUSD
  }, 0)
}
export function validateToken(file, uid = process.getuid()) {
  if (!file) throw new Error('Set MOLE_OFFICE_MODAL_TOKEN_FILE to a regular file owned by this user with mode 0600.')
  let stat
  try { stat = lstatSync(file) } catch { throw new Error('The Modal token file is missing.') }
  if (!stat.isFile() || stat.uid !== uid || (stat.mode & 0o7777) !== 0o600) throw new Error('The Modal token file must be a regular file owned by this user with mode 0600.')
}
export function executable(value, env = process.env) {
  if (!value) throw new Error('Set MOLE_OFFICE_MODAL_PYTHON to an executable Python.')
  for (const candidate of value.includes('/') ? [resolve(value)] : (env.PATH ?? '').split(delimiter).map(folder => resolve(folder, value))) {
    try { if (statSync(candidate).isFile()) { accessSync(candidate, constants.X_OK); return candidate } } catch { /* Try the next PATH entry. */ }
  }
  throw new Error('MOLE_OFFICE_MODAL_PYTHON does not name an executable.')
}
function run(program, args, cwd) {
  const result = spawnSync(program, args, { cwd, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } })
  if (result.status !== 0) throw new Error(`${program} could not prepare the commit snapshot.`)
  return result.stdout
}
export function snapshot(repo, commit, folder) {
  const tree = run('git', ['-C', repo, 'ls-tree', '-rz', '--name-only', commit]).split('\0').filter(Boolean)
  if (tree.some(name => name.split('/').at(-1) === '.env' || /\.(db|sqlite|db-wal)$/u.test(name))) throw new Error('The commit tracks a .env or database file; it cannot be sent.')
  mkdirSync(folder)
  run('git', ['init', '-b', 'main'], folder)
  run('git', ['-c', 'protocol.file.allow=always', 'fetch', '--depth', '1', pathToFileURL(repo).href, commit], folder)
  run('git', ['reset', '--hard', commit], folder)
  rmSync(join(folder, '.git/logs'), { recursive: true, force: true })
  rmSync(join(folder, '.git/FETCH_HEAD'), { force: true })
  return tree
}
export function cutDockerfile(source) {
  const found = /^FROM mole-office-dev AS with-extra-packages\s*$/mu.exec(source)
  if (!found) throw new Error('The Dockerfile no longer has the expected extra-packages stage.')
  return source.slice(0, found.index)
}
/** Split the shell form without executing it. Quoted and escaped spaces belong to the path. */
function copyWords(source) {
  const words = []; let word = '', quote = '', started = false
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (char === '\\' && quote !== "'") {
      if (++i === source.length) throw new Error(`Unfinished escape in Dockerfile source: ${source}`)
      word += source[i]; started = true
    } else if (quote) {
      if (char === quote) quote = ''; else word += char
    } else if (char === '"' || char === "'") { quote = char; started = true }
    else if (/\s/u.test(char)) {
      if (started) { words.push(word); word = ''; started = false }
    } else { word += char; started = true }
  }
  if (quote) throw new Error(`Unfinished quote in Dockerfile source: ${source}`)
  if (started) words.push(word)
  return words
}
/** Copy only the local inputs named by the cut file, after checking every path and descendant. */
function copyDockerfileSources(dockerfile, template, context) {
  const instructions = []; let continued = ''
  for (const line of dockerfile.split(/\r?\n/u)) {
    if (/^\s*#/u.test(line) || !line.trim()) continue
    const text = line.trim()
    if (text.endsWith('\\')) { continued += text.slice(0, -1) + ' '; continue }
    instructions.push(continued + text); continued = ''
  }
  if (continued) throw new Error('The cut Dockerfile ends inside a continued instruction.')
  const stages = instructions.filter(line => /^FROM\s/iu.test(line))
  const names = new Set(stages.map(line => /\sAS\s+(\S+)\s*$/iu.exec(line)?.[1]).filter(Boolean))
  const sources = new Set()
  for (const line of instructions) {
    const instruction = /^(COPY|ADD)\s+(.+)$/iu.exec(line)
    if (!instruction) continue
    let args = instruction[2], from
    while (args.startsWith('--')) {
      const flag = /^--([\w-]+)(?:=([^\s]+))?(?:\s+|$)/u.exec(args)
      if (!flag) throw new Error(`Cannot read Dockerfile copy flags: ${line}`)
      if (flag[1] === 'from') {
        if (!flag[2]) throw new Error(`Dockerfile --from needs a stage: ${line}`)
        from = flag[2]
      }
      args = args.slice(flag[0].length)
    }
    if (from !== undefined) {
      if (!names.has(from) && !(/^(0|[1-9]\d*)$/u.test(from) && Number(from) < stages.length)) throw new Error(`Dockerfile source stage ${JSON.stringify(from)} is not in the cut file.`)
      continue
    }
    const paths = args.startsWith('[') ? JSON.parse(args) : copyWords(args)
    if (!Array.isArray(paths) || paths.length < 2 || paths.some(path => typeof path !== 'string' || !path || path.includes('\0'))) throw new Error(`Cannot read Dockerfile source paths: ${line}`)
    for (const source of paths.slice(0, -1)) sources.add(source)
  }
  const root = realpathSync(template)
  const outside = path => { const name = relative(root, path); return name === '..' || name.startsWith(`..${sep}`) || isAbsolute(name) }
  function check(path, source, ancestors = new Set()) {
    let actual
    try { actual = realpathSync(path) } catch (error) {
      if (error.code === 'ENOENT') throw new Error(`Dockerfile source ${JSON.stringify(source)} is missing from the template folder: ${path}`)
      throw error
    }
    if (outside(actual)) throw new Error(`Dockerfile source ${JSON.stringify(source)} points outside the template folder: ${path}`)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      if (ancestors.has(actual)) throw new Error(`Dockerfile source ${JSON.stringify(source)} has a directory symlink cycle: ${path}`)
      const next = new Set([...ancestors, actual])
      for (const name of readdirSync(path)) check(join(path, name), source, next)
    } else if (!stat.isFile()) throw new Error(`Dockerfile source ${JSON.stringify(source)} is not a file or directory in the template folder: ${path}`)
  }
  for (const source of sources) {
    if (isAbsolute(source) || source.split('/').includes('..')) throw new Error(`Dockerfile source ${JSON.stringify(source)} is outside the template folder.`)
    if (/[$*?\[\]]/u.test(source)) throw new Error(`Dockerfile source ${JSON.stringify(source)} needs expansion; name a literal path in the template folder.`)
    check(resolve(template, source), source)
  }
  for (const source of sources) {
    const target = resolve(context, source)
    mkdirSync(dirname(target), { recursive: true })
    cpSync(resolve(template, source), target, { recursive: true, dereference: true })
  }
}
export function driverEnvironment(tokenFile) {
  return { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? homedir(), MODAL_CONFIG_PATH: tokenFile }
}
export function maskLine(line) { return line.replace(/modal\.com\/apps\/[^/\s]+\//gu, 'modal.com/apps/<workspace>/') }
export function reportExit(report, files) {
  if (!report || !Array.isArray(report.testResults)) return 75
  if (report.testResults.some(file => file.status === 'failed' || file.assertionResults?.some(test => test.status === 'failed'))) return 1
  const names = report.testResults.map(file => file.name)
  if (names.length !== files.length || files.some(file => !names.includes(`${VM_CHECKOUT}/${file}`)) || report.testResults.some(file => file.status !== 'passed') || report.success !== true) return 75
  return 0
}
export function appendReceipt(file, receipt) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  const stat = lstatSync(dirname(file))
  if (!stat.isDirectory() || stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0) throw new Error('The receipt folder must be owned by this user with mode 0700.')
  const fd = openSync(file, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW, 0o600)
  try { const held = fstatSync(fd); if (!held.isFile() || held.uid !== process.getuid()) throw new Error('The receipt file must be a regular file owned by this user.'); fchmodSync(fd, 0o600); writeSync(fd, `${JSON.stringify(receipt)}\n`) } finally { closeSync(fd) }
}
export async function main(argv = process.argv.slice(2), setting = settingValue) {
  let scratch
  try {
    const options = {}; let files = []
    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i]
      if (arg === '--') { files = argv.slice(i + 1); break }
      if (arg === '--all' || arg === '--plan-only') options[arg.slice(2)] = true
      else if (['--repo', '--commit', '--out', '--workers', '--limit-seconds', '--cpu', '--memory-mib'].includes(arg) && argv[i + 1]) options[arg.slice(2)] = argv[++i]
      else throw new Error('An option is unknown or has no value.')
    }
    if (!options.repo || !options.commit || !options.out || (options.all ? files.length > 0 : files.length === 0)) throw new Error('Name a checkout, commit, report path and test files, or --all.')
    const repo = resolve(options.repo)
    if (!/^[a-f0-9]{40}$/iu.test(options.commit)) throw new Error('Name the full commit SHA.')
    let commit
    try { commit = run('git', ['-C', repo, 'rev-parse', '--verify', `${options.commit}^{commit}`]).trim() } catch { throw new Error('The commit is not in the checkout.') }
    const tracked = run('git', ['-C', repo, 'ls-tree', '-rz', commit]).split('\0').filter(Boolean).filter(line => /^100(644|755) blob /u.test(line)).map(line => line.split('\t')[1]).filter(name => /^tests\/[^/]+\.test\.ts$/u.test(name))
    if (options.all) files = tracked
    if (!files.length || new Set(files).size !== files.length || files.some(file => !tracked.includes(file))) throw new Error('Each file must be a tracked tests/*.test.ts at the commit, named once.')
    const workers = Number(options.workers ?? setting('MOLE_OFFICE_MERGE_WORKERS'))
    const limitSeconds = Number(options['limit-seconds'] ?? VM_DEFAULTS.limitSeconds), cpu = Number(options.cpu ?? VM_DEFAULTS.cpu), memoryMiB = Number(options['memory-mib'] ?? VM_DEFAULTS.memoryMiB)
    if (!Number.isInteger(workers) || workers < MERGE_WORKERS_BOUNDS.fewest || workers > MERGE_WORKERS_BOUNDS.most || !Number.isInteger(limitSeconds) || limitSeconds < 1 || !Number.isFinite(cpu) || cpu <= 0 || !Number.isInteger(memoryMiB) || memoryMiB < 1) throw new Error('Workers, limit, CPU or memory is outside its allowed range.')
    const runnerFiles = modalRunnerFiles(setting)
    const tokenFile = runnerFiles.token.path
    validateToken(tokenFile)
    const python = executable(runnerFiles.python.path)
    scratch = mkdtempSync(join(tmpdir(), 'mole-office-modal-'))
    snapshot(repo, commit, join(scratch, 'mole-office'))
    const tarPath = join(scratch, 'snapshot.tar')
    run('tar', ['-cf', tarPath, '-C', scratch, 'mole-office'])
    const contextPath = join(scratch, 'context'); mkdirSync(contextPath)
    const template = fileURLToPath(new URL('../sandboxes/mole-office-dev/', import.meta.url))
    const dockerfilePath = join(contextPath, 'Dockerfile')
    const dockerfile = cutDockerfile(readFileSync(join(template, 'Dockerfile'), 'utf8'))
    copyDockerfileSources(dockerfile, template, contextPath)
    writeFileSync(dockerfilePath, dockerfile)
    const command = commandList({ workers, files })
    const npmAt = command.indexOf('npm')
    const plan = { dockerfilePath, contextPath, tarPath, commit, files, workers, limitSeconds, cpu, memoryMiB, command, buildCommand: [...command.slice(0, npmAt), 'npm', 'run', 'build'], checkout: VM_CHECKOUT, reportPath: VM_REPORT, reportFile: join(scratch, 'vitest.json') }
    if (options['plan-only']) { process.stdout.write(`${JSON.stringify(plan)}\n`); scratch = undefined; return 0 }
    process.stdout.write(`Modal tests: starting with token file ${tokenFile} (${runnerFiles.token.source}) and Python ${python} (${runnerFiles.python.source}).\n`)
    const planPath = join(scratch, 'plan.json'); writeFileSync(planPath, JSON.stringify(plan))
    const driver = fileURLToPath(new URL('./modal-tests-driver.py', import.meta.url))
    let result = null
    await new Promise((done) => {
      const child = spawn(python, [driver, planPath], { env: driverEnvironment(tokenFile), stdio: ['ignore', 'pipe', 'pipe'] })
      function stream(pipe, output, parse) {
        let pending = ''
        function line(value) {
          if (parse) { try { const row = JSON.parse(value); if (row.kind === 'modal-tests-result') { result = row; output.write(`${maskLine(`Modal sandbox ${row.sandboxId ?? 'unknown'}: ${row.sandboxSeconds ?? 'unknown'} seconds; ${row.reportFile ? 'report received' : 'no report'}.`)}\n`); return } } catch { /* This is a driver's progress line. */ } }
          output.write(`${maskLine(value)}\n`)
        }
        pipe.setEncoding('utf8'); pipe.on('data', chunk => { pending += chunk; let at; while ((at = pending.indexOf('\n')) >= 0) { line(pending.slice(0, at)); pending = pending.slice(at + 1) } }); pipe.on('end', () => { if (pending) line(pending) })
      }
      stream(child.stdout, process.stdout, true); stream(child.stderr, process.stderr, false)
      child.on('error', () => { result = null; done() }); child.on('close', code => { if (code !== 0) result = null; done() })
    })
    let report = null
    if (result?.reportFile) {
      try { report = JSON.parse(readFileSync(plan.reportFile, 'utf8')) }
      catch { process.stderr.write('Modal tests: the returned report could not be read.\n') }
    }
    writeFileSync(resolve(options.out), `${JSON.stringify(report)}\n`)
    const code = reportExit(report, files)
    const seconds = Number.isFinite(result?.sandboxSeconds) && result.sandboxSeconds >= 0 ? result.sandboxSeconds : null
    const outcome = code === 0 ? 'passed' : code === 1 ? 'red' : result?.stoppedAtLimit ? 'stopped at the limit' : 'no result'
    const at = localStamp(new Date())
    appendReceipt(receiptsFile(), { at, commit, files: files.length, runtime: 'vm', cpu, memoryMiB, sandboxSeconds: seconds, estimatedUSD: seconds === null ? null : estimateUSD(seconds, cpu, memoryMiB), outcome, sandboxId: result?.sandboxId ?? null })
    process.stdout.write(`Modal tests: ${outcome}.\n`)
    return code
  } catch (error) { process.stderr.write(`Modal tests refused: ${String(error.message).replace(/[\r\n]/gu, ' ')}\n`); return 2 }
  finally { if (scratch) rmSync(scratch, { recursive: true, force: true }) }
}
// THE START CHECK (wave 13q) is in the entry guard, so a file that imports this one is not stopped by it.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  stopAnUnpairedStableStart()
  process.exitCode = await main()
}
