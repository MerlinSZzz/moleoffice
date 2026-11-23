// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useEffect, useMemo, useRef, useState } from 'react'
import { t } from '@shared/i18n.ts'
import { EVERY_PROJECT, type ProjectChoice } from '@shared/across-projects.ts'
import { isClosed, type ChecklistReading, type ChecklistRequest } from '@shared/checklists.ts'
import { api, type ChecklistsAcrossReply } from '../api.ts'
import { ProjectChoiceControl, useProjectTitles } from '../components/ProjectChoice.tsx'
import { Btn, ErrorNote, Loading, useAsync } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { declaredAttributes } from '../components/declares.ts'
import { CHECKLIST_SECTIONS_CSS, ChecklistCard, NewChecklistPress, OpenCount, useOwners } from '../components/ChecklistSections.tsx'
import {
  CHECKLIST_PARTS_CSS,
  aRefusedPress,
  aSpecialChecklistItem,
  theChecklistsWindowSwitch,
  EvidencePicker,
  FoldPress,
  inOrder,
  theFoldOf,
  ItemMark,
  ItemRow,
  progressOf,
  refusedPressWords,
  switchTheChecklistsWindow,
  theseMoved,
  useMovedRows,
  useTheFoldsReading,
  whatTheRowDraws,
  withOpened,
  type DrawnLine,
  type RefusedPress,
} from '../components/ChecklistParts.tsx'
/**
 * `#/checklists` — everybody's checklists, a person's and every agent's, in one project or every project.
 *
 * DESIGN E, as decided: one section for each person who owns a checklist. The reader's own section comes first and is
 * always open; then each secretary's, each other agent's and each other person's, each group by name. In a section the
 * checklists lie open as cards side by side, and on a narrow screen the cards stack. Another person's section is
 * folded to their name and the number of their items still to do; it opens by itself when one of its items waits on
 * the reader. The reader's own section has the press that makes a new checklist.
 *
 * A card shows the items not finished at once, folds the finished ones under them, and ends in a row that adds an item
 * (ChecklistSections.tsx). The presses on an item are those it had before: the box, "Mark done" with the evidence
 * picker, the standing press, a refused press's words, opening the item. A row that moved when the page read again
 * takes no press for one second.
 *
 * `#/checklists/<id>` is the same page with that checklist's card marked: its section opens and the card is brought into
 * view. The card is drawn even when the project chosen does not hold it, as decided. The page also holds the switch
 * that shows or hides the window at the top right.
 */

/**
 * THE READER'S CHOICE OF PROJECT OUTLIVES A NEW ADDRESS. Following `#/checklists/<id>` draws the page again; without
 * this it went back to every project. Kept for this tab only.
 */
const kept: { choice: ProjectChoice | null } = { choice: null }

