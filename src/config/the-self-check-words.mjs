// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE WORDS OF THE SELF-CHECK AND OF THE WINDOW, IN ENGLISH AND CHINESE, in one table.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE IS JAVASCRIPT AND NOT PART OF src/shared/words/
 * ---------------------------------------------------------------------------------------
 *
 * The word lists in src/shared/words/ are TypeScript, and three programs that cannot all read
 * TypeScript say these sentences:
 *
 *   - the `mole-office` command (src/config/the-service-command.mjs), run by Node;
 *   - tools/session-hook.mjs, which runs on Node 18 (chapter 9, rule 1) and will call the self-check;
 *   - the standalone window's main process (src/desktop/main.mjs), run by Electron.
 *
 * So the sentences are written here once, for every one of them, as src/config/world-words.mjs is for
 * the tools that print a world's words. A copy in any of the three would be one fact in two places.
 *
 * Parts of a sentence that are not these words stay as they were written: the office's own reasons for
 * being unhealthy, and the reason a read failed. They come from the office or the operating system,
 * and this table frames them. The values in a world's description (an id, a path, a port, a commit)
 * are values and are not translated; the names of its facts and its standing are words, and are.
 */

import { THE_INSTALL } from './settings.mjs'
import { worldInWords } from './world-header.mjs'
import { WORLD_STANDING_CHINESE } from './world-words.mjs'

/**
 * WHAT THE SELF-CHECK CALLS ITS OWN SIDE, from the install it runs in (src/config/settings.mjs, THE
 * INSTALL AND ITS DATA). From a checkout the office it expects is the one the checkout declares; from
 * an installed copy there is no checkout, and the office it expects is the one the installation
 * declares, with its data in the per-user data folder. The sentence is true in each.
 */
export const THIS_SIDE_EN = THE_INSTALL.from === 'bundle' ? 'this installation' : 'this checkout'
const THIS_SIDE_ZH = THE_INSTALL.from === 'bundle' ? '这个安装' : '这个代码目录'

/**
 * @typedef {object} SelfCheckWords
 * @property {(address: string) => string} healthy
 * @property {(address: string) => string} unhealthy
 * @property {(reason: string) => string} wrong
 * @property {(says: string) => string} noHolder
 * @property {(world: string) => string} itIs
 * @property {(address: string, why: string) => string} noWorld
 * @property {(address: string) => string} wrongWorld
 * @property {(what: string, expected: string, answered: string) => string} differs
 * @property {(world: string) => string} answeringIs
 * @property {(address: string) => string} cannotTell
 * @property {(what: string) => string} unknownToBoth
 * @property {(what: string, side: 'this checkout' | 'the office answering', expected: string, answered: string) => string} unknownToOneSide
 * @property {(why: string) => string} notAnswering
 * @property {(stableCheckout: string, developmentCheckout: string) => string} servesFor one line saying which folder the office runs from and which development checkout it serves
 * @property {(world: import('./world-header.mjs').WorldOnTheWire) => string} world one world in one line
 * @property {string} noReasonGiven
 * @property {Readonly<Record<'database' | 'repository' | 'port', string>> | null} facts the words for each compared fact, or null to read them from WORLD_FIELDS in world-header.mjs, which is where English keeps them
 */

/** @param {string} words */
const capitalised = (words) => words.charAt(0).toUpperCase() + words.slice(1)
const orNothingEn = (/** @type {string} */ value) => value || '(nothing)'
const orNothingZh = (/** @type {string} */ value) => value || '（没有）'

