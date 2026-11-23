// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { familyWord } from '@shared/words.ts'
import { t } from '@shared/i18n.ts'
/**
 * ONE FETCH, ONE CLOCK, ONE DISPATCH — the shell every semantic-family page hangs off.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE LOADING IS HERE AND NOT IN THE SIX PAGES
 * ---------------------------------------------------------------------------------------
 * Each family page asks for its own family by name (`?family=`), so a kind moved between families moves pages with it
 * and nothing here changes. It asked for every live record of the project and kept its own: on the live office that
 * was 142 MB a load, and the Work page, which reads `GET /api/work`, used none of it (round 15). `readFor` below says
 * what each page reads.
 *
 * Doing that once, here, is what stops six pages growing six slightly different opinions about what
 * "loading", "failed" and "empty" look like — and it is what makes the EXTRA request
 * conditional rather than unconditional: only Modules and pipelines and Modules need the link
 * graph. The Reports page reads every project through its own door; see `FamilyPage` below.
 *
 * ---------------------------------------------------------------------------------------
 * A FAILED REQUEST IS NEVER AN EMPTY PROJECT
 * ---------------------------------------------------------------------------------------
 * Every branch below tells the three apart: nobody has looked yet, Mole Office looked and could not
 * read, and Mole Office looked and there is nothing there. The third is the only one that gets an empty
 * state, and it says which family is empty rather than claiming the project is — that was a real
 * defect on `#/ideas`, which printed "Mole Office is empty" in a project holding 151 records.
 */

import { useState } from 'react'
import { familyOf, KIND_FAMILIES, type KindFamily } from '@shared/work.ts'
import { api, type RecordListItem } from '../../api.ts'
import type { LinkAnswered, LinkOnTheWire } from '@shared/link-shapes.ts'
import { FAMILY_CSS } from '../../components/family/parts.tsx'
import { ErrorNote, Loading, surfaceEmphasis } from '../../components/ui.tsx'
import { useProjectAsync } from '../../lib/project-async.ts'
import { FindingsPage } from './FindingsPage.tsx'
import { IdeasPage } from './IdeasPage.tsx'
import { NotesPage } from './NotesPage.tsx'
import { ModulesPage } from './ModulesPage.tsx'
import { FAMILY_ROWS_CSS } from './rows.tsx'
import { StructurePage, STRUCTURE_CSS } from './StructurePage.tsx'
import { WorkPage, WORK_CSS } from './WorkPage.tsx'

/**
 * Which families need the link graph, declared as data.
 *
 * A SET RATHER THAN AN `if` IN THE LOADER, because "does this page need the links" is a fact about
 * the page and belongs beside the pages. A family added here without a page would fetch 200 links
 * for nothing; a page that needs them and is not here would silently count zero problems against
 * every module, which is the failure mode that looks like good news.
 */
const NEEDS_LINKS: ReadonlySet<FamilySurface> = new Set(['structure', 'modules'])

/**
 * THE FAMILIES THAT HAVE A PAGE OF THEIR OWN — five of the six, and `decisions` is the missing one.
 *
 * ---------------------------------------------------------------------------------------
 * IT WAS NOT LOST BY ACCIDENT. `#/decisions` IS ONE PLACE, AND IT IS THE CROSS-PROJECT PAGE
 * ---------------------------------------------------------------------------------------
 *
 * The address `#/decisions` was claimed twice: by `src/web/pages/DecisionsPage.tsx`, which lists
 * every decision in every project, and by a family page here, which listed one project's. The
 * router checks FLAT_ROUTES before family keys, so the family page was already unreachable — it was
 * imported, dispatched to and never drawn.
 *
 * It is settled in favour of the cross-project page, and the reason is what a person is doing when
 * they look for a decision. They are not asking "what did this project decide", they are asking
 * "what did I decide". Decisions are the one thing in Mole Office that a person, not a project, owns:
 * settling one is refused to every agent except the secretary carrying the person's authorization, and a
 * choice waiting on somebody does not stop waiting
 * because they are reading a different project today. So there is one Decisions page and the family
 * page is deleted rather than kept as a second list under one name.
 *
 * THE `decisions` FAMILY ITSELF STAYS in KIND_FAMILIES. It is what files a `proposal` and a
 * `decision` under one heading on the facet bar of Everything, it is where the rail row reads its
 * label from, and it is what makes `familyOf` answer for every kind that HAS a family. It is not
 * total, and that is deliberate: `message` has no family since criterion E1 and is read on
 * `#/messages`, while a family with no page is a different and lesser thing than a kind with no
 * family at all.
 */
export type FamilySurface = Exclude<KindFamily, 'decisions'> | 'modules'

/** True when this family has a page here. `decisions` does not, and the note above says why. */
export function hasFamilyPage(family: KindFamily): family is Exclude<KindFamily, 'decisions'> {
  return family !== 'decisions'
}

