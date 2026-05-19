import argparse
import os
import sys
from pathlib import Path

import boto3
from boto3.s3.transfer import TransferConfig
from botocore.exceptions import ClientError
from dotenv import load_dotenv
from tqdm import tqdm

# ---- Config ----
load_dotenv()

R2_ACCOUNT_ID = os.getenv('R2_ACCOUNT_ID')
R2_ACCESS_KEY_ID = os.getenv('R2_ACCESS_KEY_ID')
R2_SECRET_ACCESS_KEY = os.getenv('R2_SECRET_ACCESS_KEY')
R2_BUCKET_NAME = os.getenv('R2_BUCKET_NAME')
R2_ENDPOINT_URL = os.getenv('R2_ENDPOINT_URL')

REMOTE_PREFIX = 'models'   # "subfolder" in the bucket; set to '' for root

assert all([R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_ENDPOINT_URL]), \
    "Missing one or more R2 env vars. Check your .env file."

# ---- Client ----
s3 = boto3.client(
    's3',
    endpoint_url=R2_ENDPOINT_URL,
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    region_name='auto',
)

config = TransferConfig(
    multipart_threshold=64 * 1024 * 1024,   # 64 MB
    multipart_chunksize=64 * 1024 * 1024,
    max_concurrency=10,
    use_threads=True,
)


def upload_file(local_path: Path, remote_key: str):
    """Upload a single file with a progress bar."""
    size = local_path.stat().st_size
    print(f"Uploading {local_path} ({size / (1024**3):.2f} GB) "
          f"→ s3://{R2_BUCKET_NAME}/{remote_key}")

    with tqdm(
        total=size,
        unit='B',
        unit_scale=True,
        unit_divisor=1024,
        desc=local_path.name,
    ) as pbar:
        s3.upload_file(
            str(local_path),
            R2_BUCKET_NAME,
            remote_key,
            Config=config,
            Callback=lambda bytes_sent: pbar.update(bytes_sent),
        )

    print("\n✅ Done.")


def parse_args():
    parser = argparse.ArgumentParser(
        description="Upload a single file to Cloudflare R2."
    )
    parser.add_argument(
        'file_path',
        type=Path,
        help="Path to the local file to upload.",
    )
    parser.add_argument(
        '--key',
        type=str,
        default=None,
        help="Remote object key (default: <REMOTE_PREFIX>/<filename>).",
    )
    return parser.parse_args()


if __name__ == '__main__':
    args = parse_args()

    local_file = args.file_path
    if not local_file.exists() or not local_file.is_file():
        print(f"✗ File not found: {local_file}")
        sys.exit(1)

    remote_key = args.key or (
        f"{REMOTE_PREFIX}/{local_file.name}" if REMOTE_PREFIX else local_file.name
    )

    try:
        upload_file(local_file, remote_key)
    except ClientError as e:
        print(f"✗ Upload failed: {e}")
        sys.exit(1)