// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useState } from 'react'
import { content, t } from '@shared/i18n.ts'
import { isMoleOffice } from '@shared/participants.ts'
import { THE_PERSON } from '@shared/person.ts'
import type { AStarterChange, AStarterMove, WhoAnswersForAnAgent } from '@shared/agent-starter.ts'
import { ApiError, moleOfficeRequest } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { readParticipantsOnce } from '../lib/oneread.ts'
import { Btn, ErrorNote, Loading, Panel, drawnDayWithTime, theRefusalInWords } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'

export function starterPressBody(to?: string, because?: string, atOnce = false): { withdraw: true } | { to: string; because: string; atOnce?: true } {
  return to === undefined ? { withdraw: true } : { to, because: because ?? '', ...(atOnce ? { atOnce: true as const } : {}) }
}

export function StarterChangeDetails({ change }: { change: AStarterChange }): React.ReactElement {
  return <p className="starter-line">{t(`starterMove.state.${change.state}`, { name: change.to.name, who: change.askedBy.name, at: drawnDayWithTime(change.askedAt) })} {change.refusedBecause}</p>
}

function refusal(err: unknown): string {
  return err instanceof ApiError ? theRefusalInWords(err.message, err.fault) : err instanceof Error ? err.message : String(err)
}

export function AgentStarterMove({ agentId }: { agentId: string }): React.ReactElement {
  useLanguage()
  const door = `/api/agents/${encodeURIComponent(agentId)}/starter`
  const [reading, refresh] = useProjectAsync(() => moleOfficeRequest<WhoAnswersForAnAgent>(door), [door])
  const [participants, refreshParticipants] = useProjectAsync(readParticipantsOnce, [])
  const [to, setTo] = useState('')
  const [because, setBecause] = useState('')
  const [preview, setPreview] = useState<AStarterMove | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // THE FORM OPENS ON A PRESS: the page is read without a box or a dropdown on arrival (the reading rule),
  // and the one press here says what it opens.
  const [open, setOpen] = useState(false)
  const pending = reading.status === 'ready' ? reading.value.changes.find((one) => one.state === 'waiting') : undefined
  const currentStarterId = reading.status === 'ready' ? reading.value.starter?.id : undefined
  const readPreview = async (): Promise<void> => {
    setBusy(true); setError(null); setPreview(null)
    try { setPreview(await moleOfficeRequest<AStarterMove>(`${door}-preview?to=${encodeURIComponent(to.trim())}`)) }
    catch (err) { setError(refusal(err)) }
    finally { setBusy(false) }
  }
  const close = (): void => {
    setOpen(false); setTo(''); setBecause(''); setPreview(null); setError(null)
  }
  const press = async (body: ReturnType<typeof starterPressBody>): Promise<void> => {
    setBusy(true); setError(null)
    try {
      await moleOfficeRequest(door, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      close(); refresh()
    } catch (err) { setError(refusal(err)); refresh() }
    finally { setBusy(false) }
  }
  return <Panel declares={{ surface: null }} titleIs="label" title={t('starterMove.title')}>
    <style href="mole-office-starter-move" precedence="default">{`
      .starter-line { margin: .45rem 0; overflow-wrap: anywhere; }
      .starter-field { display: flex; flex-direction: column; gap: .25rem; margin: .6rem 0; }
      .starter-field input, .starter-field select, .starter-field textarea { max-width: 32rem; width: 100%; box-sizing: border-box; }
      .starter-actions { display: flex; flex-wrap: wrap; gap: .5rem; margin: .6rem 0; }
    `}</style>
    {reading.status === 'loading' ? <Loading what={t('starterMove.title')} rows={1} /> : reading.status === 'error' ? <ErrorNote message={reading.message} fault={reading.fault} label={t('starterMove.title')} retry={refresh} /> : <>
      <p className="starter-line">{t('starterMove.current', { name: reading.value.starter?.name ?? t('starterMove.none') })}</p>
      {pending ? <>
        <StarterChangeDetails change={pending} />
        <p className="starter-line">{t('starterMove.waits')}</p>
        <p className="starter-line">{t('starterMove.nowConsequence', { name: pending.to.name })}</p>
        <div className="starter-actions">
          <Btn pending={busy} onClick={() => void press(starterPressBody(pending.to.id, pending.because, true))}>{t('starterMove.now')}</Btn>
          <Btn pending={busy} onClick={() => void press(starterPressBody())}>{t('starterMove.withdraw')}</Btn>
        </div>
      </> : !open ? <div className="starter-actions"><Btn onClick={() => setOpen(true)}>{t('starterMove.change')}</Btn></div> : <>
        {participants.status === 'loading' ? <Loading what={t('starterMove.to')} rows={1} /> : participants.status === 'error' ? <ErrorNote message={participants.message} fault={participants.fault} label={t('starterMove.to')} retry={refreshParticipants} /> : <>
          <label className="starter-field">{t('starterMove.to')}<select value={to} onChange={(e) => { setTo(e.target.value); setPreview(null) }}>
            <option value="">{t('starterMove.choose')}</option>
            <option value={THE_PERSON}>{t('starterMove.person')}</option>
            {participants.value.agents.filter((one) => !one.retired && one.id !== agentId && !isMoleOffice({ kind: 'agent', id: one.id }) && one.id !== currentStarterId).sort((a, b) => a.name.localeCompare(b.name)).map((one) => <option key={one.id} value={one.id}>{content(one.name)} ({one.handle})</option>)}
          </select></label>
          <div className="starter-actions"><Btn disabled={!to.trim()} reason={t('starterMove.nameRequired')} pending={busy} onClick={() => void readPreview()}>{t('starterMove.preview')}</Btn></div>
        </>}
        {preview && <>
          <p className="starter-line">{t('starterMove.changesTo', { name: preview.to.name })}</p>
          {preview.isASecretary && <p className="starter-line">{t('starterMove.secretary')}</p>}
          {preview.agentsBelow > 0 && <p className="starter-line">{t('starterMove.followers', { n: preview.agentsBelow, name: preview.to.name })}</p>}
          {preview.records.length > 0 && <p className="starter-line">{t('starterMove.records', { n: preview.records.length })}</p>}
          {preview.runsNotEnded.length > 0 && <p className="starter-line">{t('starterMove.runs', { n: preview.runsNotEnded.length })}</p>}
          {preview.runsNotEnded.length > 0 && <ul>{preview.runsNotEnded.map((run) => <li key={run.id}>{run.title}</li>)}</ul>}
          <label className="starter-field">{t('starterMove.reason')}<textarea value={because} onChange={(e) => setBecause(e.target.value)} /></label>
          <div className="starter-actions"><Btn disabled={!because.trim()} reason={t('starterMove.reasonRequired')} pending={busy} onClick={() => void press(starterPressBody(to.trim(), because.trim()))}>{t('starterMove.change')}</Btn></div>
          {!because.trim() && <p className="starter-line">{t('starterMove.writeWhyFirst')}</p>}
        </>}
        <div className="starter-actions"><Btn pending={busy} onClick={close}>{t('starterMove.cancel')}</Btn></div>
      </>}
      {reading.value.changes.filter((one) => one.state !== 'waiting').map((one) => <StarterChangeDetails key={one.id} change={one} />)}
    </>}
    {error && <p className="starter-line" role="alert">{error}</p>}
  </Panel>
}
