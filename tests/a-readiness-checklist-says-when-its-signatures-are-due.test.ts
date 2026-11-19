// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A READINESS CHECKLIST SAYS WHEN ITS SIGNATURES ARE DUE AS A CLOCK TIME. Wave 13u round 13.
 *
 * The deadline is still ahead while a checklist waits. The first drawing of the page put it through Stamp, which only
 * says how long ago a moment was, so a deadline half an hour away read "Runs only if everyone signs by just now". It
 * was seen in the pictures and in no test. The row and the opened checklist now draw it with drawnStamp.
 *
 * MUTATION, after a control run, restored byte for byte: both <Deadline> put back to <Stamp>: both cases go red.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import type { AReadinessChecklist } from '../src/server/lib/readiness.ts'
import { drawnStamp, localStamp } from '../src/shared/time.ts'

/** A made-up checklist, waiting, due in thirty minutes. */
function aWaitingChecklist(): AReadinessChecklist {
  const endsAt = localStamp(new Date(Date.now() + 30 * 60_000))
  return {
    id: 'example-checklist',
    workspaceId: 'default',
    operation: 'harnesses.install',
    inputs: { harnesses: ['example-tool'] },
    onWhat: 'example-hash',
    shows: 'Install or upgrade Example Tool, which every agent that runs on it uses.',
    level: 'everyone',
    signers: [{ kind: 'person', id: 'owner', why: 'the-person', name: 'the person', signedAt: null }],
    notSigned: [{ kind: 'person', id: 'owner', why: 'the-person', name: 'the person', signedAt: null }],
    raisedBy: { kind: 'agent', id: 'example-agent', name: 'example-agent' },
    because: 'Made-up example.',
    state: 'waiting',
    raisedAt: localStamp(new Date()),
    endsAt,
    closedAt: null,
    closedBy: null,
    outcome: null,
  }
}

type ThePage = typeof import('../src/web/pages/ReadinessPage.tsx')
let page: ThePage

// THE PAGE IS IMPORTED ONCE, with time to be transformed: it brings the browser app's api and ui modules with it.
beforeAll(async () => {
  page = await import('../src/web/pages/ReadinessPage.tsx')
}, 60_000)

describe('a waiting checklist says when its signatures are due', () => {
  it('draws the deadline in a row as a clock time', () => {
    const { ChecklistRow } = page
    const checklist = aWaitingChecklist()
    const drawn = renderToStaticMarkup(h('ul', null, h(ChecklistRow, { checklist })))
    expect(drawn).toContain(drawnStamp(checklist.endsAt))
  })

  it('draws the deadline in the opened checklist as a clock time', () => {
    const { TheChecklist } = page
    const checklist = aWaitingChecklist()
    const drawn = renderToStaticMarkup(h(TheChecklist, { checklist }))
    expect(drawn).toContain(drawnStamp(checklist.endsAt))
  })
})
