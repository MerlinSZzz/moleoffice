// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `Quick inputs` — THE LIST OF INPUTS THE OFFICE MAY TYPE INTO AN AGENT'S TERMINAL. Wave 13u, round 21
 * (src/shared/quick-inputs.ts is the contract and says the rules).
 *
 * The list is one row in the office's database, read and written through `GET/POST /api/office/quick-inputs`. Only the
 * person may change it, so a caller the door refuses is shown "read only" in place of the box, as decided, and the door's
 * own sentence only in Developer mode.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE PANEL SAYS ABOUT WHO WROTE THE LIST
 * ---------------------------------------------------------------------------------------
 *
 * The office starts with /context and /compact, written by a migration and stamped `{ kind: 'migration', id: '0272' }`.
 * That stamp is drawn as the office's own act in its own sentence and never as if the person had set the list. A list
 * the person cleared keeps a row stamped with who cleared it and when, and is drawn the same way a set list is.
 *
 * ANY OTHER STAMP IS DRAWN IN WORDS, never as the kind and id it holds: the writer of the row is the person reading
 * the page, a person or an agent the office knows, named by name, a person or an agent the office cannot name, said by
 * kind, or a writer whose kind the page has no words for, said to be of a kind it does not know. The row's kind is the
 * actor type the request proved (see `theWriterInWords`). A stamp the door does not send is "nobody recorded".
 *
 * ---------------------------------------------------------------------------------------
 * LOOSE INPUT, STRICT STORAGE, VISIBLE INTERPRETATION
 * ---------------------------------------------------------------------------------------
 *
 * The person writes one input on each line. Blank lines are left out and each line is trimmed, as the door trims it.
 * Everything else is the door's to check (`readQuickInputList`), and a refusal is drawn in its words. After a press the
 * panel shows what the office stored, from the door's answer, so the person sees what it made of what they wrote.
 */

import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useId, useState } from 'react'

import { content, t } from '@shared/i18n.ts'
import type { WhatTheQuickInputListDoorSays } from '@shared/quick-inputs.ts'
import { Btn, ErrorNote, Loading, Panel, ServerNote, useAsync } from './ui.tsx'
import { TieredPress } from './TieredPress.tsx'
import { api, getActor, type ParticipantForThePage, type WebActor } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { stampToTheMinute } from '../lib/minute.ts'
import { readParticipantsOnce } from '../lib/oneread.ts'
import { whatARefusalSays } from '../lib/terminals.ts'

/** The stamp migration 0272 writes the office's starting list with (the contract's `setBy` comment). */
const THE_STARTING_LIST_STAMP = { kind: 'migration', id: '0272' } as const

/**
 * THE ROW'S KIND, AS A KIND THE PAGE CHOOSES WORDS FOR. `writeTheRow` stamps the actor type the request proved
 * (`who.type` in src/server/lib/quick-inputs.ts): 'human' is the person, whose key or the one-version window is the
 * only proof the door takes, and 'agent' is an agent. Any other kind - 'system', a migration, or whatever a hand edit
 * left - has no sentence here, and is said to be unknown rather than drawn.
 */
const THE_PERSON_KIND = 'human'

const THE_AGENT_KIND = 'agent'

/** What to call the writer of a row, in words, never drawing a raw kind or id. */
function theWriterInWords(setBy: { kind: string; id: string }, reader: WebActor, known: readonly ParticipantForThePage[] | null): string {
  if (setBy.kind === THE_PERSON_KIND && reader.type === 'human' && setBy.id === reader.id) return t('quickInputs.who.you')
  if (setBy.kind === THE_PERSON_KIND || setBy.kind === THE_AGENT_KIND) {
    // THE PERSON'S OWN KIND IN A PARTICIPANT IS 'person' AND NOT 'human': the registry and the stamp spell it
    // differently, and this is the one place the two are joined.
    const wanted = setBy.kind === THE_PERSON_KIND ? 'person' : 'agent'
    const found = known?.find((one) => one.kind === wanted && one.id === setBy.id)
    if (found !== undefined) return t('quickInputs.who.named', { name: content(found.name) })
    return t(setBy.kind === THE_PERSON_KIND ? 'quickInputs.who.aPersonWithNoName' : 'quickInputs.who.anAgentWithNoName')
  }
  return t('quickInputs.who.anUnknownKind')
}

