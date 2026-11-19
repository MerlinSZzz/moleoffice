// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useCallback, useEffect, useRef, useState } from 'react'
import { t } from '@shared/i18n.ts'
import { EVERY_PROJECT } from '@shared/across-projects.ts'
import { isClosed, type ChecklistEvidence, type ChecklistReading, type ChecklistRequest } from '@shared/checklists.ts'
import { api } from '../api.ts'
import { usePanelPresence } from '../lib/motion.ts'
import { useChecklistArrivalRing } from '../lib/checklist-arrival.ts'
import { THE_WIDE_FROM } from '../lib/the-shell-width.ts'
import { ErrorNote, Loading, useAsync } from './ui.tsx'
import { checklistsPath, RouteLink } from './router.tsx'
import { declaredAttributes } from './declares.ts'
import { Icon } from './Sidebar.tsx'
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
  ItemMark,
  ItemRow,
  ownerKey,
  ownerWords,
  Progress,
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
} from './ChecklistParts.tsx'
/**
 * THE CHECKLISTS WINDOW AT THE TOP RIGHT, on every page while it is switched on (the checklists page has the
 * switch). By point 2 of a decision, the press is a count of the reader's own items still to do; the open
 * window groups the items under each checklist with its progress; every item is shown whole; done items are
 * folded under each checklist with a press that opens them; "Mark done" is a small button beside each item
 * still to do.
 *
 * IT OPENS ON THE READER'S OWN CHECKLISTS, with no choice of whose. One press
 * in its top line opens the full view, where the reader chooses whose checklists to read, everyone's at first;
 * those are read and never marked. A press in the full view's top line goes back. Closing goes back as well.
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
 * Escape and the press that opened it close it.
 *
 * ONE MOUNT, FIXED TO THE WINDOW. Below 1024px the shell's top bar is drawn, and the press sits at its right
 * end. Closed, the press is the only thing here that takes a press, and whatever is drawn at the top right keeps
 * room for it (the rules at the end of the sheet below).
 */

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
  // THE FULL VIEW AND ITS CHOICE OF WHOSE. Neither outlives a closing: the window opens on the reader's own.
  const [full, setFull] = useState(false)
  const [owner, setOwner] = useState('everyone')
  const [reads, setReads] = useState(0)
  // ITEMS MARKED DONE WHILE THE WINDOW IS OPEN, kept in view until it closes, after the items still to do.
  const [doneHere, setDoneHere] = useState<ReadonlySet<string>>(new Set())
  // THE CHECKLISTS WHOSE DONE ITEMS ARE OPENED. Folded by default, and folded again when the window closes.
  const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(new Set())
  // THE ITEMS OPENED, by `<checklist>/<item>`. Closed by default, and closed again when the window closes.
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())
  const [own] = useAsync(() => api.listChecklistsAcross(EVERY_PROJECT), [reads], { follows: { kinds: ['checklist'], atMostEveryMs: 5000 } })
  const checklistPress = useRef<HTMLButtonElement>(null)
  useChecklistArrivalRing(own, checklistPress)
  const [everyone] = useAsync(() => (full ? api.listChecklistsAcross(EVERY_PROJECT, 'everyone') : Promise.resolve(null)), [full, reads], { follows: { kinds: ['checklist'], atMostEveryMs: 5000 } })
  const [one] = useAsync(() => (full && owner !== 'everyone' ? api.listChecklistsAcross(EVERY_PROJECT, owner) : Promise.resolve(null)), [full, owner, reads], { follows: { kinds: ['checklist'], atMostEveryMs: 5000 } })
  // THE READING A MARK'S REPLY HANDED BACK, for each of the reader's own checklists, until the window's own read comes
  // back. A second box pressed before that read is sent with the version the first press made, and is not refused as
  // changed since it was read.
  const [replied, setReplied] = useState<ReadonlyMap<string, ChecklistReading>>(new Map())
  useEffect(() => setReplied(new Map()), [own])
  // EACH ROW'S BOX THAT THE DOOR REFUSED, by `<checklist>/<item>`, until the row is pressed again or the window closes.
  const [refusals, setRefusals] = useState<ReadonlyMap<string, RefusedPress>>(new Map())
  const close = useCallback(() => {
    setOpen(false)
    setFull(false)
    setOwner('everyone')
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
  const shown = !full ? own : owner === 'everyone' ? everyone : one
  const mine = !full
  const lists =
    shown.status === 'ready' && shown.value !== null
      ? shown.value.checklists.map((list) => (mine ? replied.get(list.id) ?? list : list)).filter((list) => list.items.length > 0)
      : []
  const owners = everyone.status === 'ready' && everyone.value !== null ? new Map(everyone.value.checklists.map((list) => [ownerKey(list), list])) : new Map<string, ChecklistReading>()
  const chosen = owners.get(owner)
  const showAll = t('checklists.window.showAll')
  const backToMine = t('checklists.window.backToMine')
  const heading = !full ? t('checklists.window.title') : chosen === undefined ? showAll : t('checklists.window.titleOf', { name: chosen.ownerName })
  // A STANDING ITEM HAS NO BOX AND NO "MARK DONE": it is never marked done.
  const canMark = (item: ChecklistRequest): boolean => mine && !isClosed(item.state) && item.standing !== true
  const groups = lists.map((list) => {
    const items = inOrder(list.items)
    const kept = (item: ChecklistRequest): boolean => !isClosed(item.state) || doneHere.has(`${list.id}/${item.id}`)
    return { list, kept: items.filter(kept), folded: items.filter((item) => !kept(item)), isOpen: unfolded.has(list.id) }
  })
  // WHAT THE OPEN WINDOW DRAWS FROM WHAT IT READ, line by line, top to bottom, with each row's refusal in the words it is
  // drawn in. The rows that moved when the window reads again are worked out from this alone.
  const drawn: DrawnLine[] = !open
    ? []
    : [
        { key: 'heading', draws: heading },
        ...groups.flatMap(({ list, kept, folded, isOpen }) => [
          { key: `${list.id}:heading`, draws: JSON.stringify([list.title, full && owner === 'everyone' ? ownerWords(list) : null, progressOf(list)]) },
          ...kept.map((item) => {
            const row = `${list.id}/${item.id}`
            const refused = refusals.get(row)
            const said = refused === undefined ? null : refusedPressWords(refused, list, canMark(item))
            const doneLine = said === null && doneHere.has(row) ? whatTheDoneLineDraws(item, list) : null
            return { key: row, draws: JSON.stringify([whatTheRowDraws(item, list, opened.has(row)), canMark(item), doneHere.has(row), said, doneLine]) }
          }),
          ...(folded.length === 0 ? [] : [{ key: `${list.id}:fold`, draws: JSON.stringify([folded.length, folded.some((item) => item.state === 'superseded'), isOpen]) }]),
          ...(isOpen ? folded.map((item) => ({ key: `${list.id}/${item.id}`, draws: whatTheRowDraws(item, list, opened.has(`${list.id}/${item.id}`)) })) : []),
        ]),
      ]
  const moved = useMovedRows(drawn, [shown.status === 'ready' ? shown.value : null, replied], `${String(open)}/${String(full)}/${owner}`, (rows) =>
    setRefusals((now) => theseMoved(now, rows)),
  )

  const markedDone = (list: ChecklistReading, item: ChecklistRequest, after: ChecklistReading): void => {
    setDoneHere((now) => new Set([...now, `${list.id}/${item.id}`]))
    setReplied((now) => new Map([...now, [list.id, after]]))
    setReads((n) => n + 1)
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

  const pressName = count === null ? t('checklists.window.press') : t('checklists.window.pressTitle', { n: count })

  return (
    <div className="ckw" data-open={open ? 'yes' : 'no'}>
      <style href="mole-office-checklist-parts" precedence="default">{CHECKLIST_PARTS_CSS}</style>
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
        <div className="ckw-panel" data-motion-closing={open ? undefined : 'yes'} aria-hidden={open ? undefined : true} inert={!open} role="dialog" aria-label={t('checklists.window.title')} {...declaredAttributes({ surface: 'checklists.window' })}>
          <div className="ckw-head">
            {full ? (
              <button type="button" className="ckw-view" onClick={() => setFull(false)} aria-label={backToMine} title={backToMine}>
                <span aria-hidden="true">←</span> {backToMine}
              </button>
            ) : null}
            <h2 className="ckw-title">{heading}</h2>
            {full ? null : (
              <button type="button" className="ckw-view" onClick={() => setFull(true)} aria-label={showAll} title={showAll}>
                {showAll}
              </button>
            )}
            <button type="button" className="ckw-close" onClick={close} aria-label={t('checklists.window.close')}>
              ×
            </button>
          </div>
          {full ? (
            <label className="ckw-whose">
              <span>{t('checklists.whose')}</span>
              <select className="px-input" value={owner} onChange={(event) => setOwner(event.target.value)}>
                <option value="everyone">{t('checklists.whose.everyone')}</option>
                {[...owners].map(([key, list]) => (
                  <option key={key} value={key}>{ownerWords(list)}</option>
                ))}
              </select>
            </label>
          ) : null}
          {mine ? null : <p className="ckw-note">{t('checklists.window.readOnly')}</p>}
          {shown.status === 'loading' ? <Loading what={t('checklists.loading')} rows={2} /> : null}
          {shown.status === 'error' ? <ErrorNote message={shown.message} fault={shown.fault} /> : null}
          {shown.status === 'ready' && lists.length === 0 ? <p className="ckw-empty">{t('checklists.window.empty')}</p> : null}
          {groups.length > 0 ? (
            <div className="ckw-groups">
              {groups.map(({ list, kept, folded, isOpen }) => {
                return (
                  <section key={list.id} className="ckw-group">
                    <RouteLink className="ckw-group-title" to={checklistsPath(list.id)}>
                      {list.title}
                    </RouteLink>
                    {/* EVERYONE'S CHECKLISTS SAY WHOSE EACH IS; one owner's are named in the heading. */}
                    {full && owner === 'everyone' ? <p className="ckw-owner">{ownerWords(list)}</p> : null}
                    <Progress list={list} />
                    <ul className="ckw-items">
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
                    {folded.length === 0 ? null : (
                      <>
                        <FoldPress folded={folded} open={isOpen} onPress={() => toggleFold(list.id)} />
                        {isOpen ? (
                          <ul className="ckw-items ckp-folded">
                            {folded.map((item) => {
                              const row = `${list.id}/${item.id}`
                              return (
                                <ItemRow
                                  key={item.id}
                                  item={item}
                                  list={list}
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
                  </section>
                )
              })}
            </div>
          ) : null}
          {/* THE PAGE IS REACHED FROM THE FULL VIEW, so the default view has one thing named "All checklists". */}
          {full ? (
            <RouteLink className="ckw-all" to={checklistsPath()}>
              {t('checklists.window.openPage')} →
            </RouteLink>
          ) : null}
        </div>
      ) : null}
    </div>
  )
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
  position: absolute; z-index: 1; top: calc(100% + 6px); right: 0; width: min(24rem, calc(100vw - 2 * var(--fab-inset)));
  max-height: calc(100dvh - 5rem - var(--fab-room)); overflow-x: hidden; overflow-y: auto; padding: var(--pad) var(--gut) var(--gut);
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-lg, var(--radius)); background: var(--panel); box-shadow: var(--elev-2);
}
.ckw-head { display: flex; align-items: center; gap: var(--pad); margin: 0 0 4px 0; }
.ckw-title { margin: 0; font-size: var(--fs-3); flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
.ckw-close { flex: none; width: 2rem; height: 2rem; border: none; background: none; color: var(--text-2); font-size: 1.4rem; line-height: 1; cursor: pointer; border-radius: var(--radius-sm); }
.ckw-close:hover { background: var(--hover); }
.ckw-view {
  flex: none; display: inline-flex; align-items: center; gap: 4px; min-height: 2rem; padding: 0 8px; border: var(--border-w) solid var(--border-strong);
  background: var(--panel); color: var(--text); font: inherit; font-size: var(--fs-1); font-weight: 600; cursor: pointer; border-radius: var(--radius-sm); white-space: nowrap;
}
.ckw-view:hover { background: var(--hover); }
.ckw-whose { display: flex; align-items: center; gap: var(--pad); margin: 0 0 var(--pad) 0; color: var(--text-2); font-size: var(--fs-2); }
.ckw-whose select { flex: 1 1 auto; min-width: 0; }
.ckw-whose > span { white-space: nowrap; }
.ckw-items { list-style: none; margin: 0; padding: 0; }
.ckw-group { padding: var(--pad) 0 0 0; border-top: var(--border-w) solid var(--border); margin-top: var(--pad); }
.ckw-group:first-child { border-top: none; margin-top: 0; }
.ckw-group-title { display: block; font-weight: 600; margin: 0 0 2px 0; overflow-wrap: anywhere; }
.ckw-group > .ckp-progress { margin: 0 0 2px 0; }
.ckw-owner { margin: 0 0 2px 0; color: var(--text-2); font-size: var(--fs-1); }
.ckw-done-with { margin: 4px 0 0 calc(1.15rem + 8px); font-size: var(--fs-1); color: var(--st-done); display: flex; flex-wrap: wrap; gap: 0 6px; }
.ckw-moved-why { display: block; margin: 4px 0 0 0; }
p.ckw-refusal { margin: 4px 0 0 0; overflow-wrap: anywhere; }
.ckw-empty { color: var(--text-2); margin: var(--pad) 0; }
.ckw-all { display: inline-block; margin-top: var(--pad); font-weight: 600; }
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
/* NO VEIL ON A PHONE. The window stays open while the reader works on the page behind it, as the chat does, so that
   page is not drawn as covered: what the panel leaves showing still takes a press. */
@media (max-width: 480px) {
  .ckw-press { min-height: 44px; min-width: 44px; }
  .ckw-view { min-height: 44px; }
  /* A ROW WITHOUT A BOX KEEPS THE ROOM A BOX TAKES HERE, so its words and facts start where those beside a box start. */
  .ckw-items .ckp-item:not([data-box='yes']) .ckp-summary > .ckp-mark { margin-left: calc((44px - 1.15rem) / 2); margin-right: calc((44px - 1.15rem) / 2); }
  .ckw-items .ckp-item:not([data-box='yes']) :is(.ckp-details, .ckp-asks, .ckp-flow) { padding-left: calc(44px + 8px); }
}
`