export function ChecklistsPage({ id }: { id?: string }) {
  // EVERY PROJECT UNTIL THE READER CHOOSES ONE HERE, as decided. The window counts each person's items in every
  // project, so with no project chosen a person's count on the page is the count beside their name in the window.
  const [choice, setShown] = useState<ProjectChoice>(() => kept.choice ?? EVERY_PROJECT)
  const setChoice = (one: ProjectChoice): void => {
    kept.choice = one
    setShown(one)
  }
  const titles = useProjectTitles()
  const [everyone, reload] = useProjectAsync(() => api.listChecklistsAcross(choice, 'everyone', 'open'), [choice], { follows: { kinds: ['checklist'], atMostEveryMs: 5000 } })
  // THE READER'S OWN, AS THE DOOR READS THEM: which checklists are "yours" is the door's answer, not a second guess at
  // who is reading. Read in every project, because the addressed checklist may be in a project the page is not showing.
  const [mine, reloadMine] = useAsync(() => api.listChecklistsAcross(EVERY_PROJECT, undefined, 'open'), [], { follows: { kinds: ['checklist'], atMostEveryMs: 5000 } })
  const [opened, reloadOpened] = useProjectAsync(() => (id === undefined ? Promise.resolve(null) : api.readChecklistAcross(id)), [id], { follows: id === undefined ? undefined : { records: [id] } })
  const readAgain = (): void => {
    reload()
    reloadMine()
    reloadOpened()
  }

  const body =
    everyone.status === 'loading' || mine.status === 'loading' ? (
      <Loading what={t('checklists.loading')} />
    ) : everyone.status === 'error' ? (
      <ErrorNote message={everyone.message} fault={everyone.fault} retry={reload} />
    ) : mine.status === 'error' ? (
      <ErrorNote message={mine.message} fault={mine.fault} retry={reloadMine} />
    ) : (
      <Sections
        reading={everyone.value}
        mine={mine.value}
        addressed={opened.status === 'ready' && opened.value !== null ? opened.value.checklist : null}
        titles={titles}
        marked={id}
        project={choice === EVERY_PROJECT ? undefined : choice}
        readAgain={readAgain}
      />
    )

  return (
    <div className="page ckl" data-opened={id === undefined ? 'no' : 'yes'}>
      <style href="mole-office-checklist-parts" precedence="default">{CHECKLIST_PARTS_CSS}</style>
      <style href="mole-office-checklist-sections" precedence="default">{CHECKLIST_SECTIONS_CSS}</style>
      <style href="mole-office-checklists-page" precedence="default">{CHECKLISTS_PAGE_CSS}</style>
      <h1 className="ckl-title" data-title-is="its-label">{t('checklists.title')}</h1>
      <div className="ckl-controls">
        <ProjectChoiceControl choice={choice} onChoose={setChoice} titles={titles} />
        <WindowSwitch />
      </div>
      {opened.status === 'error' ? <ErrorNote message={opened.message} fault={opened.fault} retry={reloadOpened} /> : null}
      {body}
    </div>
  )
}

/**
 * Whether the window at the top right is shown in this browser. It is on until it is switched off here. A press
 * that stays pressed while the window is shown, not a box, so the page draws no field while it is being read.
 */
function WindowSwitch() {
  const [said, setSaid] = useState(theChecklistsWindowSwitch)
  if (said === 'not kept') return <p className="ckl-says">{t('checklists.windowSwitchNotKept')}</p>
  return (
    <button
      type="button"
      className="ckl-window"
      aria-pressed={said === 'on'}
      onClick={() => {
        const on = said !== 'on'
        setSaid(switchTheChecklistsWindow(on) ? (on ? 'on' : 'off') : 'not kept')
      }}
    >
      {t('checklists.windowSwitch')}
    </button>
  )
}

// ============================================================================ the sections

