"use client"

import { useRef, useState, type ChangeEvent, type DragEvent } from "react"
import { AlertCircle, UploadCloud } from "lucide-react"

import { Alert, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { cn } from "@/lib/utils"

type Props = {
  title: string
  description: string
  error?: string | null
  onFile: (file: File) => void
}

function isCsvFile(file: File): boolean {
  return file.type === "text/csv" || file.name.toLowerCase().endsWith(".csv")
}

export function CsvDropzone({ title, description, error, onFile }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [typeError, setTypeError] = useState<string | null>(null)

  const acceptFile = (file: File) => {
    if (!isCsvFile(file)) {
      setTypeError("Only CSV files are supported")
      return
    }
    setTypeError(null)
    onFile(file)
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) acceptFile(file)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }
  const handleDragOver = (e: DragEvent) => {
    e.preventDefault()
  }
  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault()
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setIsDragging(false)
    }
  }
  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) acceptFile(file)
  }

  const message = typeError ?? error

  return (
    <>
      <Empty
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "border transition-colors",
          isDragging && "border-primary bg-muted/30"
        )}
      >
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UploadCloud />
          </EmptyMedia>
          <EmptyTitle className="text-base">{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
          >
            Browse files
          </Button>
        </EmptyContent>
      </Empty>
      {message && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>{message}</AlertTitle>
        </Alert>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        onChange={handleFileChange}
      />
    </>
  )
}
