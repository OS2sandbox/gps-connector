# gps-connector API

Multi-tenant API for GPS device provisioning, position queries, archiving, and PKI lifecycle. All endpoints (except `GET /healthz`) require a Keycloak-issued JWT in the `Authorization: Bearer <token>` header.

## Authentication & authorization

- **Tenant** is derived from the `cvr` claim in the JWT — never sent in request bodies or URLs.
- **Privileges** come from the base64-encoded `privileges` XML claim, decoded into a list of URNs:
  - `urn:dk:kombit:gps-connector:read` — required for read endpoints.
  - `urn:dk:kombit:gps-connector:write` — required for write endpoints.
  - `urn:dk:kombit:gps-connector:ExternalApplication` — narrow role for external apps; grants only `GET /positions`.
- Cross-tenant access returns `404 not found` (no enumeration leakage).

## Common conventions

- All request and response bodies are JSON unless noted otherwise.
- Errors use HTTP status codes with a plain-text body. Validation errors are `400`, auth errors are `401/403`, missing resources are `404`, conflicts are `409`. Mixed-success batch responses use `207 Multi-Status`.
- IMEI strings must be exactly 15 digits.
- Timestamps are RFC3339 (`2026-05-06T09:00:00Z`).

## Endpoint overview

| Method | Path | Privilege | Purpose |
|---|---|---|---|
| GET | `/healthz` | — | Liveness probe |
| GET | `/me` | `:read` | Return JWT claims for the calling user |
| POST | `/devices` | `:write` | Bulk-create devices, issue device certs |
| GET | `/devices` | `:read` | List all devices for the tenant with latest position + metadata |
| PATCH | `/devices` | `:write` | Bulk-update device metadata |
| DELETE | `/devices` | `:write` | Bulk-delete devices (CrateDB history preserved) |
| GET | `/positions` | `:read` or `:ExternalApplication` | NDJSON stream of positions over a time range |
| POST | `/archive` | `:read` | Start an async CSV export from cold storage |
| GET | `/archive/{id}` | `:read` | Poll export job status |
| GET | `/archive/{id}/download` | `:read` | Stream the exported CSV |
| POST | `/devices/certs/regenerate` | `:write` | Regenerate device certs for one or more IMEIs |
| GET | `/devices/certs/{batch_id}/download` | `:write` | Download a zip of device cert bundles |
| GET | `/tenant/cert` | `:read` | Get tenant CA metadata (subject/issuer/expiry) |
| POST | `/tenant/cert/regenerate` | `:write` | Full PKI reset — new tenant CA + new device certs for all devices |

Detailed contracts for each endpoint follow below.

---

## Health

### `GET /healthz`

Liveness probe. No auth.

**Response:** `200 OK`, body `ok` (text).

---

## Identity

### `GET /me`

Privilege: `:read`.

Returns selected JWT claims for the calling user.

**Response 200:**
```json
{
  "sub": "...",
  "cvr": "12345678",
  "idp": "...",
  "privileges": "PFByaXZpbGVnZUxpc3Q+..."
}
```

| Field | Description |
|---|---|
| `sub` | Subject identifier from the JWT |
| `cvr` | Tenant CVR — drives all multi-tenant scoping |
| `idp` | Identity provider that issued the token |
| `privileges` | Base64-encoded `<PrivilegeList>` XML from KOMBIT — returned as-is, decoded server-side for authz checks |

---

## Devices

### `POST /devices`

Privilege: `:write`. Bulk-create devices.

Provisions across the stack: ensures tenant CA exists, creates IoT-Agent service group + Orion subscription if missing, creates devices in IoT Agent, registers tenant-mapping in Redis, creates Orion entity stub, and issues a device certificate signed by the tenant CA.

**Request:**
```json
{
  "devices": [
    { "imei": "123456789012345", "device_type": "teltonika" }
  ]
}
```

**Response 200/207:**
```json
{
  "provisioned": {
    "service_groups_created": ["12345678-teltonika"],
    "subscriptions_created": ["12345678"]
  },
  "results": [
    { "imei": "123456789012345", "status": "created" },
    { "imei": "123456789012346", "status": "already_registered" },
    { "imei": "123456789012347", "status": "error", "error": "..." }
  ],
  "cert_download": {
    "batch_id": "...",
    "url": "/devices/certs/.../download",
    "expires_at": "2026-05-06T11:00:00Z"
  }
}
```

`provisioned.service_groups_created` lists newly created `<cvr>-<device_type>` IoT-Agent service groups. `subscriptions_created` lists CVRs for which a new Orion subscription was set up. Both arrays are empty when nothing new was provisioned (idempotent retry).

