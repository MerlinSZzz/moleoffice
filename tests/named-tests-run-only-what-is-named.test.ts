// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * RUN NAMED TESTS RUNS ONLY THE FILES IT IS GIVEN, AND CHECKS AFTERWARDS THAT ONLY THOSE RAN.
 *
 * tools/run-named-tests.mjs is piece P4 of plan KP0udNekYcAo (block b-12). It resolves each name to one
 * test file, refuses every name it cannot resolve before anything runs, hands vitest absolute paths
 * with no shell and without the office's variables, and compares vitest's JSON report with what it
 * named. This file runs the tool as a child, the way a person or an agent runs it.
 *
 * Most cases run the tool over a temporary folder of their own, given with --root, holding a tests/
 * folder made for the case. The cases that need to see what the tool starts give it a stand-in for
 * vitest with --vitest. The stand-in writes down its arguments and its environment, and, when a case
 * asks, writes a JSON report naming files of the case's choosing. One case runs the real vitest on one
 * real file of this checkout: tests/a-test-that-starts-nothing-keeps-the-short-budget.test.ts, which
 * imports one small module, needs no browser and no office, and took 0.4 seconds end to end on
 * 26 September 2026.
 *
 * MUTATION PROOF, 26 September 2026, each alone (the commit message has the logs):
 * - the empty-list refusal taken out of the tool: the empty-list case goes red;
 * - the arguments split on spaces: the case of a name with a space in it goes red;
 * - the parent's environment passed through unchanged: the environment case goes red;
 * - the comparison made to find nothing wrong (`if (false)`): the two cases of a wrong count go red;
 *   the real run stays green, because it names exactly the file that ran;
 * - the whole check after the run skipped (`process.exit(code)` first in the close handler): all
 *   three count cases go red, the real run among them, and so does the environment case, which
 *   reads the sentence about a missing report.
 *
 * THE KEY AS A FILE, 4 November 2026. A started agent may be given its key as a file that MOLE_AGENT_KEY_FILE names, in
 * place of MOLE_AGENT_KEY. A test that set MOLE_AGENT_KEY then held two keys, and a test that started
 * tools/dsh-hooks/run-agent.sh started nothing. The environment case gives the tool both, and neither may reach the list
 * script or vitest. Mutation: MOLE_AGENT_KEY_FILE taken out of THE_AGENT_CREDENTIALS in tools/live-office-guard.mjs: the
 * environment case goes red on MOLE_AGENT_KEY_FILE.
 *
 * A NAME OF ITS OWN FOR EACH RUN (wave 13n round N, item 2b). The JSON report and tools/q.mjs's full log were named by
 * the millisecond each run started, so two runs started in the same millisecond wrote one report and one log, the second
 * over the first. The last case loads a clock that never moves into the tool, tools/q.mjs and the stand-in vitest
 * through NODE_OPTIONS, starts two runs, and counts the files.
 *
 * THE USE LINE (decision Vt0GdSlApWce, point d). After a run the tool writes one line on the calling run, with
 * the slug named-tests, through writeAUseLine in tools/use-line.mjs. Its cases give the tool the four office variables
 * and a stand-in office of their own; vitest's stand-in still gets none of them. The seated run sends the body;
 * the use writer is also called without a key to prove it prints that same body and sends nothing. The exit code
 * still comes from vitest.
 *
 * EVERY OFFICE AND SANDBOX NAME STAYS OUT OF A CHILD, AND THE GUARD'S PORTS GO IN (wave 13n round EI). The tool keeps
 * every name that starts MOLE_OFFICE_ or SANDBOX_ out of every child, and says which. vitest.config.ts works out the
 * ports the live-office guard refuses from two of those names, MOLE_OFFICE_PORT and SANDBOX_DIR, so the tool works the
 * ports out first and hands them down in the guard's own variable. Four cases: the names, the ports vitest is handed,
 * the guard line the guard's own function writes in vitest's environment, and the refusal when a sandbox cannot say
 * which office it writes to. A run that cleared both names without handing the ports down left the guard refusing only
 * the checkout's port inside a sandbox, and not the office the sandbox writes to.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fileNameStamp } from '../src/shared/time.ts'
import { WINDOW_DISPLAY_VALUE, WINDOW_DISPLAY_VARIABLE } from './the-window-display.ts'
import { PORTS_VARIABLE, THE_AGENT_CREDENTIALS, THE_OFFICE_VARIABLES, theHandedDownPorts } from '../tools/live-office-guard.mjs'
import { theLiveOfficesPorts, thePortsATestKeepsOff, theSandboxsOfficePort } from '../tools/live-office-ports.mjs'
import { INSTANCE_FILE } from '../tools/sandbox-common.mjs'
import { writeAUseLine } from '../tools/use-line.mjs'

const REPO = join(import.meta.dirname, '..')
const TOOL = join(REPO, 'tools', 'run-named-tests.mjs')
const OFFICE_VARIABLES = ['MOLE_OFFICE_API', 'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_SESSION', 'MOLE_OFFICE_AGENT']

