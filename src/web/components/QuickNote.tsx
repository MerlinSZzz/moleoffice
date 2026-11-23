// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE QUICK NOTE A PERSON WRITES AND DRAWS IN, KEPT IN THE OFFICE AS THEY GO. It fills the box it is drawn in: the whole
 * note page at `#/quick-note` (src/web/pages/QuickNotePage.tsx), or a box beside another page.
 *
 * IT OPENS READY TO WRITE. The cursor is in the note's first words, and the pen, the eraser, the colours and Undo are
 * one press away above the sheet.
 *
 * A NEW NOTE IS FILED AT ITS FIRST CHANGE. The record is filed when the person first writes or draws, so a note opened
 * and closed with nothing in it leaves no empty record behind, and `filed` hands its id to whoever drew the note.
 *
 * IT IS KEPT AS IT IS WRITTEN, WITH NO PRESS TO SAVE. Half a second after the person stops, the parts go to the
 * office. One save is under way at a time, and a change made during it goes in the next one. When the page is hidden
 * or closed, or the note is no longer drawn, what is not kept yet is sent at once. Each save is built on the version
 * the last one stored, so a note changed in another window is refused rather than written over, and the note says so
 * and offers both ways on.
 *
 * IT ASKS FOR ITS TITLE, in a field at its head that each save reads. Left empty, the field shows as a hint the title
 * the note's words give it, and that is the title saved. Two notes may be given the same title.
 *
 * "SAVED" IS SAID ONLY OF WHAT THE OFFICE ANSWERED. Until the answer comes the foot says the note is being saved. A
 * save the office refused says why, with a press to send it again.
 *
 * A PICTURE OR A FILM IS PASTED, DROPPED OR CHOSEN IN. Pasted or chosen, it goes at the top left of the part of the
 * sheet in view; dropped, where it is dropped; several go one below another. The note says which file it is adding
 * until the office has stored it, and names each file it did not add, with the reason.
 */
import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import { t, type WordKey } from '@shared/i18n.ts'
import { A_NOTE_HOLDS_TAGS, A_TAG_HOLDS, quickNoteTagsOf, type QuickNoteColour, type QuickNotePage as WrittenFrom, type QuickNotePart } from '@shared/kinds/quick-note.ts'
import { stampInZone, theClockZone } from '@shared/time.ts'
import { ApiError, api, errorMessage, faultOf, type Fault } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { theTitleFollowsTheWords, titleOf } from '../lib/quick-note-title.ts'
import { aTagFrom, theColourOfATag, type ATagRefused } from '../lib/note-tags.ts'
import { LabelColourStyle } from './chat/LabelColours.tsx'
import { QuickNoteSheet, aNewPartId, thePlaceInView, type APlaceForFiles, type QuickNoteTool } from './QuickNoteSheet.tsx'
import { aPartFrom } from './quick-note-files.ts'
import { QUICK_NOTE_COLOURS } from './quick-note-colours.ts'
import { RouteLink, recordPath } from './router.tsx'
import { Btn, ErrorNote } from './ui.tsx'

/** How long after the last change the note is sent, in milliseconds. */
const A_SAVE_WAITS = 500
/** How many changes Undo can take back. */
const UNDO_HOLDS = 100
/** The largest save a closing page can still send: a browser carries at most 64 KiB past the page's end. */
const A_CLOSING_PAGE_CARRIES = 60_000
/** How far apart files added together are placed, one below another, in pixels of the sheet. */
const FILES_ARE_APART = 12

/**
 * Keep what is not kept yet, and say whether it was kept. `waitAtMost` bounds the wait for a save underway, in
 * milliseconds: a save that has not ended by then answers that it was not kept, while it goes on.
 */
export type FlushQuickNote = (waitAtMost?: number) => Promise<{ ok: boolean; id: string | null }>

/** Whether a save underway ends before the deadline. With no deadline it is waited for however long it takes. */
async function endsBy(save: Promise<void>, deadline: number | null): Promise<boolean> {
  if (deadline === null) {
    await save
    return true
  }
  let timer = 0
  const late = new Promise<false>((resolve) => {
    timer = window.setTimeout(() => resolve(false), Math.max(0, deadline - Date.now()))
  })
  try {
    return await Promise.race([save.then(() => true), late])
  } finally {
    window.clearTimeout(timer)
  }
}

export interface QuickNoteProps {
  /**
   * The note to open, or none for a new note. It is read once, when the note is first drawn: to open another note,
   * draw a new one, keyed by what it opens.
   */
  id?: string
  /**
   * The page the person was on when they started a new note, or none when it was started from no page. The foot names
   * it from the first drawing, and the first save keeps it. A note opened by its id names the page it keeps instead.
   */
  writtenFrom?: WrittenFrom
  /** Told the new note's id once, when its first save has filed it. */
  filed?: (id: string) => void
  /** Told the note's title whenever it changes, and null while the note has none. */
  titled?: (title: string | null) => void
  /** Wait for the latest changes before opening this note in another window. */
  flushRef?: MutableRefObject<FlushQuickNote | null>
}

/** Where the note stands with the office. */
type Saving =
  | { state: 'nothing' }
  | { state: 'saving' }
  | { state: 'saved'; at: string }
  | { state: 'refused'; reason: string }
  | { state: 'changedElsewhere' }

