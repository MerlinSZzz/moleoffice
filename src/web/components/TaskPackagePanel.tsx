// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PACKAGE, ON THE TASK'S OWN PAGE. Criterion F16.
 *
 * ---------------------------------------------------------------------------------------
 * A TASK WITH NO PACKAGE DRAWS NOTHING AT ALL
 * ---------------------------------------------------------------------------------------
 *
 * Not an empty panel. `taskHasAPackage` is the one test for whether there is anything to draw here,
 * and `RecordPage.tsx` asks it before this component is rendered at all — the same shape the
 * deadline panel beside it is gated by. A package made for work inside the office is drawn too: its
 * state, who is responsible and how that was worked out, and nothing of what only outside work has.
 *
 * ---------------------------------------------------------------------------------------
 * TWO HALVES, BECAUSE THEY ARE ANSWERED BY TWO DIFFERENT READS
 * ---------------------------------------------------------------------------------------
 *
 * What the packager wrote — what it suits, when it was packaged and by whom, the words for the
 * outside, the acceptance criteria and where they were copied from — is the task's own `package`
 * field, already on the record this panel is drawn on. No request needed for any of it.
 *
 * Who is responsible, the sentence saying how that was worked out, and the count of exports and
 * returns are worked out fresh from the records every time the packaged-tasks column is asked for —
 * `src/shared/delegation.ts` says why nothing is stored for them — so this panel asks both package
 * doors through `readEveryPackage`, the same question the column asks, and reads this task's own row
 * out of the answer. A second reading of the same facts here would be the ninth invariant's own defect: one
 * fact worked out in two places, free to disagree.
 *
 * ---------------------------------------------------------------------------------------
 * A PACKAGE WHOSE TASK NAMES NO CODE
 * ---------------------------------------------------------------------------------------
 *
 * `statedCodeCount` is zero for every task in this project today, and that is a measured fact and
 * not a fault: nobody has stated code for anything in panelx. It is drawn as a plain sentence, never
 * as a warning and never as an error.
 */

import { useState } from 'react'
import type { PanelRecord } from '@shared/types.ts'
import type { PackageCheck, PackageHandback, PackageMaterial } from '@shared/delegation.ts'
import { packageInspectionOf } from '@shared/workspaces.ts'
import { content, t } from '@shared/i18n.ts'
import { actorTypeWord, packageReturnFormWord, packageStateWord, packageSuitWord, screenCheckWord, screenSeverityWord } from '@shared/words.ts'
import type { ParticipantKind } from '@shared/participants.ts'
import {
  errorMessage,
  faultOf,
  api,
  type DelegationReply,
  type OutsideExportReply,
  type ScreeningFindingOnTheWire,
  type ScreeningOnTheWire,
  type StatedReturn,
} from '../api.ts'
import { Absence, Btn, ErrorNote, Field, Loading, Panel, ServerNote, Tag, TextArea, TextInput, useAsync, type AsyncState } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { readParticipantsOnce, readWorkspacesOnce } from '../lib/oneread.ts'
import { theParticipantAStoredIdNames, writerNamed, type ParticipantsNamed } from '../lib/participant-lookup.ts'
import { asBase64 } from './PictureToSend.tsx'
import { putOnTheClipboard } from '../lib/clipboard.ts'
import { CodeRows } from '../lib/code-rows.tsx'
import { exportFileName } from '@shared/zip-export/manifest.ts'
import { handTheZipToTheBrowserAsAFile, theFileCountsSaid } from './zip-export/download.ts'
import { PackageAlignmentPlan } from './PackageAlignmentPlan.tsx'

/** The task's own `package` field, exactly as `POST /api/delegation/<id>/package` wrote it. */
export interface StatedPackage {
  bundleId: string
  forTheOutside: string
  suits: string
  acceptance: string
  acceptanceSource: { file: string; criterion: string; commit: string }
  at: string
  by: { actorType: string; actorId: string }
}

/**
 * Whether this task has an OUTSIDE package, and what the packager wrote if it does.
 *
 * AN INSIDE PACKAGE IS NOT DRAWN HERE. Round 234 added a package made for work inside the office:
 * it carries a parent, its lines and its points, and it has no `suits` and no `acceptanceSource`,
 * because nobody outside the office is being told what the work suits or where its acceptance was
 * copied from. Its own points panel draws it. Returning null for it is what keeps this panel from
 * reading fields it does not hold; before this guard, opening the task's page threw while reading
 * `acceptanceSource.file` (the check of the round that landed the inside package, 9 November 2026).
 *
 * AN OUTSIDE PACKAGE STILL ANSWERS ALL SEVEN FIELDS, which the `Package` schema requires when there
 * is no parent. This reads the field rather than re-validating it: the write door already refused
 * anything that does not conform, and checking the whole shape again here would be a second copy of
 * that rule. The two fields that tell the two kinds apart are the ones read.
 */
