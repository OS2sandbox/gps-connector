import type { VehicleLocation } from "@/lib/vehicle-locations"

export const DRIVING_COLOR = "#3b82f6"
export const STATIONARY_COLOR = "#6b7280"

export function statusColor(status: VehicleLocation["status"]): string {
  return status === "driving" ? DRIVING_COLOR : STATIONARY_COLOR
}
