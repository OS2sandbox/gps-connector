"use client"

import { useState } from "react"
import {
  AlertCircle,
  CircleAlert,
  CircleCheck,
  CircleX,
  FileText,
  X,
} from "lucide-react"

import { CsvDropzone } from "@/components/csv-dropzone"
import { Alert, AlertTitle } from "@/components/ui/alert"
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment"
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
import { patchDeviceMetadataBulk } from "@/lib/gps-client"
import { parseMetadataCsv, type MetadataRow } from "@/lib/metadata-csv"

const PREVIEW_LIMIT = 8

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  knownImeis: ReadonlySet<string>
  onImported: () => void
}

type Staged = {
  fileName: string
  rows: MetadataRow[]
}

function imeisPreview(imeis: string[]): string {
  const remaining = imeis.length - PREVIEW_LIMIT
  if (remaining < 3) return imeis.join(", ")
  return `${imeis.slice(0, PREVIEW_LIMIT).join(", ")} (+ ${remaining} more)`
}

export function ImportMetadataDialog({
  open,
  onOpenChange,
  knownImeis,
  onImported,
}: Props) {
  const [staged, setStaged] = useState<Staged | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const rows = staged?.rows ?? []
  const updatable = rows.filter((row) => row.status === "ok")
  const unknown = rows.filter((row) => row.status === "unknown")
  const invalid = rows.filter((row) => row.status === "invalid")

  const reset = () => {
    setStaged(null)
    setReadError(null)
    setSubmitError(null)
  }

  const handleOpenChange = (next: boolean) => {
    if (submitting) return
    if (!next) reset()
    onOpenChange(next)
  }

  const readFile = async (file: File) => {
    try {
      const text = await file.text()
      const parsed = parseMetadataCsv(text, knownImeis)
      if (parsed.columns.length > 0 && !parsed.columns.includes("imei")) {
        setReadError("The file has no imei column")
        return
      }
      if (parsed.rows.length === 0) {
        setReadError("No rows found in file")
        return
      }
      setStaged({ fileName: file.name, rows: parsed.rows })
    } catch {
      setReadError("Failed to read file")
    }
  }

  const handleFile = (file: File) => {
    setReadError(null)
    void readFile(file)
  }

  const handleSubmit = async () => {
    if (submitting || updatable.length === 0) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const response = await patchDeviceMetadataBulk(
        updatable.map((row) => ({ imei: row.imei, metadata: row.metadata }))
      )
      const failed = response.results.filter(
        (result) => result.status !== "updated"
      )
      if (failed.length > 0) {
        setSubmitError(
          `${failed.length} of ${updatable.length} rows could not be updated`
        )
        return
      }
      onImported()
      reset()
      onOpenChange(false)
    } catch {
      setSubmitError("Could not import metadata")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import metadata</DialogTitle>
          <DialogDescription>
            Upload a CSV with an <span className="font-mono">imei</span> column.
            Empty cells are left untouched.
          </DialogDescription>
        </DialogHeader>

        {staged ? (
          <>
            <Attachment className="w-full">
              <AttachmentMedia>
                <FileText />
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>{staged.fileName}</AttachmentTitle>
                <AttachmentDescription>
                  {rows.length} row{rows.length === 1 ? "" : "s"}
                </AttachmentDescription>
              </AttachmentContent>
              <AttachmentActions>
                <AttachmentAction onClick={reset} aria-label="Remove file">
                  <X />
                </AttachmentAction>
              </AttachmentActions>
            </Attachment>

            <ItemGroup>
              <Item variant="outline" size="sm">
                <ItemMedia variant="icon">
                  <CircleCheck className="text-success" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>
                    Will be updated
                    <Badge variant="secondary">{updatable.length}</Badge>
                  </ItemTitle>
                  {updatable.length > 0 && (
                    <ItemDescription className="line-clamp-none font-mono">
                      {imeisPreview(updatable.map((row) => row.imei))}
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
                    Not registered
                    <Badge variant="secondary">{unknown.length}</Badge>
                  </ItemTitle>
                  {unknown.length > 0 && (
                    <ItemDescription className="line-clamp-none font-mono">
                      {imeisPreview(unknown.map((row) => row.imei))}
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
                    <Badge variant="secondary">{invalid.length}</Badge>
                  </ItemTitle>
                  {invalid.length > 0 && (
                    <ItemDescription className="line-clamp-none font-mono">
                      {imeisPreview(invalid.map((row) => row.imei))}
                    </ItemDescription>
                  )}
                </ItemContent>
              </Item>
            </ItemGroup>
          </>
        ) : (
          <CsvDropzone
            title="Drop CSV here"
            description="One row per device, imei column required."
            error={readError}
            onFile={handleFile}
          />
        )}

        {submitError && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>{submitError}</AlertTitle>
          </Alert>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={updatable.length === 0 || submitting}
          >
            {submitting ? <Spinner data-icon="inline-start" /> : null}
            Update {updatable.length} device
            {updatable.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
