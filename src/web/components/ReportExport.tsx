// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PRESS THAT SAVES A REPORT AS A FILE, beside the report's star in its head.
 *
 * Pressed, it opens the shared menu under itself, with two choices: an HTML file, then a PDF file. Each choice makes
 * the file from the report as this page draws it now (src/web/lib/report-export.ts). The HTML file is handed to the
 * browser to save. For the PDF file, the page made for printing is sent to the office's PDF door, and the PDF it answers
 * is handed to the browser to save. While a file is made, the press says so and cannot be pressed again. A refusal is
 * said beside the press. Once the file is handed over, nothing more is said: what the browser then does with it is
 * the browser's own, and this cannot see it.
 */
import { useRef, useState } from 'react'
import { t } from '@shared/i18n.ts'
import type { PanelRecord } from '@shared/types.ts'
import { errorMessage, faultOf, moleOfficeRequest } from '../api.ts'
import { handTheTextToTheBrowserAsAFile } from '../lib/clipboard.ts'
import { theDrawnBlocksOf, theReportAsOneFile, type TheForm } from '../lib/report-export.ts'
import { Menu, theRefusalInWords } from './ui.tsx'

/** The press is drawn as the star beside it is, at the size of the words around it. */
const REPORT_EXPORT_CSS = [
  '.report-export { display: inline-flex; align-items: center; gap: var(--pad); flex-wrap: wrap; }',
  '.report-export-press { cursor: pointer; font: inherit; color: var(--text); background: var(--panel); border: 1px solid var(--border-strong); border-radius: var(--radius); padding: 6px 10px; }',
  '.report-export-press:disabled { cursor: progress; color: var(--text-2); }',
  '.report-export-press:focus-visible { outline: var(--focus-w) solid var(--focus); outline-offset: var(--focus-offset); }',
].join('\n')

/** The office's door that prints the page made for printing, and answers the PDF's bytes. */
const PDF_DOOR = '/api/report-pdf'

/** The press, its menu, and what it says when no file was made. */
export function ReportExport({ record }: { record: Pick<PanelRecord, 'id' | 'title' | 'data'> }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string | null>(null)
  const box = useRef<HTMLSpanElement>(null)
  const press = useRef<HTMLButtonElement>(null)

  const save = async (form: TheForm): Promise<void> => {
    setOpen(false)
    setSaid(null)
    const blocks = box.current === null ? null : theDrawnBlocksOf(box.current)
    if (blocks === null) {
      setSaid(t('reports.export.notFound'))
      return
    }
    setBusy(true)
    try {
      const made = await theReportAsOneFile(blocks, record, document, form)
      if (!made.ok) {
        setSaid(made.said)
      } else if (form === 'html') {
        setSaid(handTheTextToTheBrowserAsAFile(made.text, made.name, 'text/html;charset=utf-8'))
      } else {
        const printed = await moleOfficeRequest<{ bytes: ArrayBuffer; headers: Headers }>(
          PDF_DOOR,
          { method: 'POST', body: JSON.stringify({ html: made.text }) },
          'bytes',
        )
        setSaid(handTheTextToTheBrowserAsAFile(printed.bytes, made.name, 'application/pdf'))
      }
    } catch (err) {
      // A REFUSAL OF THE PDF DOOR is said in the words of its code when it gave one, and in its own sentence when it did
      // not. A fault nobody foresaw is said in its own words. Either is said beside the press, and no file is handed over.
      setSaid(theRefusalInWords(errorMessage(err), faultOf(err)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="report-export" ref={box}>
      <style href="mole-office-report-export" precedence="default">{REPORT_EXPORT_CSS}</style>
      <button
        type="button"
        className="report-export-press"
        ref={press}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((was) => !was)}
      >
        {t(busy ? 'reports.export.working' : 'reports.export.press')}
      </button>
      {open ? (
        <Menu
          label={t('reports.export.press')}
          under={press}
          onClose={() => setOpen(false)}
          onEscape={() => press.current?.focus()}
          choices={[
            { key: 'html', label: t('reports.export.html'), onChoose: () => { void save('html') } },
            { key: 'pdf', label: t('reports.export.pdf'), onChoose: () => { void save('pdf') } },
          ]}
        />
      ) : null}
      {said === null ? null : <span role="alert">{said}</span>}
    </span>
  )
}
