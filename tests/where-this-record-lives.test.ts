// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE MODULE, BLOCK AND PIPELINE PAGES DRAW ABOUT WHERE THEIR CODE IS.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS FILE EXISTS AGAINST
 * ---------------------------------------------------------------------------------------
 *
 * Wave 6 built four tables, twelve routes, two resolvers, a nine-source provenance vocabulary and a
 * governance guard, and an independent verifier then ran `grep -rn 'api/implementation' src/web/`
 * and got NOTHING. The wave's server half was proved to a high standard and no person could see a
 * single row of it. That is the failure this file is against, and it is a silent one: every
 * server-side test goes on passing while the product shows nothing.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT RENDERS
 * ---------------------------------------------------------------------------------------
 *
 * The runner has no DOM, so the component goes through `react-dom/server`, the way
 * `tests/machinery-is-for-developers.test.ts` does — with the same window stand-in, because
 * `src/web/api.ts` and `src/web/lib/mode.ts` both read `window` at module scope.
 *
 * `renderToStaticMarkup` DOES NOT RUN EFFECTS, and `useAsync` fetches in one. A test of the whole
 * panel could therefore only ever photograph its loading state, which is how a surface comes to be
 * "tested" by a test that has never seen a row. So the drawing is `ImplementationRead`, which takes
 * a reply and fetches nothing, and the fixture below is a reply the route really produced against
 * this checkout on 26 August 2026: 2 stated patterns, 1 proposal, 20 candidates of 71 with 51 left
 * out, and the six sources nothing in this build looks with.
 *
 * WHAT IT CANNOT SEE: a press. There is no DOM to click in, so that the Accept press really files
 * the acceptance is proved in a browser and written down in the step's own report, and what is
 * proved here is that the press is DRAWN, on a proposal and on nothing else.
 */
import { THE_TEST_OFFICES_OWNER, THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import { AUTHORITY_SAYS, PROVENANCE } from '../src/shared/implementation.ts'
import type {
  FindingOut,
  RecordImplementationReply,
  StatedOut,
} from '../src/server/api/implementation.ts'
import { drawnText } from './drawn.ts'

type ImplementationModule = typeof import('../src/web/components/Implementation.tsx')
type ModeModule = typeof import('../src/web/lib/mode.ts')

let im: ImplementationModule
let mode: ModeModule

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
    matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  im = await import('../src/web/components/Implementation.tsx')
  mode = await import('../src/web/lib/mode.ts')
})

// The mode is module-level state and a leak would silently change every test below it.
afterEach(() => {
  mode.setMode('normal')
})

// =========================================================================== the fixture

function stated(over: Partial<StatedOut> = {}): StatedOut {
  return {
    rowId: 'row-stated',
    pattern: 'src/web/pages/*.tsx',
    relation: 'implements',
    provenance: 'declared',
    authority: 'stated',
    says: AUTHORITY_SAYS.stated,
    statedBy: `human:${THE_TEST_OFFICES_OWNER.id}`,
    statedAt: '2026-08-26 01:02:23',
    acceptedBy: null,
    acceptedAt: null,
    note: null,
    revisionId: null,
    matched: 11,
    directories: [{ path: 'src/web/pages', files: 11 }],
    stale: false,
    nearestThatExists: null,
    ...over,
  }
}

function proposal(over: Partial<StatedOut> = {}): StatedOut {
  return stated({
    rowId: 'row-guessed',
    pattern: 'src/web/components/SummaryBlocks.tsx',
    provenance: 'llm',
    authority: 'guessed',
    says: AUTHORITY_SAYS.guessed,
    statedBy: 'agent:claude-opus',
    matched: 1,
    directories: [{ path: 'src/web/components', files: 1 }],
    ...over,
  })
}