/** The file the note is adding now, and each file it did not add, with the reason. */
interface Adding {
  now: string | null
  refused: { name: string; reason: string }[]
}

/** Where the reading of a named note stands. */
type Reading = { state: 'reading' } | { state: 'failed'; reason: string; fault: Fault | null } | { state: 'notANote' } | { state: 'ready' }

/** What the office keeps of the note, and what the next save is built on. */
interface Kept {
  id: string | null
  version: string | null
  /**
   * THE PROJECT THE NOTE IS KEPT IN, once the office has said it, which every later read and save of the note names, and
   * the sheet asks the note's pictures in. The file door serves a file named by a record in the project it is asked in.
   */
  project: string | null
  parts: QuickNotePart[]
  title: string | null
  tags: string[]
}

/** The parts as the office keeps them: words with nothing in them are not kept. */
function partsToKeep(parts: readonly QuickNotePart[]): QuickNotePart[] {
  return parts.filter((part) => part.type !== 'words' || part.text.trim() !== '')
}

/** Every stored file a note's parts name, so the page asks for a picture only once the office keeps a record naming it. */
function pathsIn(parts: readonly QuickNotePart[]): Set<string> {
  return new Set(parts.flatMap((part) => (part.type === 'picture' || part.type === 'video' ? [part.path] : [])))
}

