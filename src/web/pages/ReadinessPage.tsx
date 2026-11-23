// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE READINESS CHECKLISTS: AN OPERATION THAT REACHES OTHERS WAITS FOR THEIR SIGNATURES. Two
 * decisions, wave 13u round 13.
 *
 *   #/readiness        what waits for one signer's signature, the person's or an agent's, and every checklist
 *   #/readiness/<id>   the same page with one checklist opened: its signers, who has signed, and the person's presses
 *
 * The office works out who signs and runs the operation when the last one signs (src/server/lib/readiness.ts), so
 * this page decides nothing about either and only draws what it was sent. The person's signature goes only through
 * POST /api/readiness/<id>/sign-as-the-person, which the server refuses to anybody else; its sentence is drawn here.
 * An agent signs through its own key, never on this page.
 */

import { content, t, type WordKey } from '@shared/i18n.ts'
import { THE_PERSON } from '@shared/person.ts'
import type { ReadinessState } from '@shared/readiness-checklists.ts'
import { drawnStamp } from '@shared/time.ts'
import { useState } from 'react'
import type { AReadinessChecklist } from '../../server/lib/readiness.ts'
import { api, errorMessage, faultOf } from '../api.ts'
import { readinessPath } from '../components/router.tsx'
import { Absence, Btn, ErrorNote, Loading, Panel, ServerNote, Stamp, useAsync } from '../components/ui.tsx'
import { AgentPicker, type AnAgentToPick } from '../components/agent/AgentPicker.tsx'
import { useLanguage } from '../lib/language.ts'

const STATE_WORDS: Record<ReadinessState, WordKey> = {
  waiting: 'readiness.state.waiting',
  running: 'readiness.state.running',
  ran: 'readiness.state.ran',
  'could-not': 'readiness.state.could-not',
  cancelled: 'readiness.state.cancelled',
  expired: 'readiness.state.expired',
}

/** A signer's name as a person reads it: "You" for the person, an agent's handle, or that the registry has no name. */
export function signerName(one: { kind: string; name: string | null }): string {
  if (one.kind === 'person') return t('readiness.signer.you')
  return one.name ?? t('readiness.signer.unnamed')
}

export function ReadinessPage({ id }: { id?: string }) {
  useLanguage()
  const [again, setAgain] = useState(0)
  const reload = (): void => setAgain((n) => n + 1)
  return (
    <div className="page rd">
      <style href="mole-office-readiness" precedence="default">
        {READINESS_CSS}
      </style>
      <header className="rd-head">
        {/* THE NAME, TYPED: the same words as the rail row that opens this page. */}
        <h1 className="rd-title" data-title-is="its-label">{t('nav.readiness')}</h1>
      </header>
      {id === undefined ? null : <OneChecklist key={`${id}-${String(again)}`} id={id} onPressed={reload} />}
      <WaitingForASigner key={`waiting-${String(again)}`} />
      <EveryChecklist key={`every-${String(again)}`} />
    </div>
  )
}

/**
 * WHAT WAITS FOR ONE SIGNER. The person's by default; the agent picker offers every agent that a waiting checklist
 * names, so an agent's queue can be read here too. The list itself is the server's answer for that signer.
 */
function WaitingForASigner() {
  const [signer, setSigner] = useState('person')
  const waiting = useAsync(() => api.readinessChecklists().then((r) => r.checklists.filter((one) => one.state === 'waiting')), [])[0]
  const [state, reload] = useAsync(() => api.readinessWaitingFor(signer).then((r) => r.checklists), [signer])
  const agents = new Map<string, string>()
  if (waiting.status === 'ready') {
    for (const checklist of waiting.value) for (const one of checklist.signers) if (one.kind === 'agent') agents.set(one.id, signerName(one))
  }
  const candidates: AnAgentToPick[] = [
    { kind: 'person', id: THE_PERSON, value: 'person', name: t('readiness.signer.you') },
    ...[...agents].map(([agentId, name]) => ({ kind: 'agent' as const, id: agentId, value: `agent:${agentId}`, name })),
  ]
  return (
    <Panel declares={{ surface: 'readiness.waiting' }} title={t('readiness.waitingTitle')} titleIs="label">
      <div className="rd-waiting">
        <div className="rd-picker">
          <AgentPicker
            label={t('readiness.waitingFor')}
            candidates={candidates}
            chosen={candidates.some((one) => one.value === signer) ? signer : 'person'}
            onChoose={setSigner}
          />
        </div>
        {state.status === 'loading' ? <Loading label={t('readiness.loading')} rows={1} /> : null}
        {state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault ?? null} retry={reload} /> : null}
        {state.status === 'ready' ? (
          state.value.length === 0 ? (
            <Absence looked tier="told-apart" title={t('readiness.waitingTitle')} word={t('readiness.noneWaiting')} />
          ) : (
            <ul className="rd-rows">
              {state.value.map((one) => (
                <ChecklistRow key={one.id} checklist={one} />
              ))}
            </ul>
          )
        ) : null}
      </div>
    </Panel>
  )
}

