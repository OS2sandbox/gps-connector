"use client"

import { useState, type ChangeEvent, type SubmitEvent } from "react"
import { format, parse } from "date-fns"
import { AlertCircle, CalendarIcon, Download } from "lucide-react"

import { Alert, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Item, ItemContent } from "@/components/ui/item"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import type { Vehicle } from "@/lib/vehicle"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  imei: string
  initial?: Vehicle
  onSave: (vehicle: Vehicle) => void | Promise<void>
}

const EMPTY_VEHICLE: Vehicle = {
  plate: "",
  id: "",
  make: "",
  model: "",
  vehicleType: "",
  fuelType: "",
  fuelUsage: "",
  capacity: "",
  cost: "",
  leasingEnd: "",
  location: "",
}

const DATE_FORMAT = "yyyy-MM-dd"

function parseDate(value: string): Date | undefined {
  if (!value) return undefined
  const parsed = parse(value, DATE_FORMAT, new Date())
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

export function AttachVehicleDialog({
  open,
  onOpenChange,
  imei,
  initial,
  onSave,
}: Props) {
  const [draft, setDraft] = useState<Vehicle>(initial ?? EMPTY_VEHICLE)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const update =
    (field: keyof Vehicle) => (e: ChangeEvent<HTMLInputElement>) => {
      setDraft((prev) => ({ ...prev, [field]: e.target.value }))
    }

  const canSave = draft.plate.trim().length > 0 && draft.id.trim().length > 0

  const handleSubmit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!canSave || saving) return
    const cleaned: Vehicle = {
      plate: draft.plate.trim(),
      id: draft.id.trim(),
      make: draft.make.trim(),
      model: draft.model.trim(),
      vehicleType: draft.vehicleType.trim(),
      fuelType: draft.fuelType.trim(),
      fuelUsage: draft.fuelUsage.trim(),
      capacity: draft.capacity.trim(),
      cost: draft.cost.trim(),
      leasingEnd: draft.leasingEnd.trim(),
      location: draft.location.trim(),
    }
    setSaving(true)
    setSaveError(null)
    try {
      await onSave(cleaned)
      onOpenChange(false)
    } catch {
      setSaveError("Could not save vehicle")
    } finally {
      setSaving(false)
    }
  }

  const selectedLeasingEnd = parseDate(draft.leasingEnd)

  const handleOpenChange = (next: boolean) => {
    if (saving) return
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Attach vehicle</DialogTitle>
          <DialogDescription>
            Link a vehicle to IMEI <span className="font-mono">{imei}</span>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <Item variant="muted">
            <ItemContent>
              <Field>
                <FieldLabel htmlFor="vehicle-import-plate">
                  Import data from license plate
                </FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id="vehicle-import-plate"
                    autoComplete="off"
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton variant="outline">
                      <Download data-icon="inline-start" />
                      Import
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </Field>
            </ItemContent>
          </Item>

          <FieldGroup className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="vehicle-plate">License plate</FieldLabel>
              <Input
                id="vehicle-plate"
                value={draft.plate}
                onChange={update("plate")}
                autoComplete="off"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="vehicle-id">Internal ID</FieldLabel>
              <Input
                id="vehicle-id"
                value={draft.id}
                onChange={update("id")}
                autoComplete="off"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="vehicle-make">Make</FieldLabel>
              <Input
                id="vehicle-make"
                value={draft.make}
                onChange={update("make")}
                autoComplete="off"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="vehicle-model">Model</FieldLabel>
              <Input
                id="vehicle-model"
                value={draft.model}
                onChange={update("model")}
                autoComplete="off"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="vehicle-type">Vehicle type</FieldLabel>
              <Input
                id="vehicle-type"
                value={draft.vehicleType}
                onChange={update("vehicleType")}
                autoComplete="off"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="vehicle-fuel-type">Fuel type</FieldLabel>
              <Input
                id="vehicle-fuel-type"
                value={draft.fuelType}
                onChange={update("fuelType")}
                autoComplete="off"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="vehicle-fuel-usage">
                Fuel usage (Wh/km or km/L)
              </FieldLabel>
              <Input
                id="vehicle-fuel-usage"
                type="number"
                inputMode="decimal"
                step="any"
                value={draft.fuelUsage}
                onChange={update("fuelUsage")}
                autoComplete="off"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="vehicle-capacity">
                Capacity (range, km)
              </FieldLabel>
              <Input
                id="vehicle-capacity"
                type="number"
                inputMode="numeric"
                step="1"
                value={draft.capacity}
                onChange={update("capacity")}
                autoComplete="off"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="vehicle-cost">Cost</FieldLabel>
              <Input
                id="vehicle-cost"
                type="number"
                inputMode="numeric"
                step="1"
                value={draft.cost}
                onChange={update("cost")}
                autoComplete="off"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="vehicle-leasing-end">
                Leasing end date
              </FieldLabel>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="vehicle-leasing-end"
                    type="button"
                    variant="outline"
                    data-empty={!selectedLeasingEnd}
                    className={cn(
                      "w-full justify-start text-left",
                      "data-[empty=true]:text-muted-foreground"
                    )}
                  >
                    <CalendarIcon data-icon="inline-start" />
                    {selectedLeasingEnd
                      ? format(selectedLeasingEnd, DATE_FORMAT)
                      : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={selectedLeasingEnd}
                    onSelect={(date) => {
                      setDraft((prev) => ({
                        ...prev,
                        leasingEnd: date ? format(date, DATE_FORMAT) : "",
                      }))
                      setCalendarOpen(false)
                    }}
                  />
                </PopoverContent>
              </Popover>
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="vehicle-location">
                Associated location
              </FieldLabel>
              <Input
                id="vehicle-location"
                value={draft.location}
                onChange={update("location")}
                autoComplete="off"
              />
            </Field>
          </FieldGroup>

          {saveError && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>{saveError}</AlertTitle>
            </Alert>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave || saving}>
              {saving ? <Spinner data-icon="inline-start" /> : null}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
