export type Device = {
  imei: string
  device_type?: string
  latitude?: number
  longitude?: number
  device_timestamp?: number
  ignition?: 0 | 1
  moving?: 0 | 1
  plate?: string
  vehicle_id?: string
  make?: string
  model?: string
  cost?: number
  associated_location?: string
  fuel_type?: string
  vehicle_type?: string
  fuel_usage?: number
  capacity?: number
  leasing_end_date?: number
}

export type PositionRow = {
  imei: string
  device_timestamp: number
  latitude: number
  longitude: number
  ignition?: 0 | 1
  moving?: 0 | 1
  plate?: string
}

export type RegisterDeviceInput = {
  imei: string
  device_type: string
}

export type CertificateDownloadPayload = {
  batch_id: string
  expires_at: string
}

export type RegisterResult = {
  imei: string
  status: "created" | "already_registered" | "error"
  error?: string
}

export type RegisterResponse = {
  provisioned?: {
    service_groups_created?: string[]
    subscriptions_created?: string[]
  }
  results: RegisterResult[]
  cert_download?: CertificateDownloadPayload
}

export type TenantCertificate = {
  subject: string
  issuer: string
  serial: string
  not_before: string
  not_after: string
  days_until_expiry: number
  needs_rotation: boolean
}

export async function getDevices(signal?: AbortSignal): Promise<Device[]> {
  const res = await fetch("/api/gps/devices", { signal, cache: "no-store" })
  if (!res.ok) {
    throw new Error(`devices: ${res.status} ${await res.text()}`)
  }
  const json = (await res.json()) as Device[] | { devices?: Device[] }
  if (Array.isArray(json)) return json
  return json.devices ?? []
}

export async function getPositions(
  imei: string,
  from: string,
  to?: string,
  signal?: AbortSignal
): Promise<PositionRow[]> {
  const params = new URLSearchParams({ device_id: imei, from })
  if (to) params.set("to", to)
  const res = await fetch(`/api/gps/positions?${params.toString()}`, {
    signal,
    cache: "no-store",
  })
  if (!res.ok) {
    throw new Error(`positions: ${res.status} ${await res.text()}`)
  }

  const text = await res.text()
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as PositionRow)
}

export async function postDevices(
  devices: RegisterDeviceInput[]
): Promise<RegisterResponse> {
  const res = await fetch("/api/gps/devices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ devices }),
    cache: "no-store",
  })
  if (!res.ok) {
    throw new Error(`devices: ${res.status} ${await res.text()}`)
  }
  return (await res.json()) as RegisterResponse
}

export type DeviceMetadata = {
  plate?: string
  vehicle_id?: string
  make?: string
  model?: string
  vehicle_type?: string
  fuel_type?: string
  fuel_usage?: number
  capacity?: number
  cost?: number
  leasing_end_date?: number
  associated_location?: string
}

export type PatchResult = {
  imei: string
  status: "updated" | "not_found" | "error"
  error?: string
}

export type PatchResponse = {
  results: PatchResult[]
}

export async function patchDeviceMetadata(
  imei: string,
  metadata: DeviceMetadata
): Promise<PatchResponse> {
  const res = await fetch("/api/gps/devices", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ updates: [{ imei, metadata }] }),
    cache: "no-store",
  })
  if (!res.ok) {
    throw new Error(`devices: ${res.status} ${await res.text()}`)
  }
  return (await res.json()) as PatchResponse
}

export type DeleteResult = {
  imei: string
  status: "deleted" | "not_found" | "error"
  error?: string
}

export type DeleteResponse = {
  results: DeleteResult[]
}

export async function deleteDevices(imeis: string[]): Promise<DeleteResponse> {
  const res = await fetch("/api/gps/devices", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imeis }),
    cache: "no-store",
  })
  if (!res.ok) {
    throw new Error(`devices: ${res.status} ${await res.text()}`)
  }
  return (await res.json()) as DeleteResponse
}

export async function getTenantCertificate(
  signal?: AbortSignal
): Promise<TenantCertificate | null> {
  const res = await fetch("/api/gps/tenant/cert", { signal, cache: "no-store" })
  if (res.status === 404) return null
  if (!res.ok) {
    throw new Error(`tenant certificate: ${res.status} ${await res.text()}`)
  }
  return (await res.json()) as TenantCertificate
}

export async function fetchCertificateZip(batchId: string): Promise<Blob> {
  const res = await fetch(
    `/api/gps/devices/certs/${encodeURIComponent(batchId)}/download`,
    { cache: "no-store" }
  )
  if (!res.ok) {
    throw new Error(`certificate download: ${res.status} ${await res.text()}`)
  }
  return await res.blob()
}
