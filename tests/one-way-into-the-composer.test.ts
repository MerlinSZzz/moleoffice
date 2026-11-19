// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE FUNCTION OPENS THE COMPOSER, AND EVERY WAY IN CALLS IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * The four lines that open the composer used to be written twice, once in the right-click listener
 * and once in the press listener. The two copies had already drifted: only one ended showing mode,
 * and only one had a branch for a gesture that arrived with no pointer. Neither drift failed
 * anything. There is one function now, `openAbout`, and these are the assertions that stay true only
 * while there is one.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE AND WHAT IS PROVED IN A BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * Here: what the dispatch decides. Which of three things a right-click means, where the box hangs
 * for a gesture with no pointer, that showing mode ends however the composer was opened, and that
 * one call to `startDispatch` registers one `contextmenu` listener.
 *
 * In a browser: that a real engine delivers the fields those decisions read, and that a person
 * pressing the keys gets a box under the thing they were on.
 * tests/one-listener-for-the-whole-product.test.ts does that against the running product in
 * Chromium. Neither file can do the other's job: this one would pass on a screen nobody could
 * reach, and that one cannot ask what a gesture would mean in an engine that raises no event.
 *
 * ---------------------------------------------------------------------------------------
 * THE PLATFORM STAND-IN, SAID PLAINLY
 * ---------------------------------------------------------------------------------------
 *
 * This runner has no document, so the classes below stand in for the few pieces of one the reader
 * touches: an element with attributes, a walk up to `closest`, and a rectangle. They are a stand-in
 * for the PLATFORM and never for Mole Office's own code — every function under test is the real one. What
 * a real engine actually reports is not asked here and is not claimed here; it is measured, by
 * engine, in claim `wKR0jkvl_7sz`.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { targetAttributeValue } from '../src/shared/targets.ts'

type Open = typeof import('../src/web/components/agent/open.ts')
type Pointing = typeof import('../src/web/components/agent/pointing.ts')

let open: Open
let pointing: Pointing

// ============================================================ the platform stand-in

/** One selector part: `[an-attribute]`, `.a-class`, or a tag name. Commas mean "any of these". */
function selectorMatches(el: Thing, selector: string): boolean {
  return selector.split(',').some((one) => {
    const part = one.trim()
    if (part.startsWith('[') && part.endsWith(']')) return el.attributes.has(part.slice(1, -1))
    if (part.startsWith('.')) return el.classes.includes(part.slice(1))
    return el.tag === part
  })
}

class Thing {
  tag: string
  attributes = new Map<string, string>()
  classes: string[] = []
  parentElement: Thing | null = null
  kids: Thing[] = []
  rect = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }
  /** Every event this element was asked to dispatch, so a test can assert none was faked. */
  dispatched: string[] = []

  constructor(tag: string, attributes: Record<string, string> = {}, classes: string[] = []) {
    this.tag = tag
    this.classes = classes
    for (const [name, value] of Object.entries(attributes)) this.attributes.set(name, value)
  }

  child(kid: Thing): Thing {
    kid.parentElement = this
    this.kids.push(kid)
    return kid
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value)
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name)
  }

  matches(selector: string): boolean {
    return selectorMatches(this, selector)
  }

  closest(selector: string): Thing | null {
    let at: Thing | null = this
    while (at !== null) {
      if (at.matches(selector)) return at
      at = at.parentElement
    }
    return null
  }

  querySelector(selector: string): Thing | null {
    for (const kid of this.kids) {
      if (kid.matches(selector)) return kid
      const deeper = kid.querySelector(selector)
      if (deeper !== null) return deeper
    }
    return null
  }

  querySelectorAll(selector: string): Thing[] {
    const found: Thing[] = []
    for (const kid of this.kids) {
      if (kid.matches(selector)) found.push(kid)
      found.push(...kid.querySelectorAll(selector))
    }
    return found
  }

  contains(other: unknown): boolean {
    let at = other as Thing | null
    while (at !== null && at !== undefined) {
      if (at === this) return true
      at = at.parentElement
    }
    return false
  }

  getBoundingClientRect() {
    return this.rect
  }

  dispatchEvent(event: { type?: string }): boolean {
    this.dispatched.push(event.type ?? 'an event with no type')
    return true
  }
}

