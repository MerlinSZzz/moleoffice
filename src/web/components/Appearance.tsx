// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * YOUR OWN PICTURE, NAME AND STATE, on the settings page.
 *
 * An avatar is a resource of the
 * interface, like its appearance settings. So it sits beside how Mole Office looks rather than on a
 * page of its own.
 *
 * ---------------------------------------------------------------------------------------
 * THE SHAPE OF THE PANEL
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M37. The picture is changed by pressing it, not by two separate buttons under it,
 * and a "Use the drawn one" button is not needed: a person who wants no new picture presses
 * nothing. The handle under the name looked like a second name, and it is not drawn (see below).
 *
 * So: the picture on the left, pressed to change it. On the right, `Name:` and the name with a pencil, and
 * under it `Status:` with a pencil. Each pencil edits its line where it stands.
 *
 * WHAT WENT. Two presses under the picture — one to choose a file, one called "Use the drawn one" —
 * and the lower-case handle drawn under their name, which they could not account for and which is an
 * address rather than a second name. The file chooser moved into the picker, where the rest of the
 * choosing is: losing it would have taken away sending their own picture, which they did not ask to
 * lose. "Use the drawn one" is gone outright, because the drawn set is in the picker and the one
 * this product made for them is marked in it.
 *
 * ---------------------------------------------------------------------------------------
 * THE PRESETS ARE OFFERED HERE AND ARE NOT A LIST THE DOOR KNOWS
 * ---------------------------------------------------------------------------------------
 *
 * `working`, `away` and `do not disturb` are three presses instead of typing. What is stored is the
 * text and only the text: the door has no list to check against, so a state nobody thought of is
 * kept. Criterion M4's own word is that a state is one you set yourself, and a state somebody else
 * has to approve is not that.
 */

import { useState } from 'react'
import { content, t } from '@shared/i18n.ts'
import { settingsControlWord } from '@shared/settings-declaration.ts'
import {
  PRESENCE_BEFORE_ANYBODY_CHOOSES,
  STATE_MAX,
  STATE_PRESETS,
  type PresenceChoice,
} from '@shared/participants.ts'
import { api, ApiError, errorMessage, getActor, type ParticipantOnTheWire } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { useInspect } from '../lib/mode.ts'
import { WhetherYouAreHere } from './WhetherYouAreHere.tsx'
import { BackToNotChosen } from './BackToNotChosen.tsx'
import { Avatar } from './Avatar.tsx'
import { AvatarPicker } from './AvatarPicker.tsx'
import { ErrorNote, Loading, Panel, useAsync } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'

/** Every word this panel draws, in one place, so a screen and a test read the same words. */
export const APPEARANCE_WORDS = {
  /** The two labels, each with its value beside it. */
  get name() { return t('settingsPanel.profile.name') },
  get status() { return t('settingsPanel.profile.status') },
  /** The value under `Status` when nobody has set one. */
  get noState() { return t('settingsPanel.profile.noState') },
  /** The third line, which is a choice rather than a piece of text. */
  get here() { return t('settingsPanel.profile.here') },
  /** What the pencil does, said for a reader who cannot see a pencil. */
  get editName() { return t(settingsControlWord('settings.appearance', 'settingsPanel.profile.editName')) },
  get editStatus() { return t(settingsControlWord('settings.appearance', 'settingsPanel.profile.editStatus')) },
  /** What pressing the picture does. */
  get changePicture() { return t(settingsControlWord('settings.appearance', 'settingsPanel.profile.changePicture')) },
  /** The two presses inside an open editor. */
  get keep() { return t(settingsControlWord('settings.appearance', 'settingsPanel.profile.keep')) },
  get leave() { return t(settingsControlWord('settings.appearance', 'settingsPanel.profile.leave')) },
  /** The pencil itself. It is a mark and never the only thing saying what a press does. */
  pencil: '✎',
} as const

