// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t, type WordKey } from '@shared/i18n.ts'
import { useLanguage } from '../lib/language.ts'
/**
 * ONE SECRETARY'S NOTEBOOK, ON A PAGE. Criteria N1 to N4.
 *
 * Each secretary has a notebook of its own, filed under that secretary, which a person can also
 * review and change. So this page lists what is written, newest first, with who wrote each and when, and
 * the person can add, change and remove.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE PAGE DECIDES AND WHAT IT DOES NOT
 * ---------------------------------------------------------------------------------------
 *
 * It decides nothing about who may do what. Every press calls a door, and the door refuses or does
 * it; a refusal is drawn as the server's own sentence. A page that hid a press it believed would be
 * refused would be a second set of rules, free to disagree with the one that is enforced — and the
 * one a person would believe is the one on screen. So the presses are drawn for anybody, and what
 * comes back is what is true.
 *
 * THE PICKER'S EIGHT KINDS COME FROM THE DECLARATION, through the reply's `kinds`. Typing a second
 * list here would be the same list twice.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'

import { readParticipantsOnce } from '../lib/oneread.ts'
import { theParticipantAStoredIdNames } from '../lib/participant-lookup.ts'
import { useInspect } from '../lib/mode.ts'
import { errorMessage, faultOf, api } from '../api.ts'
import { Absence, Btn, ErrorNote, Explain, Panel } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { RouteLink, whoPath } from '../components/router.tsx'
import { declaredAttributes } from '../components/declares.ts'
import { TieredPress } from '../components/TieredPress.tsx'
import { Body } from '../components/Chat.tsx'
import { SideBySide } from '../components/SideBySide.tsx'
import {
  NOTEBOOK_ENTRY_KINDS,
  type NotebookOnACard,
  type NotebookEntry,
  type TheNotebookRead,
} from '@shared/notebook.ts'

/** Every word on this page, in one place, so a reader and a test read the same strings. */
export const NOTEBOOK_WORDS = {
  get title() { return t('g6b.notebook.title') },
  get forWhom() { return t('g6b.notebook.forWhom') },
  get back() { return t('g6b.notebook.back') },
  get entries() { return t('g6b.notebook.entries') },
  get add() { return t('g6b.notebook.add') },
  get whatKind() { return t('g6b.notebook.whatKind') },
  get theWords() { return t('g6b.notebook.theWords') },
  get addPress() { return t('g6b.notebook.addPress') },
  get savePress() { return t('g6b.notebook.savePress') },
  get cancelPress() { return t('g6b.notebook.cancelPress') },
  get changePress() { return t('g6b.notebook.changePress') },
  get removePress() { return t('g6b.notebook.removePress') },
  get removeQuestion() { return t('g6b.notebook.removeQuestion') },
  get removeWarning() { return t('g6b.notebook.removeWarning') },
  get cancelRemoval() { return t('g6b.notebook.cancelRemoval') },
  get byThePerson() { return t('g6b.notebook.byThePerson') },
  get changedBy() { return t('g6b.notebook.changedBy') },
  get none() { return t('g6b.notebook.none') },
  get noNotebook() { return t('g6b.notebook.noNotebook') },
  get counts() { return t('g6b.notebook.counts') },
  /** Why a press is off. A press that is off without saying why is a press nobody can use. */
  get needsWords() { return t('g6b.notebook.needsWords') },
  get whileSending() { return t('g6b.notebook.whileSending') },
  /**
   * THE CLOSED FOLD'S OWN LINE. It says what is behind the press rather than repeating the panel's
   * name over it: the first drawing said "Write an entry" twice, once as the panel and once as the
   * fold, and a reader met one thing named twice. Found by looking at the picture.
   */
  get addFold() { return t('g6b.notebook.addFold') },
  get addOpens() { return t('g6b.notebook.addOpens') },
} as const

export function NotebookPage({ kind, id }: { kind: 'agent' | 'person'; id: string }) {
  useLanguage()
  const [state, again] = useProjectAsync(useCallback(() => api.notebook(id), [id]), [id])
  return (
    <div className="page nb">
      <style href="mole-office-notebook" precedence="default">
        {NOTEBOOK_CSS}
      </style>
      <h1 className="nb-title" data-title-is="its-label">{t('g6b.notebook.title')}</h1>
      <p className="nb-whose">
        {NOTEBOOK_WORDS.forWhom} <strong><ParticipantName kind={kind} id={id} /></strong>.{' '}
        <RouteLink to={whoPath(kind, id)}>{NOTEBOOK_WORDS.back}</RouteLink>
      </p>
      {state.status === 'loading' ? <p role="status">{t('g6b.loading')}</p> : null}
      {state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault} retry={again} /> : null}
      {state.status === 'ready' ? <TheNotebook said={state.value} handle={id} onChanged={again} /> : null}
    </div>
  )
}

