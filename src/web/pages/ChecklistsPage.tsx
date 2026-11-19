// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useEffect, useState } from 'react'
import { t } from '@shared/i18n.ts'
import { EVERY_PROJECT, type ProjectChoice } from '@shared/across-projects.ts'
import { isClosed, type ChecklistReading, type ChecklistRequest } from '@shared/checklists.ts'
import { api, type ChecklistsAcrossReply } from '../api.ts'
import { ProjectChoiceControl, ProjectName, useProjectChoice, useProjectTitles } from '../components/ProjectChoice.tsx'
import { Btn, ErrorNote, Loading, useAsync, type AsyncState } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { checklistsPath, RouteLink } from '../components/router.tsx'
import { declaredAttributes } from '../components/declares.ts'
import {
  CHECKLIST_PARTS_CSS,
  aRefusedPress,
  aSpecialChecklistItem,
  theChecklistsWindowSwitch,
  countsWords,
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
  stepsWaitingOnTheOwner,
  switchTheChecklistsWindow,
  theseMoved,
  useMovedRows,
  whatTheRowDraws,
  withOpened,
  type DrawnLine,
  type RefusedPress,
} from '../components/ChecklistParts.tsx'
/**
 * `#/checklists` — everybody's checklists, a person's and every agent's, in one project or every project;
 * `#/checklists/<id>` is the same page with one checklist opened.
 *
 * LOOK B, by point 1 of a decision: a table grouped by project or by owner, with a switch between
 * the two and counts at the head of each group. A checklist opens beside the
 * table on a wide screen. The page has no section of the reader's own checklists or of what waits on
 * them, because the window at the top right shows those; the page also holds the switch that hides
 * that window.
 *
 * It is filtered by whose checklist it is and by project. Every word about a checklist is the door's
 * own reading: the counts and the owner's name. The order, what is not finished first and what is finished folded
 * under it, is the one the window draws too, from ChecklistParts.tsx.
 */

type Whose = 'everyone' | 'mine' | (string & {})

/**
 * THE READER'S FILTERS OUTLIVE OPENING A CHECKLIST. Opening one is a new address, and the page is drawn
 * again for it; without this the list beside it went back to the project on screen and to
 * everybody's checklists. Kept for this tab only.
 */
const kept: { choice: ProjectChoice | null; whose: Whose; groupBy: 'owner' | 'project' } = { choice: null, whose: 'everyone', groupBy: 'project' }

