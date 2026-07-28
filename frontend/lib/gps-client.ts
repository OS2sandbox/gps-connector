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

export const ADMIN_PRIVILEGE = "urn:dk:kombit:gps-connector:admin"

export type Me = {
  sub: string
  cvr: string
  idp: string
  privilege_urns: string[]
}

export async function getMe(signal?: AbortSignal): Promise<Me> {
  const res = await fetch("/api/gps/me", { signal, cache: "no-store" })
  if (!res.ok) {
    throw new Error(`me: ${res.status} ${await res.text()}`)
  }
  return (await res.json()) as Me
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

export type MetadataUpdate = {
  imei: string
  metadata: DeviceMetadata
}

export async function patchDeviceMetadataBulk(
  updates: MetadataUpdate[]
): Promise<PatchResponse> {
  const res = await fetch("/api/gps/devices", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ updates }),
    cache: "no-store",
  })
  if (!res.ok) {
    throw new Error(`devices: ${res.status} ${await res.text()}`)
  }
  return (await res.json()) as PatchResponse
}

export function patchDeviceMetadata(
  imei: string,
  metadata: DeviceMetadata
): Promise<PatchResponse> {
  return patchDeviceMetadataBulk([{ imei, metadata }])
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

export type CertificateBundle = {
  blob: Blob
  filename: string
}

const DEFAULT_CERTIFICATE_FILENAME = "tenant-certificate.pem"

function filenameFromDisposition(header: string | null): string {
  const match = header?.match(/filename="?([^";]+)"?/)
  return match?.[1] ?? DEFAULT_CERTIFICATE_FILENAME
}

async function postCertificateBundle(path: string): Promise<CertificateBundle> {
  const res = await fetch(path, { method: "POST", cache: "no-store" })
  if (!res.ok) {
    throw new Error(`tenant certificate: ${res.status} ${await res.text()}`)
  }
  return {
    blob: await res.blob(),
    filename: filenameFromDisposition(res.headers.get("Content-Disposition")),
  }
}

export function fetchTenantCertificate(): Promise<CertificateBundle> {
  return postCertificateBundle("/api/gps/tenant/cert/download")
}

export function rotateTenantCertificate(): Promise<CertificateBundle> {
  return postCertificateBundle("/api/gps/tenant/cert/rotate")
}
