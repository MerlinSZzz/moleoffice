// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { t } from '@shared/i18n.ts'
import { EVERY_PROJECT } from '@shared/across-projects.ts'
import { isClosed, type ChecklistEvidence, type ChecklistReading, type ChecklistRequest } from '@shared/checklists.ts'
import { api, type ChecklistsAcrossReply } from '../api.ts'
import { usePanelPresence } from '../lib/motion.ts'
import { useChecklistArrivalRing } from '../lib/checklist-arrival.ts'
import { readEveryItemWhileTheWindowIsOpen, readMyChecklistsAgain, useMyChecklists } from '../lib/my-checklists.ts'
import { THE_WIDE_FROM } from '../lib/the-shell-width.ts'
import { ErrorNote, Loading, useAsync, type AsyncState } from './ui.tsx'
import { declaredAttributes } from './declares.ts'
import { Icon } from './Sidebar.tsx'
import { useProjectTitles } from './ProjectChoice.tsx'
import { CHECKLIST_SECTIONS_CSS, ChecklistCard, NewChecklistPress, OpenCount, THE_READERS_OWN, useOwners } from './ChecklistSections.tsx'
import {
  aRefusedPress,
  aSpecialChecklistItem,
  CHECKLIST_PARTS_CSS,
  CHECKLISTS_PRESS,
  checklistsWindowIsOn,
  EvidenceLink,
  EvidencePicker,
  FoldPress,
  inOrder,
  theFoldOf,
  useTheFoldsReadings,
  ItemMark,
  ItemRow,
  progressOf,
  refusedPressWords,
  theseMoved,
  ToldWords,
  useMovedRows,
  whatTheRowDraws,
  withOpened,
  WINDOW_SWITCHED,
  type DrawnLine,
  type RefusedPress,
  type TheFoldsReading,
} from './ChecklistParts.tsx'
/**
 * THE CHECKLISTS WINDOW AT THE TOP RIGHT, on every page while it is switched on (the checklists page has the
 * switch). The press is a count of the reader's own items still to do.
 *
 * WHAT IT READS, AND WHEN. Closed, it reads only the reader's own checklists, for the count on the press. That read is
 * the page's one read of them (src/web/lib/my-checklists.ts), which Home's checklist count draws too. Opened, it
 * reads everybody's checklists as well, for the names and the cards of the name chosen. The part drawn while it
 * is open, `TheOpenWindow`, also reads the participants through `useOwners`, to put the secretaries first and to name
 * the reader. While it draws cards, it reads the projects' titles for the mark on each card. The window is on every
 * page, so the closed window adds no other read to a page's load.
 *
 * DESIGN E, as decided: the open window shows one person's checklists as cards, the same cards as on the checklists
 * page (ChecklistSections.tsx): the items still to do, the finished ones folded under them, and a row that adds an
 * item. It opens on the reader's own. The names are folded behind Back, at the start of the window's head before its
 * title and drawn like the ×. Back shows a row of names in the cards' place, the reader's first, then each secretary,
 * each other agent and each other person, each group by name, each with the number of their items still to do. The
 * name of the person last shown is marked as the current one. Choosing a name shows that person's checklists, and the
 * names go. Nothing is added to the window while the names are folded. The row of names goes on to a second line
 * when the names do not fit, and every name is drawn whole, as decided. Only the reader's own checklists have a box
 * and "Mark done"; another person's are shown to read, and to add to. At the foot of the reader's own cards is "New
 * checklist", the press the page draws, which makes a checklist of the reader's own; it is drawn also when the reader
 * has none. Every item, opened, says who added it.
 *
 * THE PERSON'S PRESS ON AN ITEM'S EMPTY BOX MARKS IT DONE, with no evidence. The door
 * takes it from the person alone, and tells whoever added the item, or the agents the item names, in one message; the
 * item then says who was told. From anybody else the door refuses it for want of evidence, and the refusal is shown.
 * Refused because the checklist changed after the window read it, the window reads it again (wave 13j round loop-8).
 *
 * AN AGENT'S DONE NEEDS EVIDENCE, AND THE EVIDENCE IS PICKED, by point 4 of a decision. "Mark
 * done" opens a picker of the reports, runs, landed commits and manual sections in the checklist's project, from GET
 * /api/checklists/evidence-choices. Nobody types an id. An item marked done here stays in view until the window closes,
 * with its evidence linked or who was told, so the reader sees what was written; it sorts after the items still to do,
 * as every done item does, so the rows under it move up.
 *
 * A ROW THAT MOVED WHEN THE WINDOW READ AGAIN TAKES NO PRESS FOR ONE SECOND, and is marked as moved for that second
 * (wave 13j round loop-9): after a press that works, or one refused, the row under the pointer may be another item.
 * Which rows moved is worked out from what the window draws (`useMovedRows`).
 *
 * IT STAYS OPEN UNTIL THE READER CLOSES IT, as the chat does:
 * a press inside it, a press on the page outside it and a link in it that leads to a page all leave it open. The ×,
 * Escape and the press that opened it close it, from the cards or from the names, and it opens again on the reader's
 * own cards.
 *
 * ONE MOUNT, FIXED TO THE WINDOW. Below 1024px the shell's top bar is drawn, and the press sits at its right
 * end. Closed, the press is the only thing here that takes a press, and whatever is drawn at the top right keeps
 * room for it (the rules at the end of the sheet below).
 */

