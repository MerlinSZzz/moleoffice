// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DEPARTMENTS OF A PROJECT, wave 13s round 281, step 1 of departments and posts. `#/departments` is the tree of the
 * project's departments; `#/departments/<id>` is one department with the departments directly under it and its history.
 * The board's view by line leads here, and a lane titled by a department opens that department.
 *
 * IT OPENS AS A READING. The form that files a department or changes one is drawn only after a press, because a page
 * opens as a reading (tests/read-before-edit.test.ts). Who may write is the server's to decide
 * (src/server/lib/grant/departments.ts): the person, by their own press. A refusal is drawn in the server's words.
 *
 * THE LEVEL WORD, THE TEAM COUNT, THE LEADER, THE HEAD, THE ORDER AND THE PROJECT'S COUNTS ARE THE SERVER'S. This page
 * draws what the doors answer (src/server/lib/departments.ts) and works none of them out. Which leader a row names is
 * the page's own, since it is only a matter of what is drawn: `theLeaderToShow` holds that rule.
 *
 * A WRITE SENDS THE WHOLE DEPARTMENT, since the door replaces it: the form starts from every field the department holds,
 * and the decisions it rests on, which the form does not show, are sent back as they were.
 */
import { Fragment, useState } from 'react'
import { t, type WordKey } from '@shared/i18n.ts'
import {
  DEPARTMENT_KIND,
  DEPARTMENT_STATES,
  DEPARTMENTS_ON_A_PAGE_AT_MOST,
  type ADepartmentWritten,
  type DepartmentData,
  type DepartmentNode,
  type DepartmentRead,
  type DepartmentState,
  type OneDepartment,
  type TheHead,
  type TheLeader,
  type TheProject,
} from '@shared/departments.ts'
import { THE_SUPERVISOR } from '@shared/roles.ts'
import { actorTypeWord, stateWord } from '@shared/words.ts'
import { api, errorMessage, faultOf, type Fault } from '../api.ts'
import { AgentPicker, type AnAgentToPick } from '../components/agent/AgentPicker.tsx'
import { whatThisVersionIs } from '../components/RecordHistory.tsx'
import { departmentPath, navigate, RouteLink } from '../components/router.tsx'
import { Btn, Empty, ErrorNote, Field, Loading, Select, Stamp, TextArea, TextInput } from '../components/ui.tsx'
import { theDoesShown, theLevelShown, theNameShown } from '../lib/department-words.ts'
import { useLanguage } from '../lib/language.ts'
import { readParticipantsOnce } from '../lib/oneread.ts'
import { useProjectAsync } from '../lib/project-async.ts'
import { ParticipantName } from './NotebookPage.tsx'

/** Why a department has no leader, in the reader's words, one word for each state the server gives. */
const NO_LEADER_WORDS: Readonly<Record<Exclude<TheLeader['state'], 'recorded'>, WordKey>> = {
  'no-supervisor': 'departments.leader.noSupervisor',
  'supervisor-not-in-the-registry': 'departments.leader.notInRegistry',
  'owner-not-recorded': 'departments.leader.notRecorded',
  'owner-unreadable': 'departments.leader.unreadable',
}

export function DepartmentsPage({ id }: { id?: string }) {
  useLanguage()
  return (
    <div className="page dp">
      <style href="mole-office-departments-page" precedence="default">
        {DEPARTMENTS_PAGE_CSS}
      </style>
      <h1 className="dp-title" data-title-is="its-label">
        {t('departments.title')}
      </h1>
      {id === undefined ? <TheTree /> : <OneDepartmentOpened key={id} id={id} />}
    </div>
  )
}

/**
 * The top departments, a page at a time, each with every department under it, all under the project's row. The tree is
 * a nested list, so a screen reader reads a list; its rows share their columns through subgrid where the window is wide
 * enough (DEPARTMENTS_PAGE_CSS). The column headings are hidden from a screen reader, which reads the in-charge words in
 * each row instead.
 */
