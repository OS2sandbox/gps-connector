"use client"

import { createRoot, type Root } from "react-dom/client"
import mapboxgl from "mapbox-gl"
import { Car } from "lucide-react"

import { cn } from "@/lib/utils"
import { type VehicleLocation } from "@/lib/vehicle-locations"
import {
  DRIVING_COLOR,
  STATIONARY_COLOR,
  statusColor,
} from "@/lib/vehicle-status"

export const LIVE_SOURCE_ID = "live-vehicles"

const LIVE_QUERY_LAYER_ID = "live-vehicles-query"
const CLUSTER_RADIUS = 40
const CLUSTER_MAX_ZOOM = 14
const CLUSTER_EXPANSION_OVERSHOOT = 1

export const EMPTY_FEATURES: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
}

type VehicleEntry = {
  kind: "vehicle"
  marker: mapboxgl.Marker
  root: Root
  onScreen: boolean
  status: VehicleLocation["status"]
}

type ClusterEntry = {
  kind: "cluster"
  marker: mapboxgl.Marker
  root: Root
  onScreen: boolean
  count: number
  driving: number
}

export type LiveMarkerEntry = VehicleEntry | ClusterEntry

export function addLiveVehicleLayers(map: mapboxgl.Map) {
  map.addSource(LIVE_SOURCE_ID, {
    type: "geojson",
    data: EMPTY_FEATURES,
    cluster: true,
    clusterRadius: CLUSTER_RADIUS,
    clusterMaxZoom: CLUSTER_MAX_ZOOM,
    clusterProperties: {
      driving: ["+", ["case", ["==", ["get", "status"], "driving"], 1, 0]],
    },
  })
  map.addLayer({
    id: LIVE_QUERY_LAYER_ID,
    type: "circle",
    source: LIVE_SOURCE_ID,
    paint: {
      "circle-radius": 0,
      "circle-opacity": 0,
    },
  })
}

export function vehiclesToFeatures(
  vehicles: VehicleLocation[]
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: vehicles.map((vehicle) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: vehicle.coordinates },
      properties: { id: vehicle.id, status: vehicle.status },
    })),
  }
}

function VehicleMarker({
  status,
  onClick,
}: {
  status: VehicleLocation["status"]
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      aria-label={
        status === "driving" ? "Driving vehicle" : "Stationary vehicle"
      }
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      className="block cursor-pointer"
    >
      <span
        style={{ backgroundColor: statusColor(status) }}
        className="flex size-9 items-center justify-center rounded-full border-2 border-white text-white shadow-md ring-1 ring-black/10 transition-transform duration-150 hover:scale-110"
      >
        <Car className="size-5" />
      </span>
    </button>
  )
}

function ClusterMarker({
  count,
  driving,
  onClick,
}: {
  count: number
  driving: number
  onClick?: () => void
}) {
  const drivingDegrees = count > 0 ? Math.round((driving / count) * 360) : 0
  const size = count < 10 ? 44 : count < 100 ? 54 : 64
  return (
    <button
      type="button"
      aria-label={`${count} vehicles`}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      style={{
        width: size,
        height: size,
        background: `conic-gradient(${DRIVING_COLOR} 0deg ${drivingDegrees}deg, ${STATIONARY_COLOR} ${drivingDegrees}deg 360deg)`,
      }}
      className="flex cursor-pointer items-center justify-center rounded-full border-2 border-white shadow-md ring-1 ring-black/10 transition-transform duration-150 hover:scale-105"
    >
      <span className="flex size-3/5 items-center justify-center rounded-full bg-white">
        <span
          className={cn(
            "font-semibold text-gray-900 tabular-nums",
            count < 100 ? "text-sm" : "text-base"
          )}
        >
          {count}
        </span>
      </span>
    </button>
  )
}

function renderVehicleMarker(
  entry: VehicleEntry,
  id: string,
  vehiclesRef: { current: VehicleLocation[] },
  onSelect: (vehicle: VehicleLocation) => void
) {
  entry.root.render(
    <VehicleMarker
      status={entry.status}
      onClick={() => {
        const vehicle = vehiclesRef.current.find((item) => item.id === id)
        if (vehicle) onSelect(vehicle)
      }}
    />
  )
}

function renderClusterMarker(
  map: mapboxgl.Map,
  source: mapboxgl.GeoJSONSource,
  entry: ClusterEntry,
  clusterId: number
) {
  entry.root.render(
    <ClusterMarker
      count={entry.count}
      driving={entry.driving}
      onClick={() => {
        const center = entry.marker.getLngLat()
        expandCluster(map, source, clusterId, [center.lng, center.lat])
      }}
    />
  )
}

