// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT START AT LOGIN LOOKS LIKE ON THE WIRE, read by the server and the page alike. Wave 13u, round 3, piece H9.
 *
 * GET /api/office/start-at-login answers a reading and POST /api/office/start-at-login answers what the press did. The
 * server builds both from src/config/start-at-login.mjs (src/server/api/start-at-login.ts) and the Terminal management
 * page draws them (src/web/components/StartAtLogin.tsx). The shapes are written here once.
 */

/** Whether the office starts at the person's login, as systemd says. Every answer systemd does not give is null. */
export interface StartAtLoginReading {
  /** Whether systemd answers for the person's login: `not linux` on any other system, and `not asked` when the office
   *  runs from an AppImage. */
  systemd: 'answers' | 'no answer' | 'not linux' | 'not asked'
  /** On a Mac: the window's "Open at login" item in the menu-bar menu sets it, and the server cannot read it, so it says
   *  where and never on or off. False everywhere else. */
  setInTheMenuBar: boolean
  /** On Windows: the window's "Open at login" item, in the menu of the Mole Office icon in the notification area, sets
   *  it, and the server does not read it, so it says where and never on or off. Signing out of Windows stops the office.
   *  False everywhere else. */
  setInTheTray: boolean
  /** On Linux, when the office runs from an AppImage: start at login is not available there, and the .deb install has
   *  it, so the server says that and never on or off, and asks systemd nothing. False everywhere else. */
  fromAnAppImage: boolean
  /** The unit's file: none, the press's own for this office as it is now, the press's own for another, or not the press's. */
  unit: 'none' | 'current' | 'out of date' | 'not ours'
  unitPath: string
  /** true when systemd says "enabled", false for "disabled", null for anything else or no answer. */
  startsAtLogin: boolean | null
  /** The word `systemctl --user is-enabled` printed, or null. */
  enabledWord: string | null
  /** The word `systemctl --user is-active` printed, or null. */
  activeWord: string | null
  /** Whether lingering is on for the person's user, as loginctl says; null when it did not say. */
  linger: 'yes' | 'no' | null
  user: string
  /** The command the person runs in their own terminal to turn lingering on. */
  lingerCommand: string
  /** The same reading in one English sentence, for Developer mode. */
  says: string
}

/** The person's press: start the office at login, or stop doing so. */
export interface StartAtLoginPress {
  on: boolean
}

/** What the person's press did. Neither press starts or stops the office that runs now. */
export interface StartAtLoginDone {
  turned: 'on' | 'already on' | 'off' | 'already off'
  wrote: string[]
  says: string
}
