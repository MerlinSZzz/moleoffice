// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { join } from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { isARecordId, piecesOfBody } from '../src/shared/messages.ts'
import type { Change } from '../src/shared/types.ts'

/** Twelve-letter words a person writes: lower case, at the start of a sentence, and joined. */
const WORDS = ['conversation', 'notification', 'acknowledged', 'Conversation', 'Notification', 'Presentation', 'well-behaved', 'self-elected', 'first-person'] as const
/** Ids of the kind the office writes: real ids from this office, and an all-lower-case one with one digit. */
const IDS = ['kfhOqxMhCLIE', 'f-chc035ncsp', 'P-P3huQftq9w', 'abcdefghij1k'] as const

const english = createI18n('en').t
const chinese = createI18n('zh').t

/** The record ids piecesOfBody found in a body, in order. */
function linkedIn(body: string): string[] {
  return piecesOfBody(body).flatMap((piece) => (piece.what === 'record' ? [piece.recordId] : []))
}

describe('the rule', () => {
  it('takes no twelve-letter word for an id, and takes every id', () => {
    expect(WORDS.filter(isARecordId)).toEqual([])
    expect(IDS.filter((id) => !isARecordId(id))).toEqual([])
  })

  it('takes nothing that is not twelve characters of the alphabet', () => {
    expect(isARecordId('kfhOqxMhCLI')).toBe(false)
    expect(isARecordId('kfhOqxMhCLIE1')).toBe(false)
    expect(isARecordId('kfhOqxMhCL.E')).toBe(false)
  })
})

describe('a message', () => {
  it('keeps the words of an English sentence and links the id beside them', () => {
    const body = `${english('officeLines.branched.line')}. Conversation and notification are in kfhOqxMhCLIE; well-behaved.`
    expect(linkedIn(body)).toEqual(['kfhOqxMhCLIE'])
    expect(piecesOfBody(body).map((piece) => piece.text).join('')).toBe(body)
  })

  it('keeps the words of a Chinese sentence and links the id beside them', () => {
    const body = `${chinese('officeLines.branched.line')}：这条 conversation 的 notification 在 f-chc035ncsp 里，Presentation 也是一个词。`
    expect(linkedIn(body)).toEqual(['f-chc035ncsp'])
    expect(piecesOfBody(body).map((piece) => piece.text).join('')).toBe(body)
  })

  it('links every id of the list and none of the words in one sentence', () => {
    const body = [...WORDS, ...IDS].join(' ')
    expect(linkedIn(body)).toEqual([...IDS])
  })
})

describe('the plans, the change log and the gate', () => {
  // The components load slowly the first time, so each case below may take up to 30 seconds.
  beforeAll(() => {
    // src/web/api.ts reads window.localStorage when it loads; the components import it. Nothing here is under test.
    const store = new Map<string, string>()
    ;(globalThis as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    }
  })

  it('withoutRecordIds keeps the words and takes the ids out', async () => {
    const { withoutRecordIds } = await import('../src/web/components/plans/planitems.tsx')
    expect(withoutRecordIds(`The conversation (kfhOqxMhCLIE) is well-behaved.`)).toBe('The conversation is well-behaved.')
    expect(withoutRecordIds(`Presentation written (abcdefghij1k) for the notification.`)).toBe('Presentation written for the notification.')
  }, 30_000)

  it('a change log draws "acknowledged" as the word it is', async () => {
    const { ChangeBody } = await import('../src/web/components/ChangeLog.tsx')
    const change = {
      id: 'chg-a', recordId: 'rec-a', workspaceId: 'w', op: 'update', actorType: 'agent', actorId: 'a-writer', sessionId: null,
      field: 'data.verdict', oldValue: 'conversation', newValue: 'acknowledged', at: '2026-10-04 22:00:00',
    } as unknown as Change
    const html = renderToStaticMarkup(h(ChangeBody, { change, sessions: [] }))
    expect(html).toContain('acknowledged')
    expect(html).toContain('conversation')
    expect(html).not.toContain(english('g2d.changeLog.unavailableRecord'))
  }, 30_000)

  it('a gate whose stage is written "Presentation" draws that word', async () => {
    const { GateMark } = await import('../src/web/components/ui.tsx')
    const html = renderToStaticMarkup(h(GateMark, { gate: { kind: 'partial', upTo: 'Presentation' } }))
    expect(html).toContain('Presentation')
    expect(html).not.toContain(english('unlistedWords.gate.stageReading'))
  }, 30_000)
})

describe('capitalised joined words and all-capitals words (round 37b)', () => {
  /** Twelve letters each; "NOTIFICATIONS" is thirteen and is never a candidate. */
  const MORE_WORDS = ['Long-running', 'Well-behaved', 'Self-hosting', 'CONVERSATION', 'NOTIFICATION'] as const

  it('takes none of them for an id', () => {
    expect(MORE_WORDS.filter(isARecordId)).toEqual([])
    expect(isARecordId('NOTIFICATIONS')).toBe(false)
  })

  it('keeps them in an English message and links the id beside them', () => {
    const body = 'Long-running and Well-behaved jobs, and Self-hosting: READ THE CONVERSATION AND THE NOTIFICATIONS in kfhOqxMhCLIE.'
    expect(linkedIn(body)).toEqual(['kfhOqxMhCLIE'])
    expect(piecesOfBody(body).map((piece) => piece.text).join('')).toBe(body)
  })

  it('keeps them in a Chinese message and links the id beside them', () => {
    const body = '这些 Long-running、Well-behaved 和 Self-hosting 的任务，CONVERSATION 和 NOTIFICATIONS 都在 f-chc035ncsp 里。'
    expect(linkedIn(body)).toEqual(['f-chc035ncsp'])
    expect(piecesOfBody(body).map((piece) => piece.text).join('')).toBe(body)
  })

  it('withoutRecordIds keeps them in a plan sentence and takes the ids out', async () => {
    ;(globalThis as unknown as { window: unknown }).window ??= { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } }
    const { withoutRecordIds } = await import('../src/web/components/plans/planitems.tsx')
    expect(withoutRecordIds('Long-running jobs are kept (kfhOqxMhCLIE). Well-behaved and Self-hosting workers finish.'))
      .toBe('Long-running jobs are kept. Well-behaved and Self-hosting workers finish.')
    expect(withoutRecordIds('READ THE CONVERSATION FIRST, then the NOTIFICATIONS in abcdefghij1k.'))
      .toBe('READ THE CONVERSATION FIRST, then the NOTIFICATIONS in ….')
    expect(withoutRecordIds('长期运行的 Long-running 任务和 Self-hosting 都在 abcdefghij1k 里，CONVERSATION 和 Well-behaved 留着。'))
      .toBe('长期运行的 Long-running 任务和 Self-hosting 都在 … 里，CONVERSATION 和 Well-behaved 留着。')
  }, 30_000)
})
