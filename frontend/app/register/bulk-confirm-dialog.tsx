"use client"

import { AlertCircle, CircleAlert, CircleCheck, CircleX } from "lucide-react"

import { Alert, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"

export type ClassifiedBulk = {
  fileName: string
  newImeis: string[]
  alreadyRegistered: string[]
  invalid: { imei: string; reason: string }[]
}

const PREVIEW_LIMIT = 8

function imeisPreview(imeis: string[]): string {
  const remaining = imeis.length - PREVIEW_LIMIT
  if (remaining < 3) return imeis.join(", ")
  return `${imeis.slice(0, PREVIEW_LIMIT).join(", ")} (+ ${remaining} more)`
}

type Props = {
  open: boolean
  payload: ClassifiedBulk | null
  submitting: boolean
  error: string | null
  onConfirm: () => void
  onCancel: () => void
}

export function BulkConfirmDialog({
  open,
  payload,
  submitting,
  error,
  onConfirm,
  onCancel,
}: Props) {
  if (!payload) return null

  const newCount = payload.newImeis.length
  const skippedCount = payload.alreadyRegistered.length
  const invalidCount = payload.invalid.length
  const total = newCount + skippedCount + invalidCount

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting) return
        if (!next) onCancel()
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Review {total} IMEI{total === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>{payload.fileName}</DialogDescription>
        </DialogHeader>

        <ItemGroup>
          <Item variant="outline" size="sm">
            <ItemMedia variant="icon">
              <CircleCheck className="text-success" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>
                New
                <Badge variant="secondary">{newCount}</Badge>
              </ItemTitle>
              {newCount > 0 && (
                <ItemDescription className="line-clamp-none font-mono">
                  {imeisPreview(payload.newImeis)}
                </ItemDescription>
              )}
            </ItemContent>
          </Item>
          <Item variant="outline" size="sm">
            <ItemMedia variant="icon">
              <CircleAlert className="text-warning" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>
                Already in use or duplicated
                <Badge variant="secondary">{skippedCount}</Badge>
              </ItemTitle>
              {skippedCount > 0 && (
                <ItemDescription className="line-clamp-none font-mono">
                  {imeisPreview(payload.alreadyRegistered)}
                </ItemDescription>
              )}
            </ItemContent>
          </Item>
          <Item variant="outline" size="sm">
            <ItemMedia variant="icon">
              <CircleX className="text-destructive" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>
                Invalid
                <Badge variant="secondary">{invalidCount}</Badge>
              </ItemTitle>
              {invalidCount > 0 && (
                <ItemDescription className="line-clamp-none font-mono">
                  {imeisPreview(payload.invalid.map((row) => row.imei))}
                </ItemDescription>
              )}
            </ItemContent>
          </Item>
        </ItemGroup>

        {error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>{error}</AlertTitle>
          </Alert>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={submitting || newCount === 0}>
            {submitting ? <Spinner data-icon="inline-start" /> : null}
            Register {newCount}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
