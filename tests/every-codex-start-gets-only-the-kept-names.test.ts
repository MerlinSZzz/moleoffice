// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY CODEX START THE OFFICE MAKES ON THIS MACHINE GETS ONLY THE NAMES THE LIST KEEPS.
 *
 * The list and its function are in src/config/the-environment-a-codex-gets.mjs, and
 * tests/the-environment-a-codex-gets.test.ts tests them. This file drives each start itself. A start inside a line
 * sandbox is tested in tests/a-codex-in-a-sandbox-gets-only-the-kept-names.test.ts.
 *
 * WHAT IS REAL AND WHAT IS NOT. Each start is the office's own code. The codex it starts is a stand-in, written here: it
 * runs no model, and it writes down the names of its environment, never a value, and its arguments, in a file this test
 * reads. Every case plants two made-up names where the start reads its environment from: CLAUDE_CODE_MESSAGING_TOKEN,
 * the name a Claude Code session's token goes under, and A_MADE_UP_SERVICE_API_KEY, a key nothing in the office knows.
 * Neither may reach the codex, and the names the start needs must.
 *
 * ONE CASE PER START, OR PER SHARED PATH:
 *   - startRun in src/worker/runtimes/common.ts, which every adapter's start goes through, so the message worker's Codex
 *     run too (CodexAdapter.start, through startModelRun);
 *   - the worker's two version probes in src/worker/runtimes/os.ts, theProgramThatRan (through readTheVersion) and
 *     theGatedProgramThatRan;
 *   - the server's codex login status, whatAnAgentToolSaysAboutItsKey in src/server/lib/resources.ts, through
 *     runCommandReadingBothStreams;
 *   - the version on the harness list, theVersionOfAProgram in the same file;
 *   - the tool's own status command, theSignInOf in src/server/lib/setting-up-an-agent-tool.ts, through runTheTool. The
 *     key login, giveTheKeyToTheToolsOwnLogin, starts the codex through runTheTool too, so this case covers that path;
 *   - the inspector's check on the host, in tools/the-inspector.mjs, for a check on Codex;
 *   - the outside terminal, runTheOpener in src/server/lib/a-terminal-outside.ts. The stand-in for gnome-terminal starts
 *     the words after `--` with its own environment, as a terminal that hands its window that environment would. Whether
 *     gnome-terminal itself does that is not confirmed;
 *   - the outside terminal's start of a Codex agent with a key file of its own, theAgentsStartOutside in
 *     src/server/lib/terminal-agents.ts, on Linux's opener and on Windows's. The Codex keeps MOLE_AGENT_KEY_FILE with
 *     the same path, and what the file holds is in no value it is given. On Windows only the opener's environment
 *     carries the path, and that environment is narrowed.
 *
 * FOUR STARTS HAVE NO CASE OF THEIR OWN: openTheRun, bringTheRunBack and reopenOne in src/server/lib/terminal-agents.ts,
 * and the tool's own sign-in, startTheToolsOwnSignIn in src/server/lib/setting-up-an-agent-tool.ts. Each builds its
 * environment from theEnvironmentATerminalGets and the office's names, which the list keeps, so no case through them can
 * fail before they are narrowed. They are narrowed in the same way as the rest.
 *
 * WHAT GOES RED BEFORE THE NARROWING: every case but the key file's, on the planted names. The key file's case goes red
 * on Windows's opener while the list does not keep MOLE_AGENT_KEY_FILE.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { openATerminalOutside } from '../src/server/lib/a-terminal-outside.ts'
import { runIsAlive, startRun } from '../src/worker/runtimes/common.ts'
import { forgetStartupWitness, makeStartupWitness, theGatedProgramThatRan, theProgramThatRan } from '../src/worker/runtimes/os.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { aMadeUpCheckSession, inspectorFixture } from './inspector-tool-fixture.ts'
import { withThePath } from './made-up-agent-tools.ts'

/** The two planted names. Both values are made up. */
const PLANTED = { CLAUDE_CODE_MESSAGING_TOKEN: 'planted-not-a-token', A_MADE_UP_SERVICE_API_KEY: 'planted-not-a-key' }

let t: TestDb | null = null
let dir = ''
let folders = 0

beforeAll(async () => {
  // The server's modules open the office database when they are loaded, so each is imported after this, in its case.
  t = await freshDb()
  dir = mkdtempSync(join(tmpdir(), 'every-codex-start-'))
})

afterAll(() => {
  t?.close()
  rmSync(dir, { recursive: true, force: true })
})

