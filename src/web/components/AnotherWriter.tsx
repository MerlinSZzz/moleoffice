// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ANOTHER WRITER CHANGED THE RECORD WHILE THE PERSON WAS WRITING IN IT (wave 13y round 146).
 *
 * The decision: while the person edits, a change by another writer does not touch the form. A line above the form
 * says who changed the record and when, with a press to see their version. When the person saves, the office asks
 * them to choose between their change and the other, so neither is lost. The reading view follows changes at once,
 * which src/web/lib/record-changes.ts already does.
 *
 * The edit form and six saves drawn beside it on the record page write through `useWriteThisRecord`, which sends the
 * version the form was built on as `ifVersion`: deleting a kept terminal line, the problem's close form, the fork's pin
 * and a decision's words since (round 147), and the goal's confirm press and a comment's new words (round 148). The
 * problem's own page draws its close form the same way (round 148). While the gate `writes-from-a-stale-copy` blocks,
 * the server refuses a write built on an older version with 409 and stores nothing. The browser then reads the record
 * again and the record's versions since, and asks the person only when one of those versions is another writer's. A
 * version written by the person on this page or in another tab is not another writer's, so the write is sent again on
 * the version now stored. Once a write here is stored, or the person keeps the other writer's version, the line goes,
 * because the person has answered it.
 *
 * When the person has switched the gate off, the server stores a write from a stale copy. The form still asks first
 * when this page has heard of another writer's change, and does not ask when it has not.
 */
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { t } from '@shared/i18n.ts'
import { diffValues, stepsOfPath, type FieldDiff } from '@shared/fielddiff.ts'
import type { RevisionActor, RevisionListing } from '../../server/lib/revisions.ts'
import type { PanelRecord, RecordKind } from '@shared/types.ts'
import { api, ApiError, errorMessage, getActor, type RecordChangeReply } from '../api.ts'
import { followChanges } from '../lib/record-changes.ts'
import { writerNamed, type ParticipantsNamed } from '../lib/participant-lookup.ts'
import { RECORD_HISTORY_CSS, WhatChanged, historyFieldName } from './RecordHistory.tsx'
import { Btn, ErrorNote, WordsAroundAStamp } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'

/** A version of the record: the token a write sends back as `ifVersion`, and the revision that holds it. */
export interface Version {
  version: string
  /** Null when the record's history holds no revision with this content. */
  seq: number | null
}

/** The newest change by another writer since a form's version, with the record as it is now. */
interface Theirs {
  who: RevisionActor
  at: string
  /** The revision they wrote. */
  seq: number
  now: Version
  record: PanelRecord
}

/** What a form's write came to. */
export type Written =
  | { saved: RecordChangeReply }
  /** The person kept the other writer's version. The form puts it in its boxes. */
  | { keptTheirs: PanelRecord }
  /** The person went back to the form. Nothing was sent, and what they typed stays. */
  | { notNow: true }

/** A write a form makes: the patch, and how to build it again on the version stored now when the patch rewrites a list whole. */
type Patch = Parameters<typeof api.updateRecord>[1]
type Write = (patch: Patch, again?: (theirs: PanelRecord) => Patch) => Promise<Written>

type Choice = 'mine' | 'theirs' | 'not now'

/** The record as it is now, and the newest change by another writer since a version, when there is one. */
interface Seen {
  now: Version
  /** The record as it is now. */
  record: PanelRecord
  theirs: Theirs | null
}

interface WritingHere {
  recordId: string
  /** The version the page draws now. */
  drawn: () => Version
  /** Whether a version is the record as this page last knew it, from the page, a write here or a read here. */
  isTheNewestKnown: (version: string) => boolean
  wrote: (version: string) => void
  /** A write here was stored or the person kept their version: the line's change is answered, and the visit goes on from this. */
  settled: (now: Version) => void
  changesSince: (from: Version) => Promise<Seen>
  /** The other writer's change, and the write the person is about to make, so the question can show both. */
  ask: (theirs: Theirs, from: Version, mine: Patch) => Promise<Choice>
  /** The other writer's change heard while the person edits, for the line above the form. */
  heard: Theirs | null
  heardFrom: Version
  couldNotHear: string | null
  kind: RecordKind
  participants: ParticipantsNamed | undefined
}

const WritingHereContext = createContext<WritingHere | null>(null)

