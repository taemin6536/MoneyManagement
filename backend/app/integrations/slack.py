import logging

import httpx

logger = logging.getLogger(__name__)


def send(webhook_url: str | None, title: str, body: str) -> bool:
    """Send a Slack message. Returns True on 2xx delivery, False otherwise.

    If webhook_url is falsy, log and return False (no-op delivery, not failure).
    """
    if not webhook_url:
        logger.info("Slack webhook not configured; skipping. title=%s", title)
        return False

    payload = {
        "text": title,
        "blocks": [
            {
                "type": "header",
                "text": {"type": "plain_text", "text": title[:150]},
            },
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": body[:2900]},
            },
        ],
    }
    try:
        resp = httpx.post(webhook_url, json=payload, timeout=10.0)
        if 200 <= resp.status_code < 300:
            return True
        logger.warning("Slack delivery failed: %s %s", resp.status_code, resp.text[:200])
        return False
    except httpx.HTTPError as e:
        logger.warning("Slack delivery error: %s", e)
        return False