/** Exported so a test can draw it with what the server actually said, and no server running. */
export function TheNotebook({
  said,
  handle,
  onChanged,
}: {
  said: TheNotebookRead
  handle: string
  onChanged: () => void
}) {
  useLanguage()
  // WHAT IS WRITTEN AND THE FORM THAT WRITES ARE TWO KINDS, so they stand side by side on a wide window
  // by the shared rule, item 2 of a decision: the entries on the left, the form on the
  // right. On a narrower window the form stays under the entries, where it was.
  return (
    <SideBySide className="nb-sides">
      <div data-column="start">
        <Panel titleIs="label" declares={{ surface: 'notebook.entries' }} title={NOTEBOOK_WORDS.entries}>
          {said.isThere ? null : (
            <p className="nb-absent">
              <Absence title={NOTEBOOK_WORDS.noNotebook} />
            </p>
          )}
          {said.isThere && said.entries.length === 0 ? (
            <p className="nb-absent">
              <Absence title={NOTEBOOK_WORDS.none} />
            </p>
          ) : null}
          {said.statistics === null ? null : (
            <p className="nb-counts">
              <span className="nb-count-key">{NOTEBOOK_WORDS.counts}</span>
              <span className="nb-count">{t('g6b.notebook.entryCount', { n: said.statistics.entries, count: said.statistics.entries })}</span>
              <span className="nb-count">{t('g6b.notebook.personCount', { count: said.statistics.byThePerson })}</span>
              <span className="nb-count">{t('g6b.notebook.agentCount', { count: said.statistics.byTheSecretary })}</span>
              <span className="nb-count">{t('g6b.notebook.changedCount', { count: said.statistics.changedByThePerson })}</span>
            </p>
          )}
          <ul className="nb-list">
            {said.entries.map((entry) => (
              <OneEntry key={entry.id} entry={entry} handle={handle} onChanged={onChanged} />
            ))}
          </ul>
        </Panel>
      </div>
      <div data-column="end">
        <TheForm said={said} handle={handle} onChanged={onChanged} />
      </div>
    </SideBySide>
  )
}

