// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The switch between Normal and Developer, and the one place its wording lives.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE IT IS DRAWN, AND WHY IT MOVED
 * ---------------------------------------------------------------------------------------
 *
 * On the Settings page, `#/settings`, and nowhere else. It sat at the foot of the navigation
 * column until this pass, because an independent reviewer given no manual was asked "how do you
 * enter developer mode?" and there was no answer — so the answer had to be visible without being
 * told, which then meant visible without opening anything.
 *
 * That argument was about being FINDABLE, and it was answered by putting a control in the one
 * column a reader cannot dismiss. The owner has since said what that column is for: *"The main
 * rail should primarily answer where I can go; product configuration should live under Settings."*
 * A row called Settings is the place everybody already looks for a thing like this, so the control
 * is still findable without being told and the column is back to listing places.
 *
 * ---------------------------------------------------------------------------------------
 * ONE COPY, AND THAT IS NOT TIDINESS
 * ---------------------------------------------------------------------------------------
 *
 * There was a second form of this switch, `form="inline"`, for a page with room for a control and
 * not a caption. Nothing in the product rendered it — the docstring above it claimed the switch
 * "appears in two places" and it appeared in one — so it is deleted rather than kept for a caller
 * that never arrived. A second drawing of one setting is also a second thing to keep in step: the
 * mode is a module-level value with a broadcast (src/web/lib/mode.ts), so two switches would have
 * agreed, but the words beside them are the part that drifts.
 */

import { settingsControlWord } from '@shared/settings-declaration.ts'
import { t } from '@shared/i18n.ts'
import { useLanguage } from '../lib/language.ts'
import { MODES, modeFaults, modeIsFromAddress, setMode, useMode, type Mode } from '../lib/mode.ts'
import { Hint } from './ui.tsx'

// MODE_LABELS in src/web/lib/mode.ts holds the same English; these keys are what the switch draws.
const MODE_LABEL_KEYS = { normal: 'settingsPanel.mode.normal', inspect: 'settingsPanel.mode.developer' } as const satisfies Record<Mode, string>

export function ViewSwitch() {
  useLanguage()
  const mode = useMode()
  const faults = modeFaults()

  return (
    <div className="viewswitch">
      <style href="mole-office-viewswitch" precedence="default">
        {CSS}
      </style>
      <span className="viewswitch-head">
        <span className="viewswitch-label" id="viewswitch-label">
          {t('settingsPanel.mode.label')}
        </span>
        <Hint under>{t('settingsPanel.mode.noteNormal')}</Hint>
      </span>
      <div className="viewswitch-seg" role="group" aria-labelledby="viewswitch-label">
        {MODES.map((m) => (
          <button key={m} type="button" aria-pressed={m === mode} onClick={() => setMode(m)}>
            {t(settingsControlWord('settings.mode', MODE_LABEL_KEYS[m]))}
          </button>
        ))}
      </div>
      {modeIsFromAddress ? (
        // The address wins for this load and is deliberately not saved. Somebody who followed a
        // link and then wondered why their choice did not stick would otherwise have no way to know.
        <p className="viewswitch-note" role="status">
          {t('settingsPanel.mode.fromAddress')}
        </p>
      ) : null}
      {faults.map((f) => (
        <p key={f.key + f.message} className="viewswitch-fault" role="status">
          <span aria-hidden="true">{'⚠'}</span>
          {f.message}
        </p>
      ))}
    </div>
  )
}

const CSS = `
.viewswitch { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }

/* THE MARK'S WORDS OPEN UNDER THIS LINE, as wide as the switch, so they stay inside the card and the page at
   every width. That needs a block stretched to the switch's width: a flex row lays the words out beside the
   label, and they used to open leftward from the mark, past the card's left edge. */
.viewswitch-head { display: block; align-self: stretch; }

.viewswitch-label {
  font-size: var(--fs-1);
  font-weight: 600;
  color: var(--text-3);
  letter-spacing: .06em;
  text-transform: uppercase;
}

/* Equal columns rather than content width, so the two positions do not jump about as the words
   change length. WIDTH IS max-content, so the pair is as wide as the wider word and no wider —
   this used to be stretched by a 248px sidebar and would otherwise be stretched by a page. */
.viewswitch-seg {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  width: max-content;
  min-width: 12rem;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.viewswitch-seg button {
  min-height: 30px;
  padding: 0 var(--pad);
  border: 0;
  border-right: var(--border-w) solid var(--border-strong);
  background: var(--panel);
  color: var(--text-2);
  font-size: var(--fs-1);
  font-weight: 600;
}
.viewswitch-seg button:last-child { border-right: 0; }
.viewswitch-seg button:hover { background: var(--hover); }
.viewswitch-seg button[aria-pressed="true"] {
  background: var(--accent);
  color: var(--accent-text);
}

/* The one sentence anybody gets about this. It is allowed to stand because it is the caption of a
   control on a settings page, where explaining a control is the page's job — not because a sentence
   is ever the fix for a control a reader cannot understand. */
.viewswitch-note {
  margin: 0;
  max-width: var(--measure-in-box);
  font-size: var(--fs-2);
  line-height: var(--lh-tight);
  color: var(--text-2);
}

.viewswitch-fault {
  margin: 0;
  display: flex;
  gap: 4px;
  font-size: var(--fs-2);
  line-height: var(--lh-tight);
  color: var(--st-failed);
}
`
