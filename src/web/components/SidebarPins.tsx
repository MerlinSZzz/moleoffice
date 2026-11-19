// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useState } from 'react'
import { t } from '@shared/i18n.ts'
import { errorMessage, faultOf } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { keepSidebarPins, useSidebarPins } from '../lib/sidebar-pins.ts'
import { DESTINATIONS, Icon, isAProjectPage, PinsNotRead } from './Sidebar.tsx'
import { Btn, ErrorNote } from './ui.tsx'

/**
 * THE PRESSES THAT PIN, UNPIN AND MOVE THE PAGES IN FRONT OF THE SIDEBAR, on All pages and on the arrangement page. Each
 * press keeps the whole new list at once through PUT /api/sidebar-pins and needs no reason. While one is kept the others
 * wait. A refusal is drawn under the presses by `PinsFault`, and the pages in front stay as they were.
 */
export interface PinWrites { busy: boolean; fault: unknown; keep: (pins: readonly string[]) => Promise<void> }
export function usePinWrites(): PinWrites {
  const [busy, setBusy] = useState(false), [fault, setFault] = useState<unknown>(null)
  const keep = async (pins: readonly string[]): Promise<void> => {
    setBusy(true); setFault(null)
    try { await keepSidebarPins(pins) }
    catch (error) { setFault(error) }
    finally { setBusy(false) }
  }
  return { busy, fault, keep }
}

export function PinsFault({ writes }: { writes: PinWrites }) {
  return writes.fault === null ? null : <ErrorNote message={errorMessage(writes.fault)} fault={faultOf(writes.fault)} />
}

const nameOf = (key: string): string => DESTINATIONS.find((one) => one.key === key)?.label ?? key

/**
 * Pins a page last in front, or unpins it: drawn as a pin on All pages, and in words on the arrangement page. A page of
 * the project is pinned last under the project, in the project block, and its press says so.
 */
export function PinPress({ page, writes, icon = false }: { page: string; writes: PinWrites; icon?: boolean }) {
  const { pins } = useSidebarPins()
  const pinned = pins.includes(page)
  const words = isAProjectPage(page)
    ? t(pinned ? 'pins.unpinProjectPage' : 'pins.pinProjectPage', { page: nameOf(page) })
    : t(pinned ? 'pins.unpinPage' : 'pins.pinPage', { page: nameOf(page) })
  return (
    <Btn variant="ghost" size="sm" {...(icon ? { title: words } : {})} disabled={writes.busy} reason={writes.busy ? t('pins.busy') : undefined}
      onClick={() => writes.keep(pinned ? pins.filter((one) => one !== page) : [...pins, page])}>
      {icon ? <Icon name={pinned ? 'unpin' : 'pin'} /> : <span aria-hidden="true">{t(pinned ? 'pins.unpin' : 'pins.pin')}</span>}
      <span className="sr-only">{words}</span>
    </Btn>
  )
}

/** The pins with two of them changed places. */
function swapped(pins: readonly string[], one: string, other: string): string[] {
  return pins.map((key) => key === one ? other : key === other ? one : key)
}

/**
 * THE PERSON'S PINNED PAGES, at the top of the arrangement page, in its reading and in its edit view, in two parts: the
 * pages in front, and the pages of the project, which stand under the project's name in the project block. Each part
 * lists its pages in their order, each with up, down and unpin, and up and down move a page within its own part. They
 * are the person's own and not the office's arrangement, so they are kept at once and need no preview or reason.
 */
export function PinnedPagesPart({ writes }: { writes: PinWrites }) {
  useLanguage()
  const reading = useSidebarPins()
  const { pins } = reading
  const inFront = pins.filter((key) => !isAProjectPage(key))
  const underTheProject = pins.filter(isAProjectPage)
  // NO HEADING OVER NOTHING. When the office has answered and the person pinned no page of the project, the
  // project's part is not drawn at all: a heading and an empty list would say only that nothing is there. While the
  // pins are loading, when their read failed, or when a kept list cannot be read, the part is drawn as it was,
  // because the page does not know yet whether the person pinned a page of the project.
  const pinsAnswered = reading.kept === 'kept' || reading.kept === 'nothing-kept'
  return (
    <section className="sa-pins" data-sidebar-pins="" aria-labelledby="sa-pins-title">
      <style href="mole-office-sidebar-pins" precedence="default">{PINS_CSS}</style>
      <div data-pins-part="front">
        <h3 id="sa-pins-title">{t('pins.title')}</h3>
        <PinsNotRead reading={reading} />
        {inFront.length === 0 ? null : <PinnedList pins={pins} part={inFront} first="pins.first" last="pins.last" writes={writes} />}
      </div>
      {pinsAnswered && underTheProject.length === 0 ? null : (
        <div data-pins-part="project">
          <h3 id="sa-pins-project-title">{t('pins.projectTitle')}</h3>
          {underTheProject.length === 0 ? null : (
            <PinnedList pins={pins} part={underTheProject} first="pins.firstUnderProject" last="pins.lastUnderProject" writes={writes} />
          )}
        </div>
      )}
      <PinsFault writes={writes} />
    </section>
  )
}

/** One part's pinned pages, each with up, down and unpin. Up and down change places with the page beside it in the part. */
function PinnedList({ pins, part, first, last, writes }: {
  pins: readonly string[]
  part: readonly string[]
  first: 'pins.first' | 'pins.firstUnderProject'
  last: 'pins.last' | 'pins.lastUnderProject'
  writes: PinWrites
}) {
  return (
    <ol>{part.map((key, index) => (
      <li key={key} data-pinned-page={key}>
        <span className="sa-page">{nameOf(key)}</span>
        <div className="sa-controls">
          <Btn size="sm" disabled={writes.busy || index === 0} reason={writes.busy ? t('pins.busy') : index === 0 ? t(first) : undefined} onClick={() => writes.keep(swapped(pins, key, part[index - 1]!))}>
            <span aria-hidden="true">{t('sidebarSetting.up')}</span><span className="sr-only">{t('pins.upPage', { page: nameOf(key) })}</span>
          </Btn>
          <Btn size="sm" disabled={writes.busy || index === part.length - 1} reason={writes.busy ? t('pins.busy') : index === part.length - 1 ? t(last) : undefined} onClick={() => writes.keep(swapped(pins, key, part[index + 1]!))}>
            <span aria-hidden="true">{t('sidebarSetting.down')}</span><span className="sr-only">{t('pins.downPage', { page: nameOf(key) })}</span>
          </Btn>
          <PinPress page={key} writes={writes} />
        </div>
      </li>
    ))}</ol>
  )
}

/**
 * THE PART IS SET APART FROM THE OFFICE'S ARRANGEMENT under it by a rule, and each pinned page stands on one line with
 * its presses. The name has a column of one width in every line of both parts, so up, down and unpin each stand in one
 * column however long the names are; a name longer than its column breaks onto a second line. On a narrow screen the
 * name stands on its own line and its three presses in one row under it, so no press is pushed onto the next line.
 */
const PINS_CSS = `
.sa-pins { border-bottom:1px solid var(--border-strong); padding-bottom:.75rem; margin-bottom:1rem; }
.sa-pins > [data-pins-part="project"] { margin-top:.75rem; }
.sa-pins li { display:grid; grid-template-columns:minmax(0, 12rem) auto; justify-content:start; align-items:center; gap:.4rem 1rem; }
.sa-pins li > .sa-page { margin:0; overflow-wrap:anywhere; }
@media (max-width: 480px) { .sa-pins li { grid-template-columns:minmax(0, 1fr); } }
`
