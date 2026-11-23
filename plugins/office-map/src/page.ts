// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { screenTestHooks } from './screen-test-hooks.ts'
import { mountReader, type BridgeSnapshot } from './bridge.ts'
import { OfficeModelCache, coherentFacts, currentFacts, identity, partialWorkCount, projectMatch, searchRoster, searchContacts, roomWords, workWords, type OfficeModel } from './model.ts'
import { words, layoutFailureWords, readFailureWords } from './words.ts'
import { whereabouts } from './ownership.ts'
import type { PluginReadView } from './contracts.ts'
import { PIXEL_STATES } from '../../../src/shared/plugin-read.ts'
import workerFile from './geometry.worker.ts?worker&url'
import { GeometryClient, blobWorker } from './geometry-client.ts'
import type { Point } from './geometry.ts'
import { OfficeMap, releaseMapSurfaces } from './map-view.ts'
import { labelWait } from './nameplates.ts'
import { SlicedBuild } from './layout-index.ts'
import { OwnedBuild } from './owned-build.ts'
import { ContactWalks, idleMotionForMap, occupiedBodies, browserClock, DEFAULT_MOLE_SCALE, sittingSpacing, type IdleActor, type IdleStanding, type MovingContact } from './walks.ts'
import { chooseIdleOuting, contactPlace, idleStays } from './idle-places.ts'
import { idleOutingsOn, outingChances, sittingChances } from './idle-outings.ts'
import type { IdleRoute } from './idle-route.ts'
import { asleepReading, type AsleepReading } from './asleep-reading.ts'
import { idleEligible } from './mole-state.ts'
import { idleEligible as idleEligibleAt } from './idle-eligibility.ts'
import { translateBody } from './visual-body.ts'
import type { Rect } from './viewport.ts'
import { paperBlockerKinds } from './paper-blocker.ts'
import { SelectedPack, packTouchSteps, type ArtPack } from './pack.ts'
import { legendSteps, receiptSteps, warmTimeSteps } from './page-steps.ts'
import { element, occupantCard } from './details.ts'
import { deferStart } from './startup.ts'