export function QuickNote({ id, writtenFrom: startedFrom, filed, titled, flushRef }: QuickNoteProps) {
  useLanguage()
  const [reading, setReading] = useState<Reading>(id === undefined ? { state: 'ready' } : { state: 'reading' })
  const [parts, setParts] = useState<QuickNotePart[]>([])
  const [writtenFrom, setWrittenFrom] = useState<WrittenFrom | null>(id === undefined ? (startedFrom ?? null) : null)
  const [title, setTitle] = useState<string | null>(null)
  const [tool, setTool] = useState<QuickNoteTool>('pen')
  const [colour, setColour] = useState<QuickNoteColour>('ink')
  const [writing, setWriting] = useState<string | null>(null)
  const [keptPaths, setKeptPaths] = useState<ReadonlySet<string>>(new Set())
  const [saving, setSaving] = useState<Saving>({ state: 'nothing' })
  const [undoable, setUndoable] = useState(0)
  const [adding, setAdding] = useState<Adding>({ now: null, refused: [] })

  const sheet = useRef<HTMLDivElement>(null)
  const latest = useRef<QuickNotePart[]>(parts)
  const kept = useRef<Kept>({ id: id ?? null, version: null, project: null, parts: [], title: null, tags: [] })
  // THE NOTE'S TAGS, as the person has given them, which each save reads.
  const [tags, setTags] = useState<string[]>([])
  const tagsNow = useRef<string[]>([])
  // THE TITLE THE PERSON GAVE, as the field at the note's head holds it, and empty while the note takes its words' title.
  const [naming, setNaming] = useState('')
  const named = useRef('')
  const undo = useRef<QuickNotePart[][]>([])
  const timer = useRef<number | null>(null)
  const out = useRef(false)
  const pending = useRef<Promise<void> | null>(null)
  const saveFailed = useRef(false)
  const filesActive = useRef(0)
  const fileWaiters = useRef<Array<() => void>>([])
  const again = useRef(false)
  const stopped = useRef(false)
  const here = useRef(true)
  // THE CALLER'S LATEST WORDS FOR A FILED NOTE AND A TITLE, so a save answered after a new drawing tells the new ones.
  const tell = useRef({ filed, titled })
  tell.current = { filed, titled }

  useEffect(() => {
    tell.current.titled?.(title)
  }, [title])

  /** Draw what the office keeps of a note, and build the next save on it. */
  const holdTheStored = (record: { id: string; workspaceId: string; title: string; data: Record<string, unknown> }, version: string) => {
    const stored = Array.isArray(record.data['parts']) ? (record.data['parts'] as QuickNotePart[]) : []
    const storedTags = quickNoteTagsOf(record.data)
    kept.current = { id: record.id, version, project: record.workspaceId, parts: stored, title: record.title, tags: storedTags }
    tagsNow.current = storedTags
    setTags(storedTags)
    // A TITLE ITS WORDS DID NOT GIVE IT is one it was given, and the field shows it.
    named.current = theTitleFollowsTheWords(record.title, stored) ? '' : record.title
    setNaming(named.current)
    latest.current = stored
    setParts(stored)
    setTitle(record.title)
    setWrittenFrom((record.data['from_page'] as WrittenFrom | undefined) ?? null)
    setKeptPaths(pathsIn(stored))
  }

  /** The project to name when the note is read or saved: the one the office keeps it in, or the switcher's until it has said. */
  const inItsProject = (): { workspaceId?: string } => (kept.current.project === null ? {} : { workspaceId: kept.current.project })

  const readTheNote = (noteId: string, project = inItsProject()) => {
    setReading({ state: 'reading' })
    api
      .getRecord(noteId, project)
      .then((reply) => {
        if (!here.current) return
        if (reply.record.kind !== 'quick_note') {
          setReading({ state: 'notANote' })
          return
        }
        holdTheStored(reply.record, reply.version)
        stopped.current = false
        setSaving({ state: 'nothing' })
        setReading({ state: 'ready' })
      })
      .catch((err: unknown) => {
        if (!here.current) return
        const fault = faultOf(err)
        // A NOTE KEPT IN ANOTHER PROJECT is read again there, once, when the office's refusal names this note and its
        // project. A note opened by its address while another project is open is still the person's own note.
        const there = fault?.elsewhere ?? null
        if (there !== null && there.recordId === noteId && project.workspaceId === undefined) {
          readTheNote(noteId, { workspaceId: there.workspaceId })
          return
        }
        setReading({ state: 'failed', reason: errorMessage(err), fault })
      })
  }

  useEffect(() => {
    if (id !== undefined) readTheNote(id)
  }, [])

  /** The title a save keeps: the one the person gave, or the one the note's words give while the field is empty. */
  const theTitleToKeep = (toKeep: readonly QuickNotePart[]): string => {
    const given = named.current.trim()
    return given === '' ? titleOf(toKeep) : given
  }

  /** Send what is not kept yet. `leaving` says the page is being hidden or closed, so the save must outlive it. */
  const send = (leaving = false): void => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    if (stopped.current) return
    if (out.current) {
      again.current = true
      return
    }
    const now = kept.current
    const changeTarget = now.id !== null && now.version !== null ? { id: now.id, version: now.version } : null
    if (now.id !== null && changeTarget === null) return
    const toKeep = partsToKeep(latest.current)
    const newTitle = theTitleToKeep(toKeep)
    const newTags = tagsNow.current
    const sameTags = JSON.stringify(newTags) === JSON.stringify(now.tags)
    // A NEW NOTE IS FILED ONLY WHEN IT HOLDS SOMETHING, and a kept note is sent only when it changed.
    if (now.id === null && toKeep.length === 0) return
    if (now.id !== null && JSON.stringify(toKeep) === JSON.stringify(now.parts) && newTitle === now.title && sameTags) return
    out.current = true
    saveFailed.current = false
    if (here.current) setSaving({ state: 'saving' })
    const write =
      changeTarget === null
        ? api
            .fileAQuickNote({
              title: newTitle,
              data: { parts: toKeep, ...(newTags.length === 0 ? {} : { tags: newTags }), ...(startedFrom === undefined ? {} : { from_page: startedFrom }) },
            })
            .then((reply) => {
              kept.current = { ...kept.current, id: reply.record.id, version: reply.version, project: reply.record.workspaceId }
              if (here.current) tell.current.filed?.(reply.record.id)
            })
        : api
            .changeAQuickNote(
              changeTarget.id,
              {
                ...(newTitle === now.title ? {} : { title: newTitle }),
                parts: toKeep,
                ...(sameTags ? {} : { tags: newTags }),
                ifVersion: changeTarget.version,
                ...(now.project === null ? {} : { workspaceId: now.project }),
              },
              leaving,
            )
            .then((reply) => {
              kept.current = { ...kept.current, version: reply.version }
            })
    pending.current = write
      .then(() => {
        kept.current = { ...kept.current, parts: toKeep, title: newTitle, tags: newTags }
        if (!here.current) return
        setTitle(newTitle)
        setKeptPaths(pathsIn(toKeep))
        setSaving({ state: 'saved', at: stampInZone(Date.now(), theClockZone()).slice(11, 16) })
      })
      .catch((err: unknown) => {
        saveFailed.current = true
        // A NOTE CHANGED SOMEWHERE ELSE IS NOT WRITTEN OVER. Saving stops until the person says which to keep.
        if (err instanceof ApiError && err.status === 409) {
          stopped.current = true
          if (here.current) setSaving({ state: 'changedElsewhere' })
          return
        }
        if (here.current) setSaving({ state: 'refused', reason: errorMessage(err) })
      })
      .finally(() => {
        out.current = false
        pending.current = null
        if (again.current && !saveFailed.current) {
          again.current = false
          send()
        }
      })
  }

  // A pop-out waits for files and every save already underway, including edits made during a save.
  useEffect(() => {
    if (flushRef === undefined) return
    const flush: FlushQuickNote = async (waitAtMost) => {
      const deadline = waitAtMost === undefined ? null : Date.now() + waitAtMost
      if (reading.state !== 'ready') return { ok: true, id: kept.current.id }
      if (stopped.current) return { ok: false, id: kept.current.id }
      while (filesActive.current > 0) await new Promise<void>((resolve) => fileWaiters.current.push(resolve))
      for (;;) {
        const now = kept.current
        const toKeep = partsToKeep(latest.current)
        const newTitle = theTitleToKeep(toKeep)
        const unchanged =
          now.id === null
            ? toKeep.length === 0
            : JSON.stringify(toKeep) === JSON.stringify(now.parts) && newTitle === now.title && JSON.stringify(tagsNow.current) === JSON.stringify(now.tags)
        if (unchanged && pending.current === null) return { ok: true, id: now.id }
        if (pending.current === null) send()
        const waiting = pending.current
        if (waiting === null) return { ok: false, id: kept.current.id }
        if (!(await endsBy(waiting, deadline))) return { ok: false, id: kept.current.id }
        if (saveFailed.current || stopped.current) return { ok: false, id: kept.current.id }
      }
    }
    flushRef.current = flush
    return () => { if (flushRef.current === flush) flushRef.current = null }
  })

  /** A save soon: half a second after the last change. */
  const soon = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => send(), A_SAVE_WAITS)
  }

  // WHAT IS NOT KEPT YET IS SENT AS THE PAGE IS HIDDEN, CLOSED OR LEFT, and when the note is no longer drawn. The
  // window app closes a note window at once, with no question, because of this.
  useEffect(() => {
    here.current = true
    const leaving = () => {
      const body = JSON.stringify(partsToKeep(latest.current))
      send(body.length < A_CLOSING_PAGE_CARRIES)
    }
    const hidden = () => {
      if (document.visibilityState === 'hidden') leaving()
    }
    document.addEventListener('visibilitychange', hidden)
    window.addEventListener('pagehide', leaving)
    return () => {
      document.removeEventListener('visibilitychange', hidden)
      window.removeEventListener('pagehide', leaving)
      here.current = false
      send()
    }
  }, [])

  const aChangeBegins = () => {
    const before = latest.current
    const last = undo.current[undo.current.length - 1]
    if (last !== undefined && JSON.stringify(last) === JSON.stringify(before)) return
    undo.current = [...undo.current.slice(-(UNDO_HOLDS - 1)), before]
    setUndoable(undo.current.length)
  }

  const change = (next: QuickNotePart[]) => {
    latest.current = next
    setParts(next)
    soon()
  }

  // A REFUSAL STAYS SAID UNTIL THE PERSON CHANGES THE NOTE OR ADDS ANOTHER FILE.
  const aChangeOnTheSheet = () => {
    setAdding((now) => (now.refused.length === 0 ? now : { ...now, refused: [] }))
    aChangeBegins()
  }

  /** Check, store and place files the person added, one below another from a place on the sheet, one at a time. */
  const addFiles = async (files: readonly File[], place: APlaceForFiles) => {
    filesActive.current += 1
    try {
      const refused: Adding['refused'] = []
      let y = place.y
      for (const file of files) {
        if (!here.current) return
        setAdding({ now: file.name, refused: [...refused] })
        const gave = await aPartFrom(file, place.room)
        if ('refused' in gave) {
          refused.push({ name: file.name, reason: gave.refused })
          continue
        }
        const part: QuickNotePart = { ...gave.part, id: aNewPartId(gave.part.type, latest.current), x: place.x, y }
        y += gave.part.height + FILES_ARE_APART
        aChangeBegins()
        change([...latest.current, part])
      }
      if (here.current) setAdding({ now: null, refused })
    } finally {
      filesActive.current -= 1
      if (filesActive.current === 0) for (const resolve of fileWaiters.current.splice(0)) resolve()
    }
  }

  const takeBack = () => {
    const before = undo.current.pop()
    setUndoable(undo.current.length)
    if (before === undefined) return
    setWriting(null)
    change(before)
  }

  // CTRL+Z OR ⌘Z TAKES BACK THE LAST CHANGE, except in a field, where it takes back typing as a field always does.
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'z' || !(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return
      if (event.target instanceof HTMLElement && event.target.closest('textarea, input, [contenteditable]') !== null) return
      event.preventDefault()
      takeBack()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  return (
    <div
      className="qn-note"
      onPaste={(event) => {
        const files = [...event.clipboardData.files]
        if (reading.state !== 'ready' || sheet.current === null || files.length === 0) return
        // IN A FIELD, WORDS ON THE CLIPBOARD ARE PASTED AS WORDS, so cells copied with a picture of themselves paste
        // their words where the person is writing.
        const inAField = event.target instanceof Element && event.target.closest('textarea, input') !== null
        if (inAField && event.clipboardData.types.includes('text/plain')) return
        event.preventDefault()
        void addFiles(files, thePlaceInView(sheet.current))
      }}
    >
      <style href="mole-office-quick-note" precedence="default">{CSS}</style>
      {reading.state === 'ready' ? (
        <>
          <label className="qn-naming">
            <span className="qn-naming-word">{t('quickNote.titleField')}</span>
            <input
              className="qn-title-field"
              type="text"
              value={naming}
              placeholder={titleOf(partsToKeep(parts))}
              onChange={(event) => {
                named.current = event.target.value
                setNaming(event.target.value)
                soon()
              }}
            />
          </label>
          <NoteTags
            tags={tags}
            change={(next) => {
              tagsNow.current = next
              setTags(next)
              soon()
            }}
          />
          <Tools
            tool={tool}
            setTool={setTool}
            colour={colour}
            setColour={setColour}
            undoable={undoable > 0}
            takeBack={takeBack}
            addFiles={(files) => {
              if (sheet.current !== null) void addFiles(files, thePlaceInView(sheet.current))
            }}
          />
          <ChangedElsewhere
            saving={saving}
            keepThisPage={() => {
              const own = kept.current.id
              if (own === null) return
              api
                .getRecord(own, inItsProject())
                .then((reply) => {
                  kept.current = { ...kept.current, version: reply.version, parts: [] }
                  stopped.current = false
                  send()
                })
                .catch((err: unknown) => setSaving({ state: 'refused', reason: errorMessage(err) }))
            }}
            showTheKept={() => {
              if (kept.current.id !== null) readTheNote(kept.current.id)
            }}
          />
          <QuickNoteSheet
            parts={parts}
            tool={tool}
            colour={colour}
            kept={keptPaths}
            project={kept.current.project ?? undefined}
            record={kept.current.id ?? undefined}
            writing={writing}
            setWriting={setWriting}
            aChangeBegins={aChangeOnTheSheet}
            change={change}
            startsWriting={id === undefined}
            scroller={sheet}
            addFiles={(files, place) => void addFiles(files, place)}
          />
          {adding.now === null ? null : (
            <p className="qn-adding" role="status">
              {t('quickNote.picture.adding', { name: adding.now })}
            </p>
          )}
          {adding.refused.length === 0 ? null : (
            <div className="qn-refused" role="alert">
              {adding.refused.map((one, at) => (
                <p key={at}>{t('quickNote.picture.refused', { name: one.name, reason: one.reason })}</p>
              ))}
            </div>
          )}
        </>
      ) : reading.state === 'reading' ? (
        <p className="qn-reading" role="status">
          {t('quickNote.reading')}
        </p>
      ) : reading.state === 'notANote' ? (
        <p className="qn-reading">
          {t('quickNote.notANote')} {id === undefined ? null : <RouteLink to={recordPath(id)}>{t('quickNote.openItsPage')}</RouteLink>}
        </p>
      ) : (
        <ErrorNote message={reading.reason} fault={reading.fault} retry={() => (id === undefined ? undefined : readTheNote(id))} />
      )}
      <footer className="qn-foot">
        <WhereItIsKept filed={kept.current.id !== null} writtenFrom={writtenFrom} />
        <SavingSays saving={saving} again={() => send()} />
      </footer>
    </div>
  )
}

