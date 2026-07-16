import { getPositions, type PositionRow } from "@/lib/gps-client"

const MAX_COORDINATES_PER_REQUEST = 100
const SNAP_RADIUS_METERS = 25
const STOP_RADIUS_METERS = 50
const STOP_MIN_DURATION_SECONDS = 300
const MIN_TRIP_DISTANCE_METERS = 100
const STITCH_MAX_GAP_METERS = 30
const EARTH_RADIUS_METERS = 6_371_000

export type RouteSummary = {
  distanceMeters: number
  firstMovement: string
  lastMovement: string
}

export type RouteTrip = {
  segments: GeoJSON.Position[][]
  distanceMeters: number
  firstMovement: string
  lastMovement: string
}

export type VehicleRoute = {
  trips: RouteTrip[]
  summary: RouteSummary
}

type MapboxMatching = {
  geometry?: { type: string; coordinates: GeoJSON.Position[] }
  distance?: number
}

type MapboxMatchingResponse = {
  matchings?: MapboxMatching[]
}

type ChunkMatch = {
  segments: GeoJSON.Position[][]
  distanceMeters: number
}

type TripMatch = {
  segments: GeoJSON.Position[][]
  distanceMeters: number
  failure: unknown
}

export async function fetchVehicleRoute(
  imei: string,
  token: string,
  range: { from: Date; to: Date },
  signal?: AbortSignal
): Promise<VehicleRoute | null> {
  const positions = await getPositions(
    imei,
    range.from.toISOString(),
    range.to.toISOString(),
    signal
  )
  positions.sort((a, b) => a.device_timestamp - b.device_timestamp)
  if (positions.length < 2) return null

  const trips = splitIntoTrips(positions).filter(
    (trip) => tripDistanceMeters(trip) >= MIN_TRIP_DISTANCE_METERS
  )
  if (trips.length === 0) return null

  const matches = await Promise.all(
    trips.map((trip) => matchTrip(trip, token, signal))
  )
  const matchedTrips: RouteTrip[] = []
  matches.forEach((match, index) => {
    if (match.segments.length === 0) return
    const trip = trips[index]
    matchedTrips.push({
      segments: match.segments,
      distanceMeters: match.distanceMeters,
      firstMovement: new Date(tripMovementStart(trip) * 1000).toISOString(),
      lastMovement: new Date(
        trip[trip.length - 1].device_timestamp * 1000
      ).toISOString(),
    })
  })
  if (matchedTrips.length === 0) {
    const failed = matches.find((match) => match.failure !== undefined)
    if (failed) throw failed.failure
    return null
  }

  return {
    trips: matchedTrips,
    summary: {
      distanceMeters: matchedTrips.reduce(
        (total, trip) => total + trip.distanceMeters,
        0
      ),
      firstMovement: matchedTrips[0].firstMovement,
      lastMovement: matchedTrips[matchedTrips.length - 1].lastMovement,
    },
  }
}

async function matchTrip(
  trip: PositionRow[],
  token: string,
  signal?: AbortSignal
): Promise<TripMatch> {
  const chunks = chunkPositions(trip)
  const results = await Promise.allSettled(
    chunks.map((chunk) => matchChunk(chunk, token, signal))
  )
  const segments: GeoJSON.Position[][] = []
  let distanceMeters = 0
  let failure: unknown
  for (const result of results) {
    if (result.status === "fulfilled") {
      segments.push(...result.value.segments)
      distanceMeters += result.value.distanceMeters
    } else if (failure === undefined) {
      failure = result.reason
    }
  }
  return { segments: stitchSegments(segments), distanceMeters, failure }
}

function stitchSegments(segments: GeoJSON.Position[][]): GeoJSON.Position[][] {
  const stitched: GeoJSON.Position[][] = []
  for (const segment of segments) {
    const previous = stitched[stitched.length - 1]
    if (previous && gapMeters(previous, segment) <= STITCH_MAX_GAP_METERS) {
      previous.push(...segment)
    } else {
      stitched.push([...segment])
    }
  }
  return stitched
}

