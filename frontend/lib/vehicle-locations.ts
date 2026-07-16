import { getPositions, type Device } from "@/lib/gps-client"

export type VehicleLocation = {
  id: string
  plate: string
  status: "driving" | "stationary"
  coordinates: [number, number]
  lastUpdate?: string
  make: string
  model: string
  fleetId: string
  imei: string
  vehicleType?: string
  ignition?: boolean
  associatedLocation?: string
  fuelType?: string
  capacity?: number
  leasingEndDate?: string
}

export type PendingDevice = {
  id: string
  imei: string
  plate: string
  make: string
  model: string
  fleetId: string
}

export function deviceToPending(device: Device): PendingDevice | null {
  if (device.latitude !== undefined && device.longitude !== undefined) {
    return null
  }
  return {
    id: device.imei,
    imei: device.imei,
    plate: device.plate ?? "",
    make: device.make ?? "",
    model: device.model ?? "",
    fleetId: device.vehicle_id ?? "",
  }
}

export function deviceToVehicle(device: Device): VehicleLocation | null {
  if (device.latitude === undefined || device.longitude === undefined) {
    return null
  }
  return {
    id: device.imei,
    imei: device.imei,
    plate: device.plate ?? "",
    status: device.moving === 1 ? "driving" : "stationary",
    coordinates: [device.longitude, device.latitude],
    lastUpdate: device.device_timestamp
      ? new Date(device.device_timestamp * 1000).toISOString()
      : undefined,
    make: device.make ?? "",
    model: device.model ?? "",
    fleetId: device.vehicle_id ?? "",
    vehicleType: device.vehicle_type,
    ignition: device.ignition === undefined ? undefined : device.ignition === 1,
    associatedLocation: device.associated_location,
    fuelType: device.fuel_type,
    capacity: device.capacity,
    leasingEndDate:
      device.leasing_end_date !== undefined
        ? new Date(device.leasing_end_date * 1000).toISOString()
        : undefined,
  }
}

export async function fetchDayVehicleLocations(
  vehicles: VehicleLocation[],
  range: { from: Date; to: Date },
  signal?: AbortSignal
): Promise<VehicleLocation[]> {
  let failure: unknown
  const located = await Promise.all(
    vehicles.map(async (vehicle): Promise<VehicleLocation | null> => {
      try {
        const positions = await getPositions(
          vehicle.imei,
          range.from.toISOString(),
          range.to.toISOString(),
          signal
        )
        if (positions.length === 0) return null
        const last = positions.reduce((latest, row) =>
          row.device_timestamp > latest.device_timestamp ? row : latest
        )
        return {
          ...vehicle,
          coordinates: [last.longitude, last.latitude],
          status: last.moving === 1 ? "driving" : "stationary",
          lastUpdate: new Date(last.device_timestamp * 1000).toISOString(),
        }
      } catch (error) {
        if (failure === undefined) failure = error
        return null
      }
    })
  )
  const found = located.filter(
    (vehicle): vehicle is VehicleLocation => vehicle !== null
  )
  if (found.length === 0 && failure !== undefined) throw failure
  return found
}
