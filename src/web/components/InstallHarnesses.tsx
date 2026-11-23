// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE AGENT TOOLS PANEL ON TERMINAL MANAGEMENT: EACH TOOL'S VERSION, THE NEWEST ONE, AND THE INSTALL PRESS. Wave 13u, round 3.
 *
 * Point 2 of the owner's review asks for one press that installs the ticked harnesses and a check for
 * upgrades. Each agent tool the office runs is a row: its program, where it is
 * and the version it says it is, the newest version its vendor publishes, and whether a newer one
 * exists, said only when both were read. A tool with no install command says which of the two codes it has.
 *
 * THE TICK BOXES ARE BEHIND A PRESS, so the page at rest shows no boxes (tests/read-before-edit.test.ts). Pressing
 * Install opens the installer's terminal below, in the page's own terminal view (TerminalView). The person signs in
 * to each program themselves; the panel asks them to, and the office never sees the login.
 *
 * THE ROWS ARE DRAWN BEFORE THE VERSIONS ARRIVE. Wave 13x round 12: the first whole read after a start took 658 ms,
 * because each program is asked its version and each registry its newest. The panel asks for the declared list as
 * well, which answers at once, draws its rows from that, and fills in the versions when the whole read comes back.
 * Wave 13x round 13b: when the whole read fails, each version cell says it could not be read, not that it is being read.
 *
 * A PRESS THAT WAITS IS NOT A REFUSAL. Installing reaches every agent, so the press raises a readiness checklist and
 * signs it as the person (src/server/lib/readiness.ts). The door then answers 409 with the code `readinessWaits` and the
 * checklist's id. The panel says it waits for signatures, reads the checklist to name who has not signed, and links to
 * it (wave 13u round 13b).
 *
 * WHILE THE USER'S PATH IS NOT READ, A TOOL NOT FOUND IS NOT ON THE OFFICE'S PATH, and that may not be the user's
 * (wave 13u round 242). Its row says so, with the line saying why the user's PATH was not read. Neither its tick nor
 * its install command line is drawn, so this page offers no install of it, neither by the press nor by a command the
 * person types: the tool may already be installed for the user's shell, and either would install it again. A
 * secretary asked by the person still installs it. When the user's PATH was read, a tool not found is not found, and
 * the page is as it was.
 *
 * Every door is asked through src/web/lib/harnesses.ts; the shapes are src/shared/harnesses.ts.
 */

import { useState } from 'react'
import { t, type WordKey } from '@shared/i18n.ts'
import type { HarnessListing, HarnessReading, NoInstallCode } from '@shared/harnesses.ts'
import { readRefusal } from '@shared/refusal-codes.ts'
import type { TerminalReading } from '@shared/terminals.ts'
import type { AReadinessChecklist } from '../../server/lib/readiness.ts'
import type { TheUsersPathAsTheDoorSaysIt } from '../../config/the-users-own-path.mjs'
import { Btn, ErrorNote, Loading, ServerNote, relativeTime, useAsync } from './ui.tsx'
import { TerminalView } from './TerminalView.tsx'
import { useLanguage } from '../lib/language.ts'
import { installTheHarnesses, theHarnessList, theHarnesses } from '../lib/harnesses.ts'
import { ApiError, api, errorMessage, faultOf } from '../api.ts'
import { readinessPath } from './router.tsx'
import { signerName } from '../pages/ReadinessPage.tsx'

