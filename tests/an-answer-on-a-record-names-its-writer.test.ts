// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ANSWER ON A RECORD'S LINK LIST NAMES ITS WRITER AND MOMENT.
 *
 * This follows a requirement row. A `realises` or `instead_of` link is
 * an answer to a plan, and the
 * record page's link list is the other place the same stored row is drawn. This file draws the
 * panel with made-up links and no server, so the row can be read without a browser.
 *
 * MUTATIONS, each one product line, proved after a green control and restored:
 *   - the answer line removed from `LinkRow`: the writer-and-moment case goes red;
 *   - the missing-writer fallback replaced by a guessed name: the no-guess case goes red.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'

import type { GatedLink } from '../src/shared/types.ts'
import type { ParticipantsNamed } from '../src/web/lib/participant-lookup.ts'

let lp: typeof import('../src/web/components/LinkPanel.tsx')

beforeEach(async () => {
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  lp = await import('../src/web/components/LinkPanel.tsx')
})

const PARTICIPANTS: ParticipantsNamed = {
  people: [],
  agents: [
    { id: 'agent-perception', handle: 'perception', name: 'Perception' },
    { id: 'agent-kiln', handle: 'kiln', name: 'Kiln' },
  ],
}

function link(over: Partial<GatedLink>): GatedLink {
  return {
    linkId: 'l1',
    type: 'realises',
    label: 'realises',
    isBacklink: false,
    inferred: false,
    other: { id: 'r2', kind: 'task', title: 'Reprint the jaw', summary: null, origin: 'authored' },
    broken: false,
    gate: null,
    gateLabel: null,
    gateProblem: null,
    gateStage: null,
    ...over,
  }
}

/** The panel's markup, with the hoisted style block taken out so CSS cannot stand in as evidence. */
function drawn(links: GatedLink[]): string {
  return renderToStaticMarkup(
    h(lp.LinkPanel, {
      declares: { about: { kind: 'region', recordId: 'r1', regionId: 'section.links' } },
      kind: 'task' as const,
      recordId: 'r1',
      links,
      knownTitles: [],
      participants: PARTICIPANTS,
      editable: false,
      onChanged: () => undefined,
    }),
  ).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

describe('an answer on a record page', () => {
  it('names the writer and the moment the link row stores, and only for the answering types', () => {
    const markup = drawn([
      link({ linkId: 'l1', type: 'realises', createdAt: '2026-09-01 09:00:00', createdBy: 'perception', createdByType: 'agent' }),
      link({
        linkId: 'l2',
        type: 'instead_of',
        label: 'instead of',
        other: { id: 'r3', kind: 'task', title: 'Polish the jaw', summary: null, origin: 'authored' },
        createdAt: '2026-09-03 11:00:00',
        createdBy: 'kiln',
        createdByType: 'agent',
      }),
      link({
        linkId: 'l3',
        type: 'consumes',
        label: 'consumes',
        other: { id: 'r4', kind: 'task', title: 'A material', summary: null, origin: 'authored' },
        createdAt: '2026-09-04 12:00:00',
        createdBy: 'perception',
        createdByType: 'agent',
      }),
    ])
    expect(markup.match(/class="lp-answer"/g)).toHaveLength(2)
    expect(markup).toContain('by Perception')
    expect(markup).toContain('by Kiln')
    expect(markup).toContain('dateTime="2026-09-01 09:00:00"')
    expect(markup).toContain('dateTime="2026-09-03 11:00:00"')
    // The link type is still said by the row's own mark, and the consuming link says no writer.
    expect(markup).toContain('realises')
    expect(markup).toContain('instead of')
  })

  it('says the writer or the moment is not recorded, and never guesses at either', () => {
    const markup = drawn([
      link({ linkId: 'l1', type: 'realises' }),
      link({ linkId: 'l2', type: 'instead_of', label: 'instead of', createdAt: '', createdBy: 'perception', createdByType: null }),
    ])
    expect(markup.match(/class="lp-answer"/g)).toHaveLength(2)
    expect(markup.match(/who wrote this is not recorded/g)).toHaveLength(2)
    expect(markup.match(/when it was written is not recorded/g)).toHaveLength(2)
    expect(markup).not.toContain('Perception')
    expect(markup).not.toContain('Kiln')
  })
})
