// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * UNDER A RUN'S SAVED ROUND CHAPTERS, THE CHECK'S PROMPT OFFERS FOR `says` ONLY WHAT THE DOOR'S RULE TAKES.
 *
 * Round BL, item 2ao. A run that saved its round chapters (data.extra.roundChapters) bounds what a verdict may cite: the
 * verdict door holds the verdict to checkSavedChapterClaims (src/shared/round-chapters/manifest.ts), which refuses any
 * precedent and any chapter that was not delivered. The prompt still offered a precedent there, from whatSaysTakes(), so
 * a check that took the offer had its verdict refused at the door, and the verdict was lost.
 *
 * WHAT IS REAL AND WHAT IS NOT. The database, the prompt builder and the rule are real. The round, its brief, its chapters
 * and every record here are made up (tests/round-chapters-fixture.ts). No model runs.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED, proved in the round's report with a control run first:
 *   - The prompt under saved chapters offers `says` from whatSaysTakes() again: the first case goes red on `precedent`.
 *   - The prompt with no saved chapters offers what the saved one offers: the second case goes red.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, apiApp, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { madeUpRound } from './round-chapters-fixture.ts'
import { prepareRoundChapters } from '../src/shared/round-chapters/delivery.ts'
import { checkSavedChapterClaims } from '../src/shared/round-chapters/manifest.ts'
import { SAYS_KEYS, WHAT_SAYS_NAMES, whatSaysTakes } from '../src/config/verdict-keys.mjs'

let t: TestDb
let app: Awaited<ReturnType<typeof apiApp>>['app']
let lib: typeof import('../src/server/lib/inspection.ts')
const human = { type: 'human' as const, id: THE_PERSON }
const headers = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': 'default' }
/** The sentence that says where a decision or a precedent goes when none was given to the check. */
const THE_DECISION_SENTENCE = 'No decision or precedent was given to this check. To name one, write its record id in the text of `check`.'

beforeAll(async () => {
  t = await freshDb(); app = (await apiApp()).app; await app.ready()
  lib = await import('../src/server/lib/inspection.ts')
  for (const [handle, role] of [['synthetic-starter', 'supervisor'], ['synthetic-inspector', 'inspector']]) {
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle, name: `Made-up ${role}`, role } })
    expect(r.statusCode, r.body).toBe(201)
  }
  const { agentByHandle } = await import('../src/server/lib/participants.ts')
  const { makeAnAgentKey } = await import('../src/server/lib/keys.ts')
  const starter = agentByHandle('synthetic-starter')!
  const starterHeaders = { ...headers, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': starter.id, 'x-mole-office-key': makeAnAgentKey(starter.id, null) }
  const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: starterHeaders, payload: { handle: 'synthetic-worker', name: 'Made-up worker', role: 'worker', workArea: ['src'] } })
  expect(r.statusCode, r.body).toBe(201)
})
afterAll(async () => { await app?.close(); t?.close() })

/** The prompt the office builds for a check of a made-up running run whose data is `data`. */
function thePromptFor(data: Record<string, unknown>): string {
  const run = t.api.createRecord({ kind: 'session', title: 'Made-up run to check', workspaceId: 'default', actor: human, origin: 'fixture', data: { state: 'running', servingAgent: 'synthetic-worker', ...data } })
  return lib.assembleTheInspectorsPrompt({ reads: lib.whatTheInspectorReads(run.id, 'default'), changes: lib.changesInTheWorkArea([], []), workspaceId: 'default' }).text
}

/** Whether the prompt offers `key` for `says`: its name in backticks, then what it names, as verdict-keys.mjs gives it. */
const offers = (prompt: string, key: string) => prompt.includes(`\`${key}\` (${(WHAT_SAYS_NAMES as Record<string, string>)[key]}`)

it('under saved chapters, `says` is offered a key exactly when a check citing that key alone passes the rule', () => {
  const f = madeUpRound()
  const { manifest } = prepareRoundChapters({ sandboxDir: f.dir, worktree: f.worktree, brief: f.brief })
  const prompt = thePromptFor({ extra: { roundChapters: manifest } })
  // ONE CITATION OF EACH KEY: a chapter the round delivered, an invariant, and a made-up precedent id.
  const cited: Record<string, unknown> = { chapter: manifest.chapters[0]!.chapter, invariant: 1, precedent: 'aPrecedentMadeUp' }
  const passes = (key: string) => {
    try {
      checkSavedChapterClaims(manifest, { chaptersRead: [], says: { [key]: cited[key] } as never })
      return true
    } catch {
      return false
    }
  }
  expect(SAYS_KEYS.filter((key) => key in cited)).toEqual(SAYS_KEYS)
  for (const key of SAYS_KEYS) expect(offers(prompt, key), `whether the prompt offers \`${key}\``).toBe(passes(key))
  expect(SAYS_KEYS.some((key) => offers(prompt, key)), 'the prompt offers no key at all').toBe(true)
  expect(prompt).toContain(THE_DECISION_SENTENCE)
})

it('with no saved chapters, `says` is offered as before: every key the door reads, and no sentence about a decision', () => {
  const prompt = thePromptFor({})
  expect(prompt).toContain(`A refusal names what is missing and what says so, in "says": ${whatSaysTakes()}. The door reads no other key there. The run does not end;`)
  for (const key of SAYS_KEYS) expect(offers(prompt, key), `whether the prompt offers \`${key}\``).toBe(true)
  expect(prompt).not.toContain(THE_DECISION_SENTENCE)
})
