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
  const makeModel = `${vehicle.make} ${vehicle.model}`.trim()
  if (!makeModel) {
    return <span className="text-muted-foreground">-</span>
  }
  return <span className="text-sm">{makeModel}</span>
}
