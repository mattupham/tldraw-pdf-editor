"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

// Sun↔Moon toggle wired to next-themes. `resolvedTheme` is "light" | "dark"
// after hydration (it resolves "system" to the matched preference); before
// hydration it can be undefined, so we render nothing server-side to keep
// SSR and client markup in lockstep.
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label="Toggle theme"
        disabled
        suppressHydrationWarning
      />
    )
  }

  const isDark = resolvedTheme === "dark"
  const next = isDark ? "light" : "dark"
  const Icon = isDark ? Sun : Moon

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      onClick={() => setTheme(next)}
    >
      <Icon aria-hidden="true" />
    </Button>
  )
}
