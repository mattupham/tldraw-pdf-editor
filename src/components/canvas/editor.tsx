"use client"

import { CameraTool } from "@/tools/camera/camera-tool"
import { CropOverlay } from "@/tools/camera/crop-overlay"
import { PinShapeUtil } from "@/tools/pin/pin-shape-util"
import { PinTool } from "@/tools/pin/pin-tool"
import { usePinAttachment } from "@/tools/pin/use-pin-attachment"
import { createContext, useContext, useState } from "react"
import {
  DefaultToolbar,
  DefaultToolbarContent,
  type Editor,
  type TLComponents,
  type TLUiAssetUrlOverrides,
  type TLUiOverrides,
  Tldraw,
  TldrawUiMenuItem,
  useIsToolSelected,
  useTools,
} from "tldraw"

const EditorContext = createContext<Editor | null>(null)

export function useEditor(): Editor | null {
  return useContext(EditorContext)
}

const customShapeUtils = [PinShapeUtil]
const customTools = [PinTool, CameraTool]

const PIN_ICON_ID = "pin-tool-icon"

// Inline SVG of the lucide `MapPin` icon (lucide-react v1.8.0, see
// node_modules/lucide-react/dist/esm/icons/map-pin.js), served as a data URL
// through tldraw's `assetUrls.icons` pipeline. tldraw renders toolbar icons as
// CSS masks, so the icon must come in as a single URL — rendering `<MapPin />`
// as JSX would bypass that and lose the active-tool highlight styling. When
// lucide publishes an updated MapPin, refresh the path data below.
const assetUrls: TLUiAssetUrlOverrides = {
  icons: {
    [PIN_ICON_ID]: `data:image/svg+xml;utf8,${encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>'
    )}`,
  },
}

const uiOverrides: TLUiOverrides = {
  tools(editor, tools) {
    tools.pin = {
      id: "pin",
      label: "Pin",
      icon: PIN_ICON_ID,
      kbd: "p",
      onSelect: () => editor.setCurrentTool("pin"),
    }
    return tools
  },
}

function PinToolbarItem() {
  const tools = useTools()
  const pin = tools.pin
  const isSelected = useIsToolSelected(pin)
  if (!pin) return null
  return <TldrawUiMenuItem {...pin} isSelected={isSelected} />
}

const components: TLComponents = {
  InFrontOfTheCanvas: CropOverlay,
  Toolbar() {
    return (
      <DefaultToolbar>
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

export default function Canvas({
  children,
}: {
  children?: React.ReactNode
}) {
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
          assetUrls={assetUrls}
        />
      </div>
      <AttachmentBridge />
      {children}
    </EditorContext.Provider>
  )
}