export function InstallHarnesses({ onOpened }: { onOpened?: () => void }): React.ReactElement {
  useLanguage()
  const [listing] = useAsync(theHarnessList, [])
  const [reply, readAgain] = useAsync(theHarnesses, [])
  // The whole read when it is here, and the declared list until then.
  const rows: readonly (HarnessListing | HarnessReading)[] | null =
    reply.status === 'ready' ? reply.value.harnesses : listing.status === 'ready' ? listing.value.harnesses : null
  const usersPath = reply.status === 'ready' ? reply.value.usersPath : listing.status === 'ready' ? listing.value.usersPath : null
  // A tool not on the office's PATH while the user's PATH is not read is never offered, whatever was ticked before the read came.
  const offered = (one: HarnessListing | HarnessReading): boolean => anInstallIsOffered(one, usersPath)
  const [choosing, setChoosing] = useState(false)
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set())
  const [pending, setPending] = useState(false)
  const [refused, setRefused] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const [installer, setInstaller] = useState<TerminalReading | null>(null)
  const [waiting, setWaiting] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<'worked' | 'failed' | null>(null)

  const install = async (): Promise<void> => {
    setPending(true)
    setRefused(null)
    setWaiting(null)
    setOutcome(null)
    try {
      const opened = await installTheHarnesses([...ticked].filter((id) => rows?.some((one) => one.id === id && offered(one)) === true))
      setInstaller(opened.terminal)
      setChoosing(false)
      setTicked(new Set())
      // A TERMINAL OPENED, so the press did what it said. The button is replaced by it, which cuts the light.
      setOutcome('worked')
      onOpened?.()
    } catch (err) {
      const checklist = theChecklistThePressWaitsFor(err)
      if (checklist !== null) {
        // WAITING IS NOT DONE AND NOT REFUSED, so no outcome is proved and the light ends plainly.
        setWaiting(checklist)
        setChoosing(false)
        setTicked(new Set())
      } else {
        setRefused({ message: errorMessage(err), fault: faultOf(err) })
        setOutcome('failed')
      }
    } finally {
      setPending(false)
    }
  }
  const putAway = (): void => {
    setInstaller(null)
    readAgain()
  }

  return (
    <section className="ih" aria-labelledby="ih-heading">
      <style href="mole-office-install-harnesses" precedence="default">
        {INSTALL_HARNESSES_CSS}
      </style>
      <h2 id="ih-heading" className="ih-heading">{t('harnesses.heading')}</h2>
      {rows === null && reply.status === 'loading' ? <Loading label={t('harnesses.reading')} rows={2} /> : null}
      {reply.status === 'error' ? <ErrorNote message={reply.message} fault={reply.fault} label={t('harnesses.refused')} retry={readAgain} /> : null}
      {rows !== null ? (
        <>
          <ul className="ih-rows">
            {rows.map((one) => (
              <TheHarness
                key={one.id}
                one={one}
                choosing={choosing}
                offered={offered(one)}
                usersPath={usersPath}
                failed={reply.status === 'error'}
                ticked={ticked.has(one.id)}
                onTick={(on) =>
                  setTicked((was) => {
                    const next = new Set(was)
                    if (on) next.add(one.id)
                    else next.delete(one.id)
                    return next
                  })
                }
              />
            ))}
          </ul>
          <div className="ih-press">
            {choosing ? (
              <>
                <Btn variant="primary" onClick={() => void install()} pending={pending} pendingFailed={outcome === 'failed'} pendingSucceeded={outcome === 'worked'} disabled={ticked.size === 0} reason={t('harnesses.noneTicked')}>
                  {t('harnesses.install')}
                </Btn>
                <Btn
                  onClick={() => {
                    setChoosing(false)
                    setTicked(new Set())
                    setRefused(null)
                  }}
                >
                  {t('harnesses.cancel')}
                </Btn>
              </>
            ) : (
              <>
                {rows.some(offered) ? <Btn onClick={() => setChoosing(true)}>{t('harnesses.choose')}</Btn> : null}
                <Btn variant="ghost" onClick={readAgain}>{t('harnesses.readAgain')}</Btn>
              </>
            )}
          </div>
          {refused !== null ? <ErrorNote message={refused.message} fault={refused.fault} label={t('harnesses.installRefused')} /> : null}
          {waiting !== null ? <TheInstallWaits id={waiting} /> : null}
        </>
      ) : null}
      {installer !== null ? (
        <div className="ih-installer">
          <p className="ih-sign-in">{t('harnesses.signIn')}</p>
          <TerminalView key={installer.id} terminal={installer} onPutAway={putAway} onClosed={putAway} />
        </div>
      ) : null}
    </section>
  )
}

/** The checklist a press's 409 says it waits for, or null when the reply was a refusal. Exported for a test. */
export function theChecklistThePressWaitsFor(err: unknown): string | null {
  const coded = err instanceof ApiError ? readRefusal(err.fault?.code, err.fault?.values) : null
  return coded?.code === 'readinessWaits' ? coded.values.checklist : null
}

/** The press signed and waits for the other signers. Exported so a test can draw it with a checklist and no server. */
export function TheInstallWaits({ id }: { id: string }): React.ReactElement {
  const [read] = useAsync(() => api.readinessChecklist(id), [id])
  return (
    <div className="ih-waits" role="status" data-readiness-waits={id}>
      <p className="ih-waits-head">{t('harnesses.state.waitingForSignatures')}</p>
      {read.status === 'loading' ? <Loading label={t('harnesses.waiting.reading')} rows={1} /> : null}
      {read.status === 'error' ? <ErrorNote message={read.message} fault={read.fault} label={t('harnesses.state.checklistNotRead')} /> : null}
      {read.status === 'ready' ? <TheSignersStillToSign checklist={read.value.checklist} /> : null}
      <p>
        <a href={`#${readinessPath(id)}`}>{t('harnesses.waiting.open')}</a>
      </p>
    </div>
  )
}

