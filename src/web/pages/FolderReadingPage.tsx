// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { TieredPress } from '../components/TieredPress.tsx'
import { FOLDER_REJECTION_UNDO_MS } from '@shared/danger-tiers.ts'
import { t } from '@shared/i18n.ts'
/**
 * WHAT AN AGENT READ IN A FOLDER, AND THE PRESS THAT PUTS ONE PIECE OF IT IN THE PROJECT.
 *
 * Criterion I3. An agent can read somebody's folder of code, notes and results far faster than a
 * person can, and it must not be allowed to file what it found. So it files one draft, and this is
 * where a person goes through it: accept, edit, or reject, one piece at a time.
 *
 * ---------------------------------------------------------------------------------------
 * EVERY PIECE SHOWS THE FILE AND THE WORDS IT RESTS ON
 * ---------------------------------------------------------------------------------------
 *
 * The quote is not a detail behind a fold: it is the thing a person is actually judging. A piece
 * whose quote does not say what the title says is a piece to reject, and that judgement is
 * impossible if the page only draws the agent's own sentence.
 *
 * ---------------------------------------------------------------------------------------
 * THE EDIT IS PART OF THE ACCEPT, AND IT IS BEHIND A PRESS
 * ---------------------------------------------------------------------------------------
 *
 * At rest this page is a list with two buttons per row. The title box appears when somebody presses
 * Edit, which is the reading rule this repository holds every page to: nothing you can type into is
 * drawn before you asked for it.
 */
import { useState } from 'react'

import { faultOf, api, errorMessage } from '../api.ts'
import { RouteLink, recordPath } from '../components/router.tsx'
import { Btn, Empty, ErrorNote, Loading, Panel, TextArea } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { kindWord } from '@shared/words.ts'
import type { FolderReadingPiece, FolderReading, PieceState } from '@shared/folderreading.ts'

/** What a state word is called on the screen. */
function stateWord(state: PieceState): string {
  if (state === 'accepted') return t('dev.folderreading.accepted')
  if (state === 'rejected') return t('dev.folderreading.rejected')
  return t('dev.folderreading.waiting')
}

/**
 * Which class a piece's row carries, read from its state rather than built out of it.
 *
 * The stored word is not put into the class name directly. It is a small difference, and it is the
 * one `tests/the-machine-word-gate.test.ts` exists for: a value that reaches the page unread is a
 * value that reaches the person unread the day somebody draws it.
 */
function classFor(state: PieceState): string {
  if (state === 'accepted') return 'fr-piece fr-accepted'
  if (state === 'rejected') return 'fr-piece fr-rejected'
  return 'fr-piece'
}

export function FolderReadingPage() {
  const [readings, readAgain] = useProjectAsync(() => api.folderReadings(), [])
  return (
    <div className="page">
      <style href="mole-office-folder-reading" precedence="default">
        {FOLDER_READING_CSS}
      </style>
      <h1>{t('dev.folderreading.aFolderAnAgentRead')}</h1>
      <p className="fr-lede prose-measure">{t('dev.folderreading.anAgentReadSomebodySFolderAnd')}</p>
      {readings.status === 'loading' ? <Loading label={t('dev.folderreading.readingWhatAgentsHaveRead')} what={t('dev.folderreading.folderReadings')} /> : null}
      {readings.status === 'error' ? <ErrorNote message={readings.message} fault={readings.fault} /> : null}
      {readings.status === 'ready' ? (
        <TheReadings readings={readings.value.drafts} onDecided={readAgain} />
      ) : null}
    </div>
  )
}

function TheReadings({ readings, onDecided }: { readings: FolderReading[]; onDecided: () => void }) {
  if (readings.length === 0) {
    return (
      <Empty message={t('dev.folderreading.noAgentHasReadAFolderInto')} />
    )
  }
  return (
    <>
      {readings.map((reading) => (
        <Panel
          key={reading.id}
          declares={{ surface: 'folderreading.pieces' }}
          title={reading.folder}
        >
          <p className="fr-note">
            {t('dev.folderreading.readBy', { reader: reading.readBy, at: reading.createdAt,
              proposed: reading.where.proposed, accepted: reading.where.accepted, rejected: reading.where.rejected })}
          </p>
          {reading.note === null ? null : <p className="fr-note fr-said">{reading.note}</p>}
          <ul className="fr-pieces">
            {reading.pieces.map((piece) => (
              <OnePiece key={piece.id} reading={reading} piece={piece} onDecided={onDecided} />
            ))}
          </ul>
        </Panel>
      ))}
    </>
  )
}

