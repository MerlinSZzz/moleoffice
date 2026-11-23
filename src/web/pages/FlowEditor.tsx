// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { stillOnThisPage } from '../lib/pagechoice.ts'
import { useState, useSyncExternalStore } from 'react'
import { content, t } from '@shared/i18n.ts'
import type { FlowRead } from '@shared/flows.ts'
import { isAProjectOnAList } from '@shared/workspaces.ts'
import { KIND_FAMILIES } from '@shared/work.ts'
import { api, ApiError, errorMessage, faultOf, getActor, subscribeActor, type Fault } from '../api.ts'
import { currentWorkspace } from '../lib/workspace.ts'
import { ErrorNote, Loading, TextArea, useAsync } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { flowsPath, navigate, RouteLink } from '../components/router.tsx'
import { declaredAttributes } from '../components/declares.ts'
import { RecordByName, RecordPicker, rememberTheName } from '../components/RecordPicker.tsx'
import {
  FACT_NAMES,
  isChanged,
  planAnEdit,
  planANewFlow,
  stateAfterAPartSave,
  stateOfAFlow,
  type EditorStage,
  type EditorState,
  type Lack,
  type NewFlowFacts,
  type Place,
} from '../lib/flow-edit-plan.ts'

/**
 * THE FLOW EDITOR. `#/flows/<id>/edit` changes one flow's stages; `#/flows/new` files a new flow. Wave 13p round 36,
 * the fourth of the five rounds of proposal report 4mwraeIStEe8 (its block
 * "person").
 *
 * NOTHING IS WRITTEN UNTIL "SAVE THE FLOW". Then the edit is sent as a sequence of writes through round 34's doors, each
 * from the version the one before answered. What the sequence is, and what it still lacks, is worked out in
 * src/web/lib/flow-edit-plan.ts with the builder and the check the doors themselves run, so the marks and the save bar
 * say what the server would refuse.
 *
 * WHO MAY EDIT is the rule the doors apply (`aWriter` in src/server/api/flows.ts): every writer except an agent the office
 * has not registered, and a retired agent is registered. The page does not work the rule out again. It asks
 * GET /api/flows/may-i-write, which answers from the same function the doors call, so an agent the registry list leaves
 * out but the doors accept still sees Edit. If that answer cannot be read, Edit is drawn and the editor says so: the
 * doors decide at the save, and a refusal there keeps every typed word.
 *
 * IF THE SERVER STILL REFUSES, nothing typed is lost. The office's sentence is drawn beside the stage, the cause, the
 * order line or the fact it is about, placed by the write that met it and its code. Writes already saved stay saved,
 * the flow is read again, and the editor is pointed at it.
 */

/** A finding is any kind of the Findings family, read from the one place that says which kinds those are. */
const CAUSE_KINDS = [...KIND_FAMILIES.findings.kinds, 'message', 'decision'] as const

/**
 * Whether this browser may write a flow, as the doors answer it. 'reading' until the answer comes; 'unknown', with the
 * error, when it could not be read.
 */
export function useMayWriteFlows(): 'yes' | 'no' | 'reading' | 'unknown' {
  return useTheDoorsAnswer().may
}

function useTheDoorsAnswer(): { may: 'yes' | 'no' | 'reading' | 'unknown'; error: string | null; fault: Fault | null } {
  const actor = useSyncExternalStore(subscribeActor, getActor, getActor)
  const [asked] = useAsync(() => api.mayWriteFlows(), [actor.type, actor.id])
  if (asked.status === 'loading') return { may: 'reading', error: null, fault: null }
  if (asked.status === 'error') return { may: 'unknown', error: asked.message, fault: asked.fault ?? null }
  return { may: asked.value.mayWrite ? 'yes' : 'no', error: null, fault: null }
}