/** Who has not signed yet, as the checklist says it. */
export function TheSignersStillToSign({ checklist }: { checklist: AReadinessChecklist }): React.ReactElement {
  if (checklist.state !== 'waiting') return <p>{t('harnesses.state.notWaiting')}</p>
  return (
    <>
      <p>{t('harnesses.waiting.for')}</p>
      <ul className="ih-waits-for">
        {checklist.notSigned.map((one) => (
          <li key={`${one.kind}:${one.id}`}>{signerName(one)}</li>
        ))}
      </ul>
    </>
  )
}

/** Whether this tool was not found while the user's PATH is not read, so it is only not on the office's PATH. */
function notOnTheOfficesPath(one: HarnessListing | HarnessReading, usersPath: TheUsersPathAsTheDoorSaysIt | null): boolean {
  return usersPath?.read === false && 'installed' in one && one.installed.path === null
}

/**
 * Whether this page offers an install of this tool: it has an install command, and it is not only off the office's
 * PATH. Where it is false for a tool with an install command, the row draws neither the tick nor the command line.
 */
export function anInstallIsOffered(one: HarnessListing | HarnessReading, usersPath: TheUsersPathAsTheDoorSaysIt | null): boolean {
  return one.install !== null && !notOnTheOfficesPath(one, usersPath)
}

/**
 * One tool's row. `offered` is `anInstallIsOffered` for it, so a row with no install offered draws no tick, and a tool
 * that has an install command but is not offered draws no install command line either. A tool with no install command
 * still says why it has none.
 */
export function TheHarness({ one, choosing, offered, usersPath, failed, ticked, onTick }: { one: HarnessListing | HarnessReading; choosing: boolean; offered: boolean; usersPath: TheUsersPathAsTheDoorSaysIt | null; failed: boolean; ticked: boolean; onTick: (on: boolean) => void }): React.ReactElement {
  // Null while only the declared list is here: the versions are still being read, or the read of them failed.
  const read = 'installed' in one ? one : null
  const notRead = failed ? (
    <span className="ih-unread">{t('harnesses.versionNotRead')}</span>
  ) : (
    <span className="ih-reading">{t('harnesses.versionReading')}</span>
  )
  return (
    <li className="ih-row" data-harness={one.id}>
      <div className="ih-row-head">
        {choosing && offered ? (
          <label className="ih-tick">
            <input type="checkbox" checked={ticked} onChange={(e) => onTick(e.target.checked)} aria-label={t('harnesses.tick', { name: one.name })} />
            <span className="ih-name">{one.name}</span>
          </label>
        ) : (
          <span className="ih-name">{one.name}</span>
        )}
        {read?.newer.answer === 'yes' ? <span className="ih-newer" data-newer="yes">{t('harnesses.newer.yes')}</span> : null}
      </div>
      <dl className="ih-facts">
        <div>
          <dt>{t('harnesses.program')}</dt>
          <dd className="ih-mono">{one.program}</dd>
        </div>
        <div>
          <dt>{t('harnesses.installed')}</dt>
          <dd data-fact="installed">
            {read === null ? (
              notRead
            ) : read.installed.path === null && usersPath?.read === false ? (
              <>
                {t('harnesses.state.notOnTheOfficesPath')}
                <div className="ih-path-unread">{t('harnesses.usersPath.notRead', { why: t(PATH_UNREAD_WORDS[usersPath.code]) })}</div>
              </>
            ) : read.installed.path === null ? (
              t('harnesses.state.notFound')
            ) : read.installed.versionWasRead ? (
              <span className="ih-mono">{read.installed.version}</span>
            ) : (
              <>
                <span className="ih-mono">{read.installed.path}</span> · {t('harnesses.versionNotRead')}
                <ServerNote text={read.installed.version} />
              </>
            )}
            {read?.beingReadAgain.installed ? <ReadAgain at={read.beingReadAgain.installed} /> : null}
          </dd>
        </div>
        <div>
          <dt>{t('harnesses.newest')}</dt>
          <dd data-fact="newest">
            {read === null ? (
              notRead
            ) : read.newest.read ? (
              <span className="ih-mono">{read.newest.version}</span>
            ) : (
              <>
                {t('harnesses.versionNotRead')}
                <ServerNote text={read.newest.why} />
              </>
            )}
            {read?.beingReadAgain.newest ? <ReadAgain at={read.beingReadAgain.newest} /> : null}
          </dd>
        </div>
      </dl>
      {read?.newer.answer === 'no' ? <p className="ih-state" data-newer="no">{t('harnesses.newer.no')}</p> : null}
      {read?.newer.answer === 'unknown' && read.newer.why !== 'notInstalled' ? (
        <p className="ih-state" data-newer="unknown">{t('harnesses.state.newerNotKnown')}</p>
      ) : null}
      {one.install !== null ? (
        offered ? (
          <p className="ih-install">
            <span className="ih-install-label">{t('harnesses.installsWith')}</span> <code className="ih-mono">{one.install.command}</code>{' '}
            <a href={one.install.source} target="_blank" rel="noreferrer">
              {t('harnesses.vendorsPage')}
            </a>
          </p>
        ) : null
      ) : one.noInstall !== null ? (
        <div className="ih-install" data-no-install={one.noInstall.code}>
          {t(NO_INSTALL_WORDS[one.noInstall.code])}
          <ServerNote text={one.noInstall.says} />
        </div>
      ) : null}
    </li>
  )
}

