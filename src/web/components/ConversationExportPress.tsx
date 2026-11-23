// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PRESS THAT EXPORTS ONE RUN'S CONVERSATION, ON THE RUN'S PAGE. Wave 13s, point C1A-2, the export slice.
 *
 * The doors and the file are src/server/lib/conversation-export.ts; the words and shapes they share with this press are
 * src/shared/conversation-export.ts. This is the half the person reads and presses.
 *
 * ON ARRIVAL IT IS ONE PRESS AND NOTHING ELSE, so a page that is being read draws no box. Pressed, it asks the look
 * first and draws the four parts as ticks, every one ticked; a part the agent lacks is drawn as not there, with no
 * tick. Under them: the size, what the scrub did, the files left out, the files that would travel unscreened and what
 * the screen found, each for the parts still ticked. A finding about the whole file, or about the conversation or the
 * handover, stays whatever is ticked, because those always go.
 *
 * WITH SOMETHING TO LOOK AT, the first press of the download asks the person to look and press again, and only the
 * second sends the export, saying he has looked. A refusal is drawn in the office's own sentence. Only the person may
 * export, so for anybody else the press draws nothing.
 */
import { useState } from 'react'
import { t } from '@shared/i18n.ts'
import {
  CONVERSATION_EXPORT_PARTS,
  conversationExportFileName,
  type ConversationExportFinding,
  type ConversationExportLeftOutWhy,
  type ConversationExportLook,
  type ConversationExportPart,
  type ConversationExportPiece,
} from '@shared/conversation-export.ts'
import { screenCheckWord, screenSeverityWord } from '@shared/words.ts'
import { errorMessage, faultOf, getActor, moleOfficeRequest, type Fault } from '../api.ts'
import { Btn, ErrorNote, Loading, Panel, Tag } from './ui.tsx'
import { handTheZipToTheBrowserAsAFile } from './zip-export/download.ts'

/** The words the press draws, by what each is to the reader. The keys are in src/shared/words/en-wave-13s.ts. */
export const CONVERSATION_EXPORT_WORDS = {
  title: 'w13s.conversationExport.title',
  open: 'w13s.conversationExport.open',
  loading: 'w13s.conversationExport.loading',
  always: 'w13s.conversationExport.always',
  part: {
    notebook: 'w13s.conversationExport.part.notebook',
    memory: 'w13s.conversationExport.part.memory',
    space: 'w13s.conversationExport.part.space',
    address: 'w13s.conversationExport.part.address',
  },
  piece: {
    run: 'w13s.conversationExport.piece.run',
    conversation: 'w13s.conversationExport.piece.conversation',
    handover: 'w13s.conversationExport.piece.handover',
  },
  why: {
    'over-the-line': 'w13s.conversationExport.why.over-the-line',
    'over-the-count': 'w13s.conversationExport.why.over-the-count',
    'name-unfit': 'w13s.conversationExport.why.name-unfit',
    'not-a-markdown-file': 'w13s.conversationExport.why.not-a-markdown-file',
    'a-folder': 'w13s.conversationExport.why.a-folder',
    'not-an-ordinary-file': 'w13s.conversationExport.why.not-an-ordinary-file',
  },
  notThere: 'w13s.conversationExport.notThere',
  bytes: 'w13s.conversationExport.bytes',
  files: 'w13s.conversationExport.files',
  inAll: 'w13s.conversationExport.inAll',
  scrub: 'w13s.conversationExport.scrub',
  leftOut: 'w13s.conversationExport.leftOut',
  notScreened: 'w13s.conversationExport.notScreened',
  findings: 'w13s.conversationExport.findings',
  none: 'w13s.conversationExport.none',
  wholeFile: 'w13s.conversationExport.wholeFile',
  download: 'w13s.conversationExport.download',
  working: 'w13s.conversationExport.working',
  pressAgain: 'w13s.conversationExport.pressAgain',
  handed: 'w13s.conversationExport.handed',
} as const satisfies {
  part: Record<ConversationExportPart, string>
  piece: Record<Exclude<ConversationExportPiece, ConversationExportPart>, string>
  why: Record<ConversationExportLeftOutWhy, string>
  [key: string]: string | Record<string, string>
}

