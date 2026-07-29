#!/bin/bash
# Start Celery worker and beat in the background
celery -A covenant_escrow_backend worker -B -l info &

# Start Gunicorn in the foreground
gunicorn covenant_escrow_backend.wsgi:application