function TheTree() {
  const [offset, setOffset] = useState(0)
  const [adding, setAdding] = useState(false)
  const [state, reload] = useProjectAsync(() => api.departments(offset), [offset])
  if (state.status === 'loading') return <Loading label={t('departments.title')} rows={3} />
  if (state.status === 'error') return <ErrorNote message={state.message} fault={state.fault ?? null} retry={reload} />
  const read = state.value
  const last = Math.min(read.offset + read.limit, read.total)
  return (
    <>
      {adding ? (
        <DepartmentForm
          start={null}
          under={null}
          onWritten={(written) => navigate(departmentPath(written.department.id))}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <p className="dp-presses">
          <Btn onClick={() => setAdding(true)}>{t('departments.add')}</Btn>
        </p>
      )}
      {read.departments === null ? (
        <Empty message={t('departments.none')} />
      ) : (
        <div className="dp-table">
          <p className="dp-heads" aria-hidden="true">
            <span />
            <span>{t('departments.tree.inCharge')}</span>
            <span>{t('departments.fact.state')}</span>
            <span className="dp-heads-does">{t('departments.tree.does')}</span>
          </p>
          <ul className="dp-tree">
            <li className="dp-node dp-project">
              <TheProjectRow project={read.project} />
              <ul className="dp-tree">
                {read.departments.map((node) => (
                  <ANode key={node.id} node={node} parentHead={null} />
                ))}
              </ul>
            </li>
          </ul>
        </div>
      )}
      {read.total > read.limit ? (
        <p className="dp-presses">
          <Btn disabled={read.offset === 0} reason={t('departments.page.first')} onClick={() => setOffset(Math.max(0, read.offset - read.limit))}>
            {t('departments.page.previous')}
          </Btn>
          <span className="dp-quiet">{t('departments.page.shown', { from: read.offset + 1, to: last, total: read.total })}</span>
          <Btn disabled={last >= read.total} reason={t('departments.page.last')} onClick={() => setOffset(read.offset + read.limit)}>
            {t('departments.page.next')}
          </Btn>
        </p>
      ) : null}
    </>
  )
}

/** One department in the tree, and the departments under it, each read against this one's head. */
function ANode({ node, parentHead }: { node: DepartmentNode; parentHead: TheHead | null }) {
  return (
    <li className="dp-node" data-department={node.id}>
      <ADepartmentRead department={node} parentHead={parentHead} />
      {node.subDepartments.length === 0 ? null : (
        <ul className="dp-tree">
          {node.subDepartments.map((sub) => (
            <ANode key={sub.id} node={sub} parentHead={node.head} />
          ))}
        </ul>
      )}
    </li>
  )
}

/** The project the top departments belong to, on top of the tree: its title, the office owner, no state, and its counts. */
function TheProjectRow({ project }: { project: TheProject }) {
  return (
    <div className="dp-tree-row">
      <p className="dp-name">
        {project.title} <span className="dp-quiet">{t('departments.tree.project')}</span>
      </p>
      <p className="dp-charge">
        <TheChargeLabel />
        <span className="dp-who">
          <ParticipantName kind={project.owner.kind} id={project.owner.id} />
        </span>
      </p>
      <p className="dp-state dp-quiet">{t('departments.tree.noState')}</p>
      <p className="dp-does">
        {t('departments.tree.counts', {
          departments: t('departments.tree.departments', { n: project.departments }),
          teams: t('departments.tree.teams', { n: project.teams }),
        })}
      </p>
    </div>
  )
}

/**
 * A department as a row reads it: its name as a link with its codes after it, who is in charge, its state and what it
 * does, cut to one line; the whole of what it does is on the department's own page. The level word is on the
 * department's own page and not here.
 *
 * WHO IS IN CHARGE is the department's head where departments are under it, otherwise its supervisor, otherwise that
 * none is stored. Its leader follows by L-b (`theLeaderToShow`), in the normal weight, because somebody may need to act.
 * A running department's state is drawn quiet; a resting or merged one is not, because it is the exception.
 */
function ADepartmentRead({ department, parentHead }: { department: DepartmentRead; parentHead: TheHead | null }) {
  const leader = theLeaderToShow(department.leader, parentHead)
  return (
    <div className="dp-tree-row">
      <p className="dp-name">
        <RouteLink to={departmentPath(department.id)}>{theNameShown(department.name)}</RouteLink>
        {department.codes.length === 0 ? null : (
          <>
            {' '}
            <span className="dp-codes dp-quiet">{department.codes.join(' ')}</span>
          </>
        )}
      </p>
      <p className="dp-charge">
        <TheChargeLabel />
        <span className="dp-who">
          <WhoIsInCharge department={department} />
        </span>
        {leader === null ? null : (
          <span className="dp-leader">
            {t('departments.tree.leaderIs')} <TheLeaderShown leader={leader} />
          </span>
        )}
      </p>
      <p className={department.state === 'running' ? 'dp-state dp-quiet' : 'dp-state'}>{stateWord(department.state, 'normal', DEPARTMENT_KIND).text}</p>
      <p className="dp-does">{theDoesShown(department.does)}</p>
    </div>
  )
}