/** Twenty candidates over three directories, which is the shape the import resolver really gives. */
function candidates(): FindingOut[] {
  const paths = [
    ...Array.from({ length: 12 }, (_, i) => `src/shared/thing${i}.ts`),
    ...Array.from({ length: 4 }, (_, i) => `src/server/api/thing${i}.ts`),
    ...Array.from({ length: 4 }, (_, i) => `src/server/lib/thing${i}.ts`),
  ]
  return paths.map((path, i) => ({
    rowId: `found-${i}`,
    path,
    relation: 'implements',
    provenance: 'imports',
    authority: 'computed',
    says: AUTHORITY_SAYS.computed,
    evidencePath: 'src/web/pages/HomePage.tsx',
    evidenceDetail: `../../${path.replace(/^src\//, '')}`,
    builtAt: '2026-08-26 01:02:32',
    alsoSuggestedFor: i === 0 ? 3 : 0,
  }))
}

function reply(over: Partial<RecordImplementationReply> = {}): RecordImplementationReply {
  const suggested = candidates()
  return {
    record: { id: 'T4ty3ALVechz', kind: 'module', title: 'Mole Office — the reading surface' },
    repositories: [
      {
        repository: { id: 'HWIYyt4vlK9y', name: 'panelx', hasRoot: true },
        indexed: true,
        fileCount: 12,
        stale: 0,
        stated: [stated()],
        suggested,
        proposed: [proposal()],
        disagreements: [],
      },
    ],
    counts: { candidates: 71, carried: 20, leftOut: 51, shortened: 0 },
    leftOut: [{ cause: 'budget', bucket: 'page', count: 51, ids: suggested.map((f) => f.rowId) }],
    notLookedFor: (['structure', 'manifest', 'build_graph', 'launch_config', 'observed_write', 'analysis'] as const).map(
      (provenance) => ({ provenance, phrase: PROVENANCE[provenance].phrase, refused: PROVENANCE[provenance].refused }),
    ),
    note: 'Seventy-one files nobody has claimed are imported by this record’s code.',
    ...over,
  }
}

function draw(over: Partial<RecordImplementationReply> = {}): string {
  return renderToStaticMarkup(
    h(im.ImplementationRead, {
      reply: reply(over),
      page: 0,
      onPage: () => {},
      accepting: null,
      onAccept: () => {},
    }),
  )
}

const text = (over?: Partial<RecordImplementationReply>) => drawnText(draw(over))

// =========================================================================== it draws something

describe('the surface really draws the read', () => {
  it('draws enough that a test finding nothing cannot pass quietly', () => {
    expect(text().replace(/\s+/g, ' ').trim().length).toBeGreaterThan(120)
  })

  it('names the repository this record lives in', () => {
    expect(text()).toContain('panelx')
  })
})

// =========================================================================== dogfood 3

describe('a relationship a machine worked out says so in Normal mode, unasked', () => {
  it('draws the computed word at rest, with no fold to open', () => {
    mode.setMode('normal')
    expect(text()).toContain(AUTHORITY_SAYS.computed.word)
  })

  it('draws the guessed word at rest too, and it is not the same word', () => {
    mode.setMode('normal')
    expect(text()).toContain(AUTHORITY_SAYS.guessed.word)
    expect(AUTHORITY_SAYS.guessed.word).not.toBe(AUTHORITY_SAYS.computed.word)
  })

  it('says the words the SERVER means, rather than a second wording of them', () => {
    // The fixture rows carry `says` straight off AUTHORITY_SAYS, so a surface inventing its own
    // phrase for "a machine worked this out" fails here rather than reading well and lying.
    mode.setMode('normal')
    const drawnHere = text()
    for (const tier of ['stated', 'computed', 'guessed'] as const) {
      expect(drawnHere, tier).toContain(AUTHORITY_SAYS[tier].word)
    }
  })
})

// =========================================================================== no file tree

