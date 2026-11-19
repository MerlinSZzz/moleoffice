# Office Map

An independent, read-only woodland observer. It reads only `projects`, `people`, `work` and `talk` through
`office-read/1`. Its only office import is the published `src/shared/plugin-read.ts` contract. The generic switch
stays off until the later measurement and review gates are met.

From the repository root, using the installed toolchain:

```sh
npm --prefix plugins/office-map run build
npm --prefix plugins/office-map run typecheck
npm --prefix plugins/office-map test
npm --prefix plugins/office-map run check
```

The staged build writes `plugins/office-map/dist/`, which is excluded from git. The complete check validates the
manifest, imports, strict types, tests, build and the derived aggregate compatibility envelope. The named
`tests/build-budget.test.ts` also builds fresh production inputs and enforces the authoritative split limits,
so the generic check cannot bypass them. No host source or manifest changes are
needed for this observer.

Rooms follow the current authorized roster's recorded roles and starters. They do not establish a current reporting
relationship or a permission. Creation time and id order allocate fixed village homes. Later arrivals and retirement
alone move no surviving seat, including after reload while the same historical rows remain supplied. Rewriting old
timestamps, roles or membership, or removing rows, can change the replay. Retired rows reserve places without a visible
person or active count. No private history is stored. Human
rows are static contacts: their live presence, appearance and work are not supplied. Every supplied simultaneous work
row and its explicit agent/project association remains separate. Closed unchecked work says so. Original saved
appearance and scale values are never changed or rerolled.

Search matches names and handles. Project filtering changes matching lists and nameplates without moving seats,
resizing the office or recolouring bodies. The exact text list has twenty entries per page and Previous/Next controls;
there is no hidden roster cap. Hover or focus gives a brief reading. Click, tap or Enter pins all authorized current
work rows, presence and original profile fields. Search selection locates the home once. Ordinary reads preserve the
search input, list focus and open detail sections.
The room list likewise shows twenty rooms per page, with each supplied occupant count. Show room fits that room
without changing the roster, filters, seat positions or the selected person's details.

Arrow keys or dragging pan the map. Pinch and the zoom buttons change scale; Home or Fit shows the office. When one
area's name has no place clear of every room at ten pixels, as at the whole of a large office, the map leaves every
area name out, and a line under the map says so until the names fit again. Hit targets
are at least 44 CSS pixels regardless of zoom. Woodland clearings and smaller labelled districts carry totals and team names; the text list and seven
named work groups remain available. Follow is an explicit session choice, applies only during a visible cosmetic
walk, and stops on manual pan or Escape. Quiet view and host reduced motion show standing drawings and disable walks,
pose previews and animated following. Locate remains a single static camera step. There is no ambient animation or idle tick.

Only the selected village registry is imported when this page opens. Six lossless atlases hold the reviewed
house layers, furniture, woodland pieces, all sixteen standing looks, their approved gaits and three still poses each.
The five earlier portraits are no longer imported or built. Unused older scenery is absent from the build.
The atlas catalogue records native canvas sizes, trim offsets, anchors, source hashes, source pixel hashes and atlas hashes. The packer
reconstructs every complete native canvas and verifies its exact RGBA hash; no pixel is repainted or resampled.

Every emitted file belongs to exactly one explicit group in `build-budget.json`: initial resources or the
combined lazy action descriptor and body assets. That config alone declares both byte limits. Unknown files
and files matching both groups fail. `npm run build` and the size test share its reader and validator.
The manifest's aggregate envelope is derived from the two limits and checked for drift; it cannot replace
either limit. The separate encoded-art ceiling and compressed runtime plus selected art policy remain 5 MiB.
Native PNG dimensions are checked before allocation and
against the decoded image, with a 24 MiB image budget and at most one 4 MiB temporary decode. Two 26-pixel terrain
pattern canvases and the 256-by-160 detail canvas are counted separately. Missing art leaves plain houses, desks,
names, neutral markers, search and read details usable, with an explicit unavailable message.

