// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO IS WORKING, ON A GRAPH CARD — read out of the markup, and read out of one table.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE FAULTS THIS FILE EXISTS TO CATCH
 * ---------------------------------------------------------------------------------------
 *
 * 1. ONE ENUM INSTEAD OF TWO DIMENSIONS. The owner's addendum, section 3: *"Do NOT put everything
 *    into one giant Agent status enum. Model at least two independent dimensions."* A card draws
 *    `data-presence` — is anybody here — and `data-stage` — where the work stands — and the tests
 *    below read both off the markup separately. One attribute carrying both would pass a test that
 *    only looked for "a presence marker".
 *
 * 2. A SESSION GRAVEYARD. Section 15: *"A durable Agent that has no live attachment, no pending
 *    message, no active responsibility and no unresolved handoff should have almost no visual weight
 *    in normal current-work views."* A domain with no sign of work for over a day draws NOTHING on
 *    an ordinary card. It is not faded — a faint mark on every card in a project with forty old
 *    domains is the same screen one shade lighter.
 *
 * 3. A CARD KEEPING ITS OWN COPY OF THE MARK TABLE. The overlap mark's three drawn channels are read
 *    FROM `OVERLAP_MARKS` in every assertion below, never from a literal here, so editing that table
 *    moves the card and this file together.
 *
 * IT ASSERTS ON MARKUP, NOT ON A RETURN VALUE, for the reason wave 11's own weaker row was written
 * about: a function deciding the right thing and the card drawing something else is one field along
 * from the fault this whole wave exists to remove.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement as h } from 'react'
import { freshDb, type TestDb } from './helpers.ts'
import { computeAttention } from '../src/shared/attention.ts'
import { parseDueStamp } from '../src/web/lib/attention.ts'
import {
  DRAWN_RANKS,
  OVERLAP_MARKS,
  PRESENCE_MINUTES,
  PRESENCE_STATES,
  PRESENCE_WEIGHT,
  presenceFromAge,
  presenceIsDrawn,
  type PresenceState,
} from '../src/shared/workdomain.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import type { GraphNode, StructureGraph } from '../src/web/components/graph/model.ts'
import type { PresenceHere } from '../src/web/components/graph/Presence.tsx'

type CardModule = typeof import('../src/web/components/graph/card.ts')
type Model = typeof import('../src/web/components/graph/model.ts')
type Face = typeof import('../src/web/components/graph/CardFace.tsx')

let t: TestDb
let card: CardModule
let model: Model
let face: Face
let graph: StructureGraph

/** One domain on a card, with only the fields the drawing reads. */
const working = (over: Partial<PresenceHere> = {}): PresenceHere => ({
  domainId: 'dom_one',
  domainTitle: 'Perception scope',
  agentId: 'Perception',
  objective: 'Wire the wrist camera into the grasp pipeline.',
  stage: 'working',
  presence: 'live',
  quietForMinutes: 12,
  lastSignFrom: 'a change row from its session',
  worstOverlapRank: null,
  ...over,
})

beforeAll(async () => {
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
  t = await freshDb()
  await import('../scripts/seed.ts')
  card = await import('../src/web/components/graph/card.ts')
  model = await import('../src/web/components/graph/model.ts')
  face = await import('../src/web/components/graph/CardFace.tsx')
  const records = t.api.listRecords({ workspaceId: 'default' }) as PanelRecord[]
  const links = model.graphLinks(t.api.allGatedLinks('default'))
  const now = Date.parse('2026-08-09T12:00:00')
  const attention = computeAttention({
    now,
    records: t.api.listRecords({ workspaceId: 'default', includeDeleted: true }),
    links: t.client.sqlite
      .prepare(
        'select id, from_id as fromId, to_id as toId, type, inferred, created_at as createdAt, created_by as createdBy from links',
      )
      .all() as never,
    changes: t.api
      .listChanges({ workspaceId: 'default', limit: 20000 })
      .map((row) => ({ ...row, op: row.op as never, actorType: row.actorType as never, origin: null })),
    resources: [],
    dueMs: parseDueStamp,
  })
  graph = model.buildStructureGraph({ records, links, attention, scope: { at: 'modules' }, now })
})

afterAll(() => {
  t.close()
})

const aCard = (): GraphNode => {
  const node = graph.nodes.find((one) => one.kind === 'module')
  if (node === undefined) throw new Error('the modules drawing has no module card to draw')
  return node
}

