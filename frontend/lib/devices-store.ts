import type { Vehicle } from "@/lib/vehicle"

export type DeviceRecord = {
  imei: string
  gpsDevice: string | null
  vehicle?: Vehicle
}
