// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERMANENT RESIDENT'S SECTION OF ITS OWN PAGE. The proposal
 * report GsGFiDygATd5, block b-8 and its second picture (wave 13r, round 4).
 *
 * THREE PANELS. The residency: since when, who proposed it, who confirmed it, and the facts the office
 * measured when it was proposed. How the resident wishes to be addressed, beside it, read from the
 * agent's own row (the door the agent's page already reads). And the personal space: the size used of
 * the limit; the files, each void mark struck through beside its reason, and each file's earlier versions
 * under it, which anybody who may read the space may read and nobody writes; where each session of the
 * resident started (the session-origin file); and who may read the space, and until when.
 *
 * THE PRESSES THAT ARE THE PERSON'S, AND ONLY THEIRS: end a grant of leave, mark a file void, and name a
 * successor once the resident is retired. The doors refuse everybody else; the page leaves the presses
 * off any other reader's screen, where they would always be refused.
 *
 * ANOTHER AGENT THAT MAY NOT READ THE SPACE IS TOLD ONLY THAT IT IS PRIVATE. The door sends such a
 * caller no file list and no size, and this page draws one sentence in the space's place.
 *
 * AN AGENT THAT IS NOT A RESIDENT draws no section: only the rows of any open proposal to make it one,
 * with the person's press. Which agents are residents is read from GET /api/residents, so a page never
 * reads a refusal to learn that an agent is not one.
 *
 * ITS OWN COMPONENT, BECAUSE THE AGENT'S PAGE IS WAVE 13K'S. That page draws it with one element and
 * changes nothing else; this file never reaches into it.
 */
import { content, t } from '@shared/i18n.ts'
import { ADDRESS_AS_PARTS } from '@shared/address-as.ts'
import { bytesSaid } from '@shared/what-is-kept.ts'
import { drawnStamp, parseAnyStamp } from '@shared/time.ts'
import { useState } from 'react'
import { api, errorMessage, faultOf, getActor, type Fault, type ParticipantOnTheWire } from '../api.ts'
import { useInspect } from '../lib/mode.ts'
import { useLanguage } from '../lib/language.ts'
import { readParticipantsOnce } from '../lib/oneread.ts'
import {
  isTheSessionOriginFile,
  readTheSessionOrigins,
  SESSION_ORIGINS_FILE,
  thePersonIsLooking,
  type AFileInTheSpace,
  type AGrant,
  type ASessionOrigin,
  type AnEarlierVersion,
  type OneResidentReading,
  type SessionOriginRead,
  type TheSpaceListing,
} from '../lib/residents.ts'
import { ResidentFact, ResidentFactsList, ResidentProposalList, useNameOf } from './ResidentProposals.tsx'
import { HeartbeatFact } from './ResidentSleep.tsx'
import { RouteLink, recordPath, sessionPath } from './router.tsx'
import { CommandLine } from './SessionPanel.tsx'
import { SideBySide } from './SideBySide.tsx'
import { Absence, Btn, ErrorNote, Loading, Panel, Select, TextArea, useAsync, type AsyncState } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'

/** What the page knows of the session-origin file. */
export type OriginsState =
  | { status: 'no-file' }
  | { status: 'loading' }
  | { status: 'failed'; message: string; fault?: Fault | null }
  | { status: 'read'; lines: SessionOriginRead[] }

/** A failed press, kept whole so a coded refusal is drawn in the page's words. */
type PressFault = { message: string; fault: Fault | null }

function pressFault(err: unknown): PressFault {
  return { message: errorMessage(err), fault: faultOf(err) }
}

/**
 * THE SECTION, READ HERE. `agent` is the agent's row as the agent's page already read it, which is
 * where how it wishes to be addressed comes from.
 */
export function ResidentSection({ agent, onTheProfile = false }: { agent: ParticipantOnTheWire; onTheProfile?: boolean }) {
  useLanguage()
  const inspect = useInspect()
  const [list, readListAgain] = useAsync(() => api.residents(), [])
  if (list.status === 'loading') return null
  if (list.status === 'error') {
    return <ErrorNote message={inspect ? list.message : t('resident.proposal.readFailed')} fault={inspect ? list.fault : undefined} retry={readListAgain} />
  }
  if (!list.value.residents.some((one) => one.agentId === agent.id)) {
    return <ResidentProposalList reply={list.value} onlyFor={agent.id} onAnswered={readListAgain} />
  }
  return <TheResidentRead agent={agent} onTheProfile={onTheProfile} />
}