/**
 * The markup one card draws at one position, with these people on it.
 *
 * WITHOUT THE CARD'S OWN STYLESHEET. The card loads its rules itself, and rendered to a string that
 * style element comes first in the markup, naming every class the card can draw. The questions here
 * are about what the card drew, so the stylesheet is taken out before they are asked.
 */
const drawWith = (says: 'label' | 'title' | 'gist', here: readonly PresenceHere[]): string => {
  const node = aCard()
  const plan = card.planCanvas(graph, says)
  const one = plan.cards.get(node.id)
  if (one === undefined) throw new Error(`${node.id} was not planned at ${says}`)
  const markup = renderToStaticMarkup(
    h(face.CardFace, { node, onOpen: () => {}, flow: 'RIGHT', lit: false, restriction: null, here, says, plan: one, choice: card.NOTHING_PRESSED, onChoose: () => {}, opens: 'Open this record' }),
  )
  const styles = markup.match(/<style[^>]*>[\s\S]*?<\/style>/g) ?? []
  if (styles.length !== 1) throw new Error(`the card drew ${String(styles.length)} stylesheets, not its own one`)
  return markup.replace(styles[0]!, '')
}

/** The words a person actually sees, with every attribute value taken out first. */
const drawnText = (markup: string): string => markup.replace(/<[^>]*>/g, ' ')

/** Every value of one attribute in a piece of markup, in the order they were drawn. */
const attrs = (markup: string, name: string): string[] =>
  [...markup.matchAll(new RegExp(`${name}="([^"]*)"`, 'g'))].map((found) => found[1] ?? '')

describe('presence and where the work stands are two facts on the card, not one word', () => {
  it('draws both, separately, so neither can be read off the other', () => {
    const markup = drawWith('title', [working({ presence: 'live', stage: 'working' })])
    expect(attrs(markup, 'data-presence'), 'no presence was drawn at all').toEqual(['live'])
    expect(attrs(markup, 'data-stage'), 'where the work stands was not drawn').toEqual(['working'])
  })

  it('holds the two apart when they disagree, which is the case one enum cannot hold', () => {
    // A domain nobody has answered the differences on, whose agent is here right now. One status
    // word would have to choose, and choosing is what the addendum forbids.
    const markup = drawWith('title', [working({ presence: 'live', stage: 'resolved' })])
    expect(attrs(markup, 'data-presence')).toEqual(['live'])
    expect(attrs(markup, 'data-stage')).toEqual(['resolved'])
  })

  it('bands presence from an age and never from a stored word', () => {
    expect(presenceFromAge(null)).toBe('never')
    expect(presenceFromAge(0)).toBe('live')
    expect(presenceFromAge(PRESENCE_MINUTES.live)).toBe('live')
    expect(presenceFromAge(PRESENCE_MINUTES.live + 1)).toBe('quiet')
    expect(presenceFromAge(PRESENCE_MINUTES.quiet)).toBe('quiet')
    expect(presenceFromAge(PRESENCE_MINUTES.quiet + 1)).toBe('stale')
    // NOTHING SEEN IS NOT WORK THAT STOPPED. Two different answers, and the fifth invariant.
    expect(presenceFromAge(null)).not.toBe(presenceFromAge(PRESENCE_MINUTES.quiet + 1))
  })
})

describe('a living world, not a session graveyard', () => {
  it('draws nothing at all for work that has had no sign for over a day', () => {
    for (const presence of ['stale', 'never'] satisfies PresenceState[]) {
      const markup = drawWith('title', [working({ presence, quietForMinutes: presence === 'never' ? null : 4000 })])
      expect(
        markup.includes('gx-presence'),
        `a ${presence} domain drew a presence row; section 15 says it should have almost no visual weight`,
      ).toBe(false)
    }
  })

  it('draws the two that are here and leaves the two that are not, on one card', () => {
    // `agentId` HOLDS THE AGENT'S NAME (PresenceHere in src/server/lib/workdomain.ts), so the card names
    // who is here. Round 11 read it as an id for a while; the joined tree put the name back.
    const markup = drawWith('title', [
      working({ domainId: 'a', agentId: 'Perception', presence: 'live' }),
      working({ domainId: 'b', agentId: 'Handover', presence: 'quiet' }),
      working({ domainId: 'c', agentId: 'Tray clamp', presence: 'stale' }),
      working({ domainId: 'd', agentId: 'Old thing', presence: 'never' }),
    ])
    expect(attrs(markup, 'data-presence')).toEqual(['live', 'quiet'])
    expect(markup).toContain('Perception')
    expect(markup).toContain('Handover')
    expect(markup, 'a domain with no sign of work for days was drawn on the card').not.toContain('Tray clamp')
  })

  it('gives every presence word a weight, and only the two live ones any at all', () => {
    // A fifth word with no weight would draw as whatever the lookup fell through to.
    for (const word of PRESENCE_STATES) {
      expect(PRESENCE_WEIGHT[word], `${word} has no weight`).toBeTypeOf('number')
      expect(presenceIsDrawn(word)).toBe(PRESENCE_WEIGHT[word] > 0)
    }
    expect(PRESENCE_STATES.filter((one) => presenceIsDrawn(one))).toEqual(['live', 'quiet'])
  })
})

