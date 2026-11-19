// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `#/my-notes` — EVERY QUICK NOTE, ON ONE PAGE OF ITS OWN. Point QN-3 of the quick-notes package, step 6 of the
 * chosen option C: a search box, the choices above the list with their counts, the notes under the week they were
 * started in, and a card for each note with a small picture of its drawing, its title and its first words.
 *
 * THE COUNTS ARE THE OFFICE'S. `GET /api/records/my-notes` searches, chooses and counts over every note of every project
 * the reader may read, and works out each note's week on the calendar of this browser's own time zone. This page counts
 * nothing itself: a count of the cards it has loaded would change as more were loaded.
 *
 * A NOTE IS NEVER UNDER REPORTS. The Reports page reads reports and notes of the older kind only
 * (src/shared/reports-page.ts), and a quick note is of neither.
 *
 * A CARD OPENS ITS NOTE IN THE NOTE'S OWN PROJECT. A note's page reads it in the project chosen in the switcher, so the
 * link chooses the note's project first, as Home's links into another project do.
 */
import { useEffect, useState } from 'react'
import { t } from '@shared/i18n.ts'
import {
  MY_NOTES_CHOICES,
  MY_NOTES_PAGE_SIZE,
  theParts,
  thePageItWasStartedOn,
  theWeekBefore,
  type MyNotesChoice,
  type MyNotesNote,
  type MyNotesReply,
} from '@shared/my-notes.ts'
import { api, errorMessage, faultOf } from '../api.ts'
import { NoteSmallPicture, theFirstWordsOf, whatTheSmallPictureLeavesOut } from '../components/NoteSmallPicture.tsx'
import { recordPath, RouteLink } from '../components/router.tsx'
import { Btn, drawnDay, Empty, ErrorNote, Loading, Stamp, useAsync } from '../components/ui.tsx'
import { useLanguage } from '../lib/language.ts'
import { nameOfProject, useProjects } from '../lib/projectlist.ts'
import { openTheLinkedNote } from '../lib/open-a-quick-note.ts'

/** How long the page waits after the last key before it searches, so a search is not sent for every letter. */
const SEARCH_AFTER_MS = 300

/** The words of each choice above the list. */
const CHOICE_WORDS: Record<MyNotesChoice, () => string> = {
  all: () => t('myNotes.choice.all'),
  'from-a-page': () => t('myNotes.choice.fromAPage'),
  'from-no-page': () => t('myNotes.startedOnNoPage'),
  drawn: () => t('myNotes.choice.drawn'),
}

/** This browser's time zone, which the weeks are counted in. */
function theReadersZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

type Failed = { message: string; fault: ReturnType<typeof faultOf> }