export function AppearancePanel() {
  useLanguage()
  const developer = useInspect()
  const actor = getActor()
  /**
   * THE PERSON'S OWN ROW, AND NOT THE WHOLE LIST. The panel draws one person, so it asks for that one row. Reading
   * every participant to find it held Settings at "loading" for seconds each time it was entered, on an office with
   * many agents. When no person answers to this id the door says 404, and the panel says so as it did before. The
   * last answer is kept, so Settings entered again draws it at once while it is read again.
   */
  const [reply, reload] = useAsync(
    () => api.participant('person', actor.id).then(
      (answer) => answer.participant,
      (err: unknown) => {
        if (err instanceof ApiError && err.status === 404) return null
        throw err
      },
    ),
    [actor.id],
    { keep: 'settings.appearance.you' },
  )
  /**
   * WHETHER THEY ARE HERE, WHICH IS A SECOND READ BECAUSE IT IS A SECOND FACT.
   *
   * The registry row says their name, their picture and their status line. What they last said about being
   * here is not on it: it is on the presence reading, beside the colour that reading works out. So
   * this panel asks for both. `null` while it is loading, and the control shows the default word
   * that a person who has never chosen is read as -- which is what the server would say too.
   */
  const [presence, reloadPresence] = useProjectAsync(() => api.presence(), [])
  const [saving, setSaving] = useState<string | null>(null)
  const [fault, setFault] = useState<string | null>(null)

  const mine = reply.status === 'ready' ? reply.value : null
  const myPresence =
    presence.status === 'ready'
      ? (presence.value.presence.find((one) => one.who.kind === 'person' && one.who.id === actor.id) ?? null)
      : null

  const run = (what: Promise<unknown>): void => {
    setFault(null)
    void what
      .then(() => {
        setSaving(null)
        reload()
        reloadPresence()
      })
      .catch((err: unknown) => {
        setSaving(null)
        setFault(errorMessage(err))
      })
  }

  return (
    <Panel titleIs="label" declares={{ surface: 'settings.appearance' }} title={t('settingsPanel.title.appearance')}>
      {reply.status === 'loading' ? <Loading what={t('settingsPanel.profile.whoTakesPart')} /> : null}
      {reply.status === 'error' ? (
        <ErrorNote message={reply.message} fault={reply.fault} label={t('settingsPanel.profile.registriesUnread')} />
      ) : null}
      {reply.status === 'ready' && mine === null ? (
        <p className="app-said">
          {/* THE ID IS MACHINERY, so normal mode says the same thing without it. */}
          {developer
            ? t('settingsPanel.profile.nobodyAnswersTo', { id: content(actor.id) })
            : t('settingsPanel.profile.nobodyAnswers')}
        </p>
      ) : null}
      {mine === null ? null : (
        <YourAppearance
          person={mine}
          presence={myPresence?.choice ?? null}
          busy={saving}
          fault={fault}
          onPresence={(choice) => {
            setSaving('presence')
            run(api.changeParticipant('person', mine.id, { presence: choice }))
          }}
          onPresenceForgotten={() => {
            setSaving('presence')
            run(api.changeParticipant('person', mine.id, { presence: '' }))
          }}
          onPicked={reload}
          onName={(name) => {
            setSaving('name')
            run(api.changeParticipant('person', mine.id, { name }))
          }}
          onState={(state) => {
            setSaving('state')
            run(api.changeParticipant('person', mine.id, { state }))
          }}
          onPicture={(bytes) => {
            setSaving('picture')
            run(api.sendAvatar('person', mine.id, { bytes }))
          }}
        />
      )}
    </Panel>
  )
}

/**
 * The whole panel below its first line, given one person.
 *
 * EXPORTED FOR A TEST AND NOT FOR A CALLER, the way `WorkingReading` is: this half can be rendered
 * without a fetch, so what it draws can be checked. The panel above it fetches and cannot.
 */