`cert_download` is present only when at least one device was newly created. Use the URL within 1 hour to download a zip with `<imei>.pem` files (4-block PEM bundles: device key + device cert + tenant CA + root CA). Devices with status `already_registered` get **no** cert returned — the only way to obtain a fresh cert for an existing device is via `POST /devices/certs/regenerate`.

`results[].status` values:

| Status | Meaning |
|---|---|
| `created` | New device, provisioned everywhere, cert included in batch |
| `already_registered` | Same tenant already owns this IMEI; no-op, no new cert |
| `error` | Provisioning failed at some step; `error` field has details |

Common `error` reasons:

- `imei already registered to another tenant` — IMEI is owned by a different tenant. Server logs name the owning tenant; the response does not (no enumeration leakage).
- `iot agent error: ...` / `create service group: ...` — IoT Agent rejected provisioning of the service group.
- `OrionLD error: ...` / `create subscription: ...` — Orion subscription provisioning failed.
- `create device: ...` — IoT Agent rejected the device batch.
- `redis error: ...` — Redis read/write failed.
- `orion error: ...` — Orion entity creation failed after device was provisioned.
- `cert generation failed` — RSA key/cert generation failed (very rare). Device IS in IoT Agent + Orion + Redis; recover via `POST /devices/certs/regenerate`.

**Validation (all return `400 Bad Request`):**

- Body is not valid JSON
- `devices` array is missing or empty
- `imei` is empty, not exactly 15 digits, or duplicated within the request
- `device_type` is empty

---

### `GET /devices`

Privilege: `:read`.

Returns all devices owned by the calling tenant with their latest position and metadata, queried from Orion.

**Response 200:**
```json
{
  "devices": [
    {
      "imei": "123456789012345",
      "latitude": 55.6761,
      "longitude": 12.5683,
      "speed": 42.5,
      "device_timestamp": 1714820000,
      "ignition": 1,
      "moving": 1,
      "plate": "AB12345",
      "vehicle_id": "FLEET-042",
      "make": "Volvo",
      "model": "FH16",
      "cost": 850000,
      "associated_location": "Aarhus",
      "fuel_type": "diesel",
      "vehicle_type": "truck",
      "fuel_usage": 28.5,
      "capacity": 24000,
      "leasing_end_date": 1820000000
    }
  ]
}
```

Field reference:

| Field | Type | Notes |
|---|---|---|
| `imei` | string | Always present |
| `latitude`, `longitude`, `speed` | number | Last known position; absent until device has reported |
| `device_timestamp` | int (unix seconds) | When device produced the position |
| `ignition`, `moving` | int (0 or 1) | Device state flags |
| `plate`, `vehicle_id`, `make`, `model` | string | Set via `PATCH /devices` |
| `associated_location`, `fuel_type`, `vehicle_type` | string | Set via `PATCH /devices` |
| `cost`, `capacity` | int | Set via `PATCH /devices` |
| `fuel_usage` | number | Set via `PATCH /devices` |
| `leasing_end_date` | int (unix seconds) | Set via `PATCH /devices` |

All non-IMEI fields are omitted from the response when they have no value.

Returns `{"devices": []}` if the tenant has no devices yet.

---

### `PATCH /devices`

Privilege: `:write`. Bulk-update device metadata.

**Request:**
```json
{
  "updates": [
    {
      "imei": "123456789012345",
      "metadata": {
        "plate": "XY99999",
        "vehicle_id": "FLEET-042",
        "make": "Scania",
        "model": "R500",
        "cost": 1200000,
        "associated_location": "Aarhus",
        "fuel_type": "diesel",
        "vehicle_type": "truck",
        "fuel_usage": 28.5,
        "capacity": 24000,
        "leasing_end_date": 1820000000
      }
    }
  ]
}
```

All metadata fields are optional. Only fields included in the request body are updated; existing values for omitted fields are preserved.

Supported metadata fields:

| Field | Type | Notes |
|---|---|---|
| `plate` | string | Number plate / registration |
| `vehicle_id` | string | Internal fleet identifier |
| `make`, `model` | string | Manufacturer + model |
| `cost`, `capacity` | int | Purchase cost, payload capacity |
| `associated_location` | string | Home base / depot |
| `fuel_type` | string | e.g. `"diesel"`, `"electric"` |
| `vehicle_type` | string | e.g. `"truck"`, `"van"` |
| `fuel_usage` | number | Average consumption |
| `leasing_end_date` | int (unix seconds) | When current lease expires |

Unknown fields in `metadata` are silently ignored.

