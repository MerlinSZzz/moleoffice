// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `#/your-words` — THE WORDS A SECRETARY WROTE DOWN FOR THE PERSON, WAITING FOR THEM TO CONFIRM. Look A of the design
 * report U03yQALS7iod, chosen by a decision: its own sidebar row with a count across projects,
 * one row per note, Confirm and "Not what I said" on each, and Confirm all.
 *
 * THE READING IS THE DOOR'S OWN. `GET /api/the-persons-words` decides which notes wait, a page of 25 at a time, and how
 * many wait in every project. This page does not work that out a second time.
 *
 * THE WORDS ARE DRAWN AS STORED. A note's body is the secretary's copy of what the person said, and the person is asked
 * whether it is right. Trimming or folding it here would show them something other than what Confirm stores.
 *
 * EACH PRESS IS SENT TO THE NOTE'S OWN PROJECT. Confirm and "Not what I said" are by-id doors that look in the project
 * the request names, and a note on this page may be in any project. Confirm all names its notes by id and is read
 * across projects by the server.
 *
 * A PRESSED ROW STAYS ON THE PAGE with what happened to it, so the person sees the outcome of each press. The next page
 * starts after the rows still waiting, because a pressed row has left the server's list.
 *
 * The page offers the presses to the person only. An agent reading the page sees the notes and one line saying so, and
 * no button; a secretary holding the person's grant presses through the doors, where this office's list of what the
 * grant carries says so.
 */
import { useState } from 'react'
import { t } from '@shared/i18n.ts'
import type { AWaitingNote } from '@shared/the-persons-own-words.ts'
import { api, errorMessage, faultOf, getActor } from '../api.ts'
import { recordPath, RouteLink } from '../components/router.tsx'
import { Absence, Btn, ErrorNote, Explain, Loading, NumberInItsWord, Panel, Stamp, useAsync } from '../components/ui.tsx'
import { useLanguage } from '../lib/language.ts'

/** The most notes one reading asks for: the door refuses more. */
export const WORDS_PAGE_SIZE = 25

type Outcome = { did: 'confirmed'; note: { id: string; title: string } } | { did: 'notWhatISaid' }

type Failed = { message: string; fault: ReturnType<typeof faultOf> }

export function YourWordsPage({ onChanged }: { onChanged?: () => void }) {
  useLanguage()
  const [offset, setOffset] = useState(0)
  const [state, reload] = useAsync(() => api.thePersonsWords({ limit: WORDS_PAGE_SIZE, offset }), [offset])
  return (
    <div className="page yw">
      <style href="mole-office-your-words" precedence="default">
        {YOUR_WORDS_CSS}
      </style>
      <header className="yw-head">
        {/* THE NAME, TYPED: the same words as the rail row that opens this page. */}
        <h1 className="yw-title" data-title-is="its-label">{t('nav.yourWords')}</h1>
        {/* WHERE THE WORDS CAME FROM STAYS IN SIGHT, AND WHAT EACH PRESS STORES IS ONE PRESS DOWN. */}
        <Explain declares={{ surface: null }} meaning={t('w13q.yourWords.what')} opens={t('w13q.yourWords.whatThePressesStore')}>
          <p className="yw-intro">{t('w13q.yourWords.confirmDoes')}</p>
          <p className="yw-intro">{t('w13q.yourWords.notWhatISaidDoes')}</p>
          <p className="yw-intro">{t('w13q.yourWords.whereNotRecorded')}</p>
        </Explain>
      </header>
      {state.status === 'loading' ? <Loading label={t('w13q.yourWords.loading')} rows={2} /> : null}
      {state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault ?? null} retry={reload} /> : null}
      {state.status === 'ready' ? (
        <TheWaitingWords
          key={`${String(offset)}:${state.value.notes.map((note) => note.id).join(',')}`}
          notes={state.value.notes}
          total={state.value.total}
          offset={offset}
          onPage={setOffset}
          {...(onChanged === undefined ? {} : { onChanged })}
        />
      ) : null}
    </div>
  )
}