export function MyNotesPage() {
  useLanguage()
  const [typed, setTyped] = useState('')
  const [q, setQ] = useState('')
  const [choice, setChoice] = useState<MyNotesChoice>('all')
  const [offset, setOffset] = useState(0)
  // THE NOTES OF THE PAGES ALREADY SHOWN, kept while the next page is read, so Show more adds to the list.
  const [earlier, setEarlier] = useState<readonly MyNotesNote[]>([])
  // WHAT A MOVE SAID, by note, kept across the reading that follows it so the card still says it.
  const [moved, setMoved] = useState<ReadonlyMap<string, string>>(new Map())

  // A NEW SEARCH OR CHOICE STARTS AT THE FIRST PAGE, set in the same step so no reading is asked with the old offset.
  const startAgain = () => {
    setEarlier([])
    setOffset(0)
  }
  useEffect(() => {
    const wait = setTimeout(() => {
      if (typed.trim() === q) return
      setQ(typed.trim())
      startAgain()
    }, SEARCH_AFTER_MS)
    return () => clearTimeout(wait)
  }, [typed, q])

  const [state, reload] = useAsync(
    () => api.myNotes({ q, only: choice, zone: theReadersZone(), limit: MY_NOTES_PAGE_SIZE, offset }),
    [q, choice, offset],
  )
  const reply = state.status === 'ready' ? state.value : null
  // WHILE THE NEXT PAGE IS READ, the reading on screen is the page before, whose notes are already in `earlier`.
  const notes = reply === null ? earlier : reply.offset === offset ? [...earlier, ...reply.notes] : earlier

  const again = () => {
    if (offset === 0) reload()
    else startAgain()
  }

  return (
    <div className="page mn">
      <style href="mole-office-my-notes" precedence="default">
        {MY_NOTES_CSS}
      </style>
      <header className="mn-head">
        <h1 className="mn-title" data-title-is="its-label">{t('myNotes.title')}</h1>
        <div className="mn-bar">
          <input
            className="mn-search"
            type="search"
            value={typed}
            placeholder={t('myNotes.search')}
            aria-label={t('myNotes.search')}
            onChange={(event) => setTyped(event.currentTarget.value)}
          />
          <div className="mn-choices" role="group" aria-label={t('myNotes.choices')}>
            {MY_NOTES_CHOICES.map((one) => (
              <button
                key={one}
                type="button"
                className="mn-choice"
                data-choice={one}
                aria-pressed={choice === one}
                onClick={() => {
                  if (one === choice) return
                  setChoice(one)
                  startAgain()
                }}
              >
                {CHOICE_WORDS[one]()}{' '}
                <b className="num" data-part="choice-count">
                  {reply === null ? '…' : reply.counts[one]}
                </b>
              </button>
            ))}
          </div>
        </div>
      </header>
      {state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault ?? null} retry={reload} /> : null}
      {reply === null && earlier.length === 0 && state.status === 'loading' ? <Loading label={t('myNotes.loading')} rows={2} /> : null}
      {reply === null ? null : (
        <TheNotes
          notes={notes}
          reply={reply}
          moved={moved}
          onMoved={(id, said) => {
            setMoved((before) => new Map(before).set(id, said))
            again()
          }}
        />
      )}
      {reply === null || reply.offset !== offset || reply.left === 0 ? null : (
        <div className="mn-more">
          <Btn
            onClick={() => {
              setEarlier((before) => [...before, ...reply.notes])
              setOffset(offset + reply.returned)
            }}
          >
            {t('myNotes.more')}
          </Btn>
        </div>
      )}
      {reply !== null && reply.offset !== offset ? <Loading label={t('myNotes.loading')} rows={1} /> : null}
    </div>
  )
}

