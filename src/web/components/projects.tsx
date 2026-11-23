// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MOVING A RECORD INTO ANOTHER PROJECT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A PROJECT IS CALLED IS NO LONGER DECIDED HERE
 * ---------------------------------------------------------------------------------------
 *
 * `projectName` and `unassignedMeans` moved to src/web/lib/projects.ts and are re-exported below,
 * unchanged, so every caller that imports them from this file still works. THERE IS STILL EXACTLY
 * ONE OF EACH — this file declares none of them.
 *
 * `PLAIN_PROJECT_NAMES` was re-exported here too and is GONE, with the constant it named: the
 * browser no longer renames any project. `unassignedMeans` is the sentence that used to be called
 * `NOT_IN_A_PROJECT_MEANS`, after the label that name came from. It reads from the word lists now,
 * so it is a function called at render time rather than a constant fixed at import time — see
 * src/web/lib/projects.ts for why. See that file too for the decision behind both names.
 *
 * They moved because this file cannot be imported by a plain Node test: it imports src/web/api.ts,
 * which imports src/web/lib/workspace.ts, which reads `window.localStorage` while it is loading. So
 * `import { projectName }` from a test threw "ReferenceError: window is not defined" before a single
 * assertion ran, and src/web/lib/words.ts had written down that it wanted the function and could not
 * have it. The new file imports nothing that touches a browser, so anything may import it.
 *
 * ---------------------------------------------------------------------------------------
 * MOVING A RECORD
 * ---------------------------------------------------------------------------------------
 *
 * `POST /api/records/:id/workspace` has existed since the project boundary was built and no
 * button in the product called it, so nothing a person could press moved a record out of the
 * project it was filed in. `MoveToProject` is that press.
 *
 * IT ASKS BEFORE IT WRITES. Choosing a destination sends the same request with `dryRun: true`,
 * which writes nothing and answers with the whole consequence: how many records move, which ones,
 * and why each one has to come. That report is what is on the screen, whole, in the server's own
 * words — because the question a person actually has is "what else does this drag along", and the
 * only honest answer is the measured one.
 *
 * WHY THE WHOLE REPORT AND NOT A SUMMARY OF IT. The report can also say the move WOULD BE REFUSED
 * — a link that would still cross, a title already taken at the destination — and those sentences
 * are prose inside the note rather than fields on the reply. A browser that summarised the reply
 * by reading its fields would drop them, and the person would press a button that was already
 * known to fail. Nothing is parsed out of that text here, so nothing can be lost from it.
 *
 * THE MOVE IS THE SAME REQUEST WITHOUT `dryRun`, confirming the companions the check named. If the
 * server refuses anyway — something changed in between — its sentence is printed whole and nothing
 * is claimed.
 *
 * AFTER A MOVE, THE PROJECT ON SCREEN IS NOT SWITCHED FOR YOU. The record has left the project
 * this window is reading, so the rest of the page is a moment old and says so. The press that
 * follows the move reads the destination project, which rebuilds the whole interface — see
 * src/web/lib/workspace.ts for why that is what changing project does.
 */

import { useRef, useState } from 'react'
import { t, content } from '@shared/i18n.ts'
import type { PanelRecord } from '@shared/types.ts'
import type { WorkspaceReading } from '@shared/workspaces.ts'
// TYPE ONLY, and erased before this module runs — the same rule api.ts follows for
// `WorkspacesReply`. Imported rather than restated so the browser cannot hold a second idea of
// what the move route answers.
import type { MoveReport } from '../../server/lib/move.ts'
import { errorMessage, moleOfficeRequest } from '../api.ts'
import { projectName } from '../lib/projects.ts'
import { setWorkspace } from '../lib/workspace.ts'
import { InReachMark, reachBox, useReach } from './InReach.tsx'
import { Btn, Field, Panel, Select, ServerNote } from './ui.tsx'

// ============================================================================ what it is called

/**
 * The two project-naming names, passed straight through from src/web/lib/projects.ts.
 *
 * NOT COPIES. This is the same function and the same sentence, re-exported so that the callers that
 * already import them from here keep working. Nothing about a project's name is decided in this
 * file. See the head of this file for why they live in src/web/lib now.
 */
