package export

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/parquet-go/parquet-go"
)

type Store struct {
	client *minio.Client
	bucket string
}

func NewStore(endpoint, user, pass, bucket string) (*Store, error) {
	useSSL := strings.HasPrefix(endpoint, "https://")
	endpoint = strings.TrimPrefix(strings.TrimPrefix(endpoint, "http://"), "https://")

	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(user, pass, ""),
		Secure: useSSL,
	})
	if err != nil {
		return nil, err
	}
	return &Store{client: client, bucket: bucket}, nil
}

// archiveRow matches the Parquet schema written by k8s/archiver/archive.py.
// Pointer fields handle NULL — metadata-only rows have all position fields nil.
type archiveRow struct {
	EntityID           string   `parquet:"entity_id"`
	TimeIndex          int64    `parquet:"time_index"`
	Latitude           *float64 `parquet:"latitude"`
	Longitude          *float64 `parquet:"longitude"`
	Speed              *float64 `parquet:"speed"`
	Heading            *float64 `parquet:"heading"`
	DeviceTimestamp    *int64   `parquet:"devicetimestamp"`
	Ignition           *int64   `parquet:"ignition"`
	Moving             *int64   `parquet:"moving"`
	Plate              *string  `parquet:"plate"`
	VehicleID          *string  `parquet:"vehicle_id"`
	Make               *string  `parquet:"make"`
	Model              *string  `parquet:"model"`
	Cost               *int64   `parquet:"cost"`
	AssociatedLocation *string  `parquet:"associated_location"`
	FuelType           *string  `parquet:"fuel_type"`
	VehicleType        *string  `parquet:"vehicle_type"`
	FuelUsage          *float64 `parquet:"fuel_usage"`
	Capacity           *int64   `parquet:"capacity"`
	LeasingEndDate     *int64   `parquet:"leasing_end_date"`
}

var csvHeader = []string{
	"imei", "time_index", "device_timestamp",
	"latitude", "longitude", "speed", "heading",
	"ignition", "moving",
	"plate", "vehicle_id", "make", "model", "cost",
	"associated_location", "fuel_type", "vehicle_type",
	"fuel_usage", "capacity", "leasing_end_date",
}

// writeCSV writes the CSV header + filtered rows to w. Returns rows-written count.
// Suitable for streaming to either an HTTP response, a MinIO multipart upload, or any other io.Writer.
func (s *Store) writeCSV(
	ctx context.Context, w io.Writer,
	tenant string, from, to time.Time, deviceID string,
) (int64, error) {
	prefix := tenant + "/"
	if deviceID != "" {
		prefix = fmt.Sprintf("%s/%s/", tenant, deviceID)
	}
	fromMs := from.UnixMilli()
	toMs := to.UnixMilli()

	cw := csv.NewWriter(w)
	if err := cw.Write(csvHeader); err != nil {
		return 0, err
	}

	var rowsWritten int64
	objCh := s.client.ListObjects(ctx, s.bucket, minio.ListObjectsOptions{
		Prefix:    prefix,
		Recursive: true,
	})

	for obj := range objCh {
		if obj.Err != nil {
			return rowsWritten, obj.Err
		}
		if !strings.HasSuffix(obj.Key, ".parquet") {
			continue
		}
		if err := s.writeParquetFile(ctx, obj.Key, fromMs, toMs, cw, &rowsWritten); err != nil {
			return rowsWritten, fmt.Errorf("file %s: %w", obj.Key, err)
		}
	}

	cw.Flush()
	if err := cw.Error(); err != nil {
		return rowsWritten, err
	}
	return rowsWritten, nil
}

func (s *Store) writeParquetFile(
	ctx context.Context, key string, fromMs, toMs int64,
	cw *csv.Writer, rowsWritten *int64,
) error {
	objReader, err := s.client.GetObject(ctx, s.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return err
	}
	defer objReader.Close()

	body, err := io.ReadAll(objReader)
	if err != nil {
		return err
	}

	pf, err := parquet.OpenFile(bytes.NewReader(body), int64(len(body)))
	if err != nil {
		return err
	}
	reader := parquet.NewGenericReader[archiveRow](pf)
	defer reader.Close()

	rows := make([]archiveRow, 100)
	for {
		n, readErr := reader.Read(rows)
		for i := 0; i < n; i++ {
			r := rows[i]
			if r.TimeIndex < fromMs || r.TimeIndex >= toMs {
				continue
			}
			if r.DeviceTimestamp == nil {
				continue
			}
			if err := cw.Write(rowToCSV(r)); err != nil {
				return err
			}
			*rowsWritten++
		}
		if readErr == io.EOF {
			return nil
		}
		if readErr != nil {
			return readErr
		}
	}
}

func rowToCSV(r archiveRow) []string {
	imei := r.EntityID
	if i := strings.LastIndex(imei, ":"); i >= 0 {
		imei = imei[i+1:]
	}
	return []string{
		imei,
		time.UnixMilli(r.TimeIndex).UTC().Format(time.RFC3339),
		formatI64(r.DeviceTimestamp),
		formatF64(r.Latitude),
		formatF64(r.Longitude),
		formatF64(r.Speed),
		formatF64(r.Heading),
		formatI64(r.Ignition),
		formatI64(r.Moving),
		formatStr(r.Plate),
		formatStr(r.VehicleID),
		formatStr(r.Make),
		formatStr(r.Model),
		formatI64(r.Cost),
		formatStr(r.AssociatedLocation),
		formatStr(r.FuelType),
		formatStr(r.VehicleType),
		formatF64(r.FuelUsage),
		formatI64(r.Capacity),
		formatI64(r.LeasingEndDate),
	}
}

func formatF64(p *float64) string {
	if p == nil {
		return ""
	}
	return strconv.FormatFloat(*p, 'f', -1, 64)
}

func formatI64(p *int64) string {
	if p == nil {
		return ""
	}
	return strconv.FormatInt(*p, 10)
}

func formatStr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}
