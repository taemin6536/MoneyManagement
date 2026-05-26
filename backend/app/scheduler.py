"""APScheduler: orchestrates polling cadence.

Cadence:
- US market hours (KST 22:30–05:00 standard time / 23:30–06:00 DST): every 1 min
- otherwise: every 10 min

For simplicity v1 uses a single 1-minute job and lets yfinance dedup hold —
we still upsert at unique (symbol, ts). A future optimization is two jobs gated
by a market-hour check; not worth the complexity until we see rate-limit pain.
"""

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.services.daily_report import send_daily_report
from app.services.orchestrator import poll_and_evaluate
from app.services.portfolio import run_daily_snapshot_job

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def start() -> BackgroundScheduler:
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        return _scheduler

    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(
        _safe_poll_and_evaluate,
        IntervalTrigger(minutes=1),
        id="poll_and_evaluate",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=30,
        replace_existing=True,
    )
    # Daily report: KST 06:30 = UTC 21:30 the previous day. US market closes
    # at 16:00 ET (UTC 20:00 EST / 21:00 EDT). Fire after close on weekdays.
    scheduler.add_job(
        _safe_daily_report,
        CronTrigger(hour=21, minute=30, day_of_week="mon-fri", timezone="UTC"),
        id="daily_report",
        max_instances=1,
        coalesce=True,
        replace_existing=True,
    )
    # Portfolio snapshot: KST 09:00 = UTC 00:00 daily. Skips itself if no KIS creds.
    scheduler.add_job(
        _safe_portfolio_snapshot,
        CronTrigger(hour=0, minute=0, timezone="UTC"),
        id="portfolio_snapshot",
        max_instances=1,
        coalesce=True,
        replace_existing=True,
    )
    scheduler.start()
    _scheduler = scheduler
    logger.info("Scheduler started.")
    return scheduler


def _safe_daily_report() -> None:
    try:
        result = send_daily_report()
        logger.info("daily_report: %s", result)
    except Exception:
        logger.exception("daily_report failed")


def _safe_portfolio_snapshot() -> None:
    try:
        result = run_daily_snapshot_job()
        logger.info("portfolio_snapshot: %s", result)
    except Exception:
        logger.exception("portfolio_snapshot failed")


def shutdown() -> None:
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("Scheduler shut down.")
        _scheduler = None


def _safe_poll_and_evaluate() -> None:
    try:
        result = poll_and_evaluate()
        logger.info("tick: %s", result)
    except Exception:
        logger.exception("poll_and_evaluate failed")
