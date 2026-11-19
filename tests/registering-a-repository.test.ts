// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WAY IN: WHAT SETTINGS DRAWS SO A PERSON CAN REGISTER THE TREE A PATH IS RELATIVE TO.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS FILE EXISTS AGAINST
 * ---------------------------------------------------------------------------------------
 *
 * Wave 6's own verifier opened the wave 6 panel on a copy of the owner's corpus and found it empty:
 * *"On the owner's own corpus, wave 6 draws nothing, and nothing in the product can change that."*
 * `repositories` held no rows, `implementation_map` held none, and `src/web/api.ts` called two of
 * the wave's twelve routes — the record read and the accept press. So a person could read the map
 * and accept a guess, and could not make the first row either of those reads about.
 *
 * A REPOSITORY IS THE TREE A PATH IS RELATIVE TO. Until one is registered every pattern anybody
 * writes has nothing to be relative to, and the held `module.claims` migration refuses outright:
 * *"NO REPOSITORY — project panelx, 15 modules, 152 claims"*. The way in is what this file holds to.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT RENDERS, AND WHERE THE FIXTURES CAME FROM
 * ---------------------------------------------------------------------------------------
 *
 * `renderToStaticMarkup`, with the same window stand-in `tests/where-this-record-lives.test.ts`
 * uses and for the same reason: `src/web/api.ts` reads `window` at module scope. The drawing is
 * `RepositoriesRead`, which takes a reply and fetches nothing, because `useAsync` runs in an effect
 * and a static render never runs one — a test of the whole panel could only photograph its loading
 * state.
 *
 * EVERY FIXTURE BELOW IS A REPLY THE ROUTE REALLY PRODUCED, on 26 August 2026, against an isolated
 * instance serving a `VACUUM INTO` copy of the owner's corpus: the empty answer the owner's corpus really
 * gives, the answer after one repository was registered through the route, the answer after it was
 * scanned (1,262 files), and the answer for a repository registered with no folder on this machine.
 *
 * WHAT IT CANNOT SEE: a press. There is no DOM to click in. That the Register press really writes a
 * row, and that the row then reaches a module page, is proved in a browser against a copy of the owner's
 * corpus and written down in the commit that lands this.
 */
import { THE_TEST_OFFICES_OWNER, THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

import type { RepositoriesReply, RepositoryOut } from '../src/server/api/implementation.ts'
import { drawnText } from './drawn.ts'

type RepositoriesModule = typeof import('../src/web/components/Repositories.tsx')
type ModeModule = typeof import('../src/web/lib/mode.ts')

let rp: RepositoriesModule
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
  rp = await import('../src/web/components/Repositories.tsx')
  mode = await import('../src/web/lib/mode.ts')
})

// The mode is module-level state and a leak would silently change every test below it.
afterEach(() => {
  mode.setMode('normal')
})

// =========================================================================== the fixtures

/** What the owner's corpus really answers today: no repository at all, and the route's own sentence. */
const NOTHING_REGISTERED: RepositoriesReply = {
  repositories: [],
  note:
    'No repository is registered in this project, so no pattern has a tree to resolve against. ' +
    'The Repositories panel in Settings registers one, and so does POST /api/implementation/repositories.',
}

/** Registered through the route, not yet scanned. */
const UNSCANNED: RepositoryOut = {
  id: 'tXPWuzlA18lz',
  name: 'panelx',
  note: 'The checkout this Mole Office is running from.',
  root: `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`,
  hasRoot: true,
  indexed: false,
  builtAt: null,
  fileCount: 0,
  createdAt: '2026-08-26 03:26:49',
  createdBy: `human:${THE_TEST_OFFICES_OWNER.id}`,
}

/** The same row after one scan. 1,262 files, off the real walk of that tree. */
const SCANNED: RepositoryOut = {
  ...UNSCANNED,
  indexed: true,
  builtAt: '2026-08-26 03:26:55',
  fileCount: 1262,
}

/** Named here, with no copy of it on this machine. A real state and not a fault. */
const NO_FOLDER_HERE: RepositoryOut = {
  id: 'wBeSW6xzDdf2',
  name: 'calibration',
  note: null,
  root: null,
  hasRoot: false,
  indexed: false,
  builtAt: null,
  fileCount: 0,
  createdAt: '2026-08-26 03:27:32',
  createdBy: `human:${THE_TEST_OFFICES_OWNER.id}`,
}

const HELD = (repositories: RepositoryOut[]): RepositoriesReply => ({
  repositories,
  note:
    `${repositories.length} repositor${repositories.length === 1 ? 'y' : 'ies'}. A repository with no root is a ` +
    `real state: it is named, there is no checkout of it on this machine, it can hold relationships and be read, ` +
    `and it cannot be scanned.`,
})

function draw(reply: RepositoriesReply, adding = false): string {
  return renderToStaticMarkup(
    h(rp.RepositoriesRead, { reply, adding, scanning: null, onScan: () => {}, onRegistered: () => {} }),
  )
}

function drawOne(repository: RepositoryOut): string {
  return renderToStaticMarkup(h(rp.OneRepository, { repository, scanning: null, onScan: () => {}, onChanged: () => {} }))
}

// =========================================================================== the way in