export function FlowEditor({ id, titles }: { id: string | null; titles: ReadonlyMap<string, string> }) {
  const { may, error, fault } = useTheDoorsAnswer()
  const actor = getActor()
  return (
    <div className="page flw flw-edit">
      <style href="mole-office-flow-editor" precedence="default">{FLOW_EDITOR_CSS}</style>
      <RouteLink className="flw-back" to={id === null ? flowsPath() : flowsPath(id)}>
        ← {id === null ? t('flows.back') : t('flowEditor.cancel')}
      </RouteLink>
      {may === 'reading' ? (
        <Loading what={t('flowEditor.readingWho')} rows={1} />
      ) : may === 'no' ? (
        <p className="fle-refused" role="alert">{t('flowEditor.mayNotWrite', { who: actor.id })}</p>
      ) : (
        <>
          {may === 'unknown' ? <ErrorNote message={error ?? ''} fault={fault} /> : null}
          {id === null ? <TheEditor flow={null} titles={titles} /> : <ReadThenEdit id={id} titles={titles} />}
        </>
      )}
    </div>
  )
}

function ReadThenEdit({ id, titles }: { id: string; titles: ReadonlyMap<string, string> }) {
  const [flow, reload] = useProjectAsync(() => api.readFlow(id, true), [id])
  if (flow.status === 'loading') return <Loading what={t('flowEditor.loading')} />
  if (flow.status === 'error') return <ErrorNote message={flow.message} fault={flow.fault} retry={reload} />
  return <TheEditor key={flow.value.id} flow={flow.value} titles={titles} />
}

/** A refusal the server sent, and where it is drawn. A null place is the save bar. */
interface Refusal {
  place: Place | null
  message: string
  fault: Fault | null
  done: number
  all: number
}

const samePlace = (a: Place | null, b: Place): boolean => a !== null && JSON.stringify(a) === JSON.stringify(b)

let made = 0
const aNewKey = (): string => `n${String((made += 1))}`

const emptyStage = (): EditorStage => ({ key: aNewKey(), from: null, does: '', evidence: '', why: '', sources: [], removing: null })

const firstProject = (titles: ReadonlyMap<string, string>): string => {
  const here = currentWorkspace()
  if (isAProjectOnAList(here)) return here
  return [...titles.keys()].find(isAProjectOnAList) ?? ''
}

