"use client"

import { Button } from "@/components/ui/button"
import { Camera } from "lucide-react"
import { useEditor } from "./editor"

export function CameraButton() {
  const editor = useEditor()
  if (!editor) return null

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => editor.setCurrentTool("camera")}
      aria-label="Camera tool: drag to crop and export"
    >
      <Camera className="h-4 w-4" />
    </Button>
  )
}
