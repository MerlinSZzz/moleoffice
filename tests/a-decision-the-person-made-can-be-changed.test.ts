// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DECISION THE PERSON MADE CAN BE CHANGED BY THEM, AND WORDS CAN BE ADDED AFTER THE PRESS — CRITERION M83.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS FOUND
 * ---------------------------------------------------------------------------------------
 *
 * On proposal t29v9sRzAAFT, option A was pressed and there was no Decide it button: the press chose at
 * once: the option could not be changed and no comment could be added, and the decision could not
 * be changed afterwards either, even before anything was built on it.
 *
 * MEASURED: the press became the decision on the person's own words of 6 September — criterion M57, commit
 * 149d0101 — and the reason box sits beside the options and is saved WITH the option pressed. So
 * words had to be typed before the press, and once it landed nothing let the person change the option or
 * add a word. `promoteProposal` refuses a second promotion with a 409 whose own sentence tells a
 * person to file the new decision by hand and link it `supersedes`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 *   · words can be added after the press, each with when, and `because` is not touched;
 *   · choosing again writes a NEW decision that supersedes the old one and resolves the same fork;
 *   · the old decision is left exactly as it was written;
 *   · the fork stays settled and says which decision stands;
 *   · a decision already superseded is refused, naming the one that stands;
 *   · it is the person's act: an agent is refused and nothing is written;
 *   · the press on an option is still the decision — M57 is not undone;
 *   · the page draws the mark, the presses, and neither press on a superseded decision.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   drop the `supersedes` link from `chooseAgain` → three cases go red.
 *   make `chooseAgain`'s `if (already !== null)` refusal dead → the twice case goes red. NOTE: that
 *     exact line reads the same as one at records.ts:9435, so a first-match edit hits the wrong one
 *     and everything stays green — measured 7 September 2026, and the reason this note says so.
 *   let `words_since` through `assertMayDecide` → the agent-words case goes red.
 *   draw the presses on a superseded decision → the last page case goes red.
 *   THE AGENT CASE NEEDS BOTH DOORS OPENED, because two refuse it: `assertMayWrite` at the top of
 *     `chooseAgain` and the create inside it. Removing either alone leaves the case green, and the
 *     mutation that proves it removes the first and gives the create a human actor.
 *   delete the `.px-gov-since-row` rule from GOVERNANCE_CSS → the stylesheet case goes red naming
 *     px-gov-since-row as the class with no rule. Measured 7 September 2026.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

type GovernanceModule = typeof import('../src/web/components/Governance.tsx')

let t: TestDb
let app: FastifyInstance
let gv: GovernanceModule
let proposal: string
let first: string

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_AN_AGENT = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'builder-cl' }

const OPTIONS = ['a — keep the port as it is', 'b — move it to a socket of its own']

async function recordOf(id: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as Record<string, unknown>
}