/** @type {SelfCheckWords} */
const EN = {
  healthy: (address) => `The office ${THIS_SIDE_EN} declares answers at ${address}, and its health check says ok.`,
  unhealthy: (address) => `The office ${THIS_SIDE_EN} declares answers at ${address}, but its health check says something is wrong.`,
  wrong: (reason) => `Wrong: ${reason}`,
  noHolder: (says) => `No terminal holder runs, so the office cannot open, read or type into a terminal. ${says}`,
  itIs: (world) => `It is: ${world}.`,
  noWorld: (address, why) => `Something answers at ${address}, but it does not say which office it is: ${why}.`,
  wrongWorld: (address) => `An office answers at ${address}, but it is not the one ${THIS_SIDE_EN} declares.`,
  differs: (what, expected, answered) =>
    `${capitalised(what)}: ${THIS_SIDE_EN} says ${orNothingEn(expected)}; the office answering says ${answered}.`,
  answeringIs: (world) => `The office answering is: ${world}.`,
  cannotTell: (address) => `An office answers at ${address}, but whether it is the one ${THIS_SIDE_EN} declares cannot be told.`,
  unknownToBoth: (what) => `${capitalised(what)} is unknown both to ${THIS_SIDE_EN} and to the office answering, so it cannot be compared.`,
  unknownToOneSide: (what, side, expected, answered) =>
    `${capitalised(what)} is unknown to ${side === 'this checkout' ? THIS_SIDE_EN : side}, so it cannot be compared: ${THIS_SIDE_EN} says ${orNothingEn(expected)}; ` +
    `the office answering says ${orNothingEn(answered)}.`,
  notAnswering: (why) => `Nothing answers for this office: ${why}.`,
  servesFor: (stableCheckout, developmentCheckout) => `It runs from the stable checkout ${stableCheckout}, for this development checkout.`,
  // English keeps the one line `worldInWords` writes for a log or a terminal.
  world: (world) => worldInWords(world),
  noReasonGiven: 'no reason given',
  facts: null,
}

/** @type {SelfCheckWords} */
const ZH = {
  healthy: (address) => `${THIS_SIDE_ZH}声明的办公室在 ${address} 回应，它的自检说一切正常。`,
  unhealthy: (address) => `${THIS_SIDE_ZH}声明的办公室在 ${address} 回应，但它的自检说出了问题。`,
  wrong: (reason) => `问题：${reason}`,
  noHolder: (says) => `没有终端托管程序在运行，所以办公室不能打开、查看或输入终端。办公室的说明：${says}`,
  itIs: (world) => `它是：${world}。`,
  noWorld: (address, why) => `${address} 有东西在回应，但它没有说自己是哪个办公室：${why}。`,
  wrongWorld: (address) => `${address} 有办公室在回应，但不是${THIS_SIDE_ZH}声明的那个。`,
  differs: (what, expected, answered) => `${what}：${THIS_SIDE_ZH}说是 ${orNothingZh(expected)}；回应的办公室说是 ${answered}。`,
  answeringIs: (world) => `回应的办公室是：${world}。`,
  cannotTell: (address) => `${address} 有办公室在回应，但说不清它是不是${THIS_SIDE_ZH}声明的那个。`,
  unknownToBoth: (what) => `${THIS_SIDE_ZH}和回应的办公室都不知道${what}，所以没法比较。`,
  unknownToOneSide: (what, side, expected, answered) =>
    `${side === 'this checkout' ? THIS_SIDE_ZH : '回应的办公室'}不知道${what}，所以没法比较：${THIS_SIDE_ZH}说是 ` +
    `${orNothingZh(expected)}；回应的办公室说是 ${orNothingZh(answered)}。`,
  notAnswering: (why) => `这个办公室没有回应：${why}。`,
  servesFor: (stableCheckout, developmentCheckout) => `它从稳定代码目录 ${stableCheckout} 运行，为这个开发代码目录服务。`,
  world: (world) =>
    `数据库 ${world.database}，代码目录 ${world.repository}，端口 ${world.port}，提交 ${world.head}，` +
    (WORLD_STANDING_CHINESE[world.standing] ?? `未知的状态：${world.standing === '' ? '没有存下' : world.standing}`),
  noReasonGiven: '没有给出原因',
  facts: { database: '数据库', repository: '代码目录', port: '端口' },
}

/** The self-check's sentences, by language. */
export const SELF_CHECK_WORDS = Object.freeze({ en: EN, zh: ZH })

