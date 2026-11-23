// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Owner: line 13s. Home's key items: each open key item of the projects shown, in its order, with its progress and
// the estimate of the time left.
import { EVERY_PROJECT, type ProjectChoice } from '@shared/across-projects.ts'
import { content, t, writtenMoment } from '@shared/i18n.ts'
import type { KeyItemRead, KeyItemWho, TheKeyItems } from '@shared/key-items.ts'
import { THE_PERSON } from '@shared/person.ts'
import type { PartState, ProgressData } from '@shared/picture-parts.ts'
import { gapBetween } from '@shared/spacing.ts'
import { readTheKeyItems } from '../../lib/home-figures.ts'
import { partDrawn } from '../picture-parts/parts.tsx'
import { Absence, useAsync, type AsyncState } from '../ui.tsx'

/** Who set a progress or made an estimate: you, another person, or the agent by its handle. */
export function whoInWords(who: KeyItemWho): string {
  if (who.kind === 'person') return who.id === THE_PERSON ? t('home.keyItems.you') : t('home.keyItems.aPerson')
  return who.handle ?? t('home.keyItems.anAgent')
}

/**
 * A KEY ITEM'S PROGRESS AS THE PROGRESS PART DRAWS IT, with a label that says where it came from: the points of its
 * packages, a percent somebody set with who and when, or nothing, which is not recorded and never a zero.
 */
export function keyItemProgress(item: KeyItemRead): { label: string; state: PartState<ProgressData> } {
  const progress = item.progress
  if (progress.from === 'packages') {
    return {
      label: t('home.keyItems.fromPackages'),
      state: progress.of === 0 ? { status: 'not-recorded' } : { status: 'ready', data: { done: progress.done, total: progress.of } },
    }
  }
  if (progress.from === 'set') {
    return {
      label: t('home.keyItems.setBy', { percent: progress.percent, who: whoInWords(progress.setBy), when: writtenMoment(progress.setAt) }),
      state: { status: 'ready', data: { done: progress.percent, total: 100 } },
    }
  }
  return { label: t('home.keyItems.notSet'), state: { status: 'not-recorded' } }
}

/** A key item's time left, said as an estimate with who made it and when, or that nobody has made one. */
export function keyItemEstimate(item: KeyItemRead): string {
  const estimate = item.estimate
  if (estimate.state === 'not-estimated') return t('home.keyItems.notEstimated')
  return t('home.keyItems.estimate', {
    days: estimate.days, hours: estimate.hours, who: whoInWords(estimate.estimatedBy), when: writtenMoment(estimate.estimatedAt),
  })
}

/** The key items as read, drawn: each with its title, its project when every project is shown, its progress and its estimate. */
export function KeyItemsList({ reading, every }: { reading: AsyncState<TheKeyItems>; every: boolean }) {
  const none = t('home.keyItems.none')
  const howToAdd = t('home.keyItems.howToAdd')
  return (
    <section className="hm-section hm-key-items" data-home-section="keyItems">
      <style href="mole-office-key-items" precedence="default">{KEY_ITEMS_CSS}</style>
      <h2 className="hm-section-title">{t('home.keyItems.title')}</h2>
      {reading.status === 'loading' ? <p className="hm-empty">{t('home.keyItems.reading')}</p> : null}
      {reading.status === 'error' ? <p className="hm-empty"><Absence tier="told-apart" looked={false} title={t('home.keyItems.notRead')} /></p> : null}
      {reading.status === 'ready' && reading.value.items.length === 0
        ? <p className="hm-empty" data-home-key-items-none>{none + gapBetween(none, howToAdd) + howToAdd}</p>
        : null}
      {reading.status === 'ready' && reading.value.items.length > 0 ? (
        <ol className="hm-key-list">
          {reading.value.items.map((item) => {
            const progress = keyItemProgress(item)
            return (
              <li key={item.id} className="hm-key-item" data-home-key-item={item.id}>
                <div className="hm-key-head">
                  <span className="hm-key-title">{content(item.title)}</span>
                  {every ? (
                    <span className="hm-key-project" data-home-key-item-project={item.project.id}>
                      {item.project.title === null ? t('home.keyItems.noSuchProject') : content(item.project.title)}
                    </span>
                  ) : null}
                </div>
                {partDrawn('progress', progress.label, progress.state)}
                <p className="hm-key-estimate" data-home-key-item-estimate>{keyItemEstimate(item)}</p>
              </li>
            )
          })}
        </ol>
      ) : null}
    </section>
  )
}

/** Reads the open key items of the projects shown, and draws them. */
export function HomeKeyItems({ project }: { project: ProjectChoice }) {
  const [reading] = useAsync(() => readTheKeyItems(project), [project])
  return <KeyItemsList reading={reading} every={project === EVERY_PROJECT} />
}

const KEY_ITEMS_CSS = `
.hm-key-list { display: grid; gap: var(--pad-lg); margin: 0; padding: 0; list-style: none; }
.hm-key-item { display: grid; gap: var(--gut); min-width: 0; }
.hm-key-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--gut); min-width: 0; }
.hm-key-title { color: var(--text); font: 600 var(--fs-3)/var(--lh-tight) var(--font-ui); overflow-wrap: anywhere; }
.hm-key-project { color: var(--text-3); font: var(--fs-1)/var(--lh-body) var(--font-ui); }
.hm-key-estimate { margin: 0; color: var(--text-2); font: var(--fs-2)/var(--lh-body) var(--font-ui); }
`
