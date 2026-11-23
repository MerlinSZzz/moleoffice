// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useEffect, useState } from 'react'
import { content, t } from '@shared/i18n.ts'
import { kindWord } from '@shared/words.ts'
import type { RecordKind } from '@shared/types.ts'
import { EVERY_PROJECT } from '@shared/across-projects.ts'
import { api, errorMessage, faultOf, type Fault } from '../api.ts'
import { ProjectName } from './ProjectChoice.tsx'
import { Absence, ErrorNote } from './ui.tsx'
import { recordPath, RouteLink } from './router.tsx'

/**
 * A RECORD PICKED BY ITS TITLE, NEVER TYPED AS AN ID. Wave 13p round 36, for the flow editor: the cause of a change (a
 * finding, a message or a decision) and each stage's sources (any record).
 *
 * WHY A PICKER OF ITS OWN. The pickers the product had were each built inside a larger part and bound to it: the
 * Context bundles panel searches records but its boxes are not a part anything else can hold, the checklist's evidence
 * picker picks evidence kinds in one project, and the plan line's picker picks work only. None takes a list of kinds.
 * This one is small and takes `kinds`, so the next page that needs to pick a record can hold it.
 *
 * IT ASKS `GET /api/search` ACROSS EVERY PROJECT, the search the Everything page runs, because a flow's sources may be
 * in any project and a message is filed in the message centre. The search takes one kind at a time, so a picker of
 * three kinds asks three times and draws the best of the three together. It asks only after two letters, and only once
 * typing has stopped for a moment.
 */

/** A record the picker found, as a row names it. */
export interface PickedRecord {
  id: string
  title: string
  kind: string
  project: string
}

const SHOWN = 8
const WAIT_MS = 250
const FEWEST_LETTERS = 2

type Found = { status: 'idle' } | { status: 'looking' } | { status: 'ready'; records: PickedRecord[] } | { status: 'error'; message: string; fault: Fault | null }

async function lookFor(words: string, kinds: readonly RecordKind[] | null): Promise<PickedRecord[]> {
  const asks = kinds === null ? [api.search(words, undefined, SHOWN, EVERY_PROJECT)] : kinds.map((kind) => api.search(words, kind, SHOWN, EVERY_PROJECT))
  const replies = await Promise.all(asks)
  return replies
    .flatMap((reply) => reply.results)
    .sort((a, b) => a.rank - b.rank)
    .slice(0, SHOWN)
    .map((result) => ({ id: result.record.id, title: result.record.title, kind: result.record.kind, project: result.record.workspaceId }))
}

