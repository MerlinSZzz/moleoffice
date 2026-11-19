// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ROUND CHAT BUTTON: THE PICTURE IT CARRIES AND HOW ITS NUMBER IS DRAWN, on the settings page.
 * And when it shows, and how the chat opens from it and from the rest of the shell.
 *
 * The whole of this panel: the circle may
 * draw two bubbles of different colours, one for the contacts' unread messages and one for the
 * number of unread groups, or it may draw the two added together as one number; added together is
 * the default, and the choice is made here. Criterion M32.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS STORED ON THE SERVER, NOT IN THIS BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * The four settings above this one are remembered in this browser. This one is stored on the
 * person's own registry row, beside their name and their picture, because it is a thing they decided
 * rather than a thing this computer happens to be set to. The owner also asked for it in the same
 * breath as the panel it changes, and every browser the person uses draws that panel.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS ITS OWN PANEL AND NOT PART OF "YOUR PICTURE, NAME AND STATE"
 * ---------------------------------------------------------------------------------------
 *
 * That panel's shape is criterion M37 and the owner drew it: a picture on the left, a name and a
 * state on the right, each with a pencil. A fifth row for something that is not about the person would be
 * that layout with an extra thing in it.
 *
 * ---------------------------------------------------------------------------------------
 * AND WHY THE PICTURE AND THE NUMBER ARE ONE PANEL
 * ---------------------------------------------------------------------------------------
 *
 * They are two settings about ONE BUTTON. Criterion M38 added the picture and this panel was called
 * "The number on the chat circle"; two panels naming the same button would leave a reader looking
 * for the second, so the panel is named after the button and holds both. Four pictures are kept:
 * mole-at-the-sill, three-moles-at-the-sill,
 * mole-in-a-porthole and two-moles-talking. A decision keeps these choices. Without a choice
 * the button draws mole-at-the-sill in both looks, and no picture here is pressed.
 */

import { useState } from 'react'
import {
  CHAT_BUTTON_STAYS,
  chatButtonStaysBeforeAnybodyChooses,
  CHAT_OPENS_AS,
  CHAT_OPENS_AS_BEFORE_ANYBODY_CHOOSES,
  CIRCLE_BEFORE_ANYBODY_CHOOSES,
  CIRCLE_SHOWS,
  type ChatButtonStays,
  type ChatOpensAs,
  type CircleShows,
} from '@shared/participants.ts'
import {
  CIRCLE_PICTURE_BEFORE_ANYBODY_CHOOSES,
  CIRCLE_PICTURES,
  circlePicture,
  circlePictureUrl,
} from '@shared/messages.ts'
import { t } from '@shared/i18n.ts'
import { settingsControlWord } from '@shared/settings-declaration.ts'
import { BackToNotChosen } from './BackToNotChosen.tsx'
import { api, errorMessage, getActor } from '../api.ts'
import { whereRequestsGo } from '../lib/visiting.ts'
import { useLanguage } from '../lib/language.ts'
import { readTheChatAgain } from './Chat.tsx'
import { ErrorNote, Panel, useAsync } from './ui.tsx'

/** What this panel says, in one place, so a screen and a test read the same words. */
export const CIRCLE_PANEL_WORDS = {
  get title() { return t('chat.circle.title') },
  /** The heading over the four pictures. A label, not a sentence about choosing. */
  get picture() { return t(settingsControlWord('settings.chatbutton', 'chat.circle.picture')) },
  /** The heading over the two ways of drawing the number. */
  get number() { return t(settingsControlWord('settings.chatbutton', 'chat.circle.number')) },
  /** What one picture is called, for a reader who cannot see it. */
  pictureName: (name: string): string => t(circlePicture(name)?.word ?? 'chat.unknownName'),
  /** The label whose value is the choice. A label with a value, not a sentence explaining one. */
  get showing() { return t('chat.circle.showing') },
  /** What each choice counts, drawn beside its press so the colours are never the only thing saying. */
  get merged() { return t(settingsControlWord('settings.chatbutton', 'chat.circle.merged')) },
  get two() { return t(settingsControlWord('settings.chatbutton', 'chat.circle.two')) },
  /** What the button draws while nothing is chosen, named as the picture it is. */
  get notChosen() {
    return t('chatLive.circleNotChosen', { name: CIRCLE_PANEL_WORDS.pictureName(CIRCLE_PICTURE_BEFORE_ANYBODY_CHOOSES) })
  },
  /** What putting the picture back to not chosen will draw. */
  get backPicture() {
    return t('chatLive.circleBackPicture', { name: CIRCLE_PANEL_WORDS.pictureName(CIRCLE_PICTURE_BEFORE_ANYBODY_CHOOSES) })
  },
  /** The heading over when the button shows, and each answer's name and what it does. */
  get stays() { return t(settingsControlWord('settings.chatbutton', 'chat.circle.stays')) },
  staysWord: (which: ChatButtonStays): string =>
    t(settingsControlWord('settings.chatbutton', which === 'always' ? 'chat.circle.staysAlways' : 'chat.circle.staysUnread')),
  staysSays: (which: ChatButtonStays): string =>
    t(settingsControlWord('settings.chatbutton', which === 'always' ? 'chat.circle.staysAlwaysSays' : 'chat.circle.staysUnreadSays')),
  /** The heading over how the chat opens, and each answer's name and what it does. */
  get opens() { return t(settingsControlWord('settings.chatbutton', 'chat.circle.opens')) },
  opensWord: (which: ChatOpensAs): string =>
    t(settingsControlWord('settings.chatbutton', which === 'window' ? 'chat.circle.opensWindow' : 'chat.circle.opensSplit')),
  opensSays: (which: ChatOpensAs): string =>
    t(settingsControlWord('settings.chatbutton', which === 'window' ? 'chat.circle.opensWindowSays' : 'chat.circle.opensSplitSays')),
} as const

