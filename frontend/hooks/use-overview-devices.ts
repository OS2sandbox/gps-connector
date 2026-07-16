"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { getDevices, type Device } from "@/lib/gps-client"
import type { DeviceRecord } from "@/lib/devices-store"
import { unixToDateInput, type Vehicle } from "@/lib/vehicle"

function deviceHasVehicleData(device: Device): boolean {
  return (
    Boolean(
      device.plate ||
      device.vehicle_id ||
      device.make ||
      device.model ||
      device.vehicle_type ||
      device.fuel_type ||
      device.associated_location
    ) ||
    device.fuel_usage != null ||
    device.capacity != null ||
    device.cost != null ||
    device.leasing_end_date != null
  )
}

function deviceToRecord(device: Device): DeviceRecord {
  let vehicle: Vehicle | undefined
  if (deviceHasVehicleData(device)) {
    vehicle = {
      plate: device.plate ?? "",
      id: device.vehicle_id ?? "",
      make: device.make ?? "",
      model: device.model ?? "",
      vehicleType: device.vehicle_type ?? "",
      fuelType: device.fuel_type ?? "",
      fuelUsage: device.fuel_usage?.toString() ?? "",
      capacity: device.capacity?.toString() ?? "",
      cost: device.cost?.toString() ?? "",
      leasingEnd: device.leasing_end_date
        ? unixToDateInput(device.leasing_end_date)
        : "",
      location: device.associated_location ?? "",
    }
  }
  return {
    imei: device.imei,
    gpsDevice: device.device_type ?? null,
    certificateDownload: null,
    vehicle,
  }
}

type State = {
  records: DeviceRecord[]
  loading: boolean
  error: string | null
}

export function useOverviewDevices() {
  const [state, setState] = useState<State>({
    records: [],
    loading: true,
    error: null,
  })
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(() => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setState((prev) => ({ ...prev, loading: true }))
    getDevices(controller.signal)
      .then((devices) => {
        if (controller.signal.aborted) return
        setState({
          records: devices.map(deviceToRecord),
          loading: false,
          error: null,
        })
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setState((prev) => ({
          ...prev,
          loading: false,
          error: "Could not load devices",
        }))
      })
  }, [])

  useEffect(() => {
    load()
    return () => abortRef.current?.abort()
  }, [load])

  const updateRecord = (
    imei: string,
    updater: (record: DeviceRecord) => DeviceRecord
  ) => {
    setState((prev) => ({
      ...prev,
      records: prev.records.map((record) =>
        record.imei === imei ? updater(record) : record
      ),
    }))
  }

  const removeRecord = (imei: string) => {
    setState((prev) => ({
      ...prev,
      records: prev.records.filter((record) => record.imei !== imei),
    }))
  }

  return {
    records: state.records,
    loading: state.loading,
    error: state.error,
    refresh: load,
    updateRecord,
    removeRecord,
  }
}