/** No checklist read: one list, so a window with nothing read hands the same list to `useOwners` every time. */
const NONE: readonly ChecklistReading[] = []

export function ChecklistsWindow() {
  const [on, setOn] = useState(checklistsWindowIsOn)
  useEffect(() => {
    const read = (): void => setOn(checklistsWindowIsOn())
    window.addEventListener(WINDOW_SWITCHED, read)
    return () => window.removeEventListener(WINDOW_SWITCHED, read)
  }, [])
  return on ? <TheWindow /> : null
}

function TheWindow() {
  const [open, setOpen] = useState(false)
  const panelPresent = usePanelPresence(open)
  // WHOSE CHECKLISTS ARE SHOWN, by the owner's key. It does not outlive a closing: the window opens on the reader's own.
  const [whose, setWhose] = useState(THE_READERS_OWN)
  // WHETHER BACK HAS SHOWN THE NAMES in the cards' place. It does not outlive a closing: the window opens on the cards.
  const [namesShown, setNamesShown] = useState(false)
  const [reads, setReads] = useState(0)
  // ITEMS MARKED DONE WHILE THE WINDOW IS OPEN, kept in view until it closes, after the items still to do.
  const [doneHere, setDoneHere] = useState<ReadonlySet<string>>(new Set())
  // THE CHECKLISTS WHOSE DONE ITEMS ARE OPENED. Folded by default, and folded again when the window closes.
  const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(new Set())
  // THE ITEMS OPENED, by `<checklist>/<item>`. Closed by default, and closed again when the window closes.
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())
  const own = useMyChecklists()
  // WHILE THE WINDOW IS OPEN THE READER'S OWN ARE READ WITH EVERY ITEM, said before the opening reads them again below.
  useEffect(() => (open ? readEveryItemWhileTheWindowIsOpen() : undefined), [open])
  // AN OPENING OR A PRESS READS THE READER'S OWN AGAIN, for every part of the page that draws them.
  useEffect(() => {
    if (reads > 0) readMyChecklistsAgain()
  }, [reads])
  const checklistPress = useRef<HTMLButtonElement>(null)
  useChecklistArrivalRing(own, checklistPress)
  // EVERYBODY'S CHECKLISTS, read while the window is open: the names Back shows, and the checklists of the name chosen.
  const [everyone] = useAsync(() => (open ? api.listChecklistsAcross(EVERY_PROJECT, 'everyone', 'open') : Promise.resolve(null)), [open, reads], { follows: { kinds: ['checklist'], atMostEveryMs: 5000 } })
  // EACH ROW'S BOX THAT THE DOOR REFUSED, by `<checklist>/<item>`, until the row is pressed again or the window closes.
  const [refusals, setRefusals] = useState<ReadonlyMap<string, RefusedPress>>(new Map())
  const close = useCallback(() => {
    setOpen(false)
    setWhose(THE_READERS_OWN)
    setNamesShown(false)
    setDoneHere(new Set())
    setUnfolded(new Set())
    setOpened(new Set())
    setRefusals(new Map())
  }, [])
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented) close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, close])

  // THE COUNT ON THE PRESS IS THE READER'S OWN ITEMS STILL TO DO, whoever the open window is showing.
  const count = own.status === 'ready' ? own.value.checklists.reduce((sum, list) => sum + list.counts.open, 0) : null
  const waiting = own.status === 'ready' ? own.value.checklists.some((list) => list.counts.waitingOnTheOwner > 0) : false

  const pressName = count === null ? t('checklists.window.press') : t('checklists.window.pressTitle', { n: count })

  return (
    <div className="ckw" data-open={open ? 'yes' : 'no'}>
      <style href="mole-office-checklist-parts" precedence="default">{CHECKLIST_PARTS_CSS}</style>
      <style href="mole-office-checklist-sections" precedence="default">{CHECKLIST_SECTIONS_CSS}</style>
      <style href="mole-office-checklists-window" precedence="default">{CHECKLISTS_WINDOW_CSS}</style>
      <button
        type="button"
        className={CHECKLISTS_PRESS}
        ref={checklistPress}
        aria-expanded={open}
        aria-label={pressName}
        title={pressName}
        onClick={() => {
          if (open) close()
          else {
            setOpen(true)
            setReads((n) => n + 1)
          }
        }}
      >
        <Icon name="check" />
        <span className="ckw-count" data-waiting={waiting ? 'yes' : 'no'}>{count ?? '…'}</span>
      </button>
      {panelPresent ? (
        <TheOpenWindow
          open={open}
          close={close}
          own={own}
          everyone={everyone}
          setReads={setReads}
          whose={whose}
          setWhose={setWhose}
          namesShown={namesShown}
          setNamesShown={setNamesShown}
          doneHere={doneHere}
          setDoneHere={setDoneHere}
          unfolded={unfolded}
          setUnfolded={setUnfolded}
          opened={opened}
          setOpened={setOpened}
          refusals={refusals}
          setRefusals={setRefusals}
        />
      ) : null}
    </div>
  )
}

