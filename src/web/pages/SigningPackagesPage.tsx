// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A secretary brings known acts; you strike items and sign once, then read every item's receipt. */
import { t, type WordKey } from '@shared/i18n.ts'
import { useState } from 'react'
import type { ASigningPackage, SigningPackageItemState, SigningPackageState } from '../../server/lib/signing-packages.ts'
import { api, errorMessage, faultOf } from '../api.ts'
import { signingPackagePath } from '../components/router.tsx'
import { Absence, Btn, ErrorNote, Loading, Panel, Stamp, useAsync } from '../components/ui.tsx'
import { useLanguage } from '../lib/language.ts'

const PACKAGE_WORDS: Record<SigningPackageState, WordKey> = {
  waiting: 'signingPackages.state.waiting', signed: 'signingPackages.state.signed',
  refused: 'signingPackages.state.refused', withdrawn: 'signingPackages.state.withdrawn',
}
const ITEM_WORDS: Record<SigningPackageItemState, WordKey> = {
  waiting: 'signingPackages.item.waiting', struck: 'signingPackages.item.struck',
  done: 'signingPackages.item.done', 'could-not': 'signingPackages.item.could-not', 'not-run': 'signingPackages.item.not-run',
  held: 'signingPackages.item.held', 'not-used': 'signingPackages.item.not-used',
}

export function SigningPackagesPage({ id }: { id?: string }) {
  useLanguage()
  return <div className="page sp">
    <style href="mole-office-signing-packages" precedence="default">{SIGNING_PACKAGES_CSS}</style>
    <header className="sp-head">
      <h1 className="sp-title" data-title-is="its-label">{t('nav.signingPackages')}</h1>
      <p className="sp-intro">{t('signingPackages.intro')}</p>
    </header>
    {id === undefined ? <PackageLists /> : <OnePackage key={id} id={id} />}
  </div>
}

