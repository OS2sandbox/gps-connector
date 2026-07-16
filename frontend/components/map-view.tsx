"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import mapboxgl from "mapbox-gl"
import { endOfDay, isSameDay, isToday } from "date-fns"
import { AlertCircle, MapPinOff } from "lucide-react"

import { Alert, AlertTitle } from "@/components/ui/alert"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import { MapDayPicker, defaultDay } from "@/components/map-day-picker"
import {
  addLiveVehicleLayers,
  clearLiveMarkers,
  EMPTY_FEATURES,
  LIVE_SOURCE_ID,
  pruneLiveMarkers,
  reconcileLiveMarkers,
  vehiclesToFeatures,
  type LiveMarkerEntry,
} from "@/components/map-markers"
import { MapPanel, type RouteStatus } from "@/components/map-panel"
import { useDevices } from "@/hooks/use-devices"
import {
  fetchDayVehicleLocations,
  type VehicleLocation,
} from "@/lib/vehicle-locations"
import { fetchVehicleRoute } from "@/lib/vehicle-routes"

import "mapbox-gl/dist/mapbox-gl.css"

const STANDARD_STYLE = "mapbox://styles/mapbox/standard"

const DENMARK_CENTER: [number, number] = [10.5, 56.0]
const OVERVIEW_ZOOM = 6.2
const DENMARK_BOUNDS: [[number, number], [number, number]] = [
  [3.0, 53.5],
  [18.0, 58.5],
]

const FOCUS_ZOOM = 14
const FOCUS_PITCH = 45
const FLY_DURATION_MS = 1500

const ROUTE_SOURCE_ID = "vehicle-routes"
const ROUTE_START_COLOR = "#22c55e"
const ROUTE_END_COLOR = "#ef4444"
const ROUTE_COLOR = "#3b82f6"
const ROUTE_CASING_COLOR = "#1d4ed8"

const BASEMAP_CONFIG = {
  theme: "faded",
  show3dObjects: true,
  showPlaceLabels: true,
  showRoadLabels: true,
  showPointOfInterestLabels: false,
  showTransitLabels: false,
  showPedestrianRoads: true,
  showAdminBoundaries: true,
  showLandmarkIcons: false,
} as const

const LIGHT_BASEMAP_COLORS = {
  colorLand: "#eeeeef",
  colorWater: "#c4dce5",
  colorGreenspace: "#cce5be",
  colorRoads: "#ffffff",
  colorMotorways: "#ffe6bf",
  colorTrunks: "#fff0d2",
  colorCommercial: "#e7e7e8",
  colorIndustrial: "#e3e3e4",
  colorEducation: "#e5e5e6",
  colorMedical: "#e8e8e9",
} as const

