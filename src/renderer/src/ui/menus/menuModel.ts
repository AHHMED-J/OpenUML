/**
 * Declarative menus. Menus are data (`MenuNode` trees) resolved against the command registry
 * into `ResolvedMenuItem`s: hidden items dropped, separators tidied, enablement and checked state
 * taken from the command definitions (so the native menu, context menus and palette agree).
 */
import type { MenuItemSpec } from '../../../../shared/ipc'
import { toAccelerator, type Platform } from '../keymap'

export interface MenuNode {
  /** Stable id (spec menu id), used for tests and debugging. */
  readonly id?: string
  readonly label?: string | (() => string)
  /** Command id to run. */
  readonly command?: string
  /** Argument passed to the command. Must be JSON-serializable for native menus. */
  readonly args?: unknown
  /** Shows a check mark bound to the command's `isChecked`. */
  readonly checkbox?: boolean
  readonly separator?: boolean
  /** Electron role (native menus only; ignored in in-app menus). */
  readonly role?: string
  readonly submenu?: readonly MenuNode[] | (() => readonly MenuNode[])
  /** Label of the disabled item shown when every child of the submenu is hidden. */
  readonly placeholder?: string
  /** Default: visible. */
  readonly visible?: () => boolean
  /** Overrides the command's enablement. */
  readonly enabled?: () => boolean
  /** Overrides the command's checked state. */
  readonly checked?: () => boolean
}

/** Read access to command state (satisfied by `CommandRegistry`). */
export interface CommandStateSource {
  has(id: string): boolean
  isEnabled(id: string): boolean
  isChecked(id: string): boolean | undefined
}

export interface MenuContext {
  readonly commands: CommandStateSource
  readonly platform: Platform
  /** Primary keystroke descriptor bound to a command. */
  keystrokeFor?(command: string): string | undefined
  /** Commands that are enabled regardless of the registry (e.g. native edit with a focused text field). */
  readonly forceEnabled?: ReadonlySet<string>
}

export type ResolvedMenuItem =
  | { readonly kind: 'separator' }
  | {
      readonly kind: 'item'
      readonly id?: string
      readonly label: string
      readonly command?: string
      readonly args?: unknown
      readonly role?: string
      readonly enabled: boolean
      readonly checked?: boolean
      readonly keystroke?: string
    }
  | {
      readonly kind: 'submenu'
      readonly id?: string
      readonly label: string
      readonly enabled: boolean
      readonly items: readonly ResolvedMenuItem[]
    }

function labelOf(node: MenuNode): string {
  return typeof node.label === 'function' ? node.label() : (node.label ?? '')
}

function childrenOf(node: MenuNode): readonly MenuNode[] | undefined {
  return typeof node.submenu === 'function' ? node.submenu() : node.submenu
}

/** Removes leading, trailing and repeated separators. */
export function tidySeparators(items: readonly ResolvedMenuItem[]): ResolvedMenuItem[] {
  const result: ResolvedMenuItem[] = []
  for (const item of items) {
    if (item.kind === 'separator' && (result.length === 0 || result.at(-1)?.kind === 'separator')) continue
    result.push(item)
  }
  while (result.at(-1)?.kind === 'separator') result.pop()
  return result
}

export function resolveMenu(nodes: readonly MenuNode[], ctx: MenuContext): ResolvedMenuItem[] {
  const items: ResolvedMenuItem[] = []
  for (const node of nodes) {
    if (node.visible && !node.visible()) continue
    if (node.separator) {
      items.push({ kind: 'separator' })
      continue
    }
    const children = childrenOf(node)
    if (children) {
      let sub = resolveMenu(children, ctx)
      if (sub.length === 0) {
        if (!node.placeholder) continue
        sub = [{ kind: 'item', label: node.placeholder, enabled: false }]
      }
      items.push({
        kind: 'submenu',
        id: node.id,
        label: labelOf(node),
        enabled: node.enabled ? node.enabled() : true,
        items: sub
      })
      continue
    }
    const command = node.command
    let enabled: boolean
    if (node.enabled) enabled = node.enabled()
    else if (command) enabled = ctx.forceEnabled?.has(command) === true || ctx.commands.isEnabled(command)
    else enabled = node.role !== undefined
    const checked = node.checkbox
      ? (node.checked ? node.checked() : command ? (ctx.commands.isChecked(command) ?? false) : false)
      : undefined
    items.push({
      kind: 'item',
      id: node.id,
      label: labelOf(node),
      command,
      args: node.args,
      role: node.role,
      enabled,
      ...(checked !== undefined ? { checked } : {}),
      ...(command && node.args === undefined && ctx.keystrokeFor ? { keystroke: ctx.keystrokeFor(command) } : {})
    })
  }
  return tidySeparators(items)
}

// ---------------------------------------------------------------------------------------------
// Native menu conversion

const ARGS_SEPARATOR = '\u001f'

/** Encodes a command and its argument into the single string the native menu sends back. */
export function encodeMenuCommand(command: string, args?: unknown): string {
  return args === undefined ? command : `${command}${ARGS_SEPARATOR}${JSON.stringify(args)}`
}

export function decodeMenuCommand(token: string): { command: string; args?: unknown } {
  const i = token.indexOf(ARGS_SEPARATOR)
  if (i < 0) return { command: token }
  try {
    return { command: token.slice(0, i), args: JSON.parse(token.slice(i + 1)) as unknown }
  } catch {
    return { command: token.slice(0, i) }
  }
}

/** Keys without modifiers that must stay with focused widgets (not registered as native accelerators). */
function isNativeAcceleratorAllowed(descriptor: string): boolean {
  if (/^(cmd|ctrl|alt|shift)-/.test(descriptor)) return true
  return /^f\d+$/.test(descriptor)
}

/** Converts resolved items into the native menu description sent to the main process. */
export function toNativeMenu(items: readonly ResolvedMenuItem[], platform: Platform): MenuItemSpec[] {
  return items.map((item): MenuItemSpec => {
    if (item.kind === 'separator') return { type: 'separator' }
    if (item.kind === 'submenu') {
      return { label: item.label, type: 'submenu', enabled: item.enabled, submenu: toNativeMenu(item.items, platform) }
    }
    if (item.role) return { role: item.role, ...(item.label ? { label: item.label } : {}) }
    const spec: MenuItemSpec = {
      label: item.label,
      enabled: item.enabled,
      type: item.checked !== undefined ? 'checkbox' : 'normal'
    }
    if (item.checked !== undefined) spec.checked = item.checked
    if (item.command) spec.command = encodeMenuCommand(item.command, item.args)
    if (item.keystroke && isNativeAcceleratorAllowed(item.keystroke)) {
      const accelerator = toAccelerator(item.keystroke, platform)
      if (accelerator) spec.accelerator = accelerator
    }
    return spec
  })
}

/** Descriptors registered as native accelerators (the renderer keymap leaves them to the menu). */
export function nativeAcceleratorDescriptors(items: readonly ResolvedMenuItem[]): Set<string> {
  const result = new Set<string>()
  const visit = (list: readonly ResolvedMenuItem[]): void => {
    for (const item of list) {
      if (item.kind === 'submenu') visit(item.items)
      else if (item.kind === 'item' && item.keystroke && !item.role && isNativeAcceleratorAllowed(item.keystroke)) {
        result.add(item.keystroke)
      }
    }
  }
  visit(items)
  return result
}
