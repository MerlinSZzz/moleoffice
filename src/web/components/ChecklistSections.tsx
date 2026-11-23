// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { t } from '@shared/i18n.ts'
import { participantKey } from '@shared/messages.ts'
import { THE_SECRETARY } from '@shared/roles.ts'
import type { ChecklistReading } from '@shared/checklists.ts'
import { api, errorMessage, faultOf, getActor } from '../api.ts'
import { theOwner } from '../owner.ts'
import { useSharedRead } from '../lib/homereads.ts'
import { readParticipantsOnce } from '../lib/oneread.ts'
import { declaredAttributes } from './declares.ts'
import { ProjectName } from './ProjectChoice.tsx'
import { theRefusalInWords } from './ui.tsx'
import { ownerKey, progressOf } from './ChecklistParts.tsx'

/**
 * THE PARTS THE CHECKLISTS PAGE AND THE CHECKLISTS WINDOW BOTH DRAW, in design E, as decided.
 *
 * Each checklist is a card: its title as plain text, a small mark naming its project, a number like "2 / 5" for its
 * progress, what the view draws inside it, and under all of that a field that adds an item when Enter is pressed. The
 * item comes from the door's answer, never from what was typed; a refusal is shown beside the field in the door's
 * words, and the typed words stay.
 *
 * The owners come in one order: the reader first, then each secretary, then each other agent, then each other person,
 * each group by name. The reader's checklists are those the door reads as "yours". Beside a name is the number of items
 * still to do, in the asking colour when one of them waits on the owner. "New checklist" opens a field for a title,
 * and Enter makes the checklist.
 *
 * Nothing here imports the page or the window.
 */

/** One owner's section, or their place in the window's row of names. */
export interface AnOwner {
  /** The door's `kind:id` word for the owner; the reader's own section is keyed `reader`. */
  key: string
  name: string
  isTheReader: boolean
  lists: ChecklistReading[]
  /** Items still to do, over the checklists of theirs that were read. */
  open: number
  /** Whether an item on one of their checklists waits on the owner. */
  waiting: boolean
}

/** The key of the reader's own section. No owner's `kind:id` word can be it, because it has no colon. */
export const THE_READERS_OWN = 'reader'

/**
 * EVERY OWNER OF THE CHECKLISTS READ, IN ORDER, the reader's section always first even when it holds no checklist.
 * `everyone` is everybody's checklists, `mine` the reader's own as the door reads them; a checklist in both is the
 * reader's. Drawn once the participants are read either way: until then no secretary is told apart.
 *
 * WHAT IT READS, AND WHEN: the participants, the people and agents the office knows, to put the secretaries first and
 * to name a reader who is an agent and has no checklist. It reads them when the part that calls it is first drawn, and
 * again when the project changes; a part drawn again later in the same page load takes the answer already read. The
 * checklists page calls it as the page opens. The window calls it only in the part drawn while it is open, so a closed
 * window reads no participants.
 */
export function useOwners(everyone: readonly ChecklistReading[], mine: readonly ChecklistReading[]): AnOwner[] {
  const [registries] = useSharedRead(readParticipantsOnce, [], { startFromHeld: true })
  return useMemo(() => {
    const agents = registries.status === 'ready' ? registries.value.agents : []
    const secretaries = new Set(agents.filter((one) => one.role === THE_SECRETARY).map((one) => participantKey({ kind: 'agent', id: one.id })))
    const actor = getActor()
    const own = new Set(mine.map((list) => list.id))
    const theirs = new Map<string, ChecklistReading[]>()
    for (const list of everyone) {
      if (own.has(list.id)) continue
      theirs.set(ownerKey(list), [...(theirs.get(ownerKey(list)) ?? []), list])
    }
    // THE READER'S NAME: the door's name for the owner of their checklists, or else the registry's.
    const person = theOwner()
    const readerName =
      mine[0]?.ownerName ??
      (actor.type === 'agent' ? (agents.find((one) => one.id === actor.id)?.name ?? actor.id) : (person.name ?? person.placeholder))
    const anOwner = (key: string, name: string, lists: ChecklistReading[], isTheReader: boolean): AnOwner => ({
      key,
      name,
      isTheReader,
      lists,
      open: lists.reduce((sum, list) => sum + list.counts.open, 0),
      waiting: lists.some((list) => list.counts.waitingOnTheOwner > 0),
    })
    const rank = (list: ChecklistReading): number =>
      list.owner.kind === 'agent' ? (secretaries.has(ownerKey(list)) ? 0 : 1) : 2
    const others = [...theirs]
      .map(([key, lists]) => ({ owner: anOwner(key, lists[0]!.ownerName, lists, false), rank: rank(lists[0]!) }))
      .sort((a, b) => a.rank - b.rank || a.owner.name.localeCompare(b.owner.name))
      .map((one) => one.owner)
    return [anOwner(THE_READERS_OWN, readerName, [...mine], true), ...others]
  }, [everyone, mine, registries])
}