/** Whether a version was written by whoever this page writes as, the person or an agent the page writes for. */
function isMine(who: RevisionActor): boolean {
  const me = getActor()
  return who.actorType === me.type && who.actorId === me.id
}

/** The newest version in the listing after `from` that another writer wrote, or null when every one is mine. */
function theirsSince(listing: RevisionListing, from: Version): RevisionListing['revisions'][number] | null {
  return listing.revisions.find((entry) => (from.seq === null || entry.seq > from.seq) && !isMine(entry.who)) ?? null
}

/**
 * THE RECORD PAGE SAYS WHICH VERSION IT DRAWS, and every form inside writes on it. `editing` is true on the edit
 * address, where the page reads nothing again by itself, so this listens for changes there and says them in the line.
 */
export function WritingThisRecord({
  recordId,
  kind,
  drawn,
  editing,
  participants,
  onHeardChange,
  children,
}: {
  recordId: string
  kind: RecordKind
  drawn: Version
  editing: boolean
  participants: ParticipantsNamed | undefined
  /**
   * A change by another writer was heard while the person edits. The page reads the record again so every line that
   * counts its versions follows, and the form's own boxes keep what the person typed.
   */
  onHeardChange?: () => void
  children: ReactNode
}) {
  const drawnNow = useRef(drawn)
  drawnNow.current = drawn
  const newest = useRef(drawn.version)
  const shownBefore = useRef(drawn.version)
  if (shownBefore.current !== drawn.version) {
    shownBefore.current = drawn.version
    newest.current = drawn.version
  }
  // THE PAGE AROUND THE FORM IS TOLD ONCE PER NEW CHANGE, not once per event, so a stream that repeats the same
  // version cannot send the page into a read loop.
  const heardCallback = useRef(onHeardChange)
  heardCallback.current = onHeardChange
  const heardSeq = useRef<number | null>(null)

  // ONE EDIT VISIT, from the version drawn when it began. Leaving the edit address or opening another record starts
  // another, so the line says nothing about a change heard before.
  const visitKey = `${recordId} ${editing ? 'editing' : 'reading'}`
  const [visit, setVisit] = useState({ key: visitKey, from: drawn, heard: null as Theirs | null, couldNotHear: null as string | null })
  if (visit.key !== visitKey) {
    heardSeq.current = null
    setVisit({ key: visitKey, from: drawn, heard: null, couldNotHear: null })
  }
  const visitFrom = useRef(visit.from)
  visitFrom.current = visit.from

  const [asking, setAsking] = useState<{ theirs: Theirs; from: Version; mine: Patch; answer: (choice: Choice) => void } | null>(null)

  async function changesSince(from: Version): Promise<Seen> {
    const read = await api.recordNow(recordId)
    const now = { version: read.contentHash, seq: read.seq }
    newest.current = now.version
    // EVERY VERSION SINCE `from` IS READ, even when the newest is the person's own: another form on this page may have
    // saved on top of another writer's change that this form's boxes have not seen.
    if (now.version === from.version) return { now, record: read.record, theirs: null }
    const entry = theirsSince(await api.revisions(recordId), from)
    return { now, record: read.record, theirs: entry === null ? null : { who: entry.who, at: entry.at, seq: entry.seq, now, record: read.record } }
  }

  useEffect(() => {
    if (!editing) return
    let live = true
    const hear = async (): Promise<void> => {
      try {
        const from = visitFrom.current
        const { theirs } = await changesSince(from)
        if (live && theirs !== null) {
          setVisit((v) => (v.key === visitKey ? { ...v, heard: theirs, couldNotHear: null } : v))
          if (heardSeq.current !== theirs.seq) {
            heardSeq.current = theirs.seq
            heardCallback.current?.()
          }
        }
      } catch (err) {
        if (live) setVisit((v) => (v.key === visitKey ? { ...v, couldNotHear: errorMessage(err) } : v))
      }
    }
    const stop = followChanges({ records: [recordId] }, () => void hear())
    return () => {
      live = false
      stop()
    }
    // `changesSince` reads only refs and the id, so the listener lasts the edit visit.
  }, [recordId, editing])

  const here: WritingHere = {
    recordId,
    drawn: () => drawnNow.current,
    isTheNewestKnown: (version) => newest.current === version,
    wrote: (version) => {
      newest.current = version
    },
    settled: (now) => setVisit((v) => (v.key === visitKey ? { ...v, from: now, heard: null, couldNotHear: null } : v)),
    changesSince,
    ask: (theirs, from, mine) =>
      new Promise<Choice>((resolve) => {
        setAsking({ theirs, from, mine, answer: (choice) => { setAsking(null); resolve(choice) } })
      }),
    heard: visit.heard,
    heardFrom: visit.from,
    couldNotHear: visit.couldNotHear,
    kind,
    participants,
  }

  return (
    <WritingHereContext.Provider value={here}>
      {children}
      {asking === null ? null : (
        <TheChoice
          recordId={recordId}
          kind={kind}
          theirs={asking.theirs}
          from={asking.from}
          mine={asking.mine}
          participants={participants}
          answer={asking.answer}
        />
      )}
    </WritingHereContext.Provider>
  )
}

