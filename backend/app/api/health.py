from fastapi import APIRouter

from app.config import get_settings
from app.db.session import ping

router = APIRouter()


@router.get("/health")
def health() -> dict[str, object]:
    settings = get_settings()
    db_ok = False
    db_error: str | None = None
    try:
        ping()
        db_ok = True
    except Exception as e:
        db_error = str(e)

    return {
        "status": "ok" if db_ok else "degraded",
        "db": "ok" if db_ok else f"error: {db_error}",
        "slack_configured": bool(settings.slack_webhook_url),
        "kis_configured": bool(
            settings.kis_app_key
            and settings.kis_app_secret
            and settings.kis_account_number
        ),
    }
