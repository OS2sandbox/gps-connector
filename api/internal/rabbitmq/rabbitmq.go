package rabbitmq

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
)

// Client talks to the RabbitMQ HTTP management API.
// Used to provision/revoke per-device MQTT users.
type Client struct {
	baseURL string
	user    string
	pass    string
	client  *http.Client
}

func New(baseURL, user, pass string) *Client {
	return &Client{baseURL: baseURL, user: user, pass: pass, client: &http.Client{}}
}

// CreateDeviceUser provisions a user named after the IMEI with topic-permission
// scoped to that IMEI's MQTT topic. Idempotent — PUT overwrites existing users.
func (c *Client) CreateDeviceUser(ctx context.Context, imei string) error {
	if err := c.putUser(ctx, imei); err != nil {
		return fmt.Errorf("put user: %w", err)
	}
	if err := c.putPermissions(ctx, imei); err != nil {
		return fmt.Errorf("put permissions: %w", err)
	}
	if err := c.putTopicPermissions(ctx, imei); err != nil {
		return fmt.Errorf("put topic permissions: %w", err)
	}
	return nil
}

// DeleteDeviceUser removes the user (and its permissions, cascaded by RabbitMQ).
// Idempotent — 404 is treated as success.
func (c *Client) DeleteDeviceUser(ctx context.Context, imei string) error {
	endpoint := fmt.Sprintf("%s/api/users/%s", c.baseURL, url.PathEscape(imei))
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, endpoint, nil)
	if err != nil {
		return err
	}
	req.SetBasicAuth(c.user, c.pass)

	resp, err := c.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusNotFound {
		return fmt.Errorf("unexpected status %d", resp.StatusCode)
	}
	return nil
}

func (c *Client) putUser(ctx context.Context, imei string) error {
	// Random unguessable password — never used (auth is via cert/EXTERNAL).
	// We can't use empty password_hash because RabbitMQ versions vary on whether
	// that creates a valid record; a long random string is uniformly accepted.
	pw := randomHex(32)
	body := map[string]string{"password": pw, "tags": ""}
	return c.putJSON(ctx, "/api/users/"+url.PathEscape(imei), body)
}

func (c *Client) putPermissions(ctx context.Context, imei string) error {
	body := map[string]string{"configure": ".*", "write": ".*", "read": ".*"}
	return c.putJSON(ctx, "/api/permissions/%2F/"+url.PathEscape(imei), body)
}

func (c *Client) putTopicPermissions(ctx context.Context, imei string) error {
	pattern := fmt.Sprintf("^teltonika\\.%s\\.data$", regexp.QuoteMeta(imei))
	body := map[string]string{
		"exchange": "amq.topic",
		"write":    pattern,
		"read":     ".*",
	}
	return c.putJSON(ctx, "/api/topic-permissions/%2F/"+url.PathEscape(imei), body)
}

func (c *Client) putJSON(ctx context.Context, path string, body any) error {
	var buf bytes.Buffer
	if err := json.NewEncoder(&buf).Encode(body); err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, c.baseURL+path, &buf)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.SetBasicAuth(c.user, c.pass)

	resp, err := c.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	switch resp.StatusCode {
	case http.StatusCreated, http.StatusNoContent:
		return nil
	default:
		return fmt.Errorf("unexpected status %d for %s", resp.StatusCode, path)
	}
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