/** A new folder for one case, so the worker's remembered version of a command on a PATH is never one read before. */
function aFolder(): string {
  folders += 1
  const folder = join(dir, `case-${String(folders)}`)
  mkdirSync(folder)
  return folder
}

/**
 * A stand-in codex in `folder`. It runs no model. It writes down the names of its environment, never a value, and its
 * arguments, in `seen`, and prints `says`. One that reads its input does all that once its input has ended.
 */
function aStandInCodex(folder: string, options: { says?: string; readsItsInput?: boolean } = {}): { bin: string; program: string; seen: string } {
  const bin = join(folder, 'bin')
  mkdirSync(bin, { recursive: true })
  const program = join(bin, 'codex')
  const seen = join(folder, 'what-the-codex-was-given.json')
  const answer = [
    `fs.writeFileSync(${JSON.stringify(seen)}, JSON.stringify({ names: Object.keys(process.env).sort(), args: process.argv.slice(2) }))`,
    `process.stdout.write(${JSON.stringify(options.says ?? 'codex-cli 0.0.0-a-stand-in\n')})`,
  ]
  writeFileSync(program, [
    `#!${process.execPath}`,
    '// A stand-in for codex, written by a test. It runs no model, and writes down only the names of what it was given.',
    "const fs = process.getBuiltinModule('node:fs')",
    ...(options.readsItsInput === true
      ? ['process.stdin.resume()', "process.stdin.on('end', () => {", ...answer.map((line) => `  ${line}`), '})']
      : answer),
  ].join('\n'), { mode: 0o755 })
  return { bin, program, seen }
}

/** The arguments the stand-in was given, after checking that it was started without the planted names and with `needed`. */
function whatTheCodexWasGiven(seen: string, needed: readonly string[], start: string): string[] {
  expect(existsSync(seen), `${start}: the stand-in codex was not started`).toBe(true)
  const given = JSON.parse(readFileSync(seen, 'utf8')) as { names: string[]; args: string[] }
  for (const name of Object.keys(PLANTED)) expect(given.names, `${start} gave the codex ${name}`).not.toContain(name)
  for (const name of needed) expect(given.names, `${start} did not give the codex ${name}`).toContain(name)
  return given.args
}