export { projectName, unassignedMeans } from '../lib/projects.ts'

// ============================================================================ moving one

/**
 * A sentence the SERVER wrote, quoted whole, under a caption saying what it is.
 *
 * THE CAPTION IS DOING REAL WORK. These sentences name records and projects by their stored ids —
 * "unassigned", "greenhouse", a nanoid — while the screen around them says "Unassigned" and
 * "Greenhouse", and a reader meeting both without warning has to work out that they are the same
 * thing. Captioned, the block reads as a quotation of what the server said rather than as the
 * product's own words for things.
 *
 * IT IS NOT SUMMARISED AND IT IS NOT HIDDEN IN NORMAL MODE, which is a deliberate exception to the
 * rule that stored ids belong behind the Inspect switch. This is the one text that says a move
 * WOULD BE REFUSED, and it says it in prose rather than in a field on the reply — so a browser that
 * shortened it for readability would be the one that let somebody press a button already known to
 * fail. Reported to the pass that owns the Normal-mode vocabulary.
 */
function Said({ cap, children }: { cap: string; children: string }) {
  // A QUOTED PASSAGE IS CAPPED AT 22rem AND SAID NOTHING WHEN IT RAN PAST IT. Words below the cap
  // were simply gone. The cap stays — a whole module description in a card is not a card — and the
  // bottom edge now carries the mark. See components/InReach.tsx.
  const reach = useReach(children)
  return (
    <>
      <p className="mv-cap">{cap}</p>
      <InReachMark reach={reach}>
        <p className="mv-said" {...reachBox(reach, 'Quoted words')}>
          {children}
        </p>
      </InReachMark>
    </>
  )
}

type Check =
  | { status: 'none' }
  | { status: 'checking' }
  | { status: 'ready'; report: MoveReport }
  | { status: 'refused'; message: string }

function movePath(recordId: string): string {
  return '/api/records/' + encodeURIComponent(recordId) + '/workspace'
}

/**
 * The body that ASKS what a move would do. It writes nothing.
 *
 * Its own function so that a test can send exactly what the button sends. The two bodies below are
 * the whole of what this component says to the server, and both of them have a rule in them that a
 * hand-written test would have to restate to check.
 */
export function checkRequest(to: string): { to: string; dryRun: true } {
  return { to, dryRun: true }
}

/**
 * The body that MAKES the move, built from the check's own answer.
 *
 * `also` REPEATS BACK EXACTLY THE COMPANIONS THE CHECK NAMED, and is left out entirely when there
 * are none. Both halves matter and both are refused when they are wrong: a move that needs
 * companions and does not name them is refused with the list, and `also: []` is refused as a
 * request built wrong rather than read as "no companions". Nothing here chooses which records move
 * — that is measured by the server from the stored relationships, and this only confirms it.
 */
export function moveRequest(report: MoveReport): { to: string; also?: readonly string[] } {
  return {
    to: report.to,
    ...(report.needsAlso.length === 0 ? {} : { also: report.needsAlso }),
  }
}

/**
 * WHAT THE SCREEN SAYS ONCE THE MOVE HAS HAPPENED.
 *
 * ITS OWN COMPONENT SO IT CAN BE TESTED WITH A REAL REPORT. This is the one screen in the flow that
 * makes a claim about something that already happened, so it is the one most able to say a thing
 * was done when it was not — and it is behind two presses, where a static render cannot reach it.
 * tests/project-move.test.ts makes a real move against a real server and draws this with the report
 * that came back.
 *
 * IT SAYS THE PAGE UNDER IT IS OLD, and that is the honest half. The record has left the project
 * this window is reading, so nothing on the rest of the page is refetched: refetching would ask
 * this project for a record that is no longer in it and get a 404 for a record that is perfectly
 * fine. Saying "the rest of this page is what was read a moment ago" is the fifth invariant applied
 * to a screen: the alternative is a page that looks current and is not.
 */
