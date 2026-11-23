// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW A RECORD NAMED IN A MESSAGE IS DRAWN, on the settings page.
 *
 * The whole of this panel: the words on a link can be long, and the person chooses
 * between level 1 and level 2 in their settings, with level 1 the default. Criterion M47.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS STORED ON THE SERVER, NOT IN THIS BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * On their own registry row, beside their name and their picture, which is where the chat button's two
 * settings are stored and for the same reason: it is a choice about how the person reads, rather
 * than a thing this computer happens to be set to, and every browser of theirs draws it.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS ITS OWN PANEL AND NOT PART OF "THE CHAT BUTTON"
 * ---------------------------------------------------------------------------------------
 *
 * That panel is about the round button: the picture on it and the number on it. This is about what
 * is inside a message. Two settings about one button is one panel; a setting about the button and a
 * setting about a message is two.
 */

import { useState } from 'react'
import { content, t } from '@shared/i18n.ts'
import { settingsControlWord } from '@shared/settings-declaration.ts'
import {
  MESSAGE_LINK_LAYOUTS,
  MESSAGE_LINK_LAYOUT_BEFORE_ANYBODY_CHOOSES,
  MESSAGE_LINK_LEVELS,
  MESSAGE_LINK_LEVEL_BEFORE_ANYBODY_CHOOSES,
  type MessageLinkLayout,
  type MessageLinkLevel,
} from '@shared/participants.ts'
import { api, errorMessage, getActor } from '../api.ts'
import { readTheChatAgain } from './Chat.tsx'
import { BackToNotChosen } from './BackToNotChosen.tsx'
import { useLanguage } from '../lib/language.ts'
import { useInspect } from '../lib/mode.ts'
import { ErrorNote, Loading, Panel, useAsync } from './ui.tsx'

/** What this panel says, in one place, so a screen and a test read the same words. */
export const MESSAGE_LINK_PANEL_WORDS = {
  get title() { return t('settingsPanel.title.messagelinks') },
  /** The heading over the two names. A label, not a sentence about choosing. */
  get name() { return t(settingsControlWord('settings.messagelinks', 'settingsPanel.links.name')) },
  /** The heading over the two layouts. */
  get place() { return t(settingsControlWord('settings.messagelinks', 'settingsPanel.links.place')) },
  /** The label whose value is the choice, for a reader nothing can be drawn for. */
  get showing() { return t('settingsPanel.links.showing') },
  /** The made-up name and id under each press, so the two choices can be compared at a glance. */
  get exampleLabel() { return t('settingsPanel.links.exampleLabel') },
  get exampleTitle() { return t('settingsPanel.links.exampleTitle') },
  exampleId: '#hUEy7xTi6amC',
  /** The made-up sentence each layout is drawn inside, so the two can be compared at a glance. */
  get sentenceBefore() { return t('settingsPanel.links.sentenceBefore') },
  get sentenceAfter() { return t('settingsPanel.links.sentenceAfter') },
} as const

/**
 * What each choice draws under its own name, in the same shape a message draws it. The chat puts the
 * record id after the name only in developer mode (pVOBOQm2_73I), so the example does the same.
 */
function exampleOf(level: MessageLinkLevel, inspect: boolean): string {
  const name = level === 'label' ? MESSAGE_LINK_PANEL_WORDS.exampleLabel : MESSAGE_LINK_PANEL_WORDS.exampleTitle
  return inspect ? `${name} ${content(MESSAGE_LINK_PANEL_WORDS.exampleId)}` : name
}

/** The name of each level on its press. The English is `MESSAGE_LINK_LEVEL_WORDS`, read by en.ts. */
const LEVEL_WORD_KEY = {
  label: 'settingsPanel.links.level.label',
  title: 'settingsPanel.links.level.title',
} as const satisfies Readonly<Record<MessageLinkLevel, string>>

/** The name of each layout on its press. The English is `MESSAGE_LINK_LAYOUT_WORDS`, read by en.ts. */
const LAYOUT_WORD_KEY = {
  'own-line': 'settingsPanel.links.layout.ownLine',
  inline: 'settingsPanel.links.layout.inline',
} as const satisfies Readonly<Record<MessageLinkLayout, string>>