export function YourAppearance({
  person,
  presence,
  busy,
  fault,
  onName,
  onState,
  onPresence,
  onPresenceForgotten,
  onPicture,
  onPicked,
}: {
  person: ParticipantOnTheWire
  /**
   * WHAT THIS PERSON LAST SAID ABOUT BEING HERE, or null because they never said.
   *
   * Null is drawn as the word a person who has never chosen is read as, which is the shared
   * constant rather than a word written here -- so the control and the server cannot come to
   * different answers about what the default is.
   */
  presence: PresenceChoice | null
  busy: string | null
  fault: string | null
  onName: (name: string) => void
  onState: (state: string) => void
  onPresence: (choice: PresenceChoice) => void
  /** Put the row back to nobody having chosen, which the door does on an empty word. */
  onPresenceForgotten: () => void
  onPicture: (bytes: string) => void
  /** Called after the picker has stored one, so this panel reads the person again. */
  onPicked: () => void
}) {
  useLanguage()
  /** Which line is being edited, or null because none is. Only ever one at a time. */
  const [editing, setEditing] = useState<'name' | 'state' | null>(null)
  const [picking, setPicking] = useState(false)
  const [typed, setTyped] = useState('')

  const start = (which: 'name' | 'state'): void => {
    setTyped(which === 'name' ? person.name : (person.state ?? ''))
    setEditing(which)
  }

  const keep = (): void => {
    if (editing === 'name') {
      if (typed.trim() !== '' && typed !== person.name) onName(typed)
    } else if (editing === 'state') {
      if (typed !== (person.state ?? '')) onState(typed)
    }
    setEditing(null)
  }

  return (
    <div className="app-body">
      {/*
        THE RULES SHIP WITH THE MARKUP THEY STYLE, and they used to ship with the panel above.
        `YourAppearance` is exported and the profile page draws it (criterion M51), so on that page
        the markup arrived and the stylesheet did not: the labels lost their small capitals and ran
        into their values — "NameWren" at 390. Found by photograph on 6 September 2026. React
        hoists this by `href`, so drawing it in both places is still one element.
      */}
      <style href="mole-office-appearance" precedence="default">
        {CSS}
      </style>
      <div className="app-who">
        {/* THE PICTURE, PRESSED TO CHANGE IT. The picker opens
            under this row rather than over it, so nothing they were reading moves. */}
        <button
          type="button"
          className="app-face"
          aria-expanded={picking}
          aria-label={APPEARANCE_WORDS.changePicture}
          title={APPEARANCE_WORDS.changePicture}
          onClick={() => {
            setPicking(!picking)
          }}
        >
          <Avatar kind="person" id={person.id} name={person.name} url={person.avatarUrl} size={64} />
        </button>

        <div className="app-lines">
          {/* THE NAME, WITH A PENCIL, pressed to change it.
              The handle is not drawn: it is an address, not a second name, though it
              looked like one. It is still what they write as, and the panel above this one says so. */}
          <Line
            line="name"
            label={APPEARANCE_WORDS.name}
            value={content(person.name)}
            what={APPEARANCE_WORDS.editName}
            editing={editing === 'name'}
            typed={typed}
            onTyped={setTyped}
            onStart={() => {
              start('name')
            }}
            onKeep={keep}
            onLeave={() => {
              setEditing(null)
            }}
          />
          {/* STATUS, WITH A PENCIL, under the name, pressed to change it.
              Its editor offers the three presets as well as the box, which is what the panel
              always did; what is stored is the text and only the text. */}
          <Line
            line="status"
            label={APPEARANCE_WORDS.status}
            value={person.state === null ? APPEARANCE_WORDS.noState : content(person.state)}
            unset={person.state === null}
            what={APPEARANCE_WORDS.editStatus}
            editing={editing === 'state'}
            typed={typed}
            onTyped={setTyped}
            onStart={() => {
              start('state')
            }}
            onKeep={keep}
            onLeave={() => {
              setEditing(null)
            }}
          >
            <div className="app-presets">
              {STATE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-pressed={typed === preset}
                  onClick={() => {
                    setTyped(preset)
                  }}
                >
                  {t(`chat.preset.${preset}`)}
                </button>
              ))}
            </div>
          </Line>
          {/* WHETHER THE PERSON IS HERE, under the status line, because they are the two things the person says
              about themselves and the other two lines are what the person is called and what they look like.
              Problem D7tLqVTctD2L: this could only be set in the chat panel, so the page a person
              opens to set their own facts could not set this one. The control is the chat panel's
              own component rather than a second one shaped like it. */}
          <p className="app-line" data-line="here">
            <span className="app-label">{APPEARANCE_WORDS.here}</span>
            <span className="app-value">
              <WhetherYouAreHere
                choice={presence ?? PRESENCE_BEFORE_ANYBODY_CHOOSES}
                onChoose={onPresence}
              />
            </span>
            {/* AND A WAY BACK TO NOBODY HAVING CHOSEN. Status already
                had one -- emptying its box sends an empty string -- and this is the second of the
                six settings that keep the two facts apart to get one. */}
            <BackToNotChosen
              chosen={presence !== null}
              setting={t(settingsControlWord('settings.appearance', 'settingsPanel.profile.hereSetting'))}
              usual={t(`chat.presence.${PRESENCE_BEFORE_ANYBODY_CHOOSES}.word`)}
              label={t(settingsControlWord('settings.appearance', 'settingsPanel.profile.backToNotChosen'))}
              explanation={t('settingsPanel.profile.hereBack', {
                usual: t(`chat.presence.${PRESENCE_BEFORE_ANYBODY_CHOOSES}.word`),
              })}
              onPut={onPresenceForgotten}
            />
          </p>
        </div>
      </div>

      {/* THE PICKER, UNDER THE PICTURE THAT OPENED IT. Criterion M30's set, and since M37 the file
          chooser is one of the things in it. */}
      {!picking ? null : (
        <AvatarPicker
          kind="person"
          id={person.id}
          name={person.name}
          onStored={onPicked}
          onFile={(file) => {
            void asBase64(file).then(onPicture)
          }}
        />
      )}

      {busy === null ? null : (
        <p className="app-said" role="status">
          {t('settingsPanel.profile.saving')}
        </p>
      )}
      {fault === null ? null : (
        <p className="app-fault" role="status">
          {fault}
        </p>
      )}
    </div>
  )
}