describe('there is no file tree in Normal mode', () => {
  it('folds twenty candidates to their three directories and draws not one file name', () => {
    mode.setMode('normal')
    const drawnHere = text()
    for (const directory of ['src/shared', 'src/server/api', 'src/server/lib']) {
      expect(drawnHere, directory).toContain(directory)
    }
    expect(drawnHere, 'a candidate file name is on a Normal screen').not.toContain('thing7.ts')
    expect(drawnHere).not.toContain('thing11.ts')
  })

  it('gives a developer every path and the evidence behind it', () => {
    mode.setMode('inspect')
    const drawnHere = text()
    expect(drawnHere).toContain('src/shared/thing7.ts')
    expect(drawnHere).toContain('src/web/pages/HomePage.tsx imports ../../shared/thing7.ts')
  })

  it('folds by directory rather than by anything else, over paths at every depth', () => {
    expect(im.foldByDirectory(['a/b/one.ts', 'a/b/two.ts', 'a/three.ts', 'top.ts'])).toEqual([
      { path: 'a/b', files: 2 },
      { path: '.', files: 1 },
      { path: 'a', files: 1 },
    ])
  })
})

// =========================================================================== dogfood 4

describe('a guess is something a person can act on', () => {
  it('draws the accept press on a proposal', () => {
    mode.setMode('normal')
    expect(draw()).toContain('Accept')
  })

  it('draws no accept press when nothing is waiting', () => {
    mode.setMode('normal')
    const none = reply().repositories[0]
    expect(none).toBeDefined()
    const markup = draw({ repositories: [{ ...none!, proposed: [] }] })
    expect(markup, 'a stated row is being offered an acceptance it does not need').not.toContain('Accept')
  })
})

// =========================================================================== the fifth invariant

describe('an empty list is never read as “there is none”', () => {
  it('names the six sources nothing in this build looks with, in Normal mode', () => {
    mode.setMode('normal')
    const drawnHere = text()
    expect(drawnHere).toContain('nobody has looked')
    for (const provenance of ['build_graph', 'observed_write'] as const) {
      expect(drawnHere, provenance).toContain(PROVENANCE[provenance].reading)
    }
  })

  it('draws no source token, only the readings', () => {
    mode.setMode('normal')
    expect(text()).not.toContain('observed_write')
    expect(text()).not.toContain('build_graph')
  })
})

// =========================================================================== the subtraction

describe('what the read left out is on the screen with the way to the rest', () => {
  it('says how many candidates it did not carry', () => {
    mode.setMode('normal')
    expect(text()).toContain('51')
  })

  it('offers the next page, because a number nobody can open is a dead end', () => {
    mode.setMode('normal')
    expect(draw()).toContain('Next page')
  })

  it('keeps the bucket word for a developer and off a Normal screen', () => {
    mode.setMode('normal')
    expect(text()).not.toContain('budget')
    mode.setMode('inspect')
    expect(text()).toContain('budget')
  })
})

// =========================================================================== a stale pattern

describe('a pattern that has stopped matching says so', () => {
  it('names it, and names the longest part of it that still exists', () => {
    mode.setMode('normal')
    const one = reply().repositories[0]
    expect(one).toBeDefined()
    const drawnHere = drawnText(
      draw({
        repositories: [
          {
            ...one!,
            stated: [
              stated({
                pattern: 'src/web/components/PanelGrid.tsx',
                matched: 0,
                directories: [],
                stale: true,
                nearestThatExists: 'src/web/components',
              }),
            ],
          },
        ],
      }),
    )
    expect(drawnHere).toContain('src/web/components/PanelGrid.tsx')
    expect(drawnHere).toContain('src/web/components')
    expect(drawnHere).toContain('matches nothing')
  })
})

// =========================================================================== the mislabelled field

