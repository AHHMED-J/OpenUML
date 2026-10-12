import { generateId, type Repository } from '../model'
import { OperationBuilder } from './builder'
import { applyOperation, revertOperation, runSteps, type Operation } from './operation'

export const DEFAULT_HISTORY_LIMIT = 100

export type EngineEventType = 'execute' | 'undo' | 'redo'

export interface EngineEvent {
  readonly type: EngineEventType
  readonly operation: Operation
}

export type EngineListener = (event: EngineEvent) => void

export interface TransactOptions {
  /** Apply without entering the undo history (housekeeping, imports). Still marks the project modified. */
  readonly bypass?: boolean
}

/** A model state as `markSaved` understands it (see `ModelEngine.savePoint`). */
export interface SavePoint {
  readonly top: string | null
  readonly bypassCount: number
}

/** Marker meaning "the saved state can no longer be reached through undo/redo". */
const UNREACHABLE = '\u0000unreachable'

/**
 * Owns the repository's change history: runs transactions, keeps the undo/redo stacks
 * (capped, default 100 each), tracks the dirty state relative to the last save and notifies
 * listeners after every executed, undone or redone operation.
 */
export class ModelEngine {
  readOnly = false
  private readonly undoStack: Operation[] = []
  private readonly redoStack: Operation[] = []
  private readonly listeners = new Set<EngineListener>()
  private active: OperationBuilder | null = null
  /** ID of the operation on top of the undo stack when last saved (null = empty stack). */
  private savedTop: string | null = null
  /** Bypass operations recorded so far, and how many of them the saved state includes. */
  private bypassCount = 0
  private savedBypassCount = 0

  constructor(
    readonly repository: Repository,
    private readonly historyLimit = DEFAULT_HISTORY_LIMIT
  ) {}

  /**
   * Runs `build` as one operation named `name` and records it. Nested calls join the outer
   * transaction. If `build` throws, its changes are reverted and the error is rethrown.
   * In read-only mode the changes are reverted and nothing is recorded.
   */
  transact<T>(name: string, build: (b: OperationBuilder) => T, options: TransactOptions = {}): T {
    if (this.active) return build(this.active)
    const builder = new OperationBuilder(this.repository)
    this.active = builder
    let result: T
    try {
      result = build(builder)
    } catch (err) {
      runSteps(this.repository, builder.steps, false)
      throw err
    } finally {
      this.active = null
    }
    if (builder.steps.length === 0) return result
    if (this.readOnly) {
      runSteps(this.repository, builder.steps, false)
      return result
    }
    const op: Operation = {
      id: generateId(),
      time: Date.now(),
      name,
      bypass: options.bypass ?? false,
      steps: builder.steps
    }
    this.record(op)
    this.emit({ type: 'execute', operation: op })
    return result
  }

  /** Applies a pre-built operation (e.g. recorded elsewhere) and records it unless bypass. */
  execute(op: Operation): void {
    if (this.readOnly || op.steps.length === 0) return
    applyOperation(this.repository, op)
    this.record(op)
    this.emit({ type: 'execute', operation: op })
  }

  private record(op: Operation): void {
    if (op.bypass) {
      this.bypassCount++
      return
    }
    this.undoStack.push(op)
    if (this.undoStack.length > this.historyLimit) {
      const dropped = this.undoStack.shift() as Operation
      // Keep the saved marker meaningful when the bottom of the stack is dropped.
      if (this.savedTop === dropped.id) this.savedTop = null
      else if (this.savedTop === null) this.savedTop = UNREACHABLE
    }
    this.redoStack.length = 0
  }

  undo(): Operation | null {
    if (this.readOnly) return null
    const op = this.undoStack.pop()
    if (!op) return null
    revertOperation(this.repository, op)
    this.redoStack.push(op)
    if (this.redoStack.length > this.historyLimit) this.redoStack.shift()
    this.emit({ type: 'undo', operation: op })
    return op
  }

  redo(): Operation | null {
    if (this.readOnly) return null
    const op = this.redoStack.pop()
    if (!op) return null
    applyOperation(this.repository, op)
    this.undoStack.push(op)
    this.emit({ type: 'redo', operation: op })
    return op
  }

  get canUndo(): boolean {
    return !this.readOnly && this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return !this.readOnly && this.redoStack.length > 0
  }

  /** Name of the operation that `undo()` would revert, for menu labels. */
  get undoName(): string | null {
    return this.undoStack.at(-1)?.name ?? null
  }

  get redoName(): string | null {
    return this.redoStack.at(-1)?.name ?? null
  }

  get undoDepth(): number {
    return this.undoStack.length
  }

  get redoDepth(): number {
    return this.redoStack.length
  }

  /** True when the model differs from the last saved (or loaded/created) state. */
  get isDirty(): boolean {
    return this.bypassCount !== this.savedBypassCount || (this.undoStack.at(-1)?.id ?? null) !== this.savedTop
  }

  /** The current state, to pass to `markSaved` once it has been written (changes made meanwhile stay unsaved). */
  get savePoint(): SavePoint {
    return { top: this.undoStack.at(-1)?.id ?? null, bypassCount: this.bypassCount }
  }

  /** Records `point` (default: the current state) as saved. */
  markSaved(point: SavePoint = this.savePoint): void {
    this.savedTop = point.top
    this.savedBypassCount = point.bypassCount
  }

  /** Drops all history and marks the current state as saved. */
  clearHistory(): void {
    this.undoStack.length = 0
    this.redoStack.length = 0
    this.markSaved()
  }

  subscribe(listener: EngineListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(event: EngineEvent): void {
    for (const listener of [...this.listeners]) listener(event)
  }
}
