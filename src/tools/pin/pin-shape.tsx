"use client"

// A 24×32 pushpin drawn so the needle tip sits at x=12, y=32 — the bottom
// center of the viewBox. The shape util anchors (x, y) to the top-left of the
// bounding box, so we offset shape creation by (-12, -32) to land the tip on
// the clicked point.
export function PinShape() {
  return (
    <svg
      width={24}
      height={32}
      viewBox="0 0 24 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <title>Pin</title>
      <path
        d="M12 2 C7 2 4 5 4 9 C4 13 8 14 9 18 L15 18 C16 14 20 13 20 9 C20 5 17 2 12 2 Z"
        fill="#ef4444"
        stroke="#991b1b"
        strokeWidth={1.25}
      />
      <rect x={9} y={17} width={6} height={4} rx={1} fill="#7f1d1d" />
      <path d="M12 21 L12 32" stroke="#1f2937" strokeWidth={1.5} />
    </svg>
  )
}