/** The in-charge words a row's in-charge cell starts with: drawn where the columns stop, and read aloud where they line up. */
function TheChargeLabel() {
  return (
    <>
      <span className="dp-charge-label">{t('departments.tree.inChargeIs')}</span>{' '}
    </>
  )
}

function WhoIsInCharge({ department }: { department: DepartmentRead }) {
  if (department.head !== null) return <TheHeadShown head={department.head} />
  if (department.supervisor === null) return <>{t('departments.tree.noneStored')}</>
  return <ParticipantName kind={department.supervisor.kind} id={department.supervisor.id} />
}

/** A department's head in the reader's words: the leader its lines agree on, each leader where they disagree, or that none has one. */
function TheHeadShown({ head }: { head: TheHead }) {
  if (head.state === 'agreed') {
    return (
      <>
        <ParticipantName kind={head.leader.kind} id={head.leader.id} /> <span className="dp-quiet">{t('departments.head.fromItsLines')}</span>
      </>
    )
  }
  if (head.state === 'the-lines-disagree') {
    return (
      <>
        {t('departments.head.disagree')}{' '}
        {head.leaders.map((one, at) => (
          <Fragment key={[one.leader.kind, one.leader.id].join(':')}>
            {at === 0 ? null : t('departments.head.separator')}
            <ParticipantName kind={one.leader.kind} id={one.leader.id} />
          </Fragment>
        ))}
      </>
    )
  }
  return <>{t('departments.head.none')}</>
}

/**
 * THE LEADER A ROW NAMES, BY L-b: none where its parent's head is agreed and is this same leader, and none where the
 * department has no supervisor. A department with no supervisor that nobody heads already says none stored in its
 * in-charge cell; one whose lines give it a head says on its own page that it has no supervisor. Every other state is
 * named, so a line whose leader is not recorded says so.
 */
function theLeaderToShow(leader: TheLeader, parentHead: TheHead | null): TheLeader | null {
  if (leader.state === 'no-supervisor') return null
  if (leader.state !== 'recorded' || parentHead?.state !== 'agreed') return leader
  return parentHead.leader.kind === leader.leader.kind && parentHead.leader.id === leader.leader.id ? null : leader
}

function TheSupervisor({ department }: { department: DepartmentRead }) {
  if (department.supervisor === null) return <>{t('departments.leader.noSupervisor')}</>
  return <ParticipantName kind={department.supervisor.kind} id={department.supervisor.id} />
}

/** A department's leader, or why it has none, in the normal weight wherever it is drawn. */
function TheLeaderShown({ leader }: { leader: TheLeader }) {
  if (leader.state === 'recorded') return <ParticipantName kind={leader.leader.kind} id={leader.leader.id} />
  return <>{t(NO_LEADER_WORDS[leader.state])}</>
}

/** Another department, named in the reader's language and opened by a press. */
function ADepartmentNamed({ id }: { id: string }) {
  const [state, reload] = useProjectAsync(() => api.department(id), [id])
  if (state.status === 'loading') return <Loading label={t('departments.title')} rows={1} />
  if (state.status === 'error') return <ErrorNote message={state.message} fault={state.fault ?? null} retry={reload} />
  return <RouteLink to={departmentPath(id)}>{theNameShown(state.value.department.name)}</RouteLink>
}

