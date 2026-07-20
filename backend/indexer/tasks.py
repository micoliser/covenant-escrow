"""
Celery tasks for the indexer app.
"""
import logging
from celery import shared_task
from indexer.sync import run_full_sync

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=0)
def poll_and_sync(self):
    """
    Celery beat task: run a full poll-and-diff sync cycle.

    max_retries=0 because the stale-lock mechanism in run_full_sync()
    already handles recovery from crashed tasks — retrying would just
    pile up redundant sync attempts.
    """
    logger.info("Starting poll-and-sync beat task.")
    try:
        run_full_sync()
        logger.info("Poll-and-sync completed successfully.")
    except Exception:
        logger.exception("Poll-and-sync failed.")
        raise
