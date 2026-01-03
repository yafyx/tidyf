/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `organize-command` command */
  export type OrganizeCommand = ExtensionPreferences & {}
  /** Preferences accessible in the `quick-tidy` command */
  export type QuickTidy = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `organize-command` command */
  export type OrganizeCommand = {}
  /** Arguments passed to the `quick-tidy` command */
  export type QuickTidy = {}
}