/** One department: its facts, the departments directly under it, and its history, with the presses that change it. */
function OneDepartmentOpened({ id }: { id: string }) {
  const [state, reload] = useProjectAsync(() => api.department(id), [id])
  const [writing, setWriting] = useState<'change' | 'under' | null>(null)
  if (state.status === 'loading') return <Loading label={t('departments.title')} rows={3} />
  if (state.status === 'error') return <ErrorNote message={state.message} fault={state.fault ?? null} retry={reload} />
  const { department, subDepartments, history } = state.value
  const merged = department.state === 'merged'
  return (
    <div className="dp-one" data-department={department.id}>
      <p className="dp-back">
        <RouteLink to={departmentPath()}>{t('departments.all')}</RouteLink>
      </p>
      <h2 className="dp-heading">
        {theNameShown(department.name)} <span className="dp-quiet">{theLevelShown(department.level, department.teams)}</span>
      </h2>
      <p className="dp-does">{theDoesShown(department.does)}</p>
      <dl className="dp-facts">
        <dt>{t('record.section.codes')}</dt>
        <dd>
          {department.codes.length === 0
            ? t('departments.codes.none')
            : department.codes.map((code) => (
                <code key={code} className="dp-code">
                  {code}
                </code>
              ))}
        </dd>
        <dt>{t('record.section.parent')}</dt>
        <dd>{department.parent === null ? t('departments.parent.none') : <ADepartmentNamed id={department.parent} />}</dd>
        <dt>{t('record.section.supervisor')}</dt>
        <dd>
          <TheSupervisor department={department} />
        </dd>
        <dt>{t('departments.fact.leader')}</dt>
        <dd>
          <TheLeaderShown leader={department.leader} />
        </dd>
        <dt>{t('departments.fact.state')}</dt>
        <dd>{stateWord(department.state, 'normal', DEPARTMENT_KIND).text}</dd>
        {merged ? (
          <>
            <dt>{t('record.section.mergedInto')}</dt>
            <dd>{department.mergedInto === null ? t('departments.mergedInto.none') : <ADepartmentNamed id={department.mergedInto} />}</dd>
          </>
        ) : null}
      </dl>
      {writing === null ? (
        <p className="dp-presses">
          <Btn onClick={() => setWriting('change')}>{t('departments.change')}</Btn>
          <Btn onClick={() => setWriting('under')}>{t('departments.addUnder')}</Btn>
        </p>
      ) : (
        <DepartmentForm
          key={writing}
          start={writing === 'change' ? department : null}
          under={writing === 'under' ? department.id : null}
          onWritten={(written) => {
            setWriting(null)
            if (writing === 'under') navigate(departmentPath(written.department.id))
            else reload()
          }}
          onCancel={() => setWriting(null)}
        />
      )}
      <h3 className="dp-part-title">{t('departments.sub')}</h3>
      {subDepartments.length === 0 ? (
        <p className="dp-quiet">{t('departments.sub.none')}</p>
      ) : (
        <ul className="dp-tree">
          {subDepartments.map((sub) => (
            <li key={sub.id} className="dp-node" data-department={sub.id}>
              <ADepartmentRead department={sub} parentHead={department.head} />
            </li>
          ))}
        </ul>
      )}
      <h3 className="dp-part-title">{t('departments.history')}</h3>
      <TheHistory history={history} />
    </div>
  )
}

/** The department's revisions, newest first: what each did, when, who wrote it and the person's words it was written on. */
function TheHistory({ history }: { history: OneDepartment['history'] }) {
  return (
    <>
      <ol className="dp-history">
        {history.revisions.map((revision) => (
          <li key={revision.seq}>
            <span>{whatThisVersionIs(revision).told}</span> <Stamp at={revision.at} />{' '}
            <span className="dp-quiet">
              <TheWriter who={revision.who} />
            </span>
            {revision.onTheWordsOf === null ? null : (
              <blockquote className="dp-words">{t('departments.history.words', { words: revision.onTheWordsOf.words })}</blockquote>
            )}
          </li>
        ))}
      </ol>
      {history.truncated ? (
        <p className="dp-quiet">{t('departments.history.older', { n: history.count - history.revisions.length })}</p>
      ) : null}
    </>
  )
}

/** Who wrote one revision: the agent the server resolved, the person, or the word for a writer that is neither. */
function TheWriter({ who }: { who: OneDepartment['history']['revisions'][number]['who'] }) {
  if (who.agent !== null) return <ParticipantName kind="agent" id={who.agent} />
  if (who.actorType === 'human') return <ParticipantName kind="person" id={who.actorId} />
  return <>{actorTypeWord(who.actorType).text}</>
}

