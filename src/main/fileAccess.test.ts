import { chmod, mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FileAccess, FileTooLargeError, readProjectFile, writeFileAtomic } from './fileAccess'

describe('FileAccess', () => {
  it('reads project files only', () => {
    const access = new FileAccess('linux')
    expect(access.canRead('/home/u/model.mdj')).toBe(true)
    expect(access.canRead('/home/u/MODEL.MDJ')).toBe(true)
    expect(access.canRead('/home/u/.ssh/id_rsa')).toBe(false)
    expect(access.canRead(42)).toBe(false)
    expect(access.canRead('model.mdj')).toBe(false)
    expect(access.canRead('../../model.mdj')).toBe(false)
    expect(access.canRead('/home/u/a\0.mdj')).toBe(false)
  })

  it('refuses relative write paths even when they resolve to a granted file', () => {
    const access = new FileAccess('linux')
    access.grantFile(`${process.cwd()}/out.mdj`)
    expect(access.canWrite('out.mdj')).toBe(false)
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

describe('FileAccess with symbolic links', () => {
  let dir = ''
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it('does not follow a link inside a granted folder to a place outside it', async () => {
    dir = await realpath(await mkdtemp(join(tmpdir(), 'openuml-')))
    await mkdir(join(dir, 'export'))
    await mkdir(join(dir, 'secret'))
    await symlink(join(dir, 'secret'), join(dir, 'export', 'link'))
    await writeFile(join(dir, 'secret', 'file.png'), 'keep')
    await symlink(join(dir, 'secret', 'file.png'), join(dir, 'export', 'file-link.png'))
    await symlink(join(dir, 'secret', 'missing.png'), join(dir, 'export', 'dangling.png'))
    const access = new FileAccess(process.platform)
    access.grantFolder(join(dir, 'export'))
    expect(await access.canWriteResolved(join(dir, 'export', 'a.png'))).toBe(true)
    expect(await access.canWriteResolved(join(dir, 'export', 'new', 'b.png'))).toBe(true)
    expect(access.canWrite(join(dir, 'export', 'link', 'authorized_keys'))).toBe(true)
    expect(await access.canWriteResolved(join(dir, 'export', 'link', 'authorized_keys'))).toBe(false)
    expect(await access.canWriteResolved(join(dir, 'export', 'file-link.png'))).toBe(false)
    expect(await access.canWriteResolved(join(dir, 'other.png'))).toBe(false)
    // A dangling link is replaced by the atomic write, never followed.
    expect(await access.canWriteResolved(join(dir, 'export', 'dangling.png'))).toBe(true)
    await writeFileAtomic(join(dir, 'export', 'dangling.png'), 'data')
    expect(await readdir(join(dir, 'secret'))).toEqual(['file.png'])
  })

  it('follows links for files the user chose', async () => {
    dir = await realpath(await mkdtemp(join(tmpdir(), 'openuml-')))
    await writeFile(join(dir, 'real.mdj'), '{}')
    await symlink(join(dir, 'real.mdj'), join(dir, 'link.mdj'))
    const access = new FileAccess(process.platform)
    access.grantFile(join(dir, 'link.mdj'))
    expect(await access.canWriteResolved(join(dir, 'link.mdj'))).toBe(true)
  })
})

describe('readProjectFile', () => {
  let dir = ''
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it('reads project files and links to project files', async () => {
    dir = await mkdtemp(join(tmpdir(), 'openuml-'))
    await writeFile(join(dir, 'a.mdj'), '{"_type":"Project"}')
    await symlink(join(dir, 'a.mdj'), join(dir, 'b.mdj'))
    expect(await readProjectFile(join(dir, 'a.mdj'), true)).toBe('{"_type":"Project"}')
    expect(await readProjectFile(join(dir, 'b.mdj'), true)).toBe('{"_type":"Project"}')
  })

  it('refuses a .mdj link to another kind of file, folders and oversized files', async () => {
    dir = await mkdtemp(join(tmpdir(), 'openuml-'))
    await writeFile(join(dir, 'id_rsa'), 'secret')
    await symlink(join(dir, 'id_rsa'), join(dir, 'model.mdj'))
    await expect(readProjectFile(join(dir, 'model.mdj'), true)).rejects.toThrow(/not a project file/)
    // A file the user picked in the open dialog may be a link to any name.
    expect(await readProjectFile(join(dir, 'model.mdj'), false)).toBe('secret')
    await mkdir(join(dir, 'folder.mdj'))
    await expect(readProjectFile(join(dir, 'folder.mdj'), true)).rejects.toThrow(/not a file/)
    await writeFile(join(dir, 'big.mdj'), 'x'.repeat(100))
    await expect(readProjectFile(join(dir, 'big.mdj'), true, 10)).rejects.toBeInstanceOf(FileTooLargeError)
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

  it('keeps the permissions of the replaced file', async () => {
    dir = await mkdtemp(join(tmpdir(), 'openuml-'))
    const path = join(dir, 'model.mdj')
    await writeFile(path, 'old')
    await chmod(path, 0o600)
    await writeFileAtomic(path, 'new')
    expect((await stat(path)).mode & 0o777).toBe(0o600)
    expect(await readFile(path, 'utf8')).toBe('new')
  })

  it('writes through a symbolic link', async () => {
    dir = await mkdtemp(join(tmpdir(), 'openuml-'))
    await writeFile(join(dir, 'real.mdj'), 'old')
    await symlink(join(dir, 'real.mdj'), join(dir, 'link.mdj'))
    await writeFileAtomic(join(dir, 'link.mdj'), 'new')
    expect(await readFile(join(dir, 'real.mdj'), 'utf8')).toBe('new')
  })
})
