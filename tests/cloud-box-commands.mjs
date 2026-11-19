#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Fake commands used only by cloud-box-stand-in.mjs. All suite results are labelled fixtures. */
import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const config = JSON.parse(readFileSync(process.env.CLOUD_STAND_IN_KEY, 'utf8'))
const program = basename(process.argv[1])
const args = process.argv.slice(2)
appendFileSync(config.commands, `${JSON.stringify({ program, args, env: process.env })}\n`)
const run = (command, words, options = {}, ended = () => {}) => {
  const child = spawn(command, words, { stdio: 'inherit', ...options })
  child.on('close', (code) => { ended(); process.exit(code ?? 1) })
  return child
}
// A made-up init for the container of a real-vitest run, as docker's --init is: the run's orphans come to it
// (PR_SET_CHILD_SUBREAPER, 36), and it ends with the command it started.
const MADE_UP_INIT = `import ctypes, os, sys
if ctypes.CDLL(None, use_errno=True).prctl(36, 1, 0, 0, 0) != 0: sys.exit('the made-up init could not take the run orphans')
child = os.fork()
if child == 0: os.execvp(sys.argv[1], sys.argv[1:])
while True:
    pid, status = os.wait()
    if pid == child:
        code = os.waitstatus_to_exitcode(status)
        sys.exit(code if code >= 0 else 128 - code)
`
if (program === 'git') {
  run(config.git, args.map((word) => word.endsWith('/PROJECTS/mole-office') ? config.repository : word))
} else if (program === 'docker') {
  if (args[0] === 'image') process.exit(existsSync(join(config.home, 'image-ready')) ? 0 : 1)
  if (args[0] === 'build') {
    writeFileSync(join(config.home, 'image-ready'), 'made-up image\n')
    process.exit(0)
  }
  if (args[0] === 'rm' || args[0] === 'stop') {
    if (config.mode === 'cleanup-fails') {
      console.error('made-up Docker cleanup failure at 192.0.2.91 and 2001:db8::91.')
      process.exit(6)
    }
    rmSync(join(config.home, 'container-running'), { force: true })
    // A removed container has no init left to name.
    rmSync(join(config.home, `container-pid-${args.at(-1)}`), { force: true })
    if (config.mode === 'cleanup-node-fails') console.log('made-up container removed at 192.0.2.91 and 2001:db8::91')
    process.exit(0)
  }
  // The host process id of a made-up container's init, as `docker inspect --format {{.State.Pid}} <name>` gives it.
  if (args[0] === 'inspect') {
    const named = join(config.home, `container-pid-${args.at(-1)}`)
    if (!existsSync(named)) { console.error(`Error: No such object: ${args.at(-1)}`); process.exit(1) }
    console.log(readFileSync(named, 'utf8').trim())
    process.exit(0)
  }
  if (args[0] !== 'run') throw new Error('unhandled made-up Docker command')
  const env = { ...process.env }
  const cwd = args[args.indexOf('-w') + 1]
  let index = 1
  while (index < args.length) {
    const word = args[index++]
    if (['--name', '--network', '-u', '-v', '-w', '-e'].includes(word)) {
      const value = args[index++]
      if (word === '-e') {
        const equals = value.indexOf('=')
        env[value.slice(0, equals)] = value.slice(equals + 1)
      }
    } else if (!word.startsWith('-')) break
  }
  if (config.mode === 'build-not-started' && args.includes('build')) {
    console.error('made-up: Docker could not start the build container')
    process.exit(125)
  }
  writeFileSync(join(config.home, 'container-running'), 'made-up container\n')
  const pidFile = join(config.home, `container-pid-${args[args.indexOf('--name') + 1]}`)
  const init = config.mode === 'real-vitest' && args.includes('--init')
  const child = run(init ? 'python3' : args[index], init ? ['-c', MADE_UP_INIT, ...args.slice(index)] : args.slice(index + 1), { cwd, env }, () => rmSync(pidFile, { force: true }))
  writeFileSync(pidFile, `${String(child.pid)}\n`)
} else if (program === 'npm') {
  if (args[0] === 'ci') {
    mkdirSync('node_modules', { recursive: true })
    writeFileSync('node_modules/fixture.txt', 'made-up dependency cache\n')
    mkdirSync('node_modules/.bin', { recursive: true })
    copyFileSync(process.argv[1], 'node_modules/.bin/vitest')
    chmodSync('node_modules/.bin/vitest', 0o755)
    // A made-up lock of what the install put in node_modules, as npm writes it, when the test gives its words (criterion 23).
    if (config.installedLock !== undefined) writeFileSync('node_modules/.package-lock.json', config.installedLock)
    process.exit(config.mode === 'ci-fails' ? 6 : 0)
  }
  console.log(`made-up npm ${args.join(' ')}`)
  const loginText = `made-up assertion at ${config.login}@another.example.invalid:/home/${config.login}/PROJECTS/mole-office; home /home/${config.login}`
  if (config.mode === 'logins') {
    console.log(loginText)
    console.log(`made-up unrelated words: ${config.login} ${config.login}-up.test.ts /home/${config.login}-other/file /home/${config.login}suffix/file`)
  }
  if (config.mode === 'addresses') console.log('made-up suite log: 192.0.2.91 2001:db8::91 ::1 ::ffff:192.0.2.91; connected to 2001:db8::91.')
  if (args[0] === 'run') process.exit(['build-fails', 'lock-on-build', 'packages-on-build', 'unread-on-build'].includes(config.mode) ? 4 : 0)
  // Made-up startup journals and build-lock owner lines that the whole run leaves in the clone (criterion 22).
  if (config.journals !== undefined && !args.includes('--no-file-parallelism')) {
    const { files, locks } = JSON.parse(config.journals)
    mkdirSync('.logs', { recursive: true })
    for (const one of files) writeFileSync(join('.logs', one.name), one.line.repeat(one.times))
    for (const [lock, who] of Object.entries(locks)) {
      mkdirSync(join('dist', `${lock}-for-tests-lock`), { recursive: true })
      writeFileSync(join('dist', `${lock}-for-tests-lock`, 'who.txt'), who)
    }
  }
  // The real vitest runs the made-up suite the case committed, so its workers, waits and read records are real ones.
  if (config.mode === 'real-vitest' && args[0] === 'test') {
    run(process.execPath, [config.vitest, 'run', '--config', 'made-up.vitest.config.mjs', ...args.slice(args.indexOf('--') + 1)])
    await new Promise(() => {})
  }
  if (config.mode === 'timeout') await new Promise((done) => setTimeout(done, 2500))
  // A made-up suite a little longer than the box's 15 s between readings of its load, so it is read twice.
  if (config.mode === 'slow-suite' && args[0] === 'test') await new Promise((done) => setTimeout(done, 17_000))
  const report = args.find((word) => word.startsWith('--outputFile.json=')).slice('--outputFile.json='.length)
  // Made-up whole runs with red files, and made-up runs alone of one file, which name that file last.
  if (['flaky', 'red-alone', 'many-red', 'slow-alone'].includes(config.mode)) {
    const file = (name, status, tests) => ({ name: join(process.cwd(), name), status, message: 'made-up result at 192.0.2.91', assertionResults: tests.map((one) => ({ status: one, fullName: `made-up ${one} test` })) })
    readFileSync(join(process.cwd(), 'package.json'), 'utf8')
    if (args.includes('--no-file-parallelism')) {
      if (config.mode === 'slow-alone') await new Promise((done) => setTimeout(done, 60_000))
      const red = config.mode === 'red-alone'
      writeFileSync(report, JSON.stringify({ fixture: true, testResults: [file(args.at(-1), red ? 'failed' : 'passed', [red ? 'failed' : 'passed'])] }))
      process.exit(red ? 3 : 0)
    }
    // 55 made-up red files, more than the door runs alone (criterion 18).
    const files = config.mode === 'many-red'
      ? Array.from({ length: 55 }, (_, index) => file(`tests/red-${String(index + 1).padStart(2, '0')}.test.ts`, 'failed', ['failed']))
      // A file vitest calls passed, with a test that never ran, is red by the one rule for a passed file.
      : [file('tests/made-up.test.ts', 'failed', ['failed']), file('tests/pending.test.ts', 'passed', ['passed', 'pending']), file('tests/other.test.ts', 'passed', ['passed'])]
    writeFileSync(report, JSON.stringify({ fixture: true, testResults: files }))
    process.exit(1)
  }
  // This is a synthetic Vitest report. It is never presented as a run of the project's real tests.
  const code = config.mode === 'red' ? 3 : 0
  // The real recorder loaded by NODE_OPTIONS observes this fixture read. No read output is fabricated.
  readFileSync(join(process.cwd(), 'package.json'), 'utf8')
  if (config.mode !== 'no-report') writeFileSync(report, JSON.stringify({ fixture: true, testResults: [
    { name: join(process.cwd(), 'tests', 'made-up.test.ts'), status: code === 0 ? 'passed' : 'failed', message: config.mode === 'logins' ? loginText : 'made-up suite result' },
  ] }))
  if (config.mode === 'read-formats') {
    // Real recorder observations of a made-up suite, not seeded read lines.
    readdirSync(process.cwd())
    readdirSync('tools')
    const observe = (program, words, cwd = process.cwd()) => {
      const observed = spawnSync(program, words, { cwd, encoding: 'utf8' })
      if (observed.status !== 0) throw new Error(`made-up observation command failed: ${observed.stderr}`)
    }
    observe('cat', ['package.json'])
    observe(config.git, ['diff', '--name-only', '--diff-filter=ADR', '--', 'tools'])
    observe('pwd', [])
    const folder = join(process.cwd(), '.fixture', 'cwd with space')
    mkdirSync(folder, { recursive: true })
    observe(config.git, ['-c', `fixture.punctuation=: :: ::: . .. ... :.: .::. .:: "quoted" 'single' ; | > <`, 'diff', '--name-only', '--diff-filter=ADR', '--', '../../package.json'], folder)
    observe(config.git, ['-c', `fixture.sensitive=192.0.2.91 2001:db8::1 ::1 ::ffff:192.0.2.91 ${config.host} fixture@${config.host}:/home/fixture/PROJECTS/mole-office`, 'diff', '--name-only', '--diff-filter=ADR', '--', 'tools'])
    const reads = process.env.TEST_READ_RECORD
    const records = Object.fromEntries(readdirSync(reads).map((name) => [name, readFileSync(join(reads, name), 'utf8')]))
    writeFileSync(join(config.home, 'read-record-before-mask.json'), JSON.stringify({ fixture: true, records }))
  }
  process.exit(code)
} else if (program === 'vitest') {
  // Only synthetic file discovery happens here. This stand-in never executes a test.
  if (args[0] !== 'list' || !args.includes('--filesOnly') || !args.includes('--json')) throw new Error('unhandled made-up discovery command')
  console.log('made-up Vitest file discovery; no tests executed')
  const manifest = args[args.indexOf('--json') + 1]
  if (config.mode === 'discovery-fails') { console.error('made-up discovery failure'); process.exit(6) }
  if (config.mode === 'discovery-missing') process.exit(0)
  let entries = [{ file: join(process.cwd(), 'tests', 'made-up.test.ts') }]
  if (config.mode === 'discovery-empty') entries = []
  if (config.mode === 'discovery-outside') entries[0].file = join(config.home, 'outside.test.ts')
  if (config.mode === 'discovery-relative') entries[0].file = 'tests/made-up.test.ts'
  if (config.mode === 'discovery-shape') entries = ['tests/made-up.test.ts']
  if (config.mode === 'discovery-project') entries[0].projectName = 7
  if (config.mode === 'discovery-address') entries[0].file = join(process.cwd(), 'tests', '192.0.2.91.test.ts')
  if (config.mode === 'manifest-logins') entries[0].projectName = `fixture project at ${config.login}@runner.example.invalid:/home/${config.login}; :: 192.0.2.91 2001:db8::1`
  writeFileSync(manifest, config.mode === 'discovery-invalid' ? 'made-up invalid JSON' : JSON.stringify(entries))
  process.exit(0)
}