function OnePiece({
  reading,
  piece,
  onDecided,
}: {
  reading: FolderReading
  piece: FolderReadingPiece
  onDecided: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(piece.title)
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)

  const decide = async (press: 'accept' | 'reject'): Promise<void> => {
    setBusy(true)
    setRefused(null)
    try {
      await api.decideAboutAPiece(reading.id, piece.id, {
        press,
        ...(press === 'accept' && title !== piece.title ? { title } : {}),
      })
      onDecided()
    } catch (err) {
      // WHAT THE SERVER SAID, WORD FOR WORD. A refusal rewritten here would be this page's opinion
      // of why the write did not happen.
      setRefused({ message: errorMessage(err), fault: faultOf(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className={classFor(piece.state)} data-draft={reading.id} data-piece={piece.id}>
      <div className="fr-piece-head">
        <span className="fr-kind">{kindWord(piece.kind).text}</span>
        <span className="fr-title">{piece.title}</span>
        <span className="fr-state">{stateWord(piece.state)}</span>
      </div>
      {piece.summary === null ? null : <p className="fr-summary">{piece.summary}</p>}
      <p className="fr-from">{t('dev.folderreading.from', { files: piece.from.join(', ') })}</p>
      <blockquote className="fr-quote">{piece.quote}</blockquote>
      {piece.state === 'accepted' && piece.recordId !== null ? (
        <p className="fr-note">
          <RouteLink to={recordPath(piece.recordId)}>{t('dev.folderreading.nowRecord', { id: piece.recordId })}</RouteLink>
        </p>
      ) : null}
      {editing ? (
        <label className="fr-edit">
          <span>{t('dev.folderreading.theTitleThisWouldBeFiledUnder')}</span>
          <TextArea value={title} onChange={setTitle} rows={2} />
        </label>
      ) : null}
      <div className="fr-presses">
        {piece.state === 'proposed' ? (
          <>
            <Btn onClick={() => void decide('accept')} disabled={busy} reason={busy ? t('dev.folderreading.writing') : undefined}>
              {t('dev.folderreading.accept')}
            </Btn>
            <Btn onClick={() => {
              if (editing) setTitle(piece.title)
              setEditing(!editing)
            }}>{editing ? t('dev.folderreading.leaveTitle') : t('dev.folderreading.editTitle')}</Btn>
          </>
        ) : null}
        <TieredPress tier="undo" available={piece.state === 'proposed'} disabled={busy}
          windowMs={FOLDER_REJECTION_UNDO_MS}
          press={t('dev.folderreading.reject')} pending={t('dev.folderreading.writing')}
          done={t('dev.folderreading.rejected')} undo={(seconds) => t('dev.folderreading.undo', { n: seconds })}
          undoing={t('dev.folderreading.undoing')}
          onPress={async () => {
            setBusy(true)
            setRefused(null)
            try {
              const reply = await api.decideAboutAPiece(reading.id, piece.id, { press: 'reject' })
              onDecided()
              const offer = reply.undo
              if (offer === undefined) throw new Error(t('dev.folderreading.noUndoOffer'))
              return { remainingMs: offer.remainingMs, undo: async () => {
                await api.decideAboutAPiece(reading.id, piece.id, { press: 'undo-reject', token: offer.token })
                onDecided()
              } }
            } finally {
              setBusy(false)
            }
          }}
        />
      </div>
      {refused === null ? null : <ErrorNote message={refused.message} fault={refused.fault} label={t('dev.folderreading.changeNotConfirmed')} />}
    </li>
  )
}

const FOLDER_READING_CSS = `
.fr-lede { color: var(--text-2); }
.fr-note { color: var(--text-2); font-size: var(--fs-1); margin: 0 0 var(--pad); }
.fr-said { white-space: pre-wrap; }
.fr-pieces { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--gut); }
.fr-piece { border: var(--border-w) solid var(--border); border-radius: var(--radius); padding: var(--pad); }
.fr-piece-head { display: flex; flex-wrap: wrap; gap: var(--pad); align-items: baseline; }
.fr-kind { color: var(--text-3); font-size: var(--fs-1); text-transform: none; }
.fr-title { flex: 1 1 20rem; min-width: 0; overflow-wrap: anywhere; font-weight: 600; }
.fr-state { color: var(--text-3); font-size: var(--fs-1); }
.fr-summary { margin: var(--pad) 0 0; color: var(--text-2); overflow-wrap: anywhere; }
.fr-from { margin: var(--pad) 0 0; color: var(--text-3); font-size: var(--fs-1); overflow-wrap: anywhere; }
.fr-quote {
  margin: var(--pad) 0 0;
  padding: var(--pad);
  border-left: 3px solid var(--border-strong);
  background: var(--panel-2);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: var(--fs-1);
}
.fr-edit { display: block; margin-top: var(--pad); }
.fr-edit span { display: block; color: var(--text-2); font-size: var(--fs-1); margin-bottom: 4px; }
.fr-presses { display: flex; flex-wrap: wrap; gap: var(--pad); margin-top: var(--pad); }
.fr-accepted { border-color: var(--st-done-line, var(--border)); }
.fr-rejected { opacity: 0.65; }
`
