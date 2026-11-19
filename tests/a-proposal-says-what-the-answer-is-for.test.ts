// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PROPOSAL CAN SAY WHAT THE ANSWER WILL BE USED TO DO, AND THE CARD DRAWS THE BLANK WHEN IT DOES NOT.
 *
 * ---------------------------------------------------------------------------------------
 * THE OWNER'S OWN FIELD
 * ---------------------------------------------------------------------------------------
 *
 * *"A Proposal should make the human answer, explicitly or structurally: Result will be used to:
 * ______"*. A fork whose answer nobody would act on is a fork worth not asking, and that is only
 * visible if the question is asked while the fork is being written and the blank is drawn on the
 * card afterwards.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED, AND IN WHICH DIRECTION
 * ---------------------------------------------------------------------------------------
 *
 *   · `GET /api/kinds/proposal` serves the field, so an agent filing one is told to answer it by
 *     the same declaration that validates the write. Read from the running route rather than from
 *     the table behind it, because the promise CLAUDE.md makes to agents is about the route.
 *   · A write carrying it is stored, and a write carrying a NEIGHBOURING misspelling is refused —
 *     which is what tells "the field is declared" from "the object took whatever it was sent".
 *   · The card draws what was written, and draws "nobody said" when nothing was.
 */

import { englishWords } from '../src/shared/words/joined.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { sectionsOf } from '../src/web/components/sections.ts'

let db: TestDb
let app: FastifyInstance
type GovernanceModule = typeof import('../src/web/components/Governance.tsx')
let Governance: GovernanceModule

beforeAll(async () => {
  db = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  // The browser half needs a window stand-in before the component tree is imported, exactly as
  // tests/shell-nav.test.ts describes. Nothing in it is under test.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  Governance = await import('../src/web/components/Governance.tsx')
})

afterAll(async () => {
  await app.close()
  db.close()
})

const AS_AGENT = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'content-type': 'application/json',
}

const bodyOf = (res: { body: string }): Record<string, unknown> => JSON.parse(res.body) as Record<string, unknown>

/** The panel as markup, without its stylesheet: a class name in CSS is not words on a screen. */
function card(data: Record<string, unknown>): string {
  const html = renderToStaticMarkup(
    h(Governance.ProposalGovernance, {
      recordId: 'p1',
      title: 'where does a plan belong?',
      data,
      resolved: false,
      // WHICH SECTION EACH PART DRAWS, from the same reader the record page builds. This fixture
      // has no envelope summary and no links, and `null` and `[]` say so.
      sections: sectionsOf({
        id: 'p1',
        kind: 'proposal',
        data,
        title: 'where does a plan belong?',
        summary: null,
        relations: [],
      }),
      onSettled: () => {},
    }),
  )
  return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '')
}

// ============================================================ the declaration

describe('the field is declared where a write is validated', () => {
  it('is served by GET /api/kinds/proposal, with what to write in it', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/kinds/proposal' })
    expect(res.statusCode).toBe(200)
    const kind = bodyOf(res)['kind'] as { fields: { key: string; required: boolean; description: string }[] }
    const field = kind.fields.find((f) => f.key === Governance.RESULT_WILL_BE_USED_TO)
    if (field === undefined) throw new Error('a proposal no longer declares what its answer will be used to do')
    // ASKED FOR, NOT REQUIRED. A fork somebody has already reached is worth filing whether or not
    // the writer can phrase what the answer will be spent on; a required field would make the queue
    // shorter by refusing the hardest ones.
    expect(field.required).toBe(false)
    expect(field.description.toLowerCase()).toContain('used to do')
  })

  it('stores what was written, through the ordinary write path', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_AGENT,
      payload: {
        kind: 'proposal',
        title: 'where does a plan belong',
        data: {
          question: 'Should a plan live in a project, or above every project?',
          options: ['In a project: simple, and a plan that spans two has nowhere to go.', 'Above: one place, and every list has to say which.'],
          resultWillBeUsedTo: 'Unblock the plans page: the answer decides which list it reads.',
        },
      },
    })
    expect(res.statusCode).toBe(201)
    const stored = (bodyOf(res)['record'] as { data: Record<string, unknown> }).data
    expect(stored['resultWillBeUsedTo']).toBe('Unblock the plans page: the answer decides which list it reads.')
  })

  it('refuses a neighbouring spelling, which is what tells a declared field from an open bag', async () => {
    // WITHOUT THIS THE TEST ABOVE PROVES NOTHING. A record that took whatever it was sent would
    // store `result_will_be_used_to` just as happily, and the field would be a convention rather
    // than a declaration.
    const res = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_AGENT,
      payload: {
        kind: 'proposal',
        title: 'a fork with a misspelt field',
        data: { question: 'q?', options: ['a', 'b'], result_will_be_used_to: 'nothing' },
      },
    })
    expect(res.statusCode).toBe(400)
    expect(String(bodyOf(res)['error'])).toContain('result_will_be_used_to')
  })
})

// ============================================================ the card

describe('the decision card', () => {
  const FORK = {
    question: 'Should a plan live in a project, or above every project?',
    options: ['In a project.', 'Above every project.'],
  }

  it('draws what the answer will be used to do, where the person deciding will read it', () => {
    const html = card({ ...FORK, resultWillBeUsedTo: 'Unblock the plans page.' })
    expect(html).toContain('Result will be used to')
    expect(html).toContain('Unblock the plans page.')
  })

  it('draws the blank when nobody said, rather than leaving the row out', () => {
    // AN ABSENT ANSWER IS THE POINT OF THE FIELD. Drawing the row only when it is filled in would
    // hide exactly the forks worth not asking, which is what it exists to make visible.
    const html = card(FORK)
    expect(html).toContain('Result will be used to')
    expect(html).toContain(englishWords()['decisions.noUse'])
    // "nobody looked", not "there is none": Mole Office never fills this in, and an empty one is not an
    // answer that the result is for nothing.
    expect(html).toContain('data-edge="dashed"')
  })

})

// ============================================================ one card, one file