/** THE NEWEST CHECKLISTS, AT MOST 25, of every state. */
function EveryChecklist() {
  const [state, reload] = useAsync(() => api.readinessChecklists().then((r) => r.checklists), [])
  return (
    <Panel declares={{ surface: 'readiness.list' }} title={t('readiness.everyTitle')} titleIs="label">
      {state.status === 'loading' ? <Loading label={t('readiness.loading')} rows={2} /> : null}
      {state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault ?? null} retry={reload} /> : null}
      {state.status === 'ready' ? (
        state.value.length === 0 ? (
          <Absence looked tier="told-apart" title={t('readiness.everyTitle')} word={t('readiness.none')} />
        ) : (
          <ul className="rd-rows">
            {state.value.map((one) => (
              <ChecklistRow key={one.id} checklist={one} />
            ))}
          </ul>
        )
      ) : null}
    </Panel>
  )
}

/** THE MOMENT THE SIGNATURES ARE DUE, as a clock time: it is still ahead, and Stamp only says how long ago a moment was. */
function Deadline({ at }: { at: string }) {
  return (
    <time className="px-stamp" dateTime={at}>
      {drawnStamp(at)}
    </time>
  )
}

/** One checklist in a list: what it would do, where it stands, how many have signed, and a link to it. */
export function ChecklistRow({ checklist }: { checklist: AReadinessChecklist }) {
  const signed = checklist.signers.length - checklist.notSigned.length
  return (
    <li className="rd-row" data-readiness={checklist.id} data-state={checklist.state}>
      <a className="rd-row-link" href={`#${readinessPath(checklist.id)}`}>
        <span className="rd-row-shows">{content(checklist.shows)}</span>
        <span className="rd-row-meta">
          {t(STATE_WORDS[checklist.state])} · {t('readiness.signedOf', { signed, all: checklist.signers.length })}
          {checklist.state === 'waiting' ? (
            <>
              {' · '}
              {t('readiness.until')} <Deadline at={checklist.endsAt} />
            </>
          ) : null}
        </span>
      </a>
    </li>
  )
}

/** ONE CHECKLIST OPENED: what it does, who signs and why, who has signed and when, and the person's presses. */
function OneChecklist({ id, onPressed }: { id: string; onPressed: () => void }) {
  const [state, reload] = useAsync(() => api.readinessChecklist(id).then((r) => r.checklist), [id])
  if (state.status === 'loading') return <Loading label={t('readiness.loadingOne')} rows={2} />
  if (state.status === 'error') return <ErrorNote message={state.message} fault={state.fault ?? null} retry={reload} />
  return <TheChecklist checklist={state.value} onPressed={onPressed} />
}

