// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t, writtenMoment } from '@shared/i18n.ts'
import { KEY_REVOCATION_UNDO_MS } from '@shared/danger-tiers.ts'
import type { EmbassyKey, EmbassyRow } from '@shared/worlds.ts'
import type { ParticipantKind } from '@shared/participants.ts'
import { useState } from 'react'
import { api } from '../api.ts'
import { useInspect } from '../lib/mode.ts'
import { Absence, Panel } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { TieredPress } from './TieredPress.tsx'

/**
 * EVERY LIVE KEY OF ONE CITIZEN, ONE ROW EACH, WITH ITS OWN REVOKE. Problem yZ71bheXm-Ji.
 *
 * On the citizen's own page: the profile (ProfilePage.tsx) for a registered agent or a person, and the
 * credential page (CredentialPage.tsx) for a visitor or a device no registry here holds. Question 15
 * of report n9Mjk3c_sJRu, answered by a decision, put Revoke key there rather than on the Embassy's
 * rows.
 *
 * WHY ONE ROW PER KEY. An agent can hold its own key and one more for each run the office made a key
 * for. The page used to draw one Revoke key press, which revoked the newest key; on 29 September 2026
 * that was a running round's key and not the leaked one the press was meant for. Each row now says what its key is,
 * when it was made and last used, and whether its run has ended, and its press says in words which
 * key it revokes and names that key by id. The id itself is shown in developer mode only.
 *
 * Which keys are live is the Embassy's reading (`EmbassyRow.heldKeys`), so this reads that one row
 * from the Embassy, not the whole roll. It draws nothing while the row is on its way, when the read
 * fails, and when the citizen holds no key. A key revoked here stays drawn as revoked, so its timed
 * Undo stays where it was pressed. A decision gives a key the undo tier.
 */
export function RevokeTheirKey(props: { credential: string } | { who: { kind: ParticipantKind; id: string } }) {
  const inspect = useInspect()
  /** The one row this page is about, named the way the Embassy's row door names a row. */
  const target = 'credential' in props ? `credential:${props.credential}` : `${props.who.kind}:${props.who.id}`
  const [state] = useProjectAsync(() => api.embassyRow(target), [target])
  const [answered, setAnswered] = useState<EmbassyRow | null>(null)
  // A REPLY THAT HOLDS THE WHOLE ROLL (a test fixture) still names the row, so it is found and not guessed at.
  const theRowThisPageIsAbout = (said: { rows: EmbassyRow[] }): EmbassyRow | undefined =>
    said.rows.find((one) =>
      'credential' in props ? one.credential === props.credential && !one.registered
        : one.who.kind === props.who.kind && one.who.id === props.who.id && one.retired === null)
  // THE KEYS REVOKED ON THIS PAGE, and the place each held, kept so each row keeps its place and its
  // Undo after the key has left the live list.
  const [revoked, setRevoked] = useState<Record<string, { key: EmbassyKey; at: number }>>({})
  // A CREDENTIAL PAGE CARRIES THE KEYS OF THE ROW THAT CAME IN ON IT AND IS REGISTERED NOWHERE HERE;
  // a registered agent's keys are on its profile, found by the registry id the Embassy's rows carry.
  const row: EmbassyRow | undefined =
    answered ?? (state.status === 'ready' ? theRowThisPageIsAbout(state.value) : undefined)
  if (row === undefined) return null
  // THE OFFICE'S ORDER, oldest first, with each key revoked here put back where it stood.
  const live = new Set(row.heldKeys.map((one) => one.id))
  const keys = [...row.heldKeys]
  for (const gone of Object.values(revoked).sort((a, b) => a.at - b.at)) {
    if (!live.has(gone.key.id)) keys.splice(Math.min(gone.at, keys.length), 0, gone.key)
  }
  if (keys.length === 0) return null
  const list = (
    <>
      <style href="mole-office-their-keys" precedence="default">{THEIR_KEYS_CSS}</style>
      <ul className="their-keys">
        {keys.map((key, at) => (
          <li key={key.id} className="their-key" data-key-is={key.is} data-live={live.has(key.id) ? 'yes' : 'no'}>
            <span className="their-key-what">{whatTheKeyIs(key)}</span>
            <span className="their-key-facts">
              <span className="their-key-label">{t('embassyKeys.made')}</span>
              <span className="their-key-value">{writtenMoment(key.madeAt)}</span>
              <span className="their-key-label">{t('embassyKeys.lastUsed')}</span>
              <span className="their-key-value">{key.lastUsedAt === null ? <Absence say title={t('embassyKeys.noUseRecorded')} /> : writtenMoment(key.lastUsedAt)}</span>
              {key.of === null || key.is === 'a-deleted-run' ? null : (
                <>
                  <span className="their-key-label">{t(key.is === 'a-world' ? 'embassyKeys.world' : 'embassyKeys.run')}</span>
                  <span className="their-key-value" data-run-state={key.of.state ?? 'unknown'}>{whereItStands(key.of)}</span>
                </>
              )}
              {/* A DELETED RUN'S ID, in developer mode only: its record is
                  deleted, so the id is all that is left to find the run by (problem sWNzXXKdB3q6). */}
              {inspect && key.is === 'a-deleted-run' && key.of !== null ? (
                <>
                  <span className="their-key-label">{t('newAgentKeys.runId')}</span>
                  <code className="their-key-value" data-deleted-run={key.of.id}>{key.of.id}</code>
                </>
              ) : null}
              {inspect ? (
                <>
                  <span className="their-key-label">{t('embassyKeys.id')}</span>
                  <code className="their-key-value">{key.id}</code>
                </>
              ) : null}
            </span>
            {live.has(key.id) ? null : <span className="their-key-gone">{t('embassyKeys.revokedMark')}</span>}
            <TieredPress tier="undo" size="sm" available={live.has(key.id)}
              press={theRevokePress(key)} pending={t('g4.embassy.revokingKey')}
              windowMs={KEY_REVOCATION_UNDO_MS} done={t('embassyKeys.revoked', { key: whatTheKeyIs(key) })}
              undo={(seconds: number) => t('g4.embassy.undoKey', { seconds })} undoing={t('g4.embassy.undoingKey')}
              onPress={async () => {
                const done = await api.revokeKey(key.id)
                setRevoked((was) => ({ ...was, [key.id]: { key, at } }))
                // THE ONE ROW AGAIN, not the whole roll: the panel is drawing this row and needs its
                // live keys, and a failed re-read must not undo the press that already happened.
                await api.embassyRow(target).then((page) => setAnswered(theRowThisPageIsAbout(page) ?? null)).catch(() => {})
                return { remainingMs: done.undoRemainingMs, undo: async () => {
                  await api.undoKeyRevocation(key.id, done.revokedAt)
                  await api.embassyRow(target).then((page) => setAnswered(theRowThisPageIsAbout(page) ?? null)).catch(() => {})
                } }
              }} />
          </li>
        ))}
      </ul>
    </>
  )
  // THE PROFILE DRAWS THE KEYS AS A PANEL OF THEIR OWN. The credential page draws them inside its
  // standing panel, beside its other presses, so there they are a titled block and not a second panel.
  if ('who' in props) return <Panel titleIs="label" declares={{ surface: 'profile.keys' }} title={t('embassyKeys.title')}>{list}</Panel>
  return (
    <div className="their-keys-inline">
      <h3 className="their-keys-head" data-title-is="its-label">{t('embassyKeys.title')}</h3>
      {list}
    </div>
  )
}

