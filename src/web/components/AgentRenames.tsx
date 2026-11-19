// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S NAME CHANGES, ON ITS PAGE. Item 42 of wave 13s (round 192).
 *
 * A new name takes effect only once the agent's approver approves it: the first secretary up its chain of starters, or
 * the person. The person may answer any. So this place draws the new name that waits, who proposed it, the reason and
 * whom it waits for, and for a reader who may answer it the two presses. A press opens a box for the reason, and the
 * answer is sent only with one. Under it are the earlier changes, each with its reasons. A change the person made at
 * once, through the agent's own name field, is drawn as theirs, with "No reason given." where they gave none.
 *
 * An agent that was never renamed, and has no proposal, draws nothing here. The rules and the shapes are in
 * src/server/lib/agent-renames.ts and src/shared/agent-renames.ts.
 */
import type { ARename, TheRenamesOfAnAgent } from '@shared/agent-renames.ts'
import { content, t } from '@shared/i18n.ts'
import { drawnStamp } from '@shared/time.ts'
import { useState } from 'react'
import { api, errorMessage, faultOf, type Fault } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { useInspect } from '../lib/mode.ts'
import { Btn, ErrorNote, Field, Panel, TextArea } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'

export function AgentRenames({ agentId, onChanged }: { agentId: string; onChanged: () => void }) {
  useLanguage()
  const inspect = useInspect()
  const [read, readAgain] = useProjectAsync(() => api.agentRenames(agentId), [agentId])
  if (read.status === 'loading') return null
  if (read.status === 'error') {
    return <ErrorNote message={inspect ? read.message : t('agentRenames.readFailed')} fault={inspect ? read.fault : undefined} retry={readAgain} />
  }
  const answered = (): void => {
    readAgain()
    onChanged()
  }
  return <TheAgentRenames reading={read.value} inspect={inspect} onAnswered={answered} />
}

/**
 * THE NAME CHANGES, FROM WHAT WAS READ. Everything it draws is passed in, so a test can draw it from a reading without a
 * server.
 */
