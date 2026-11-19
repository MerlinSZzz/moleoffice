// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FIRST BRIEF THE OFFICE GIVES AT EACH START CARRIES THE RULE FOR A QUESTION FROM THE PERSON. The
 * owner's decision, by its item 6, agrees to step 2 of block b-7 of the secretary's report.
 *
 * The rule is chapter 7's rule with the id r-8, "A question from the person gets an answer, and then
 * you stop". The brief reads it from the office's chapter records, and writes no
 * copy of its own. Its opening (`head`, built by `briefHead` in src/server/api/brief.ts) prints it. The
 * session-start hook, tools/session-hook.mjs, prints that opening as it is, and the message worker puts
 * it at the top of every run's prompt.
 *
 * THIS WORLD COPIES THE DEFAULT SET at its start, as a new office does, and the rule is read back from
 * GET /api/office-regulations. Until wave 13w the brief read the rule from src/config/rules/chapters.json,
 * the export of the office this repository is developed in, and this file read the same export.
 * tests/an-agent-is-pointed-at-its-own-offices-regulations.test.ts tells the two apart with a made-up set.
 *
 * WHAT IS PROVED HERE: the brief's body and its opening carry the rule's name and words exactly as the
 * chapter holds them, and the session-start hook prints the same line.
 *
 * MUTATION (after a green control run, then restored), run again on 13 October 2026: `briefHead` never pushes the rule's line. The
 * case goes red at its check of the opening.
 */

import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HOOK = fileURLToPath(new URL('../tools/session-hook.mjs', import.meta.url))
const WORKSPACE = 'default'
const AGENT = 'question-rule-reader'

let t: TestDb
let server: Awaited<ReturnType<typeof apiApp>>
let url = ''
let scratch = ''

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const notesWritten: string[] = []
function aSessionId(): string {
  const id = `test-${Math.random().toString(36).slice(2)}-${String(Date.now())}`
  notesWritten.push(`session-${id}.json`)
  return id
}

/** Run the hook the way Claude Code runs it, as one named agent, and answer what it printed. */
async function runHook(as: string): Promise<string> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    MOLE_OFFICE_API: url,
    MOLE_OFFICE_WORKSPACE: WORKSPACE,
    MOLE_OFFICE_DB: t.file,
    MOLE_HOOK_DETAILS_FOLDER: join(scratch, 'hook-details'),
    MOLE_OFFICE_AGENT: as,
  }
  delete env['TMUX_PANE']
  delete env['MOLE_OFFICE_SESSION']
  return await new Promise<string>((resolve, reject) => {
    const child = execFile('node', [HOOK, 'start'], { encoding: 'utf8', env }, (error, stdout) => {
      if (error !== null) reject(error)
      else resolve(stdout)
    })
    child.stdin?.end(JSON.stringify({ session_id: aSessionId(), cwd: scratch }))
  })
}

/** The rule as this office's chapter holds it: its number in chapter 7, its name and its words. */
async function theRuleInTheChapter(): Promise<{ number: number; name: string; text: string }> {
  const read = await server.app.inject({ method: 'GET', url: '/api/office-regulations', headers: AS_THE_PERSON })
  expect(read.statusCode, read.body).toBe(200)
  const held = read.json() as { chapters: { n: number; outline: { id: string; name: string; text: string }[] }[] }
  const chapter = held.chapters.find((one) => one.n === 7)
  expect(chapter, 'this office holds no chapter 7').toBeDefined()
  const at = chapter!.outline.findIndex((rule) => rule.id === 'r-8')
  expect(at, 'chapter 7 holds no rule r-8').toBeGreaterThan(-1)
  return { number: at + 1, name: chapter!.outline[at]!.name, text: chapter!.outline[at]!.text }
}

beforeAll(async () => {
  t = await freshDb()
  // AS A NEW OFFICE DOES AT ITS FIRST START. Imported after freshDb, which resets the modules.
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  server = await apiApp()
  await server.app.listen({ port: 0, host: '127.0.0.1' })
  const address = server.app.server.address()
  url = `http://127.0.0.1:${String(typeof address === 'object' && address !== null ? address.port : 0)}`
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-question-rule-'))
  const registered = await server.app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle: AGENT, name: 'Question Rule Reader', role: 'worker' },
  })
  expect(registered.statusCode, registered.body).toBe(201)
}, 60_000)

afterAll(async () => {
  await server.app.close()
  t.close()
  rmSync(scratch, { recursive: true, force: true })
  const stateDir = fileURLToPath(new URL('../.logs', import.meta.url))
  for (const name of notesWritten.splice(0)) rmSync(join(stateDir, name), { force: true })
})

describe('the first brief at each start carries the rule for a question from the person', () => {
  it('carries the rule as the chapter holds it, in the body, the opening and the start hook', async () => {
    const rule = await theRuleInTheChapter()
    expect(rule.name).toBe('A question from the person gets an answer, and then you stop')
    const expected = `Chapter 7 rule ${String(rule.number)}, ${rule.name}: ${rule.text}`

    const reply = await server.app.inject({
      method: 'GET',
      url: '/api/brief',
      headers: { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': AGENT },
    })
    expect(reply.statusCode, reply.body).toBe(200)
    const brief = reply.json() as { head: string; aQuestionFromThePerson: Record<string, unknown> }
    expect(brief.aQuestionFromThePerson).toMatchObject({ found: true, chapter: 7, number: rule.number, name: rule.name, text: rule.text })
    // THE SENTENCE IS THE OPENING'S. In the body it would be the name and the text again (wave 13q round 47).
    expect(brief.aQuestionFromThePerson).not.toHaveProperty('says')
    expect(brief.head.split('\n'), brief.head).toContain(expected)

    const printed = await runHook(AGENT)
    expect(printed.split('\n').map((line) => line.trim()), printed).toContain(expected)
  }, 60_000)
})
