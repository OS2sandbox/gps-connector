import { Button } from "@/components/ui/button"
import type { Vehicle } from "@/lib/vehicle"

type Props = {
  vehicle: Vehicle | undefined
  onAttach: () => void
}

export function VehicleCell({ vehicle, onAttach }: Props) {
  if (!vehicle) {
    return (
      <Button variant="outline" size="sm" onClick={onAttach}>
        Attach vehicle
      </Button>
    )
  }
  const { plate, make, model } = vehicle
  const makeModel = `${make} ${model}`.trim()
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="font-mono font-medium tracking-wide">{plate}</span>
      {makeModel && <span className="text-muted-foreground">{makeModel}</span>}
    </div>
  )
}