**Response 200/207:**
```json
{
  "results": [
    { "imei": "123456789012345", "status": "updated" },
    { "imei": "123456789012346", "status": "not_found" },
    { "imei": "123456789012347", "status": "error", "error": "..." }
  ]
}
```

`status` values: `updated`, `not_found` (also returned when the IMEI belongs to another tenant — no enumeration leakage), `error`.

**Validation (all return `400 Bad Request`):**

- Body is not valid JSON
- `updates` array is missing or empty
- `imei` is empty, not exactly 15 digits, or duplicated within the request

---

### `DELETE /devices`

Privilege: `:write`. Bulk-delete devices.

Removes from IoT Agent → Orion → Redis (in that order). CrateDB historical data is preserved.

**Request:**
```json
{ "imeis": ["123456789012345", "123456789012346"] }
```

**Response 200/207:**
```json
{
  "results": [
    { "imei": "123456789012345", "status": "deleted" },
    { "imei": "123456789012346", "status": "not_found" }
  ]
}
```

`status` values: `deleted`, `not_found` (also returned for cross-tenant IMEIs), `error`.

Deletion order is IoT Agent → Orion → Redis. If any upstream call fails, Redis still holds the tenant mapping so the request can be safely retried. CrateDB historical data is never touched.

**Validation (all return `400 Bad Request`):**

- Body is not valid JSON
- `imeis` array is missing or empty
- `imei` is not exactly 15 digits or duplicated within the request

---

## Positions

### `GET /positions`

Privilege: `:read` **or** `:ExternalApplication`.

Streams positions from CrateDB as NDJSON (one JSON object per line). Time-range query — caller picks the window. Use a tight `from` for live polling, a wide range for historical replay.

**Query params:**
- `from` (required, RFC3339) — start of time range
- `to` (optional, RFC3339, defaults to now)
- `device_id` (optional, IMEI) — filter to a single device

**Response 200** (`Content-Type: application/x-ndjson`):
```
{"imei":"123456789012345","time_index":"2026-05-06T09:00:00Z","device_timestamp":1714820000,"latitude":55.6761,"longitude":12.5683,"speed":42.5,"heading":180.0,"ignition":1,"moving":1,"plate":"AB12345"}
{"imei":"123456789012345","time_index":"2026-05-06T09:00:01Z",...}
```

Field reference (per row):

| Field | Type | Notes |
|---|---|---|
| `imei` | string | 15 digits — the device producing the row |
| `time_index` | RFC3339 | When CrateDB ingested the row |
| `device_timestamp` | int (unix seconds) | When the device produced the position |
| `latitude`, `longitude` | number | WGS84 |
| `speed` | number | km/h |
| `heading` | number | Degrees (0-359), omitted for rows from before heading was tracked |
| `ignition`, `moving` | int (0 or 1) | Device state flags |
| `plate` | string | Vehicle plate at the time of the row; omitted if not set when the row was ingested |

Stream may be empty (no rows in range). Errors after the first row has been written do not change status code — clients should detect partial responses via NDJSON parsing.

**Polling for live updates:** track the latest `time_index` you've seen and use it as the next `from`. The server has no concept of "session"; each request is independent.

**Validation (all return `400 Bad Request`):**

- `from` is missing
- `from` or `to` is not valid RFC3339
- `to` is not strictly after `from`

---

## Archive (cold-storage export)

Async export of archived positions from MinIO Parquet files as a CSV.

### `POST /archive`

Privilege: `:read`. Creates an export job.

**Query params:** same as `GET /positions` (`from`, `to`, `device_id`).

**Response 202:**
```json
{
  "job_id": "abc123...",
  "status": "pending",
  "status_url": "/archive/abc123...",
  "expires_at": "2026-05-07T09:00:00Z"
}
```

Job state lives in Redis with a 24h TTL. Export work runs as a background goroutine; this endpoint returns immediately with `status: pending`.

**Validation (all return `400 Bad Request`):** same as `GET /positions` (missing `from`, invalid RFC3339, `to` not after `from`).

---

### `GET /archive/{id}`

Privilege: `:read`. Polls export job status.

**Response 200** (full example with all optional fields populated):
```json
{
  "job_id": "...",
  "status": "ready",
  "created_at": "...",
  "expires_at": "...",
  "from": "...",
  "to": "...",
  "device_id": "...",
  "row_count": 12345,
  "download_url": "/archive/.../download"
}
```

| Field | Always present? | Notes |
|---|---|---|
| `job_id`, `status`, `created_at`, `expires_at`, `from`, `to` | Yes | |
| `device_id` | Only if filter was set on the original `POST /archive` | |
| `error` | Only when `status` is `error` | Human-readable reason |
| `download_url`, `row_count` | Only when `status` is `ready` | |

