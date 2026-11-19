// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PAGE THAT FAILS SAYS SO IN WORDS, WHERE THE PAGE WAS. Criterion E4.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT HAPPENED
 * ---------------------------------------------------------------------------------------
 *
 * A press on Retire on an agent's page turned the page white, and on coming back the agent was
 * still there. Measured in the server log: no retire request was made, so
 * the page stopped before it asked for anything. There was no way to find out what had happened except
 * to open the browser's own console, which is not a thing this product may ask of a person.
 *
 * A blank page is a loud failure, and keeping the page as it was with no error would be more
 * dangerous. The blankness is not the fault. What E4
 * asks for is that the loud failure carries its words.
 *
 * ---------------------------------------------------------------------------------------
 * TWO THINGS, BECAUSE ONE OF THEM CANNOT CATCH THE OTHER
 * ---------------------------------------------------------------------------------------
 *
 * A React boundary catches a fault thrown WHILE A COMPONENT IS BEING DRAWN. It catches nothing
 * thrown inside a press handler, and nothing thrown inside a `.then` after a request. So there are
 * two catchers here and they are not interchangeable:
 *
 *   `TheFaultBoundary`  a class component, because only a class can be a boundary. It is mounted
 *                       once in App.tsx around every page and keyed by the address, so a fault is
 *                       drawn where the page was and is gone the moment the reader goes elsewhere.
 *   `usePressFault`     wraps what a press does. `Btn` calls it, so every press in the product is
 *                       wrapped without a page having to remember. A fault thrown while sending is
 *                       drawn beside the press, in the same words, and the rest of the page stands.
 *
 * WHICH ONE CAUGHT THEIR CRASH: the boundary. Pressing Retire opened the reason box, and the box drew
 * a second Retire button that was disabled with no reason on it, which `Btn` then refused to draw. That
 * throw is a DRAWING fault, which is why the page went white rather than standing still with a
 * refusal on it. Claim B37w7yXUxxt0 has the measurement.
 *
 * ---------------------------------------------------------------------------------------
 * AND IT IS FILED, ONCE PER FAULT PER READING
 * ---------------------------------------------------------------------------------------
 *
 * E4's other half, built in perm-5b: the moment the panel draws, the fault is written to the office
 * as a problem carrying its own message, the page, the press and the address, and the panel draws
 * a link to that problem. The link's words are "Open it"; the problem's id is added in developer
 * mode only. The owner never has to open a browser console, and a fault they
 * met on Sunday is still findable on Monday.
 *
 * THE FILING IS IN `TheFault` ITSELF, which is what makes it cover both catchers. The boundary and
 * the press catcher both draw this one component, so the rule lives here once rather than twice.
 *
 * THE OFFICE FILES IT, NOT THEM AND NOT THE READER. This browser writes as the person, because a
 * browser is where they work. The door throws the caller's headers away and writes the problem under
 * the office's own name, so nothing says they found a fault that no person found.
 *
 * ONCE PER FAULT PER READING, AND THE DOOR HOLDS THAT RULE. A fault while drawing is thrown again
 * on every re-render, so filing each one would put a hundred identical problems in front of them. A
 * READING is one browser tab from the moment the product is opened until it is closed; `thisReading`
 * below names it, and the door answers a repeat with the problem it already filed.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT DRAWS ITS OWN BUTTON RATHER THAN USING `Btn`
 * ---------------------------------------------------------------------------------------
 *
 * `Btn` calls into this file, so importing `Btn` here would be a circle. It is also the wrong
 * dependency to have: this is the drawing that has to work when the drawing has stopped working,
 * and it should lean on as little as possible to do it. `api.ts` is not that kind of dependency: it
 * imports nothing from here, and every request this browser makes goes through it — the rule that
 * tests/workspace-switcher.test.ts holds, so that no page invents its own headers.
 */

