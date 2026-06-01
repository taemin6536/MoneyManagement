"""Telegram bot delivery.

Bodies are authored in a Slack-flavoured markdown dialect: `*bold*` /
`**bold**` (the AI news summary emits double-asterisk bold) and `_italic_`.
Telegram's legacy `Markdown` parse mode does NOT understand `**bold**` and
hard-fails (400 "can't parse entities") on ANY unbalanced special char,
dropping the whole message. So we convert the body to Telegram HTML and send
with `parse_mode=HTML`; if Telegram still rejects it, we retry once as plain
text (no parse_mode) so the message always gets through. Falls back gracefully
(returns False) when token or chat_id is missing.
"""

import logging
import re

import httpx

logger = logging.getLogger(__name__)

# Telegram's hard limit is 4096 chars/message. Truncate the source markdown
# below that so HTML expansion (<b>…</b>) still fits comfortably.
_MAX_SOURCE_LEN = 3500


def _escape_html(text: str) -> str:
    """Escape the three chars Telegram HTML mode treats as markup."""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _to_html(text: str) -> str:
    """Convert the Slack-flavoured markdown body to Telegram HTML.

    Order matters: escape first (so user text can't inject tags), then map
    `**bold**` before `*bold*`, then `_italic_`. Each regex match emits a
    balanced <b>/<i> pair, so the result never contains an unbalanced tag —
    that's what makes HTML mode robust where legacy Markdown 400s. Stray,
    unpaired `*`/`_` simply stay as literal characters.
    """
    text = _escape_html(text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"\*(.+?)\*", r"<b>\1</b>", text)
    text = re.sub(r"_(.+?)_", r"<i>\1</i>", text)
    return text


def _strip_markdown(text: str) -> str:
    """Drop the `*`/`_` markers for the plain-text fallback so the message
    reads cleanly without literal asterisks/underscores."""
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"\*(.+?)\*", r"\1", text)
    text = re.sub(r"_(.+?)_", r"\1", text)
    return text


def _post(token: str, payload: dict) -> bool:
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    resp = httpx.post(url, json=payload, timeout=10.0)
    if 200 <= resp.status_code < 300:
        return True
    logger.warning("Telegram delivery failed: %s %s", resp.status_code, resp.text[:200])
    return False


def send(token: str | None, chat_id: str | None, title: str, body: str) -> bool:
    """Send a Telegram message. Returns True on 2xx delivery.

    If token or chat_id is falsy, logs and returns False (no-op).
    """
    if not token or not chat_id:
        logger.info("Telegram not configured; skipping. title=%s", title)
        return False

    source = f"*{title}*\n\n{body}"
    if len(source) > _MAX_SOURCE_LEN:
        source = source[: _MAX_SOURCE_LEN - 1] + "…"

    base = {"chat_id": chat_id, "disable_web_page_preview": True}

    try:
        if _post(token, {**base, "text": _to_html(source), "parse_mode": "HTML"}):
            return True
        # Telegram rejected the formatted message (e.g. an entity edge case).
        # Retry once as plain text — this can't fail on parse_mode entities.
        logger.info("Telegram HTML send rejected; retrying as plain text.")
        return _post(token, {**base, "text": _strip_markdown(source)})
    except httpx.HTTPError as e:
        logger.warning("Telegram delivery error: %s", e)
        return False
