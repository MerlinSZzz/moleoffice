// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `Review marks` — THE TWO COLOURS REVIEW DRAWS ITS MARKS IN, AND A PERSON MAY CHANGE BOTH.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THERE IS A CONTROL HERE AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * Marker colours are configurable.
 * `review.md` §4.1 gives `review.local` a default of blue and `review.global` a default of amber,
 * and those two are fixed defaults, not a design picking
 * a palette. The colour role register in `src/shared/colourroles.ts` holds both as rows, and the
 * two `--review-local` and `--review-global` tokens in `src/web/tokens.css` are the defaults a
 * fresh browser starts at, one pair per palette.
 *
 * ---------------------------------------------------------------------------------------
 * THE COLOUR IS NEVER WHAT CARRIES THE DISTINCTION, AND THE PREVIEW SHOWS THAT
 * ---------------------------------------------------------------------------------------
 *
 * A comment about one thing draws ONE edge. A comment about the whole thing draws a DOUBLED edge.
 * That is what tells them apart in greyscale, on a projector with a blown channel, and for a reader
 * who cannot see the difference between the two hues at all. Both marks are drawn beside the
 * controls at the size they appear at, so a person choosing a colour is looking at the thing they
 * are changing rather than at a swatch.
 *
 * Set both to the same colour and the two marks are still different, which is the whole claim. The
 * panel does not stop you doing it, because the drawing does not depend on your not doing it.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE CHOICE LIVES, AND WHY IT IS THIS BROWSER'S
 * ---------------------------------------------------------------------------------------
 *
 * `localStorage`, like every other control on this page. `settings-and-governance.md` §3.1: the
 * settings are browser-local end to end and no setting reaches the server. Changing one writes a
 * custom property onto the document root — there is no second copy of the value for the two to
 * disagree about.
 *
 * ---------------------------------------------------------------------------------------
 * NOTHING ON A READING DRAWS THESE TWO TOKENS YET, AND THE PANEL SAYS SO ON THE SCREEN
 * ---------------------------------------------------------------------------------------
 *
 * This paragraph used to read *"so every mark drawn anywhere in the app changes while you watch"*
 * and that was not true of the tree. `--review-local` and `--review-global` are declared in all
 * seven palettes of `src/web/tokens.css` and drawn by NOTHING: review's own frame, band and ring
 * are `--rev` and `--rev-line`, driven by the four `data-review-accent` values, which is a separate
 * vocabulary; the comment mark in `agent-css.ts` is deliberately *"Weight, not hue"*; and the run
 * of words a comment quotes has no edge drawn on it at all. So the dogfood item this control exists
 * for — change a marker colour, open a report with marks on it, confirm it changed — COULD NOT BE
 * PERFORMED, and nothing said so. A person pressed the control, watched the sample beside it move,
 * opened a report and found nothing changed.
 *
 * Two things follow, and both are here rather than in a plan nobody reads:
 *
 *   THE SAMPLE IS DRAWN FROM THE TOKEN, not from React state. It was `--rvm-ink` set inline from a
 *   `useState`, which is the second copy the paragraph above says there is not, and it is why the
 *   sample moved while the product did not. Now the choice reaches the sample the same way it will
 *   reach a reading: written onto `<html>`, read back through `var(--review-local)`. The sample is
 *   the ONE drawing of these tokens in the tree today, and it is the panel's own.
 *
 *   THE PANEL SAYS WHAT IS NOT BUILT. One sentence under the controls, naming review's marker as
 *   the thing that will draw them. `tests/review-mark-tokens.test.ts` holds it in both directions:
 *   while the panel is the only file drawing the tokens the sentence must be there, and the day a
 *   second file draws one the test goes red and the sentence has to go.
 *
 * ---------------------------------------------------------------------------------------
 * THE EIGHT MARK STATES HAVE NO COLOUR HERE, AND THAT IS SAID RATHER THAN HIDDEN
 * ---------------------------------------------------------------------------------------
 *
 * `review.md` §8.2 names eight mark states and gives each a SHAPE — a quote mark filling up, an
 * arrow filling up — and no hue, because the owner named none. `src/shared/reviewmarks.ts` holds
 * them and every one carries `hue: null`. So there is nothing to configure about them and this
 * panel does not draw a control that would change nothing.
 */
import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useState } from 'react'

import { t } from '@shared/i18n.ts'
import { REVIEW_MARK_STATES } from '@shared/reviewmarks.ts'
import { Absence, Panel } from './ui.tsx'
import {
  applyMarkColours,
  DEFAULT_MARK_COLOURS,
  readMarkColours,
  writeMarkColour,
  type MarkColourKey,
} from '../lib/markcolours.ts'
import { useLanguage } from '../lib/language.ts'
import { SentMarksChoice } from './agent/SentMarksChoice.tsx'

