#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MEASURE FOUR BROWSER FACTS THAT THE ROUND-NINE DESIGN DEPENDS ON, one engine at a time.
 *
 *     node tools/engine-probe.mjs
 *     node tools/engine-probe.mjs --engines chromium,firefox
 *     node tools/engine-probe.mjs --headed          (needs a display; see the note below)
 *
 * WHY THIS EXISTS. Four browser behaviours decide whether central parts of the round-nine design
 * work at all, and each of them has already misled somebody who assumed instead of measuring:
 *
 *   Fact 1 — a context menu raised from the KEYBOARD: does it arrive with `button === -1`?
 *            Step 13's handler order branches on exactly this value.
 *   Fact 2 — `Shift+F10`: does it arrive with `shiftKey` true?
 *            `PointingLayer.tsx:446` returns early when `shiftKey` is true, so if the answer is yes
 *            the keyboard path is dead. The failure matrix measured FALSE in headless Chromium.
 *   Fact 3 — does moving focus into a text box collapse the document selection?
 *            This is the reason Mole Office has to paint the source highlight itself at all.
 *   Fact 4 — does `CSS.highlights` exist, and does a registered highlight actually PAINT?
 *            Existing is not painting. Both are measured here, separately.
 *
 * WHAT IT PROMISES.
 *
 * 1. **A control runs before every measurement, and a failed control voids the measurement.**
 *    Before any keyboard press, a real right-click must produce a `contextmenu` event. If it does
 *    not, the listener is not working and the keyboard results are recorded as `not measured`, never
 *    as `no`. A run that never started looks exactly like a run that failed.
 *    The paint check has its own control: two identical screenshots of an untouched element. If
 *    those two differ the element is not stable enough to compare, and the paint result is voided.
 * 2. **An engine that will not launch is recorded, not skipped.** Its cells read `not measured` with
 *    the launch error, so no other engine's answer can be mistaken for it.
 * 3. **Every raw field survives.** The full per-event record goes to `.logs/engine-probe/`, so any
 *    line of the summary table can be checked against the bytes it came from.
 *
 * WHAT IT DOES NOT COVER. The owner's own browser, which cannot be driven from here. Headless is
 * the default because this machine's display belongs to the owner; `--headed` exists, and the
 * facts are re-measurable under it, but nothing in this file claims a headed result was taken.
 *
 * The probe page is `about:blank` with injected HTML. No server, no network, no Mole Office instance.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileNameStamp, localStamp } from '../src/shared/time.ts'

const ENGINES = ['chromium', 'firefox', 'webkit']

const args = process.argv.slice(2)
let engines = ENGINES
let headless = true
let outPath = null
let emitPage = false

while (args.length > 0) {
  const flag = args.shift()
  if (flag === '--engines') engines = args.shift().split(',').map((s) => s.trim()).filter(Boolean)
  else if (flag === '--headed') headless = false
  else if (flag === '--json') outPath = args.shift()
  else if (flag === '--emit-page') emitPage = true
  else {
    console.error(`engine-probe: unknown argument ${flag}`)
    process.exit(2)
  }
}

for (const name of engines) {
  if (!ENGINES.includes(name)) {
    console.error(`engine-probe: ${name} is not one of ${ENGINES.join(', ')}`)
    process.exit(2)
  }
}

const PAGE = `
<style>
  body { font: 16px/1.5 system-ui, sans-serif; margin: 24px; background: #fff; color: #111; }
  #prose { width: 480px; }
  #box { display: block; width: 320px; height: 60px; margin-top: 16px; }
  ::highlight(px-probe) { background-color: #ff0000; color: #0000ff; }
</style>
<p id="prose">The quick brown fox jumps over the lazy dog and keeps going for a while.</p>
<button id="btn">A button</button>
<textarea id="box">draft text here</textarea>
<input id="field" value="a field">
`

/**
 * Every contextmenu field a keyboard-versus-pointer decision could reasonably read, and the key
 * presses too. The key record is what tells "the engine raises no menu event from the keyboard"
 * apart from "the synthetic key press never reached the page", which look identical in the
 * contextmenu record alone.
 */
