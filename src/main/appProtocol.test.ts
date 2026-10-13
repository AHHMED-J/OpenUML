import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveAppAsset } from './appProtocol'

const root = join('/', 'app', 'out', 'renderer')

describe('resolveAppAsset', () => {
  it('maps app://openuml/ URLs to files of the bundle', () => {
    expect(resolveAppAsset(root, 'app://openuml/index.html')).toBe(join(root, 'index.html'))
    expect(resolveAppAsset(root, 'app://openuml/')).toBe(join(root, 'index.html'))
    expect(resolveAppAsset(root, 'app://openuml/assets/index-abc.js?v=1#x')).toBe(join(root, 'assets', 'index-abc.js'))
  })

  it('keeps dot segments inside the bundle (the URL parser resolves them)', () => {
    expect(resolveAppAsset(root, 'app://openuml/../../main/index.js')).toBe(join(root, 'main', 'index.js'))
    expect(resolveAppAsset(root, 'app://openuml/%2e%2e/%2e%2e/main/index.js')).toBe(join(root, 'main', 'index.js'))
  })

  it('refuses other hosts, schemes, traversal and unexpected file types', () => {
    for (const url of [
      'app://other/index.html',
      'file:///etc/passwd',
      'app://openuml/assets/..%2f..%2fmain%2findex.js',
      'app://openuml/assets/%5c..%5cx.js',
      'app://openuml/a%00.js',
      'app://openuml/%E0%A4%A',
      'app://openuml/secret.txt',
      'app://openuml/assets',
      'not a url'
    ]) {
      expect(resolveAppAsset(root, url)).toBeNull()
    }
  })
})
