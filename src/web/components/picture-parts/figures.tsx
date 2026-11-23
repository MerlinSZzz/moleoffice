// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13s. A figure on home as a data entry, the component that draws one, and the first two entries.
import { t, type WordKey } from '@shared/i18n.ts'
import { PRESENCE_WORDS, type Presence } from '@shared/lifecycle.ts'
import type { BarsData, PartDataByName, PartName, PartState } from '@shared/picture-parts.ts'
import type { ProjectProgress } from '@shared/progress.ts'
import type { HomeRoster } from '../../../server/lib/working.ts'
import { api } from '../../api.ts'
import { useProjectAsync } from '../../lib/project-async.ts'
import { currentWorkspace } from '../../lib/workspace.ts'
import { theRefusalInWords, type AsyncState } from '../ui.tsx'
import { partDrawn } from './parts.tsx'

/**
 * ONE FIGURE ON HOME, AS A DATA ENTRY: which read answers it, a small plain function that turns the read's answer into
 * the shape of src/shared/picture-parts.ts, which part draws it, and its label. A new number on home is one more of
 * these and needs no new part code.
 */
export interface Figure<P extends PartName, A> {
  /** The figure's label, by the key of its words. */
  label: WordKey
  /** The read that answers it, for one project. */
  read: (project: string) => Promise<A>
  /** Turns the read's answer into the state and data the part draws. It reads the answer and nothing else. */
  shape: (answer: A) => PartState<PartDataByName[P]>
  /** The part that draws it, by its name in PARTS (./parts.tsx). */
  part: P
}

/**
 * A READ'S STATE AS A PART'S STATE: still waiting is loading, a read that failed is missing with the refusal's words as
 * the reason, and an answer is what the figure's shape makes of it.
 */
export function theStateOf<A, D>(reading: AsyncState<A>, shape: (answer: A) => PartState<D>): PartState<D> {
  if (reading.status === 'loading') return { status: 'loading' }
  if (reading.status === 'error') return { status: 'missing', reason: theRefusalInWords(reading.message, reading.fault) }
  return shape(reading.value)
}

/**
 * DRAWS ONE FIGURE: reads it for the chosen project, again on each tick and when the project changes, and draws its
 * part. The read is asked once per tick and is not paced here; a read that is slow to answer is paced in its entry's
 * own `read`.
 */
export function DrawnFigure<P extends PartName, A>({ figure, tick }: { figure: Figure<P, A>; tick: number }) {
  const [reading] = useProjectAsync(() => figure.read(currentWorkspace()), [figure, tick])
  return partDrawn(figure.part, t(figure.label), theStateOf(reading, figure.shape))
}

/** The places a brief can stand, each with the word the progress card already gives it, in the card's order. */
const BRIEF_PLACES = [
  ['waiting', 'progressCard.waiting'],
  ['taken', 'progressCard.taken'],
  ['aligned', 'progressCard.aligned'],
  ['handedBack', 'progressCard.handedBack'],
  ['returned', 'progressCard.returned'],
  ['done', 'progressCard.done'],
] as const satisfies readonly (readonly [keyof ProjectProgress['briefs'], WordKey])[]

/**
 * THE PACKAGES BY STATE, AS BARS: one bar for each place a brief can stand, zeros included, read from the project's
 * progress. The briefs whose package this office cannot read stand in none of those places, so they are one more bar
 * when there are any, and never left out of the count without a word.
 */
export const PACKAGES_BY_STATE: Figure<'bars', ProjectProgress> = {
  label: 'pictureParts.figure.packagesByState',
  read: (project) => api.projectProgress(undefined, project),
  shape: ({ briefs, couldNotRead }): PartState<BarsData> => ({
    status: 'ready',
    data: {
      rows: [
        ...BRIEF_PLACES.map(([place, word]) => ({ label: t(word), value: briefs[place] })),
        ...(couldNotRead.length === 0 ? [] : [{ label: t('pictureParts.figure.packagesUnread'), value: couldNotRead.length }]),
      ],
    },
  }),
  part: 'bars',
}

/** The word each presence already has on home. */
const PRESENCE_LABELS = {
  online: 'home.agentPresence.online',
  stale: 'home.agentPresence.stale',
  offline: 'home.agentPresence.offline',
  inactive: 'home.agentPresence.inactive',
} as const satisfies Record<Presence, WordKey>

/**
 * THE AGENTS BY PRESENCE, AS BARS: one bar for each presence word, zeros included, counting the active agents of the
 * project's roster. Retired agents are not on the roster's rows, so they are not counted here.
 */
export const AGENTS_BY_PRESENCE: Figure<'bars', HomeRoster> = {
  label: 'pictureParts.figure.agentsByPresence',
  read: (project) => api.homeRoster({ workspaceId: project }),
  shape: ({ rows }): PartState<BarsData> => ({
    status: 'ready',
    data: {
      rows: PRESENCE_WORDS.map((presence) => ({
        label: t(PRESENCE_LABELS[presence]),
        value: rows.filter((row) => row.presence.presence === presence).length,
      })),
    },
  }),
  part: 'bars',
}
