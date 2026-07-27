package orion

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

type Client struct {
	baseURL string
	client  *http.Client
}

func New(baseURL string) *Client {
	return &Client{
		baseURL: baseURL,
		client:  &http.Client{},
	}
}

type VehicleMetadata struct {
	Plate              string  `json:"plate,omitempty"`
	VehicleID          string  `json:"vehicle_id,omitempty"`
	Make               string  `json:"make,omitempty"`
	Model              string  `json:"model,omitempty"`
	Cost               int     `json:"cost,omitempty"`
	AssociatedLocation string  `json:"associated_location,omitempty"`
	FuelType           string  `json:"fuel_type,omitempty"`
	VehicleType        string  `json:"vehicle_type,omitempty"`
	FuelUsage          float64 `json:"fuel_usage,omitempty"`
	Capacity           int     `json:"capacity,omitempty"`
	LeasingEndDate     int64   `json:"leasing_end_date,omitempty"`
}

type Device struct {
	IMEI            string  `json:"imei"`
	Latitude        float64 `json:"latitude,omitempty"`
	Longitude       float64 `json:"longitude,omitempty"`
	Speed           float64 `json:"speed,omitempty"`
	DeviceTimestamp int64   `json:"device_timestamp,omitempty"`
	Ignition        int     `json:"ignition,omitempty"`
	Moving          int     `json:"moving,omitempty"`
	VehicleMetadata
}

func (c *Client) SubscriptionExists(tenant string) (bool, error) {
	id := fmt.Sprintf("urn:ngsi-ld:Subscription:GPSTracker:%s", tenant)
	url := fmt.Sprintf("%s/ngsi-ld/v1/subscriptions/%s", c.baseURL, id)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return false, err
	}
	req.Header.Set("NGSILD-Tenant", tenant)

	resp, err := c.client.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusOK:
		return true, nil
	case http.StatusNotFound:
		return false, nil
	default:
		return false, fmt.Errorf("unexpected status %d", resp.StatusCode)
	}
}

type entityFilter struct {
	Type string `json:"type"`
}
type notification struct {
	Format     string   `json:"format"`
	Attributes []string `json:"attributes"`
	Endpoint   endpoint `json:"endpoint"`
}
type endpoint struct {
	URI          string         `json:"uri"`
	Accept       string         `json:"accept"`
	ReceiverInfo []receiverInfo `json:"receiverInfo"`
}
type receiverInfo struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}
type subscription struct {
	ID                string         `json:"id"`
	Type              string         `json:"type"`
	Entities          []entityFilter `json:"entities"`
	WatchedAttributes []string       `json:"watchedAttributes"`
	Notification      notification   `json:"notification"`
	Context           string         `json:"@context"`
}

type entityStub struct {
	ID      string `json:"id"`
	Type    string `json:"type"`
	Context string `json:"@context"`
}

type orionEntity struct {
	ID              string  `json:"id"`
	Type            string  `json:"type"`
	Latitude        float64 `json:"latitude"`
	Longitude       float64 `json:"longitude"`
	Speed           float64 `json:"speed"`
	DeviceTimestamp int64   `json:"deviceTimestamp"`
	Ignition        int     `json:"ignition"`
	Moving          int     `json:"moving"`
	VehicleMetadata
}

func (c *Client) QueryDevices(tenant string) ([]Device, error) {
	url := fmt.Sprintf("%s/ngsi-ld/v1/entities?type=GPSTracker&options=keyValues", c.baseURL)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("NGSILD-Tenant", tenant)
	req.Header.Set("Accept", "application/json")

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusOK:
	case http.StatusNotFound:
		return []Device{}, nil
	default:
		return nil, fmt.Errorf("unexpected status %d", resp.StatusCode)
	}

	var entities []orionEntity
	if err := json.NewDecoder(resp.Body).Decode(&entities); err != nil {
		return nil, err
	}

	devices := make([]Device, 0, len(entities))
	for _, e := range entities {
		devices = append(devices, Device{
			IMEI:            strings.TrimPrefix(e.ID, "urn:ngsi-ld:GPSTracker:"),
			Latitude:        e.Latitude,
			Longitude:       e.Longitude,
			Speed:           e.Speed,
			DeviceTimestamp: e.DeviceTimestamp,
			Ignition:        e.Ignition,
			Moving:          e.Moving,
			VehicleMetadata: e.VehicleMetadata,
		})
	}
	return devices, nil
}

