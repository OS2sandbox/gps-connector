"use client"

import { useState } from "react"

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useTenantImeis } from "@/hooks/use-tenant-imeis"
import { GPS_DEVICES, type GpsDevice } from "@/lib/devices"
import { type DeviceRecord } from "@/lib/devices-store"
import { postDevices } from "@/lib/gps-client"
import type { ClassifiedBulk } from "./bulk-confirm-dialog"
import { BulkImeiTab, type BulkSubmitResult } from "./bulk-imei-tab"
import { GeneratedSection } from "./generated-section"
import { ManualImeiTab, type ManualSubmitResult } from "./manual-imei-tab"

export function RegisterForm() {
  const tenant = useTenantImeis()

  const [records, setRecords] = useState<DeviceRecord[]>([])
  const addRecords = (newRecords: DeviceRecord[]) => {
    if (newRecords.length === 0) return
    setRecords((prev) => [...prev, ...newRecords])
  }

  const [selectedDevice, setSelectedDevice] = useState<GpsDevice | "">("")
  const [deviceMissing, setDeviceMissing] = useState(false)

  const requireDevice = () => {
    if (selectedDevice) return true
    setDeviceMissing(true)
    return false
  }

  const submitManual = async (imei: string): Promise<ManualSubmitResult> => {
    if (!selectedDevice) {
      return { ok: false, error: "Select a GPS device first" }
    }
    if (tenant.imeis.has(imei)) {
      return { ok: false, error: "Already registered" }
    }
    try {
      const response = await postDevices([
        { imei, device_type: selectedDevice },
      ])
      const result = response.results.find((result) => result.imei === imei)
      if (!result) {
        return { ok: false, error: "Registration failed" }
      }
      if (result.status === "created") {
        addRecords([{ imei, gpsDevice: selectedDevice }])
        tenant.markRegistered([imei])
        return { ok: true }
      }
      if (result.status === "already_registered") {
        return { ok: false, error: "Already registered with this tenant" }
      }
      return { ok: false, error: "Registration failed" }
    } catch {
      return { ok: false, error: "Registration failed" }
    }
  }

  const submitBulk = async (
    payload: ClassifiedBulk
  ): Promise<BulkSubmitResult> => {
    if (!selectedDevice) {
      return { status: "failed", error: "Select a GPS device first" }
    }

    try {
      const response = await postDevices(
        payload.newImeis.map((imei) => ({ imei, device_type: selectedDevice }))
      )
      const newRecords: DeviceRecord[] = []
      const alreadyRegisteredImeis: string[] = []
      const failedImeis: string[] = []
      for (const result of response.results) {
        if (result.status === "created") {
          newRecords.push({ imei: result.imei, gpsDevice: selectedDevice })
        } else if (result.status === "already_registered") {
          alreadyRegisteredImeis.push(result.imei)
        } else {
          failedImeis.push(result.imei)
        }
      }
      addRecords(newRecords)
      tenant.markRegistered([
        ...newRecords.map((record) => record.imei),
        ...alreadyRegisteredImeis,
      ])
      if (failedImeis.length === 0 && alreadyRegisteredImeis.length === 0) {
        return { status: "registered" }
      }
      return { status: "partial", failedImeis, alreadyRegisteredImeis }
    } catch {
      return { status: "failed", error: "Registration failed" }
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <Field className="max-w-2xl" data-invalid={deviceMissing || undefined}>
        <FieldLabel htmlFor="gps-device">GPS device</FieldLabel>
        <Select
          value={selectedDevice}
          onValueChange={(value) => {
            setSelectedDevice(value as GpsDevice)
            setDeviceMissing(false)
          }}
        >
          <SelectTrigger
            id="gps-device"
            aria-invalid={deviceMissing || undefined}
            className="w-full sm:max-w-sm"
          >
            <SelectValue placeholder="Select device" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {GPS_DEVICES.map((device) => (
                <SelectItem key={device} value={device}>
                  {device}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {deviceMissing ? (
          <FieldError>Select a GPS device</FieldError>
        ) : (
          <FieldDescription>
            Applied to every IMEI generated below.
          </FieldDescription>
        )}
      </Field>

      <Tabs defaultValue="single" className="max-w-2xl">
        <TabsList>
          <TabsTrigger value="single">Single IMEI</TabsTrigger>
          <TabsTrigger value="bulk">Upload CSV</TabsTrigger>
        </TabsList>
        <TabsContent
          value="single"
          forceMount
          className="data-[state=inactive]:hidden"
        >
          <ManualImeiTab
            requireDevice={requireDevice}
            onSubmit={submitManual}
          />
        </TabsContent>
        <TabsContent
          value="bulk"
          forceMount
          className="data-[state=inactive]:hidden"
        >
          <BulkImeiTab
            tenantImeis={tenant.imeis}
            requireDevice={requireDevice}
            onSubmit={submitBulk}
          />
        </TabsContent>
      </Tabs>

      <Separator />

      <GeneratedSection records={records} />
    </div>
  )
}
