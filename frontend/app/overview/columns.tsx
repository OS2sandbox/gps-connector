"use client"

import { type ColumnDef } from "@tanstack/react-table"
import { Download, MoreHorizontal, Pencil, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import { CertificateStatusBadge } from "@/components/certificate-status-badge"
import { VehicleCell } from "@/components/vehicle-cell"
import { type DeviceRecord } from "@/lib/devices-store"
import type { TenantCertificate } from "@/lib/gps-client"

type ColumnHandlers = {
  tenantCertificate: TenantCertificate | null
  downloadingImeis: Set<string>
  onDownloadCertificate: (record: DeviceRecord) => void
  onEditVehicle: (imei: string) => void
  onDelete: (imei: string) => void
}

export function buildColumns({
  tenantCertificate,
  downloadingImeis,
  onDownloadCertificate,
  onEditVehicle,
  onDelete,
}: ColumnHandlers): ColumnDef<DeviceRecord>[] {
  const expiresValue = tenantCertificate?.not_after.slice(0, 10) ?? "-"
  return [
    {
      accessorKey: "gpsDevice",
      header: "Device",
      cell: ({ row }) => row.original.gpsDevice ?? "-",
    },
    {
      accessorKey: "imei",
      header: "IMEI",
      enableHiding: false,
      enableSorting: false,
      cell: ({ row }) => <span className="font-mono">{row.original.imei}</span>,
    },
    {
      id: "status",
      header: "Status",
      enableSorting: false,
      cell: () => (
        <CertificateStatusBadge tenantCertificate={tenantCertificate} />
      ),
    },
    {
      id: "expires",
      header: "Expires",
      enableSorting: false,
      cell: () => (
        <span className="font-mono text-muted-foreground">{expiresValue}</span>
      ),
    },
    {
      id: "vehicle",
      accessorFn: (row) =>
        `${row.vehicle?.plate ?? ""} ${row.vehicle?.make ?? ""} ${row.vehicle?.model ?? ""}`.trim(),
      header: "Vehicle",
      enableSorting: false,
      cell: ({ row }) => (
        <VehicleCell
          vehicle={row.original.vehicle}
          onAttach={() => onEditVehicle(row.original.imei)}
        />
      ),
    },
    {
      id: "actions",
      enableHiding: false,
      enableSorting: false,
      enableGlobalFilter: false,
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const isDownloading = downloadingImeis.has(row.original.imei)
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Actions for ${row.original.imei}`}
                  disabled={isDownloading}
                >
                  {isDownloading ? <Spinner /> : <MoreHorizontal />}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    disabled={!row.original.certificateDownload}
                    onSelect={() => onDownloadCertificate(row.original)}
                  >
                    <Download data-icon="inline-start" />
                    Download certificate
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => onEditVehicle(row.original.imei)}
                  >
                    <Pencil data-icon="inline-start" />
                    Edit vehicle
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => onDelete(row.original.imei)}
                  >
                    <Trash2 data-icon="inline-start" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  ]
}
