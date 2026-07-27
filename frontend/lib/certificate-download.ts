import type { DeviceRecord } from "@/lib/devices-store"
import { triggerBlobDownload } from "@/lib/download"
import { fetchCertificateZip } from "@/lib/gps-client"

export async function downloadDeviceCertificate(
  record: DeviceRecord
): Promise<void> {
  if (!record.certificateDownload) {
    throw new Error("No certificate download available")
  }
  const batchId = record.certificateDownload.batchId
  const blob = await fetchCertificateZip(batchId)
  triggerBlobDownload(blob, `certificates-${batchId}.zip`)
}

export async function downloadDeviceCertificatesBulk(
  records: readonly DeviceRecord[]
): Promise<void> {
  const batchIds: string[] = []
  for (const record of records) {
    const batchId = record.certificateDownload?.batchId
    if (batchId && !batchIds.includes(batchId)) {
      batchIds.push(batchId)
    }
  }
  if (batchIds.length === 0) {
    throw new Error("No certificate downloads available")
  }
  for (const batchId of batchIds) {
    const blob = await fetchCertificateZip(batchId)
    triggerBlobDownload(blob, `certificates-${batchId}.zip`)
  }
}