/**
 * HOW A FORM WRITES THE RECORD. `builtOn` says which version its write stands on:
 *
 *   - `opened`, for a form whose boxes hold what the person typed: the version drawn when the form was drawn, then
 *     the version each of its own writes stored;
 *   - `drawn`, for a control that shows the stored value and writes at once: the version the page draws now.
 *
 * A FORM DRAWN WITH NO RECORD PAGE AROUND IT knows no version, so its write carries none and is stored as every write
 * from a screen was before round 146. The Decisions page's cards, Home's tiles and a plan's review draw the fork's pin
 * so. A form inside the page that writes another record is refused here, since the page knows no version of that
 * record.
 */
export function useWriteThisRecord(recordId: string, builtOn: 'opened' | 'drawn'): Write {
  const here = useContext(WritingHereContext)
  const opened = useRef<Version | null>(null)
  if (here !== null) opened.current ??= here.drawn()

  return async (patch, again) => {
    if (here === null) return { saved: await api.updateRecord(recordId, patch) }
    if (here.recordId !== recordId) {
      throw new Error('This form writes a record other than the one its page shows, and the page knows only the version of its own record.')
    }
    // A CONTROL THAT WRITES AT ONCE STANDS ON THE VERSION THE PERSON HAS ANSWERED FOR while a heard change waits. The
    // page reads the record again when another writer's change is heard, so the version it draws is already theirs,
    // and a write on it would be stored without the question the line above the form promises.
    let from = builtOn === 'opened' && opened.current !== null ? opened.current : here.heard !== null ? here.heardFrom : here.drawn()
    let sending = patch
    // ASKED FIRST WHEN THIS PAGE KNOWS OF A NEWER VERSION, so a write is not sent on a copy known to be old.
    let seen = here.isTheNewestKnown(from.version) ? null : await here.changesSince(from)
    for (;;) {
      if (seen !== null && seen.theirs !== null) {
        // WHAT SAVE MINE WOULD WRITE ON THEIR VERSION, so the question shows the person their own change even when
        // that change rewrites a list and has to be built again on what the other writer stored.
        const mine = again === undefined ? sending : again(seen.record)
        const choice = await here.ask(seen.theirs, from, mine)
        if (choice === 'not now') return { notNow: true }
        if (choice === 'theirs') {
          opened.current = seen.now
          here.settled(seen.now)
          return { keptTheirs: seen.theirs.record }
        }
      }
      // A LIST IS BUILT AGAIN ON THE VERSION STORED NOW, whoever wrote it. The person's own newer version, such as a
      // line a terminal kept in a note, would otherwise be lost to a list written whole from the copy the page drew.
      if (seen !== null && seen.now.version !== from.version && again !== undefined) sending = again(seen.record)
      if (seen !== null) from = seen.now
      try {
        const reply = await api.updateRecord(here.recordId, { ...sending, ifVersion: from.version })
        here.wrote(reply.version)
        opened.current = { version: reply.version, seq: reply.newSeq ?? from.seq }
        here.settled(opened.current)
        return { saved: reply }
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 409) throw err
        seen = await here.changesSince(from)
        // THE SAME VERSION IS STILL STORED, so this refusal is about something else and is shown as it came.
        if (seen.now.version === from.version) throw err
      }
    }
  }
}

