// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S NAME CHANGES, AS ITS PAGE DRAWS THEM. Item 42 of wave 13s (round 192).
 *
 * `TheAgentRenames` in src/web/components/AgentRenames.tsx is drawn here from readings written in the shape
 * GET /api/participants/agent/:id/renames sends, with no server. What is measured:
 *
 *   (a) the new name that waits is drawn with who proposed it, the reason and whom it waits for, and for a reader who
 *       may answer it the two presses, with no box for a reason until a press asks for one;
 *   (b) a reader who may not answer gets no press;
 *   (c) the person's own rename is drawn as theirs, with the words that say no reason was given where they gave none,
 *       and a refusal is drawn with both reasons;
 *   (d) an agent never renamed draws nothing.
 *
 * EVERY SENTENCE IS READ FROM THE WORDS THE COMPONENT DRAWS WITH (the agentRenames keys of
 * src/shared/words/en-wave-13s.ts), filled with this file's made-up names and the time as `drawnStamp` draws it, and
 * compared with the page's text. So a sentence reworded there is reworded here, and only a wrong fact or a missing
 * sentence turns this red.
 *
 * THE MUTATIONS THAT TURN THIS RED, AFTER A CONTROL RUN:
 *
 *   1. In `TheWaitingRename`, draw the presses whatever `mayNot` says → (b) goes red.
 *   2. In `AnEarlierRename`, draw an empty string for the person's own rename with no reason → (c) goes red.
 *   3. In `TheAgentRenames`, drop the early return for an empty list → (d) goes red.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ARename, TheRenamesOfAnAgent } from '../src/shared/agent-renames.ts'
import { t } from '../src/shared/i18n.ts'
import { drawnStamp } from '../src/shared/time.ts'

// src/web/api.ts reads window.localStorage when it is imported. This is the smallest stand-in that lets the component
// load; nothing in it is under test.
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

let drawer: typeof import('../src/web/components/AgentRenames.tsx')

beforeAll(async () => {
  drawer = await import('../src/web/components/AgentRenames.tsx')
})

const THE_PERSON_NAMED = { kind: 'person' as const, id: 'made-up-person', name: 'A made-up person' }
const A_SECRETARY = { kind: 'agent' as const, id: 'made-up-secretary', name: 'A made-up secretary' }
const THE_AGENT = { kind: 'agent' as const, id: 'made-up-agent', name: 'A made-up agent' }

function aRename(over: Partial<ARename>): ARename {
  return {
    id: 'made-up-rename',
    agent: THE_AGENT.id,
    way: 'proposed',
    oldName: 'Old made-up name',
    newName: 'New made-up name',
    proposedBy: THE_AGENT,
    proposedBecause: 'A made-up reason to propose.',
    proposedAt: '2026-11-01 10:00:00',
    approver: A_SECRETARY,
    toldMessage: 'made-up-message',
    answer: null,
    answeredBy: null,
    answeredBecause: null,
    answeredAt: null,
    answeredUnderTheGrant: null,
    ...over,
  }
}

/** The page's text as a reader reads it: no style, no tags, and the characters the markup escapes as they are written. */
function drawn(reading: TheRenamesOfAnAgent): string {
  return renderToStaticMarkup(h(drawer.TheAgentRenames, { reading, inspect: false, onAnswered: () => {} }))
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
}

const NAMES = { oldName: aRename({}).oldName, newName: aRename({}).newName }

describe('the new name that waits', () => {
  it('(a) names who proposed it, the reason and whom it waits for, and gives a reader who may answer two presses', () => {
    const rename = aRename({})
    const reading = { agent: THE_AGENT.id, renames: [rename], waiting: { rename: rename.id, whyTheCallerMayNotAnswer: null } }
    const page = drawn(reading)
    expect(page).toContain(t('agentRenames.waits', NAMES))
    expect(page).toContain(t('agentRenames.proposedBy', { who: THE_AGENT.name, when: drawnStamp(rename.proposedAt) }))
    expect(page).toContain(t('agentRenames.reason', { because: String(rename.proposedBecause) }))
    expect(page).toContain(t('agentRenames.waitsFor', { who: A_SECRETARY.name }))
    expect(page).toContain(t('agentRenames.approve'))
    expect(page).toContain(t('agentRenames.refuse'))
    const markup = renderToStaticMarkup(h(drawer.TheAgentRenames, { reading, inspect: false, onAnswered: () => {} }))
    expect(markup, 'a box for the reason is drawn before a press asks for one').not.toContain('<textarea')
  })

  it('(b) gives a reader who may not answer no press', () => {
    const page = drawn({
      agent: THE_AGENT.id,
      renames: [aRename({})],
      waiting: { rename: 'made-up-rename', whyTheCallerMayNotAnswer: 'A made-up sentence saying who may answer.' },
    })
    expect(page).toContain(t('agentRenames.waitsFor', { who: A_SECRETARY.name }))
    expect(page).not.toContain(t('agentRenames.approve'))
    expect(page).not.toContain(t('agentRenames.refuse'))
  })
})

describe('the earlier name changes', () => {
  it('(c) draws the person\'s own rename as theirs, with no reason given, and a refusal with both reasons', () => {
    const page = drawn({
      agent: THE_AGENT.id,
      renames: [
        aRename({
          id: 'made-up-at-once',
          way: 'at once',
          proposedBy: THE_PERSON_NAMED,
          proposedBecause: null,
          approver: THE_PERSON_NAMED,
          toldMessage: null,
          answer: 'approved',
          answeredBy: THE_PERSON_NAMED,
          answeredAt: '2026-11-01 11:00:00',
        }),
        aRename({
          id: 'made-up-refused',
          answer: 'refused',
          answeredBy: A_SECRETARY,
          answeredBecause: 'A made-up reason to refuse.',
          answeredAt: '2026-11-01 10:30:00',
        }),
      ],
      waiting: null,
    })
    expect(page).toContain(t('agentRenames.atOnce', { who: THE_PERSON_NAMED.name, when: drawnStamp('2026-11-01 11:00:00'), ...NAMES }))
    expect(page).toContain(t('agentRenames.noReason'))
    expect(page).toContain(t('agentRenames.refused', { when: drawnStamp('2026-11-01 10:30:00'), ...NAMES }))
    expect(page).toContain(t('agentRenames.proposedWith', { who: THE_AGENT.name, because: 'A made-up reason to propose.' }))
    expect(page).toContain(t('agentRenames.refusedBy', { who: A_SECRETARY.name, because: 'A made-up reason to refuse.' }))
    expect(page).not.toContain(t('agentRenames.approve'))
  })

  it('(d) draws nothing for an agent never renamed', () => {
    expect(drawn({ agent: THE_AGENT.id, renames: [], waiting: null })).toBe('')
  })
})
