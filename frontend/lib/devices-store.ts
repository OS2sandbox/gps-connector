import type { Vehicle } from "@/lib/vehicle"

export type CertificateDownloadInfo = {
  batchId: string
  expiresAt: string
}

export type DeviceRecord = {
  imei: string
  gpsDevice: string | null
  certificateDownload: CertificateDownloadInfo | null
  vehicle?: Vehicle
}