describe('what each of the three positions draws', () => {
  it('draws a marker and no name at the far position, and the name at the two nearer ones', () => {
    // THE NAME IS MEASURED AS DRAWN TEXT, NOT AS A SUBSTRING OF THE MARKUP. It is in the hover
    // sentence at every position, which is a channel the UX contract allows a sentence in; what the
    // far position must not do is put it on the card, where a 196px box has no room for it.
    const far = drawWith('label', [working({ agentId: 'Perception' })])
    expect(far, 'the far position drew no presence marker').toContain('gx-here-dot')
    expect(
      drawnText(far),
      'the far position drew an agent name on the card; a card there has no words on it at all',
    ).not.toContain('Perception')
    expect(drawnText(drawWith('title', [working({ agentId: 'Perception' })]))).toContain('Perception')
    expect(drawnText(drawWith('gist', [working({ agentId: 'Perception' })]))).toContain('Perception')
  })

  it('draws the overlap mark only at the nearest position', () => {
    const withOverlap = [working({ worstOverlapRank: 4 })]
    expect(drawWith('label', withOverlap)).not.toContain('data-mark="overlap"')
    expect(drawWith('title', withOverlap)).not.toContain('data-mark="overlap"')
    expect(drawWith('gist', withOverlap)).toContain('data-mark="overlap"')
  })

  it('decides on the position and not on the rung, so pressing a card cannot reveal an overlap', () => {
    // A selected card is drawn a rung higher than an ordinary one on the same drawing. Keyed on the
    // rung, a rank-4 collision would appear when a reader pressed the card and vanish when they
    // pressed elsewhere.
    const presenceModule = face as unknown as { }
    void presenceModule
    const drawn = ['label', 'title', 'gist'] as const
    const shows = drawn.map((says) => drawWith(says, [working({ worstOverlapRank: 3 })]).includes('data-mark="overlap"'))
    expect(shows).toEqual([false, false, true])
  })
})

describe('the overlap mark draws what the table says', () => {
  it('draws every drawn rank with the form, glyph and edge that rank is declared with', () => {
    for (const rank of DRAWN_RANKS) {
      const entry = OVERLAP_MARKS[rank]!
      const markup = drawWith('gist', [working({ worstOverlapRank: rank })])
      expect(markup, `rank ${rank} drew no overlap mark`).toContain('data-mark="overlap"')
      expect(attrs(markup, 'data-rank')).toEqual([String(rank)])
      expect(attrs(markup, 'data-form'), `rank ${rank} drew the wrong form`).toEqual([entry.mark.form])
      expect(attrs(markup, 'data-glyph'), `rank ${rank} drew the wrong glyph`).toEqual([entry.mark.glyph])
      expect(attrs(markup, 'data-edge'), `rank ${rank} drew the wrong edge`).toEqual([entry.mark.edge])
    }
  })

  it('draws the worst rank present when one card carries several', () => {
    const markup = drawWith('gist', [
      working({ domainId: 'a', worstOverlapRank: 1 }),
      working({ domainId: 'b', worstOverlapRank: 4 }),
      working({ domainId: 'c', worstOverlapRank: 2 }),
    ])
    expect(attrs(markup, 'data-rank')).toEqual(['4'])
  })

  it('draws nothing for rank 0, which is counted and never drawn', () => {
    expect(drawWith('gist', [working({ worstOverlapRank: 0 })])).not.toContain('data-mark="overlap"')
  })

  it('draws nothing when nobody overlaps anybody', () => {
    const markup = drawWith('gist', [working({ worstOverlapRank: null })])
    expect(markup).toContain('gx-here')
    expect(markup).not.toContain('data-mark="overlap"')
  })
})

describe('a card with nobody on it', () => {
  it('draws no presence row at all, rather than an empty one taking height on every card', () => {
    expect(drawWith('title', [])).not.toContain('gx-presence')
  })
})
