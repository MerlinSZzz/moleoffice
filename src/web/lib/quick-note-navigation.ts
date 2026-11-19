// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The note window asks the office window to show My notes before it closes. */
const CHANNEL = 'quick-note-navigation'
const OPEN_MY_NOTES = 'my-notes'
const MY_NOTES_OPENED = 'my-notes-opened'

/** Answer in the office window. Its route chooses exactly one of the shell and the note page. */
export function listenForMyNotes(open: () => void): () => void {
  const channel = new BroadcastChannel(CHANNEL)
  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (event.data !== OPEN_MY_NOTES) return
    open()
    window.focus()
    channel.postMessage(MY_NOTES_OPENED)
  }
  return () => channel.close()
}

/** Keep the note open if no office window answers; Back can then be tried again. */
export function askForMyNotes(): Promise<boolean> {
  return new Promise((resolve) => {
    const channel = new BroadcastChannel(CHANNEL)
    const finish = (answered: boolean) => {
      window.clearTimeout(timer)
      channel.close()
      resolve(answered)
    }
    const timer = window.setTimeout(() => finish(false), 1000)
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (event.data === MY_NOTES_OPENED) finish(true)
    }
    channel.postMessage(OPEN_MY_NOTES)
  })
}
