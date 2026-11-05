/** The canvas a drawing is made on (see `core/canvasPalette`); light unless a parent says otherwise. */
import { createContext, useContext } from 'react'
import { LIGHT_CANVAS, type CanvasPalette } from '../core'

export const CanvasContext = createContext<CanvasPalette>(LIGHT_CANVAS)

export function useCanvasPalette(): CanvasPalette {
  return useContext(CanvasContext)
}