/** The codes a person typed, split on spaces and commas, each once, in the order typed. */
function theCodesIn(typed: string): string[] {
  return [...new Set(typed.split(/[\s,，、]+/u).filter((one) => one !== ''))]
}

/** Every department of a tree in order, each with how deep it is, leaving out `without` and every department under it. */
function everyDepartmentIn(nodes: readonly DepartmentNode[], without: string | null, depth = 0): { department: DepartmentRead; depth: number }[] {
  return nodes
    .filter((node) => node.id !== without)
    .flatMap((node) => [{ department: node, depth }, ...everyDepartmentIn(node.subDepartments, without, depth + 1)])
}

interface DepartmentFormProps {
  /** The department being changed, or null when a new one is filed. */
  start: DepartmentRead | null
  /** The department a new one is filed under, or null for a top department. */
  under: string | null
  onWritten: (written: ADepartmentWritten) => void
  onCancel: () => void
}

/** Files a department, or writes one whole. */
function DepartmentForm({ start, under, onWritten, onCancel }: DepartmentFormProps) {
  const [nameEn, setNameEn] = useState(start?.name.en ?? '')
  const [nameZh, setNameZh] = useState(start?.name.zh ?? '')
  const [doesEn, setDoesEn] = useState(start?.does.en ?? '')
  const [doesZh, setDoesZh] = useState(start?.does.zh ?? '')
  const [codes, setCodes] = useState(start?.codes.join(' ') ?? '')
  const [parent, setParent] = useState(start === null ? (under ?? '') : (start.parent ?? ''))
  const [supervisor, setSupervisor] = useState(start?.supervisor?.id ?? '')
  const [state, setState] = useState<DepartmentState>(start?.state ?? 'running')
  const [mergedInto, setMergedInto] = useState(start?.mergedInto ?? '')
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<{ message: string; fault: Fault | null } | null>(null)
  const [departments, readDepartmentsAgain] = useProjectAsync(() => api.departments(0, DEPARTMENTS_ON_A_PAGE_AT_MOST), [])
  const [people] = useProjectAsync(readParticipantsOnce, [])
  const codesRead = theCodesIn(codes)
  const named = nameEn.trim() !== '' || nameZh.trim() !== ''

  const save = (): void => {
    const department: DepartmentData = {
      ...(codesRead.length === 0 ? {} : { codes: codesRead }),
      ...(nameEn.trim() === '' ? {} : { nameEn: nameEn.trim() }),
      ...(nameZh.trim() === '' ? {} : { nameZh: nameZh.trim() }),
      ...(doesEn.trim() === '' ? {} : { doesEn: doesEn.trim() }),
      ...(doesZh.trim() === '' ? {} : { doesZh: doesZh.trim() }),
      ...(parent === '' ? {} : { parent }),
      ...(supervisor === '' ? {} : { supervisor: { kind: 'agent' as const, id: supervisor } }),
      state,
      ...(state === 'merged' && mergedInto !== '' ? { mergedInto } : {}),
      ...(start === null || start.restsOn.length === 0 ? {} : { restsOn: start.restsOn }),
    }
    setBusy(true)
    setRefused(null)
    const asked = start === null ? api.fileADepartment(department) : api.writeADepartment(start.id, department)
    void asked
      .then((written) => {
        setBusy(false)
        onWritten(written)
      })
      .catch((err: unknown) => {
        setBusy(false)
        setRefused({ message: errorMessage(err), fault: faultOf(err) })
      })
  }

  const supervisors: AnAgentToPick[] =
    people.status === 'ready'
      ? people.value.agents
          .filter((agent) => agent.role === THE_SUPERVISOR && agent.retired !== true)
          .map((agent) => ({ kind: 'agent' as const, id: agent.id }))
      : []
  // The supervisor it has now stays offered, so the picker draws it as chosen even where it has left the card since.
  const now = start?.supervisor ?? null
  if (now !== null && !supervisors.some((one) => one.id === now.id)) supervisors.push({ kind: 'agent', id: now.id })

  return (
    <div className="dp-form" role="group" aria-label={t(start === null ? 'departments.add' : 'departments.change')}>
      <Field label={t('record.section.nameEn')} optional>
        <TextInput value={nameEn} onChange={setNameEn} />
      </Field>
      <Field label={t('record.section.nameZh')} optional>
        <TextInput value={nameZh} onChange={setNameZh} />
      </Field>
      <Field label={t('record.section.doesEn')} optional>
        <TextArea value={doesEn} onChange={setDoesEn} />
      </Field>
      <Field label={t('record.section.doesZh')} optional>
        <TextArea value={doesZh} onChange={setDoesZh} />
      </Field>
      <Field label={t('record.section.codes')} optional>
        <TextInput value={codes} onChange={setCodes} mono />
      </Field>
      <p className="dp-quiet">{codesRead.length === 0 ? t('departments.form.noCodes') : t('departments.form.codesRead', { codes: codesRead.join(' · ') })}</p>
      {departments.status === 'loading' ? <Loading label={t('record.section.parent')} rows={1} /> : null}
      {departments.status === 'error' ? (
        <ErrorNote message={departments.message} fault={departments.fault ?? null} retry={readDepartmentsAgain} />
      ) : null}
      {departments.status === 'ready' ? (
        <TheDepartmentChoices
          read={departments.value}
          without={start?.id ?? null}
          parent={parent}
          onParent={setParent}
          state={state}
          onState={setState}
          mergedInto={mergedInto}
          onMergedInto={setMergedInto}
        />
      ) : null}
      {people.status === 'error' ? <ErrorNote message={people.message} fault={people.fault ?? null} /> : null}
      <AgentPicker
        label={t('record.section.supervisor')}
        candidates={supervisors}
        chosen={supervisor}
        onChoose={setSupervisor}
        fixed={[{ value: '', name: t('departments.form.noSupervisor') }]}
      />
      {refused === null ? null : <ErrorNote label={t('departments.form.refused')} message={refused.message} fault={refused.fault} />}
      <p className="dp-presses">
        <Btn variant="primary" onClick={save} disabled={!named} reason={t('departments.form.needsAName')} pending={busy}>
          {t('departments.form.save')}
        </Btn>
        <Btn variant="ghost" onClick={onCancel}>
          {t('departments.form.cancel')}
        </Btn>
      </p>
    </div>
  )
}