export function packageOnTask(data: PanelRecord['data'] | null | undefined): StatedPackage | null {
  const raw = data === null || data === undefined ? undefined : data.package
  if (raw === null || raw === undefined || typeof raw !== 'object') return null
  const held = raw as Record<string, unknown>
  if (typeof held['suits'] !== 'string' || held['acceptanceSource'] === null || held['acceptanceSource'] === undefined) {
    return null
  }
  return raw as StatedPackage
}

/**
 * WHETHER THE TASK HOLDS A PACKAGE OF EITHER KIND, for outside work or for work inside the office. The record page
 * draws this panel when it does. It drew it only for a package for outside work, so the task page of an inside
 * package drew no state while the tasks page said "returned to the taker" for the same package (round 166's
 * pictures). The two kinds are told apart by `packageOnTask`, which only an outside package answers.
 */
export function taskHasAPackage(data: PanelRecord['data'] | null | undefined): boolean {
  const raw = data === null || data === undefined ? undefined : data.package
  return raw !== null && raw !== undefined && typeof raw === 'object'
}

/**
 * WHO IS RESPONSIBLE FOR A PACKAGE, OR HOLDS IT, BY THE NAME A PERSON KNOWS THEM BY. The tasks page and this panel
 * both call this, so the two cannot name one participant two ways. The stored id is never drawn: round 166's
 * pictures found "responsible agent" and an id on both, where the name was known.
 *
 * - Found in the registry its kind says, by id or by its one handle: the kind and the registry name.
 * - Not found: what `writerNamed` says, which is the part of the office it is, or that it is unregistered.
 * - The registries could not be read: that its name could not be read.
 * - While the registries are read: the kind alone.
 */
export function packageParticipantNamed(who: { kind: ParticipantKind; id: string }, names: AsyncState<ParticipantsNamed>): string {
  const actorType = who.kind === 'person' ? 'human' : 'agent'
  if (names.status === 'loading') return actorTypeWord(actorType).text
  if (names.status === 'error') return t(who.kind === 'person' ? 'tpp.nameNotRead.person' : 'tpp.nameNotRead.agent')
  const found = theParticipantAStoredIdNames(who.kind === 'person' ? names.value.people : names.value.agents, who.id)
  if (found !== undefined) return `${actorTypeWord(actorType).text} ${content(found.name)}`
  return writerNamed({ actorType, actorId: who.id }, names.value)
}

/** Who packaged the task: the person or agent by name, as above, and any other writer by its kind and id. */
function packagedBy(by: StatedPackage['by'], names: AsyncState<ParticipantsNamed>): string {
  if (by.actorType === 'human') return packageParticipantNamed({ kind: 'person', id: by.actorId }, names)
  if (by.actorType === 'agent') return packageParticipantNamed({ kind: 'agent', id: by.actorId }, names)
  return `${actorTypeWord(by.actorType).text} ${content(by.actorId)}`
}

/**
 * EVERY PACKAGE IN THE PROJECT, OUTSIDE AND INSIDE, as one reading. `GET /api/delegation` lists the packages for
 * outside work and `GET /api/delegation/inside` the packages made for work inside the office. A page that shows a
 * package's state reads both through this, so they are joined in one place. Each list keeps the server's order, the
 * outside one first. The two `couldNotRead` lists cannot hold the same task, because the server sorts a task into
 * one of the two by the same keys of its package.
 */
export function bothPackageReadings(outside: DelegationReply, inside: DelegationReply): DelegationReply {
  return {
    tasks: [...outside.tasks, ...inside.tasks],
    couldNotRead: [...outside.couldNotRead, ...inside.couldNotRead],
    workspaceId: outside.workspaceId,
    note: `${outside.note} ${inside.note}`,
  }
}

/** Both package doors, asked together and joined by `bothPackageReadings`. */
export function readEveryPackage(): Promise<DelegationReply> {
  return Promise.all([api.delegation(), api.delegationInside()]).then(([outside, inside]) => bothPackageReadings(outside, inside))
}

export function TaskPackagePanelStyle() {
  return (
    <style href="mole-office-task-package-panel" precedence="default">
      {TPP_CSS}
    </style>
  )
}