/**
 * THE OPEN WINDOW: its head, and under it either the cards of the name chosen or the names Back shows in their place.
 * Over the cards the head is Back, the title and the ×, and the press that makes a new checklist is under the reader's
 * own cards. Over the names it is the title and the ×. It is drawn while the window is open and while it closes, and
 * at no other time. It is the one part of the window that calls `useOwners`, so the window reads the participants only
 * once it has been opened. What the window keeps until it closes is kept by `TheWindow`, where the press that closes
 * it is drawn.
 */
function TheOpenWindow({
  open,
  close,
  own,
  everyone,
  setReads,
  whose,
  setWhose,
  namesShown,
  setNamesShown,
  doneHere,
  setDoneHere,
  unfolded,
  setUnfolded,
  opened,
  setOpened,
  refusals,
  setRefusals,
}: {
  /** False while the window closes and this part is still drawn. */
  open: boolean
  close: () => void
  /** The reader's own checklists, which the closed window reads too. */
  own: AsyncState<ChecklistsAcrossReply>
  /** Everybody's checklists, read while the window is open; null when it was closed as they were asked for. */
  everyone: AsyncState<ChecklistsAcrossReply | null>
  setReads: (change: (n: number) => number) => void
  whose: string
  setWhose: (whose: string) => void
  /** True while Back has shown the names in the cards' place. */
  namesShown: boolean
  setNamesShown: (shown: boolean) => void
  doneHere: ReadonlySet<string>
  setDoneHere: (change: (now: ReadonlySet<string>) => ReadonlySet<string>) => void
  unfolded: ReadonlySet<string>
  setUnfolded: (change: (now: ReadonlySet<string>) => ReadonlySet<string>) => void
  opened: ReadonlySet<string>
  setOpened: (change: (now: ReadonlySet<string>) => ReadonlySet<string>) => void
  refusals: ReadonlyMap<string, RefusedPress>
  setRefusals: (change: (now: ReadonlyMap<string, RefusedPress>) => ReadonlyMap<string, RefusedPress>) => void
}) {
  const owners = useOwners(
    everyone.status === 'ready' && everyone.value !== null ? everyone.value.checklists : NONE,
    own.status === 'ready' ? own.value.checklists : NONE,
  )
  const chosen = owners.find((owner) => owner.key === whose) ?? owners[0]!
  // THE READER'S OWN ARE READ ON THEIR OWN, and are there before everybody's; another person's come from everybody's.
  const shown = chosen.isTheReader ? own : everyone
  const shownReading = shown.status === 'ready' ? shown.value : null
  // THE READING A REPLY HANDED BACK, a mark's or an add's, for each checklist, until the window's own read of what it
  // shows comes back. A second box pressed before that read is sent with the version the first press made, and is not
  // refused as changed since it was read.
  const [replied, setReplied] = useState<ReadonlyMap<string, ChecklistReading>>(new Map())
  useEffect(() => setReplied(new Map()), [shownReading])
  const lists = shownReading === null ? [] : chosen.lists.map((list) => replied.get(list.id) ?? list)
  // A STANDING ITEM HAS NO BOX AND NO "MARK DONE": it is never marked done.
  const canMark = (item: ChecklistRequest): boolean => chosen.isTheReader && !isClosed(item.state) && item.standing !== true
  // EVERYBODY'S ARE READ WITH ONLY THEIR OPEN ITEMS, so a fold of theirs reads its checklist whole when it is pressed.
  const folds = useTheFoldsReadings(lists, unfolded)
  const groups = lists.map((list) => {
    const kept = (item: ChecklistRequest): boolean => !isClosed(item.state) || doneHere.has(`${list.id}/${item.id}`)
    const keptItems = inOrder(list.items).filter(kept)
    const reading: TheFoldsReading = folds.get(list.id) ?? { status: 'shut' }
    const whole = reading.status === 'ready' ? reading.whole : list
    return {
      list,
      kept: keptItems,
      fold: theFoldOf(list, keptItems.filter((item) => isClosed(item.state))),
      reading,
      whole,
      folded: reading.status === 'ready' ? inOrder(whole.items).filter((item) => !kept(item)) : [],
      isOpen: reading.status === 'ready' || reading.status === 'error',
    }
  })
  // WHAT THE OPEN WINDOW DRAWS FROM WHAT IT READ, line by line, top to bottom, with each row's refusal in the words it is
  // drawn in. The rows that moved when the window reads again are worked out from this alone. The names and the cards
  // are never drawn together. While the names are shown they are the one line, because the row wraps: what takes room
  // in it is each name, how many digits its count has (the digits are all one width) and whether the count is bold.
  const drawn: DrawnLine[] = !open
    ? []
    : namesShown
      ? [{ key: 'names', draws: JSON.stringify(owners.map((owner) => [owner.key, owner.name, String(owner.open).length, owner.waiting])) }]
      : groups.flatMap(({ list, kept, fold, whole, folded, isOpen }) => [
          { key: `${list.id}:heading`, draws: JSON.stringify([list.title, list.workspaceId, progressOf(list)]) },
          ...kept.map((item) => {
            const row = `${list.id}/${item.id}`
            const refused = refusals.get(row)
            const said = refused === undefined ? null : refusedPressWords(refused, list, canMark(item))
            const doneLine = said === null && doneHere.has(row) ? whatTheDoneLineDraws(item, list) : null
            return { key: row, draws: JSON.stringify([whatTheRowDraws(item, list, opened.has(row)), canMark(item), doneHere.has(row), said, doneLine]) }
          }),
          ...(fold.count === 0 ? [] : [{ key: `${list.id}:fold`, draws: JSON.stringify([fold.count, fold.replaced, isOpen]) }]),
          ...folded.map((item) => ({ key: `${list.id}/${item.id}`, draws: whatTheRowDraws(item, whole, opened.has(`${list.id}/${item.id}`)) })),
        ])
  // EVERYBODY'S CHECKLISTS ARE READ TOO, because the counts beside the names come from them. Their first reading,
  // after the window opens, is the window's first whole drawing and not a read again, so it starts the drawing anew.
  // A change between the cards and the names starts it anew as well, so a change of screen marks no row as moved.
  const everyoneReading = everyone.status === 'ready' ? everyone.value : null
  const moved = useMovedRows(
    drawn,
    [shownReading, everyoneReading, replied],
    `${String(open)}/${namesShown ? 'names' : 'cards'}/${chosen.key}/${everyoneReading === null ? 'own' : 'everyone'}`,
    (rows) => setRefusals((now) => theseMoved(now, rows)),
  )

  const answered = (after: ChecklistReading): void => {
    setReplied((now) => new Map([...now, [after.id, after]]))
    setReads((n) => n + 1)
  }
  const markedDone = (list: ChecklistReading, item: ChecklistRequest, after: ChecklistReading): void => {
    setDoneHere((now) => new Set([...now, `${list.id}/${item.id}`]))
    answered(after)
  }
  // A PRESS REFUSED BECAUSE THE CHECKLIST CHANGED AFTER IT WAS READ: the window reads the reader's checklists again.
  const readAgain = (): void => setReads((n) => n + 1)
  const toggleFold = (id: string): void =>
    setUnfolded((now) => {
      const next = new Set(now)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // THE FOCUS FOLLOWS A CHANGE OF SCREEN: Back moves it to the name of the person last shown, and a name moves it to
  // Back. It is moved once the new screen is drawn, and only after one of those two presses.
  const backPress = useRef<HTMLButtonElement>(null)
  const currentName = useRef<HTMLButtonElement>(null)
  const focusAfter = useRef<'names' | 'back' | null>(null)
  useEffect(() => {
    const after = focusAfter.current
    focusAfter.current = null
    if (after === 'names') currentName.current?.focus()
    else if (after === 'back') backPress.current?.focus()
  }, [namesShown])
  const showTheNames = (): void => {
    focusAfter.current = 'names'
    setNamesShown(true)
  }
  const showTheCardsOf = (key: string): void => {
    focusAfter.current = 'back'
    setWhose(key)
    setNamesShown(false)
  }

  return (
    <div className="ckw-panel" data-motion-closing={open ? undefined : 'yes'} aria-hidden={open ? undefined : true} inert={!open} role="dialog" aria-label={t('checklists.window.title')} {...declaredAttributes({ surface: 'checklists.window' })}>
      <div className="ckw-head">
        {namesShown ? null : (
          <button type="button" className="ckw-back" ref={backPress} onClick={showTheNames}>
            {t('checklists.window.back')}
          </button>
        )}
        <h2 className="ckw-title">{t('checklists.window.title')}</h2>
        <button type="button" className="ckw-close" onClick={close} aria-label={t('checklists.window.close')}>
          ×
        </button>
      </div>
      {namesShown ? (
        <div className="ckw-names" role="group" aria-label={t('checklists.whose')}>
          {owners.map((owner) => (
            <button
              key={owner.key}
              type="button"
              className="ckw-name"
              ref={owner.key === chosen.key ? currentName : undefined}
              aria-current={owner.key === chosen.key ? 'true' : undefined}
              onClick={() => showTheCardsOf(owner.key)}
            >
              <span className="ckw-name-words">{owner.name}</span>
              <OpenCount owner={owner} />
            </button>
          ))}
        </div>
      ) : (
        <div className="ckw-cards">
          {shown.status === 'loading' || (shown.status === 'ready' && shown.value === null) ? <Loading what={t('checklists.loading')} rows={2} /> : null}
          {shown.status === 'error' ? <ErrorNote message={shown.message} fault={shown.fault} /> : null}
          {groups.length === 0 ? null : (
            <WithProjectTitles
              draw={(titles) =>
                groups.map(({ list, kept, fold, reading, whole, folded, isOpen }) => (
                  <ChecklistCard key={list.id} list={list} titles={titles} onAdded={answered}>
                    <ul className="cks-items">
                      {kept.map((item) => {
                        const row = `${list.id}/${item.id}`
                        return (
                          <WindowItem
                            key={item.id}
                            list={list}
                            item={item}
                            canMark={canMark(item)}
                            justDone={doneHere.has(row)}
                            refused={refusals.get(row) ?? null}
                            moved={moved.has(row)}
                            opened={opened.has(row)}
                            onOpened={(now) => setOpened((all) => withOpened(all, row, now))}
                            onDone={markedDone}
                            onRefused={(one) =>
                              setRefusals((now) => {
                                const next = new Map(now)
                                if (one === null) next.delete(row)
                                else next.set(row, one)
                                return next
                              })
                            }
                            readAgain={readAgain}
                          />
                        )
                      })}
                    </ul>
                    {fold.count === 0 ? null : (
                      <>
                        <FoldPress fold={fold} open={isOpen} busy={reading.status === 'waiting'} onPress={() => toggleFold(list.id)} />
                        {reading.status === 'error' ? <ErrorNote message={reading.message} fault={reading.fault} /> : null}
                        {reading.status === 'ready' ? (
                          <ul className="cks-items ckp-folded">
                            {folded.map((item) => {
                              const row = `${list.id}/${item.id}`
                              return (
                                <ItemRow
                                  key={item.id}
                                  item={item}
                                  list={whole}
                                  moved={moved.has(row)}
                                  opened={opened.has(row)}
                                  onOpened={(now) => setOpened((all) => withOpened(all, row, now))}
                                />
                              )
                            })}
                          </ul>
                        ) : null}
                      </>
                    )}
                  </ChecklistCard>
                ))
              }
            />
          )}
          {chosen.isTheReader && shown.status === 'ready' ? (
            // THE CARDS ARE A FLEX COLUMN, which stretches what it holds to its width. This box keeps the press as wide
            // as its words and the title field at its own height, as on the page.
            <div>
              <NewChecklistPress project={undefined} onMade={readAgain} />
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

/**
 * THE PROJECTS' TITLES, read only while the window's cards are drawn, for the small mark on each card that names its
 * project. The window is on every page, and the closed window asks for nothing it does not draw.
 */
function WithProjectTitles({ draw }: { draw: (titles: ReadonlyMap<string, string>) => ReactNode }) {
  const titles = useProjectTitles()
  return <>{draw(titles)}</>
}

function WindowItem({
  list,
  item,
  canMark,
  justDone,
  refused,
  moved,
  opened,
  onOpened,
  onDone,
  onRefused,
  readAgain,
}: {
  list: ChecklistReading
  item: ChecklistRequest
  /** Whether the row has a box and "Mark done": somebody else's checklists are shown to be read, not marked. */
  canMark: boolean
  /** Marked done in this opening of the window: its evidence, or who was told, is shown under it. */
  justDone: boolean
  /** The door's refusal of this row's box, kept by the window, which draws its words. */
  refused: RefusedPress | null
  /** The row moved when the window read again, under a second ago: its presses do nothing and say why. */
  moved: boolean
  /** Whether the item is opened, as the window keeps it. */
  opened: boolean
  onOpened: (opened: boolean) => void
  onDone: (list: ChecklistReading, item: ChecklistRequest, after: ChecklistReading) => void
  onRefused: (refused: RefusedPress | null) => void
  /** Reads the reader's checklists again, after the box was refused because the checklist changed since it was read. */
  readAgain: () => void
}) {
  const [picking, setPicking] = useState(false)
  const [ticking, setTicking] = useState(false)
  // WHETHER THE BOX WAS PRESSED WHILE THE ROW WAS MARKED AS MOVED: the row says why nothing happened until the mark goes.
  const [pressedMoved, setPressedMoved] = useState(false)
  useEffect(() => {
    if (!moved) setPressedMoved(false)
  }, [moved])
  const tick = async (): Promise<void> => {
    setTicking(true)
    onRefused(null)
    try {
      const reply = await api.markChecklistItemDoneByThePerson(list, item.id)
      onDone(list, item, reply.checklist)
    } catch (error) {
      const one = aRefusedPress(error, list)
      onRefused(one)
      if (one.sentWith !== null) readAgain()
    } finally {
      setTicking(false)
    }
  }
  // A SPECIAL ITEM'S BOX OPENS THE PICKER INSTEAD OF TICKING (wave 14a): its icon says evidence or words are wanted.
  const special = aSpecialChecklistItem(item)
  const movedWords = t('w13j.checklistMoved.reason')
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
      under={
        <>
          {picking ? (
            <EvidencePicker
              list={list}
              item={item}
              moved={moved}
              onCancel={() => setPicking(false)}
              onDone={(after) => {
                setPicking(false)
                onDone(list, item, after)
              }}
              onReadAgain={readAgain}
            />
          ) : refused !== null ? (
            // THE BOX IS THE PRESS THE REFUSAL MAY ASK FOR AGAIN, so "Press once more" only while the box is drawn.
            <p className="ckw-refusal">{refusedPressWords(refused, list, canMark)}</p>
          ) : justDone && (item.evidence ?? []).length > 0 ? (
            <p className="ckw-done-with">
              {t('checklists.window.doneWith')}{' '}
              {(item.evidence ?? []).map((one, index) => (
                <EvidenceLink key={index} one={one} linked={list.linked} />
              ))}
            </p>
          ) : justDone && item.doneByThePerson !== undefined ? (
            // THE BOX JUST PRESSED SAYS WHO WAS TOLD, without opening the item.
            <p className="ckw-done-with">
              <ToldWords item={item} named={list.named} />
            </p>
          ) : null}
          {moved && pressedMoved ? (
            <span className="px-why ckw-moved-why" role="status">
              {movedWords}
            </span>
          ) : null}
        </>
      }
    />
  )
}

/**
 * WHAT A ROW MARKED DONE IN THIS OPENING DRAWS UNDER ITSELF, open or not, as `WindowItem` draws it when no refusal is
 * drawn there: the evidence it was marked done with and what the checklist's reading says of the records that evidence
 * names, or else who was told.
 */
function whatTheDoneLineDraws(item: ChecklistRequest, list: ChecklistReading): string {
  const evidence = item.evidence ?? []
  if (evidence.length > 0) {
    const own = JSON.stringify(evidence)
    return JSON.stringify([evidence, list.linked.filter((one) => own.includes(JSON.stringify(one.id)))])
  }
  const told = item.doneByThePerson?.told
  if (told === undefined) return JSON.stringify(null)
  const own = JSON.stringify(told)
  return JSON.stringify([told, list.named.filter((one) => own.includes(JSON.stringify(one.who.id)))])
}


export const CHECKLISTS_WINDOW_CSS = `
.ckw { position: fixed; top: var(--pad); right: var(--fab-inset); z-index: var(--z-popover); }
/* WITH THE CHAT BESIDE THE PAGE ON THE RIGHT, the window stands at the page's own right edge, as the chat circle does.
   The chat is drawn over the top right of the browser window, so the window stood under it and looked gone. */
:root[data-chat-split='right'] .ckw { right: calc(var(--chat-split-w, 0px) + var(--fab-inset)); }
.ckw-press {
  position: relative; z-index: 1; display: inline-flex; align-items: center; gap: 6px; min-height: 2.5rem; min-width: 2.5rem; padding: 0 10px;
  border-radius: var(--radius-pill, 999px); border: var(--border-w) solid var(--border-strong);
  background: var(--panel); color: var(--text); box-shadow: var(--elev-1); cursor: pointer; font: inherit; font-weight: 600;
}
.ckw-press:hover { background: var(--hover); }
.ckw-press .shell-ico { width: 1.1rem; height: 1.1rem; }
.ckw-count { font-variant-numeric: tabular-nums; }
.ckw-count[data-waiting='yes'] { color: var(--ask); }
/* IT SCROLLS DOWN ONLY. Nothing in it is wider than it: every line wraps, and an item's words are whole at 390. */
.ckw-panel {
  position: absolute; z-index: 1; top: calc(100% + 6px); right: 0; width: min(26rem, calc(100vw - 2 * var(--fab-inset)));
  max-height: calc(100dvh - 5rem - var(--fab-room)); overflow-x: hidden; overflow-y: auto; padding: var(--pad) var(--gut) var(--gut);
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-lg, var(--radius)); background: var(--panel); box-shadow: var(--elev-2);
}
.ckw-head { display: flex; align-items: center; gap: var(--pad); margin: 0 0 4px 0; }
.ckw-title { margin: 0; font-size: var(--fs-3); flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
.ckw-close { flex: none; width: 2rem; height: 2rem; border: none; background: none; color: var(--text-2); font-size: 1.4rem; line-height: 1; cursor: pointer; border-radius: var(--radius-sm); }
.ckw-close:hover { background: var(--hover); }
.ckw-back { flex: none; height: 2rem; padding: 0 8px; border: none; background: none; color: var(--text-2); font: inherit; font-size: var(--fs-1); line-height: 1; white-space: nowrap; cursor: pointer; border-radius: var(--radius-sm); }
.ckw-back:hover { background: var(--hover); }
/* THE ROW OF NAMES WRAPS, as decided: names that do not fit go on to the next line, in their order. A name longer than
   the row breaks inside its own press, so every name is drawn whole and nothing is cut. */
.ckw-names { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; margin: 0 0 var(--pad) 0; padding: 2px 0 6px 0; }
.ckw-name {
  flex: none; display: inline-flex; align-items: center; gap: 6px; min-height: 2rem; max-width: 100%; padding: 0 10px; overflow-wrap: anywhere;
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-pill, 999px); background: var(--panel); color: var(--text);
  font: inherit; font-size: var(--fs-1); cursor: pointer;
}
.ckw-name:hover { background: var(--hover); }
.ckw-name[aria-current='true'] { background: var(--accent); border-color: var(--accent); color: var(--accent-text); font-weight: 600; }
.ckw-name[aria-current='true'] .cks-count { color: inherit; }
.ckw-cards { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.ckw-done-with { margin: 4px 0 0 calc(1.15rem + 8px); font-size: var(--fs-1); color: var(--st-done); display: flex; flex-wrap: wrap; gap: 0 6px; }
.ckw-moved-why { display: block; margin: 4px 0 0 0; }
p.ckw-refusal { margin: 4px 0 0 0; overflow-wrap: anywhere; }
/* WHAT IS DRAWN AT THE TOP RIGHT KEEPS ROOM FOR THE PRESS, so the closed window covers no control. The room is
   taken across and never down: room kept above the page made a drawing that fits the window run past its foot.
   The top bar below 1024px, and the two lines that can stand above the frame, keep room at their right end. */
body:has(.ckw) { --ckw-room: calc(var(--fab-inset) + 4.5rem); }
body:has(.ckw) .shell-bar, body:has(.ckw) .px-btc, body:has(.ckw) .px-hm { padding-right: var(--ckw-room); }
/* WITHOUT THE TOP BAR, the page's first lines are drawn around a room as tall as the press, and the line of a
   page's group keeps room at its right end. The review column is held below the press: ReviewBar.tsx measures
   the press as it measures the top bar. */
@media ${THE_WIDE_FROM} {
  body:has(.ckw) main.page::before {
    content: ''; float: right; width: calc(var(--ckw-room) - var(--pad-lg));
    height: calc(var(--pad) + 2.5rem + 4px - var(--pad-lg));
  }
  body:has(.ckw) .px-where { padding-right: var(--ckw-room); }
}
/* ON A PHONE THE OPEN WINDOW IS A SHEET, from under its press to the foot of the screen and from edge to edge, as
   decided. As a box under the press it left a strip of the page showing at each side and below it, and what showed
   read as part of the window. The page above the sheet is not drawn as covered, and still takes a press. The corner
   chat circle, when the person keeps it there, stays over the sheet's foot as it does over the chat's own sheet, so
   the sheet keeps the circle's room under its last card. */
@media (max-width: 480px) {
  .ckw { --ckw-press-size: 44px; }
  .ckw-press { min-height: var(--ckw-press-size); min-width: var(--ckw-press-size); }
  .ckw-panel {
    position: fixed; top: calc(var(--pad) + var(--ckw-press-size) + 6px); right: 0; bottom: 0; left: 0; width: auto; max-height: none;
    border-width: var(--border-w) 0 0 0; border-radius: var(--radius-lg, var(--radius)) var(--radius-lg, var(--radius)) 0 0;
    padding-bottom: calc(var(--gut) + var(--fab-room));
  }
  .ckw-name { min-height: 44px; }
  /* A ROW WITHOUT A BOX KEEPS THE ROOM A BOX TAKES HERE, so its words and facts start where those beside a box start. */
  .ckw-panel .cks-items .ckp-item:not([data-box='yes']) .ckp-summary > .ckp-mark { margin-left: calc((44px - 1.15rem) / 2); margin-right: calc((44px - 1.15rem) / 2); }
  .ckw-panel .cks-items .ckp-item:not([data-box='yes']) :is(.ckp-details, .ckp-asks, .ckp-flow) { padding-left: calc(44px + 8px); }
}
`
