// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/* Plays the loading mole while the office starts. The page draws the parts of mole.svg with <use>, and each
   frame here is a pose of those parts: the body moved and squashed, the line it is cut at, and the eyes. */
;(function () {
  var mole = document.querySelector('[data-boot-mole]')
  if (!mole) return
  var body = mole.querySelector('[data-boot-mole-body]')
  var clip = mole.querySelector('clipPath rect')
  var eyes = mole.querySelectorAll('[data-boot-mole-eye]')
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
  var start = [['f01', 80], ['f02', 60], ['f03', 60]]
  var loop = [['f04', 540], ['f05', 80], ['f06', 200], ['f07', 200], ['f08', 100], ['f09', 80]]
  var end = [['f10', 60], ['f11', 80], ['f12', 80], ['f13', 80], ['f14', 240]]
  // Each frame's pose, in the drawing's own units. The body is scaled by sx and sy about the middle of the
  // ledge, then moved by dx and dy; it is cut off below the clip line; the eyes are moved by ex and ey and are
  // open, blink or glad. A value not named is 0 for a move, 1 for a scale and open for the eyes.
  var poses = {
    f01: { sx: 1.03, sy: 0.94, clip: 400 },
    f02: { dy: 40, clip: 382 },
    f03: { dy: 140, clip: 382 },
    f04: { dy: 300, clip: 382 },
    f05: { dy: 170, clip: 382 },
    f06: { dy: 86, clip: 382, ex: -8 },
    f07: { dy: 86, clip: 382, ex: 8 },
    f08: { dy: 86, clip: 382, eyes: 'blink' },
    f09: { dy: 170, clip: 382 },
    f10: { dy: 50, sx: 0.96, sy: 1.08, clip: 382 },
    f11: { dy: -24, sx: 0.98, sy: 1.04, clip: 400, eyes: 'glad' },
    f12: { dy: 4, sx: 1.03, sy: 0.94, clip: 400, eyes: 'glad' },
    f13: { sx: 0.99, sy: 1.02, clip: 400, eyes: 'glad' },
    f14: { clip: 400, eyes: 'glad' },
    f15: { clip: 400 },
    still: { dy: 86, clip: 382 },
  }
  var timer = null, phase = 'idle', resolveFinish = null, finishPromise = null
  function draw(name) {
    var pose = poses[name]
    mole.dataset.frame = name
    body.setAttribute('transform', 'translate(' + (pose.dx || 0) + ' ' + (pose.dy || 0) + ') translate(240 397) scale(' +
      (pose.sx || 1) + ' ' + (pose.sy || 1) + ') translate(-240 -397)')
    clip.setAttribute('height', pose.clip)
    for (var i = 0; i < eyes.length; i++) {
      var use = eyes[i].querySelector('use'), href = use.getAttribute('href')
      var part = 'eye-' + eyes[i].getAttribute('data-boot-mole-eye') + (pose.eyes ? '-' + pose.eyes : '')
      eyes[i].setAttribute('transform', 'translate(' + (pose.ex || 0) + ' ' + (pose.ey || 0) + ')')
      // Only the part after the # changes, so the address keeps whatever the page gave it.
      if (href.slice(href.indexOf('#') + 1) !== part) use.setAttribute('href', href.slice(0, href.indexOf('#') + 1) + part)
    }
  }
  function run(frames, index, done) {
    if (!mole.isConnected) { cancel(); return }
    if (index >= frames.length) { done(); return }
    draw(frames[index][0])
    timer = window.setTimeout(function () { run(frames, index + 1, done) }, frames[index][1])
  }
  function repeat() {
    phase = 'loop'; mole.dataset.phase = phase
    run(loop, 0, repeat)
  }
  function cancel() {
    if (timer !== null) window.clearTimeout(timer)
    timer = null; phase = 'done'
    if (resolveFinish !== null) { var resolve = resolveFinish; resolveFinish = null; resolve() }
  }
  draw('f15'); mole.dataset.phase = phase
  var token = getComputedStyle(document.documentElement).getPropertyValue('--motion-delay').trim()
  var delay = token.endsWith('ms') ? parseFloat(token) : parseFloat(token) * 1000
  timer = window.setTimeout(function () {
    if (!mole.isConnected) { cancel(); return }
    if (reduced.matches) { phase = 'still'; mole.dataset.phase = phase; draw('still'); return }
    phase = 'start'; mole.dataset.phase = phase
    run(start, 0, repeat)
  }, Number.isFinite(delay) ? delay : 150)
  window.moleBoot = {
    cancel: cancel,
    frames: { start: start, loop: loop, end: end, final: 'f15', still: 'still' },
    delay: Number.isFinite(delay) ? delay : 150,
    finish: function () {
      if (finishPromise !== null) return finishPromise
      if (phase === 'done') return Promise.resolve()
      if (timer !== null) window.clearTimeout(timer)
      if (phase === 'idle' || reduced.matches || !mole.isConnected || mole.getClientRects().length === 0) {
        draw('f15'); mole.dataset.phase = 'done'; phase = 'done'
        return Promise.resolve()
      }
      phase = 'end'; mole.dataset.phase = phase
      finishPromise = new Promise(function (resolve) {
        resolveFinish = resolve
        run(end, 0, function () { draw('f15'); mole.dataset.phase = 'done'; timer = window.setTimeout(cancel, 50) })
      })
      return finishPromise
    },
  }
})()