let root = ''

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'run-named-tests-'))
  mkdirSync(join(root, 'tests'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** Writes a file under the case's folder, making its folders, and gives its absolute path. */
function put(path: string, text = "test('x', () => {})\n"): string {
  const full = join(root, path)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, text)
  return full
}

/** Runs the tool with these words, from the case's folder, and gives what it said. */
function tool(words: string[], env: NodeJS.ProcessEnv = process.env) {
  const ran = spawnSync(process.execPath, [TOOL, ...words], { cwd: root, env, encoding: 'utf8' })
  return { code: ran.status, out: ran.stdout, err: ran.stderr, said: `${ran.stdout}${ran.stderr}` }
}

/** --print over the case's folder. */
function print(...names: string[]) {
  return tool(['--print', '--root', root, ...names])
}

describe('what the tool refuses, in --print mode, before anything runs', () => {
  it('refuses an empty list', () => {
    const run = print()
    expect(run.err).toContain('No test file was named.')
    expect(run.code).toBe(2)
    expect(run.out).toBe('')
  })

  it('refuses an empty string, even beside a good name', () => {
    put('tests/good.test.ts')
    const run = print('good', '')
    expect(run.err).toContain('An empty name ("") was given.')
    expect(run.code).toBe(2)
    expect(run.out).toBe('')
  })

  it('refuses a folder, and "."', () => {
    put('tests/good.test.ts')
    const run = print('.', 'tests')
    expect(run.err).toContain(`"." is a folder (${root}).`)
    expect(run.err).toContain(`"tests" is a folder (${join(root, 'tests')}).`)
    expect(run.code).toBe(2)
  })

  it('refuses a name that matches no file, even beside names that match', () => {
    put('tests/good.test.ts')
    put('tests/also-good.test.ts')
    const run = print('good', 'mistyped-name', 'tests/also-good.test.ts')
    expect(run.err).toContain('"mistyped-name" matches no file')
    expect(run.err).toContain('refused one thing')
    expect(run.code).toBe(2)
    expect(run.out).toBe('')
  })

  it('refuses a file name that matches more than one file under tests/, naming each', () => {
    const one = put('tests/one/same.test.ts')
    const two = put('tests/two/same.test.ts')
    const run = print('same')
    expect(run.err).toContain(`"same" matches 2 files, and a name must mean one: ${one}, ${two}.`)
    expect(run.code).toBe(2)
  })

  it('refuses a file that is not a test file, and a file outside tests/', () => {
    put('tests/helpers.ts', 'export {}\n')
    put('src/x.test.ts')
    const run = print('tests/helpers.ts', 'src/x.test.ts')
    expect(run.err).toContain(`which is not a test file: a test file's name ends in .test.ts.`)
    expect(run.err).toContain(`is ${join(root, 'src', 'x.test.ts')}, which is not under ${join(root, 'tests')}.`)
    expect(run.code).toBe(2)
  })

  it('refuses -t, because it runs whole files and never picks tests by name', () => {
    put('tests/good.test.ts')
    const run = print('good', '-t', 'some case')
    expect(run.err).toContain('-t picks tests by their names, and this tool does not take it')
    expect(run.code).toBe(2)
  })

  it('stops when the list script exits non-zero, and says so', () => {
    put('tests/the-test-lists.ts', "console.error('the list broke'); process.exit(3)\n")
    const run = print('--list', 'whole-tree')
    expect(run.err).toContain('The script for the whole-tree list exited 3, so nothing ran. It said: the list broke')
    expect(run.code).toBe(2)
  })

  it('flushes both print streams before exit when their writes are asynchronous', () => {
    const first = put('tests/first.test.ts')
    const second = put('tests/second.test.ts')
    // A pipe may finish a write on a later turn. Make that ordering deterministic for both streams.
    const delayed = put('delayed-output.mjs', `
import { Writable } from 'node:stream'
for (const name of ['stdout', 'stderr']) {
  const destination = process[name]
  const stream = new Writable({
    write(chunk, encoding, done) { setImmediate(() => destination.write(chunk, encoding, done)) },
  })
  Object.defineProperty(process, name, { value: stream })
}
`)
    const run = tool(['--print', '--root', root, first, second, first], {
      ...process.env,
      NODE_OPTIONS: [process.env['NODE_OPTIONS'], `--import=${pathToFileURL(delayed).href}`].filter(Boolean).join(' '),
    })
    expect(run.code, run.err).toBe(0)
    expect(run.out).toBe(`${first}\n${second}\n`)
    expect(run.err).toContain(first)
    expect(run.err.endsWith('\n')).toBe(true)
    expect(existsSync(join(root, '.logs'))).toBe(false)
  })

  it('prints the one absolute path each good name means, and runs nothing', () => {
    const good = put('tests/good.test.ts')
    const nested = put('tests/deeper/nested.test.ts')
    const listed = put('tests/listed.test.ts')
    put('tests/the-test-lists.ts', "console.log('tests/listed.test.ts')\n")
    const run = print('good', 'tests/deeper/nested.test.ts', '--list', 'browser')
    expect(run.code, run.said).toBe(0)
    expect(run.out.trim().split('\n')).toEqual([good, nested, listed])
    expect(existsSync(join(root, '.logs'))).toBe(false)
  })
})

describe('a name with a space in it', () => {
  it('stays one argument', () => {
    const spaced = put('tests/two words.test.ts')
    const run = print('two words')
    expect(run.code, run.said).toBe(0)
    expect(run.out.trim()).toBe(spaced)
  })
})

/** A stand-in for vitest that writes down what it was given, and the report the case asks for. */
function standIn(reportNames: string[] | null): string {
  return put(
    'stand-in-vitest.mjs',
    `import { writeFileSync } from 'node:fs'
writeFileSync(${JSON.stringify(join(root, 'seen.json'))}, JSON.stringify({ argv: process.argv.slice(2), env: process.env }))
const out = process.argv.find((word) => word.startsWith('--outputFile.json='))
const names = ${JSON.stringify(reportNames)}
if (names !== null) writeFileSync(out.slice('--outputFile.json='.length), JSON.stringify({ testResults: names.map((name) => ({ name })) }))
`,
  )
}

function seen(): { argv: string[]; env: Record<string, string> } {
  return JSON.parse(readFileSync(join(root, 'seen.json'), 'utf8')) as { argv: string[]; env: Record<string, string> }
}

describe('what the tool starts', () => {
  it('keeps the caller\'s agent name, key and model logins out of the list script and vitest', () => {
    const good = put('tests/good.test.ts')
    const credentials = [
      'MOLE_AGENT_KEY', 'MOLE_AGENT_KEY_FILE',
      'DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'CODEX_API_KEY', 'ANTHROPIC_API_KEY',
      'CLAUDE_CODE_OAUTH_TOKEN', 'OPENCODE_API_KEY', 'OPENROUTER_API_KEY',
    ]
    const env: NodeJS.ProcessEnv = { ...process.env, MOLE_OFFICE_AGENT: 'made-up-agent' }
    for (const name of credentials) env[name] = `made-up-${name}`
    put('tests/the-test-lists.ts', `import { writeFileSync } from 'node:fs'
writeFileSync(${JSON.stringify(join(root, 'list-env.json'))}, JSON.stringify(process.env))
console.log('tests/good.test.ts')
`)
    const run = tool(['--root', root, '--vitest', standIn([good]), '--list', 'whole-tree'], env)
    expect(run.code, run.said).toBe(0)
    const listEnv = JSON.parse(readFileSync(join(root, 'list-env.json'), 'utf8')) as Record<string, string>
    const child = seen()
    for (const name of ['MOLE_OFFICE_AGENT', ...credentials]) {
      expect(child.env[name], `vitest inherited ${name}`).toBeUndefined()
      expect(listEnv[name], `the list script inherited ${name}`).toBeUndefined()
    }
  })

  it('starts vitest without the office variables, one file at a time, with absolute paths', async () => {
    const good = put('tests/good.test.ts')
    const vitest = standIn(null)
    const office = createServer((req, res) => {
      res.setHeader('content-type', 'application/json')
      const url = req.url ?? ''
      // THE LEDGER'S OWN DOOR ANSWERS 201 WITH THE ROW IT WROTE; the seat's doors answer 200.
      if (url === '/api/resources') {
        res.statusCode = 201
        return res.end(JSON.stringify({ resource: { id: 'synthetic-row', type: 'process' } }))
      }
      res.end(JSON.stringify(url === '/api/slots/acquire'
        ? { slot: { id: 'synthetic-seat', state: 'granted' }, asked: 'new', says: 'Synthetic seat granted.' }
        : { released: true }))
    })
    await new Promise<void>((ready) => office.listen(0, '127.0.0.1', ready))
    const env: NodeJS.ProcessEnv = { ...process.env, MOLE_OFFICE_WHOLE_SUITE: 'yes', A_VARIABLE_KEPT: 'kept' }
    for (const name of OFFICE_VARIABLES) env[name] = `set-${name}`
    env['MOLE_OFFICE_API'] = `http://127.0.0.1:${String((office.address() as AddressInfo).port)}`
    env['MOLE_AGENT_KEY'] = 'synthetic-test-key'
    let run: { code: number | null; out: string }
    try {
      run = await new Promise((done) => {
        const childProcess = spawn(process.execPath, [TOOL, '--root', root, '--vitest', vitest, 'good'], { cwd: root, env })
        let out = ''
        childProcess.stdout.on('data', (chunk) => { out += String(chunk) })
        childProcess.stderr.on('data', (chunk) => { out += String(chunk) })
        childProcess.on('close', (code) => done({ code, out }))
      })
    } finally {
      await new Promise<void>((closed) => office.close(() => closed()))
    }
    const child = seen()
    for (const name of [...OFFICE_VARIABLES, 'MOLE_OFFICE_WHOLE_SUITE']) expect(child.env[name], name).toBeUndefined()
    expect(child.env['A_VARIABLE_KEPT']).toBe('kept')
    expect(child.argv[0]).toBe('run')
    expect(child.argv).toContain('--no-file-parallelism')
    expect(child.argv.at(-1)).toBe(good)
    // The stand-in wrote no report, so the tool cannot say which files ran, and fails.
    expect(run.out).toContain('and wrote no report at')
    expect(run.code).not.toBe(0)
  })
})

/**
 * The port a case's stand-in sandbox says its office is on. Nothing listens on it and nothing connects to it: the
 * cases only read it back. It is picked here, apart from the built-in default: a case which finds it among
 * the ports read cannot have found the checkout's own port instead.
 */
const A_SANDBOXS_OFFICE_PORT = 39_017
/** A port a case says its checkout's office is on, through MOLE_OFFICE_PORT. Nothing listens on it either. */
const A_CHECKOUTS_OFFICE_PORT = 39_018
/** A port a case says a runner handed down. Nothing listens on it either. */
const A_HANDED_DOWN_PORT = 39_019

/** Whether a name is one the tool keeps out of every child: an office's, a sandbox's, or one of the two declared lists'. */
function isAnOfficeOrSandboxName(name: string): boolean {
  return name.startsWith('MOLE_OFFICE_') || name.startsWith('SANDBOX_') || THE_OFFICE_VARIABLES.includes(name) || THE_AGENT_CREDENTIALS.includes(name)
}

/** This process's environment without any such name, for a case to give the tool its own. */
function anEnvironmentWithoutThem(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const name of Object.keys(env)) if (isAnOfficeOrSandboxName(name)) delete env[name]
  return env
}

