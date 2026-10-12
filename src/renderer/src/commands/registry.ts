/**
 * Command registry: maps command IDs to handlers and enablement. Menus, keymaps, the toolbar
 * and the native menu bridge dispatch through it by ID.
 */

export interface CommandDefinition {
  /** Stable ID, e.g. `edit.undo`. */
  readonly id: string
  /** Default label (menus may override). */
  readonly label: string
  readonly run: (...args: unknown[]) => unknown
  /** Default: always enabled. */
  readonly isEnabled?: () => boolean
  /** For toggle commands. */
  readonly isChecked?: () => boolean
}

export class CommandRegistry {
  private readonly commands = new Map<string, CommandDefinition>()

  /** Registers a command; returns a function that unregisters it. Throws on duplicate IDs. */
  register(command: CommandDefinition): () => void {
    if (this.commands.has(command.id)) throw new Error(`Command ${command.id} is already registered`)
    this.commands.set(command.id, command)
    return () => {
      if (this.commands.get(command.id) === command) this.commands.delete(command.id)
    }
  }

  has(id: string): boolean {
    return this.commands.has(id)
  }

  get(id: string): CommandDefinition | undefined {
    return this.commands.get(id)
  }

  all(): CommandDefinition[] {
    return [...this.commands.values()]
  }

  isEnabled(id: string): boolean {
    const command = this.commands.get(id)
    return command !== undefined && (command.isEnabled?.() ?? true)
  }

  isChecked(id: string): boolean | undefined {
    return this.commands.get(id)?.isChecked?.()
  }

  /**
   * Runs a command if it exists and is enabled. Returns the handler's result, or `undefined`
   * when the command is unknown or disabled.
   */
  execute(id: string, ...args: unknown[]): unknown {
    const command = this.commands.get(id)
    if (!command || !(command.isEnabled?.() ?? true)) return undefined
    return command.run(...args)
  }
}

/** Well-known command IDs shared by menus, keymaps and the native menu bridge. */
export const CommandIds = {
  fileNew: 'file.new',
  fileOpen: 'file.open',
  fileSave: 'file.save',
  fileSaveAs: 'file.save-as',
  fileClose: 'file.close',
  editUndo: 'edit.undo',
  editRedo: 'edit.redo',
  editDelete: 'edit.delete',
  editDeleteFromModel: 'edit.delete-from-model',
  editSelectAll: 'edit.select-all'
} as const