function TheEditor({ flow: read, titles }: { flow: FlowRead | null; titles: ReadonlyMap<string, string> }) {
  const [flow, setFlow] = useState(read)
  const [state, setState] = useState<EditorState>(() =>
    read === null
      ? { cause: null, orderWhy: '', stages: [], facts: { project: firstProject(titles), title: '', trigger: '', runsBy: '', leavesBehind: '', declaredIn: '' } }
      : stateOfAFlow(read),
  )
  // Which stages read from the flow the person opened with Change. A new or changed stage is open whatever this says.
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())
  const [saving, setSaving] = useState<{ done: number; all: number } | null>(null)
  const [refusal, setRefusal] = useState<Refusal | null>(null)

  const today = new Date().toISOString().slice(0, 10)
  const plan = flow === null ? null : planAnEdit(flow, state, today)
  const lacks: Lack[] = plan === null ? planANewFlow(state) : plan.lacks
  const nothing = lacks.length === 1 && lacks[0]!.what === 'nothing'
  const things = lacks.filter((lack) => lack.what !== 'nothing')

  const setStage = (key: string, change: Partial<EditorStage>): void =>
    setState((was) => ({ ...was, stages: was.stages.map((stage) => (stage.key === key ? { ...stage, ...change } : stage)) }))
  const lacksAt = (place: Place): Lack[] => lacks.filter((lack) => samePlace(lack.place, place))
  const refusedAt = (place: Place): Refusal | null => (refusal !== null && samePlace(refusal.place, place) ? refusal : null)

  /** What a stage is called in the save bar and its own heading: its place among the kept stages, or its old place. */
  const kept = state.stages.filter((stage) => stage.removing === null)
  const nameOf = (stage: EditorStage): string =>
    stage.removing === null ? t('flowEditor.stage', { n: kept.indexOf(stage) + 1 }) : t('flowEditor.stageGoing', { n: stage.from ?? 0 })
  const lackWords = (lack: Lack): string => {
    const place = lack.place
    if ('stage' in place) {
      const stage = state.stages.find((one) => one.key === place.stage)
      const name = stage === undefined ? '' : nameOf(stage)
      if (lack.what === 'does' || lack.what === 'why' || lack.what === 'sources' || lack.what === 'removeWhy') return t(`flowEditor.lack.${lack.what}`, { stage: name })
      return `${name}: ${t(`server.${lack.what}` as 'server.flowStepNoWhy')}`
    }
    if ('fact' in place) return t('flowEditor.lack.fact', { fact: factName(place.fact) })
    if (lack.what === 'orderWhy') return t('flowEditor.lack.orderWhy')
    if (lack.what === 'cause') return t('flowEditor.lack.cause')
    return t(`server.${lack.what}` as 'server.flowStepNoWhy')
  }

  const move = (key: string, by: -1 | 1): void =>
    setState((was) => {
      const stages = [...was.stages]
      const from = stages.findIndex((stage) => stage.key === key)
      let to = from + by
      // Past a stage being taken out, which holds no place in the flow that will be saved.
      while (stages[to]?.removing !== null && stages[to] !== undefined) to += by
      if (to < 0 || to >= stages.length) return was
      const [stage] = stages.splice(from, 1) as [EditorStage]
      stages.splice(to, 0, stage)
      return { ...was, stages }
    })

  const addAt = (index: number): void =>
    setState((was) => {
      const stages = [...was.stages]
      stages.splice(index, 0, emptyStage())
      return { ...was, stages }
    })

  async function save(): Promise<void> {
    const stillHere = stillOnThisPage()
    setRefusal(null)
    if (flow === null) {
      const facts = state.facts as NewFlowFacts
      setSaving({ done: 0, all: 1 })
      try {
        const answer = await api.createFlow({
          ...facts,
          stages: kept.map((stage) => ({
            does: stage.does,
            ...(stage.evidence.trim() === '' ? {} : { evidence: stage.evidence }),
            ...(stage.why.trim() === '' ? {} : { why: stage.why }),
            ...(stage.sources.length === 0 ? {} : { sources: stage.sources }),
          })),
        })
        if (stillHere()) navigate(flowsPath(answer.flow))
      } catch (reason) {
        setRefusal({ place: placeOfARefusal(reason, null, state), message: errorMessage(reason), fault: faultOf(reason), done: 0, all: 1 })
      } finally {
        setSaving(null)
      }
      return
    }
    if (plan === null) return
    let version = flow.version
    let done = 0
    setSaving({ done, all: plan.writes.length })
    try {
      for (const planned of plan.writes) {
        const answer = await api.writeAFlowStage({ id: flow.id, project: flow.project }, version, planned.write)
        version = answer.version
        done += 1
        setSaving({ done, all: plan.writes.length })
      }
      if (stillHere()) navigate(flowsPath(flow.id))
    } catch (reason) {
      const place = placeOfARefusal(reason, plan.writes[done]?.place ?? null, state)
      setRefusal({ place, message: errorMessage(reason), fault: faultOf(reason), done, all: plan.writes.length })
      if (done > 0) {
        // WHAT WAS SAVED STAYS SAVED: the flow is read again and the editor pointed at it, every typed word kept.
        try {
          const again = await api.readFlow(flow.id, true)
          setState((was) => stateAfterAPartSave(was, plan, done, again))
          setFlow(again)
        } catch (readError) {
          setRefusal({ place: null, message: errorMessage(readError), fault: faultOf(readError), done, all: plan.writes.length })
        }
      }
    } finally {
      setSaving(null)
    }
  }

  return (
    <form
      className="fle"
      {...declaredAttributes({ surface: 'flows.editor' })}
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <h1 className="flw-title" data-title-is="its-label">{flow === null ? t('flowEditor.titleNew') : t('flowEditor.titleEdit', { title: content(flow.title) })}</h1>

      {state.facts === null ? null : (
        <TheFacts facts={state.facts} titles={titles} lacksAt={lacksAt} refusedAt={refusedAt} onChange={(facts) => setState((was) => ({ ...was, facts }))} />
      )}

      {flow === null ? null : (
        <section className="fle-cause" data-lacking={lacksAt({ at: 'cause' }).some((lack) => lack.what === 'cause') ? 'yes' : 'no'}>
          <h2 className="flw-h2">{t('flowEditor.cause')}</h2>
          {state.cause === null ? (
            <RecordPicker
              label={t('flowEditor.causePick')}
              kinds={CAUSE_KINDS}
              chosen={[]}
              titles={titles}
              onPick={(record) => {
                rememberTheName(record)
                setState((was) => ({ ...was, cause: record.id }))
              }}
            />
          ) : (
            <p className="fle-picked">
              <RecordByName id={state.cause} />
              <button type="button" className="flw-press" onClick={() => setState((was) => ({ ...was, cause: null }))}>
                {t('flowEditor.causeAgain')}
              </button>
            </p>
          )}
          <Refused refusal={refusedAt({ at: 'cause' })} />
        </section>
      )}

      <section className="fle-stages">
        <h2 className="flw-h2">{t('flowEditor.stages')}</h2>
        {state.stages.length === 0 ? <p className="flw-says">{t('absence.none')}</p> : null}
        <ol className="fle-list">
          <li className="fle-add">
            <button type="button" className="fle-add-press" onClick={() => addAt(0)}>
              {t('flowEditor.addHere')}
            </button>
          </li>
          {state.stages.map((stage, index) => {
            const changed = flow !== null && isChanged(stage, flow)
            const open = stage.removing === null && (stage.from === null || changed || opened.has(stage.key))
            const place = kept.indexOf(stage) + 1
            return [
              <li key={stage.key} className="fle-stage" data-state={stage.removing !== null ? 'going' : stage.from === null ? 'new' : changed ? 'changed' : open ? 'open' : 'still'}>
                {stage.removing !== null ? (
                  <Going stage={stage} name={nameOf(stage)} flow={flow} lacking={lacksAt({ stage: stage.key }).length > 0} onWhy={(why) => setStage(stage.key, { removing: { why } })} onKeep={() => setStage(stage.key, { removing: null })} />
                ) : open ? (
                  <OpenStage
                    stage={stage}
                    name={nameOf(stage)}
                    isNew={stage.from === null}
                    changed={changed}
                    lacks={lacksAt({ stage: stage.key })}
                    titles={titles}
                    onChange={(change) => setStage(stage.key, change)}
                    onClose={() => {
                      const was = flow === null || stage.from === null ? undefined : flow.stages[stage.from - 1]
                      if (was !== undefined) setStage(stage.key, { does: was.does, evidence: was.evidence ?? '', why: was.why ?? '', sources: was.sources ?? [] })
                      setOpened((held) => new Set([...held].filter((key) => key !== stage.key)))
                    }}
                    onRemove={() => setState((was) => ({ ...was, stages: was.stages.filter((one) => one.key !== stage.key) }))}
                  />
                ) : (
                  <div className="fle-line">
                    <span className="fle-line-n">{nameOf(stage)}</span>
                    <span className="fle-line-does">{content(stage.does)}</span>
                    <span className="fle-line-presses">
                      <button type="button" className="flw-press fle-arrow" aria-label={t('flowEditor.up', { n: place })} title={t('flowEditor.up', { n: place })} disabled={place === 1} onClick={() => move(stage.key, -1)}>
                        ↑
                      </button>
                      <button type="button" className="flw-press fle-arrow" aria-label={t('flowEditor.down', { n: place })} title={t('flowEditor.down', { n: place })} disabled={place === kept.length} onClick={() => move(stage.key, 1)}>
                        ↓
                      </button>
                      <button type="button" className="flw-press" onClick={() => setOpened((held) => new Set([...held, stage.key]))}>
                        {t('flowEditor.change')}
                      </button>
                      <button type="button" className="flw-press" onClick={() => setStage(stage.key, { removing: { why: '' } })}>
                        {t('flowEditor.remove')}
                      </button>
                    </span>
                  </div>
                )}
                <Refused refusal={refusedAt({ stage: stage.key })} />
              </li>,
              <li key={`${stage.key}-add`} className="fle-add">
                <button type="button" className="fle-add-press" onClick={() => addAt(index + 1)}>
                  {t('flowEditor.addHere')}
                </button>
              </li>,
            ]
          })}
        </ol>
        {plan !== null && plan.writes.some((planned) => planned.write.op === 'move') ? (
          <label className="fle-field fle-order" data-lacking={lacksAt({ at: 'order' }).length > 0 ? 'yes' : 'no'}>
            <span className="fle-label">{t('flowEditor.orderWhy')}</span>
            <TextArea rows={2} value={state.orderWhy} onChange={(orderWhy) => setState((was) => ({ ...was, orderWhy }))} />
          </label>
        ) : null}
        <Refused refusal={refusedAt({ at: 'order' })} />
      </section>

      <div className="fle-bar" role="region" aria-label={t('flowEditor.save')} data-missing={String(things.length)}>
        <div className="fle-bar-says">
          {saving !== null ? (
            <p className="fle-bar-head" role="status">{t('flowEditor.saving', { done: saving.done, all: saving.all })}</p>
          ) : nothing ? (
            <p className="fle-bar-head">{t('flowEditor.nothingYet')}</p>
          ) : things.length === 0 ? (
            <p className="fle-bar-head">{t('flowEditor.ready')}</p>
          ) : (
            <>
              <p className="fle-bar-head">{t('flowEditor.missing', { n: things.length })}</p>
              <ul className="fle-bar-list">
                {things.map((lack, i) => (
                  <li key={i}>{lackWords(lack)}</li>
                ))}
              </ul>
            </>
          )}
          {refusal === null ? null : (
            <div className="fle-bar-refused" role="alert">
              <p className="fle-bar-head">{t('flowEditor.refused')}</p>
              {refusal.done > 0 ? <p>{t('flowEditor.partSaved', { done: refusal.done, all: refusal.all, n: refusal.done })}</p> : null}
              {refusal.place === null ? <ErrorNote message={refusal.message} fault={refusal.fault} /> : null}
            </div>
          )}
        </div>
        <div className="fle-bar-presses">
          <button type="submit" className="flw-press fle-save" disabled={saving !== null || lacks.length > 0}>
            {t('flowEditor.save')}
          </button>
          <RouteLink className="fle-leave" to={flow === null ? flowsPath() : flowsPath(flow.id)}>
            {t('flowEditor.cancel')}
          </RouteLink>
        </div>
      </div>
    </form>
  )
}

