// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
// THE REGION'S POINTING NAME IS THE SURFACE REGISTRY'S (src/shared/surfaces.ts, which wave 13q's S1 moves into the word lists).
import { surfaceWord } from '@shared/surfaces.ts'
/**
 * `#/bundles` — WHAT HAS LEFT THE BUILDING, AND WHAT A COPY OF THIS PROJECT WOULD SAY.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS PAGE EXISTS AT ALL, AND WHY IT IS THE POINT RATHER THAN THE TRIMMING
 * ---------------------------------------------------------------------------------------
 *
 * Four waves running in this campaign shipped a server half whose only door was `curl`. Wave 6
 * shipped twelve routes and four tables nothing on a screen could reach; wave 8's own step 10 was
 * its screen and was the one step of twelve not built; wave 10's module history is served by a
 * route no screen calls. The owner's sentence is that a feature is not complete merely because
 * status labels render.
 *
 * A bundle is the one thing in this product whose whole purpose is that content leaves it. It goes
 * to an agent Mole Office does not run, and the person who presses the button is the only check on what
 * is handed over. That check cannot happen through curl.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A PERSON CAN DO HERE
 * ---------------------------------------------------------------------------------------
 *
 * Choose what the copy is ABOUT, what it is FOR and how much DETAIL it carries, read the text
 * Mole Office would hand over BEFORE handing it over, copy it, and KEEP the choices so the same
 * reading can be made again later. The preview writes nothing, so reading it is not evidence
 * anything left.
 *
 * THE LAYOUT, from block b-17 of report n9Mjk3c_sJRu: a form of
 * three labelled rows, About, For and Detail, drawn the way Settings draws a labelled row; the
 * preview beside the form when the page is wide and under it when it is not; the kept bundles under
 * both. "Copy the bundle", at the right of the title, is the page's one primary press and copies
 * exactly what the preview shows. "Keep it for later" files the choices.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO THINGS THIS PAGE COULD NOT DO UNTIL 26 AUGUST 2026, AND WHY THEY WERE ONE THING
 * ---------------------------------------------------------------------------------------
 *
 * `design/round-ten/verification/wave-12.json` called them a fatal and a major and they had one
 * cause: the page had no subject but the project.
 *
 * IT COULD NOT FILE A BUNDLE. `src/web/api.ts` had `bundles()`, `bundlePreview()` and
 * `exportBundle(id)` and no create, so every `Copy it` button on this page existed only because
 * somebody had filed the bundle with `curl` first. On the owner's own corpus the page read *No
 * bundles are filed here yet* and there was no control that could change that. The dogfood's step
 * 6 — *"From a real module: create a bundle"* — could not be performed at all from the screens.
 *
 * AND THREE OF THE SIX PRESETS COULD NEVER BE CHOSEN. `presetsFor(null)` asks for the presets a
 * PROJECT is offered, and `critique_module`, `investigate_problem` and `understand_pipeline` are
 * offered on a module, a problem and a pipeline. Giving the page a record scope is the same change
 * as making those reachable: the chooser asks `presetsFor(subject.recordKind)`, so the list is the
 * declaration in `src/shared/bundles.ts` narrowed by what the subject actually is, and a seventh
 * preset added there appears here without this file being touched.
 *
 * THE VALIDITY LIMITS ARE DRAWN AS THEIR OWN THING, above the text, and not left inside it. A
 * person about to paste project context into somebody else's window is the last reader who can
 * notice that a temporary value is going out. They should not have to find it in 8,000 characters.
 *
 * THE REFUSAL IS DRAWN AS WORDS AND NOT AS A FAILED REQUEST. A 409 here means Mole Office could not read
 * a restriction for a record in scope, so it does not know whether the text carries a value without
 * its limit. That is the most important sentence this page can say and it says it in full.
 */
import { useEffect, useRef, useState } from 'react'
import { api, type BundleAsked } from '../api.ts'
import {
  BUNDLE_PRESETS,
  BUNDLE_RUNGS,
  howFarFromTheAutomaticLevel,
  partsAtTheirTop,
  rungsMoved,
  presetsFor,
  sizeInWords,
  SCOPE_NAMES,
  SCOPES,
  whyTheseSlotsCannotBeUsed,
  type BundlePreset,
  type BundlePresetSpec,
  type ScopeName,
} from '@shared/bundles.ts'
// THE POSITIONS ARE THE LADDER'S. Their names are the word lists' settingsPanel.detail.level words,
// which say Conclusion, Full and Level n in English (their rule of 2 September) and the same in the
// page language; see levelWord below.
import type { Rung } from '@shared/detail.ts'
// A PANEL'S TITLE IS THE REGISTRY'S LABEL, not a second string beside it. A panel that declares
// itself as `bundles.reads` and prints different words is the same fact in two places. The region
// that makes a copy declares `bundles.make` and draws NO title at all — criterion B27 — and takes
// the same label for its `aria-label`, so what somebody points at is still named once.
import type { BundlePart as PreviewPart, ResolvedBundle } from '../../server/lib/bundle.ts'
import { kindWord } from '@shared/words.ts'
import { InReach } from './InReach.tsx'
import { declaredAttributes } from './declares.ts'
import { Absence, Btn, ErrorNote, Loading } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
import { DRAWS_THE_NAME } from './agent/pointing.ts'
import { drawnStamp } from '@shared/time.ts'
import { handTheTextToTheBrowserAsAFile, putOnTheClipboard, selectTheWholeText } from '../lib/clipboard.ts'
import { CodeRows } from '../lib/code-rows.tsx'
import { exportFileName } from '@shared/zip-export/manifest.ts'
import { handTheZipToTheBrowserAsAFile, theFileCountsSaid } from './zip-export/download.ts'
import { useInspect, useMode } from '../lib/mode.ts'
import { currentWorkspace } from '../lib/workspace.ts'
import { EVERY_PROJECT } from '@shared/across-projects.ts'
import { ProjectChoiceControl, ProjectName, useProjectChoice, useProjectTitles, withCountedOver } from './ProjectChoice.tsx'
import { RecordId } from './RecordId.tsx'
import { recordPath, RouteLink } from './router.tsx'

interface BundleRow {
  id: string
  title: string
  /** The project the bundle is kept in, which is the project its copy is read in. */
  workspaceId: string
  spec: { scope: { kind: string; recordId?: string }; preset: BundlePreset }
  exports: { n: number; at: string; bytes: number; textHash: string }[]
}

/**
 * WHAT THE COPY IS ABOUT. The whole project, or one record — and when it is a record, its KIND is
 * held here beside its id, because the kind is what decides which presets are offered.
 *
 * IT IS A UNION AND NOT AN ID THAT MAY BE NULL, for the reason `BundleScope` in
 * `src/shared/bundles.ts` is one: a project has no record id, and a shape where the id is optional
 * lets *a record scope with no record* be constructed, which resolves as the whole project while
 * claiming to be about something. That is exactly what the server would store today if this page
 * sent it.
 */
type Subject =
  | { kind: 'project' }
  | { kind: 'record'; id: string; title: string; recordKind: string; workspaceId: string }

/** How long after the last keystroke the record search asks the server. */
const SEARCH_DEBOUNCE_MS = 200

/** What one part of the copy did. Drawn as a row, so the choice can be read without the text. */
type Preview = Omit<ResolvedBundle, 'couldNotCheckInScope' | 'assembledFrom' | 'shift'> & {
  couldNotCheck: ResolvedBundle['couldNotCheckInScope']
}
interface TheBrief {
  head: string
  size: {
    characters: number
    bytes: number
    tokensEstimated: number
    charsPerTokenAssumed: number
    /** The sentence saying the token figure is an estimate and no tokenizer is installed. */
    tokensAreAnEstimate: string
  }
  leftOut: { rung: string; what: string }[]
  whole: unknown
  /** The project the brief was read for. */
  project: string
}

/** The id of the block holding the copy's text, which is what the select-it-all press selects. */
const THE_TEXT_ON_SCREEN = 'bx-thetext'

/**
 * EVERY WAY OUT OF A COPY BESIDE THE CLIPBOARD, AND WHERE THEY ARE DRAWN. Criteria B28, B29 and the
 * second criterion of bundle-5.
 *
 * IT USED TO EXIST ONLY AFTER A COPY PRESS THAT FAILED, and that is what bundle-5 changes. Measured
 * 8 September 2026 in Chromium at 1440 and 390 in both themes: on a browser where the clipboard
 * works, *Open it as a page of text* and *Open it in a text box* were drawn zero times, before any
 * press and after a press that copied. A person whose clipboard works could not open the copy as
 * plain text at all, and opening it as plain text is how a copy is sent to somebody, opened in a new
 * tab, or read without a forty-thousand-character block underneath it. Problem `SSo-90ct3Kqj`.
 */
interface WaysOut {
  /** `preview` for the two buttons on the copy, or the id of the filed row that was pressed. */
  where: string
  /**
   * WHY THE CLIPBOARD DID NOT TAKE IT, in a sentence a person reads, or NULL when nothing failed.
   *
   * Null is the ordinary case now: the ways out stand beside the copy whether or not anything went
   * wrong. `src/web/lib/clipboard.ts` writes the sentence when there is one.
   */
  because: string | null
  /** What the press would have copied, so it can still be handed over as a file. */
  text: string
  /** What the file would be called if the person asks for one. */
  fileName: string
  /**
   * The id of the block already showing this text, or null when nothing on the page shows it.
   *
   * A press on the copy has the text on screen underneath it already; a press on a filed row does
   * not, and the block draws it. Drawing it twice would put a whole context bundle on the page
   * twice, which is what the old sentence *The text is below* claimed and, on a row press, was not.
   */
  alreadyOnScreen: string | null
  /**
   * WHERE THIS COPY IS SERVED AS A PAGE OF PLAIN TEXT. Criterion B29.
   *
   * An address rather than a request: the browser opens it, and a tab drawing text/plain needs no
   * clipboard at all. `src/web/api.ts` builds it from the same question the preview asks, so the
   * page and the copy on the screen cannot come from two different requests.
   */
  address: string
}

/**
 * THE FOUR WAYS OUT BESIDE THE CLIPBOARD, and the line saying the clipboard refused where it did.
 * Criteria B28 and B29, and the second criterion of bundle-5.
 *
 * IT IS DRAWN WHERE THE PRESS IS and never at the top of the page. Every offer here works in a
 * browser with no clipboard: a selection, a download, a page of plain text and a text box are none
 * of them gated on a secure context.
 *
 * AND IT IS DRAWN WHETHER OR NOT ANYTHING FAILED. `couldNot.because` is the sentence about a
 * clipboard that refused, and it is null when nobody's did. Making a copy fail was the only way to
 * reach the last two until 8 September 2026.
 *
 * THE LAST TWO: a press that opens the copy as a plain text page, or a text box that opens
 * for copying by hand.
 */