/** The number of items still to do beside a name, in the asking colour when one waits on the owner. */
export function OpenCount({ owner }: { owner: AnOwner }) {
  const open = owner.open
  return (
    <span className="cks-count" data-waiting={owner.waiting ? 'yes' : undefined}>
      {open}
    </span>
  )
}

/** A checklist's progress as a number, "2 / 5"; nothing while it has no item that counts. */
export function ProgressNumber({ list }: { list: ChecklistReading }) {
  const { done, total } = progressOf(list)
  if (total === 0) return null
  return <span className="cks-progress">{t('checklists.progressNumber', { done, total })}</span>
}

/**
 * ONE CHECKLIST AS A CARD. `children` is what the view draws of its items: the unfinished items, then the fold and the
 * finished items under it. `onAdded` is handed the checklist as the door answered the add.
 */
export function ChecklistCard({
  list,
  titles,
  marked = false,
  children,
  onAdded,
}: {
  list: ChecklistReading
  titles: ReadonlyMap<string, string>
  /** The card the address `#/checklists/<id>` names. */
  marked?: boolean
  children: ReactNode
  onAdded: (after: ChecklistReading) => void
}) {
  return (
    <article className="cks-card" data-list={list.id} data-marked={marked ? 'yes' : undefined} {...declaredAttributes({ surface: 'checklists.open' })}>
      <header className="cks-head">
        <h3 className="cks-title">{list.title}</h3>
        <span className="cks-project">
          <ProjectName id={list.workspaceId} titles={titles} />
        </span>
        <ProgressNumber list={list} />
      </header>
      {children}
      <AddItemField list={list} onAdded={onAdded} />
    </article>
  )
}

/**
 * THE ROW UNDER A CARD THAT ADDS AN ITEM. Enter sends the words as typed; the field empties and keeps focus when the
 * door stores the item, and keeps the words when it refuses them. Enter on an empty field sends nothing. The field is
 * never disabled while the door answers, so the focus stays in it; a second Enter in that time sends nothing.
 */
function AddItemField({ list, onAdded }: { list: ChecklistReading; onAdded: (after: ChecklistReading) => void }) {
  const [words, setWords] = useState('')
  const [refusal, setRefusal] = useState<string | null>(null)
  const sending = useRef(false)
  const field = useRef<HTMLInputElement>(null)
  const add = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (sending.current || words.trim() === '') return
    sending.current = true
    try {
      const reply = await api.addChecklistItem(list, words)
      setWords('')
      setRefusal(null)
      field.current?.focus()
      onAdded(reply.checklist)
    } catch (error) {
      setRefusal(theRefusalInWords(errorMessage(error), faultOf(error)))
    } finally {
      sending.current = false
    }
  }
  return (
    <form className="cks-add" onSubmit={(event) => void add(event)}>
      <span className="cks-add-plus" aria-hidden="true">
        +
      </span>
      <input
        ref={field}
        className="cks-add-field"
        type="text"
        value={words}
        aria-label={t('checklists.addItemTo', { title: list.title })}
        placeholder={t('checklists.addItem')}
        onChange={(event) => setWords(event.target.value)}
      />
      {refusal === null ? null : (
        <span className="cks-add-refusal" role="alert">
          {refusal}
        </span>
      )}
    </form>
  )
}

/**
 * "NEW CHECKLIST", in the reader's own section. The press opens a field for the title; Enter makes the checklist in
 * `project`, or in the project on screen when it is undefined, and Escape closes the field. A refusal is shown beside
 * the field in the door's words, and the title stays.
 */