/** One entry: what it is, who wrote it, when, and the two presses that change it. */
function OneEntry({
  entry,
  handle,
  onChanged,
}: {
  entry: NotebookEntry
  handle: string
  onChanged: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [words, setWords] = useState(entry.text)
  const [fault, setFault] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const [busy, setBusy] = useState(false)

  const save = (): void => {
    setBusy(true)
    setFault(null)
    api
      .changeANotebookEntry(handle, entry.id, { text: words })
      .then(() => {
        setEditing(false)
        onChanged()
      })
      .catch((why: unknown) => setFault({ message: errorMessage(why), fault: faultOf(why) }))
      .finally(() => setBusy(false))
  }

  return (
    <li className="nb-entry" {...declaredAttributes({ surface: 'notebook.entries' })}>
      <div className="nb-entry-head">
        <span className="nb-kind">{notebookKind(entry.entryKind, 'label')}</span>
        <span className="nb-who">
          <ParticipantName kind={entry.writtenByKind} id={entry.writtenById} />
        </span>
        <span className="nb-when">{entry.at}</span>
        {entry.changedByThePerson === undefined ? null : (
          <span className="nb-changed">
            {NOTEBOOK_WORDS.changedBy} {entry.changedByThePerson.at}
          </span>
        )}
      </div>
      {editing ? (
        <div className="nb-edit">
          <textarea
            className="px-input nb-area"
            rows={4}
            value={words}
            aria-label={NOTEBOOK_WORDS.theWords}
            onChange={(e) => setWords(e.target.value)}
          />
          <div className="nb-presses">
            <Btn
              onClick={save}
              disabled={busy || words.trim() === ''}
              reason={busy ? NOTEBOOK_WORDS.whileSending : NOTEBOOK_WORDS.needsWords}
            >
              {NOTEBOOK_WORDS.savePress}
            </Btn>
            <Btn
              variant="ghost"
              onClick={() => {
                setWords(entry.text)
                setEditing(false)
                setFault(null)
              }}
            >
              {NOTEBOOK_WORDS.cancelPress}
            </Btn>
          </div>
        </div>
      ) : (
        <>
          {/* THE WORDS, WITH A RECORD ID IN THEM NAMED BY ITS TITLE. A secretary points at a record
              by writing its id, and normal mode drew that id as it was (wave 13q's pictures, report
              h3Rjf86iBrO5). The chat's Body is the one reader of ids in written words: normal mode
              draws the record's name as a link, and developer mode draws the id beside it. */}
          <div className="nb-words"><Body text={entry.text} /></div>
          <div className="nb-presses">
            <Btn variant="ghost" onClick={() => setEditing(true)}>
              {NOTEBOOK_WORDS.changePress}
            </Btn>
            <TieredPress tier="confirm" press={NOTEBOOK_WORDS.removePress} pending={NOTEBOOK_WORDS.whileSending}
              disabled={busy} question={NOTEBOOK_WORDS.removeQuestion} quote={entry.text}
              warning={NOTEBOOK_WORDS.removeWarning} cancel={NOTEBOOK_WORDS.cancelRemoval}
              onPress={async () => { await api.removeANotebookEntry(handle, entry.id); onChanged() }} />
          </div>
        </>
      )}
      {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
    </li>
  )
}

/** The form that adds one. The kind, the words, and one press. */
function TheForm({
  said,
  handle,
  onChanged,
}: {
  said: TheNotebookRead
  handle: string
  onChanged: () => void
}) {
  const kinds = useMemo(
    () => NOTEBOOK_ENTRY_KINDS.filter((one) => said.kinds.includes(one.key)),
    [said.kinds],
  )
  const [entryKind, setEntryKind] = useState(kinds[0]?.key ?? '')
  const [words, setWords] = useState('')
  const [fault, setFault] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (entryKind === '' && kinds[0] !== undefined) setEntryKind(kinds[0].key)
  }, [entryKind, kinds])

  const write = (): void => {
    setBusy(true)
    setFault(null)
    api
      .addANotebookEntry(handle, { entryKind, text: words })
      .then(() => {
        setWords('')
        onChanged()
      })
      .catch((why: unknown) => setFault({ message: errorMessage(why), fault: faultOf(why) }))
      .finally(() => setBusy(false))
  }

  return (
    <Panel titleIs="label" declares={{ surface: 'notebook.add' }} title={NOTEBOOK_WORDS.add}>
      {/* THE FORM IS BEHIND ONE PRESS, and that is a rule of this product rather than a choice:
          nothing on a page you are reading can be typed into or chosen from, and a control inside a
          closed fold is not on the screen. `tests/read-before-edit.test.ts` carries the rule and the
          reasoning; Home's decide form is the same shape. What is needed is a form to add an entry, and a
          form one press away is a form. */}
      <Explain declares={{ surface: null }} meaning={NOTEBOOK_WORDS.addFold} opens={NOTEBOOK_WORDS.addOpens}>
      {/* THE KINDS AS CHOICES THAT WRAP, NOT A CLOSED SELECT. A closed select draws its label on one line and
          cuts it: at 390 "What the secretary may do alone" wanted 273 px and had 250 (wave 13j's report
          CRfHytzOtE89, b-6). Each kind here is a line of its own that wraps, a press at least 44 px tall. */}
      <fieldset className="nb-kinds">
        <legend className="nb-key">{NOTEBOOK_WORDS.whatKind}</legend>
        {kinds.map((one) => (
          <label key={one.key} className="nb-kind-choice">
            <input type="radio" name="nb-kind" value={one.key} checked={entryKind === one.key} onChange={() => setEntryKind(one.key)} />
            <span>{notebookKind(one.key, 'label')}</span>
          </label>
        ))}
      </fieldset>
      <p className="nb-what">{notebookKind(entryKind, 'what') ?? ''}</p>
      <label className="nb-key" htmlFor="nb-words">
        {NOTEBOOK_WORDS.theWords}
      </label>
      <textarea
        id="nb-words"
        className="px-input nb-area"
        rows={4}
        value={words}
        onChange={(e) => setWords(e.target.value)}
      />
      <div className="nb-presses">
        <Btn
          onClick={write}
          disabled={busy || words.trim() === '' || entryKind === ''}
          reason={busy ? NOTEBOOK_WORDS.whileSending : NOTEBOOK_WORDS.needsWords}
        >
          {NOTEBOOK_WORDS.addPress}
        </Btn>
      </div>
      {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
      </Explain>
    </Panel>
  )
}

/*
 * THE STYLESHEET, EXPORTED so that a browser test draws the page with the same sheet the app does.
 * `renderToStaticMarkup` returns a component's markup and not the styles React hoists into the head,
 * so a test that drew the markup alone would be measuring an unstyled page and would go green
 * whatever this sheet said. Measured 11 September 2026: it did exactly that.
 *
 * Every value is a token from tokens.css, so the page follows the theme in both
 * light and dark without naming a colour. NO BACKTICK ANYWHERE IN HERE, comments included: this is
 * a template literal, and one backtick turns the rest of the file into nonsense (chapter 6 rule 3).
 *
 * THE THREE BANDS. The breakpoints are at 40rem and 60rem, which is what cuts 1440, 990, 660 and
 * 390 into the widths that are actually looked at. Above 60rem the head of an entry is one row;
 * below 40rem it wraps and the presses go full width, because a press narrower than a thumb at
 * 390 is a press nobody can hit.
 */
export const NOTEBOOK_CSS = `
.nb { max-width: var(--measure-in-box); }
.nb-title { margin: 0 0 var(--pad) 0; }
.nb-sides { gap: var(--gut); }
.nb-whose { margin: 0 0 var(--gut) 0; color: var(--text-3); }
.nb-absent { margin: 0 0 var(--gut) 0; }
.nb-counts { display: flex; flex-wrap: wrap; gap: var(--gut); margin: 0 0 var(--gut) 0; align-items: baseline; }
.nb-count-key { color: var(--text-3); font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.04em; }
.nb-count { color: var(--text-2); font-variant-numeric: tabular-nums; }
.nb-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--gut); }
.nb-entry { min-width: 0; border: 1px solid var(--border); border-radius: var(--radius); padding: var(--pad); background: var(--panel-2); }
.nb-entry-head { display: flex; flex-wrap: wrap; gap: var(--gut); align-items: baseline; margin-bottom: var(--pad); }
.nb-kind { font-weight: 600; color: var(--text); }
.nb-who { color: var(--text-2); overflow-wrap: anywhere; min-width: 0; }
.nb-when { color: var(--text-3); font-variant-numeric: tabular-nums; }
.nb-changed { color: var(--text-3); font-style: italic; }
.nb-words { margin: 0; overflow-wrap: anywhere; max-width: var(--measure-read); }
/* A RECORD NAMED IN AN ENTRY READS AS PART OF THE SENTENCE. The chat draws such a name on a line of
   its own, centred in the bubble; an entry is a paragraph, not a bubble, so here it stays inline. */
.nb-words .px-chat-link[data-layout] { display: inline; width: auto; text-align: inherit; }
.nb-edit { display: flex; flex-direction: column; gap: var(--pad); }
.nb-presses { display: flex; flex-wrap: wrap; gap: var(--pad); margin-top: var(--pad); }
.nb-key { display: block; margin: var(--gut) 0 var(--pad) 0; color: var(--text-2); font-size: 0.9em; }
.nb-kinds { border: 0; margin: 0; padding: 0; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.nb-kind-choice { display: flex; align-items: center; gap: var(--pad); min-height: 44px; max-width: 24rem; overflow-wrap: anywhere; cursor: pointer; }
.nb-kind-choice input { flex: none; width: 1.1rem; height: 1.1rem; margin: 0; accent-color: var(--accent); }
.nb-area { width: 100%; min-width: 0; resize: vertical; }
.nb-what { margin: var(--pad) 0 0 0; color: var(--text-3); max-width: var(--measure-read); }
@media (max-width: 40rem) {
  .nb-entry-head { gap: var(--pad); }
  .nb-presses > * { flex: 1 1 auto; }
  .nb-kind-choice { max-width: 100%; }
}
`

export function ParticipantName({ kind, id }: { kind: string; id: string }) {
  useLanguage()
  const [people] = useProjectAsync(readParticipantsOnce, [])
  const inspect = useInspect()
  const rows = people.status === 'ready' ? [...people.value.people, ...people.value.agents].filter(one => one.kind === kind) : []
  const known = theParticipantAStoredIdNames(rows, id)
  return known ? <>{known.name}</> : inspect ? <>{id}</> : <>{t(kind === 'person' ? 'g6b.profile.person' : 'g6b.profile.agent')}</>
}

export function NotebookNumbers({ notebook, className }: { notebook: NotebookOnACard; className: string }) {
  const numbers = notebook.statistics
  if (numbers === null) return <div className={className}><dt>{t('g6b.notebook.counts')}</dt><dd><Absence /></dd></div>
  return <>
    <div className={className}><dt>{t('g6b.notebook.numberEntries')}</dt><dd>{numbers.entries}</dd></div>
    <div className={className}><dt>{t('g6b.notebook.numberPerson')}</dt><dd>{numbers.byThePerson}</dd></div>
    <div className={className}><dt>{t('g6b.notebook.numberAgent')}</dt><dd>{numbers.byTheSecretary}</dd></div>
    <div className={className}><dt>{t('g6b.notebook.lastWritten')}</dt><dd>{numbers.lastWritten === null ? <Absence /> : <>{numbers.lastWritten.at} · <ParticipantName kind={numbers.lastWritten.byKind} id={numbers.lastWritten.byId} /></>}</dd></div>
    <div className={className}><dt>{t('g6b.notebook.numberChanged')}</dt><dd>{numbers.changedByThePerson}</dd></div>
  </>
}

function notebookKind(key: string, part: 'label' | 'what'): string {
  return NOTEBOOK_ENTRY_KINDS.some(one => one.key === key) ? t(`g6b.notebook.kind.${key}.${part}` as WordKey) : t('g6b.notebook.unknownKind')
}