/**
 * @typedef {object} WindowWords
 * @property {string} title
 * @property {string} checking
 * @property {string} starting
 * @property {string} restarting
 * @property {string} stopping
 * @property {string} opening
 * @property {string} openAnyway
 * @property {string} openTheOffice the press that opens a healthy office the window did not open by itself
 * @property {string} checkAgain
 * @property {(version: string | null) => string} about the line at the foot of the check page naming the version (decision sKPFWjOuQVEe)
 * @property {(code: number | null, said: string) => string} couldNotStart the start's exit code, or null when it did not end with one, and its words
 * @property {(code: number | null, said: string) => string} couldNotRestart the restart's exit code, or null when it did not end with one, and its words
 * @property {(code: number | null, said: string) => string} couldNotStop the stop's exit code, or null when it did not end with one, and its words
 * @property {(code: number, said: string) => string} holderStillRunning the stop ended the server but not the terminal holder
 * @property {(seconds: number) => string} stillAnswering the office accepted the page's shutdown press, and still answered after this long
 * @property {string} stoppedUnasked the office's server ended with no stop asked for, as the note beside its lock says
 * @property {(seconds: number, attempt: number, attempts: number) => string} startsAgainIn when the window starts the server again, and which try that is of how many
 * @property {(attempt: number, attempts: number) => string} startingAgain the window is starting the server again now
 * @property {(attempts: number, minutes: number) => string} stoppedTrying the window has made every try within this many minutes, and starts the server no more by itself
 * @property {string} stoppedWithoutSayingHow the server has gone, and nothing says whether a stop was asked for
 * @property {(service: string | null, window: string) => string} anOlderService the service that answers runs an older version than this window; null when it is from before services said their version
 * @property {(said: string) => string} couldNotOpen the office answered but its page did not load in the window (problem Pc5buYWGRfzy)
 * @property {(said: string) => string} couldNotPair the office refused the window's read or press of its pairing door, so the window did not open it
 * @property {(said: string) => string} couldNotReachPairing nothing answered the window's read or press of the office's pairing door, so the window did not open it
 * @property {string} noNode
 * @property {(path: string) => string} noShippedNode
 * @property {string} trayOpen
 * @property {string} trayRestart
 * @property {string} trayShutDown
 * @property {string} trayShutDownQuestion the question the menu's Shut down asks before it stops anything (wave 13t, round W32)
 * @property {string} trayShutDownSays what happens when the question is answered yes
 * @property {string} trayShutDownYes the press that goes on to shut Mole Office down
 * @property {string} trayShutDownCancel the press that removes the question and stops nothing
 * @property {string} trayOpenAtLogin the menu-bar item that makes a Mac open Mole Office at login (wave 13t, round 20)
 * @property {string} trayNewNote the tray's item that opens a new quick note (wave 13t, round W45)
 * @property {(key: string) => string} quickNoteKeyNotSet the system refused the quick-note key to the window, said in its tray and its log
 * @property {string} aQuickNoteWaitsForTheOffice a quick note was asked for while the window does not show the office
 * @property {string} trayTooltip
 * @property {WindowAnswerWords} says what the window says about each answer of the self-check
 * @property {SandboxWords} sandboxOff what the window says when it runs without Chromium's sandbox
 * @property {KeptStoppingWords} keptStopping what the window says when its page kept stopping and it no longer loads it again
 */

/**
 * THE PAGE KEPT STOPPING (wave 13t, round 16c). When the window's page stops more often than the window
 * loads it again (src/desktop/main.mjs), the window stops loading it and shows a plain page of its own
 * with these words. The same words go into the window's log, in English.
 *
 * @typedef {object} KeptStoppingWords
 * @property {string} title the window's title, which the system draws even when no page can be drawn
 * @property {string} heading
 * @property {(times: number, seconds: number) => string} why
 * @property {(address: string | null) => string} todo the address is the office's, when the window had found it answering
 */