/** The run, project, agent and key a case's batch asks its seat with, all made up. */
const A_STAND_IN_RUN = {
  MOLE_OFFICE_SESSION: 'the-calling-run',
  MOLE_OFFICE_WORKSPACE: 'default',
  MOLE_OFFICE_AGENT: 'named-tests-tester',
  MOLE_AGENT_KEY: 'synthetic-test-key',
}

/** A folder under the case's folder whose instance.json names `api` as the office the sandbox writes to. */
function aSandboxFolder(api: string): string {
  const folder = join(root, 'a-sandbox')
  mkdirSync(folder)
  writeFileSync(join(folder, INSTANCE_FILE), JSON.stringify({ api }))
  return folder
}

/**
 * Runs the tool over the case's folder against a stand-in office that writes the batch's own row and grants its seat,
 * with this environment and MOLE_OFFICE_API naming the stand-in, and gives what the tool said.
 */
async function theToolAgainstAStandInOffice(words: string[], env: NodeJS.ProcessEnv): Promise<{ code: number | null; out: string }> {
  const office = createServer((req, res) => {
    res.setHeader('content-type', 'application/json')
    if (req.url === '/api/resources') {
      res.statusCode = 201
      return res.end(JSON.stringify({ resource: { id: 'the-row-the-batch-wrote', type: 'process' } }))
    }
    if (req.url === '/api/slots/acquire') {
      return res.end(JSON.stringify({ slot: { id: 'synthetic-seat', state: 'granted' }, asked: 'new', says: 'Synthetic seat granted.' }))
    }
    if (req.url?.endsWith('/release')) return res.end(JSON.stringify({ released: true, says: 'Synthetic seat given back.' }))
    res.statusCode = 201
    res.end(JSON.stringify({ stored: 1 }))
  })
  await new Promise<void>((ready) => office.listen(0, '127.0.0.1', ready))
  const withTheOffice = { ...env, MOLE_OFFICE_API: `http://127.0.0.1:${String((office.address() as AddressInfo).port)}` }
  try {
    return await new Promise((done) => {
      const childProcess = spawn(process.execPath, [TOOL, ...words], { cwd: root, env: withTheOffice })
      let out = ''
      childProcess.stdout.on('data', (chunk) => { out += String(chunk) })
      childProcess.stderr.on('data', (chunk) => { out += String(chunk) })
      childProcess.on('close', (code) => done({ code, out }))
    })
  } finally {
    await new Promise<void>((closed) => office.close(() => closed()))
  }
}