Each 2,548 by 1,794 village has six fixed home plots around its own furnished square, with styles
A03/B03/A01/A03/B01/B02 and eighteen native desk places. Later villages follow a fixed square spiral.
A team reuses its own available places first, then takes the nearest free plot. An annex repeats the team's name
and colour sign. No home is resized or relocated as the office grows. The earlier nine-house avenue templates remain
in the catalogue and geometry fixtures; the page uses the stepped village planner instead.

Option A, the lawn square, is built from round 9f's approved recipes and atlas pieces. Its walks are 52 native pixels
wide, with a lawn between meeting pockets. Loose planting uses mixed groups and quiet gaps; visible atlas bounds
keep additions away from houses, doors, walks and cell edges. No tan prop halos are drawn. Native homes and seats
match main at both 100 and 5,000 people. The common-square rectangle is still the allocation footprint of the lawn,
not an earth fill. The village cell has not changed.

New dressing and existing woodland plants are rasterized into 512-pixel tiles. The native and far-view caches each
retain at most 8 MiB, evict old tiles, and clear on model/pack changes and close. Complete tiles include their off-camera
fringe. Their construction yields after each sprite and drops unfinished pixels on cancellation. Far tiles also cache their grass and winding paths. Woodland planning
also yields while arranging houses, paths and trees. Actor updates restore the composed background; they never
rebuild dressing or woodland. Original furniture and house fronts retain their depth order around actors.

Every supplied door connects to its village's square or lower lane, and neighbouring villages have joining lanes.
Each variant's own floor, back, partition where supplied, front,
ground anchors, collision polygons, walkable openings and hit polygons travel together. Front-layer openings are
the door pieces; no generic door is painted over them. Native desk-slot x positions and sizes are retained. Proposed
desk y positions are moved inward only when needed to retain the existing 176-pixel front approach band: A03's
proposed lower slots otherwise seal its doors. Seats keep the reviewed standing bands; local route legs use a 16-pixel
step from their actual native start, without requiring a village origin to be divisible by sixteen.
Route checks use polygon intersection and the same floor and road as the renderer.
Tall woodland pieces stay outside houses, doors and person targets.

Each station has a native desk, laptop, papers, mug and lamp. Empty plots use native garden pieces. Each square has
the same approved tea garden, notice boards, fountain, benches, lanterns, planters and signposts. Trees and berry
bushes occupy fixed woodland bands. Every drawn desk is solid even when its place is empty or reserved; square
furniture uses its supplied collision polygon or the existing lower-footprint fallback. These pieces are scenery;
inspection uses the people and room controls. Furniture never uses work, project filtering, presence, wall-clock time or randomness.

Standing appearance is a display translation of the saved host value. Valid version-2 ids map as follows:

| Saved id | Standing look |
| --- | --- |
| bare | Crest |
| scarf | Bun |
| sand-apron | Apron |
| cocoa-vest | Part |
| silver-glasses | Waves |

The unchanged, original version-3 apron options also map to Apron. Version 1, modified version-3 variants, unknown,
invalid or absent appearance values use a 32-bit FNV-1a-style hash over the Unicode code points of the published agent identity key, modulo sixteen, in
this order: Tuft, Fringe, Bun, Fan, Crest, Helmet, Waves, Part, Beret, Knit, Raincoat, Apron, Bowtie, Backpack, Roll,
Flower. The detail card labels substitutes and preserves the original value. This translation does not reproduce
all old garment combinations. More than sixteen agents repeat looks, and hash collisions can repeat them sooner.
Every action uses the same standing scale, which ports the host's display conversion:
`.80 + (saved - .3) / (1.6 - .3) * .12`. The saved value remains unchanged; a missing scale retains a neutral marker.
Walks and poses retain the same look and native canvas origin as standing; no per-frame bounding-box recentering is used.

