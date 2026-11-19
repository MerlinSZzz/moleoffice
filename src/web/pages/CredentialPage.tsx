// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
import { cardWord } from '@shared/card-words.ts'
import { useInspect } from '../lib/mode.ts'
import { useLanguage } from '../lib/language.ts'
import { TieredPress } from '../components/TieredPress.tsx'
import { RevokeTheirKey } from '../components/RevokeTheirKey.tsx'
import type React from 'react'
import { useState } from 'react'
import { errorMessage, faultOf, api } from '../api.ts'
import { Absence, ErrorNote, Loading, Panel } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { BackLink } from '../components/BackLink.tsx'
import {
  noKeyWorksUnder,
  whatACredentialCannotProve,
  whatAMismatchDoesToday,
  type FactMismatch,
  type VisitorCredential,
  type VisitorRequestRow,
} from '@shared/visitors.ts'
export const CREDENTIAL_WORDS = {
  standing: {
    get pending() { return t('g4.credential.pending') },
    get trusted() { return t('g4.credential.trusted') },
    get ended() { return t('g4.credential.ended') },
  },
  meaning: {
    get pending() { return t('g4.credential.meaningPending') },
    get trusted() { return t('g4.credential.meaningTrusted') },
    get ended() { return t('g4.credential.meaningEnded') },
  },
  get tokenRemovedStanding() { return t('g4.credential.tokenRemovedStanding') },
  get tokenRemoved() { return t('g4.credential.tokenRemoved') },
  get confirm() { return t('g4.credential.confirm') },
  get end() { return t('g4.credential.end') },
  get facts() { return t('g4.credential.facts') },
  get cannotProve() { return t('g4.credential.cannotProve') },
  get didDo() { return t('g4.credential.didDo') },
  get requests() { return t('g4.credential.requests') },
  get handle() { return t('g4.credential.handle') },
  get role() { return t('g4.credential.role') },
  get machine() { return t('g4.credential.machine') },
  get world() { return t('g4.credential.world') },
  get conversation() { return t('g4.credential.conversation') },
  get startDirectory() { return t('g4.credential.startDirectory') },
  get runtime() { return t('g4.credential.runtime') },
  get session() { return t('g4.credential.session') },
  get issued() { return t('g4.credential.issued') },
  get expires() { return t('g4.credential.expires') },
  get confirmedBy() { return t('g4.credential.confirmedBy') },
  get endedAt() { return t('g4.credential.endedAt') },
  get countRequests() { return t('g4.credential.countRequests') },
  get countWrites() { return t('g4.credential.countWrites') },
  get countMismatches() { return t('g4.credential.countMismatches') },
  get nobodySaid() { return t('g4.credential.nobodySaid') },
  get noRequests() { return t('g4.credential.noRequests') },
  get mismatchIssued() { return t('g4.credential.mismatchIssued') },
  get mismatchSent() { return t('g4.credential.mismatchSent') },
  get noWorld() { return t('g4.credential.noWorld') },
  get noWorldWhy() { return t('g4.credential.noWorldWhy') },
} as const
export function CredentialPage({ id }: { id: string }) {
  useLanguage()
  const [again, setAgain] = useState(0)
  const [state] = useProjectAsync(() => api.visitor(id), [id, again])
  return (
    <div className="page cred">
      <style href="mole-office-credential" precedence="default">
        {CREDENTIAL_CSS}
      </style>
      <BackLink page="embassy" />
      {state.status === 'loading' ? <Loading what={t('g4.credential.loading')} /> : null}
      {state.status === 'error' ? <ErrorNote message={state.message} fault={state.fault} /> : null}
      {state.status === 'ready' ? (
        <TheCredential
          credential={state.value.credential}
          requests={state.value.requests}
          onChanged={() => {
            setAgain((n) => n + 1)
          }}
        />
      ) : null}
    </div>
  )
}
export function TheCredential({
  credential,
  requests,
  onChanged,
}: {
  credential: VisitorCredential
  requests: VisitorRequestRow[]
  onChanged: () => void
}) {
  const inspect = useInspect()
  const [pressing, setPressing] = useState<'confirm' | 'end' | null>(null)
  const noTokenWorks = noKeyWorksUnder(credential)
  const [refused, setRefused] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const press = (which: 'confirm' | 'end') => {
    setPressing(which)
    setRefused(null)
    const done = which === 'confirm' ? api.confirmVisitor(credential.id) : api.endVisitor(credential.id)
    done
      .then(() => {
        setPressing(null)
        onChanged()
      })
      .catch((wrong: unknown) => {
        setPressing(null)
        setRefused({ message: errorMessage(wrong), fault: faultOf(wrong) })
      })
  }
  return (
    <>
      <h1 className="cred-title">{credential.name}</h1>
      <Panel titleIs="label"
        declares={{ surface: 'credential.standing' }}
        title={noTokenWorks ? CREDENTIAL_WORDS.tokenRemovedStanding : CREDENTIAL_WORDS.standing[credential.standing]}
      >
        <p className="cred-meaning" data-token-removed={credential.tokenRemoved ? 'yes' : 'no'}>
          {noTokenWorks ? CREDENTIAL_WORDS.tokenRemoved : CREDENTIAL_WORDS.meaning[credential.standing]}
        </p>
        <div className="cred-presses">
          {credential.standing === 'pending' && !noTokenWorks ? (
            <button
              type="button"
              className="cred-press cred-confirm"
              disabled={pressing !== null}
              onClick={() => {
                press('confirm')
              }}
            >
              {CREDENTIAL_WORDS.confirm}
            </button>
          ) : null}
          {credential.standing === 'ended' ? null : (
            <div className="cred-end">
              <TieredPress tier="confirm" disabled={pressing !== null}
                press={CREDENTIAL_WORDS.end} pending={t('g4.credential.ending')}
                question={t('g4.credential.endQuestion')} quote={credential.name}
                warning={t('g4.credential.endWarning')} cancel={t('g4.cancel')}
                onPress={async () => {
                  setPressing('end')
                  setRefused(null)
                  try { await api.endVisitor(credential.id); onChanged() }
                  finally { setPressing(null) }
                }} />
            </div>
          )}
          <RevokeTheirKey credential={credential.id} />
        </div>
        {refused === null ? null : <ErrorNote message={refused.message} fault={refused.fault} />}
      </Panel>
      <Panel titleIs="label" declares={{ surface: 'credential.cannotprove' }} title={CREDENTIAL_WORDS.cannotProve}>
        <ul className="cred-limits">
          {inspect ? whatACredentialCannotProve().map((one) => (
            <li key={one}>{one}</li>
          )) : <li>{t('g4.credential.limitShort')}</li>}
          <li className="cred-open">{whatAMismatchDoesToday()}</li>
        </ul>
      </Panel>
      <Panel titleIs="label" declares={{ surface: 'credential.facts' }} title={inspect ? CREDENTIAL_WORDS.facts : t('g4.credential.details')}>
        <dl className="cred-facts">
          {inspect ? <Fact label={CREDENTIAL_WORDS.handle} value={credential.handle} /> : null}
          <Fact label={CREDENTIAL_WORDS.role} value={credential.role === '' ? null : cardWord(credential.role)} />
          {inspect ? <>
          <Fact
            label={CREDENTIAL_WORDS.machine}
            value={credential.machine === null ? null : `${credential.machine} (${credential.machineHow})`}
          />
          <Fact
            label={CREDENTIAL_WORDS.world}
            value={credential.world}
            absent={<Absence />}
          />
          <Fact label={CREDENTIAL_WORDS.conversation} value={credential.facts.conversationPath} />
          <Fact label={CREDENTIAL_WORDS.startDirectory} value={credential.facts.startDirectory} />
          <Fact label={CREDENTIAL_WORDS.runtime} value={credential.facts.runtime} />
          <Fact label={CREDENTIAL_WORDS.session} value={credential.facts.sessionRecord} />
          </> : null}
          <Fact label={CREDENTIAL_WORDS.issued} value={credential.issuedAt} />
          <Fact label={CREDENTIAL_WORDS.expires} value={credential.endsAt} />
          {inspect ? <Fact
            label={CREDENTIAL_WORDS.confirmedBy}
            value={
              credential.confirmedBy === null
                ? null
                : `${credential.confirmedBy.id}${credential.confirmedAt === null ? '' : `, ${credential.confirmedAt}`}`
            }
          />
          : <Fact label={t('g4.credential.confirmedAt')} value={credential.confirmedAt} />}
          {credential.endedAt === null ? null : (
            <Fact
              label={CREDENTIAL_WORDS.endedAt}
              value={`${credential.endedAt}${!inspect || credential.endedBecause === null ? '' : ` — ${credential.endedBecause}`}`}
            />
          )}
        </dl>
      </Panel>
      <Panel titleIs="label" declares={{ surface: 'credential.did' }} title={CREDENTIAL_WORDS.didDo}>
        <dl className="cred-facts">
          <Fact label={CREDENTIAL_WORDS.countRequests} value={String(credential.requests)} />
          <Fact label={CREDENTIAL_WORDS.countWrites} value={String(credential.writes)} />
          <Fact label={CREDENTIAL_WORDS.countMismatches} value={String(credential.mismatches)} />
        </dl>
        {requests.length === 0 ? (
          <p className="cred-none">
            <Absence />
          </p>
        ) : (
          <ul className="cred-requests">
            {requests.map((one) => (
              <Request key={one.id} request={one} />
            ))}
          </ul>
        )}
      </Panel>
    </>
  )
}
function Fact({ label, value, absent }: { label: string; value: string | null; absent?: React.ReactNode }) {
  return (
    <div className="cred-fact">
      <dt className="cred-key">{label}</dt>
      <dd className={value === null ? 'cred-value cred-absent' : 'cred-value'}>
        {value ?? absent ?? <Absence />}
      </dd>
    </div>
  )
}
function Request({ request }: { request: VisitorRequestRow }) {
  const inspect = useInspect()
  return (
    <li className="cred-request" data-mismatch={request.mismatch.length > 0 ? 'yes' : 'no'}>
      <span className="cred-when">{request.at}</span>
      {inspect ? <>
      <span className="cred-route">
        {request.method} {request.route}
      </span>
      {request.refusedBecause === null ? null : <span className="cred-refused">{request.refusedBecause}</span>}
      {request.mismatch.map((one) => (
        <Mismatch key={one.said} mismatch={one} />
      ))}
      </> : <>
        <span>{t(request.wrote ? 'g4.credential.wrote' : 'g4.credential.read')}</span>
        {request.refusedBecause === null ? null : <span className="cred-refused">{t('g4.credential.refused')}</span>}
        {request.mismatch.length === 0 ? null : <span>{t('g4.credential.mismatched')}</span>}
      </>}
    </li>
  )
}
function Mismatch({ mismatch }: { mismatch: FactMismatch }) {
  return (
    <span className="cred-mismatch">
      <span className="cred-key">{mismatch.said}</span>
      <span className="cred-key">{CREDENTIAL_WORDS.mismatchIssued}</span>
      <span className="cred-value">{mismatch.issued ?? <Absence />}</span>
      <span className="cred-key">{CREDENTIAL_WORDS.mismatchSent}</span>
      <span className="cred-value">{mismatch.sent ?? <Absence />}</span>
    </span>
  )
}
const CREDENTIAL_CSS = `
.cred { display: flex; flex-direction: column; gap: var(--gut); min-width: 0; }
.cred-title { margin: 0; color: var(--text); font: 600 var(--fs-6)/var(--lh-tight) var(--font-ui); overflow-wrap: anywhere; }
.cred-meaning { margin: 0 0 8px; max-width: var(--measure-in-box); font-size: var(--fs-2); line-height: var(--lh-read); color: var(--text-2); }
.cred-presses { display: flex; flex-wrap: wrap; gap: 8px; }
.cred-press {
  min-height: 32px;
  padding: 0 var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font-size: var(--fs-2);
  font-weight: 600;
  cursor: pointer;
}
.cred-press:hover:enabled { background: var(--hover); }
.cred-press:disabled { opacity: .55; cursor: default; }
.cred-end { border-color: var(--danger, var(--border-strong)); color: var(--danger, var(--text)); }
.cred-limits { margin: 0; padding-left: 1.1em; max-width: var(--measure-in-box); display: flex; flex-direction: column; gap: 6px; }
.cred-limits li { font-size: var(--fs-2); line-height: var(--lh-read); color: var(--text-2); }
.cred-open { color: var(--text-3); font-style: italic; }
.cred-facts { margin: 0; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.cred-fact { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; min-width: 0; }
.cred-fact dt, .cred-fact dd { margin: 0; }
.cred-key {
  font-size: var(--fs-1);
  font-weight: 600;
  color: var(--text-3);
  letter-spacing: .06em;
  text-transform: uppercase;
}
.cred-value { font-size: var(--fs-2); color: var(--text-2); overflow-wrap: anywhere; }
.cred-absent { font-style: italic; color: var(--text-3); }
.cred-requests { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.cred-request { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; min-width: 0; font-size: var(--fs-2); }
.cred-when { font-size: var(--fs-1); color: var(--text-3); }
.cred-route { color: var(--text); overflow-wrap: anywhere; }
.cred-refused { color: var(--text-2); overflow-wrap: anywhere; }
.cred-request[data-mismatch='yes'] { border-left: 3px solid var(--danger, var(--border-strong)); padding-left: 8px; }
.cred-mismatch { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; width: 100%; min-width: 0; }
.cred-none { margin: 8px 0 0; font-size: var(--fs-2); font-style: italic; color: var(--text-3); }
`
