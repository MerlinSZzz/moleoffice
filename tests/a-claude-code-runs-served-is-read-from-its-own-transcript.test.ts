// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A CLAUDE CODE RUN WAS SERVED, READ ON ITS OWN. Problem VBtbw0hSO1E2.
 *
 * src/config/claude-code-served.mjs is the reading tools/sandbox-start.mjs writes into a run's `served`.
 * tests/sandbox-launcher.test.ts runs it through the launcher. These cases pin what it counts and what it
 * leaves out, against transcripts written in a folder this test makes, with HOME pointed there:
 *
 *   · a --output-format json result in the out file names the models, by modelUsage's keys;
 *   · otherwise the run's own top-level transcripts do: a subagent's transcript in a folder below, a
 *     "<synthetic>" line, and a line stamped before the run started are not the run's;
 *   · each response's usage counts once, though Claude Code repeats it on every line of the response;
 *   · the folder name turns every character that is not a letter or a digit into "-", as Claude Code does.
 */
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { theServedOfAClaudeCodeRun, theTranscriptFolder } from '../src/config/claude-code-served.mjs'

const scratch = mkdtempSync(join(tmpdir(), 'mole-office-claude-code-served-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

const STARTED = '2026-09-24T20:00:00.000+01:00'
const AFTER = '2026-09-24T19:05:00.000Z'
const BEFORE = '2026-09-24T18:55:00.000Z'

const assistant = (at: string, model: string, id: string, usage: Record<string, number>) =>
  JSON.stringify({ type: 'assistant', timestamp: at, message: { id, model, usage } })

/** A home of its own, a working directory, and the folder Claude Code would keep its transcripts in. */
function aRun(name: string): { env: Record<string, string>; cwd: string; folder: string; out: string } {
  const home = join(scratch, name, 'home')
  const cwd = join(scratch, name, 'a_work.tree')
  mkdirSync(cwd, { recursive: true })
  const folder = join(home, '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'))
  mkdirSync(folder, { recursive: true })
  const out = join(scratch, name, 'out')
  writeFileSync(out, 'plain text from claude -p\n')
  return { env: { HOME: home }, cwd, folder, out }
}

describe('theServedOfAClaudeCodeRun', () => {
  it('finds the folder Claude Code names after the working directory, every non-alphanumeric character a "-"', () => {
    expect(theTranscriptFolder({ HOME: '/h' }, '/a/.b_c/d')).toBe('/h/.claude/projects/-a--b-c-d')
    expect(theTranscriptFolder({ HOME: '/h', CLAUDE_CONFIG_DIR: '/c' }, '/a')).toBe('/c/projects/-a')
  })

  it("reads the run's own transcript lines from its start on, and nothing else", () => {
    const run = aRun('own')
    writeFileSync(
      join(run.folder, 'one.jsonl'),
      [
        assistant(BEFORE, 'claude-sonnet-5', 'msg_0', { input_tokens: 999 }),
        assistant(AFTER, 'claude-opus-5', 'msg_1', { input_tokens: 3, cache_creation_input_tokens: 100, cache_read_input_tokens: 0 }),
        assistant(AFTER, 'claude-opus-5', 'msg_1', { input_tokens: 3, cache_creation_input_tokens: 100, cache_read_input_tokens: 0 }),
        assistant(AFTER, 'claude-opus-5', 'msg_2', { input_tokens: 2, cache_creation_input_tokens: 10, cache_read_input_tokens: 103 }),
        assistant(AFTER, '<synthetic>', 'msg_3', { input_tokens: 0 }),
        'not json',
      ].join('\n'),
    )
    mkdirSync(join(run.folder, 'one', 'subagents'), { recursive: true })
    writeFileSync(join(run.folder, 'one', 'subagents', 'agent-1.jsonl'), assistant(AFTER, 'claude-haiku-4-5', 'msg_9', { input_tokens: 7 }))
    const { served, said } = theServedOfAClaudeCodeRun({ outPath: run.out, env: run.env, cwd: run.cwd, startedAt: STARTED, briefPath: null })
    expect(served).toEqual({ model: 'claude-opus-5', temperature: 'not reported', briefBytes: 'not reported', contextTokens: { largestTurn: 115, total: 218 } })
    expect(said).toContain(`it read one.jsonl in ${run.folder}`)
  })

  it('leaves out a transcript last changed before the run started, and keeps every model the run had', () => {
    const run = aRun('several')
    writeFileSync(join(run.folder, 'old.jsonl'), assistant(AFTER, 'claude-sonnet-5', 'msg_0', { input_tokens: 1 }))
    utimesSync(join(run.folder, 'old.jsonl'), new Date(BEFORE), new Date(BEFORE))
    writeFileSync(join(run.folder, 'new.jsonl'), [assistant(AFTER, 'claude-opus-5', 'a', { input_tokens: 1 }), assistant(AFTER, 'claude-opus-5-5', 'b', { input_tokens: 2 })].join('\n'))
    const { served } = theServedOfAClaudeCodeRun({ outPath: run.out, env: run.env, cwd: run.cwd, startedAt: STARTED, briefPath: null })
    expect(served.model).toBe('claude-opus-5, claude-opus-5-5')
  })

  it('takes the models from a --output-format json result, and the brief size from the brief', () => {
    const run = aRun('json')
    writeFileSync(run.out, `a warning\n${JSON.stringify({ type: 'result', modelUsage: { 'claude-opus-5': {}, 'claude-haiku-4-5': {} } })}\n`)
    writeFileSync(join(run.folder, 'one.jsonl'), assistant(AFTER, 'claude-sonnet-5', 'msg_1', { input_tokens: 40 }))
    const brief = join(scratch, 'json', 'brief.md')
    writeFileSync(brief, '12345')
    const { served, said } = theServedOfAClaudeCodeRun({ outPath: run.out, env: run.env, cwd: run.cwd, startedAt: STARTED, briefPath: brief })
    expect(served).toEqual({ model: 'claude-opus-5, claude-haiku-4-5', temperature: 'not reported', briefBytes: 5, contextTokens: { largestTurn: 40, total: 40 } })
    expect(said).toContain('the json result named claude-opus-5, claude-haiku-4-5')
  })

  it('says "not reported" and where it looked when nothing names a model', () => {
    const run = aRun('nothing')
    rmSync(run.folder, { recursive: true })
    const { served, said } = theServedOfAClaudeCodeRun({ outPath: run.out, env: run.env, cwd: run.cwd, startedAt: STARTED, briefPath: null })
    expect(served).toEqual({ model: 'not reported', temperature: 'not reported', briefBytes: 'not reported', contextTokens: { largestTurn: 'not reported', total: 'not reported' } })
    expect(said).toBe(`its out file ${run.out} holds no --output-format json result; there is no transcript folder ${run.folder}; the transcripts named no model that answered.`)
  })
})
