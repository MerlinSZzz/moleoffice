// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WAY BACK TO AN AGENT'S RUN IS WORKED OUT IN ONE PLACE, from what its session record holds.
 *
 * Wave 13u, round 10. src/config/the-way-back.mjs builds the command; the server's adapter,
 * the agent's page and the sandbox tool read it from there. What is proved:
 *
 *   1. a command line is stored as its first 200 characters and as its start flags, so flags past the 200th character
 *      survive with nothing else of the line past it;
 *   2. a record the session hook filed, with no resume command stored on it (the shape of I1YvY7y7shXb and
 *      9sXK4hFLaL23), gets one from its folder, conversation id and start flags;
 *   3. of the start's flags, --dangerously-skip-permissions, --model and --permission-mode are kept and the rest are
 *      named as dropped, by name only, a prompt by a name and never by its words;
 *   4. a round in a sandbox gets the agreed arguments, with --as mole-office --session only for a press;
 *   5. a run with no way back says why, and gets no command;
 *   6. the adapter's resumeCommandFor is the same command, and a folder with a quote in it still makes one that runs;
 *   7. a start flag holding a key is not stored (round 10b): not in the stored line, not in the stored flags, and a
 *      record that stored one anyway has it marked when its way back is read.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, CONTROL RUN FIRST, each put back after
 * ---------------------------------------------------------------------------------------
 *
 *   - theProcessBehindTheHook stores the whole command line again: red, cases 1 and 7;
 *   - theCommandLineStored cuts the line before it screens it (round 10b): red, case 7;
 *   - theStartFlagsOf keeps a kept flag's value without screening it (round 10b): red, case 7;
 *   - --dangerously-skip-permissions is left out of KEPT_CLAUDE_FLAGS: red, cases 2 and 3;
 *   - theSandboxWayBack ignores pressSession: red, case 4.
 */

import { describe, expect, it } from 'vitest'

import { MOST_CHARACTERS_OF_A_COMMAND_LINE, theProcessBehindTheHook } from '../src/config/session-process.mjs'
import { A_PROMPT, theClaudeFlagsIn, theClaudeWayBack, theSandboxWayBack, theWayBackOf } from '../src/config/the-way-back.mjs'
import { resumeCommandFor } from '../src/server/lib/adapters/claude-code.ts'

/** A made-up conversation id, for this test only. */
const TEST_CONVERSATION = '00000000-test-4000-8000-000000000001'
/** A start whose permission flag comes after the 200th character, behind a long system prompt file path. */
const A_LONG_START =
  `/opt/test/claude/versions/9.9.9 --append-system-prompt /tmp/test-${'x'.repeat(200)}.md ` +
  `--model claude-opus-5-5 --dangerously-skip-permissions --output-format stream-json -p say hello`

/** What the hook reads of a claude process with this command line. */
function theHookReading(commandLine: string) {
  return theProcessBehindTheHook(100, {
    commandLineOf: (pid: number) => (pid === 100 ? commandLine : null),
    nameOf: (pid: number) => (pid === 100 ? 'claude' : null),
    executableOf: () => null,
    parentOf: () => 1,
    startTimeOf: () => new Date('2026-10-05T20:00:00.000Z'),
  })
}

/** A made-up key in the shape of an API key, for this test only. It opens no account. */
const TEST_KEY = 'sk-test0000000000000000000000000000'