describe('every office and sandbox name, and the live-office guard\'s ports', () => {
  it('clears every office and sandbox name from vitest, and says which names it cleared', async () => {
    const good = put('tests/good.test.ts')
    const planted = [
      ...THE_OFFICE_VARIABLES,
      ...THE_AGENT_CREDENTIALS,
      'MOLE_OFFICE_A_STAND_IN_NAME',
      'MOLE_OFFICE_ANOTHER_STAND_IN_NAME',
      'SANDBOX_DIR',
      'SANDBOX_FACTS',
      'SANDBOX_PROCESS_ROW',
      'SANDBOX_A_STAND_IN_NAME',
    ]
    const env = anEnvironmentWithoutThem()
    for (const name of planted) env[name] = `a-stand-in-for-${name}`
    // The tool refuses two keys at once.
    env['MOLE_AGENT_KEY_FILE'] = ''
    const run = await theToolAgainstAStandInOffice(['--root', root, '--vitest', standIn([good]), 'good'], env)
    expect(run.code, run.out).toBe(0)
    const leaked = Object.keys(seen().env).filter(isAnOfficeOrSandboxName)
    expect(leaked, `vitest inherited ${leaked.join(', ')}`).toEqual([])
    // The tool cannot be imported without running, so its line's words are read from its one declaration.
    const declaration = readFileSync(TOOL, 'utf8').split('\n').find((one) => one.startsWith('export const THE_NAMES_CLEARED = '))
    expect(declaration, 'the tool exports the words of its line').toBeDefined()
    const words = runInNewContext(`(${declaration!.slice(declaration!.indexOf(' = ') + 3)})`, {}) as string
    expect(run.out).toContain(`${words} ${[...new Set(planted)].sort().join(', ')}`)
  })

  it('hands vitest the ports of the live offices it read before it cleared them, and the ports it was handed, and not SANDBOX_DIR', async () => {
    const good = put('tests/good.test.ts')
    const env = { ...anEnvironmentWithoutThem(), ...A_STAND_IN_RUN, SANDBOX_DIR: aSandboxFolder(`http://127.0.0.1:${String(A_SANDBOXS_OFFICE_PORT)}`) }
    const run = await theToolAgainstAStandInOffice(['--root', root, '--vitest', standIn([good]), 'good'], env)
    expect(run.code, run.out).toBe(0)
    const child = seen()
    expect(child.env['SANDBOX_DIR']).toBeUndefined()
    const handed = theHandedDownPorts(child.env)
    expect(handed, `vitest was given no ${PORTS_VARIABLE}`).not.toBeNull()
    const read = theLiveOfficesPorts(env)
    expect(read.ports.map((one) => one.port)).toContain(A_SANDBOXS_OFFICE_PORT)
    for (const one of [...read.ports, ...(theHandedDownPorts(env) ?? [])]) expect(handed).toContainEqual(one)
  })

  it('gives a test the ports to keep off: those a runner handed down, or with none handed down, both sources read now', () => {
    const env = anEnvironmentWithoutThem()
    delete env[PORTS_VARIABLE]
    const read = { ...env, MOLE_OFFICE_PORT: String(A_CHECKOUTS_OFFICE_PORT), SANDBOX_DIR: aSandboxFolder(`http://127.0.0.1:${String(A_SANDBOXS_OFFICE_PORT)}`) }
    expect(new Set(thePortsATestKeepsOff(read))).toEqual(new Set([A_CHECKOUTS_OFFICE_PORT, A_SANDBOXS_OFFICE_PORT]))
    // Handed down, they are the runner's: a port a test names for an office of its own is not among them.
    const handed = [{ port: A_HANDED_DOWN_PORT, said: 'A port a stand-in runner handed down.' }]
    expect(thePortsATestKeepsOff({ ...read, [PORTS_VARIABLE]: JSON.stringify(handed) })).toEqual([A_HANDED_DOWN_PORT])
    // A port that cannot be read stops the call, with its sentence, rather than being left out.
    expect(() => thePortsATestKeepsOff({ ...env, MOLE_OFFICE_PORT: 'not a port' })).toThrow(/^The ports a test keeps off cannot be told: /)
  })

  it('makes the guard line of the vitest it starts name the port of the office the sandbox writes to', async () => {
    const good = put('tests/good.test.ts')
    const sandbox = aSandboxFolder(`http://127.0.0.1:${String(A_SANDBOXS_OFFICE_PORT)}`)
    const env = { ...anEnvironmentWithoutThem(), ...A_STAND_IN_RUN, SANDBOX_DIR: sandbox }
    const run = await theToolAgainstAStandInOffice(['--root', root, '--vitest', standIn([good]), 'good'], env)
    expect(run.code, run.out).toBe(0)
    // The guard line is the one vitest.config.ts prints: the guard's own function, run in the environment vitest got.
    const guard = pathToFileURL(join(REPO, 'tools', 'live-office-ports.mjs')).href
    const line = spawnSync(process.execPath, ['--input-type=module', '-e', `import { guardEveryTestProcess } from ${JSON.stringify(guard)}\nconsole.log(guardEveryTestProcess())`], {
      cwd: root,
      env: seen().env,
      encoding: 'utf8',
    })
    expect(line.status, line.stderr).toBe(0)
    const port = theSandboxsOfficePort({ SANDBOX_DIR: sandbox })
    expect('port' in port && port.port).toBe(A_SANDBOXS_OFFICE_PORT)
    expect(line.stdout).toContain('said' in port ? port.said : 'the sandbox port has no sentence')
  })

  it('refuses, and runs nothing, when the sandbox cannot say which office it writes to', () => {
    const good = put('tests/good.test.ts')
    const sandbox = aSandboxFolder('not an address')
    const run = tool(['--root', root, '--vitest', standIn([good]), 'good'], { ...anEnvironmentWithoutThem(), SANDBOX_DIR: sandbox })
    const port = theSandboxsOfficePort({ SANDBOX_DIR: sandbox })
    expect('port' in port && port.port).toBeNull()
    expect(run.code, run.said).toBe(2)
    expect(run.err).toContain('said' in port ? port.said : 'the sandbox port has no sentence')
    expect(existsSync(join(root, 'seen.json'))).toBe(false)
  })
})

