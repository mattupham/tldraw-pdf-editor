"use client"

import { createContext, useContext, useState } from "react"
import { type Editor, Tldraw } from "tldraw"

// React Context is used so any descendant can call useEditor() without prop
// drilling. The value is null until tldraw fires onMount.
const EditorContext = createContext<Editor | null>(null)

export function useEditor(): Editor | null {
  return useContext(EditorContext)
}

export default function Canvas() {
  const [editor, setEditor] = useState<Editor | null>(null)

  return (
    <EditorContext.Provider value={editor}>
      <div className="fixed inset-0">
        <Tldraw onMount={setEditor} />
      </div>
    </EditorContext.Provider>
  )
}
