/**
 * Example models bundled with the app (File > Open Example). Their text is compiled into the
 * renderer, so opening one reads no file and needs no file access.
 */
import softwareRelease from '../../../../examples/software-release-idef0.mdj?raw'

export interface BundledExample {
  readonly id: string
  readonly label: string
  readonly text: string
}

export const EXAMPLES: readonly BundledExample[] = [{ id: 'software-release-idef0', label: 'Software Release (IDEF0)', text: softwareRelease }]