func (c *Client) CreateEntity(tenant, imei string) error {
	payload := entityStub{
		ID:      fmt.Sprintf("urn:ngsi-ld:GPSTracker:%s", imei),
		Type:    "GPSTracker",
		Context: "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
	}
	var buf bytes.Buffer
	if err := json.NewEncoder(&buf).Encode(payload); err != nil {
		return err
	}
	url := fmt.Sprintf("%s/ngsi-ld/v1/entities", c.baseURL)
	req, err := http.NewRequest("POST", url, &buf)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/ld+json")
	req.Header.Set("NGSILD-Tenant", tenant)

	resp, err := c.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusCreated, http.StatusConflict:
		return nil
	default:
		return fmt.Errorf("unexpected status %d", resp.StatusCode)
	}
}

func (c *Client) UpdateEntity(tenant, imei string, metadata VehicleMetadata) error {
	raw, err := json.Marshal(metadata)
	if err != nil {
		return err
	}
	var flat map[string]any
	if err := json.Unmarshal(raw, &flat); err != nil {
		return err
	}
	if len(flat) == 0 {
		return nil
	}

	wrapped := make(map[string]any, len(flat)+1)
	for k, v := range flat {
		wrapped[k] = map[string]any{"type": "Property", "value": v}
	}
	wrapped["@context"] = "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld"

	var buf bytes.Buffer
	if err := json.NewEncoder(&buf).Encode(wrapped); err != nil {
		return err
	}

	id := fmt.Sprintf("urn:ngsi-ld:GPSTracker:%s", imei)
	url := fmt.Sprintf("%s/ngsi-ld/v1/entities/%s/attrs", c.baseURL, id)
	req, err := http.NewRequest("POST", url, &buf)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/ld+json")
	req.Header.Set("NGSILD-Tenant", tenant)

	resp, err := c.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusNoContent, http.StatusCreated, http.StatusOK:
		return nil
	default:
		return fmt.Errorf("unexpected status %d", resp.StatusCode)
	}
}

func (c *Client) CreateSubscription(tenant string) error {
	attrs := []string{
		"latitude", "longitude", "speed", "heading", "deviceTimestamp", "ignition", "moving",
		"plate", "vehicle_id", "make", "model", "cost", "associated_location",
		"fuel_type", "vehicle_type", "fuel_usage", "capacity", "leasing_end_date",
	}
	payload := subscription{
		ID:                fmt.Sprintf("urn:ngsi-ld:Subscription:GPSTracker:%s", tenant),
		Type:              "Subscription",
		Entities:          []entityFilter{{Type: "GPSTracker"}},
		WatchedAttributes: attrs,
		Notification: notification{
			Format:     "normalized",
			Attributes: attrs,
			Endpoint: endpoint{
				URI:    "http://quantumleap:8668/v2/notify",
				Accept: "application/json",
				ReceiverInfo: []receiverInfo{
					{Key: "Fiware-Service", Value: tenant},
				},
			},
		},
		Context: "https://uri.etsi.org/ngsi-ld/v1/ngsi-ld-core-context.jsonld",
	}
	var buf bytes.Buffer
	if err := json.NewEncoder(&buf).Encode(payload); err != nil {
		return err
	}
	url := fmt.Sprintf("%s/ngsi-ld/v1/subscriptions", c.baseURL)
	req, err := http.NewRequest("POST", url, &buf)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/ld+json")
	req.Header.Set("NGSILD-Tenant", tenant)
	resp, err := c.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("unexpected status %d", resp.StatusCode)
	}
	return nil
}

func (c *Client) DeleteEntity(tenant, imei string) error {
	id := fmt.Sprintf("urn:ngsi-ld:GPSTracker:%s", imei)
	url := fmt.Sprintf("%s/ngsi-ld/v1/entities/%s", c.baseURL, id)
	req, err := http.NewRequest("DELETE", url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("NGSILD-Tenant", tenant)

	resp, err := c.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	switch resp.StatusCode {
	case http.StatusNoContent, http.StatusNotFound:
		return nil
	default:
		return fmt.Errorf("unexpected status %d", resp.StatusCode)
	}
}
