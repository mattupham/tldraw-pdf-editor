"use client"

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

// React Context is used so any descendant can call useEditor() without prop
// drilling. The value is null until tldraw fires onMount.
const EditorContext = createContext<Editor | null>(null)

export function useEditor(): Editor | null {
  return useContext(EditorContext)
}

const customShapeUtils = [PinShapeUtil]
const customTools = [PinTool]

const PIN_ICON_ID = "pin-tool-icon"

// Inline SVG of the lucide MapPin, registered under an asset id so the tool
// item's `icon: "pin-tool-icon"` resolves through tldraw's icon pipeline.
// Rendering the icon via `assetUrls.icons` gets us the correct sizing /
// coloring that tldraw applies to every other toolbar item.
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

  return (
    <EditorContext.Provider value={editor}>
      <div className="fixed inset-0">
        <Tldraw
          onMount={setEditor}
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
