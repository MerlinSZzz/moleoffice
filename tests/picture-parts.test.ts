// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE SET OF PICTURE PARTS FOR HOME. A figure on home is a data entry: which read answers it, a small function that
 * turns the answer into one plain shape, which part draws it, and its label. A part takes the shape and nothing else,
 * so a new figure needs no new part code.
 *
 * The cases hold four things:
 *
 *   two different reads in one part   the packages by state and the agents by presence are both drawn by the bars,
 *                                     and each draws its own rows and numbers;
 *   the words of a part with no data  every part says in words, read by t(), that its data is being read, could not be
 *                                     read, or was recorded by nobody;
 *   a zero is not "not recorded"      a zero is drawn as the number 0, and a figure nobody recorded is drawn as words
 *                                     and no number;
 *   no colour of a part's own         the markup holds no colour.
 *
 * The runner's environment is node, so the parts are rendered to static markup, with a window stand-in installed
 * before anything that reads it is loaded, as tests/home-agent-bars.test.ts does.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { count, t } from '../src/shared/i18n.ts'
import type { PartDataByName, PartName, PartState } from '../src/shared/picture-parts.ts'
import type { ProjectProgress } from '../src/shared/progress.ts'
import type { HomeRoster } from '../src/server/lib/working.ts'

type Parts = typeof import('../src/web/components/picture-parts/parts.tsx')
type Figures = typeof import('../src/web/components/picture-parts/figures.tsx')
let parts: Parts
let figures: Figures

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
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  parts = await import('../src/web/components/picture-parts/parts.tsx')
  figures = await import('../src/web/components/picture-parts/figures.tsx')
})

const LABEL = 'Made-up figure'
const REASON = 'made-up reason'

/** A made-up answer of the progress read: briefs in five of the six places, none handed back, one it could not read. */
const PROGRESS: ProjectProgress = {
  line: null,
  points: { total: 0, todo: 0, doing: 0, done: 0, dropped: 0, noState: 0, inNoBrief: 0, carriedThreeBriefs: 0 },
  briefs: { total: 9, waiting: 3, taken: 2, aligned: 1, handedBack: 0, returned: 1, done: 2, checkedRefused: 0 },
  couldNotRead: [{ recordId: 'made-up-brief', title: 'Made-up brief', because: 'made-up because' }],
  says: 'Made-up sentence.',
}

type Presence = HomeRoster['rows'][number]['presence']['presence']
function agent(id: string, presence: Presence): HomeRoster['rows'][number] {
  return { agentId: `made-up-agent-record-${id}`, participant: { id: `made-up-participant-${id}`, name: `Made-up agent ${id}`, startedBy: null }, presence: { presence }, doingFrom: null }
}
/** A made-up answer of the roster read: two agents online, one stale, none offline and one inactive. */
const ROSTER: HomeRoster = {
  workspaceId: 'made-up-project',
  computedAt: '2026-11-20 09:00:00',
  rows: [agent('a', 'online'), agent('b', 'online'), agent('c', 'stale'), agent('d', 'inactive')],
  counts: { agents: 4, active: 4, retired: 0 },
  note: '',
}

/** Every part's data at zero, or for the card of text, which holds no number, a title and a text. */
const AT_ZERO: { [P in PartName]: PartDataByName[P] } = {
  'big-number': { value: 0, unit: null },
  bars: { rows: [{ label: 'Made-up row', value: 0 }] },
  progress: { done: 0, total: 4 },
  table: { columns: ['Made-up column'], rows: [[0]] },
  'line-over-days': { points: [{ day: '2026-11-19', value: 0 }, { day: '2026-11-20', value: 0 }] },
  'text-card': { title: 'Made-up title', text: 'Made-up text' },
}
const NUMBER_PARTS: PartName[] = ['big-number', 'bars', 'progress', 'table', 'line-over-days']