const ROUTE_LAYERS: mapboxgl.LayerSpecification[] = [
  {
    id: "vehicle-routes-casing",
    type: "line",
    source: ROUTE_SOURCE_ID,
    filter: ["==", ["get", "kind"], "route"],
    slot: "top",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ROUTE_CASING_COLOR,
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 4, 14, 8, 18, 12],
      "line-emissive-strength": 1,
    },
  },
  {
    id: "vehicle-routes-line",
    type: "line",
    source: ROUTE_SOURCE_ID,
    filter: ["==", ["get", "kind"], "route"],
    slot: "top",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": ROUTE_COLOR,
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 14, 5, 18, 8],
      "line-emissive-strength": 1,
    },
  },
  {
    id: "vehicle-routes-start-halo",
    type: "circle",
    source: ROUTE_SOURCE_ID,
    filter: ["==", ["get", "kind"], "start"],
    slot: "top",
    paint: {
      "circle-radius": 18,
      "circle-color": ROUTE_START_COLOR,
      "circle-opacity": 0.18,
      "circle-emissive-strength": 1,
    },
  },
  {
    id: "vehicle-routes-start-ring",
    type: "circle",
    source: ROUTE_SOURCE_ID,
    filter: ["==", ["get", "kind"], "start"],
    slot: "top",
    paint: {
      "circle-radius": 10,
      "circle-color": "#ffffff",
      "circle-stroke-width": 2,
      "circle-stroke-color": ROUTE_START_COLOR,
      "circle-emissive-strength": 1,
    },
  },
  {
    id: "vehicle-routes-start-dot",
    type: "circle",
    source: ROUTE_SOURCE_ID,
    filter: ["==", ["get", "kind"], "start"],
    slot: "top",
    paint: {
      "circle-radius": 5,
      "circle-color": ROUTE_START_COLOR,
      "circle-emissive-strength": 1,
    },
  },
  {
    id: "vehicle-routes-end-halo",
    type: "circle",
    source: ROUTE_SOURCE_ID,
    filter: ["==", ["get", "kind"], "end"],
    slot: "top",
    paint: {
      "circle-radius": 18,
      "circle-color": ROUTE_END_COLOR,
      "circle-opacity": 0.18,
      "circle-emissive-strength": 1,
    },
  },
  {
    id: "vehicle-routes-end-ring",
    type: "circle",
    source: ROUTE_SOURCE_ID,
    filter: ["==", ["get", "kind"], "end"],
    slot: "top",
    paint: {
      "circle-radius": 10,
      "circle-color": "#ffffff",
      "circle-stroke-width": 2,
      "circle-stroke-color": ROUTE_END_COLOR,
      "circle-emissive-strength": 1,
    },
  },
  {
    id: "vehicle-routes-end-dot",
    type: "circle",
    source: ROUTE_SOURCE_ID,
    filter: ["==", ["get", "kind"], "end"],
    slot: "top",
    paint: {
      "circle-radius": 5,
      "circle-color": ROUTE_END_COLOR,
      "circle-emissive-strength": 1,
    },
  },
]

function addRouteLayers(map: mapboxgl.Map) {
  map.addSource(ROUTE_SOURCE_ID, {
    type: "geojson",
    data: EMPTY_FEATURES,
  })
  for (const layer of ROUTE_LAYERS) {
    map.addLayer(layer)
  }
}

function OverlayMessage({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute right-4 bottom-10 z-10 max-w-[calc(100%-2rem)]">
      <Alert variant="destructive" className="w-auto shadow-md">
        <AlertCircle />
        <AlertTitle>{children}</AlertTitle>
      </Alert>
    </div>
  )
}

function routeToFeatures(
  segments: GeoJSON.Position[][],
  start: GeoJSON.Position,
  end?: GeoJSON.Position
): GeoJSON.Feature[] {
  const features: GeoJSON.Feature[] = segments.map((coords) => ({
    type: "Feature",
    geometry: { type: "LineString", coordinates: coords },
    properties: { kind: "route" },
  }))
  features.push({
    type: "Feature",
    geometry: { type: "Point", coordinates: start },
    properties: { kind: "start" },
  })
  if (end) {
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: end },
      properties: { kind: "end" },
    })
  }
  return features
}

type DayState =
  | { phase: "current" }
  | { phase: "loading" }
  | { phase: "error" }
  | { phase: "loaded"; vehicles: VehicleLocation[] }