function gapMeters(
  previous: GeoJSON.Position[],
  next: GeoJSON.Position[]
): number {
  const [previousLon, previousLat] = previous[previous.length - 1]
  const [nextLon, nextLat] = next[0]
  return haversineMeters(
    { latitude: previousLat, longitude: previousLon },
    { latitude: nextLat, longitude: nextLon }
  )
}

function splitIntoTrips(positions: PositionRow[]): PositionRow[][] {
  const trips: PositionRow[][] = []
  let trip: PositionRow[] = [positions[0]]
  let anchor = positions[0]
  let lastNearAnchor = positions[0]
  let stopped = false

  for (let i = 1; i < positions.length; i++) {
    const position = positions[i]
    const gapSeconds =
      position.device_timestamp - positions[i - 1].device_timestamp
    if (gapSeconds >= STOP_MIN_DURATION_SECONDS) {
      stopped = true
    }
    if (haversineMeters(anchor, position) <= STOP_RADIUS_METERS) {
      lastNearAnchor = position
      const dwellSeconds = position.device_timestamp - anchor.device_timestamp
      if (dwellSeconds >= STOP_MIN_DURATION_SECONDS) {
        stopped = true
      }
      continue
    }
    if (stopped) {
      trips.push(trip)
      trip = [lastNearAnchor]
      stopped = false
    }
    trip.push(position)
    anchor = position
    lastNearAnchor = position
  }
  trips.push(trip)
  return trips
}

function tripMovementStart(trip: PositionRow[]): number {
  if (
    trip.length >= 2 &&
    trip[1].device_timestamp - trip[0].device_timestamp >=
      STOP_MIN_DURATION_SECONDS
  ) {
    return trip[1].device_timestamp
  }
  return trip[0].device_timestamp
}

function tripDistanceMeters(trip: PositionRow[]): number {
  let total = 0
  for (let i = 1; i < trip.length; i++) {
    total += haversineMeters(trip[i - 1], trip[i])
  }
  return total
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

type Coordinates = { latitude: number; longitude: number }

function haversineMeters(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.latitude - a.latitude)
  const dLon = toRadians(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) *
      Math.cos(toRadians(b.latitude)) *
      Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h))
}

function chunkPositions(positions: PositionRow[]): PositionRow[][] {
  const chunks: PositionRow[][] = []
  for (let i = 0; i < positions.length; i += MAX_COORDINATES_PER_REQUEST - 1) {
    const slice = positions.slice(i, i + MAX_COORDINATES_PER_REQUEST)
    if (slice.length < 2) break
    chunks.push(slice)
  }
  return chunks
}

async function matchChunk(
  chunk: PositionRow[],
  token: string,
  signal?: AbortSignal
): Promise<ChunkMatch> {
  const coordinates = chunk
    .map((position) => `${position.longitude},${position.latitude}`)
    .join(";")
  const timestamps = chunk
    .map((position) => position.device_timestamp)
    .join(";")
  const radiuses = chunk.map(() => SNAP_RADIUS_METERS).join(";")
  const url =
    `https://api.mapbox.com/matching/v5/mapbox/driving/${coordinates}` +
    `?geometries=geojson&overview=full&tidy=true` +
    `&timestamps=${timestamps}&radiuses=${radiuses}` +
    `&access_token=${token}`

  const res = await fetch(url, { signal })
  if (!res.ok) {
    throw new Error(`Map Matching: ${res.status} ${await res.text()}`)
  }

  const data = (await res.json()) as MapboxMatchingResponse
  const segments: GeoJSON.Position[][] = []
  let distanceMeters = 0
  for (const matching of data.matchings ?? []) {
    const geometry = matching.geometry
    if (geometry?.type === "LineString" && geometry.coordinates.length >= 2) {
      segments.push(geometry.coordinates)
      distanceMeters += matching.distance ?? 0
    }
  }
  return { segments, distanceMeters }
}