const LISTENER = `
  window.__pxEvents = []
  window.__pxKeys = []
  document.addEventListener('keydown', (e) => {
    window.__pxKeys.push({ type: 'keydown', key: e.key, code: e.code, shiftKey: e.shiftKey, isTrusted: e.isTrusted })
  })
  document.addEventListener('contextmenu', (e) => {
    window.__pxEvents.push({
      button: e.button,
      buttons: e.buttons,
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      clientX: e.clientX,
      clientY: e.clientY,
      screenX: e.screenX,
      screenY: e.screenY,
      detail: e.detail,
      pointerType: 'pointerType' in e ? e.pointerType : null,
      mozInputSource: 'mozInputSource' in e ? e.mozInputSource : null,
      target: e.target && e.target.id ? '#' + e.target.id : (e.target ? e.target.nodeName : null),
      isTrusted: e.isTrusted,
    })
    e.preventDefault()
  })
`

const NOT_MEASURED = 'not measured'

/**
 * THE SAME FOUR QUESTIONS, AS A PAGE A PERSON OPENS THEMSELVES.
 *
 * Nothing here can drive the owner's browser. This page is how their cells get filled: they open it,
 * makes three gestures, and reads four answers off the screen. Two of the four answer themselves as
 * soon as the page loads.
 */
const OWNER_PAGE = `<!doctype html>
<meta charset="utf-8">
<title>Four browser questions</title>
<style>
  body { font: 16px/1.6 system-ui, sans-serif; margin: 32px; max-width: 46rem; color: #111; background: #fff; }
  h1 { font-size: 1.4rem; }
  li { margin-bottom: .4rem; }
  #answers { border-collapse: collapse; margin: 1.5rem 0; width: 100%; }
  #answers td, #answers th { border: 1px solid #ccc; padding: .5rem .6rem; text-align: left; vertical-align: top; }
  .waiting { color: #777; }
  #prose { background: #f6f6f6; padding: .6rem; }
  textarea { display: block; width: 20rem; height: 3rem; margin-top: .8rem; }
  pre { background: #f6f6f6; padding: .8rem; overflow-x: auto; }
  ::highlight(px-probe) { background-color: #ffd000; color: #101010; }
</style>
<h1>Four browser questions</h1>
<p>This page measures four things about the browser you are reading it in. Two answer themselves.
The other two need you to make a gesture. Nothing is sent anywhere; the answers stay on this page.</p>
<ol>
  <li>Right-click the button below once. That is the control: it proves this page can see the menu gesture at all.</li>
  <li>Click the button so it has focus, then press <b>Shift</b> and <b>F10</b> together.</li>
  <li>Click the button again, then press the <b>menu key</b> if your keyboard has one (usually right of the space bar).</li>
</ol>
<button id="btn">Right-click me, then press Shift+F10</button>
<p id="prose">The quick brown fox jumps over the lazy dog and keeps going for a while.</p>
<textarea id="box">a text box</textarea>
<table id="answers"><tbody></tbody></table>
<p>If you are sending this back, copy the block below.</p>
<pre id="raw"></pre>
<script>
  const state = { browser: navigator.userAgent, control: null, shiftF10: null, menuKey: null, focusCollapses: null, cssHighlights: null, highlightPaints: null }
  const rows = [
    ['A right-click is seen by this page at all (the control)', 'control'],
    ['Shift+F10 raises a menu event, and what it says', 'shiftF10'],
    ['The menu key raises a menu event, and what it says', 'menuKey'],
    ['Moving focus into a text box wipes the selected words', 'focusCollapses'],
    ['This browser has the CSS highlight registry', 'cssHighlights'],
    ['A registered highlight actually paints', 'highlightPaints'],
  ]
  function draw() {
    const body = document.querySelector('#answers tbody')
    body.innerHTML = ''
    for (const [label, key] of rows) {
      const tr = document.createElement('tr')
      const th = document.createElement('th'); th.textContent = label
      const td = document.createElement('td')
      const value = state[key]
      td.textContent = value === null ? 'waiting for you' : value
      if (value === null) td.className = 'waiting'
      tr.append(th, td); body.append(tr)
    }
    document.getElementById('raw').textContent = JSON.stringify(state, null, 2)
  }
  document.addEventListener('contextmenu', (e) => {
    const said = 'button ' + e.button + ', shiftKey ' + e.shiftKey + ', at (' + e.clientX + ', ' + e.clientY + ')'
    if (e.shiftKey && e.button === -1) state.shiftF10 = 'yes — ' + said
    else if (e.button === -1) state.shiftF10 = state.shiftF10 === null ? 'yes — ' + said : state.shiftF10
    if (e.button !== -1) state.control = 'yes — ' + said
    e.preventDefault()
    draw()
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ContextMenu') setTimeout(() => { if (state.menuKey === null) { state.menuKey = 'no menu event followed the key'; draw() } }, 300)
    if (e.key === 'F10' && e.shiftKey) setTimeout(() => { if (state.shiftF10 === null) { state.shiftF10 = 'no menu event followed the keys'; draw() } }, 300)
  })
  // The two that answer themselves.
  const prose = document.getElementById('prose')
  const range = document.createRange()
  range.setStart(prose.firstChild, 4)
  range.setEnd(prose.firstChild, 43)
  const selection = getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
  const before = selection.toString().length
  document.getElementById('box').focus()
  const after = selection.rangeCount > 0 ? selection.getRangeAt(0).getClientRects().length : 0
  state.focusCollapses = before > 0 ? (after === 0 ? 'yes — the words are no longer drawn as selected' : 'no — they are still drawn') : 'could not tell, nothing was selected'
  document.getElementById('box').blur()
  selection.removeAllRanges()
  try {
    const r2 = document.createRange()
    r2.setStart(prose.firstChild, 4)
    r2.setEnd(prose.firstChild, 43)
    CSS.highlights.set('px-probe', new Highlight(r2))
    state.cssHighlights = 'yes'
    state.highlightPaints = 'look at the paragraph above: if part of it is yellow, yes'
  } catch (error) {
    state.cssHighlights = 'no — ' + error
    state.highlightPaints = 'no, there is no registry to paint from'
  }
  draw()
</script>
`