export function RecordPicker({
  label,
  kinds,
  chosen,
  titles,
  onPick,
}: {
  /** What the box is for, as its label says it. */
  label: string
  /** The kinds it may pick, or null for any record. */
  kinds: readonly RecordKind[] | null
  /** The ids already picked, drawn as picked and not offered twice. */
  chosen: readonly string[]
  titles: ReadonlyMap<string, string>
  onPick: (record: PickedRecord) => void
}) {
  const [words, setWords] = useState('')
  const [found, setFound] = useState<Found>({ status: 'idle' })
  const kindsKey = kinds === null ? '' : kinds.join(',')

  useEffect(() => {
    const asked = words.trim()
    if (asked.length < FEWEST_LETTERS) {
      setFound({ status: 'idle' })
      return
    }
    let current = true
    setFound({ status: 'looking' })
    const timer = window.setTimeout(() => {
      lookFor(asked, kinds).then(
        (records) => {
          if (current) setFound({ status: 'ready', records })
        },
        (reason: unknown) => {
          if (current) setFound({ status: 'error', message: errorMessage(reason), fault: faultOf(reason) })
        },
      )
    }, WAIT_MS)
    return () => {
      current = false
      window.clearTimeout(timer)
    }
    // `kinds` is read through its key, so a new array of the same kinds asks nothing again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words, kindsKey])

  return (
    <div className="rpk">
      <style href="mole-office-record-picker" precedence="default">{RECORD_PICKER_CSS}</style>
      <input type="search" className="px-input rpk-box" aria-label={label} placeholder={t('recordPicker.placeholder')} value={words} onChange={(event) => setWords(event.target.value)} />
      {found.status === 'idle' ? null : found.status === 'looking' ? (
        <p className="rpk-state">{t('recordPicker.looking')}</p>
      ) : found.status === 'error' ? (
        <ErrorNote message={found.message} fault={found.fault} />
      ) : found.records.length === 0 ? (
        <p className="rpk-state">{t('absence.none')}</p>
      ) : (
        <ul className="rpk-found" aria-label={t('recordPicker.found')}>
          {found.records.map((record) => {
            const picked = chosen.includes(record.id)
            return (
              <li key={record.id}>
                <button
                  type="button"
                  className="rpk-one"
                  disabled={picked}
                  onClick={() => {
                    onPick(record)
                    setWords('')
                  }}
                >
                  <span className="rpk-title">{content(record.title)}</span>
                  <span className="rpk-meta">
                    {kindWord(record.kind).text}
                    <span aria-hidden="true"> · </span>
                    <ProjectName id={record.project} titles={titles} />
                    {picked ? (
                      <>
                        <span aria-hidden="true"> · </span>
                        {t('recordPicker.already')}
                      </>
                    ) : null}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** What one id names, read once per page load: its title and kind, or that no record has it. */
type Named = { status: 'reading' } | { status: 'named'; title: string; kind: string; deleted: boolean } | { status: 'none' } | { status: 'error' }
const NAMED = new Map<string, Promise<Named>>()

function nameOf(id: string): Promise<Named> {
  const held = NAMED.get(id)
  if (held !== undefined) return held
  const asked = api.search(id, undefined, 1, EVERY_PROJECT).then(
    (reply): Named => (reply.exact === null ? { status: 'none' } : { status: 'named', title: reply.exact.title, kind: reply.exact.kind, deleted: reply.exact.deleted }),
    (): Named => ({ status: 'error' }),
  )
  NAMED.set(id, asked)
  return asked
}

/** Tell the names read so far about a record the picker found, so it is drawn by its title at once. */
export function rememberTheName(record: PickedRecord): void {
  NAMED.set(record.id, Promise.resolve({ status: 'named', title: record.title, kind: record.kind, deleted: false }))
}

/**
 * ONE PICKED RECORD, BY ITS TITLE AND KIND, as a link to it. A record named only by its id is looked up by that id;
 * until the answer comes, and when no record has it, the id is what is drawn, with what is true said beside it.
 */
export function RecordByName({ id }: { id: string }) {
  const [named, setNamed] = useState<Named>({ status: 'reading' })
  useEffect(() => {
    let current = true
    setNamed({ status: 'reading' })
    void nameOf(id).then((answer) => {
      if (current) setNamed(answer)
    })
    return () => {
      current = false
    }
  }, [id])
  return (
    <span className="rpk-named" data-named={named.status}>
      <RouteLink className="rpk-link" to={recordPath(id)}>
      {named.status === 'named' ? (
        <>
          <span className="rpk-title">{content(named.title)}</span> <span className="rpk-meta">{kindWord(named.kind).text}</span>
          {named.deleted ? <Absence word={t('recordPicker.deleted')} /> : null}
        </>
      ) : (
        <>
          <span className="rpk-id">{id}</span>
          {named.status === 'none' ? <Absence word={t('recordPicker.noSuchRecord')} /> : named.status === 'error' ? <Absence word={t('recordPicker.notRead')} /> : null}
        </>
      )}
      </RouteLink>
    </span>
  )
}

export const RECORD_PICKER_CSS = `
.rpk { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.rpk-box { width: 100%; max-width: 32rem; }
.rpk-state { margin: 0; color: var(--text-2); font-size: var(--fs-1); }
.rpk-found { list-style: none; margin: 0; padding: 0; border: var(--border-w) solid var(--border); border-radius: var(--radius-sm); background: var(--panel); max-width: 40rem; }
.rpk-found > li + li { border-top: var(--border-w) solid var(--border); }
.rpk-one {
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px; width: 100%; text-align: left;
  padding: 6px 10px; border: none; background: none; color: var(--text); font: inherit; cursor: pointer; min-height: 2rem;
}
.rpk-one:hover:not(:disabled) { background: var(--hover); }
.rpk-one:disabled { cursor: default; color: var(--text-2); }
.rpk-title { overflow-wrap: anywhere; }
.rpk-meta { font-size: var(--fs-1); color: var(--text-2); }
.rpk-named, .rpk-link { display: inline-flex; flex-wrap: wrap; gap: 0 6px; align-items: baseline; min-width: 0; }
.rpk-id { font-family: var(--font-mono); }
@media (max-width: 40rem) {
  .rpk-one { min-height: 44px; }
}
`
