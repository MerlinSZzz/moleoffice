// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE FILE A RECORD NAMES, DRAWN AS ITS WORDS ON THE OFFICE'S OWN PAGE, AT #/file/<record>/<path>.
 *
 * A report's file block leads here from its Open press, for a PDF, a Word document, a text file or a Markdown file.
 * The page draws the same reader the block draws on its Show press, `ShownPdf` or `ShownFileWords`, so the file's
 * words are this page's own elements and a person can select them and talk about them. The bare file stays behind
 * Save. On a paired page at home, Save asks a ticket for the file, as the block's own Save does
 * (src/web/lib/file-tickets.tsx), because a link the browser follows carries the cookie half alone.
 *
 * WHICH READER IS READ FROM THE DOOR'S OWN TYPE, with a HEAD, as the block reads it. A file the HEAD names no PDF,
 * or refuses, gets `ShownFileWords`, which draws the door's own answer for it.
 *
 * THE RECORD IS READ FIRST, for two facts: the file's name, which heads the page, and the block that names the file,
 * which is what a right-click on the words is about. The reader is drawn only once the record has answered, so the
 * heading and the words arrive together. A file named by no top-level file block of the record is about the record
 * itself, and is headed by the page's own name, because the record gives it no name.
 *
 * THE FILE DOOR DECIDES WHAT MAY BE READ. This page sends the record it was given, and the door refuses a path that
 * record does not name, as it refuses it in the report.
 */

import { content, t } from '@shared/i18n.ts'
import { targetAttributes, type Target } from '@shared/targets.ts'
import type { FileBlock } from '@shared/types.ts'
import { api, type RecordDetail } from '../api.ts'
import { isAPdf, ShownFileWords, ShownPdf, SummaryStyle, theFileOf, usePictureBytes, whereALinkFetches } from '../components/SummaryBlocks.tsx'
import { ErrorNote, Loading } from '../components/ui.tsx'
import { AFileLink } from '../lib/file-tickets.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { useLanguage } from '../lib/language.ts'

export function FilePage({ record, path }: { record: string; path: string }) {
  useLanguage()
  const [state] = useProjectAsync(() => api.getRecord(record), [record])
  // THE FILE'S TYPE, read with a HEAD, so a PDF is drawn by the PDF reader and every other file as its words.
  const { outcome } = usePictureBytes(path, true, undefined, true, false, record)
  if (state.status === 'loading' || outcome.phase === 'asking' || outcome.phase === 'not-asked') {
    return <div className="page"><Loading what={t('filePage.title')} /></div>
  }
  if (state.status === 'error') return <div className="page"><ErrorNote message={state.message} fault={state.fault} /></div>
  const block = theFileBlock(state.value, path)
  // WHAT A RIGHT-CLICK ON THE WORDS IS ABOUT: the file block, as it is in the report, or the record when no block of
  // its own names the file.
  const about: Target =
    block === null
      ? { kind: 'record', recordId: record, workspaceId: state.value.record.workspaceId }
      : { kind: 'reportBlock', recordId: record, blockId: block.id }
  return (
    <div className="page">
      <SummaryStyle />
      <h1>{block === null ? t('filePage.title') : content(block.name)}</h1>
      <p className="sb-file-address">
        <AFileLink className="sb-file-save" file={theFileOf({ path }, record)} plain={whereALinkFetches(path, true, undefined, record)} saves>
          {t('sb.file.save')}
        </AFileLink>
      </p>
      <div className="sb" {...targetAttributes(about)}>
        {/* A PDF NAMED BY NO FILE BLOCK HAS NO NAME FROM THE RECORD, so a quote from it names no file. */}
        {outcome.phase === 'shown' && isAPdf(outcome.type) ? (
          <ShownPdf path={path} name={block?.name ?? ''} record={record} />
        ) : (
          <ShownFileWords path={path} record={record} />
        )}
      </div>
    </div>
  )
}

/** The record's own top-level file block for this path, or null. A block inside a section has no address of its own. */
function theFileBlock(detail: RecordDetail, path: string): FileBlock | null {
  const blocks = detail.record.data['blocks']
  if (!Array.isArray(blocks)) return null
  for (const block of blocks as unknown[]) {
    if (typeof block !== 'object' || block === null) continue
    const one = block as Partial<FileBlock>
    if (one.type === 'file' && one.path === path && typeof one.id === 'string' && typeof one.name === 'string') return one as FileBlock
  }
  return null
}
