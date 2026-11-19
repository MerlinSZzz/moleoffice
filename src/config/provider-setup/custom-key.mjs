// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// A key the person names, from Settings or the guided command, is saved in one folder of the home's .config. Both read
// the folder and the file name here, so a key saved by one is found by the other.
/** The folder and file of a key the person names. */
export const customKey = (name) => ({ folder: 'mole-office-custom', file: `${name}.key` })
