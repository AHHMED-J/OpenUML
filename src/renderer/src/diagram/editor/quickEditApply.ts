/**
 * Commits a quick edit (spec 02 §7.7): parses the text for the edit target and applies it as one
 * undoable operation. Absent clauses clear their field; stereotype and type names are resolved
 * to elements by name lookup from the element's namespace outward, else stored as text.
 */
import type { ModelEngine, OperationBuilder } from '../../commands'
import { createElement, fieldOf, isKindOf, type Elem, type Repository, type UMLParameter } from '../../model'
import type { EditTarget } from '../layout/types'
import { parseAttribute, parseName, parseOperation, type ParsedName, type ParsedParameter } from './quickEditSyntax'

/** Finds an element of `type` named `name`, searching `from`'s namespaces outward, then anywhere. */
export function resolveByName(repo: Repository, from: Elem, name: string, type: string): Elem | null {
  for (let ns: Elem | null = from._parent; ns; ns = ns._parent) {
    for (const child of repo.children(ns)) {
      if (isKindOf(child, type) && child['name'] === name) return child
    }
  }
  for (const el of repo.elements()) if (isKindOf(el, type) && el['name'] === name) return el
  return null
}

function setIfField(b: OperationBuilder, el: Elem, field: string, value: unknown): void {
  if (fieldOf(el, field)) b.set(el, field, value)
}

function stereotypeValue(repo: Repository, el: Elem, name: string | null): unknown {
  if (!name) return fieldOf(el, 'stereotype')?.kind === 'prim' ? '' : null
  if (fieldOf(el, 'stereotype')?.kind === 'prim') return name
  return resolveByName(repo, el, name, 'UMLStereotype') ?? name
}

function typeValue(repo: Repository, el: Elem, name: string | null): unknown {
  if (!name) return null
  return resolveByName(repo, el, name, 'UMLClassifier') ?? name
}

type RenameHook = (b: OperationBuilder, repo: Repository, el: Elem) => void
const renameHooks: RenameHook[] = []

/** Registers a callback run inside every inline rename, after the name was set (e.g. to keep titles in sync). */
export function registerRenameHook(hook: RenameHook): void {
  renameHooks.push(hook)
}

/**
 * Renames elements in one operation and runs the rename hooks, so a rename from anywhere (Model
 * Explorer, Property Editor) keeps dependent names in sync like an inline rename does.
 */
export function renameElements(engine: ModelEngine, elements: readonly Elem[], name: string, operation = 'Rename'): void {
  engine.transact(operation, (b) => {
    for (const el of elements) {
      b.set(el, 'name', name)
      for (const hook of renameHooks) hook(b, engine.repository, el)
    }
  })
}

function applyName(b: OperationBuilder, repo: Repository, el: Elem, parsed: ParsedName): void {
  setIfField(b, el, 'name', parsed.name)
  for (const hook of renameHooks) hook(b, repo, el)
  setIfField(b, el, 'visibility', parsed.visibility ?? 'public')
  if (fieldOf(el, 'stereotype')) b.set(el, 'stereotype', stereotypeValue(repo, el, parsed.stereotype))
}

/** A notation-specific quick-edit syntax (target kind `custom`). */
export interface QuickEditSyntax<P = unknown> {
  /** Placeholder text of the editor. */
  readonly hint: string
  /** Parses the text; null rejects the edit. */
  parse(text: string): P | null
  /** Applies a parsed value to the element (inside the edit's operation). */
  apply(b: OperationBuilder, repo: Repository, el: Elem, parsed: P): void
}

const customSyntaxes = new Map<string, QuickEditSyntax>()

/** Registers (or replaces) a quick-edit syntax for `{ kind: 'custom', syntax }` edit targets. */
export function registerQuickEditSyntax<P>(syntax: string, handler: QuickEditSyntax<P>): void {
  customSyntaxes.set(syntax, handler as QuickEditSyntax)
}

/** Placeholder text for a custom syntax ('' when unknown). */
export function quickEditSyntaxHint(syntax: string): string {
  return customSyntaxes.get(syntax)?.hint ?? ''
}

