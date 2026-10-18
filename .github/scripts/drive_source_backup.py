"""Create a filtered, dated source archive and upload it to Google Drive."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
import zipfile
from datetime import datetime
from pathlib import PurePosixPath
from zoneinfo import ZoneInfo

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload


FOLDER_NAME = "BloomPath Courier Source Backups (Automated)"
FOLDER_MIME = "application/vnd.google-apps.folder"
DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file"
EXCLUDED_PARTS = {
    ".git", ".next", ".turbo", ".vercel", "node_modules", "coverage",
    "dist", "build", ".temp",
}
EXCLUDED_SUFFIXES = {".pem", ".key", ".p12", ".pfx"}
EXCLUDED_NAMES = {
    "service-account.json", "service_account.json", "credentials.json",
}


def included(path: str) -> bool:
    normalized = path.replace("\\", "/")
    item = PurePosixPath(normalized)
    parts = set(item.parts)
    if parts & EXCLUDED_PARTS:
        return False
    if any(part.startswith(".env") and part != ".env.example" for part in item.parts):
        return False
    if item.name.lower() in EXCLUDED_NAMES or item.suffix.lower() in EXCLUDED_SUFFIXES:
        return False
    return True


def tracked_source_files() -> list[str]:
    output = subprocess.check_output(["git", "ls-files", "-z"])
    paths = [part.decode("utf-8") for part in output.split(b"\0") if part]
    return [path for path in paths if included(path)]


def build_archive(archive_path: str, timestamp: datetime, commit: str) -> None:
    files = tracked_source_files()
    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for path in files:
            contents = subprocess.check_output(["git", "show", f"HEAD:{path}"])
            archive.writestr(f"bloompath-courier/{path}", contents)
        manifest = {
            "repository": "shahzad3378/bloompath-courier",
            "commit": commit,
            "created_at": timestamp.isoformat(),
            "timezone": "Asia/Dubai",
            "files": len(files),
            "excluded": ["environment files", "credentials", "dependencies", "build caches"],
        }
        archive.writestr(
            "bloompath-courier/SOURCE-BACKUP-MANIFEST.json",
            json.dumps(manifest, indent=2) + "\n",
        )


def drive_client():
    raw = os.environ.get("GOOGLE_DRIVE_OAUTH_JSON", "")
    if not raw:
        raise RuntimeError("GOOGLE_DRIVE_OAUTH_JSON is not configured")
    config = json.loads(raw)
    credentials = Credentials(
        token=None,
        refresh_token=config["refresh_token"],
        token_uri=config.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=config["client_id"],
        client_secret=config["client_secret"],
        scopes=[DRIVE_SCOPE],
    )
    credentials.refresh(Request())
    return build("drive", "v3", credentials=credentials, cache_discovery=False)


def get_backup_folder(drive) -> str:
    escaped_name = FOLDER_NAME.replace("'", "\\'")
    response = drive.files().list(
        q=f"name = '{escaped_name}' and mimeType = '{FOLDER_MIME}' and trashed = false",
        spaces="drive",
        pageSize=100,
        fields="files(id,name)",
    ).execute()
    folders = response.get("files", [])
    if folders:
        return folders[0]["id"]
    created = drive.files().create(
        body={"name": FOLDER_NAME, "mimeType": FOLDER_MIME},
        fields="id,name",
    ).execute()
    print(f"Created Drive backup folder: {created['name']}")
    return created["id"]


def main() -> None:
    timestamp = datetime.now(ZoneInfo("Asia/Dubai"))
    stamp = timestamp.strftime("%Y-%m-%d_%H-%M-%S")
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    filename = f"bloompath-courier-source-{stamp}.zip"

    drive = drive_client()
    folder_id = get_backup_folder(drive)
    with tempfile.TemporaryDirectory() as temporary_directory:
        archive_path = os.path.join(temporary_directory, filename)
        build_archive(archive_path, timestamp, commit)
        uploaded = drive.files().create(
            body={"name": filename, "mimeType": "application/zip", "parents": [folder_id]},
            media_body=MediaFileUpload(archive_path, mimetype="application/zip", resumable=True),
            fields="id,name,webViewLink",
        ).execute()
    print(f"Uploaded {uploaded['name']} from commit {commit} to Google Drive.")


if __name__ == "__main__":
    main()