/** The residency, and the space's files and session-origin file when this caller may read them. */
function TheResidentRead({ agent, onTheProfile }: { agent: ParticipantOnTheWire; onTheProfile: boolean }) {
  const inspect = useInspect()
  const [reading, readAgain] = useProjectAsync(() => api.resident(agent.id), [agent.id])
  const mayRead = reading.status === 'ready' && reading.value.space.mayRead
  const [listing, readListingAgain] = useProjectAsync(
    () => (mayRead ? api.residentSpace(agent.id) : Promise.resolve(null)),
    [agent.id, mayRead],
  )
  const hasOrigins =
    listing.status === 'ready' && listing.value !== null && listing.value.files.some((file) => isTheSessionOriginFile(file.path))
  const [originsText] = useProjectAsync(
    () => (hasOrigins ? api.residentSpaceFileText(agent.id, SESSION_ORIGINS_FILE) : Promise.resolve(null)),
    [agent.id, hasOrigins, listing.status === 'ready' ? listing.value : null],
  )
  if (reading.status === 'loading') return null
  if (reading.status === 'error') {
    return <ErrorNote message={inspect ? reading.message : t('resident.residency.readFailed')} fault={inspect ? reading.fault : undefined} retry={readAgain} />
  }
  const origins: OriginsState = !hasOrigins
    ? { status: 'no-file' }
    : originsText.status === 'error'
      ? { status: 'failed', message: originsText.message, fault: originsText.fault ?? null }
      : originsText.status === 'ready' && originsText.value !== null
        ? { status: 'read', lines: readTheSessionOrigins(originsText.value) }
        : { status: 'loading' }
  const listed: AsyncState<TheSpaceListing> | null = !mayRead
    ? null
    : listing.status === 'ready'
      ? listing.value === null
        ? { status: 'loading' }
        : { ...listing, value: listing.value }
      : listing
  return (
    <TheResidentSection
      agent={agent}
      reading={reading.value}
      listing={listed}
      origins={origins}
      thePerson={thePersonIsLooking(getActor())}
      onTheProfile={onTheProfile}
      onChanged={() => {
        readAgain()
        readListingAgain()
      }}
    />
  )
}

/**
 * THE THREE PANELS, FROM WHAT WAS READ. Everything it draws is passed in, so a test can draw it from a
 * reading without a server.
 */
export function TheResidentSection({
  agent,
  reading,
  listing,
  origins,
  thePerson,
  onTheProfile = false,
  onChanged,
}: {
  agent: ParticipantOnTheWire
  reading: OneResidentReading
  /** The files, or null when this caller may not read the space. */
  listing: AsyncState<TheSpaceListing> | null
  origins: OriginsState
  thePerson: boolean
  /** On the agent's profile, which draws how it wishes to be addressed and its heartbeat itself: both are left out here. */
  onTheProfile?: boolean
  /** Called after a press the door answered, so the section is read again. */
  onChanged: () => void
}) {
  useLanguage()
  return (
    <div className="resident-section" data-resident={agent.id}>
      <style href="mole-office-resident-section" precedence="default">
        {RESIDENT_SECTION_CSS}
      </style>
      {onTheProfile ? (
        <TheResidency reading={reading} thePerson={thePerson} withHeartbeat={false} />
      ) : (
        <SideBySide className="resident-sides">
          <div data-column="start">
            <TheResidency reading={reading} thePerson={thePerson} />
          </div>
          <div data-column="end">
            <TheAddress agent={agent} />
          </div>
        </SideBySide>
      )}
      <TheSpace agent={agent} reading={reading} listing={listing} origins={origins} thePerson={thePerson} onChanged={onChanged} />
    </div>
  )
}