interface TheDepartmentChoicesProps {
  read: { departments: DepartmentNode[] | null; total: number; limit: number }
  /** The department being changed, which may sit under none of its own and is offered as no choice. */
  without: string | null
  parent: string
  onParent: (parent: string) => void
  state: DepartmentState
  onState: (state: DepartmentState) => void
  mergedInto: string
  onMergedInto: (mergedInto: string) => void
}

/** The department a department sits under, its state, and the department a merged one went into. */
function TheDepartmentChoices(props: TheDepartmentChoicesProps) {
  const offered = everyDepartmentIn(props.read.departments ?? [], props.without).map(({ department, depth }) => ({
    value: department.id,
    label: `${'· '.repeat(depth)}${theNameShown(department.name)}`,
  }))
  // A department already named that this page could not offer stays chosen, under a word that says so.
  const kept = (chosen: string) => (chosen === '' || offered.some((one) => one.value === chosen) ? [] : [{ value: chosen, label: t('departments.form.notOffered') }])
  const parents = [{ value: '', label: t('departments.form.top') }, ...kept(props.parent), ...offered]
  const into = [{ value: '', label: t('departments.form.chooseOne') }, ...kept(props.mergedInto), ...offered]
  const states = DEPARTMENT_STATES.map((one) => ({ value: one, label: stateWord(one, 'normal', DEPARTMENT_KIND).text }))
  return (
    <>
      <Field label={t('record.section.parent')}>
        <Select value={props.parent} onChange={props.onParent} options={parents} />
      </Field>
      {props.read.total > props.read.limit ? <p className="dp-quiet">{t('departments.form.notAllOffered', { n: props.read.limit })}</p> : null}
      <Field label={t('departments.fact.state')}>
        <Select value={props.state} onChange={props.onState} options={states} />
      </Field>
      {props.state === 'merged' ? (
        <Field label={t('record.section.mergedInto')}>
          <Select value={props.mergedInto} onChange={props.onMergedInto} options={into} />
        </Field>
      ) : null}
    </>
  )
}

