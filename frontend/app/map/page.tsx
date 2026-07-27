import { Container } from "@/components/container"
import { MapView } from "@/components/map-view"

export default function MapPage() {
  return (
    <Container className="py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Map</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Live locations and daily route history for all tracked vehicles.
      </p>
      <div className="mt-6 h-[calc(100dvh-16rem)] min-h-[400px] overflow-hidden rounded-lg border">
        <MapView />
      </div>
    </Container>
  )
}
