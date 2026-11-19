// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN EMPTY WEEK BOARD SAYS SO IN WORDS, IN BOTH LANGUAGES.
 *
 * Problem `Qpy8XkD6KzS7`: on a week with no blocks, the board drew a lone dash. The sentence that
 * explained it was only on the dash's tooltip and in screen-reader text clipped to one pixel, and
 * there is no press beside it there, so a sighted reader was left to guess. The board now draws the
 * sentence itself. The other empty periods on the page keep their dash, because a press sits beside
 * each of them.
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, describe, expect, it } from 'vitest'
import { setWordLanguage, t } from '../src/shared/i18n.ts'
import { WeekBoard } from '../src/web/components/Planning.tsx'

const noop = () => {}

afterAll(() => setWordLanguage('en'))

/** The board's markup with the hoisted style blocks taken out, so a stylesheet is not evidence. */
function emptyBoard(): string {
  const board = { windows: [] }
  return renderToStaticMarkup(
    h(WeekBoard as never, {
      period: '2026-W41',
      windows: { status: 'ready', value: board },
      board,
      onBlockChanged: noop,
      onBlockUnplaced: noop,
      readWindowsAgain: noop,
      editing: false,
      todayDay: null,
      allocatable: [],
      onWrote: noop,
    } as never),
  ).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

/** What a sighted reader sees: the markup with screen-reader-only text and every tag removed. */
function seen(markup: string): string {
  return markup
    .replace(/<span class="px-sr">[\s\S]*?<\/span>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
}

describe('a week with nothing placed on its board', () => {
  for (const language of ['en', 'zh'] as const) {
    it(`draws the sentence that explains it, in ${language}`, () => {
      setWordLanguage(language)
      const sentence = t('schedule.emptyWeek')
      const markup = emptyBoard()
      expect(seen(markup)).toContain(sentence)
      // Not a lone dash: the drawn sentence replaces the mark, it does not sit beside it.
      expect(markup).not.toContain('px-absent')
    })
  }
})
