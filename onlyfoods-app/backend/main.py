"""Only Foods API - entrypoint  (uvicorn main:app)"""
import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

import config
from errors import DomainError
import jobs
from utils import PUBLIC_UPLOAD_FOLDERS
from routers import (auth as auth_routes, feedback, files, foodcourt, notifications, orders, payments, printing,
                     products, reports, stores, suspensions, users)
from services import request_ip

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"),
                    format="%(asctime)s %(levelname)s %(name)s: %(message)s")

config.require_secrets()  # ไม่มี JWT_SECRET ที่แข็งแรง = ไม่ยอมสตาร์ท



@asynccontextmanager
async def lifespan(_: FastAPI):
    """งานเบื้องหลัง: เตือนลูกค้าที่ยังไม่มารับอาหาร (ปิดได้ด้วย DISABLE_BACKGROUND_JOBS=1)"""
    task = None
    if os.getenv("DISABLE_BACKGROUND_JOBS") != "1":
        task = asyncio.create_task(jobs.reminder_loop())
    try:
        yield
    finally:
        if task:
            task.cancel()


app = FastAPI(title="Only Foods API", lifespan=lifespan, docs_url=None if os.getenv("DISABLE_DOCS") == "1" else "/api/docs",
              redoc_url=None, openapi_url=None if os.getenv("DISABLE_DOCS") == "1" else "/api/openapi.json")

# ใน production หน้าเว็บกับ API อยู่ origin เดียวกันผ่าน nginx จึงไม่ต้องเปิด CORS ;
# ใช้เฉพาะตอนพัฒนา (เช่น vite dev server) โดยระบุ origin ใน CORS_ORIGINS
if config.CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.CORS_ORIGINS,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )


@app.middleware("http")
async def remember_client_ip(request: Request, call_next):
    ip = request.headers.get("x-real-ip") or (request.client.host if request.client else None)
    token = request_ip.set(ip[:45] if ip else None)
    try:
        return await call_next(request)
    finally:
        request_ip.reset(token)


@app.exception_handler(DomainError)
async def domain_error_handler(_: Request, exc: DomainError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, exc: RequestValidationError):
    # frontend เดิมแสดง data.detail เป็นข้อความ จึงแปลง list ของ pydantic เป็นข้อความเดียว
    first = exc.errors()[0] if exc.errors() else {}
    where = ".".join(str(p) for p in first.get("loc", []) if p not in ("body", "query", "path"))
    return JSONResponse(status_code=422, content={"detail": f"ข้อมูลไม่ถูกต้อง ({where}): {first.get('msg', '')}".strip()})


for module in (auth_routes, users, suspensions, stores, foodcourt, products, orders, payments, printing, feedback,
               notifications, reports, files):
    app.include_router(module.router)

# รูปสาธารณะ (เมนู/ร้าน/โปรไฟล์/รีวิว) เปิดตรงได้ ; สลิปและข้อมูลคืนเงินต้องผ่าน /api/files ที่เช็คสิทธิ์ (L25)
os.makedirs(config.UPLOAD_DIR, exist_ok=True)
for folder in PUBLIC_UPLOAD_FOLDERS:
    os.makedirs(os.path.join(config.UPLOAD_DIR, folder), exist_ok=True)
    app.mount(f"/uploads/{folder}", StaticFiles(directory=os.path.join(config.UPLOAD_DIR, folder)),
              name=f"uploads-{folder}")


@app.get("/api/health", include_in_schema=False)
def health():
    return {"status": "ok"}
