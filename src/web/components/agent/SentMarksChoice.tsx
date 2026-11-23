// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `Marks of comments once sent`: KEEP SHOWING THEM, OR HIDE THEM COMPLETELY (wave 13y round 146, item 73a;
 * hidden by default since 8 November 2026).
 *
 * Drawn on Settings' Review marks panel, beside the two mark colours, because it is a choice about the same marks. The
 * choice and its default are `src/web/lib/sent-marks.ts`; the mark layer reads them from there.
 *
 * RADIO BUTTONS AND NOT A SWITCH: both answers are said in words, so a reader sees what each one does before choosing.
 */
import { t } from '@shared/i18n.ts'
import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useLanguage } from '../../lib/language.ts'
import { chooseSentMarks, SENT_MARKS, useSentMarks, type SentMarks } from '../../lib/sent-marks.ts'

/** The words of each answer, as Settings declares them. */
const ANSWER_WORD = {
  show: 'review.sentMarks.show',
  hide: 'review.sentMarks.hide',
} as const satisfies Readonly<Record<SentMarks, string>>

export function SentMarksChoice() {
  useLanguage()
  const { choice, fault } = useSentMarks()
  return (
    <>
      <style href="mole-office-sent-marks" precedence="default">
        {SENT_MARKS_CSS}
      </style>
      <fieldset className="smk" data-part="sent-marks">
        <legend className="smk-ask">{t(settingsControlWord('settings.review', 'review.sentMarks.ask'))}</legend>
        {SENT_MARKS.map((answer) => (
          <label className="smk-one" key={answer} data-chosen={choice === answer ? 'yes' : 'no'}>
            <input
              type="radio"
              name="mole-office-sent-marks"
              className="smk-pick"
              value={answer}
              checked={choice === answer}
              onChange={() => {
                chooseSentMarks(answer)
              }}
            />
            <span className="smk-word">{t(settingsControlWord('settings.review', ANSWER_WORD[answer]))}</span>
          </label>
        ))}
      </fieldset>
      {fault === null ? null : <p className="smk-fault" role="status">{fault}</p>}
    </>
  )
}

/** The choice's own rules, in the shape of the chat text size panel's. No backtick anywhere in here. */
const SENT_MARKS_CSS = `
.smk { margin: var(--pad-lg) 0 0; padding: 0; border: 0; display: flex; flex-wrap: wrap; align-items: stretch; gap: var(--gut); min-width: 0; }
.smk-ask {
  padding: 0; margin-inline-end: var(--gut);
  color: var(--text-2); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui);
}
.smk-one {
  display: inline-flex; align-items: flex-start; gap: 6px;
  flex: 1 1 12rem; max-width: 22rem;
  min-height: 30px; padding: var(--pad);
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
  background: var(--panel); color: var(--text);
  cursor: pointer;
}
.smk-one:hover { background: var(--hover); }
.smk-one[data-chosen="yes"] { border-color: var(--chosen-edge); color: var(--chosen-ink); background: var(--chosen-bg); box-shadow: var(--chosen-shadow); }
.smk-one:has(> .smk-pick:focus-visible) { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.smk-pick { margin-top: 2px; }
.smk-word { font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); }
.smk-fault {
  margin: var(--pad) 0 0; max-width: 40ch;
  padding: 2px var(--pad);
  color: var(--st-failed); background: var(--st-failed-bg);
  border-left: var(--rail) solid var(--st-failed-line);
  border-radius: var(--radius-sm);
  font: var(--fs-1)/var(--lh-tight) var(--font-ui);
}
@media (max-width: 40rem) {
  .smk-ask { flex: 1 1 100%; margin-inline-end: 0; }
  .smk-one { flex: 1 1 100%; max-width: none; }
}
`
