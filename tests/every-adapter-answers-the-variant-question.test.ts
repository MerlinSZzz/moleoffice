// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY ADAPTER ANSWERS THE SAME QUESTION ABOUT A REASONING VARIANT. Criterion T7.
 *
 * The `RuntimeAdapter` interface asks two things of the same shape: which model would this run be
 * given, and what reasoning effort would it be given. Both are optional, and the rule is the same in
 * the same words: an adapter that passes no variant must not name one. Naming a variant for a tool
 * that takes none on its command line would be this record inventing a fact.
 *
 * Claude Code and Codex take effort through the shared launcher. Claude Code and Codex name no effort:
 * the launcher gives the effort from the office's answer. OpenCode also retains the unnamed model's
 * existing variant. Kimi takes no variant, and names none.
 *
 * THE MUTATION: put Claude Code's getter back and the first case goes red on the undefined expectation. Drop the
 * effort flag in the shared launcher and it goes red on the flag check.
 */

import { describe, expect, it } from 'vitest'

import type { RuntimeAdapter } from '../src/worker/runtimes/adapter.ts'
import { ClaudeCodeAdapter } from '../src/worker/runtimes/claude-code.ts'
import { CodexAdapter } from '../src/worker/runtimes/codex.ts'
import { KimiAdapter } from '../src/worker/runtimes/kimi.ts'
import { OpenCodeAdapter } from '../src/worker/runtimes/opencode.ts'
import { aCommandsStartValues } from '../tools/sandbox-common.mjs'

describe('an adapter names only the effort its start would pass', () => {
  it("names no effort: the launcher gives the effort from the office's answer", () => {
    // Native starts now pass effort through the shared launcher, rather than commandFor alone.
    const claude: RuntimeAdapter = new ClaudeCodeAdapter({ MOLE_OFFICE_CHORE_MODEL: 'claude-opus-5-5' })
    const claudeAsked = claude.commandFor({ session: 's', agent: 'a', prompt: 'hello', cwd: '/tmp', api: 'http://127.0.0.1:1', workspace: 'default', outputPath: '/tmp/native-effort.out' })
    const claudeGiven = aCommandsStartValues([claudeAsked.command, ...claudeAsked.args], { runtime: claude.runtime })
    expect(claude.variantItWouldUse).toBeUndefined()
    const at = claudeGiven.command.indexOf('--effort')
    expect(claudeGiven.command.slice(at, at + 2)).toEqual(['--effort', 'xhigh'])
    expect(claudeGiven.env.CLAUDE_CODE_EFFORT_LEVEL).toBe('xhigh')

    const codex: RuntimeAdapter = new CodexAdapter({})
    const codexAsked = codex.commandFor({ session: 's', agent: 'a', prompt: 'hello', cwd: '/tmp', api: 'http://127.0.0.1:1', workspace: 'default', outputPath: '/tmp/native-effort.out' })
    const codexGiven = aCommandsStartValues([codexAsked.command, ...codexAsked.args], { runtime: codex.runtime })
    expect(codex.variantItWouldUse).toBeUndefined()
    expect(codexGiven.start).toMatchObject({ model: null, effort: null })
    expect(codexGiven.command).not.toContain('model_reasoning_effort=xhigh')

    const kimi: RuntimeAdapter = new KimiAdapter({})
    expect(kimi.variantItWouldUse).toBeUndefined()
  })

  it('keeps the unnamed runtime variant and the word is the one it passes', () => {
    const opencode = new OpenCodeAdapter({ MOLE_OFFICE_CHORE_VARIANT: 'max' })
    expect(opencode.variantItWouldUse?.()).toBe('max')
    expect(opencode.commandFor({
      session: 's',
      agent: 'a',
      prompt: 'hello',
      cwd: '/tmp',
      api: 'http://127.0.0.1:1',
      workspace: 'default',
      outputPath: '/tmp/opencode-variant.out',
    }).args).toContain('--variant')
  })
})
