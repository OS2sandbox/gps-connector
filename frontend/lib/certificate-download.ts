import { triggerBlobDownload } from "@/lib/download"
import {
  fetchTenantCertificate,
  rotateTenantCertificate,
} from "@/lib/gps-client"

export async function downloadTenantCertificate(): Promise<void> {
  const { blob, filename } = await fetchTenantCertificate()
  triggerBlobDownload(blob, filename)
}

export async function downloadRotatedTenantCertificate(): Promise<void> {
  const { blob, filename } = await rotateTenantCertificate()
  triggerBlobDownload(blob, filename)
}