/**
 * ONE LABELLED LINE WITH A PENCIL BESIDE IT, and the box that replaces it while it is being edited.
 *
 * ONE COMPONENT FOR BOTH, because they are the same thing twice and two copies is how one of them
 * ends up without a way out of the editor. Criterion M37.
 *
 * `unset` MARKS A VALUE NOBODY WROTE. `Status: not set` is drawn quieter than a status they set, so
 * "nobody has said" is not read as something they chose — invariant 5 of USER.md, on the screen.
 */
function Line({
  line,
  label,
  value,
  unset = false,
  what,
  editing,
  typed,
  onTyped,
  onStart,
  onKeep,
  onLeave,
  children,
}: {
  /** Which line this is, for the page's own markup. Never drawn, so it is never translated. */
  line: 'name' | 'status'
  label: string
  value: string
  unset?: boolean
  /** What the pencil does, for a reader who cannot see a pencil. */
  what: string
  editing: boolean
  typed: string
  onTyped: (next: string) => void
  onStart: () => void
  onKeep: () => void
  onLeave: () => void
  /** Anything offered inside the editor, such as the state presets. */
  children?: React.ReactNode
}) {
  if (!editing) {
    return (
      <p className="app-line" data-line={line}>
        <span className="app-label">{label}</span>
        <span className="app-value" data-unset={unset ? 'yes' : undefined}>
          {value}
        </span>
        <button type="button" className="app-pencil" aria-label={what} title={what} onClick={onStart}>
          {APPEARANCE_WORDS.pencil}
        </button>
      </p>
    )
  }
  // ESCAPE IS HEARD ON THE WHOLE LINE, not on the box alone. After a preset is pressed the focus is on
  // the preset, and Escape there left the line open (the owner's fault of 25 October 2026, wave 13y
  // round 80). Enter stays on the box: on a button, Enter presses that button, and heard on the line it
  // would keep the status when Leave it was pressed. There is no close on a click outside, so a
  // half-typed status is never thrown away.
  return (
    <div
      className="app-line app-editing"
      data-line={line}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        // TAKEN HERE, so the chat panel's own Escape leaves the panel open.
        event.preventDefault()
        onLeave()
      }}
    >
      <span className="app-label">{label}</span>
      <input
        type="text"
        className="app-box"
        value={typed}
        autoFocus
        maxLength={line === 'status' ? STATE_MAX : undefined}
        aria-label={what}
        onChange={(event) => {
          onTyped(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onKeep()
        }}
      />
      <button type="button" className="app-keep" onClick={onKeep}>
        {APPEARANCE_WORDS.keep}
      </button>
      <button type="button" className="app-leave" onClick={onLeave}>
        {APPEARANCE_WORDS.leave}
      </button>
      {children}
    </div>
  )
}

