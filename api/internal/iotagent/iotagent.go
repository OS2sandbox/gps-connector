package iotagent

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
)

type Agent struct {
	baseURL string
	client  *http.Client
}

func New(baseURL string) *Agent {
	return &Agent{
		baseURL: baseURL,
		client:  &http.Client{},
	}
}

func (a *Agent) ServiceGroupExists(tenant, deviceType string) (bool, error) {
	url := fmt.Sprintf("%s/iot/services", a.baseURL)
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return false, err
	}
	req.Header.Set("Fiware-Service", tenant)
	req.Header.Set("Fiware-ServicePath", "/")

	resp, err := a.client.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return false, fmt.Errorf("unexpected status %d", resp.StatusCode)
	}

	var body struct {
		Services []struct {
			APIKey string `json:"apikey"`
		} `json:"services"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return false, err
	}

	target := fmt.Sprintf("%s-%s", tenant, deviceType)
	for _, s := range body.Services {
		if s.APIKey == target {
			return true, nil
		}
	}
	return false, nil
}

type serviceGroup struct {
	APIKey     string `json:"apikey"`
	CBroker    string `json:"cbroker"`
	Resource   string `json:"resource"`
	EntityType string `json:"entity_type"`
}

type createServiceGroupRequest struct {
	Services []serviceGroup `json:"services"`
}

func (a *Agent) CreateServiceGroup(tenant, deviceType string) error {
	payload := createServiceGroupRequest{
		Services: []serviceGroup{{
			APIKey:     fmt.Sprintf("%s-%s", tenant, deviceType),
			CBroker:    "http://orion:1026",
			Resource:   "/iot/json",
			EntityType: "GPSTracker",
		}},
	}
	var buf bytes.Buffer
	if err := json.NewEncoder(&buf).Encode(payload); err != nil {
		return err
	}

	url := fmt.Sprintf("%s/iot/services", a.baseURL)
	req, err := http.NewRequest("POST", url, &buf)
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Fiware-Service", tenant)
	req.Header.Set("Fiware-ServicePath", "/")

	resp, err := a.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("unexpected status %d", resp.StatusCode)
	}
	return nil
}

type iotAttribute struct {
	ObjectID string `json:"object_id"`
	Name     string `json:"name"`
	Type     string `json:"type"`
}

type iotStaticAttribute struct {
	Name  string `json:"name"`
	Type  string `json:"type"`
	Value string `json:"value"`
}

type iotDevice struct {
	DeviceID         string               `json:"device_id"`
	EntityName       string               `json:"entity_name"`
	EntityType       string               `json:"entity_type"`
	APIKey           string               `json:"apikey"`
	Transport        string               `json:"transport"`
	Attributes       []iotAttribute       `json:"attributes"`
	StaticAttributes []iotStaticAttribute `json:"static_attributes"`
}

type createDeviceIotRequest struct {
	Devices []iotDevice `json:"devices"`
}

func (a *Agent) CreateDevices(tenant, deviceType string, imeis []string) error {
	devices := make([]iotDevice, 0, len(imeis))
	for _, imei := range imeis {
		devices = append(devices, iotDevice{
			DeviceID:   imei,
			EntityName: fmt.Sprintf("urn:ngsi-ld:GPSTracker:%s", imei),
			EntityType: "GPSTracker",
			APIKey:     fmt.Sprintf("%s-%s", tenant, deviceType),
			Transport:  "AMQP",
			Attributes: []iotAttribute{
				{ObjectID: "lat", Name: "latitude", Type: "Number"},
				{ObjectID: "lon", Name: "longitude", Type: "Number"},
				{ObjectID: "spd", Name: "speed", Type: "Number"},
				{ObjectID: "ang", Name: "heading", Type: "Number"},
				{ObjectID: "ts", Name: "deviceTimestamp", Type: "Integer"},
				{ObjectID: "ignition", Name: "ignition", Type: "Integer"},
				{ObjectID: "moving", Name: "moving", Type: "Integer"},
			},
			StaticAttributes: []iotStaticAttribute{
				{Name: "deviceType", Type: "Text", Value: deviceType},
			},
		})
	}
	payload := createDeviceIotRequest{Devices: devices}

	var buf bytes.Buffer
	if err := json.NewEncoder(&buf).Encode(payload); err != nil {
		return err
	}
	url := fmt.Sprintf("%s/iot/devices", a.baseURL)
	req, err := http.NewRequest("POST", url, &buf)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Fiware-Service", tenant)
	req.Header.Set("Fiware-ServicePath", "/")

	resp, err := a.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusConflict {
		return fmt.Errorf("unexpected status %d", resp.StatusCode)
	}
	return nil
}

func (a *Agent) DeleteDevice(tenant, imei string) error {
	url := fmt.Sprintf("%s/iot/devices/%s", a.baseURL, imei)
	req, err := http.NewRequest("DELETE", url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Fiware-Service", tenant)
	req.Header.Set("Fiware-ServicePath", "/")

	resp, err := a.client.Do(req)
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