/** The checklist, drawn from what was fetched. Exported so a test can render it with no server. */
export function TheChecklist({ checklist, onPressed }: { checklist: AReadinessChecklist; onPressed?: () => void }) {
  const [busy, setBusy] = useState<'sign' | 'withdraw' | 'cancel' | null>(null)
  const [fault, setFault] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const [ran, setRan] = useState<string | null>(null)
  const person = checklist.signers.find((one) => one.kind === 'person')
  const waiting = checklist.state === 'waiting'
  const press = (which: 'sign' | 'withdraw' | 'cancel'): void => {
    setFault(null)
    setBusy(which)
    const asked =
      which === 'sign'
        ? api.signAsThePerson(checklist.id).then((r) => setRan(r.ran ? (r.said ?? null) : null))
        : which === 'withdraw'
          ? api.withdrawASignature(checklist.id)
          : api.cancelAReadinessChecklist(checklist.id)
    void asked
      .then(() => {
        setBusy(null)
        onPressed?.()
      })
      .catch((err: unknown) => {
        setBusy(null)
        setFault({ message: errorMessage(err), fault: faultOf(err) })
      })
  }
  return (
    <Panel
      declares={{ surface: 'readiness.open' }}
      title={checklist.shows}
      kind={t(STATE_WORDS[checklist.state])}
      {...(waiting && person !== undefined && person.signedAt === null ? { rank: 0 as const, tone: 'ask' as const } : {})}
    >
      <div className="rd-one" data-readiness-open={checklist.id} data-state={checklist.state}>
        <dl className="rd-facts">
          <dt>{t('readiness.reach')}</dt>
          <dd>{t(checklist.level === 'everyone' ? 'readiness.level.everyone' : 'readiness.level.a-group')}</dd>
          <dt>{t('readiness.raisedBy')}</dt>
          <dd>
            {signerName(checklist.raisedBy)} · <Stamp at={checklist.raisedAt} />
          </dd>
          {checklist.because === null ? null : (
            <>
              <dt>{t('readiness.because')}</dt>
              <dd>{content(checklist.because)}</dd>
            </>
          )}
          <dt>{waiting ? t('readiness.until') : t('readiness.closed')}</dt>
          <dd>{waiting ? <Deadline at={checklist.endsAt} /> : <Stamp at={checklist.closedAt ?? checklist.endsAt} />}</dd>
          {checklist.outcome === null ? null : (
            <>
              <dt>{t('readiness.outcome')}</dt>
              <dd>{content(checklist.outcome)}</dd>
            </>
          )}
        </dl>
        <h3 className="rd-signers-title">{t('readiness.signers')}</h3>
        <ul className="rd-signers">
          {checklist.signers.map((one) => (
            <li key={`${one.kind}:${one.id}`} className="rd-signer" data-signed={one.signedAt === null ? 'no' : 'yes'}>
              <span className="rd-signer-mark" aria-hidden="true">{one.signedAt === null ? '○' : '●'}</span>
              <span className="rd-signer-name">{signerName(one)}</span>
              <span className="rd-signer-when">
                {one.signedAt === null ? t('readiness.notSigned') : (
                  <>
                    {t('readiness.signed')} <Stamp at={one.signedAt} />
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
        {ran === null ? null : (
          <>
            <p className="rd-ran" role="status">{t('readiness.state.ran')}</p>
            <ServerNote text={ran} />
          </>
        )}
        {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
        {waiting ? (
          <div className="rd-presses">
            {person !== undefined && person.signedAt === null ? (
              <Btn variant="primary" onClick={() => press('sign')} pending={busy === 'sign'} disabled={busy !== null} reason={t('sheet.button.waitsForTheLastAnswer')}>
                {t('readiness.sign')}
              </Btn>
            ) : null}
            {person !== undefined && person.signedAt !== null ? (
              <Btn onClick={() => press('withdraw')} pending={busy === 'withdraw'} disabled={busy !== null} reason={t('sheet.button.waitsForTheLastAnswer')}>
                {t('readiness.withdraw')}
              </Btn>
            ) : null}
            <Btn onClick={() => press('cancel')} pending={busy === 'cancel'} disabled={busy !== null} reason={t('sheet.button.waitsForTheLastAnswer')}>
              {t('readiness.cancel')}
            </Btn>
          </div>
        ) : null}
      </div>
    </Panel>
  )
}

export const READINESS_CSS = `
.rd { display: grid; gap: var(--gut); min-width: 0; }
.rd-head { display: grid; gap: var(--pad); min-width: 0; }
.rd-title { margin: 0; color: var(--text); font: 600 var(--fs-4)/var(--lh-tight) var(--font-ui); overflow-wrap: anywhere; }
.rd-intro { margin: 0; max-width: 70ch; color: var(--text-2); font: var(--fs-2)/var(--lh-read) var(--font-ui); }
.rd-waiting { display: grid; gap: var(--pad); min-width: 0; }
.rd-picker { max-width: 22rem; }
.rd-rows { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; min-width: 0; }
.rd-row-link { display: grid; gap: 2px; padding: 8px 10px; border: var(--border-w) solid var(--border); border-radius: var(--radius-sm); color: var(--text); text-decoration: none; min-width: 0; }
.rd-row-link:hover { border-color: var(--border-strong); }
.rd-row-shows { font: var(--fs-2)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.rd-row-meta { color: var(--text-3); font: var(--fs-1)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.rd-one { display: grid; gap: var(--pad); min-width: 0; }
.rd-facts { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 6px var(--gut); margin: 0; font: var(--fs-2)/var(--lh-read) var(--font-ui); }
.rd-facts dt { color: var(--text-3); }
.rd-facts dd { margin: 0; color: var(--text); min-width: 0; overflow-wrap: anywhere; }
.rd-signers-title { margin: 0; color: var(--text-2); font: 600 var(--fs-2)/var(--lh-tight) var(--font-ui); }
.rd-signers { display: grid; grid-template-columns: 1.2em minmax(6rem, max-content) minmax(0, 1fr) max-content; gap: 4px var(--gut); margin: 0; padding: 0; list-style: none; min-width: 0; }
.rd-signer { display: grid; grid-column: 1 / -1; grid-template-columns: subgrid; align-items: baseline; font: var(--fs-2)/var(--lh-read) var(--font-ui); }
.rd-signer-mark { color: var(--text-3); }
.rd-signer[data-signed='yes'] .rd-signer-mark { color: var(--st-done); }
.rd-signer-name { color: var(--text); overflow-wrap: anywhere; }
.rd-signer-why { color: var(--text-3); overflow-wrap: anywhere; }
.rd-signer-when { color: var(--text-2); }
.rd-presses { display: flex; flex-wrap: wrap; gap: var(--pad); }
.rd-ran, .rd-only { margin: 0; color: var(--text-2); font: var(--fs-1)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
@media (max-width: 480px) {
  .rd-facts { grid-template-columns: minmax(0, 1fr); }
  .rd-facts dt { margin-top: 4px; }
  .rd-signers { grid-template-columns: 1.2em minmax(0, 1fr); }
  .rd-signer-why, .rd-signer-when { grid-column: 2; }
}
`
