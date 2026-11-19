// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT EVERY REPORT IN THE CORPUS DRAWS AT EVERY READING LENGTH, MEASURED IN A REAL BROWSER.
 *
 * The instrument for problem 2. It reports each report at each of the seven positions — read off
 * `RUNGS` in src/shared/detail.ts, so it measures the ladder the product has.
 *
 * FIVE OF THE SEVEN ARE OPENED IN A BROWSER AND TWO ARE READ OFF THE ROUTE. Criterion A19, the
 * owner's decision of 3 September 2026, stops a reader at the conclusion, so a report page does not
 * draw levels 1 and 2 and there is no page for this to measure. Those two rows carry the stored
 * words from `GET /api/records/:id/short-forms` instead, and every row says which it was in
 * `readFrom`. The counts below are page counts and are absent on those two rows.
 *
 * For the five it opens in a browser it counts what is inside the report body:
 *
 *   words     the words of the report's own writing. The page's furniture is removed first --
 *             the byline, the reading-length control, the foot, and the words the page uses to
 *             talk ABOUT the report -- so a level that draws nothing of the report counts 0
 *             rather than counting the controls around it.
 *   regions   elements carrying a region target: the parts of the report a person can point at.
 *   targets   every `data-target` inside the body, region or block, including the body itself.
 *
 * IT ALSO KEEPS THE WORDS. `text` is what the body actually drew at that length, and
 * `targetValues` is every target in it. A count says a level is not empty; only the words say
 * whether a person could understand the report from it, and that is the question the owner
 * asked. Nothing here judges that -- it hands over what they would be reading.
 *
 * Usage:  node tools/zoom-sweep.mjs [outfile.json] [recordId]
 *         MOLE_OFFICE_API=… MOLE_OFFICE_URL=… to read another instance -- which is how the
 *         same instrument reads an old checkout running beside the live one.
 *         MOLE_OFFICE_WORKSPACE=… names the project whose reports are read. It defaults to
 *         `panelx`, which is the live corpus; a freshly seeded database has its records in
 *         `default`. ADDED 2 September 2026, because the alternative was copying this file and
 *         editing one header in the copy -- two instruments that would drift, to read one number.
 */
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { whereIsTheApi, whereIsTheWebApp, whichWorkspace } from './where-is-the-api.mjs'
import { refuseAStaleWorld } from './freshness.mjs'
import { anAgentsToolHeaders } from './sandbox-common.mjs'

const API = whereIsTheApi()
const BASE = whereIsTheWebApp()
const WORKSPACE = whichWorkspace()
// WHO THIS TOOL ASKS AS, with MOLE_AGENT_KEY when set, as the other tools do (tools/sandbox-common.mjs). After the
// close a read that names nobody and carries no key is refused.
const WHO = anAgentsToolHeaders({ withoutAKey: process.env['MOLE_OFFICE_AGENT'] || 'zoom-sweep' })
// THE SEVEN POSITIONS, READ OFF THE DECLARATION RATHER THAN COPIED. This was a literal list until
// 3 September 2026, and a literal is how an instrument comes to measure a ladder the product no
// longer has: the day `card`, `brief` and `account` were retired for the three lengths written by
// part, a copied list would have swept three positions that draw nothing and missed the three that
// do. `src/shared/detail.ts` is where the ladder is declared and this reads it.
const { RUNGS, READER_FLOOR, isReaderRung } = await import('../src/shared/detail.ts')
const OUT = process.argv[2] ?? 'tools/shots/zoom-sweep.json'
const ONLY = process.argv[3] ?? null

// REFUSE TO MEASURE A STALE WORLD, BEFORE ANYTHING IS MEASURED. Criterion G6 of
// design/ground/ACCEPTANCE.md. Two whole gate runs were invalidated by a browser serving a
// seven-hour-old transform of src/shared and nothing said the code was old; a live API served stale
// code through an entire gate. A sweep of a stale world produces numbers that look like
// measurements and are measurements of code nobody has any more. tools/freshness.mjs asks the
// server, because only the server knows what it loaded.
await refuseAStaleWorld(API, 'tools/zoom-sweep.mjs')

const listed = await (await fetch(`${API}/api/records?kind=report`, { headers: { 'x-mole-office-workspace': WORKSPACE, ...WHO } })).json()
const all = (listed.records ?? listed).map((r) => ({ id: r.id, title: r.title }))
const reports = ONLY === null ? all : all.filter((r) => r.id === ONLY)
if (all.length === 0) throw new Error('no reports came back from the API; nothing was measured')
if (reports.length === 0) throw new Error(`${ONLY} is not one of the ${String(all.length)} reports this API serves; nothing was measured`)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 }, colorScheme: 'light' })
await ctx.addInitScript(() => { window.localStorage.setItem('mole-office.pictures', 'drawn') })
const page = await ctx.newPage()
const rows = []