export function TaskPackagePanel({ record }: { record: PanelRecord }) {
  const pkg = packageOnTask(record.data)
  const [state, reload] = useProjectAsync(readEveryPackage, [])
  const [names] = useProjectAsync(readParticipantsOnce, [])
  const [projects] = useAsync(readWorkspacesOnce, [])
  const project = projects.status === 'ready' ? projects.value.workspaces.find((one) => one.id === record.workspaceId) : undefined
  if (!taskHasAPackage(record.data)) return null
  return (
    <Panel titleIs="label" declares={{ surface: 'package.here' }} title={t('tpp.panelTitle')}>
      {/* WHAT THE PACKAGER WROTE FOR THE OUTSIDE. A package for work inside the office has none of it. */}
      {pkg === null ? null : (
        <>
          <dl className="tpp-facts">
            <dt>{t('tpp.suits')}</dt>
            <dd>{packageSuitWord(pkg.suits).text}</dd>
            <dt>{t('tpp.packaged')}</dt>
            <dd>{content(pkg.at)} · <span className="tpp-packager">{packagedBy(pkg.by, names)}</span></dd>
          </dl>
          <p className="tpp-outside">
            <span className="tpp-key">{t('tpp.forTheOutside')}</span>
            {content(pkg.forTheOutside)}
          </p>
          <div className="tpp-acceptance">
            <p className="tpp-key">{t('tpp.acceptanceCriteria')}</p>
            <p className="tpp-acceptance-text">{content(pkg.acceptance)}</p>
            <CodeRows
              rows={[
                { label: 'tpp.row.copiedFrom', value: pkg.acceptanceSource.file },
                { label: 'tpp.row.criterion', value: pkg.acceptanceSource.criterion },
                { label: 'tpp.row.commit', value: pkg.acceptanceSource.commit },
              ]}
            />
          </div>
        </>
      )}
      <PackageHandbackPoints data={record.data} enabled={project !== undefined && packageInspectionOf(project.packageInspection)} />
      {state.status === 'loading' ? <Loading what={t('tpp.whoIsResponsible')} rows={1} /> : null}
      {state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault} /> : null}
      {state.status === 'ready' ? (
        <TaskPackageComputed
          reply={state.value}
          recordId={record.id}
          returns={returnsOnTask(record.data)}
          names={names}
          onChanged={reload}
        />
      ) : null}
      <PackageAlignmentPlan record={record} />
    </Panel>
  )
}