/** The one path both doors answer at: the look first is its read, the export is its press. */
function theExportPath(run: string): string {
  return `/api/conversations/${encodeURIComponent(run)}/export`
}

/** Every part ticked, which is how the press opens. */
export function theTicksAtFirst(): Record<ConversationExportPart, boolean> {
  return Object.fromEntries(CONVERSATION_EXPORT_PARTS.map((part) => [part, true])) as Record<ConversationExportPart, boolean>
}

/** The look first: what the file would hold with every part ticked. */
export function lookAtTheExport(run: string): Promise<ConversationExportLook> {
  return moleOfficeRequest<ConversationExportLook>(theExportPath(run))
}

/** The export: the zip's bytes, with the ticks and whether the person has looked at what the screen found. */
export function exportTheConversation(
  run: string,
  ticks: Record<ConversationExportPart, boolean>,
  looked: boolean,
): Promise<{ bytes: ArrayBuffer; headers: Headers }> {
  return moleOfficeRequest<{ bytes: ArrayBuffer; headers: Headers }>(
    theExportPath(run),
    { method: 'POST', body: JSON.stringify({ parts: ticks, looked }) },
    'bytes',
  )
}

/** Whether a piece goes with these ticks. The run's details, the conversation and the handover always go. */
function goes(piece: ConversationExportPiece | null, ticked: Readonly<Record<ConversationExportPart, boolean>>): boolean {
  if (piece === null) return true
  return (CONVERSATION_EXPORT_PARTS as readonly string[]).includes(piece) ? ticked[piece as ConversationExportPart] : true
}

/** What a piece is called on the page. */
function thePieceWord(piece: ConversationExportPiece): string {
  return (CONVERSATION_EXPORT_PARTS as readonly string[]).includes(piece)
    ? t(CONVERSATION_EXPORT_WORDS.part[piece as ConversationExportPart])
    : t(CONVERSATION_EXPORT_WORDS.piece[piece as Exclude<ConversationExportPiece, ConversationExportPart>])
}

/** The findings for the parts still ticked. */
export function theFindingsThatGo(
  look: ConversationExportLook,
  ticked: Readonly<Record<ConversationExportPart, boolean>>,
): ConversationExportFinding[] {
  return look.findings.filter((one) => goes(one.piece, ticked))
}

export interface ConversationExportPressViewProps {
  /** The look first, or null before the press is pressed. */
  look: ConversationExportLook | null
  ticked: Record<ConversationExportPart, boolean>
  failed: { message: string; fault: Fault | null } | null
  /** A read or the export is in flight. The presses stay out of reach until the office answers. */
  busy: boolean
  /** The person pressed the download with something to look at, so the next press sends the export. */
  askingToGoOn: boolean
  /** What became of the last download, in one sentence, or null. */
  handed?: string | null
  onOpen: () => void
  onTick: (part: ConversationExportPart, ticked: boolean) => void
  onDownload: () => void
}

/** The press, drawn from a reading, so it can be drawn straight from a made-up look. */
export function ConversationExportPressView({
  look,
  ticked,
  failed,
  busy,
  askingToGoOn,
  handed = null,
  onOpen,
  onTick,
  onDownload,
}: ConversationExportPressViewProps) {
  return (
    <Panel declares={{ surface: null }} titleIs="label" title={t(CONVERSATION_EXPORT_WORDS.title)}>
      <style href="mole-office-conversation-export" precedence="default">
        {CONVERSATION_EXPORT_CSS}
      </style>
      <div className="cxp">
        {look === null ? (
          busy ? (
            <Loading label={t(CONVERSATION_EXPORT_WORDS.loading)} rows={4} />
          ) : (
            <div className="cxp-presses">
              <Btn size="sm" variant="secondary" onClick={onOpen}>
                {t(CONVERSATION_EXPORT_WORDS.open)}
              </Btn>
            </div>
          )
        ) : (
          <TheLook look={look} ticked={ticked} busy={busy} askingToGoOn={askingToGoOn} onTick={onTick} onDownload={onDownload} />
        )}
        {failed === null ? null : <ErrorNote message={failed.message} fault={failed.fault} />}
        {handed === null ? null : <p className="cxp-note" role="status">{handed}</p>}
      </div>
    </Panel>
  )
}

