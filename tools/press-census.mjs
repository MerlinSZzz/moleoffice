// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// For one record page at Full: every element carrying data-target, duplicates of the same key, and
// for each pressable element a right-click: what the composer chip says and where the frame/rail lands.
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { whereIsTheApi, whereIsTheWebApp } from './where-is-the-api.mjs'
import { refuseAStaleWorld } from './freshness.mjs'
const BASE = whereIsTheWebApp(undefined, { ifUnset: 'http://127.0.0.1:5199' })
const id = process.argv[2]
const OUT = process.argv[3] ?? `${id}-press.json`
const ONLY = process.argv[4] ?? null   // e.g. 'record' to press only record rows
// REFUSE TO MEASURE A STALE WORLD, BEFORE ANYTHING IS MEASURED. Criterion G6 of
// design/ground/ACCEPTANCE.md. Two whole gate runs were invalidated by a browser serving a
// seven-hour-old transform of src/shared and nothing said the code was old; a live API served stale
// code through an entire gate. A sweep of a stale world produces numbers that look like
// measurements and are measurements of code nobody has any more. tools/freshness.mjs asks the
// server, because only the server knows what it loaded.
await refuseAStaleWorld(whereIsTheApi(), 'tools/press-census.mjs')

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 }, colorScheme: 'light' })
await ctx.addInitScript(() => { window.localStorage.setItem('mole-office.workspace', 'panelx'); window.localStorage.setItem('mole-office.detail', 'full'); window.localStorage.setItem('mole-office.pictures', 'drawn') })
const page = await ctx.newPage()
const writes = []
page.on('request', (r) => { if (r.method() !== 'GET') writes.push(`${r.method()} ${r.url()}`) })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
await page.goto(`${BASE}/#/r/${id}`, { waitUntil: 'load', timeout: 60000 })
await page.waitForSelector('.rd-report, .rd, main', { timeout: 30000 })
await page.waitForTimeout(1500)
const listed = await page.evaluate(() => {
  const els = [...document.querySelectorAll('[data-target]')]
  return els.map((el, i) => {
    const r = el.getBoundingClientRect()
    return { i, key: el.getAttribute('data-target'), tag: el.tagName.toLowerCase(), cls: el.className?.toString().slice(0, 60), top: Math.round(r.top + window.scrollY), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), text: (el.innerText ?? '').trim().replace(/\s+/g, ' ').slice(0, 70) }
  })
})
const byKey = new Map()
for (const e of listed) byKey.set(e.key, (byKey.get(e.key) ?? []).concat(e.i))
const dups = [...byKey].filter(([, v]) => v.length > 1).map(([k, v]) => ({ key: k, at: v }))
const presses = []
const candidates = listed.filter((e) => e.w > 0 && e.h > 0 && (ONLY === null || e.key.startsWith(ONLY)))
for (const e of candidates) {
  const hadComposer = await page.evaluate(() => { const b = document.querySelector('.px-talk-close'); if (b) { b.click(); return true } return false })
  if (hadComposer) await page.waitForSelector('.px-talk', { state: 'detached', timeout: 3000 }).catch(() => {})
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  await page.evaluate((i) => { document.querySelectorAll('[data-target]')[i].scrollIntoView({ block: 'center' }) }, e.i)
  await page.waitForTimeout(300) // let pictures and folds settle so the point is measured on the final layout
  const r = await page.evaluate((i) => { const el = document.querySelectorAll('[data-target]')[i]; const b = el.getBoundingClientRect(); return { x: b.left + Math.min(b.width / 2, 200), y: b.top + Math.min(b.height / 2, 12) } }, e.i)
  // the element actually under the point, before pressing
  // THE ELEMENT UNDER THE POINT, BY IDENTITY AND NOT BY KEY. A row inside a closed fold keeps a layout
  // box under an open panel's row for the same record, so comparing keys called the visible row "the
  // wrong drawing" five times on 2 September 2026 when the mouse was over it and the mark was right.
  const underIdx = await page.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); const t = el?.closest('[data-target]'); if (!t) return -1; return [...document.querySelectorAll('[data-target]')].indexOf(t) }, r)
  const under = underIdx < 0 ? null : (listed[underIdx]?.key ?? null)
  if (underIdx !== e.i) { presses.push({ pressed: e.key, i: e.i, text: e.text, underPoint: under, underIndex: underIdx, skipped: underIdx < 0 ? 'nothing addressable under its point' : (under === e.key ? 'another drawing of the same record is under its point (this one is folded or covered)' : 'not under its own point (folded or covered)') }); continue }
  await page.mouse.click(r.x, r.y, { button: 'right' })
  await page.waitForTimeout(700)
  const seen = await page.evaluate(() => {
    const kind = document.querySelector('.px-talk-chip-kind')?.textContent?.trim() ?? null
    const what = document.querySelector('.px-talk-chip-what')
    const chip = what ? { kind, what: what.textContent?.trim(), whole: what.getAttribute('title'), chips: document.querySelector('.px-talk-chips')?.innerText?.replace(/\s+/g, ' ').trim() } : null
    const pieces = [...document.querySelectorAll('.px-subject > *')].map((p) => ({ cls: p.className, left: parseFloat(p.style.left), top: parseFloat(p.style.top), width: parseFloat(p.style.width), height: parseFloat(p.style.height) }))
    // which addressable element each frame/rail piece sits on
    const els = [...document.querySelectorAll('[data-target]')]
    const on = pieces.map((p) => {
      // exact box first (a frame), else the innermost addressable element containing the piece's top-left (a rail)
      let exact = null
      for (const [i, el] of els.entries()) {
        const b = el.getBoundingClientRect(); const top = b.top; const left = b.left
        const d = Math.abs(top - p.top) + Math.abs(left - p.left) + Math.abs(b.width - p.width) + Math.abs(b.height - p.height)
        if (d <= 3 && (exact === null || d < exact.d)) exact = { d, i, key: el.getAttribute('data-target'), how: 'frame-exact' }
      }
      if (exact !== null) return exact
      let inner = null
      for (const [i, el] of els.entries()) {
        const b = el.getBoundingClientRect(); const top = b.top; const left = b.left
        const inside = p.top >= top - 1 && p.top <= top + b.height + 1 && p.left >= left - 40 && p.left <= left + b.width + 1
        if (inside && (inner === null || b.height <= inner.h)) inner = { i, key: el.getAttribute('data-target'), how: 'contains', h: b.height }
      }
      return inner
    })
    const composerRoot = document.querySelector('.px-talk, [data-target^="draft"]')
    const composerTarget = [...document.querySelectorAll('[data-context], [data-about], [data-subject]')].map((el) => el.getAttribute('data-context') ?? el.getAttribute('data-about') ?? el.getAttribute('data-subject')).slice(0, 3)
    return { chip, pieces, on, composerTarget, composerHtml: composerRoot ? composerRoot.outerHTML.slice(0, 400) : null }
  })
  presses.push({ pressed: e.key, i: e.i, text: e.text, underPoint: under, chip: seen.chip, pieces: seen.pieces, landsOn: seen.on, composerTarget: seen.composerTarget, composerHtml: presses.length === 0 ? seen.composerHtml : undefined })
  process.stderr.write(`${e.key.slice(0, 50).padEnd(50)} under=${String(under === e.key).padEnd(5)} chip=${JSON.stringify(seen.chip?.what ?? null).slice(0, 40)} on=${seen.on.map((o) => o?.key === e.key ? 'SAME' : (o?.key ?? '?').slice(0, 40)).join('|')}\n`)
}
await browser.close()
writeFileSync(OUT, JSON.stringify({ id, errs, writes, dups, listed, presses }, null, 2))
console.log(`elements=${listed.length} dupKeys=${dups.length} presses=${presses.length} writes=${writes.length} errs=${errs.length}`)