/**
 * THE WINDOW WITHOUT CHROMIUM'S SANDBOX (wave 13t, round 14). The owner's rule is no silent fallback,
 * and the choice is to warn and not refuse: refusing would shut out every tester on a stock Ubuntu
 * 24.04 desktop, where the AppImage's own launcher adds --no-sandbox by itself. So the window says it
 * once, on its check page, with what the sandbox is for and the two ways to turn it on.
 *
 * @typedef {object} SandboxWords
 * @property {string} heading
 * @property {string} why how the window came to run without it
 * @property {string} risk what the sandbox is for, and that the office still works without it
 * @property {string} todo the two ways to turn it on
 */

/**
 * THE SELF-CHECK'S ANSWER AS THE WINDOW SAYS IT TO A PERSON (the review of round 9 of wave 13t).
 *
 * The sentences above are for the `mole-office` command, read in a terminal by somebody who knows
 * what a checkout is. The window is read by the person, so it says each answer in plain words: what
 * is wrong, what each value means, and what they can do. The findings are the self-check's own; only
 * the words differ. `whatTheWindowSays` in src/config/the-self-check.mjs puts them together.
 *
 * @typedef {object} WindowAnswerWords
 * @property {(address: string) => string} healthy
 * @property {(address: string) => string} unhealthy
 * @property {(reason: string) => string} reason one reason the office gave, in its own words
 * @property {string} unhealthyTodo
 * @property {(failure: 'refused' | 'timeout' | 'unreadable') => string} notAnswering in plain words, by how the read failed; the system's own detail is shown only in Developer mode
 * @property {string} stableTagRefusal the owner sentence when the copy the office runs from is not at its dated stable tag, so no start can help
 * @property {string} stableTagPutBackLabel the label before the two put-back steps, in the detail only somebody in Developer mode reads
 * @property {string} detail the label over the system's own detail, shown only in Developer mode
 * @property {(address: string) => string} wrongWorld
 * @property {(address: string, why: string) => string} noWorld
 * @property {(address: string) => string} cannotTell
 * @property {string} notOpened
 * @property {string} differsHeading
 * @property {string} unknownHeading
 * @property {string} answeringHeading
 * @property {(answered: string, expected: string) => string} differs
 * @property {(unknownTo: 'this checkout' | 'the office answering' | 'both', expected: string, answered: string) => string} unknown
 * @property {string} wrongTodo
 * @property {string} cannotTellTodo
 * @property {Readonly<Record<'database' | 'repository' | 'port' | 'head' | 'standing', string>>} labels
 * @property {Readonly<Record<string, string>>} standingMeans what each stored standing means, keyed by the stored word
 * @property {(stored: string) => string} unknownStanding
 */

/**
 * The window's own words, by language. Every sentence is true on the one path that shows it. A line
 * about work in progress names the state, not the command doing it (chapter 6, rule 4). A failure
 * names the command, because it quotes what that command said.
 */