function TheLook({
  look,
  ticked,
  busy,
  askingToGoOn,
  onTick,
  onDownload,
}: {
  look: ConversationExportLook
  ticked: Record<ConversationExportPart, boolean>
  busy: boolean
  askingToGoOn: boolean
  onTick: (part: ConversationExportPart, ticked: boolean) => void
  onDownload: () => void
}) {
  const pieceOf = (piece: ConversationExportPiece) => look.pieces.find((one) => one.piece === piece) ?? null
  const going = look.pieces.filter((one) => one.state === 'carried' && goes(one.piece, ticked))
  const bytes = going.reduce((sum, one) => sum + one.bytes, 0)
  const paths = going.reduce((sum, one) => sum + one.scrub.pathsMapped, 0)
  const secrets = going.reduce((sum, one) => sum + one.scrub.secretsRemoved, 0)
  const leftOut = look.leftOut.filter((one) => goes(one.piece, ticked))
  const notScreened = look.notScreened.filter((one) => goes(one.piece, ticked))
  const findings = theFindingsThatGo(look, ticked)
  return (
    <>
      <p className="cxp-note">{t(CONVERSATION_EXPORT_WORDS.always)}</p>
      <ul className="cxp-parts">
        {CONVERSATION_EXPORT_PARTS.map((part) => {
          const piece = pieceOf(part)
          const word = t(CONVERSATION_EXPORT_WORDS.part[part])
          if (piece === null || piece.state !== 'carried') {
            return (
              <li className="cxp-part" data-export-part={part} key={part}>
                <span className="cxp-name">{word}</span>
                <Tag tone="quiet">{t(CONVERSATION_EXPORT_WORDS.notThere)}</Tag>
              </li>
            )
          }
          return (
            <li className="cxp-part" data-export-part={part} key={part}>
              <label className="cxp-tick">
                <input type="checkbox" checked={ticked[part]} disabled={busy} onChange={(event) => onTick(part, event.target.checked)} />
                <span className="cxp-name">{word}</span>
              </label>
              <span className="cxp-size">
                {t(CONVERSATION_EXPORT_WORDS.files, { n: piece.entries.length })}, {t(CONVERSATION_EXPORT_WORDS.bytes, { n: piece.bytes })}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="cxp-note">{t(CONVERSATION_EXPORT_WORDS.inAll, { size: t(CONVERSATION_EXPORT_WORDS.bytes, { n: bytes }) })}</p>
      <p className="cxp-note">{t(CONVERSATION_EXPORT_WORDS.scrub, { paths, secrets })}</p>

      <h3 className="cxp-head">{t(CONVERSATION_EXPORT_WORDS.leftOut)}</h3>
      {leftOut.length === 0 ? (
        <p className="cxp-note">{t(CONVERSATION_EXPORT_WORDS.none)}</p>
      ) : (
        <ul className="cxp-files">
          {leftOut.map((one) => (
            <li className="cxp-file" key={one.file}>
              <code className="cxp-path">{one.file}</code>
              <span className="cxp-why">{t(CONVERSATION_EXPORT_WORDS.why[one.why])}</span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="cxp-head">{t(CONVERSATION_EXPORT_WORDS.notScreened)}</h3>
      {notScreened.length === 0 ? (
        <p className="cxp-note">{t(CONVERSATION_EXPORT_WORDS.none)}</p>
      ) : (
        <ul className="cxp-files">
          {notScreened.map((one) => (
            <li className="cxp-file" key={one.entry}>
              <code className="cxp-path">{one.entry}</code>
              <span className="cxp-why">{t(CONVERSATION_EXPORT_WORDS.bytes, { n: one.bytes })}</span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="cxp-head">{t(CONVERSATION_EXPORT_WORDS.findings)}</h3>
      {findings.length === 0 ? (
        <p className="cxp-note">{t(CONVERSATION_EXPORT_WORDS.none)}</p>
      ) : (
        <ul className="cxp-files">
          {findings.map((one, at) => (
            <li className="cxp-finding" key={`${String(at)}-${one.check}`}>
              <Tag tone="warn">{screenSeverityWord(one.severity).text}</Tag>
              <span className="cxp-check">{screenCheckWord(one.check).text}</span>
              <span className="cxp-where">
                {one.piece === null ? t(CONVERSATION_EXPORT_WORDS.wholeFile) : thePieceWord(one.piece)}
                {one.file === null ? null : <> <code className="cxp-path">{one.file}</code></>}
              </span>
              <span className="cxp-says">{one.says}</span>
            </li>
          ))}
        </ul>
      )}

      {askingToGoOn ? <p className="cxp-ask" role="status">{t(CONVERSATION_EXPORT_WORDS.pressAgain)}</p> : null}
      <div className="cxp-presses">
        <Btn size="sm" variant="primary" onClick={onDownload} disabled={busy}>
          {t(busy ? CONVERSATION_EXPORT_WORDS.working : CONVERSATION_EXPORT_WORDS.download)}
        </Btn>
      </div>
    </>
  )
}

/** The press with its reads. It reads nothing until it is pressed. */
export function ConversationExportPress({ run }: { run: string }) {
  const [look, setLook] = useState<ConversationExportLook | null>(null)
  const [ticked, setTicked] = useState(theTicksAtFirst)
  const [failed, setFailed] = useState<{ message: string; fault: Fault | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [askingToGoOn, setAskingToGoOn] = useState(false)
  const [handed, setHanded] = useState<string | null>(null)

  if (getActor().type !== 'human') return null

  const open = async (): Promise<void> => {
    setBusy(true)
    setFailed(null)
    setHanded(null)
    try {
      setLook(await lookAtTheExport(run))
      setAskingToGoOn(false)
    } catch (error) {
      setFailed({ message: errorMessage(error), fault: faultOf(error) })
    } finally {
      setBusy(false)
    }
  }

  const download = async (): Promise<void> => {
    if (look === null) return
    const toLookAt = theFindingsThatGo(look, ticked).some((one) => one.severity === 'look_before_you_paste')
    if (toLookAt && !askingToGoOn) {
      setAskingToGoOn(true)
      return
    }
    setBusy(true)
    setFailed(null)
    setHanded(null)
    try {
      const made = await exportTheConversation(run, ticked, askingToGoOn)
      const name = conversationExportFileName(run)
      const done = handTheZipToTheBrowserAsAFile(made.bytes, name)
      setHanded(done.handed ? t(CONVERSATION_EXPORT_WORDS.handed, { name }) : done.said)
      setAskingToGoOn(false)
    } catch (error) {
      const fault = faultOf(error)
      setFailed({ message: errorMessage(error), fault })
      // THE OFFICE FOUND SOMETHING TO LOOK AT THAT THIS LOOK DID NOT SHOW: the files changed since it was read. The look
      // is read again, so the next press is made with what is there now in front of the person.
      if (fault?.code === 'conversationExportLookFirst') {
        try {
          setLook(await lookAtTheExport(run))
          setAskingToGoOn(true)
        } catch (again) {
          setFailed({ message: errorMessage(again), fault: faultOf(again) })
        }
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <ConversationExportPressView
      look={look}
      ticked={ticked}
      failed={failed}
      busy={busy}
      askingToGoOn={askingToGoOn}
      handed={handed}
      onOpen={() => void open()}
      onTick={(part, on) => {
        setTicked((was) => ({ ...was, [part]: on }))
        setAskingToGoOn(false)
      }}
      onDownload={() => void download()}
    />
  )
}

const CONVERSATION_EXPORT_CSS = `
.cxp { display: flex; flex-direction: column; gap: 8px; }
.cxp-note, .cxp-ask, .cxp-head { margin: 0; }
.cxp-note { color: var(--text-2); font-size: var(--fs-2); }
.cxp-ask { font-weight: 600; }
.cxp-head { font-size: var(--fs-2); font-weight: 600; }
.cxp-presses { display: flex; flex-wrap: wrap; gap: 8px; }
.cxp-parts, .cxp-files { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.cxp-part, .cxp-file, .cxp-finding { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; min-width: 0; }
.cxp-tick { display: inline-flex; align-items: baseline; gap: 6px; cursor: pointer; }
.cxp-size, .cxp-why, .cxp-where { color: var(--text-2); font-size: var(--fs-2); }
.cxp-path, .cxp-says { min-width: 0; overflow-wrap: anywhere; }
`