/**
 * WHERE A SERVER'S REFUSAL IS DRAWN, by the write that met it and its code. A stale version and anything with no code
 * go to the save bar. A record that is not there goes beside the stage, or the cause, that names it.
 */
function placeOfARefusal(reason: unknown, place: Place | null, state: EditorState): Place | null {
  const code = reason instanceof ApiError ? reason.code : undefined
  if (code === undefined || code === 'flowVersionStale') return null
  if (code === 'flowProjectNotThere') return { fact: 'project' }
  if (code === 'flowStepChangeNoCause' || code === 'flowStepChangeUnrecorded') return { at: 'cause' }
  if (code === 'flowStepRecordNotThere') {
    const said = errorMessage(reason)
    if (state.cause !== null && said.includes(state.cause)) return { at: 'cause' }
    const naming = state.stages.find((stage) => stage.sources.some((id) => said.includes(id)))
    if (naming !== undefined) return { stage: naming.key }
  }
  return place
}

function Refused({ refusal }: { refusal: Refusal | null }) {
  if (refusal === null) return null
  return (
    <div className="fle-refusal">
      <ErrorNote message={refusal.message} fault={refusal.fault} />
    </div>
  )
}

const FACT_WORD: Record<keyof NewFlowFacts, () => string> = {
  project: () => t('flowEditor.fact.project'),
  title: () => t('flowEditor.fact.title'),
  trigger: () => t('flows.fact.trigger'),
  runsBy: () => t('flows.fact.runsBy'),
  leavesBehind: () => t('flows.fact.leavesBehind'),
  declaredIn: () => t('flows.fact.declaredIn'),
}
const factName = (name: keyof NewFlowFacts): string => FACT_WORD[name]()