function expandCluster(
  map: mapboxgl.Map,
  source: mapboxgl.GeoJSONSource,
  clusterId: number,
  coordinates: [number, number]
) {
  source.getClusterExpansionZoom(clusterId, (error, zoom) => {
    if (error || zoom === null || zoom === undefined) return
    map.easeTo({
      center: coordinates,
      zoom: zoom + CLUSTER_EXPANSION_OVERSHOOT,
      duration: 500,
    })
  })
}

function ensureMarkerOnScreen(map: mapboxgl.Map, entry: LiveMarkerEntry) {
  if (entry.onScreen) return
  entry.marker.addTo(map)
  entry.onScreen = true
}

export function reconcileLiveMarkers(
  map: mapboxgl.Map,
  cache: Map<string, LiveMarkerEntry>,
  vehiclesRef: { current: VehicleLocation[] },
  onSelect: (vehicle: VehicleLocation) => void
) {
  const source = map.getSource<mapboxgl.GeoJSONSource>(LIVE_SOURCE_ID)
  if (!source) return

  const present = new Set<string>()
  const features = map.querySourceFeatures(LIVE_SOURCE_ID)

  for (const feature of features) {
    if (feature.geometry.type !== "Point") continue
    const coordinates = feature.geometry.coordinates as [number, number]
    const props = feature.properties ?? {}

    if (props.cluster) {
      const clusterId = props.cluster_id as number
      const key = `c:${clusterId}`
      if (present.has(key)) continue
      present.add(key)
      const count = props.point_count as number
      const driving = (props.driving as number) ?? 0

      const cached = cache.get(key)
      let entry = cached?.kind === "cluster" ? cached : undefined
      if (!entry) {
        const element = document.createElement("div")
        element.style.zIndex = "3"
        entry = {
          kind: "cluster",
          marker: new mapboxgl.Marker({ element }).setLngLat(coordinates),
          root: createRoot(element),
          onScreen: false,
          count,
          driving,
        }
        renderClusterMarker(map, source, entry, clusterId)
        cache.set(key, entry)
      } else {
        entry.marker.setLngLat(coordinates)
        if (entry.count !== count || entry.driving !== driving) {
          entry.count = count
          entry.driving = driving
          renderClusterMarker(map, source, entry, clusterId)
        }
      }

      ensureMarkerOnScreen(map, entry)
      continue
    }

    const id = props.id as string
    const key = `v:${id}`
    if (present.has(key)) continue
    present.add(key)
    const status = props.status as VehicleLocation["status"]

    const cached = cache.get(key)
    let entry = cached?.kind === "vehicle" ? cached : undefined
    if (!entry) {
      const element = document.createElement("div")
      element.style.zIndex = "2"
      entry = {
        kind: "vehicle",
        marker: new mapboxgl.Marker({ element }).setLngLat(coordinates),
        root: createRoot(element),
        onScreen: false,
        status,
      }
      renderVehicleMarker(entry, id, vehiclesRef, onSelect)
      cache.set(key, entry)
    } else {
      entry.marker.setLngLat(coordinates)
      if (entry.status !== status) {
        entry.status = status
        renderVehicleMarker(entry, id, vehiclesRef, onSelect)
      }
    }

    ensureMarkerOnScreen(map, entry)
  }

  for (const [key, entry] of cache) {
    if (present.has(key)) continue
    entry.marker.remove()
    entry.onScreen = false
    if (entry.kind === "cluster") {
      const root = entry.root
      queueMicrotask(() => root.unmount())
      cache.delete(key)
    }
  }
}

export function pruneLiveMarkers(
  cache: Map<string, LiveMarkerEntry>,
  vehicles: VehicleLocation[]
) {
  const keep = new Set(vehicles.map((vehicle) => `v:${vehicle.id}`))
  for (const [key, entry] of cache) {
    if (entry.kind !== "vehicle" || keep.has(key)) continue
    entry.marker.remove()
    const root = entry.root
    queueMicrotask(() => root.unmount())
    cache.delete(key)
  }
}

export function clearLiveMarkers(cache: Map<string, LiveMarkerEntry>) {
  for (const entry of cache.values()) {
    entry.marker.remove()
    const root = entry.root
    queueMicrotask(() => root.unmount())
  }
  cache.clear()
}
