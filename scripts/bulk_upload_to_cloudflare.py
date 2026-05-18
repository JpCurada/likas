import os
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

LOCAL_FOLDER = Path('./models')          # folder containing files to upload
REMOTE_PREFIX = 'models'                 # "subfolder" key prefix in the bucket

assert all([R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME]), \
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


def upload_folder(folder: Path, prefix: str):
    """Recursively upload all files in `folder` under the given key prefix."""
    files = [p for p in folder.rglob('*') if p.is_file()]
    if not files:
        print(f"No files found in {folder}")
        return

    print(f"Uploading {len(files)} file(s) from {folder} to s3://{R2_BUCKET_NAME}/{prefix}/")

    for i, path in enumerate(files, 1):
        # Preserve subfolder structure relative to LOCAL_FOLDER
        relative = path.relative_to(folder).as_posix()
        remote_key = f"{prefix}/{relative}" if prefix else relative

        print(f"\n[{i}/{len(files)}] {relative}")
        try:
            upload_file(path, remote_key)
        except ClientError as e:
            print(f"  ✗ Failed: {e}")
            continue

    print("\nDone.")


if __name__ == '__main__':
    upload_folder(LOCAL_FOLDER, REMOTE_PREFIX)