async function probeEngine(name) {
  const playwright = await import('playwright')
  const result = { engine: name, headless, launched: false, version: null, steps: {}, facts: {} }

  let browser
  try {
    browser = await playwright[name].launch({ headless })
  } catch (error) {
    result.launchError = String(error && error.message ? error.message : error).split('\n').slice(0, 3).join(' ')
    for (const key of ['f1KeyboardButton', 'f2ShiftF10ShiftKey', 'f3FocusCollapsesSelection', 'f4CssHighlights', 'f4HighlightPaints', 'x1SavedRangeSurvivesFocus', 'x2ShiftRightClickShiftKey']) {
      result.facts[key] = { answer: NOT_MEASURED, why: 'the engine did not launch' }
    }
    return result
  }

  try {
    result.launched = true
    result.version = browser.version()
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
    await page.setContent(PAGE)
    await page.evaluate(LISTENER)

    const btnBox = await page.locator('#btn').boundingBox()
    result.steps.buttonBox = btnBox

    // ---- Control, and it runs first: a real right-click must be seen -------------------------
    await page.evaluate('window.__pxEvents = []')
    await page.locator('#btn').click({ button: 'right' })
    await page.waitForTimeout(60)
    const control = await page.evaluate('window.__pxEvents')
    result.steps.controlMouseRightClick = control
    const listenerWorks = control.length > 0

    // ---- The other half of the same handler: Shift held with a real right-click ---------------
    // Step 13's order is: button -1 means the keyboard, otherwise shiftKey means hand the gesture
    // to the browser. That second arm is only an escape hatch if a shifted right-click actually
    // reports shiftKey true, so it is measured here rather than assumed.
    await page.evaluate('window.__pxEvents = []')
    await page.locator('#btn').click({ button: 'right', modifiers: ['Shift'] })
    await page.waitForTimeout(60)
    result.steps.shiftRightClick = await page.evaluate('window.__pxEvents')

    // ---- Fact 2 and half of fact 1: Shift+F10 with focus on a button --------------------------
    let shiftF10 = []
    let contextMenuKey = []
    let shiftF10Keys = []
    let contextMenuKeys = []
    let contextMenuKeyError = null
    if (listenerWorks) {
      await page.evaluate('window.__pxEvents = []; window.__pxKeys = []; document.getElementById("btn").focus()')
      await page.keyboard.press('Shift+F10')
      await page.waitForTimeout(120)
      shiftF10 = await page.evaluate('window.__pxEvents')
      shiftF10Keys = await page.evaluate('window.__pxKeys')

      // ---- The other keyboard route: the dedicated ContextMenu key ---------------------------
      await page.evaluate('window.__pxEvents = []; window.__pxKeys = []; document.getElementById("btn").focus()')
      try {
        await page.keyboard.press('ContextMenu')
        await page.waitForTimeout(120)
        contextMenuKey = await page.evaluate('window.__pxEvents')
        contextMenuKeys = await page.evaluate('window.__pxKeys')
      } catch (error) {
        contextMenuKeyError = String(error && error.message ? error.message : error).split('\n')[0]
      }
    }
    result.steps.shiftF10 = shiftF10
    result.steps.shiftF10Keys = shiftF10Keys
    result.steps.contextMenuKey = contextMenuKey
    result.steps.contextMenuKeys = contextMenuKeys
    result.steps.contextMenuKeyError = contextMenuKeyError

    // ---- Fact 3, and the supplementary fact the engine-neutral paint rests on ------------------
    const focusCase = await page.evaluate(() => {
      const prose = document.getElementById('prose')
      const text = prose.firstChild
      const range = document.createRange()
      range.setStart(text, 4)
      range.setEnd(text, 43)
      const selection = getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      const read = () => ({
        text: selection.toString(),
        rangeCount: selection.rangeCount,
        collapsed: selection.isCollapsed,
        rects: selection.rangeCount > 0 ? selection.getRangeAt(0).getClientRects().length : 0,
      })
      const before = read()
      // The range Mole Office would keep for itself, cloned before anything moves.
      const saved = selection.getRangeAt(0).cloneRange()
      window.__pxSaved = saved
      const savedBefore = { text: saved.toString(), rects: saved.getClientRects().length }
      document.getElementById('box').focus()
      const after = read()
      const savedAfter = { text: saved.toString(), rects: saved.getClientRects().length }
      return {
        before,
        after,
        savedBefore,
        savedAfter,
        activeElement: document.activeElement ? document.activeElement.id || document.activeElement.nodeName : null,
      }
    })
    result.steps.focusCase = focusCase

    // ---- Fact 4a: does the registry exist and accept a highlight? -----------------------------
    const registry = await page.evaluate(() => {
      const out = {
        cssObject: typeof CSS !== 'undefined',
        highlightsProperty: typeof CSS !== 'undefined' && 'highlights' in CSS && CSS.highlights != null,
        highlightConstructor: typeof Highlight,
        selectorParses: typeof CSS !== 'undefined' && CSS.supports ? CSS.supports('selector(::highlight(px-probe))') : null,
        registered: null,
        size: null,
        sizeAfterDelete: null,
        error: null,
      }
      try {
        const prose = document.getElementById('prose')
        const range = document.createRange()
        range.setStart(prose.firstChild, 4)
        range.setEnd(prose.firstChild, 43)
        CSS.highlights.set('px-probe', new Highlight(range))
        out.registered = CSS.highlights.has('px-probe')
        out.size = CSS.highlights.size
        CSS.highlights.delete('px-probe')
        out.sizeAfterDelete = CSS.highlights.size
      } catch (error) {
        out.error = String(error && error.message ? error.message : error)
      }
      return out
    })
    result.steps.registry = registry

    // ---- Fact 4b: does a registered highlight actually PAINT? ---------------------------------
    // Control first: two screenshots of the untouched element must be byte-identical. If they are
    // not, this element cannot be compared and the paint answer is voided rather than guessed.
    let paint = { control: null, changed: null, why: null }
    if (registry.registered === true) {
      await page.evaluate(() => {
        getSelection().removeAllRanges()
        document.getElementById('box').blur()
      })
      await page.waitForTimeout(60)
      const first = await page.locator('#prose').screenshot()
      const second = await page.locator('#prose').screenshot()
      paint.control = Buffer.compare(first, second) === 0
      if (paint.control) {
        await page.evaluate(() => {
          const prose = document.getElementById('prose')
          const range = document.createRange()
          range.setStart(prose.firstChild, 4)
          range.setEnd(prose.firstChild, 43)
          CSS.highlights.set('px-probe', new Highlight(range))
        })
        await page.waitForTimeout(120)
        const painted = await page.locator('#prose').screenshot()
        paint.changed = Buffer.compare(first, painted) !== 0
        await page.evaluate(() => CSS.highlights.delete('px-probe'))
      } else {
        paint.why = 'two screenshots of the untouched element differ; the comparison is not sound here'
      }
    } else {
      paint.why = 'no highlight could be registered'
    }
    result.steps.paint = paint

    // ---- Turn the recordings into four answers ------------------------------------------------
    const keyboardEvent = shiftF10[0] || contextMenuKey[0] || null
    const keyboardRoute = shiftF10.length > 0 ? 'Shift+F10' : (contextMenuKey.length > 0 ? 'ContextMenu key' : null)
    const keysArrived = `keydown seen: Shift+F10 ${JSON.stringify(shiftF10Keys.map((k) => k.key))}, ContextMenu key ${JSON.stringify(contextMenuKeys.map((k) => k.key))}`

    result.facts.f1KeyboardButton = !listenerWorks
      ? { answer: NOT_MEASURED, why: 'the control right-click produced no contextmenu event' }
      : keyboardEvent === null
        ? { answer: 'no event', why: `neither Shift+F10 nor the ContextMenu key raised a contextmenu event; ${keysArrived}` }
        : {
            answer: keyboardEvent.button === -1 ? 'yes' : 'no',
            value: keyboardEvent.button,
            route: keyboardRoute,
            why: `${keyboardRoute} raised contextmenu with button ${keyboardEvent.button}`,
          }

    const shiftEvent = shiftF10[0] || null
    result.facts.f2ShiftF10ShiftKey = !listenerWorks
      ? { answer: NOT_MEASURED, why: 'the control right-click produced no contextmenu event' }
      : shiftEvent === null
        ? { answer: 'no event', why: `Shift+F10 raised no contextmenu event at all; ${keysArrived}` }
        : {
            answer: shiftEvent.shiftKey ? 'yes' : 'no',
            value: shiftEvent.shiftKey,
            why: `Shift+F10 raised contextmenu with shiftKey ${shiftEvent.shiftKey}, button ${shiftEvent.button}, at (${shiftEvent.clientX}, ${shiftEvent.clientY})`,
          }

    const collapsed = focusCase.before.text.length > 0 &&
      (focusCase.after.collapsed === true || focusCase.after.text.length === 0 || focusCase.after.rects === 0)
    result.facts.f3FocusCollapsesSelection = focusCase.before.text.length === 0
      ? { answer: NOT_MEASURED, why: 'the control selection was empty before focus moved' }
      : {
          answer: collapsed ? 'yes' : 'no',
          why: `before focus: ${focusCase.before.rects} rects, text ${JSON.stringify(focusCase.before.text.slice(0, 24))}; after focus into the textarea: ${focusCase.after.rects} rects, rangeCount ${focusCase.after.rangeCount}, text ${JSON.stringify(focusCase.after.text.slice(0, 24))}`,
        }

    const shifted = (result.steps.shiftRightClick || [])[0] || null
    result.facts.x2ShiftRightClickShiftKey = !listenerWorks
      ? { answer: NOT_MEASURED, why: 'the control right-click produced no contextmenu event' }
      : shifted === null
        ? { answer: 'no event', why: 'a shifted right-click raised no contextmenu event' }
        : {
            answer: shifted.shiftKey ? 'yes' : 'no',
            why: `a right-click with Shift held reports shiftKey ${shifted.shiftKey}, button ${shifted.button}`,
          }

    result.facts.x1SavedRangeSurvivesFocus = focusCase.savedBefore.rects === 0
      ? { answer: NOT_MEASURED, why: 'the cloned range had no rectangles before focus moved' }
      : {
          answer: focusCase.savedAfter.rects > 0 ? 'yes' : 'no',
          why: `a cloned Range kept by the page returns ${focusCase.savedBefore.rects} rectangles before focus and ${focusCase.savedAfter.rects} after`,
        }

    result.facts.f4CssHighlights = {
      answer: registry.highlightsProperty && registry.highlightConstructor === 'function' ? 'yes' : 'no',
      why: `CSS.highlights ${registry.highlightsProperty ? 'present' : 'absent'}, Highlight constructor ${registry.highlightConstructor}, ::highlight() selector parses ${registry.selectorParses}, registered ${registry.registered}, size ${registry.size}${registry.error ? `, error ${registry.error}` : ''}`,
    }

    result.facts.f4HighlightPaints = paint.changed === null
      ? { answer: NOT_MEASURED, why: paint.why || 'the paint comparison did not run' }
      : {
          answer: paint.changed ? 'yes' : 'no',
          why: `control screenshots identical: ${paint.control}; the element's pixels ${paint.changed ? 'changed' : 'did not change'} when a highlight was registered`,
        }

    await page.close()
  } catch (error) {
    result.error = String(error && error.message ? error.message : error).split('\n').slice(0, 3).join(' ')
  } finally {
    await browser.close()
  }

  return result
}