/** What the reading found, under the week each note was started in. */
function TheNotes({
  notes,
  reply,
  moved,
  onMoved,
}: {
  notes: readonly MyNotesNote[]
  reply: MyNotesReply
  moved: ReadonlyMap<string, string>
  onMoved: (id: string, said: string) => void
}) {
  if (reply.counts.all === 0) {
    return <Empty message={reply.q === null ? t('myNotes.none') : t('myNotes.noneHoldIt')} />
  }
  if (reply.matched === 0) return <Empty message={t('myNotes.noneOfThisChoice')} />
  const weeks: { starts: string; notes: MyNotesNote[] }[] = []
  for (const note of notes) {
    const last = weeks[weeks.length - 1]
    if (last !== undefined && last.starts === note.week) last.notes.push(note)
    else weeks.push({ starts: note.week, notes: [note] })
  }
  return (
    <div className="mn-weeks">
      {weeks.map((week) => (
        <section key={week.starts} className="mn-week" data-week={week.starts}>
          <h2 className="mn-week-head">
            <span>{theWeekWord(week.starts, reply.thisWeek)}</span>{' '}
            <span className="num" data-part="week-count">
              {reply.weeks.find((one) => one.starts === week.starts)?.count ?? week.notes.length}
            </span>
          </h2>
          <ol className="mn-cards">
            {week.notes.map((note) => (
              <li key={note.id}>
                <NoteCard note={note} said={moved.get(note.id) ?? null} onMoved={onMoved} />
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}

/** This week, last week, or the week of its Monday. */
function theWeekWord(starts: string, thisWeek: string): string {
  if (starts === thisWeek) return t('myNotes.thisWeek')
  if (starts === theWeekBefore(thisWeek)) return t('myNotes.lastWeek')
  const [year, month, day] = starts.split('-').map(Number) as [number, number, number]
  return t('myNotes.weekOf', { day: drawnDay(new Date(year, month - 1, day)) })
}

function NoteCard({ note, said, onMoved }: { note: MyNotesNote; said: string | null; onMoved: (id: string, said: string) => void }) {
  const parts = theParts(note)
  const words = theFirstWordsOf(parts)
  const besides = whatTheSmallPictureLeavesOut(parts)
  const startedOn = thePageItWasStartedOn(note)
  const projects = useProjects()
  const besidesWords = [
    besides.pictures === 0 ? null : t('myNotes.pictures', { n: besides.pictures }),
    besides.videos === 0 ? null : t('myNotes.videos', { n: besides.videos }),
    besides.added === 0 ? null : t('myNotes.added', { n: besides.added }),
  ].filter((one) => one !== null)
  return (
    <article className="mn-card" data-note={note.id}>
      <NoteSmallPicture parts={parts} />
      <div className="mn-card-words">
        <h3 className="mn-card-title" data-part="title">
          <a
            data-part="open"
            href={`#${recordPath(note.id, 'quick_note')}`}
            onClick={(event) => openTheLinkedNote(event, note)}
          >
            {words.title ?? t('quickNote.untitled')}
          </a>
        </h3>
        {words.after === '' ? null : (
          <p className="mn-card-first" data-part="first-words">
            {words.after}
          </p>
        )}
        {besidesWords.length === 0 ? null : (
          <p className="mn-card-besides" data-part="besides">
            {besidesWords.join(' · ')}
          </p>
        )}
        <p className="mn-card-foot">
          <Stamp at={note.createdAt} />
          {startedOn === null ? null : (
            <> · <span data-part="started-on">
              {t('myNotes.writtenFrom')}{' '}
              {startedOn.address.startsWith('#') ? <RouteLink to={startedOn.address.slice(1)}>{startedOn.name}</RouteLink> : startedOn.name}
            </span></>
          )}{' '}
          · <span data-part="project">{nameOfProject(projects, note.workspaceId)}</span>
        </p>
        <MoveToAProject note={note} said={said} onMoved={onMoved} />
      </div>
    </article>
  )
}

/**
 * MOVE TO A PROJECT: the note moves from the project it was filed in, through the door every record moves by. The door
 * refuses when something else would have to move with it, and the refusal is drawn in the door's own words.
 */
function MoveToAProject({ note, said, onMoved }: { note: MyNotesNote; said: string | null; onMoved: (id: string, said: string) => void }) {
  const projects = useProjects()
  const [open, setOpen] = useState(false)
  const [to, setTo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<Failed | null>(null)
  const others = (projects ?? []).filter((one) => one.id !== note.workspaceId)

  const move = () => {
    if (busy || to === null) return
    setBusy(true)
    setFailed(null)
    api.moveWorkToProject(note.id, note.workspaceId, to).then(
      (report) => {
        setBusy(false)
        setOpen(false)
        onMoved(note.id, report.note)
      },
      (err: unknown) => {
        setBusy(false)
        setFailed({ message: errorMessage(err), fault: faultOf(err) })
      },
    )
  }

  return (
    <div className="mn-move" data-part="move">
      {said === null ? null : (
        <p className="mn-move-said" role="status" data-part="moved">
          {said}
        </p>
      )}
      {!open ? (
        <Btn
          size="sm"
          onClick={() => setOpen(true)}
          disabled={projects === null || others.length === 0}
          reason={projects === null ? t('myNotes.projectsNotHereYet') : t('agentMove.noOther')}
        >
          {t('myNotes.move')}
        </Btn>
      ) : (
        <div className="mn-move-form">
          <select
            className="mn-move-pick"
            value={to ?? ''}
            aria-label={t('myNotes.moveTo')}
            onChange={(event) => setTo(event.currentTarget.value === '' ? null : event.currentTarget.value)}
          >
            <option value="">{t('myNotes.moveTo')}</option>
            {others.map((one) => (
              <option key={one.id} value={one.id}>
                {nameOfProject(projects, one.id)}
              </option>
            ))}
          </select>
          <Btn size="sm" variant="primary" pending={busy} disabled={to === null} reason={t('agentMove.choose')} onClick={move}>
            {t('myNotes.moveNow')}
          </Btn>
          <Btn
            size="sm"
            onClick={() => {
              setOpen(false)
              setFailed(null)
            }}
          >
            {t('myNotes.cancel')}
          </Btn>
        </div>
      )}
      {failed === null ? null : <ErrorNote label={t('myNotes.notMoved')} message={failed.message} fault={failed.fault} />}
    </div>
  )
}

export const MY_NOTES_CSS = `
.mn { min-width: 0; }
.mn-head { display: grid; gap: var(--gut); min-width: 0; margin: 0 0 var(--gut); }
.mn-title { margin: 0; color: var(--text); font: 600 var(--fs-6)/var(--lh-tight) var(--font-ui); overflow-wrap: anywhere; }
.mn-bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad) var(--gut); min-width: 0; }
.mn-search { flex: 1 1 320px; min-width: 0; max-width: 520px; height: var(--row-h); padding: 0 var(--pad); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm); background: var(--panel); color: var(--text); font: var(--fs-2)/var(--lh-tight) var(--font-ui); }
.mn-choices { display: flex; flex-wrap: wrap; gap: var(--pad); min-width: 0; }
.mn-choice { padding: 4px 10px; border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm); background: var(--panel); color: var(--text); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); cursor: pointer; }
.mn-choice:hover { background: var(--hover); }
.mn-choice[aria-pressed="true"] { background: var(--accent); color: var(--accent-text); }
.mn-weeks { display: grid; gap: var(--pad-lg); min-width: 0; }
.mn-week { display: grid; gap: var(--pad); min-width: 0; }
.mn-week-head { margin: 0; color: var(--text); font: 600 var(--fs-1)/var(--lh-tight) var(--font-mono); letter-spacing: 0.12em; text-transform: uppercase; }
.mn-cards { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap: var(--gut); min-width: 0; }
.mn-cards > li { display: grid; min-width: 0; }
.mn-card { display: grid; grid-template-rows: auto 1fr; min-width: 0; border: var(--border-w) solid var(--border-strong); border-radius: var(--radius); background: var(--panel); overflow: hidden; }
.mn-card .nsp { display: block; width: 100%; height: 128px; padding: var(--pad); box-sizing: border-box; border-bottom: var(--border-w) solid var(--border-strong); color: var(--text); }
.nsp-stroke { fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; }
.nsp-box { fill: var(--panel); stroke: currentColor; stroke-width: 1.5; }
.nsp-line { stroke: currentColor; stroke-width: 1.5; }
.mn-card-words { display: grid; align-content: start; gap: 6px; min-width: 0; padding: var(--pad) var(--gut); }
.mn-card-title { margin: 0; font: 600 var(--fs-3)/var(--lh-tight) var(--font-ui); overflow-wrap: anywhere; }
.mn-card-title a { color: var(--text); text-decoration: none; }
.mn-card-title a:hover { text-decoration: underline; }
.mn-card-first { margin: 0; color: var(--text-2); font: var(--fs-2)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.mn-card-besides, .mn-card-foot { margin: 0; color: var(--text-3); font: var(--fs-1)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.mn-move { display: grid; gap: 6px; justify-items: start; min-width: 0; margin-top: 4px; }
.mn-move-form { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 0; }
.mn-move-pick { max-width: 100%; min-width: 0; }
.mn-move-said { margin: 0; color: var(--text-2); font: var(--fs-1)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.mn-more { display: flex; justify-content: center; margin: var(--gut) 0 0; }
`
