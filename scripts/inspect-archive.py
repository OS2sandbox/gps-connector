#!/usr/bin/env python3
"""Inspect newest Parquet file in MinIO gps-archive bucket.

Usage:
  ./inspect-archive.py                              # newest across all tenants
  ./inspect-archive.py 12345678                     # newest for tenant
  ./inspect-archive.py 12345678/123456789012345     # newest for specific device
  ./inspect-archive.py path/to/file.parquet         # local file

Requires: pip install boto3 pyarrow pandas
"""
import io
import os
import sys

import boto3
import pyarrow.parquet as pq


MINIO_ENDPOINT = os.environ.get("MINIO_ENDPOINT", "http://localhost:9000")
MINIO_USER = os.environ.get("MINIO_ROOT_USER", "minioadmin")
MINIO_PASS = os.environ.get("MINIO_ROOT_PASSWORD", "changeme")
BUCKET = os.environ.get("ARCHIVE_BUCKET", "gps-archive")


def load_local(path):
    return pq.read_table(path)


def load_from_minio(prefix):
    s3 = boto3.client(
        "s3",
        endpoint_url=MINIO_ENDPOINT,
        aws_access_key_id=MINIO_USER,
        aws_secret_access_key=MINIO_PASS,
    )
    resp = s3.list_objects_v2(Bucket=BUCKET, Prefix=prefix)
    files = [o for o in resp.get("Contents", []) if o["Key"].endswith(".parquet")]
    if not files:
        sys.exit(f"No .parquet files found under prefix '{prefix}' in bucket '{BUCKET}'")
    newest = max(files, key=lambda o: o["LastModified"])
    print(f"Loading {newest['Key']} ({newest['Size']} bytes, {newest['LastModified']})\n")
    body = s3.get_object(Bucket=BUCKET, Key=newest["Key"])["Body"].read()
    return pq.read_table(io.BytesIO(body))


def main():
    arg = sys.argv[1] if len(sys.argv) > 1 else ""
    if arg.endswith(".parquet"):
        table = load_local(arg)
    else:
        prefix = f"{arg}/" if arg else ""
        table = load_from_minio(prefix)

    print("=== Schema ===")
    print(table.schema)
    print()
    print(f"=== Rows: {table.num_rows} ===")
    print(table.to_pandas().head(10).to_string())


if __name__ == "__main__":
    main()