export function MessageLinksPanel() {
  useLanguage()
  const [reply, reload] = useAsync(() => api.participants(), [])
  const [fault, setFault] = useState<string | null>(null)
  const inspect = useInspect()

  const actor = getActor()
  const mine = reply.status === 'ready' ? (reply.value.people.find((p) => p.id === actor.id) ?? null) : null
  // NULL ON THE ROW MEANS THEY HAVE NEVER CHOSEN, and the default is named once in shared code so that
  // this control and the panel that draws the links cannot come to different answers about it.
  const chosen: MessageLinkLevel = mine?.messageLinkLevel ?? MESSAGE_LINK_LEVEL_BEFORE_ANYBODY_CHOOSES
  /** Where the link sits, or the default because they have never chosen. Criterion M48. */
  const placed: MessageLinkLayout = mine?.messageLinkLayout ?? MESSAGE_LINK_LAYOUT_BEFORE_ANYBODY_CHOOSES

  /**
   * WHATEVER THEY PRESSED, THROUGH THE SAME DOOR AND THE SAME READ AFTERWARDS.
   *
   * One function for both settings, because the two presses differ only in the field they send. Two
   * copies of this is how one of them stops telling the panel to read itself again, which is the
   * argument the chat button's panel makes for the same shape.
   */
  const change = (
    what: { messageLinkLevel: MessageLinkLevel | '' } | { messageLinkLayout: MessageLinkLayout | '' },
  ): void => {
    if (mine === null) return
    setFault(null)
    void api
      .changeParticipant('person', mine.id, what)
      .then(() => {
        reload()
        // AND THE PANEL READS ITSELF AGAIN, for the reason the chat button's panel gives: the
        // messages panel is mounted on this page too, so a press here has to reach it now rather
        // than the next time they navigate.
        readTheChatAgain()
      })
      .catch((err: unknown) => setFault(errorMessage(err)))
  }

  const pick = (which: MessageLinkLevel | ''): void => {
    change({ messageLinkLevel: which })
  }

  const place = (which: MessageLinkLayout | ''): void => {
    change({ messageLinkLayout: which })
  }

  return (
    <Panel titleIs="label" declares={{ surface: 'settings.messagelinks' }} title={t('settingsPanel.title.messagelinks')}>
      <style href="mole-office-message-links" precedence="default">
        {CSS}
      </style>
      {reply.status === 'loading' ? <Loading what={t('settingsPanel.links.whoTakesPart')} /> : null}
      {/* NO LABEL OF ITS OWN, for the reason the chat button's panel gives: `ErrorNote` already says
          a read failed and the server's own words say which one. */}
      {reply.status === 'error' ? <ErrorNote message={reply.message} fault={reply.fault} /> : null}
      {reply.status === 'ready' && mine === null ? (
        <p className="mlk-none">
          <span className="mlk-label">{MESSAGE_LINK_PANEL_WORDS.showing}</span>
          {/* THE ID IS MACHINERY, so normal mode says the same thing without it. */}
          <span className="mlk-value">
            {inspect
              ? t('settingsPanel.links.nobodyAnswersTo', { id: content(actor.id) })
              : t('absence.none')}
          </span>
        </p>
      ) : null}
      {mine === null ? null : (
        <>
          <h4 className="mlk-heading">{MESSAGE_LINK_PANEL_WORDS.name}</h4>
          <div className="mlk-choices" role="group" aria-label={MESSAGE_LINK_PANEL_WORDS.name}>
            {MESSAGE_LINK_LEVELS.map((which) => (
              <button
                key={which}
                type="button"
                className="mlk-choice"
                data-choice={which}
                aria-pressed={chosen === which}
                onClick={() => {
                  pick(which)
                }}
              >
                <span className="mlk-word">{t(settingsControlWord('settings.messagelinks', LEVEL_WORD_KEY[which]))}</span>
                {/* WHAT THE LINK WOULD SAY, drawn as a message draws it rather than described. Both
                    examples are made up and both are marked as examples by being drawn here rather
                    than read from a record. */}
                <span className="mlk-example">{exampleOf(which, inspect)}</span>
              </button>
            ))}
          </div>
          {/* AND A WAY BACK TO NOBODY HAVING CHOSEN. */}
          <BackToNotChosen
            chosen={(mine.messageLinkLevel ?? null) !== null}
            setting={t('settingsPanel.links.nameSetting')}
            usual={t(settingsControlWord('settings.messagelinks', LEVEL_WORD_KEY[MESSAGE_LINK_LEVEL_BEFORE_ANYBODY_CHOOSES]))}
            label={t(settingsControlWord('settings.messagelinks', 'settingsPanel.links.backToNotChosen'))}
            explanation={t('settingsPanel.links.nameBack', {
              usual: t(settingsControlWord('settings.messagelinks', LEVEL_WORD_KEY[MESSAGE_LINK_LEVEL_BEFORE_ANYBODY_CHOOSES])),
            })}
            onPut={() => {
              pick('')
            }}
          />
          {/* AND WHERE THAT LINK SITS, criterion M48: in the sentence, or on a line of its own, centred.
              The usual choice is the shared default, in the sentence since 7 November 2026, and the
              words below name it from that constant. Each press draws the link inside a made-up
              sentence, in the layout it chooses, so the difference between the two is on the screen. */}
          <h4 className="mlk-heading">{MESSAGE_LINK_PANEL_WORDS.place}</h4>
          <div className="mlk-choices" role="group" aria-label={MESSAGE_LINK_PANEL_WORDS.place}>
            {MESSAGE_LINK_LAYOUTS.map((which) => (
              <button
                key={which}
                type="button"
                className="mlk-choice"
                data-place={which}
                aria-pressed={placed === which}
                onClick={() => {
                  place(which)
                }}
              >
                <span className="mlk-word">{t(settingsControlWord('settings.messagelinks', LAYOUT_WORD_KEY[which]))}</span>
                <span className="mlk-bubble">
                  {MESSAGE_LINK_PANEL_WORDS.sentenceBefore}
                  <span className="mlk-example" data-layout={which}>
                    {exampleOf(chosen, inspect)}
                  </span>
                  {MESSAGE_LINK_PANEL_WORDS.sentenceAfter}
                </span>
              </button>
            ))}
          </div>
          <BackToNotChosen
            chosen={(mine.messageLinkLayout ?? null) !== null}
            setting={t('settingsPanel.links.placeSetting')}
            usual={t(settingsControlWord('settings.messagelinks', LAYOUT_WORD_KEY[MESSAGE_LINK_LAYOUT_BEFORE_ANYBODY_CHOOSES]))}
            label={t(settingsControlWord('settings.messagelinks', 'settingsPanel.links.backToNotChosen'))}
            explanation={t('settingsPanel.links.placeBack', {
              usual: t(settingsControlWord('settings.messagelinks', LAYOUT_WORD_KEY[MESSAGE_LINK_LAYOUT_BEFORE_ANYBODY_CHOOSES])),
            })}
            onPut={() => {
              place('')
            }}
          />
        </>
      )}
      {fault === null ? null : (
        <p className="mlk-fault" role="status">
          {fault}
        </p>
      )}
    </Panel>
  )
}