export function ChecklistsPage({ id }: { id?: string }) {
  const [onScreen, setOnScreen] = useProjectChoice()
  const choice = kept.choice ?? onScreen
  const setChoice = (one: ProjectChoice): void => {
    kept.choice = one
    setOnScreen(one)
  }
  const titles = useProjectTitles()
  const [whose, setWhoseHere] = useState<Whose>(kept.whose)
  const [groupBy, setGroupByHere] = useState<'owner' | 'project'>(kept.groupBy)
  const setWhose = (one: Whose): void => {
    kept.whose = one
    setWhoseHere(one)
  }
  const setGroupBy = (one: 'owner' | 'project'): void => {
    kept.groupBy = one
    setGroupByHere(one)
  }
  const [everyone, reload] = useProjectAsync(() => api.listChecklistsAcross(choice, 'everyone'), [choice], { follows: { kinds: ['checklist'], atMostEveryMs: 5000 } })
  // THE READER'S OWN, AS THE DOOR READS THEM: which checklists are "yours" is the door's answer, not a
  // second guess at who is reading. Read in every project, because the opened checklist may be in a project the list
  // is not showing, and its presses are drawn from this; the list keeps only those it shows.
  const [mine] = useAsync(() => api.listChecklistsAcross(EVERY_PROJECT), [], { follows: { kinds: ['checklist'], atMostEveryMs: 5000 } })
  const [opened, reloadOpened] = useProjectAsync(() => (id === undefined ? Promise.resolve(null) : api.readChecklistAcross(id)), [id], { follows: id === undefined ? undefined : { records: [id] } })

  const controls = (
    <div className="ckl-controls">
      <span className="ckl-switch" role="group" aria-label={t('checklists.groupBy')}>
        <span className="ckl-switch-label">{t('checklists.groupBy')}</span>
        {(['project', 'owner'] as const).map((one) => (
          <button key={one} type="button" className="ckl-switch-one" aria-pressed={groupBy === one} onClick={() => setGroupBy(one)}>
            {t(one === 'owner' ? 'checklists.groupBy.owner' : 'checklists.groupBy.project')}
          </button>
        ))}
      </span>
      <WhoseChoice whose={whose} onChoose={setWhose} everyone={everyone} />
      <ProjectChoiceControl choice={choice} onChoose={setChoice} titles={titles} />
      <WindowSwitch />
    </div>
  )

  const list =
    everyone.status === 'loading' || mine.status === 'loading' ? (
      <Loading what={t('checklists.loading')} />
    ) : everyone.status === 'error' ? (
      <ErrorNote message={everyone.message} fault={everyone.fault} retry={reload} />
    ) : mine.status === 'error' ? (
      <ErrorNote message={mine.message} fault={mine.fault} retry={reload} />
    ) : (
      <TheList
        groupBy={groupBy}
        reading={everyone.value}
        mineIds={new Set(mine.value.checklists.map((one) => one.id))}
        whose={whose}
        titles={titles}
        openedId={id}
      />
    )

  const one =
    opened.status === 'loading' ? (
      <Loading what={t('checklists.loadingOne')} />
    ) : opened.status === 'error' ? (
      <ErrorNote message={opened.message} fault={opened.fault} />
    ) : opened.value === null ? null : (
      <OneChecklist
        list={opened.value.checklist}
        titles={titles}
        yours={mine.status === 'ready' && mine.value.checklists.some((one) => one.id === id)}
        onChanged={() => {
          reloadOpened()
          reload()
        }}
      />
    )

  return (
    <div className="page ckl" data-opened={id === undefined ? 'no' : 'yes'}>
      <style href="mole-office-checklist-parts" precedence="default">{CHECKLIST_PARTS_CSS}</style>
      <style href="mole-office-checklists-page" precedence="default">{CHECKLISTS_PAGE_CSS}</style>
      <h1 className="ckl-title" data-title-is="its-label">{t('checklists.title')}</h1>
      {controls}
      {id !== undefined ? (
        <div className="ckl-split">
          <div className="ckl-split-list">{list}</div>
          <div className="ckl-split-one">{one}</div>
        </div>
      ) : (
        list
      )}
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

/** Whose checklists: everyone's, the reader's own, or one owner's, named from the checklists read. */
function WhoseChoice({ whose, onChoose, everyone }: { whose: Whose; onChoose: (whose: Whose) => void; everyone: AsyncState<ChecklistsAcrossReply> }) {
  const owners = new Map<string, string>()
  if (everyone.status === 'ready') for (const list of everyone.value.checklists) owners.set(ownerKey(list), ownerWords(list))
  return (
    <label className="ckl-whose">
      <span className="ckl-whose-label">{t('checklists.whose')}</span>
      <select className="px-input ckl-select" value={whose} onChange={(event) => onChoose(event.target.value)}>
        <option value="everyone">{t('checklists.whose.everyone')}</option>
        <option value="mine">{t('checklists.whose.mine')}</option>
        {[...owners].map(([key, words]) => (
          <option key={key} value={key}>{words}</option>
        ))}
      </select>
    </label>
  )
}

function TheList({
  groupBy,
  reading,
  mineIds,
  whose,
  titles,
  openedId,
}: {
  groupBy: 'owner' | 'project'
  reading: ChecklistsAcrossReply
  mineIds: ReadonlySet<string>
  whose: Whose
  titles: ReadonlyMap<string, string>
  openedId: string | undefined
}) {
  const shown = reading.checklists.filter((list) =>
    whose === 'everyone' ? true : whose === 'mine' ? mineIds.has(list.id) : ownerKey(list) === whose,
  )
  if (shown.length === 0) return <p className="ckl-says">{t('checklists.none')}</p>
  return <TheTable shown={shown} groupBy={groupBy} titles={titles} openedId={openedId} />
}

// ============================================================================ the table

function TheTable({ shown, groupBy, titles, openedId }: { shown: ChecklistReading[]; groupBy: 'owner' | 'project'; titles: ReadonlyMap<string, string>; openedId: string | undefined }) {
  const groups = new Map<string, ChecklistReading[]>()
  for (const list of shown) {
    const key = groupBy === 'project' ? list.workspaceId : ownerKey(list)
    groups.set(key, [...(groups.get(key) ?? []), list])
  }
  return (
    <div className="ckb" {...declaredAttributes({ surface: 'checklists.list' })}>
      {[...groups].map(([key, lists]) => {
        const open = lists.reduce((sum, list) => sum + list.counts.open, 0)
        const waiting = stepsWaitingOnTheOwner(lists)
        return (
          <section key={key} className="ckb-group">
            <h2 className="ckb-head">
              <span className="ckb-head-name" data-holds-a-name="">
                {groupBy === 'project' ? (titles.get(key) ?? key) : ownerWords(lists[0]!)}
              </span>
              <span className="ckb-head-counts">{t('checklists.groupCounts', {
                  lists: lists.length === 1 ? t('checklists.listsOne') : t('checklists.lists', { n: lists.length }),
                  counts: waiting === 0 ? t('checklists.countsNoneWaiting', { open }) : t('checklists.counts', { open, waiting }),
                })}</span>
            </h2>
            <ul className="ckb-rows">
              {lists.map((list) => (
                <li key={list.id} data-current={list.id === openedId ? 'yes' : 'no'}>
                  <RouteLink className="ckb-row" to={checklistsPath(list.id)}>
                    <span className="ckb-row-title">{list.title}</span>
                    <span className="ckb-row-who">
                      {groupBy === 'project' ? ownerWords(list) : <ProjectName id={list.workspaceId} titles={titles} />}
                    </span>
                    <Progress list={list} />
                    <span className="ckb-row-waiting" data-waiting={list.counts.waitingOnTheOwner > 0 ? 'yes' : 'no'}>
                      {list.counts.waitingOnTheOwner > 0 ? t('checklists.state.waiting') + ` (${String(list.counts.waitingOnTheOwner)})` : ''}
                    </span>
                  </RouteLink>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

// ============================================================================ one checklist

/** A press on an item that the door refused, and whether that press asked for a standing item or an ordinary one. */
type PageRefusal = RefusedPress & { standing: boolean }

function OneChecklist({
  list,
  titles,
  yours,
  onChanged,
}: {
  list: ChecklistReading
  titles: ReadonlyMap<string, string>
  /** Whether the door reads this checklist as the reader's own. Only then are its items given presses. */
  yours: boolean
  onChanged: () => void
}) {
  // WHAT IS NOT FINISHED FIRST, and what is finished folded under it until the reader opens the fold.
  const items = inOrder(list.items)
  const unfinished = items.filter((item) => !isClosed(item.state))
  const folded = items.filter((item) => isClosed(item.state))
  const [isOpen, setIsOpen] = useState(false)
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
  const row = (item: ChecklistRequest): DrawnLine => {
    const key = `${list.id}/${item.id}`
    const open = opened.has(key)
    return { key, draws: JSON.stringify([whatTheRowDraws(item, list, open), open ? [pressed(item), said(item)] : null, canMark(item), boxSaid(item)]) }
  }
  // WHAT THE OPENED CHECKLIST DRAWS FROM WHAT THE PAGE READ, line by line, top to bottom. The rows that moved when the page
  // reads again are worked out from this alone (wave 13j round loop-9).
  const drawn: DrawnLine[] = [
    { key: `${list.id}:heading`, draws: JSON.stringify([list.title, ownerWords(list), project, progressOf(list), countsWords(list)]) },
    ...unfinished.map(row),
    ...(folded.length === 0 ? [] : [{ key: `${list.id}:fold`, draws: JSON.stringify([folded.length, folded.some((item) => item.state === 'superseded'), isOpen]) }]),
    ...(isOpen ? folded.map(row) : []),
  ]
  const moved = useMovedRows(drawn, [list, yours, project], list.id, (rows) => {
    setRefusals((now) => theseMoved(now, rows))
    setBoxRefusals((now) => theseMoved(now, rows))
  })
  const drawItem = (item: ChecklistRequest) => {
    const key = `${list.id}/${item.id}`
    return (
      <PageItem
        key={item.id}
        item={item}
        list={list}
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
    <section className="ck1" {...declaredAttributes({ surface: 'checklists.open' })}>
      {/* THE WAY BACK IS SHOWN ONLY WHERE THE LIST IS NOT BESIDE IT, on a narrow screen. */}
      <RouteLink className="ck1-back" to={checklistsPath()}>
        ← {t('checklists.back')}
      </RouteLink>
      <h2 className="ck1-title" data-title-is="its-label">{list.title}</h2>
      <p className="ck1-where">
        {ownerWords(list)} · <ProjectName id={list.workspaceId} titles={titles} />
      </p>
      <p className="ck1-progress">
        <Progress list={list} />
        <span className="ck1-counts" data-waiting={list.counts.waitingOnTheOwner > 0 ? 'yes' : 'no'}>
          {countsWords(list)}
        </span>
      </p>
      <ul className="ck1-items">{unfinished.map(drawItem)}</ul>
      {folded.length === 0 ? null : (
        <>
          <FoldPress folded={folded} open={isOpen} onPress={() => setIsOpen((now) => !now)} />
          {isOpen ? <ul className="ck1-items ckp-folded">{folded.map(drawItem)}</ul> : null}
        </>
      )}
    </section>
  )
}

/**
 * ONE ITEM ON THE CHECKLIST'S PAGE. On the reader's own checklist an open item has a left box: plain items tick
 * directly, and items of the evidence-or-words style open the picker under the row, which wave 14a brought on a
 * message. A standing item has no box. An open item also has a press under its facts, when it is
 * opened, that makes it standing, and a standing one has a press that makes it ordinary again (wave 13j round loop-6).
 * Only an open item: a standing item stays open or replaced only, and the door refuses `standing` on any other state. A
 * press the door refuses says why beside it, in the page's language where the door gave a code (round loop-8). Refused
 * because the checklist changed after the page read it, the page reads it again, and the words stay when the press has
 * gone. The page keeps the refusal, because it draws its words. For a second after the item's row moved as the page
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
  /** Whether the item is opened, as the checklist keeps it. */
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
          <span className="ck1-standing">
            {pressed ? (
              <Btn size="sm" variant="secondary" pending={busy} disabled={moved} reason={t('w13j.checklistMoved.reason')} onClick={() => void press()}>
                {t(standing ? 'w13j.checklistStanding.unmake' : 'w13j.checklistStanding.make')}
              </Btn>
            ) : null}
            {said === null ? null : <span className="ck1-refusal">{said}</span>}
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
            <span className="ck1-refusal">{boxSaid}</span>
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
.ckl-whose { display: inline-flex; align-items: center; gap: var(--pad); flex-wrap: wrap; }
.ckl-whose-label, .ckl-switch-label { color: var(--text-2); }
.ckl-select { min-width: 12rem; max-width: 100%; }
.ckl-switch { display: inline-flex; align-items: center; gap: 0; }
.ckl-switch-label { margin-right: var(--pad); }
.ckl-switch-one {
  border: var(--border-w) solid var(--border-strong); background: var(--panel); color: var(--text);
  padding: 4px 12px; min-height: 2rem; cursor: pointer; font: inherit;
}
.ckl-switch-one:first-of-type { border-radius: var(--radius-sm) 0 0 var(--radius-sm); }
.ckl-switch-one:last-of-type { border-radius: 0 var(--radius-sm) var(--radius-sm) 0; border-left: none; }
.ckl-switch-one[aria-pressed='true'] { background: var(--accent); color: var(--accent-text); font-weight: 600; }
.ckl-window {
  display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; font: inherit; color: var(--text-2);
  background: var(--panel); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm); cursor: pointer;
}
/* A TICK BEFORE THE WORDS WHILE THE WINDOW IS SHOWN, so the press says its state without colour alone. */
.ckl-window::before { content: ''; width: 0.9rem; text-align: center; }
.ckl-window[aria-pressed='true']::before { content: '✓'; }
.ckl-window[aria-pressed='true'] { color: var(--text); border-color: var(--accent); }
.ckl-says { margin: 0 0 var(--gut) 0; color: var(--text-2); max-width: var(--measure-in-box); }

.ckb { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }
.ckb-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px var(--gut); margin: 0 0 6px 0; font-size: var(--fs-3); }
.ckb-head-counts { font-size: var(--fs-1); font-weight: 400; color: var(--text-2); }
.ckb-rows { list-style: none; margin: 0; padding: 0; border: var(--border-w) solid var(--border); border-radius: var(--radius); background: var(--panel); }
.ckb-rows > li + li { border-top: var(--border-w) solid var(--border); }
.ckb-row {
  display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr) auto minmax(0, 1.4fr); gap: 4px var(--gut);
  align-items: center; padding: 10px var(--gut); color: var(--text); text-decoration: none; min-width: 0;
}
.ckb-row:hover { background: var(--hover); }
.ckb-rows > li[data-current='yes'] .ckb-row { background: var(--accent-soft); box-shadow: inset 3px 0 0 var(--accent); }
.ckb-row-title { font-weight: 600; overflow-wrap: anywhere; }
.ckb-row-who { font-size: var(--fs-1); color: var(--text-2); min-width: 0; overflow-wrap: anywhere; }
.ckb-row-waiting { font-size: var(--fs-1); color: var(--ask); font-weight: 600; }
.ckl-split { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--gut); align-items: start; }
.ckl-split .ckb-row { grid-template-columns: minmax(0, 1fr) auto; }
.ckl-split .ckb-row-who, .ckl-split .ckb-row-waiting { grid-column: 1 / -1; }
.ckl-split-one { border: var(--border-w) solid var(--border); border-radius: var(--radius); background: var(--panel); padding: var(--gut); min-width: 0; }
/* BELOW 64rem THE OPENED CHECKLIST TAKES THE WIDTH and the list is reached by its way back; from 64rem the two stand side by side. */
.ckl-split-list { display: none; }
@media (min-width: 64rem) {
  .ckl-split { grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); }
  .ckl-split-list { display: block; }
  .ckl-split-one { position: sticky; top: var(--gut); }
  .ckl-split .ck1-back { display: none; }
}
@media (max-width: 40rem) {
  .ckl-whose { display: flex; width: 100%; }
  .ckl-select { flex: 1 1 auto; min-height: 44px; }
  .ckl-switch-one, .ckl-window { min-height: 44px; }
  .ckb-row { grid-template-columns: minmax(0, 1fr) auto; }
  .ckb-row-who, .ckb-row-waiting { grid-column: 1 / -1; }
  .ckb-row-waiting[data-waiting='no'] { display: none; }
}

.ck1-back { display: inline-block; margin: 0 0 var(--pad) 0; }
.ck1-title { margin: 0 0 4px 0; overflow-wrap: anywhere; }
.ck1-where { margin: 0 0 var(--pad) 0; color: var(--text-2); font-size: var(--fs-2); display: flex; flex-wrap: wrap; gap: 0 4px; }
.ck1-counts { font-size: var(--fs-1); color: var(--text-2); }
.ck1-counts[data-waiting='yes'] { color: var(--ask); font-weight: 600; }
.ck1-progress { display: flex; flex-wrap: wrap; gap: 4px var(--gut); align-items: center; margin: 0 0 var(--gut) 0; }
.ck1-items { list-style: none; margin: 0; padding: 0; max-width: 56rem; }
.ck1-items .ckp-item[data-state='waiting on the owner'] { background: var(--ask-bg); border-radius: var(--radius-sm); padding-left: 8px; padding-right: 8px; }
.ck1-standing { display: flex; flex-wrap: wrap; align-items: center; gap: 4px var(--gut); margin: 6px 0 2px 0; }
.ck1-refusal { color: var(--st-failed); font-size: var(--fs-1); overflow-wrap: anywhere; }
`