const FACT_LABELS = [
  ['f1KeyboardButton', 'keyboard menu has button === -1'],
  ['f2ShiftF10ShiftKey', 'Shift+F10 reports shiftKey true'],
  ['f3FocusCollapsesSelection', 'focus into a text box collapses the selection'],
  ['f4CssHighlights', 'CSS.highlights exists'],
  ['f4HighlightPaints', 'a registered highlight paints'],
  ['x1SavedRangeSurvivesFocus', 'a cloned Range still returns rectangles after focus moved'],
  ['x2ShiftRightClickShiftKey', 'a shifted right-click reports shiftKey true'],
]

if (emitPage) {
  mkdirSync('.logs/engine-probe', { recursive: true })
  const pagePath = outPath || join('.logs/engine-probe', 'owner-probe.html')
  writeFileSync(pagePath, OWNER_PAGE)
  console.log(`the page a person opens in their own browser: ${pagePath}`)
  process.exit(0)
}

const results = []
for (const name of engines) {
  process.stderr.write(`engine-probe: ${name}\n`)
  results.push(await probeEngine(name))
}

const stamp = fileNameStamp(new Date()) // local wall-clock time, chapter 4 rule 8 (acceptance finding 63)
mkdirSync('.logs/engine-probe', { recursive: true })
const file = outPath || join('.logs/engine-probe', `${stamp}.json`)
writeFileSync(file, JSON.stringify({ takenAt: localStamp(new Date()), headless, results }, null, 2))

const width = Math.max(...FACT_LABELS.map(([, label]) => label.length))
const columns = results.map((r) => (r.launched ? `${r.engine} ${r.version}` : `${r.engine} (no launch)`))
const cell = (s) => String(s).padEnd(14)
console.log(`\n${'fact'.padEnd(width)}  ${columns.map(cell).join('')}`)
console.log('-'.repeat(width + 2 + columns.length * 14))
for (const [key, label] of FACT_LABELS) {
  const row = results.map((r) => cell((r.facts[key] && r.facts[key].answer) || NOT_MEASURED))
  console.log(`${label.padEnd(width)}  ${row.join('')}`)
}
for (const r of results) {
  if (!r.launched) console.log(`\n${r.engine}: did not launch — ${r.launchError}`)
  else if (r.error) console.log(`\n${r.engine}: run error — ${r.error}`)
}
console.log(`\nfull record: ${file}`)