describe('the window list', () => {
  /**
   * Stand-ins for dbus-run-session and xvfb-run, in a folder put first on PATH, so these cases hold on
   * a machine with neither. Each writes its name into wrapped.txt, drops its own option, and runs
   * the rest of the command line, as the real ones do.
   */
  function standInWrappers(which: readonly string[]): string {
    const folder = join(root, 'stand-in-bin')
    mkdirSync(folder, { recursive: true })
    const own: Record<string, string> = { 'dbus-run-session': '--', 'xvfb-run': '-a' }
    for (const name of which) {
      const file = join(folder, name)
      writeFileSync(
        file,
        `#!/bin/sh\necho ${name} >> ${JSON.stringify(join(root, 'wrapped.txt'))}\n[ "$1" = "${own[name] ?? ''}" ] && shift\nexec "$@"\n`,
      )
      chmodSync(file, 0o755)
    }
    return folder
  }

  /** A list script for the fixture checkout that prints one file for the window list. */
  function aWindowListPrinting(file: string): void {
    put('tests/the-test-lists.ts', `if (process.argv[2] === 'window') console.log(${JSON.stringify(relative(root, file))})\n`)
  }

  it('runs vitest inside dbus-run-session -- xvfb-run -a, and tells it so through the one variable', () => {
    const good = put('tests/opens-a-window.test.ts')
    aWindowListPrinting(good)
    const bin = standInWrappers(['dbus-run-session', 'xvfb-run'])
    const run = tool(['--root', root, '--vitest', standIn([good]), '--list', 'window'], { ...process.env, PATH: `${bin}:${process.env['PATH'] ?? ''}` })
    expect(run.code, run.said).toBe(0)
    expect(readFileSync(join(root, 'wrapped.txt'), 'utf8').trim().split('\n')).toEqual(['dbus-run-session', 'xvfb-run'])
    expect(seen().env[WINDOW_DISPLAY_VARIABLE]).toBe(WINDOW_DISPLAY_VALUE)
    expect(run.out).toContain(`vitest runs inside ${WINDOW_DISPLAY_VALUE}`)
  })

  it('takes the variable away from every other run, even when the caller set it', () => {
    const good = put('tests/good.test.ts')
    const run = tool(['--root', root, '--vitest', standIn([good]), 'good'], { ...process.env, [WINDOW_DISPLAY_VARIABLE]: WINDOW_DISPLAY_VALUE })
    expect(run.code, run.said).toBe(0)
    expect(seen().env[WINDOW_DISPLAY_VARIABLE]).toBeUndefined()
    expect(existsSync(join(root, 'wrapped.txt'))).toBe(false)
  })

  it('refuses, and runs nothing, when xvfb-run is not on PATH', () => {
    const good = put('tests/opens-a-window.test.ts')
    aWindowListPrinting(good)
    const bin = standInWrappers(['dbus-run-session'])
    const run = tool(['--root', root, '--vitest', standIn([good]), '--list', 'window'], { ...process.env, PATH: bin })
    expect(run.code).toBe(2)
    expect(run.err).toContain(`--list window runs the window tests inside ${WINDOW_DISPLAY_VALUE}, and xvfb-run is not on this machine's PATH, so nothing ran.`)
    expect(existsSync(join(root, 'seen.json'))).toBe(false)
  })
})

