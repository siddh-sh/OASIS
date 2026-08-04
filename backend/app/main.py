from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import admin, agent, analytics, auth, fisheries, molecular, ocean, species, weather
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title="OASIS API",
    description=(
        "Unified marine data platform for oceanographic, fisheries, biodiversity, "
        "weather, and molecular/eDNA insights — see flow.md for the full architecture."
    ),
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(ocean.router)
app.include_router(weather.router)
app.include_router(species.router)
app.include_router(fisheries.router)
app.include_router(molecular.router)
app.include_router(analytics.router)
app.include_router(agent.router)
app.include_router(admin.router)


@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok", "environment": settings.environment}
