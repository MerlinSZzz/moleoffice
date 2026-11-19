// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
/**
 * WHO IS WORKING ON THIS CARD, DRAWN AT THREE POSITIONS AND NEVER AS ONE WORD.
 *
 * ---------------------------------------------------------------------------------------
 * TWO DIMENSIONS, WHICH IS THE WHOLE POINT OF THIS FILE EXISTING
 * ---------------------------------------------------------------------------------------
 *
 * The owner's addendum, section 3: *"Do NOT put everything into one giant Agent status enum. Model
 * at least two independent dimensions."*
 *
 *   PRESENCE   is anybody here? An AGE, banded into four words by `presenceFromAge` in
 *              `src/shared/workdomain.ts`. Never a stored state word — ten session records in this
 *              corpus say `running` and nine last wrote a fortnight ago.
 *   WORK STATE where the work stands. The domain's `stage`, derived from four stored facts.
 *
 * Nothing here joins them. A card at the middle position draws the agent's name and, beside it, the
 * age; a reader gets `Perception · 38m` and never a made-up word that means both.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT EACH POSITION DRAWS, AND WHY IT IS THREE THINGS AND NOT ONE THING THREE SIZES
 * ---------------------------------------------------------------------------------------
 *
 *   far    (`label`)  a marker per live domain, and nothing else. A card at this position has no
 *                     numerals and no words on it at all, so presence is a shape or it is nothing.
 *   medium (`title`)  the agent's own name and how long it has been quiet. This is the position the
 *                     bar has always called *names, state and who is here*, and until now the label
 *                     said `who is here` on a drawing that drew nobody.
 *   near   (`gist`)   the overlap mark as well, from `OVERLAP_MARKS`, at the worst rank this card's
 *                     domains are in.
 *
 * ---------------------------------------------------------------------------------------
 * A LIVING WORLD, NOT A SESSION GRAVEYARD
 * ---------------------------------------------------------------------------------------
 *
 * Section 15: *"A durable Agent that has no live attachment, no pending message, no active
 * responsibility and no unresolved handoff should have almost no visual weight in normal current-work
 * views."* So a domain whose presence is `stale` or `never` draws NOTHING on an ordinary card —
 * `presenceIsDrawn` is the one place that decides it. Not a faint mark: a faint mark on every card
 * in a project with forty old domains is the graveyard one shade lighter. The work is still there,
 * still open, still in the reading layer and still in the read's own count.
 */
import { fillWord } from '@shared/states.ts'
import {
  LAST_SIGN_SAYS,
  PRESENCE_SAYS,
  STAGE_SAYS,
  overlapMarkOf,
  presenceIsDrawn,
  type DomainStage,
  type PresenceState,
} from '@shared/workdomain.ts'
import type { ReactElement } from 'react'
import type { Rung } from '@shared/detail.ts'

/** One domain's presence on one card, as the read hands it back. */
export interface PresenceHere {
  domainId: string
  domainTitle: string
  agentId: string
  objective: string
  stage: DomainStage
  presence: PresenceState
  quietForMinutes: number | null
  lastSignFrom: string
  worstOverlapRank: number | null
}

/**
 * WHETHER THIS POSITION DRAWS PRESENCE AT ALL, AND HOW MUCH OF IT.
 *
 * Decided on the POSITION and never on the rung, the same rule the restriction mark follows and for
 * the same reason: a selected card is drawn a rung higher than an ordinary one, so a rule keyed on
 * the rung would make a colleague appear when the reader pressed a card and vanish when they
 * pressed elsewhere.
 */
export function presenceDrawnAt(says: Rung): 'markers' | 'named' | 'named-with-overlap' {
  if (says === 'label') return 'markers'
  if (says === 'title') return 'named'
  return 'named-with-overlap'
}

/** The domains a drawing draws for a card. Stale and never-seen ones are left off, not faded. */
export function presenceWorthDrawing(here: readonly PresenceHere[]): PresenceHere[] {
  return here.filter((one) => presenceIsDrawn(one.presence))
}

/** How long since anything was seen, in the shortest true form. Never rounded up into a lie. */
export function quietFor(minutes: number | null): string {
  if (minutes === null) return t('g7b.Presence.nothing_seen')
  if (minutes < 1) return t('g7b.Presence.just_now')
  if (minutes < 60) return t('g7b.durationMinutes', { n: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('g7b.durationHours', { n: hours })
  return t('g7b.durationDays', { n: Math.floor(hours / 24) })
}

/** The whole sentence for one domain, for a hover and for an off-screen reader. */
export function presenceSentence(one: PresenceHere): string {
  // `agentId` HOLDS THE AGENT'S NAME, not its id (see PresenceHere in src/server/lib/workdomain.ts),
  // so it is content and stays in normal mode: it is who is here, the one thing this marker says.
  const who = one.agentId === '' ? one.domainTitle : `${one.agentId} · ${one.domainTitle}`
  const stage = STAGE_SAYS[one.stage]
  // EVERY WORD HERE COMES FROM A DECLARED TABLE. Nothing in this file writes a sentence of its own:
  // `LAST_SIGN_SAYS` and `PRESENCE_SAYS` live beside the states they describe in shared/workdomain.ts,
  // and this fills their slots.
  const sign =
    one.quietForMinutes === null
      ? PRESENCE_SAYS[one.presence]
      : fillWord(one.quietForMinutes < 1 ? LAST_SIGN_SAYS.justNow : LAST_SIGN_SAYS.ago, {
          ...(one.quietForMinutes < 1 ? {} : { age: quietFor(one.quietForMinutes) }),
          from: one.lastSignFrom,
        })
  return `${who} — ${stage} ${sign}`
}

/**
 * THE PRESENCE ROW ON A CARD.
 *
 * Draws nothing at all — not an empty element — when nobody worth drawing is here. An empty row
 * would take height on every card in the project for a fact that is absent.
 */
export function PresenceRow({ here, says }: { here: readonly PresenceHere[]; says: Rung }): ReactElement | null {
  const drawn = presenceWorthDrawing(here)
  if (drawn.length === 0) return null
  const shows = presenceDrawnAt(says)
  const worst = drawn.reduce<number | null>(
    (best, one) => (one.worstOverlapRank === null ? best : best === null || one.worstOverlapRank > best ? one.worstOverlapRank : best),
    null,
  )
  const overlap = shows === 'named-with-overlap' && worst !== null ? overlapMarkOf(worst) : null
  return (
    <p className="gx-presence" data-shows={shows} data-here={String(drawn.length)}>
      {drawn.map((one) => (
        <span
          className="gx-here"
          key={one.domainId}
          data-presence={one.presence}
          data-stage={one.stage}
          title={presenceSentence(one)}
        >
          {/* THE MARKER IS THE ONE THING EVERY POSITION DRAWS. At the far position it is the whole
              of what a card says about who is here, so it is a shape and never a hue alone. */}
          <span className="gx-here-dot" aria-hidden="true" />
          {shows === 'markers' ? null : (
            <>
              <span className="gx-here-who">{one.agentId === '' ? one.domainTitle : one.agentId}</span>
              <span className="gx-here-age num">{quietFor(one.quietForMinutes)}</span>
            </>
          )}
        </span>
      ))}
      {overlap === null ? null : (
        <span
          className="gx-mark gx-mark-overlap"
          data-mark="overlap"
          data-rank={String(worst)}
          data-form={overlap.mark.form}
          data-glyph={overlap.mark.glyph}
          data-edge={overlap.mark.edge}
          title={`${overlap.word} — ${overlap.detail}`}
        >
          <span className="num">{drawn.length}</span>
        </span>
      )}
    </p>
  )
}