/**
 * THE FACTS A PERSON WRITES AS A SENTENCE OR A LIST get a box of several lines, where Enter makes a new
 * line. The flow kind asks for what starts it in one sentence, for what it leaves
 * behind as a list, and for where it is written as a path or a plain sentence. The title is a name and who
 * runs it is a word or two, so those two stay one line.
 */
const SENTENCE_FACTS: ReadonlySet<keyof NewFlowFacts> = new Set(['trigger', 'leavesBehind', 'declaredIn'])

function TheFacts({
  facts,
  titles,
  lacksAt,
  refusedAt,
  onChange,
}: {
  facts: NewFlowFacts
  titles: ReadonlyMap<string, string>
  lacksAt: (place: Place) => Lack[]
  refusedAt: (place: Place) => Refusal | null
  onChange: (facts: NewFlowFacts) => void
}) {
  const projects = [...titles.keys()].filter(isAProjectOnAList)
  if (facts.project !== '' && !projects.includes(facts.project)) projects.unshift(facts.project)
  return (
    <fieldset className="fle-facts">
      <legend className="flw-h2">{t('flowEditor.facts')}</legend>
      {FACT_NAMES.map((name) => (
        <label key={name} className="fle-field" data-lacking={lacksAt({ fact: name }).length > 0 ? 'yes' : 'no'}>
          <span className="fle-label">{factName(name)}</span>
          {name === 'project' ? (
            <select className="px-input" value={facts.project} onChange={(event) => onChange({ ...facts, project: event.target.value })}>
              {projects.map((id) => (
                <option key={id} value={id}>
                  {titles.get(id) ?? id}
                </option>
              ))}
            </select>
          ) : SENTENCE_FACTS.has(name) ? (
            <TextArea rows={2} value={facts[name]} onChange={(value) => onChange({ ...facts, [name]: value })} />
          ) : (
            <input className="px-input" value={facts[name]} onChange={(event) => onChange({ ...facts, [name]: event.target.value })} />
          )}
          <Refused refusal={refusedAt({ fact: name })} />
        </label>
      ))}
    </fieldset>
  )
}

