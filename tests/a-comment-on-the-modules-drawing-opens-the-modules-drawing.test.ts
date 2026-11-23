// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COMMENT WRITTEN ON A CARD OF THE MODULES DRAWING OPENS THE MODULES DRAWING.
 *
 * A press on a comment, from the messages list or the review column, asks `pageHolding` in
 * src/web/components/agent/ReviewBar.tsx where to go. A comment written on a drawing stores which drawing it was on,
 * and the answer is that drawing's address. The modules drawing is at the address `pipelineDrawingPath` builds. The
 * bare `pipelinePath()` is the list of pipelines, and has been since that list was given the address.
 *
 * On main's code a comment on the modules drawing is answered with the list of pipelines, so the first case fails
 * there: the reader lands on the list, no drawing opens, and the card the comment was on is not focused. The second
 * case asks about a comment on one pipeline's drawing, whose address was right, so a fix keeps it.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import type { Context } from '../src/shared/targets.ts'

/**
 * THE MODULES ARE IMPORTED AFTER A STAND-IN WINDOW, not at the top of the file. src/web/api.ts reads storage the moment
 * it is first imported and this runner's environment is node. The stand-in is the one
 * tests/a-comment-on-the-rail-can-be-got-back-to.test.ts installs, and nothing in it is under test.
 */
let bar: typeof import('../src/web/components/agent/ReviewBar.tsx')
let router: typeof import('../src/web/components/router.tsx')

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
  bar = await import('../src/web/components/agent/ReviewBar.tsx')
  router = await import('../src/web/components/router.tsx')
})

const A_CARD = { kind: 'record', recordId: 'a-module', workspaceId: 'a-project' } as const

describe('where a press on a comment written on a drawing goes', () => {
  it('opens the modules drawing, not the list of pipelines, for a comment on a card of the modules drawing', () => {
    const context: Context = { target: A_CARD, drawnOn: { drawing: 'modules' } }
    const answer = bar.pageHolding(context)
    expect(answer, 'the comment opens the list of pipelines').not.toEqual({ path: router.pipelinePath() })
    expect(answer).toEqual({ path: router.pipelineDrawingPath() })
  })

  it('still opens the pipeline drawn, for a comment on a card of one pipeline\'s drawing', () => {
    const context: Context = { target: A_CARD, drawnOn: { drawing: 'pipeline', pipelineId: 'a-pipeline' } }
    expect(bar.pageHolding(context)).toEqual({ path: router.pipelinePath('a-pipeline') })
  })
})