/** The age of a kept answer being read again, in its own version cell. */
function ReadAgain({ at }: { at: string }): React.ReactElement {
  return <div className="ih-read-again">{t('harnesses.beingReadAgain', { ago: relativeTime(at) })}</div>
}

/** Why the user's PATH was not read, in short words. */
const PATH_UNREAD_WORDS: Record<Extract<TheUsersPathAsTheDoorSaysIt, { read: false }>['code'], WordKey> = {
  noLoginShell: 'harnesses.usersPath.noLoginShell',
  noAnswerInTime: 'harnesses.usersPath.noAnswerInTime',
  noMarkers: 'harnesses.usersPath.noMarkers',
  couldNotStart: 'harnesses.usersPath.couldNotStart',
  registryUnreadable: 'harnesses.usersPath.registryUnreadable',
  inASandbox: 'harnesses.usersPath.inASandbox',
  aTestStartedThisServer: 'harnesses.usersPath.aTestStartedThisServer',
  notReadAtThisStart: 'harnesses.usersPath.notReadAtThisStart',
}

/** Why a tool has no install command, in short words. */
const NO_INSTALL_WORDS: Record<NoInstallCode, WordKey> = {
  vendorArchivedIt: 'harnesses.state.archived',
  installedSeparately: 'harnesses.state.installedSeparately',
}

const INSTALL_HARNESSES_CSS = `
.ih { margin: 0 0 calc(var(--pad) * 2) 0; }
.ih-heading { margin: 0 0 0.25em 0; font-size: 1.15em; }
.ih-rows { list-style: none; margin: 0 0 var(--pad) 0; padding: 0; display: grid; gap: 0.5rem; }
.ih-row { border: var(--border-w, 1px) solid var(--border); border-radius: var(--radius-sm); background: var(--panel); padding: 0.6rem var(--pad); min-width: 0; }
.ih-row-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 0.5rem; }
.ih-name { font-weight: 600; }
.ih-tick { display: inline-flex; align-items: baseline; gap: 0.5rem; cursor: pointer; }
.ih-newer { color: var(--text); font-weight: 600; }
.ih-facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: 0.25rem var(--pad); margin: 0.4rem 0 0 0; }
.ih-facts dt { color: var(--text-3); font-size: 0.85em; }
.ih-facts dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.ih-mono { font-family: var(--font-mono); }
.ih-reading { color: var(--text-3); }
.ih-read-again { margin-top: 0.25rem; color: var(--text-3); font-size: 0.85em; }
.ih-path-unread { margin-top: 0.25rem; color: var(--text-2); font-size: 0.85em; }
.ih-state { margin: 0.4rem 0 0 0; color: var(--text-2); }
.ih-install { margin: 0.4rem 0 0 0; color: var(--text-2); overflow-wrap: anywhere; }
.ih-install-label { color: var(--text-3); }
.ih-press { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0 0 var(--pad) 0; }
.ih-sign-in { margin: 0 0 0.4rem 0; font-weight: 600; }
.ih-waits { border: var(--border-w, 1px) solid var(--border); border-radius: var(--radius-sm); background: var(--panel); padding: 0.6rem var(--pad); margin: 0 0 var(--pad) 0; overflow-wrap: anywhere; }
.ih-waits p { margin: 0 0 0.4rem 0; }
.ih-waits p:last-child { margin-bottom: 0; }
.ih-waits-head { font-weight: 600; }
.ih-waits-for { margin: 0 0 0.4rem 0; padding-inline-start: 1.25rem; }
`
