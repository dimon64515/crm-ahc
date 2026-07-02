from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from app.core.config import get_settings
from app.database import engine, Base
from app.routers import auth, users, buildings, services, materials, works, reports, backups
from app.routers import requests as requests_router
from app.routers import push as push_router

settings = get_settings()

# Создание таблиц (для dev, в продакшене используем Alembic)
# Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.APP_NAME,
    description="CRM система для заместителя директора по АХЧ",
    version="1.0.0",
)

# CORS
origins = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Статические файлы (uploads)
if os.path.exists(settings.UPLOAD_DIR):
    app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

# Роутеры
app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(buildings.router, prefix="/api")
app.include_router(services.router, prefix="/api")
app.include_router(materials.router, prefix="/api")
app.include_router(works.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(backups.router, prefix="/api")
app.include_router(requests_router.router, prefix="/api")
app.include_router(push_router.router, prefix="/api")


@app.get("/api/health")
def health_check():
    return {"status": "ok", "version": "1.0.0"}


@app.get("/")
def root():
    return {"message": "CRM АХЧ API", "docs": "/docs"}