function OpenStage({
  stage,
  name,
  isNew,
  changed,
  lacks,
  titles,
  onChange,
  onClose,
  onRemove,
}: {
  stage: EditorStage
  name: string
  isNew: boolean
  changed: boolean
  lacks: Lack[]
  titles: ReadonlyMap<string, string>
  onChange: (change: Partial<EditorStage>) => void
  onClose: () => void
  onRemove: () => void
}) {
  const lacking = (what: string): 'yes' | 'no' => (lacks.some((lack) => lack.what === what) ? 'yes' : 'no')
  const needs = lacking('why') === 'yes' || lacking('sources') === 'yes'
  return (
    <div className="fle-open">
      <p className="fle-open-head">
        <b>{name}</b>
        {isNew ? <span className="fle-tag">{t('flowEditor.stageNew')}</span> : changed ? <span className="fle-tag">{t('flowEditor.stageChanged')}</span> : null}
        <span className="fle-open-presses">
          {isNew ? (
            <button type="button" className="flw-press" onClick={onRemove}>
              {t('flowEditor.remove')}
            </button>
          ) : (
            <button type="button" className="flw-press" onClick={onClose}>
              {changed ? t('flowEditor.undo') : t('flowEditor.close')}
            </button>
          )}
        </span>
      </p>
      {needs ? <p className="fle-mark">{isNew ? t('flowEditor.markNew') : t('flowEditor.markChanged')}</p> : null}
      <label className="fle-field" data-lacking={lacking('does')}>
        <span className="fle-label">{t('flowEditor.field.does')}</span>
        <TextArea rows={2} value={stage.does} onChange={(does) => onChange({ does })} />
      </label>
      <label className="fle-field">
        <span className="fle-label">{t('flowEditor.field.evidence')}</span>
        <TextArea rows={2} value={stage.evidence} onChange={(evidence) => onChange({ evidence })} />
      </label>
      <label className="fle-field" data-lacking={lacking('why')}>
        <span className="fle-label">{t('flowEditor.field.why')}</span>
        <TextArea rows={2} value={stage.why} onChange={(why) => onChange({ why })} />
      </label>
      <div className="fle-field" data-lacking={lacking('sources')} role="group" aria-label={t('flowEditor.field.sources')}>
        <span className="fle-label">{t('flowEditor.field.sources')}</span>
        {stage.sources.length === 0 ? (
          <p className="flw-note">{t('absence.none')}</p>
        ) : (
          <ul className="fle-sources">
            {stage.sources.map((id) => (
              <li key={id}>
                <RecordByName id={id} />
                <button type="button" className="flw-press" onClick={() => onChange({ sources: stage.sources.filter((one) => one !== id) })}>
                  {t('flowEditor.takeOut')}
                </button>
              </li>
            ))}
          </ul>
        )}
        <RecordPicker
          label={t('flowEditor.sourcesPick')}
          kinds={null}
          chosen={stage.sources}
          titles={titles}
          onPick={(record) => {
            rememberTheName(record)
            onChange({ sources: [...stage.sources, record.id] })
          }}
        />
      </div>
    </div>
  )
}

