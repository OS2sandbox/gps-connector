package export

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"time"

	"github.com/minio/minio-go/v7"

	"os2/gps-connector/api/internal/redis"
)

const jobTTL = 24 * time.Hour

type job struct {
	ID        string    `json:"id"`
	Tenant    string    `json:"tenant"`
	Status    string    `json:"status"` // pending, running, ready, error
	CreatedAt time.Time `json:"created_at"`
	ExpiresAt time.Time `json:"expires_at"`
	From      time.Time `json:"from"`
	To        time.Time `json:"to"`
	DeviceID  string    `json:"device_id,omitempty"`
	ResultKey string    `json:"result_key,omitempty"`
	Error     string    `json:"error,omitempty"`
	RowCount  int64     `json:"row_count,omitempty"`
}

func generateJobID() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return hex.EncodeToString(b[:]), nil
}

func jobKey(tenant, id string) string {
	return fmt.Sprintf("export:%s:%s", tenant, id)
}

func saveJob(ctx context.Context, rdb *redis.Client, j *job) error {
	data, err := json.Marshal(j)
	if err != nil {
		return err
	}
	ttl := time.Until(j.ExpiresAt)
	if ttl <= 0 {
		ttl = time.Second
	}
	return rdb.Set(ctx, jobKey(j.Tenant, j.ID), data, ttl).Err()
}

func getJob(ctx context.Context, rdb *redis.Client, tenant, id string) (*job, error) {
	data, err := rdb.Get(ctx, jobKey(tenant, id)).Result()
	if errors.Is(err, redis.Nil) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var j job
	if err := json.Unmarshal([]byte(data), &j); err != nil {
		return nil, err
	}
	return &j, nil
}

// runJob executes the export and uploads the resulting CSV to MinIO.
// Updates job status in Redis at each transition.
// Spawned as a goroutine; uses context.Background() since it outlives the request.
func runJob(store *Store, rdb *redis.Client, j job) {
	ctx := context.Background()

	j.Status = "running"
	if err := saveJob(ctx, rdb, &j); err != nil {
		log.Printf("export %s: failed to mark running: %v", j.ID, err)
		return
	}

	resultKey := fmt.Sprintf("exports/%s/%s.csv", j.Tenant, j.ID)

	// io.Pipe connects the CSV writer (one goroutine) to the MinIO uploader (this goroutine).
	// Bytes flow through without buffering the whole CSV in memory.
	pr, pw := io.Pipe()
	rowCh := make(chan int64, 1)

	go func() {
		n, err := store.writeCSV(ctx, pw, j.Tenant, j.From, j.To, j.DeviceID)
		if err != nil {
			pw.CloseWithError(err)
			rowCh <- -1
			return
		}
		pw.Close()
		rowCh <- n
	}()

	_, putErr := store.client.PutObject(ctx, store.bucket, resultKey, pr, -1, minio.PutObjectOptions{
		ContentType: "text/csv",
	})
	rowsWritten := <-rowCh

	if putErr != nil {
		j.Status = "error"
		j.Error = "upload: " + putErr.Error()
	} else if rowsWritten < 0 {
		j.Status = "error"
		j.Error = "csv generation failed"
	} else {
		j.Status = "ready"
		j.ResultKey = resultKey
		j.RowCount = rowsWritten
	}

	if err := saveJob(ctx, rdb, &j); err != nil {
		log.Printf("export %s: failed to save final state: %v", j.ID, err)
	}
	log.Printf("export %s: %s (%d rows)", j.ID, j.Status, rowsWritten)
}
