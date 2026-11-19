// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// The window's own check page: it shows what the main process found, in the window's language, and
// offers the presses the main process allows. It reads everything through the preload
// (src/desktop/preload.cjs); it holds no words of its own.

/**
 * One line of what the window says (`AWindowLine` in src/config/the-self-check.mjs): a sentence, a
 * heading, a labelled value, or what the person can do.
 */
function aLine(line, busy) {
  if ('heading' in line) {
    const h = document.createElement('h2')
    h.textContent = line.heading
    return h
  }
  if ('label' in line) {
    const row = document.createElement('div')
    row.className = 'fact'
    const label = document.createElement('span')
    label.className = 'label'
    label.textContent = line.label
    const value = document.createElement('span')
    value.className = 'value'
    if (line.path === true) value.append(...aPath(line.value))
    else value.textContent = line.value
    row.append(label, value)
    return row
  }
  const p = document.createElement('p')
  p.textContent = 'todo' in line ? line.todo : line.say
  if ('todo' in line) p.className = 'todo'
  else if (busy) p.className = 'busy'
  return p
}

/**
 * A folder path that breaks only after a slash. Each piece between slashes is kept whole, so a name
 * such as mole-office is never split at its hyphen, where it would read as two words.
 */
function aPath(path) {
  const parts = []
  for (const [i, piece] of path.split('/').entries()) {
    if (i > 0) {
      parts.push('/')
      parts.push(document.createElement('wbr'))
    }
    const whole = document.createElement('span')
    whole.className = 'whole'
    whole.textContent = piece
    parts.push(whole)
  }
  return parts
}

/**
 * The press each offer makes. Open it anyway and Open Mole Office both open the office the window
 * found. Check again asks again. Restart the service restarts it, as the tray's Restart does.
 */
const PRESSES = {
  openAnyway: () => window.theWindowsCheck.openAnyway(),
  openTheOffice: () => window.theWindowsCheck.openAnyway(),
  checkAgain: () => window.theWindowsCheck.checkAgain(),
  restartTheService: () => window.theWindowsCheck.restartTheService(),
}

async function draw() {
  const check = await window.theWindowsCheck.read()
  if (check === null) return
  document.documentElement.lang = check.language
  document.title = check.title
  document.getElementById('title').textContent = check.title
  // The About line: which version this window is.
  document.getElementById('about').textContent = check.about
  const lines = document.getElementById('lines')
  lines.replaceChildren(...check.lines.map((line) => aLine(line, check.busy)))
  const offers = document.getElementById('offers')
  offers.replaceChildren(
    ...check.offers.map((offer, i) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = check.labels[offer]
      if (i === 0) button.className = 'first'
      button.addEventListener('click', () => {
        void PRESSES[offer]()
      })
      return button
    }),
  )
}

window.theWindowsCheck.onChange(() => void draw())
void draw()
