// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * CRITERION I2: every adapted framework gets the brief at start, by the mechanism it has.
 *
 * There are two mechanisms and `src/shared/briefing.ts` says which tool gets which. Claude Code has
 * a start hook and Mole Office already uses it; Codex, OpenCode and Kimi CLI are started by the
 * worker with a prompt, and the brief goes at the top of it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY NOT THE RULES FILE, WHICH ALL THREE ALSO READ
 * ---------------------------------------------------------------------------------------
 *
 * It was built that way first and measured on 6 September 2026. Codex 0.147.0 reads a project
 * document only up to `project_doc_max_bytes`, 32,768 by default, and drops the whole file above
 * that without saying anything. `src/worker/rules.ts` writes 32,653 bytes, so a brief of any size
 * took the rules with it. One test below holds that margin, because it is 115 bytes and nothing
 * else watches it.
 *
 * WHAT THIS FILE CANNOT PROVE is that a real run of a real tool has the brief in its context. That
 * needs a model call and is in the report instead, with the transcript of each run.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { readTheHookDetails } from './hook-details.ts'
import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { AGENT_RUNTIMES } from '../src/shared/participants.ts'
import { BRIEFINGS, runtimesWithNoBriefing, THE_BRIEF_HEADING } from '../src/shared/briefing.ts'
import { promptFor, type Delivering } from '../src/worker/prompt.ts'

const HOOK = fileURLToPath(new URL('../tools/session-hook.mjs', import.meta.url))
const WORKSPACE = 'default'

/**
 * The size above which Codex 0.147.0 drops a project document whole, from its own configuration key
 * `project_doc_max_bytes`. IT IS DECLARED IN THE GENERATOR AND READ HERE. It used to be typed into
 * this file as well, which is one fact in two places: the generator could raise its idea of the
 * limit and this test would go on passing against the old number. Problem `2zwQE7ONqg9h`.
 */

let t: TestDb
let server: Awaited<ReturnType<typeof apiApp>>
let url: string
let scratch: string

beforeAll(async () => {
  t = await freshDb()
  // THE DEFAULT SET, COPIED AS A NEW OFFICE DOES AT ITS FIRST START: the brief reads its chapters from the office's
  // chapter records (wave 13w). Imported after freshDb, which resets the modules.
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  server = await apiApp()
  await server.app.listen({ port: 0, host: '127.0.0.1' })
  const address = server.app.server.address()
  url = `http://127.0.0.1:${String(typeof address === 'object' && address !== null ? address.port : 0)}`
}, 60_000)

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-briefed-'))
})

afterEach(async () => {
  rmSync(scratch, { recursive: true, force: true })
})

afterAll(async () => {
  await server.app.close()
  t.close()
})

/** The notes the hook leaves beside the checkout, removed so one test cannot see another's. */
const notesWritten: string[] = []
afterEach(() => {
  const stateDir = fileURLToPath(new URL('../.logs', import.meta.url))
  for (const name of notesWritten.splice(0)) rmSync(join(stateDir, name), { force: true })
})

function aSessionId(): string {
  const id = `test-${Math.random().toString(36).slice(2)}-${String(Date.now())}`
  notesWritten.push(`session-${id}.json`)
  return id
}

/** Run the hook the way Claude Code runs it. */
async function runHook(workspace: string = WORKSPACE): Promise<string> {
  const env: NodeJS.ProcessEnv = {
    ...withoutInheritedEffort(),
    MOLE_OFFICE_API: url,
    MOLE_OFFICE_WORKSPACE: workspace,
    MOLE_OFFICE_DB: t.file,
    MOLE_HOOK_DETAILS_FOLDER: join(scratch, 'hook-details'),
  }
  delete env['TMUX_PANE']
  return await new Promise<string>((resolve, reject) => {
    const child = execFile('node', [HOOK, 'start'], { encoding: 'utf8', env }, (error, stdout) => {
      if (error !== null) reject(error)
      else resolve(stdout)
    })
    child.stdin?.end(JSON.stringify({ session_id: aSessionId(), cwd: scratch }))
  })
}

/** Everything a run is told, with only the brief varying. */
function delivering(brief: string | null): Delivering {
  return {
    agent: 'a-reader',
    workspace: WORKSPACE,
    api: url,
    messageId: 'themessageid',
    body: 'What is the state of this project?',
    from: `person ${THE_TEST_OFFICES_OWNER.id}`,
    carryingOn: false,
    howToLead: '## When somebody asks you to take them to a page\n\nSay where it is.',
    knows: null,
    brief,
  }
}