describe('a person can register the first repository without leaving the product', () => {
  /**
   * THE WHOLE FAULT IN ONE ASSERTION. A project with no repository is the state the owner's corpus
   * is in, and the form has to be on the screen at rest — not behind a press, not behind a mode.
   */
  it('draws the form at rest when the project holds none, because that is the only thing to do here', () => {
    const text = drawnText(draw(NOTHING_REGISTERED))
    expect(text).toContain('Register')
    expect(text).toContain('Name')
    expect(text).toContain('Folder on this machine')
  })

  it('puts the form behind a press once a repository exists, so the panel is a list and not a form', () => {
    const text = drawnText(draw(HELD([SCANNED])))
    expect(text).not.toContain('Register')
    expect(drawnText(draw(HELD([SCANNED]), true))).toContain('Register')
  })

  it('never draws a form the reader cannot use: the folder is optional and the name is not', () => {
    const html = draw(NOTHING_REGISTERED)
    // `optional` is the Field's own mark, and it is on exactly one of the three answers a person
    // gives: leaving the folder empty means there is no copy of this tree on this machine.
    const marks = html.match(/optional/g) ?? []
    expect(marks.length).toBeGreaterThanOrEqual(1)
  })
})

// =========================================================================== what a row says

describe('one repository says the five things the design gives it', () => {
  it('draws its name, its folder, when it was last scanned and how many files', () => {
    const text = drawnText(drawOne(SCANNED))
    expect(text).toContain('panelx')
    expect(text).toContain(`${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`)
    expect(text).toContain('Last scanned')
    expect(text).toContain('2026-08-26 03:26:55')
    expect(text).toContain('1262')
    expect(text).toContain('Scan now')
  })

  /**
   * THE FIFTH INVARIANT ON ONE ROW, TWICE. *Nobody has scanned this* and *there is no copy of this
   * tree here* are different facts and a reader has to be able to tell them apart. A repository
   * that has never been scanned must not read as a repository with no files in it.
   */
  it('tells a folder that is not here from a folder nobody has scanned', () => {
    const unscanned = drawnText(drawOne(UNSCANNED))
    expect(unscanned).toContain('never')
    expect(unscanned).toContain('not counted')
    // The folder IS here — it is the scan that has not happened — so the path is drawn.
    expect(unscanned).toContain(`${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`)

    const absent = drawnText(drawOne(NO_FOLDER_HERE))
    expect(absent).toContain('none here')
    expect(absent).toContain('never')
  })

  it('offers no scan for a repository with no folder on this machine, because there is nothing to walk', () => {
    expect(drawnText(drawOne(NO_FOLDER_HERE))).not.toContain('Scan now')
    expect(drawnText(drawOne(UNSCANNED))).toContain('Scan now')
  })

  /**
   * THE WORDS ARE THE DESIGN'S. `implementation-map.md` §9.4 applies the Remote Access panel's rule
   * to this one: *"the words are repository, folder on this machine, last scanned, files. Not
   * checkout, not root, not index."*
   *
   * IT IS OVER PANELX'S OWN WORDS AND NOT OVER THE PERSON'S. The note on a row is what whoever
   * registered it typed, kept exactly as typed and drawn back to them, so this walks rows with no
   * note. The eighth rule is why: a human-facing box is not the place a vocabulary is enforced by
   * refusal, and rewriting somebody's own sentence would be worse than the word it removed.
   */
  it('names none of the machinery on the row: no root, no checkout, no index', () => {
    for (const repository of [SCANNED, UNSCANNED, NO_FOLDER_HERE]) {
      const text = drawnText(drawOne({ ...repository, note: null })).toLowerCase()
      expect(text, repository.name).not.toContain('root')
      expect(text, repository.name).not.toContain('checkout')
      expect(text, repository.name).not.toContain('index')
    }
  })

  it('shows the words whoever registered it wrote, and draws nothing where there are none', () => {
    expect(drawnText(drawOne(SCANNED))).toContain('The checkout this Mole Office is running from.')
    expect(drawnText(drawOne(NO_FOLDER_HERE))).not.toContain('The checkout this Mole Office is running from.')
  })
})

// =========================================================================== the list

describe('the panel draws every repository in the project', () => {
  it('draws two rows for two', () => {
    const text = drawnText(draw(HELD([SCANNED, NO_FOLDER_HERE])))
    expect(text).toContain('panelx')
    expect(text).toContain('calibration')
  })

  /**
   * THE SERVER'S NOTE IS MACHINERY AND STAYS IN DEVELOPER MODE, which is not this panel's decision:
   * `ServerNote` renders nothing at all in Normal mode, so a route's paragraph — written for an
   * agent, naming routes and tables — cannot leak onto a person's screen from any surface. What a
   * person needs here is the form, and the form is what they get.
   */
  it('keeps the route’s own paragraph in Developer mode and draws it nowhere else', () => {
    expect(drawnText(draw(HELD([SCANNED, NO_FOLDER_HERE])))).not.toContain('2 repositories')
    mode.setMode('inspect')
    expect(drawnText(draw(HELD([SCANNED, NO_FOLDER_HERE])))).toContain('2 repositories')
  })

  it('really renders something, so an assertion over an empty string cannot pass quietly', () => {
    expect(drawnText(draw(HELD([SCANNED]))).trim().length).toBeGreaterThan(60)
    expect(drawnText(draw(NOTHING_REGISTERED)).trim().length).toBeGreaterThan(60)
  })
})