/** One page of waiting notes, drawn from what was fetched. Exported so a test can render it with no server. */
export function TheWaitingWords({
  notes,
  total,
  offset,
  onPage,
  onChanged,
}: {
  notes: readonly AWaitingNote[]
  total: number
  offset: number
  onPage: (offset: number) => void
  onChanged?: () => void
}) {
  const thePerson = getActor().type === 'human'
  const [outcomes, setOutcomes] = useState<ReadonlyMap<string, Outcome>>(new Map())
  const [busyAll, setBusyAll] = useState(false)
  const [failedAll, setFailedAll] = useState<Failed | null>(null)

  if (total === 0 && notes.length === 0) {
    return <Absence looked tier="told-apart" title={t('nav.yourWords')} word={t('w13q.yourWords.none')} />
  }

  const settle = (id: string, outcome: Outcome) => {
    setOutcomes((before) => new Map(before).set(id, outcome))
    onChanged?.()
  }
  const stillWaiting = notes.filter((note) => !outcomes.has(note.id))
  // CONFIRM ALL COVERS THE ROWS ON SCREEN THAT CAN BE CONFIRMED: a note with no words is refused by the door.
  const confirmable = stillWaiting.filter((note) => note.body !== null)
  const handled = notes.length - stillWaiting.length
  const left = Math.max(0, total - handled)

  const confirmAll = () => {
    if (busyAll || confirmable.length === 0) return
    setBusyAll(true)
    setFailedAll(null)
    api.confirmAllMyWords(confirmable.map((note) => note.id)).then(
      (reply) => {
        setBusyAll(false)
        setOutcomes((before) => {
          const next = new Map(before)
          for (const one of reply.filed) next.set(one.filedFrom, { did: 'confirmed', note: { id: one.note.id, title: one.note.title } })
          return next
        })
        onChanged?.()
      },
      (err: unknown) => {
        setBusyAll(false)
        setFailedAll({ message: errorMessage(err), fault: faultOf(err) })
      },
    )
  }

  const first = offset + 1
  const last = offset + notes.length
  return (
    <div className="yw-body">
      <div className="yw-bar">
        <p className="yw-count" data-part="waiting-count">
          <NumberInItsWord word={(n) => t('w13q.yourWords.count', { n })} n={left} />
        </p>
        {thePerson ? (
          confirmable.length === 0 ? null : (
            <Btn variant="primary" pending={busyAll} onClick={confirmAll}>
              {t('w13q.yourWords.confirmAll', { n: confirmable.length })}
            </Btn>
          )
        ) : (
          <span className="yw-note">{t('w13q.yourWords.onlyThePerson')}</span>
        )}
      </div>
      {failedAll === null ? null : <ErrorNote label={t('w13q.yourWords.notConfirmed')} message={failedAll.message} fault={failedAll.fault} />}
      {/* WHICH ROWS THE READING HELD, said only until a row is pressed: after that the reading's total is out of date. */}
      {notes.length === 0 || handled > 0 ? null : (
        <p className="yw-note" data-part="which-rows">{t('w13q.yourWords.showing', { first, last, total })}</p>
      )}
      <ol className="yw-list">
        {notes.map((note) => (
          <li key={note.id}>
            <OneNote note={note} thePerson={thePerson} outcome={outcomes.get(note.id) ?? null} onSettled={settle} />
          </li>
        ))}
      </ol>
      <div className="yw-pages">
        {offset === 0 ? null : (
          <Btn onClick={() => onPage(Math.max(0, offset - WORDS_PAGE_SIZE))}>{t('w13q.yourWords.earlier')}</Btn>
        )}
        {offset + stillWaiting.length >= left ? null : (
          <Btn onClick={() => onPage(offset + stillWaiting.length)}>{t('w13q.yourWords.later')}</Btn>
        )}
      </div>
    </div>
  )
}

