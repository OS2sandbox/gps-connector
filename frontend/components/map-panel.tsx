"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Car, ChevronLeft, MapPinOff, Route, Search, X } from "lucide-react"
import { differenceInSeconds, format, parseISO } from "date-fns"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemSeparator,
} from "@/components/ui/item"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { fetchAddress } from "@/lib/reverse-geocode"
import {
  type PendingDevice,
  type VehicleLocation,
} from "@/lib/vehicle-locations"
import { type VehicleRoute } from "@/lib/vehicle-routes"
import { statusColor } from "@/lib/vehicle-status"

export type RouteStatus =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "empty" }
  | { phase: "error" }
  | { phase: "loaded"; route: VehicleRoute }

type StatusFilter = "all" | "driving" | "stationary"

type MapPanelProps = {
  vehicles: VehicleLocation[]
  pendingDevices: PendingDevice[]
  activeVehicleId: string | null
  isCurrentDay: boolean
  listLoading: boolean
  listError: boolean
  routeStatus: RouteStatus
  selectedTrip: number | null
  onSelect: (vehicle: VehicleLocation) => void
  onClear: () => void
  onFitRoute: () => void
  onTripChange: (index: number | null) => void
}

type Searchable = Pick<
  VehicleLocation,
  "plate" | "make" | "model" | "fleetId" | "imei"
>

function matchesQuery(item: Searchable, query: string): boolean {
  return (
    item.plate.toLowerCase().includes(query) ||
    item.make.toLowerCase().includes(query) ||
    item.model.toLowerCase().includes(query) ||
    item.fleetId.toLowerCase().includes(query) ||
    item.imei.includes(query)
  )
}

function compareVehicles(a: VehicleLocation, b: VehicleLocation): number {
  if (a.status !== b.status) return a.status === "driving" ? -1 : 1
  return (a.plate || a.imei).localeCompare(b.plate || b.imei)
}

function listEmptyMessage(
  hasQuery: boolean,
  statusFilter: StatusFilter,
  hasVehicles: boolean,
  isCurrentDay: boolean
): string {
  if (hasQuery) return "No vehicles found"
  if (hasVehicles && statusFilter === "driving") return "No driving vehicles"
  if (hasVehicles && statusFilter === "stationary") {
    return "No stationary vehicles"
  }
  return isCurrentDay
    ? "No devices reporting yet."
    : "No vehicles reported on this day."
}