/**
 * THE TREE'S COLUMNS. Below 60rem each row wraps: its name and codes with its state after them, the state going to the
 * next line only when the name is long; then who is in charge on a line of its own after its in-charge words; then what
 * it does. From 60rem the rows line up in three columns through subgrid, shared down the nested lists, with what it does
 * on a line of its own below; from 80rem what it does takes a fourth column. The cells keep the reading order name, in
 * charge, state, what it does: the narrow rows move the state by `order`, and the columns put it back.
 * A nested list's indent and border move only the first column, since a subgrid adds its padding to its edge tracks.
 *
 * WHAT IT DOES IS ONE LINE IN A ROW, cut with an ellipsis by CSS alone, so the element holds the whole text and the
 * department's own page draws all of it. Its width comes from its row and not from its text (`contain: inline-size`),
 * so a long text cannot widen the tree's columns or the page.
 */
const DEPARTMENTS_PAGE_CSS = `
.dp { display: grid; gap: var(--gut); min-width: 0; }
.dp-title { margin: 0; }
.dp-heading { margin: 0; font: 600 var(--fs-3, var(--fs-2))/var(--lh-tight) var(--font-ui); }
.dp-part-title { margin: 0; font: 600 var(--fs-2)/var(--lh-tight) var(--font-ui); }
.dp-tree { display: grid; gap: var(--pad); margin: 0; padding: 0; list-style: none; min-width: 0; }
.dp-node > .dp-tree { margin-top: var(--pad); padding-left: var(--gut); border-left: var(--border-w) solid var(--border); }
.dp-one, .dp-form { display: grid; gap: 6px; min-width: 0; }
.dp-name, .dp-does, .dp-back { margin: 0; max-width: 80ch; font: var(--fs-2)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.dp-does { color: var(--text-2); }
.dp-node > .dp-tree-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px var(--gut); min-width: 0; }
.dp-node > .dp-tree-row > * { margin: 0; min-width: 0; font: var(--fs-2)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.dp-node > .dp-tree-row > .dp-state { order: 1; }
.dp-node > .dp-tree-row > .dp-charge { order: 2; flex: 1 1 100%; }
.dp-node > .dp-tree-row > .dp-does { order: 3; flex: 1 1 100%; contain: inline-size; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dp-project > .dp-tree-row > .dp-name { font-weight: 600; }
.dp-charge-label { color: var(--text-3); }
.dp-leader { display: block; }
.dp-heads { display: none; }
.dp-facts { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 4px var(--pad); margin: 0; font: var(--fs-1)/var(--lh-read) var(--font-ui); }
.dp-facts dt { color: var(--text-3); }
.dp-facts dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.dp-code + .dp-code { margin-left: 6px; }
.dp-quiet { color: var(--text-3); }
.dp-presses { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad); margin: 0; }
.dp-history { display: grid; gap: 6px; margin: 0; padding-left: var(--gut); font: var(--fs-1)/var(--lh-read) var(--font-ui); }
.dp-words { margin: 4px 0 0 0; color: var(--text-2); overflow-wrap: anywhere; }
@media (min-width: 60rem) {
  .dp-table { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr) max-content; gap: 4px var(--gut); min-width: 0; }
  .dp-table .dp-heads, .dp-table .dp-tree, .dp-table .dp-node, .dp-table .dp-node > .dp-tree-row { display: grid; grid-template-columns: subgrid; grid-column: 1 / -1; column-gap: var(--gut); }
  .dp-table .dp-node > .dp-tree-row > * { order: 0; }
  .dp-table .dp-node { row-gap: 0; }
  .dp-table .dp-node > .dp-tree-row { row-gap: 4px; }
  .dp-table .dp-node > .dp-tree-row > .dp-does { grid-column: 1 / -1; max-width: none; }
  .dp-table .dp-heads { margin: 0; font: var(--fs-1)/var(--lh-read) var(--font-ui); color: var(--text-3); }
  .dp-table .dp-heads > .dp-heads-does { display: none; }
  .dp-table .dp-charge-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
}
@media (min-width: 80rem) {
  .dp-table { grid-template-columns: minmax(0, 3fr) minmax(0, 2fr) max-content minmax(0, 3fr); }
  .dp-table .dp-node > .dp-tree-row > .dp-does { grid-column: auto; }
  .dp-table .dp-heads > .dp-heads-does { display: block; }
}
@media (max-width: 40rem) {
  .dp-facts { grid-template-columns: minmax(0, 1fr); }
  .dp-node > .dp-tree { padding-left: var(--pad); }
}
`