`status` values: `pending`, `running`, `ready`, `error`.

Returns `404` if `job_id` is unknown to the calling tenant or has expired (24h TTL). Cross-tenant access also returns `404`.

---

### `GET /archive/{id}/download`

Privilege: `:read`. Streams the CSV through the API (MinIO is not exposed externally).

**Response 200** (`Content-Type: text/csv`, `Content-Disposition: attachment`).

Returns `409 Conflict` if status is not `ready`.

---

## Certificates (PKI)

### `GET /devices/certs/{batch_id}/download`

Privilege: `:write`. Downloads a zip of device certificate bundles.

**Response 200** (`Content-Type: application/zip`):
- Filename: `device-certs-<cvr>-<YYYY-MM-DD>.zip`
- Contents: one `<imei>.pem` per device, each a 4-block PEM bundle (PKCS#8 device key + device cert + tenant CA cert + root CA cert).

Returns `404` if `batch_id` is unknown to the calling tenant or expired (1h TTL).

---

### `POST /devices/certs/regenerate`

Privilege: `:write`. Regenerates device certificates for one or more existing devices.

**Request:**
```json
{ "imeis": ["123456789012345", "123456789012346"] }
```

**Response 200/207:**
```json
{
  "results": [
    { "imei": "123456789012345", "status": "regenerated" },
    { "imei": "123456789012346", "status": "not_found" }
  ],
  "cert_download": {
    "batch_id": "...",
    "url": "/devices/certs/.../download",
    "expires_at": "..."
  }
}
```

`status` values: `regenerated`, `not_found` (also returned for cross-tenant IMEIs), `error`.

Old device certs remain valid until their natural expiry — no revocation.

**Validation (all return `400 Bad Request`):**

- Body is not valid JSON
- `imeis` array is missing or empty
- `imei` is not exactly 15 digits or duplicated within the request

---

### `GET /tenant/cert`

Privilege: `:read`. Returns metadata about the calling tenant's CA.

**Response 200:**
```json
{
  "subject": "CN=Tenant CA 12345678,O=12345678",
  "issuer": "CN=GPS-Connector Root CA",
  "serial": "6e07619c3cd74b816efafca47372f4e7",
  "not_before": "2026-05-06T09:19:13Z",
  "not_after": "2031-05-05T09:19:13Z",
  "days_until_expiry": 1825,
  "needs_rotation": false
}
```

`needs_rotation` is `true` when `days_until_expiry < 30`.

Returns `404` if no tenant CA has been provisioned yet (tenant has never POSTed a device).

---

### `POST /tenant/cert/regenerate`

Privilege: `:write`. Full PKI reset for the tenant.

Generates a new tenant CA (overwriting the existing one), then regenerates device certificates for **every** device the tenant owns. Returns the new CA info plus a batch download for all the new device bundles.

**Request:** no body.

**Response 200:**
```json
{
  "ca": {
    "subject": "CN=Tenant CA 12345678,O=12345678",
    "issuer": "CN=GPS-Connector Root CA",
    "serial": "...",
    "not_before": "...",
    "not_after": "...",
    "days_until_expiry": 1825,
    "needs_rotation": false
  },
  "results": [
    { "imei": "123456789012345", "status": "regenerated" }
  ],
  "cert_download": {
    "batch_id": "...",
    "url": "/devices/certs/.../download",
    "expires_at": "..."
  }
}
```

After this operation, all devices must be re-flashed with the new bundles. Old certs continue to work at the broker level until their natural expiry (which equals the previous tenant CA's `NotAfter`).

If the tenant has no devices yet, `results` is `[]` and `cert_download` is omitted — only the new tenant CA is provisioned.

---

## Certificate bundle format

Each `<imei>.pem` in a download zip is a **4-block PEM bundle**, in order:

```
-----BEGIN PRIVATE KEY-----      ← PKCS#8 device private key
-----END PRIVATE KEY-----
-----BEGIN CERTIFICATE-----      ← device cert (CN=<imei>, O=<cvr>)
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----      ← tenant CA (CN=Tenant CA <cvr>, O=<cvr>)
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----      ← root CA (CN=GPS-Connector Root CA)
-----END CERTIFICATE-----
```

Validity: device cert `NotAfter` matches the tenant CA's `NotAfter` — a fresh device cert today gets up to 5 years; a device cert issued late in the tenant CA's life gets less. Rotating the tenant CA forces all new devices onto a fresh expiry window.
