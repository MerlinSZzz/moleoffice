// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `Pictures in a message` — THE TWO SETTINGS ABOUT WHAT A MESSAGE DRAWS. Criteria M64 and M73.
 *
 * The pictures setting has three options: a picture is shown at once, shown after a press, or
 * drawn as its path only.
 *
 * The project mark: switching to another project made a line saying
 * which project a message was in appear under messages that had not changed, and it is now
 * always drawn or never drawn, by a setting of the person's own, off by default.
 *
 * BOTH FOLLOW THE PERSON AND NOT THIS BROWSER. The pictures one was a browser setting until decision
 * rJphPkCG3l7X, and both are on their registry row now, beside the two about how a link in a message
 * is drawn.
 *
 * THE PANEL HOLDS THE CONTROLS AND NOT THE RULES. Which answers exist and what they are called are
 * in `@shared/messagepictures.ts` and `@shared/participants.ts`; what this browser has been told they
 * chose is in `lib/messagepictures.ts`. So this file cannot come to call an answer something the
 * conversation calls something else.
 *
 * RADIO BUTTONS AND NOT A MENU, for the reason the panel beside it gives: few answers, all short,
 * and all of them visible at once. A menu hides them behind a press.
 */

import { useState } from 'react'

import { t } from '@shared/i18n.ts'
import { settingsControlWord } from '@shared/settings-declaration.ts'
import { ErrorNote, Loading, Panel, useAsync } from './ui.tsx'
import { MESSAGE_PICTURE_CHOICES, type MessagePictureChoice } from '@shared/messagepictures.ts'
import {
  MESSAGE_PROJECT_MARKS,
  MESSAGE_PROJECT_MARK_BEFORE_ANYBODY_CHOOSES,
  type MessageProjectMark,
} from '@shared/participants.ts'
import { useLanguage } from '../lib/language.ts'
import { chooseMessagePictures, useMessagePicturesWithFault } from '../lib/messagepictures.ts'
import { api, errorMessage, getActor } from '../api.ts'
import { readTheChatAgain } from './Chat.tsx'

/** The name of each answer. The English is `MESSAGE_PICTURE_WORDS`, which en.ts reads. */
const PICTURE_WORD = {
  shown: 'settingsPanel.pictures.word.shown',
  pressed: 'settingsPanel.pictures.word.pressed',
  path: 'settingsPanel.pictures.word.path',
} as const satisfies Readonly<Record<MessagePictureChoice, string>>

/** The name of each answer about the mark. The English is `MESSAGE_PROJECT_MARK_WORDS`, which en.ts reads. */
const MARK_WORD = {
  always: 'settingsPanel.pictures.mark.always',
  never: 'settingsPanel.pictures.mark.never',
} as const satisfies Readonly<Record<MessageProjectMark, string>>

