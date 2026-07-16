import type { DeviceMetadata } from "@/lib/gps-client"

export type Vehicle = {
  plate: string
  id: string
  make: string
  model: string
  vehicleType: string
  fuelType: string
  fuelUsage: string
  capacity: string
  cost: string
  leasingEnd: string
  location: string
}

function toNumber(value: string): number | undefined {
  if (value === "") return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function leasingEndToUnix(value: string): number | undefined {
  if (!value) return undefined
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) return undefined
  return Math.floor(ms / 1000)
}

export function unixToDateInput(seconds: number): string {
  return new Date(seconds * 1000).toISOString().slice(0, 10)
}

export function vehicleToMetadata(vehicle: Vehicle): DeviceMetadata {
  return {
    plate: vehicle.plate || undefined,
    vehicle_id: vehicle.id || undefined,
    make: vehicle.make || undefined,
    model: vehicle.model || undefined,
    vehicle_type: vehicle.vehicleType || undefined,
    fuel_type: vehicle.fuelType || undefined,
    fuel_usage: toNumber(vehicle.fuelUsage),
    capacity: toNumber(vehicle.capacity),
    cost: toNumber(vehicle.cost),
    leasing_end_date: leasingEndToUnix(vehicle.leasingEnd),
    associated_location: vehicle.location || undefined,
  }
}