export function MapPanel({
  vehicles,
  pendingDevices,
  activeVehicleId,
  isCurrentDay,
  listLoading,
  listError,
  routeStatus,
  selectedTrip,
  onSelect,
  onClear,
  onFitRoute,
  onTripChange,
}: MapPanelProps) {
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [, setTick] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setTick((tick) => tick + 1), 30_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (activeVehicleId !== null) setQuery("")
  }, [activeVehicleId])

  const trimmedQuery = query.trim().toLowerCase()
  const hasQuery = trimmedQuery.length > 0

  const activeVehicle =
    vehicles.find((vehicle) => vehicle.id === activeVehicleId) ?? null
  const showDetails = !hasQuery && activeVehicle !== null

  const matchedVehicles = useMemo(() => {
    const matched = hasQuery
      ? vehicles.filter((vehicle) => matchesQuery(vehicle, trimmedQuery))
      : vehicles
    return [...matched].sort(compareVehicles)
  }, [vehicles, hasQuery, trimmedQuery])

  const matchedPending = useMemo(() => {
    if (!hasQuery) return pendingDevices
    return pendingDevices.filter((device) => matchesQuery(device, trimmedQuery))
  }, [pendingDevices, hasQuery, trimmedQuery])

  const visibleVehicles =
    statusFilter === "all"
      ? matchedVehicles
      : matchedVehicles.filter((vehicle) => vehicle.status === statusFilter)
  const visiblePending = statusFilter === "all" ? matchedPending : []

  const handleSelect = (vehicle: VehicleLocation) => {
    setQuery("")
    onSelect(vehicle)
  }

  return (
    <Card size="sm" className="pointer-events-auto max-h-full w-80 shadow-md">
      <div className="flex flex-col gap-3 px-4">
        <InputGroup>
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search vehicles"
          />
          {hasQuery && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                onClick={() => setQuery("")}
                aria-label="Clear search"
              >
                <X />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
        {!showDetails && (
          <Tabs
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as StatusFilter)}
          >
            <TabsList className="w-full">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="driving">Driving</TabsTrigger>
              <TabsTrigger value="stationary">Stationary</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>
      {showDetails && activeVehicle ? (
        <VehicleDetails
          vehicle={activeVehicle}
          isCurrentDay={isCurrentDay}
          routeStatus={routeStatus}
          selectedTrip={selectedTrip}
          onBack={onClear}
          onFitRoute={onFitRoute}
          onTripChange={onTripChange}
        />
      ) : (
        <div className="min-h-0 overflow-y-auto px-2">
          {listLoading ? (
            <div className="flex justify-center py-8">
              <Spinner className="size-5 text-muted-foreground" />
            </div>
          ) : listError ? (
            <div className="py-6 text-center text-sm text-destructive">
              Could not load positions for this day.
            </div>
          ) : visibleVehicles.length === 0 && visiblePending.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {listEmptyMessage(
                hasQuery,
                statusFilter,
                vehicles.length > 0,
                isCurrentDay
              )}
            </div>
          ) : (
            <>
              {visibleVehicles.map((vehicle) => (
                <VehicleRow
                  key={vehicle.id}
                  vehicle={vehicle}
                  isActive={vehicle.id === activeVehicleId}
                  isCurrentDay={isCurrentDay}
                  onSelect={() => handleSelect(vehicle)}
                />
              ))}
              {visiblePending.length > 0 && (
                <>
                  <div className="px-2.5 pt-3 pb-1 text-xs font-medium text-muted-foreground">
                    No location yet
                  </div>
                  {visiblePending.map((device) => (
                    <PendingRow key={device.id} device={device} />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  )
}

type DetailRow = { label: string; value: string; mono?: boolean }

function buildExtraRows(vehicle: VehicleLocation): DetailRow[] {
  const [longitude, latitude] = vehicle.coordinates
  const rows: (DetailRow | null)[] = [
    {
      label: "Coordinates",
      value: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
      mono: true,
    },
    vehicle.ignition !== undefined
      ? { label: "Ignition", value: vehicle.ignition ? "On" : "Off" }
      : null,
    vehicle.vehicleType ? { label: "Type", value: vehicle.vehicleType } : null,
    vehicle.associatedLocation
      ? { label: "Location", value: vehicle.associatedLocation }
      : null,
    vehicle.fleetId ? { label: "Fleet ID", value: vehicle.fleetId } : null,
    vehicle.imei ? { label: "IMEI", value: vehicle.imei, mono: true } : null,
    vehicle.fuelType ? { label: "Fuel", value: vehicle.fuelType } : null,
    vehicle.capacity !== undefined
      ? { label: "Capacity", value: String(vehicle.capacity) }
      : null,
    vehicle.leasingEndDate
      ? {
          label: "Leasing ends",
          value: format(parseISO(vehicle.leasingEndDate.slice(0, 10)), "PP"),
        }
      : null,
  ]
  return rows.filter((row): row is DetailRow => row !== null)
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}

function VehicleDetails({
  vehicle,
  isCurrentDay,
  routeStatus,
  selectedTrip,
  onBack,
  onFitRoute,
  onTripChange,
}: {
  vehicle: VehicleLocation
  isCurrentDay: boolean
  routeStatus: RouteStatus
  selectedTrip: number | null
  onBack: () => void
  onFitRoute: () => void
  onTripChange: (index: number | null) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [address, setAddress] = useState<string | null>(null)
  const [longitude, latitude] = vehicle.coordinates
  const coordKey = `${longitude},${latitude}`
  const coordsText = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
  const extraRows = buildExtraRows(vehicle)
  const makeModel = `${vehicle.make} ${vehicle.model}`.trim()

  let addressValue: ReactNode = coordsText
  if (address) {
    const [street, cityLine] = addressLines(address)
    addressValue = cityLine ? (
      <>
        {street}
        <br />
        {cityLine}
      </>
    ) : (
      street
    )
  }

  useEffect(() => {
    setAddress(null)
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token) return
    const controller = new AbortController()
    fetchAddress([longitude, latitude], token, controller.signal)
      .then((found) => {
        if (!controller.signal.aborted) setAddress(found)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [coordKey])

  return (
    <>
      <div className="flex px-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft data-icon="inline-start" />
          All vehicles
        </Button>
      </div>
      <CardContent className="min-h-0 overflow-y-auto">
        <ItemGroup className="gap-0">
          <DetailItem
            label="Plate"
            value={vehicle.plate || vehicle.imei}
            mono
          />
          {makeModel ? <DetailItem label="Vehicle" value={makeModel} /> : null}
          <DetailItem
            label="Status"
            value={
              <Badge
                variant={vehicle.status === "driving" ? "info" : "secondary"}
              >
                {vehicle.status === "driving" ? "Driving" : "Stationary"}
              </Badge>
            }
          />
          <DetailItem label="Address" value={addressValue} />
          <DetailItem
            label="Last update"
            value={
              vehicle.lastUpdate
                ? lastUpdateText(vehicle.lastUpdate, isCurrentDay)
                : "Unknown"
            }
          />
          {expanded &&
            extraRows.map((row) => (
              <DetailItem
                key={row.label}
                label={row.label}
                value={row.value}
                mono={row.mono}
              />
            ))}
        </ItemGroup>
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={() => setExpanded((prev) => !prev)}
          className="mt-2 px-0"
        >
          {expanded ? "Show less" : "Show more"}
        </Button>
        <ItemSeparator />
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Route</span>
          {routeStatus.phase === "loading" ? (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="size-3.5" />
              Loading route
            </span>
          ) : routeStatus.phase === "empty" ? (
            <span className="text-sm text-muted-foreground">
              {isCurrentDay
                ? "No trips recorded today."
                : "No trips recorded on this day."}
            </span>
          ) : routeStatus.phase === "error" ? (
            <span className="text-sm text-destructive">
              Could not load route history.
            </span>
          ) : routeStatus.phase === "loaded" ? (
            <RouteSection
              route={routeStatus.route}
              selectedTrip={selectedTrip}
              onTripChange={onTripChange}
            />
          ) : null}
        </div>
      </CardContent>
      {routeStatus.phase === "loaded" && (
        <CardFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onFitRoute}
          >
            <Route data-icon="inline-start" />
            Fit route
          </Button>
        </CardFooter>
      )}
    </>
  )
}

function RouteSection({
  route,
  selectedTrip,
  onTripChange,
}: {
  route: VehicleRoute
  selectedTrip: number | null
  onTripChange: (index: number | null) => void
}) {
  const trip =
    selectedTrip !== null ? (route.trips[selectedTrip] ?? null) : null
  const distanceMeters = trip
    ? trip.distanceMeters
    : route.summary.distanceMeters
  const firstMovement = trip ? trip.firstMovement : route.summary.firstMovement
  const lastMovement = trip ? trip.lastMovement : route.summary.lastMovement

  return (
    <ItemGroup className="gap-0">
      {route.trips.length > 1 && (
        <Item size="xs" className="flex-nowrap px-0 py-0 leading-tight">
          <ItemContent>
            <span className="text-muted-foreground">Trip</span>
          </ItemContent>
          <ItemActions>
            <Select
              value={selectedTrip === null ? "all" : String(selectedTrip)}
              onValueChange={(value) =>
                onTripChange(value === "all" ? null : Number(value))
              }
            >
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">
                    All trips ({route.trips.length})
                  </SelectItem>
                  {route.trips.map((_, index) => (
                    <SelectItem key={index} value={String(index)}>
                      Trip {index + 1}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </ItemActions>
        </Item>
      )}
      <DetailItem label="Distance" value={formatDistance(distanceMeters)} />
      <DetailItem
        label="Active"
        value={`${format(new Date(firstMovement), "HH:mm")} to ${format(new Date(lastMovement), "HH:mm")}`}
      />
    </ItemGroup>
  )
}

function addressLines(address: string): [string, string | null] {
  const index = address.indexOf(", ")
  if (index === -1) return [address, null]
  return [address.slice(0, index + 1), address.slice(index + 2)]
}

function DetailItem({
  label,
  value,
  mono,
}: {
  label: string
  value: ReactNode
  mono?: boolean
}) {
  return (
    <Item size="xs" className="flex-nowrap items-start px-0 py-0 leading-tight">
      <ItemContent>
        <span className="text-muted-foreground">{label}</span>
      </ItemContent>
      <ItemActions>
        <span className={cn("text-right font-medium", mono && "font-mono")}>
          {value}
        </span>
      </ItemActions>
    </Item>
  )
}

function VehicleRow({
  vehicle,
  isActive,
  isCurrentDay,
  onSelect,
}: {
  vehicle: VehicleLocation
  isActive: boolean
  isCurrentDay: boolean
  onSelect: () => void
}) {
  return (
    <Item asChild size="xs" className="flex-nowrap">
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "w-full cursor-pointer text-left",
          isActive ? "bg-accent" : "hover:bg-muted"
        )}
      >
        <div
          style={{ backgroundColor: statusColor(vehicle.status) }}
          className="flex size-6 shrink-0 items-center justify-center rounded-full text-white"
        >
          <Car className="size-3" />
        </div>
        <div className="min-w-0 flex-1 truncate text-sm">
          <span className="font-medium">{vehicle.plate || vehicle.imei}</span>
          {(vehicle.make || vehicle.model) && (
            <span className="ml-2 font-normal text-muted-foreground">
              {vehicle.make} {vehicle.model}
            </span>
          )}
        </div>
        {vehicle.lastUpdate && (
          <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
            {lastUpdateText(vehicle.lastUpdate, isCurrentDay)}
          </span>
        )}
      </button>
    </Item>
  )
}

function PendingRow({ device }: { device: PendingDevice }) {
  return (
    <Item size="xs" className="cursor-default flex-nowrap opacity-70">
      <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <MapPinOff className="size-3" />
      </div>
      <div className="min-w-0 flex-1 truncate text-sm">
        <span className="font-medium">{device.plate || device.imei}</span>
        {(device.make || device.model) && (
          <span className="ml-2 font-normal text-muted-foreground">
            {device.make} {device.model}
          </span>
        )}
      </div>
      <Badge variant="secondary">No location</Badge>
    </Item>
  )
}

function lastUpdateText(iso: string, isCurrentDay: boolean): string {
  const date = new Date(iso)
  return isCurrentDay ? shortRelativeTime(date) : format(date, "HH:mm")
}

function shortRelativeTime(date: Date): string {
  const seconds = Math.max(0, differenceInSeconds(new Date(), date))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}