/** The latest hand-back and the inspector's opinion of each point, when this project asks for it. */
export function PackageHandbackPoints({ data, enabled }: { data: PanelRecord['data']; enabled: boolean }) {
  if (!enabled) return null
  const pkg = data?.package as { materials?: PackageMaterial[]; handedBack?: PackageHandback[]; checks?: PackageCheck[] } | undefined
  const handback = pkg?.handedBack?.at(-1)
  if (handback === undefined) return null
  const check = pkg?.checks?.filter((one) => one.points !== undefined &&
    (handback.order === undefined ? one.order !== undefined || pkg.handedBack?.length === 1 : one.order !== undefined && one.order > handback.order)).at(-1)
  return (
    <section className="tpp-points" aria-label={t('delegation.inspection.points')}>
      <h3>{t('delegation.inspection.points')}</h3>
      <ul>
        {handback.points.map((point) => {
          const material = pkg?.materials?.find((one) => one.kind === 'point' && one.ref === point.pointId)
          const opinion = check?.points?.find((one) => one.pointId === point.pointId)
          return (
            <li key={point.pointId} data-point-id={point.pointId}>
              <strong>{content(material?.says ?? point.pointId)}</strong>
              <p>{t(`delegation.inspection.outcome.${point.outcome}`)}: {content(point.words)}</p>
              {opinion === undefined ? <p>{t('absence.notLooked')}</p> : (
                <p>{t(`delegation.inspection.judged.${opinion.judged}`)} · {opinion.rulesKept === undefined ? null : <>{t(opinion.rulesKept ? 'delegation.inspection.rulesKept' : 'delegation.inspection.rulesNotKept')} · </>}{content(opinion.why)}</p>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/**
 * WHAT HAS COME BACK FROM OUTSIDE, READ OFF THE TASK'S OWN `returns` LIST.
 *
 * ONLY ENTRIES THAT SAY THEY ARE FROM OUTSIDE ARE DRAWN, and the reader checks `saysItIsFromOutside`
 * rather than trusting the list position. An entry that does not carry that marker is not a return
 * this product wrote — a hand-edited or imported one — and drawing it beside the real ones would let
 * a later reader take it for somebody's outside words. The ninth invariant's shape: the marker is
 * read here, where it is relied on.
 */
export function returnsOnTask(data: PanelRecord['data'] | null | undefined): StatedReturn[] {
  const raw = data === null || data === undefined ? undefined : data.returns
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (one): one is StatedReturn =>
      one !== null && typeof one === 'object' && (one as { saysItIsFromOutside?: unknown }).saysItIsFromOutside === true,
  )
}

/**
 * The half of the panel that is a fresh reading of the column, rather than the record's own field.
 *
 * EXPORTED SO A TEST CAN DRAW IT WITHOUT A SERVER. `TaskPackagePanel` above fetches; this takes what
 * it fetched and is a pure function of it.
 */
export function TaskPackageComputed({
  reply,
  recordId,
  returns = [],
  names = { status: 'loading' },
  onChanged,
}: {
  reply: DelegationReply
  recordId: string
  /** The returns stored on the task, already read through `returnsOnTask`. Empty in a bare render. */
  returns?: StatedReturn[]
  /** Both registries, to name who is responsible. Being read, in a bare render. */
  names?: AsyncState<ParticipantsNamed>
  /** Called after a return or a confirmation is written, so the reading can be asked for again. */
  onChanged?: () => void
}) {
  const row = reply.tasks.find((one) => one.recordId === recordId) ?? null
  if (row === null) {
    const unreadable = reply.couldNotRead.find((one) => one.recordId === recordId) ?? null
    return unreadable === null ? (
      <p className="tpp-unreadable">{t('tpp.notListed')}</p>
    ) : (
      <>
        <p className="tpp-unreadable">{t('planning.notReadable')}</p>
        {/* `because` IS THE SERVER'S OWN SENTENCE (`couldNotRead[].because`, `GET /api/delegation`),
            drawn as it wrote it, and marked so this round's browser test can tell it apart from a
            word this piece forgot to move. */}
        <ServerNote text={unreadable.because} />
      </>
    )
  }
  // WHAT ONLY OUTSIDE WORK HAS: the exports and returns, and the presses that write an act of outside work. A package
  // made for work inside the office has a parent, and the tasks page draws none of these for it either.
  const outside = row.parent === null
  return (
    <>
      <p className="tpp-state">
        <span className="tpp-key">{t('tpp.state')}</span>
        <Tag tone="neutral">{packageStateWord(row.state).text}</Tag>
      </p>
      <p className="tpp-responsible">
        <span className="tpp-key">{t('tpp.responsible')}</span>
        {row.responsible === null ? (
          <Absence tier="ordinary" word={t('tpp.notRecorded')} title={t('tpp.notRecordedTitle')} />
        ) : (
          packageParticipantNamed(row.responsible, names)
        )}
      </p>
      {/* `responsibleWhy` IS ALSO THE SERVER'S OWN SENTENCE, for the same reason as `because` above. */}
      <ServerNote text={row.responsibleWhy} />
      {outside ? (
        <dl className="tpp-facts">
          <dt>{t('tpp.exported')}</dt>
          <dd>{t('tpp.times', { n: row.exportCount })}</dd>
          <dt>{t('tpp.returned')}</dt>
          <dd>{t('tpp.times', { n: row.returnCount })}</dd>
        </dl>
      ) : null}
      {row.statedCodeCount === 0 ? (
        <p className="tpp-code">
          <span className="tpp-key">{t('tpp.codeStated')}</span>
          {t('absence.none')}
        </p>
      ) : (
        <p className="tpp-code">
          <span className="tpp-key">{t('tpp.codeStated')}</span>
          {t('tpp.relationships', { n: row.statedCodeCount })}
        </p>
      )}
      {outside ? (
        <>
          <ReturnsList returns={returns} />
          <TaskPackageActions recordId={recordId} workspaceId={reply.workspaceId} state={row.state} onChanged={onChanged} />
        </>
      ) : null}
    </>
  )
}

/**
 * WHAT CAME BACK FROM OUTSIDE, DRAWN ONLY WITH ITS OUTSIDE AUTHOR ON IT.
 *
 * THE LABEL IS THE POINT AND IT IS IN THE SAME PLACE EVERY TIME: every entry is drawn as
 * "<fromOutside>, brought back by <who>", and the form it came in. These are somebody else's words
 * and are never drawn as this office's own observation — invariant 3 — and the one component below
 * is the only place in the product that draws a return, so the label cannot be present in one screen
 * and missing from another.
 */
export function ReturnsList({ returns }: { returns: StatedReturn[] }) {
  if (returns.length === 0) {
    return <Absence tier="ordinary" word={t('tpp.nothingBackYet')} title={t('tpp.nothingBackYetTitle')} />
  }
  return (
    <div className="tpp-returns">
      <p className="tpp-key">{t('tpp.fromOutside')}</p>
      {returns.map((entry) => (
        <div className="tpp-return" key={`${entry.at}-${entry.fromOutside}`}>
          <p className="tpp-return-who">
            {t('tpp.broughtBackBy', {
              from: content(entry.fromOutside),
              actorType: actorTypeWord(entry.broughtBackBy.actorType).text,
              actorId: content(entry.broughtBackBy.actorId),
              form: packageReturnFormWord(entry.form).text,
              at: content(entry.at),
            })}
          </p>
          {entry.words === undefined ? null : <p className="tpp-return-words">{content(entry.words)}</p>}
          {entry.pictures === undefined ? null : (
            <ul className="tpp-return-paths">
              {entry.pictures.map((path) => (
                <li key={path}>{content(path)}</li>
              ))}
            </ul>
          )}
          {entry.file === undefined ? null : <p className="tpp-return-paths"><code className="wrap-anywhere">{content(entry.file)}</code></p>}
        </div>
      ))}
    </div>
  )
}

/**
 * THE TWO THINGS A PERSON DOES TO A PACKAGE: PUT SOMETHING BACK, AND SAY IT IS FINISHED.
 *
 * BOTH OPEN ON A PRESS. Each is a native `<details>`, shut on arrival, so a page somebody is reading
 * draws no field and no chooser — which is the rule `tests/read-before-edit.test.ts` holds for
 * `#/tasks-to-take` and for every record page. The return form is a form a person fills in; the
 * confirmation is a press, and it is behind its own fold so the reading state stays a reading.
 *
 * A REFUSAL FROM THE SERVER IS DRAWN WHERE THE PRESS WAS, through `ErrorNote`, in the server's own
 * words. A button that cannot be pressed says what would enable it, which `Btn` enforces at render.
 *
 * THE SAME COMPONENT IS DRAWN FROM THE TASK'S OWN PANEL AND FROM THE PACKAGED-TASKS PAGE, so the two
 * cannot come to offer different things under the same name.
 */
export function TaskPackageActions({
  recordId,
  workspaceId,
  state,
  onChanged,
}: {
  recordId: string
  /** The project the package is in, so the page of plain text can name it in its address. */
  workspaceId: string
  /** The column's own state word for the task, so a confirmed task offers no second press. */
  state: string
  onChanged?: () => void
}) {
  return (
    <div className="tpp-actions">
      <TaskOutsideExport recordId={recordId} workspaceId={workspaceId} />
      <ReturnForm recordId={recordId} onReturned={onChanged} />
      <ConfirmPackagePress recordId={recordId} state={state} onConfirmed={onChanged} />
    </div>
  )
}

/**
 * THE PRESS THAT MAKES THE TEXT A PERSON CARRIES TO AN OUTSIDE CHAT. Criterion F16 points 1 and 6.
 *
 * ---------------------------------------------------------------------------------------
 * IT OPENS ON A PRESS, LIKE THE RETURN FORM BESIDE IT
 * ---------------------------------------------------------------------------------------
 *
 * A page somebody is reading draws no box and no chooser, which `tests/read-before-edit.test.ts`
 * holds for this page and for a task's own page. The whole thing is a native `<details>`, shut on
 * arrival; one press makes the text, and it is drawn whole under what the screen said about it.
 *
 * ---------------------------------------------------------------------------------------
 * THE SCREEN IS DRAWN ABOVE THE TEXT, WHATEVER IT FOUND
 * ---------------------------------------------------------------------------------------
 *
 * The reply always carries the screen's summary and its findings, including the line saying other
 * people's names were not checked. Drawing them above the text is the point of the weaker severity:
 * the person holding the clipboard is the one who decides, and a refusal from the server is the
 * server's own sentence drawn where the press was, through `ErrorNote`.
 */
export function TaskOutsideExport({ recordId, workspaceId }: { recordId: string; workspaceId: string }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const [made, setMade] = useState<OutsideExportReply | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [copiedIsServer, setCopiedIsServer] = useState(false)
  /**
   * WHETHER THE RELATED FILES GO TOO. False is the text answer and the default; the answer belongs
   * to one press, so it goes back to false once that press has handed over its zip.
   */
  const [withFiles, setWithFiles] = useState(false)
  /** What a zip press came to, in the same place the text press draws its own answer. */
  const [zipSaid, setZipSaid] = useState<string | null>(null)
  /** The name of the zip the browser took, drawn on its own row; null when the last press handed none. */
  const [zipFile, setZipFile] = useState<string | null>(null)
  /**
   * THE SCREEN'S ANSWER A ZIP PRESS RECORDED. Drawn above the counts, the way the text press draws
   * it above the text, so the person choosing the zip sees the same findings before pasting. Null
   * until a zip press answers, and again when the next press starts.
   */
  const [zipScreening, setZipScreening] = useState<ScreeningOnTheWire | null>(null)
  const textId = `tpp-out-${recordId}`

  const makeIt = () => {
    void (async () => {
      setBusy(true)
      setFailed(null)
      setMade(null)
      setCopied(null)
      setZipSaid(null)
      setZipFile(null)
      setZipScreening(null)
      try {
        const answer = await api.exportOutside(recordId, withFiles)
        if (answer.kind === 'zip') {
          const fileName = exportFileName(answer.title, answer.n)
          const download = handTheZipToTheBrowserAsAFile(answer.bytes, fileName)
          // THE COUNTS ARE TRUE WHEN THE ZIP WAS MADE, but the row naming the file is true only
          // when the browser took it. A browser that will not take one hears its refusal alone,
          // never the claim beside it.
          setZipSaid(download.handed ? theFileCountsSaid(answer) : download.said)
          setZipFile(download.handed ? fileName : null)
          setZipScreening(answer.screening)
          setWithFiles(false)
          return
        }
        setMade(answer)
      } catch (error) {
        setFailed({ message: errorMessage(error), fault: faultOf(error) })
      } finally {
        setBusy(false)
      }
    })()
  }

  const copyIt = () => {
    void (async () => {
      const said = await putOnTheClipboard(made?.text ?? '')
      // `said.because` IS `../lib/clipboard.ts`'s OWN SENTENCE, a file another wave owns (not one of
      // this piece's files), so it stays that module's English rather than a second, possibly
      // drifting translation of it. `copiedFlag` below is how the browser test tells the two apart.
      setCopied(said.wrote ? t('tpp.copiedToClipboard') : said.because)
      setCopiedIsServer(!said.wrote)
    })()
  }

  return (
    <details className="tpp-form">
      <summary className="tpp-form-sum">{t('tpp.copyForOutsideChat')}</summary>
      <div className="tpp-form-body">
        <fieldset className="tpp-files">
          <legend className="tpp-files-q">{t('zipExport.question')}</legend>
          <label className="tpp-files-answer">
            <input
              type="radio"
              name={`tpp-files-${recordId}`}
              checked={!withFiles}
              onChange={() => setWithFiles(false)}
            />
            <span>{t('zipExport.textOnly')}</span>
          </label>
          <label className="tpp-files-answer">
            <input
              type="radio"
              name={`tpp-files-${recordId}`}
              checked={withFiles}
              onChange={() => setWithFiles(true)}
            />
            <span>{t('zipExport.textAndFiles')}</span>
          </label>
        </fieldset>
        <Btn
          variant="primary"
          pending={busy}
          disabled={busy}
          reason={busy ? t('tpp.textBeingMade') : undefined}
          onClick={makeIt}
        >
          {withFiles ? t('zipExport.makeTheZip') : t('tpp.makeTheText')}
        </Btn>
        {failed === null ? null : <ErrorNote label={t('tpp.notMade')} message={failed.message} fault={failed.fault} />}
        {zipSaid === null ? null : <p className="tpp-done">{zipSaid}</p>}
        {zipFile === null ? null : <CodeRows rows={[{ label: 'frameFiles.row.handed', value: zipFile }]} />}
        {zipScreening === null ? null : <TheScreensAnswer screening={zipScreening} />}
        {made === null ? null : (
          <div className="tpp-outside">
            {/* THE SCREEN'S OWN WORDS, drawn as the reply wrote them — a server sentence, not
                translated on this page (this round's report says so). */}
            <TheScreensAnswer screening={made.screening} />
            <div className="tpp-outside-acts">
              <Btn onClick={copyIt}>{t('tpp.copyWholeText')}</Btn>
              <a
                className="tpp-text-link"
                href={api.delegationTextAddress(recordId, workspaceId)}
                target="_blank"
                rel="noreferrer"
              >
                {t('tpp.openAsPageOfText')}
              </a>
            </div>
            {copied === null ? null : <p className={copiedIsServer ? 'tpp-done tpp-server' : 'tpp-done'}>{copied}</p>}
            <pre className="tpp-out-text" id={textId}>
              {made.text}
            </pre>
          </div>
        )}
      </div>
    </details>
  )
}

/**
 * THE SCREEN'S ANSWER, DRAWN THE SAME WAY ON BOTH PRESSES. The text press draws it above the text,
 * and the zip press above the counts, from the answer the export entry recorded. One component for
 * both is what makes "the same findings" true rather than two drawings that agree today.
 */
function TheScreensAnswer({ screening }: { screening: ScreeningOnTheWire }) {
  return (
    <>
      <p className="tpp-screen">{t('tpp.screenFindings', { n: screening.findings.length })}</p>
      <ServerNote text={screening.summary} />
      {screening.findings.map((finding) => (
        <p className="tpp-screen-finding" key={findingKey(finding)}>
          <span className="tpp-key">{screenCheckWord(finding.check).text}</span>
          <span className="tpp-severity">{screenSeverityWord(finding.severity).text}</span>
          <span className="tpp-server">{finding.says}</span>
        </p>
      ))}
    </>
  )
}

/** A stable key for one finding, so two findings of the same check in one place do not collide. */
function findingKey(finding: ScreeningFindingOnTheWire): string {
  return `${finding.check}-${String(finding.where?.line ?? 0)}-${String(finding.where?.startColumn ?? 0)}`
}

/**
 * THE RETURN FORM. Criterion F16 point 5, and invariant 3's own door.
 *
 * It uploads the chosen pictures through the pictures door and the chosen zip through the
 * returned-files door, and hands the paths those doors returned to the return door. It never sends
 * bytes to the return door, which is what keeps one place responsible for writing a file. Nothing
 * here decides who may return: the server refuses an agent the person's grant does not carry there
 * and a caller who is not proved to be the person, and that refusal is drawn under the press.
 */
export function ReturnForm({ recordId, onReturned }: { recordId: string; onReturned?: () => void }) {
  const [fromOutside, setFromOutside] = useState('')
  const [words, setWords] = useState('')
  const [pictures, setPictures] = useState<File[]>([])
  const [zip, setZip] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const putItBack = () => {
    void (async () => {
      setBusy(true)
      setFailed(null)
      setDone(null)
      try {
        const picturePaths: string[] = []
        for (const file of pictures) {
          const said = await api.sendAPicture(await asBase64(file))
          picturePaths.push(said.picture.path)
        }
        let filePath: string | undefined
        if (zip !== null) {
          const said = await api.sendAReturnedFile(await asBase64(zip))
          filePath = said.returnedFile.path
        }
        const said = await api.returnFromOutside(recordId, {
          fromOutside,
          ...(words.trim() === '' ? {} : { words }),
          ...(picturePaths.length === 0 ? {} : { pictures: picturePaths }),
          ...(filePath === undefined ? {} : { file: filePath }),
        })
        setDone(said.note)
        setWords('')
        setPictures([])
        setZip(null)
        onReturned?.()
      } catch (error) {
        setFailed({ message: errorMessage(error), fault: faultOf(error) })
      } finally {
        setBusy(false)
      }
    })()
  }

  return (
    <details className="tpp-form">
      <summary className="tpp-form-sum">{t('tpp.putSomethingBack')}</summary>
      <div className="tpp-form-body">
        <Field label={t('tpp.whoDidTheWork')}>
          <TextInput value={fromOutside} onChange={setFromOutside} placeholder={t('tpp.whoDidTheWorkPlaceholder')} />
        </Field>
        <Field label={t('tpp.whatTheySaid')} optional>
          <TextArea value={words} onChange={setWords} rows={3} />
        </Field>
        <label className="tpp-file">
          <span className="tpp-key">{t('tpp.picturesTheySent')}</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={(event) => {
              setPictures([...(event.currentTarget.files ?? [])])
            }}
          />
        </label>
        <label className="tpp-file">
          <span className="tpp-key">{t('tpp.zipTheySent')}</span>
          <input
            type="file"
            accept=".zip,application/zip"
            onChange={(event) => {
              setZip(event.currentTarget.files?.[0] ?? null)
            }}
          />
        </label>
        <div className="tpp-form-acts">
          <Btn
            variant="primary"
            pending={busy}
            disabled={busy}
            reason={busy ? t('tpp.returnBeingSaved') : undefined}
            onClick={putItBack}
          >
            {t('tpp.putItBack')}
          </Btn>
        </div>
        {failed === null ? null : <ErrorNote label={t('tpp.notPutBack')} message={failed.message} fault={failed.fault} />}
        {done === null ? null : <><p className="tpp-done">{t('tpp.wasPutBack')}</p><ServerNote text={done} /></>}
      </div>
    </details>
  )
}

/**
 * THE CONFIRMATION PRESS. Criterion F16 point 5: reserved to the one responsible and to the person.
 *
 * IT TAKES NO ARGUMENTS. The reader may not know whether they are the responsible one, and the
 * product may not guess on their behalf, so the press is always offered and the server answers: the
 * refusal names who may confirm. A task already confirmed says so instead of offering the press
 * again, because a confirmation is written once and never rewritten.
 */
export function ConfirmPackagePress({
  recordId,
  state,
  onConfirmed,
}: {
  recordId: string
  state: string
  onConfirmed?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const confirmIt = () => {
    void (async () => {
      setBusy(true)
      setFailed(null)
      setDone(null)
      try {
        const said = await api.confirmPackage(recordId)
        setDone(said.note)
        onConfirmed?.()
      } catch (error) {
        setFailed({ message: errorMessage(error), fault: faultOf(error) })
      } finally {
        setBusy(false)
      }
    })()
  }

  return (
    <details className="tpp-form">
      <summary className="tpp-form-sum">{t('tpp.confirmItIsFinished')}</summary>
      <div className="tpp-form-body">
        {state === 'done' ? (
          <Absence tier="ordinary" word={t('tpp.alreadyConfirmed')} title={t('tpp.alreadyConfirmedTitle')} />
        ) : (
          <Btn
            variant="primary"
            pending={busy}
            disabled={busy}
            reason={busy ? t('tpp.confirmationBeingSaved') : undefined}
            onClick={confirmIt}
          >
            {t('tpp.confirmFinished')}
          </Btn>
        )}
        {failed === null ? null : <ErrorNote label={t('tpp.notConfirmed')} message={failed.message} fault={failed.fault} />}
        {done === null ? null : <><p className="tpp-done">{t('tpp.wasConfirmed')}</p><ServerNote text={done} /></>}
      </div>
    </details>
  )
}

const TPP_CSS = `
.tpp-facts { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 4px var(--pad-lg); margin: 0 0 var(--gut); font-size: var(--fs-1); }
.tpp-facts dt { color: var(--text-3); }
.tpp-facts dd { margin: 0; color: var(--text); min-width: 0; overflow-wrap: anywhere; }
.tpp-packager { display: inline-block; max-width: 100%; vertical-align: top; overflow-wrap: anywhere; }
.tpp-key { display: block; color: var(--text-3); font-size: var(--fs-1); }
.tpp-severity { display: block; color: var(--text-3); font-size: var(--fs-1); }
.tpp-state, .tpp-outside, .tpp-responsible, .tpp-code { margin: 0 0 var(--gut); overflow-wrap: anywhere; }
.tpp-acceptance { margin: 0 0 var(--gut); }
.tpp-acceptance-text { margin: 2px 0 0; overflow-wrap: anywhere; }
.tpp-unreadable { margin: 0; color: var(--text-2); }
.tpp-returns { margin: 0 0 var(--gut); }
.tpp-return { margin: 0 0 var(--pad-lg); }
.tpp-return-who { margin: 0; color: var(--text); overflow-wrap: anywhere; }
.tpp-return-words { margin: 4px 0 0; overflow-wrap: anywhere; }
.tpp-return-paths { margin: 4px 0 0; padding-left: var(--pad-lg); color: var(--text-2); font-size: var(--fs-1); overflow-wrap: anywhere; }
.tpp-actions { position: relative; z-index: 2; display: grid; gap: var(--pad-lg); margin-top: var(--gut); min-width: 0; }
.tpp-form { border-top: 1px solid var(--border); padding-top: var(--pad-lg); min-width: 0; }
.tpp-form-sum { cursor: pointer; color: var(--text-2); }
.tpp-form-body { display: grid; gap: var(--gut); margin-top: var(--gut); min-width: 0; }
.tpp-file { display: grid; gap: 2px; font-size: var(--fs-1); }
.tpp-files { display: flex; flex-wrap: wrap; gap: 2px var(--pad-lg); margin: 0; padding: 0; border: 0; min-width: 0; }
.tpp-files-q { flex-basis: 100%; padding: 0; color: var(--text-3); font-size: var(--fs-1); }
.tpp-files-answer { display: inline-flex; gap: 4px; align-items: baseline; min-width: 0; overflow-wrap: anywhere; }
.tpp-form-acts { display: flex; gap: var(--pad-lg); align-items: center; }
.tpp-done { margin: 0; color: var(--text-2); overflow-wrap: anywhere; }
.tpp-outside { display: grid; gap: var(--pad-lg); min-width: 0; }
.tpp-screen { margin: 0; color: var(--text-2); font-size: var(--fs-1); overflow-wrap: anywhere; }
.tpp-screen-finding { margin: 0; color: var(--text-2); font-size: var(--fs-1); overflow-wrap: anywhere; }
.tpp-outside-acts { display: flex; gap: var(--pad-lg); align-items: center; flex-wrap: wrap; min-width: 0; }
.tpp-text-link { color: var(--text-2); }
/* THE TEXT ITSELF, DRAWN WHOLE BELOW THE SCREEN. It wraps rather than scrolling sideways, for the
   reason the bundle's own text box gives: a block scrolling sideways hides the ends of lines
   somebody is about to hand over. The width and the box model go together, and each ancestor above
   says min-width: 0, so a long unbreakable run of characters cannot widen the row it sits in. */
.tpp-out-text {
  display: block; width: 100%; box-sizing: border-box; min-width: 0;
  max-height: 28rem; margin: 0;
  overflow-x: hidden; overflow-y: auto;
  white-space: pre-wrap; overflow-wrap: anywhere;
  font-size: var(--fs-1);
}
`
