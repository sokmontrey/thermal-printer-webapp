import { useState } from "react"
import { Flame, MoveVertical } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { PrinterClient } from "@/lib/protocol"

interface Props {
  disabled: boolean
  run: (label: string, fn: (c: PrinterClient) => Promise<void>) => Promise<void>
}

const PRESETS = [
  ["Light", 140],
  ["Normal", 200],
  ["Dark", 235],
  ["Max", 255],
] as const

export function HardwarePanel({ disabled, run }: Props) {
  const [density, setDensity] = useState("200")
  const [dots, setDots] = useState("120")

  const setD = (value: number) =>
    run(`set density ${value}`, async (c) => {
      await c.setDensity(value)
      setDensity(String(value))
    })

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flame className="size-4" />
            Density
          </CardTitle>
          <CardDescription>
            Heating time 0-255. Higher prints darker but can smear or overheat
            the head on dense images.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="density">Heating time</Label>
              <Input
                id="density"
                type="number"
                min={0}
                max={255}
                value={density}
                onChange={(e) => setDensity(e.target.value)}
                className="w-28"
              />
            </div>
            <Button disabled={disabled} onClick={() => void setD(Number(density))}>
              Set
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(([label, value]) => (
              <Button
                key={label}
                size="sm"
                variant="secondary"
                disabled={disabled}
                onClick={() => void setD(value)}
              >
                {label} ({value})
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MoveVertical className="size-4" />
            Feed
          </CardTitle>
          <CardDescription>1 dot = 0.125 mm, so 120 dots is about 15 mm.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="dots">Dots</Label>
              <Input
                id="dots"
                type="number"
                min={0}
                value={dots}
                onChange={(e) => setDots(e.target.value)}
                className="w-28"
              />
            </div>
            <Button
              disabled={disabled}
              onClick={() => void run(`feed ${dots} dots`, (c) => c.feedDots(Number(dots)))}
            >
              Feed dots
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={disabled}
              onClick={() => void run("feed 1 line", (c) => c.feedLines(1))}
            >
              Feed 1 line
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={disabled}
              onClick={() => void run("feed 5 lines", (c) => c.feedLines(5))}
            >
              Feed 5 lines
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
