// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT ONE DECISION WAS BASED ON, ONE PRESS DOWN. A module page shows the decisions in force there, and each one's
 * basis one level deeper. Wave 13q round 43, placed under each row of "Decisions about this
 * module" by agreement with wave 13k (S4Zvrp1ll2CO, answering em8JsJQesLJ5). The record page is wave 13k's and
 * mounts this with one line.
 *
 * THE FOLD STARTS CLOSED. The title of the decision is the main content; its basis is the second level.
 *
 * WHAT IT SAYS WHEN SOMETHING IS ABSENT. No basis entry is "nobody recorded what this was based on". A reading that
 * carried no basis at all is a different fact, "this reading came back without it", and is not drawn as an empty list.
 * A record in another project is named by its kind and id, because its title is not this project's to show; an id no
 * record has is named as that.
 */

import { content, t } from '@shared/i18n.ts'
import { kindWord } from '@shared/words.ts'
import type { BasisEntry } from '../../server/lib/flow-reasons.ts'
import { RouteLink, recordPath } from './router.tsx'

function BasisRow({ entry }: { entry: BasisEntry }) {
  if (entry.title !== null) return <RouteLink to={recordPath(entry.id)}>{content(entry.title)}</RouteLink>
  if (entry.untitledBecause === 'another-project') {
    return <span>{t('w13q.basis.otherProject', { kind: entry.kind === null ? '' : kindWord(entry.kind).text, id: content(entry.id) })}</span>
  }
  return <span className="rd-named-gone">{t('w13q.basis.notThere', { id: content(entry.id) })}</span>
}

/** The closed fold. `basis` is undefined when the reading did not carry it, which is said rather than drawn as none. */
export function DecisionBasis({ basis }: { basis: readonly BasisEntry[] | undefined }) {
  const summary = basis === undefined || basis.length === 0 ? t('w13q.basis.foldNone') : t('w13q.basis.fold', { n: basis.length })
  return (
    <details className="rd-fold" data-testid="decision-basis">
      <summary>{summary}</summary>
      {basis === undefined ? (
        <p className="rd-sub">{t('w13q.basis.notRead')}</p>
      ) : basis.length === 0 ? (
        <p className="rd-sub">{t('w13q.basis.none')}</p>
      ) : (
        <ul className="rd-list" style={{ overflowWrap: 'anywhere' }}>
          {basis.map((entry, i) => (
            <li key={`${entry.id}-${String(i)}`} data-testid="decision-basis-entry">
              <BasisRow entry={entry} />
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}
