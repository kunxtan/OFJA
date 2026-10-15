"""Only Foods API - entrypoint  (uvicorn main:app)"""
import logging
import os

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

import config
from errors import DomainError
from routers import (auth as auth_routes, feedback, foodcourt, notifications, orders, payments, printing,
                     products, reports, stores, users)
from services import request_ip

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"),
                    format="%(asctime)s %(levelname)s %(name)s: %(message)s")

config.require_secrets()  # ไม่มี JWT_SECRET ที่แข็งแรง = ไม่ยอมสตาร์ท

app = FastAPI(title="Only Foods API", docs_url=None if os.getenv("DISABLE_DOCS") == "1" else "/api/docs",
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


for module in (auth_routes, users, stores, foodcourt, products, orders, payments, printing, feedback,
               notifications, reports):
    app.include_router(module.router)

os.makedirs(config.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=config.UPLOAD_DIR), name="uploads")


@app.get("/api/health", include_in_schema=False)
def health():
    return {"status": "ok"}