/** A STAGE BEING TAKEN OUT: why it is there and its sources first, then one line on why it goes. */
function Going({
  stage,
  name,
  flow,
  lacking,
  onWhy,
  onKeep,
}: {
  stage: EditorStage
  name: string
  flow: FlowRead | null
  lacking: boolean
  onWhy: (why: string) => void
  onKeep: () => void
}) {
  const was = flow === null || stage.from === null ? undefined : flow.stages[stage.from - 1]
  const why = was?.why ?? null
  const sources = was?.sources ?? []
  return (
    <div className="fle-going">
      <p className="fle-open-head">
        <b>{name}</b> <s className="fle-going-does">{content(was?.does ?? stage.does)}</s>
      </p>
      <dl className="fle-going-reasons">
        <dt>{t('flowEditor.goingWhy')}</dt>
        <dd>{why === null || why.trim() === '' ? <span className="fle-none">{t('word.notRecorded')}</span> : content(why)}</dd>
        <dt>{t('flowEditor.goingSources')}</dt>
        <dd>
          {sources.length === 0 ? (
            <span className="fle-none">{t('absence.none')}</span>
          ) : (
            <ul className="fle-sources">
              {sources.map((id) => (
                <li key={id}>
                  <RecordByName id={id} />
                </li>
              ))}
            </ul>
          )}
        </dd>
      </dl>
      <label className="fle-field" data-lacking={lacking ? 'yes' : 'no'}>
        <span className="fle-label">{t('flowEditor.goingAsk')}</span>
        <TextArea rows={2} value={stage.removing?.why ?? ''} onChange={onWhy} />
      </label>
      <p>
        <button type="button" className="flw-press" onClick={onKeep}>
          {t('flowEditor.keep')}
        </button>
      </p>
    </div>
  )
}

