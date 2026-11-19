// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE INTERFACE, FOUR TOOLS: the runtime adapters of criterion M10.
 *
 * `design/messages/ACCEPTANCE.md` M10: *One interface: start with a prompt, resume a conversation by
 * the provider's id, hand over the rules and the headers, detect the end, read the result. Claude
 * Code is served first. Codex and OpenCode adapters are written against the same interface.*
 *
 * WHAT IS RUN HERE AND WHAT IS NOT. The whole contract — start, alive, stop, read the result — is
 * exercised against the fake runtime, which is a real process and a real signal with no model at the
 * far end. The real adapters are checked on the command line they would run and on whether their
 * program is installed. Nothing here starts Claude Code, Codex, OpenCode or Kimi CLI: a test suite
 * that spent a model call per run would be a test suite nobody could afford to run.
 *
 * ONE EXCEPTION, AND IT STARTS A REAL PROCESS: the Kimi adapter is also driven against a stand-in
 * program called `kimi` that this file writes and puts on a PATH of its own. It is not a pretence
 * about Kimi CLI — it writes down its arguments, its working directory and its environment and
 * stops — and it is the only way to see what the adapter really hands over, rather than what
 * `commandFor` says it would. The same technique is in tests/which-program-ran-this.test.ts.
 */

import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { envFor, type RunRequest } from '../src/worker/runtimes/adapter.ts'
import { ClaudeCodeAdapter, theClaudeConversationFor } from '../src/worker/runtimes/claude-code.ts'
import { claudeCodeGuard, codexGuard, theGuardOn } from '../src/config/main-world-guard.mjs'
import { FULL_PERMISSIONS, thePermissionsARunGets } from '../src/config/run-permissions.mjs'
import { CodexAdapter, lastMessagePathOf } from '../src/worker/runtimes/codex.ts'
import { FakeAdapter } from '../src/worker/runtimes/fake.ts'
import {
  adapterFor,
  everyAdapter,
  whatIsInstalled,
  THE_RUNTIMES_THE_OFFICE_DISPATCHES,
} from '../src/worker/runtimes/index.ts'
import {
  KimiAdapter,
  OUR_CONVERSATIONS_START_WITH,
  TELEMETRY_OFF,
  safeAsAConversationId,
  theConversationId,
  whatKimiIsToldAboutItsModel,
  whereTheTranscriptIs,
} from '../src/worker/runtimes/kimi.ts'
import { AN_OPENCODE_SESSION, OpenCodeAdapter, textPartsOf } from '../src/worker/runtimes/opencode.ts'
import { AGENT_RUNTIMES, whyTheOfficeCannotStartThisRuntime } from '../src/shared/participants.ts'
import { promptFor } from '../src/worker/prompt.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))

let dir: string
let n = 0

/** One run request, into a directory of this file's own. */
function ask(prompt: string, extra: Partial<RunRequest> = {}): RunRequest {
  n += 1
  return {
    // MOLE OFFICE'S OWN ID FOR THE RUN. It is a different one each time, as the worker's is: the
    // Kimi adapter names its conversation after it, and two runs sharing one would share a
    // conversation.
    session: `a-session-id-${String(n)}`,
    agent: 'builder-x',
    prompt,
    cwd: dir,
    api: 'http://127.0.0.1:29999',
    workspace: 'panelx',
    outputPath: join(dir, `run-${String(n)}.out`),
    ...extra,
  }
}

/** Wait for a run to end, or say it did not. */
async function ends(adapter: { alive(h: never): boolean }, handle: unknown, within = 10_000): Promise<boolean> {
  const deadline = Date.now() + within
  for (;;) {
    if (!adapter.alive(handle as never)) return true
    if (Date.now() >= deadline) return false
    await new Promise((go) => setTimeout(go, 25))
  }
}