/** The line above the edit form: who changed the record since the person started editing, and when. */
export function AnotherWriterLine() {
  const here = useContext(WritingHereContext)
  if (here === null) return null
  if (here.couldNotHear !== null) {
    return <ErrorNote message={here.couldNotHear} label={t('record.anotherWriter.couldNotHear')} />
  }
  const theirs = here.heard
  if (theirs === null) return null
  const who = writerNamed(theirs.who, here.participants)
  return (
    <div className="aw-line" role="status">
      <style href="mole-office-another-writer" precedence="default">{ANOTHER_WRITER_CSS}</style>
      <p>
        <WordsAroundAStamp words={(when) => t('record.anotherWriter.line', { who, when })} at={theirs.at} />
      </p>
      <TheirVersion recordId={here.recordId} kind={here.kind} from={here.heardFrom} theirs={theirs} />
    </div>
  )
}

/** The press that shows what changed between the version a form stood on and their version. */
function TheirVersion({ recordId, kind, from, theirs }: { recordId: string; kind: RecordKind; from: Version; theirs: Theirs }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="aw-theirs">
      <Btn size="sm" variant="ghost" onClick={() => setOpen(!open)}>
        {open ? t('record.anotherWriter.hide') : t('record.anotherWriter.see')}
      </Btn>
      {!open ? null : from.seq === null ? (
        <p className="aw-note">{t('record.anotherWriter.noComparison')}</p>
      ) : (
        <TheComparison recordId={recordId} kind={kind} from={from.seq} to={theirs.seq} />
      )}
    </div>
  )
}

function TheComparison({ recordId, kind, from, to }: { recordId: string; kind: RecordKind; from: number; to: number }) {
  const [state] = useProjectAsync(async () => await api.compareRevisions(recordId, from, to), [recordId, from, to])
  return (
    <>
      <style href="mole-office-record-history" precedence="default">{RECORD_HISTORY_CSS}</style>
      {state.status === 'loading' ? (
        <p className="aw-note">{t('record.history.comparing')}</p>
      ) : state.status === 'error' ? (
        <ErrorNote message={state.message} fault={state.fault} label={t('record.history.compareFailed')} />
      ) : (
        <WhatChanged recordKind={kind} from={from} to={to} differences={state.value.differences} />
      )}
    </>
  )
}

/** The fields the person's write would change, measured against the version stored now. */
function thePersonsChanges(record: PanelRecord, patch: Patch): FieldDiff[] {
  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}
  if (patch.title !== undefined) {
    before['title'] = record.title
    after['title'] = patch.title
  }
  if (patch.summary !== undefined) {
    before['summary'] = record.summary
    after['summary'] = patch.summary
  }
  if (patch.data !== undefined) {
    before['data'] = record.data
    after['data'] = patch.data
  }
  if (patch.dataPatch !== undefined) {
    const was = (before['data'] as Record<string, unknown> | undefined) ?? {}
    const becomes = (after['data'] as Record<string, unknown> | undefined) ?? {}
    before['data'] = was
    after['data'] = becomes
    for (const [key, value] of Object.entries(patch.dataPatch)) {
      was[key] = (record.data as Record<string, unknown>)[key] ?? null
      becomes[key] = value
    }
  }
  return diffValues(JSON.stringify(before), JSON.stringify(after)) ?? []
}

