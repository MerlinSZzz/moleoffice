// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ROLE CARD'S HOW IT WORKS, DRAWN. The one drawing every page that shows a card's How it works uses.
 *
 * A card's How it works is its `howItWorks` text from design/permissions/roles.json, in the page's
 * language. The same text is the first part of the handbook the office sends
 * an agent given that card. Until wave 13k round 17 the three pages that draw
 * a card (the list at #/roles, a card's record page, an agent's profile) drew the card's older `flow`
 * notes under this heading, so a page and the handbook said two different things about one card. Now
 * each asks `theHowItWorksOf` in src/shared/roles.ts for the text and draws it here.
 *
 * THE TEXT IS WRITTEN IN A SMALL MARKDOWN: bold lines, numbered steps, an italic Example line, blank
 * lines between paragraphs. It is drawn by `renderMarkdown`, the reports' and the chat's own reader,
 * so the steps are a real numbered list and the bold is real bold. There is no second reader here.
 *
 * A CARD WITH NO SUCH TEXT DRAWS NOTHING. The pages ask `howItWorksHere` first and draw no heading when
 * it answers null. They never fall back to the flow: that would be the older text under the new name.
 *
 * IT IS FOLDED ON EVERY LOAD, AND SHOWS ITS FIRST THREE POINTS. As item 4 of a decision says, a
 * role card's way of working is folded by default, and folded it shows only its first few
 * points. One press shows the rest, and nothing remembers the press, so the
 * next load is folded again. Every page that draws a card's How it works draws it here, so every
 * one of them folds the same way.
 * WHY THREE: every card's text opens with its one-line summary, and its first three points say who
 * starts the agent, what it is given and what it does first. That is enough to tell the cards apart,
 * and it keeps the folded text near one screen at 390 wide. Every card in
 * design/permissions/roles.json has at least five points, so the press always has something to show.
 *
 * THE BOLD "HOW IT WORKS" LINE STAYS IN THE TEXT. Item 6 of the same decision keeps it there,
 * because the same text is the handbook an agent is sent, and the handbook has no other
 * heading. A page that already draws that heading above the text may leave
 * the line out (`underAHeading`), so the page does not say "How it works" twice in a row.
 */

import { useId, useState } from 'react'
import { t, wordLanguage } from '@shared/i18n.ts'
import { theHowItWorksOf } from '@shared/roles.ts'
import { renderMarkdown, SummaryStyle } from './SummaryBlocks.tsx'

/** How many numbered points a folded How it works shows. The reason is in the note at the top. */
export const POINTS_SHOWN_FOLDED = 3

const A_NUMBERED_POINT = /^\d+\. /
const A_BOLD_LINE = /^\*\*[^*]+\*\*$/

/**
 * The text without the bold line that heads its numbered points, for a page that draws that heading
 * itself. The line is found by its place, not by its words: a line that is bold and nothing else,
 * followed by the first numbered point after blank lines. So it is found in every language, and a
 * text with no such line is returned as it is.
 */
export function withoutTheListsHeading(text: string): string {
  const lines = text.split('\n')
  const first = lines.findIndex((line) => A_NUMBERED_POINT.test(line))
  if (first < 0) return text
  let at = first - 1
  while (at >= 0 && (lines[at] ?? '').trim() === '') at--
  if (at < 0 || !A_BOLD_LINE.test((lines[at] ?? '').trim())) return text
  return [...lines.slice(0, at), ...lines.slice(first)].join('\n')
}

/**
 * THE TEXT AS IT IS DRAWN FOLDED, and how many points it has in all, or null when there is nothing
 * to fold. Folded, the text runs up to the end of its first `shown` numbered points; the rest of the
 * points, and anything after them such as the example, is what the press shows.
 */
export function theFoldOf(text: string, shown: number = POINTS_SHOWN_FOLDED): { folded: string; points: number } | null {
  const lines = text.split('\n')
  const points = lines.flatMap((line, at) => (A_NUMBERED_POINT.test(line) ? [at] : []))
  const cut = points[shown]
  if (cut === undefined) return null
  return { folded: lines.slice(0, cut).join('\n').trimEnd(), points: points.length }
}

/**
 * The card's How it works in the language the page is drawn in, or null because it carries none.
 *
 * The test language reads the English. The text is the card's content, written in English and
 * Chinese, and a page in the test language marks its own words and never a writer's text.
 */
export function howItWorksHere(card: unknown): string | null {
  const language = wordLanguage()
  return theHowItWorksOf(card, language === 'xx' ? 'en' : language)
}

/**
 * The text, drawn as paragraphs, bold and numbered lists, folded to its first points until it is
 * pressed open. `hiw` is what a test reads it by, and `data-folded` says which way it is drawn.
 * `underAHeading` is for a page that draws the How it works heading above it: the text's own bold
 * line of that heading is then left out.
 */
export function HowItWorksText({ text, underAHeading = false }: { text: string; underAHeading?: boolean }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const whole = underAHeading ? withoutTheListsHeading(text) : text
  const fold = theFoldOf(whole)
  const drawn = fold === null || open ? whole : fold.folded
  return (
    <div className="sb hiw" data-how-it-works="" data-folded={fold === null ? undefined : open ? 'open' : 'folded'}>
      <SummaryStyle />
      <style href="mole-office-how-it-works" precedence="default">
        {HOW_IT_WORKS_CSS}
      </style>
      <div className="hiw-text" id={id}>
        {renderMarkdown(drawn, 'hiw')}
      </div>
      {fold === null ? null : (
        <button
          type="button"
          className="hiw-more"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
        >
          {open
            ? t('howItWorks.fold.close', { n: POINTS_SHOWN_FOLDED })
            : t('howItWorks.fold.open', { n: fold.points })}
        </button>
      )}
    </div>
  )
}

/*
 * THE SAME SIZE AND FACE AS THE CARD'S OTHER WORDS. A report sets its reading text a step larger than a card's
 * duties; here the handbook sits under the duties and is read the same way, so it takes their size.
 * NO BACKTICK ANYWHERE IN HERE: this is a template literal and one would close it.
 */
const HOW_IT_WORKS_CSS = `
.hiw {
  --sb-read: var(--fs-2);
  --sb-gap: calc(var(--pad) / 1.5);
  display: flex; flex-direction: column; gap: var(--sb-gap);
  min-width: 0; max-width: var(--measure-in-box);
  overflow-wrap: anywhere;
}
.hiw > * { margin: 0; }
.hiw-text { display: flex; flex-direction: column; gap: var(--sb-gap); min-width: 0; }
.hiw-text > * { margin: 0; }
/* THE PRESS THAT OPENS AND FOLDS THE POINTS. A small framed press under the last point drawn, in the
   interface face, so it reads as a control and not as one more line of the handbook. */
.hiw-more {
  align-self: flex-start;
  min-height: 26px; padding: 0 var(--pad);
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
  background: var(--panel); color: var(--text);
  font-family: var(--font-ui); font-size: var(--fs-1); font-weight: 600; cursor: pointer;
}
.hiw-more:hover { background: var(--hover); }
/* AND IN THE SAME TYPE. A report sets its prose in the reading face; a card sets every other part in
   the interface face, and a handbook in a second face beside them read as a pasted-in document. */
.hiw .sb-p, .hiw .sb-list { font-family: var(--font-ui); }
`
