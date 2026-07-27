package device

import (
	"errors"
	"time"

	"os2/gps-connector/api/internal/orion"
)

type DeviceInput struct {
	IMEI       string `json:"imei"`
	DeviceType string `json:"device_type"`
}

func (d DeviceInput) validate() error {
	switch {
	case d.IMEI == "":
		return errors.New("imei is required")
	case len(d.IMEI) != 15:
		return errors.New("imei must be 15 digits")
	case d.DeviceType == "":
		return errors.New("device_type is required")
	}
	return nil
}

type Result struct {
	IMEI   string `json:"imei"`
	Status string `json:"status"`
	Error  string `json:"error,omitempty"`
}

type provisioning struct {
	ServiceGroupsCreated []string `json:"service_groups_created"`
	SubscriptionsCreated []string `json:"subscriptions_created"`
}

type createDevicesRequest struct {
	Devices []DeviceInput `json:"devices"`
}

type createDevicesResponse struct {
	Provisioned provisioning `json:"provisioned"`
	Results     []Result     `json:"results"`
}

type metadataUpdate struct {
	IMEI     string                `json:"imei"`
	Metadata orion.VehicleMetadata `json:"metadata"`
}

type updateDevicesRequest struct {
	Updates []metadataUpdate `json:"updates"`
}

type updateDevicesResponse struct {
	Results []Result `json:"results"`
}

type getDevicesResponse struct {
	Devices []orion.Device `json:"devices"`
}

type deleteDevicesRequest struct {
	IMEIs []string `json:"imeis"`
}

type deleteDevicesResponse struct {
	Results []Result `json:"results"`
}

type tenantCertInfo struct {
	Subject         string    `json:"subject"`
	Issuer          string    `json:"issuer"`
	Serial          string    `json:"serial"`
	NotBefore       time.Time `json:"not_before"`
	NotAfter        time.Time `json:"not_after"`
	DaysUntilExpiry int       `json:"days_until_expiry"`
	NeedsRotation   bool      `json:"needs_rotation"`
}

type serviceGroupKey struct{ Tenant, DeviceType string }
