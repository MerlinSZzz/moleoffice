// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE KEY QUESTION SAYS WHERE A KEY GOES, AND SEND ANYWAY STILL SENDS. Wave 13u, round 242.
 *
 * The chat asks once before it sends words that seem to hold a key (src/web/components/AKeyQuestion.tsx). The question
 * now has one more line: a key goes on its tool's key page, not in the chat, with a link to the coding tools panel in
 * Settings, where each tool has its Set up press. The question still never refuses: Send anyway sends what was asked
 * about, and Change it closes the question.
 *
 * HOW IT IS READ HERE. `KeyQuestion` keeps no state of its own, so it is drawn once on the server for its markup, and
 * called once for the tree it returns, whose Send anyway press is pressed. No message is sent and no door is asked.
 */

import { createElement as h, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import type { AKeyReminder } from '../src/shared/message-keys.ts'

type TheQuestion = typeof import('../src/web/components/AKeyQuestion.tsx')
let question: TheQuestion
let i18n: typeof import('../src/shared/i18n.ts')

// THE QUESTION IS IMPORTED ONCE, with time to be transformed. The runner's environment is node, so a window stand-in
// is installed before the page's modules are imported.
beforeAll(async () => {
  const store = new Map<string, string>()
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  }
  Object.assign(globalThis, {
    window: {
      localStorage: storage,
      sessionStorage: storage,
      location: { hash: '#/chat', search: '' },
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  })
  question = await import('../src/web/components/AKeyQuestion.tsx')
  i18n = await import('../src/shared/i18n.ts')
}, 60_000)

/** A word as React writes it into markup. */
const asDrawn = (words: string): string => words.replaceAll('&', '&amp;').replaceAll("'", '&#x27;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

/** A made-up reminder: something shaped like an API key in the words typed. */
const ASKING: AKeyReminder = { shape: 'apiKey', what: 'Example: an API key', where: 'body', begins: 'exam', n: 1, says: 'Example: this looks like an API key.' }

/** A question that is drawn, with the presses counted. */
function aQuestionAsked(): { asked: Parameters<TheQuestion['KeyQuestion']>[0]['question']; pressed: { sendAnyway: number; close: number } } {
  const pressed = { sendAnyway: 0, close: 0 }
  const asked = {
    asking: ASKING,
    draftChanged: null,
    stopsTheSend: () => true,
    sendAnyway: () => void (pressed.sendAnyway += 1),
    close: () => void (pressed.close += 1),
  }
  return { asked, pressed }
}

/** Every element in a tree a component returned, the tree itself first. */
function everyElement(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(everyElement)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...everyElement(node.props['children'] as ReactNode)]
}

describe('the key question', () => {
  it('says a key goes on its tool\'s key page, and links to the coding tools in Settings', () => {
    const html = renderToStaticMarkup(h(question.KeyQuestion, { question: aQuestionAsked().asked }))
    expect(html.split(asDrawn(i18n.t('keyQuestion.keyPage')))).toHaveLength(2)
    expect(html).toContain(`<a href="#/settings/codingtools">${asDrawn(i18n.t('keyQuestion.toTheCodingTools'))}</a>`)
    // THE QUESTION STILL ASKS: it draws what was seen, and its two presses.
    expect(html).toContain(asDrawn(question.theKeyQuestionSays(ASKING)))
    expect(html).toContain(asDrawn(i18n.t('w13w.keyQuestion.sendAnyway')))
    expect(html).toContain(asDrawn(i18n.t('w13w.keyQuestion.changeIt')))
  })

  it('sends when Send anyway is pressed, and refuses nothing', () => {
    const { asked, pressed } = aQuestionAsked()
    const tree = question.KeyQuestion({ question: asked })
    const presses = everyElement(tree).filter((one) => typeof one.props['onClick'] === 'function')
    expect(presses.map((one) => one.props['className'])).toEqual(['px-key-question-send', 'px-key-question-change'])
    const sendAnyway = presses[0]?.props['onClick'] as () => void
    sendAnyway()
    expect(pressed).toEqual({ sendAnyway: 1, close: 0 })
  })

  it('draws nothing while nothing is asked', () => {
    const { asked } = aQuestionAsked()
    expect(question.KeyQuestion({ question: { ...asked, asking: null } })).toBeNull()
  })
})
