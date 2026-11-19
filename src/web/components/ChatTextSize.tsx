// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `How big the chat's own text is` — Criterion M112.
 *
 * The chat's text size is set in the settings.
 *
 * NOT THE APPEARANCE BAR'S OWN TEXT SIZE. `PresetBar.tsx` already offers Small/Default/Large for
 * the whole app, remembered in this browser. This is a second, narrower control: the chat's list,
 * bubbles and box alone, kept on their own registry row so it reads the same wherever they open Mole
 * Office. `src/shared/participants.ts` says why the two do not collide.
 *
 * FOLLOWS THE PERSON AND NOT THIS BROWSER, the same as the two panels beside it. Which answers
 * exist and what they are called are in `@shared/participants.ts`, so this panel cannot come to
 * call an answer something the chat calls something else.
 *
 * RADIO BUTTONS AND NOT A MENU, for the reason `ChatPictures.tsx` beside it gives: three answers,
 * all short, all visible at once.
 */

import { useState } from 'react'

import { t } from '@shared/i18n.ts'
import { settingsControlWord } from '@shared/settings-declaration.ts'
import { ErrorNote, Loading, Panel, useAsync } from './ui.tsx'
import { CHAT_TEXT_SIZES, CHAT_TEXT_SIZE_BEFORE_ANYBODY_CHOOSES, type ChatTextSize } from '@shared/participants.ts'
import { useLanguage } from '../lib/language.ts'
import { api, errorMessage, getActor } from '../api.ts'
import { readTheChatAgain } from './Chat.tsx'

/** The name of each size. The English is `CHAT_TEXT_SIZE_WORDS`, which en.ts reads. */
const SIZE_WORD = {
  small: 'settingsPanel.chatText.word.small',
  normal: 'settingsPanel.chatText.word.normal',
  large: 'settingsPanel.chatText.word.large',
} as const satisfies Readonly<Record<ChatTextSize, string>>

export function ChatTextSizePanel() {
  useLanguage()
  const [reply, reload] = useAsync(() => api.participants(), [])
  const [fault, setFault] = useState<string | null>(null)
  const actor = getActor()
  const mine = reply.status === 'ready' ? (reply.value.people.find((one: { id: string }) => one.id === actor.id) ?? null) : null
  // NULL ON THE ROW MEANS THEY HAVE NEVER CHOSEN, and the default is named once in shared code so that
  // this control and the chat panel that reads it cannot come to different answers about it.
  const chosen: ChatTextSize = mine?.chatTextSize ?? CHAT_TEXT_SIZE_BEFORE_ANYBODY_CHOOSES

  const chooseIt = (which: ChatTextSize): void => {
    if (mine === null) return
    setFault(null)
    void api
      .changeParticipant('person', mine.id, { chatTextSize: which })
      .then(() => {
        reload()
        // AND THE CHAT READS ITSELF AGAIN, for the reason `ChatPictures.tsx` gives: the chat panel
        // is mounted on this page too, so a press here has to reach it now rather than on the next
        // navigation.
        readTheChatAgain()
      })
      .catch((err: unknown) => setFault(errorMessage(err)))
  }

  return (
    <Panel titleIs="label" declares={{ surface: 'settings.chattextsize' }} title={t('settingsPanel.title.chattextsize')}>
      <style href="mole-office-chat-text-size" precedence="default">
        {CHAT_TEXT_SIZE_CSS}
      </style>
      <fieldset className="ctsz">
        <legend className="ctsz-ask">{t(settingsControlWord('settings.chattextsize', 'settingsPanel.chatText.ask'))}</legend>
        {CHAT_TEXT_SIZES.map((size) => (
          <label className="ctsz-one" key={size} data-chosen={chosen === size ? 'yes' : 'no'} data-size={size}>
            <input
              type="radio"
              name="mole-office-chat-text-size"
              className="ctsz-pick"
              value={size}
              checked={chosen === size}
              disabled={mine === null}
              onChange={() => {
                chooseIt(size)
              }}
            />
            <span className="ctsz-words">
              <span className="ctsz-word" data-sample={size}>
                {t(settingsControlWord('settings.chattextsize', SIZE_WORD[size]))}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      {reply.status === 'loading' ? <Loading what={t('settingsPanel.chatText.whoTakesPart')} /> : null}
      {reply.status === 'error' ? <ErrorNote message={reply.message} fault={reply.fault} /> : null}
      {fault === null ? null : <p className="ctsz-fault">{fault}</p>}
    </Panel>
  )
}

/**
 * The panel's own rules. Every value is a token, so a preset swap re-skins it with everything else.
 *
 * THE NAME ON EACH LABEL IS DRAWN AT A HINT OF THE SIZE IT NAMES, `data-sample`, so a reader sees
 * roughly what they are choosing rather than reading three identical words. It is a hint and not the
 * chat's own scale: this panel does not import Chat.tsx's stylesheet, and inventing the exact ratio
 * twice is the fact-in-two-places defect this project keeps finding, so the steps here are coarser
 * on purpose.
 *
 * NO BACKTICK ANYWHERE IN HERE, comments included: this is a template literal inside a .tsx file.
 */
const CHAT_TEXT_SIZE_CSS = `
.ctsz { margin: 0; padding: 0; border: 0; display: flex; flex-wrap: wrap; align-items: stretch; gap: var(--gut); min-width: 0; }
.ctsz-ask {
  padding: 0; margin-inline-end: var(--gut);
  color: var(--text-2); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui);
}
.ctsz-one {
  display: inline-flex; align-items: flex-start; gap: 6px;
  flex: 1 1 14rem; max-width: 22rem;
  min-height: 30px; padding: var(--pad);
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
  background: var(--panel); color: var(--text);
  cursor: pointer;
}
.ctsz-one:hover { background: var(--hover); }
.ctsz-one[data-chosen="yes"] { border-color: var(--chosen-edge); color: var(--chosen-ink); background: var(--chosen-bg); box-shadow: var(--chosen-shadow); }
.ctsz-one:has(> .ctsz-pick:focus-visible) { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.ctsz-pick { margin-top: 2px; }
.ctsz-words { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ctsz-word { font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); }
.ctsz-word[data-sample="small"] { font-size: 0.75rem; }
.ctsz-word[data-sample="large"] { font-size: 1.05rem; }
.ctsz-fault {
  margin: var(--pad) 0 0; max-width: 40ch;
  padding: 2px var(--pad);
  color: var(--st-failed); background: var(--st-failed-bg);
  border-left: var(--rail) solid var(--st-failed-line);
  border-radius: var(--radius-sm);
  font: var(--fs-1)/var(--lh-tight) var(--font-ui);
}
@media (max-width: 40rem) {
  .ctsz-ask { flex: 1 1 100%; margin-inline-end: 0; }
  .ctsz-one { flex: 1 1 100%; max-width: none; }
}
`