type NamedPart = Parameters<Parts['Part']>[0]
function drawn(name: PartName, state: PartState<PartDataByName[PartName]>, label = LABEL): string {
  return renderToStaticMarkup(h(parts.Part, { name, label, state } as NamedPart))
}
function partNames(): PartName[] {
  return Object.keys(parts.PARTS) as PartName[]
}

/** Each bar's label and the number at its end, in the order drawn. */
function barsOf(html: string): [string, number][] {
  return [...html.matchAll(/<li class="pp-bar-row"[^>]*>(.*?)<\/li>/g)].map(([, row = '']): [string, number] => {
    const label = /class="pp-bar-label">([^<]*)</.exec(row)
    const value = /data-bar-value="(\d+)"/.exec(row)
    expect(label, `a bar draws no label: ${row}`).not.toBeNull()
    expect(value, `a bar draws no number: ${row}`).not.toBeNull()
    return [label?.[1] ?? '', Number(value?.[1])]
  })
}

/** The text a reader sees, with the marks and their attributes taken away. */
function textOf(html: string): string {
  return html.replace(/<style[^>]*>.*?<\/style>/gs, '').replace(/<[^>]*>/g, '')
}

describe('two different reads in the same part', () => {
  it('draws the packages by state and the agents by presence with the bars, each with its own rows and numbers', () => {
    const { PACKAGES_BY_STATE, AGENTS_BY_PRESENCE } = figures
    expect(PACKAGES_BY_STATE.part).toBe('bars')
    expect(AGENTS_BY_PRESENCE.part).toBe('bars')
    expect(PACKAGES_BY_STATE.read).not.toBe(AGENTS_BY_PRESENCE.read)

    const packages = drawn(PACKAGES_BY_STATE.part, PACKAGES_BY_STATE.shape(PROGRESS), t(PACKAGES_BY_STATE.label))
    expect(packages).toContain(`>${t(PACKAGES_BY_STATE.label)}<`)
    expect(barsOf(packages)).toEqual([
      [t('progressCard.waiting'), 3],
      [t('progressCard.taken'), 2],
      [t('progressCard.aligned'), 1],
      [t('progressCard.handedBack'), 0],
      [t('progressCard.returned'), 1],
      [t('progressCard.done'), 2],
      [t('pictureParts.figure.packagesUnread'), 1],
    ])

    const agents = drawn(AGENTS_BY_PRESENCE.part, AGENTS_BY_PRESENCE.shape(ROSTER), t(AGENTS_BY_PRESENCE.label))
    expect(agents).toContain(`>${t(AGENTS_BY_PRESENCE.label)}<`)
    expect(barsOf(agents)).toEqual([
      [t('home.agentPresence.online'), 2],
      [t('home.agentPresence.stale'), 1],
      [t('home.agentPresence.offline'), 0],
      [t('home.agentPresence.inactive'), 1],
    ])
  })

  it('draws no row for the briefs it could not read when it could read them all', () => {
    const allRead = figures.PACKAGES_BY_STATE.shape({ ...PROGRESS, couldNotRead: [] })
    const html = drawn('bars', allRead)
    expect(barsOf(html).map(([label]) => label)).not.toContain(t('pictureParts.figure.packagesUnread'))
  })

  it('turns a read still waiting into loading, a failed read into missing with its reason, and an answer into its shape', () => {
    const shape = figures.AGENTS_BY_PRESENCE.shape
    expect(figures.theStateOf({ status: 'loading' }, shape)).toEqual({ status: 'loading' })
    expect(figures.theStateOf({ status: 'error', message: REASON }, shape)).toEqual({ status: 'missing', reason: REASON })
    expect(figures.theStateOf({ status: 'ready', value: ROSTER }, shape)).toEqual(shape(ROSTER))
  })
})