interface Registered {
  type: string
  fn: (e: never) => void
  capture: boolean
}

let registered: Registered[] = []

/**
 * THE PAGE'S OWN TREE, which the dispatch asks for by id because point mode is over the page and
 * not over the window. Everything a press is allowed to choose is a child of this; the rail, the top
 * bar and the popup host are not, and that is the whole of what step 18 replaced the document-wide
 * veto with.
 */
const pageStandIn = new Thing('main', { id: 'main' })

const documentStandIn = {
  documentElement: new Thing('html'),
  body: new Thing('body'),
  addEventListener(type: string, fn: (e: never) => void, capture?: boolean) {
    registered.push({ type, fn, capture: capture === true })
  },
  removeEventListener(type: string, fn: (e: never) => void, capture?: boolean) {
    const n = registered.findIndex((one) => one.type === type && one.fn === fn && one.capture === (capture === true))
    if (n >= 0) registered.splice(n, 1)
  },
  getElementById(id: string): Thing | null {
    return id === 'main' ? pageStandIn : null
  },
  querySelector(): Thing | null {
    return null
  },
  // NOTHING ON THIS STAND-IN PAGE CARRIES A TARGET, WHICH IS WHAT BOTH OF THESE SAY. The mark layer
  // asks for every element carrying a key as well as for the first one — it looks for the element
  // drawing a part of a record when nothing carries that part's own key — and a stand-in that
  // answers one of the two questions and raises on the other is a page no browser resembles.
  querySelectorAll(): Thing[] {
    return []
  },
}

/** The handlers `startDispatch` put on the document, by event name. */
function listenersFor(type: string): Registered[] {
  return registered.filter((one) => one.type === type)
}

/** A right-click or a menu key, as the fields the dispatch reads. Nothing else is invented. */
function aMenuEvent(over: { target: Thing; button: number; shiftKey?: boolean; clientX?: number; clientY?: number }) {
  return {
    target: over.target,
    button: over.button,
    shiftKey: over.shiftKey ?? false,
    clientX: over.clientX ?? 0,
    clientY: over.clientY ?? 0,
    preventDefault: () => {},
    stopPropagation: () => {},
  }
}

