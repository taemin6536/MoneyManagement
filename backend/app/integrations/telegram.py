"""Telegram bot delivery.

Uses Bot API sendMessage with parse_mode=Markdown so the same body format
that Slack uses (`*bold*`) renders consistently. Falls back gracefully
(returns False) when token or chat_id is missing.
"""

import logging

import httpx

logger = logging.getLogger(__name__)


def send(token: str | None, chat_id: str | None, title: str, body: str) -> bool:
    """Send a Telegram message. Returns True on 2xx delivery.

    If token or chat_id is falsy, logs and returns False (no-op).
    Telegram's hard limit is 4096 chars per message — we truncate to be safe.
    """
    if not token or not chat_id:
        logger.info("Telegram not configured; skipping. title=%s", title)
        return False

    text = f"*{title}*\n\n{body}"
    if len(text) > 4000:
        text = text[:3996] + "\n…"

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "Markdown",
        "disable_web_page_preview": True,
    }
    try:
        resp = httpx.post(url, json=payload, timeout=10.0)
        if 200 <= resp.status_code < 300:
            return True
        logger.warning("Telegram delivery failed: %s %s", resp.status_code, resp.text[:200])
        return False
    except httpx.HTTPError as e:
        logger.warning("Telegram delivery error: %s", e)
        return False
