"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { AlertCircle, Table as TableIcon, Upload } from "lucide-react"

import { ConfirmDialog } from "@/components/confirm-dialog"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/ui/data-table"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import { useOverviewDevices } from "@/hooks/use-overview-devices"
import { deleteDevices, patchDeviceMetadata } from "@/lib/gps-client"
import { vehicleToMetadata } from "@/lib/vehicle"
import { AttachVehicleDialog } from "@/app/register/attach-vehicle-dialog"
import { buildColumns } from "./columns"
import { ImportMetadataDialog } from "./import-metadata-dialog"

type ActionState = { imei: string | null; busy: boolean }

const IDLE: ActionState = { imei: null, busy: false }

export function OverviewTable() {
  const { records, loading, error, refresh, updateRecord, removeRecord } =
    useOverviewDevices()

  const [deletion, setDeletion] = useState<ActionState>(IDLE)
  const [attachTarget, setAttachTarget] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const handleDeleteConfirm = async () => {
    if (!deletion.imei) return
    const imei = deletion.imei
    setDeletion({ imei, busy: true })
    setActionError(null)
    try {
      const response = await deleteDevices([imei])
      const result = response.results.find((result) => result.imei === imei)
      if (result?.status === "error") {
        throw new Error(result.error ?? "Delete failed")
      }
      removeRecord(imei)
      setDeletion(IDLE)
    } catch {
      setDeletion({ imei, busy: false })
      setActionError("Could not delete device")
    }
  }

  const columns = useMemo(
    () =>
      buildColumns({
        onEditVehicle: setAttachTarget,
        onDelete: (imei) => setDeletion({ imei, busy: false }),
      }),
    []
  )

  const knownImeis = useMemo(
    () => new Set(records.map((record) => record.imei)),
    [records]
  )

  const targetVehicle = attachTarget
    ? records.find((record) => record.imei === attachTarget)?.vehicle
    : undefined

  if (loading) {
    return (
      <Empty className="border border-solid">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Spinner className="size-6" />
          </EmptyMedia>
          <EmptyTitle>Loading devices</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  }

  if (error) {
    return (
      <Empty className="border border-solid">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <AlertCircle />
          </EmptyMedia>
          <EmptyTitle>{error}</EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" onClick={refresh}>
            Try again
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  if (records.length === 0) {
    return (
      <Empty className="border border-solid">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TableIcon />
          </EmptyMedia>
          <EmptyTitle>No devices yet</EmptyTitle>
          <EmptyDescription>Register IMEIs to see them here.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link href="/register">Go to Register</Link>
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {actionError && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>{actionError}</AlertTitle>
        </Alert>
      )}
      <DataTable
        columns={columns}
        data={records}
        toolbar={
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload data-icon="inline-start" />
            Import metadata
          </Button>
        }
      />

      <ImportMetadataDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        knownImeis={knownImeis}
        onImported={refresh}
      />

      {attachTarget !== null && (
        <AttachVehicleDialog
          key={attachTarget}
          open
          onOpenChange={(open) => {
            if (!open) setAttachTarget(null)
          }}
          imei={attachTarget}
          initial={targetVehicle}
          onSave={async (vehicle) => {
            const response = await patchDeviceMetadata(
              attachTarget,
              vehicleToMetadata(vehicle)
            )
            const result = response.results.find(
              (result) => result.imei === attachTarget
            )
            if (result?.status === "error") {
              throw new Error(result.error ?? "Update failed")
            }
            updateRecord(attachTarget, (record) => ({ ...record, vehicle }))
          }}
        />
      )}

      <ConfirmDialog
        open={deletion.imei !== null}
        onOpenChange={(open) => {
          if (!open) setDeletion(IDLE)
        }}
        title="Delete this device?"
        description={
          <>
            IMEI <span className="font-mono">{deletion.imei}</span> and its
            certificate will be removed. This action cannot be undone.
          </>
        }
        confirmLabel="Delete"
        destructive
        busy={deletion.busy}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  )
}