export function Moved({
  report,
  projects,
}: {
  report: MoveReport
  projects: readonly WorkspaceReading[]
}) {
  const nameOf = (id: string): string => projectName(id, projects.find((w) => w.id === id)?.title ?? null)
  const here = nameOf(report.from)
  const there = nameOf(report.to)
  return (
    <Panel declares={{ surface: null }} title={t('g2d.projects.movedTitle')}>
      <style href="mole-office-projects" precedence="default">
        {PROJECT_CSS}
      </style>
      <p className="mv-line">
        {t('g2d.projects.movedLine', { there: content(there), here: content(here) })}
      </p>
      <ServerNote text={report.note} />
      <ServerNote text={report.sessionNote} />
      <div className="mv-act">
        <Btn variant="primary" onClick={() => setWorkspace(report.to)}>
          {t('g2d.projects.readButton', { there: content(there) })}
        </Btn>
      </div>
    </Panel>
  )
}

/**
 * Move this record into another project.
 *
 * Rendered only where the rest of the record can be written to — see the top of RecordPage.tsx for
 * why a record you are reading has nothing on it to choose from.
 *
 * `projects` IS HANDED IN AND NOT FETCHED HERE. The page this sits on loads everything it draws in
 * one round of requests so that what is on screen is one consistent moment; a second reading of the
 * project list here would be a second moment, and the header line naming the project and this
 * panel's own list of them could then disagree.
 */
export function MoveToProject({
  record,
  projects,
}: {
  record: PanelRecord
  /** Every project this installation holds, as `GET /api/workspaces` answered. */
  projects: readonly WorkspaceReading[]
}) {
  const [to, setTo] = useState('')
  const [check, setCheck] = useState<Check>({ status: 'none' })
  const [moving, setMoving] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [moved, setMoved] = useState<MoveReport | null>(null)
  /** Which check is the current one, so a slow reply about a project you no longer want cannot land. */
  const asked = useRef(0)

  const here = projectName(record.workspaceId, projects.find((w) => w.id === record.workspaceId)?.title ?? null)
  const nameOf = (id: string): string => projectName(id, projects.find((w) => w.id === id)?.title ?? null)

  function choose(next: string) {
    setTo(next)
    setFailed(null)
    if (next === '') {
      asked.current += 1
      setCheck({ status: 'none' })
      return
    }
    asked.current += 1
    const mine = asked.current
    setCheck({ status: 'checking' })
    moleOfficeRequest<MoveReport>(movePath(record.id), {
      method: 'POST',
      body: JSON.stringify(checkRequest(next)),
    }).then(
      (report) => {
        if (asked.current === mine) setCheck({ status: 'ready', report })
      },
      (err: unknown) => {
        if (asked.current === mine) setCheck({ status: 'refused', message: errorMessage(err) })
      },
    )
  }

  async function move(report: MoveReport) {
    setMoving(true)
    setFailed(null)
    try {
      const done = await moleOfficeRequest<MoveReport>(movePath(record.id), {
        method: 'POST',
        body: JSON.stringify(moveRequest(report)),
      })
      setMoved(done)
    } catch (err) {
      setFailed(errorMessage(err))
    } finally {
      setMoving(false)
    }
  }

  if (moved !== null) return <Moved report={moved} projects={projects} />

  const others = projects.filter((w) => w.id !== record.workspaceId)
  const options = [
    { value: '', label: t('g2d.projects.chooseAProject') },
    ...others.map((w) => ({
      value: w.id,
      label: t('g2d.projects.optionRecords', { n: w.records, name: content(projectName(w.id, w.title)) }),
    })),
  ]

  return (
    <Panel declares={{ surface: null }} title={t('g2d.projects.thisProjectTitle')}>
      <style href="mole-office-projects" precedence="default">
        {PROJECT_CSS}
      </style>

      {/* THE TWO FACTS A PERSON NEEDS BEFORE PRESSING, and neither can be read off the controls.
          Where the record is now and that there is only one answer to that; and what happens to
          everything joined to it, which is the part people worry about and the part the check below
          answers with a measurement rather than a promise.

          THE SECOND CLAUSE DOES NOT REPEAT THE PROJECT'S NAME. It read "moving it takes it out of
          Not in a project", back when the browser drew the catch-all as that phrase, which is what
          a phrase does to a sentence built around a project's title. "this one" says the same thing
          and reads for every name. */}
      <p className="mv-line">{content(here)}</p>

      {others.length === 0 ? (
        <p className="mv-line mv-quiet">{t('moveToProject.noOtherProject')}</p>
      ) : (
        <Field label={t('g2d.projects.moveItToLabel')}>
          <Select value={to} onChange={choose} options={options} />
        </Field>
      )}

      {check.status === 'checking' ? (
        <p className="mv-line mv-quiet">{t('moveToProject.checking')}</p>
      ) : null}

      {check.status === 'refused' ? (
        <>
          <Said cap={t('g2d.projects.capWhyRefused')}>{check.message}</Said>
          <p className="mv-line mv-quiet">{t('g2d.projects.nothingWritten')}</p>
        </>
      ) : null}

      {check.status === 'ready' ? (
        <>
          <p className="mv-line mv-verdict">
            <strong>
              {check.report.moving.length === 1
                ? t('g2d.projects.movesAlone')
                : t('g2d.projects.othersMoveWithIt', { n: check.report.moving.length - 1 })}
            </strong>
          </p>
          {/* THE SERVER'S REPORT, WHOLE. It names every record that has to come and why, and it is
              also where a move that would be refused says so. Nothing is read out of it here, so
              nothing can be dropped from it. It scrolls rather than being cut, because a move can
              reach a hundred records and a page that grows to fit one is unreadable. */}
          {check.report.crossing.length === 0 ? null : <p className="mv-line mv-quiet">{t('moveToProject.wouldBeRefused')}</p>}
          <ServerNote text={check.report.note} />
          <ServerNote text={check.report.sessionNote} />
          <div className="mv-act">
            <Btn variant="primary" pending={moving} onClick={() => void move(check.report)}>
              {check.report.moving.length === 1
                ? t('g2d.projects.moveButtonOne', { name: content(nameOf(check.report.to)) })
                : t('g2d.projects.moveButtonMany', { n: check.report.moving.length, name: content(nameOf(check.report.to)) })}
            </Btn>
          </div>
        </>
      ) : null}

      {failed === null ? null : (
        <>
          <Said cap={t('g2d.projects.capWhyRefused')}>{failed}</Said>
          <p className="mv-line mv-quiet">{t('g2d.projects.nothingMoved')}</p>
        </>
      )}
    </Panel>
  )
}