describe('the way back is worked out in one place', () => {
  it('1. a command line is stored as its first 200 characters and its start flags, which survive past the 200th', () => {
    expect(A_LONG_START.length).toBeGreaterThan(300)
    const found = theHookReading(A_LONG_START)
    expect(found.recorded).toBe(true)
    expect(found.pidCommand).toBe(A_LONG_START.slice(0, MOST_CHARACTERS_OF_A_COMMAND_LINE))
    expect(found.pidFlags).toEqual({
      kept: [{ name: '--model', value: 'claude-opus-5-5' }, { name: '--dangerously-skip-permissions', value: null }],
      dropped: ['--append-system-prompt', '--output-format', '-p', A_PROMPT],
    })
    expect(JSON.stringify(found)).not.toContain('hello')
  })

  it('2. a record the hook filed, with no resume command stored, gets one from its own facts', () => {
    const way = theWayBackOf({
      id: 'testRecord01',
      data: {
        runtime: 'claude-code',
        providerSession: TEST_CONVERSATION,
        workingDirectory: '/test/projects/cfc',
        extra: {
          discovered: {
            tool: 'claude-code',
            externalId: TEST_CONVERSATION,
            logPath: '/test/log.jsonl',
            pidCommand: `claude --resume ${TEST_CONVERSATION} --dangerously-skip-permissions`,
          },
        },
      },
    })
    expect(way).toEqual({
      way: 'host',
      runtime: 'claude-code',
      program: 'claude',
      args: ['--resume', TEST_CONVERSATION, '--dangerously-skip-permissions'],
      command: `cd '/test/projects/cfc' && claude --resume ${TEST_CONVERSATION} --dangerously-skip-permissions`,
      folder: '/test/projects/cfc',
      sessionId: TEST_CONVERSATION,
      kept: ['--dangerously-skip-permissions'],
      dropped: [],
    })
  })

  it('3. the flags that say how a run may act are kept, the rest are named as dropped, a prompt never by its words', () => {
    const { kept, dropped } = theClaudeFlagsIn(A_LONG_START)
    expect(kept).toEqual(['--model', 'claude-opus-5-5', '--dangerously-skip-permissions'])
    expect(dropped).toEqual(['--append-system-prompt', '--output-format', '-p', A_PROMPT])
    expect(dropped.join(' ')).not.toContain('hello')
    expect(theClaudeFlagsIn('claude --permission-mode=bypassPermissions --mcp-config /tmp/test.json')).toEqual({
      kept: ['--permission-mode', 'bypassPermissions'],
      dropped: ['--mcp-config'],
    })
    expect(theClaudeFlagsIn(null)).toEqual({ kept: [], dropped: [] })
  })

  it('4. a round in a sandbox gets the arguments agreed with the tool maintainer, the office named as caller only for a press', () => {
    const asked = {
      instance: 'test-instance',
      handle: 'test-agent',
      continues: 'testRound001',
      folder: '/workspace/test',
      sessionId: TEST_CONVERSATION,
      model: 'claude-opus-5-5',
    }
    expect(theSandboxWayBack({ ...asked, pressSession: 'testPress001' })).toEqual([
      'tools/sandbox.mjs', 'exec', 'test-instance', '--tty', '--agent', 'test-agent', '--runtime', 'claude-code',
      '--continues', 'testRound001', '--cwd', '/workspace/test', '--as', 'mole-office', '--session', 'testPress001',
      '--', 'claude', '--resume', TEST_CONVERSATION, '--model', 'claude-opus-5-5', '--permission-mode', 'bypassPermissions',
    ])
    expect(theSandboxWayBack(asked)).not.toContain('--as')
    expect(theSandboxWayBack({ ...asked, model: null })).not.toContain('--model')

    const way = theWayBackOf({
      id: 'testRound001',
      data: {
        runtime: 'claude-code',
        providerSession: TEST_CONVERSATION,
        workingDirectory: '/workspace/test',
        servingAgent: 'test-agent',
        model: 'claude-opus-5-5',
        sandbox: { template: 'test-template', folder: '/test/sandboxes/test-instance/' },
      },
    })
    expect(way.way).toBe('sandbox')
    if (way.way !== 'sandbox') return
    expect(way.sandbox).toEqual(asked)
    expect(way.command).toBe(['node', ...theSandboxWayBack(asked)].join(' '))
  })

  it('5. a run with no way back says why, and gets no command', () => {
    const none = (data: Record<string, unknown>) => theWayBackOf({ id: 'testRecord02', data })
    const base = { runtime: 'claude-code', providerSession: TEST_CONVERSATION, workingDirectory: '/test/folder' }
    expect(none({ ...base, runtime: 'dsh' })).toEqual({ way: 'none', runtime: 'dsh', because: 'A dsh run has no command that resumes its conversation.' })
    expect(none({ ...base, providerSession: undefined })).toMatchObject({ way: 'none', because: 'Nobody recorded which conversation this run was.' })
    expect(none({ ...base, workingDirectory: '' })).toMatchObject({ way: 'none' })
    expect(none({ providerSession: TEST_CONVERSATION, workingDirectory: '/test/folder' })).toMatchObject({ way: 'none' })
    expect(none({ ...base, sandbox: { template: 'test-template' }, servingAgent: 'test-agent' })).toMatchObject({
      way: 'none',
      because: 'Nobody recorded which sandbox this round ran in.',
    })
    expect(none({ ...base, runtime: 'codex' })).toMatchObject({ way: 'host', command: `cd '/test/folder' && codex resume ${TEST_CONVERSATION}` })
  })

  it("6. the adapter's resume command is the builder's, and a folder with a quote in it still makes one that runs", () => {
    expect(resumeCommandFor(TEST_CONVERSATION, "/test/it's here")).toBe(theClaudeWayBack({ folder: "/test/it's here", sessionId: TEST_CONVERSATION }))
    expect(resumeCommandFor(TEST_CONVERSATION, "/test/it's here")).toBe(`cd '/test/it'\\''s here' && claude --resume ${TEST_CONVERSATION}`)
    expect(resumeCommandFor(TEST_CONVERSATION, null)).toBe(`claude --resume ${TEST_CONVERSATION}`)
  })

  it('7. a start flag holding a key is not stored, and a record that stored one has it marked when read', () => {
    // THE KEY BEGINS 8 CHARACTERS BEFORE THE CUT, so a line cut before it is screened would keep the key's first part,
    // too short for any shape to catch.
    const before = 'claude --append-system-prompt /tmp/'
    const pad = 'x'.repeat(MOST_CHARACTERS_OF_A_COMMAND_LINE - 8 - before.length - ' --api-key '.length)
    const start = `${before}${pad} --api-key ${TEST_KEY} --model ${TEST_KEY} --dangerously-skip-permissions`
    expect(start.indexOf(TEST_KEY)).toBe(MOST_CHARACTERS_OF_A_COMMAND_LINE - 8)
    const found = theHookReading(start)
    expect(found.recorded).toBe(true)
    const stored = JSON.stringify({ pidCommand: found.pidCommand, pidFlags: found.pidFlags })
    expect(stored).not.toContain('sk-test')
    expect(stored).not.toContain('test00000000')
    expect(found.pidFlags).toEqual({
      kept: [{ name: '--dangerously-skip-permissions', value: null }],
      dropped: ['--append-system-prompt', '--api-key', A_PROMPT, '--model'],
    })

    // A RECORD IS WRITTEN BY ITS AGENT, so flags it stored are read through the same check.
    const way = theWayBackOf({
      id: 'testRecord03',
      data: {
        runtime: 'claude-code',
        providerSession: TEST_CONVERSATION,
        workingDirectory: '/test/folder',
        extra: { discovered: { pidFlags: { kept: [{ name: '--model', value: TEST_KEY }], dropped: [`--token=${TEST_KEY}`] } } },
      },
    })
    expect(way.way).toBe('host')
    expect(JSON.stringify(way)).not.toContain('sk-test')
    if (way.way !== 'host') return
    expect(way.kept).toEqual([])
    expect(way.dropped).toEqual(['--model', '--<a password or a key given a value, not shown>'])
  })
})