/** A changed field's name, out of the words the record's own history uses for it. */
function changedName(path: string): string {
  const steps = stepsOfPath(path.replace(/\[(?:#[^\]]*|\d+)\]/g, '')).filter((step) => step !== 'data')
  const named = steps.map((step) => historyFieldName(step)).filter((name): name is string => name !== null)
  if (named.length > 0) return named.join(' · ')
  const last = steps[steps.length - 1]
  return last === undefined ? t('record.history.wholeRecord') : last
}

/** WHAT THE PERSON CHANGED, beside the value it would replace, so the question covers nothing they need to see. */
function YourChange({ record, patch }: { record: PanelRecord; patch: Patch }) {
  const changes = thePersonsChanges(record, patch)
  if (changes.length === 0) return null
  return (
    <section className="aw-side aw-yours">
      <h3>{t('record.anotherWriter.yourChange')}</h3>
      <ul className="aw-changes">
        {changes.map((change) => (
          <li key={change.path} className="aw-change">
            <span className="aw-change-name">{changedName(change.path)}</span>
            <dl className="aw-pair">
              <div>
                <dt>{t('record.anotherWriter.yours')}</dt>
                <dd className="aw-value">{change.after === null ? t('record.anotherWriter.removed') : change.after}</dd>
              </div>
              <div>
                <dt>{t('record.anotherWriter.theirs')}</dt>
                <dd className="aw-value">{change.before === null ? t('record.anotherWriter.notThere') : change.before}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The question on save: their change or the person's. Escape goes back to the form, as the first press does. */
function TheChoice({
  recordId,
  kind,
  theirs,
  from,
  mine,
  participants,
  answer,
}: {
  recordId: string
  kind: RecordKind
  theirs: Theirs
  from: Version
  /** The write Save mine would make, built on their version, so the person can read their own change here. */
  mine: Patch
  participants: ParticipantsNamed | undefined
  answer: (choice: Choice) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const questionId = useId()
  const opener = useRef<HTMLElement | null>(null)
  useEffect(() => {
    opener.current = document.activeElement as HTMLElement | null
    const element = dialog.current
    element?.showModal()
    element?.querySelector<HTMLButtonElement>('.aw-acts button')?.focus()
    return () => {
      element?.close()
      opener.current?.focus()
    }
  }, [])
  const who = writerNamed(theirs.who, participants)
  return (
    <dialog ref={dialog} className="aw-question" aria-labelledby={questionId}
      onCancel={(event) => { event.preventDefault(); answer('not now') }}>
      <style href="mole-office-another-writer" precedence="default">{ANOTHER_WRITER_CSS}</style>
      <h2 id={questionId}>{t('record.anotherWriter.question')}</h2>
      <p>
        <WordsAroundAStamp words={(when) => t('record.anotherWriter.who', { who, when })} at={theirs.at} />
      </p>
      <div className="aw-compare">
        <section className="aw-side">
          <h3>{t('record.anotherWriter.theirChange')}</h3>
          <TheirVersion recordId={recordId} kind={kind} from={from} theirs={theirs} />
        </section>
        <YourChange record={theirs.record} patch={mine} />
      </div>
      <p className="aw-note">{t('record.anotherWriter.saveMineMeans')}</p>
      <p className="aw-note">{t('record.anotherWriter.keepTheirsMeans')}</p>
      <div className="aw-acts">
        <Btn onClick={() => answer('not now')}>{t('record.anotherWriter.notNow')}</Btn>
        <Btn onClick={() => answer('theirs')}>{t('record.anotherWriter.keepTheirs')}</Btn>
        <Btn variant="primary" onClick={() => answer('mine')}>{t('record.anotherWriter.saveMine')}</Btn>
      </div>
    </dialog>
  )
}

/** Tokens only, in the component, as TieredPress.tsx does for its question. */
const ANOTHER_WRITER_CSS = `
.aw-line { margin: var(--pad) 0; padding: var(--pad) var(--pad-lg); background: var(--panel); color: var(--text);
  border: var(--border-w) solid var(--border-strong); border-left: var(--rail) solid var(--st-blocked);
  border-radius: var(--radius); overflow-wrap: anywhere; }
.aw-line p { margin: 0; }
.aw-theirs { min-width: 0; margin-top: calc(var(--pad) * 0.5); }
.aw-note { color: var(--text-2); }
.aw-question { width: min(36rem, calc(100% - 2 * var(--gut))); max-height: calc(100dvh - 2 * var(--gut));
  overflow-y: auto; padding: var(--pad-lg); background: var(--panel); color: var(--text);
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius); box-shadow: var(--elev-2); overflow-wrap: anywhere; }
.aw-question::backdrop { background: color-mix(in srgb, var(--bg), transparent 25%); }
.aw-question h2 { font-size: var(--fs-4); }
.aw-compare { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--pad-lg);
  align-items: start; margin-top: var(--pad); }
.aw-side { min-width: 0; }
.aw-side h3 { margin: 0 0 calc(var(--pad) * 0.5); font-size: var(--fs-2); color: var(--text-2); font-weight: 600; }
.aw-changes { list-style: none; margin: 0; padding: 0; }
.aw-change { padding: var(--pad) 0; border-top: var(--border-w) solid var(--border); }
.aw-change:first-child { padding-top: 0; border-top: 0; }
.aw-change-name { font-weight: 600; }
.aw-pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--pad);
  margin: calc(var(--pad) * 0.5) 0 0; }
.aw-pair dt { color: var(--text-2); font-size: var(--fs-1); }
.aw-pair dd { margin: 0; overflow-wrap: anywhere; }
@media (max-width: 40rem) {
  .aw-compare { grid-template-columns: 1fr; }
  .aw-pair { grid-template-columns: 1fr; }
}
.aw-acts { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--pad); margin-top: var(--gut); }
`