async function chooseAgain(
  headers: Record<string, string>,
  decision: string,
  option: string,
  because: string,
): Promise<{ code: number; said: string; id: string | null }> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/records/${decision}/choose-again`,
    headers,
    payload: { title: option.slice(0, 100), data: { option_taken: option, option_index: OPTIONS.indexOf(option), because } },
  })
  const made = reply.statusCode === 201 ? (reply.json() as Record<string, unknown>) : null
  return {
    code: reply.statusCode,
    said: reply.body,
    id: made === null ? null : ((made['decision'] as Record<string, unknown>)['id'] as string),
  }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()

  const madeFork = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_PERSON,
    payload: {
      kind: 'proposal',
      title: 'Which port the remote listener takes',
      data: { question: 'Which port?', options: OPTIONS, who_settles_it: 'the owner' },
    },
  })
  expect(madeFork.statusCode, madeFork.body).toBe(201)
  proposal = ((madeFork.json() as Record<string, unknown>)['record'] as Record<string, unknown>)['id'] as string

  // THE PRESS THAT IS THE DECISION, criterion M57. Everything below is about what happens after it.
  const promoted = await app.inject({
    method: 'POST',
    url: `/api/records/${proposal}/promote`,
    headers: AS_THE_PERSON,
    payload: {
      title: OPTIONS[0] as string,
      data: { option_taken: OPTIONS[0], option_index: 0, because: 'the port has worked for a month' },
    },
  })
  expect(promoted.statusCode, promoted.body).toBe(201)
  first = ((promoted.json() as Record<string, unknown>)['decision'] as Record<string, unknown>)['id'] as string

  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  storage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: THE_PERSON }))
  gv = (await import('../src/web/components/Governance.tsx')) as GovernanceModule
})

afterAll(async () => {
  await app.close()
  t.close()
})

// ============================================================ 1. words after the press

describe('adding words after the press', () => {
  it('appends them with when, and leaves the reasoning written with the press alone', async () => {
    const said = await app.inject({
      method: 'PATCH',
      url: `/api/records/${first}`,
      headers: AS_THE_PERSON,
      payload: { dataPatch: { words_since: [{ at: '2026-09-08 10:15', words: 'still right a day later' }] } },
    })
    expect(said.statusCode, said.body).toBe(200)
    const data = ((await recordOf(first))['record'] as Record<string, unknown>)['data'] as Record<string, unknown>
    expect(data['words_since']).toEqual([{ at: '2026-09-08 10:15', words: 'still right a day later' }])
    expect(data['because'], 'what the person said while deciding is untouched').toBe('the port has worked for a month')
  })

  it('keeps every earlier word when another is added', async () => {
    const before = ((await recordOf(first))['record'] as Record<string, unknown>)['data'] as Record<string, unknown>
    const said = await app.inject({
      method: 'PATCH',
      url: `/api/records/${first}`,
      headers: AS_THE_PERSON,
      payload: {
        dataPatch: {
          words_since: [
            ...(before['words_since'] as unknown[]),
            { at: '2026-09-09 09:00', words: 'and again on the second day' },
          ],
        },
      },
    })
    expect(said.statusCode, said.body).toBe(200)
    const data = ((await recordOf(first))['record'] as Record<string, unknown>)['data'] as Record<string, unknown>
    expect((data['words_since'] as unknown[]).length).toBe(2)
  })

  /**
   * AN AGENT MAY NOT WRITE THESE, AND MEASURING THAT TURNED UP A WIDER HOLE.
   *
   * MEASURED 7 SEPTEMBER 2026 on a fresh database: `promoteProposal` fills a decision the person
   * settles by pressing an option with `authority`: "the owner said so", `decided_by`: "the owner"
   * and `authority_reference`: the proposal. On a CHANGE the merged data reaches `assertMayDecide`,
   * so every clause in it is satisfied by what the PROMOTION wrote — and an agent could patch such a
   * decision, `because` included, 200. That hole is older than this criterion and is filed as its
   * own problem; what is shut here is the field this criterion adds.
   */
  it('is refused to an agent: words the person added after the press are theirs', async () => {
    const said = await app.inject({
      method: 'PATCH',
      url: `/api/records/${first}`,
      headers: AS_AN_AGENT,
      payload: { dataPatch: { words_since: [{ at: '2026-09-08 11:00', words: 'an agent wrote this' }] } },
    })
    expect(said.statusCode).toBe(403)
    expect(said.body, 'the sentence says whose words these are').toContain("person's own")
    const data = ((await recordOf(first))['record'] as Record<string, unknown>)['data'] as Record<string, unknown>
    expect((data['words_since'] as unknown[]).length, 'nothing was written').toBe(2)
  })

  it('lets an agent change the rest of such a decision, which is the hole this did not shut', async () => {
    // MEASURED, NOT DESIGNED. This case exists so the hole is on the record as a fact rather than as
    // a sentence: if somebody narrows the guard later, this case goes red and names what changed.
    const said = await app.inject({
      method: 'PATCH',
      url: `/api/records/${first}`,
      headers: AS_AN_AGENT,
      payload: { dataPatch: { revisit_when: 'measured by builder-cl, 7 September 2026' } },
    })
    expect(said.statusCode, 'an agent may still change a promoted decision — problem filed').toBe(200)
  })
})

// ============================================================ 2. choosing again

describe('choosing again', () => {
  it('writes a new decision that supersedes the old one and resolves the same fork', async () => {
    const said = await chooseAgain(AS_THE_PERSON, first, OPTIONS[1] as string, 'the port clashed with the app server')
    expect(said.code, said.said).toBe(201)
    expect(said.id).not.toBeNull()
    const links = (await recordOf(said.id as string))['links'] as Record<string, unknown>[]
    const supersedes = links.find((one) => one['type'] === 'supersedes' && one['isBacklink'] === false)
    expect(supersedes, 'the new one supersedes the old').toBeDefined()
    expect((supersedes?.['other'] as Record<string, unknown>)['id']).toBe(first)
    const fork = links.find((one) => one['type'] === 'derived_from' && one['isBacklink'] === false)
    expect(fork, 'and it answers the same fork').toBeDefined()
    expect((fork?.['other'] as Record<string, unknown>)['id']).toBe(proposal)
  })

  it('leaves the old decision exactly as it was written', async () => {
    const held = (await recordOf(first))['record'] as Record<string, unknown>
    const data = held['data'] as Record<string, unknown>
    expect(data['option_taken'], 'what the person decided before is still readable').toBe(OPTIONS[0])
    expect(data['because']).toBe('the port has worked for a month')
    expect(held['deletedAt'], 'nothing was deleted').toBeNull()
  })

  it('marks the old decision superseded, on its own links', async () => {
    const links = (await recordOf(first))['links'] as Record<string, unknown>[]
    const mark = links.find((one) => one['type'] === 'supersedes' && one['isBacklink'] === true)
    expect(mark, 'the old one carries the backlink that says it was superseded').toBeDefined()
  })

  it('keeps the fork settled, and says which decisions settled it', async () => {
    const said = (await recordOf(proposal))['resolution'] as Record<string, unknown>
    expect(said['resolved'], 'the fork is still settled').toBe(true)
    expect((said['by'] as unknown[]).length, 'by two decisions, one superseding the other').toBe(2)
  })

  it('refuses a second supersession of the same decision, naming the one that stands', async () => {
    const said = await chooseAgain(AS_THE_PERSON, first, OPTIONS[0] as string, 'changing my mind back')
    expect(said.code).toBe(409)
    expect(said.said, 'it says what to do instead').toContain('Choose again on that one')
  })

  it('is refused to an agent, and writes nothing', async () => {
    const before = ((await recordOf(proposal))['resolution'] as Record<string, unknown>)['by'] as unknown[]
    const newest = (await recordOf(proposal))['resolution'] as Record<string, unknown>
    const stands = (newest['by'] as Record<string, unknown>[])[1]?.['id'] as string
    const said = await chooseAgain(AS_AN_AGENT, stands, OPTIONS[0] as string, 'an agent trying to decide')
    expect(said.code).toBe(403)
    const after = ((await recordOf(proposal))['resolution'] as Record<string, unknown>)['by'] as unknown[]
    expect(after.length, 'nothing was written').toBe(before.length)
  })

  it('refuses a record that is not a decision, and says what settles a fork instead', async () => {
    const said = await chooseAgain(AS_THE_PERSON, proposal, OPTIONS[0] as string, 'x')
    expect(said.code).toBe(400)
    expect(said.said).toContain('promote')
  })
})

// ============================================================ 3. what the page draws

describe('the decision’s page', () => {
  function drawn(
    data: Record<string, unknown>,
    supersededBy: { id: string; title: string } | null,
    fork: { id: string; title: string; options: readonly string[] } | null,
  ): string {
    return renderToStaticMarkup(
      h(gv.DecisionGovernance, { recordId: 'x', data, supersededBy, fork, onChanged: () => {} }),
    )
  }

  it('draws both presses on a decision that stands', () => {
    const page = drawn({ option_taken: OPTIONS[0], because: 'because' }, null, {
      id: proposal,
      title: 'the fork',
      options: OPTIONS,
    })
    expect(page).toContain(gv.M83_WORDS.sayMore)
    expect(page).toContain(gv.M83_WORDS.chooseAgain)
  })

  it('draws the words added since, beside the reasoning written with the press', () => {
    const page = drawn(
      {
        option_taken: OPTIONS[0],
        because: 'the port has worked for a month',
        words_since: [{ at: '2026-09-08 10:15', words: 'still right a day later' }],
      },
      null,
      null,
    )
    expect(page).toContain('the port has worked for a month')
    expect(page).toContain('still right a day later')
  })

  it('draws the mark and no press on a decision that was superseded', () => {
    const page = drawn({ option_taken: OPTIONS[0] }, { id: 'newer', title: 'the newer one' }, {
      id: proposal,
      title: 'the fork',
      options: OPTIONS,
    })
    expect(page).toContain(gv.M83_WORDS.superseded)
    expect(page, 'the way to the one that stands').toContain('the newer one')
    expect(page, 'and no press: the presses are on the one that stands').not.toContain(gv.M83_WORDS.sayMore)
    expect(page).not.toContain(gv.M83_WORDS.chooseAgain)
  })

  it('says a decision written on its own has no options to draw again', () => {
    const page = drawn({ option_taken: 'something' }, null, null)
    expect(page).toContain(gv.M83_WORDS.noForkSays)
  })

  /**
   * WHAT THE HANDBACK PICTURE FOUND on 7 September 2026: not one class this panel draws had a rule,
   * so the stamp and the words the person wrote after it ran together — "just nowStill right a day later" —
   * at every width and in both themes. A class with no rule draws whatever happens to be set around
   * it, which is a thing no test was watching.
   *
   * IT READS THE STYLESHEET THE MARKUP CARRIES and not the source file, so it measures what a
   * browser is actually handed. The boundary in the pattern matters: `.px-gov-since` is a prefix of
   * `.px-gov-since-row`, and a plain substring test would call the second one covered by the first.
   */
  it('gives every class it draws a rule of its own, so no line leans on what happens to be around it', () => {
    const page = drawn(
      {
        option_taken: OPTIONS[0],
        because: 'the port has worked for a month',
        words_since: [{ at: '2026-09-08 10:15', words: 'still right a day later' }],
      },
      { id: 'newer', title: 'the newer one' },
      null,
    )
    const sheet = page.slice(page.indexOf('<style'), page.indexOf('</style>'))
    expect(sheet.length, 'the stylesheet travels with the markup').toBeGreaterThan(1000)
    const drawnClasses = [...page.matchAll(/class="([^"]*)"/g)]
      .flatMap((m) => (m[1] ?? '').split(/\s+/))
      .filter((one) => one.startsWith('px-gov-'))
    expect(drawnClasses.length, 'the panel draws classes of its own').toBeGreaterThan(4)
    const noRule = [...new Set(drawnClasses)].filter(
      (one) => !new RegExp(`\\.${one}(?![-\\w])`).test(sheet),
    )
    expect(noRule, 'every class this panel draws is dressed by a rule').toEqual([])
  })
})
