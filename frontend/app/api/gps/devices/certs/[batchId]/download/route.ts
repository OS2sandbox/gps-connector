import { proxyToBackend } from "@/lib/gps-proxy"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ batchId: string }> }
) {
  const { batchId } = await params
  return proxyToBackend(
    `/devices/certs/${encodeURIComponent(batchId)}/download`,
    undefined,
    "application/zip"
  )
}
