/**
 * Toolbox icon colors: each tool takes the color of its kind of element in the Model Explorer
 * (classifiers, packages, features, behaviors, use cases, notes); every relationship shares one
 * "connection" color. The CSS variable `--tool-<color>` holds the value for each theme.
 */
import { EDGE_KINDS } from '../../model'

export type ToolColor = 'classifier' | 'package' | 'feature' | 'behavior' | 'usecase' | 'note' | 'connection'

export const TOOL_COLORS: readonly ToolColor[] = ['classifier', 'package', 'feature', 'behavior', 'usecase', 'note', 'connection']

const BY_KIND: Readonly<Record<string, ToolColor>> = {
  // Classifiers and their instances, lifelines included (they stand for one).
  Class: 'classifier',
  Interface: 'classifier',
  Enumeration: 'classifier',
  DataType: 'classifier',
  PrimitiveType: 'classifier',
  Signal: 'classifier',
  Component: 'classifier',
  Artifact: 'classifier',
  Node: 'classifier',
  Collaboration: 'classifier',
  CollaborationUse: 'classifier',
  Part: 'classifier',
  Object: 'classifier',
  ComponentInstance: 'classifier',
  ArtifactInstance: 'classifier',
  NodeInstance: 'classifier',
  MetaClass: 'classifier',
  Stereotype: 'classifier',
  InformationItem: 'classifier',
  Lifeline: 'classifier',
  CommLifeline: 'classifier',
  TimingLifeline: 'classifier',
  // Containers.
  Package: 'package',
  Model: 'package',
  Subsystem: 'package',
  Partition: 'package',
  HorizontalPartition: 'package',
  RADRole: 'package',
  // Use cases.
  Actor: 'usecase',
  UseCase: 'usecase',
  Subject: 'usecase',
  // Parts of an element: ports, pins, entry and exit points, gates.
  Port: 'feature',
  InputPin: 'feature',
  OutputPin: 'feature',
  EntryPoint: 'feature',
  ExitPoint: 'feature',
  ConnectionPointReference: 'feature',
  Gate: 'feature',
  Endpoint: 'feature',
  // Annotations and constraints.
  Note: 'note',
  Text: 'note',
  IDEF0ModelNote: 'note',
  DurationConstraint: 'note',
  TimeConstraint: 'note'
}

/** Color of a toolbox tool: relationships share one, the rest follow their element; behavior by default. */
export function toolColor(kind: string): ToolColor {
  if (Object.prototype.hasOwnProperty.call(EDGE_KINDS, kind)) return 'connection'
  return BY_KIND[kind] ?? 'behavior'
}