export const FLOW_EDITOR_CSS = `
.fle { display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.fle-refused { color: var(--st-failed); max-width: var(--measure-in-box); }
.fle-facts { border: var(--border-w) solid var(--border); border-radius: var(--radius); background: var(--panel); padding: 8px 12px 12px; margin: 0; display: grid; gap: var(--pad) var(--gut); grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr)); min-width: 0; }
.fle-facts legend { padding: 0 4px; }
.fle-field { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.fle-field .px-input { width: 100%; max-width: 40rem; box-sizing: border-box; font: inherit; }
.fle-field textarea.px-input { resize: vertical; }
.fle-label { font-size: var(--fs-1); font-weight: 600; color: var(--text-2); }
/* A FIELD THE SAVE STILL NEEDS: a dashed edge, as the proposal draws it. */
.fle-field[data-lacking='yes'] > .px-input,
.fle-field[data-lacking='yes'][role='group'] { border: var(--border-w) dashed var(--st-failed); }
.fle-field[data-lacking='yes'][role='group'] { border-radius: var(--radius-sm); padding: 6px 8px; }
.fle-field[data-lacking='yes'] > .fle-label { color: var(--st-failed); }
.fle-mark { margin: 0; color: var(--st-failed); font-size: var(--fs-2); }
.fle-cause { border: var(--border-w) solid var(--border); border-radius: var(--radius); background: var(--panel); padding: 8px 12px 12px; min-width: 0; }
.fle-cause .flw-h2 { margin-top: 0; }
.fle-cause[data-lacking='yes'] { border-style: dashed; border-color: var(--st-failed); }
.fle-picked { display: flex; flex-wrap: wrap; gap: var(--pad) var(--gut); align-items: baseline; margin: 0; }
.fle-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.fle-stage { border: var(--border-w) solid var(--border-strong); border-radius: var(--radius); background: var(--panel); padding: 8px 12px; min-width: 0; }
.fle-stage[data-state='new'], .fle-stage[data-state='changed'] { border-color: var(--accent); }
.fle-stage[data-state='going'] { border-style: dashed; }
.fle-line { display: flex; flex-wrap: wrap; gap: 4px var(--gut); align-items: center; }
.fle-line-n { font-size: var(--fs-1); font-weight: 700; color: var(--text-2); }
.fle-line-does { flex: 1 1 12rem; min-width: 0; overflow-wrap: anywhere; white-space: pre-wrap; }
.fle-line-presses, .fle-open-presses { display: inline-flex; flex-wrap: wrap; gap: 4px; }
.fle-arrow { min-width: 2.25rem; padding: 4px 8px; }
.flw-press:disabled { opacity: 0.45; cursor: default; }
.fle-open, .fle-going { display: flex; flex-direction: column; gap: var(--pad); }
.fle-open-head { display: flex; flex-wrap: wrap; gap: 4px var(--gut); align-items: center; margin: 0; }
.fle-open-presses { margin-left: auto; }
.fle-tag { font-size: var(--fs-1); color: var(--accent); font-weight: 600; }
.fle-sources { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.fle-sources > li { display: flex; flex-wrap: wrap; gap: 4px var(--gut); align-items: baseline; }
.fle-going-does { color: var(--text-2); overflow-wrap: anywhere; white-space: pre-wrap; }
.fle-going-reasons { margin: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 4px var(--gut); }
.fle-going-reasons dt { font-size: var(--fs-1); font-weight: 600; color: var(--text-2); }
.fle-going-reasons dd { margin: 0; overflow-wrap: anywhere; white-space: pre-wrap; }
.fle-none { color: var(--text-3); }
.fle-going p { margin: 0; }
.fle-add { display: flex; justify-content: center; }
.fle-add-press { border: none; background: none; color: var(--text-2); font: inherit; font-size: var(--fs-1); cursor: pointer; padding: 2px 8px; min-height: 1.75rem; }
.fle-add-press:hover { color: var(--text); text-decoration: underline; }
.fle-order { margin-top: var(--pad); }
.fle-refusal { margin-top: var(--pad); }
/* THE SAVE BAR stays in view at the foot of the page while the stages scroll. */
.fle-bar {
  position: sticky; bottom: 0; z-index: 2; display: flex; flex-wrap: wrap; gap: var(--pad) var(--gut); align-items: flex-start; justify-content: space-between;
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius); background: var(--panel); padding: 10px 12px; margin-top: var(--gut);
  box-shadow: 0 -2px 8px rgb(0 0 0 / 0.08);
  /* Clear of the round chat button fixed in the bottom right corner (Chat.tsx), which would cover the presses. */
  padding-right: calc(var(--fab-size) + var(--fab-inset));
}
.fle-bar-says { flex: 1 1 18rem; min-width: 0; }
.fle-bar-says p { margin: 0; }
.fle-bar-head { font-weight: 600; }
.fle-bar[data-missing]:not([data-missing='0']) .fle-bar-head { color: var(--st-failed); }
.fle-bar-list { margin: 4px 0 0 0; padding: 0 0 0 1.2rem; font-size: var(--fs-2); }
.fle-bar-refused { margin-top: var(--pad); }
.fle-bar-presses { display: flex; flex-wrap: wrap; gap: var(--pad) var(--gut); align-items: center; }
.fle-save { background: var(--accent); color: var(--accent-text); border-color: var(--accent); font-weight: 600; }
.fle-save:disabled { background: var(--panel); color: var(--text-2); border-color: var(--border-strong); }
@media (max-width: 40rem) {
  .fle-arrow, .fle-add-press { min-height: 44px; }
  .fle-line-presses { width: 100%; }
  .fle-bar-presses { width: 100%; }
}
`