export function ChatCirclePanel() {
  useLanguage()
  const [reply, reload] = useAsync(() => api.participants(), [])
  const [fault, setFault] = useState<string | null>(null)

  const actor = getActor()
  const mine = reply.status === 'ready' ? (reply.value.people.find((p) => p.id === actor.id) ?? null) : null
  // NULL ON THE ROW MEANS THE PERSON HAS NEVER CHOSEN, and the default is named once in shared code so that
  // this control and the panel that draws the circle cannot come to different answers about it.
  const chosen: CircleShows = mine?.circleShows ?? CIRCLE_BEFORE_ANYBODY_CHOOSES
  /** Only a saved picture is pressed. With no choice the button draws the default picture. */
  const face = mine?.circlePicture ?? null
  // AND THE SAME FOR WHEN THE BUTTON SHOWS AND HOW THE CHAT OPENS: with nothing chosen, today's answer is pressed.
  const usualStays = chatButtonStaysBeforeAnybodyChooses(actor.type === 'human' ? 'person' : actor.type === 'agent' ? 'agent' : undefined)
  const stays: ChatButtonStays = mine?.chatButtonStays ?? usualStays
  const opensAs: ChatOpensAs = mine?.chatOpensAs ?? CHAT_OPENS_AS_BEFORE_ANYBODY_CHOOSES

  /**
   * WHATEVER THE PERSON PRESSED, THROUGH THE SAME DOOR AND THE SAME READ AFTERWARDS.
   *
   * One function for both settings, because the two presses differ only in the field they send: two
   * copies of this is how one of them stops telling the panel to read itself again.
   */
  const change = (
    what:
      | { circle: CircleShows | '' }
      | { circlePicture: string }
      | { chatButtonStays: ChatButtonStays | '' }
      | { chatOpensAs: ChatOpensAs | '' },
  ): void => {
    if (mine === null) return
    setFault(null)
    void api
      .changeParticipant('person', mine.id, what)
      .then(() => {
        reload()
        // AND THE PANEL READS ITSELF AGAIN. It is mounted on every page, including this one, so a
        // press here has to reach it now rather than the next time they navigate — a press that does
        // nothing until you go somewhere else is a press that does nothing.
        readTheChatAgain()
      })
      .catch((err: unknown) => setFault(errorMessage(err)))
  }

  const pick = (which: CircleShows | ''): void => {
    change({ circle: which })
  }

  const pickTheFace = (name: string): void => {
    change({ circlePicture: name })
  }

  return (
    <Panel declares={{ surface: 'settings.chatbutton' }} titleIs="label" title={CIRCLE_PANEL_WORDS.title}>
      <style href="mole-office-chat-circle" precedence="default">
        {CSS}
      </style>
      {reply.status === 'loading' ? <p>{t('chat.circle.reading')}</p> : null}
      {/* NO LABEL OF ITS OWN. `ErrorNote` already says a read failed, and the server's own words say
          which one — a sentence here would be a third wording of one fact. */}
      {reply.status === 'error' ? <ErrorNote message={reply.message} fault={reply.fault} /> : null}
      {reply.status === 'ready' && mine === null ? (
        <p className="ccl-none">
          <span className="ccl-label">{CIRCLE_PANEL_WORDS.showing}</span>
          <span className="ccl-value">{t('chat.circle.noPerson')}</span>
        </p>
      ) : null}
      {mine === null ? null : (
        <>
          {/* THE FOUR KEPT, criterion M38, each drawn at the size the button draws it. Judging
              one of these from a big copy is judging the wrong thing, which is what the previews page
              says it in the same words. */}
          <h4 className="ccl-heading">{CIRCLE_PANEL_WORDS.picture}</h4>
          <p className="ccl-none ccl-picture-showing">
            <span className="ccl-label">{CIRCLE_PANEL_WORDS.showing}</span>
            <span className="ccl-value">
              {face === null ? CIRCLE_PANEL_WORDS.notChosen : CIRCLE_PANEL_WORDS.pictureName(face)}
            </span>
          </p>
          <div className="ccl-faces" role="group" aria-label={CIRCLE_PANEL_WORDS.picture}>
            {CIRCLE_PICTURES.map((one) => (
              <button
                key={one.name}
                type="button"
                className="ccl-face"
                data-picture={one.name}
                aria-pressed={face === one.name}
                onClick={() => {
                  pickTheFace(one.name)
                }}
              >
                <img
                  className="ccl-face-img"
                  src={whereRequestsGo(circlePictureUrl(one.name))}
                  alt={CIRCLE_PANEL_WORDS.pictureName(one.name)}
                  width={48}
                  height={48}
                />
                <span className="ccl-face-name">{CIRCLE_PANEL_WORDS.pictureName(one.name)}</span>
              </button>
            ))}
          </div>
          {/* AND A WAY BACK TO NOBODY HAVING CHOSEN. It is drawn only
              when a picture has been chosen: an offer to undo something that never happened is not
              an offer. */}
          <BackToNotChosen
            chosen={(mine.circlePicture ?? null) !== null}
            setting={t('chat.circle.pictureSetting')}
            usual={CIRCLE_PANEL_WORDS.pictureName(CIRCLE_PICTURE_BEFORE_ANYBODY_CHOOSES)}
            label={t(settingsControlWord('settings.chatbutton', 'chat.circle.back'))}
            explanation={CIRCLE_PANEL_WORDS.backPicture}
            onPut={() => {
              pickTheFace('')
            }}
          />
          <h4 className="ccl-heading">{CIRCLE_PANEL_WORDS.number}</h4>
        <div className="ccl-choices" role="group" aria-label={CIRCLE_PANEL_WORDS.number}>
          {CIRCLE_SHOWS.map((which) => (
            <button
              key={which}
              type="button"
              className="ccl-choice"
              data-choice={which}
              aria-pressed={chosen === which}
              onClick={() => {
                pick(which)
              }}
            >
              {/* WHAT THE CIRCLE WOULD LOOK LIKE, drawn rather than described. The numbers are the
                  shape of the thing and not a reading of the person's: 3 and 2 stand for the two halves. */}
              <span className="ccl-shows" aria-hidden="true">
                {which === 'merged' ? (
                  <span className="ccl-pill">5</span>
                ) : (
                  <>
                    <span className="ccl-pill">3</span>
                    <span className="ccl-pill ccl-ring">2</span>
                  </>
                )}
              </span>
              <span className="ccl-word">{t(settingsControlWord('settings.chatbutton', which === 'merged' ? 'chat.circle.mergedLabel' : 'chat.circle.twoLabel'))}</span>
              <span className="ccl-counts">{CIRCLE_PANEL_WORDS[which]}</span>
            </button>
          ))}
        </div>
        <BackToNotChosen
          chosen={(mine.circleShows ?? null) !== null}
          setting={t('chat.circle.numberSetting')}
          usual={t('chat.circle.mergedLabel')}
          label={t(settingsControlWord('settings.chatbutton', 'chat.circle.back'))}
          explanation={t(settingsControlWord('settings.chatbutton', 'chat.circle.backNumber'))}
          onPut={() => {
            pick('')
          }}
        />
        {/* WHEN THE BUTTON SHOWS: while something is unread, as it always has, or always in the corner. */}
        <div className="ccl-group" data-chooses="chatButtonStays">
          <h4 className="ccl-heading">{CIRCLE_PANEL_WORDS.stays}</h4>
          <div className="ccl-choices" role="group" aria-label={CIRCLE_PANEL_WORDS.stays}>
            {CHAT_BUTTON_STAYS.map((which) => (
              <button
                key={which}
                type="button"
                className="ccl-choice"
                data-choice={which}
                aria-pressed={stays === which}
                onClick={() => {
                  change({ chatButtonStays: which })
                }}
              >
                <span className="ccl-word">{CIRCLE_PANEL_WORDS.staysWord(which)}</span>
                <span className="ccl-counts">{CIRCLE_PANEL_WORDS.staysSays(which)}</span>
              </button>
            ))}
          </div>
          <BackToNotChosen
            chosen={(mine.chatButtonStays ?? null) !== null}
            setting={CIRCLE_PANEL_WORDS.stays}
            usual={CIRCLE_PANEL_WORDS.staysWord(usualStays)}
            label={t(settingsControlWord('settings.chatbutton', 'chat.circle.back'))}
            explanation={t(settingsControlWord('settings.chatbutton', 'chat.circle.backStays'))}
            onPut={() => {
              change({ chatButtonStays: '' })
            }}
          />
        </div>
        {/* HOW THE CHAT OPENS from the button, the sidebar's Chat row, the phone's bar and the chat key: beside
            the page, as it always has, or in its window. */}
        <div className="ccl-group" data-chooses="chatOpensAs">
          <h4 className="ccl-heading">{CIRCLE_PANEL_WORDS.opens}</h4>
          <div className="ccl-choices" role="group" aria-label={CIRCLE_PANEL_WORDS.opens}>
            {CHAT_OPENS_AS.map((which) => (
              <button
                key={which}
                type="button"
                className="ccl-choice"
                data-choice={which}
                aria-pressed={opensAs === which}
                onClick={() => {
                  change({ chatOpensAs: which })
                }}
              >
                <span className="ccl-word">{CIRCLE_PANEL_WORDS.opensWord(which)}</span>
                <span className="ccl-counts">{CIRCLE_PANEL_WORDS.opensSays(which)}</span>
              </button>
            ))}
          </div>
          <BackToNotChosen
            chosen={(mine.chatOpensAs ?? null) !== null}
            setting={CIRCLE_PANEL_WORDS.opens}
            usual={CIRCLE_PANEL_WORDS.opensWord(CHAT_OPENS_AS_BEFORE_ANYBODY_CHOOSES)}
            label={t(settingsControlWord('settings.chatbutton', 'chat.circle.back'))}
            explanation={t(settingsControlWord('settings.chatbutton', 'chat.circle.backOpens'))}
            onPut={() => {
              change({ chatOpensAs: '' })
            }}
          />
        </div>
        </>
      )}
      {fault === null ? null : (
        <p className="ccl-fault" role="status">
          {fault}
        </p>
      )}
    </Panel>
  )
}

