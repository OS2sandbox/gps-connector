NGSI-LD GPS Connector – FIWARE Examples

This repository contains working **NGSI-LD examples** demonstrating how GPS data
can be mapped to **FIWARE Smart Data Models (Transportation)** and processed end-to-end
through **Orion-LD** and **QuantumLeap**.

The goal is to provide **gap-free, reproducible examples** for testing and validating
a GPS connector pipeline.

## Scope

The examples cover:

- `Vehicle` and `VehicleModel` entities based on **Smart Data Models – Transportation**
- GPS telemetry ingestion (location, speed, ignition status, timestamp)
- Orion-LD subscriptions forwarding data to QuantumLeap
- Time-series persistence in **TimescaleDB** and entity metadata in **CrateDB**

Temporary model extensions are included for:

- `leasingInfo` (Vehicle)
- `tractionBatteryCapacity` (VehicleModel)

## Database backend configuration

QuantumLeap supports multiple storage backends.  
In this setup, both CrateDB and TimescaleDB are configured, but **CrateDB is used as the active backend**.

- `QL_DEFAULT_DB=crate`
- All NGSI-LD notifications are persisted in CrateDB
- TimescaleDB is included only as an optional backend for future use and is not used in this example

As a result:

- Time-series tables are created in CrateDB
- No tables are expected in TimescaleDB

---

## GPS → NGSI-LD → FIWARE Smart Data Models Mapping

| GPS Connector Field       | Target Entity          | NGSI-LD Attribute         | NGSI-LD Type | Expected Data Type | Format / Unit              | Notes                                                                             |
| ------------------------- | ---------------------- | ------------------------- | ------------ | ------------------ | -------------------------- | --------------------------------------------------------------------------------- |
| `id`                      | Vehicle                | `id`                      | Entity ID    | string             | `urn:ngsi-ld:Vehicle:<id>` | GPS id is mapped to the NGSI-LD URN.                                              |
| `timestamp`               | Vehicle                | `observationDateTime`     | Property     | string             | ISO 8601 (UTC)             | Timestamp of the GPS observation.                                                 |
| `latitude` / `longitude`  | Vehicle                | `location`                | GeoProperty  | object             | GeoJSON Point (WGS84)      | Coordinates must be `[longitude, latitude]`.                                      |
| `speed`                   | Vehicle                | `speed`                   | Property     | number             | km/h                       | Defined in Smart Data Models Vehicle schema.                                      |
| `ignitionStatus`          | Vehicle                | `ignitionStatus`          | Property     | boolean / string   | `true/false` or `on/off`   | Defined in Smart Data Models Vehicle schema. Use one representation consistently. |
| `license_plate`           | Vehicle                | `vehiclePlateIdentifier`  | Property     | string             | text                       | Official Smart Data Models attribute for license plate.                           |
| `vehicleModelId`          | Vehicle                | `refVehicleModel`         | Relationship | string             | URN                        | Links Vehicle to its VehicleModel entity.                                         |
| `vehicleType`             | Vehicle / VehicleModel | `vehicleType`             | Property     | string             | enum                       | Example: `car`, `van`, `truck`.                                                   |
| `fuelType`                | Vehicle / VehicleModel | `fuelType`                | Property     | string             | enum                       | Example: `petrol`, `diesel`, `electric`.                                          |
| `mileage`                 | Vehicle                | `mileageFromOdometer`     | Property     | number             | km                         | Optional; only if available from GPS.                                             |
| `serviceStatus`           | Vehicle                | `serviceStatus`           | Property     | string             | enum                       | Used to trigger updates and subscriptions.                                        |
| `address`                 | Vehicle                | `address`                 | Property     | object             | PostalAddress              | Optional; populated via reverse geocoding.                                        |
| `category`                | Vehicle                | `category`                | Property     | string / array     | text                       | Optional classification.                                                          |
| `leasingInfo.*`           | Vehicle                | `leasingInfo`             | Property     | object             | custom object              | Temporary extension, documented via example.                                      |
| `tractionBatteryCapacity` | VehicleModel           | `tractionBatteryCapacity` | Property     | number             | kWh                        | VehicleModel-level attribute.                                                     |

---

### Data Type and Format Conventions

The following conventions apply across all examples and implementations:

**Entity IDs**:

- Vehicles: urn:ngsi-ld:Vehicle:<id>

- VehicleModels: urn:ngsi-ld:VehicleModel:<id>

**Time:**

- observationDateTime MUST be an ISO 8601 timestamp (UTC recommended).

**Location**:

- location MUST be a GeoJSON Point with coordinates [longitude, latitude]

**Speed**:

- speed is expressed in km/h

- The same unit MUST be used consistently by the GPS connector.

**Ignition status**

- ignitionStatus MUST use a single representation across all entities:

- either boolean (true / false)

- or string (on / off)

### JSON-LD Entity and Subscription Examples

Full, working JSON-LD examples are provided in the examples/ directory:

- vehicle.json — Vehicle entity (Smart Data Models Transportation)

- vehicle-model.json — VehicleModel entity

- subscription-vehicle.json — Orion-LD → QuantumLeap subscription

- subscription-vehiclemodel.json — VehicleModel subscription

#### These examples:

can be created directly in Orion-LD

trigger notifications to QuantumLeap

result in time-series persistence in TimescaleDB

## Repository Structure

├── docker-compose.yml # Local FIWARE setup
├── examples/
│ ├── vehicle.json
│ ├── vehicle-model.json
│ ├── subscription-vehicle.json
│ └── subscription-vehiclemodel.json
|
├── README.md

## Database backend configuration

QuantumLeap supports multiple storage backends.  
In this setup, both CrateDB and TimescaleDB are configured, but **CrateDB is used as the active backend**.

- `QL_DEFAULT_DB=crate`
- All NGSI-LD notifications are persisted in CrateDB
- TimescaleDB is included only as an optional backend for future use and is not used in this example

As a result:

- Time-series tables are created in CrateDB
- No tables are expected in TimescaleDB

### Verify data persistence

1. Create NGSI-LD entities in Orion-LD
2. Trigger updates to generate notifications
3. Open CrateDB Admin UI at http://localhost:4200

Tables will be created automatically by QuantumLeap in CrateDB.

### Local Setup

Start the FIWARE stack locally:

```bash
docker compose up -d
```

## Usage

1. Create subscriptions (Orion-LD → QuantumLeap)

```d

cd ./examples

  curl -i -X POST   -H 'Content-Type: application/ld+json'   -H 'NGSILD-Tenant: default'   -H 'NGSILD-PATH: /'   --data @subscription-vehicleModel.json   http://localhost:1026/ngsi-ld/v1/subscriptions


  curl -i -X POST   -H 'Content-Type: application/ld+json'   -H 'NGSILD-Tenant: default'   -H 'NGSILD-PATH: /'   --data @subscription-vehicle.json   http://localhost:1026/ngsi-ld/v1/subscriptions

```

2. Create entities (VehicleModel first)

```d

curl -i -X POST   -H 'Content-Type: application/ld+json'   -H 'NGSILD-Tenant: default'   -H 'NGSILD-PATH: /'   --data @vehicleModel.json   http://localhost:1026/ngsi-ld/v1/entities


curl -i -X POST   -H 'Content-Type: application/ld+json'   -H 'NGSILD-Tenant: default'   -H 'NGSILD-PATH: /'   --data @vehicle.json   http://localhost:1026/ngsi-ld/v1/entities

```

3. Trigger one notification (PATCH Vehicle)

```

curl -i -X PATCH   -H 'Content-Type: application/json'   -H 'Link: <https://smart-data-models.github.io/dataModel.Transportation/context.jsonld>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"'   -H 'NGSILD-Tenant: default'   -H 'NGSILD-PATH: /'   --data '{
    "serviceStatus": {
      "type": "Property",
      "value": "moving"
    }
  }'   http://localhost:1026/ngsi-ld/v1/entities/urn:ngsi-ld:Vehicle:AB12345/attrs
```

**QuantumLeap query example**

```
curl 'http://localhost:8668/v2/entities/urn:ngsi-ld:Vehicle:AB12345/attrs/location?type=Vehicle' \
  -H 'fiware-service: default' \
  -H 'fiware-servicepath: /'

```

**Orion query example**

```

 curl 'http://localhost:1026/ngsi-ld/v1/entities/urn:ngsi-ld:Vehicle:AB12345' \
  -H 'NGSILD-Tenant: default'

```