export function NewChecklistPress({ project, onMade }: { project: string | undefined; onMade: () => void }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [refusal, setRefusal] = useState<string | null>(null)
  const sending = useRef(false)
  const make = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (sending.current || title.trim() === '') return
    sending.current = true
    try {
      await api.makeChecklist(title, project)
      setTitle('')
      setRefusal(null)
      setOpen(false)
      onMade()
    } catch (error) {
      setRefusal(theRefusalInWords(errorMessage(error), faultOf(error)))
    } finally {
      sending.current = false
    }
  }
  const close = (): void => {
    setOpen(false)
    setTitle('')
    setRefusal(null)
  }
  if (!open) {
    return (
      <button type="button" className="cks-new" onClick={() => setOpen(true)}>
        <span aria-hidden="true">+</span> {t('checklists.newChecklist')}
      </button>
    )
  }
  return (
    <form className="cks-new-form" onSubmit={(event) => void make(event)}>
      <input
        className="cks-new-field"
        type="text"
        value={title}
        autoFocus
        aria-label={t('checklists.newChecklistTitle')}
        placeholder={t('checklists.newChecklistTitle')}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            close()
          }
        }}
      />
      {refusal === null ? null : (
        <span className="cks-new-refusal" role="alert">
          {refusal}
        </span>
      )}
    </form>
  )
}

/** The cards' own sheet, beside CHECKLIST_PARTS_CSS. On a phone every press and field is 44 pixels tall. */
export const CHECKLIST_SECTIONS_CSS = `
.cks-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr)); gap: var(--pad); align-items: start; }
.cks-card {
  min-width: 0; padding: var(--pad) var(--pad) 6px; border: var(--border-w) solid var(--border); border-radius: var(--radius-lg, var(--radius));
  background: var(--panel);
}
.cks-card[data-marked='yes'] { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-soft); }
.cks-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; min-width: 0; margin: 0 0 4px 0; }
.cks-title { margin: 0; flex: 1 1 auto; min-width: 0; font-size: var(--fs-2); font-weight: 600; overflow-wrap: anywhere; }
/* THE PROJECT'S NAME IS A TAG, filled as the comment chip is (.px-talk-chip in agent/agent-css.ts). On --panel-2 it
   was almost the card's own colour in both looks, and read as plain text. */
.cks-project .pch-name {
  display: inline-block; max-width: 10rem; padding: 0 6px; border-radius: var(--radius-sm); background: var(--panel-3);
  color: var(--text-2); font-size: var(--fs-1); line-height: 1.5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; vertical-align: bottom;
}
.cks-progress { flex: none; color: var(--text-2); font-size: var(--fs-1); font-variant-numeric: tabular-nums; white-space: nowrap; }
.cks-items { list-style: none; margin: 0; padding: 0; }
.cks-count { flex: none; color: var(--text-2); font-size: var(--fs-1); font-weight: 400; font-variant-numeric: tabular-nums; }
.cks-count[data-waiting='yes'] { color: var(--ask); font-weight: 700; }
.cks-add {
  display: flex; flex-wrap: wrap; align-items: center; gap: 0 6px; min-width: 0; margin: 6px 0 0 0; padding: 0 4px 0 2px;
  border-top: var(--border-w) dashed var(--border);
}
.cks-add:focus-within { border-top-color: var(--accent); }
.cks-add-plus { flex: none; color: var(--text-2); font-weight: 700; }
.cks-add-field { flex: 1 1 8rem; min-width: 0; min-height: 2rem; border: none; background: none; color: var(--text); font: inherit; font-size: var(--fs-2); outline: none; }
.cks-add-refusal, .cks-new-refusal { flex: 1 1 100%; color: var(--st-failed); font-size: var(--fs-1); overflow-wrap: anywhere; }
.cks-new {
  display: inline-flex; align-items: center; gap: 4px; min-height: 2rem; padding: 0 10px; border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm); background: var(--panel); color: var(--text); font: inherit; font-size: var(--fs-1); cursor: pointer; white-space: nowrap;
}
.cks-new:hover { background: var(--hover); }
.cks-new-form { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; min-width: 0; flex: 1 1 14rem; }
.cks-new-field {
  flex: 1 1 12rem; min-width: 0; min-height: 2rem; padding: 0 8px; border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
  background: var(--panel); color: var(--text); font: inherit;
}
/* A NARROW SCREEN: the cards stack. */
@media (max-width: 760px) {
  .cks-cards { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 480px) {
  .cks-new, .cks-new-field, .cks-add-field { min-height: 44px; }
}
`
