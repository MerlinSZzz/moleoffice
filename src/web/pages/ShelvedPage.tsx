// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
/**
 * `#/shelved` — the directions somebody stopped and kept, newest shelved first.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PAGE IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * A shelf is where a line of work goes when it is stopped for now and kept in case it restarts. The
 * whole reason it is not a delete is that a later reader finds it: this page is where. Every word on
 * it comes off the direction's own stored `shelved` fact; nothing is worked out a second time.
 *
 * ---------------------------------------------------------------------------------------
 * THE PRESS IS THE PERSON'S, AND THE SERVER IS WHAT REFUSES AN AGENT
 * ---------------------------------------------------------------------------------------
 *
 * One press restores a direction to open: it sends a merge patch that deletes the `shelved` key, and
 * the server's shelving guard allows it only for the person or the secretary carrying the person's words.
 * There is no browser-side check that the reader is a person, deliberately: a second copy of the
 * rule here is the same permission in two places. A refusal is drawn as the server's own sentence.
 *
 * ---------------------------------------------------------------------------------------
 * EMPTY IS A REAL STATE
 * ---------------------------------------------------------------------------------------
 *
 * A project with nothing on the shelf has not failed at anything, and it is different from a request
 * that failed. The empty answer is one sentence rather than an empty frame; a failed read is drawn
 * by `ErrorNote`, which is a different branch entirely.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT IS DRAWN (the family lists' design, report n9Mjk3c_sJRu block b-17)
 * ---------------------------------------------------------------------------------------
 *
 * The same head as the other family pages, then one plain list, "On the shelf". A row is the
 * direction's title, one second line saying what would restart it and why it was shelved, the date
 * it was shelved at the right, and one press, Restore to open. The whole row opens the direction.
 * The reason stays on the row, and the line wraps to hold it, because the direction's own page does
 * not draw its `shelved` field. The records the shelf travels with are on the direction's page, in
 * its links.
 *
 * NO NEEDS YOU: nothing on a shelf waits on a person.
 */

import { useState } from 'react'
import { faultOf, api, errorMessage, type RecordListItem } from '../api.ts'
import { FamilyHead, PageFoot, sharedOrigin } from '../components/family/parts.tsx'
import { FamilyLists, ListGroup, ListRow, OrderFold } from '../components/family/list.tsx'
import { Absence, Btn, ErrorNote, Loading, Stamp } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { recordPath } from '../components/router.tsx'
import { FAMILY_SHEET } from './family/FamilyPage.tsx'

/** The stored shelf, as the page reads it off a direction. Every field is checked before it is drawn. */
export interface ShelfReading {
  since: string | null
  because: string | null
  restartWhen: string | null
}

/** The shelf on a record, or null when it carries none. A non-object value is not a shelf. */
export function shelfOf(record: Pick<RecordListItem, 'data'>): ShelfReading | null {
  const raw = (record.data as { shelved?: unknown } | null | undefined)?.shelved
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const held = raw as { since?: unknown; because?: unknown; restart_when?: unknown }
  return {
    since: typeof held.since === 'string' ? held.since : null,
    because: typeof held.because === 'string' ? held.because : null,
    restartWhen: typeof held.restart_when === 'string' && held.restart_when.trim() !== '' ? held.restart_when : null,
  }
}

/** The directions on the shelf, newest shelved first, with the id as the tie-break. */
export function shelvedNewestFirst(
  records: readonly RecordListItem[],
): { record: RecordListItem; shelf: ShelfReading }[] {
  const out: { record: RecordListItem; shelf: ShelfReading }[] = []
  for (const record of records) {
    if (record.kind !== 'direction') continue
    const shelf = shelfOf(record)
    if (shelf !== null) out.push({ record, shelf })
  }
  return out.sort((a, b) => {
    const as = a.shelf.since ?? a.record.updatedAt
    const bs = b.shelf.since ?? b.record.updatedAt
    if (as !== bs) return as < bs ? 1 : -1
    return a.record.id < b.record.id ? -1 : 1
  })
}

