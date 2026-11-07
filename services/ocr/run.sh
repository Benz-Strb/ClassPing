#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
exec services/face/.venv/bin/python -m uvicorn main:build_app --factory --app-dir services/ocr --host 127.0.0.1 --port 8002 --env-file services/ocr/.env