/** Since when, who proposed it, who confirmed it, and the facts when it was proposed. */
function TheResidency({ reading, thePerson, withHeartbeat = true }: { reading: OneResidentReading; thePerson: boolean; withHeartbeat?: boolean }) {
  const resident = reading.resident
  const proposer = useNameOf(resident.proposedBy === null ? null : { kind: 'agent', id: resident.proposedBy })
  const confirmer = useNameOf(resident.confirmedBy)
  const you = thePerson && resident.confirmedBy.kind === 'person' && resident.confirmedBy.id === getActor().id
  return (
    <Panel titleIs="label" declares={{ surface: 'resident.residency' }} title={t('resident.residency.title')}>
      <dl className="resident-facts-plain">
        <ResidentFact label={t('resident.residency.since')} value={drawnStamp(resident.since)} />
        <ResidentFact
          label={t('resident.residency.proposedBy')}
          value={
            <>
              {proposer}
              {' · '}
              <RouteLink to={recordPath(resident.proposalId)}>{t('resident.residency.openProposal')}</RouteLink>
            </>
          }
        />
        <ResidentFact label={t('resident.residency.confirmedBy')} value={you ? t('resident.residency.you') : confirmer} />
        {resident.retired ? (
          <ResidentFact label={t('resident.residency.retired')} value={resident.retiredAt === null ? t('resident.unknown') : drawnStamp(resident.retiredAt)} />
        ) : null}
        {/* ITS HEARTBEAT, its handle's hold read now. A lapsed one reads so. */}
        {withHeartbeat ? <HeartbeatFact heartbeat={resident.heartbeat} /> : null}
      </dl>
      <h3 className="resident-head">{t('resident.facts.atProposal')}</h3>
      {resident.factsAtProposal === null ? <p className="resident-quiet">{t('resident.unknown')}</p> : <ResidentFactsList facts={resident.factsAtProposal} />}
    </Panel>
  )
}

/**
 * HOW THE RESIDENT WISHES TO BE ADDRESSED, the four parts as written, drawn beside the residency. Read
 * from the agent's own row. A part nobody set says so, and nothing stands in for it.
 */
function TheAddress({ agent }: { agent: ParticipantOnTheWire }) {
  const [participants] = useProjectAsync(readParticipantsOnce, [])
  const setter = agent.addressAsSetBy
  let setBy: string | null = null
  if (setter == null) {
    if (ADDRESS_AS_PARTS.some((part) => agent.addressAs[part] !== undefined)) setBy = t('address.setBeforeRecording')
  } else {
    const actor = getActor()
    const at = content(setter.at)
    const own = setter.kind === 'agent' && setter.id === agent.id
    const known = own
      ? agent
      : participants.status === 'ready'
        ? [...participants.value.people, ...participants.value.agents].find((one) => one.kind === setter.kind && one.id === setter.id)
        : undefined
    if (setter.kind === 'person' && actor.type === 'human' && setter.id === actor.id) setBy = t('address.setByYou', { at })
    // THE RESIDENT ITSELF IS NAMED, never given a pronoun the page chose for it.
    else if (known !== undefined) setBy = t('address.setByNamed', { name: content(known.name), at })
    else setBy = t(setter.kind === 'agent' ? 'address.setByUnknownAgent' : 'address.setByUnknownPerson', { at })
  }
  return (
    <Panel titleIs="label" declares={{ surface: 'resident.addressas' }} title={t('resident.address.title', { name: content(agent.name) })}>
      <dl className="resident-facts-plain">
        {ADDRESS_AS_PARTS.map((part) => (
          <ResidentFact
            key={part}
            label={t(`address.part.${part}`)}
            value={agent.addressAs[part] === undefined ? <span className="resident-not-set">{t('address.notSet')}</span> : content(agent.addressAs[part])}
          />
        ))}
      </dl>
      {setBy === null ? null : <p className="resident-quiet">{setBy}</p>}
    </Panel>
  )
}

/** The personal space: what it holds, where each session started, and who may read it. */
function TheSpace({
  agent,
  reading,
  listing,
  origins,
  thePerson,
  onChanged,
}: {
  agent: ParticipantOnTheWire
  reading: OneResidentReading
  listing: AsyncState<TheSpaceListing> | null
  origins: OriginsState
  thePerson: boolean
  onChanged: () => void
}) {
  const inspect = useInspect()
  const space = reading.space
  if (!space.mayRead || listing === null) {
    return (
      <Panel titleIs="label" declares={{ surface: 'resident.space' }} title={t('resident.space.title')}>
        <p className="resident-private" data-space="private">{t('resident.space.private')}</p>
      </Panel>
    )
  }
  return (
    <Panel titleIs="label" declares={{ surface: 'resident.space' }} title={t('resident.space.title')}>
      {listing.status === 'loading' ? <Loading what={t('resident.space.title')} rows={2} /> : null}
      {listing.status === 'error' ? (
        <ErrorNote message={inspect ? listing.message : t('resident.space.readFailed')} fault={inspect ? listing.fault : undefined} />
      ) : null}
      {listing.status === 'ready' ? (
        <>
          <TheSize usedBytes={listing.value.used} limitBytes={listing.value.limit} />
          <TheFiles agentId={agent.id} files={listing.value.files} thePerson={thePerson} onChanged={onChanged} />
          <TheOrigins origins={origins} />
          {space.sessionOrigins.upToDate ? null : (
            <p className="resident-quiet">{inspect ? content(space.sessionOrigins.why) : t('resident.origins.notUpToDate')}</p>
          )}
          {inspect ? <p className="resident-quiet">{content(listing.value.notes)}</p> : null}
        </>
      ) : null}
      <TheReaders agent={agent} reading={reading} grants={space.grants} thePerson={thePerson} onChanged={onChanged} />
    </Panel>
  )
}

