import { Box, StateNode, atom } from "tldraw"
import type { TLKeyboardEventInfo, TLPointerEventInfo } from "tldraw"
import { exportCropImage } from "./export-image"

type CropState =
  | { status: "idle" }
  | {
      status: "dragging"
      startX: number
      startY: number
      currentX: number
      currentY: number
    }

export const cropStateAtom = atom<CropState>("camera/cropState", {
  status: "idle",
})

export class CameraTool extends StateNode {
  static override id = "camera"

  override onEnter() {
    this.editor.setCursor({ type: "cross", rotation: 0 })
  }

  override onExit() {
    cropStateAtom.set({ status: "idle" })
    this.editor.setCursor({ type: "default", rotation: 0 })
  }

  override onPointerDown(_info: TLPointerEventInfo) {
    const { x, y } = this.editor.inputs.currentPagePoint
    cropStateAtom.set({
      status: "dragging",
      startX: x,
      startY: y,
      currentX: x,
      currentY: y,
    })
  }

  override onPointerMove(_info: TLPointerEventInfo) {
    const state = cropStateAtom.get()
    if (state.status !== "dragging") return
    const { x, y } = this.editor.inputs.currentPagePoint
    cropStateAtom.set({ ...state, currentX: x, currentY: y })
  }

  override onPointerUp(_info: TLPointerEventInfo) {
    const state = cropStateAtom.get()
    if (state.status !== "dragging") return

    const { startX, startY, currentX, currentY } = state
    cropStateAtom.set({ status: "idle" })

    const w = Math.abs(currentX - startX)
    const h = Math.abs(currentY - startY)

    if (w > 8 && h > 8) {
      const bounds = Box.FromPoints([
        { x: startX, y: startY },
        { x: currentX, y: currentY },
      ])
      exportCropImage(this.editor, bounds)
    }

    this.editor.setCurrentTool("select")
  }

  override onKeyDown(info: TLKeyboardEventInfo) {
    if (info.key === "Escape") {
      cropStateAtom.set({ status: "idle" })
      this.editor.setCurrentTool("select")
    }
  }
}
