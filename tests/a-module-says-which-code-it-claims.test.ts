// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MODULE PAGE READS THE IMPLEMENTATION MAP, AND NEVER SAYS "CLAIMS NO CODE" WITHOUT LOOKING.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT THIS FILE EXISTS AGAINST
 * ---------------------------------------------------------------------------------------
 *
 * Window B moved 152 claims off `module.data.claims` and into `implementation_map`, across fifteen
 * of the owner's modules, and deleted the field's declaration in the same commit. The "Claimed
 * source" panel went on reading the emptied field, so all fifteen pages drew *"This module claims no
 * code in the Mole Office repository"* — including cegP4HnIk9nd, which has a row in that table.
 *
 * To a reader that is indistinguishable from the migration having lost their work. Nothing on the
 * screen said otherwise, and every server-side test went on passing, because the rows were there and
 * the route answered them correctly. Only the reading was wrong.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIXTURE IS A REPLY THE ROUTE REALLY PRODUCED, ON THE OWNER'S OWN CORPUS
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/implementation/record/cegP4HnIk9nd` against a `VACUUM INTO` copy of data/panelx.db on
 * 26 August 2026, served by `node tools/isolated-mole-office.mjs start windowb`. It is the exact record
 * whose page drew the sentence, with the exact row window B wrote for it: `stated_by`
 * `system:module-claims-migration`, `revision_id` null, and the migration's own note saying the
 * pattern was carried over verbatim. A hand-made fixture would have proved nothing here, because
 * what was in doubt was whether a reader skips a row stated by a system with no revision.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS RENDERED, AND WHY IT IS NOT THE WHOLE PANEL
 * ---------------------------------------------------------------------------------------
 *
 * `renderToStaticMarkup` does not run effects and `useAsync` fetches in one, so a test of the
 * fetching component could only ever photograph its loading state. `ClaimedSourceRead` takes the
 * read's state and fetches nothing, which is the same split `ImplementationRead` is under and for
 * the same reason.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'

import type { RecordImplementationReply } from '../src/server/api/implementation.ts'
import { drawnText } from './drawn.ts'

/**
 * WHAT THESE RENDERS PASS FOR `declares`: see-through, because none of them reads a target.
 *
 * The panels below now take the answer from their caller's own `sectionsOf`. These tests read what
 * is INSIDE each panel — the words, the fold, the absence — so the see-through answer is the one
 * that leaves the markup they read exactly as it was.
 */
const SEE_THROUGH = { surface: null } as const


type ModuleViewModule = typeof import('../src/web/components/ModuleView.tsx')

let mv: ModuleViewModule

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
  mv = await import('../src/web/components/ModuleView.tsx')
})

/** The reply the running product gave for module cegP4HnIk9nd, copied from the wire. */
function theOwnersModule(): RecordImplementationReply {
  return {
    record: {
      id: 'cegP4HnIk9nd',
      kind: 'module',
      title: 'Mole Office — work-state rules: state words, consequence, gates',
    },
    repositories: [
      {
        repository: { id: 'ogaQVVVGGOe2', name: 'panelx', hasRoot: true },
        indexed: false,
        fileCount: 0,
        stale: 0,
        stated: [
          {
            rowId: 'mWQGA1g1vuXM',
            pattern: 'src/shared/work.ts',
            relation: 'implements',
            provenance: 'declared',
            authority: 'stated',
            says: {
              word: 'stated',
              glyph: '',
              meaning: 'somebody said this on purpose. It counts as ownership.',
            },
            // THE TWO VALUES THAT WERE IN DOUBT. A reader that required a person, or required a
            // revision, would skip every one of the 152 rows the migration wrote.
            statedBy: 'system:module-claims-migration',
            revisionId: null,
            statedAt: '2026-08-26 11:28:58',
            acceptedBy: null,
            acceptedAt: null,
            note:
              'Carried over verbatim from `data.claims` on this module by the module-claims migration. The ' +
              'corpus does not record who wrote the string, so this row does not guess at a person.',
            matched: 0,
            directories: [],
            stale: false,
            nearestThatExists: null,
          },
        ],
        suggested: [],
        proposed: [],
        disagreements: [],
      },
    ],
    counts: { candidates: 0, carried: 0, leftOut: 0, shortened: 0 },
    leftOut: [],
    notLookedFor: [],
    note: "No files nobody has claimed are imported by this record's code.",
  }
}

const draw = (
  reading: Parameters<ModuleViewModule['ClaimedSourceRead']>[0]['reading'],
  stored: string[] = [],
): string => renderToStaticMarkup(h(mv.ClaimedSourceRead, { declares: SEE_THROUGH, reading, stored }))

/**
 * THE WORD ON THE PAGE, and the sentence behind it.
 *
 * `Absence` draws a short word and puts the whole sentence on the tooltip and in the screen-reader
 * text, so the negative assertions below read the RAW MARKUP rather than the drawn text: the
 * sentence a reader gets by hovering is as much a claim as the one they get by looking.
 */
const THE_WORD = 'no code claimed'
const THE_SENTENCE = 'claims no code'

describe('a module with a row in the implementation map is not told it claims nothing', () => {
  it('draws the pattern window B wrote for the owner’s own module', () => {
    const html = draw({ status: 'ready', value: theOwnersModule() })
    expect(html).toContain('src/shared/work.ts')
    expect(html).not.toContain(THE_SENTENCE)
    expect(html).not.toContain(THE_WORD)
  })

  it('says how the row is known, at rest, without opening anything', () => {
    // The word comes from the server on the row, so this file cannot say something the server does
    // not mean — and it is drawn in normal mode with no fold, because a guess and a statement are
    // different things and a reader must be able to tell them apart at a glance.
    expect(drawnText(draw({ status: 'ready', value: theOwnersModule() }))).toContain('stated')
  })

  it('counts the claim in the panel heading, so an empty-looking panel has a number against it', () => {
    expect(draw({ status: 'ready', value: theOwnersModule() })).toContain('1 claim')
  })

  it('does not say a module claims nothing while the read is still in flight', () => {
    const html = draw({ status: 'loading' })
    expect(html).not.toContain(THE_SENTENCE)
    expect(html).not.toContain(THE_WORD)
  })

  it('does not say a module claims nothing when the read failed', () => {
    const html = draw({ status: 'error', message: 'the server did not answer' })
    expect(html).not.toContain(THE_SENTENCE)
    expect(html).not.toContain(THE_WORD)
    expect(drawnText(html)).toContain('the server did not answer')
  })

  it('says nobody could look when it was never told which record the fields came from', () => {
    // The fifth engineering rule: *nothing is there* and *nobody has looked* are different answers,
    // and this panel used to give the first one for both.
    const html = draw({ status: 'ready', value: null })
    expect(html).not.toContain(THE_SENTENCE)
    expect(html).not.toContain(THE_WORD)
    expect(html).toContain('nobody could look')
  })

  it('still says a module claims no code when the map really holds nothing for it', () => {
    // The old sentence is not wrong, it was unearned. A hardware module claims no code and that is a
    // real answer — drawn here, once something has actually looked.
    const empty = { ...theOwnersModule(), repositories: [] }
    expect(drawnText(draw({ status: 'ready', value: empty }))).toContain(THE_WORD)
  })
})

describe('a claim still sitting on the record is drawn, and said to be still on the record', () => {
  it('draws it without waiting for the map, because it came down with the record', () => {
    // A corpus restored from a backup taken before window B holds `data.claims`, and the write path
    // refuses that key now. A page that ignored it would hide somebody's list with no way to see it.
    const html = draw({ status: 'loading' }, ['src/gripper', 'tests/gripper.test.ts'])
    expect(html).toContain('src/gripper')
    expect(drawnText(html)).toContain('still stored on this record')
  })

  it('does not also say it claims no code under a claim it has just drawn', () => {
    const html = draw({ status: 'ready', value: { ...theOwnersModule(), repositories: [] } }, ['src/gripper'])
    // That would be the page contradicting itself one line under a claim it has just drawn.
    expect(html).not.toContain(THE_WORD)
  })

  it('counts the two sources together, so the heading matches what is on the page', () => {
    const html = draw({ status: 'ready', value: theOwnersModule() }, ['src/gripper'])
    expect(html).toContain('2 claims')
  })
})