/** The lines that say who wrote the list and when: one sentence each, or none when nothing was ever written. */
function whoWroteIt(said: WhatTheQuickInputListDoorSays, reader: WebActor, known: readonly ParticipantForThePage[] | null): string[] {
  const { reading, setBy, setAt } = said
  const at = setAt === null ? null : stampToTheMinute(setAt)
  if (setBy === null) return reading.state === 'none' ? [] : [t('quickInputs.state.setByUnknown')]
  if (reading.state === 'set' && setBy.kind === THE_STARTING_LIST_STAMP.kind && setBy.id === THE_STARTING_LIST_STAMP.id) {
    return at === null ? [t('quickInputs.fromStart')] : [t('quickInputs.fromStart'), t('quickInputs.writtenAt', { at })]
  }
  const who = theWriterInWords(setBy, reader, known)
  if (reading.state === 'none') return [at === null ? t('quickInputs.clearedByNoTime', { who }) : t('quickInputs.clearedBy', { who, at })]
  return [at === null ? t('quickInputs.setByNoTime', { who }) : t('quickInputs.setBy', { who, at })]
}

function TheInputs({ inputs }: { inputs: readonly string[] }) {
  return (
    <ul className="qin-list">
      {inputs.map((input) => (
        <li key={input}>{content(input)}</li>
      ))}
    </ul>
  )
}

export function QuickInputsPanel() {
  useLanguage()
  const [list, readAgain] = useAsync(() => api.quickInputs(), [])
  /** What the office answered to the last press, kept here so it outlasts the form, which is drawn afresh after a press. */
  const [stored, setStored] = useState<WhatTheQuickInputListDoorSays | null>(null)
  return (
    <Panel titleIs="label" declares={{ surface: 'settings.quickinputs' }} title={t('settingsPanel.title.quickinputs')}>
      <style href="mole-office-quick-inputs" precedence="default">
        {QUICK_INPUTS_CSS}
      </style>
      {list.status === 'loading' ? <Loading what={t('quickInputs.loading')} /> : null}
      {list.status === 'error' ? <ErrorNote message={list.message} fault={list.fault} retry={readAgain} /> : null}
      {list.status === 'ready' ? (
        <QuickInputs
          // A FRESH FORM FOR EACH STORED LIST, so the box shows what is stored after a press.
          key={`${list.value.setAt ?? 'none'}:${JSON.stringify(list.value.reading)}`}
          said={list.value}
          stored={stored}
          onEdited={() => {
            setStored(null)
          }}
          onChanged={(answer) => {
            setStored(answer)
            readAgain()
          }}
        />
      ) : null}
    </Panel>
  )
}