export function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const liveMarkersRef = useRef<Map<string, LiveMarkerEntry>>(new Map())
  const vehiclesRef = useRef<VehicleLocation[]>([])
  const displayedVehiclesRef = useRef<VehicleLocation[]>([])
  const drawnRouteKeyRef = useRef<string | null>(null)
  const drawnSegmentsRef = useRef<GeoJSON.Position[][] | null>(null)
  const [activeVehicleId, setActiveVehicleId] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<Date>(defaultDay)
  const [mapReady, setMapReady] = useState(false)
  const [routeStatus, setRouteStatus] = useState<RouteStatus>({
    phase: "idle",
  })
  const [selectedTrip, setSelectedTrip] = useState<number | null>(null)
  const [dayState, setDayState] = useState<DayState>({ phase: "current" })
  const { vehicles, pendingDevices, error, loaded } = useDevices()

  const isCurrentDay = isToday(selectedDay)

  const displayedVehicles = useMemo(() => {
    if (isCurrentDay) return vehicles
    return dayState.phase === "loaded" ? dayState.vehicles : []
  }, [isCurrentDay, vehicles, dayState])

  const imeiKey = useMemo(
    () =>
      vehicles
        .map((vehicle) => vehicle.imei)
        .sort()
        .join(","),
    [vehicles]
  )

  const activeVehicle = activeVehicleId
    ? (displayedVehicles.find((vehicle) => vehicle.id === activeVehicleId) ??
      null)
    : null

  const activeImei = activeVehicle?.imei ?? null
  const routeRefreshKey =
    activeVehicle === null
      ? null
      : activeVehicle.status === "driving"
        ? (activeVehicle.lastUpdate ?? "driving")
        : "stationary"

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

  const focusVehicle = useCallback((vehicle: VehicleLocation) => {
    setActiveVehicleId(vehicle.id)
    const map = mapRef.current
    if (!map) return
    map.flyTo({
      center: vehicle.coordinates,
      zoom: Math.max(FOCUS_ZOOM, map.getZoom()),
      pitch: FOCUS_PITCH,
      duration: FLY_DURATION_MS,
      essential: true,
    })
  }, [])

  const handleDayChange = (day: Date) => {
    if (isSameDay(day, selectedDay)) return
    setSelectedDay(day)
    setActiveVehicleId(null)
  }

  const fitToSegments = useCallback((segments: GeoJSON.Position[][]) => {
    const map = mapRef.current
    if (!map || segments.length === 0) return
    const bounds = new mapboxgl.LngLatBounds()
    for (const segment of segments) {
      for (const position of segment) {
        bounds.extend(position as [number, number])
      }
    }
    const panelPadding = map.getContainer().clientWidth > 720 ? 400 : 72
    map.fitBounds(bounds, {
      padding: { top: 72, bottom: 72, left: panelPadding, right: 72 },
      maxZoom: 16,
      pitch: 0,
      duration: 1000,
      essential: true,
    })
  }, [])

  const fitRoute = useCallback(() => {
    if (drawnSegmentsRef.current) fitToSegments(drawnSegmentsRef.current)
  }, [fitToSegments])

  const handleTripChange = (index: number | null) => {
    setSelectedTrip(index)
    if (index === null || routeStatus.phase !== "loaded") return
    const trip = routeStatus.route.trips[index]
    if (trip) fitToSegments(trip.segments)
  }

  useEffect(() => {
    if (!token || !containerRef.current) return

    mapboxgl.accessToken = token

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: STANDARD_STYLE,
      config: {
        basemap: {
          ...BASEMAP_CONFIG,
          lightPreset: "day",
          ...LIGHT_BASEMAP_COLORS,
        },
      },
      center: DENMARK_CENTER,
      zoom: OVERVIEW_ZOOM,
      maxBounds: DENMARK_BOUNDS,
    })

    map.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: true }),
      "top-right"
    )

    map.on("load", () => {
      setMapReady(true)
      addRouteLayers(map)
      addLiveVehicleLayers(map)
      map.on("render", () => {
        if (!map.isSourceLoaded(LIVE_SOURCE_ID)) return
        reconcileLiveMarkers(
          map,
          liveMarkersRef.current,
          displayedVehiclesRef,
          focusVehicle
        )
      })
    })

    mapRef.current = map

    return () => {
      clearLiveMarkers(liveMarkersRef.current)
      map.remove()
      mapRef.current = null
    }
  }, [token])

  useEffect(() => {
    vehiclesRef.current = vehicles
  }, [vehicles])

  useEffect(() => {
    displayedVehiclesRef.current = displayedVehicles
  }, [displayedVehicles])

  useEffect(() => {
    if (isCurrentDay) {
      setDayState({ phase: "current" })
      return
    }
    const controller = new AbortController()
    setDayState({ phase: "loading" })
    fetchDayVehicleLocations(
      vehiclesRef.current,
      { from: selectedDay, to: endOfDay(selectedDay) },
      controller.signal
    )
      .then((located) => {
        if (controller.signal.aborted) return
        setDayState({ phase: "loaded", vehicles: located })
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setDayState({ phase: "error" })
      })
    return () => controller.abort()
  }, [selectedDay, isCurrentDay, imeiKey])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return
    const source = map.getSource<mapboxgl.GeoJSONSource>(LIVE_SOURCE_ID)
    if (!source) return
    const visibleVehicles =
      selectedTrip !== null && activeVehicleId !== null
        ? displayedVehicles.filter((vehicle) => vehicle.id !== activeVehicleId)
        : displayedVehicles
    source.setData(vehiclesToFeatures(visibleVehicles))
    pruneLiveMarkers(liveMarkersRef.current, visibleVehicles)
  }, [displayedVehicles, mapReady, selectedTrip, activeVehicleId])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !token || !mapReady) return

    const source = map.getSource<mapboxgl.GeoJSONSource>(ROUTE_SOURCE_ID)
    if (!source) return

    if (!activeImei) {
      drawnRouteKeyRef.current = null
      drawnSegmentsRef.current = null
      source.setData(EMPTY_FEATURES)
      setSelectedTrip(null)
      setRouteStatus({ phase: "idle" })
      return
    }

    const routeKey = `${activeImei}:${selectedDay.getTime()}`
    if (drawnRouteKeyRef.current !== routeKey) {
      drawnRouteKeyRef.current = null
      drawnSegmentsRef.current = null
      source.setData(EMPTY_FEATURES)
      setSelectedTrip(null)
      setRouteStatus({ phase: "loading" })
    }

    const controller = new AbortController()
    void (async () => {
      try {
        const route = await fetchVehicleRoute(
          activeImei,
          token,
          { from: selectedDay, to: endOfDay(selectedDay) },
          controller.signal
        )
        if (controller.signal.aborted) return
        drawnRouteKeyRef.current = routeKey
        if (route) {
          setSelectedTrip((prev) =>
            prev !== null && prev >= route.trips.length ? null : prev
          )
          setRouteStatus({ phase: "loaded", route })
        } else {
          source.setData(EMPTY_FEATURES)
          drawnSegmentsRef.current = null
          setRouteStatus({ phase: "empty" })
        }
      } catch {
        if (controller.signal.aborted) return
        drawnRouteKeyRef.current = null
        drawnSegmentsRef.current = null
        source.setData(EMPTY_FEATURES)
        setRouteStatus({ phase: "error" })
      }
    })()

    return () => controller.abort()
  }, [activeImei, routeRefreshKey, token, mapReady, selectedDay])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || routeStatus.phase !== "loaded") return
    const source = map.getSource<mapboxgl.GeoJSONSource>(ROUTE_SOURCE_ID)
    if (!source) return
    const selected =
      selectedTrip !== null ? routeStatus.route.trips[selectedTrip] : undefined
    const trips = selected ? [selected] : routeStatus.route.trips
    const segments = trips.flatMap((trip) => trip.segments)
    if (segments.length === 0) return
    const lastSegment = segments[segments.length - 1]
    const end = lastSegment[lastSegment.length - 1]
    source.setData({
      type: "FeatureCollection",
      features: routeToFeatures(segments, segments[0][0], end),
    })
    drawnSegmentsRef.current = segments
  }, [routeStatus, selectedTrip, mapReady])

  if (!token) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MapPinOff />
          </EmptyMedia>
          <EmptyTitle>Map unavailable</EmptyTitle>
          <EmptyDescription>The map could not be loaded.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {!mapReady && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <Spinner className="size-6 text-muted-foreground" />
        </div>
      )}
      <div className="pointer-events-none absolute inset-y-4 left-4 z-10 flex items-start gap-2">
        <MapPanel
          vehicles={displayedVehicles}
          pendingDevices={isCurrentDay ? pendingDevices : []}
          activeVehicleId={activeVehicleId}
          isCurrentDay={isCurrentDay}
          listLoading={isCurrentDay ? !loaded : dayState.phase === "loading"}
          listError={!isCurrentDay && dayState.phase === "error"}
          routeStatus={routeStatus}
          selectedTrip={selectedTrip}
          onSelect={focusVehicle}
          onClear={() => setActiveVehicleId(null)}
          onFitRoute={fitRoute}
          onTripChange={handleTripChange}
        />
        <MapDayPicker value={selectedDay} onChange={handleDayChange} />
      </div>
      {error && <OverlayMessage>Failed to load devices.</OverlayMessage>}
    </div>
  )
}
