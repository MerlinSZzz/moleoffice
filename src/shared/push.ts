// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PUSH NOTIFICATIONS, AS THE SERVER AND THE SETTINGS PAGE BOTH READ THEM. The office summons them with its own
 * message and with push to the devices where they pressed "allow notifications" once, and nothing else needs
 * setting up. The sending and the reasons for each rule
 * are in src/server/lib/push.ts.
 *
 * Nothing here is a device's address. A device is named by an id the office makes from its address, and by the name
 * the page gave it, so the page can tell which one it is without the office ever handing an address back.
 */

/** The longest name a device may be given, such as "Firefox on Windows". */
export const THE_LONGEST_DEVICE_NAME = 80

/** One device the person allowed, as the page reads it. */
export interface PushDevice {
  /** The first 16 hexadecimal characters of the SHA-256 of the device's address; the page works out its own. */
  id: string
  /** What the page called it when the person allowed it. */
  name: string
  /** When the person allowed it, in local wall clock. */
  addedAt: string
}

/** What GET /api/office/push answers the page. */
export interface PushState {
  /** The office's public signing key, base64url, which a browser subscribes with. */
  publicKey: string
  /** Every device the person allowed, oldest first. */
  devices: PushDevice[]
  /** One plain sentence saying how many devices are told when the person is called. */
  says: string
}

/** What one push to one device came to. `says` names no address. */
export interface PushOutcome {
  device: string
  outcome: 'told' | 'gone' | 'refused' | 'unreachable'
  says: string
}

/** What a push to every device came to. */
export interface PushedToAll {
  told: number
  outcomes: PushOutcome[]
  /** One plain sentence for the summons' message, naming no address. */
  says: string
}

/**
 * THE WORDS OF THE NOTIFICATIONS PANEL ON THE SETTINGS PAGE. Plain words, no ids and no door names, as the secretary asked for
 * the normal mode (JqVN46Ww53Lr). Here until the page's words move into the word lists (W1, then G5).
 */
export const NOTIFICATION_WORDS = {
  allow: 'Allow notifications on this device',
  allowing: 'Asking this browser',
  stop: 'Stop on this device',
  stopping: 'Stopping',
  test: 'Send a test',
  testing: 'Sending',
  stopThat: 'Stop',
  thisOne: 'this device',
  since: 'since',
  devices: 'Devices that are told',
  allowedHere: 'This device is told when a secretary calls you.',
  notYet: 'This device is not told yet. Press once, and the browser asks whether the office may show notifications.',
  blocked: "Blocked in this browser's site settings.",
  notEncrypted:
    'This page is not on an encrypted connection, so this browser cannot be told. Open the office by its https address ' +
    'on this device, and allow notifications there.',
  iphone:
    'On an iPhone or iPad, add the office to the Home Screen first (Share, then Add to Home Screen), open it from ' +
    'there, and allow notifications there.',
  noPush: 'This browser cannot show notifications from a web page.',
  checking: 'Looking at this device',
} as const
