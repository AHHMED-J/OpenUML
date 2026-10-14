import { describe, expect, it } from 'vitest'
import { explorerContextMenu } from './appMenu'
import { Cmd } from './commandIds'

describe('Model Explorer context menu', () => {
  it('offers Highlight as the second-to-last item', () => {
    const items = explorerContextMenu().filter((item) => 'command' in item || 'label' in item)
    const commands = items.map((item) => ('command' in item ? item.command : undefined)).filter(Boolean)
    expect(commands.at(-2)).toBe(Cmd.editHighlight)
    expect(commands.at(-1)).toBe(Cmd.editSelectInDiagram)
  })
})