beforeAll(() => {
  dir = aTestDatabaseFolder('adapters')
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('the contract every adapter keeps, proved against the fake runtime', () => {
  it('starts a run in its own process group and says where its output is going', async () => {
    const adapter = new FakeAdapter(FAKE)
    const run = ask('hello, and record abcdefghijkl')
    const handle = adapter.start(run)
    expect(handle.runtime).toBe('fake')
    expect(handle.pid).toBeGreaterThan(0)
    // ITS OWN GROUP, which is what makes one signal end a run and everything it started in turn.
    expect(handle.pgid).toBe(handle.pid)
    expect(handle.outputPath).toBe(run.outputPath)
    expect(await ends(adapter, handle)).toBe(true)
  })

  it('reads back what the run said, and the provider id for the conversation', async () => {
    const adapter = new FakeAdapter(FAKE)
    const handle = adapter.start(ask('please answer, record abcdefghijkl'))
    expect(await ends(adapter, handle)).toBe(true)
    const result = adapter.readResult(handle)
    expect(result.endedHow).toBe('answered')
    expect(result.text).toContain('abcdefghijkl')
    expect(result.providerSession).toMatch(/^fake-/)
  })

  it('picks a conversation up again by the provider id it was given', async () => {
    const adapter = new FakeAdapter(FAKE)
    const first = adapter.start(ask('first message, record abcdefghijkl'))
    expect(await ends(adapter, first)).toBe(true)
    const conversation = adapter.readResult(first).providerSession
    expect(conversation).not.toBeNull()

    const second = adapter.start(ask('second message, record abcdefghijkl', { resume: conversation as string }))
    // The handle knows the conversation from the moment it starts, because the caller supplied it.
    expect(second.providerSession).toBe(conversation)
    expect(await ends(adapter, second)).toBe(true)
    expect(adapter.readResult(second).providerSession).toBe(conversation)
  })

  it('stops a run that will not end on its own, by the group it wrote down', async () => {
    const adapter = new FakeAdapter(FAKE)
    const handle = adapter.start(ask('please hang'))
    // Give it a moment to be a process at all, then confirm it is one that does not end by itself.
    await new Promise((go) => setTimeout(go, 200))
    expect(adapter.alive(handle)).toBe(true)
    adapter.stop(handle, 'this test asked it to stop')
    expect(await ends(adapter, handle, 5_000)).toBe(true)
  })

  it('says a run failed rather than reporting an empty answer as one', async () => {
    const adapter = new FakeAdapter(FAKE)
    const handle = adapter.start(ask('please fail'))
    expect(await ends(adapter, handle)).toBe(true)
    const result = adapter.readResult(handle)
    expect(result.endedHow).toBe('failed')
    expect(result.text).toBe('')
    expect(result.because).toContain('printed nothing')
    // WHAT IT COMPLAINED ABOUT IS KEPT, so a person reading a failed run has the tool's own words.
    expect(result.because).toContain('asked to fail')
  })

  it('refuses to start a program that is not installed instead of starting another one', () => {
    const adapter = new FakeAdapter(FAKE, { PATH: '/nowhere-at-all', MOLE_OFFICE_AGENT_MODEL: 'opus' })
    expect(() => adapter.start(ask('hello'))).toThrow(/not installed/)
  })
})

describe('a run is given the API and never the database file', () => {
  it('passes the API address and the project, and drops every other Mole Office setting', () => {
    const env = envFor(ask('hello'), {
      PATH: '/usr/bin',
      HOME: THE_TEST_FIXTURE_ROOT,
      MOLE_OFFICE_DB: `${THE_TEST_FIXTURE_ROOT}/panelx.db`,
      MOLE_OFFICE_PORT: '39017',
    })
    expect(env['MOLE_OFFICE_API']).toBe('http://127.0.0.1:29999')
    expect(env['MOLE_OFFICE_WORKSPACE']).toBe('panelx')
    // THE ONE THAT MATTERS. A run holding the database file would write rows nothing validated.
    expect(env['MOLE_OFFICE_DB']).toBeUndefined()
    expect(env['MOLE_OFFICE_PORT']).toBeUndefined()
    // And the ordinary environment a tool needs to find its own credentials is still there.
    expect(env['HOME']).toBe(THE_TEST_FIXTURE_ROOT)
    expect(env['PATH']).toBe('/usr/bin')
  })

  it('carries no MOLE_OFFICE setting except the two a run is meant to have', () => {
    const env = envFor(ask('hello'), { MOLE_OFFICE_LOCK_PATHS: '/tmp', MOLE_OFFICE_AGENT_MODEL: 'sonnet' })
    const mine = Object.keys(env).filter((key) => key.startsWith('MOLE_OFFICE_')).sort()
    expect(mine).toEqual(['MOLE_OFFICE_API', 'MOLE_OFFICE_WORKSPACE'])
  })
})

describe('the command line each real tool would be given', () => {
  it('Claude Code is printed to, asked for JSON, given a model, and resumes by session id', () => {
    // THE MODEL WAS ADDED ON 8 SEPTEMBER 2026, criterion M85. Until then this line carried no
    // `--model`, so a run the office started took whatever the person's own CLI was configured
    // with and its record said nothing about which model had answered. The environment is handed in
    // rather than read off this machine, so the case says what the adapter does with a setting and
    // not what somebody's .env happens to hold today.
    const adapter = new ClaudeCodeAdapter({ MOLE_OFFICE_AGENT_MODEL: 'a-named-model' })
    expect(adapter.rulesFile).toBe('CLAUDE.md')
    const asked = ask('say hello')
    const fresh = adapter.commandFor(asked)
    expect(fresh.command).toBe('claude')
    // THE MAIN-WORLD GUARD FOLLOWS THE MODEL, by a decision of 22 September 2026: two arguments, `--settings` and its
    // JSON, pinned in tests/the-guard-is-mounted-on-every-runtime.test.ts.
    // And because the guard is on the command, the permission arguments come first (the next case).
    expect(fresh.args).toEqual([
      ...FULL_PERMISSIONS['claude-code']!.args,
      '-p', 'say hello', '--output-format', 'json', '--model', 'a-named-model', ...claudeCodeGuard('builder-x'),
      // THE CONVERSATION IS CHOSEN AT THE START, plan hp7Z-IW9JWSX piece H5 (3 October 2026), so a
      // run killed mid-turn still has an id on its record. tests/a-runs-conversation-is-on-its-record-
      // from-its-start.test.ts is where that is proved under the worker.
      '--session-id', theClaudeConversationFor(asked.session),
    ])
    const again = adapter.commandFor(ask('say hello', { resume: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }))
    expect(again.args.slice(-2)).toEqual(['--resume', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'])
    expect(again.args).not.toContain('--session-id')
  })

  it('Claude Code skips its permission prompts only in a sandbox, or on the host behind the guard', () => {
    // WHAT THIS CASE SAID UNTIL 22 SEPTEMBER 2026: "Claude Code is never given a flag that skips its
    // permission prompts", on every machine and in every place. Its reason still holds, and is why
    // the half without the guard below is unchanged: section 0 of design/messages/ACCEPTANCE.md calls
    // giving a started process new powers an important decision point, which is the owner's and not
    // an agent's. The owner made that decision on 22 September 2026. Inside a sandbox every run gets its tool's full
    // permissions, because the container is the wall. On the host, a run gets them only when
    // the main-world guard is mounted into the tool. So this pins both halves. The environment
    // is handed in every time, so the answer is about the world built here and not about the machine the suite happens
    // to run on, which may be a sandbox.
    //
    // HOW "BEHIND THE GUARD" IS READ, since the bootstrap batch was put together: off the command
    // itself, by `theGuardOn` (src/config/main-world-guard.mjs), and not from a variable a launcher
    // sets beside it. The adapter mounts the guard on every run it builds, so every run it builds on
    // the host is behind the guard. The half without the guard is the rule asked about a command that
    // does not carry it.
    const theRuleFor = (args: string[]) => thePermissionsARunGets('claude-code', {}, theGuardOn('claude-code', { args }))

    // THE HOST WITHOUT THE GUARD ON THE COMMAND: no flag, exactly as before.
    const bare = theRuleFor(['-p', 'say hello', '--output-format', 'json'])
    expect(bare.full).toBe(false)
    expect(bare.args).toEqual([])
    // A guard mounted the way another tool mounts it widens nothing here.
    expect(theRuleFor(['-p', 'say hello', ...codexGuard('builder-x')]).args).toEqual([])

    // IN A SANDBOX: the flag, right after the program's name.
    const sandboxed = new ClaudeCodeAdapter({ SANDBOX_DIR: `${THE_TEST_FIXTURE_ROOT}/.cache/mole-office/sandboxes/one`, MOLE_OFFICE_AGENT_MODEL: 'opus' }).commandFor(ask('say hello'))
    expect(sandboxed.args.slice(0, 2)).toEqual(['--permission-mode', 'bypassPermissions'])
    expect(sandboxed.args.join(' ')).not.toContain('dangerously')

    // ON THE HOST, WHERE THE ADAPTER MOUNTS THE GUARD: the same flag, and the guard is on the command.
    const host = new ClaudeCodeAdapter({ MOLE_OFFICE_AGENT_MODEL: 'opus' }).commandFor(ask('say hello'))
    expect(theGuardOn('claude-code', host).mounted).toBe(true)
    expect(host.args.slice(0, 2)).toEqual(['--permission-mode', 'bypassPermissions'])
    expect(host.args.join(' ')).not.toContain('dangerously')
  })

  it('Codex is run non-interactively, writes its last message to a file, and resumes by id', () => {
    // THE PERMISSION ARGUMENTS COME BEFORE `exec`, because the adapter mounts the main-world guard, as two decisions
    // say. They are pinned one tool at a time in
    // tests/a-tool-runs-with-full-permissions-only-in-a-sandbox-or-behind-the-guard.test.ts. What this case is about
    // starts at `exec`.
    const adapter = new CodexAdapter({})
    expect(adapter.rulesFile).toBe('AGENTS.md')
    const run = ask('say hello')
    const fresh = adapter.commandFor(run)
    const before = FULL_PERMISSIONS['codex']!.args.length
    expect(fresh.command).toBe('codex')
    expect(fresh.args.slice(0, before)).toEqual([...FULL_PERMISSIONS['codex']!.args])
    expect(fresh.args[before]).toBe('exec')
    expect(fresh.args).toContain('--json')
    expect(fresh.args).toContain(lastMessagePathOf(run.outputPath))
    expect(fresh.args).toContain(run.cwd)
    // THE PROMPT GOES ON STANDARD INPUT, so the command names the word that tells Codex to read it there.
    expect(fresh.args.at(-1)).toBe('-')
    expect(fresh.stdin).toBe('say hello')
    const again = adapter.commandFor(ask('say hello', { resume: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }))
    expect(again.args.slice(before, before + 3)).toEqual(['exec', 'resume', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'])
  })

  it('OpenCode is run with JSON events, a directory, a session to continue, and the model and effort it was given', () => {
    // WHAT THIS ASSERTED BEFORE 13 SEPTEMBER 2026: the whole argv was
    // ['run', '--format', 'json', '--dir', run.cwd, 'say hello'], and an opencode run recorded no
    // model at all. It still pins exactly that for a world where nobody named a model or an effort,
    // and it additionally pins the two flags a decision puts there. The
    // environment is handed in rather than read off this machine, so the case says what the adapter
    // does with a setting and not what somebody's .env happens to hold today.
    const bare = new OpenCodeAdapter({})
    expect(bare.rulesFile).toBe('AGENTS.md')
    const run = ask('say hello')
    expect(bare.commandFor(run).args).toEqual(['run', '--format', 'json', '--dir', run.cwd, 'say hello'])
    const again = bare.commandFor(ask('say hello', { resume: 'ses_abc123' }))
    expect(again.args).toEqual([
      'run', '--format', 'json', '--dir', run.cwd, '--session', 'ses_abc123', 'say hello',
    ])
    // A named model now takes its fallback effort from the shared rule; use a row that names max.
    const named = new OpenCodeAdapter({
      MOLE_OFFICE_CHORE_MODEL: 'deepseek/deepseek-v4.1-flash',
      MOLE_OFFICE_CHORE_VARIANT: 'max',
    })
    expect(named.commandFor(run).args).toEqual([
      'run', '--format', 'json', '--dir', run.cwd,
      '-m', 'deepseek/deepseek-v4.1-flash', '--variant', 'max', 'say hello',
    ])
  })

  it('Kimi CLI is run headless, in the run’s directory, in a conversation this adapter names', () => {
    const adapter = new KimiAdapter()
    expect(adapter.rulesFile).toBe('AGENTS.md')
    const run = ask('say hello')
    const fresh = adapter.commandFor(run)
    expect(fresh.command).toBe('kimi')
    expect(fresh.args).toEqual([
      '--print',
      '-p',
      'say hello',
      '-w',
      run.cwd,
      '-S',
      theConversationId(run.session),
      '--output-format',
      'stream-json',
      '--final-message-only',
    ])
    // THE SAME RUN ASKED TWICE IS THE SAME CONVERSATION. The id comes out of Mole Office's own id
    // for the run, so nothing about it is random and a second reading cannot disagree with the first.
    expect(adapter.commandFor(run).args).toEqual(fresh.args)
  })

  it('asks for stream-json, because a refusal cannot be told from an answer in plain text', () => {
    // MEASURED ON 5 SEPTEMBER 2026 against Kimi CLI 1.50.0: a run with no model configured printed
    // `LLM not set` on STANDARD OUTPUT — where an answer goes — and exited 1. The exit code is not
    // available to readResult, so the only thing that can separate the two is the shape of what was
    // printed, and only stream-json gives it one.
    const args = new KimiAdapter().commandFor(ask('say hello')).args
    expect(args).toContain('--output-format')
    expect(args[args.indexOf('--output-format') + 1]).toBe('stream-json')
    expect(args).toContain('--final-message-only')
  })

  it('picks a conversation up again with the id it was given, and adds nothing to it', () => {
    const again = new KimiAdapter().commandFor(ask('say hello', { resume: 'mole-office-abc123DEF_-' }))
    expect(again.args).toContain('-S')
    expect(again.args[again.args.indexOf('-S') + 1]).toBe('mole-office-abc123DEF_-')
    // THE SAME FLAG MINTS AND RESUMES, so there is no second command shape and nothing to get wrong.
    expect(again.args[0]).toBe('--print')
  })

  it('refuses an id it cannot hand over rather than mending it into a different conversation', () => {
    const adapter = new KimiAdapter()
    // KIMI DOES NOT REFUSE AN ID IT HAS NEVER SEEN. Measured on 5 September 2026: `-r
    // no-such-session-at-all` made a new conversation of that name rather than saying no. So a
    // mended id would answer out of an empty history and look exactly like one that carried on.
    for (const bad of ['../elsewhere', 'has/a/slash', '-starts-with-a-dash', 'has a space', 'has\u0000a null']) {
      expect(() => adapter.commandFor(ask('hello', { resume: bad })), bad).toThrow(/cannot be handed to Kimi CLI/)
    }
    // AND STARTING IT IS REFUSED TOO, not just working the command line out.
    expect(() => adapter.start(ask('hello', { resume: 'has/a/slash' }))).toThrow(/cannot be handed to Kimi CLI/)
    // AN EMPTY ONE IS NOT A BAD ID, IT IS NO ID, and it starts a fresh conversation — the same
    // reading the other three adapters give it.
    const fresh = ask('hello', { resume: '' })
    expect(adapter.commandFor(fresh).args).toContain(theConversationId(fresh.session))
  })

  it('names a conversation safely whatever a Mole Office id turns out to be', () => {
    // THE ID BECOMES A DIRECTORY NAME under ~/.kimi/sessions, measured on 5 September 2026, and it
    // becomes a command line argument. Mole Office ids are nanoids today — letters, digits, dash and
    // underscore, and one in twelve starts with a dash — and this has to hold for whatever they
    // become.
    const anything = [
      'abcdefghijkl',
      '-leadingDash',
      '_underscored',
      '../../etc/passwd',
      '.',
      '..',
      'with a space',
      'with/slashes/inside',
      'unicode-中文-id',
      '',
    ]
    for (const id of anything) {
      const made = theConversationId(id)
      expect(safeAsAConversationId(made), `${id} became ${made}`).toBe(true)
      expect(made.startsWith(OUR_CONVERSATIONS_START_WITH), made).toBe(true)
      expect(made).not.toContain('/')
      expect(made).not.toBe('.')
      expect(made).not.toBe('..')
    }
    // AND TWO DIFFERENT IDS STAY TWO DIFFERENT CONVERSATIONS, so no two runs share a transcript.
    expect(theConversationId('abcdefghijkl')).not.toBe(theConversationId('abcdefghijkm'))
  })

  it('every runtime the office dispatches has an adapter, and a word it does not dispatch has none', () => {
    // READ FROM THE LISTS THEMSELVES, not typed out again here. A word added to either and served
    // by nothing is what this is for, and a copy of a list would not notice one.
    //
    // TWO LISTS SINCE 12 SEPTEMBER 2026, and this case is where the difference is held. Criterion
    // P88, as amended: AGENT_RUNTIMES says which words an agent's row may declare, and
    // THE_RUNTIMES_THE_OFFICE_DISPATCHES says which the message worker can start a run on. dsh is
    // the first word where the answers differ — a dsh worker is started by
    // ~/.cache/mole-office/dsh/run-worker.sh and never by the office. Asserting one list against
    // the other, as this case used to, would refuse the split rather than check it.
    expect(everyAdapter({}).map((a) => a.runtime)).toEqual([...THE_RUNTIMES_THE_OFFICE_DISPATCHES])
    expect(adapterFor('something-else', {})).toBeNull()

    // A DISPATCHED RUNTIME THAT LOST ITS ADAPTER STILL FAILS HERE. The switch has no default branch,
    // so it would not compile — but a word quietly moved off the dispatch list would compile fine,
    // and this is what would catch that: every dispatched word builds an adapter that names itself.
    for (const word of THE_RUNTIMES_THE_OFFICE_DISPATCHES) {
      expect(adapterFor(word, {})?.runtime, `${word} has an adapter`).toBe(word)
    }

    // AND EVERY DECLARABLE WORD IS ACCOUNTED FOR, one way or the other, so a new one cannot land in
    // neither list and be noticed by nobody.
    for (const word of AGENT_RUNTIMES) {
      const dispatched = (THE_RUNTIMES_THE_OFFICE_DISPATCHES as readonly string[]).includes(word)
      expect(dispatched || whyTheOfficeCannotStartThisRuntime(word) !== null, `${word} is accounted for`).toBe(true)
    }
  })

  it('says which of the tools is installed on this machine, and where', () => {
    const found = whatIsInstalled()
    // EVERY WORD A ROW MAY DECLARE, not only the dispatched ones: a reader asking what is on this
    // machine is asking about the words they will meet on an agent's row.
    expect(found.map((one) => one.runtime)).toEqual([...AGENT_RUNTIMES])
    for (const one of found) {
      // Either a path or null. Null is a real answer here: the worker holds the message and says
      // which tool is missing, and it never starts a different one instead.
      if (one.where !== null) expect(one.where).toMatch(/^\//)
    }

    // A WORD THE OFFICE DOES NOT DISPATCH IS NEITHER ABSENT NOR COUNTED AS A MISSING TOOL. It comes
    // back with one sentence saying it is started by its own tool, so a reader is not left deciding
    // whether this machine is missing something. Criterion P88, as amended 12 September 2026.
    const dsh = found.find((one) => one.runtime === 'dsh')
    expect(dsh, 'dsh is reported rather than left out').toBeDefined()
    expect(dsh?.where, 'and not reported as a tool that is missing').toBeNull()
    expect(dsh?.says ?? '').toContain('does not start')
    expect(dsh?.says ?? '').toContain('run-worker.sh')

    // A DISPATCHED ONE CARRIES NO SUCH SENTENCE, so the two cases cannot be told apart by luck.
    expect(found.find((one) => one.runtime === 'claude-code')?.says).toBeNull()
  })

  it('serves every runtime word with the fake one while the setting names a script', () => {
    for (const word of AGENT_RUNTIMES) {
      const adapter = adapterFor(word, { MOLE_OFFICE_FAKE_RUNTIME: FAKE })
      expect(adapter?.runtime).toBe('fake')
    }
    // And an empty setting is not a script: it means nobody set it.
    expect(adapterFor('codex', { MOLE_OFFICE_FAKE_RUNTIME: '' })?.runtime).toBe('codex')
  })
})

describe('reading a tool output that is not what the tool promised', () => {
  it('reports Claude Code output that is not JSON as its own raw words, and does not call it an answer', () => {
    const adapter = new ClaudeCodeAdapter()
    const handle = { runtime: 'claude-code', pid: 1, pgid: 1, startedAt: '', providerSession: null, outputPath: join(dir, 'not-json.out') }
    writeFileSync(handle.outputPath, 'Something went wrong before it could answer.\n', 'utf8')
    const result = adapter.readResult(handle)
    expect(result.endedHow).toBe('failed')
    expect(result.text).toContain('Something went wrong')
    expect(result.providerSession).toBeNull()
  })

  it('finds an OpenCode session id in its events, and answers null when there is none', () => {
    expect('ses_26a512093ffeBSdfr3zlSMCb9J'.match(AN_OPENCODE_SESSION)?.[0]).toBe('ses_26a512093ffeBSdfr3zlSMCb9J')
    expect('nothing here'.match(AN_OPENCODE_SESSION)).toBeNull()
  })

  it('collects every text part of an OpenCode event stream, in order', () => {
    expect(
      textPartsOf([{ parts: [{ text: 'one' }, { text: 'two' }] }, { message: { part: { text: 'three' } } }]),
    ).toEqual(['one', 'two', 'three'])
  })
})

describe('what the Kimi adapter makes of what Kimi CLI printed', () => {
  /** A handle for a run whose output is this text, without starting anything. */
  function afterARunThatPrinted(
    text: string,
    conversation: string | null = 'mole-office-abcdefghijkl',
    exitCode = 0,
  ) {
    n += 1
    const outputPath = join(dir, `kimi-${String(n)}.out`)
    writeFileSync(outputPath, text, 'utf8')
    writeFileSync(`${outputPath}.exit-code`, String(exitCode), 'utf8')
    return { runtime: 'kimi', pid: 1, pgid: 1, startedAt: '', providerSession: conversation, outputPath }
  }

  it('reads the answer out of the one JSON object Kimi prints, and says where the transcript is', () => {
    // THE SHAPE WAS TAKEN FROM THE PROGRAM ITSELF. kimi_cli/ui/print/visualize.py at 1.50.0 builds
    // `Message(role="assistant", content=text)` and prints `model_dump_json(exclude_none=True)`;
    // building that same object with the same library on this machine on 5 September 2026 gave
    // exactly this line.
    const said = '{"role":"assistant","content":"Read it. The record to open is abcdefghijkl."}\n'
    const result = new KimiAdapter().readResult(afterARunThatPrinted(said))
    expect(result.endedHow).toBe('answered')
    expect(result.text).toBe('Read it. The record to open is abcdefghijkl.')
    expect(result.providerSession).toBe('mole-office-abcdefghijkl')
    expect(result.because).toContain('stream-json')
    // WHERE TO GO AND READ THE WHOLE THING, which is the one thing a person wants next.
    expect(result.because).toContain(whereTheTranscriptIs('mole-office-abcdefghijkl'))
  })

  it('trims the answer, because Kimi puts a space in front of it and no other tool does', () => {
    // MEASURED TWICE ON 5 SEPTEMBER 2026, both times against a real model: Kimi CLI printed
    // `{"role":"assistant","content":" MOLE"}` from a direct run and
    // `{"role":"assistant","content":" BADGER"}` through the message worker. Both leading spaces
    // reached the message body Mole Office filed, because this adapter was the one that returned
    // the content unchanged. Problem 3eZN6NO8SGQt; the run is design/agents/KIMI-RUN-2026-09-06.md.
    const said = '{"role":"assistant","content":" BADGER"}\n'
    const result = new KimiAdapter().readResult(afterARunThatPrinted(said))
    expect(result.endedHow).toBe('answered')
    expect(result.text).toBe('BADGER')
  })

  it('trims a space at either end, not only the leading one Kimi was seen to print', () => {
    // The measurement only ever showed a LEADING space. A reader that stripped that one character
    // would pass the test above and still hand back a trailing newline, which is the other half of
    // what `trim` is for and is just as invisible in a message body.
    const said = '{"role":"assistant","content":" BADGER \\n"}\n'
    const result = new KimiAdapter().readResult(afterARunThatPrinted(said))
    expect(result.text).toBe('BADGER')
  })

  it('takes the final assistant message when there is more than one, not the first', () => {
    // `--final-message-only` is what makes there be at most one, so today this cannot happen. It is
    // pinned because the flag is one word: a run started without it prints an object per assistant
    // message, and the first of those is a half-finished thought rather than the answer.
    const said =
      '{"role":"assistant","content":"Let me look."}\n' +
      '{"role":"assistant","content":"Read it. The record to open is abcdefghijkl."}\n'
    const result = new KimiAdapter().readResult(afterARunThatPrinted(said))
    expect(result.endedHow).toBe('answered')
    expect(result.text).toBe('Read it. The record to open is abcdefghijkl.')
  })

  it('calls a refusal a failure, and hands back Kimi’s own words for it', () => {
    // MEASURED, 5 September 2026, Kimi CLI 1.50.0, no credentials on the machine: this is what
    // `kimi --print -p "say ok" --output-format stream-json --final-message-only` printed on
    // standard output, and it exited 1. The exit file records that, and the output reader keeps the
    // words it printed so the reason remains clear.
    const result = new KimiAdapter().readResult(afterARunThatPrinted('LLM not set\n', 'mole-office-abcdefghijkl', 1))
    expect(result.endedHow).toBe('failed')
    expect(result.text).toBe('LLM not set')
    // THE CONVERSATION IS STILL KNOWN, because this adapter chose it rather than reading it back.
    expect(result.providerSession).toBe('mole-office-abcdefghijkl')
    expect(result.because).toContain('no final assistant message')
    expect(result.because).toContain('LLM not set')
  })

  it('says a run that printed nothing printed nothing, rather than answering emptily', () => {
    const handle = afterARunThatPrinted('')
    writeFileSync(`${handle.outputPath}.problem`, '\nTo resume this session: kimi -r mole-office-abcdefghijkl\n', 'utf8')
    const result = new KimiAdapter().readResult(handle)
    expect(result.endedHow).toBe('failed')
    expect(result.text).toBe('')
    expect(result.because).toContain('printed nothing')
    // KIMI PRINTS THAT LINE ON EVERY RUN, WHETHER IT WENT WELL OR NOT — measured 5 September 2026 —
    // so it is kept as what the run complained about and is never read as a sign of success.
    expect(result.because).toContain('To resume this session')
  })
})

describe('what the Kimi adapter really hands over, read off a real process', () => {
  let path: string

  beforeAll(() => {
    // A PROGRAM CALLED `kimi` THAT IS NOT KIMI, and says so by only writing down what it was given.
    path = join(dir, 'stand-in-bin')
    mkdirSync(path, { recursive: true })
    const script = join(path, 'kimi')
    writeFileSync(
      script,
      [
        '#!/bin/sh',
        'for a in "$@"; do echo "ARG<$a>"; done',
        'echo "CWD<$(pwd)>"',
        'echo "API<$MOLE_OFFICE_API>"',
        'echo "WORKSPACE<$MOLE_OFFICE_WORKSPACE>"',
        'echo "DB<$MOLE_OFFICE_DB>"',
        'echo "TELEMETRY<$KIMI_DISABLE_TELEMETRY>"',
        // THE THREE A KIMI RUN NEEDS TO REACH A MODEL. Nothing real is ever set in these tests: the
        // adapter reads the environment it was constructed with, which is built here, and never
        // reads .env — so the owner's key cannot reach a test run even by accident.
        'echo "KEY<$KIMI_API_KEY>"',
        'echo "BASE<$KIMI_BASE_URL>"',
        'echo "MODEL<$KIMI_MODEL_NAME>"',
        '',
      ].join('\n'),
      'utf8',
    )
    chmodSync(script, 0o755)
  })

  /** The prompt a real run is given, built by the thing that really builds it. */
  function theRealPrompt(): string {
    return promptFor({
      agent: 'builder-x',
      workspace: 'panelx',
      api: 'http://127.0.0.1:29999',
      messageId: 'abcdefghijkl',
      body: 'The gripper has drifted again.',
      from: `person ${THE_TEST_OFFICES_OWNER.id}`,
      carryingOn: false,
      howToLead: '## When somebody asks you to take them to a page\n\nFile a message with a lead.',
      knows: null,
      brief: null,
    })
  }

  it('starts the program, in the run’s directory, with the arguments and environment it declared', async () => {
    // A MADE-UP KEY, because since criterion U2 a Kimi run with no key anywhere is refused before it
    // starts. The command and the environment are what this case is about, so it supplies one.
    const adapter = new KimiAdapter({ PATH: path, KIMI_API_KEY: 'not-a-real-key-for-the-command-test' })
    const run = ask(theRealPrompt())
    const handle = adapter.start(run)
    // THE CONVERSATION IS ON THE HANDLE FROM THE MOMENT IT STARTS, because this adapter chose it.
    // For the other three it is null here and is read out of the output afterwards.
    expect(handle.providerSession).toBe(theConversationId(run.session))
    expect(await ends(adapter, handle)).toBe(true)
    const wrote = readFileSync(run.outputPath, 'utf8')

    expect(wrote).toContain('ARG<--print>')
    expect(wrote).toContain(`ARG<-w>`)
    expect(wrote).toContain(`ARG<${run.cwd}>`)
    expect(wrote).toContain(`ARG<${theConversationId(run.session)}>`)
    expect(wrote).toContain('ARG<stream-json>')
    expect(wrote).toContain('ARG<--final-message-only>')
    // IT RUNS WHERE THE RUN WORKS, and not wherever this test happened to be started from.
    expect(wrote).toContain(`CWD<${run.cwd}>`)

    // THE TWO SETTINGS EVERY RUN GETS, built by envFor like every other adapter's.
    expect(wrote).toContain('API<http://127.0.0.1:29999>')
    expect(wrote).toContain('WORKSPACE<panelx>')
    // AND THE ONE IT MUST NEVER GET.
    expect(wrote).toContain('DB<>')
    // AND KIMI'S OWN, WHICH TURNS OFF THE TELEMETRY SINK AND NOTHING ELSE. Measured on
    // 5 September 2026: a run without it left two ~/.kimi/telemetry/failed_*.jsonl files, and the
    // same run with it set left none. It does NOT stop the device id — a run that reaches a model
    // writes ~/.kimi/device_id anyway and sends it with this machine's hostname on every request,
    // because the id is minted while the chat client is built (kimi_cli/app.py:243) and the switch
    // is read afterwards (kimi_cli/app.py:333). Problem MP-cIWO25U9W; the header of
    // src/worker/runtimes/kimi.ts has the whole reading.
    expect(wrote).toContain('TELEMETRY<1>')
    expect(TELEMETRY_OFF['KIMI_DISABLE_TELEMETRY']).toBe('1')

    // WHO THE RUN IS TRAVELS IN THE PROMPT, not in the environment — src/worker/prompt.ts says why,
    // and this is the proof that the three headers reach the program the adapter starts.
    expect(wrote).toContain('x-mole-office-workspace: panelx')
    expect(wrote).toContain('x-mole-office-actor-type: agent')
    expect(wrote).toContain('x-mole-office-actor-id: builder-x')
  })

  it('hands the run the key, the endpoint and the model name it was given', async () => {
    // EVERY VALUE HERE IS MADE UP. The adapter reads the environment it was constructed with and
    // never reads .env, so a test can build a whole world and the owner's real key cannot reach it.
    //
    // THIS ONE WOULD ALSO PASS WITHOUT THE ADAPTER'S OWN WORK, and says so rather than being counted
    // as proof of it: `envFor` passes every name that is not a Mole Office setting straight through,
    // so a variable already in the worker's environment reaches the run either way. It is here
    // because nothing else pinned that a Kimi run really receives its three. The tests below are the
    // ones this change is proved by: the mapping, and the refusal of an empty value.
    const adapter = new KimiAdapter({
      PATH: path,
      KIMI_API_KEY: 'not-a-real-key-set-directly',
      KIMI_BASE_URL: 'https://example.invalid/v1',
      KIMI_MODEL_NAME: 'a-model-that-does-not-exist',
    })
    const handle = adapter.start(ask('hello'))
    expect(await ends(adapter, handle)).toBe(true)
    const wrote = readFileSync(handle.outputPath, 'utf8')
    expect(wrote).toContain('KEY<not-a-real-key-set-directly>')
    expect(wrote).toContain('BASE<https://example.invalid/v1>')
    expect(wrote).toContain('MODEL<a-model-that-does-not-exist>')
  })

  it('gives a run the owner’s MOONSHOT_API_KEY under the name Kimi CLI actually reads', async () => {
    // KIMI CLI NEVER READS MOONSHOT_API_KEY — kimi_cli/llm.py:276 reads KIMI_API_KEY and nothing
    // else — so the owner's key did nothing until the adapter carried it across. Problem
    // oY8Vs5feaRai.
    const adapter = new KimiAdapter({ PATH: path, MOONSHOT_API_KEY: 'not-a-real-key-under-the-owners-name' })
    const handle = adapter.start(ask('hello'))
    expect(await ends(adapter, handle)).toBe(true)
    expect(readFileSync(handle.outputPath, 'utf8')).toContain('KEY<not-a-real-key-under-the-owners-name>')
  })

  it('lets KIMI_API_KEY win when both names are set, because it is the more specific statement', async () => {
    const adapter = new KimiAdapter({
      PATH: path,
      KIMI_API_KEY: 'not-a-real-key-the-specific-one',
      MOONSHOT_API_KEY: 'not-a-real-key-the-general-one',
    })
    const handle = adapter.start(ask('hello'))
    expect(await ends(adapter, handle)).toBe(true)
    expect(readFileSync(handle.outputPath, 'utf8')).toContain('KEY<not-a-real-key-the-specific-one>')
  })

  it('refuses to start when no key is set anywhere, naming the setting and the press', () => {
    // WAS "sets none of the three when nobody set them". Criterion U2 changed this: the key used to
    // be silently omitted and the refusal happened four layers down inside Kimi CLI's own message.
    // A run that cannot authenticate now fails here, where the cause is, and the refusal names the
    // setting and the Settings press. The environment builder itself still yields nothing.
    const adapter = new KimiAdapter({ PATH: path })
    expect(() => adapter.start(ask('hello'))).toThrow(/KIMI_API_KEY/)
    expect(() => adapter.start(ask('hello'))).toThrow(/Settings page/)
    // AND THE BUILDER IS STILL THE PLAIN READING: no key, no endpoint, no model, nothing made up.
    expect(whatKimiIsToldAboutItsModel({ PATH: path })).toEqual({})
  })

  it('refuses a Kimi setting somebody set to an empty value, naming it, and starts nothing', () => {
    // Set-and-empty and never-set are different statements, and the refusal is the declaration's.
    // Before this change the run was simply given KIMI_BASE_URL="" and started anyway, which says
    // somebody set an endpoint when nobody did.
    expect(() => whatKimiIsToldAboutItsModel({ PATH: path, KIMI_BASE_URL: '' })).toThrow(/KIMI_BASE_URL/)
    // AND THE REFUSAL REACHES `start`, which is where it matters: nothing is started.
    expect(() => new KimiAdapter({ PATH: path, KIMI_BASE_URL: '' }).start(ask('hello'))).toThrow(/KIMI_BASE_URL/)
  })

  it('refuses to start when kimi is not installed, rather than starting something else', () => {
    const adapter = new KimiAdapter({ PATH: '/nowhere-at-all' })
    expect(adapter.whereItIs()).toBeNull()
    expect(() => adapter.start(ask('hello'))).toThrow(/not installed/)
  })
})

describe('what the Kimi adapter says about what a run sends', () => {
  /**
   * THIS TEST READS PROSE, ON PURPOSE, AND SO DOES THE ONE ABOUT THE FAKE RUNTIME'S SCRIPT BELOW.
   *
   * The defect it pins is a sentence, not a branch. src/worker/runtimes/kimi.ts is the one place
   * anybody will look to find out what a Kimi run sends, and until 6 September 2026 it said a run
   * with KIMI_DISABLE_TELEMETRY=1 wrote no device id. That was true of the run it was taken from —
   * a machine with no credentials, where the chat client is never built — and false of every run
   * that answers. Nothing failed when it went false. Problem MP-cIWO25U9W.
   */
  const header = readFileSync(new URL('../src/worker/runtimes/kimi.ts', import.meta.url), 'utf8')

  it('says the telemetry switch stops the sink, and names what still leaves the machine', () => {
    // WHAT IT STOPS, named as the one thing it stops.
    expect(header).toContain('telemetry sink')
    // WHAT IT DOES NOT STOP, both halves: the file on disk and the headers on every request.
    expect(header).toContain('device_id')
    expect(header).toContain('X-Msh-Device-Id')
    expect(header).toContain('X-Msh-Device-Name')
    expect(header).toContain("this machine's hostname")
    // AND WHERE IT GOES, which is not only Moonshot: the headers are chosen by the provider's type.
    expect(header).toContain('WHERE THEY GO')
  })

  it('does not claim the switch stops the device id, which is the sentence that was wrong', () => {
    // The old sentence, in the words it used. If it comes back this goes red.
    expect(header).not.toContain('the same run wrote neither')
    expect(header).not.toContain('the opt-out held on a real run')
  })

  it('promises no way to turn the device id off, because kimi-cli 1.50.0 has none', () => {
    // The whole package was searched on 6 September 2026: no environment variable, no config key
    // and no flag does it. Saying so is the fix; offering one would be the same defect again.
    expect(header).toContain('THERE IS NO WAY TO TURN THE DEVICE ID OR THE HEADERS OFF')
  })
})

describe('the fake runtime is labelled wherever it appears', () => {
  it('says in plain words that nothing an agent said here came from a model', async () => {
    const { RUNS_ARE_FAKED } = await import('../src/worker/runtimes/fake.ts')
    expect(RUNS_ARE_FAKED).toContain('Runs are not real')
    expect(RUNS_ARE_FAKED).toContain('MOLE_OFFICE_FAKE_RUNTIME')
  })

  it('prints an object of its own shape rather than copying a real tool', () => {
    const script = readFileSync(FAKE, 'utf8')
    expect(script).toContain('"reply"')
    // If this ever printed `session_id` and `result`, the Claude Code reader would pass its tests
    // against a script that has never been near Claude Code.
    expect(script).not.toContain('session_id')
    expect(script).not.toContain('"result"')
  })
})