/**
 * A file's bytes as base64, which is how a picture reaches this server.
 *
 * `readAsDataURL` gives `data:<type>;base64,<bytes>`, and only the part after the comma is sent: the
 * server reads the bytes to find out what the picture really is, so the type in front would be a
 * claim it ignores.
 *
 * IT IS STILL EXPORTED FROM HERE, AND THE PICKER STILL DOES NOT IMPORT IT. Criterion M37 put a file
 * chooser inside the picker, and the picker hands the FILE back rather than its bytes — so this
 * stays in the two panels that own a picture, and there is no cycle between the two files.
 */
export function asBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(t('settingsPanel.profile.fileUnreadable')))
    reader.onload = () => {
      const said = String(reader.result)
      const comma = said.indexOf(',')
      resolve(comma === -1 ? said : said.slice(comma + 1))
    }
    reader.readAsDataURL(file)
  })
}

const CSS = `
.app-said {
  margin: 0 0 var(--pad) 0;
  max-width: var(--measure-in-box);
  font-size: var(--fs-2);
  line-height: var(--lh-tight);
  color: var(--text-2);
}

.app-fault {
  margin: var(--pad) 0 0 0;
  max-width: var(--measure-in-box);
  font-size: var(--fs-2);
  line-height: var(--lh-tight);
  color: var(--st-failed);
}

.app-body { display: flex; flex-direction: column; gap: var(--pad); }

/* THE PICTURE ON THE LEFT AND THE TWO LINES ON THE RIGHT, criterion M37. It wraps at a narrow width
   so the lines drop under the picture rather than being squeezed beside it. */
.app-who { display: flex; align-items: flex-start; gap: var(--pad); flex-wrap: wrap; }

/* THE PICTURE IS THE PRESS. No frame around it: the thing on the screen is the picture, and a border
   would say there were two things. */
.app-face {
  display: inline-flex;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: none;
  cursor: pointer;
  flex: none;
}
.app-face:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

.app-lines { display: flex; flex-direction: column; gap: 6px; min-width: 0; }

.app-line { margin: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; min-width: 0; }
.app-editing { align-items: center; }

.app-label {
  font-size: var(--fs-1);
  font-weight: 600;
  color: var(--text-3);
  letter-spacing: .06em;
  text-transform: uppercase;
}

.app-value { font-size: var(--fs-3); color: var(--text); overflow-wrap: anywhere; }
/* A VALUE NOBODY WROTE, drawn quieter so it is not read as one the person chose. */
.app-value[data-unset="yes"] { font-size: var(--fs-2); color: var(--text-3); }

.app-pencil {
  min-width: 24px;
  min-height: 24px;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text-3);
  font-size: var(--fs-2);
  cursor: pointer;
}
.app-pencil:hover { background: var(--hover); color: var(--text); }

.app-box {
  width: min(100%, 18rem);
  min-height: 30px;
  padding: 0 var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font-size: var(--fs-2);
}

.app-presets { display: flex; flex-wrap: wrap; gap: 4px; flex-basis: 100%; }

.app-presets button, .app-keep, .app-leave {
  min-height: 30px;
  padding: 0 var(--pad);
  display: inline-flex;
  align-items: center;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text-2);
  font-size: var(--fs-1);
  font-weight: 600;
  cursor: pointer;
}
.app-presets button:hover, .app-keep:hover, .app-leave:hover { background: var(--hover); }
.app-presets button[aria-pressed="true"] { background: var(--accent); color: var(--accent-text); }
.app-keep { color: var(--text); }
`
