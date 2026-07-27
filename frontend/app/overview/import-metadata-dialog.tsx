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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ImportMetadataDialog({ open, onOpenChange }: Props) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const handleOpenChange = (next: boolean) => {
    if (!next) setSelectedFile(null)
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import metadata</DialogTitle>
          <DialogDescription>
            Upload a CSV to bulk-fill vehicle metadata for registered IMEIs.
          </DialogDescription>
        </DialogHeader>

        {selectedFile ? (
          <Attachment className="w-full">
            <AttachmentMedia>
              <FileText />
            </AttachmentMedia>
            <AttachmentContent>
              <AttachmentTitle>{selectedFile.name}</AttachmentTitle>
              <AttachmentDescription>Ready to load</AttachmentDescription>
            </AttachmentContent>
            <AttachmentActions>
              <AttachmentAction
                onClick={() => setSelectedFile(null)}
                aria-label="Remove file"
              >
                <X />
              </AttachmentAction>
            </AttachmentActions>
          </Attachment>
        ) : (
          <CsvDropzone
            title="Drop CSV here"
            description="Or browse for a file on your computer."
            onFile={setSelectedFile}
          />
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={!selectedFile}>
            Load data
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
