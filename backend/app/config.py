from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_env: str = "local"
    app_port: int = 8000
    app_secret: str = "dev-secret-change-me"
    single_user_password: str = "change-me"

    database_url: str = Field(
        default="postgresql+psycopg://mm:mm_local_dev@localhost:5432/moneymanagement"
    )

    kis_app_key: str = ""
    kis_app_secret: str = ""
    kis_account_number: str = ""
    kis_account_product_code: str = "01"
    kis_base_url: str = "https://openapi.koreainvestment.com:9443"
    kis_paper_mode: bool = True

    slack_webhook_url: str = ""
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    # AI briefing (Anthropic). Key is password-equivalent — Fly secret / local .env only.
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-haiku-4-5"

    # News RSS feeds (comma-separated). Override via NEWS_RSS_FEEDS env.
    # Default: macro/Nasdaq-focused mix from licensed RSS sources only.
    news_rss_feeds: str = (
        "Yahoo Finance|https://finance.yahoo.com/news/rssindex,"
        "MarketWatch|https://feeds.content.dowjones.io/public/rss/mw_topstories,"
        "CNBC Markets|https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=15839069,"
        "Federal Reserve|https://www.federalreserve.gov/feeds/press_all.xml,"
        "BLS|https://www.bls.gov/feed/news_release/empsit.rss"
    )

    @property
    def news_rss_feeds_list(self) -> list[tuple[str, str]]:
        """Parse "Name|url,Name|url,..." into [(name, url), ...]."""
        out: list[tuple[str, str]] = []
        for chunk in self.news_rss_feeds.split(","):
            chunk = chunk.strip()
            if not chunk or "|" not in chunk:
                continue
            name, url = chunk.split("|", 1)
            out.append((name.strip(), url.strip()))
        return out

    # Comma-separated list of allowed CORS origins; default covers local dev.
    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
