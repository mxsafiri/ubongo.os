import React from "react"
import { cn } from "@/lib/utils"

interface OrbProps {
  dimension?: string
  className?: string
  tones?: {
    base?: string
    accent1?: string
    accent2?: string
    accent3?: string
  }
  spinDuration?: number
}

const ColorOrb: React.FC<OrbProps> = ({
  dimension = "192px",
  className,
  tones,
  spinDuration = 20,
}) => {
  const fallbackTones = {
    base: "oklch(15% 0.02 264.695)",
    accent1: "oklch(65% 0.18 280)",
    accent2: "oklch(70% 0.15 230)",
    accent3: "oklch(60% 0.2 310)",
  }
  const palette = { ...fallbackTones, ...tones }
  const dimValue = parseInt(dimension.replace("px", ""), 10)
  const blurStrength =
    dimValue < 50 ? Math.max(dimValue * 0.008, 1) : Math.max(dimValue * 0.015, 4)
  const contrastStrength =
    dimValue < 50 ? Math.max(dimValue * 0.004, 1.2) : Math.max(dimValue * 0.008, 1.5)
  const pixelDot = dimValue < 50 ? Math.max(dimValue * 0.004, 0.05) : Math.max(dimValue * 0.008, 0.1)
  const shadowRange = dimValue < 50 ? Math.max(dimValue * 0.004, 0.5) : Math.max(dimValue * 0.008, 2)
  const maskRadius =
    dimValue < 30 ? "0%" : dimValue < 50 ? "5%" : dimValue < 100 ? "15%" : "25%"
  const adjustedContrast =
    dimValue < 30 ? 1.1 : dimValue < 50 ? Math.max(contrastStrength * 1.2, 1.3) : contrastStrength

  return (
    <div
      className={cn("color-orb pointer-events-none", className)}
      style={{
        width: dimension,
        height: dimension,
        "--base": palette.base,
        "--accent1": palette.accent1,
        "--accent2": palette.accent2,
        "--accent3": palette.accent3,
        "--spin-duration": `${spinDuration}s`,
        "--blur": `${blurStrength}px`,
        "--contrast": adjustedContrast,
        "--dot": `${pixelDot}px`,
        "--shadow": `${shadowRange}px`,
        "--mask": maskRadius,
      } as React.CSSProperties}
    />
  )
}

export { ColorOrb }
export type { OrbProps }