Each mole has a compact short name and a symbol plus a group word. Desk fronts, doorways, all home bodies,
passing bodies and other nameplates are protected by geometry. The most actionable simultaneous row supplies the
badge: needs handling, working, checking and delivering, paused, waiting, not yet sure, then done. All rows remain
in the details panel. A task declaration, unchecked closure or missing check outcome cannot establish done.
Checking and delivering uses carry; done requires every supplied row to be confirmed complete before cheer appears.
Other groups stand. Preview wave is an explicit local toggle for the selected mole; quiet view, reduced motion,
selection changes and page teardown clear it. A wave never comes from work or sends a message.

The canvas covers the stepped viewport, never a whole-office bitmap. A spatial index selects visible seats. A cached
static layer holds the visible ground, rooms and desks. Search, filter, selection and work changes reuse that layer.
Moving areas restore the background and redraw all overlapping actors in depth order; dense dirty areas repaint the
visible surface once. Two simultaneous surfaces together stay within 20 MiB, lowering render resolution before
allocation when DPR would exceed that amount. The selected pack, surfaces, one temporary decode, terrain tiles and one detail canvas total less than
49 MiB under these allocation gates. These are bounds, not the later browser heap or frame-time measurements.

Refresh is manual, with one outstanding request per view even across a changed context. A slow view cannot block the
other views or the local controls. Each view keeps its own last success, stale/error state and permission narrowing.
The page shows one read time, the oldest of Projects, Roster, People and Work, and names a view only when its read
failed, never came or was narrowed; no atomic snapshot, source completeness or expiry is invented. A transport
failure retains last successful
data only in the same published context and stops motion. A permission refusal clears all private joins immediately
and stops the refused view until a changed context. Every changed published context clears old data and tags. Old
requests cannot be cancelled through v1, so they finish before another request for that view is sent; their answers
are discarded.

First open, resume, quiet return and offscreen return establish a fresh `start=latest` talk baseline. Even a populated
baseline never animates. Later reads request twenty messages, advance both published cursors, and retain a bounded
batch of projected metadata without text. A repeated answer is consumed once. Only authorized agent endpoints with
visible homes are eligible; at most one visible recipient per message is chosen. Withdrawals and removed/offscreen
endpoints cancel gestures. An incomplete withdrawal page clears motion and suppresses its new gestures; over-budget
withdrawals refuse the reading rather than silently dropping a cancellation.

There are at most four active gestures, including route waits, and sixteen queued. Each expires fifteen seconds after
receipt, including queue and route time. One worker route request runs at a time. A recipient approach is reserved
for one gesture; conflicts wait or expire. Routes use a sparse graph of doors, room lanes and the square, built once in the geometry worker. Short local searches join seats to doors. Found, no-path, exhausted and
unavailable outcomes kept distinct. Each look walks A, pass, B, pass, held 200 ms each. Arc-distance interpolation
keeps travel uniform across route segments; a reversed horizontal direction mirrors immediately, retaining facing through vertical
segments. Approved registered drawings retain their shared ground origin and use the standing scale. When the gesture
ends its home drawing returns. Full contact-sequence acceptance is not claimed. Work badges stay factual, and walking
never implies sent, delivered or read. There is no message-marking or other office write path.

Idle/offscreen, hidden, paused, quiet and reduced-motion states cancel pending animation frames and motion timers.
An expired or cancelled route also terminates its worker search. Its static layout remains readable; another worker
starts only when a later permitted gesture needs a route.
Hidden/pause/context changes terminate the geometry worker. Visibility returns reuse a suspended layout only after fresh authorized people produce the exact same roster key. Changed context, permissions or roster discard it. This avoids repeated worker creation during visibility stress while hidden reads and route callbacks still clear. Up to four cleared drawing contexts are reused within the page; teardown drops the pool.
Page teardown also releases pack images, canvas buffers,
listeners, model caches and route data, rejecting late callbacks. Returning never replays a skipped interval. The v1
slot has no off/close or permission-epoch message: leaving or switching off removes its iframe, and pagehide/unload
perform teardown. The observer cannot claim to see a permission change before an authorized answer reports it.