export function ChatPicturesPanel() {
  useLanguage()
  const chosen = useMessagePicturesWithFault()
  const [reply, reload] = useAsync(() => api.participants(), [])
  const [fault, setFault] = useState<string | null>(null)
  const actor = getActor()
  const mine = reply.status === 'ready' ? (reply.value.people.find((one: { id: string }) => one.id === actor.id) ?? null) : null
  // NULL ON THE ROW MEANS THEY HAVE NEVER CHOSEN, and the default is named once in shared code so that
  // this control and the panel that draws the mark cannot come to different answers about it.
  const marked: MessageProjectMark = mine?.messageProjectMark ?? MESSAGE_PROJECT_MARK_BEFORE_ANYBODY_CHOOSES

  const markIt = (which: MessageProjectMark): void => {
    if (mine === null) return
    setFault(null)
    void api
      .changeParticipant('person', mine.id, { messageProjectMark: which })
      .then(() => {
        reload()
        // AND THE CHAT READS ITSELF AGAIN, for the reason the links panel gives: the chat panel is
        // mounted on this page too, so a press here has to reach it now rather than the next time
        // they navigate.
        readTheChatAgain()
      })
      .catch((err: unknown) => setFault(errorMessage(err)))
  }

  return (
    <Panel titleIs="label" declares={{ surface: 'settings.chatpictures' }} title={t('settingsPanel.title.chatpictures')}>
      <style href="mole-office-chat-pictures" precedence="default">
        {CHAT_PICTURES_CSS}
      </style>
      <fieldset className="cpx">
        <legend className="cpx-ask">{t(settingsControlWord('settings.chatpictures', 'settingsPanel.pictures.ask'))}</legend>
        {MESSAGE_PICTURE_CHOICES.map((choice) => (
          <label className="cpx-one" key={choice} data-chosen={chosen.choice === choice ? 'yes' : 'no'}>
            <input
              type="radio"
              name="mole-office-chat-pictures"
              className="cpx-pick"
              value={choice}
              checked={chosen.choice === choice}
              onChange={() => {
                chooseMessagePictures(choice)
              }}
            />
            <span className="cpx-words">
              <span className="cpx-word">{t(settingsControlWord('settings.chatpictures', PICTURE_WORD[choice]))}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {/* THE WRITE WAS REFUSED, said beside the control rather than in a console. The fault is the
          server's own words from PATCH /api/participants, and the choice still applies while the
          page is open, which is a different thing from it failing. This comment used to describe a
          localStorage failure: the setting has been on their registry row since decision rJphPkCG3l7X,
          so the only way this write fails is the API refusing it. */}
      {chosen.fault === null ? null : <p className="cpx-fault">{chosen.fault}</p>}

      {/* WHETHER A MESSAGE SAYS WHICH PROJECT IT IS IN. Criterion M73. */}
      <fieldset className="cpx">
        <legend className="cpx-ask">{t(settingsControlWord('settings.chatpictures', 'settingsPanel.pictures.markAsk'))}</legend>
        {MESSAGE_PROJECT_MARKS.map((which) => (
          <label className="cpx-one" key={which} data-chosen={marked === which ? 'yes' : 'no'}>
            <input
              type="radio"
              name="mole-office-message-project-mark"
              className="cpx-pick"
              value={which}
              checked={marked === which}
              disabled={mine === null}
              onChange={() => {
                markIt(which)
              }}
            />
            <span className="cpx-words">
              <span className="cpx-word">{t(settingsControlWord('settings.chatpictures', MARK_WORD[which]))}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {reply.status === 'loading' ? <Loading what={t('settingsPanel.pictures.whoTakesPart')} /> : null}
      {reply.status === 'error' ? <ErrorNote message={reply.message} fault={reply.fault} /> : null}
      {fault === null ? null : <p className="cpx-fault">{fault}</p>}
    </Panel>
  )
}

/**
 * The panel's own rules. Every value is a token, so a preset swap re-skins it with everything else.
 *
 * NO BACKTICK ANYWHERE IN HERE, comments included: this is a template literal inside a .tsx file.
 */
const CHAT_PICTURES_CSS = `
.cpx { margin: 0; padding: 0; border: 0; display: flex; flex-wrap: wrap; align-items: stretch; gap: var(--gut); min-width: 0; }
.cpx-ask {
  padding: 0; margin-inline-end: var(--gut);
  color: var(--text-2); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui);
}
.cpx-one {
  display: inline-flex; align-items: flex-start; gap: 6px;
  flex: 1 1 14rem; max-width: 22rem;
  min-height: 30px; padding: var(--pad);
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
  background: var(--panel); color: var(--text);
  cursor: pointer;
}
.cpx-one:hover { background: var(--hover); }
.cpx-one[data-chosen="yes"] { border-color: var(--chosen-edge); color: var(--chosen-ink); background: var(--chosen-bg); box-shadow: var(--chosen-shadow); }
.cpx-one:has(> .cpx-pick:focus-visible) { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.cpx-pick { margin-top: 2px; }
.cpx-words { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cpx-word { font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); }
.cpx-fault {
  margin: var(--pad) 0 0; max-width: 40ch;
  padding: 2px var(--pad);
  color: var(--st-failed); background: var(--st-failed-bg);
  border-left: var(--rail) solid var(--st-failed-line);
  border-radius: var(--radius-sm);
  font: var(--fs-1)/var(--lh-tight) var(--font-ui);
}
@media (max-width: 40rem) {
  .cpx-ask { flex: 1 1 100%; margin-inline-end: 0; }
  .cpx-one { flex: 1 1 100%; max-width: none; }
}
`
