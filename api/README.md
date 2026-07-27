# gps-connector API

Provisioning API for GPS devices in the FIWARE stack. Accepts device registration requests and orchestrates the underlying provisioning chain across IoT Agent, Orion-LD, and Redis.

## Endpoints

### `GET /healthz`

Liveness probe.

**Request:** No body.

**Response:** `200 OK` with body `ok` (plain text).

---

### `POST /devices`

Bulk-create devices. Accepts one or more devices in a single request and provisions them across the stack:

1. Service group per `(tenant, device_type)` in IoT Agent (created if missing).
2. Subscription per tenant in Orion-LD (created if missing).
3. Devices batched per `(tenant, device_type)` and POSTed to IoT Agent in one call per group.
4. Tenant ownership recorded in Redis.

Always wrapped in `{"devices": [...]}` — a single device is sent as a one-element array.

**Request body:**

```json
{
  "devices": [
    {
      "tenant": "acme",
      "imei": "123456789012345",
      "device_type": "teltonika"
    }
  ]
}
```

| Field         | Type   | Constraints                       |
| ------------- | ------ | --------------------------------- |
| `tenant`      | string | required, non-empty               |
| `imei`        | string | required, exactly 15 characters   |
| `device_type` | string | required, non-empty               |

**Response body:**

```json
{
  "provisioned": {
    "service_groups_created": ["acme-teltonika"],
    "subscriptions_created": ["acme"]
  },
  "results": [
    { "imei": "123456789012345", "status": "created" },
    { "imei": "123456789012346", "status": "already_registered" },
    { "imei": "123456789012347", "status": "error", "error": "imei already registered to another tenant" }
  ]
}
```

`provisioned.service_groups_created` and `provisioned.subscriptions_created` list only the resources actually created during this request. On a fully idempotent call (everything already exists), both arrays are empty.

`results` contains one entry per input device:

| `status`              | Meaning                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------- |
| `created`             | Device was newly provisioned in IoT Agent and registered in Redis.                       |
| `already_registered`  | Device was already registered to the same tenant — idempotent, nothing changed.          |
| `error`               | Device could not be provisioned. `error` field contains a human-readable reason.         |

**Status codes:**

| Code  | Meaning                                                                                |
| ----- | -------------------------------------------------------------------------------------- |
| `200` | All devices succeeded (`created` or `already_registered`).                             |
| `207` | Mixed result — at least one device has `status: error`. Inspect `results` for details. |
| `400` | Request is malformed: invalid JSON, empty `devices` array, validation failure, or duplicate IMEI within the request. |

**Error reasons in `results[].error`:**

- `imei already registered to another tenant` — the IMEI is owned by a different tenant. Server logs contain the owning tenant for diagnostics; the response does not (no tenant leakage).
- `iot agent error: ...` / `create service group: ...` — provisioning of the underlying service group failed; all devices in that `(tenant, device_type)` group are marked errored.
- `OrionLD error: ...` / `create subscription: ...` — subscription provisioning failed for the tenant; all devices for that tenant are marked errored.
- `create device: ...` — IoT Agent rejected the batch; all devices in the batch are marked errored. Safe to retry — Redis is only written after a successful IoT Agent call, and IoT Agent treats subsequent identical creates as `409 Conflict` which is accepted as success.
- `redis error: ...` — Redis read/write failed for a specific device.

**Example — single device:**

```bash
curl -X POST http://localhost:8080/devices \
  -H "Content-Type: application/json" \
  -d '{"devices":[{"tenant":"acme","imei":"123456789012345","device_type":"teltonika"}]}'
```

**Example — three devices in one call (one IoT Agent call, one service group, one subscription):**

```bash
curl -X POST http://localhost:8080/devices \
  -H "Content-Type: application/json" \
  -d '{"devices":[
    {"tenant":"acme","imei":"123456789012345","device_type":"teltonika"},
    {"tenant":"acme","imei":"123456789012346","device_type":"teltonika"},
    {"tenant":"acme","imei":"123456789012347","device_type":"teltonika"}
  ]}'
```
