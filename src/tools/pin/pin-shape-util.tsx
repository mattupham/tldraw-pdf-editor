import {
  HTMLContainer,
  type RecordProps,
  Rectangle2d,
  ShapeUtil,
  shapeIdValidator,
  T,
  type TLBaseShape,
  type TLShapeId,
} from "tldraw"
import { PinShape } from "@/tools/pin/pin-shape"

export type TLPinShapeProps = {
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
      x: 0,
      y: 0,
      width: PIN_WIDTH,
      height: PIN_HEIGHT,
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
    return <rect x={0} y={0} width={PIN_WIDTH} height={PIN_HEIGHT} />
  }

  // HTMLContainer shapes without toSvg render as an empty wrapper in
  // editor.toImage(), so pins would disappear from Export PDF / camera crops.
  // Font size here must match `PinShape`'s on-canvas value so the exported pin
  // isn't visibly larger than the one the user drew.
  override toSvg() {
    return (
      <text
        x={PIN_WIDTH / 2}
        y={PIN_HEIGHT - 4}
        fontSize={24}
        textAnchor="middle"
        dominantBaseline="alphabetic"
      >
        📍
      </text>
    )
  }
}