function Sections({
  reading,
  mine,
  addressed,
  titles,
  marked,
  project,
  readAgain,
}: {
  reading: ChecklistsAcrossReply
  mine: ChecklistsAcrossReply
  /** The checklist `#/checklists/<id>` names, read on its own; null when there is none. */
  addressed: ChecklistReading | null
  titles: ReadonlyMap<string, string>
  marked: string | undefined
  /** Where a new checklist is made: the project chosen, or the project on screen when every project is chosen. */
  project: string | undefined
  readAgain: () => void
}) {
  const lists = useMemo(
    () => (addressed === null || reading.checklists.some((list) => list.id === addressed.id) ? reading.checklists : [...reading.checklists, addressed]),
    [reading, addressed],
  )
  const own = useMemo(() => {
    const ids = new Set(mine.checklists.map((list) => list.id))
    return lists.filter((list) => ids.has(list.id))
  }, [lists, mine])
  const owners = useOwners(lists, own)
  // THE SECTIONS THE READER OPENED OR FOLDED, against the way each is drawn at first.
  const [toggled, setToggled] = useState<ReadonlySet<string>>(new Set())
  // THE READING AN ADD'S REPLY HANDED BACK, for each checklist, until the page's own read comes back. The card shows the
  // item the door stored at once.
  const [replied, setReplied] = useState<ReadonlyMap<string, ChecklistReading>>(new Map())
  useEffect(() => setReplied(new Map()), [lists])
  // THE MARKED CARD IS BROUGHT INTO VIEW ONCE, when it is first drawn.
  const broughtIntoView = useRef<string | null>(null)
  useEffect(() => {
    if (marked === undefined || broughtIntoView.current === marked) return
    const card = document.querySelector('.cks-card[data-marked="yes"]')
    if (card === null) return
    broughtIntoView.current = marked
    card.scrollIntoView({ block: 'nearest' })
  })
  const toggle = (key: string): void =>
    setToggled((now) => {
      const next = new Set(now)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  return (
    <div className="ckl-sections" {...declaredAttributes({ surface: 'checklists.list' })}>
      {owners.map((owner) => {
        const holdsMarked = owner.lists.some((list) => list.id === marked)
        const open = owner.isTheReader || (owner.waiting || holdsMarked) !== toggled.has(owner.key)
        return (
          <section key={owner.key} className="ckl-section" data-owner={owner.key} data-open={open ? 'yes' : 'no'} data-reader={owner.isTheReader ? 'yes' : 'no'}>
            {owner.isTheReader ? (
              <div className="ckl-owner">
                <h2 className="ckl-head" data-holds-a-name="">
                  <span className="ckl-name">{owner.name}</span>
                  <OpenCount owner={owner} />
                </h2>
                <NewChecklistPress project={project} onMade={readAgain} />
              </div>
            ) : (
              <h2 className="ckl-head" data-holds-a-name="">
                <button type="button" className="ckl-press" aria-expanded={open} onClick={() => toggle(owner.key)}>
                  <span className="ckl-mark" aria-hidden="true">
                    {open ? '▾' : '▸'}
                  </span>
                  <span className="ckl-name">{owner.name}</span>
                  <OpenCount owner={owner} />
                </button>
              </h2>
            )}
            {open && owner.lists.length > 0 ? (
              <div className="cks-cards">
                {owner.lists.map((list) => (
                  <PageCard
                    key={list.id}
                    list={replied.get(list.id) ?? list}
                    atHand={addressed !== null && addressed.id === list.id ? addressed : null}
                    titles={titles}
                    yours={owner.isTheReader}
                    marked={list.id === marked}
                    onAdded={(after) => {
                      setReplied((now) => new Map([...now, [after.id, after]]))
                      readAgain()
                    }}
                    onChanged={readAgain}
                  />
                ))}
              </div>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}

// ============================================================================ one card

/** A press on an item that the door refused, and whether that press asked for a standing item or an ordinary one. */
type PageRefusal = RefusedPress & { standing: boolean }

function PageCard({
  list,
  atHand,
  titles,
  yours,
  marked,
  onAdded,
  onChanged,
}: {
  list: ChecklistReading
  /** The checklist read whole by its address, when this card is the one addressed, for its fold. */
  atHand: ChecklistReading | null
  titles: ReadonlyMap<string, string>
  /** Whether the door reads this checklist as the reader's own. Only then are its items given presses. */
  yours: boolean
  marked: boolean
  onAdded: (after: ChecklistReading) => void
  onChanged: () => void
}) {
  // WHAT IS NOT FINISHED FIRST, and what is finished folded under it until the reader opens the fold. The list read holds
  // only the items not finished, so the fold is drawn from the counts and its items from the checklist read whole.
  const unfinished = inOrder(list.items).filter((item) => !isClosed(item.state))
  const fold = theFoldOf(list)
  const [isOpen, setIsOpen] = useState(false)
  const foldReading = useTheFoldsReading(list, isOpen, atHand)
  const shownOpen = foldReading.status === 'ready' || foldReading.status === 'error'
  const whole = foldReading.status === 'ready' ? foldReading.whole : list
  const folded = foldReading.status === 'ready' ? inOrder(whole.items).filter((item) => isClosed(item.state)) : []
  // THE ITEMS OPENED, by `<checklist>/<item>`. Closed until the reader opens one.
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())
  // EACH ITEM'S PRESS THAT THE DOOR REFUSED, by `<checklist>/<item>`, until the item is pressed again.
  const [refusals, setRefusals] = useState<ReadonlyMap<string, PageRefusal>>(new Map())
  // EACH ITEM'S BOX PRESS THAT THE DOOR REFUSED, by `<checklist>/<item>`, until the box is pressed again (wave 14a).
  const [boxRefusals, setBoxRefusals] = useState<ReadonlyMap<string, RefusedPress>>(new Map())
  const project = titles.get(list.workspaceId) ?? null
  const pressed = (item: ChecklistRequest): boolean => yours && item.state === 'open'
  /** Whether the item draws a left box on the page: the reader's own, unfinished, not standing. */
  const canMark = (item: ChecklistRequest): boolean => yours && !isClosed(item.state) && item.standing !== true
  const said = (item: ChecklistRequest): string | null => {
    const refused = refusals.get(`${list.id}/${item.id}`)
    return refused === undefined ? null : refusedPressWords(refused, list, pressed(item) && refused.standing === (item.standing !== true))
  }
  /** What the box's own refusal says now, or null when there is none. */
  const boxSaid = (item: ChecklistRequest): string | null => {
    const refused = boxRefusals.get(`${list.id}/${item.id}`)
    return refused === undefined ? null : refusedPressWords(refused, list, canMark(item))
  }
  // THE STANDING PRESS AND ITS REFUSAL ARE DRAWN INSIDE THE ITEM, so only an opened item draws them. The box and its
  // refusal stand under the row, open or not, as in the window.
  const row = (item: ChecklistRequest, from: ChecklistReading = list): DrawnLine => {
    const key = `${list.id}/${item.id}`
    const open = opened.has(key)
    return { key, draws: JSON.stringify([whatTheRowDraws(item, from, open), open ? [pressed(item), said(item)] : null, canMark(item), boxSaid(item)]) }
  }
  // WHAT THE CARD DRAWS FROM WHAT THE PAGE READ, line by line, top to bottom. The rows that moved when the page reads
  // again are worked out from this alone (wave 13j round loop-9).
  const drawn: DrawnLine[] = [
    { key: `${list.id}:heading`, draws: JSON.stringify([list.title, project, progressOf(list)]) },
    ...unfinished.map((item) => row(item)),
    ...(fold.count === 0 ? [] : [{ key: `${list.id}:fold`, draws: JSON.stringify([fold.count, fold.replaced, shownOpen]) }]),
    ...folded.map((item) => row(item, whole)),
  ]
  // THE PROJECTS' NAMES ARE DRAWN, BUT THEIR ARRIVAL IS NOT A READ AGAIN, as decided. Where no side bar has read them
  // first, as at 390, they can come after the cards. Counted as a read again, they changed every heading line as the
  // page opened, and every row of every card was marked as moved for a second, in a ring.
  const moved = useMovedRows(drawn, [list, yours], list.id, (rows) => {
    setRefusals((now) => theseMoved(now, rows))
    setBoxRefusals((now) => theseMoved(now, rows))
  })
  const drawItem = (item: ChecklistRequest, from: ChecklistReading = list) => {
    const key = `${list.id}/${item.id}`
    return (
      <PageItem
        key={item.id}
        item={item}
        list={from}
        canMark={canMark(item)}
        boxSaid={boxSaid(item)}
        pressed={pressed(item)}
        said={said(item)}
        moved={moved.has(key)}
        opened={opened.has(key)}
        onOpened={(now) => setOpened((all) => withOpened(all, key, now))}
        onRefused={(one) =>
          setRefusals((now) => {
            const next = new Map(now)
            if (one === null) next.delete(key)
            else next.set(key, one)
            return next
          })
        }
        onBoxRefused={(one) =>
          setBoxRefusals((now) => {
            const next = new Map(now)
            if (one === null) next.delete(key)
            else next.set(key, one)
            return next
          })
        }
        onChanged={onChanged}
      />
    )
  }
  return (
    <ChecklistCard list={list} titles={titles} marked={marked} onAdded={onAdded}>
      <ul className="cks-items">{unfinished.map((item) => drawItem(item))}</ul>
      {fold.count === 0 ? null : (
        <>
          <FoldPress fold={fold} open={shownOpen} busy={foldReading.status === 'waiting'} onPress={() => setIsOpen((now) => !now)} />
          {foldReading.status === 'ready' ? <ul className="cks-items ckp-folded">{folded.map((item) => drawItem(item, whole))}</ul> : null}
          {foldReading.status === 'error' ? <ErrorNote message={foldReading.message} fault={foldReading.fault} /> : null}
        </>
      )}
    </ChecklistCard>
  )
}

/**
 * ONE ITEM ON A CARD OF THE PAGE. On the reader's own checklist an open item has a left box: plain items tick
 * directly, and items of the evidence-or-words style open the picker under the row, which wave 14a brought on a
 * message. A standing item has no box. An open item also has a press under its facts, when it is
 * opened, that makes it standing, and a standing one has a press that makes it ordinary again (wave 13j round loop-6).
 * Only an open item: a standing item stays open or replaced only, and the door refuses `standing` on any other state. A
 * press the door refuses says why beside it, in the page's language where the door gave a code (round loop-8). Refused
 * because the checklist changed after the page read it, the page reads it again, and the words stay when the press has
 * gone. The card keeps the refusal, because it draws its words. For a second after the item's row moved as the page
 * read again, its presses do nothing and say why (round loop-9).
 */
function PageItem({
  item,
  list,
  canMark,
  boxSaid,
  pressed,
  said,
  moved,
  opened,
  onOpened,
  onRefused,
  onBoxRefused,
  onChanged,
}: {
  item: ChecklistRequest
  list: ChecklistReading
  /** Whether the item draws a left box: the reader's own, unfinished, not standing. */
  canMark: boolean
  /** What the door's refusal of the box's press says now, or null when there is none. */
  boxSaid: string | null
  /** Whether the item has the standing press: an open item on the reader's own checklist. */
  pressed: boolean
  /** What the door's refusal of the standing press says now, or null when there is none. */
  said: string | null
  moved: boolean
  /** Whether the item is opened, as the card keeps it. */
  opened: boolean
  onOpened: (opened: boolean) => void
  onRefused: (refused: PageRefusal | null) => void
  onBoxRefused: (refused: RefusedPress | null) => void
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [ticking, setTicking] = useState(false)
  const [picking, setPicking] = useState(false)
  // WHETHER THE BOX WAS PRESSED WHILE THE ROW WAS MARKED AS MOVED: the row says why nothing happened until the mark goes.
  const [pressedMoved, setPressedMoved] = useState(false)
  useEffect(() => {
    if (!moved) setPressedMoved(false)
  }, [moved])
  const standing = item.standing === true
  const special = aSpecialChecklistItem(item)
  const press = async (): Promise<void> => {
    const asked = !standing
    setBusy(true)
    onRefused(null)
    try {
      await api.makeChecklistItemStanding(list, item.id, asked)
      onChanged()
    } catch (error) {
      const one = aRefusedPress(error, list)
      onRefused({ ...one, standing: asked })
      if (one.sentWith !== null) onChanged()
    } finally {
      setBusy(false)
    }
  }
  const tick = async (): Promise<void> => {
    setTicking(true)
    onBoxRefused(null)
    try {
      await api.markChecklistItemDoneByThePerson(list, item.id)
      onChanged()
    } catch (error) {
      const one = aRefusedPress(error, list)
      onBoxRefused(one)
      if (one.sentWith !== null) onChanged()
    } finally {
      setTicking(false)
    }
  }
  return (
    <ItemRow
      item={item}
      list={list}
      moved={moved}
      opened={opened}
      onOpened={onOpened}
      box={
        canMark ? (
          <button
            type="button"
            className="ckp-box"
            aria-label={t(special ? 'checklists.doneWithEvidenceOrWords' : 'w13j.checklistDone.box', { words: item.words })}
            title={t(special ? 'checklists.doneWithEvidenceOrWordsTitle' : 'w13j.checklistDone.boxTitle')}
            disabled={ticking}
            aria-disabled={moved || undefined}
            onClick={() => (moved ? setPressedMoved(true) : special ? setPicking(true) : void tick())}
          >
            <ItemMark state={item.state} special={special} />
          </button>
        ) : undefined
      }
      inside={
        pressed || said !== null ? (
          <span className="ckl-standing">
            {pressed ? (
              <Btn size="sm" variant="secondary" pending={busy} disabled={moved} reason={t('w13j.checklistMoved.reason')} onClick={() => void press()}>
                {t(standing ? 'w13j.checklistStanding.unmake' : 'w13j.checklistStanding.make')}
              </Btn>
            ) : null}
            {said === null ? null : <span className="ckl-refusal">{said}</span>}
          </span>
        ) : undefined
      }
      under={
        <>
          {picking ? (
            <EvidencePicker
              list={list}
              item={item}
              moved={moved}
              onCancel={() => setPicking(false)}
              onDone={() => {
                setPicking(false)
                onChanged()
              }}
              onReadAgain={onChanged}
            />
          ) : boxSaid !== null ? (
            <span className="ckl-refusal">{boxSaid}</span>
          ) : null}
          {moved && pressedMoved ? (
            <span className="px-why ckw-moved-why" role="status">
              {t('w13j.checklistMoved.reason')}
            </span>
          ) : null}
        </>
      }
    />
  )
}

export const CHECKLISTS_PAGE_CSS = `
.ckl-title { margin: 0 0 var(--gut) 0; }
.ckl-controls { display: flex; flex-wrap: wrap; gap: var(--pad) var(--gut); align-items: center; margin: 0 0 var(--gut) 0; }
.ckl-window {
  display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; font: inherit; color: var(--text-2);
  background: var(--panel); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm); cursor: pointer;
}
/* A TICK BEFORE THE WORDS WHILE THE WINDOW IS SHOWN, so the press says its state without colour alone. */
.ckl-window::before { content: ''; width: 0.9rem; text-align: center; }
.ckl-window[aria-pressed='true']::before { content: '✓'; }
.ckl-window[aria-pressed='true'] { color: var(--text); border-color: var(--accent); }
.ckl-says { margin: 0 0 var(--gut) 0; color: var(--text-2); max-width: var(--measure-in-box); }

.ckl-sections { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }
.ckl-section { min-width: 0; }
.ckl-owner { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad) var(--gut); margin: 0 0 var(--pad) 0; min-width: 0; }
/* A HEADING THAT HOLDS A NAME IS DRAWN AS WRITTEN. */
.ckl-head { margin: 0; min-width: 0; font-size: var(--fs-3); font-weight: 700; text-transform: none; letter-spacing: normal; }
.ckl-section[data-reader='no'] > .ckl-head { border-bottom: var(--border-w) solid var(--border); }
.ckl-section[data-reader='no'][data-open='yes'] > .ckl-head { margin: 0 0 var(--pad) 0; }
/* THE READER'S OWN HEAD: the name, then the open count, spaced as in the other heads. A long name wraps and the count stays whole. */
.ckl-owner > .ckl-head { display: flex; align-items: center; gap: 8px; }
.ckl-press {
  display: flex; align-items: center; gap: 8px; width: 100%; min-height: 2.5rem; padding: 0 4px; border: none; background: none;
  color: var(--text); font: inherit; text-align: left; cursor: pointer;
}
.ckl-press:hover { background: var(--hover); }
.ckl-mark { flex: none; width: 1rem; color: var(--text-2); }
.ckl-name { min-width: 0; overflow-wrap: anywhere; }
.ckl .cks-items .ckp-item[data-state='waiting on the owner'] { background: var(--ask-bg); border-radius: var(--radius-sm); padding-left: 8px; padding-right: 8px; }
.ckl-standing { display: flex; flex-wrap: wrap; align-items: center; gap: 4px var(--gut); margin: 6px 0 2px 0; }
.ckl-refusal { color: var(--st-failed); font-size: var(--fs-1); overflow-wrap: anywhere; }
@media (max-width: 40rem) {
  .ckl-window, .ckl-press { min-height: 44px; }
}
`
