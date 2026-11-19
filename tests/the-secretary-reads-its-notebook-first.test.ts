// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * CRITERION N4: the notebook is the secretary's own, and a run reads it before anything else —
 * on every model.
 *
 * THE RULE (design/flows/ACCEPTANCE.md, N4, and design/REVIEW-2026-09-07.md): the secretary's notebook
 * is to be set up soon, and it matters. It records how the work felt, the secretary's own character and
 * its way of answering, like a soul.md, for the secretary to recover them quickly after a change of model.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT "NOTHING IS MODEL-SPECIFIC" MEANS HERE, AND HOW IT IS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * This file cannot call two models. What it CAN measure, and what the owner's sentence actually depends on,
 * is that the block a run reads arrives first by both of the two mechanisms `src/shared/briefing.ts`
 * declares: the Claude Code start hook, and the first message the office worker writes for every
 * other tool, and that both are the same text byte for byte. If the block were assembled per runtime,
 * a run on another model could get a different secretary and nothing would say so.
 *
 * THE MUTATION, named in the brief: drop the block from the brief.
 */
import { THE_TEST_OFFICES_OWNER, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { execFile } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { AGENT_RUNTIMES } from '../src/shared/participants.ts'
import { BRIEFINGS, THE_BRIEF_HEADING } from '../src/shared/briefing.ts'
import { promptFor, type Delivering } from '../src/worker/prompt.ts'
import {
  NOTEBOOK_ENTRY_KINDS,
  THE_NOTEBOOK_HEADING,
  THE_SECRETARYS_OWN_KINDS,
  theNotebookOpening,
} from '../src/shared/notebook.ts'
import { theRoleCardsFile } from '../src/server/lib/roles.ts'

const HOOK = fileURLToPath(new URL('../tools/session-hook.mjs', import.meta.url))
const WORKSPACE = 'default'
const MARKER = 'MOLE OFFICE —'

let t: TestDb
let server: Awaited<ReturnType<typeof apiApp>>
let url: string
let scratch: string

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

function theSecretaryCard(): string {
  const said = JSON.parse(readFileSync(theRoleCardsFile(), 'utf8')) as {
    elevation: { onlyThisCardCanHoldIt: string }
  }
  return said.elevation.onlyThisCardCanHoldIt
}

const notesWritten: string[] = []
function aSessionId(): string {
  const id = `test-${Math.random().toString(36).slice(2)}-${String(Date.now())}`
  notesWritten.push(`session-${id}.json`)
  return id
}

/** Run the hook the way Claude Code runs it, as one named agent. */
async function runHook(as: string): Promise<string> {
  const env: NodeJS.ProcessEnv = {
    ...withoutInheritedEffort(),
    MOLE_OFFICE_API: url,
    MOLE_OFFICE_WORKSPACE: WORKSPACE,
    MOLE_OFFICE_DB: t.file,
    MOLE_HOOK_DETAILS_FOLDER: join(scratch, 'hook-details'),
    MOLE_OFFICE_AGENT: as,
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

async function theBrief(as: string): Promise<{ head: string; notebook: Record<string, unknown>; wire: string }> {
  const reply = await server.app.inject({ method: 'GET', url: '/api/brief', headers: asAgent(as) })
  expect(reply.statusCode, reply.body).toBe(200)
  const said = reply.json() as { head: string; notebook: Record<string, unknown> }
  return { head: said.head, notebook: said.notebook, wire: reply.body }
}

/** Everything a started run is told, with only the brief varying. */
function delivering(brief: string | null): Delivering {
  return {
    agent: THE_TEST_OFFICES_SECRETARY.handle,
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

beforeEach(async () => {
  t = await freshDb()
  server = await apiApp()
  await server.app.listen({ port: 0, host: '127.0.0.1' })
  const address = server.app.server.address()
  url = `http://127.0.0.1:${String(typeof address === 'object' && address !== null ? address.port : 0)}`
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-notebook-'))

  await server.app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: theSecretaryCard() },
  })
  // THE PERSON'S ENTRY COMES FIRST, then the secretary's own three kinds, which is N4's whole subject.
  for (const [who, entryKind, text] of [
    [AS_THE_PERSON, 'how-they-want-answers', 'Conclusion first, then the reasons.'],
    [asAgent(THE_TEST_OFFICES_SECRETARY.handle), 'a-feeling-at-work', 'The merge was heavier than the work in it.'],
    [asAgent(THE_TEST_OFFICES_SECRETARY.handle), 'its-character', 'I say what stopped me rather than what would probably have happened.'],
    [asAgent(THE_TEST_OFFICES_SECRETARY.handle), 'how-it-replies', 'Short, and the answer before the reasoning.'],
  ] as const) {
    const reply = await server.app.inject({
      method: 'POST',
      url: `/api/agents/${THE_TEST_OFFICES_SECRETARY.handle}/notebook/entries`,
      headers: who as Record<string, string>,
      payload: { entryKind, text },
    })
    expect(reply.statusCode, reply.body).toBe(201)
  }
})

afterEach(async () => {
  await server.app.close()
  t.close()
  rmSync(scratch, { recursive: true, force: true })
  const stateDir = fileURLToPath(new URL('../.logs', import.meta.url))
  for (const name of notesWritten.splice(0)) rmSync(join(stateDir, name), { force: true })
})

// ============================================================ 1. the secretary's own entries

describe('the secretary’s own entries are the same record and the same doors', () => {
  it('marks them by their kind, and the three kinds are the owner\'s three', () => {
    expect([...THE_SECRETARYS_OWN_KINDS].sort()).toEqual(['a-feeling-at-work', 'how-it-replies', 'its-character'])
    for (const key of THE_SECRETARYS_OWN_KINDS) {
      const kind = NOTEBOOK_ENTRY_KINDS.find((one) => one.key === key)
      expect(kind?.about, `${key} is not marked as the secretary’s own`).toBe('the secretary')
      // THE PERSON'S OWN WORDS ARE ON EVERY KIND, so a reader can check the reading against them.
      expect(kind?.fromThePersonsWords.length, `${key} does not say which of the owner's words it came from`).toBeGreaterThan(1)
    }
  })

  it('keeps them in the one notebook, beside the person’s, each saying who wrote it', async () => {
    const reply = await server.app.inject({ method: 'GET', url: `/api/agents/${THE_TEST_OFFICES_SECRETARY.handle}/notebook`, headers: AS_THE_PERSON })
    const said = reply.json() as {
      entries: { entryKind: string; writtenByKind: string }[]
      statistics: { entries: number; byThePerson: number; byTheSecretary: number }
    }
    expect(said.statistics.entries).toBe(4)
    expect(said.statistics.byThePerson).toBe(1)
    expect(said.statistics.byTheSecretary).toBe(3)
    for (const entry of said.entries) {
      if (THE_SECRETARYS_OWN_KINDS.includes(entry.entryKind)) expect(entry.writtenByKind).toBe('agent')
    }
  })
})

// ============================================================ 2. first in the brief

describe('the brief hands the whole notebook over first', () => {
  it('opens with it, before the project’s own name', async () => {
    const said = await theBrief(THE_TEST_OFFICES_SECRETARY.handle)
    expect(said.head.startsWith(THE_NOTEBOOK_HEADING), 'the opening does not begin with the notebook').toBe(true)
    // THE WHOLE OF IT, not a count of it: after a change of model the secretary is to recover its own character quickly.
    expect(said.head).toContain('I say what stopped me rather than what would probably have happened.')
    expect(said.head).toContain('Short, and the answer before the reasoning.')
    expect(said.head).toContain('Conclusion first, then the reasons.')
  })

  it('is the first thing in the reply as well, before the project', async () => {
    const said = await theBrief(THE_TEST_OFFICES_SECRETARY.handle)
    expect(said.wire.indexOf('"notebook"'), 'notebook is not the first key of the reply').toBeLessThan(
      said.wire.indexOf('"project"'),
    )
    expect(said.notebook['isThere']).toBe(true)
  })

  it('keeps the size identity the brief measures itself by', async () => {
    const reply = await server.app.inject({ method: 'GET', url: '/api/brief', headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
    const said = reply.json() as { head: string; size: { openingCharacters: number } }
    expect(said.size.openingCharacters, 'the brief mismeasures its own opening').toBe(said.head.length)
  })
})

// ============================================================ 3. first at the start of a run

describe('a run reads it before anything else, by both mechanisms', () => {
  it('prints it in Claude Code’s start hook, with only the wiring line above it', async () => {
    const printed = await runHook(THE_TEST_OFFICES_SECRETARY.handle)
    const lines = printed.split('\n')
    expect(lines[0], 'the hook no longer prints the wiring line first').toContain(MARKER)
    const atNotebook = printed.indexOf(THE_NOTEBOOK_HEADING)
    expect(atNotebook, 'the hook did not print the notebook at all').toBeGreaterThan(-1)
    // NOTHING BUT THE MARKER COMES FIRST. Everything else the hook says — what is waiting, the
    // orphan processes, the other runs, the open loops — is below it.
    const before = printed.slice(0, atNotebook).split('\n').filter((line) => line.trim() !== '')
    expect(before, 'something else is printed before the notebook').toEqual([lines[0]])
    expect(printed, 'the hook did not print the notebook’s own entries').toContain('I say what stopped me')
  }, 60_000)

  it('puts it at the top of the first message of every run the worker starts', async () => {
    const said = await theBrief(THE_TEST_OFFICES_SECRETARY.handle)
    const prompt = promptFor(delivering(said.head))
    expect(prompt).toContain(THE_BRIEF_HEADING)
    expect(prompt).toContain(THE_NOTEBOOK_HEADING)
    // BEFORE THE MESSAGE, and before the framing sentence and the headers that used to come first.
    expect(prompt.indexOf(THE_NOTEBOOK_HEADING)).toBeLessThan(prompt.indexOf('What is the state of this project?'))
    expect(prompt.indexOf(THE_NOTEBOOK_HEADING)).toBeLessThan(prompt.indexOf('Somebody has sent you a message'))
    expect(prompt.indexOf(THE_NOTEBOOK_HEADING)).toBeLessThan(prompt.indexOf('x-mole-office-actor-id'))
  })

  it('says a notebook is missing rather than starting a run that looks like it has one', async () => {
    await server.app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: AS_THE_PERSON,
      payload: { handle: 'quill', name: 'Quill', role: theSecretaryCard() },
    })
    const said = await theBrief('quill')
    expect(said.head.startsWith(THE_NOTEBOOK_HEADING)).toBe(true)
    expect(said.head).toContain('No notebook has been written for you yet')
    expect(said.head).toContain('do not invent any of it')
  })
})

// ============================================================ 4. nothing model-specific

describe('a run on another model gets the same block', () => {
  it('hands the same text to both mechanisms, byte for byte', async () => {
    const said = await theBrief(THE_TEST_OFFICES_SECRETARY.handle)
    const block = said.head.slice(0, said.head.indexOf('\n\n'))

    // THE HOOK'S COPY. Claude Code's mechanism is `start-hook`.
    const printed = await runHook(THE_TEST_OFFICES_SECRETARY.handle)
    const inTheHook = printed.slice(printed.indexOf(THE_NOTEBOOK_HEADING))
    expect(inTheHook.startsWith(block), 'the hook draws a different block from the brief').toBe(true)

    // THE WORKER'S COPY. Every other tool's mechanism is `first-message`, and they share one prompt.
    const prompt = promptFor(delivering(said.head))
    for (const line of block.split('\n')) {
      expect(prompt, 'the worker’s first message drops a line of the notebook').toContain(line)
    }

    // AND THE DECLARATION SAYS BOTH MECHANISMS ARE COVERED, so a tool added later is not missed.
    const mechanisms = new Set(AGENT_RUNTIMES.map((one) => BRIEFINGS[one].how))
    expect([...mechanisms].sort(), 'a runtime is briefed by a mechanism this test does not measure').toEqual([
      'first-message',
      'start-hook',
    ])
  }, 60_000)

  it('writes the same words for any agent, because only the entries differ', () => {
    const entries = [
      {
        id: 'e1',
        writtenByKind: 'agent' as const,
        writtenById: 'whoever',
        at: '2026-09-11 16:00:00',
        entryKind: 'its-character',
        text: 'One line.',
      },
    ]
    const one = theNotebookOpening({ agent: 'whoever', entries })
    const two = theNotebookOpening({ agent: 'whoever', entries })
    expect(one).toBe(two)
    expect(one.startsWith(THE_NOTEBOOK_HEADING)).toBe(true)
  })
})
