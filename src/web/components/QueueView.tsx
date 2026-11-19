// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `The Decisions page` — THE SETTINGS PANEL THAT CHOOSES CARDS OR A LIST. Criterion P54.
 *
 * The decisions page had turned into a list view, and the choice belongs in Settings.
 *
 * The page used to pick its own shape from what happened to be waiting — a card for a fork, a row
 * for anything else — so settling the last fork turned the whole page into a list with nothing on
 * screen to say why. The choice is theirs now, it is made here, and this browser remembers it.
 *
 * THE PANEL HOLDS THE CONTROL AND NOT THE RULE. Which orders exist, what they are called and where
 * the answer is kept are all in `lib/queueview.ts`, beside the reading the page does, so this file
 * cannot come to call an answer something the page calls something else.
 */

import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useState } from 'react'

import { t } from '@shared/i18n.ts'
import { Panel } from './ui.tsx'
import { useLanguage } from '../lib/language.ts'
import { useInspect } from '../lib/mode.ts'
import { QUEUE_VIEWS, QUEUE_VIEW_WORDS, rememberQueueView, rememberedQueueView, type QueueView } from '../lib/queueview.ts'

export function QueueViewPanel() {
  useLanguage()
  const developer = useInspect()
  const [chosen, setChosen] = useState(rememberedQueueView)

  const choose = (view: QueueView): void => {
    setChosen({ view, fault: rememberQueueView(view) })
  }

  return (
    <Panel titleIs="label" declares={{ surface: 'settings.queueview' }} title={t('settingsPanel.title.queueview')}>
      <style href="mole-office-queue-view" precedence="default">
        {QUEUE_VIEW_CSS}
      </style>
      {/* A GROUP OF RADIO BUTTONS AND NOT A DROP-DOWN. Two answers, both short, and both visible at
          once: a menu of two hides one of them behind a press. The group carries the name, because
          the panel title is the page and the group is the question about it. */}
      <fieldset className="qv">
        <legend className="qv-ask">{t(settingsControlWord('settings.queueview', 'settingsPanel.queue.ask'))}</legend>
        {QUEUE_VIEWS.map((view) => (
          <label className="qv-one" key={view} data-chosen={chosen.view === view ? 'yes' : 'no'}>
            <input
              type="radio"
              name="mole-office-queue-view"
              className="qv-pick"
              value={view}
              checked={chosen.view === view}
              onChange={() => choose(view)}
            />
            <span className="qv-word">{QUEUE_VIEW_WORDS[view]}</span>
          </label>
        ))}
      </fieldset>
      {/* THE BROWSER WILL NOT REMEMBER IT, said beside the control rather than in a console. The
          choice still applies while the page is open, which is a different thing from it failing,
          and the words are the ones every other remembered setting uses. */}
      {/* THE STORE'S OWN SENTENCE CAN NAME THIS BROWSER'S STORAGE KEY, which is machinery, so normal
          mode says the same failure without it. */}
      {chosen.fault === null ? null : (
        <p className="qv-fault">{developer ? chosen.fault : t('settingsPanel.queue.notKept')}</p>
      )}
    </Panel>
  )
}

/**
 * The panel's own rules. Every value is a token, so a preset swap re-skins it with everything else.
 *
 * NO BACKTICK ANYWHERE IN HERE, comments included: this is a template literal inside a .tsx file.
 */
const QUEUE_VIEW_CSS = `
.qv { margin: 0; padding: 0; border: 0; display: flex; flex-wrap: wrap; align-items: center; gap: var(--gut); min-width: 0; }
.qv-ask {
  padding: 0; margin-inline-end: var(--gut);
  color: var(--text-2); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui);
}
.qv-one {
  display: inline-flex; align-items: center; gap: 6px;
  min-height: 30px; padding: 0 var(--pad);
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
  background: var(--panel); color: var(--text);
  font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui);
  cursor: pointer;
}
.qv-one:hover { background: var(--hover); }
.qv-one[data-chosen="yes"] { border-color: var(--chosen-edge); color: var(--chosen-ink); background: var(--chosen-bg); box-shadow: var(--chosen-shadow); }
.qv-one:has(> .qv-pick:focus-visible) { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.qv-fault {
  margin: var(--pad) 0 0; max-width: 40ch;
  padding: 2px var(--pad);
  color: var(--st-failed); background: var(--st-failed-bg);
  border-left: var(--rail) solid var(--st-failed-line);
  border-radius: var(--radius-sm);
  font: var(--fs-1)/var(--lh-tight) var(--font-ui);
}
@media (max-width: 40rem) {
  .qv-ask { flex: 1 1 100%; margin-inline-end: 0; }
}
`