export const WINDOW_WORDS = Object.freeze({
  en: /** @type {WindowWords} */ ({
    title: 'Mole Office',
    checking: "Checking whether this window's Mole Office is answering.",
    starting: 'Starting Mole Office.',
    restarting: 'Restarting the service.',
    stopping: 'Shutting down Mole Office.',
    opening: 'Opening it.',
    openAnyway: 'Open it anyway',
    openTheOffice: 'Open Mole Office',
    checkAgain: 'Check again',
    about: (version) => (version === null ? 'Mole Office. This build recorded no version.' : `Mole Office ${version}`),
    couldNotStart: (code, said) =>
      code === null
        ? `The office could not be started. \`mole-office start\` did not end with an exit code. ${said}`
        : `The office could not be started. \`mole-office start\` ended with exit code ${String(code)} and said: ${said}`,
    couldNotRestart: (code, said) =>
      code === null
        ? `The service could not be restarted. \`mole-office restart\` did not end with an exit code. ${said}`
        : `The service could not be restarted. \`mole-office restart\` ended with exit code ${String(code)} and said: ${said}`,
    couldNotStop: (code, said) =>
      code === null
        ? `Mole Office was not shut down. \`mole-office stop\` did not end with an exit code. ${said}`
        : `Mole Office was not shut down. \`mole-office stop\` ended with exit code ${String(code)} and said: ${said}`,
    holderStillRunning: (code, said) =>
      `Mole Office's server has stopped, but its terminal holder is still running, so this window stays open. ` +
      `\`mole-office stop\` ended with exit code ${String(code)} and said: ${said}`,
    stillAnswering: (seconds) =>
      `Mole Office said it was shutting down, but it still answered ${String(seconds)} seconds later, so this window stays open. Press Check again to see whether it is running.`,
    stoppedUnasked: "Mole Office's server stopped without being asked to.",
    startsAgainIn: (seconds, attempt, attempts) =>
      `This window starts it again in ${String(seconds)} seconds, try ${String(attempt)} of ${String(attempts)}.`,
    startingAgain: (attempt, attempts) => `Starting it again, try ${String(attempt)} of ${String(attempts)}.`,
    stoppedTrying: (attempts, minutes) =>
      `This window has tried ${String(attempts)} times in ${String(minutes)} minutes to start it again, so it does not try again by itself. Press Check again to start it.`,
    stoppedWithoutSayingHow:
      "Mole Office's server has stopped, and this window cannot tell whether somebody stopped it, so it does not start it again by itself. Press Check again to start it.",
    anOlderService: (service, window) =>
      service === null
        ? `The service that answers runs a Mole Office older than this window's ${window}: it is from before services said their version. It kept running when Mole Office was updated. Restart the service to run ${window}.`
        : `The service that answers runs Mole Office ${service}, older than this window's ${window}. It kept running when Mole Office was updated. Restart the service to run ${window}.`,
    couldNotOpen: (said) => `The office answered, but its page did not load in this window. The window said: ${said}`,
    couldNotPair: (said) => `The office answered, but it did not pair this window, so the window has not opened it. The reason given: ${said}`,
    couldNotReachPairing: (said) => `The window could not reach the office to pair with it, so it has not opened the office. The window said: ${said}`,
    noNode: "The window cannot start the office: no program called node was found on this computer's PATH.",
    noShippedNode: (path) => `The window cannot start the office: the Node this installation carries is missing at ${path}.`,
    trayOpen: 'Open Mole Office',
    trayRestart: 'Restart the service',
    trayShutDown: 'Shut down Mole Office',
    trayShutDownQuestion: 'Shut Mole Office down?',
    trayShutDownSays: 'This stops the office, and this window closes with it.',
    trayShutDownYes: 'Shut down',
    trayShutDownCancel: 'Cancel',
    trayOpenAtLogin: 'Open at login',
    trayNewNote: 'New quick note',
    quickNoteKeyNotSet: (key) => `The key ${key} for a quick note is not set: the system refused it.`,
    aQuickNoteWaitsForTheOffice: 'A quick note opens once the office is open in this window.',
    trayTooltip: 'Mole Office',
    says: {
      healthy: (address) => `This window's Mole Office is answering at ${address}, and it says it is working.`,
      unhealthy: (address) => `This window's Mole Office is answering at ${address}, but it says something is wrong.`,
      reason: (reason) => `It says: ${reason}`,
      unhealthyTodo: 'What you can do: open it anyway to see what it shows, or press Check again later.',
      notAnswering: (failure) =>
        failure === 'refused'
          ? "This window's Mole Office is not running."
          : failure === 'timeout'
            ? "This window's Mole Office did not answer in time."
            : "This window's Mole Office did not answer.",
      stableTagRefusal:
        'Mole Office did not start, because the copy it runs from is not at the version its last upgrade left. Your data was not touched. Ask an agent to put that copy back, then press Check again.',
      stableTagPutBackLabel: 'For the agent who fixes this (not for you):',
      detail: 'What the window found (shown in Developer mode)',
      wrongWorld: (address) => `Another Mole Office is answering at ${address}, the address this window uses.`,
      noWorld: (address, why) =>
        `Something is answering at ${address}, the address this window uses, but it does not say which Mole Office it is: ${why}.`,
      cannotTell: (address) => `A Mole Office is answering at ${address}, but the window cannot tell whether it is this window's own.`,
      notOpened: "The window does not open it, because it cannot show that it is this window's own Mole Office.",
      differsHeading: 'What is different',
      unknownHeading: 'What could not be compared',
      answeringHeading: 'The Mole Office that is answering',
      differs: (answered, expected) => `${answered} (this window's own: ${expected || 'nothing'})`,
      unknown: (unknownTo, expected, answered) =>
        `${unknownTo === 'both' ? 'not known to either side' : unknownTo === 'this checkout' ? 'not known to this window' : 'not known to the one answering'} ` +
        `(this window's own: ${expected || 'nothing'}; the one answering: ${answered || 'nothing'})`,
      wrongTodo:
        'What you can do: shut down the other Mole Office from its own window, or from its tray icon if it has one, and then press Check again. This window cannot stop it for you.',
      cannotTellTodo: 'What you can do: press Check again to ask once more.',
      labels: {
        database: 'Database (an id worked out from its file)',
        repository: 'Folder it was started from',
        port: 'Port',
        head: 'Code version (the commit it runs)',
        standing: 'Kind of office',
      },
      standingMeans: { canonical: 'the office you work in', scratch: 'a separate office, not the one you work in' },
      unknownStanding: (stored) => `not one this window knows (${stored || 'nothing was given'})`,
    },
    sandboxOff: {
      heading: "This window runs without Chromium's sandbox",
      why: "It was started with --no-sandbox. The Mole Office AppImage does this by itself when this computer does not allow the sandbox.",
      risk: 'The sandbox keeps a web page that goes wrong away from the rest of your computer. Mole Office works without it, but it is less safe.',
      todo:
        'To turn it on, whoever looks after this computer can do one of two things. They can add an AppArmor profile that lets the program in the folder where Mole Office is kept use user namespaces. Or they can allow user namespaces for every program, which on Ubuntu is the setting kernel.apparmor_restrict_unprivileged_userns set to 0. Then start Mole Office again.',
    },
    keptStopping: {
      title: 'Mole Office: the page kept stopping',
      heading: 'The page in this window kept stopping',
      why: (times, seconds) =>
        `The page in this window stopped ${String(times)} times within ${String(seconds)} seconds. The window does not load it again, because it would only stop again.`,
      todo: (address) =>
        'What you can do: shut down Mole Office from its tray icon, and then start it again.' +
        (address === null ? '' : ` The office itself may still be running. You can open it in a web browser at ${address}.`),
    },
  }),
  zh: /** @type {WindowWords} */ ({
    title: 'Mole Office',
    checking: '正在检查这个窗口的 Mole Office 是否在回应。',
    starting: '正在启动 Mole Office。',
    restarting: '正在重启服务。',
    stopping: '正在关闭 Mole Office。',
    opening: '正在打开它。',
    openAnyway: '仍然打开',
    openTheOffice: '打开 Mole Office',
    checkAgain: '再检查一次',
    about: (version) => (version === null ? 'Mole Office。这次构建没有记下版本号。' : `Mole Office ${version}`),
    couldNotStart: (code, said) =>
      code === null
        ? `办公室没能启动。\`mole-office start\` 没有以退出码结束。${said}`
        : `办公室没能启动。\`mole-office start\` 以退出码 ${String(code)} 结束，它说：${said}`,
    couldNotRestart: (code, said) =>
      code === null
        ? `服务没能重启。\`mole-office restart\` 没有以退出码结束。${said}`
        : `服务没能重启。\`mole-office restart\` 以退出码 ${String(code)} 结束，它说：${said}`,
    couldNotStop: (code, said) =>
      code === null
        ? `Mole Office 没有关闭。\`mole-office stop\` 没有以退出码结束。${said}`
        : `Mole Office 没有关闭。\`mole-office stop\` 以退出码 ${String(code)} 结束，它说：${said}`,
    holderStillRunning: (code, said) =>
      `Mole Office 的服务器已经停止，但它的终端托管程序仍在运行，所以这个窗口没有关。` +
      `\`mole-office stop\` 以退出码 ${String(code)} 结束，它说：${said}`,
    stillAnswering: (seconds) =>
      `Mole Office 说它正在关闭，但 ${String(seconds)} 秒后它仍然有回应，所以这个窗口没有关。按“再检查一次”看看它是否还在运行。`,
    stoppedUnasked: 'Mole Office 的服务器在没有人要求的情况下停止了。',
    startsAgainIn: (seconds, attempt, attempts) =>
      `这个窗口将在 ${String(seconds)} 秒后重新启动它，第 ${String(attempt)} 次，共 ${String(attempts)} 次。`,
    startingAgain: (attempt, attempts) => `正在重新启动它，第 ${String(attempt)} 次，共 ${String(attempts)} 次。`,
    stoppedTrying: (attempts, minutes) =>
      `这个窗口在 ${String(minutes)} 分钟内已经尝试重新启动它 ${String(attempts)} 次，所以不会再自己尝试。按“再检查一次”来启动它。`,
    stoppedWithoutSayingHow:
      'Mole Office 的服务器已经停止，这个窗口无法判断是否有人停止了它，所以不会自己重新启动它。按“再检查一次”来启动它。',
    anOlderService: (service, window) =>
      service === null
        ? `正在回应的服务运行的 Mole Office 比这个窗口的 ${window} 旧：它来自服务还不报告版本的时候。更新 Mole Office 时它一直在运行。重启服务即可运行 ${window}。`
        : `正在回应的服务运行的是 Mole Office ${service}，比这个窗口的 ${window} 旧。更新 Mole Office 时它一直在运行。重启服务即可运行 ${window}。`,
    couldNotOpen: (said) => `办公室有回应，但它的页面没有在这个窗口里打开。窗口说：${said}`,
    couldNotPair: (said) => `办公室有回应，但它没有和这个窗口配对，所以窗口没有打开它。给出的原因：${said}`,
    couldNotReachPairing: (said) => `窗口没能连上办公室来和它配对，所以窗口没有打开办公室。窗口说：${said}`,
    noNode: '窗口没法启动办公室：在这台电脑的 PATH 里没有找到叫 node 的程序。',
    noShippedNode: (path) => `窗口没法启动办公室：这个安装自带的 Node 不在 ${path}。`,
    trayOpen: '打开 Mole Office',
    trayRestart: '重启服务',
    trayShutDown: '关闭 Mole Office',
    trayShutDownQuestion: '关闭 Mole Office？',
    trayShutDownSays: '办公室会停止，这个窗口也会一起关闭。',
    trayShutDownYes: '关闭 Mole Office',
    trayShutDownCancel: '取消',
    trayOpenAtLogin: '登录时打开',
    trayNewNote: '新建快速笔记',
    quickNoteKeyNotSet: (key) => `快速笔记的快捷键 ${key} 没有设置：系统拒绝了它。`,
    aQuickNoteWaitsForTheOffice: '办公室在这个窗口里打开后，快速笔记就会打开。',
    trayTooltip: 'Mole Office',
    says: {
      healthy: (address) => `这个窗口的 Mole Office 在 ${address} 回应，它说一切正常。`,
      unhealthy: (address) => `这个窗口的 Mole Office 在 ${address} 回应，但它说出了问题。`,
      reason: (reason) => `它说：${reason}`,
      unhealthyTodo: '你可以：仍然打开它，看看它显示什么；或者稍后按“再检查一次”。',
      notAnswering: (failure) =>
        failure === 'refused'
          ? '这个窗口的 Mole Office 没有在运行。'
          : failure === 'timeout'
            ? '这个窗口的 Mole Office 没有及时回应。'
            : '这个窗口的 Mole Office 没有回应。',
      stableTagRefusal:
        'Mole Office 没有启动，因为它运行所用的那份副本不在上一次升级留下的版本上。你的数据没有被动过。请让一位代理把这份副本放回去，然后按“再检查一次”。',
      stableTagPutBackLabel: '给负责处理的代理看（不是给你的）：',
      detail: '窗口看到的原始信息（开发者模式下显示）',
      wrongWorld: (address) => `另一个 Mole Office 在 ${address} 回应，这是这个窗口使用的地址。`,
      noWorld: (address, why) => `${address}（这个窗口使用的地址）有东西在回应，但它没有说自己是哪个 Mole Office：${why}。`,
      cannotTell: (address) => `${address} 有一个 Mole Office 在回应，但窗口没法判断它是不是这个窗口自己的。`,
      notOpened: '窗口不打开它，因为没法证明它是这个窗口自己的 Mole Office。',
      differsHeading: '哪里不一样',
      unknownHeading: '没法比较的地方',
      answeringHeading: '正在回应的 Mole Office',
      differs: (answered, expected) => `${answered}（这个窗口自己的是：${expected || '没有'}）`,
      unknown: (unknownTo, expected, answered) =>
        `${unknownTo === 'both' ? '两边都不知道' : unknownTo === 'this checkout' ? '这个窗口不知道' : '回应的一方不知道'}` +
        `（这个窗口自己的是：${expected || '没有'}；回应的一方是：${answered || '没有'}）`,
      wrongTodo: '你可以：从另一个 Mole Office 自己的窗口，或者它的托盘图标（如果有的话）把它关掉，然后按“再检查一次”。这个窗口没法替你关掉它。',
      cannotTellTodo: '你可以：按“再检查一次”，再问一次。',
      labels: {
        database: '数据库（根据它的文件算出的编号）',
        repository: '启动它的文件夹',
        port: '端口',
        head: '代码版本（它运行的提交）',
        standing: '办公室类型',
      },
      standingMeans: { canonical: '你工作的办公室', scratch: '另一个办公室，不是你工作的那个' },
      unknownStanding: (stored) => `这个窗口不认识的类型（${stored || '没有给出'}）`,
    },
    sandboxOff: {
      heading: '这个窗口没有用 Chromium 的沙盒运行',
      why: '它启动时带了 --no-sandbox。如果这台电脑不允许使用沙盒，Mole Office 的 AppImage 会自己这样做。',
      risk: '沙盒能让出错的网页碰不到电脑的其他部分。没有沙盒，Mole Office 也能用，但没那么安全。',
      todo:
        '要打开沙盒，管理这台电脑的人可以做两件事中的一件：加一个 AppArmor 配置，允许放 Mole Office 的那个文件夹里的程序使用用户命名空间；或者允许所有程序使用用户命名空间，在 Ubuntu 上就是把 kernel.apparmor_restrict_unprivileged_userns 设为 0。然后重新启动 Mole Office。',
    },
    keptStopping: {
      title: 'Mole Office：页面一再停止',
      heading: '这个窗口里的页面一再停止',
      why: (times, seconds) => `这个窗口里的页面在 ${String(seconds)} 秒内停止了 ${String(times)} 次。窗口不再重新加载它，因为它只会再次停止。`,
      todo: (address) =>
        '你可以：从托盘图标关闭 Mole Office，然后重新启动它。' + (address === null ? '' : `办公室本身可能还在运行，你可以在浏览器里打开 ${address}。`),
    },
  }),
})

/**
 * The language of these words for a locale such as `zh-CN` or `en-GB`: Chinese for any Chinese
 * locale, English otherwise, since those are the two languages this table holds.
 *
 * @param {string} locale
 * @returns {'en' | 'zh'}
 */
export function theLanguageFor(locale) {
  return locale.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

/**
 * The language of these words for a system that lists `languages`, its first choice first, as Electron's
 * app.getPreferredSystemLanguages() gives them: the first one's (theLanguageFor). A system that lists none,
 * as Linux does when LANG is C, gets English.
 *
 * @param {readonly string[]} languages
 * @returns {'en' | 'zh'}
 */
export function theSystemsLanguage(languages) {
  return theLanguageFor(languages[0] ?? 'en')
}
