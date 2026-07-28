"use client"

import { useState } from "react"
import {
  AlertCircle,
  ChevronDown,
  Download,
  RefreshCw,
  ShieldCheck,
} from "lucide-react"

import { CertificateStatusBadge } from "@/components/certificate-status-badge"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import { usePrivileges } from "@/hooks/use-privileges"
import { useTenantCertificate } from "@/hooks/use-tenant-certificate"
import {
  downloadRotatedTenantCertificate,
  downloadTenantCertificate,
} from "@/lib/certificate-download"

export function TenantCertificateCard() {
  const { data: certificate, error, loaded, refresh } = useTenantCertificate()
  const { isAdmin } = usePrivileges()
  const [open, setOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [rotateOpen, setRotateOpen] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const busy = downloading || rotating

  const handleDownload = async () => {
    if (busy) return
    setDownloading(true)
    setActionError(null)
    try {
      await downloadTenantCertificate()
      refresh()
    } catch {
      setActionError("Could not download certificate")
    } finally {
      setDownloading(false)
    }
  }

  const handleRotate = async () => {
    if (rotating) return
    setRotating(true)
    setActionError(null)
    try {
      await downloadRotatedTenantCertificate()
      refresh()
      setRotateOpen(false)
    } catch {
      setActionError("Could not rotate certificate")
    } finally {
      setRotating(false)
    }
  }

  const missingDescription = isAdmin
    ? "No certificate issued yet — download one to set up your devices."
    : "No certificate issued yet. Ask an administrator to issue one."

  const description = certificate
    ? `Current certificate for your organisation. Expires ${certificate.not_after.slice(0, 10)}.`
    : loaded
      ? missingDescription
      : "Loading certificate…"

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="group flex flex-col gap-3"
    >
      {(actionError ?? error) && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>{actionError ?? error}</AlertTitle>
        </Alert>
      )}

      <div className="rounded-2xl bg-muted/50">
        <CollapsibleTrigger asChild>
          <Item variant="default" className="cursor-pointer text-left">
            <ItemMedia variant="icon">
              <ShieldCheck />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>
                Device certificate
                <CertificateStatusBadge tenantCertificate={certificate} />
              </ItemTitle>
            </ItemContent>
            <ItemActions>
              <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            </ItemActions>
          </Item>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <Item variant="default" className="pt-0">
            <ItemContent>
              <ItemDescription>{description}</ItemDescription>
            </ItemContent>
            {isAdmin && (
              <ItemActions>
                {certificate && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRotateOpen(true)}
                    disabled={busy}
                  >
                    <RefreshCw data-icon="inline-start" />
                    Rotate
                  </Button>
                )}
                <Button size="sm" onClick={handleDownload} disabled={busy}>
                  {downloading ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Download data-icon="inline-start" />
                  )}
                  Download
                </Button>
              </ItemActions>
            )}
          </Item>
        </CollapsibleContent>
      </div>

      <ConfirmDialog
        open={rotateOpen}
        onOpenChange={(open) => {
          if (!open) setRotateOpen(false)
        }}
        title="Rotate the certificate?"
        description="A new certificate is issued and downloaded. Every device must be re-flashed with it — the current one keeps working until it expires."
        confirmLabel="Rotate"
        destructive
        busy={rotating}
        onConfirm={handleRotate}
      />
    </Collapsible>
  )
}