describe('the words of a part with no data', () => {
  it('says in each part that its data is being read', () => {
    for (const name of partNames()) {
      const html = drawn(name, { status: 'loading' })
      expect(html, name).toContain(`>${LABEL}<`)
      expect(html, name).toContain('role="status"')
      expect(html, name).toContain(t('pictureParts.reading'))
      expect(html, name).not.toContain(t('pictureParts.notRead'))
      expect(html, name).not.toContain(t('pictureParts.notRecorded'))
    }
  })

  it('says in each part that its data could not be read, with the reason', () => {
    for (const name of partNames()) {
      const html = drawn(name, { status: 'missing', reason: REASON })
      expect(html, name).toContain(`>${LABEL}<`)
      expect(html, name).toContain(t('pictureParts.notRead'))
      expect(html, name).toContain(REASON)
      expect(html, name).not.toContain(t('pictureParts.reading'))
      expect(html, name).not.toContain(t('pictureParts.notRecorded'))
    }
  })

  it('says in each part that nobody recorded its data', () => {
    for (const name of partNames()) {
      const html = drawn(name, { status: 'not-recorded' })
      expect(html, name).toContain(`>${LABEL}<`)
      expect(html, name).toContain(t('pictureParts.notRecorded'))
      expect(html, name).not.toContain(t('pictureParts.reading'))
      expect(html, name).not.toContain(t('pictureParts.notRead'))
    }
  })

  it('says none where a list holds no row', () => {
    const html = drawn('bars', { status: 'ready', data: { rows: [] } })
    expect(html).toContain(t('absence.none'))
    expect(barsOf(html)).toEqual([])
  })
})

describe('a zero is not "not recorded"', () => {
  it('draws a zero as the number 0 and a figure nobody recorded as words with no number', () => {
    for (const name of NUMBER_PARTS) {
      const zero = drawn(name, { status: 'ready', data: AT_ZERO[name] })
      expect(zero, name).toContain(`>${count(0)}<`)
      expect(zero, name).not.toContain(t('pictureParts.notRecorded'))
      const nobody = drawn(name, { status: 'not-recorded' })
      expect(textOf(nobody), name).not.toMatch(/\d/)
    }
  })

  it('draws a cell and a day nobody recorded as no number, beside a zero', () => {
    const table = drawn('table', { status: 'ready', data: { columns: ['Made-up column', 'Made-up count'], rows: [['Made-up row', null], ['Made-up other row', 0]] } })
    expect(textOf(table)).toContain(t('absence.mark'))
    expect(table).toContain(`>${count(0)}<`)
    const line = drawn('line-over-days', { status: 'ready', data: { points: [{ day: '2026-11-19', value: 0 }, { day: '2026-11-20', value: null }] } })
    // The last day is the one nobody recorded, so the number drawn for it is the dash and not the 0 of the day before.
    const last = textOf(/<p class="pp-line-last"[^>]*>.*?<\/p>/s.exec(line)?.[0] ?? '')
    expect(last).toContain(t('absence.mark'))
    expect(last).not.toMatch(/\d/)
  })
})

describe('no colour of a part\'s own', () => {
  // A named colour is a word of its own: white in white-space is not one.
  const COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(|(?<![\w-])(?:white|black|red|green|blue|gr[ae]y|orange|yellow|purple|pink|brown|silver|navy|teal|maroon|olive|lime|aqua|fuchsia|cyan|magenta|gold|indigo|violet)(?![\w-])/i

  it('writes no colour in the markup of any part, in any state', () => {
    const states: PartState<PartDataByName[PartName]>[] = [{ status: 'loading' }, { status: 'missing', reason: REASON }, { status: 'not-recorded' }]
    for (const name of partNames()) {
      for (const state of [...states, { status: 'ready' as const, data: AT_ZERO[name] }]) {
        const html = drawn(name, state).replace(/<style[^>]*>.*?<\/style>/gs, '')
        for (const [, attribute = '', value = ''] of html.matchAll(/\s(fill|stroke|color|bgcolor|style)="([^"]*)"/g)) {
          const left = value.replace(/var\(--[a-z0-9-]+\)/g, '').replace(/\b(?:currentColor|none|transparent|inherit)\b/g, '')
          expect(left, `${name}, ${state.status}: ${attribute}="${value}"`).not.toMatch(COLOUR)
        }
      }
    }
  })
})
