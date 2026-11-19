// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
import { useLanguage } from '../lib/language.ts'
/**
 * WHETHER A PERSON IS HERE: ONE DOT, THE WORD BESIDE IT, AND THE THREE ANSWERS BEHIND A PRESS.
 *
 * ---------------------------------------------------------------------------------------
 * WHOSE DESIGN THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * Decision `wvfrwvuzsKF_`: online by default, and the person can set online, offline or invisible.
 * Invisible means an agent sees the person as online only once it has a message from the person. Criterion M20.
 *
 * And its refinement: three buttons stood open, and invisible was drawn green. So it is one dot
 * with the word beside it, pressed to change; never three buttons standing open; and invisible is
 * never drawn green (problem `qe654_q2eHWS`).
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS A COMPONENT OF ITS OWN
 * ---------------------------------------------------------------------------------------
 *
 * It is drawn in three places — the chat panel, the Settings page's profile panel, and a person's
 * own profile page — and it was written into the chat panel's own markup. Problem `D7tLqVTctD2L`
 * asked for it where a person sets their other facts, and copying the markup there would have made
 * two drawings of one control: this repository's named recurring defect, and the one CLAUDE.md says
 * to fix by deleting one rather than by keeping two in step. So there is one, here, and the places
 * that draw it pass in the choice and take back the new one.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE ARE TOLD APART BY SHAPE AS WELL AS BY COLOUR
 * ---------------------------------------------------------------------------------------
 *
 * Filled green for online, filled grey for offline, and a dashed ring with nothing in it for
 * invisible. Colour alone would leave the three unreadable to somebody who cannot separate hues.
 *
 * ---------------------------------------------------------------------------------------
 * IT SHOWS WHAT WAS CHOSEN AND NEVER WHAT WAS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Whether a page of this person's is open is a different question with a different answer, and the
 * chat panel used to draw both at once — a measured dot above the control — so the dot read green
 * while they were invisible. This draws the choice only. `Dot` in `Chat.tsx` is the measured one.
 */
import { useState } from 'react'
import { PRESENCE_CHOICES, type PresenceChoice } from '@shared/participants.ts'
import { CHAT_WORDS } from '@shared/messages.ts'

export function WhetherYouAreHere({
  choice,
  onChoose,
  tone,
}: {
  /** What this person last said. The caller resolves "nobody has chosen" to the default word. */
  choice: PresenceChoice
  onChoose: (next: PresenceChoice) => void
  /**
   * `quiet` under a name in the chat panel, where it is the smallest thing on the row. Anything
   * else takes the ordinary ink, which is what a settings panel wants.
   */
  tone?: 'quiet'
}) {
  useLanguage()
  const [changing, setChanging] = useState(false)
  return (
    <span className="wyh" data-tone={tone}>
      <style href="mole-office-whether-you-are-here" precedence="default">
        {WHETHER_CSS}
      </style>
      <button
        type="button"
        className="wyh-press"
        aria-haspopup="menu"
        aria-expanded={changing}
        aria-label={CHAT_WORDS.whetherYouAreHere}
        title={t(`chat.presence.${choice}.sentence`)}
        onClick={() => {
          setChanging(!changing)
        }}
      >
        <span className="wyh-dot" data-choice={choice} />
        <span className="wyh-word">{t(`chat.presence.${choice}.word`)}</span>
      </button>
      {!changing ? null : (
        <span className="wyh-choices" role="menu" aria-label={CHAT_WORDS.whetherYouAreHere}>
          {PRESENCE_CHOICES.map((one) => (
            <button
              key={one}
              type="button"
              role="menuitemradio"
              className="wyh-is"
              aria-checked={choice === one}
              title={t(`chat.presence.${one}.sentence`)}
              onClick={() => {
                setChanging(false)
                onChoose(one)
              }}
            >
              <span className="wyh-dot" data-choice={one} />
              {t(`chat.presence.${one}.word`)}
            </button>
          ))}
        </span>
      )}
    </span>
  )
}

const WHETHER_CSS = `
/* A SPAN AND NOT A DIV, and the display makes it behave like one. This control is drawn inside the
   labelled line of the profile panel, which is a paragraph -- and a div inside a paragraph is
   invalid HTML that React reports as a hydration error. node tools/review.mjs found it on the
   Settings page and on a person's profile page; nothing else did, which is what that tool is for. */
.wyh { position: relative; display: inline-block; }
.wyh-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
  border: 1.5px solid var(--text-3);
}
/* Filled for online, filled grey for offline, a dashed empty ring for invisible. Shape as well as
   colour, because colour alone is unreadable to somebody who cannot separate hues -- and because
   invisible drawn green told the person the opposite of what they had set. */
.wyh-dot[data-choice='online'] { background: var(--presence-online); border-color: var(--presence-online); }
.wyh-dot[data-choice='offline'] { background: var(--presence-offline); border-color: var(--presence-offline); }
.wyh-dot[data-choice='invisible'] { background: transparent; border-style: dashed; border-color: var(--text-3); }
.wyh-press {
  display: flex;
  gap: 0.3rem;
  align-items: center;
  border: none;
  background: none;
  padding: 0;
  color: var(--text);
  font: inherit;
  font-size: var(--fs-1);
  cursor: pointer;
}
/* The chat panel's, where this is the smallest thing under the person's name. */
.wyh[data-tone='quiet'] .wyh-press { color: var(--text-3); }
.wyh-choices {
  position: absolute;
  /* A span too, for the reason the root is one. */
  z-index: 2;
  top: 100%;
  left: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-strong);
  border-radius: 0.3rem;
  background: var(--panel);
  padding: 0.15rem;
  min-width: 8rem;
}
.wyh-is {
  display: flex;
  gap: 0.35rem;
  align-items: center;
  border: none;
  background: none;
  padding: 0.2rem 0.35rem;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.wyh-is[aria-checked='true'] { font-weight: 700; }
`
