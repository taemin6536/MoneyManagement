from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.backtest import router as backtest_router
from app.api.briefing import router as briefing_router
from app.api.contributions import router as contributions_router
from app.api.health import router as health_router
from app.api.market import router as market_router
from app.api.portfolio import router as portfolio_router
from app.config import get_settings
from app.scheduler import shutdown as shutdown_scheduler
from app.scheduler import start as start_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s %(name)s: %(message)s",
)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()
    try:
        yield
    finally:
        shutdown_scheduler()


app = FastAPI(
    title="MoneyManagement API",
    version="0.1.0",
    description="TQQQ/QLD asset monitoring backend",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(market_router)
app.include_router(portfolio_router)
app.include_router(contributions_router)
app.include_router(backtest_router)
app.include_router(briefing_router)


@app.get("/")
def root() -> dict[str, str]:
    return {"name": "moneymanagement-backend", "env": settings.app_env}