function TakeItAnotherWay({ couldNot }: { couldNot: WaysOut }) {
  /** What the last of these four presses came to, in its own words, or null before any of them. */
  const [said, setSaid] = useState<string | null>(null)
  /** The name of the file this block last handed to the browser, drawn on its own row; null when the last press handed none. */
  const [handed, setHanded] = useState<string | null>(null)
  /** Whether the text box is open. It is a press, and it starts shut, like the chooser above. */
  const [inABox, setInABox] = useState(false)
  /**
   * HOW MANY TIMES SOMEBODY HAS ASKED FOR THE BOX, which is what makes asking again do something.
   *
   * The effect below selects the text, and an effect only runs when what it watches changes. With
   * `inABox` alone, a second press on a box that is already open would change nothing and select
   * nothing — a control that is there, is pressed, and does nothing.
   */
  const [asked, setAsked] = useState(0)
  const box = useRef<HTMLTextAreaElement | null>(null)
  /**
   * SELECT THE WHOLE BOX AS IT OPENS, so the next key a person presses is the one that copies.
   *
   * AN EFFECT AND NOT A TIMER. The box does not exist until React has drawn it, so the press itself
   * cannot select it; a `setTimeout` after the press is a guess about when it will exist, and a
   * guess that is usually right is exactly what goes wrong on a loaded machine and reads as a
   * product fault. An effect runs once the browser has the element and before it paints.
   */
  useEffect(() => {
    if (!inABox) return
    const area = box.current
    if (area === null) return
    area.focus()
    area.select()
  }, [inABox, asked])
  const textId = couldNot.alreadyOnScreen ?? `bx-took-${couldNot.where}`
  const boxId = `bx-box-${couldNot.where}`
  return (
    <div className="bx-nocopy" {...(couldNot.because === null ? {} : { role: 'note' })}>
      {couldNot.because === null ? (
        // A NAME OVER THE FOUR PRESSES, because they now stand beside a copy that worked and a
        // reader meeting four buttons with no lead has to press one to find out what they are.
        // Criterion B24: a label names the thing rather than describing it.
        <p className="bx-nocopy-why">{t('g7a.bundles.anotherWay')}</p>
      ) : (
        <p className="bx-nocopy-why">{couldNot.because}</p>
      )}
      {couldNot.alreadyOnScreen === null ? (
        <pre className="bx-text" id={textId}>
          {couldNot.text}
        </pre>
      ) : null}
      <div className="bx-take">
        <button
          type="button"
          className="bx-look"
          onClick={() => {
            setHanded(null)
            setSaid(selectTheWholeText(textId))
          }}
        >
          {t('g7a.bundles.selectAll')}</button>
        <button
          type="button"
          className="bx-look"
          onClick={() => {
            const refused = handTheTextToTheBrowserAsAFile(couldNot.text, couldNot.fileName)
            setSaid(refused)
            setHanded(refused === null ? couldNot.fileName : null)
          }}
        >
          {t('g7a.bundles.saveFile')}</button>
        {/* AN ANCHOR AND NOT A BUTTON, because it goes to a page. A real link can be opened in a new
            tab, middle-clicked, copied as an address and sent to somebody, and a browser says where
            it goes before it is pressed. A button doing the same thing with script takes all of
            that away and gives nothing back. Criterion B29. */}
        <a className="bx-look" href={couldNot.address} target="_blank" rel="noreferrer">
          {t('g7a.bundles.openText')}</a>
        <button
          type="button"
          className="bx-look"
          onClick={() => {
            setInABox(true)
            setAsked((n) => n + 1)
            setSaid(null)
            setHanded(null)
          }}
        >
          {inABox ? t('g7a.bundles.selectAgain') : t('g7a.bundles.textBox')}
        </button>
      </div>
      {/* THE TEXT BOX, once somebody has asked for one. Criterion B29: a text box that opens for copying by hand.

          READ-ONLY AND NOT DISABLED. A disabled text box cannot be selected or scrolled, which is
          the whole of what this is for; read-only keeps the caret, the selection and the keyboard
          and still refuses an edit. Nothing here writes anything back, so an edit would be a person
          changing a copy that no longer says what Mole Office would produce. */}
      {inABox ? (
        <textarea
          id={boxId}
          className="bx-box"
          ref={box}
          readOnly
          value={couldNot.text}
          aria-label={t('g7a.bundles.copyByHand')}
        />
      ) : null}
      {said === null ? null : <p className="bx-nocopy-said">{said}</p>}
      {handed === null ? null : <CodeRows rows={[{ label: 'frameFiles.row.handed', value: handed }]} />}
    </div>
  )
}

/**
 * WHICH LEVEL ONE PART GOT AND WHY, in the words the table draws. Criteria B30, B31 and B32.
 *
 * FIVE ANSWERS AND THEY ARE NOT FIVE SPELLINGS OF ONE:
 *
 *   the level, on its own            its share of the size fits that level and nobody moved it
 *   the level, and where it came from  the person moved every part, and this is where this one landed
 *   the level, and that it is over    the level needs more room than the share, so the copy is larger
 *   the highest rung this part has   where *more* stops, which is a fact about the records
 *   a dash                            this part chose nothing: it carries nothing, it is the validity
 *                                     limits, which are never cut, or the copy names one level for all
 *
 * THE LAST ONE IS NOT AN ABSENCE THE READER HAS TO INTERPRET. A part that chose nothing and a part
 * whose choice nobody recorded would read the same as a blank cell, so the reason is in the title.
 *
 * THE TOP IS DRAWN ONLY WHERE THE PART IS NOT ALREADY THERE. Criterion B32: the page says the
 * highest rung this part's records really have, so a reader can see where *more* would stop; saying
 * it again on a part already at its top would be the same word twice in one cell.
 */
function whatLevelThisPartGot(part: PreviewPart): React.ReactNode {
  if (part.chose === undefined) {
    return (
      <span title={t('g7a.bundles.noLevel')}>
        —
      </span>
    )
  }
  const { level, shift, fits } = part.chose
  const moved = shift === 0 ? null : rungsMoved(shift)
  const top = part.top !== null && part.top !== level ? part.top : null
  return (
    <>
      <strong>{levelWord(level)}</strong>
      {moved === null ? null : <span className="bx-part-says">{moved}</span>}
      {top === null ? null : (
        <span className="bx-part-says">
          {t('g7a.bundles.writtenTop', { level: levelWord(top) })}
        </span>
      )}
      {fits ? null : (
        <span className="bx-part-says">
          {t('g7a.bundles.overShare', { n: part.bytes - part.share })}
        </span>
      )}
    </>
  )
}

/** A level's name in the page language: Conclusion, Full or Level n in English. */
function levelWord(rung: Rung): string {
  return t(`settingsPanel.detail.level.${rung}`)
}

/** A file name a person can find again: the bundle's own name, with nothing a file system refuses. */
function aFileNameFor(title: string): string {
  const plain = title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
  return `${plain === '' ? 'context-bundle' : plain.slice(0, 80)}.txt`
}