for (const report of reports) {
  // WHAT THE ROUTE HOLDS AT EVERY POSITION, FETCHED ONCE PER REPORT. It is how the two positions
  // below the reader floor are reported, and nothing else reads it.
  const served = await (
    await fetch(`${API}/api/records/${report.id}/short-forms`, { headers: { 'x-mole-office-workspace': WORKSPACE, ...WHO } })
  ).json()

  for (const rung of RUNGS) {
    // A POSITION A READER CANNOT REACH IS READ OFF THE ROUTE, NOT OFF A REPORT PAGE.
    //
    // Criterion A19, from 3 September 2026: a person reads a report no lower
    // than the conclusion. So a report page does not draw levels 1 and 2 at all, and asking it for
    // one now draws the conclusion instead.
    //
    // THE SWEEP STILL REPORTS ALL SEVEN, and it says where each row was read. Dropping the two
    // rows would stop the instrument reporting a level the product still writes, still stores and
    // still draws in lists; keeping them while reading the conclusion's page would report one
    // length's drawing under another length's name, which is the third engineering invariant
    // broken by an instrument. So these rows carry the stored words and the counts a page would
    // have given are simply not there — an absent count beats a zero that means nothing was drawn.
    if (!isReaderRung(rung)) {
      const held = (served.levels ?? []).find((one) => one.rung === rung) ?? null
      const text = held?.text ?? null
      rows.push({
        id: report.id,
        title: report.title,
        rung,
        readFrom: 'the short-forms route',
        whyNotThePage: `a reader goes no lower than ${READER_FLOOR}, so a report page does not draw this position`,
        missing: text === null,
        state: held?.state ?? null,
        drawnFrom: held?.from ?? null,
        text: text ?? '',
        // TRUE OF A WHOLE-RECORD FORM AND NOT A STAND-IN FOR A COUNT NOBODY TOOK: levels 1 and 2
        // are one text about the whole report, so they have no parts at all.
        parts: 0,
        partHeadings: [],
        partTexts: [],
      })
      process.stderr.write(
        `${report.id} ${rung.padEnd(7)} read off the short-forms route — ${text === null ? 'missing' : 'written'}\n`,
      )
      continue
    }
    await page.goto(`${BASE}/#/r/${report.id}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.evaluate((r) => { window.localStorage.setItem('mole-office.detail', r) }, rung)
    await page.reload({ waitUntil: 'load', timeout: 60000 })
    await page.waitForSelector('.rd-report', { timeout: 30000 })
    await page.waitForTimeout(600)
    const seen = await page.evaluate(() => {
      const body = document.querySelector('.rd-report')
      if (body === null) return null
      const count = (el) => ((el?.innerText ?? '').trim().split(/\s+/).filter((w) => w.length > 0).length)
      // THE FURNITURE IS SUBTRACTED FROM WHAT THE PAGE ACTUALLY DREW, never removed from a detached
      // copy: innerText on a node that is not laid out falls back to the markup order and counts
      // words no reader can see.
      //
      // THE FURNITURE, NAMED, AND THE TEST FOR IT: is this the page talking about the report, or the
      // report? The byline, the reading-length control and the foot are the page. So are the
      // outline's own two labels -- the words saying the outline is a selection, and the words
      // beside each line saying why it was kept -- the mark saying a line was written for this
      // length, and the statement saying what stands at this length -- whether that is that no
      // summary was written, or that nobody recorded which the title is, or that the summary is
      // drawn above the report. Counting any of them as report words made one report draw MORE
      // words at length 5 than at Full, which is the instrument being wrong and not the page.
      //
      // THE THREE OUTLINE SELECTORS LEFT THIS LIST ON 2 September 2026 WITH THE OUTLINE ITSELF, and
      // the paragraph below is kept because the mistake it records is the one this list exists for.
      //
      // `.sb-outline-alone` WAS MISSING FOR FOUR COMMITS AND THE NUMBERS SAID SO. `c618cbc` made a
      // name of a part say, under itself, that this reading length draws nothing else of the part
      // it names -- and did not tell this list. Measured on `OOOt4Kouc5dT` at reading length 4 on
      // 30 August 2026: EIGHT such marks, sixteen words each once the Absence component's full
      // sentence is read out, 128 words, counted as words of the report. The length appeared to
      // have gained 136 words when it had gained eight. A mark saying what the page did not draw
      // is the page talking about the report, so it goes here with the rest of them.
      const parts = {}
      let furniture = 0
      // `.sb-level:not(.sb-foot *)` MATCHES THE LEVEL CONTROL ABOVE THE WRITING AND NOT THE ONE IN
      // THE FOOT. The foot's control is inside `.sb-foot`, and every word of `.sb-foot` is already
      // subtracted by the next selector in this list, so each of the two controls comes off exactly
      // once. It replaced `.sb-read-as` on 2 September 2026.
      //
      // PLAIN `.sb-level` SUBTRACTED THE FOOT'S CONTROL TWICE, and every row of this sweep was 3 or
      // 4 words low from 2 to 3 September 2026 — problem `3zX5YOrCMlX0`. The preset row it replaced
      // was drawn only above the report, so one bare selector was right for that; the level control
      // is drawn twice. The comment written with the change said the foot's copy was already
      // counted there, which is true, and did not notice that the selector counted it again.
      //
      // `.rd-report-tag` IS THE WORDS *THE REPORT*, the label the record page draws over the report
      // to say what kind of thing this is. It sits inside `.rd-report` and was never on this list,
      // so every row this sweep has ever written counted two of the page's own words as the
      // report's. Found on 3 September 2026 while checking the row above: report `FPf58Hfk7_z_` at
      // length 1 draws a four-word abstract and the sweep said six.
      for (const sel of ['.rd-report-tag', '.rd-byline', '.sb-level:not(.sb-foot *)', '.sb-foot', '.sb-nosummary']) {
        let n = 0
        for (const el of body.querySelectorAll(sel)) n += count(el)
        parts[sel] = n
        furniture += n
      }
      const targets = [...body.querySelectorAll('[data-target]')].map((el) => el.getAttribute('data-target'))
      return {
        words: count(body) - furniture,
        furniture,
        furnitureParts: parts,
        regions: body.querySelectorAll('[data-target^="region"]').length,
        targets: targets.length,
        targetValues: targets,
        rungDrawn: body.querySelector('.sb')?.getAttribute('data-rung') ?? null,
        // WHICH ANSWER THIS LENGTH GAVE about its own form. TWO, and there used to be four. The
        // other two — the title column standing at level 2, and a form the surface above the report
        // had already drawn — went with the fallback on 3 September 2026, criterion A14a.
        summaryWritten: body.querySelectorAll('[data-summary="written"]').length,
        summaryMissing: body.querySelectorAll('[data-summary="missing"]').length,
        // THE REPORT'S PARTS, AT THE THREE LENGTHS WRITTEN BY PART. A count of the parts drawn, and
        // of the headings and texts inside them, so a level that says it draws six parts can be
        // checked against six headings rather than against a number the page reported about itself.
        parts: body.querySelectorAll('.sb-part').length,
        partHeadings: [...body.querySelectorAll('.sb-part-heading')].map((el) => (el.innerText ?? '').trim()),
        partTexts: [...body.querySelectorAll('.sb-part-text')].map((el) => (el.innerText ?? '').trim()),
        // WHAT THE READING POSITION SAID, IN THE WORDS A PERSON READS. A count says a length is not
        // silent; only the sentence says whether it told them anything.
        summarySaid: [...body.querySelectorAll('.sb-nosummary')].map((el) => (el.innerText ?? '').trim()),
        // THE FORM THE BODY DREW AT THIS LENGTH, AND THE STORED PATH ITS CHARACTERS CAME FROM.
        // `drawnFrom` is `data.shortForms.label` at length 1, the bare word `title` at length 2 and
        // the bare word `summary` at length 3 — because since 3 September 2026 lengths 2 and 3 ARE
        // the record's own title and summary columns, criterion A14b. A row whose `drawnFrom` is
        // `data.shortForms.title` or `data.shortForms.gist` would be a retired key back on a page.
        openLines: [...body.querySelectorAll('.sb-open-line')].map((el) => ({
          rung: el.getAttribute('data-rung'),
          drawnFrom: el.getAttribute('data-drawn-from'),
          text: (el.innerText ?? '').trim(),
        })),
        text: body.innerText ?? '',
      }
    })
    if (seen === null) throw new Error(`no report body on ${report.id} at ${rung}`)
    if (seen.rungDrawn !== rung) throw new Error(`asked for ${rung} on ${report.id}, page drew ${seen.rungDrawn}`)
    // WHETHER THIS LENGTH HAS A FORM OF ITS OWN. It used to be `fellBackTo`, the length that
    // supplied the words where the asked one had none: at levels 4 to 6 a report whose parts nobody
    // had written drew the nearest shorter written form, which was the gist. The owner ended that on
    // 3 September 2026 — criterion A14a — so a length with no form of its own draws one line saying
    // so and this reports it as MISSING rather than as a fallback.
    const missing = seen.summaryMissing > 0
    rows.push({ id: report.id, title: report.title, rung, readFrom: 'the report page', missing, ...seen })
    process.stderr.write(
      `${report.id} ${rung.padEnd(7)} words=${String(seen.words).padStart(5)} parts=${String(seen.parts).padStart(3)} ` +
        `regions=${String(seen.regions).padStart(4)} targets=${String(seen.targets).padStart(4)} ` +
        `${missing ? 'missing' : 'written'}\n`,
    )
  }
}

await browser.close()
writeFileSync(OUT, JSON.stringify(rows, null, 2))
console.log(`wrote ${OUT} — ${rows.length} rows over ${reports.length} report${reports.length === 1 ? '' : 's'}`)
