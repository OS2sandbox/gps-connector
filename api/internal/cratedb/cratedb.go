package cratedb

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

type DB struct{ db *sql.DB }

func New(dsn string) (*DB, error) {
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, err
	}
	return &DB{db: db}, nil
}

type position struct {
	IMEI            string    `json:"imei"`
	TimeIndex       time.Time `json:"time_index"`
	DeviceTimestamp int64     `json:"device_timestamp"`
	Latitude        float64   `json:"latitude"`
	Longitude       float64   `json:"longitude"`
	Speed           float64   `json:"speed"`
	Heading         *float64  `json:"heading,omitempty"`
	Ignition        int       `json:"ignition"`
	Moving          int       `json:"moving"`
	Plate           *string   `json:"plate"`
}

func (c *DB) StreamPositions(
	ctx context.Context, w http.ResponseWriter,
	tenant string, from, to time.Time, deviceID string,
) (committed bool, err error) {
	schemaName := "mt" + tenant
	schema := fmt.Sprintf(`"%s"."etgpstracker"`, schemaName)

	var totalCols, plateCols int
	if err = c.db.QueryRowContext(ctx, `
        SELECT count(*), count(CASE WHEN column_name = 'plate' THEN 1 END)
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'etgpstracker'`,
		schemaName).Scan(&totalCols, &plateCols); err != nil {
		return false, err
	}
	hasTable := totalCols > 0
	hasPlate := plateCols > 0

	w.Header().Set("Content-Type", "application/x-ndjson")
	w.Header().Set("Cache-Control", "no-store")

	if !hasTable {
		w.WriteHeader(http.StatusOK)
		return true, nil
	}

	plateCol := "NULL AS plate"
	if hasPlate {
		plateCol = "plate"
	}
	base := fmt.Sprintf(`SELECT
        regexp_replace(entity_id, '^.*:', '') AS device_id,
        time_index, devicetimestamp,
        latitude, longitude, speed, heading, ignition, moving, %s
        FROM %s WHERE time_index BETWEEN $1 AND $2
        AND devicetimestamp IS NOT NULL`, plateCol, schema)

	var rows *sql.Rows
	if deviceID != "" {
		rows, err = c.db.QueryContext(ctx,
			base+` AND regexp_replace(entity_id, '^.*:', '') = $3 ORDER BY time_index ASC`,
			from, to, deviceID)
	} else {
		rows, err = c.db.QueryContext(ctx,
			base+" ORDER BY time_index ASC",
			from, to)
	}
	if err != nil {
		return false, err
	}
	defer rows.Close()

	enc := json.NewEncoder(w)
	flusher, _ := w.(http.Flusher)
	n := 0
	for rows.Next() {
		var p position
		var heading sql.NullFloat64
		var plate sql.NullString
		if err := rows.Scan(
			&p.IMEI, &p.TimeIndex, &p.DeviceTimestamp,
			&p.Latitude, &p.Longitude, &p.Speed, &heading,
			&p.Ignition, &p.Moving, &plate,
		); err != nil {
			return committed, err
		}
		if heading.Valid {
			p.Heading = &heading.Float64
		}
		if plate.Valid {
			p.Plate = &plate.String
		}
		if err := enc.Encode(p); err != nil {
			return true, err
		}
		committed = true
		n++
		if n%100 == 0 && flusher != nil {
			flusher.Flush()
		}
	}
	if err := rows.Err(); err != nil {
		return committed, err
	}
	if !committed {
		w.WriteHeader(http.StatusOK)
		committed = true
	}
	if flusher != nil {
		flusher.Flush()
	}
	return committed, nil
}