The page consumes `layoutVillageSteps` through the worker, never its synchronous study wrapper. The worker stops
after 2 ms or 64 yield steps; page index and paint work stops after 2 ms or 256 steps. Native home art appears at
300 CSS pixels per village and above. Farther out, uniformly scaled house symbols stand in woodland clearings, joined by small paths.
Below 96 pixels per village, villages form districts; towns with at least 48 villages group below 196 pixels, matching
the chosen 2x2 town-map study. Clearings keep room for population totals and team names. Internal ids stay out of labels
and accessible targets. Labels drop whole words and keep the total alone when a team name cannot fit. Every art projection uses equal axes and nearest pixels. The existing .25 zoom threshold and 160-person cap still govern individual
bodies and targets. Search/locate from an overview opens the selected native home.

The published roster has no departure or group-end time to reproduce reclaiming, so retired places stay reserved.
A completed map remains visible while a replacement roster builds, and changing north/west bounds preserves the
camera's world anchor. Only an initial load uses the loading overview. Exact road doubles and village metadata
transfer in bounded batches. Navigation polygons stay in the worker; its graph is built only when a route is needed.

Round-4 worker and cache limits remain: one current model, one completed village layout, at most 64 worker routes and one
client route. At most 128 short endpoint legs are cached for the current graph. The contour is ported from `src/shared/road-contour.ts` at 83138edb8; bounded heap search, obstacle index,
foot clearance and both stool exceptions are plugin-owned adaptations. The stepped camera and bitmap rounding guard
come from `CForestViewport.tsx`. No host drawing, storage or database implementation is imported.

`OWNERSHIP.md` is the complete source-package/import graph. It is written by `npm run ownership` and not kept in git. `npm run check` is the combined type/test/build and four-slot-check command.

The later acceptance matrix still includes 100/500/1,000/5,000 occupants, four widths, two DPRs, native/4x CPU,
min/fit/max zoom, repeated open/close, server latency and heap measurements. This round does not pass those performance
gates, retire the old host map, edit Profile, finish full contact integration, or turn the plugin on.

The packer is `tools/pack-village.py` and requires Pillow. Give it the approved art root with `--source` and an output
folder with `--output`; the art root and source archives are never runtime dependencies. `tests/village.test.ts` checks
repeatable furniture, unaffected neighboring groups, module growth, source geometry, cross-house routes, tall-piece
clearance, appearance translation, atlas hashes, decoded allocations and native frame origins. `tests/moles.test.ts`
checks gait holds, arc speed, instant mirroring, all look/pose origins, factual pose choices and nameplates across changing synthetic rosters.

The shipped browser fixture takes `--url`, `--output` and `--browser` (a Firefox executable). Run `preview:test` only
against a fresh synthetic sandbox world with the plugin built and initially off. Bound the command with a 120-second
timeout and a 6,000,000 KiB virtual-memory limit. It intercepts only the four read views with labelled synthetic data,
uses the real slot/CSP/worker and selected assets, captures 3/16/60 in both themes and quiet states, checks all sixteen
atlas draw origins and ground coordinates, real carry/cheer draws, all seven canvas badges, a worker-routed gait frame
strip, quiet/reduced-motion suppression, local wave cancellation, missing-atlas fallback, three narrower widths,
detail-buffer release and page teardown, then switches that synthetic world's plugin off. It refuses the office's two reserved ports.

`tools/check-front-clearance.py` uses Pillow to check every approved standing look at the browser fixture's emitted
seat coordinates, at display scales .80, .85 and .92, against the actual front-layer pixels. Green-house front seats
sit farther back to clear its flower bed; their recipient approaches remain beside the seat. The check requires
`--layout` (one emitted `layout-16.json`, for example) and `--output` for its full count ledger.

Add `--poses` to the front-clearance command to include carry, cheer and the local wave preview at every seat.