describe('every adapted framework is briefed at its start', () => {
  it('says how each adapted tool gets the brief, and leaves none of them out', () => {
    expect(
      runtimesWithNoBriefing(),
      'a tool Mole Office adapts has nothing saying how an agent running in it learns what the project is',
    ).toEqual([])
    for (const runtime of AGENT_RUNTIMES) {
      const briefing = BRIEFINGS[runtime]
      expect(briefing.carriedBy.length, `${runtime} does not say what carries its brief`).toBeGreaterThan(10)
      expect(briefing.needs.length, `${runtime} does not say what has to be true for the brief to arrive`).toBeGreaterThan(10)
    }
  })

  it('puts the brief in the first message of every run the worker starts', () => {
    const prompt = promptFor(delivering('Mole Office — 3 modules. 2 open. The whole brief is 900 characters.'))
    expect(prompt, 'the first message does not carry the state of the project').toContain(THE_BRIEF_HEADING)
    expect(prompt).toContain('The whole brief is 900 characters.')
    // Before the message, because a run that reads the question first answers it from nothing.
    expect(
      prompt.indexOf(THE_BRIEF_HEADING),
      'the state of the project comes after the question it is meant to be answered against',
    ).toBeLessThan(prompt.indexOf('What is the state of this project?'))
  })

  it('says the brief is missing rather than starting a run that looks briefed', () => {
    const prompt = promptFor(delivering(null))
    expect(prompt).toContain('MOLE OFFICE DID NOT ANSWER THE BRIEF')
    expect(prompt).not.toContain(THE_BRIEF_HEADING)
  })

  it("prints the brief's opening in Claude Code's start hook", async () => {
    const printed = await runHook()
    expect(printed, 'the hook printed nothing at all').toContain('MOLE OFFICE —')
    expect(printed, "the hook did not print the brief's opening").toContain('from GET /api/brief')
    expect(printed, 'the hook did not say how big the whole brief is').toMatch(/The whole brief is \d+ characters/)
  }, 60_000)

  it('never prints an opening it does not have', async () => {
    // Mole Office is up, and the brief is the one read that fails: a project nothing answers for
    // gets a 404, which is what the hook has to survive without inventing an opening. Closing the
    // server would not reach this branch at all — the hook stops at its world check first.
    const printed = await runHook('no-such-project')
    expect(readTheHookDetails(printed), 'the hook said nothing about the brief it could not read').toContain(
      'Mole Office did not answer the brief',
    )
    // The point of this one: with nothing to print, the hook must not print an opening anyway. A
    // fabricated one would be read by every run as the state of the project.
    expect(printed, 'the hook printed a brief opening when Mole Office had answered nothing').not.toContain(
      'from GET /api/brief',
    )
    expect(printed).not.toMatch(/The whole brief is \d+ characters/)
  }, 60_000)

  it("keeps the rules file under the size Codex drops a project document at", async () => {
    const { CODEX_PROJECT_DOC_MAX_BYTES, rulesTextFrom } = await import('../src/worker/rules.ts')
    const checkout = fileURLToPath(new URL('..', import.meta.url))
    const bytes = Buffer.byteLength(rulesTextFrom(checkout), 'utf8')
    expect(
      bytes,
      `AGENTS.md is ${String(bytes)} bytes. Codex 0.147.0 reads a project document only up to ` +
        `project_doc_max_bytes, ${String(CODEX_PROJECT_DOC_MAX_BYTES)} by default, and drops the whole file above ` +
        'that without saying anything — so a Codex run would get no rules at all. Shorten CLAUDE.md or the ' +
        'skill sections in src/worker/rules.ts, or raise project_doc_max_bytes in the Codex config and say ' +
        'here that you did.',
    ).toBeLessThan(CODEX_PROJECT_DOC_MAX_BYTES)
  })

  it('carries an opening in the reply, so nothing else has to build one', async () => {
    const reply = await server.app.inject({
      method: 'GET',
      url: '/api/brief',
      headers: { 'x-mole-office-workspace': WORKSPACE },
    })
    expect(reply.statusCode, reply.body).toBe(200)
    const brief = JSON.parse(reply.body) as { head: string; size: { characters: number } }
    expect(typeof brief.head, 'the brief has no opening for a hook or a prompt to print').toBe('string')
    expect(brief.head).toContain('from GET /api/brief')
    expect(brief.head).toContain(`The whole brief is ${String(brief.size.characters)} characters`)
    // THE NUMBER IS WORKED OUT FROM THIS OFFICE'S CHAPTER 9, as the brief works it out: the rule whose id is r-8. An
    // office that copied the default set and the office this repository is developed in number it differently.
    const read = await server.app.inject({ method: 'GET', url: '/api/office-regulations', headers: { 'x-mole-office-workspace': WORKSPACE } })
    expect(read.statusCode, read.body).toBe(200)
    const nine = (read.json() as { chapters: { n: number; outline: { id: string; name: string }[] }[] }).chapters.find((one) => one.n === 9)
    const at = nine?.outline.findIndex((rule) => rule.id === 'r-8') ?? -1
    expect(at, 'this office holds no chapter 9 rule r-8').toBeGreaterThan(-1)
    expect(
      brief.head,
      'the opening no longer points at chapter 9 rule r-8 by its number here, so a run that reads only the opening is ' +
        'not told where the rule about the terminal and the office is',
    ).toContain(`chapter 9 rule ${String(at + 1)}, ${nine!.outline[at]!.name}.`)
  })
})
