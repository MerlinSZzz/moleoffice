// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A DECISION GOVERNS, DRAWN IN ITS THREE PARTS: the pages (`governs`), the files (`governsFiles`) and what no page
 * fits (`nothingFits`).
 *
 * The record page's Governs section draws this, and it is filled when any of the three holds something
 * (`theGovernsSectionIsFilled` in src/shared/governs.ts). The entries are read by `theGovernedPlaces`, the reader the
 * server's lookup uses, so the page draws the places the lookup matches.
 *
 * AN ENTRY THAT COULD NOT BE READ IS NAMED FOR A READER, by its part and its number counted from 1, and then marked
 * not read. The stored field path is for a log or an agent, so it is never drawn. No text mark on a page's row, for the
 * reason `NamedRecordList` in RecordPage.tsx gives: the drawn words are that page's title, not the stored id.
 */
import { t } from '@shared/i18n.ts'
import { GOVERNS_FIELD, theGovernedPlaces, type ASkippedEntry } from '@shared/governs.ts'
import { theNothingFitsEntries } from '@shared/what-a-record-names.ts'
import { recordPath, RouteLink } from './router.tsx'
import { Absence } from './ui.tsx'

/** The words of the Governs section, named in full so each is read where it is used. */
export const GOVERNED_WORDS = {
  wholeProject: 'w13s.governs.wholeProject',
  partRecords: 'w13s.governs.partRecords',
  partFiles: 'w13s.governs.partFiles',
  skippedEntry: 'w13s.governs.skippedEntry',
  skippedField: 'w13s.governs.skippedField',
  nothingFits: 'w13s.governs.nothingFits',
  nearest: 'w13s.governs.nearest',
  notRead: 'w13s.governs.notRead',
  noSuchPage: 'g2b.body.noSuchId',
} as const

export function GovernedPlaces({
  governs,
  governsFiles,
  nothingFits,
  titleById,
}: {
  governs: unknown
  governsFiles: unknown
  nothingFits: unknown
  /** Every record of this project by id, so a page is drawn by its name. Without it, a page is drawn by its id. */
  titleById?: ReadonlyMap<string, string>
}) {
  const parts = theGovernedPlaces(governs, governsFiles)
  const missing = theNothingFitsEntries(nothingFits)
  return (
    <ul className="rd-list rd-governs">
      {parts.wholeProject ? <li data-governs="whole-project">{t(GOVERNED_WORDS.wholeProject)}</li> : null}
      {parts.records.map((id, i) => (
        <li key={`record-${String(i)}`} data-governs="record">
          <APage id={id} titleById={titleById} />
        </li>
      ))}
      {parts.files.map((path) => (
        <li key={`file-${path}`} data-governs="file">
          <code className="wrap-anywhere">{path}</code>
        </li>
      ))}
      {missing.map((one, i) => (
        <li key={`nothing-fits-${String(i)}`} data-governs="nothing-fits">
          {t(GOVERNED_WORDS.nothingFits, { what: one.what })}
          {one.nearest === undefined ? null : (
            <>
              {' '}
              <span className="rd-governs-nearest">
                {t(GOVERNED_WORDS.nearest)} <APage id={one.nearest} titleById={titleById} />
              </span>
            </>
          )}
        </li>
      ))}
      {parts.skipped.map((one) => (
        <li key={one.at} data-governs="not-read">
          {skippedInWords(one)} <Absence tier="told-apart" looked={false} word={t(GOVERNED_WORDS.notRead)} />
        </li>
      ))}
    </ul>
  )
}

/** One page by its name, or by its id with the words saying no page has it, or by its id when no names were given. */
function APage({ id, titleById }: { id: string; titleById?: ReadonlyMap<string, string> }) {
  if (titleById === undefined) return <RouteLink to={recordPath(id)}>{id}</RouteLink>
  const title = titleById.get(id)
  if (title === undefined) {
    return (
      <span className="rd-named-gone">
        <code>{id}</code> {t(GOVERNED_WORDS.noSuchPage)}
      </span>
    )
  }
  return <RouteLink to={recordPath(id)}>{title}</RouteLink>
}

/** Which entry could not be read, for a reader: its part, and its number counted from 1, or the whole part. */
function skippedInWords(one: ASkippedEntry): string {
  const part = t(one.part === GOVERNS_FIELD ? GOVERNED_WORDS.partRecords : GOVERNED_WORDS.partFiles)
  return one.entry === null ? t(GOVERNED_WORDS.skippedField, { part }) : t(GOVERNED_WORDS.skippedEntry, { n: one.entry, part })
}
