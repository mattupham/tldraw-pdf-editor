"use client"

import { Camera } from "lucide-react"
import { createContext, useContext, useState } from "react"
import {
  DefaultToolbar,
  DefaultToolbarContent,
  type Editor,
  type TLComponents,
  type TLUiOverrides,
  Tldraw,
  TldrawUiButton,
  useIsToolSelected,
  useTools,
} from "tldraw"
import { CameraTool } from "@/tools/camera/camera-tool"
import { CropOverlay } from "@/tools/camera/crop-overlay"
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
  Toolbar() {
    return (
      <DefaultToolbar>
        <CameraToolbarItem />
        <PinToolbarItem />
        <DefaultToolbarContent />
      </DefaultToolbar>
    )
  },
}

function AttachmentBridge() {
  const editor = useEditor()
  usePinAttachment(editor)
  return null
}

export default function Canvas({ children }: { children?: React.ReactNode }) {
  const [editor, setEditor] = useState<Editor | null>(null)

  function handleMount(e: Editor) {
    setEditor(e)
    // Test hook — lets E2E specs drive tldraw via window.__editor. Gated so
    // it never leaks into a real production bundle where a browser extension
    // could use it. NEXT_PUBLIC_E2E=1 opts CI's prod build back in. The
    // Window augmentation lives in src/types/window.d.ts.
    if (
      process.env.NODE_ENV !== "production" ||
      process.env.NEXT_PUBLIC_E2E === "1"
    ) {
      window.__editor = e
    }
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
      <AttachmentBridge />
      {children}
    </EditorContext.Provider>
  )
}
