// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S OWNER HAND-OVERS, ON ITS PAGE (wave 13s round 281).
 *
 * Each hand-over the owner door made since this office began to keep them, newest first, as
 * GET /api/participants/agent/:id/owner-changes gives them: when, the owner before and after, who made it and whether
 * under the person's grant, and the reason. The panel says from when the list holds them, or that the day was not
 * recorded, and a short word when it holds none. An owner with no name to draw is drawn with the word the owner fact on
 * the same page uses. Nothing here hands the agent over. The rows are kept by src/server/lib/agent-owner-changes.ts.
 */
import { content, t } from '@shared/i18n.ts'
import { drawnStamp } from '@shared/time.ts'
import { moleOfficeRequest, type AnOwnerHandOver, type TheOwnerHandOversOfAnAgent, type TheOwnerOfAnAgent } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { useInspect } from '../lib/mode.ts'
import { ErrorNote, Panel } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'

export function AgentOwnerHandOvers({ agentId }: { agentId: string }) {
  useLanguage()
  const inspect = useInspect()
  const door = `/api/participants/agent/${encodeURIComponent(agentId)}/owner-changes`
  const [read, readAgain] = useProjectAsync(() => moleOfficeRequest<TheOwnerHandOversOfAnAgent>(door), [door])
  if (read.status === 'loading') return null
  if (read.status === 'error') {
    return <ErrorNote message={inspect ? read.message : t('ownerHandOvers.readFailed')} fault={inspect ? read.fault : undefined} retry={readAgain} />
  }
  return <TheOwnerHandOvers reading={read.value} />
}

/**
 * THE HAND-OVERS, FROM WHAT WAS READ. Everything it draws is passed in, so a test can draw it from a reading without a
 * server.
 */
export function TheOwnerHandOvers({ reading }: { reading: TheOwnerHandOversOfAnAgent }) {
  useLanguage()
  return (
    <>
      <style href="mole-office-owner-hand-overs" precedence="default">
        {OWNER_HAND_OVERS_CSS}
      </style>
      <Panel declares={{ surface: null }} titleIs="label" title={t('ownerHandOvers.heading')}>
        <p className="owner-hand-overs-quiet">
          {reading.since === null ? t('ownerHandOvers.noDay') : t('ownerHandOvers.since', { when: drawnStamp(reading.since) })}
        </p>
        {reading.handOvers.length === 0 ? (
          <p className="owner-hand-overs-quiet">{t('ownerHandOvers.none')}</p>
        ) : (
          <ul className="owner-hand-overs-list">
            {reading.handOvers.map((one) => (
              <li key={one.id}>
                <AHandOver handOver={one} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  )
}

/** One hand-over: when and between which owners, who made it and whether under the person's grant, and the reason. */
function AHandOver({ handOver }: { handOver: AnOwnerHandOver }) {
  const when = drawnStamp(handOver.at)
  const who = handOver.by.name === null ? t('profileOwner.namesNobody') : content(handOver.by.name)
  return (
    <>
      <span className="owner-hand-overs-said">
        {t('ownerHandOvers.changed', { when, from: theOwnerInWords(handOver.before), to: theOwnerInWords(handOver.after) })}
      </span>
      <span className="owner-hand-overs-quiet">
        {t(handOver.underTheGrant === null ? 'ownerHandOvers.madeBy' : 'ownerHandOvers.madeByUnderTheGrant', { who })}
      </span>
      <span className="owner-hand-overs-quiet">{t('ownerHandOvers.reason', { because: content(handOver.because) })}</span>
    </>
  )
}

/**
 * THE OWNER FACT'S WORD FOR AN OWNER WITH NO NAME TO DRAW: nobody recorded an owner, the row holds one that cannot be
 * read, or the owner's id names nobody registered. The owner fact on the agent's page and this panel both ask it here.
 */
export function theWordForAnOwnerWithNoName(owner: TheOwnerOfAnAgent): 'profileOwner.none' | 'profileOwner.unreadable' | 'profileOwner.namesNobody' {
  return owner.state === 'absent' ? 'profileOwner.none' : owner.state === 'broken' ? 'profileOwner.unreadable' : 'profileOwner.namesNobody'
}

function theOwnerInWords(owner: TheOwnerOfAnAgent): string {
  return owner.state === 'held' && owner.name !== null ? content(owner.name) : t(theWordForAnOwnerWithNoName(owner))
}

const OWNER_HAND_OVERS_CSS = `
.owner-hand-overs-said { margin: 0; max-width: var(--measure-in-box); color: var(--text); font: var(--fs-2)/var(--lh-read) var(--font-ui); overflow-wrap: anywhere; }
.owner-hand-overs-quiet { margin: 0; max-width: var(--measure-in-box); color: var(--text-3); font-size: var(--fs-1); overflow-wrap: anywhere; }
.owner-hand-overs-list { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.owner-hand-overs-list li { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
`
