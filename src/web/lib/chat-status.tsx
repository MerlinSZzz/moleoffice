// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useEffect, useId, useRef, useState, type MouseEvent } from 'react'
import type { PluginAgentStatus } from '@shared/plugin-read.ts'
import { STANDING_WORD_KEYS } from '@shared/releasing.ts'
import { content, t } from '@shared/i18n.ts'
import { navigate, recordPath } from '../components/router.tsx'
import { recordedFlowStepWords } from '../components/FlowRunSteps.tsx'

type RecordedRun = Extract<PluginAgentStatus['flow'], { available: true }>['value']['runs'][number]

/** A unique newest observation, or none when the recorded times cannot establish one. */
function newest<T>(items: readonly T[], moment: (item: T) => number | null): T | undefined {
  if (items.length === 1) return items[0]
  let found: T | undefined
  let latest = -Infinity
  let tied = false
  for (const item of items) {
    const at = moment(item)
    if (at === null || !Number.isFinite(at)) return undefined
    if (at > latest) { found = item; latest = at; tied = false }
    else if (at === latest) tied = true
  }
  return tied ? undefined : found
}

/**
 * WHAT ONE RUN IS DOING, from what was recorded and nothing else (wave 13y round 111). Where no step was recorded, or the
 * recorded times cannot tell which log is newest, the run is named by its title and no words stand in for the step.
 */
function currentStep(run: RecordedRun): string {
  const log = newest(run.flows.filter(one => one.lastStep !== null), one => one.lastStep?.atMs ?? null)
  if (log?.lastStep == null) return content(run.run.title)
  const name = log.flow?.title
  const step = log.lastStep.does === '' ? '' : recordedFlowStepWords(log.lastStep.does)
  return [name == null ? '' : content(name), step].filter(part => part !== '').join(', ') || content(run.run.title)
}

export function ChatFlowLine({ status, project }: { status: PluginAgentStatus | null | undefined; project: string }) {
  const [expanded, setExpanded] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const opener = useRef<HTMLElement | null>(null)
  const heading = useId()
  const flow = status?.flow
  const runs = flow?.available === true ? flow.value.runs : []
  const selected = newest(runs, run => run.run.startedAtMs)
  const moreLabel = runs.length > 1 ? selected === undefined ? t('chat.status.viewRuns') : t('chat.status.more', { n: runs.length - 1 }) : null

  useEffect(() => { setExpanded(false) }, [status?.id])
  // The native modal and its focus/escape controls follow the existing confirmation dialog.
  useEffect(() => {
    if (!expanded) return
    const element = dialog.current
    element?.showModal()
    element?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => { element?.close(); opener.current?.focus() }
  }, [expanded])

  const more = (label: string) => <button type="button" className="px-chat-flow-more" aria-haspopup="dialog"
    onClick={event => { opener.current = event.currentTarget; setExpanded(true) }}>{label}</button>
  // A run is opened in its own project, which a read of the agent's home project names.
  const follow = (event: MouseEvent<HTMLAnchorElement>, id: string, kind: 'session' | 'flow_run', where: string): void => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    setExpanded(false)
    navigate(recordPath(id, kind), where)
  }

  // AN AGENT WITH NO RUN HAS NO "WORKING ON" LINE: where there is nothing to show, nothing is drawn (wave 13y round 111).
  if (status != null && flow?.available === true && runs.length === 0) return null

  return <div className="px-chat-flow">
    <div className="px-chat-flow-summary">
      <span className="px-chat-flow-main"><span>{t('chat.status.flow')}{': '}</span>
        {status === undefined ? t('chat.status.reading') : flow?.available !== true ? t('chat.status.couldNotBeRead') :
          selected === undefined ? null :
            <a href={'#' + recordPath(selected.run.id, 'session')} title={currentStep(selected)} onClick={event => follow(event, selected.run.id, 'session', selected.project ?? project)}>{currentStep(selected)}</a>}
      </span>
      {moreLabel === null ? null : more(moreLabel)}
    </div>
    {expanded ? <dialog ref={dialog} className="px-chat-flow-dialog" aria-labelledby={heading}
      onCancel={event => { event.preventDefault(); setExpanded(false) }} onClose={() => setExpanded(false)}>
      <h2 id={heading} className="px-chat-flow-title">{t('chat.status.allRuns')}</h2>
      <button type="button" className="px-btn" onClick={() => setExpanded(false)}>{t('chat.status.close')}</button>
      <ul className="px-chat-flow-list">{runs.map(run => <li key={run.run.id}>
        <a href={'#' + recordPath(run.run.id, 'session')} onClick={event => follow(event, run.run.id, 'session', run.project ?? project)}>{content(run.run.title)}</a>
        {' · '}{t(STANDING_WORD_KEYS[run.standing].word)}
        {run.flows.length === 0 ? null :
          <ul>{run.flows.map(log => <li key={log.record.id}>
            <a href={'#' + recordPath(log.record.id, 'flow_run')} onClick={event => follow(event, log.record.id, 'flow_run', run.project ?? project)}>
              {content(log.flow?.title ?? log.record.title)}
            </a>
            {log.lastStep === null || log.lastStep.does === '' ? null :
              <>{': '}<span title={log.lastStep.at}>{recordedFlowStepWords(log.lastStep.does)}</span></>}
          </li>)}</ul>}
      </li>)}</ul>
    </dialog> : null}
  </div>
}