export function ShelvedPage() {
  const [reloads, setReloads] = useState(0)
  // THE DIRECTIONS AND NO OTHER KIND: only a direction is shelved. It read the whole project (round 15).
  const [state] = useProjectAsync(() => api.recordsOf({ kind: 'direction' }).then((r) => r.records), [reloads])
  const reload = () => setReloads((n) => n + 1)

  return (
    <div className="fam">
      <style href="mole-office-family" precedence="default">
        {FAMILY_SHEET}
      </style>
      <FamilyHead title={t('g7a.shelved.title')} actions={null} />
      {state.status === 'loading' ? <Loading what={t('g7a.shelved.loading')} /> : null}
      {state.status === 'error' ? (
        <ErrorNote message={state.message} fault={state.fault} retry={reload} />
      ) : null}
      {state.status === 'ready' ? <TheShelf records={state.value} onChanged={reload} /> : null}
    </div>
  )
}

/**
 * The list, drawn from what was fetched. Exported so a test can render it with no server and no
 * port, the way `TheTasksToTake` is.
 */
export function TheShelf({
  records,
  onChanged,
}: {
  records: readonly RecordListItem[]
  onChanged?: () => void
}) {
  const rows = shelvedNewestFirst(records)
  const origin = sharedOrigin(rows.map((row) => row.record))
  return (
    <>
      <FamilyLists>
        {/* AN EMPTY SHELF IS ONE LINE UNDER THE HEADING, the short mark, and not an empty frame. A
            project with nothing on the shelf has not failed at anything, and a failed read is drawn
            by ErrorNote above, which is a different branch entirely. */}
        <ListGroup declares={{ surface: 'shelved.list' }} group="shelf" heading={t('g7a.shelved.list')} count={rows.length} records={rows.map((row) => row.record)} empty={<Absence />}>
          {rows.map(({ record, shelf }) => (
            <ShelfRow key={record.id} record={record} shelf={shelf} sayOrigin={origin === null} {...(onChanged === undefined ? {} : { onChanged })} />
          ))}
        </ListGroup>
        <OrderFold>
          <p>{t('lists.order.shelved')}</p>
        </OrderFold>
      </FamilyLists>
      <PageFoot what={t('sheet.record')} exclusions={t('lists.shelved.inspect')} />
    </>
  )
}

/**
 * ONE SHELVED DIRECTION, and its one press.
 *
 * THE PRESS IS THE PERSON'S, AND THE SERVER IS WHAT REFUSES AN AGENT. It sends a merge patch that
 * deletes the `shelved` key, and the server's shelving guard allows it only for the person or the
 * secretary carrying the person's words. A refusal is drawn under the row, in the server's own sentence.
 */
function ShelfRow({
  record,
  shelf,
  sayOrigin,
  onChanged,
}: {
  record: RecordListItem
  shelf: ShelfReading
  sayOrigin: boolean
  onChanged?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)

  const restore = async (): Promise<void> => {
    setBusy(true)
    setRefusal(null)
    try {
      await api.updateRecord(record.id, { dataPatch: { shelved: null } })
      onChanged?.()
    } catch (err) {
      setRefusal({ message: errorMessage(err), fault: faultOf(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <ListRow
      record={record}
      href={`#${recordPath(record.id, record.kind)}`}
      target={{ kind: 'record', recordId: record.id, workspaceId: record.workspaceId }}
      // WHAT WOULD RESTART IT, AND WHY IT WAS SHELVED, IN THE PERSON'S OWN WORDS. The reason stays on
      // the row because this page is the one place it is drawn: the direction's own page does not
      // draw its `shelved` field (measured in tests/the-shelved-page.test.ts, 29 September 2026).
      // So the line wraps rather than cutting the reason off.
      wrap
      line={
        <>
          <span className="flst-label">{t('g7a.shelved.restart')}: </span>
          {shelf.restartWhen ?? <Absence title={t('lists.shelved.noRestart')} />}
          {' · '}
          <span className="flst-label">{t('g7a.shelved.because')}: </span>
          {shelf.because ?? <Absence title={t('lists.shelved.noReason')} />}
        </>
      }
      standing={shelf.since === null ? <Absence title={t('lists.shelved.noDate')} /> : <Stamp at={shelf.since} />}
      press={
        <Btn variant="secondary" size="sm" onClick={() => void restore()} pending={busy}>
          {t('g7a.shelved.restore')}
        </Btn>
      }
      below={refusal === null ? null : <ErrorNote message={refusal.message} fault={refusal.fault} />}
      sayOrigin={sayOrigin}
    />
  )
}
