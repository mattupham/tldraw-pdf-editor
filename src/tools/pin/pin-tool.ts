import { createShapeId, StateNode } from "tldraw"
import {
  PIN_HEIGHT,
  PIN_WIDTH,
  type TLPinShape,
} from "@/tools/pin/pin-shape-util"

export class PinTool extends StateNode {
  static override id = "pin"

  override onEnter = () => {
    this.editor.setCursor({ type: "cross", rotation: 0 })
  }

  override onPointerDown = () => {
    const { editor } = this
    const point = editor.inputs.getCurrentPagePoint()
    // Dynamic membership: the pin itself carries no attachment state. Its
    // "group" is computed on every drag from "which shapes contain the pin's
    // tip right now?" (see use-pin-attachment.ts). This means dropping a 3rd
    // shape onto an existing pin automatically joins the group, and PDF
    // page images are skipped in the query so pins never grab the backdrop.
    editor.markHistoryStoppingPoint("create pin")
    editor.createShape<TLPinShape>({
      id: createShapeId(),
      type: "pin",
      x: point.x - PIN_WIDTH / 2,
      y: point.y - PIN_HEIGHT,
      props: {},
    })
    editor.setCurrentTool("select")
  }
}
