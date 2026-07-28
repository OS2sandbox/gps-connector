"use client"

import Link from "next/link"
import { ArrowRight, CircleCheck } from "lucide-react"

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
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import type { DeviceRecord } from "@/lib/devices-store"

type Props = {
  records: DeviceRecord[]
}

export function GeneratedSection({ records }: Props) {
  const okCount = records.length

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold">Registered devices</h2>
        {okCount > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">
            {okCount} device{okCount === 1 ? "" : "s"}
          </p>
        )}
      </div>
      {okCount > 0 ? (
        <>
          <ItemGroup className="gap-0">
            {records.map((record) => (
              <Item key={record.imei} variant="muted">
                <ItemMedia variant="icon" className="text-success">
                  <CircleCheck />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle className="font-mono">{record.imei}</ItemTitle>
                  <ItemDescription>
                    {record.gpsDevice ?? "Unknown device"}
                  </ItemDescription>
                </ItemContent>
              </Item>
            ))}
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
              <CircleCheck />
            </EmptyMedia>
            <EmptyTitle>No devices yet</EmptyTitle>
            <EmptyDescription>
              Register an IMEI above and it will show up here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </section>
  )
}