/** The size used of the limit, as a bar and in words. */
function TheSize({ usedBytes, limitBytes }: { usedBytes: number; limitBytes: number }) {
  const share = limitBytes > 0 ? Math.min(1, usedBytes / limitBytes) : 0
  return (
    <p className="resident-size">
      <span className="resident-size-bar" aria-hidden="true">
        <span className="resident-size-used" style={{ width: `${(share * 100).toFixed(1)}%` }} />
      </span>
      <span className="resident-size-words">{t('resident.space.used', { used: bytesSaid(usedBytes), limit: bytesSaid(limitBytes) })}</span>
    </p>
  )
}

/**
 * Every file, with a void mark struck through beside its reason and its earlier versions under it, and
 * the person's press to mark a file void. Every file and version has a press that shows its text here.
 */
function TheFiles({
  agentId,
  files,
  thePerson,
  onChanged,
}: {
  agentId: string
  files: AFileInTheSpace[]
  thePerson: boolean
  onChanged: () => void
}) {
  const [voiding, setVoiding] = useState<string | null>(null)
  const [shown, setShown] = useState<string | null>(null)
  if (files.length === 0) return <p className="resident-quiet">{t('resident.space.empty')}</p>
  return (
    <table className="resident-table resident-files">
      <thead>
        <tr>
          <th scope="col">{t('resident.space.file')}</th>
          <th scope="col">{t('resident.space.size')}</th>
          <th scope="col">{t('resident.space.written')}</th>
          <th scope="col">{t('resident.space.mark')}</th>
        </tr>
      </thead>
      <tbody>
        {files.flatMap((file) => [
          <tr key={file.path} data-file={file.path} data-void={file.void === null ? 'no' : 'yes'}>
            <td data-label={t('resident.space.file')}>
              <ThePath path={file.path} voided={file.void !== null} />
              <ShowPress path={file.path} shown={shown} onShow={setShown} />
            </td>
            <td data-label={t('resident.space.size')}>{bytesSaid(file.bytes)}</td>
            <td data-label={t('resident.space.written')}>
              {file.writtenByTheOffice ? (
                <>
                  {drawnStamp(file.modified)} <span className="resident-quiet">{t('resident.space.officeWrites')}</span>
                </>
              ) : file.written === null ? (
                drawnStamp(file.modified)
              ) : (
                <WrittenBy at={file.written.at} by={file.written.by} />
              )}
            </td>
            <td data-label={t('resident.space.mark')}>
              {file.void !== null ? (
                <VoidMark mark={file.void} />
              ) : isTheSessionOriginFile(file.path) || !thePerson ? null : voiding === file.path ? (
                <VoidAFile agentId={agentId} path={file.path} onDone={() => { setVoiding(null); onChanged() }} onKeep={() => setVoiding(null)} />
              ) : (
                <Btn size="sm" variant="ghost" onClick={() => setVoiding(file.path)}>{t('resident.void.press')}</Btn>
              )}
            </td>
          </tr>,
          ...file.versions.map((version) => <VersionRow key={version.path} version={version} shown={shown} onShow={setShown} />),
          ...[file.path, ...file.versions.map((one) => one.path)]
            .filter((path) => path === shown)
            .map((path) => (
              <tr key={`${path}#text`} data-text-of={path}>
                <td colSpan={4}><TheText agentId={agentId} path={path} /></td>
              </tr>
            )),
        ])}
      </tbody>
    </table>
  )
}

/** A path, struck through when the bytes are marked void. */
function ThePath({ path, voided }: { path: string; voided: boolean }) {
  return voided ? <s className="resident-path">{content(path)}</s> : <code className="resident-path">{content(path)}</code>
}

/** The press that shows a file's text under its row, and hides it again. */
function ShowPress({ path, shown, onShow }: { path: string; shown: string | null; onShow: (path: string | null) => void }) {
  return (
    <Btn size="sm" variant="ghost" onClick={() => onShow(shown === path ? null : path)}>
      {t(shown === path ? 'resident.space.hide' : 'resident.space.read')}
    </Btn>
  )
}