describe('a candidate this record already states is not called a disagreement', () => {
  /**
   * The route's `disagreements` is *candidates whose path a stated row of this record already
   * covers*, and its own comment expects it to be empty because candidates are computed over
   * unclaimed files. It stops being empty the moment somebody presses Accept: the file becomes
   * claimed and the finding from the last rebuild is still there. Measured in a browser on
   * 26 August 2026, one second after the accept press.
   */
  it('draws the rows and does not tell a person their own decision contradicts them', () => {
    mode.setMode('normal')
    const one = reply().repositories[0]
    expect(one).toBeDefined()
    const found = candidates()[0]
    expect(found).toBeDefined()
    const drawnHere = drawnText(draw({ repositories: [{ ...one!, disagreements: [found!] }] }))
    expect(drawnHere).toContain('Already stated')
    expect(drawnHere.toLowerCase(), 'the field name reached the screen').not.toContain('disagreement')
  })
})

// =========================================================================== shared resources

describe('a file more than one record was pointed at', () => {
  it('draws it with how many others, which is what makes a shared file legible', () => {
    mode.setMode('normal')
    const drawnHere = text()
    expect(drawnHere).toContain('Shared resources')
    expect(drawnHere).toContain('src/shared/thing0.ts')
  })

  it('says none are shared rather than drawing an empty heading', () => {
    mode.setMode('normal')
    const one = reply().repositories[0]
    expect(one).toBeDefined()
    const noneShared = candidates().map((finding) => ({ ...finding, alsoSuggestedFor: 0 }))
    expect(drawnText(draw({ repositories: [{ ...one!, suggested: noneShared }] }))).toContain('none shared')
  })
})

// =========================================================================== saying which code it is

/**
 * ADD CODE — §7.2's press, and the second half of the way in.
 *
 * REGISTERING A REPOSITORY IS NOT ENOUGH ON ITS OWN. `GET /api/implementation/record/:id` builds its
 * repository list from the record's OWN stated rows and findings, so a record with no rows draws no
 * repository however many the project holds. Without this control the owner's Module pages go on
 * drawing "nothing said" after a repository is registered, which is the fault only half closed.
 *
 * The list below is what `GET /api/implementation/repositories` really returned against a copy of
 * the owner's corpus on 26 August 2026, before and after one repository was registered through the
 * route.
 */
describe('a person can say which code this record is', () => {
  const REGISTERED = [
    {
      id: 'tXPWuzlA18lz',
      name: 'panelx',
      note: 'The checkout this Mole Office is running from.',
      root: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`,
      hasRoot: true,
      indexed: true,
      builtAt: '2026-08-26 03:26:55',
      fileCount: 1262,
      createdAt: '2026-08-26 03:26:49',
      createdBy: `human:${THE_TEST_OFFICES_OWNER.id}`,
    },
  ]

  function form(repositories: typeof REGISTERED): string {
    return renderToStaticMarkup(
      h(im.AddCodeForm, { recordId: 'prpQGDuD7NbW', repositories, onWritten: () => {} }),
    )
  }

  it('offers a repository, a path, what the code does for it, and why', () => {
    const text = drawnText(form(REGISTERED))
    expect(text).toContain('Repository')
    expect(text).toContain('panelx')
    expect(text).toContain('Path or pattern')
    expect(text).toContain('implements')
    expect(text).toContain('Add')
  })

  /**
   * THE STATE THE OWNER'S CORPUS IS IN, AND THE WAY OUT OF IT. A project with no repository cannot
   * be written to here, and an absence with no way forward is a dead end — which is what wave 6
   * shipped, in the shape of twelve routes and no control.
   */
  it('says there is no repository yet and gives the way to register one', () => {
    const text = drawnText(form([]))
    expect(text).toContain('No repository in this project')
    expect(text).toContain('Register one in Settings')
    expect(text).not.toContain('Path or pattern')
    expect(form([])).toContain('href="#/settings"')
  })

  it('never proposes on a person’s behalf: the form has no guess control at all', () => {
    // `proposing` is the route's flag for an agent that has read the code and is guessing. A person
    // pressing Add is stating a fact, and a control offering to file their own statement as a guess
    // would make the mark mean nothing.
    expect(form(REGISTERED).toLowerCase()).not.toContain('propos')
  })
})