// The rule for the four pictures below, each at the size the button draws it, is criterion M38.
const CSS = `
.ccl-heading {
  margin: 0 0 4px 0;
  font-size: var(--fs-1);
  font-weight: 600;
  color: var(--text-3);
  letter-spacing: .06em;
  text-transform: uppercase;
}
.ccl-heading + * { margin-bottom: var(--pad); }

/* THE FOUR PICTURES, EACH AT THE SIZE THE BUTTON DRAWS IT. */
.ccl-faces { display: flex; flex-wrap: wrap; gap: var(--pad); }

.ccl-face {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text-2);
  cursor: pointer;
}
.ccl-face:hover { background: var(--hover); }
.ccl-face[aria-pressed="true"] { border-color: var(--chosen-edge); color: var(--chosen-ink); background: var(--chosen-bg); box-shadow: var(--chosen-shadow); }

.ccl-face-img {
  display: block;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: var(--border-w) solid var(--border-strong);
  object-fit: cover;
}
.ccl-face-name { font-size: var(--fs-1); }

.ccl-choices { display: flex; flex-wrap: wrap; gap: var(--pad); }
.ccl-group { display: flex; flex-direction: column; margin-top: var(--pad); }

.ccl-choice {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
  padding: var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text-2);
  cursor: pointer;
  text-align: left;
}
.ccl-choice:hover { background: var(--hover); }
.ccl-choice[aria-pressed="true"] { border-color: var(--chosen-edge); color: var(--chosen-ink); background: var(--chosen-bg); box-shadow: var(--chosen-shadow); }

.ccl-shows { display: flex; gap: 0.15rem; align-items: center; }

.ccl-pill {
  min-width: 1.1rem;
  padding: 0 0.25rem;
  border-radius: 999px;
  background: var(--text);
  color: var(--panel);
  font-size: 0.7rem;
  line-height: 1.1rem;
  text-align: center;
}
/* The second bubble, drawn as the panel draws it: hollow with a ring, so the two differ in shape
   as well as in colour. See the note on the same rule in Chat.tsx. */
.ccl-ring {
  background: var(--panel);
  color: var(--accent);
  border: var(--border-w) solid var(--accent);
  line-height: calc(1.1rem - 2 * var(--border-w));
}

.ccl-word { font-size: var(--fs-2); font-weight: 600; }
.ccl-counts { font-size: var(--fs-1); color: var(--text-3); }

.ccl-none { margin: 0; display: flex; flex-wrap: wrap; gap: 6px; font-size: var(--fs-2); }
.ccl-label {
  font-size: var(--fs-1);
  font-weight: 600;
  color: var(--text-3);
  letter-spacing: .06em;
  text-transform: uppercase;
}
.ccl-value { color: var(--text-2); }

.ccl-fault { margin: var(--pad) 0 0 0; font-size: var(--fs-2); color: var(--st-failed); }
`