/** One earlier version, under its file: readable by the space's readers, written by nobody. */
function VersionRow({ version, shown, onShow }: { version: AnEarlierVersion; shown: string | null; onShow: (path: string | null) => void }) {
  return (
    <tr data-version={version.path} data-void={version.void === null ? 'no' : 'yes'} className="resident-version">
      <td data-label={t('resident.space.file')}>
        <span className="resident-version-name">{t('resident.space.version', { n: version.number })}</span>
        <ShowPress path={version.path} shown={shown} onShow={onShow} />
      </td>
      <td data-label={t('resident.space.size')}>{bytesSaid(version.bytes)}</td>
      <td data-label={t('resident.space.written')}>
        {version.kept === null ? <span className="resident-quiet">{t('resident.unknown')}</span> : <KeptBy at={version.kept.at} by={version.kept.by} />}
      </td>
      <td data-label={t('resident.space.mark')}>{version.void === null ? null : <VoidMark mark={version.void} />}</td>
    </tr>
  )
}

function WrittenBy({ at, by }: { at: string; by: { kind: string; id: string } }) {
  const name = useNameOf(by)
  return <>{t('resident.space.writtenBy', { at: drawnStamp(at), name })}</>
}

function KeptBy({ at, by }: { at: string; by: { kind: string; id: string } }) {
  const name = useNameOf(by)
  return <>{t('resident.space.keptBy', { at: drawnStamp(at), name })}</>
}

/** A void mark: the reason, and who marked it when. */
function VoidMark({ mark }: { mark: { because: string; at: string; by: { kind: string; id: string } } }) {
  const name = useNameOf(mark.by)
  return (
    <span className="resident-void">
      <span className="resident-void-because">{t('resident.space.voidBecause', { because: content(mark.because) })}</span>
      <span className="resident-quiet">{t('resident.space.voidBy', { name, at: drawnStamp(mark.at) })}</span>
    </span>
  )
}

/** A file's text, read through the file door. A file that is not text says so and shows nothing. */
function TheText({ agentId, path }: { agentId: string; path: string }) {
  const inspect = useInspect()
  const [text] = useProjectAsync(() => api.residentSpaceFileText(agentId, path), [agentId, path])
  if (text.status === 'loading') return <Loading what={path} rows={1} />
  if (text.status === 'error') return <ErrorNote message={inspect ? text.message : t('resident.space.readFileFailed')} fault={text.fault ?? null} />
  // A FILE THAT DOES NOT READ AS TEXT holds a NUL or a character the decoder could not read.
  if (/[\u0000�]/u.test(text.value)) return <p className="resident-quiet">{t('resident.space.notText')}</p>
  return <pre className="resident-text">{content(text.value)}</pre>
}