/**
 * Applies `text` to the edit target. Returns false (and changes nothing) when the text does not
 * parse or the target no longer exists.
 */
export function applyQuickEdit(engine: ModelEngine, target: EditTarget, text: string): boolean {
  const repo = engine.repository
  if (target.kind === 'text') {
    const view = repo.get(target.viewId)
    if (!view) return false
    engine.transact('Change Text', (b) => b.set(view, 'text', text))
    return true
  }
  const el = repo.get(target.elementId)
  if (!el) return false
  switch (target.kind) {
    case 'custom': {
      const handler = customSyntaxes.get(target.syntax)
      const parsed = handler?.parse(text)
      if (!handler || parsed === null || parsed === undefined) return false
      engine.transact('Change Properties', (b) => handler.apply(b, repo, el, parsed))
      return true
    }
    case 'field': {
      engine.transact('Change Properties', (b) => b.set(el, target.field, text.trim()))
      return true
    }
    case 'name':
    case 'literal': {
      const parsed = parseName(text)
      if (!parsed) return false
      engine.transact('Rename', (b) => applyName(b, repo, el, parsed))
      return true
    }
    case 'attribute': {
      const parsed = parseAttribute(text)
      if (!parsed) return false
      engine.transact('Change Attribute', (b) => {
        applyName(b, repo, el, parsed)
        setIfField(b, el, 'type', typeValue(repo, el, parsed.type))
        setIfField(b, el, 'multiplicity', parsed.multiplicity)
        setIfField(b, el, 'defaultValue', parsed.defaultValue)
      })
      return true
    }
    case 'typedName': {
      const parsed = parseAttribute(text)
      if (!parsed) return false
      engine.transact('Rename', (b) => {
        applyName(b, repo, el, parsed)
        setIfField(b, el, 'type', typeValue(repo, el, parsed.type))
        setIfField(b, el, 'multiplicity', parsed.multiplicity)
      })
      return true
    }
    case 'operation': {
      const parsed = parseOperation(text)
      if (!parsed) return false
      engine.transact('Change Operation', (b) => {
        applyName(b, repo, el, parsed)
        applyParameters(b, repo, el, parsed.parameters, parsed.returnType, parsed.returnMultiplicity)
      })
      return true
    }
  }
}

/** Updates parameters in place by position (keeping IDs), appending/removing as needed. */
function applyParameters(
  b: OperationBuilder,
  repo: Repository,
  op: Elem,
  params: readonly ParsedParameter[] | null,
  returnType: string | null,
  returnMultiplicity: string
): void {
  const list = () => (Array.isArray(op['parameters']) ? (op['parameters'] as UMLParameter[]) : [])
  if (params) {
    const existing = list().filter((p) => p.direction !== 'return')
    params.forEach((p, i) => {
      const values = {
        name: p.name,
        direction: p.direction,
        multiplicity: p.multiplicity,
        defaultValue: p.defaultValue
      }
      const current = existing[i]
      if (current) {
        b.setAll(current, values)
        b.set(current, 'type', typeValue(repo, current, p.type))
      } else {
        const param = createElement('UMLParameter', values)
        // Insert before the return parameter (if any) to keep it last.
        const ret = list().findIndex((x) => x.direction === 'return')
        b.insert(op, 'parameters', param, ret >= 0 ? ret : undefined)
        b.set(param, 'type', typeValue(repo, param, p.type))
      }
    })
    for (const surplus of existing.slice(params.length)) b.remove(surplus)
  }
  const ret = list().find((p) => p.direction === 'return')
  if (returnType) {
    if (ret) {
      b.set(ret, 'type', typeValue(repo, ret, returnType))
      b.set(ret, 'multiplicity', returnMultiplicity)
    } else {
      const param = createElement('UMLParameter', { name: '', direction: 'return', multiplicity: returnMultiplicity })
      b.insert(op, 'parameters', param)
      b.set(param, 'type', typeValue(repo, param, returnType))
    }
  } else if (ret) {
    b.remove(ret)
  }
}
