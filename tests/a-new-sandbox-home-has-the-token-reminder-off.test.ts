// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A NEW SANDBOX HOME HAS CLAUDE CODE'S TOKEN REMINDER OFF (briefs item 18). prepareClaudeRunHome, which writes a sandbox
 * home's .claude/settings.json and keeps every other key, adds "totalTokensReminder": "off" when the key is absent and
 * never changes a value someone set. The office's run hooks and every other key stay as they were. A fresh home gets
 * the harness's own subagent and workflow tools denied as well, in permissions, in the same write
 * (a-sandbox-run-has-the-harness-subagents-off.test.ts holds what that write must do).
 *
 * Every home and clone here is a made-up folder. The four hook scripts are empty files: prepareClaudeRunHome only asks
 * that they are there, and nothing here runs them.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { prepareClaudeRunHome } from '../tools/sandbox-common.mjs'

let folder: string, home: string, repo: string, file: string
beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'a-new-sandbox-home-'))
  home = join(folder, 'home'); repo = join(folder, 'repo'); file = join(home, '.claude', 'settings.json')
  mkdirSync(home)
  for (const script of ['tools/dsh-hooks/claude-code-step.mjs', 'tools/dsh-hooks/claude-code-stop.mjs', 'tools/session-hook.mjs']) {
    mkdirSync(join(repo, script, '..'), { recursive: true })
    writeFileSync(join(repo, script), '')
  }
})
afterEach(() => rmSync(folder, { recursive: true, force: true }))

const held = () => JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown> & { hooks: Record<string, { hooks: { command: string }[] }[]> }
const commandsOf = (settings: ReturnType<typeof held>, event: string) => settings.hooks[event]!.flatMap((group) => group.hooks.map((hook) => hook.command))
/** The office's run hooks, as a home that has them holds them. */
function expectTheRunHooks(settings: ReturnType<typeof held>) {
  expect(commandsOf(settings, 'SessionStart')).toEqual([`node "${join(repo, 'tools/session-hook.mjs')}" start`])
  expect(commandsOf(settings, 'SessionEnd')).toEqual([`node "${join(repo, 'tools/session-hook.mjs')}" end`])
  expect(commandsOf(settings, 'PostToolUse')).toEqual([`node "${join(repo, 'tools/dsh-hooks/claude-code-step.mjs')}"`])
  expect(commandsOf(settings, 'Stop').slice(-2)).toEqual([`node "${join(repo, 'tools/dsh-hooks/claude-code-stop.mjs')}"`, `node "${join(repo, 'tools/session-hook.mjs')}" stop`])
}

it('gives a fresh home the token reminder off, beside the run hooks', () => {
  expect(prepareClaudeRunHome(home, repo)).not.toBeNull()
  const settings = held()
  expect(settings.totalTokensReminder).toBe('off')
  expect(Object.keys(settings).sort()).toEqual(['hooks', 'permissions', 'totalTokensReminder'])
  expectTheRunHooks(settings)
  // A second start finds both there and writes nothing.
  const before = readFileSync(file, 'utf8')
  expect(prepareClaudeRunHome(home, repo)).toBeNull()
  expect(readFileSync(file, 'utf8')).toBe(before)
})

it('keeps a value someone set, every other key and their own hook', () => {
  mkdirSync(join(home, '.claude'))
  const theirs = {
    totalTokensReminder: 'on',
    env: { A_MADE_UP_VARIABLE: 'kept' },
    attribution: { commit: '', pr: '', sessionUrl: false },
    hooks: { Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'echo a-made-up-hook' }] }] },
  }
  writeFileSync(file, JSON.stringify(theirs))
  expect(prepareClaudeRunHome(home, repo)).not.toBeNull()
  const settings = held()
  expect(settings.totalTokensReminder).toBe('on')
  expect(settings.env).toEqual(theirs.env)
  expect(settings.attribution).toEqual(theirs.attribution)
  expect(Object.keys(settings).sort()).toEqual(['attribution', 'env', 'hooks', 'permissions', 'totalTokensReminder'])
  expect(commandsOf(settings, 'Stop')[0]).toBe('echo a-made-up-hook')
  expectTheRunHooks(settings)
})

it('adds the key to a home that already holds the run hooks and not the key, and changes nothing else', () => {
  expect(prepareClaudeRunHome(home, repo)).not.toBeNull()
  const { totalTokensReminder: _, ...withoutTheKey } = held()
  const hooksBefore = JSON.stringify(withoutTheKey.hooks)
  writeFileSync(file, JSON.stringify({ ...withoutTheKey, theme: 'a-made-up-theme' }))
  expect(prepareClaudeRunHome(home, repo)).not.toBeNull()
  const settings = held()
  expect(settings.totalTokensReminder).toBe('off')
  expect(settings.theme).toBe('a-made-up-theme')
  expect(JSON.stringify(settings.hooks)).toBe(hooksBefore)
})