/** The reason box and the press that marks one file void. The reason is required; the door checks it too. */
function VoidAFile({ agentId, path, onDone, onKeep }: { agentId: string; path: string; onDone: () => void; onKeep: () => void }) {
  const [because, setBecause] = useState('')
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<PressFault | null>(null)
  const said = because.trim()
  const press = (): void => {
    setFault(null)
    setBusy(true)
    api
      .voidASpaceFile(agentId, path, said)
      .then(() => {
        setBusy(false)
        onDone()
      })
      .catch((err: unknown) => {
        setBusy(false)
        setFault(pressFault(err))
      })
  }
  return (
    <div className="resident-void-form">
      <label className="resident-field">
        <span className="resident-field-label">{t('resident.void.because')}</span>
        <TextArea value={because} onChange={setBecause} rows={2} />
      </label>
      {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
      <span className="resident-acts">
        <Btn size="sm" onClick={press} disabled={busy || said === ''} reason={busy ? t('resident.working') : t('resident.void.needsAReason')}>
          {t('resident.void.save')}
        </Btn>
        <Btn size="sm" variant="ghost" onClick={onKeep} disabled={busy} reason={t('resident.working')}>
          {t('resident.void.keep')}
        </Btn>
      </span>
    </div>
  )
}

/**
 * WHERE EACH SESSION OF THE RESIDENT STARTED, one row per line of the session-origin file: when, how,
 * on which machine, where, and the command that resumes it, to copy. A field nobody recorded says
 * "unknown", and a field left out because it looked like a secret is named. A line that could not be
 * read is a row saying so, by its number.
 */
function TheOrigins({ origins }: { origins: OriginsState }) {
  const inspect = useInspect()
  if (origins.status === 'no-file') return <p className="resident-quiet">{t('resident.origins.missing')}</p>
  return (
    <section className="resident-origins" aria-label={t('resident.origins.heading')}>
      <h3 className="resident-head">{t('resident.origins.heading')}</h3>
      {origins.status === 'loading' ? <Loading what={t('resident.origins.heading')} rows={1} /> : null}
      {origins.status === 'failed' ? (
        <ErrorNote message={inspect ? origins.message : t('resident.origins.readFailed')} fault={inspect ? origins.fault : undefined} />
      ) : null}
      {origins.status === 'read' && origins.lines.length === 0 ? <p className="resident-quiet">{t('resident.origins.none')}</p> : null}
      {origins.status === 'read' && origins.lines.length > 0 ? (
        <table className="resident-table resident-origin-table">
          <thead>
            <tr>
              <th scope="col">{t('resident.origins.started')}</th>
              <th scope="col">{t('resident.origins.how')}</th>
              <th scope="col">{t('resident.origins.machine')}</th>
              <th scope="col">{t('resident.origins.where')}</th>
              <th scope="col">{t('resident.origins.resume')}</th>
            </tr>
          </thead>
          <tbody>
            {origins.lines.map((read, index) =>
              read.ok ? (
                <OriginRow key={index} line={read.line} />
              ) : (
                <tr key={index} data-origin="unreadable">
                  <td colSpan={5}>{t('resident.origins.unreadable', { n: read.lineNumber })}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      ) : null}
    </section>
  )
}

/** One session start. Each value is drawn as recorded, and a value nobody recorded says "unknown". */
function OriginRow({ line }: { line: ASessionOrigin }) {
  const unknown = <span className="resident-unknown" data-unknown="yes">{t('resident.unknown')}</span>
  const said = (value: string | null) => (value === null ? unknown : content(value))
  const how = line.how
  return (
    <tr data-origin="read">
      <td data-label={t('resident.origins.started')}>
        {line.startedAt === null ? unknown : drawnStamp(line.startedAt)}
        <span className="resident-origin-part">
          <RouteLink to={sessionPath(line.sessionRecordId)}>{t('resident.origins.theRun')}</RouteLink>
        </span>
      </td>
      <td data-label={t('resident.origins.how')}>
        <span className="resident-origin-part">{said(line.runtime)}</span>
        <span className="resident-origin-part">{said(line.model)}</span>
        <span className="resident-origin-part">
          {how.startedByMoleOffice === null ? unknown : t(how.startedByMoleOffice ? 'resident.origins.startedByOffice' : 'resident.origins.notStartedByOffice')}
        </span>
        {how.entryPoint === null ? null : <span className="resident-origin-part">{t('resident.origins.entryPoint', { how: content(how.entryPoint) })}</span>}
        {how.sandbox === null ? null : <span className="resident-origin-part">{t('resident.origins.sandbox', { name: content(how.sandbox) })}</span>}
        {how.terminal === null ? null : <span className="resident-origin-part">{t('resident.origins.terminal', { where: content(how.terminal) })}</span>}
      </td>
      <td data-label={t('resident.origins.machine')}>{said(line.host)}</td>
      <td data-label={t('resident.origins.where')}>
        <span className="resident-origin-part">{line.cwd === null ? unknown : <code>{content(line.cwd)}</code>}</span>
        <span className="resident-origin-part">
          {line.checkout === null ? unknown : t('resident.origins.cutFrom', { branch: content(line.checkout.cutFrom) })}
        </span>
      </td>
      <td data-label={t('resident.origins.resume')}>
        {line.resumeCommand === null ? unknown : (
          <CommandLine label="" command={line.resumeCommand} what={t('resident.origins.resumeCommand')} />
        )}
        {line.withheld.length === 0 ? null : (
          <span className="resident-quiet resident-origin-part">{t('resident.origins.withheld', { fields: line.withheld.join(', ') })}</span>
        )}
      </td>
    </tr>
  )
}

/**
 * WHO MAY READ THE SPACE, AND UNTIL WHEN. The owner always; the resident, which reads and writes it
 * until it retires; each grant of leave with who gave it and its date, and each end; every other agent
 * not at all; and after retirement the successor the owner names.
 */
function TheReaders({
  agent,
  reading,
  grants,
  thePerson,
  onChanged,
}: {
  agent: ParticipantOnTheWire
  reading: OneResidentReading
  grants: AGrant[]
  thePerson: boolean
  onChanged: () => void
}) {
  const name = content(agent.name)
  const resident = reading.resident
  return (
    <section className="resident-readers" aria-label={t('resident.readers.heading')}>
      <h3 className="resident-head">{t('resident.readers.heading')}</h3>
      <dl className="resident-facts-plain">
        <ResidentFact label={t(thePerson ? 'resident.readers.you' : 'resident.readers.owner')} value={t('resident.readers.ownerReads')} />
        <ResidentFact label={name} value={t(resident.retired ? 'resident.readers.residentRetired' : 'resident.readers.residentReadsWrites')} />
        {grants.map((grant) => (
          <GrantRow key={grant.id} agentId={agent.id} grant={grant} thePerson={thePerson} onChanged={onChanged} />
        ))}
        <ResidentFact label={t('resident.readers.everyOther')} value={t('resident.readers.everyOtherValue')} />
        {!resident.retired ? (
          <ResidentFact label={t('resident.readers.afterRetiring', { name })} value={t('resident.readers.afterRetiringValue')} />
        ) : (
          <ResidentFact
            label={t('resident.readers.successor')}
            value={
              resident.successor !== null ? (
                <SuccessorWords successor={resident.successor} />
              ) : (
                <>
                  <span className="resident-quiet">{t('resident.readers.noSuccessor')}</span>
                  {thePerson ? <NameASuccessor resident={agent.id} onChanged={onChanged} /> : null}
                </>
              )
            }
          />
        )}
      </dl>
    </section>
  )
}

function SuccessorWords({ successor }: { successor: NonNullable<OneResidentReading['resident']['successor']> }) {
  const named = useNameOf({ kind: 'agent', id: successor.agentId })
  const by = useNameOf(successor.namedBy)
  const name = successor.name !== null ? content(successor.name) : named
  return <>{t('resident.readers.successorValue', { name, by, at: drawnStamp(successor.namedAt) })}</>
}

/** One grant's row, labelled with the agent it lets read. */
function GrantRow(props: { agentId: string; grant: AGrant; thePerson: boolean; onChanged: () => void }) {
  const reader = useNameOf({ kind: 'agent', id: props.grant.readerId })
  return <ResidentFact label={reader} value={<TheGrant {...props} />} />
}

/**
 * One grant: holding, with its date and the press that ends it; or ended, with who ended it; or over
 * because its date came; or over because the resident retired.
 */
function TheGrant({ agentId, grant, thePerson, onChanged }: { agentId: string; grant: AGrant; thePerson: boolean; onChanged: () => void }) {
  const by = useNameOf(grant.givenBy)
  const endedBy = useNameOf(grant.ended?.by ?? null)
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<PressFault | null>(null)
  if (grant.ended !== null) {
    return <span className="resident-quiet" data-grant="ended">{t('resident.readers.grantEnded', { by: endedBy, at: drawnStamp(grant.ended.at) })}</span>
  }
  if (!grant.holds) {
    const until = parseAnyStamp(grant.until)
    const ranOut = until !== null && until.getTime() <= Date.now()
    return (
      <span className="resident-quiet" data-grant={ranOut ? 'ran-out' : 'stopped'}>
        {ranOut ? t('resident.readers.grantRanOut', { until: drawnStamp(grant.until) }) : t('resident.readers.grantStopped')}
      </span>
    )
  }
  const end = (): void => {
    setFault(null)
    setBusy(true)
    api
      .endASpaceGrant(agentId, grant.id)
      .then(() => {
        setBusy(false)
        onChanged()
      })
      .catch((err: unknown) => {
        setBusy(false)
        setFault(pressFault(err))
      })
  }
  return (
    <span className="resident-grant" data-grant="live">
      {t('resident.readers.grant', { by, at: drawnStamp(grant.givenAt), until: drawnStamp(grant.until) })}
      {thePerson ? (
        <Btn size="sm" variant="ghost" onClick={end} disabled={busy} reason={t('resident.working')}>
          {t('resident.grant.end')}
        </Btn>
      ) : null}
      {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
    </span>
  )
}

/**
 * THE PERSON NAMES THE AGENT THAT MAY READ A RETIRED RESIDENT'S SPACE. Any live agent but the resident.
 * Taking the retired agent's handle makes no agent the successor; only this press does.
 */
function NameASuccessor({ resident, onChanged }: { resident: string; onChanged: () => void }) {
  const inspect = useInspect()
  const [participants, readAgain] = useProjectAsync(readParticipantsOnce, [])
  const [open, setOpen] = useState(false)
  const [chosen, setChosen] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<PressFault | null>(null)
  if (!open) {
    return <Btn size="sm" onClick={() => setOpen(true)}>{t('resident.successor.choose')}</Btn>
  }
  if (participants.status === 'loading') return <Loading what={t('resident.successor.pick')} rows={1} />
  if (participants.status === 'error') {
    return <ErrorNote message={inspect ? participants.message : t('resident.successor.readFailed')} fault={inspect ? participants.fault : undefined} retry={readAgain} />
  }
  const choosable = participants.value.agents.filter((one) => one.id !== resident && one.retired !== true)
  if (choosable.length === 0) return <span className="resident-quiet">{t('resident.successor.nobodyToName')}</span>
  const pick = choosable.find((one) => one.id === chosen) ?? choosable[0]!
  const press = (): void => {
    setFault(null)
    setBusy(true)
    api
      .nameASuccessor(resident, pick.id)
      .then(() => {
        setBusy(false)
        onChanged()
      })
      .catch((err: unknown) => {
        setBusy(false)
        setFault(pressFault(err))
      })
  }
  return (
    <span className="resident-successor-form">
      <Select
        aria-label={t('resident.successor.pick')}
        value={pick.id}
        onChange={setChosen}
        options={choosable.map((one) => ({ value: one.id, label: content(one.name) }))}
      />
      <Btn size="sm" variant="primary" onClick={press} disabled={busy} reason={t('resident.working')}>
        {t('resident.successor.save', { name: content(pick.name) })}
      </Btn>
      {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
    </span>
  )
}

/**
 * Tables that become one labelled block per row in a narrow box, so a phone at 390 never scrolls
 * sideways. No backtick in this string.
 */
const RESIDENT_SECTION_CSS = `
.resident-section { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; container-type: inline-size; container-name: resident-section; }
.resident-facts-plain { margin: 0; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.resident-head {
  margin: var(--pad) 0 4px; color: var(--text-3); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui);
  letter-spacing: .06em; text-transform: uppercase;
}
.resident-quiet, .resident-not-set { color: var(--text-3); font-size: var(--fs-1); }
.resident-not-set { font-style: italic; }
.resident-private { margin: 0; color: var(--text-2); font-size: var(--fs-2); }
.resident-unknown { color: var(--text-3); font-style: italic; }
.resident-size { margin: 0 0 var(--pad); display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad); min-width: 0; }
.resident-size-bar { display: inline-block; width: min(22rem, 100%); height: 8px; border-radius: 4px; background: var(--hover); border: var(--border-w) solid var(--border); overflow: hidden; }
.resident-size-used { display: block; height: 100%; background: var(--accent); }
.resident-size-words { font-size: var(--fs-2); color: var(--text); }
.resident-table { width: 100%; border-collapse: collapse; font-size: var(--fs-2); }
.resident-table th { text-align: left; color: var(--text-3); font-size: var(--fs-1); font-weight: 600; padding: 4px 8px 4px 0; border-bottom: var(--border-w) solid var(--border); }
.resident-table td { padding: 6px 8px 6px 0; vertical-align: top; border-bottom: var(--border-w) solid var(--border); color: var(--text); overflow-wrap: anywhere; min-width: 0; }
.resident-version td:first-child { padding-left: var(--pad); }
.resident-version-name { color: var(--text-2); font-size: var(--fs-1); margin-right: 6px; }
.resident-path { font-family: var(--font-mono); font-size: var(--fs-1); margin-right: 6px; }
s.resident-path { color: var(--text-3); }
.resident-text { margin: 0; max-height: 18rem; overflow-y: auto; padding: var(--pad); background: var(--hover); border-radius: var(--radius-sm); font: var(--fs-1)/1.5 var(--font-mono); white-space: pre-wrap; overflow-wrap: anywhere; }
.resident-void { display: flex; flex-direction: column; gap: 2px; }
.resident-void-because { font-weight: 600; }
.resident-void-form, .resident-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.resident-field-label { color: var(--text-3); font-size: var(--fs-1); }
.resident-acts, .resident-grant { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0; }
.resident-successor-form { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0; margin-top: 6px; }
.resident-readers .resident-quiet + .px-btn, .resident-readers .resident-quiet + button { margin-left: 8px; }
.resident-origin-part { display: block; }
@container resident-section (max-width: 40rem) {
  .resident-table thead { display: none; }
  .resident-table, .resident-table tbody, .resident-table tr, .resident-table td { display: block; width: 100%; }
  .resident-table tr { padding: 6px 0; border-bottom: var(--border-w) solid var(--border); }
  .resident-table td { border-bottom: 0; padding: 2px 0; }
  .resident-table td[data-label]::before { content: attr(data-label); display: block; color: var(--text-3); font-size: var(--fs-1); }
  .resident-version td:first-child { padding-left: 0; }
}
`