/** The two rows, with the reader's question rather than the token's name. */
const ROWS = [
  { key: 'local', label: 'settingsPanel.marks.local', edge: 'one' },
  { key: 'global', label: 'settingsPanel.marks.global', edge: 'doubled' },
] as const satisfies readonly { key: MarkColourKey; label: string; edge: 'one' | 'doubled' }[]

export function ReviewMarksPanel() {
  useLanguage()
  const [colours, setColours] = useState(() => readMarkColours())

  const change = (key: MarkColourKey, to: string): void => {
    const next = { ...colours, [key]: to }
    setColours(next)
    writeMarkColour(key, to)
    applyMarkColours(next)
  }

  const reset = (): void => {
    setColours(DEFAULT_MARK_COLOURS)
    for (const row of ROWS) writeMarkColour(row.key, null)
    applyMarkColours(DEFAULT_MARK_COLOURS)
  }

  return (
    <Panel titleIs="label" declares={{ surface: 'settings.review' }} title={t('settingsPanel.title.review')}>
      <style href="mole-office-review-marks" precedence="default">
        {MARKS_CSS}
      </style>
      <ul className="rvm">
        {ROWS.map((row) => (
          <li key={row.key} className="rvm-row">
            {/* THE MARK ITSELF, at the size it is drawn at on a reading. A swatch would show the
                colour and hide the thing the colour is on. */}
            <span className="rvm-mark" data-edge={row.edge} data-mark-key={row.key} aria-hidden="true">
              {t('settingsPanel.marks.sample')}
            </span>
            <label className="rvm-lab" htmlFor={`rvm-${row.key}`}>
              {t(settingsControlWord('settings.review', row.label))}
            </label>
            <input
              id={`rvm-${row.key}`}
              className="rvm-pick"
              type="color"
              value={colours[row.key]}
              data-colour-for={row.key}
              onChange={(e) => change(row.key, e.target.value)}
            />
          </li>
        ))}
      </ul>
      <div className="rvm-foot">
        <button type="button" className="rvm-reset" onClick={reset}>
          {t(settingsControlWord('settings.review', 'settingsPanel.marks.putBothBack'))}
        </button>
        {/* WHAT IS NOT CONFIGURABLE, NAMED. Eight mark states, eight shapes, no hue between them. */}
        <span className="rvm-note">
          {t('settingsPanel.marks.shapes', { n: Object.keys(REVIEW_MARK_STATES).length })}
        </span>
      </div>
      {/* WHAT IS NOT BUILT, NAMED, on the screen and not only in this file's header.
          THROUGH `Absence`, AT `must-act-on`, which is the tier ui.tsx names for an absence that is
          itself the finding — and it is the one tier that pays sentence weight, which this needs:
          a reader who meets only a quiet dash here goes on believing the control did something.
          `tests/absence-weight.test.ts` refuses a bare paragraph and is right to; the fix was the
          tier, not a number raised in its bypass list.
          `tests/review-mark-tokens.test.ts` reads this sentence off the rendered panel, so it
          cannot be dropped quietly. It names the two colours only: the sent-mark choice below is a
          different thing and is built. On the day a mark draws either colour the sentence is false
          and whoever builds it deletes both. */}
      <Absence
        tier="must-act-on"
        sentence={t('settingsPanel.marks.notBuilt')}
      />
      <SentMarksChoice />
    </Panel>
  )
}

const MARKS_CSS = `
.rvm { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--pad-lg); min-width: 0; }
.rvm-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad) var(--gut); min-width: 0; }
.rvm-lab { flex: 1 1 12rem; font-size: var(--fs-2); color: var(--text-2); min-width: 0; }
/* ONE EDGE AGAINST A DOUBLED EDGE. This is what says which is which when the colour is gone, so it
   is drawn with border-style rather than with a second hue. */
/* THE SAMPLE READS THE TOKEN THE PICKER WRITES, which is the only drawing of either token in the
   tree. It was an inline --rvm-ink off React state, so the sample moved and nothing else did. */
.rvm-mark[data-mark-key='local'] { --rvm-ink: var(--review-local); }
.rvm-mark[data-mark-key='global'] { --rvm-ink: var(--review-global); }
.rvm-mark {
  flex: none; padding: 2px var(--pad); font-size: var(--fs-2); color: var(--text);
  border-left: 3px solid var(--rvm-ink);
}
.rvm-mark[data-edge='doubled'] { border-left-style: double; border-left-width: 6px; }
.rvm-pick { flex: none; width: 3rem; height: 30px; padding: 0; border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm); background: var(--panel); cursor: pointer; }
.rvm-foot { margin: var(--gut) 0 0; display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad) var(--gut); }
.rvm-reset {
  min-height: 30px; padding: 0 var(--pad); border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm); background: var(--panel); color: var(--text);
  font-size: var(--fs-1); font-weight: 600; cursor: pointer;
}
.rvm-reset:hover { background: var(--hover); }
.rvm-note { font-size: var(--fs-1); color: var(--text-3); }
`
