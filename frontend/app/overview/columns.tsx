"use client"

import { type ColumnDef } from "@tanstack/react-table"
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { VehicleCell } from "@/components/vehicle-cell"
import { type DeviceRecord } from "@/lib/devices-store"

type ColumnHandlers = {
  onEditVehicle: (imei: string) => void
  onDelete: (imei: string) => void
}

export function buildColumns({
  onEditVehicle,
  onDelete,
}: ColumnHandlers): ColumnDef<DeviceRecord>[] {
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
      id: "plate",
      accessorFn: (row) => row.vehicle?.plate ?? "",
      header: "License plate",
      enableSorting: false,
      cell: ({ row }) =>
        row.original.vehicle?.plate ? (
          <span className="font-mono font-medium tracking-wide">
            {row.original.vehicle.plate}
          </span>
        ) : (
          <span className="text-muted-foreground">-</span>
        ),
    },
    {
      id: "vehicle",
      accessorFn: (row) =>
        `${row.vehicle?.make ?? ""} ${row.vehicle?.model ?? ""}`.trim(),
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
      id: "location",
      accessorFn: (row) => row.vehicle?.location ?? "",
      header: "Location",
      enableSorting: false,
      cell: ({ row }) => row.original.vehicle?.location || "-",
    },
    {
      id: "actions",
      enableHiding: false,
      enableSorting: false,
      enableGlobalFilter: false,
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        return (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Actions for ${row.original.imei}`}
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-auto">
                <DropdownMenuGroup>
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
