import {
  HTMLContainer,
  type RecordProps,
  Rectangle2d,
  ShapeUtil,
  T,
  type TLBaseShape,
  type TLShapeId,
  shapeIdValidator,
} from "tldraw"
import { PinShape } from "./pin-shape"

export interface TLPinShapeProps {
  attachedShapeIds: TLShapeId[]
}

export type TLPinShape = TLBaseShape<"pin", TLPinShapeProps>

// Augment the global shape map so `TLShape`, `editor.createShape`, and
// `editor.updateShapes` all recognise "pin" as a valid shape type.
declare module "tldraw" {
  interface TLGlobalShapePropsMap {
    pin: TLPinShapeProps
  }
}

export const PIN_WIDTH = 24
export const PIN_HEIGHT = 32
export const PIN_HEAD_SIZE = 20
const PIN_HEAD_OFFSET = (PIN_WIDTH - PIN_HEAD_SIZE) / 2

export class PinShapeUtil extends ShapeUtil<TLPinShape> {
  static override type = "pin" as const
  static override props: RecordProps<TLPinShape> = {
    attachedShapeIds: T.arrayOf(shapeIdValidator),
  }

  override canEdit = () => false
  override hideResizeHandles = () => true
  override hideRotateHandle = () => true
  override isAspectRatioLocked = () => true

  getDefaultProps(): TLPinShape["props"] {
    return { attachedShapeIds: [] }
  }

  getGeometry() {
    return new Rectangle2d({
      x: PIN_HEAD_OFFSET,
      y: 0,
      width: PIN_HEAD_SIZE,
      height: PIN_HEAD_SIZE,
      isFilled: true,
    })
  }

  component() {
    return (
      <HTMLContainer
        style={{
          width: PIN_WIDTH,
          height: PIN_HEIGHT,
          pointerEvents: "all",
        }}
      >
        <PinShape />
      </HTMLContainer>
    )
  }

  indicator() {
    return (
      <rect
        x={PIN_HEAD_OFFSET}
        y={0}
        width={PIN_HEAD_SIZE}
        height={PIN_HEAD_SIZE}
      />
    )
  }
}