export function TheAgentRenames({ reading, inspect, onAnswered }: { reading: TheRenamesOfAnAgent; inspect: boolean; onAnswered: () => void }) {
  useLanguage()
  const { renames, waiting } = reading
  if (renames.length === 0) return null
  const waits = waiting === null ? null : renames.find((one) => one.id === waiting.rename)
  if (waits === undefined) {
    throw new Error(`The office says the rename "${waiting!.rename}" waits, and did not send it among this agent's renames.`)
  }
  const earlier = renames.filter((one) => one.answer !== null)
  return (
    <>
      <style href="mole-office-agent-renames" precedence="default">
        {AGENT_RENAMES_CSS}
      </style>
      <Panel declares={{ surface: null }} titleIs="label" title={t('agentRenames.heading')}>
        {waits === null ? null : (
          <TheWaitingRename rename={waits} mayNot={waiting!.whyTheCallerMayNotAnswer} inspect={inspect} onAnswered={onAnswered} />
        )}
        {earlier.length === 0 ? null : (
          <>
            <h3 className="agent-renames-head">{t('agentRenames.earlier')}</h3>
            <ul className="agent-renames-list">
              {earlier.map((one) => (
                <li key={one.id} data-agent-rename={one.way === 'at once' ? 'at once' : one.answer}>
                  <AnEarlierRename rename={one} />
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>
    </>
  )
}

/**
 * THE NEW NAME THAT WAITS. `mayNot` is the office's sentence saying who may answer, or null because this reader may; a
 * reader who may not gets no press, and in developer mode the sentence.
 */
function TheWaitingRename({
  rename,
  mayNot,
  inspect,
  onAnswered,
}: {
  rename: ARename
  mayNot: string | null
  inspect: boolean
  onAnswered: () => void
}) {
  const [asking, setAsking] = useState<'approve' | 'refuse' | null>(null)
  const [because, setBecause] = useState('')
  const [busy, setBusy] = useState(false)
  const [fault, setFault] = useState<{ message: string; fault: Fault | null } | null>(null)
  const noReason = because.trim() === ''
  const send = (): void => {
    if (asking === null) return
    setFault(null)
    setBusy(true)
    const door = asking === 'approve' ? api.approveAgentRename : api.refuseAgentRename
    door(rename.id, because.trim())
      .then(() => {
        setBusy(false)
        setAsking(null)
        setBecause('')
        onAnswered()
      })
      .catch((err: unknown) => {
        setBusy(false)
        setFault({ message: errorMessage(err), fault: faultOf(err) })
      })
  }
  const cancel = (): void => {
    setAsking(null)
    setFault(null)
  }
  return (
    <div className="agent-renames-waits" data-agent-rename="waiting">
      <p className="agent-renames-said">{t('agentRenames.waits', { newName: content(rename.newName), oldName: content(rename.oldName) })}</p>
      <p className="agent-renames-quiet">{t('agentRenames.proposedBy', { who: content(rename.proposedBy.name), when: drawnStamp(rename.proposedAt) })}</p>
      <p className="agent-renames-said">{t('agentRenames.reason', { because: theReason(rename.proposedBecause) })}</p>
      <p className="agent-renames-quiet">{t('agentRenames.waitsFor', { who: content(rename.approver.name) })}</p>
      {mayNot !== null ? (
        inspect ? <p className="agent-renames-quiet">{content(mayNot)}</p> : null
      ) : asking === null ? (
        <div className="agent-renames-acts">
          <Btn variant="primary" onClick={() => setAsking('approve')}>
            {t('agentRenames.approve')}
          </Btn>
          <Btn onClick={() => setAsking('refuse')}>{t('agentRenames.refuse')}</Btn>
        </div>
      ) : (
        <div className="agent-renames-answer">
          <Field label={t(asking === 'approve' ? 'agentRenames.reasonToApprove' : 'agentRenames.reasonToRefuse')}>
            <TextArea value={because} onChange={setBecause} autoFocus />
          </Field>
          {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
          <div className="agent-renames-acts">
            <Btn
              variant="primary"
              onClick={send}
              disabled={busy || noReason}
              reason={busy ? t('agentRenames.working') : noReason ? t('agentRenames.reasonNeeded') : undefined}
            >
              {t('agentRenames.send')}
            </Btn>
            <Btn onClick={cancel} disabled={busy} reason={busy ? t('agentRenames.working') : undefined}>
              {t('agentRenames.cancel')}
            </Btn>
          </div>
        </div>
      )}
    </div>
  )
}

/** One answered change: the person's own rename, or a proposal that was approved or refused, each with its reasons. */
function AnEarlierRename({ rename }: { rename: ARename }) {
  const names = { oldName: content(rename.oldName), newName: content(rename.newName) }
  const when = drawnStamp(rename.answeredAt ?? rename.proposedAt)
  if (rename.way === 'at once') {
    return (
      <>
        <span className="agent-renames-said">{t('agentRenames.atOnce', { who: content(rename.proposedBy.name), when, ...names })}</span>
        <span className="agent-renames-quiet">
          {rename.proposedBecause === null ? t('agentRenames.noReason') : t('agentRenames.reason', { because: content(rename.proposedBecause) })}
        </span>
      </>
    )
  }
  if (rename.answeredBy === null) {
    throw new Error(`The rename "${rename.id}" is answered "${rename.answer}" and names nobody who answered it.`)
  }
  const approved = rename.answer === 'approved'
  return (
    <>
      <span className="agent-renames-said">{t(approved ? 'agentRenames.approved' : 'agentRenames.refused', { when, ...names })}</span>
      <span className="agent-renames-quiet">
        {t('agentRenames.proposedWith', { who: content(rename.proposedBy.name), because: theReason(rename.proposedBecause) })}
      </span>
      <span className="agent-renames-quiet">
        {t(approved ? 'agentRenames.approvedBy' : 'agentRenames.refusedBy', {
          who: content(rename.answeredBy.name),
          because: theReason(rename.answeredBecause),
        })}
      </span>
    </>
  )
}

/** A reason as it was written, or the words that say none was given. */
function theReason(because: string | null): string {
  return because === null ? t('agentRenames.noReason') : content(because)
}

const AGENT_RENAMES_CSS = `
.agent-renames-waits { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.agent-renames-said { margin: 0; max-width: var(--measure-in-box); color: var(--text); font: var(--fs-2)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.agent-renames-quiet { margin: 0; max-width: var(--measure-in-box); color: var(--text-3); font-size: var(--fs-1); overflow-wrap: anywhere; }
.agent-renames-acts { display: flex; flex-wrap: wrap; gap: var(--pad); margin-top: 6px; }
.agent-renames-answer { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; min-width: 0; }
.agent-renames-head {
  margin: var(--pad) 0 4px; color: var(--text-3); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui);
  letter-spacing: .06em; text-transform: uppercase;
}
.agent-renames-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.agent-renames-list li { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.agent-renames-list .agent-renames-said { display: block; }
.agent-renames-list .agent-renames-quiet { display: block; }
`