function QuickInputs({
  said,
  stored,
  onEdited,
  onChanged,
}: {
  said: WhatTheQuickInputListDoorSays
  stored: WhatTheQuickInputListDoorSays | null
  onEdited: () => void
  onChanged: (answer: WhatTheQuickInputListDoorSays) => void
}) {
  useLanguage()
  // WHO THE OFFICE KNOWS, so a writer other than the reader can be named by name (the address card's own reader).
  const [everybody] = useAsync(readParticipantsOnce, [])
  const boxId = useId()
  const current = said.reading.state === 'set' ? said.reading.inputs : null
  const [text, setText] = useState(() => (current ?? []).join('\n'))
  const [fault, setFault] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')

  const save = (): void => {
    setBusy(true)
    setFault(null)
    api
      .setTheQuickInputs(lines)
      .then(onChanged)
      .catch((err: unknown) => {
        setFault(whatARefusalSays(err))
      })
      .finally(() => {
        setBusy(false)
      })
  }

  return (
    <div className="qin">
      <section className="qin-now" aria-label={t('quickInputs.listNow')} data-testid="quick-inputs-now">
        <p className="qin-key">{t('quickInputs.listNow')}</p>
        {current === null ? (
          <>
            <p className="qin-state">{t('absence.none')}</p>
            <ServerNote text={said.says} />
          </>
        ) : (
          <TheInputs inputs={current} />
        )}
        {whoWroteIt(
          said,
          getActor(),
          everybody.status === 'ready' ? [...everybody.value.people, ...everybody.value.agents] : null,
        ).map((line) => (
          <p key={line} className="qin-state" data-testid="quick-inputs-set-by">
            {line}
          </p>
        ))}
      </section>

      {said.refusal !== null ? (
        <>
          <p className="qin-state">{t('settingsState.readOnly')}</p>
          <ServerNote text={said.refusal} />
        </>
      ) : (
        <div className="qin-form">
          <label className="qin-label" htmlFor={boxId}>
            {t(settingsControlWord('settings.quickinputs', 'quickInputs.boxLabel'))}
          </label>
          <textarea
            id={boxId}
            className="qin-box"
            rows={6}
            value={text}
            disabled={busy}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            onChange={(event) => {
              setText(event.target.value)
              if (stored !== null) onEdited()
            }}
          />
          <div className="qin-presses">
            <Btn variant="primary" size="sm" onClick={save} pending={busy} disabled={lines.length === 0} reason={t('quickInputs.saveEmpty')}>
              {t(settingsControlWord('settings.quickinputs', 'quickInputs.save'))}
            </Btn>
            {current === null ? null : (
              // ASK FIRST: clearing the list takes away every input the office would type, so the question quotes the list that goes.
              <TieredPress
                tier="confirm"
                size="sm"
                press={t(settingsControlWord('settings.quickinputs', 'quickInputs.clear'))}
                pending={t('quickInputs.clearing')}
                disabled={busy}
                question={t('quickInputs.clearQuestion')}
                quote={current.join('\n')}
                warning={t('quickInputs.clearWarning')}
                cancel={t(settingsControlWord('settings.quickinputs', 'quickInputs.keepIt'))}
                onPress={async () => {
                  onChanged(await api.clearTheQuickInputs())
                }}
              />
            )}
          </div>
          {fault === null ? null : (
            // THE PERSON'S OWN WORDS ARE INSIDE THE SENTENCE (the input that was wrong), drawn as content, as the
            // stored list above it is.
            <p className="qin-refuse" role="alert">
              {content(fault)}
            </p>
          )}
        </div>
      )}

      {stored === null ? null : (
        <section className="qin-stored" role="status" data-testid="quick-inputs-stored">
          {stored.reading.state === 'set' ? (
            <>
              <p className="qin-key">{t('quickInputs.storedList')}</p>
              <TheInputs inputs={stored.reading.inputs} />
            </>
          ) : (
            <p className="qin-key">{t('quickInputs.storedNone')}</p>
          )}
        </section>
      )}
    </div>
  )
}

/** The panel's own rules. Every value is a token, so a preset swap re-skins it with everything else. */
const QUICK_INPUTS_CSS = `
.qin { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.qin-state { margin: 0; max-width: var(--measure-in-box); font: var(--fs-1)/var(--lh-body) var(--font-ui); color: var(--text-2); overflow-wrap: anywhere; }
.qin-key, .qin-label { margin: 0; font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); color: var(--text); overflow-wrap: anywhere; }
.qin-now, .qin-form, .qin-stored { display: flex; flex-direction: column; gap: calc(var(--pad) / 2); min-width: 0; }
.qin-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; max-width: var(--measure-in-box); min-width: 0; }
.qin-list li {
  margin: 0; padding: 2px var(--pad); min-width: 0;
  background: var(--panel-2); border-radius: var(--radius-sm);
  color: var(--text); font: var(--fs-1)/var(--lh-body) var(--font-mono, monospace);
  overflow-wrap: anywhere; white-space: pre-wrap;
}
.qin-refuse {
  margin: 0; max-width: var(--measure-in-box); padding: 2px var(--pad);
  color: var(--st-failed); background: var(--st-failed-bg);
  border-left: var(--rail) solid var(--st-failed-line); border-radius: var(--radius-sm);
  font: var(--fs-1)/var(--lh-tight) var(--font-ui); overflow-wrap: anywhere;
}
.qin-box {
  width: 100%; max-width: var(--measure-in-box); box-sizing: border-box; padding: var(--pad);
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
  background: var(--panel); color: var(--text); font: var(--fs-1)/var(--lh-body) var(--font-mono, monospace);
  resize: vertical;
}
.qin-box:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }
.qin-box:disabled { color: var(--text-3); }
.qin-presses { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad); min-width: 0; }
`