function OneNote({
  note,
  thePerson,
  outcome,
  onSettled,
}: {
  note: AWaitingNote
  thePerson: boolean
  outcome: Outcome | null
  onSettled: (id: string, outcome: Outcome) => void
}) {
  const [busy, setBusy] = useState<'confirm' | 'notWhatISaid' | null>(null)
  const [failed, setFailed] = useState<Failed | null>(null)

  const press = (which: 'confirm' | 'notWhatISaid') => {
    if (busy !== null) return
    setBusy(which)
    setFailed(null)
    const sent =
      which === 'confirm'
        ? api.fileAsMyWords(note.id, note.workspaceId).then((reply): Outcome => ({ did: 'confirmed', note: { id: reply.note.id, title: reply.note.title } }))
        : api.notWhatISaid(note.id, note.workspaceId).then((): Outcome => ({ did: 'notWhatISaid' }))
    sent.then(
      (did) => {
        setBusy(null)
        onSettled(note.id, did)
      },
      (err: unknown) => {
        setBusy(null)
        setFailed({ message: errorMessage(err), fault: faultOf(err) })
      },
    )
  }

  return (
    <Panel titleIs="label" declares={{ surface: 'yourwords.note' }} title={note.title} rank={1} tone={outcome === null ? 'ask' : 'done'}>
      <div className="yw-note-row" data-note={note.id} data-outcome={outcome?.did ?? 'waiting'}>
        {note.body === null ? (
          <p className="yw-note">{t('w13q.yourWords.noWords')}</p>
        ) : (
          <blockquote className="yw-words" data-part="their-words">
            {note.body}
          </blockquote>
        )}
        <dl className="yw-facts">
          <dt>{t('w13q.yourWords.project')}</dt>
          <dd>{note.project ?? t('w13q.yourWords.noProject', { id: note.workspaceId })}</dd>
          <dt>{t('w13q.yourWords.writtenDown')}</dt>
          <dd>
            <Stamp at={note.createdAt} />
          </dd>
          {note.date === null ? null : (
            <>
              <dt>{t('w13q.yourWords.day')}</dt>
              <dd>{note.date}</dd>
            </>
          )}
          <dt>{t('w13q.yourWords.by')}</dt>
          <dd>{note.preparedBy === null ? t('w13q.yourWords.byNobodyRecorded') : (note.preparedBy.name ?? note.preparedBy.id)}</dd>
        </dl>
        {outcome !== null ? (
          <p className="yw-done" role="status">
            {outcome.did === 'confirmed' ? (
              <>
                {t('w13q.yourWords.confirmed')} <RouteLink to={recordPath(outcome.note.id)}>{outcome.note.title}</RouteLink>
              </>
            ) : (
              t('w13q.yourWords.markedNotWhatISaid')
            )}
          </p>
        ) : thePerson ? (
          <div className="yw-acts">
            {note.body === null ? null : (
              <Btn variant="primary" pending={busy === 'confirm'} onClick={() => press('confirm')}>
                {t('w13q.yourWords.confirm')}
              </Btn>
            )}
            <Btn pending={busy === 'notWhatISaid'} onClick={() => press('notWhatISaid')}>
              {t('w13q.yourWords.notWhatISaid')}
            </Btn>
          </div>
        ) : null}
        {failed === null ? null : <ErrorNote label={t('w13q.yourWords.notDone')} message={failed.message} fault={failed.fault} />}
      </div>
    </Panel>
  )
}

export const YOUR_WORDS_CSS = `
.yw { min-width: 0; }
.yw-head { display: grid; gap: var(--pad); min-width: 0; margin: 0 0 var(--gut); }
.yw-title { margin: 0; color: var(--text); font: 600 var(--fs-4)/var(--lh-tight) var(--font-ui); overflow-wrap: anywhere; }
.yw-intro { margin: 0; max-width: 70ch; color: var(--text-2); font: var(--fs-2)/var(--lh-read) var(--font-ui); }
.yw-body { display: grid; gap: var(--gut); min-width: 0; }
.yw-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--pad) var(--gut); min-width: 0; }
.yw-count { margin: 0; color: var(--text); font: var(--fs-3)/var(--lh-tight) var(--font-ui); }
.yw-note { margin: 0; color: var(--text-2); font: var(--fs-2)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.yw-list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--gut); min-width: 0; }
.yw-note-row { display: grid; gap: var(--pad); min-width: 0; }
.yw-words { margin: 0; padding: var(--pad) var(--gut); border-left: 3px solid var(--border); color: var(--text); font: var(--fs-3)/var(--lh-read) var(--font-ui); white-space: pre-wrap; overflow-wrap: anywhere; }
.yw-facts { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 6px var(--gut); margin: 0; font: var(--fs-2)/var(--lh-read) var(--font-ui); }
.yw-facts dt { color: var(--text-3); }
.yw-facts dd { margin: 0; color: var(--text); min-width: 0; overflow-wrap: anywhere; }
.yw-acts, .yw-pages { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad) var(--gut); }
.yw-done { margin: 0; color: var(--text-2); font: var(--fs-2)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
@media (max-width: 480px) {
  .yw-facts { grid-template-columns: minmax(0, 1fr); }
  .yw-facts dt { margin-top: 4px; }
}
`