/** Where the thing drawn inside a word goes while the word is read. A control character, which no word holds. */
const INSIDE_MARK = '\u0000'

/**
 * WORDS WITH A THING DRAWN INSIDE THEM, at the place the word list marks `{name}`, so a link or a bold word sits where
 * the person's language puts it. A word with no such place, or two, is a fault in the word list and is said as one.
 */
function wordsAround(key: WordKey, name: string, inside: ReactNode): ReactNode {
  const said = t(key, { [name]: INSIDE_MARK })
  const pieces = said.split(INSIDE_MARK)
  if (pieces.length !== 2) throw new Error(`The word "${key}" has ${String(pieces.length - 1)} {${name}} places, and needs exactly one.`)
  return (
    <>
      {pieces[0]}
      {inside}
      {pieces[1]}
    </>
  )
}

/** Where the note is kept, and the page it was written from when it was written from one. */
function WhereItIsKept({ filed, writtenFrom }: { filed: boolean; writtenFrom: WrittenFrom | null }) {
  if (!filed && writtenFrom === null) return null
  const myNotes = <strong>{t('quickNote.myNotes')}</strong>
  return (
    <p className="qn-where">
      {filed ? wordsAround('quickNote.keptIn', 'myNotes', myNotes) : null}
      {writtenFrom === null ? null : (
        <>
          {filed ? ' · ' : null}
          {wordsAround('quickNote.writtenFrom', 'page', <RouteLink to={writtenFrom.address.replace(/^#/u, '')} title={writtenFrom.name}>{writtenFrom.name}</RouteLink>)}
        </>
      )}
    </p>
  )
}

/** What the foot says of the last save. */
function SavingSays({ saving, again }: { saving: Saving; again: () => void }) {
  if (saving.state === 'nothing' || saving.state === 'changedElsewhere') return null
  if (saving.state === 'saving') return <span className="qn-saving" role="status">{t('quickNote.saving')}</span>
  if (saving.state === 'saved') return <span className="qn-saving" role="status">{t('quickNote.saved', { time: saving.at })}</span>
  return (
    <span className="qn-saving" data-refused="1" role="alert">
      {t('quickNote.notSaved', { reason: saving.reason })}{' '}
      <Btn size="sm" onClick={again}>
        {t('quickNote.saveAgain')}
      </Btn>
    </span>
  )
}

/** What the note says when typed words make no tag. Empty words make none and say nothing. */
const A_TAG_REFUSED: Record<Exclude<ATagRefused, 'empty'>, () => string> = {
  long: () => t('quickNote.tagTooLong', { n: A_TAG_HOLDS }),
  twice: () => t('quickNote.tagTwice'),
  full: () => t('quickNote.tagsFull', { n: A_NOTE_HOLDS_TAGS }),
}

/**
 * THE NOTE'S TAGS AND THE FIELD A TAG IS ADDED IN, under its title. Each tag is a filled label in the colour worked out
 * from its letters, the colour it has on My notes too. Enter or a comma adds what was typed, and so does leaving the
 * field.
 */
function NoteTags({ tags, change }: { tags: readonly string[]; change: (next: string[]) => void }) {
  const [typed, setTyped] = useState('')
  const [refused, setRefused] = useState<ATagRefused | null>(null)
  const add = () => {
    const made = aTagFrom(typed, tags)
    if ('refused' in made) {
      setRefused(made.refused)
      return
    }
    setRefused(null)
    setTyped('')
    change([...tags, made.tag])
  }
  return (
    <div className="qn-tags" role="group" aria-label={t('quickNote.tags')}>
      <LabelColourStyle />
      <span className="qn-naming-word">{t('quickNote.tags')}</span>
      {tags.length === 0 ? null : (
        <ul className="qn-tag-list">
          {tags.map((tag) => (
            <li key={tag} className="qn-tag px-label-ink" data-colour={theColourOfATag(tag)}>
              <span className="qn-tag-word">{tag}</span>
              <button
                type="button"
                className="qn-tag-off"
                aria-label={t('quickNote.removeTag', { tag })}
                title={t('quickNote.removeTag', { tag })}
                onClick={() => change(tags.filter((one) => one !== tag))}
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        className="qn-tag-field"
        type="text"
        value={typed}
        placeholder={t('quickNote.addATag')}
        aria-label={t('quickNote.addATag')}
        onChange={(event) => {
          setTyped(event.target.value)
          setRefused(null)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ',') return
          event.preventDefault()
          add()
        }}
        onBlur={() => {
          if (typed.trim() !== '') add()
        }}
      />
      {refused === null || refused === 'empty' ? null : (
        <span className="qn-tag-refused" role="status">
          {A_TAG_REFUSED[refused]()}
        </span>
      )}
    </div>
  )
}

/** The note was changed somewhere else after this page last kept it, and the page has stopped saving. */
function ChangedElsewhere({ saving, keepThisPage, showTheKept }: { saving: Saving; keepThisPage: () => void; showTheKept: () => void }) {
  if (saving.state !== 'changedElsewhere') return null
  return (
    <div className="qn-elsewhere" role="alert">
      <p>{t('quickNote.changedElsewhere')}</p>
      <Btn size="sm" onClick={keepThisPage}>
        {t('quickNote.keepThisPage')}
      </Btn>
      <Btn size="sm" onClick={showTheKept}>
        {t('quickNote.showTheKept')}
      </Btn>
    </div>
  )
}

const COLOURS: readonly QuickNoteColour[] = ['ink', 'red', 'blue']

/** Each pen colour's name, each read from its own word key. */
const COLOUR_WORDS: Readonly<Record<QuickNoteColour, string>> = {
  get ink() { return t('quickNote.colour.ink') },
  get red() { return t('quickNote.colour.red') },
  get blue() { return t('quickNote.colour.blue') },
}

/** The drawing tools, one press away above the sheet, and the press that adds a picture or a film. */
function Tools({ tool, setTool, colour, setColour, undoable, takeBack, addFiles }: {
  tool: QuickNoteTool
  setTool: (tool: QuickNoteTool) => void
  colour: QuickNoteColour
  setColour: (colour: QuickNoteColour) => void
  undoable: boolean
  takeBack: () => void
  addFiles: (files: File[]) => void
}) {
  const chooser = useRef<HTMLInputElement>(null)
  const toolPress = (own: QuickNoteTool, word: string, icon: ReactNode) => (
    <button type="button" className="qn-tool" aria-pressed={tool === own} title={word} onClick={() => setTool(own)}>
      {icon}
      <span className="qn-tool-word">{word}</span>
    </button>
  )
  return (
    <div className="qn-tools" role="toolbar" aria-label={t('quickNote.tools')}>
      {toolPress('pen', t('quickNote.pen'), ICONS.pen)}
      {toolPress('eraser', t('quickNote.eraser'), ICONS.eraser)}
      {toolPress('box', t('quickNote.box'), ICONS.box)}
      {toolPress('line', t('quickNote.line'), ICONS.line)}
      <span className="qn-colours" role="radiogroup" aria-label={t('quickNote.colour')}>
        {COLOURS.map((one) => (
          <button
            key={one}
            type="button"
            role="radio"
            className="qn-colour"
            style={{ background: QUICK_NOTE_COLOURS[one] }}
            aria-checked={colour === one}
            aria-label={COLOUR_WORDS[one]}
            title={COLOUR_WORDS[one]}
            onClick={() => {
              setColour(one)
              setTool('pen')
            }}
          />
        ))}
      </span>
      <button type="button" className="qn-tool" disabled={!undoable} title={t('quickNote.undo')} aria-label={t('quickNote.undo')} onClick={takeBack}>
        {ICONS.undo}
      </button>
      <button type="button" className="qn-tool qn-add" title={t('quickNote.addAPicture')} aria-label={t('quickNote.addAPicture')} onClick={() => chooser.current?.click()}>
        {ICONS.picture}
      </button>
      <input
        ref={chooser}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])]
          // THE SAME FILE CAN BE CHOSEN AGAIN, because the chooser forgets it once it is handed on.
          event.target.value = ''
          addFiles(files)
        }}
      />
    </div>
  )
}

/** The tools' own small drawings, in the strokes of the sidebar's icons. */
const ICONS = {
  pen: (
    <svg className="qn-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 20l1-4L16 5l3 3L8 19z M14 7l3 3" />
    </svg>
  ),
  eraser: (
    <svg className="qn-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M8 20h12 M4.5 15.5l9-9 6 6-7.5 7.5H9z M9 11l6 6" />
    </svg>
  ),
  undo: (
    <svg className="qn-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9 7L5 11l4 4 M5 11h9a5 5 0 0 1 0 10h-3" />
    </svg>
  ),
  box: (
    <svg className="qn-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 6h16v12H4z" />
    </svg>
  ),
  line: (
    <svg className="qn-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 19L19 5 M12 5h7v7" />
    </svg>
  ),
  picture: (
    <svg className="qn-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 5h16v14H4z M4 16l5-5 4 4 2-2 5 5 M16.5 9a1.5 1.5 0 1 1-3 0a1.5 1.5 0 1 1 3 0" />
    </svg>
  ),
} as const

const CSS = `
.qn-note { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--bg); color: var(--text); container-type: inline-size; }
.qn-naming {
  display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-bottom: var(--border-w) solid var(--border);
  background: var(--panel);
}
.qn-naming-word { color: var(--text-2); font-size: var(--fs-1); }
.qn-title-field {
  flex: 1; min-width: 0; min-height: 32px; box-sizing: border-box; padding: 0 8px; font: inherit; font-weight: 600;
  color: var(--text); background: var(--bg); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
}
.qn-title-field::placeholder { color: var(--placeholder); font-weight: 400; }
.qn-title-field:focus-visible { outline: 2px solid var(--text); outline-offset: -2px; }
/* A NOTE'S TAGS, under its title, each a filled label in the colour worked out from its letters, drawn as the chat's
   flags are. */
.qn-tags {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; padding: 6px 12px;
  border-bottom: var(--border-w) solid var(--border); background: var(--panel);
}
.qn-tag-list { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; margin: 0; padding: 0; list-style: none; }
.qn-tag {
  display: inline-flex; align-items: center; gap: 2px; min-width: 0; min-height: 26px; padding: 0 2px 0 8px;
  font-size: var(--fs-1); font-weight: 600; overflow-wrap: anywhere;
  border: var(--border-w) solid var(--label-ink); border-radius: var(--radius-sm); background: var(--label-soft);
  color: var(--label-words);
}
.qn-tag-off {
  min-width: 24px; min-height: 24px; padding: 0; border: 0; border-radius: 50%;
  background: transparent; color: inherit; font: inherit; cursor: pointer;
}
.qn-tag-off:hover { background: var(--hover); }
.qn-tag-off:focus-visible { outline: 2px solid var(--text); outline-offset: -2px; }
.qn-tag-field {
  flex: 1 1 120px; min-width: 0; max-width: 220px; min-height: 28px; box-sizing: border-box; padding: 0 8px;
  font: inherit; font-size: var(--fs-1); color: var(--text); background: var(--bg);
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
}
.qn-tag-field::placeholder { color: var(--placeholder); }
.qn-tag-field:focus-visible { outline: 2px solid var(--text); outline-offset: -2px; }
.qn-tag-refused { flex-basis: 100%; font-size: var(--fs-1); color: var(--text-2); }
.qn-tools {
  display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: var(--border-w) solid var(--border);
  background: var(--panel); flex-wrap: wrap;
}
.qn-tool {
  display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 0 10px; font: inherit; font-weight: var(--button-weight);
  color: var(--text); background: var(--panel); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
  cursor: pointer;
}
.qn-tool[aria-pressed='true'] { background: var(--chosen-bg); color: var(--chosen-ink); border-color: var(--chosen-edge); }
.qn-tool:disabled { color: var(--text-dis); cursor: default; }
.qn-add { margin-left: auto; }
.qn-ico { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.qn-colours { display: inline-flex; gap: 6px; padding: 0 4px; border-left: var(--border-w) solid var(--border); border-right: var(--border-w) solid var(--border); }
.qn-colour {
  width: 22px; height: 22px; padding: 0; border-radius: 50%; border: 2px solid var(--panel); cursor: pointer;
  box-shadow: 0 0 0 1px var(--border-strong);
}
.qn-colour[aria-checked='true'] { box-shadow: 0 0 0 2px var(--text); }
.qn-elsewhere { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: var(--border-w) solid var(--border); }
.qn-elsewhere p { margin: 0; flex-basis: 100%; }
.qn-sheet-frame { position: relative; flex: 1; min-height: 0; }
.qn-sheet { position: absolute; inset: 0; overflow: auto; background: var(--panel); }
.qn-view-controls {
  position: absolute; right: 12px; bottom: 12px; display: flex; align-items: center; gap: 2px;
  padding: 3px; border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
  background: var(--panel); box-shadow: 0 2px 8px #0002;
}
.qn-view-controls button {
  min-width: 36px; height: 34px; padding: 0 6px; border: 0; border-radius: var(--radius-sm);
  color: var(--text); background: transparent; font: inherit; cursor: pointer;
}
.qn-view-controls button:hover { background: var(--panel-2); }
.qn-view-controls button[aria-pressed='true'] { background: var(--panel-2); box-shadow: inset 0 0 0 1px var(--text); }
.qn-view-controls button:focus-visible { outline: 2px solid var(--text); outline-offset: -2px; }
/* THE PAPER STANDS OUT OF THE SHEET'S FLOW, at its top left. A box in the flow is scrolled over at its size before its
   zoom as well as after it, so a sheet zoomed out scrolled past what is drawn. Out of the flow, only its zoomed size
   counts. */
.qn-paper { position: absolute; left: 0; top: 0; touch-action: none; cursor: crosshair; }
/* THE DOTS ARE ON THE GROUND, which grows with the sheet in every direction; the sheet places it and sets where its dots
   start, so they stay at the same points of the sheet. */
.qn-ground {
  position: absolute;
  /* THE DOTS ARE FAINT, so words written over them stay easy to read: the light theme's border is as dark as its text. */
  background-image: radial-gradient(circle, color-mix(in srgb, var(--text) 15%, var(--panel)) 1px, transparent 1.2px);
  background-size: 24px 24px;
}
.qn-sheet[data-tool='eraser'] .qn-paper { cursor: cell; }
.qn-sheet[data-tool='box'] .qn-words, .qn-sheet[data-tool='line'] .qn-words { cursor: inherit; }
.qn-sheet[data-tool='box'] .qn-box:not(:focus-within) { cursor: move; }
.qn-sheet[data-tool='line'] .qn-paper { cursor: default; }
.qn-sheet[data-tool='line'] .qn-box { cursor: crosshair; }
.qn-sheet[data-moving] .qn-paper, .qn-sheet[data-moving] .qn-paper * { cursor: grab; }
.qn-paper:focus { outline: none; }
.qn-shaping { position: absolute; box-sizing: border-box; border: 2px dashed var(--text); border-radius: var(--radius-sm); pointer-events: none; }
.qn-line[data-shaping] path { stroke-dasharray: 6 4; }
.qn-stroke, .qn-line { position: absolute; overflow: visible; pointer-events: none; }
.qn-stroke path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
.qn-line path { fill: none; stroke: var(--text); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.qn-words { position: absolute; font-family: var(--font-read); font-size: var(--fs-3); line-height: var(--lh-read); cursor: text; }
.qn-written > :first-child { margin-top: 0; }
.qn-written > :last-child { margin-bottom: 0; }
.qn-field {
  display: block; width: 100%; margin: 0; padding: 0; border: 0; outline: none; resize: none; overflow: hidden;
  font: inherit; line-height: inherit; color: var(--text); background: transparent;
}
.qn-field::placeholder { color: var(--placeholder); }
.qn-box {
  position: absolute; display: flex; align-items: center; justify-content: center; padding: 6px 8px; box-sizing: border-box;
  border: 2px solid var(--text); border-radius: var(--radius-sm); background: var(--panel); text-align: center; cursor: text;
  /* A BOX'S WORDS ARE IN THE NOTE'S OWN TYPE, as its other words are, so a diagram reads as part of the note. */
  font-family: var(--font-read); font-size: var(--fs-3); line-height: var(--lh-read);
}
.qn-box .qn-field { text-align: center; }
.qn-box .qn-written, .qn-box .qn-field { min-width: 0; flex-shrink: 0; overflow-wrap: anywhere; }
.qn-box .qn-written { width: 100%; }
.qn-resize-box, .qn-resize-added {
  position: absolute; right: -2px; bottom: -2px; width: 24px; height: 24px; padding: 0;
  border: 0; background: transparent; cursor: nwse-resize; touch-action: none;
}
.qn-resize-box::after, .qn-resize-added::after {
  content: ''; position: absolute; right: 4px; bottom: 4px; width: 7px; height: 7px;
  border-right: 2px solid var(--text); border-bottom: 2px solid var(--text);
}
.qn-resize-box:focus-visible, .qn-resize-added:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }
.qn-file { position: absolute; margin: 0; display: flex; align-items: center; justify-content: center; border: var(--border-w) solid var(--border); background: var(--panel-2); }
.qn-file img, .qn-file video { width: 100%; height: 100%; object-fit: contain; }
/* A FILM'S FRAME PUTS THE PLAYER ABOVE THE LINK THAT SAVES THE FILM WHOLE, both inside the size the film was given. */
.qn-file[data-type="video"] { flex-direction: column; align-items: stretch; gap: 4px; padding: 4px; }
.qn-file[data-type="video"] video { flex: 1 1 0; min-height: 0; }
.qn-file-wait { margin: 0; padding: 8px; font-size: var(--fs-1); color: var(--text-2); }
.qn-added {
  position: absolute; display: flex; flex-direction: column; padding: 8px 10px;
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm); background: var(--panel);
}
/* WHAT AN ADDED PART HOLDS SCROLLS INSIDE ITS FRAME when the person has made the frame smaller than that, so the frame
   keeps the size it was given and its corner stays where it is. */
.qn-added-inside { flex: 1 1 auto; min-height: 0; overflow: auto; }
.qn-added-from { margin: 0 0 6px; font-size: var(--fs-1); color: var(--text-2); }
.qn-reading { padding: 16px; color: var(--text-2); }
.qn-adding, .qn-refused { margin: 0; padding: 6px 12px; border-top: var(--border-w) solid var(--border); font-size: var(--fs-1); }
.qn-adding { color: var(--text-2); }
.qn-refused { color: var(--st-failed); }
.qn-refused p { margin: 0; }
.qn-foot {
  display: flex; align-items: center; gap: 12px; padding: 6px 12px; min-height: 32px; box-sizing: border-box;
  border-top: var(--border-w) solid var(--border); font-size: var(--fs-1); color: var(--text-2);
}
/* THE FOOT IS ONE LINE IN EVERY NOTE, so a small note gives it no more than a line. A page name too long for the line
   is cut, and its link holds the whole name, which a pointer held over it shows. A refusal alone may take more lines,
   so what the office said is read whole. */
.qn-where { flex: 1 1 auto; min-width: 0; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.qn-saving { flex: none; margin-left: auto; white-space: nowrap; }
.qn-saving[data-refused='1'] { flex: 1 1 180px; color: var(--st-failed); white-space: normal; }
/* A NARROW NOTE SHOWS ITS TOOLS AS ICONS, by the width of its own box, so a note beside a wide page is drawn as in the small window. */
@container (max-width: 560px) {
  .qn-tool-word { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
}
`
