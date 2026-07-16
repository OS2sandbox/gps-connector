"use client"

import Link from "next/link"
import { AlertCircle, ArrowRight, Download, ShieldCheck } from "lucide-react"

import { Alert, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import type { DeviceRecord } from "@/lib/devices-store"

type Props = {
  records: DeviceRecord[]
  actionError: string | null
  downloadingImeis: Set<string>
  isDownloadingAll: boolean
  onDownloadAll: () => void
  onDownloadCertificate: (record: DeviceRecord) => void
}

export function GeneratedSection({
  records,
  actionError,
  downloadingImeis,
  isDownloadingAll,
  onDownloadAll,
  onDownloadCertificate,
}: Props) {
  const okCount = records.length

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Generated certificates</h2>
          {okCount > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              {okCount} certificate{okCount === 1 ? "" : "s"}
            </p>
          )}
        </div>
        {okCount > 0 && (
          <Button onClick={onDownloadAll} disabled={isDownloadingAll}>
            {isDownloadingAll ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Download data-icon="inline-start" />
            )}
            Download certificates
          </Button>
        )}
      </div>
      {actionError && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>{actionError}</AlertTitle>
        </Alert>
      )}
      {okCount > 0 ? (
        <>
          <ItemGroup className="gap-0">
            {records.map((record) => {
              const busy = downloadingImeis.has(record.imei)
              return (
                <Item key={record.imei} variant="muted">
                  <ItemMedia variant="icon" className="text-success">
                    <ShieldCheck />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle className="font-mono">{record.imei}</ItemTitle>
                    <ItemDescription>
                      {record.gpsDevice ?? "Unknown device"}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onDownloadCertificate(record)}
                      disabled={busy || !record.certificateDownload}
                    >
                      {busy ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <Download data-icon="inline-start" />
                      )}
                      Download
                    </Button>
                  </ItemActions>
                </Item>
              )
            })}
          </ItemGroup>
          <Button asChild variant="link" className="self-start px-0">
            <Link href="/overview">
              Manage devices in overview
              <ArrowRight data-icon="inline-end" />
            </Link>
          </Button>
        </>
      ) : (
        <Empty className="border border-solid">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldCheck />
            </EmptyMedia>
            <EmptyTitle>No certificates yet</EmptyTitle>
            <EmptyDescription>
              Generate one above and it will show up here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </section>
  )
}
