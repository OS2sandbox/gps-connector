"use client"

import { useState } from "react"
import { FileText, X } from "lucide-react"

import { CsvDropzone } from "@/components/csv-dropzone"
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment"
import { Button } from "@/components/ui/button"
import { parseImeis, type ParsedRow } from "@/lib/imei"
import { BulkConfirmDialog, type ClassifiedBulk } from "./bulk-confirm-dialog"

export type BulkSubmitResult =
  | { status: "registered" }
  | { status: "failed"; error: string }
  | {
      status: "partial"
      failedImeis: string[]
      alreadyRegisteredImeis: string[]
    }

type Props = {
  tenantImeis: ReadonlySet<string>
  requireDevice: () => boolean
  onSubmit: (payload: ClassifiedBulk) => Promise<BulkSubmitResult>
}

type StagedFile = {
  fileName: string
  rows: ParsedRow[]
}

function classify(
  fileName: string,
  parsed: ParsedRow[],
  tenantImeis: ReadonlySet<string>
): ClassifiedBulk {
  const newImeis: string[] = []
  const alreadyRegistered: string[] = []
  const invalid: { imei: string; reason: string }[] = []
  for (const row of parsed) {
    if (row.status === "invalid") {
      invalid.push({ imei: row.raw, reason: row.reason })
    } else if (row.status === "duplicate" || tenantImeis.has(row.raw)) {
      alreadyRegistered.push(row.raw)
    } else {
      newImeis.push(row.raw)
    }
  }
  return { fileName, newImeis, alreadyRegistered, invalid }
}

function classificationSummary(payload: ClassifiedBulk): string {
  const parts = [`${payload.newImeis.length} new`]
  if (payload.alreadyRegistered.length > 0) {
    parts.push(`${payload.alreadyRegistered.length} already registered`)
  }
  if (payload.invalid.length > 0) {
    parts.push(`${payload.invalid.length} invalid`)
  }
  return parts.join(", ")
}

function partialSummary(
  attempted: number,
  result: { failedImeis: string[]; alreadyRegisteredImeis: string[] }
): string {
  const registered =
    attempted - result.failedImeis.length - result.alreadyRegisteredImeis.length
  const parts = [`${registered} of ${attempted} registered`]
  if (result.alreadyRegisteredImeis.length > 0) {
    parts.push(`${result.alreadyRegisteredImeis.length} already registered`)
  }
  if (result.failedImeis.length > 0) {
    parts.push(`${result.failedImeis.length} failed`)
  }
  return parts.join(", ")
}

export function BulkImeiTab({ tenantImeis, requireDevice, onSubmit }: Props) {
  const [staged, setStaged] = useState<StagedFile | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [readError, setReadError] = useState<string | null>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)

  const payload = staged
    ? classify(staged.fileName, staged.rows, tenantImeis)
    : null

  const readFile = async (file: File) => {
    try {
      const text = await file.text()
      const parsed = parseImeis(text)
      if (parsed.length === 0) {
        setReadError("No IMEIs found in file")
        return
      }
      setStaged({ fileName: file.name, rows: parsed })
    } catch {
      setReadError("Failed to read file")
    }
  }

  const handleFile = (file: File) => {
    setReadError(null)
    void readFile(file)
  }

  const handleReview = () => {
    if (!requireDevice()) return
    setDialogError(null)
    setReviewOpen(true)
  }

  const handleConfirm = async () => {
    if (!payload || submitting) return
    setSubmitting(true)
    setDialogError(null)
    const result = await onSubmit(payload)
    setSubmitting(false)
    if (result.status === "registered") {
      setReviewOpen(false)
      setStaged(null)
      return
    }
    if (result.status === "failed") {
      setDialogError(result.error)
      return
    }
    setDialogError(partialSummary(payload.newImeis.length, result))
  }

  const handleCancel = () => {
    if (submitting) return
    setReviewOpen(false)
    setDialogError(null)
  }

  return (
    <div className="flex flex-col gap-3">
      {payload ? (
        <>
          <Attachment className="w-full">
            <AttachmentMedia>
              <FileText />
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>{payload.fileName}</AttachmentTitle>
              <AttachmentDescription>
                {classificationSummary(payload)}
              </AttachmentDescription>
            </AttachmentContent>
            <AttachmentActions>
              <AttachmentAction
                onClick={() => setStaged(null)}
                aria-label="Remove file"
              >
                <X />
              </AttachmentAction>
            </AttachmentActions>
          </Attachment>
          <Button onClick={handleReview} className="self-start">
            Review and register
          </Button>
        </>
      ) : (
        <CsvDropzone
          title="Drop CSV here"
          description="IMEIs, one per row."
          error={readError}
          onFile={handleFile}
        />
      )}

      <BulkConfirmDialog
        open={reviewOpen}
        payload={payload}
        submitting={submitting}
        error={dialogError}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </div>
  )
}
