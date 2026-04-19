"use client"

import { Camera } from "lucide-react"
import { createContext, useContext, useState } from "react"
import {
  ArrowDownToolbarItem,
  ArrowLeftToolbarItem,
  ArrowRightToolbarItem,
  ArrowToolbarItem,
  ArrowUpToolbarItem,
  AssetToolbarItem,
  CheckBoxToolbarItem,
  CloudToolbarItem,
  DefaultToolbar,
  DiamondToolbarItem,
  DrawToolbarItem,
  type Editor,
  EllipseToolbarItem,
  EraserToolbarItem,
  FrameToolbarItem,
  HandToolbarItem,
  HeartToolbarItem,
  HexagonToolbarItem,
  HighlightToolbarItem,
  LaserToolbarItem,
  LineToolbarItem,
  NoteToolbarItem,
  OvalToolbarItem,
  RectangleToolbarItem,
  RhombusToolbarItem,
  SelectToolbarItem,
  StarToolbarItem,
  TextToolbarItem,
  type TLComponents,
  type TLUiOverrides,
  Tldraw,
  TldrawUiButton,
  TrapezoidToolbarItem,
  TriangleToolbarItem,
  useIsToolSelected,
  useTools,
  XBoxToolbarItem,
} from "tldraw"
import { ExportPdfButton } from "@/components/canvas/export-pdf-button"
import { CameraTool } from "@/tools/camera/camera-tool"
import { CropOverlay } from "@/tools/camera/crop-overlay"
import { usePdfProtection } from "@/tools/pdf/use-pdf-protection"
import { PinShapeUtil } from "@/tools/pin/pin-shape-util"
import { PinTool } from "@/tools/pin/pin-tool"
import { usePinAttachment } from "@/tools/pin/use-pin-attachment"

const EditorContext = createContext<Editor | null>(null)

export function useEditor(): Editor | null {
  return useContext(EditorContext)
}

const customShapeUtils = [PinShapeUtil]
const customTools = [PinTool, CameraTool]

const uiOverrides: TLUiOverrides = {
  tools(editor, tools) {
    // tldraw requires a string `icon` here; we render our own toolbar buttons
    // below so the icon id is only surfaced in keyboard-shortcut help listings.
    tools.pin = {
      id: "pin",
      label: "Pin",
      icon: "pin",
      kbd: "p",
      onSelect: () => editor.setCurrentTool("pin"),
    }
    tools.camera = {
      id: "camera",
      label: "Camera",
      icon: "camera",
      kbd: "c",
      onSelect: () => editor.setCurrentTool("camera"),
    }
    return tools
  },
}

// Custom toolbar buttons render their glyphs as children instead of going
// through tldraw's default icon pipeline, which uses CSS `mask-image`. The
// mask strips emoji color (leaving a silhouette) and we'd rather render the
// emoji / lucide SVG directly. `TldrawUiButton` keeps the native tool-button
// styling and keyboard-focus behavior.
function PinToolbarItem() {
  const tools = useTools()
  const pin = tools.pin
  const isSelected = useIsToolSelected(pin)
  if (!pin) return null
  return (
    <TldrawUiButton
      type="tool"
      isActive={isSelected}
      aria-label={pin.label}
      title={pin.label}
      onClick={() => pin.onSelect("toolbar")}
    >
      <span
        aria-hidden="true"
        style={{ fontSize: 16, lineHeight: 1, display: "inline-block" }}
      >
        📍
      </span>
    </TldrawUiButton>
  )
}

function CameraToolbarItem() {
  const tools = useTools()
  const camera = tools.camera
  const isSelected = useIsToolSelected(camera)
  if (!camera) return null
  return (
    <TldrawUiButton
      type="tool"
      isActive={isSelected}
      aria-label={camera.label}
      title={camera.label}
      onClick={() => camera.onSelect("toolbar")}
    >
      <Camera size={16} aria-hidden="true" />
    </TldrawUiButton>
  )
}

const components: TLComponents = {
  InFrontOfTheCanvas: CropOverlay,
  SharePanel: ExportPdfButton,
  // Explicit order puts camera + pin + rectangle early so they always fit
  // the visible row; the remaining default tools trail behind and drop into
  // the overflow chevron on narrow viewports, matching the reference mocks.
  Toolbar() {
    return (
      <DefaultToolbar>
        <CameraToolbarItem />
        <PinToolbarItem />
        <SelectToolbarItem />
        <HandToolbarItem />
        <DrawToolbarItem />
        <EraserToolbarItem />
        <ArrowToolbarItem />
        <TextToolbarItem />
        <RectangleToolbarItem />
        <NoteToolbarItem />
        <AssetToolbarItem />
        <EllipseToolbarItem />
        <TriangleToolbarItem />
        <DiamondToolbarItem />
        <HexagonToolbarItem />
        <OvalToolbarItem />
        <RhombusToolbarItem />
        <TrapezoidToolbarItem />
        <StarToolbarItem />
        <CloudToolbarItem />
        <HeartToolbarItem />
        <XBoxToolbarItem />
        <CheckBoxToolbarItem />
        <ArrowLeftToolbarItem />
        <ArrowUpToolbarItem />
        <ArrowDownToolbarItem />
        <ArrowRightToolbarItem />
        <LineToolbarItem />
        <HighlightToolbarItem />
        <LaserToolbarItem />
        <FrameToolbarItem />
      </DefaultToolbar>
    )
  },
}

function Bridges() {
  const editor = useEditor()
  usePinAttachment(editor)
  usePdfProtection(editor)
  return null
}

export default function Canvas({ children }: { children?: React.ReactNode }) {
  const [editor, setEditor] = useState<Editor | null>(null)

  function handleMount(e: Editor) {
    setEditor(e)
    // Test hook — lets E2E specs call editor APIs via window.__editor
    // @ts-expect-error test-only
    window.__editor = e
  }

  return (
    <EditorContext.Provider value={editor}>
      <div className="fixed inset-0">
        <Tldraw
          onMount={handleMount}
          shapeUtils={customShapeUtils}
          tools={customTools}
          overrides={uiOverrides}
          components={components}
        />
      </div>
      <Bridges />
      {children}
    </EditorContext.Provider>
  )
}
