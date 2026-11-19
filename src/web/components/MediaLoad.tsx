// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `Loading pictures and video` — WHETHER MEDIA A RECORD POINTS AT ARE LOADED, AND WHEN. Criterion U5.
 *
 * A setting with three answers: transfer by
 * default, do not transfer by default, and transfer after a click and then show.
 *
 * IT IS NOT `Pictures in a message`, the panel above it. That one is a picture INSIDE a chat message
 * and answers `shown`, `pressed` or `path`, and `path` draws the file's path as text. This one is
 * about media a RECORD points at, it has three different answers, and its middle answer shows the
 * name and the size. The two are separate settings on the person's own row and neither is a rename.
 *
 * IT FOLLOWS THE PERSON AND NOT THIS BROWSER. It is on the registry row, so it is read on any machine
 * Mole Office is opened from, exactly as the two panels above it are.
 *
 * THE PANEL HOLDS THE CONTROLS AND NOT THE RULES. Which answers exist, what they are called and what
 * the row means are in `@shared/mediaload.ts`; what this browser has been told was chosen is in
 * `lib/mediaload.ts`. So this file cannot come to call an answer something a report calls something
 * else.
 *
 * RADIO BUTTONS AND NOT A MENU, for the reason the panel beside it gives: three answers, all short,
 * and all of them visible at once.
 */

import { settingsControlWord } from '@shared/settings-declaration.ts'
import { t } from '@shared/i18n.ts'
import { Panel } from './ui.tsx'
import { MEDIA_LOAD_BY_DEFAULT, MEDIA_LOAD_CHOICES, type MediaLoadChoice } from '@shared/mediaload.ts'
import { useLanguage } from '../lib/language.ts'
import { chooseMediaLoad, useMediaLoadWithFault } from '../lib/mediaload.ts'

/**
 * WHAT `NEVER` DOES, as a state under the name. The other two names say what they do on their own, so
 * only this one carries a line (wave 13y round 121).
 *
 * NOT "and its size". This line promised a size, and the figure it describes cannot show one: an
 * ImageBlock carries no size and asking the preview door for one would be the very request this choice
 * exists to avoid, so the held picture says the size is not known until it is loaded
 * (MEDIA_LOAD_SIZE_NOT_KNOWN). A panel promising what the screen cannot deliver is the first invariant,
 * and it also read as an absence sentence outside `Absence`, which `tests/absence-weight.test.ts`
 * caught. Both are mended by saying what the choice DOES.
 */
const NEVER_DOES = 'settingsPanel.media.does.never'

/** The name of each answer. The English is `MEDIA_LOAD_WORDS`, which en.ts reads. */
const MEDIA_WORD = {
  'with-page': 'settingsPanel.media.word.withPage',
  never: 'settingsPanel.media.word.never',
  'on-press': 'settingsPanel.media.word.onPress',
} as const satisfies Readonly<Record<MediaLoadChoice, string>>

export function MediaLoadPanel() {
  useLanguage()
  const chosen = useMediaLoadWithFault()
  // WHAT IS IN FORCE. A row nobody has chosen is read as the default, and the line below the
  // controls says so rather than drawing the default as a choice somebody made.
  const inForce: MediaLoadChoice = chosen.choice ?? MEDIA_LOAD_BY_DEFAULT
  const nobodyChose = chosen.read && chosen.choice === null

  return (
    <Panel titleIs="label" declares={{ surface: 'settings.mediaload' }} title={t('settingsPanel.title.mediaload')}>
      <style href="mole-office-media-load" precedence="default">
        {MEDIA_LOAD_CSS}
      </style>
      <fieldset className="ml">
        <legend className="ml-ask">{t(settingsControlWord('settings.mediaload', 'settingsPanel.media.ask'))}</legend>
        {MEDIA_LOAD_CHOICES.map((choice) => (
          <label className="ml-one" key={choice} data-chosen={inForce === choice ? 'yes' : 'no'}>
            <input
              type="radio"
              name="mole-office-media-load"
              className="ml-pick"
              value={choice}
              checked={inForce === choice}
              onChange={() => {
                chooseMediaLoad(choice)
              }}
            />
            <span className="ml-words">
              <span className="ml-word">{t(settingsControlWord('settings.mediaload', MEDIA_WORD[choice]))}</span>
              {choice === 'never' ? <span className="ml-does">{t(NEVER_DOES)}</span> : null}
            </span>
          </label>
        ))}
      </fieldset>
      {/* NOBODY HAS CHOSEN IS A REAL ANSWER, drawn as one rather than as the default having been
          picked. The choice in force is still the default, and the sentence says both. */}
      {nobodyChose ? <p className="ml-nobody">{t('settingsPanel.media.nobodyChose')}</p> : null}
      {chosen.fault === null ? null : <p className="ml-fault">{chosen.fault}</p>}
    </Panel>
  )
}

/**
 * The panel's own rules. Every value is a token, so a preset swap re-skins it with everything else.
 *
 * NO BACKTICK ANYWHERE IN HERE, comments included: this is a template literal inside a .tsx file.
 */
const MEDIA_LOAD_CSS = `
.ml { margin: 0; padding: 0; border: 0; display: flex; flex-wrap: wrap; align-items: stretch; gap: var(--gut); min-width: 0; }
.ml-ask {
  padding: 0; margin-inline-end: var(--gut);
  color: var(--text-2); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui);
}
.ml-one {
  display: inline-flex; align-items: flex-start; gap: 6px;
  flex: 1 1 14rem; max-width: 22rem;
  min-height: 30px; padding: var(--pad);
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
  background: var(--panel); color: var(--text);
  cursor: pointer;
}
.ml-one:hover { background: var(--hover); }
.ml-one[data-chosen="yes"] { border-color: var(--chosen-edge); color: var(--chosen-ink); background: var(--chosen-bg); box-shadow: var(--chosen-shadow); }
.ml-one:has(> .ml-pick:focus-visible) { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.ml-pick { margin-top: 2px; }
.ml-words { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ml-word { font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); }
.ml-does { color: var(--text-3); font: var(--fs-1)/var(--lh-body) var(--font-ui); overflow-wrap: anywhere; }
.ml-nobody { margin: var(--pad) 0 0; max-width: var(--measure-in-box); font: var(--fs-1)/var(--lh-body) var(--font-ui); color: var(--text-2); }
.ml-fault {
  margin: var(--pad) 0 0; max-width: 40ch;
  padding: 2px var(--pad);
  color: var(--st-failed); background: var(--st-failed-bg);
  border-left: var(--rail) solid var(--st-failed-line);
  border-radius: var(--radius-sm);
  font: var(--fs-1)/var(--lh-tight) var(--font-ui);
}
@media (max-width: 40rem) {
  .ml-ask { flex: 1 1 100%; margin-inline-end: 0; }
  .ml-one { flex: 1 1 100%; max-width: none; }
}
`