beforeAll(async () => {
  const platform = globalThis as unknown as Record<string, unknown>
  // `instanceof Element` and `instanceof HTMLElement` both have to answer yes for the stand-in, and
  // the two box types have to answer no, because a `<tr>` is not a text box and the reader asks.
  platform.Element = Thing
  platform.HTMLElement = Thing
  platform.HTMLInputElement = class {}
  platform.HTMLTextAreaElement = class {}
  platform.document = documentStandIn
  platform.window = {
    // Nothing is selected in any of these cases. What a selection does to the answer is
    // tests/an-unsent-instruction.test.ts and tests/seven-surfaces.test.ts.
    getSelection: () => null,
    location: { hash: '#/records', search: '' },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  open = await import('../src/web/components/agent/open.ts')
  pointing = await import('../src/web/components/agent/pointing.ts')
})

beforeEach(() => {
  registered = []
  open.closeTheComposer()
  open.stopShowing()
})

/** A row on the records table: it says what it is, it says what it is called, and it has a size. */
function aRow(): Thing {
  const row = new Thing('tr', {
    'data-target': targetAttributeValue({ kind: 'record', recordId: 'rEC0rd000001', workspaceId: 'wORKspace001' }),
    'data-name': 'What the gripper did on Tuesday',
  })
  row.rect = { left: 120, top: 200, right: 900, bottom: 224, width: 780, height: 24 }
  // ON THE PAGE, because a press in point mode is only taken on the page's own things and a row
  // floating outside every tree is not a case this product has.
  pageStandIn.child(row)
  return row
}

// ============================================================ 1. what a right-click means

describe('a right-click is read as one of three things, in an order that is measured', () => {
  /**
   * `Shift+F10` in Chromium arrives with `button === -1` and `shiftKey === false` — claim
   * `wKR0jkvl_7sz`, headless and headed. So the keyboard is what this event is.
   */
  it('reads a menu raised from the keyboard as the keyboard', () => {
    expect(open.whatTheMenuDoes({ button: -1, shiftKey: false })).toBe('keyboard')
  })

  /**
   * THE ORDER IS THE ASSERTION, and this is the case that fails if it is reversed.
   *
   * Chromium says the shift key is NOT held for `Shift+F10`. An engine that said it was would send
   * this event into the Shift escape and the keyboard route would never run anywhere. The keyboard
   * test therefore comes first, and this asks for the answer that only that order gives.
   */
  it('keeps the keyboard route when the engine says the shift key is held as well', () => {
    expect(open.whatTheMenuDoes({ button: -1, shiftKey: true })).toBe('keyboard')
  })

  it('leaves a Shift right-click to the browser', () => {
    expect(open.whatTheMenuDoes({ button: 2, shiftKey: true })).toBe('native')
  })

  it('reads an ordinary right-click as a pointer', () => {
    expect(open.whatTheMenuDoes({ button: 2, shiftKey: false })).toBe('pointer')
  })

  /**
   * WHY `askToTalkAbout` NO LONGER BUILDS ONE OF THESE. A `MouseEvent` made in code reports
   * `button: 0` unless somebody sets it, and this is what the dispatch would make of that: an
   * ordinary pointer gesture, at whatever coordinates the faker chose. The lie was harmless while
   * nothing read `button`. It stopped being harmless when `button` became the keyboard detector.
   */
  it('would read a made-up event as an ordinary pointer, which is why nothing makes one', () => {
    expect(open.whatTheMenuDoes({ button: 0, shiftKey: false })).toBe('pointer')
  })
})

// ============================================================ 2. where the box hangs

describe('a right-click on touch or pen is not Mole Office\'s to take', () => {
  /**
   * Long-press is how a person selects a word on a screen with no mouse. Taking the menu there would
   * invert the owner's invariant on that platform: selecting would become invoking. Point mode is
   * the designed route on touch, and §10 of the contract records what that costs.
   */
  it('reads a touch and a pen as neither the keyboard nor a pointer', () => {
    expect(open.whatTheMenuDoes({ button: 2, shiftKey: false, pointerType: 'touch' })).toBe('touch')
    expect(open.whatTheMenuDoes({ button: 2, shiftKey: false, pointerType: 'pen' })).toBe('touch')
  })

  it('still reads a mouse as a pointer', () => {
    expect(open.whatTheMenuDoes({ button: 2, shiftKey: false, pointerType: 'mouse' })).toBe('pointer')
  })

  /**
   * A gesture raised from the keyboard carries no pointer and therefore no pointer type. The
   * keyboard test comes first so that a missing field cannot be read as a mouse, and so that an
   * engine reporting `pointerType: ''` for it does not change the answer.
   */
  it('keeps the keyboard route ahead of the pointer type, whatever that field says', () => {
    expect(open.whatTheMenuDoes({ button: -1, shiftKey: false, pointerType: '' })).toBe('keyboard')
    expect(open.whatTheMenuDoes({ button: -1, shiftKey: false, pointerType: 'touch' })).toBe('keyboard')
  })

  /**
   * THE POINTER TYPE IS READ OFF THIS EVENT. The rejected design kept the last pointer type seen
   * anywhere in a module value, which on a machine with a screen and a mouse swallows every mouse
   * right-click after anybody touches anything. This asserts the function has no memory: the same
   * two calls in the other order give the same two answers.
   */
  it('has no memory of the last pointer', () => {
    open.whatTheMenuDoes({ button: 2, shiftKey: false, pointerType: 'touch' })
    expect(open.whatTheMenuDoes({ button: 2, shiftKey: false, pointerType: 'mouse' })).toBe('pointer')
    expect(open.whatTheMenuDoes({ button: 2, shiftKey: false, pointerType: 'touch' })).toBe('touch')
  })
})

describe('what a press in point mode is allowed to choose', () => {
  const onThePage = () => {
    const el = new Thing('div', { 'data-target': targetAttributeValue({ kind: 'page', route: '/' }) })
    pageStandIn.child(el)
    return el as unknown as HTMLElement
  }
  const inTheFrame = () => new Thing('div') as unknown as HTMLElement

  it('takes nothing at all while the mode is off', () => {
    expect(open.pressChoosesTheSubject(false, onThePage(), null)).toBe(false)
  })

  it('takes one of the page\'s own things', () => {
    expect(open.pressChoosesTheSubject(true, onThePage(), null)).toBe(true)
  })

  it('leaves the frame alone, which is what makes the rail navigate again', () => {
    expect(open.pressChoosesTheSubject(true, inTheFrame(), null)).toBe(false)
  })

  it('takes nothing where nothing said what it was', () => {
    expect(open.pressChoosesTheSubject(true, null, null)).toBe(false)
  })

  it('is not a drag: four pixels is a press and five is a choice of words', () => {
    expect(open.pressChoosesTheSubject(true, onThePage(), 4)).toBe(true)
    expect(open.pressChoosesTheSubject(true, onThePage(), 5)).toBe(false)
  })

  // PROBLEM hj-gfm7qV5Uw. Chromium moves a finger's click towards the target under it, so a touch
  // press has a larger allowance; a pen keeps the mouse's, because a pen drags across words.
  // MUTATION: give touch the mouse's four pixels, or give a pen the touch allowance; this case goes red.
  it('is a tap: sixteen pixels is a tap for a finger, and a pen keeps the mouse allowance', () => {
    expect(open.pressChoosesTheSubject(true, onThePage(), 5, 'touch')).toBe(true)
    expect(open.pressChoosesTheSubject(true, onThePage(), 16, 'touch')).toBe(true)
    expect(open.pressChoosesTheSubject(true, onThePage(), 17, 'touch')).toBe(false)
    expect(open.pressChoosesTheSubject(true, onThePage(), 5, 'pen')).toBe(false)
    expect(open.pressChoosesTheSubject(true, onThePage(), 5, 'mouse')).toBe(false)
  })
})

describe('a gesture with no pointer hangs the box under the thing, not at a corner', () => {
  it('puts it at the left edge of the element, six pixels below it', () => {
    const row = aRow()
    expect(open.whereItHangs({ at: 'element', element: row as unknown as HTMLElement })).toEqual({ x: 120, y: 230 })
  })

  it('puts it at the pointer when there was one', () => {
    expect(open.whereItHangs({ at: 'pointer', x: 640, y: 480 })).toEqual({ x: 640, y: 480 })
  })

  /**
   * DELETING THE GATE AT STEP 17 CREATED THIS CASE AND THE OLD LINE COULD NOT SURVIVE IT. The
   * listener read `found.element` to place a keyboard menu, and after the deletion `found` is null
   * in exactly the case the deletion admits: a menu raised from the keyboard where nothing above the
   * gesture says what it is. Two edits, or a keyboard menu on a mute surface throws.
   */
  it('still has somewhere to hang when nothing under the gesture declares', () => {
    const text = { parentElement: new Thing('p') }
    text.parentElement.rect = { left: 40, top: 60, right: 200, bottom: 80, width: 160, height: 20 }
    const platform = globalThis as unknown as Record<string, unknown>
    const wasNode = platform.Node
    platform.Node = class {}
    Object.setPrototypeOf(text, (platform.Node as { prototype: object }).prototype)
    const at = open.withoutAPointer(text as unknown as EventTarget, null)
    platform.Node = wasNode
    expect(at).toEqual({ at: 'element', element: text.parentElement })
  })

  it('hangs it under the element the person was on, not the bigger thing that declares', () => {
    const row = aRow()
    const link = new Thing('a')
    link.rect = { left: 140, top: 202, right: 400, bottom: 220, width: 260, height: 18 }
    row.child(link)
    const at = open.withoutAPointer(link as unknown as EventTarget, row as unknown as HTMLElement)
    expect(open.whereItHangs(at)).toEqual({ x: 140, y: 226 })
  })
})

// ============================================================ 3. one function, and what it always does

describe('openAbout is the one way in, and it does the same four things every time', () => {
  it('ends showing mode, whichever way the composer was opened', () => {
    open.showWhatCanBeTalkedAbout()
    expect(open.isShowing()).toBe(true)
    open.openAbout(null, { at: 'pointer', x: 10, y: 20 })
    expect(open.isShowing()).toBe(false)
  })

  it('answers a press on nothing with the page, at the point it was given', () => {
    open.openAbout(null, { at: 'pointer', x: 10, y: 20 })
    const held = open.whatIsOpen()
    expect(held.opened?.pointed.context.target).toEqual({ kind: 'page', route: '/records' })
    expect(held.opened?.at).toEqual({ x: 10, y: 20 })
  })

  it('opens about the thing that says what it is, and calls it what the page calls it', () => {
    const row = aRow()
    open.openAbout(row as unknown as Node, { at: 'element', element: row as unknown as HTMLElement })
    const held = open.whatIsOpen()
    expect(held.opened?.pointed.context.target).toEqual({
      kind: 'record',
      recordId: 'rEC0rd000001',
      workspaceId: 'wORKspace001',
    })
    expect(held.opened?.pointed.about).toBe('What the gripper did on Tuesday')
    expect(held.opened?.at).toEqual({ x: 120, y: 230 })
  })
})

// ============================================================ 4. the one listener

describe('the product attaches one contextmenu listener and takes it off again', () => {
  /**
   * A second listener that called `stopPropagation` would make a dead spot on the page that nothing
   * on screen could show and no type could catch, so the number is asserted rather than assumed.
   * The same question is put to the RUNNING product in
   * tests/one-listener-for-the-whole-product.test.ts, which is where a listener added by some other
   * component would show up.
   */
  it('registers exactly one, on the document', () => {
    const stop = open.startDispatch()
    expect(listenersFor('contextmenu').length).toBe(1)
    stop()
  })

  it('registers the listeners the dispatch needs and nothing else', () => {
    const stop = open.startDispatch()
    expect(registered.map((one) => one.type).sort()).toEqual([
      'click', 'contextmenu', 'keydown', 'pointerdown', 'selectionchange',
      'touchcancel', 'touchend', 'touchmove', 'touchstart',
    ])
    stop()
  })

  it('leaves none behind when the layer goes', () => {
    const stop = open.startDispatch()
    stop()
    expect(registered.length).toBe(0)
  })

  it('ends showing mode when the layer goes, so nothing is left outlined with nobody listening', () => {
    const stop = open.startDispatch()
    open.showWhatCanBeTalkedAbout()
    stop()
    expect(open.isShowing()).toBe(false)
  })
})

// ============================================================ 5. the two gestures that had no position

describe('the keyboard reaches the composer through the same listener as the mouse', () => {
  /**
   * THE BRANCH THIS REPLACES WAS DEAD, AND THE COORDINATES ARE WHY.
   *
   * The old test was `clientX === 0 && clientY === 0`. A keyboard menu in Chromium arrives at the
   * centre of the focused element — measured at `(56, 98)` for a button at `x 24, y 88` — so that
   * condition was never true and the box was placed at the pointer coordinates of a gesture that had
   * no pointer. This event carries exactly those coordinates and the box does not go there.
   */
  it('hangs the box under the focused element, not at the coordinates the event carries', () => {
    const row = aRow()
    const link = new Thing('a')
    link.rect = { left: 140, top: 202, right: 400, bottom: 220, width: 260, height: 18 }
    row.child(link)
    const stop = open.startDispatch()
    const menu = listenersFor('contextmenu')[0]
    expect(menu).toBeDefined()
    menu?.fn(aMenuEvent({ target: link, button: -1, clientX: 270, clientY: 211 }) as never)
    stop()
    expect(open.whatIsOpen().opened?.at).toEqual({ x: 140, y: 226 })
  })

  it('opens nothing at all when the shift key is held, so the browser keeps its menu', () => {
    const row = aRow()
    const stop = open.startDispatch()
    listenersFor('contextmenu')[0]?.fn(aMenuEvent({ target: row, button: 2, shiftKey: true, clientX: 300, clientY: 210 }) as never)
    stop()
    expect(open.whatIsOpen().opened).toBe(null)
  })

  /**
   * `Enter` on an outlined element raises a click reporting `clientX 0, clientY 0`, and no
   * `pointerdown` came before it. The press listener used to take those numbers as a position and
   * open the box at the top-left corner of the window.
   */
  it('hangs the box under the element for a press that no pointer began', () => {
    const row = aRow()
    const stop = open.startDispatch()
    open.showWhatCanBeTalkedAbout()
    listenersFor('click')[0]?.fn(aMenuEvent({ target: row, button: 0, clientX: 0, clientY: 0 }) as never)
    stop()
    expect(open.whatIsOpen().opened?.at).toEqual({ x: 120, y: 230 })
  })

  it('takes the pointer position when a pointer began the press', () => {
    const row = aRow()
    const stop = open.startDispatch()
    open.showWhatCanBeTalkedAbout()
    listenersFor('pointerdown')[0]?.fn({ clientX: 300, clientY: 210 } as never)
    listenersFor('click')[0]?.fn(aMenuEvent({ target: row, button: 0, clientX: 300, clientY: 210 }) as never)
    stop()
    expect(open.whatIsOpen().opened?.at).toEqual({ x: 300, y: 210 })
  })

  it('opens nothing for a drag, because dragging across words chooses words', () => {
    const row = aRow()
    const stop = open.startDispatch()
    open.showWhatCanBeTalkedAbout()
    listenersFor('pointerdown')[0]?.fn({ clientX: 300, clientY: 210 } as never)
    listenersFor('click')[0]?.fn(aMenuEvent({ target: row, button: 0, clientX: 420, clientY: 213 }) as never)
    stop()
    expect(open.whatIsOpen().opened).toBe(null)
  })

  /**
   * THE MODE'S OWN OFF SWITCH USED TO BE NAMED HERE BY ITS CLASS, and so did the host every popup
   * is drawn in. Both exemptions are gone and neither is missed: the control is in the rail and the
   * host is the last child of the shell, so neither is inside the page and the one rule below covers
   * both. A rule that names a component has to be added to again every time somebody adds a
   * component; this one never does.
   */
  it('leaves the frame its presses, so the control that ends the mode ends it and opens nothing', () => {
    const control = new Thing('button', {
      'data-target': targetAttributeValue({ kind: 'uiSurface', surfaceId: 'rail.home' }),
    })
    const stop = open.startDispatch()
    open.showWhatCanBeTalkedAbout()
    listenersFor('click')[0]?.fn(aMenuEvent({ target: control, button: 0 }) as never)
    stop()
    expect(open.whatIsOpen().opened).toBe(null)
  })

  /**
   * The same question with nothing to do with a class: a declared element that is NOT on the page.
   * Before step 18 this opened a composer, which is how pressing a rail row in point mode filed a
   * comment instead of navigating.
   */
  it('takes no press on a declared thing outside the page', () => {
    const railRow = new Thing('a', {
      'data-target': targetAttributeValue({ kind: 'uiSurface', surfaceId: 'rail.modules' }),
      'data-name': 'Modules',
    })
    railRow.rect = { left: 0, top: 100, right: 231, bottom: 132, width: 231, height: 32 }
    const stop = open.startDispatch()
    open.showWhatCanBeTalkedAbout()
    let stopped = 0
    const press = aMenuEvent({ target: railRow, button: 0, clientX: 40, clientY: 110 })
    press.preventDefault = () => { stopped += 1 }
    listenersFor('click')[0]?.fn(press as never)
    stop()
    expect(open.whatIsOpen().opened, 'a press on the rail chose a subject').toBe(null)
    expect(stopped, 'a press on the rail was stopped from doing what it does').toBe(0)
  })
})

// ============================================================ 6. the entry path that is not a gesture

describe('a control asking for the box goes through the same function and fakes nothing', () => {
  /**
   * IT USED TO DISPATCH A `contextmenu` EVENT IT HAD BUILT ITSELF, so the document listener would
   * answer it. That event reported `button: 0` — the left mouse button — for a gesture where no
   * button was pressed at all, and the dispatch now reads `button`. Two assertions, because either
   * one alone can be satisfied while the other is broken: the composer opened, and no event was
   * invented to open it.
   */
  it('opens the composer about the element, under the element', () => {
    const row = aRow()
    pointing.askToTalkAbout(row as unknown as HTMLElement)
    const held = open.whatIsOpen()
    expect(held.opened?.pointed.context.target).toEqual({
      kind: 'record',
      recordId: 'rEC0rd000001',
      workspaceId: 'wORKspace001',
    })
    expect(held.opened?.at).toEqual({ x: 120, y: 230 })
  })

  it('dispatches no event of any kind', () => {
    const row = aRow()
    pointing.askToTalkAbout(row as unknown as HTMLElement)
    expect(row.dispatched).toEqual([])
  })

  it('opens nothing when there is no element, rather than opening the page', () => {
    pointing.askToTalkAbout(null)
    expect(open.whatIsOpen().opened).toBe(null)
  })
})