/**
 * The stylesheet for all six pages, hoisted once.
 *
 * React 19 de-duplicates `<style href>` by href, so this is one element however often a page
 * renders and however many family pages a session visits. The per-page sheets are appended rather
 * than injected separately: they are twenty lines each and a separate `<style>` per page would be
 * more elements for no gain.
 *
 * ORDER IS LOAD-BEARING. `FAMILY_ROWS_CSS` corrects rules `FAMILY_CSS` sets — the page heading and
 * the fold's indentation — so it comes second and its rules carry a second class to out-weigh
 * rather than tie. Anything that ties loses on file order, silently, which this project has
 * measured twice.
 *
 * The Shelved page (src/web/pages/ShelvedPage.tsx) hoists this same sheet under the same href, so
 * its head is the family head, drawn by the same rules.
 */
export const FAMILY_SHEET = `${FAMILY_CSS}\n${FAMILY_ROWS_CSS}\n${STRUCTURE_CSS}\n${WORK_CSS}`

/**
 * THE REPORTS PAGE IS NOT ONE PROJECT'S FAMILY, SO IT DOES NOT READ ONE PROJECT'S RECORDS.
 *
 * `#/notes` lists the reports and notes of every project and reads its own door, so it is drawn
 * before the project read below and never waits for it. Every other family page reads the project.
 */
export function FamilyPage({ surface }: { surface: FamilySurface }) {
  if (surface === 'work') {
    return (
      <div className="fam" {...surfaceEmphasis('analytical')}>
        <style href="mole-office-family" precedence="default">
          {FAMILY_SHEET}
        </style>
        <WorkPage onFiled={() => {}} />
      </div>
    )
  }
  if (surface === 'notes') {
    return (
      <div className="fam" {...surfaceEmphasis('analytical')}>
        <style href="mole-office-family" precedence="default">
          {FAMILY_SHEET}
        </style>
        <NotesPage onFiled={() => {}} />
      </div>
    )
  }
  return <ProjectFamilyPage surface={surface} />
}

/** The surfaces that read records of this project here. Work and the Reports page read their own doors. */
export type ProjectSurface = Exclude<FamilySurface, 'notes' | 'work'>

/**
 * WHAT EACH PAGE READS, AND NOTHING ELSE. Findings and Ideas draw their family. Structure draws its family and counts
 * the problems linked to each module; Modules draws the modules and the same count. The count reads only a problem's
 * state, so the problems come in the light shape.
 */
export function readFor(surface: ProjectSurface): Promise<RecordListItem[]> {
  const problems = () => api.recordsOf({ kind: 'problem', shape: 'light' }).then((r) => r.records)
  switch (surface) {
    case 'findings':
    case 'ideas':
      return api.recordsOf({ family: surface }).then((r) => r.records)
    case 'structure':
      return Promise.all([api.recordsOf({ family: 'structure' }).then((r) => r.records), problems()]).then((both) => both.flat())
    case 'modules':
      return Promise.all([api.recordsOf({ kind: 'module' }).then((r) => r.records), problems()]).then((both) => both.flat())
  }
}

function ProjectFamilyPage({ surface }: { surface: ProjectSurface }) {
  const [reloads, setReloads] = useState(0)
  const reload = () => setReloads((n) => n + 1)

  const [state] = useProjectAsync(
    () => Promise.all([
      readFor(surface),
      NEEDS_LINKS.has(surface)
        ? api.listLinks({ betweenKind: ['module', 'problem'], shape: 'ends' })
        : Promise.resolve([]),
    ]),
    [surface, reloads],
  )

  return (
    <div className="fam" {...surfaceEmphasis('analytical')}>
      <style href="mole-office-family" precedence="default">
        {FAMILY_SHEET}
      </style>

      {state.status === 'loading' ? <Loading label={label(surface)} rows={6} /> : null}

      {state.status === 'error' ? (
        <ErrorNote message={state.message} fault={state.fault} retry={reload} />
      ) : null}

      {state.status === 'ready'
        ? (() => {
            const [all, links] = state.value
            if (surface === 'modules') {
              return <ModulesPage records={all} links={links} onFiled={reload} />
            }
            const mine = all.filter((r: RecordListItem) => familyOf(r.kind) === surface)
            return (
              <Body
                surface={surface}
                mine={mine}
                all={all}
                links={links}
                onFiled={reload}
              />
            )
          })()
        : null}
    </div>
  )
}

function Body({
  surface,
  mine,
  all,
  links,
  onFiled,
}: {
  /** `decisions`, `notes` and `work` are not here: see the notes on `FamilySurface` and `FamilyPage` above. */
  surface: Exclude<KindFamily, 'decisions' | 'notes' | 'work'>
  /** The records of THIS family. */
  mine: RecordListItem[]
  /** What the page read: for Structure, its family and the problems, which the module counts join to. */
  all: RecordListItem[]
  links: LinkAnswered<LinkOnTheWire, 'ends'>[]
  onFiled: () => void
}) {
  switch (surface) {
    case 'structure':
      // `all`, NOT `mine`: a module's open-problem count is a join to PROBLEMS, which are not in this family.
      return <StructurePage records={all} links={links} onFiled={onFiled} />
    case 'findings':
      return <FindingsPage records={mine} onFiled={onFiled} />
    case 'ideas':
      return <IdeasPage records={mine} onFiled={onFiled} />
  }
}

/** What the skeleton says it is waiting for. The family's own label, so it is never written twice. */
function label(surface: FamilySurface): string {
  return surface === 'modules' ? t('g7a.modules.title') : familyWord(surface).text
}