describe('the count after the run', () => {
  it('fails, naming the file, when a file ran that was not named', () => {
    const good = put('tests/good.test.ts')
    const extra = join(root, 'tests', 'extra.test.ts')
    const run = tool(['--root', root, '--vitest', standIn([good, extra]), 'good'])
    expect(run.out).toContain('FAILED  The files that ran are not the files named: 1 named, 2 ran.')
    expect(run.out).toContain(`added, ran but was not named: ${extra}`)
    expect(run.code).toBe(1)
  })

  it('fails when the run was ended by a signal, even though its report names exactly the files named', () => {
    const good = put('tests/good.test.ts')
    // The stand-in writes a report that matches, then ends its parent, tools/q.mjs, with SIGTERM. So the
    // tool sees no exit code and a signal, which exit(null) would have turned into 0.
    const vitest = put(
      'stand-in-vitest-signal.mjs',
      `import { writeFileSync } from 'node:fs'
const out = process.argv.find((word) => word.startsWith('--outputFile.json='))
writeFileSync(out.slice('--outputFile.json='.length), JSON.stringify({ testResults: [{ name: ${JSON.stringify(good)} }] }))
process.kill(process.ppid, 'SIGTERM')
`,
    )
    const run = tool(['--root', root, '--vitest', vitest, 'good'])
    expect(run.out).toContain('was ended by SIGTERM')
    expect(run.code).not.toBe(0)
  })

  it('fails, naming the file, when a named file did not run', () => {
    const good = put('tests/good.test.ts')
    const other = put('tests/other.test.ts')
    const run = tool(['--root', root, '--vitest', standIn([good]), 'good', 'other'])
    expect(run.out).toContain(`missing, named but did not run: ${other}`)
    expect(run.code).toBe(1)
  })

  it('counts a real run of one real file of this checkout as exactly one file', () => {
    const file = join(REPO, 'tests', 'a-test-that-starts-nothing-keeps-the-short-budget.test.ts')
    const run = spawnSync(process.execPath, [TOOL, file], { cwd: REPO, env: process.env, encoding: 'utf8' })
    const said = `${run.stdout}${run.stderr}`
    expect(run.status, said).toBe(0)
    expect(said).toContain('Counted: 1 file named, and exactly those ran. vitest exited 0.')
    const report = /\[vitest's report: (.+\.json)\]/.exec(said)?.[1]
    expect(report, said).toBeDefined()
    const results = (JSON.parse(readFileSync(report!, 'utf8')) as { testResults: { name: string }[] }).testResults
    expect(results.map((one) => one.name)).toEqual([file])
  })
})

/**
 * THE USE LINE. A small HTTP server stands in for the office, and the four office variables are set for the tool only.
 * The tool runs as a child without blocking, so this process can answer it.
 */
describe('the use line on the calling run', () => {
  let office: Server
  let api = ''
  const heard: { url: string; session: unknown; body: Record<string, any> }[] = []

  beforeEach(async () => {
    heard.length = 0
    office = createServer((req, res) => {
      let text = ''
      req.on('data', (chunk) => (text += String(chunk)))
      req.on('end', () => {
        heard.push({ url: `${req.method ?? ''} ${req.url ?? ''}`, session: req.headers['x-mole-office-session'], body: JSON.parse(text) })
        res.setHeader('content-type', 'application/json')
        const url = req.url ?? ''
        if (url === '/api/slots/acquire') return res.end(JSON.stringify({ slot: { id: 'synthetic-seat', state: 'granted' }, asked: 'new', says: 'Synthetic seat granted.' }))
        if (url === '/api/slots/synthetic-seat/release') return res.end(JSON.stringify({ released: true }))
        res.statusCode = 201
        // THE LEDGER'S OWN DOOR ANSWERS WITH THE ROW IT WROTE, not with the run's use line: the tool takes only a resource id.
        if (url === '/api/resources') return res.end(JSON.stringify({ resource: { id: 'synthetic-row', type: 'process' } }))
        res.end(JSON.stringify({ run: String(req.headers['x-mole-office-session']) }))
      })
    })
    await new Promise<void>((ready) => office.listen(0, '127.0.0.1', ready))
    api = `http://127.0.0.1:${String((office.address() as AddressInfo).port)}`
  })

  afterEach(async () => {
    await new Promise<void>((closed) => office.close(() => closed()))
  })

  /** The tool as a child, answered by the stand-in office, with these variables added to its environment. */
  function toolAnswered(words: string[], added: Record<string, string>): Promise<{ code: number | null; out: string }> {
    const env: NodeJS.ProcessEnv = { ...process.env }
    for (const name of [...OFFICE_VARIABLES, 'MOLE_AGENT_KEY']) delete env[name]
    Object.assign(env, added)
    if (added['MOLE_OFFICE_API']) env['MOLE_AGENT_KEY'] = 'synthetic-test-key'
    return new Promise((done) => {
      const child = spawn(process.execPath, [TOOL, ...words], { cwd: root, env })
      let out = ''
      child.stdout.on('data', (chunk) => (out += String(chunk)))
      child.stderr.on('data', (chunk) => (out += String(chunk)))
      child.on('close', (code) => done({ code, out }))
    })
  }

  /** A stand-in vitest that reports the files given and exits 3, so the exit code can be told from a default. */
  function standInThatExits3(reportNames: string[]): string {
    return put(
      'stand-in-vitest-3.mjs',
      `import { writeFileSync } from 'node:fs'
writeFileSync(${JSON.stringify(join(root, 'seen.json'))}, JSON.stringify({ argv: process.argv.slice(2), env: process.env }))
const out = process.argv.find((word) => word.startsWith('--outputFile.json='))
writeFileSync(out.slice('--outputFile.json='.length), JSON.stringify({ testResults: ${JSON.stringify(reportNames)}.map((name) => ({ name })) }))
process.exit(3)
`,
    )
  }

  it('writes the use body and can print it without a key, while vitest gets no office variable', async () => {
    const good = put('tests/good.test.ts')
    const run = await toolAnswered(['--root', root, '--vitest', standInThatExits3([good]), 'good'], {
      MOLE_OFFICE_API: api,
      MOLE_OFFICE_SESSION: 'the-calling-run',
      MOLE_OFFICE_WORKSPACE: 'default',
      MOLE_OFFICE_AGENT: 'named-tests-tester',
    })
    expect(run.code, run.out).toBe(3)
    const sent = heard.filter((one) => one.url === 'POST /api/toolset/uses')
    expect(sent, run.out).toHaveLength(1)
    const body = sent[0]!.body
    const unsent = await writeAUseLine({ tool: body.tool, said: body.said, files: body.files, tree: body.tree, office: { api, session: 'the-calling-run', workspace: 'default', agent: 'named-tests-tester' } })
    expect(unsent.words).toContain('Nothing was sent.')
    expect(unsent.words).toContain('POST /api/toolset/uses')
    expect(unsent.body).toEqual(body)
    expect(JSON.parse(unsent.words.split('\n').find((line) => line.startsWith('{')) ?? '')).toEqual(body)
    expect(body).toEqual({
      tool: 'named-tests',
      said: 'named 1 file (good); 1 ran, exactly those; vitest exited 3',
      files: [{ file: 'tests/good.test.ts', result: 'no result', seconds: null, testFileHash: createHash('sha256').update(readFileSync(good)).digest('hex').slice(0, 16) }],
      tree: { commit: null, change: null },
    })
    for (const name of OFFICE_VARIABLES) expect(seen().env[name], name).toBeUndefined()
  })

  it('keeps the line within 300 characters when many files are named, and says how many more there were', async () => {
    const many = Array.from({ length: 40 }, (_, i) => put(`tests/a-rather-long-test-file-name-number-${String(i)}.test.ts`))
    const run = await toolAnswered(['--root', root, '--vitest', standInThatExits3(many), ...many.map((file) => relative(root, file))], {
      MOLE_OFFICE_API: api,
      MOLE_OFFICE_SESSION: 'the-calling-run',
      MOLE_OFFICE_WORKSPACE: 'default',
      MOLE_OFFICE_AGENT: 'named-tests-tester',
    })
    expect(run.code, run.out).toBe(3)
    const sent = heard.filter((one) => one.url === 'POST /api/toolset/uses')
    expect(sent, run.out).toHaveLength(1)
    const body = sent[0]!.body
    const unsent = await writeAUseLine({ tool: body.tool, said: body.said, files: body.files, tree: body.tree, office: { api, session: 'the-calling-run', workspace: 'default', agent: 'named-tests-tester' } })
    expect(unsent.body).toEqual(body)
    expect(JSON.parse(unsent.words.split('\n').find((line) => line.startsWith('{')) ?? '')).toEqual(body)
    expect(body.tool).toBe('named-tests')
    const said = String(body.said)
    expect(said.length, said).toBeLessThanOrEqual(300)
    expect(said).toMatch(/^named 40 files \(a-rather-long-test-file-name-number-0\.test\.ts, .*, and \d+ more\); 40 ran, exactly those; vitest exited 3$/)
  })

  it('posts nothing, and says so, when no office is named, and the exit code is still the run\'s', async () => {
    const good = put('tests/good.test.ts')
    const run = await toolAnswered(['--root', root, '--vitest', standInThatExits3([good]), 'good'], {})
    expect(run.code, run.out).toBe(3)
    expect(heard).toEqual([])
    expect(run.out).toContain('run-named-tests: The use was not written on any run: no office was named, because MOLE_OFFICE_API is not set.')
  })
})

/**
 * A NAME OF ITS OWN FOR EACH RUN. Each run's moment is the same, because the clock never moves, so only what follows the
 * moment can tell the two runs' files apart. The office variables are taken out, so no use is sent anywhere.
 */
describe('a name of its own for each run', () => {
  it('writes two reports and two full logs for two runs started in the same millisecond', () => {
    const good = put('tests/good.test.ts')
    const at = new Date(2026, 9, 24, 8, 15, 30, 123).getTime()
    const clock = put(
      'a-clock-that-never-moves.mjs',
      `const Moving = Date
globalThis.Date = class extends Moving {
  constructor(...when) {
    if (when.length === 0) super(${String(at)})
    else super(...when)
  }
  static now() {
    return ${String(at)}
  }
}
`,
    )
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_OPTIONS: `${process.env['NODE_OPTIONS'] ?? ''} --import=${pathToFileURL(clock).href}`.trim() }
    for (const name of [...OFFICE_VARIABLES, 'MOLE_AGENT_KEY']) delete env[name]
    const vitest = standIn([good])
    const runs = [tool(['--root', root, '--vitest', vitest, 'good'], env), tool(['--root', root, '--vitest', vitest, 'good'], env)]
    for (const run of runs) expect(run.code, run.said).toBe(0)
    const moment = `named-tests-${fileNameStamp(new Date(at))}`
    const written = readdirSync(join(root, '.logs'))
    const reports = written.filter((name) => /^named-tests-.*\.json$/.test(name))
    const logs = written.filter((name) => /^named-tests-.*\.log$/.test(name))
    expect(reports, written.join(', ')).toHaveLength(2)
    expect(logs, written.join(', ')).toHaveLength(2)
    for (const name of [...reports, ...logs]) expect(name.startsWith(moment), `${name} starts with ${moment}`).toBe(true)
    // Each run's own lines name its own report and its own log.
    const reportsNamed = runs.map((run) => /\[vitest's report: (.+\.json)\]/.exec(run.out)?.[1])
    const logsNamed = runs.map((run) => /full output: (\S+\.log)\]/.exec(run.out)?.[1])
    expect(reportsNamed.map((path) => relative(join(root, '.logs'), path ?? '')).sort()).toEqual([...reports].sort())
    expect(logsNamed.map((path) => relative('.logs', path ?? '')).sort()).toEqual([...logs].sort())
  })
})
