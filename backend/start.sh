#!/bin/bash
# Start Celery worker and beat in the background (restricted to 1 concurrent process to save RAM)
celery -A covenant_escrow_backend worker -B -l info --concurrency=1 &

# Start Gunicorn in the foreground (restricted to 1 worker to fit in the 512MB free tier limit)
gunicorn covenant_escrow_backend.wsgi:application --workers 1 --threads 2