export function BundlePanel() {
  const mode = useMode()
  /**
   * WHETHER THE READER HAS ASKED TO SEE THE MACHINERY. Criterion B26.
   *
   * The one thing on this page that is machinery rather than work is the agent brief: what
   * `GET /api/brief` hands an arriving agent. It is drawn only when this is true.
   */
  const inspect = useInspect()
  /**
   * WHICH PROJECTS THE PAGE READS: every project, or one. The page stands under
   * All projects. The kept bundles and the search for One record read the projects chosen here, and each
   * row names its project. It starts at the project the page was opened from, shown chosen.
   */
  const [choice, setChoice] = useProjectChoice()
  const titles = useProjectTitles()
  /**
   * THE PROJECT A WHOLE-PROJECT COPY IS ABOUT, when Every project is chosen. A copy is always about ONE
   * project: the assembler reads one project at a time, so a copy of every project at once is not offered.
   * With one project chosen, the copy is about that project; with Every project, the About row asks which,
   * starting at the project the page was opened from.
   */
  const [aboutWhenEvery, setAboutWhenEvery] = useState<string>(() => currentWorkspace())
  const wholeProject = choice === EVERY_PROJECT ? aboutWhenEvery : choice
  /**
   * THE PROJECT A COPY OF THIS SUBJECT IS ABOUT: the record's own project, or the whole project's. It is
   * the one project the preview, the copy, the page of text, keeping it and the agent brief all use,
   * so keeping a bundle files it where its copy is read and never where the page was opened from.
   */
  const projectOf = (s: Subject): string => (s.kind === 'record' && s.workspaceId !== '' ? s.workspaceId : wholeProject)
  // THE LIST CARRIES THE CHOICE IT WAS READ FOR, so the count's sentence names what the count is over
  // even while a list read for the previous choice is still on the screen.
  const [listed, again] = useProjectAsync(
    async () => ({ ...((await api.bundles(choice)) as { bundles: BundleRow[] }), readFor: choice }),
    [choice],
  )
  const [wanted, setWanted] = useState<BundlePreset>('recover_project')
  const [subject, setSubject] = useState<Subject>({ kind: 'project' })
  const [preview, setPreview] = useState<Preview | null>(null)
  /**
   * HOW MANY TIMES THE READING HAS BEEN ASKED FOR OR CLEARED. Only the answer to the latest question
   * is drawn.
   *
   * Two readings can be on their way at once: choosing a copy type asks for one, and a press a moment
   * later asks for another. The server may answer them in either order. An answer that arrives after
   * a newer question was asked, or after the reading was cleared, is dropped, so the copy on screen
   * never answers a question the controls no longer ask. Two merge-queue runs before 27 September
   * 2026 drew the older answer: a copy with no modules and pipelines part, after that part was ticked.
   */
  const lastQuestion = useRef(0)
  /** Clear the reading, and forget any answer still on its way, because the question just changed. */
  const clearTheReading = (): void => {
    lastQuestion.current += 1
    setPreview(null)
    setCopyRefused(false)
  }
  /**
   * THE MAKING SECTION IS DRAWN ON ARRIVAL, AND NO READING IS ASKED FOR BY DRAWING IT.
   *
   * Criterion B33, on report `u9_a7rjYnz5V`: no Choose a reading press, and the
   * content shows at once. The section that makes a copy used to stand behind one press
   * reading *Choose a reading*; it is drawn now, and a press on a reading in the menu shows that
   * reading in place.
   *
   * THE TWO ARRIVAL RULES ARE BOTH KEPT, and they do not fight. Drawing a control costs no
   * request; what costs a request is producing a reading, and that happens on a person's press —
   * choosing a preset, choosing a record, or the read-again press. So the page opens on the
   * controls with no reading, `preview` stays null until somebody asks, and nothing is measured
   * before then.
   */
  const [fault, setFault] = useState<string | null>(null)
  /**
   * WHAT THE LAST PRESS CAME TO, AND WHICH PRESS IT WAS. The third criterion of bundle-5.
   *
   * IT USED TO BE A SENTENCE WITH NO PLACE. It was drawn once, near the top of the page, above the
   * copy panel — and the presses that write it are at the bottom of that panel and in the list
   * below it. Measured 8 September 2026 in Chromium: after pressing File this and hand it over, the
   * sentence stood 1,669 pixels above the press at 1440 and 8,420 pixels above it at 390, out of
   * view at both widths in both themes. The person pressed, nothing they could see changed, and the
   * only word about it was off the top of the screen. Problem `wuPmOtdQUidA`.
   *
   * `where` IS `preview` FOR A PRESS ON THE COPY, or a filed bundle's own id for a press on its
   * row — the same word `couldNotCopy` carries, for the same reason and read the same way.
   */
  const [said, setSaid] = useState<{ where: string; text: string; file?: string } | null>(null)
  const [query, setQuery] = useState('')
  const [typedName, setTypedName] = useState<string | null>(null)
  const [filing, setFiling] = useState(false)
  /**
   * THE PARTS THE PERSON HAS TICKED, and this is the control the page did not have.
   *
   * The preset named "Choose what goes in" appeared on every subject and offered no choice at all:
   * there were no checkboxes on the page, `src/web/api.ts` had no way to send a list, and the
   * caption underneath said "The person picks the parts." Measured 27 August 2026, in Chromium.
   *
   * IT STARTS FROM THE PARTS OF THE PRESET THE PAGE OPENS ON, ticked, rather than from nothing. A
   * default nobody can see is the silent substitution this product is written against; a default
   * sitting in ticked boxes is a suggestion somebody can read and change.
   */
  const [chosen, setChosen] = useState<readonly ScopeName[]>(BUNDLE_PRESETS.recover_project.slots)
  /**
   * WHICH MODULES AND PIPELINES GO IN, or `null` for all of them.
   *
   * NULL AND "EVERY ID TICKED" ARE THE SAME PICTURE AND DIFFERENT REQUESTS. Null sends no list at
   * all, which is a copy that carries whatever modules exist when it is read again next month; a
   * list of every id today is a copy frozen to the eighteen that exist now. A bundle is a recipe
   * read again later, so the state that means *all of them* has to be the one that says nothing.
   * Criterion B6 of design/bundle/ACCEPTANCE.md.
   */
  const [namedStructure, setNamedStructure] = useState<{ workspaceId: string; ids: readonly string[] } | null>(null)
  /**
   * HOW DETAILED EACH RECORD IN THE COPY IS, as one position of the seven-level ladder.
   *
   * IT OPENS AT THE LONGEST, which is what every copy did before this control existed, so the page
   * opens showing what it has always shown rather than at a shorter reading nobody asked for.
   * It follows criterion B9 of design/bundle/ACCEPTANCE.md, which rests on a decision.
   */
  /**
   * HOW FAR THE PERSON HAS MOVED EVERY PART FROM THE LEVEL ITS SHARE CHOSE. Criterion B31.
   *
   * IT OPENS AT ZERO, which is the automatic base: every part at the longest level its own share of
   * the size fits. That is what a copy did before any level control existed, so the page opens on
   * what it has always done and a press is the only way to change it.
   */
  const [shift, setShift] = useState(0)
  /**
   * THE RECORDS SOMEBODY ADDED BY HAND, and the list this page could not make.
   *
   * A copy was about the whole project or about exactly one record, and the search box above was
   * how you said which record. So a person who wanted the project AND two particular records could
   * not ask for it, and searching read as *how a copy is composed* rather than as *what to add*.
   * It follows criterion B8 of design/bundle/ACCEPTANCE.md and a decision.
   *
   * EMPTY IS NOT "NONE OF THEM" ON THE WIRE. An empty list is refused by the server, because
   * somebody naming none is not somebody naming nothing, so nothing is sent when this is empty.
   */
  const [added, setAdded] = useState<readonly { id: string; title: string; kind: string; workspaceId: string }[]>([])
  /** What an arriving agent is told, once somebody has pressed to read it. Null until then. */
  const [brief, setBrief] = useState<TheBrief | null>(null)
  /** Whether the last press put the text on the clipboard. Drawn on the button, not underneath it. */
  const [copied, setCopied] = useState(false)
  /**
   * THE PRESS THAT COULD NOT COPY, AND WHERE IT WAS PRESSED. Criterion B28. Null when the last
   * press copied, or when nobody has pressed.
   *
   * IT CARRIES `where` BECAUSE THE ANSWER HAS TO BE DRAWN WHERE THE PRESS WAS. They pressed copy on
   * their other machine and the page said nothing: what it really did was write the browser's words
   * about an undefined variable into a note at the top of the page, 1,152 pixels above the button,
   * measured 7 September 2026. A sentence a person has to scroll up to find is one nobody read.
   *
   * `where` IS EITHER `preview` OR A FILED BUNDLE'S ID, so the block lands under the two buttons on
   * the copy, or under the row whose Copy it was pressed.
   */
  const [couldNotCopy, setCouldNotCopy] = useState<WaysOut | null>(null)
  /** Whether the primary press is reading or copying right now, so it cannot be pressed twice. */
  const [copying, setCopying] = useState(false)
  /** Whether the primary press's last try found no clipboard. Its one line is drawn under the press. */
  const [copyRefused, setCopyRefused] = useState(false)
  /**
   * WHETHER THE RELATED FILES GO TOO, FOR EACH EXPORT PRESS.
   *
   * THE ANSWER BELONGS TO ONE PRESS. A press is either the copy's own (`preview`) or a kept
   * bundle's id, and each keeps its answer under that word. It starts at no, which is the text
   * answer the press gave before this choice existed, and it goes back to no once the press has
   * finished, so the next press asks again rather than remembering an answer nobody can see.
   */
  const [withFilesFor, setWithFilesFor] = useState<Record<string, boolean>>({})
  const theFilesAnswer = (where: string): boolean => withFilesFor[where] === true
  const chooseTheFilesAnswer = (where: string, withFiles: boolean): void =>
    setWithFilesFor((was) => ({ ...was, [where]: withFiles }))
  const forgetTheFilesAnswer = (where: string): void =>
    setWithFilesFor((was) => {
      const next = { ...was }
      delete next[where]
      return next
    })

  /**
   * WHICH PRESETS THIS SUBJECT IS OFFERED, read from the declaration and never listed here.
   *
   * This is the line the major fault was about. It used to be `presetsFor(null)` — the presets a
   * PROJECT is offered — so `critique_module`, `investigate_problem` and `understand_pipeline` were
   * declared, served, tested and unreachable from every screen at every width. Asking the subject's
   * own kind is the whole fix, and it means a seventh preset added to `src/shared/bundles.ts`
   * appears in this menu without this file being edited.
   */
  const offered = presetsFor(subject.kind === 'project' ? null : subject.recordKind)
  /** The one project this copy is about. See `projectOf`. */
  const theProject = projectOf(subject)
  /**
   * WHAT IS NAMED FOR THIS PROJECT. A copy may only carry the modules, pipelines and added records of the
   * project it is about (the server refuses any other), so a list made for another project is not sent.
   * The controls that change the project also clear these, so what is drawn is what is sent.
   */
  const namedFor = (project: string): readonly string[] | null =>
    namedStructure !== null && namedStructure.workspaceId === project ? namedStructure.ids : null
  const addedFor = (project: string) => added.filter((one) => one.workspaceId === project)
  const namedHere = namedFor(theProject)
  const addedHere = addedFor(theProject)
  /** The project moved: the reading, and the lists made for the old project, no longer apply. */
  const theProjectMoved = (to: string): void => {
    setBrief(null)
    setNamedStructure((was) => (was !== null && was.workspaceId !== to ? null : was))
    setAdded((was) => was.filter((one) => one.workspaceId === to))
  }

  /**
   * WHICH PRESET IS USED FOR A SUBJECT, workable before the subject state has moved.
   *
   * A record chosen from the search is read in the same press that chooses it, and a state set in
   * that tick is not the state the request in that tick reads. This takes the subject as an
   * argument so the request and the controls cannot disagree about what was asked for.
   */
  const presetForSubject = (s: Subject): BundlePreset => {
    const here = presetsFor(s.kind === 'project' ? null : s.recordKind)
    return here.includes(wanted) ? wanted : (here[0] ?? 'continue')
  }

  /**
   * WHETHER THE CHOICES ON THE SCREEN CAN BE READ AT ALL. Criterion B33.
   *
   * A recording scope with no record chosen and the preset that takes a list with no part ticked
   * are both refusals the server would write. The page does not ask a question it already knows the
   * answer to: it draws the reason in the words the shared refusal already holds, and asks nothing.
   */
  const canRead = (p: BundlePreset, s: Subject): boolean =>
    !(s.kind === 'record' && s.id === '') && !(p === 'custom' && chosen.length === 0)

  /**
   * WHETHER EVERY PART IS ALREADY AT THE HIGHEST RUNG ITS OWN RECORDS HAVE. Criterion B32.
   *
   * `More` stops here. It is read off the copy on the screen rather than off the offset, because the
   * offset is a number of presses and this is a fact about what somebody wrote: a copy of records
   * that stop at their Conclusion is at its top after no presses at all.
   *
   * A PART THAT CHOSE NO LEVEL DOES NOT HOLD THE PRESS OPEN. The validity limits are drawn whole at
   * every size and a part with no entries has no top, so neither has a rung left to climb.
   */
  const atTheTop =
    preview !== null &&
    preview.parts.every(
      (part) => part.chose === undefined || part.top === null || part.chose.level === part.top,
    )

  /**
   * WHERE THE SCALE BESIDE LESS AND MORE STANDS. Criterion B34.
   *
   * ONE EXPRESSION, from `partsAtTheirTop` in `src/shared/bundles.ts`, so the count beside the
   * presses and the count a person could work out from the table are the same arithmetic. Null
   * before any reading: there are no numbers to draw and nothing to claim was measured.
   */
  const againstTops = preview === null ? null : partsAtTheirTop(preview.parts)

  /**
   * THE PRESET AS IT WILL BE USED, which is not always the one last pressed.
   *
   * Choosing a module after choosing `recover_project` leaves a wanted preset that a module is not
   * offered. Rather than an effect that rewrites the choice behind the person's back, the menu is
   * DRAWN from what is offered and falls to the first of them, so the select visibly moves and what
   * is sent is what is shown. Switching back to the project brings the earlier choice back with it.
   */
  const preset: BundlePreset = presetForSubject(subject)

  /**
   * WHAT IS STILL NEEDED, IN THE REFUSAL THE SERVER WOULD HAVE WRITTEN. Criterion B33.
   *
   * The preset that takes a list with no part ticked is a reading nobody can make. The page does
   * not ask the server a question whose answer it already holds: `whyTheseSlotsCannotBeUsed` is the
   * one place that refusal is written, and this draws it. The record-scope case is said by the
   * `Absence` already in the subject fieldset, so it is null here.
   */
  const whyThisCannotBeRead: string | null =
    subject.kind === 'record' && subject.id === ''
      ? null
      : whyTheseSlotsCannotBeUsed(preset, preset === 'custom' ? chosen : undefined)
  /**
   * THE CHOSEN PRESET'S DECLARATION, read through the shape every preset satisfies.
   *
   * `BUNDLE_PRESETS` is `as const`, so reading a field straight off it reads a union of seven
   * literal shapes, and one of them declares no line to draw under the menu. This says once that
   * what is being read is a preset, so the optional field is optional here too.
   */
  const chosenPreset: BundlePresetSpec = BUNDLE_PRESETS[preset]

  /**
   * THE RECORD SEARCH, debounced, and asked of the server rather than of what is already here.
   * `RecordsPage` makes the same call for the same reason: a title-and-summary filter in the
   * browser misses the records whose subject is in the body, which is most of them.
   */
  /**
   * THE PARTS THIS COPY WILL ACTUALLY CARRY. One expression, read by the control below and by both
   * requests, so what the page draws and what it sends cannot disagree about which parts are in.
   */
  const partsNow: readonly ScopeName[] = preset === 'custom' ? chosen : BUNDLE_PRESETS[preset].slots

  /**
   * THE MODULES AND PIPELINES OF THIS PROJECT, for the control that names which of them go in.
   *
   * ASKED OF THE SERVER, not filtered out of something already here: the page holds no list of
   * records, and the part itself lists them the same way — `listRecords` for the two kinds.
   */
  const theStructure = useProjectAsync(
    async () => (await api.bundleStructure(theProject)).map((one) => ({ id: one.id, title: one.title, kind: one.kind })),
    [theProject],
  )[0]

  const [asked, setAsked] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setAsked(query.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])
  // THE SECOND SEARCH IS ITS OWN SEARCH. It answers a different question — which records to ADD —
  // and sharing one box would make choosing a subject and adding a record the same act.
  const [adding, setAdding] = useState('')
  const [askedToAdd, setAskedToAdd] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setAskedToAdd(adding.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [adding])
  const [addHits] = useProjectAsync(
    async () =>
      askedToAdd === ''
        ? []
        : // A RECORD ADDED BY HAND MUST BE IN THE PROJECT THE COPY IS ABOUT, so this search reads that one.
          (await api.recordsSaying(askedToAdd, theProject, 8)).records,
    [askedToAdd, theProject],
  )
  const [hits] = useProjectAsync(
    async () =>
      asked === ''
        ? []
        : // THE RECORD A COPY IS ABOUT may be in any project chosen above, and its project becomes the copy's.
          (await api.recordsSaying(asked, choice, 8)).records,
    [asked, choice],
  )

  /**
   * WHAT THE BUNDLE WOULD BE CALLED, shown in the box rather than filled in behind the person.
   *
   * A default nobody can see is the silent substitution this product is written against; a default
   * sitting in an input, editable, is a suggestion. `typedName` is null until somebody types, and
   * only then does the box stop following the choices above it.
   */
  const suggestedName =
    subject.kind === 'project'
      ? t('g7a.bundles.projectName', { preset: BUNDLE_PRESETS[preset].word, project: titles.get(theProject) ?? theProject })
      : t('g7a.bundles.recordName', { preset: BUNDLE_PRESETS[preset].word, title: subject.title })
  const name = typedName ?? suggestedName

  /**
   * READ WHAT AN ARRIVING AGENT IS TOLD. It writes nothing and it changes nothing.
   *
   * THE WHOLE REPLY IS KEPT AND DRAWN. A view that showed a chosen few of its fields would be this
   * page's own opinion about what matters in the brief, which is the thing a person opening this
   * panel is trying to check for themselves.
   */
  const readTheBrief = async (): Promise<void> => {
    setFault(null)
    try {
      const project = theProject
      const whole = (await api.brief(project)) as Omit<TheBrief, 'whole' | 'project'>
      setBrief({ ...whole, whole, project })
    } catch (err) {
      setFault(err instanceof Error ? err.message : String(err))
    }
  }

  /**
   * WHAT THIS PAGE IS ASKING FOR, AS ONE VALUE. Written once and read three times: by the preview,
   * by the address of the plain-text page, and by nothing else.
   *
   * IT IS THE SAME QUESTION OR IT IS A DIFFERENT COPY. The plain-text page a person opens has to be
   * the copy they are looking at, and two expressions of the same question are two chances for it
   * not to be. Criterion B29, and the ninth invariant. The filing calls take the same choices in a
   * different shape — the record's own fields — and that shape is the server's, not this one.
   */
  const askedWith = (at: { subject: Subject; preset: BundlePreset; moved: number }): BundleAsked => {
    const named = namedFor(projectOf(at.subject))
    const extra = addedFor(projectOf(at.subject))
    return {
    preset: at.preset,
    ...(at.preset === 'custom' ? { slots: chosen } : {}),
    ...(at.subject.kind === 'record' ? { scope: at.subject.id } : {}),
    // NULL IS "ALL OF THEM" AND SENDS NOTHING. See `namedStructure` above.
    ...(named === null ? {} : { modulesAndPipelines: named }),
    ...(extra.length === 0 ? {} : { additionalRecords: extra.map((one) => one.id) }),
    // ZERO IS ABSENCE AND SENDS NOTHING, so an address for a copy nobody moved is the address it
    // was before criterion B31, and a stored bundle nobody moved holds no offset to read back.
    ...(at.moved === 0 ? {} : { shift: at.moved }),
    }
  }
  const askedAt = (moved: number): BundleAsked => askedWith({ subject, preset, moved })
  const whatToCopy: BundleAsked = askedAt(shift)

  /**
   * THE FOUR WAYS OUT OF THIS COPY BESIDE THE CLIPBOARD, ready before anybody presses anything.
   *
   * The second criterion of bundle-5, on problem `SSo-90ct3Kqj`: a person reaches the page of plain
   * text and the text box without first making a copy fail. So this block is built from the copy on
   * the screen, and a press that could not copy only adds the sentence saying so.
   *
   * NULL UNTIL THERE IS A COPY. There is nothing to take another way before one has been read, and
   * the address of the plain-text page is built from the same question the copy was.
   */
  const theWaysOut: WaysOut | null =
    preview === null
      ? null
      : couldNotCopy !== null && couldNotCopy.where === 'preview'
        ? couldNotCopy
        : {
            where: 'preview',
            because: null,
            text: preview.text,
            fileName: aFileNameFor(name),
            alreadyOnScreen: THE_TEXT_ON_SCREEN,
            address: api.bundleTextAddress(whatToCopy, theProject),
          }


  /**
   * READ THE COPY. Criterion B31 gave this an argument: the offset to read it at. Criterion B33 gave
   * it a second: the subject and preset to read, when this press is the one that chose them.
   *
   * THE OFFSET IS PASSED AND NOT READ FROM THE STATE, because less and more both set the state and
   * read in one press, and a state set in this tick is not the state this tick reads. Passing it is
   * what makes the size on the screen the size of the press that was just made. The subject and the
   * preset are passed for the same reason: a record chosen from the search is read in the press
   * that chose it, before `subject` state has moved.
   *
   * NOTHING IS ASKED FOR A READING THAT CANNOT BE MADE. Criterion B33: a record scope with no
   * record, and the list preset with no part ticked, are answered by the page rather than by the
   * server, and the reading on the screen is cleared so it cannot describe a question the controls
   * no longer ask.
   *
   * IT IS CLAMPED HERE AS WELL AS ON THE SERVER, and both are right: the server clamps because a
   * request may come from anywhere, and the page clamps so that pressing less five times and then
   * more once moves the levels up, rather than working off a number no part ever used.
   */
  const look = async (
    moveTo = shift,
    next?: { subject?: Subject; preset?: BundlePreset },
  ): Promise<string | null> => {
    const movedTo = Math.max(-(BUNDLE_RUNGS.length - 1), Math.min(BUNDLE_RUNGS.length - 1, moveTo))
    const about = next?.subject ?? subject
    const as =
      next?.preset ?? (next?.subject === undefined ? preset : presetForSubject(next.subject))
    setFault(null)
    setSaid(null)
    // CLEARED BEFORE THE REQUEST, so the reading on screen is never the answer to a question the
    // controls no longer ask while the new one is on its way. This also makes every answer still on
    // its way an old one, which is not drawn when it arrives.
    clearTheReading()
    const mine = lastQuestion.current
    if (!canRead(as, about)) return null
    setShift(movedTo)
    try {
      const answer = (await api.bundlePreview(askedWith({ subject: about, preset: as, moved: movedTo }), projectOf(about))) as Preview
      // THE TEXT IS HANDED BACK ONLY WHEN IT IS THE ONE DRAWN, so the press that copies after a read
      // copies exactly what the preview shows and never an answer the page threw away.
      if (mine !== lastQuestion.current) return null
      setPreview(answer)
      return answer.text
    } catch (err) {
      if (mine === lastQuestion.current) setFault(err instanceof Error ? err.message : String(err))
      return null
    }
  }

  /**
   * FILE THE BUNDLE. THIS IS THE ACT THE PAGE DID NOT HAVE.
   *
   * FILING IS NOT EXPORTING, and the sentence it answers with says so, because the two being
   * confused is the failure the whole kind is shaped around: a bundle holds no content and nothing
   * has left the building until somebody presses `Copy it`. Nothing here sends `exports` — the
   * server writes those, and would refuse this request if it carried one.
   */
  const file = async (): Promise<void> => {
    setFault(null)
    setSaid(null)
    setFiling(true)
    try {
      const filed = await api.fileBundle({
        title: name.trim(),
        scope: subject.kind,
        ...(subject.kind === 'record' ? { scopeRecordId: subject.id } : {}),
        preset,
        ...(preset === 'custom' ? { slots: chosen } : {}),
        ...(namedHere === null ? {} : { modulesAndPipelines: namedHere }),
        ...(addedHere.length === 0 ? {} : { additionalRecords: addedHere.map((one) => one.id) }),
        ...(shift === 0 ? {} : { shift }),
      }, theProject)
      setSaid({
        // THE PRESS WAS THE ONE IN THE CHOOSER, so the answer belongs under that one and not under
        // the copy further down. Criterion three of bundle-5.
        where: 'filing',
        // NO BACKTICKS IN A SENTENCE A PERSON READS. This said "`Copy it` is the act" and the marks
        // were drawn literally, on the phone shot, in the middle of a plain sentence. Code notation
        // in prose is the seventh rule broken by the sentence that announces the act.
        text: t('bundlesPage.keptSaid', { title: filed.record.title }),
      })
      setTypedName(null)
      again()
    } catch (err) {
      setFault(err instanceof Error ? err.message : String(err))
    } finally {
      setFiling(false)
    }
  }

  /**
   * COPY THE BUNDLE: THE PAGE'S ONE PRIMARY PRESS. It puts on the clipboard exactly the text the
   * preview shows, and records nothing.
   *
   * WHEN NO COPY HAS BEEN READ YET, THE SAME PRESS READS IT FIRST. The text is then drawn in the
   * preview and the same text is copied, so what was copied is always on the screen to check.
   * Nothing is written and nothing claims an export happened: the press says Copied, and nothing
   * was recorded, on its own face.
   *
   * A BROWSER WITH NO CLIPBOARD IS ANSWERED UNDER THIS PRESS, in one line, and the preview's own
   * block offers the text the other ways with the clipboard's reason. Criterion B28.
   */
  const copyTheBundle = async (): Promise<void> => {
    setFault(null)
    setSaid(null)
    setCouldNotCopy(null)
    setCopyRefused(false)
    setCopying(true)
    try {
      const text = preview === null ? await look() : preview.text
      if (text === null) return
      const put = await putOnTheClipboard(text)
      if (put.wrote) {
        setCopied(true)
        setTimeout(() => setCopied(false), 4000)
        return
      }
      setCopyRefused(true)
      setCouldNotCopy({
        where: 'preview',
        because: put.because,
        text,
        fileName: aFileNameFor(name),
        // THE TEXT IS ALREADY IN THE PREVIEW, so the block points at it rather than drawing a
        // second copy of a text that can be forty thousand characters long.
        alreadyOnScreen: THE_TEXT_ON_SCREEN,
        // THE PAGE OF PLAIN TEXT FOR EXACTLY THIS QUESTION. Criterion B29.
        address: api.bundleTextAddress(whatToCopy, theProject),
      })
    } finally {
      setCopying(false)
    }
  }

  /**
   * ONE PRESS: FILE THIS READING AND HAND IT OVER.
   *
   * THE OWNER'S OWN SENTENCE IS WHAT THIS IS FOR. They should not have to open the waiting-on-you
   * items one at a time and copy them to another agent by hand. Before this the shortest route from
   * a reading to a clipboard was: press File this bundle, find the row it made in the list below,
   * press Copy it. Three presses and a hunt, for a thing whose whole purpose is being copied.
   *
   * IT IS THE SAME TWO ACTS AND NOT A THIRD ONE. Filing writes the recipe; exporting is what
   * records that text left the building. Neither is skipped, so the export ledger says exactly what
   * it said before, and the sentence the person reads is the export's own.
   */
  const fileAndHand = async (): Promise<void> => {
    setFault(null)
    setSaid(null)
    setFiling(true)
    try {
      const filed = await api.fileBundle({
        title: name.trim(),
        scope: subject.kind,
        ...(subject.kind === 'record' ? { scopeRecordId: subject.id } : {}),
        preset,
        ...(preset === 'custom' ? { slots: chosen } : {}),
        ...(namedHere === null ? {} : { modulesAndPipelines: namedHere }),
        ...(addedHere.length === 0 ? {} : { additionalRecords: addedHere.map((one) => one.id) }),
        ...(shift === 0 ? {} : { shift }),
      }, theProject)
      setTypedName(null)
      // THE PRESS WAS ON THE COPY, so the answer belongs under the copy's own two buttons and not
      // beside a row in a list further down that this press has just made.
      await hand(filed.record.id, 'preview', filed.record.title, theProject, theFilesAnswer('preview'))
    } catch (err) {
      setFault(err instanceof Error ? err.message : String(err))
    } finally {
      setFiling(false)
    }
  }

  /**
   * EXPORT A FILED BUNDLE AND HAND THE TEXT OVER.
   *
   * THE EXPORT IS RECORDED WHETHER OR NOT THE CLIPBOARD TAKES IT, and that order is the point: the
   * server writes the export first, and only then does this browser try to copy. Criterion B28.
   *
   * @param where `preview` when the press was on the copy, or this bundle's own id when it was on
   *   the row. It decides where the answer is drawn, and nothing else.
   * @param keptIn the project the bundle is kept in, which is where its copy is read.
   * @param withFiles whether the related files go too. False is the text answer the press gave
   *   before the choice existed, and it is the default on every press.
   */
  const hand = async (bundleId: string, where: string, title: string, keptIn: string, withFiles: boolean): Promise<void> => {
    setFault(null)
    setSaid(null)
    setCouldNotCopy(null)
    setCopyRefused(false)
    try {
      const done = await api.exportBundle(bundleId, keptIn, withFiles)
      if (done.kind === 'zip') {
        // THE ZIP'S NAME IS THE SERVER'S OWN RULE, from the title and the export number the entry
        // recorded. `exportFileName` is the one function the server names it by, so the download
        // cannot be called something the entry does not say.
        const fileName = exportFileName(done.title, done.n)
        const handed = handTheZipToTheBrowserAsAFile(done.bytes, fileName)
        // THE COUNTS ARE TRUE WHEN THE ZIP WAS MADE, but the row naming the file is true only when
        // the browser took it. A browser that will not take one hears its refusal alone.
        setSaid(handed.handed ? { where, text: theFileCountsSaid(done), file: fileName } : { where, text: handed.said })
        forgetTheFilesAnswer(where)
        again()
        return
      }
      // A PRESS ON THE COPY PUTS THE EXPORTED TEXT ON THE SCREEN; a press on a row has no copy on
      // the screen to put it in. Which of the two happened is what `alreadyOnScreen` says below.
      const shown = where === 'preview' && preview !== null
      if (shown) setPreview((p) => (p === null ? p : { ...p, text: done.text }))
      // THE CLIPBOARD IS NOT THE RECORD. The export is written by the server whether or not this
      // browser has a clipboard at all, and what is said next says which of the two happened.
      const put = await putOnTheClipboard(done.text)
      // AND ITS SIZE, from the text that was actually handed over rather than from the copy the
      // screen was showing before the press. Criterion three of bundle-5, beside B31's own size.
      const howBig = t('g7a.bundles.characters', { n: done.text.length })
      if (put.wrote) {
        setSaid({
          where,
          text: t('g7a.bundles.copiedSaid', { n: done.export.n, size: howBig }),
        })
      } else {
        setSaid({
          where,
          text: t('g7a.bundles.savedSaid', { n: done.export.n, size: howBig }),
        })
        setCouldNotCopy({
          where,
          because: put.because,
          text: done.text,
          fileName: aFileNameFor(title),
          alreadyOnScreen: shown ? THE_TEXT_ON_SCREEN : null,
          // THE FILED BUNDLE'S OWN PAGE. It names no project: the bundle is a record and the server
          // reads the project off the record, which is stricter than trusting a link. Criterion B29.
          address: api.filedBundleTextAddress(bundleId),
        })
      }
      forgetTheFilesAnswer(where)
      again()
    } catch (err) {
      setFault(err instanceof Error ? err.message : String(err))
    }
  }

  /**
   * THE TWO ANSWERS AN EXPORT PRESS OFFERS, in plain words and under the press they belong to.
   *
   * A native fieldset, so the two answers are one question to a screen reader and the arrow keys
   * move between them. The text answer is checked until the person chooses the files, which is what
   * keeps a press behaving as it always did for anybody who does not choose.
   */
  const theFilesQuestion = (where: string) => (
    <fieldset className="bx-files">
      <legend className="bx-files-q">{t('zipExport.question')}</legend>
      <label className="bx-files-answer">
        <input
          type="radio"
          name={`bx-files-${where}`}
          checked={!theFilesAnswer(where)}
          onChange={() => chooseTheFilesAnswer(where, false)}
        />
        <span>{t('zipExport.textOnly')}</span>
      </label>
      <label className="bx-files-answer">
        <input
          type="radio"
          name={`bx-files-${where}`}
          checked={theFilesAnswer(where)}
          onChange={() => chooseTheFilesAnswer(where, true)}
        />
        <span>{t('zipExport.textAndFiles')}</span>
      </label>
    </fieldset>
  )

  /** Why the primary press cannot copy now, or null when it can. The same two reasons the form draws. */
  const whyNoCopy: string | null = canRead(preset, subject)
    ? null
    : (whyThisCannotBeRead ?? t('g7a.bundles.chooseSubject'))

  return (
    <div className="px-page bxp">
      <style href="mole-office-bundles" precedence="default">{BUNDLES_CSS}</style>
      {/* ---- THE PAGE HEAD: the title and its one line, and the page's one primary press at the
              right of the title (report n9Mjk3c_sJRu block b-3, rule R5). On a phone the press
              takes the full width under the head. */}
      <header className="bxp-head">
        <div className="bxp-headwords">
          <h1 data-title-is="its-label">{t('nav.bundles')}</h1>
        </div>
        <div className="bxp-primary">
          <Btn
            variant="primary"
            pending={copying}
            disabled={whyNoCopy !== null}
            {...(whyNoCopy === null ? {} : { reason: whyNoCopy })}
            onClick={() => void copyTheBundle()}
          >
            {copied ? t('g7a.bundles.copied') : t('bundlesPage.copy')}
          </Btn>
          {/* WHAT THIS PRESS CAME TO WHEN THE CLIPBOARD REFUSED, under this press. The reason and
              the other ways out stand in the preview, beside the text they hand over. */}
          {copyRefused ? <p className="bxp-notcopied" role="status">{t('bundlesPage.notCopied')}</p> : null}
          {/* WHICH PROJECT THIS PRESS COPIES, under it, once there is something it can copy. */}
          {whyNoCopy === null ? (
            <p className="bxp-about-project">
              {t('bundlesPage.aboutProject', { project: titles.get(theProject) ?? theProject })}
            </p>
          ) : null}
        </div>
      </header>
      {/* ---- THE ONE CHOICE OF PROJECT: the kept bundles and the search for One
              record read the projects chosen here, and a whole-project copy is about the one chosen. */}
      <div className="bxp-choice">
        <ProjectChoiceControl
          choice={choice}
          onChoose={(next) => {
            setChoice(next)
            // EVERY PROJECT KEEPS THE COPY ABOUT THE PROJECT IT WAS ABOUT, so widening the lists never
            // moves the copy to another project without a press on the About row.
            if (next === EVERY_PROJECT) setAboutWhenEvery(wholeProject)
            // A WHOLE-PROJECT COPY FOLLOWS A CHOICE OF ONE PROJECT, so the reading on screen and the
            // lists made for the old project no longer apply.
            if (next !== EVERY_PROJECT && subject.kind === 'project' && next !== wholeProject) {
              theProjectMoved(next)
              clearTheReading()
              setFault(null)
            }
          }}
          titles={titles}
        />
      </div>

      {/* ---- THE FORM AND THE PREVIEW, SIDE BY SIDE WHEN THE PAGE IS WIDE, and the preview under
              the form when it is not. The width is used side by side. */}
      <div className="bxp-work">
        {/* ---- THE FORM. Three labelled rows, About, For and Detail, drawn the way Settings draws a
                labelled row: the name at the left and its controls beside it. The name to keep it by
                and the Keep it for later press stand at its foot.

                NO HEADING OVER IT. Criterion B27: the page opens on the controls, and the region's
                name is on aria-label only, so pointing at it still says what it is. */}
        <section
          className="bx-new bxp-form"
          aria-label={surfaceWord('bundles.make')}
          {...declaredAttributes({ surface: 'bundles.make' })}
        >
          {/* ---- ABOUT: the whole project or one record, and the records added by hand. */}
          <div className="bxp-row" role="group" aria-labelledby="bxp-about">
            <span className="bxp-label" id="bxp-about">{t('g7a.bundles.about')}</span>
            <div className="bxp-controls">
              <label className="bx-radio">
                <input
                  type="radio"
                  name="bx-subject"
                  checked={subject.kind === 'project'}
                  onChange={() => {
                    // THE READING ON THE SCREEN ANSWERS THE QUESTION THE CONTROLS ASKED, and that
                    // question just changed. It is cleared rather than left under new controls.
                    setSubject({ kind: 'project' })
                    clearTheReading()
                    setFault(null)
                  }}
                />
                <span>{t('g7a.bundles.wholeProject')}</span>
              </label>
              {/* WHICH PROJECT A WHOLE-PROJECT COPY IS ABOUT, always said. With one project chosen at
                  the head it is that project; with Every project, it is chosen here. */}
              {subject.kind !== 'project' ? null : choice === EVERY_PROJECT ? (
                <select
                  className="bxp-select bxp-which"
                  aria-label={t('bundlesPage.whichProject')}
                  value={aboutWhenEvery}
                  onChange={(e) => {
                    setAboutWhenEvery(e.target.value)
                    theProjectMoved(e.target.value)
                    clearTheReading()
                    setFault(null)
                  }}
                >
                  {(titles.has(aboutWhenEvery) ? [...titles.keys()] : [aboutWhenEvery, ...titles.keys()]).map((id) => (
                    <option key={id} value={id}>{titles.get(id) ?? id}</option>
                  ))}
                </select>
              ) : (
                <span className="bxp-which">
                  <ProjectName id={wholeProject} titles={titles} />
                </span>
              )}
              <label className="bx-radio">
                <input
                  type="radio"
                  name="bx-subject"
                  checked={subject.kind === 'record'}
                  onChange={() => {
                    setSubject((s) => (s.kind === 'record' ? s : { kind: 'record', id: '', title: '', recordKind: '', workspaceId: '' }))
                    clearTheReading()
                    setFault(null)
                  }}
                />
                <span>{t('g7a.bundles.oneRecord')}</span>
              </label>

              {subject.kind === 'record' ? (
                <div className="bx-find">
                  <label className="bx-choose" htmlFor="bx-find">
                    {/* A NAME. Criterion B24. */}
                    <span>{t('g7a.bundles.record')}</span>
                  </label>
                  <input
                    id="bx-find"
                    type="search"
                    className="bx-search"
                    value={query}
                    placeholder={t('g7a.bundles.search')}
                    aria-label={t('g7a.bundles.findSubject')}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {subject.id === '' ? (
                    // AT THE TIER THAT SAYS A READER HAS TO DO SOMETHING: every press that reads,
                    // copies or keeps is off until a record is chosen, so this names the way on.
                    <Absence
                      tier="must-act-on"
                      sentence={t('g7a.bundles.chooseSubject')}
                      action={t('g7a.bundles.chooseSubjectAction')}
                    />
                  ) : (
                    <p className="bx-chosen">
                      {t('g7a.bundles.aboutRecord', { title: subject.title, kind: kindWord(subject.recordKind, mode).text })}
                      {' · '}
                      <ProjectName id={subject.workspaceId} titles={titles} />
                    </p>
                  )}
                  {hits.status !== 'ready' || asked === '' ? null : hits.value.length === 0 ? (
                    // SOMEBODY LOOKED AND THERE IS NONE: a search that found nothing and a search
                    // that never ran must never read the same.
                    <p className="bx-need">
                      <Absence />
                    </p>
                  ) : (
                    <ul className="bx-hits">
                      {hits.value.map((r) => (
                        <li key={r.id}>
                          <button
                            type="button"
                            className="bx-hit"
                            onClick={() => {
                              // CHOOSING THE RECORD IS THE PRESS THAT READS IT. Criterion B33: the
                              // subject is passed rather than read from state, which has not moved
                              // yet in this tick.
                              const next: Subject = {
                                kind: 'record',
                                id: r.id,
                                title: r.title,
                                recordKind: r.kind,
                                workspaceId: r.workspaceId,
                              }
                              setSubject(next)
                              theProjectMoved(r.workspaceId)
                              setFault(null)
                              void look(shift, { subject: next })
                            }}
                          >
                            <span className="bx-hit-title">{r.title}</span>
                            <span className="bx-hit-kind">{kindWord(r.kind, mode).text}</span>
                            <ProjectName id={r.workspaceId} titles={titles} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}

              {/* THE RECORDS SOMEBODY ADDED BY HAND, on top of what the subject carries. Criterion
                  B8. Its own class, not the parts' one: a test finds the modules and pipelines as the
                  second parts group on the page, and a third would move what it reads. */}
              <fieldset className="bx-addbox">
                {/* A NAME. Criterion B24. */}
                <legend>{SCOPES.additionalRecords.label}</legend>
                <p className="bx-part-says">
                  {addedHere.length === 0
                    ? <Absence />
                    : t('g7a.bundles.addedCount', { n: addedHere.length })}
                </p>
                {addedHere.map((one) => (
                  <p key={one.id} className="bx-added">
                    <strong>{one.title}</strong> <span className="bx-part-says">{kindWord(one.kind, mode).text}</span>{' '}
                    <ProjectName id={one.workspaceId} titles={titles} />
                    <button
                      type="button"
                      className="bx-drop"
                      onClick={() => setAdded((was) => was.filter((other) => other.id !== one.id))}
                    >
                      {t('g7a.bundles.takeOut')}</button>
                  </p>
                ))}
                <label className="bx-choose" htmlFor="bx-add">
                  {/* A NAME. Criterion B24. */}
                  <span>{t('g7a.bundles.add')}</span>
                </label>
                <input
                  id="bx-add"
                  type="search"
                  className="bx-search"
                  value={adding}
                  placeholder={t('g7a.bundles.search')}
                  aria-label={t('g7a.bundles.findAdd')}
                  onChange={(e) => setAdding(e.target.value)}
                />
                {addHits.status !== 'ready' || askedToAdd === '' ? null : addHits.value.length === 0 ? (
                  <p className="bx-need">
                    <Absence />
                  </p>
                ) : (
                  <ul className="bx-hits">
                    {addHits.value.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          className="bx-hit"
                          onClick={() =>
                            setAdded((was) =>
                              was.some((one) => one.id === r.id)
                                ? was
                                : [...was, { id: r.id, title: r.title, kind: r.kind, workspaceId: r.workspaceId }],
                            )
                          }
                        >
                          <span className="bx-hit-title">{r.title}</span>
                          <span className="bx-hit-kind">{kindWord(r.kind, mode).text}</span>
                          <ProjectName id={r.workspaceId} titles={titles} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </fieldset>
            </div>
          </div>

          {/* ---- FOR: what the copy is for. offered is presetsFor(the subject's own kind), which is
                  what makes three of the six presets reachable at all. Choosing one reads it
                  (criterion B33); the line under the menu says what it is for. */}
          <div className="bxp-row">
            <label className="bxp-label bx-choose" htmlFor="bx-preset"><span>{t('bundlesPage.for')}</span></label>
            <div className="bxp-controls">
              <select
                id="bx-preset"
                className="bxp-select"
                aria-label={t('g7a.bundles.purpose')}
                value={preset}
                onChange={(e) => {
                  // CHOOSING A READING SHOWS IT. Criterion B33. The new preset is passed rather than
                  // read from state, which has not moved yet in this tick.
                  const next = e.target.value as BundlePreset
                  setWanted(next)
                  void look(shift, { preset: next })
                }}
              >
                {offered.map((one) => (
                  <option key={one} value={one}>
                    {BUNDLE_PRESETS[one].word}
                  </option>
                ))}
              </select>
              {/* THE LINE UNDER THE MENU, AND ONLY WHERE THE PRESET DECLARES ONE. The list preset
                  declares none, because the boxes it draws underneath are the answer. B24. */}
              {chosenPreset.forWhat === undefined ? null : <p className="bx-forwhat">{chosenPreset.forWhat}</p>}
              {/* WHAT IS STILL NEEDED WHEN THE CHOICES CANNOT BE READ, in the words the shared
                  refusal already holds. The record-scope case is said in the About row. B33. */}
              {whyThisCannotBeRead === null ? null : (
                <p className="bx-need">
                  <Absence tier="must-act-on" sentence={whyThisCannotBeRead} />
                </p>
              )}

              {/* WHICH PARTS, drawn only for the preset that takes a list: every other preset IS
                  its list, and the server refuses a list sent with any other preset. */}
              {preset === 'custom' ? (
                <fieldset className="bx-parts">
                  {/* A NAME. Criterion B24. */}
                  <legend>{t('g7a.bundles.parts')}</legend>
                  {SCOPE_NAMES.map((one) => (
                    <label key={one} className="bx-part">
                      <input
                        type="checkbox"
                        checked={chosen.includes(one)}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...chosen, one]
                            : chosen.filter((other) => other !== one)
                          setChosen(next)
                          // THE LAST PART UNTICKED MAKES THE CHOICES UNREADABLE, so the reading on
                          // the screen is cleared rather than left under controls that no longer
                          // ask the question it answers. Criterion B33.
                          if (preset === 'custom' && next.length === 0) {
                            clearTheReading()
                            setFault(null)
                          }
                        }}
                      />
                      <span className="bx-part-words">
                        <strong>{SCOPES[one].label}</strong>
                        <span className="bx-part-says">{SCOPES[one].says}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              ) : null}

              {/* WHICH MODULES AND PIPELINES, drawn only when this copy carries the part that draws
                  them, because a list sent to a copy without it is refused rather than ignored.

                  ALL OF THEM IS THE STATE IT OPENS IN, a state a person can see. Unticking the last
                  one goes back to all of them, because a copy carrying none is refused and a
                  control that can only reach a refusal is a trap. Criterion B6. */}
              {partsNow.includes('structure') ? (
                <fieldset className="bx-parts">
                  {/* THE PART'S OWN NAME, and nothing added to it. Criterion B24. */}
                  <legend>{SCOPES.structure.label}</legend>
                  {theStructure.status !== 'ready' ? (
                    <Loading what={t('g7a.bundles.loadingStructure')} />
                  ) : theStructure.value.length === 0 ? (
                    <p className="bx-part-says">
                      <Absence />
                    </p>
                  ) : (
                    <>
                      <p className="bx-part-says">
                        {namedHere === null
                          ? t('bundles.allGoIn', { n: theStructure.value.length })
                          : t('g7a.bundles.someStructure', { n: namedHere.length, total: theStructure.value.length })}
                      </p>
                      {theStructure.value.map((one) => (
                        <label key={one.id} className="bx-part">
                          <input
                            type="checkbox"
                            checked={namedHere === null || namedHere.includes(one.id)}
                            onChange={(e) =>
                              setNamedStructure(() => {
                                const from = namedHere ?? theStructure.value.map((r) => r.id)
                                const next = e.target.checked
                                  ? [...from, one.id]
                                  : from.filter((other) => other !== one.id)
                                // EMPTY GOES BACK TO ALL OF THEM. See the note above the fieldset.
                                return next.length === 0 || next.length === theStructure.value.length
                                  ? null
                                  : { workspaceId: theProject, ids: next }
                              })
                            }
                          />
                          <span className="bx-part-words">
                            <strong>{one.title}</strong>
                            <span className="bx-part-says">{kindWord(one.kind, mode).text}</span>
                          </span>
                        </label>
                      ))}
                    </>
                  )}
                </fieldset>
              ) : null}
            </div>
          </div>

          {/* ---- DETAIL: less and more move every part one rung from the level its own share of the
                  size chose (criterion B31, decision JPDu6lJcizw0). Each press reads the copy
                  again, because the number that answers what the press did is the size. */}
          <div className="bxp-row" role="group" aria-labelledby="bxp-detail">
            <span className="bxp-label" id="bxp-detail">{t('g7a.bundles.detail')}</span>
            <div className="bxp-controls">
              <div className="bx-make">
                <button
                  id="bx-less"
                  type="button"
                  className="bx-look"
                  disabled={!canRead(preset, subject)}
                  onClick={() => void look(shift - 1)}
                >
                  {t('g7a.bundles.less')}</button>
                {/* MORE STOPS AT THE HIGHEST RUNG ANYTHING IN THE COPY IS REALLY WRITTEN AT.
                    Criterion B32. Before a copy is read there is nothing to stop at. */}
                <button
                  id="bx-more"
                  type="button"
                  className="bx-look"
                  disabled={!canRead(preset, subject) || atTheTop}
                  onClick={() => void look(shift + 1)}
                >
                  {t('g7a.bundles.more')}</button>
                <span className="bx-part-says" id="bx-shift">
                  {howFarFromTheAutomaticLevel(shift)}
                </span>
              </div>
              {/* THE SCALE, IN NUMBERS, UNDER THE TWO PRESSES. Criterion B34. The size comes from
                  sizeInWords, which the preview's size line draws through as well, and the level
                  counts from partsAtTheirTop. Nothing is drawn before a reading. */}
              {preview === null || againstTops === null ? null : (
                <span className="bx-scale" id="bx-scale">
                  <span id="bx-scale-size">{sizeInWords(preview)}</span>
                  {againstTops.atTop + againstTops.below === 0 ? null : (
                    <span id="bx-scale-levels">
                      {t('g7a.bundles.tops', { top: againstTops.atTop, total: againstTops.atTop + againstTops.below, below: againstTops.below })}
                    </span>
                  )}
                </span>
              )}
              {/* WHERE THE LADDER STOPS, AND WHY, so a disabled press is never a mystery. looked:
                  Mole Office read every record in this copy and found no level above this one. */}
              {preview === null || preview.top === null ? null : (
                <span className="bx-part-says" id="bx-top">
                  {t('g7a.bundles.writtenTop', { level: levelWord(preview.top) })}
                  {atTheTop ? (
                    <>
                      {' '}
                      <Absence
                        tier="told-apart"
                        looked
                        word={t('g7a.bundles.top')}
                        title={t('g7a.bundles.topHint')}
                      />
                    </>
                  ) : null}
                </span>
              )}
            </div>
          </div>

          {/* ---- KEEP IT FOR LATER, at the form's foot: the name it is kept by, and the press that
                  files it. It files the choices, not the text. */}
          <div className="bxp-row bxp-keep">
            <label className="bxp-label bx-choose" htmlFor="bx-name"><span>{t('g7a.bundles.name')}</span></label>
            <div className="bxp-controls">
              <div className="bx-file">
                <input
                  id="bx-name"
                  className="bx-name"
                  value={name}
                  aria-label={t('g7a.bundles.nameHint')}
                  onChange={(e) => setTypedName(e.target.value)}
                />
                <button
                  type="button"
                  className="bx-look"
                  disabled={filing || name.trim() === '' || !canRead(preset, subject)}
                  onClick={() => void file()}
                >
                  {filing ? t('bundlesPage.keeping') : t('g7a.bundles.file')}
                </button>
              </div>
              {/* WHAT THIS PRESS CAME TO, UNDER THIS PRESS. The third criterion of bundle-5. */}
              {said === null || said.where !== 'filing' ? null : <p className="bx-said">{said.text}</p>}
            </div>
          </div>
        </section>

        {/* ---- THE PREVIEW: what would be copied. Its one control is the press that reads it, at
                its heading. Nothing is read until a press asks (criterion B33), and until then the
                section holds the short mark. */}
        <section className="bxp-preview" {...declaredAttributes({ surface: 'bundles.reads' })}>
          <h2 className="bxp-h">
            <span data-title-is="its-label" {...DRAWS_THE_NAME}>{t('bundlesPage.preview')}</span>
            <button
              id="bx-read"
              type="button"
              className="bx-look"
              disabled={!canRead(preset, subject)}
              onClick={() => void look()}
            >
              {t('g7a.bundles.read')}</button>
          </h2>
          {fault === null ? null : <ErrorNote message={fault} fault={null} label={t('g7a.bundles.failed')} />}
          {preview === null ? (
            <p className="bxp-none">
              <Absence title={t('bundlesPage.notRead')} />
            </p>
          ) : (
            <>
              {/* WHICH PROJECT THIS COPY IS ABOUT, first, because a copy is always of one project. */}
              <p className="bxp-about-project">
                {t('bundlesPage.aboutProject', { project: titles.get(theProject) ?? theProject })}
              </p>
              {/* THE LIMITS FIRST, AND ON THEIR OWN. A person about to paste this somewhere is the
                  last reader who can notice that a temporary value is leaving with it. */}
              {preview.restrictions.length === 0 ? (
                // looked: nothing is limited, which is not the same answer as nobody checked.
                <p className="bx-clean">
                  <Absence
                    tier="told-apart"
                    looked
                    word={t('g7a.bundles.noLimits')}
                    title={t('g7a.bundles.noLimitsHint')}
                  />
                </p>
              ) : (
                <p className="bx-limits" role="note">
                  <strong>{t('g7a.bundles.limitCount', { n: preview.restrictions.length })}</strong> {t('g7a.bundles.limitsMeaning')}
                </p>
              )}
              {preview.couldNotCheck.length === 0 ? null : (
                <p className="bx-refused" role="alert">{t('g7a.bundles.cannotCheck', { n: preview.couldNotCheck.length })}</p>
              )}
              <p className="bx-size">
                {t('g7a.bundles.previewSize', { size: sizeInWords(preview), tokens: preview.tokensEstimated, n: preview.carried.length })}{' '}
                {t(preview.fits ? 'g7a.bundles.fits' : 'g7a.bundles.over')}
              </p>
              {/* HOW MANY WERE DRAWN SHORTER THAN ASKED. Criterion B11: the person choosing the level
                  needs to know the level did not happen for most of what they hand over. */}
              <p className="bx-shorter">{preview.drawnShorter.count === 0 ? t('g7a.bundles.allAtLevel', { level: levelWord(preview.detail) }) : t('g7a.bundles.shorter', { n: preview.drawnShorter.count, total: preview.drawnShorter.ofEntries, level: levelWord(preview.detail) })}</p>
              {preview.leftOut.length === 0 ? null : <ul className="bx-leftout">{preview.leftOut.map(one => <li key={`${one.bucket}:${one.says}`}>{inspect ? one.says : t('g7a.bundles.leftOut', { n: one.count })}</li>)}</ul>}
              {preview.standingGaps.length === 0 ? null : <p className="bx-gaps">{inspect ? preview.standingGaps.map(one => `${one.what}: ${one.because}`).join(' · ') : t('g7a.bundles.gaps')}</p>}
              {preview.parts.length === 0 ? null : (
                <InReach
                  box="bx-partsread"
                  name={t('g7a.bundles.partsReading')}
                  shape={String(preview.parts.length)}
                >
                  <table className="bx-partstable">
                    <thead>
                      <tr>
                        <th scope="col">{t('g7a.bundles.part')}</th>
                        {/* WHICH LEVEL THIS PART GOT AND WHY. Criterion B30. */}
                        <th scope="col">{t('g7a.bundles.level')}</th>
                        <th scope="col">{t('g7a.bundles.inCopy')}</th>
                        {inspect ? <th scope="col">{t('g7a.bundles.source')}</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.parts.map((part) => (
                        <tr key={part.name}>
                          <th scope="row">{SCOPES[part.name].label}</th>
                          <td className="bx-part-level">{whatLevelThisPartGot(part)}</td>
                          <td>{inspect ? part.says : t('g7a.bundles.carriedPart', { n: part.carried, total: part.considered })}</td>
                          {/* WHAT ANSWERED IT, in developer mode only. */}
                          {inspect ? <td className="bx-part-reader">{part.reader ?? <Absence />}</td> : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </InReach>
              )}
              {/* FILE THIS AND HAND IT OVER: one quiet press that keeps this reading and records an
                  export of it, beside the text it hands over. Copy the bundle, at the page's head, is
                  the primary press and records nothing. */}
              {theFilesQuestion('preview')}
              <div className="bx-take">
                <button
                  type="button"
                  className="bx-look"
                  disabled={filing || name.trim() === '' || (subject.kind === 'record' && subject.id === '')}
                  onClick={() => void fileAndHand()}
                >
                  {filing
                    ? t('g7a.bundles.handing')
                    : theFilesAnswer('preview')
                      ? t('zipExport.bundlesFileAndDownload')
                      : t('g7a.bundles.fileHand')}
                </button>
              </div>
              {/* WHAT THE PRESS CAME TO, BESIDE THE PRESS THAT MADE IT. The third criterion of
                  bundle-5, with the size of what was handed over (B31). */}
              {said === null || said.where !== 'preview' ? null : <p className="bx-said">{said.text}</p>}
              {said === null || said.where !== 'preview' || said.file === undefined ? null : <CodeRows rows={[{ label: 'frameFiles.row.handed', value: said.file }]} />}
              {/* THE OTHER WAYS OUT, WHETHER OR NOT ANYTHING FAILED. Criteria B28, B29 and the
                  second criterion of bundle-5. */}
              {theWaysOut === null ? null : <TakeItAnotherWay couldNot={theWaysOut} />}
              {/* THE TEXT CARRIES AN ID because the select-it-all press selects this block, and a
                  selection is the way out of a browser that has no clipboard. */}
              <pre className="bx-text" id={THE_TEXT_ON_SCREEN}>
                {preview.text}
              </pre>
            </>
          )}
        </section>
      </div>

      {/* ---- THE KEPT BUNDLES, under the form and the preview. One row each: its name, which opens
              it, what it is for, when it was last handed over at the right, and its one press. */}
      <section className="bxp-kept" {...declaredAttributes({ surface: 'bundles.filed' })}>
        <h2 className="bxp-h">
          <span data-title-is="its-label" {...DRAWS_THE_NAME}>{t('bundlesPage.kept')}</span>
        </h2>
        {listed.status !== 'ready' ? (
          <Loading what={t('g7a.bundles.loading')} />
        ) : (
          // THE COUNT, AND WHAT IT IS COUNTED OVER: every project, or the one chosen.
          <p className="bxp-kept-count">
            {withCountedOver(t('bundlesPage.keptCount', { n: listed.value.bundles.length }), listed.value.readFor, titles)}
          </p>
        )}
        {listed.status !== 'ready' ? null : listed.value.bundles.length === 0 ? (
          <p className="bx-none"><Absence /></p>
        ) : (
          <ul className="bx-list">
            {listed.value.bundles.map((row: BundleRow) => (
              <li key={row.id} className="bx-row">
                <span className="bxp-row-words">
                  <RouteLink to={recordPath(row.id)}>{row.title}</RouteLink>
                  <span className="bx-preset">{BUNDLE_PRESETS[row.spec.preset]?.word ?? (inspect ? row.spec.preset : t('g7a.bundles.unknown'))}</span>
                  {/* THE PROJECT IT IS KEPT IN, on every row, because the list reads across projects. */}
                  <ProjectName id={row.workspaceId} titles={titles} />
                </span>
                <span className="bx-exports">
                  {row.exports.length === 0
                    ? <Absence />
                    : row.exports.length === 1
                      ? t('g7a.bundles.once', { at: drawnStamp(row.exports[0]?.at ?? '') })
                      : t('g7a.bundles.handedTimes', { n: row.exports.length, at: drawnStamp(row.exports[row.exports.length - 1]?.at ?? '') })}
                </span>
                {theFilesQuestion(row.id)}
                <button
                  type="button"
                  className="bx-hand"
                  onClick={() => void hand(row.id, row.id, row.title, row.workspaceId, theFilesAnswer(row.id))}
                >
                  {theFilesAnswer(row.id) ? t('zipExport.bundlesDownload') : t('g7a.bundles.copy')}</button>
                {/* Its id is what a person hands to an agent, in developer mode only. */}
                {inspect ? <RecordId id={row.id} where="card" /> : null}
                {/* WHAT THE PRESS ON THIS ROW CAME TO, on this row. The third criterion of bundle-5. */}
                {said === null || said.where !== row.id ? null : <p className="bx-said">{said.text}</p>}
                {said === null || said.where !== row.id || said.file === undefined ? null : <CodeRows rows={[{ label: 'frameFiles.row.handed', value: said.file }]} />}
                {/* AND WHERE THE CLIPBOARD WAS NOT THERE, the other ways out, on this row. B28. */}
                {couldNotCopy === null || couldNotCopy.where !== row.id ? null : (
                  <TakeItAnotherWay couldNot={couldNotCopy} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- WHAT AN ARRIVING AGENT IS TOLD, in the developer view only, as criterion B26
              asks. It is machinery, drawn only when asked for rather
              than hidden in CSS, so a screen reader does not read it either. Behind a press,
              because reading it is a large request nobody arriving here has asked for. */}
      {inspect ? (
        <section className="bxp-brief" {...declaredAttributes({ surface: 'bundles.brief' })}>
          <h2 className="bxp-h">
            <span data-title-is="its-label" {...DRAWS_THE_NAME}>{t('g7a.bundles.brief')}</span>
          </h2>
          {brief === null ? (
            <button type="button" className="bx-look" onClick={() => void readTheBrief()}>
              {t('g7a.bundles.readBrief')}</button>
          ) : (
            <>
              <p className="bx-size">
                {t('g7a.bundles.briefSize', { size: sizeInWords(brief.size), tokens: brief.size.tokensEstimated })}
              </p>
              {brief.leftOut.length === 0 ? (
                <p className="bx-clean">
                  <Absence />
                </p>
              ) : (
                <ul className="bx-leftout">
                  {brief.leftOut.map((one) => (
                    <li key={one.rung}>
                      <strong>{one.rung}</strong> {one.what}
                    </li>
                  ))}
                </ul>
              )}
              <pre className="bx-text">{brief.head}</pre>
              <pre className="bx-text">{JSON.stringify(brief.whole, null, 2)}</pre>
            </>
          )}
        </section>
      ) : null}
    </div>
  )
}

const BUNDLES_CSS = `
/* THE PAGE IS ITS OWN WIDTH'S CONTAINER, so side by side is decided by the room the page has and not
   by the window: the sidebar takes a different share of the window at each width. */
.bxp { container-type: inline-size; container-name: bxp-page; }

/* THE HEAD: the title and its line at the left, the one primary press at the right. On a phone the
   press takes the full width under the head (rule R5). */
.bxp-head { display:flex; flex-wrap:wrap; align-items:flex-start; justify-content:space-between; gap: var(--pad) var(--pad-lg); min-width:0; }
.bxp-headwords { flex: 1 1 20rem; min-width:0; }
.bxp-headwords h1 { margin:0; }
.bxp-headwords .px-lede { margin: 4px 0 0; }
.bxp-primary { flex: 0 0 auto; display:flex; flex-direction:column; align-items:flex-end; gap: calc(var(--pad) / 2); min-width:0; }
.bxp-about-project { margin:0; color: var(--text-2); font-size: var(--fs-2); }
.bxp-primary .bxp-about-project { max-width: 22rem; text-align: end; }
.bxp-choice { margin: var(--pad-lg) 0 0; min-width:0; }
.bxp-kept-count { margin: 0 0 var(--pad); color: var(--text-2); }
.bxp-which { margin-inline-start: calc(var(--pad) * 2); }
.bxp-notcopied { margin:0; color: var(--text-2); font-size: var(--fs-2); max-width: 22rem; text-align: end; }
@container bxp-page (max-width: 40rem) {
  .bxp-primary { flex: 1 1 100%; align-items: stretch; }
  .bxp-primary .px-btn { width: 100%; min-height: 44px; }
  .bxp-notcopied { max-width: none; text-align: start; }
  .bxp-primary .bxp-about-project { max-width: none; text-align: start; }
}

/* THE FORM AND THE PREVIEW: one column, and side by side once the page is wide enough for both. */
.bxp-work { display:grid; grid-template-columns: minmax(0, 1fr); gap: calc(var(--pad-lg) * 2); margin: calc(var(--pad-lg) * 2) 0 0; min-width:0; }
@container bxp-page (min-width: 56rem) {
  .bxp-work { grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); align-items: start; }
}

/* WHERE A COPY IS MADE, with no heading over it (criterion B27) and no box: a column of labelled
   rows split by a thin line, the way Settings draws a labelled row. */
.bx-new { display:block; margin:0; min-width:0; container-type: inline-size; container-name: bxp-form; }
.bxp-row { display:grid; grid-template-columns: minmax(0, 7rem) minmax(0, 1fr); gap: calc(var(--pad) / 2) var(--pad-lg);
  align-items: start; padding: var(--pad-lg) 0; border-bottom: var(--border-w) solid var(--border); min-width:0; }
.bxp-row:first-child { padding-top: 0; }
.bxp-row:last-child { border-bottom: 0; }
.bxp-label { margin:0; padding-top: 4px; color: var(--text-2); font: var(--fs-2)/var(--lh-tight) var(--font-ui); }
.bxp-label.bx-choose { display:block; }
.bxp-controls { display:flex; flex-direction:column; align-items:stretch; gap: var(--pad); min-width:0; }
.bxp-select { align-self:flex-start; max-width: 100%; min-height: 30px; font: inherit; color: var(--text);
  background: var(--panel); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm); }
/* A NARROW FORM PUTS EACH NAME OVER ITS CONTROLS, as Settings does on a phone. */
@container bxp-form (max-width: 24rem) {
  .bxp-row { grid-template-columns: minmax(0, 1fr); }
  .bxp-label { padding-top: 0; }
}

/* A SECTION IS NOT A BOX: a heading in the look's label style over a rule. The preview's one control,
   the press that reads it, stands at the heading's right. */
.bxp-preview, .bxp-kept, .bxp-brief { min-width:0; }
.bxp-kept, .bxp-brief { margin: calc(var(--pad-lg) * 2) 0 0; }
.bxp-h {
  display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap: 4px var(--pad-lg);
  margin: 0 0 var(--pad) 0; padding-bottom: var(--section-pad); border-bottom: var(--section-rule);
  color: var(--text); font-family: var(--section-font); font-size: var(--section-size); font-weight: var(--section-weight);
}
.bxp-h [data-title-is='its-label'] { text-transform: var(--section-case); letter-spacing: var(--section-space); }
.bxp-h .bx-look { font-family: var(--font-ui); font-size: var(--fs-2); font-weight: 400; text-transform: none; letter-spacing: 0; }
.bxp-none { margin: 0; color: var(--text-2); }
/* THE COPY'S TEXT A SIZE SMALLER in the preview column, so its ruled lines of eighty characters fit
   the column at 1440 instead of wrapping one character onto a line of its own. */
.bxp-preview .bx-text { font-size: var(--fs-1); }

/* A KEPT BUNDLE'S ROW: its name and what it is for at the left, when it was handed over and its one
   press at the right, rows split by a thin line. */
.bxp-row-words { display:flex; flex-direction:column; gap: 2px; flex: 1 1 16rem; min-width:0; overflow-wrap:anywhere; }

.bx-make, .bx-file { display:flex; align-items:end; gap: var(--pad); flex-wrap:wrap; }
.bx-choose { display:flex; flex-direction:column; gap: calc(var(--pad) / 2); }
.bx-forwhat { color: var(--text-2); margin: 0; }
.bx-radio { display:flex; align-items:baseline; gap: calc(var(--pad) / 2); cursor:pointer; }
.bx-find { display:flex; flex-direction:column; gap: calc(var(--pad) / 2); }
.bx-search, .bx-name {
  min-height: 30px; padding: 0 calc(var(--pad) / 2); font: inherit; color: var(--text);
  background: var(--panel); border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
}
/* THE NAME BOX TAKES THE REST OF THE ROW at 1440 and the whole of it at 390, because a bundle's
   name is a sentence and a box that shows six characters of it is a box nobody reads back. */
.bx-name { flex: 1 1 22ch; min-width: 0; }
.bx-search { max-width: 40ch; width: 100%; box-sizing: border-box; }
.bx-need, .bx-chosen { color: var(--text-2); margin: 0; }
.bx-hits { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap: calc(var(--pad) / 4);
  max-height: 40vh; overflow-y: auto; }
.bx-hit {
  width: 100%; text-align: start; display:flex; gap: var(--pad); align-items:baseline; flex-wrap:wrap;
  min-height: 30px; padding: calc(var(--pad) / 3) calc(var(--pad) / 2); font: inherit; cursor: pointer;
  background: var(--panel); color: var(--text);
  border: var(--border-w) solid var(--border); border-radius: var(--radius-sm);
}
.bx-hit-title { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
.bx-hit-kind { color: var(--text-2); flex: 0 0 auto; }
.bx-look, .bx-hand {
  min-height: 30px; padding: 0 var(--pad);
  border: var(--border-w) solid var(--border-strong); border-radius: var(--radius-sm);
  background: var(--panel); color: var(--text); font: inherit; cursor: pointer;
}
/* THE ONE OF THEM THAT IS A LINK. It goes to a page of plain text, so it is an anchor and keeps
   everything an anchor gives a person; these three declarations are what an anchor does not get
   from the rule above, so it stands in the row beside the buttons instead of under it.
   Criterion B29. */
a.bx-look { display:inline-flex; align-items:center; text-decoration: none; }
.bx-limits { border-inline-start: 3px solid var(--text); padding-inline-start: var(--pad); }
.bx-refused { border-inline-start: 3px solid var(--text); padding-inline-start: var(--pad); font-weight:600; }
.bx-clean, .bx-size, .bx-none { color: var(--text-2); }
.bx-text {
  /* DOWN ONLY. The text wraps, so nothing ever runs off the side; a sideways scroll here would be
     a box that hides part of what is about to leave the building. */
  max-height: 60vh; overflow-y: auto; overflow-x: hidden; white-space: pre-wrap; word-break: break-word;
  border: var(--border-w) solid var(--border); border-radius: var(--radius-sm);
  padding: var(--pad); background: var(--panel-2, var(--panel));
}
.bx-parts { border: var(--border-w) solid var(--border); border-radius: var(--radius-sm);
  padding: var(--pad); margin: 0; display:grid; gap: calc(var(--pad) / 2); min-width: 0;
  /* TWO COLUMNS WHERE THERE IS ROOM AND ONE WHERE THERE IS NOT. Twenty-three rows in one column
     is a scroll at 1440 and the right shape at 390. */
  grid-template-columns: repeat(auto-fit, minmax(min(22rem, 100%), 1fr)); }
.bx-parts legend { padding: 0 calc(var(--pad) / 2); color: var(--text-2); }
/* THE RECORDS SOMEBODY ADDS BY NAME. Drawn like the fieldsets above and in one column, because its
   rows are a search box and the records already chosen rather than a list to scan. */
.bx-addbox { border: 0; padding: 0; margin: 0; display:grid; gap: calc(var(--pad) / 2); min-width: 0; }
.bx-addbox legend { padding: 0; margin-bottom: calc(var(--pad) / 2); color: var(--text-2); font-size: var(--fs-2); }
.bx-part { display:flex; align-items:baseline; gap: calc(var(--pad) / 2); cursor:pointer; min-width: 0; }
.bx-part-words { display:flex; flex-direction:column; min-width: 0; }
.bx-part-says { color: var(--text-2); overflow-wrap: anywhere; }
/* THE SCALE BESIDE LESS AND MORE. Criterion B34: the size in characters and bytes, and where the
   parts stand against the highest level they really have, as numbers a person reads at a glance.
   A column of its own so the two facts do not run together, and it wraps with the row at 390. */
.bx-scale { display:flex; flex-direction:column; gap: calc(var(--pad) / 6); color: var(--text-2); }
.bx-take { margin: var(--pad) 0; display:flex; gap: var(--pad); flex-wrap:wrap; }
/* WHAT A BROWSER WITH NO CLIPBOARD IS TOLD, drawn where the press was. Criterion B28.

   FLEX-BASIS 100% IS WHAT PUTS IT UNDER THE ROW rather than beside the button: a filed row is a
   wrapping flex line, so a block with no basis would sit in the line and squeeze the title. Inside
   the copy it is an ordinary block and the basis does nothing.

   THE WARNING WEIGHT IS THE RULE DOWN ITS LEFT SIDE, the same one the count line carries. A person
   here has to do something -- the copy they asked for did not happen -- so it is drawn as something
   to act on rather than as a note. */
.bx-nocopy {
  flex-basis: 100%; min-width: 0;
  border-left: 3px solid var(--warn, var(--text-2));
  padding: calc(var(--pad) / 2) var(--pad);
  margin: var(--pad) 0;
  background: var(--surface-2, transparent);
}
.bx-nocopy-why { margin: 0; }
.bx-nocopy-said { margin: 0; color: var(--text-2); }

/* WHAT A PRESS CAME TO, DRAWN UNDER THAT PRESS. The third criterion of bundle-5.

   The full flex basis is what keeps it under the press rather than beside it: two of the three
   places it is drawn are inside a flex row of buttons, and a sentence squeezed into the gap after
   the last button is a sentence that wraps to one word a line on a phone. */
.bx-said {
  flex-basis: 100%; min-width: 0;
  margin: calc(var(--pad) / 2) 0 0;
  color: var(--text-1, inherit);
}
/* THE TEXT BOX SOMEBODY OPENED TO COPY BY HAND. Criterion B29.

   TALL ENOUGH TO SEE WHAT IS IN IT AND SHORT ENOUGH NOT TO TAKE THE PAGE, and it scrolls down only:
   a text box scrolling sideways would hide the ends of lines somebody is about to hand over, which
   is the same reason the block above it does not.

   THE WIDTH AND THE BOX MODEL TOGETHER. A textarea's padding and border are outside
   its width by default, so the first alone pushes it past the box it sits in — at 390 that is the
   page scrolling sideways. */
.bx-box {
  display:block; width: 100%; box-sizing: border-box; min-width: 0;
  height: 16em; margin-top: var(--pad);
  padding: calc(var(--pad) / 2);
  border: var(--border-w) solid var(--border); border-radius: var(--radius-sm);
  background: var(--panel); color: var(--text);
  font-family: var(--font-mono, monospace); font-size: var(--fs-2, inherit);
  overflow-x: hidden; overflow-y: auto; white-space: pre-wrap; overflow-wrap: anywhere;
  resize: vertical;
}
/* HOW MANY ENTRIES CAME BACK SHORTER THAN ASKED, drawn so it is not one paragraph among several.
   The owner read a copy whose first lines said 101 of its 132 entries were titles and did not see the
   sentence. Criterion B25 says the line stays and stands out; a rule down its left side and the
   page's own warning weight is what that is here, rather than more words. */
.bx-shorter {
  border-left: 3px solid var(--warn, var(--text-2));
  padding: calc(var(--pad) / 2) var(--pad);
  margin-top: var(--pad);
  background: var(--surface-2, transparent);
}
/* One record somebody added to the copy by hand, with the button that takes it out again. */
.bx-added { display:flex; align-items:center; gap: calc(var(--pad) / 2); flex-wrap:wrap; margin: calc(var(--pad) / 2) 0; }
.bx-drop { font: inherit; color: var(--text-2); background: none; border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm); padding: 0 calc(var(--pad) / 2); cursor: pointer; }

/* The box the table scrolls inside, and the thing the label column's width is asked about. Its
   inline size is the width the table actually has, which is the question the container query at the
   bottom of this stylesheet needs answered; the viewport is not that width. */
.bx-partsread { margin: var(--pad) 0; overflow-x:auto;
  container-name: partsread; container-type: inline-size; }
.bx-partstable { border-collapse: collapse; width: 100%; }
/* WHICH LEVEL A PART GOT, in its own column. Criterion B30.
   The level and its reason stack, because the reason is a second fact about the same cell rather
   than more of the first, and a column that wraps mid-phrase reads as one long word at 390. */
.bx-part-level { white-space: normal; }
.bx-part-level strong { display:block; }
.bx-part-level .bx-part-says { display:block; }

/* "break-word", NOT "anywhere", AND THE DIFFERENCE IS THE WHOLE FAULT.
   -----------------------------------------------------------------------------------------------
   The two look like synonyms and are not. "anywhere" tells the browser a word may break between any
   two characters AND that it may take that into account when it works out how narrow the column
   could be. An automatic table layout then reads every column's smallest possible width as about one
   character, and hands the space to whichever column asks loudest — here the middle one, which holds
   sentences.

   MEASURED ON 28 AUGUST 2026, at 1440, on the bundle preview: the label column drew at 53px and the
   reader column at 64px, inside a page with 1192px to spend. "campaign" needs 79px and "schedule"
   71px, so they broke inside themselves, and the owner read a table that said

       The / camp / aign / and / wher / e it / has / got to
       Everyt / hing / unres / olved / in this / projec / t

   "break-word" breaks a word that genuinely cannot fit, exactly as before, but it does NOT let that
   possibility shrink the column's intrinsic width. Each column is therefore at least as wide as its
   longest word, which is the whole requirement: an English word is never drawn in a column narrower
   than the word.

   AND IF THE NATURAL WIDTHS DO NOT FIT, THE BOX SCROLLS. ".bx-partsread" above is "overflow-x: auto"
   and always has been, so the honest outcome of a table too wide for a phone is a table you push
   sideways -- not a table whose words have been taken apart to make it fit. */
.bx-partstable th, .bx-partstable td { text-align: start; vertical-align: top; padding: calc(var(--pad) / 3);
  border-block-end: var(--border-w) solid var(--border); overflow-wrap: break-word; }
.bx-partstable thead th { color: var(--text-2); }

/* THE LABEL COLUMN IS SIZED TO ITS CONTENT; THE OTHER TWO SHARE WHAT IS LEFT.
   -----------------------------------------------------------------------------------------------
   WHAT THIS RULE USED TO SAY, AND THE DAMAGE IT DID. It was

       .bx-partstable th[scope="row"], .bx-part-reader { width: 1%; }

   width:1% asks a column for its smallest possible width. On a wide screen that is right for both
   outer columns. At 390 it forced the reader column to its min-content -- a whole 247px file path,
   which has nowhere to break -- and the SENTENCE column paid for it, 271px down to 141px: about
   seventeen characters a line beside a 247px path. The table stopped fitting the phone as well.
   That was damage this change itself caused and an independent check found it.

   AND THE FIX THAT WAS TRIED FIRST WAS WORSE, WHICH IS WHY IT IS WRITTEN DOWN RATHER THAN QUIETLY
   REPLACED. Letting the reader column break anywhere did return width to the sentences -- 141px to
   193px, and the table fitted the phone again -- but "anywhere" does not distinguish a path from a
   name, so "listRecords" came apart too. Measured: 0 mid-word breaks became 34 at 1440 and 40 at
   390. It solved the column widths by reintroducing the exact fault the owner reported.

   SO ONLY THE LABEL COLUMN IS SIZED TO CONTENT NOW, and every word in the table stays whole. At 390
   the three columns genuinely do not fit a phone, and the honest outcome of that is a table you push
   sideways inside its own box -- .bx-partsread above is overflow-x:auto and InReach draws the edge
   so it does not look like an accident. A table too wide for a phone is a fact about the table. A
   table whose words have been taken apart to make it fit is a fact about the layout.

   AND SIZING IT TO ITS CONTENT WAS STILL NOT ENOUGH, WHICH IS THE FAULT THIS RULE NOW FIXES.
   -----------------------------------------------------------------------------------------------
   "Its content" for width:1% means the longest single word, so the column drew at 94.2px inside a
   1146px table -- measured at 1440 on 29 August 2026 -- and the labels are phrases, not words:

       The / campaign / and where / it has got / to

   Every word there is whole. The column is 60 words on 40 lines, 1.5 words a line, and it reads
   down the page. The owner's sentence is "no semantic column should collapse into unreadable
   vertical text" and this was still it, one step earlier than a broken word.

   FOURTEEN REM IS A PREFERENCE, NOT A COMMAND, AND THE DIFFERENCE IS THE POINT. The "width" property on a cell
   in an automatic table layout is a preferred width: the layout grants it when there is room and
   refuses it when there is not. Measured, light theme, on the bundle preview:

       viewport   label     sentence column   what happened
       1440       224px     664px             granted; 3.28 words a line, was 1.51
       768        224px     251px             granted; the sentence column still absorbs the slack
       600         94px     225px             refused, and the table fits without scrolling
       390         97px     141px             refused; the table scrolls inside its own box

   A "min-width" would have been the command instead, and it was measured and rejected: at 390 it
   forced the column to 224px and widened the scroll from 484px to 612px, buying nothing.

   THE CONTAINER QUERY IS WHERE THE REFUSAL IS DECIDED, rather than left to the table. Granting the
   preference costs the middle column 130px, and below about 40rem of box that took the sentences to
   137.89px -- 2.1 words a line -- which is trading the label column's fault for a worse one in the
   column that carries the sentences. So the preference is only offered when the box has room for
   it. .bx-partsread is asked, not the viewport, because the width that matters is the one the table
   actually has, and .bx-partsread above is what carries the container. */
.bx-partstable th[scope="row"] { width: 1%; }
/* THE THRESHOLD IS 34REM SINCE THE PREVIEW STANDS BESIDE THE FORM (round 10e). At 1440 the preview
   column is about 38rem wide, and at 40rem the preference was refused there and the part names broke
   to one word a line again. In normal mode the other two columns hold a level name and a count, so
   granting 14rem at 34rem still leaves them more room than their words need. */
@container partsread (min-width: 34rem) { .bx-partstable th[scope="row"] { width: 14rem; } }
.bx-part-reader { color: var(--text-2); }
.bx-list { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; }
.bx-row { display:flex; align-items:center; gap: var(--pad) var(--pad-lg); flex-wrap:wrap;
  padding: var(--pad) 0; border-bottom: var(--border-w) solid var(--border); }
/* THE TWO ANSWERS AN EXPORT PRESS OFFERS. Full width, so on a phone they stand above the press they
   belong to instead of squeezing it into a column; a legend is the question and the two labels are
   the answers, both from the word list. */
.bx-files { display:flex; flex-wrap:wrap; gap: 2px var(--pad-lg); flex-basis: 100%; min-width: 0;
  margin: 0; padding: 0; border: 0; }
.bx-files-q { flex-basis: 100%; padding: 0; color: var(--text-2); font-size: var(--fs-1); }
.bx-files-answer { display:inline-flex; gap: 4px; align-items: baseline; min-width: 0; overflow-wrap: anywhere; }
.bx-preset, .bx-exports { color: var(--text-2); }
.bx-leftout, .bx-gaps { color: var(--text-2); }
`
