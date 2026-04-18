import { createShapeId, StateNode, type TLShapeId } from "tldraw"
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
    // Skip pins (we don't attach pins to pins) and the PDF-page image shapes
    // — those are locked backdrops; attaching to them would let a stray drag
    // of the page drag every pin on it.
    const nonPinShapes = editor
      .getShapesAtPoint(point, { hitInside: true })
      .filter((shape) => shape.type !== "pin" && !shape.meta?.isPdfPage)

    const attachedShapeIds: TLShapeId[] = nonPinShapes.map((shape) => shape.id)

    editor.markHistoryStoppingPoint("create pin")
    editor.createShape<TLPinShape>({
      id: createShapeId(),
      type: "pin",
      x: point.x - PIN_WIDTH / 2,
      y: point.y - PIN_HEIGHT,
      props: { attachedShapeIds },
    })
    editor.setCurrentTool("select")
  }
}