function PackageLists() {
  const [state, reload] = useAsync(async () => {
    const replies = await Promise.all((['waiting', 'signed', 'refused', 'withdrawn'] as const).map(one => api.signingPackages(one)))
    return { waiting: replies[0]!.packages, answered: replies.slice(1).flatMap(one => one.packages).sort((a, b) => b.broughtAt.localeCompare(a.broughtAt) || b.id.localeCompare(a.id)).slice(0, 25) }
  }, [])
  if (state.status === 'loading') return <Loading label={t('signingPackages.loading')} rows={2} />
  if (state.status === 'error') return <ErrorNote message={state.message} fault={state.fault ?? null} retry={reload} />
  return <>
    <PackageList packages={state.value.waiting} waiting />
    <PackageList packages={state.value.answered} waiting={false} />
  </>
}
function PackageList({ packages, waiting }: { packages: ASigningPackage[]; waiting: boolean }) {
  const title = t(waiting ? 'signingPackages.waitingTitle' : 'signingPackages.answeredTitle')
  const rows = packages.length === 0 ? <Absence looked tier="told-apart" title={title} word={t(waiting ? 'signingPackages.noneWaiting' : 'signingPackages.noneAnswered')} /> : <ul className="sp-rows">
    {packages.map(pack => <li key={pack.id}>
      <a className="sp-row" href={`#${signingPackagePath(pack.id)}`}>
        <span>{pack.task}</span>
        <span className="sp-row-meta">{t(PACKAGE_WORDS[pack.state])} · {pack.forAgent.handle ?? pack.forAgent.id} · <Stamp at={pack.broughtAt} /></span>
      </a>
    </li>)}
  </ul>
  // Each name is written whole on its own line, so a reader of the source finds it.
  return waiting
    ? <Panel declares={{ surface: 'signingpackages.waiting' }} title={title} titleIs="label">{rows}</Panel>
    : <Panel declares={{ surface: 'signingpackages.answered' }} title={title} titleIs="label">{rows}</Panel>
}
function OnePackage({ id }: { id: string }) {
  const [state, reload] = useAsync(() => api.signingPackage(id).then(reply => reply.package), [id])
  if (state.status === 'loading') return <Loading label={t('signingPackages.loading')} rows={2} />
  if (state.status === 'error') return <ErrorNote message={state.message} fault={state.fault ?? null} retry={reload} />
  return <ThePackage package={state.value} />
}
function ThePackage({ package: initial }: { package: ASigningPackage }) {
  const [pack, setPack] = useState(initial)
  const [struck, setStruck] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState<'sign' | 'refuse' | null>(null)
  const [fault, setFault] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const waiting = pack.state === 'waiting'
  const press = (which: 'sign' | 'refuse'): void => {
    setBusy(which)
    setFault(null)
    const asked = which === 'sign' ? api.signAPackage(pack.id, [...struck]) : api.refuseAPackage(pack.id)
    void asked.then(reply => { setPack(reply.package); setBusy(null) }).catch((err: unknown) => { setBusy(null); setFault({ message: errorMessage(err), fault: faultOf(err) }) })
  }
  const strike = (id: string): void => setStruck(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  return <div data-signing-package={pack.id}><Panel declares={{ surface: 'signingpackages.open' }} title={pack.task} kind={t(PACKAGE_WORDS[pack.state])} {...(waiting ? { rank: 0 as const, tone: 'ask' as const } : {})}>
    <div className="sp-one">
      <dl className="sp-facts">
        <dt>{t('signingPackages.forAgent')}</dt><dd>{pack.forAgent.handle ?? pack.forAgent.id}</dd>
        <dt>{t('signingPackages.broughtBy')}</dt><dd>{pack.broughtBy.handle ?? pack.broughtBy.id}</dd>
        <dt>{t('signingPackages.broughtAt')}</dt><dd><Stamp at={pack.broughtAt} /></dd>
      </dl>
      {waiting ? null : <p className="sp-answer" data-package-answer={pack.state}>
        {pack.state === 'withdrawn' ? t('signingPackages.withdrawnBy', { secretary: pack.answeredBy?.handle ?? pack.broughtBy.handle ?? pack.broughtBy.id }) : t(pack.state === 'signed' ? 'signingPackages.signedBy' : 'signingPackages.refusedBy', { who: pack.answeredBy?.kind === 'person' ? t('signingPackages.you') : pack.answeredBy?.handle ?? pack.answeredBy?.id ?? t('signingPackages.unknownSigner') })}
        {pack.answeredAt === null ? null : <> · <Stamp at={pack.answeredAt} /></>}
      </p>}
      <ol className="sp-items">
        {pack.items.map(item => {
          const isStruck = waiting ? struck.has(item.id) : item.state === 'struck'
          return <li className="sp-item" key={item.id} data-package-item={item.id} data-struck={isStruck ? 'yes' : 'no'} data-state={item.state}>
            <div className="sp-item-head">
              <h2 className="sp-shows"><span className="sp-position">{item.position}.</span> {item.shows}</h2>
              {waiting ? <Btn disabled={busy !== null} reason={t('signingPackages.answering')} onClick={() => strike(item.id)}>{t(isStruck ? 'signingPackages.takeBackStrike' : 'signingPackages.strike')}</Btn> : null}
            </div>
            <p className="sp-item-state">{waiting ? t(isStruck ? 'signingPackages.willNotRun' : 'signingPackages.item.waiting') : t(ITEM_WORDS[item.state])}</p>
            <dl className="sp-facts">
              <dt>{t('signingPackages.why')}</dt><dd>{item.why}</dd>
              <dt>{t('signingPackages.changes')}</dt><dd>{item.changes}</dd>
              <dt>{t('signingPackages.undone')}</dt><dd>{item.undone}</dd>
            </dl>
            {waiting ? null : <div className="sp-outcome">
              <p>{item.outcome}</p>
              {item.doneAt !== null ? <Stamp at={item.doneAt} /> : pack.answeredAt !== null ? <span>{t('signingPackages.answeredAt')} · <Stamp at={pack.answeredAt} /></span> : null}
            </div>}
          </li>
        })}
      </ol>
      {fault === null ? null : <ErrorNote message={fault.message} fault={fault.fault} />}
      {waiting ? <div className="sp-actions">
        <p className="sp-only">{t('signingPackages.onlyYou')}</p>
        {struck.size === pack.items.length ? <p className="sp-only">{t('signingPackages.allStruck')}</p> : null}
        <div className="sp-presses">
          {struck.size === pack.items.length ? null : <Btn variant="primary" pending={busy === 'sign'} disabled={busy !== null} reason={t('signingPackages.answering')} onClick={() => press('sign')}>{t('signingPackages.sign')}</Btn>}
          <Btn pending={busy === 'refuse'} disabled={busy !== null} reason={t('signingPackages.answering')} onClick={() => press('refuse')}>{t('signingPackages.refuse')}</Btn>
        </div>
      </div> : null}
    </div>
  </Panel></div>
}

const SIGNING_PACKAGES_CSS = `
.sp, .sp-head, .sp-one, .sp-actions { display: grid; gap: var(--pad); min-width: 0; }
.sp { gap: var(--gut); }
.sp-title { margin: 0; color: var(--text); font: 600 var(--fs-4)/var(--lh-tight) var(--font-ui); overflow-wrap: anywhere; }
.sp-intro, .sp-only, .sp-answer { margin: 0; color: var(--text-2); font: var(--fs-2)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.sp-intro { max-width: 70ch; }
.sp-rows, .sp-items { display: grid; gap: var(--pad); margin: 0; padding: 0; list-style: none; min-width: 0; }
.sp-row { display: grid; gap: 4px; padding: var(--pad); border: var(--border-w) solid var(--border); border-radius: var(--radius-sm); color: var(--text); text-decoration: none; overflow-wrap: anywhere; }
.sp-row:hover { border-color: var(--border-strong); }
.sp-row-meta { color: var(--text-3); font: var(--fs-1)/var(--lh-read) var(--font-ui); }
.sp-item { padding: var(--gut); border: var(--border-w) solid var(--border); border-radius: var(--radius-sm); display: grid; gap: var(--pad); min-width: 0; }
.sp-item-head { display: flex; gap: var(--pad); align-items: start; justify-content: space-between; }
.sp-shows { margin: 0; color: var(--text); font: 600 var(--fs-2)/var(--lh-read) var(--font-ui); min-width: 0; overflow-wrap: anywhere; }
.sp-position { color: var(--text-3); }
.sp-item[data-struck='yes'] .sp-shows { text-decoration: line-through; }
.sp-item-state { margin: 0; color: var(--text-2); font: 600 var(--fs-1)/var(--lh-read) var(--font-ui); }
.sp-item[data-state='could-not'] { border-color: var(--st-failed); }
.sp-item[data-state='could-not'] .sp-item-state { color: var(--st-failed); }
.sp-item[data-state='done'] .sp-item-state { color: var(--st-done); }
.sp-facts { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 6px var(--pad); margin: 0; font: var(--fs-2)/var(--lh-read) var(--font-ui); }
.sp-facts dt { color: var(--text-3); }
.sp-facts dd { margin: 0; min-width: 0; color: var(--text); overflow-wrap: anywhere; }
.sp-outcome { border-top: var(--border-w) solid var(--border); padding-top: var(--pad); color: var(--text); font: var(--fs-2)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.sp-outcome p { margin: 0 0 4px; }
.sp-presses { display: flex; flex-wrap: wrap; gap: var(--pad); }
@media (max-width: 660px) {
  .sp-facts { grid-template-columns: minmax(0, 1fr); gap: 4px; }
  .sp-facts dt:not(:first-child) { margin-top: 8px; }
  .sp-item-head { flex-wrap: wrap; }
}
`
