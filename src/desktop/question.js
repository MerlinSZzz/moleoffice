// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// The question the menu's Shut down asks before it stops anything (src/desktop/main.mjs). It
// reads the window's words and language through its own preload (question-preload.cjs), and
// sends its two presses back through it. It holds no words of its own.

const cancel = document.getElementById('cancel')
const yes = document.getElementById('yes')

/** Answer once, so a second press while the view is closing changes nothing. */
let answered = false
function answer(what) {
  if (answered) return
  answered = true
  void window.theWindowsQuestion.answer(what)
}

async function draw() {
  const question = await window.theWindowsQuestion.read()
  if (question === null) return
  document.documentElement.lang = question.language
  document.title = question.words.question
  document.getElementById('question').textContent = question.words.question
  document.getElementById('says').textContent = question.words.says
  cancel.textContent = question.words.cancel
  yes.textContent = question.words.yes
  cancel.addEventListener('click', () => answer('cancel'))
  yes.addEventListener('click', () => answer('yes'))
  cancel.focus()
}

// Escape is the same answer as Cancel, as it is in a browser's own dialogues.
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') answer('cancel')
})

void draw()