deferStart(window, () => {
  const app = document.querySelector<HTMLElement>('#app')!
  let current: BridgeSnapshot | null = null, model: OfficeModel | null = null
  let project: string | null = null, search = '', selected: string | null = null, inspected: string | null = null
  let wave: string | null = null
  let quiet = false, paused = false, following = false, onscreen = true, closed = false, renderQueued = false
  let observed = false
  let listPage = 0, roomPage = 0, lastBatch = 0, contactCount = 0, boundary = '', modelLayout = ''
  let pack: ArtPack | null = null, packStatus: 'loading' | 'ready' | 'unavailable' = 'loading'
  let map: OfficeMap | null = null
  /** The registry ids on the list's current page. */
  let listed: string[] = []
  const models = new OfficeModelCache(), packs = new SelectedPack()
  const rendering = new SlicedBuild<void>()
  const warming = new SlicedBuild<void>(), preparing = new OwnedBuild<void>()
  let warmed = false, warmingStarted = false
  const textBindings: { node: HTMLElement; key: keyof typeof words.en }[] = []
  function label<K extends keyof HTMLElementTagNameMap>(tag: K, key: keyof typeof words.en, className = ''): HTMLElementTagNameMap[K] {
    const node = element(tag, words.en[key], className); textBindings.push({ node, key }); return node
  }
  function button(key: keyof typeof words.en, click: () => void): HTMLButtonElement {
    const node = label('button', key); node.type = 'button'; node.addEventListener('click', click); return node
  }
  const language = () => current?.context?.language ?? 'en', t = () => words[language()]
  const header = element('header', '', 'scene-header')
  header.append(label('h1', 'title'))
  const controls = element('div', '', 'controls')
  const projectLabel = element('label'), projectSelect = element('select'); projectLabel.append(label('span', 'filter'), projectSelect)
  projectSelect.addEventListener('change', () => { project = projectSelect.value || null; listPage = 0; updateScene(); updateList() })
  const searchLabel = element('label'), searchInput = element('input'); searchInput.type = 'search'; searchLabel.append(label('span', 'search'), searchInput)
  searchInput.addEventListener('input', () => { search = searchInput.value; listPage = 0; updateScene(); updateList(); render() })
  const refresh = button('refresh', () => connection.reader.refresh())
  const pause = button('pause', () => { paused = !paused; connection.reader.setActive(!paused && !document.hidden) })
  const quietButton = button('quiet', () => {
    quiet = !quiet; wave = null; following = false; map?.setFollow(null); walks.clear(); connection.reader.resetTalk(); updateMotion(); updateScene(); updateControls()
  })
  controls.append(projectLabel, searchLabel, refresh, pause, quietButton)
  const status = element('div', '', 'read-status'); status.setAttribute('role', 'status')
  // The nearest aria-live decides what a screen reader is told, so the read time moving on a routine re-read is not.
  const readTime = element('p'); readTime.setAttribute('aria-live', 'off'); status.append(readTime)
  const receipts = new Map<Exclude<PluginReadView, 'online' | 'asleep'>, HTMLParagraphElement>()
  for (const view of ['projects', 'roster', 'people', 'work', 'talk'] as const) { const line = element('p'); receipts.set(view, line); status.append(line) }
  const artStatus = element('p', '', 'small-note'); artStatus.id = 'art-error'; artStatus.setAttribute('role', 'status')
  const overview = element('section', '', 'map-overview'), mapTools = element('div', '', 'map-tools')
  const mapStatus = element('p', words.en.waiting, 'small-note'), motionStatus = element('p', '', 'small-note')
  const namesNote = label('p', 'namesLeftOut', 'small-note'); namesNote.hidden = true
  const view = element('div', '', 'map-viewport'); view.tabIndex = 0; view.setAttribute('role', 'region')
  const help = label('p', 'controls', 'small-note'); help.id = 'map-help'; view.setAttribute('aria-describedby', help.id)
  let fitted = false, fittedWidth = 0, fittedHeight = 0
  function refit(): void {
    if (!map) return
    map.fit(); fittedWidth = view.clientWidth; fittedHeight = view.clientHeight
  }
  /** The map frame ends at or above the window's bottom edge. It takes the room below its own top,
   * up to its design height; when that room is too small to use, it keeps the design height and the
   * page reveals it, so the whole frame is in the window and the page below it scrolls. */
  function fitFrameToWindow(): void {
    if (view.hidden) return
    const top = view.getBoundingClientRect().top + window.scrollY
    const design = Math.min(760, Math.max(420, window.innerHeight * .66))
    const room = window.innerHeight - top
    const height = room >= 240 ? Math.min(design, room) : Math.min(design, window.innerHeight)
    if (!(Math.abs(Number.parseFloat(view.style.height) - height) < .5)) {
      view.style.height = `${Math.max(0, height)}px`
      if (fitted) refit()
    }
  }
  let frameRevealed = false
  /** Bring the frame fully into the window once, or when Fit asks again. It scrolls only when some
   * of the frame is outside the window, so a frame already in view does not move the page. */
  function revealFrame(force = false): void {
    if (view.hidden || frameRevealed && !force) return
    frameRevealed = true
    const box = view.getBoundingClientRect(), below = box.bottom - window.innerHeight
    if (below > 0) window.scrollBy(0, below)
    else if (box.top < 0) window.scrollBy(0, box.top)
  }
  const zoomOut = button('zoomOut', () => { fitted = false; map?.scale(.8) }), zoomIn = button('zoomIn', () => { fitted = false; map?.scale(1.25) }), fit = button('fit', () => { fitFrameToWindow(); fitted = !!map; refit(); revealFrame(true) })
  const locate = button('locate', () => { if (selected) { fitted = false; map?.cancelFollow(); map?.locate(selected) } })
  const follow = button('follow', () => {
    if (!selected) return
    fitted = false
    if (quiet || current?.context?.reducedMotion) { map?.locate(selected); return }
    following = !following; map?.setFollow(following ? selected : null); updateControls()
  })
  const waveButton = button('wavePreview', () => { wave = wave === selected ? null : selected; updateScene(); updateControls() })
  mapTools.append(zoomOut, zoomIn, fit, locate, follow, waveButton)
  overview.append(label('h2', 'map'), mapTools, view, mapStatus, namesNote, help)
  const talkDetails = element('details'), talkSummary = label('summary', 'talkView'), walkNotes = element('div')
  talkDetails.append(talkSummary, receipts.get('talk')!, motionStatus, walkNotes, label('p', 'motionNote', 'small-note'))
  // A contact walk the map could not show is named here, once for each pair, until Contacts closes.
  let notShown: [string, string][] = []
  const drawWalkNotes = () => walkNotes.replaceChildren(...notShown.map(([from, to]) =>
    element('p', t().walkNotShown.replace('{from}', () => agentWords(from)).replace('{to}', () => agentWords(to)), 'small-note')))
  const noteWalk = (from: string, to: string) => { if (!notShown.some(([a, b]) => a === from && b === to)) { notShown.push([from, to]); drawWalkNotes() } }
  talkDetails.addEventListener('toggle', () => {
    connection.reader.setTalkOpen(talkDetails.open)
    if (!talkDetails.open) { walks.clear(); contactCount = 0; notShown = []; drawWalkNotes() }
    updateMotion()
  })
  const roomDetails = element('details', '', 'room-navigation'), roomSummary = element('summary'), roomList = element('ul', '', 'roster-list'), roomPages = element('div', '', 'pagination'), roomPageLabel = element('span')
  const previousRoom = button('previous', () => { roomPage = Math.max(0, roomPage - 1); updateRoomList() })
  const nextRoom = button('next', () => { roomPage++; updateRoomList() })
  roomPages.append(previousRoom, roomPageLabel, nextRoom); roomDetails.append(roomSummary, roomList, roomPages)
  const preview = label('p', 'summary', 'inspect-preview'); preview.setAttribute('aria-live', 'polite')
  const count = element('p', '', 'source-count'), legend = element('div', '', 'state-counts')
  const presenceCount = element('p', '', 'small-note'); presenceCount.hidden = true
  const content = element('div', '', 'observer-panels'), listPanel = element('section', '', 'roster-panel'), detailPanel = element('section', '', 'detail-panel')
  const results = element('ul', '', 'roster-list'), resultCount = element('p', '', 'small-note'), pages = element('div', '', 'pagination'), pageLabel = element('span')
  const previous = button('previous', () => { listPage = Math.max(0, listPage - 1); updateList() })
  const next = button('next', () => { listPage++; updateList() })
  const clear = button('clear', () => { project = null; search = ''; projectSelect.value = ''; searchInput.value = ''; listPage = 0; updateScene(); updateList(); render() })
  pages.append(previous, pageLabel, next); listPanel.append(label('h2', 'list'), resultCount, clear, results, pages)
  content.append(listPanel, detailPanel)
  const peoplePanel = element('section', '', 'people-hub')
  app.replaceChildren(header, controls, status, artStatus, count, presenceCount, legend, overview, talkDetails, roomDetails, preview, content, peoplePanel)
  fitFrameToWindow()
  // Observe only the material that can move the frame, and the frame itself for width changes.
  const frameSize = new ResizeObserver(() => {
    if (closed) return
    fitFrameToWindow()
    if (fitted && (view.clientWidth !== fittedWidth || view.clientHeight !== fittedHeight)) refit()
  })
  for (const node of [header, controls, status, artStatus, count, presenceCount, legend, mapTools, overview.firstElementChild!]) frameSize.observe(node, { box: 'border-box' })
  frameSize.observe(view)
  view.addEventListener('wheel', event => { if (event.deltaY) fitted = false }, { passive: true })
  view.addEventListener('keydown', event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-'].includes(event.key)) fitted = false })
  view.addEventListener('pointermove', event => { if (event.buttons) fitted = false })
  view.addEventListener('scroll', () => { if (view.scrollLeft !== 0 || view.scrollTop !== 0) fitted = false })

  const geometry = new GeometryClient(() => blobWorker(new URL(workerFile, document.baseURI).href), () => { updateScene(); updateRoomList(); updateMotion() })
  const occupied = (except: string, standing: readonly IdleStanding[] = []): Rect[] | null => {
    const displaced = new Map(idle.snapshot().points.map(actor => [actor.id, actor.point])), rows: { id: string; home: { x: number; y: number }; current: { x: number; y: number }; body: Rect | null }[] = []
    for (const occupant of model?.occupants ?? []) {
      if (occupant.key === except) continue
      const home = map?.drawnFigure(occupant.key)
      if (!home) continue
      rows.push({ id: occupant.key, home, current: displaced.get(occupant.key) ?? home, body: map?.motionBounds(occupant.key) ?? null })
    }
    return occupiedBodies(rows, except, standing)
  }
  // For a screen test: every mole's drawn body in this frame, those out on an outing where they are now.
  const drawnBodies = (actors: readonly IdleActor[]) => (model?.occupants ?? []).flatMap(occupant => {
    const home = map?.drawnFigure(occupant.key), body = map?.motionBounds(occupant.key), point = actors.find(actor => actor.id === occupant.key)?.point
    return home && body ? [{ id: occupant.key, out: !!point, rect: translateBody(body, point ?? home) }] : []
  })
  let contactPoints: MovingContact[] = [], idlePoints: MovingContact[] = [], sittingFailedKey = ''
  const displayMotion = () => map?.animate(talkDetails.open ? contactPoints : idlePoints)
  const waitAtSeat = (id: string, points: readonly Point[]) => {
    const layout = geometry.snapshot().layout
    return layout ? labelWait(layout, id, points) : 0
  }
  const walks = new ContactWalks(browserClock, key => {
    const occupant = model?.occupants.find(one => one.key === key)
    return !!occupant && idleEligible(occupant, occupant.facts ? true : !!current?.views.work.data) && !!map?.isVisible(key) && onscreen
  }, (from, to, done) => {
    // No walk starts while a new layout is not drawn yet; it would be cut across when it is.
    if (map?.layoutChanging()) { done(null); return }
    const seat = geometry.snapshot().layout?.seats[to], ground = geometry.navigation(), start = map?.drawnPoint(from)
    const bodies = occupied(from), mover = map?.motionBounds(from), visible = map?.motionFurnitureSnapshot()
    if (!start || !seat || !ground || !bodies || !mover || !visible) { done(null); return }
    // The walk goes beside the partner, on the route search's own lattice, or is not shown at all.
    const station = map?.ownStation(from), target = contactPlace(ground, { id: from, foot: start, body: mover, station }, seat, [...bodies, ...visible, ...ground.obstacles])
    if (!target) { done(null); return }
    geometry.idleRoute(from, start, target, bodies, mover, visible, done, station)
  }, points => { const hooks = screenTestHooks(); if (hooks) hooks.contactActors = points; contactPoints = points; displayMotion() }, point => !!map?.pointVisible(point), () => geometry.interruptRoute(), 1, key => map?.drawnScale(key) ?? DEFAULT_MOLE_SCALE, noteWalk, waitAtSeat)
  const idle = idleMotionForMap(browserClock, (id, target, done, start, standing) => {
    const bodies = occupied(id, standing), mover = map?.motionBounds(id), visible = map?.motionFurnitureSnapshot()
    if (!start || !bodies || !mover || !visible || map?.layoutChanging()) { done(null); return }
    geometry.idleRoute(id, start, target, bodies, mover, visible, route => { const hooks = screenTestHooks(); if (hooks) hooks.idleRoute = { start, target, status: route?.status, points: route?.points.length, work: (route as IdleRoute | null)?.work }; done(route) }, map?.ownStation(id))
  }, actors => { const hooks = screenTestHooks(); if (hooks) { hooks.idleBodies = drawnBodies(actors); hooks.idleActors = actors } idlePoints = actors.map(actor => ({ id: `idle:${actor.id}`, from: actor.id, to: actor.partner, point: actor.point, elapsed: actor.elapsed, facing: actor.facing, phase: actor.phase, paper: actor.paper, labelAtSeat: actor.labelAtSeat })); displayMotion() }, () => geometry.interruptRoute(), () => updateMotion(),
  () => {
    // A planned outing whose route fails moves nobody and shows nothing, as nobody asked for it.
    const hooks = screenTestHooks(); if (hooks) hooks.idleDebug = { ...(hooks.idleDebug as object | undefined), state: idle.snapshot() }
  }, outingChances(screenTestHooks()?.idleSeed), waitAtSeat, sittingChances(screenTestHooks()?.idleSeed))

  function resetScene(): void {
    idle.update({ enabled: false, agents: [], places: [] }); walks.clear(); map?.dispose(); map = null; modelLayout = ''; following = false; wave = null; namesNote.hidden = true; frameRevealed = false; fitted = false
  }
  function boundaryFor(snapshot: BridgeSnapshot): void {
    const next = JSON.stringify([snapshot.generation, snapshot.context])
    if (boundary !== next || !snapshot.active) {
      boundary = next; resetScene(); geometry.setContext(next, snapshot.active, !!current?.context && JSON.stringify(current.context) === JSON.stringify(snapshot.context) && current.active !== snapshot.active)
      if (current?.generation !== snapshot.generation) {
        models.clear(); model = null; selected = null; inspected = null; contactCount = 0; listed = []
        results.replaceChildren(); roomList.replaceChildren(); releaseDetailCanvas(); detailPanel.replaceChildren(); peoplePanel.replaceChildren(); legend.replaceChildren()
        notShown = []; drawWalkNotes()
        roomSummary.textContent = `${t().rooms}: —`
        preview.textContent = t().summary; count.textContent = t().unavailable
      }
    }
  }
  function updateMotion(): void {
    map?.setMotionActive(observed && onscreen && !document.hidden && !!current?.active && !quiet && !current?.context?.reducedMotion)
    // A roster change never cuts across a walk. While a new layout is built with a mole out, or waits
    // to be drawn, the trips underway go on as they are and no new one starts. Reduced motion, quiet,
    // a hidden page and a map off screen still stop them, as before.
    const motionAllowed = observed && onscreen && !document.hidden && !!current?.active && !!map && !quiet && !current?.context?.reducedMotion
    if (motionAllowed && (map!.layoutChanging() || geometry.snapshot().status === 'loading' && map!.inMotion())) {
      motionStatus.textContent = `${t().contactCount}: ${contactCount}`; return
    }
    const healthy = !!current && ['roster', 'projects', 'talk'].every(view => { const state = current!.views[view as PluginReadView]; return state.data !== null && state.error === null })
    const ground = geometry.navigation(), asleep = asleepState().ids
    const eligible = (model?.occupants ?? []).flatMap(occupant => {
      const foot = map?.drawnPoint(occupant.key)
      if (!foot || asleep.has(occupant.agent.id)) return []
      const at = map?.whereaboutsOf(occupant.key) ?? { where: 'desk' as const }
      if (!(at.where === 'play' ? map?.pointVisible(foot) : map?.isVisible(occupant.key))) return []
      const available = occupant.facts ? true : !!current?.views.work.data
      // The drawn body lets the scheduler prove two walks apart; without it a mole walks alone.
      return [{ id: occupant.key, foot, idle: idleEligibleAt(occupant, at, available), scale: map?.drawnScale(occupant.key) ?? DEFAULT_MOLE_SCALE, body: map?.motionBounds(occupant.key) ?? undefined }]
    })
    const selectedIdle = idle.selection(eligible)
    const others: Rect[] = [], selectedBodies = new Map<string, Rect>()
    let boundsKnown = selectedIdle.length > 0
    for (const occupant of model?.occupants ?? []) {
      const point = map?.drawnFigure(occupant.key); if (!point) continue
      const body = map?.motionBounds(occupant.key)
      if (!body) { boundsKnown = false; continue }
      if (selectedIdle.some(agent => agent.id === occupant.key)) selectedBodies.set(occupant.key, body)
      else others.push(translateBody(body, point))
    }
    const motionEnabled = motionAllowed && geometry.snapshot().status === 'ready'
    if (!motionEnabled) map?.clearMotionFurniture()
    const furnitureReady = motionEnabled && !!map?.readyMotionFurniture(updateMotion)
    // Idle outings run while their switch is on, as it ships; contact walks are not outings and keep to their own rules.
    const idleMayRun = motionEnabled && !talkDetails.open && furnitureReady
    const idleEnabled = idleMayRun && idleOutingsOn(screenTestHooks())
    // With the switch turned off no new outing starts, and one under way goes on and comes home: cut
    // where it is, its moles would jump back to their desks.
    const homeward = idleMayRun && !idleEnabled && idlePoints.length > 0
    if (!homeward && (!idleEnabled || !selectedIdle.length)) map?.clearIdleLooks()
    const sittingKey = JSON.stringify([idle.destinationOffset, selectedIdle.map(agent => agent.id)])
    const wantsSitting = selectedIdle.length === 2 && idle.wantsToSit && sittingFailedKey !== sittingKey
    let posesReady = idleEnabled && selectedIdle.length > 0 && !!map?.readyIdleLooks(selectedIdle.map(agent => agent.id), updateMotion, wantsSitting)
    const sitting = wantsSitting && posesReady ? map?.readyIdleSitting(selectedIdle.map(agent => agent.id), updateMotion) : 'loading'
    if (wantsSitting && sitting === 'failed') {
      sittingFailedKey = sittingKey
      posesReady = !!map?.readyIdleLooks(selectedIdle.map(agent => agent.id), updateMotion)
    }
    const sittingReady = wantsSitting && sitting === 'ready'
    const bodies = selectedIdle.map(agent => selectedBodies.get(agent.id)).filter((body): body is Rect => !!body)
    const furniture = map?.motionFurnitureSnapshot()
    // Places near the selected group, on the walkable floors and obstacles the worker's route search
    // uses, not on the drawing layout, which leaves them out; with none, the turn is refused and recorded.
    const ready = boundsKnown && posesReady && (!wantsSitting || sitting !== 'loading') && !!furniture && !!ground && bodies.length === selectedIdle.length
    const paperClearAt = (points: readonly { x: number; y: number }[], groupBodies: readonly Rect[], blockers: readonly Rect[]): boolean => {
      if (points.length !== 2) return true
      const playBodies = points.map((point, i) => translateBody(groupBodies[i]!, point))
      return !!map?.paperClear(points[0]!, [...blockers, ...playBodies])
    }
    const walkers = ready ? selectedIdle.map((agent, i) => ({ id: agent.id, foot: agent.foot, body: bodies[i]!, station: map?.ownStation(agent.id) })) : []
    const blockers = ready ? [...others, ...furniture!, ...ground!.obstacles] : []
    const outing = ready ? sittingReady && bodies.length === 2
      ? chooseIdleOuting(ground!, walkers, blockers, point => !!map?.pointVisible(point), idle.destinationOffset, undefined, sittingSpacing(bodies[0]!, bodies[1]!))
      : chooseIdleOuting(ground!, walkers, blockers, point => !!map?.pointVisible(point), idle.destinationOffset, paperClearAt) : null
    // The moles of the group that do not set out, each with its reason, worked out as the outing works it out.
    const stays = ready ? idleStays(ground!, walkers, blockers) : undefined
    const places = outing?.places ?? []
    // Places come in the order of the outing's walkers, which may not be the order they were selected in.
    const playBodies = places.map((point, i) => translateBody(selectedBodies.get(outing!.walkers[i]!)!, point))
    const playBlockers = places.length === 2 && furniture && ground ? [...others, ...playBodies, ...furniture, ...ground.obstacles] : []
    const paperBlocked = places.length === 2 && !!map ? map.paperBlockers(places[0]!, playBlockers) : null
    const paper = !sittingReady && places.length === 2 && !!furniture && !!ground && !!map?.paperClear(places[0]!, playBlockers)
    // The reason a shared paper is or is not drawn, for the test hook and the capture's own
    // close-up check: its whole arc must be clear of every body, piece of furniture and obstacle.
    const paperReason = {
      intended: places.length === 2 && !!furniture && !!ground,
      clear: paper,
      blockers: paperBlocked === null ? null : paperBlocked.map(rect => {
        const kinds = paperBlockerKinds(rect, { others, playBodies, furniture: furniture!, ground: ground!.obstacles })
        return { kinds, x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      }),
    }
    // Where the outing meets, the facility of its room or why at none. With no outing planned there is no meeting.
    const meeting = outing?.meeting
    const debug = screenTestHooks(); if (debug) debug.idleDebug = { idleEnabled, posesReady, boundsKnown, selectedIdle, places, walkers: outing?.walkers, meeting, stays, furniture: furniture?.length, paper: paperReason, state: idle.snapshot() }
    if (!homeward) idle.update({ enabled: idleEnabled, agents: eligible, places, walkers: outing?.walkers, refusal: ready && !outing ? 'no-place' : undefined, paper, sittingReady, occupancy: (model?.occupants ?? []).flatMap(occupant => { const point = map?.drawnPoint(occupant.key); return point ? [point] : [] }) })
    walks.setEnabled(motionEnabled && talkDetails.open && healthy && furnitureReady)
    if (current?.views.talk.data?.withdrawn.more) walks.clear()
    motionStatus.textContent = current?.context?.reducedMotion ? t().reduced : quiet ? t().quietNote : `${t().contactCount}: ${contactCount}`
  }
  function pin(key: string): void {
    wave = null
    const id = model?.occupants.find(one => one.key === key)?.agent.id
    if (id) connection.reader.requestCard(id)
    selected = key; inspected = key; following = false; map?.setFollow(null); map?.locate(key)
    updateDetails(); updateScene(); updateList(); updateControls()
  }
  function inspect(key: string | null): void { inspected = key; updatePreview() }
  function updatePreview(): void {
    const occupant = model?.occupants.find(one => one.key === (inspected ?? selected))
    if (!occupant) { preview.textContent = t().summary; return }
    if (occupant.facts?.people.status === 'absent' || occupant.facts?.work.status === 'absent') { preview.textContent = `${occupant.agent.name} · ${t().agentAbsent}`; return }
    if (occupant.facts && (occupant.facts.people.status !== 'loaded' || occupant.facts.work.status !== 'loaded')) { preview.textContent = `${occupant.agent.name} · ${t().factsUnloaded}`; return }
    const stamp = occupant.facts?.people.status === 'loaded' ? occupant.facts.people.receivedAt : current?.views.people.receivedAt
    preview.textContent = `${occupant.agent.name || occupant.agent.handle} · ${!currentFacts(occupant) ? t().priorFacts + ' · ' : ''}${occupant.work.map(row => `${workWords(row, current!.context!.language)}: ${row.title}`).join('; ') || ((occupant.facts ? occupant.facts.work.status !== 'loaded' : current?.views.work.data === null) ? t().workUnavailable : t().noWork)} · ${t().presence}: ${occupant.agent.presence.map(one => one.word).join(', ') || t().presenceUnavailable} · ${t().ready}: ${stamp === null || stamp === undefined ? t().never : new Date(stamp).toLocaleTimeString()}`
  }
  function releaseDetailCanvas(): void {
    for (const canvas of detailPanel.querySelectorAll('canvas')) canvas.width = canvas.height = 1
  }
  function updateDetails(): void {
    const occupant = model?.occupants.find(one => one.key === selected)
    if (!occupant || !current?.context) { releaseDetailCanvas(); detailPanel.replaceChildren(element('p', t().pick)); selected = null; updatePreview(); return }
    const focusedSection = document.activeElement?.closest('details')?.dataset['section']
    const closeFocused = document.activeElement === detailPanel.firstElementChild
    const open = new Map([...detailPanel.querySelectorAll('details')].map(node => [node.dataset['section'], node.open]))
    const close = element('button', t().close); close.type = 'button'
    close.addEventListener('click', () => { selected = null; connection.reader.requestCard(null); wave = null; following = false; map?.setFollow(null); updateDetails(); updateScene(); updateControls() })
    releaseDetailCanvas()
    const card = occupantCard(occupant, current, pack)
    const seat = geometry.snapshot().layout?.seats[occupant.key]
    if (seat) { card.dataset['seat'] = String(seat.index); card.dataset['foot'] = `${seat.foot.x},${seat.foot.y}` }
    detailPanel.replaceChildren(close, card)
    for (const node of card.querySelectorAll('details')) { node.open = open.get(node.dataset['section']) ?? false; if (node.dataset['section'] === focusedSection) node.querySelector('summary')?.focus({ preventScroll: true }) }
    if (closeFocused) close.focus({ preventScroll: true })
    updatePreview()
  }
  function onlineState(): Map<string, boolean> | null {
    const view = current?.views.online
    if (!view || view.data === null || view.error !== null) return null
    return new Map(view.data.agents.map(row => [row.id, row.online]))
  }
  /** The office's asleep read, unless a picture tool feeds made-up sleepers through its seam. */
  function asleepState(): AsleepReading {
    return asleepReading(screenTestHooks()?.asleep, current?.views.asleep)
  }
  function updatePresence(): void {
    const online = onlineState(), sleep = asleepState(), asleep = sleep.ids
    const agents = model?.occupants.map(one => ({ id: one.agent.id, retired: one.agent.retired })) ?? []
    const layout = geometry.snapshot().layout
    const places = layout?.places ? { play: layout.places.play.length, sleep: layout.places.sleep.length } : { play: 0, sleep: 0 }
    const found = whereabouts(agents, online, asleep, places)
    const sleeping = agents.filter(one => !one.retired && asleep.has(one.id)).length
    const withoutPlace = Math.max(0, sleeping - places.sleep)
    const parts: string[] = []
    if (online === null) parts.push(t().onlineUnread)
    else {
      let hidden = 0, playing = 0
      for (const agent of agents) {
        const where = found.get(agent.id)
        if (where?.where === 'hidden') hidden++
        else if (where?.where === 'play') playing++
      }
      if (hidden > 0) parts.push(t().offlineHidden.replace('{count}', String(hidden)))
      if (playing > 0) parts.push(t().offlineOutside.replace('{count}', String(playing)))
    }
    if (withoutPlace > 0) parts.push(t().asleepNoPlace.replace('{count}', String(withoutPlace)))
    if (sleep.from === 'unread') parts.push(t().asleepUnread)
    if (sleep.from === 'picture' && asleep.size > 0) parts.push(t().asleepMadeUp)
    presenceCount.textContent = parts.join(language() === 'zh' ? '' : ' ')
    presenceCount.hidden = parts.length === 0
  }
  function updateScene(): void {
    updatePresence()
    const layout = geometry.snapshot().layout
    if (map && layout && !layout.preview && geometry.snapshot().status === 'loading') return
    if (!current?.context || !current.active || !model || !layout) {
      if (map) resetScene()
      view.hidden = true
      const state = geometry.snapshot()
      showMapStatus(!current?.active ? t().hidden : !model ? t().unavailable : state.status === 'unavailable' ? layoutFailureWords(language(), state.failure, agentWords) : t().mapLoading)
      selectListed(); updateControls(); return
    }
    view.hidden = false
    fitFrameToWindow()
    if (!map) { map = new OfficeMap(view, pin, inspect, () => { walks.recheck(); updateMotion() }, () => { following = false; updateControls() }, selectAgents, { namesChanged: leftOut => { namesNote.hidden = !leftOut }, layoutDrawn: () => { followDrawnLayout(); walks.recheck(); updateMotion() } }); revealFrame() }
    map.update(layout, model, { project, search, language: current.context.language, theme: current.context.theme, selected, workAvailable: current.views.work.data !== null, still: quiet || current.context.reducedMotion, wave, online: onlineState(), asleep: asleepState().ids, asleepMadeUp: asleepState().from === 'picture' }, pack)
    followDrawnLayout()
    updateMotion()
    walks.recheck()
    showMapStatus(geometry.snapshot().status === 'loading' ? t().mapLoading : '')
    updateControls()
    fitFrameToWindow()
  }
  /** Contact walks belong to the layout they were drawn in. The map may draw a new one later than it is
   * given, when the trips underway end, so walks end when the drawn layout changes, not the given one. */
  function followDrawnLayout(): void {
    const drawn = map?.drawnLayoutKey()
    if (!drawn) return
    if (modelLayout && modelLayout !== drawn) walks.clear()
    modelLayout = drawn
  }
  /** The line under the map says only that the map is loading or why it is not drawn, and is hidden otherwise. */
  function showMapStatus(text: string): void { mapStatus.textContent = text; mapStatus.hidden = text === '' }
  function selectAgents(ids: string[]): void {
    const hooks = screenTestHooks()
    if (hooks) { hooks.selection = ids; hooks.release = () => { hooks.hold = false; connection.reader.selectAgents(hooks.selection) }; if (hooks.hold) return }
    connection.reader.selectAgents(ids)
  }
  /** With no map to say who is on screen, the agents on the list's current page are read instead. */
  function selectListed(): void {
    if (!map && geometry.snapshot().status === 'unavailable') selectAgents(listed)
  }
  /** A roster fault names an agent by its identity key. Show the name the roster gives it, or the key. */
  function agentWords(key: string): string {
    const row = current?.views.roster.data?.agents.find(agent => identity('agent', agent.id) === key)
    return row ? row.name || row.handle : key
  }
  function updateControls(): void {
    pause.textContent = paused ? t().resume : t().pause; refresh.disabled = !current?.active
    quietButton.setAttribute('aria-pressed', String(quiet)); follow.setAttribute('aria-pressed', String(following))
    follow.textContent = current?.context?.reducedMotion || quiet ? t().locate : following ? t().following : t().follow
    const drawn = !!selected && !!map && map.drawnPoint(selected) !== null
    follow.disabled = locate.disabled = !drawn
    waveButton.disabled = !drawn || quiet || !!current?.context?.reducedMotion
    waveButton.setAttribute('aria-pressed', String(wave !== null)); waveButton.textContent = wave === null ? t().wavePreview : t().stopWave
    zoomIn.disabled = zoomOut.disabled = fit.disabled = !map
  }
  function updateList(): void {
    const searched = searchRoster(model?.occupants ?? [], search)
    const matches = searched.filter(one => projectMatch(one, project) !== 'other')
    const unknown = project ? searched.filter(one => projectMatch(one, project) === 'unknown').length : 0
    const limit = 20, lastPage = Math.max(0, Math.ceil(matches.length / limit) - 1); listPage = Math.min(listPage, lastPage)
    resultCount.textContent = model === null ? t().unavailable : project ? `${t().matches}: ${searched.filter(one => projectMatch(one, project) === 'match').length} · ${t().projectUnloaded}: ${unknown}${unknown ? ' · ' + t().partialFacts : ''}` : `${t().matches}: ${matches.length} / ${model.occupants.length}`
    const focusKey = (document.activeElement as HTMLElement | null)?.dataset['result']
    const shown = matches.slice(listPage * limit, (listPage + 1) * limit)
    listed = shown.map(occupant => occupant.agent.id)
    results.replaceChildren(...shown.map(occupant => {
      const row = element('li'), choose = element('button', occupant.agent.name || occupant.agent.handle), info = element('span', '', 'small-note')
      choose.type = 'button'; choose.dataset['result'] = occupant.key; choose.setAttribute('aria-pressed', String(selected === occupant.key))
      choose.addEventListener('click', () => pin(occupant.key)); choose.addEventListener('focus', () => inspect(occupant.key)); choose.addEventListener('pointerenter', () => inspect(occupant.key))
      const state = projectMatch(occupant, project)
      row.dataset['projectMatch'] = state
      info.textContent = state === 'unknown' ? t().projectUnloaded : state === 'absent' || occupant.facts?.people.status === 'absent' || occupant.facts?.work.status === 'absent' ? t().agentAbsent : occupant.facts && (occupant.facts.people.status === 'unloaded' || occupant.facts.work.status === 'unloaded') ? t().factsUnloaded : !currentFacts(occupant) ? t().priorFacts : occupant.work.filter(row => project === null || row.project === project).map(row => workWords(row, current!.context!.language)).join('; ') || ((occupant.facts ? occupant.facts.work.status !== 'loaded' : current?.views.work.data === null) ? t().workUnavailable : project === null ? t().noWork : t().noProjectWork)
      row.append(choose, info); return row
    }))
    if (focusKey) [...results.querySelectorAll<HTMLButtonElement>('button')].find(one => one.dataset['result'] === focusKey)?.focus({ preventScroll: true })
    if (!matches.length) results.append(element('li', model === null ? t().unavailable : model.occupants.length ? t().noResults : t().noPeople))
    pageLabel.textContent = `${t().page} ${listPage + 1} / ${lastPage + 1}`; previous.disabled = listPage === 0; next.disabled = listPage === lastPage
    clear.hidden = !project && !search
    selectListed()
  }
  function updateRoomList(): void {
    const rooms = model?.rooms ?? [], lastPage = Math.max(0, Math.ceil(rooms.length / 20) - 1)
    roomPage = Math.min(roomPage, lastPage)
    roomSummary.textContent = `${t().rooms}: ${model === null ? '—' : rooms.length}`
    const focused = (document.activeElement as HTMLElement | null)?.dataset['room']
    roomList.replaceChildren(...rooms.slice(roomPage * 20, (roomPage + 1) * 20).map(room => {
      const row = element('li'), choose = element('button', `${t().showRoom}: ${roomWords(room, current!.context!.language)} · ${t().list}: ${room.occupants.length}`)
      choose.type = 'button'; choose.dataset['room'] = room.id; choose.disabled = !map
      choose.addEventListener('click', () => map?.showRoom(room.id)); row.append(choose); return row
    }))
    if (!rooms.length) roomList.append(element('li', model === null ? t().unavailable : t().noPeople))
    if (focused) [...roomList.querySelectorAll<HTMLButtonElement>('button')].find(node => node.dataset['room'] === focused)?.focus({ preventScroll: true })
    roomPageLabel.textContent = `${t().page} ${roomPage + 1} / ${lastPage + 1}`
    previousRoom.disabled = roomPage === 0; nextRoom.disabled = roomPage === lastPage
  }
  function render(): void {
    renderQueued = false
    if (closed || !current) return
    // The ICU date formatter costs 24-31 ms on its first use at 4x. Pay it in its own
    // startup turns; every render turn then formats a timestamp in well under a millisecond.
    if (!warmed) {
      if (!warmingStarted) {
        warmingStarted = true
        warming.start(warmTimeSteps(), () => { warmed = true; if (!closed && current) render() })
      }
      return
    }
    rendering.start(renderStages(current), () => {})
  }
  function* renderStages(snapshot: BridgeSnapshot): Generator<void> {
    const context = snapshot.context
    if (!context) return
    document.documentElement.lang = context.language; document.documentElement.dataset['theme'] = context.theme
    document.documentElement.dataset['reducedMotion'] = String(context.reducedMotion)
    let bindings = 0
    for (const binding of textBindings) { binding.node.textContent = t()[binding.key]; if (++bindings % 16 === 0) yield }
    view.setAttribute('aria-label', t().map)
    model = yield* models.build(snapshot.views.roster.data, null, snapshot.views.projects.data, snapshot.facts)
    if (model) connection.reader.selectRoster(model.rosterOrder)
    yield
    const asleep = asleepState().ids
    if (model && snapshot.active) geometry.update({ rooms: model.rooms.map(room => ({ id: room.id, occupants: room.occupants })), roster: model.layoutRoster, sleepingCount: model.occupants.filter(one => !one.agent.retired && asleep.has(one.agent.id)).length })
    const options = snapshot.views.projects.data?.projects ?? []
    const signature = JSON.stringify([options, context.language])
    if (projectSelect.dataset['signature'] !== signature) {
      projectSelect.replaceChildren(Object.assign(element('option', t().all), { value: '' }), ...options.map(one => Object.assign(element('option', one.name), { value: one.id })))
      projectSelect.dataset['signature'] = signature
    }
    if (project !== null && !options.some(one => one.id === project)) project = null
    projectSelect.value = project ?? ''
    // One read time for the four parts, the oldest, so it is true of each. A part is named only when it was never read,
    // its last read failed or its data was narrowed, and before any part is read one line says Reading.
    const clock = (at: number) => new Date(at).toLocaleTimeString(context.language === 'zh' ? 'zh-CN' : 'en-GB')
    const parts = (['projects', 'roster', 'people', 'work'] as const).map(view => snapshot.views[view])
    const times = parts.flatMap(read => read.receivedAt === null ? [] : [read.receivedAt])
    const first = parts.every(read => read.receivedAt === null && read.error === null)
    readTime.textContent = first ? t().loading : times.length ? `${t().ready} · ${clock(Math.min(...times))}` : ''
    readTime.hidden = readTime.textContent === ''
    yield* receiptSteps(receipts, (view, line) => {
      const read = snapshot.views[view], name = ({ projects: t().projects, roster: t().rosterView, people: t().peopleView, work: t().workView, talk: t().talkView })[view]
      line.hidden = view !== 'talk' && (first || read.receivedAt !== null && read.error === null && !read.data?.narrowedByPermission?.length)
      if (line.hidden) { line.textContent = ''; return }
      const stamp = read.receivedAt === null ? t().never : clock(read.receivedAt)
      line.textContent = `${name} · ${read.status === 'ready' ? t().ready : read.status === 'stale' ? t().stale : read.status === 'unavailable' ? t().unavailable : t().loading} · ${stamp}${read.error ? ' · ' + (read.error === 'permission' ? t().permission : read.error === 'invalid' ? t().invalid : readFailureWords(context.language, read.failure)) : ''}${read.data?.narrowedByPermission?.length ? ' · ' + t().restricted : ''}`
    })
    artStatus.textContent = packStatus === 'loading' ? t().packLoading : packStatus === 'unavailable' ? t().packMissing : ''
    // Left out unless there is such work. The page reads Work only for the agents on the roster, so it never finds any.
    const unmatched = model !== null && snapshot.views.work.receivedAt !== null && model.unmatchedWork > 0 ? ` · ${t().unmatched}: ${model.unmatchedWork}` : ''
    count.textContent = `${t().supplied}: ${model?.occupants.length ?? '—'} · ${t().people}: ${model?.people.length ?? '—'}${unmatched}`
    const legendNodes = yield* legendSteps(Object.entries(PIXEL_STATES), ([group, state], index) => {
      const total = model === null ? '—' : partialWorkCount(model.occupants, project, group) ?? '—'
      const node = element('span', `${['●', '◇', '△', 'Ⅱ', '!', '✓', '?'][index]} ${state[context.language]}: ${total}`); node.style.borderColor = state.colour; return node
    })
    // The note stands only while some agent on the map has no loaded pair of facts.
    legend.replaceChildren(...legendNodes, ...model === null || model.occupants.some(one => !coherentFacts(one)) ? [element('span', t().partialFacts)] : [])
    fitFrameToWindow()
    peoplePanel.replaceChildren(element('h2', t().people), element('p', model === null ? t().unavailable : searchContacts(model.people, search).map(one => one.name || one.handle).join(', ') || (search ? t().noContactsFound : t().noContacts)))
    yield
    // Each refresh is its own turn; one large list or room change no longer shares a
    // single sliced render turn with every other panel.
    updateScene(); yield
    updateRoomList(); yield
    updateList(); yield
    updateDetails(); yield
    updateMotion()
    if (snapshot.contacts && snapshot.contacts.sequence > lastBatch) {
      lastBatch = snapshot.contacts.sequence; contactCount = snapshot.contacts.messages.length
      walks.accept(snapshot.contacts); updateMotion()
    }
    if (notShown.length) drawWalkNotes()
    if (snapshot.views.talk.data?.refusal) motionStatus.append(document.createTextNode(' · ' + t().restrictedTalk))
    const hooks = screenTestHooks(); if (hooks) hooks.renderedFacts = snapshot.facts
    if (snapshot.views.talk.data?.more || snapshot.views.talk.data?.withdrawn.more) motionStatus.append(document.createTextNode(' · ' + t().more))
  }
  const connection = mountReader(window, document, snapshot => {
    const hooks = screenTestHooks(); if (hooks) hooks.facts = snapshot.facts
    rendering.cancel()
    boundaryFor(snapshot)
    current = snapshot
    if (!snapshot.active || !snapshot.context) resetScene()
    if (Object.values(snapshot.views).some(view => view.error !== null)) walks.clear()
    if (!renderQueued && !closed) { renderQueued = true; queueMicrotask(render) }
  }, () => paused)
  const hooks = screenTestHooks(); if (hooks) { hooks.refresh = () => connection.reader.refresh(); hooks.navigation = () => geometry.navigation() }
  const visibility = new IntersectionObserver(entries => {
    const visible = entries[0]?.isIntersecting ?? false
    if (closed || observed && onscreen === visible) return
    observed = true
    onscreen = visible; walks.clear(); connection.reader.resetTalk(); updateMotion()
  })
  visibility.observe(view)
  document.addEventListener('visibilitychange',updateMotion)
  updateControls()
  // Start the one-time locale and image preparation immediately, in their own bounded
  // turns, so the first paint and the first render never pay for them.
  warmingStarted = true
  warming.start(warmTimeSteps(), () => { warmed = true; if (!closed && current) render() })
  void packs.select('woodland').then(result => {
    if (closed) return
    if (!result) { packStatus = 'unavailable'; render(); return }
    // Pay each image's first-use copy (a 4 MB atlas costs 22-25 ms) in bounded turns before
    // any paint can see the pack. The pack is published only after every image is warm.
    preparing.start(packTouchSteps(result), () => {
      if (closed) { packs.release(); return }
      pack = result; packStatus = 'ready'; render()
    })
  })
  const close = (): void => {
    if (closed) return
    closed = true; rendering.cancel(); warming.cancel(); preparing.cancel(); visibility.disconnect(); frameSize.disconnect(); idle.dispose(); walks.dispose(); map?.dispose(); map = null; geometry.dispose(); connection.dispose(); packs.release()
    document.removeEventListener('visibilitychange',updateMotion)
    pack = null; model = null; current = null; models.clear()
    releaseDetailCanvas(); releaseMapSurfaces()
    window.removeEventListener('pagehide', close); window.removeEventListener('unload', close); window.removeEventListener('keydown', escape); window.removeEventListener('resize', fitFrameToWindow); app.replaceChildren()
  }
  const escape = (event: KeyboardEvent): void => { if (event.key === 'Escape') { following = false; map?.setFollow(null); updateControls() } }
  window.addEventListener('keydown', escape); window.addEventListener('resize', fitFrameToWindow)
  window.addEventListener('pagehide', close); window.addEventListener('unload', close)
})
