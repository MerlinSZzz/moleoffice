// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
/**
 * HOW A RECORD ENTERED THE CORPUS, drawn beside its name, in one place.
 *
 * Step 44's acceptance line is that a made-up example drawn in an evolution view without its mark
 * is made-up content presented as observed history. Two panels now draw rows that name records —
 * what a pipeline was made of, and one pipeline against another — so the mark and the module-name
 * lookup live here and both import them. Written twice they could disagree, and the place they
 * would disagree is exactly the place a reader is deciding whether to believe a row.
 */
import { Tag } from '../ui.tsx'
import { unstampedOriginNote } from '@shared/types.ts'

/** The names of the modules an answer mentions, as the composition routes hand them over. */
export type CarrierNames = Record<string, { title: string; origin: string | null; deleted: boolean }>

/** `fixture` is drawn in words on every row that names a record. Null means nobody stamped one. */
export function OriginMark({ origin }: { origin: string | null | undefined }) {
  if (origin === 'authored') return null
  if (origin === 'fixture') {
    return (
      <Tag tone="warn" title={t('g7b.origin-mark.it_entered_this_corpus_as_fixture_content')}>{t('g7b.origin-mark.made_up_example')}</Tag>
    )
  }
  // THE ONE WORDING FOR AN UNSTAMPED ROW, read from the shared declaration rather than typed here
  // again, so this panel and every other say the same thing about the same gap.
  return <Tag title={unstampedOriginNote()}>{t('g7b.origin-mark.origin_unrecorded')}</Tag>
}

/**
 * A module is named, never printed as its id.
 *
 * A nanoid where a title belongs has been a real defect in this product twice — once on three
 * blocks at a time. When the record cannot be found the answer says so in words and still shows the
 * id, because the id is the only true thing left about it.
 */
export function moduleName(names: CarrierNames, id: string): string {
  const found = names[id]
  if (found === undefined) return t('g7b.missingRecord')
  return found.deleted ? t('g7b.origin-mark.deleted', { v1: found.title }) : found.title
}