// ============================================================================ styles

/**
 * This component's own rules. styles.css belongs to another agent, and React 19 hoists a
 * style element with an href into the head and de-duplicates by that href, so mounting this
 * twice costs one sheet. Every value is a token.
 *
 * The server's own sentences keep their line breaks and scroll inside their box: a move report can
 * run to a hundred lines, and a page that stretched to hold one would push the button off screen.
 */
const PROJECT_CSS = `
.mv-line { font-size: var(--fs-3); line-height: var(--lh-body); margin: 0 0 var(--pad) 0; max-width: 68ch; }
.mv-quiet { color: var(--text-3); }
/* The one-line answer sits under the chooser, so it needs air above it as well as below. */
.mv-verdict { margin-top: var(--pad); }
/* Capitals mark chrome and never content — docs/UX-CONTRACT.md. This caption is furniture: it
   says what the block under it is, and the block is the thing you came to read. */
.mv-cap {
  font-size: var(--fs-1);
  letter-spacing: 0.04em;
  color: var(--text-3);
  margin: 0 0 4px 0;
}
.mv-said {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  margin: 0 0 var(--pad) 0;
  padding: var(--pad);
  border-left: 3px solid var(--border-strong);
  background: var(--panel-2);
  color: var(--text-2);
  max-width: 84ch;
  max-height: 22rem;
  overflow: auto;
}
.mv-act { display: flex; flex-wrap: wrap; gap: var(--pad); margin-top: var(--pad); }
`
