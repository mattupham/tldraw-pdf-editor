"use client"

import { Camera } from "lucide-react"
import { useTheme } from "next-themes"
import { createContext, useContext, useEffect, useState } from "react"
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
import { ThemeToggle } from "@/components/theme-toggle"
import {
  blobAssetStore,
  disposeBlobAssets,
} from "@/lib/tldraw/blob-asset-store"
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

// Render the ThemeToggle + Export PDF button together in tldraw's top-right
// SharePanel slot. `pointer-events-auto` is required: tldraw's SharePanel
// wrapper inherits the canvas's `pointer-events: none` so the canvas below
// stays interactive — individual controls have to opt back in, otherwise
// the tl-background div underneath intercepts clicks.
function SharePanelContent() {
  return (
    <div className="pointer-events-auto flex items-center gap-2 p-2">
      <ThemeToggle />
      <ExportPdfButton />
    </div>
  )
}

const components: TLComponents = {
  InFrontOfTheCanvas: CropOverlay,
  SharePanel: SharePanelContent,
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

// Mirrors next-themes' resolved theme into tldraw's own colorScheme user
// preference so the canvas chrome (toolbar, panels) stays in lockstep with
// the rest of the app. next-themes already drives the `.dark` class on
// <html>; tldraw's panels don't read that — they read editor.user prefs.
function ColorSchemeBridge() {
  const editor = useEditor()
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    if (!editor) return
    if (resolvedTheme !== "light" && resolvedTheme !== "dark") return
    editor.user.updateUserPreferences({ colorScheme: resolvedTheme })
  }, [editor, resolvedTheme])

  return null
}

export default function Canvas({ children }: { children?: React.ReactNode }) {
  const [editor, setEditor] = useState<Editor | null>(null)

  function handleMount(e: Editor) {
    setEditor(e)
    // Test hook — lets E2E specs drive tldraw via window.__editor. Gated so
    // it never leaks into a real production bundle where a browser extension
    // could use it. NEXT_PUBLIC_E2E=1 opts CI's prod build back in.
    if (
      process.env.NODE_ENV !== "production" ||
      process.env.NEXT_PUBLIC_E2E === "1"
    ) {
      window.__editor = e
    }
  }

  // Hard reset the module-level blob cache when Canvas unmounts. tldraw's
  // internal GC fires remove() for orphaned asset records on its own
  // timeline, but we own the singleton map — clearing here on teardown
  // prevents blob URLs surviving across a full canvas remount.
  useEffect(() => {
    return () => {
      disposeBlobAssets()
    }
  }, [])

  return (
    <EditorContext.Provider value={editor}>
      <div className="fixed inset-0">
        <Tldraw
          onMount={handleMount}
          shapeUtils={customShapeUtils}
          tools={customTools}
          overrides={uiOverrides}
          components={components}
          assets={blobAssetStore}
        />
      </div>
      <Bridges />
      <ColorSchemeBridge />
      {children}
    </EditorContext.Provider>
  )
}