/**
 * What one key is, in words: its own, or the run's or world's it was made for, named as written. A
 * run whose record was deleted has no title left to name it by, so its words say only that.
 */
function whatTheKeyIs(key: EmbassyKey): string {
  const title = key.of?.title ?? t('absence.mark')
  switch (key.is) {
    case 'its-own': return t('embassyKeys.itsOwn')
    case 'a-run': return t('embassyKeys.ofRun', { run: title })
    case 'a-deleted-run': return t('newAgentKeys.ofDeletedRun')
    case 'a-dispatched-run': return t('embassyKeys.ofDispatchedRun')
    case 'a-world': return t('embassyKeys.ofWorld', { world: title })
  }
}

/** The press, saying which key it revokes. */
function theRevokePress(key: EmbassyKey): string {
  const title = key.of?.title ?? t('absence.mark')
  switch (key.is) {
    case 'its-own': return t('embassyKeys.revokeOwn')
    case 'a-run': return t('embassyKeys.revokeRun', { run: title })
    case 'a-deleted-run': return t('newAgentKeys.revokeDeletedRun')
    case 'a-dispatched-run': return t('embassyKeys.revokeDispatchedRun')
    case 'a-world': return t('embassyKeys.revokeWorld', { world: title })
  }
}

/** Where the key's run or world stands, or the short mark where nobody can say. */
function whereItStands(of: NonNullable<EmbassyKey['of']>): string {
  switch (of.state) {
    case 'not-ended': return t('embassyKeys.notEnded')
    case 'ended': return t('embassyKeys.ended')
    case 'waiting': return t('embassyKeys.waiting')
    case null: return t('absence.mark')
  }
}

const THEIR_KEYS_CSS = `
.their-keys-inline { flex: 1 1 100%; display: grid; gap: 6px; min-width: 0; margin-top: var(--pad); }
.their-keys-head { margin: 0; color: var(--text-2); font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui); }
.their-keys { display: grid; gap: var(--pad); margin: 0; padding: 0; list-style: none; min-width: 0; }
.their-key { display: grid; gap: 6px; padding: var(--pad) 0; border-top: var(--border-w) solid var(--border); min-width: 0; }
.their-key:first-child { border-top: 0; padding-top: 0; }
.their-key-what { color: var(--text); font: 600 var(--fs-2)/var(--lh-tight) var(--font-ui); overflow-wrap: anywhere; }
.their-key-facts { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 2px var(--pad); min-width: 0;
  color: var(--text-2); font: var(--fs-1)/var(--lh-read) var(--font-ui); }
.their-key-value { color: var(--text); overflow-wrap: anywhere; min-width: 0; }
.their-key-value[data-run-state='ended'] { color: var(--text-2); }
.their-key-gone { color: var(--text-2); font: var(--fs-1)/var(--lh-read) var(--font-ui); }
`