/** Runs `fn` with the planted names in this process's environment, and takes them out again. */
async function withThePlantedNames<T>(fn: () => Promise<T> | T): Promise<T> {
  const before = Object.fromEntries(Object.keys(PLANTED).map((name) => [name, process.env[name]]))
  Object.assign(process.env, PLANTED)
  try {
    return await fn()
  } finally {
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

describe.skipIf(process.platform === 'win32')('every Codex start the office makes on this machine', () => {
  it("the start every adapter goes through, startRun, for a run on Codex", async () => {
    const folder = aFolder()
    const codex = aStandInCodex(folder)
    const outputPath = join(folder, 'run.out')
    const handle = startRun(
      { runtime: 'codex', commandFor: () => ({ command: codex.program, args: ['exec', '--json', 'A made-up prompt.'], env: {} }) },
      { cwd: folder, api: 'http://127.0.0.1:9', workspace: 'made-up-workspace', outputPath, key: 'made-up-run-key' },
      { PATH: codex.bin, HOME: folder, ...PLANTED },
    )
    for (let i = 0; i < 200 && runIsAlive(handle); i += 1) await new Promise((done) => setTimeout(done, 50))
    const args = whatTheCodexWasGiven(codex.seen, ['PATH', 'HOME', 'MOLE_AGENT_KEY', 'MOLE_OFFICE_API', 'MOLE_OFFICE_WORKSPACE'], 'startRun')
    expect(args).toEqual(['exec', '--json', 'A made-up prompt.'])
  })

  it("the worker's version probe, theProgramThatRan", async () => {
    const codex = aStandInCodex(aFolder())
    await withThePlantedNames(() => theProgramThatRan('codex', { PATH: codex.bin }))
    expect(whatTheCodexWasGiven(codex.seen, ['PATH', 'HOME'], 'theProgramThatRan')).toEqual(['--version'])
  })

  it.skipIf(process.platform !== 'linux')("the worker's gated version probe, theGatedProgramThatRan", async () => {
    const folder = aFolder()
    const codex = aStandInCodex(folder)
    const witness = makeStartupWitness(join(folder, 'witness'))
    expect(witness, 'no startup witness was made on Linux').not.toBeNull()
    try {
      await withThePlantedNames(() => theGatedProgramThatRan('codex', { PATH: codex.bin }, witness!, async () => undefined))
    } finally {
      forgetStartupWitness(witness!)
    }
    expect(whatTheCodexWasGiven(codex.seen, ['PATH', 'HOME'], 'theGatedProgramThatRan')).toEqual(['--version'])
  })

  it("the server's codex login status, whatAnAgentToolSaysAboutItsKey", async () => {
    const codex = aStandInCodex(aFolder(), { says: 'Logged in using ChatGPT\n' })
    const res = await import('../src/server/lib/resources.ts')
    // OsProbe declares this method as optional. Without it the case fails in a sentence that names it, and the call is
    // made on LINUX_PROBE itself, so the method's `this` is kept.
    const probe = res.LINUX_PROBE
    const said = await withThePath(codex.bin, () => withThePlantedNames(() => {
      if (probe.whatAnAgentToolSaysAboutItsKey === undefined) {
        throw new Error('LINUX_PROBE has no whatAnAgentToolSaysAboutItsKey, so no codex login status was read.')
      }
      return probe.whatAnAgentToolSaysAboutItsKey('codex')
    }))
    expect(said.state).toBe('set')
    expect(whatTheCodexWasGiven(codex.seen, ['PATH', 'HOME'], 'whatAnAgentToolSaysAboutItsKey')).toEqual(['login', 'status'])
  })

  it('the version on the harness list, theVersionOfAProgram', async () => {
    const folder = aFolder()
    const codex = aStandInCodex(folder)
    const res = await import('../src/server/lib/resources.ts')
    // OsProbe declares this method as optional too, so it is checked in the same way.
    const probe = res.LINUX_PROBE
    if (probe.theVersionOfAProgram === undefined) {
      throw new Error('LINUX_PROBE has no theVersionOfAProgram, so no version was read.')
    }
    const read = await probe.theVersionOfAProgram('codex', { PATH: codex.bin, HOME: folder, ...PLANTED })
    expect(read.versionWasRead).toBe(true)
    expect(whatTheCodexWasGiven(codex.seen, ['PATH', 'HOME'], 'theVersionOfAProgram')).toEqual(['--version'])
  })

  it("the tool's own status command, theSignInOf, the path the key login shares", async () => {
    const folder = aFolder()
    const codex = aStandInCodex(folder, { says: 'Logged in using ChatGPT\n' })
    const { theHarness } = await import('../src/server/lib/harnesses.ts')
    const { theSignInOf } = await import('../src/server/lib/setting-up-an-agent-tool.ts')
    const signedIn = await theSignInOf(theHarness('codex')!, { PATH: codex.bin, HOME: folder, ...PLANTED })
    expect(signedIn).toMatchObject({ answer: 'yes' })
    expect(whatTheCodexWasGiven(codex.seen, ['PATH', 'HOME'], 'theSignInOf')).toEqual(['login', 'status'])
  })

  it('the outside terminal, runTheOpener, for a Codex agent', async () => {
    const folder = aFolder()
    const codex = aStandInCodex(folder)
    // A STAND-IN FOR gnome-terminal. It opens no window: it starts the words after `--` with its own environment.
    const opener = join(folder, 'gnome-terminal')
    writeFileSync(opener, [
      `#!${process.execPath}`,
      '// A stand-in for gnome-terminal, written by a test. It opens no window.',
      "const { spawnSync } = process.getBuiltinModule('node:child_process')",
      'const args = process.argv.slice(2)',
      "const at = args.indexOf('--')",
      "const ran = spawnSync(args[at + 1], args.slice(at + 2), { stdio: 'ignore' })",
      'process.exit(ran.status ?? 1)',
    ].join('\n'), { mode: 0o755 })
    const office = { MOLE_OFFICE_API: 'http://127.0.0.1:9', MOLE_OFFICE_WORKSPACE: 'made-up-workspace', MOLE_OFFICE_AGENT: 'a-made-up-agent' }
    const opened = await withThePlantedNames(() => openATerminalOutside(
      { program: codex.program, args: ['--a-made-up-argument'], folder, env: office, isCodex: true },
      { platform: 'linux', found: (program) => (program === 'gnome-terminal' ? opener : null) },
    ))
    expect(opened).toMatchObject({ opened: true })
    expect(whatTheCodexWasGiven(codex.seen, ['PATH', 'HOME', ...Object.keys(office)], 'runTheOpener')).toEqual(['--a-made-up-argument'])
  })

  it("the outside terminal's start of a Codex with a key file of its own, theAgentsStartOutside", async () => {
    const folder = aFolder()
    const codex = aStandInCodex(folder)
    // A MADE-UP KEY IN A FILE OF THIS CASE'S OWN. Only the file's path may reach the Codex, never what the file holds.
    const key = 'c4'.repeat(32)
    const keyFile = join(folder, 'the-agents.key')
    writeFileSync(keyFile, `${key}\n`, { mode: 0o600 })
    const { THE_PERSON } = await import('../src/shared/person.ts')
    const actor = { type: 'human' as const, id: THE_PERSON }
    const handle = 'an-outside-codex'
    t!.api.createRecord({ workspaceId: 'default', kind: 'agent', title: handle, data: { handle, runtime: 'codex', state: 'active' }, actor })
    const bound = await import('../src/server/lib/bound-address.ts')
    const { theAgentsStartOutside } = await import('../src/server/lib/terminal-agents.ts')
    const { howThisSystemOpensATerminalOutside } = await import('../src/server/lib/a-terminal-outside.ts')
    const { theSystemFor } = await import('../src/config/systems/the-system.mjs')
    const { theEnvironmentACodexGets } = await import('../src/config/the-environment-a-codex-gets.mjs')
    // A MADE-UP ADDRESS OF THE OFFICE. The start tells the agent where the office answers; nothing listens there.
    const listening = { address: () => ({ address: '127.0.0.1', port: 9, family: 'IPv4' }) }
    const start = await withThePath(codex.bin, () => {
      bound.rememberWhatThisProcessBound(listening as unknown as Parameters<typeof bound.rememberWhatThisProcessBound>[0])
      try {
        return theAgentsStartOutside({ reference: handle, workspaceId: 'default', actor, keyFile })
      } finally {
        bound.forgetWhatThisProcessBound()
      }
    })
    expect(start.isCodex).toBe(true)
    expect(start.env['MOLE_AGENT_KEY_FILE']).toBe(keyFile)
    for (const platform of ['linux', 'win32']) {
      const opener = howThisSystemOpensATerminalOutside(start, platform, (program) => join(folder, program))
      if ('cannot' in opener) throw new Error(`${platform}: ${opener.cannot}`)
      expect(opener.isCodex, platform).toBe(true)
      // WHAT THE CODEX IS GIVEN: what runTheOpener keeps of the opener's environment for a Codex on that system, and on
      // Linux the words the opener hands `env` before the program. The server's own names are left out of the
      // opener's environment here: none of them is the agent's key file.
      const words = platform === 'linux' ? opener.args.slice(opener.args.indexOf('env') + 1, opener.args.indexOf(start.program)) : []
      const named = (word: string): [string, string] => {
        const at = word.indexOf('=')
        return [word.slice(0, at), word.slice(at + 1)]
      }
      const given: Record<string, string> = {
        ...theEnvironmentACodexGets(opener.env, theSystemFor(platform)),
        ...Object.fromEntries(words.map(named)),
      }
      expect(given['MOLE_AGENT_KEY_FILE'], `${platform}: the Codex is not given the key file's path`).toBe(keyFile)
      const theArguments = opener.args.map((word, at): [string, string] => [`argument ${String(at)}`, word])
      const holding = [...Object.entries(given), ...theArguments].filter(([, value]) => value.includes(key))
      expect(holding.map(([name]) => name), `${platform}: these hold what the key file holds`).toEqual([])
    }
  })
})

describe.skipIf(process.platform === 'win32')("the inspector's check on the host", () => {
  type Fixture = Awaited<ReturnType<typeof inspectorFixture>>
  let fixture: Fixture | null = null
  afterEach(async () => {
    await fixture?.close()
    fixture = null
  })

  it('gives a check on Codex only the names the list keeps', async () => {
    fixture = await inspectorFixture()
    fixture.state.checkModel = { runtime: 'codex', model: 'openai/gpt-6.1-sol', variant: 'xhigh', effort: 'xhigh', effortFrom: 'Casting' }
    const verdict = JSON.stringify({ verdict: 'released', check: 'A verdict this test made up. No model ran.', chaptersRead: [] })
    const events = [
      { type: 'thread.started', thread_id: '01234567-89ab-cdef-0123-456789abcdef' },
      { type: 'item.completed', item: { type: 'agent_message', text: verdict } },
      { type: 'turn.completed', usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } },
    ]
    const codex = aStandInCodex(fixture.home, { readsItsInput: true, says: `${events.map((event) => JSON.stringify(event)).join('\n')}\n` })
    const ran = await fixture.inspect(['--check', aMadeUpCheckSession()], { HOME: fixture.home, PATH: `${codex.bin}:${process.env['PATH'] ?? ''}`, ...PLANTED }, true)
    expect(existsSync(codex.seen), `the check's codex was never started; the tool ended with ${String(ran.code)}`).toBe(true)
    const args = whatTheCodexWasGiven(codex.seen, ['PATH', 'HOME'], 'the check on the host')
    expect(args).toContain('exec')
  })
})
