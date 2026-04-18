import { toast } from "sonner"
import type { TLKeyboardEventInfo, TLPointerEventInfo } from "tldraw"
import { atom, Box, StateNode } from "tldraw"
import { exportCropImage } from "@/tools/camera/export-image"

const MIN_CROP_SIZE = 8

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

    if (w > MIN_CROP_SIZE && h > MIN_CROP_SIZE) {
      const bounds = Box.FromPoints([
        { x: startX, y: startY },
        { x: currentX, y: currentY },
      ])
      exportCropImage(this.editor, bounds)
      this.editor.setCurrentTool("select")
      return
    }

    // A deliberate (non-zero) drag that fell below the threshold — nudge the
    // user and stay on the camera tool so they can retry without reactivating.
    if (w > 1 || h > 1) {
      toast.info("Crop too small — drag a larger area to export")
      return
    }

    // Zero-drag click: treat as a cancel and return to select.
    this.editor.setCurrentTool("select")
  }

  override onKeyDown(info: TLKeyboardEventInfo) {
    if (info.key === "Escape") {
      cropStateAtom.set({ status: "idle" })
      this.editor.setCurrentTool("select")
    }
  }
}
