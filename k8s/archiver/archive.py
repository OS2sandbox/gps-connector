import os
import json
from datetime import datetime, timezone, timedelta

import tempfile
import pyarrow as pa
import pyarrow.parquet as pq
import boto3

from crate import client

CRATE_HOST = os.environ.get('CRATE_HOST', 'cratedb')
CRATE_PORT = os.environ.get('CRATE_PORT', '4200')
ARCHIVE_AFTER_MINUTES = int(os.environ.get('ARCHIVE_AFTER_MINUTES', '5'))
DELETE_AFTER_MINUTES = int(os.environ.get('DELETE_AFTER_MINUTES', '10'))
MINIO_ENDPOINT = os.environ.get("MINIO_ENDPOINT", "http://minio:9000")
MINIO_ACCESS_KEY = os.environ["MINIO_ROOT_USER"]
MINIO_SECRET_KEY = os.environ["MINIO_ROOT_PASSWORD"]
BUCKET = os.environ.get("ARCHIVE_BUCKET", "gps-archive")

def get_tenant_schemas(cursor):
    cursor.execute(
        "SELECT schema_name FROM information_schema.schemata "
        "WHERE schema_name LIKE 'mt%'"
    )
    return [row[0] for row in cursor.fetchall()]

def fetch_old_data(cursor, schema, from_ms, to_ms):
    table = f'"{schema}"."etgpstracker"'
    cursor.execute(
        f"SELECT entity_id, time_index, latitude, longitude, speed, "
        f"devicetimestamp, ignition, moving "
        f"FROM {table} WHERE time_index >= ? "
        f"AND time_index < ? "
        f"ORDER BY entity_id, time_index",
        (from_ms, to_ms),
    )
    return cursor.fetchall()

def group_by_imei(rows, batch_ts):
    groups = {}
    for row in rows:
        entity_id = row[0]
        imei = entity_id.split(":")[-1]
        key = (imei, batch_ts)
        groups.setdefault(key, []).append(row)
    return groups

def write_parquet(rows):
    schema = pa.schema([
          ("entity_id", pa.string()),
          ("time_index", pa.int64()),
          ("latitude", pa.float64()),
          ("longitude", pa.float64()),
          ("speed", pa.float64()),
          ("devicetimestamp", pa.int64()),
          ("ignition", pa.int64()),
          ("moving", pa.int64()),
      ])

    arrays = [
        pa.array([r[i] for r in rows], type=schema.field(i).type)
        for i in range(len(schema))
    ]
    table = pa.table(arrays, schema=schema)
    tmp = tempfile.NamedTemporaryFile(suffix=".parquet", delete=False)
    pq.write_table(table, tmp.name)
    tmp.close()
    return tmp.name


def upload_to_minio(s3, filepath, key):
    s3.upload_file(filepath, BUCKET, key)


def ensure_bucket(s3):
    try:
        s3.head_bucket(Bucket=BUCKET)
    except s3.exceptions.ClientError:
        s3.create_bucket(Bucket=BUCKET)


def delete_old_data(cursor, schema, cutoff_ms):
    table = f'"{schema}"."etgpstracker"'
    cursor.execute(f"DELETE FROM {table} WHERE time_index < ?", (cutoff_ms,))
    return cursor.rowcount


def verify_upload(s3, key):
    response = s3.head_object(Bucket=BUCKET, Key=key)
    return response["ContentLength"] > 0


WATERMARK_KEY = "watermark.json"


def get_watermarks(s3):
    try:
        tmp = tempfile.NamedTemporaryFile(suffix=".json", delete=False)
        tmp.close()
        s3.download_file(BUCKET, WATERMARK_KEY, tmp.name)
        with open(tmp.name) as f:
            data = json.load(f)
        os.unlink(tmp.name)
        if "last_archived_ms" in data:
            return {}
        return data
    except s3.exceptions.ClientError:
        return {}


def save_watermarks(s3, watermarks):
    tmp = tempfile.NamedTemporaryFile(suffix=".json", delete=False, mode="w")
    json.dump(watermarks, tmp)
    tmp.close()
    s3.upload_file(tmp.name, BUCKET, WATERMARK_KEY)
    os.unlink(tmp.name)


def main():
    archive_cutoff = datetime.now(timezone.utc) - timedelta(minutes=ARCHIVE_AFTER_MINUTES)
    archive_cutoff_ms = int(archive_cutoff.timestamp() * 1000)
    delete_cutoff = datetime.now(timezone.utc) - timedelta(minutes=DELETE_AFTER_MINUTES)
    delete_cutoff_ms = int(delete_cutoff.timestamp() * 1000)
    archive_str = archive_cutoff.strftime("%Y-%m-%d %H:%M:%S")
    delete_str = delete_cutoff.strftime("%Y-%m-%d %H:%M:%S")

    conn = client.connect(f"http://{CRATE_HOST}:{CRATE_PORT}")
    cursor = conn.cursor()

    s3 = boto3.client(
        "s3",
        endpoint_url=MINIO_ENDPOINT,
        aws_access_key_id=MINIO_ACCESS_KEY,
        aws_secret_access_key=MINIO_SECRET_KEY,
    )
    ensure_bucket(s3)

    watermarks = get_watermarks(s3)

    schemas = get_tenant_schemas(cursor)
    if not schemas:
        print("No tenant schemas found. Nothing to archive.")
        return

    total_archived = 0
    total_deleted = 0
    for schema in schemas:
        kommune = schema[2:]  # strip "mt" prefix
        watermark_ms = watermarks.get(schema, 0)
        watermark_str = datetime.fromtimestamp(watermark_ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
        print(f"Processing: {kommune} (watermark: {watermark_str})")

        schema_ok = True
        rows = fetch_old_data(cursor, schema, watermark_ms, archive_cutoff_ms)
        if rows:
            batch_ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M")
            groups = group_by_imei(rows, batch_ts)
            for (imei, ts), group_rows in groups.items():
                key = f"{kommune}/{imei}/{ts}.parquet"
                parquet_path = write_parquet(group_rows)
                try:
                    upload_to_minio(s3, parquet_path, key)
                    if verify_upload(s3, key):
                        print(f"  Archived {len(group_rows)} rows to {key} [{watermark_str} - {archive_str}]")
                        total_archived += len(group_rows)
                    else:
                        print(f"  FAILED verification for {key}")
                        schema_ok = False
                except Exception as e:
                    print(f"  FAILED {key}: {e}")
                    schema_ok = False
                finally:
                    os.unlink(parquet_path)
        else:
            print(f"  No data to archive.")

        if schema_ok:
            watermarks[schema] = archive_cutoff_ms
            deleted = delete_old_data(cursor, schema, delete_cutoff_ms)
            if deleted > 0:
                print(f"  Deleted {deleted} rows older than {DELETE_AFTER_MINUTES}min (before {delete_str})")
            total_deleted += deleted
        else:
            print(f"  Skipping delete for {kommune} — archive had failures")

    save_watermarks(s3, watermarks)

    cursor.close()
    conn.close()
    print(f"Done. Archived {total_archived} rows, deleted {total_deleted} rows.")


if __name__ == "__main__":
    main()