import { Component, createContext, useContext, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react'

import { content, t } from '@shared/i18n.ts'
import { api } from '../api.ts'
import { recordPath } from './router.tsx'
import { useLanguage } from '../lib/language.ts'
import { useInspect } from '../lib/mode.ts'

/**
 * EVERY WORD THIS DRAWS, in one place, so a screen and a test read the same words.
 *
 * They say what happened and what to do, and they name nothing after the mechanism that produced
 * it: a person reading this did not press a component and does not have a render tree.
 *
 * EACH IS READ FROM THE WORD LISTS WHEN IT IS ASKED FOR, so it is in the page's language at that
 * moment. The fault's own message, the page's name and the problem's id are content and are never
 * translated.
 */
export const FAULT_WORDS = {
  /** What happened, when the page stopped while it was being drawn. */
  get whileDrawing() { return t('frameFiles.fault.whileDrawing') },
  /** What happened, when a press stopped. */
  get whileSending() { return t('frameFiles.fault.whileSending') },
  /**
   * Said under both, and it names what the next line is. It says nothing about what was written:
   * the panel cannot know that, and the one thing the office tells it is whether the fault was
   * written down as a problem (`filed`).
   */
  get says() { return t('frameFiles.fault.says') },
  /** The labels beside the two facts. Each is a name with a value, never a sentence. */
  get page() { return t('frameFiles.fault.page') },
  get press() { return t('frameFiles.fault.press') },
  /** Said where nothing on this page had been pressed, which is a real answer and not a gap. */
  get nothingPressed() { return t('frameFiles.fault.nothingPressed') },
  /** The press that gets the reader out. */
  get again() { return t('frameFiles.fault.again') },
  /** What a press is called when it carries a picture or several elements rather than a word. */
  get unnamedPress() { return t('frameFiles.fault.unnamedPress') },
  /**
   * Said before the link to the problem the office filed for this fault. Criterion E4. The link's
   * words are `openIt`; the problem's id is drawn after them in developer mode only.
   */
  get filed() { return t('frameFiles.fault.filed') },
  get openIt() { return t('frameFiles.fault.openIt') },
  /** Said while the filing is still in flight, so the space is never an empty promise. */
  get filing() { return t('frameFiles.fault.filing') },
}

/**
 * SAID WHEN THE FILING ITSELF FAILED, with the office's own message inside it.
 *
 * A fault panel that could not file is still a fault panel: the words a person needs are already
 * on the screen, and this line says the office has NOT got a copy, so nobody goes looking for a
 * problem record that was never written.
 */
function notFiled(because: string): string {
  return t('frameFiles.fault.notFiled', { because: content(because) })
}

/** What a caught fault is, in the one fact a reader always has and the two they may. */
export interface TheFaultSays {
  /** The fault's own message, unchanged. Never rewritten and never shortened. */
  message: string
  /**
   * The page it happened on, by the name the reader sees in the rail, or null because nobody said.
   *
   * Null happens where a press is drawn outside the shell — a test, or a page not mounted under
   * `PageIsNamed`. Drawing an empty value beside the word "page" would read as a name that failed
   * to arrive, so nothing is drawn at all.
   */
  page: string | null
  /** The press that led here, or null because nothing on this page had been pressed. */
  press: string | null
}

// ============================================================================ which page

/**
 * WHICH PAGE THE READER IS ON, for a press that has to name it.
 *
 * A press knows what it is called and knows nothing about where it is. The shell knows the page and
 * mounts this around everything it draws, so a fault caught inside a press can say both without any
 * page passing its own name down to its buttons.
 *
 * NULL IS THE DEFAULT AND IT IS A REAL ANSWER: nobody named a page. A press drawn on its own in a
 * test is in that state, and what it draws says nothing about a page rather than saying nothing.
 */
const ThePageName = createContext<string | null>(null)

/** Name the page every press inside this is on. Mounted once, by the shell. */
export function PageIsNamed({ name, children }: { name: string; children: ReactNode }) {
  return <ThePageName.Provider value={name}>{children}</ThePageName.Provider>
}

/** The page a press is on, or null because nobody named one. */
export function usePageName(): string | null {
  return useContext(ThePageName)
}

// ============================================================================ the last press

/**
 * WHICH PRESS LED HERE, held for as long as one page is on the screen.
 *
 * A module-level value and not React state, because the thing that reads it is
 * `getDerivedStateFromError`, which is static and is handed nothing but the fault.
 *
 * IT IS CLEARED WHEN A BOUNDARY MOUNTS, which is once per address: the boundary is keyed by the
 * address, so a new page gets a fresh boundary and a fresh empty record of what was pressed. That
 * is what makes "the press that led here" true rather than "the last press anybody made". No clock
 * is involved and no press is guessed at: a page nobody pressed reports no press.
 */
let lastPress: string | null = null

/** Remember the press being made. `Btn` calls this, so no page has to. */
export function notePress(name: string): void {
  lastPress = name
}

/** Forget what was pressed. Called when a boundary mounts, which is once per address. */
export function forgetPresses(): void {
  lastPress = null
}

/** The press that led here, or null because nothing on this page had been pressed. */
export function theLastPress(): string | null {
  return lastPress
}

/**
 * WHAT TO CALL A PRESS, from what is drawn on it.
 *
 * A button with a word on it is called by that word. One carrying a picture or several elements has
 * no word to use, and this says so rather than inventing one — the reader is being told which press
 * led to a fault, and a made-up name would be the wrong press.
 */
export function nameOfPress(children: ReactNode): string {
  return typeof children === 'string' && children.trim() !== '' ? children : FAULT_WORDS.unnamedPress
}

/** The fault's own message, from whatever was thrown. Never rewritten. */
export function messageOfFault(err: unknown): string {
  if (err instanceof Error && err.message !== '') return err.message
  const said = String(err)
  return said === '' ? t('frameFiles.fault.noMessage') : said
}

// ============================================================================ this reading

/** Where the name of this reading is kept, so a reload in the same tab is the same reading. */
const READING_KEY = 'mole-office.reading'

/** Held for the life of this page, so the name is worked out once however many faults there are. */
let reading: string | null = null

/**
 * WHICH READING OF THE PRODUCT THIS IS: one browser tab, from opening it until closing it.
 *
 * It is what makes "once per fault per reading" a rule the office can hold: every request from one
 * tab looks like every request from another, so the browser names the tab and the office compares
 * the names it was given.
 *
 * `sessionStorage` AND NOT `localStorage`. Session storage belongs to one tab and is emptied when
 * the tab closes, which is exactly the span this is about; local storage would make every tab this
 * machine ever opens one reading, and a fault met a week later would file nothing.
 *
 * IT SURVIVES THE RELOAD PRESS ON PURPOSE. Pressing "Load this page again" and meeting the same
 * fault is the same fault in the same reading, and a second identical problem would be noise.
 *
 * STORAGE CAN THROW — a browser set to block site data throws on the read itself — so a reading
 * that cannot be kept is made fresh each time. That files one problem per page load rather than
 * none, which is the honest failure: the fault is still recorded.
 */
export function thisReading(): string {
  if (reading !== null) return reading
  const made = `r-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
  try {
    const held = window.sessionStorage.getItem(READING_KEY)
    if (held !== null && held !== '') {
      reading = held
      return held
    }
    window.sessionStorage.setItem(READING_KEY, made)
  } catch {
    // Blocked or unavailable. The fresh name above is used and this page load is one reading.
  }
  reading = made
  return made
}

/** What the office said about filing one fault, as the panel holds it while it waits. */
type TheFiling =
  | { state: 'filing' }
  | { state: 'filed'; problem: string }
  | { state: 'refused'; because: string }

// ============================================================================ the drawing

/**
 * THE FAULT, DRAWN WHERE THE THING THAT FAILED WAS, AND FILED THE MOMENT IT IS DRAWN.
 *
 * The same drawing for both catchers, because it is the same news to the reader: what stopped, in
 * its own words, on which page, after which press, and the one way on.
 *
 * `role="alert"` because it replaces what somebody was reading and they have to be told.
 *
 * THE FILING IS AN EFFECT AND NOT PART OF THE DRAWING. Drawing is called many times for one fault —
 * React re-renders on every pointer move over the page — and a request sent from the drawing itself
 * would be one request per render. The effect runs once for one fault, and `alreadyFiled` below
 * holds that even through React's development double-mount.
 *
 * `filing` IS OPTIONAL AND ITS DEFAULT IS THE PRODUCT'S. A test hands its own so that what the
 * panel draws can be measured without a server; the product hands none and the office is asked.
 */
export function TheFault({
  said,
  what,
  filing = api.fileAFault,
}: {
  said: TheFaultSays
  what: string
  filing?: (asked: {
    message: string
    page: string | null
    press: string | null
    route: string | null
    reading: string
    what: 'while-drawing' | 'while-sending'
  }) => Promise<{ problem: string; filed: boolean; says: string }>
}) {
  // The panel's own words follow a change of the page's language.
  useLanguage()
  // An id is drawn in developer mode only.
  const inspect = useInspect()
  const [filed, setFiled] = useState<TheFiling>({ state: 'filing' })
  /**
   * THE ONE REQUEST THIS FAULT MADE, held so that it is sent once and read on every mount.
   *
   * A ref and not state, because it has to be true immediately rather than on the next render.
   *
   * IT HOLDS THE ANSWER AND NOT A FLAG, and that is the whole of what makes this work in a browser.
   * React mounts an effect, unmounts it and mounts it again while it is developing, so a flag saying
   * "already sent" leaves the second mount with nothing to wait on: the request goes, its answer
   * reaches a handler that has been told to stop, and the panel says it is still writing this down
   * for ever. MEASURED IN A REAL BROWSER on 8 September 2026 while this was being built. Keeping the
   * answer means one request is sent and every mount attaches to that same answer.
   */
  const sent = useRef<{ key: string; answer: Promise<{ problem: string }> } | null>(null)
  const whileDrawing = what === FAULT_WORDS.whileDrawing
  useEffect(() => {
    const key = `${said.message} ${said.page ?? ''} ${said.press ?? ''}`
    if (sent.current === null || sent.current.key !== key) {
      sent.current = {
        key,
        answer: filing({
          message: said.message,
          page: said.page,
          press: said.press,
          // THE ADDRESS THE READER WAS AT, read here rather than passed in: every caller of this
          // panel is on the page that failed, and a second place holding the address would be a
          // second place free to be wrong about it.
          route: typeof window === 'undefined' ? null : window.location.hash,
          reading: thisReading(),
          what: whileDrawing ? 'while-drawing' : 'while-sending',
        }),
      }
    }
    let gone = false
    sent.current.answer.then(
      (answer) => {
        if (!gone) setFiled({ state: 'filed', problem: answer.problem })
      },
      (why: unknown) => {
        // THE FILING'S OWN FAILURE IS SAID AND NOT SWALLOWED. This panel exists because silence
        // about a failure is the fault; being silent about its own would be the same defect one
        // level down.
        if (!gone) setFiled({ state: 'refused', because: messageOfFault(why) })
      },
    )
    return () => {
      gone = true
    }
  }, [filing, said.message, said.page, said.press, whileDrawing])

  /**
   * WHAT THE OFFICE DID WITH THIS FAULT, worked out here rather than in the drawing.
   *
   * THE STORED WORD NEVER REACHES THE DRAWING. `filed.state` is `filing`, `filed` or `refused`, and
   * those are words for a program. Comparing them inside the JSX puts a machine word in the place a
   * person reads, which is what tests/the-machine-word-gate.test.ts exists to notice — it noticed
   * this one on 8 September 2026. The drawing below reads two values a person can read: the problem
   * this fault has, or the sentence saying why it has none.
   */
  const theProblem = filed.state === 'filed' ? filed.problem : null
  const whatTheOfficeSaid =
    filed.state === 'refused' ? notFiled(filed.because) : FAULT_WORDS.filing

  return (
    <div className="fault" role="alert">
      <style href="mole-office-fault" precedence="default">
        {FAULT_CSS}
      </style>
      <p className="fault-what">{what}</p>
      {/* WHAT THE NEXT LINE IS, BEFORE THE RAW WORDS. Whether anything was written is not said here,
          because a page can stop after a press has written; the filing line below is the office's. */}
      <p className="fault-says">{FAULT_WORDS.says}</p>
      <p className="fault-message">{said.message}</p>
      <p className="fault-where">
        {said.page === null ? null : (
          <>
            <span className="fault-key">{FAULT_WORDS.page}</span>
            <span className="fault-value">{said.page}</span>
          </>
        )}
        {said.press === null ? null : (
          <>
            <span className="fault-key">{FAULT_WORDS.press}</span>
            <span className="fault-value">{said.press}</span>
          </>
        )}
      </p>
      {said.press === null ? <p className="fault-none">{FAULT_WORDS.nothingPressed}</p> : null}
      {/* WHAT THE OFFICE DID WITH IT. Criterion E4: the fault is written down as a problem and this
          is the press that opens it, so the reader can add what they were doing to the record while
          they still remember it. All three states say something; none of them is a blank space. */}
      <p className="fault-filed">
        {theProblem === null ? whatTheOfficeSaid : null}
        {theProblem === null ? null : (
          <>
            {FAULT_WORDS.filed}{' '}
            <a className="fault-problem" href={'#' + recordPath(theProblem)}>
              {FAULT_WORDS.openIt}
            </a>
            {inspect ? <span className="fault-problem-id">{theProblem}</span> : null}
          </>
        )}
      </p>
      <button
        type="button"
        className="fault-again"
        onClick={() => {
          window.location.reload()
        }}
      >
        {FAULT_WORDS.again}
      </button>
    </div>
  )
}

// ============================================================================ the boundary

interface BoundaryProps {
  /** The page's name, as the reader sees it in the rail. */
  page: string
  children: ReactNode
}

interface BoundaryState {
  fault: TheFaultSays | null
}

/**
 * A FAULT WHILE DRAWING, CAUGHT AND DRAWN WHERE THE PAGE WAS.
 *
 * A CLASS, BECAUSE ONLY A CLASS CAN BE A BOUNDARY. React has no hook for this and says so; a
 * function component cannot catch a fault in its own children at all.
 *
 * KEYED BY THE ADDRESS BY WHOEVER MOUNTS IT. Nothing here reads the address: the key is what makes
 * a new page a new boundary, and the constructor is what makes that a clean one. A boundary without
 * a key keeps the page dead after the reader has gone somewhere else, which is the one behaviour
 * that would be worse than the blank page.
 */
export class TheFaultBoundary extends Component<BoundaryProps, BoundaryState> {
  constructor(props: BoundaryProps) {
    super(props)
    this.state = { fault: null }
    // A FRESH PAGE HAS NO PRESS BEHIND IT. This runs once per address, because the key remounts it.
    forgetPresses()
  }

  static getDerivedStateFromError(err: unknown): Partial<BoundaryState> {
    // THE PAGE'S NAME IS NOT AVAILABLE HERE, and it is not guessed: this is static, so it is handed
    // the fault alone. `render` puts the name on, from the prop it already has.
    return { fault: { message: messageOfFault(err), page: null, press: theLastPress() } }
  }

  override componentDidCatch(err: unknown, info: ErrorInfo): void {
    // SAID OUT LOUD AS WELL AS DRAWN. The page carries the words a person needs; this is the line a
    // developer reads, with the tree React walked to get here, which no screen should carry.
    console.error('Mole Office caught a fault while drawing a page.', err, info.componentStack)
  }

  override render(): ReactNode {
    const fault = this.state.fault
    if (fault === null) return this.props.children
    return <TheFault said={{ ...fault, page: this.props.page }} what={FAULT_WORDS.whileDrawing} />
  }
}

// ============================================================================ the press catcher

/**
 * WHAT A PRESS DID WHEN IT STOPPED, or null because it did not.
 *
 * `Btn` holds one of these, so every press in the product is wrapped and no page has to remember.
 * A boundary cannot do this job: React does not catch a fault thrown inside an event handler, and
 * the page is left standing with nothing said, which is the silent failure this must prevent.
 */
export function usePressFault(): [string | null, (run: () => void) => void] {
  const [fault, setFault] = useState<string | null>(null)
  return [fault, (run: () => void) => setFault(whatThePressDid(run))]
}

/**
 * RUN WHAT A PRESS DOES, AND SAY WHAT STOPPED IT, or null because nothing did.
 *
 * A plain function and not part of the hook, so that what it decides can be measured without a
 * browser: the hook is three lines of React around this, and this is the whole of the rule.
 *
 * IT CATCHES ONLY WHAT IT CAN HONESTLY HANDLE. A fault thrown while the handler runs is caught and
 * turned into words a person reads. A request that fails later is not this: every press in this
 * product that sends something already draws the door's own refusal where it stands, and swallowing
 * that here would take the server's sentence off the screen.
 */
export function whatThePressDid(run: () => void): string | null {
  try {
    run()
    return null
  } catch (err) {
    return messageOfFault(err)
  }
}

const FAULT_CSS = `
/* THE ONE DRAWING FOR A FAULT, wherever it is caught. It is an alarm: something really did break,
   and this is the treatment ui.tsx already gives a real failure, in that file's own tokens so it
   follows every palette and both themes rather than carrying a colour of its own. */
.fault {
  display: grid;
  gap: 6px;
  padding: var(--pad);
  max-width: var(--measure-in-box);
  border: var(--border-w) solid var(--st-failed-line);
  border-left: var(--rail) solid var(--st-failed);
  border-radius: var(--radius);
  background: var(--st-failed-bg);
  color: var(--text);
  font-family: var(--font-ui);
  font-size: var(--fs-2);
  line-height: var(--lh-body);
  min-width: 0;
}
.fault-what { margin: 0; font-weight: 600; color: var(--st-failed); }
/* THE FAULT'S OWN WORDS. They are the one thing here nobody wrote for a reader, so they are set
   apart and they wrap rather than being cut at any width. */
.fault-message {
  margin: 0;
  padding: 6px var(--pad);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font-family: var(--font-mono);
  font-size: var(--fs-1);
  line-height: var(--lh-body);
  overflow-wrap: anywhere;
}
.fault-where { margin: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; min-width: 0; }
.fault-key {
  font-size: var(--fs-1);
  font-weight: 600;
  color: var(--text-3);
  letter-spacing: .06em;
  text-transform: uppercase;
}
.fault-value { font-size: var(--fs-2); color: var(--text-2); overflow-wrap: anywhere; }
.fault-none, .fault-says, .fault-filed { margin: 0; font-size: var(--fs-1); color: var(--text-3); }
/* THE PROBLEM THE OFFICE FILED, as a press. It is the reader's way into the record, so it is drawn
   as a link rather than as an id to copy. The id itself follows it in developer mode only. */
.fault-problem { color: var(--text-2); }
.fault-problem-id { margin-left: 6px; color: var(--text-3); font-family: var(--font-mono); overflow-wrap: anywhere; }
.fault-again {
  justify-self: start;
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  padding: 0 var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font: 600 var(--fs-2)/1 var(--font-ui);
  cursor: pointer;
}
.fault-again:hover { background: var(--hover); }
`
