import { mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FileAccess, writeFileAtomic } from './fileAccess'

describe('FileAccess', () => {
  it('reads project files only', () => {
    const access = new FileAccess('linux')
    expect(access.canRead('/home/u/model.mdj')).toBe(true)
    expect(access.canRead('/home/u/MODEL.MDJ')).toBe(true)
    expect(access.canRead('/home/u/.ssh/id_rsa')).toBe(false)
    expect(access.canRead(42)).toBe(false)
  })

  it('writes only granted files (with the extensions the caller may append) and inside granted folders', () => {
    const access = new FileAccess('linux')
    access.grantFile('/home/u/diagram', ['png', '../../../etc/passwd'])
    access.grantFolder('/home/u/export')
    expect(access.canWrite('/home/u/diagram')).toBe(true)
    expect(access.canWrite('/home/u/diagram.png')).toBe(true)
    expect(access.canWrite('/home/u/diagram.svg')).toBe(false)
    expect(access.canWrite('/etc/passwd')).toBe(false)
    expect(access.canWrite('/home/u/export/png/a_0.png')).toBe(true)
    expect(access.canWrite('/home/u/export/../.bashrc')).toBe(false)
    expect(access.canWrite('/home/u/exported.png')).toBe(false)
    expect(access.canWrite('/home/u/other.mdj')).toBe(false)
  })

  it('compares paths case-insensitively off Linux', () => {
    const access = new FileAccess('win32')
    access.grantFile('C:\\Users\\U\\Model.mdj')
    expect(access.canWrite('c:\\users\\u\\model.MDJ')).toBe(true)
  })
})

describe('writeFileAtomic', () => {
  let dir = ''
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it('replaces the file, creates missing folders and leaves no temporary file', async () => {
    dir = await mkdtemp(join(tmpdir(), 'openuml-'))
    const path = join(dir, 'a', 'b', 'model.mdj')
    await writeFileAtomic(path, 'one')
    await writeFileAtomic(path, 'two')
    expect(await readFile(path, 'utf8')).toBe('two')
    expect(await readdir(join(dir, 'a', 'b'))).toEqual(['model.mdj'])
  })

  it('keeps the original file when the write fails', async () => {
    dir = await mkdtemp(join(tmpdir(), 'openuml-'))
    const path = join(dir, 'model.mdj')
    await writeFile(path, 'original')
    await expect(writeFileAtomic(path, { bad: true } as unknown as string)).rejects.toThrow()
    expect(await readFile(path, 'utf8')).toBe('original')
    expect(await readdir(dir)).toEqual(['model.mdj'])
  })

  it('writes through a symbolic link', async () => {
    dir = await mkdtemp(join(tmpdir(), 'openuml-'))
    await writeFile(join(dir, 'real.mdj'), 'old')
    await symlink(join(dir, 'real.mdj'), join(dir, 'link.mdj'))
    await writeFileAtomic(join(dir, 'link.mdj'), 'new')
    expect(await readFile(join(dir, 'real.mdj'), 'utf8')).toBe('new')
  })
})
