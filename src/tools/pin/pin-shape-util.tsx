import {
  HTMLContainer,
  type RecordProps,
  Rectangle2d,
  ShapeUtil,
  type TLBaseShape,
} from "tldraw"
import { PinShape } from "@/tools/pin/pin-shape"

// Attached shapes are now expressed as "pin" bindings (see pin-binding-util.ts),
// so the shape itself carries no props. Keeping the shape record empty lets
// tldraw's binding system own the relationship and its delete cascade.
export type TLPinShapeProps = Record<string, never>

export type TLPinShape = TLBaseShape<"pin", TLPinShapeProps>

declare module "tldraw" {
  interface TLGlobalShapePropsMap {
    pin: TLPinShapeProps
  }
}

export const PIN_WIDTH = 24
export const PIN_HEIGHT = 32

export class PinShapeUtil extends ShapeUtil<TLPinShape> {
  static override type = "pin" as const
  static override props: RecordProps<TLPinShape> = {}

  override canEdit = () => false
  override hideResizeHandles = () => true
  override hideRotateHandle = () => true
  override isAspectRatioLocked = () => true

  getDefaultProps(): TLPinShape["props"] {
    return {}
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