const CSS = `
.mlk-heading {
  margin: 0 0 4px 0;
  font-size: var(--fs-1);
  font-weight: 600;
  color: var(--text-3);
  letter-spacing: .06em;
  text-transform: uppercase;
}

.mlk-choices { display: flex; flex-wrap: wrap; gap: var(--pad); }

.mlk-choice {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
  max-width: 22rem;
  padding: var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text-2);
  cursor: pointer;
  text-align: left;
}
.mlk-choice:hover { background: var(--hover); }
.mlk-choice[aria-pressed="true"] { border-color: var(--chosen-edge); color: var(--chosen-ink); background: var(--chosen-bg); box-shadow: var(--chosen-shadow); }

.mlk-word { font-size: var(--fs-2); font-weight: 600; }
/* THE EXAMPLE IS DRAWN THE WAY A MESSAGE DRAWS A LINK, underlined and in the link ink, so what is
   being chosen is on the screen rather than described. It is not a link and does not press. */
.mlk-example {
  font-size: var(--fs-1);
  color: var(--link, var(--text));
  text-decoration: underline;
  overflow-wrap: anywhere;
}

/* THE MADE-UP BUBBLE EACH LAYOUT IS DRAWN INSIDE. It is the width a chat bubble is, so the example
   wraps the way the real thing wraps. The rules under it are the two the panel itself uses, written
   here as well because this is a drawing of a message and not a message. */
.mlk-bubble {
  display: block;
  width: 15rem;
  max-width: 100%;
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius);
  padding: 0.35rem 0.5rem;
  font-size: var(--fs-1);
  overflow-wrap: anywhere;
}
.mlk-bubble .mlk-example[data-layout='own-line'] { display: inline-block; width: 100%; text-align: center; }
.mlk-bubble .mlk-example[data-layout='inline'] { display: inline; text-align: inherit; }

.mlk-none { margin: 0; display: flex; flex-wrap: wrap; gap: 6px; font-size: var(--fs-2); }
.mlk-label {
  font-size: var(--fs-1);
  font-weight: 600;
  color: var(--text-3);
  letter-spacing: .06em;
  text-transform: uppercase;
}
.mlk-value { color: var(--text-2); }

.mlk-fault { margin: var(--pad) 0 0 0; font-size: var(--fs-2); color: var(--st-failed); }
`
