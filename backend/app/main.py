import os

from contextlib import asynccontextmanager
from collections.abc import AsyncIterator
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text
from sqlalchemy import select

from . import models
from .api import router
from .db import Base, SessionLocal, engine
from .security import DEFAULT_TEMPORARY_PASSWORD, hash_password


def _prepare_demo_data() -> None:
    db = SessionLocal()
    try:
        demo_password_hash = hash_password(DEFAULT_TEMPORARY_PASSWORD)
        for user in db.scalars(select(models.User)).all():
            user.password_hash = demo_password_hash

        department = db.scalar(select(models.Department).where(models.Department.name == "General"))
        if department is None:
            department = models.Department(name="General")
            db.add(department)
            db.flush()

        for faculty_user in db.scalars(select(models.User).where(models.User.role == "faculty")).all():
            faculty = db.scalar(select(models.Faculty).where(models.Faculty.user_id == faculty_user.id))
            if faculty is None:
                faculty = models.Faculty(
                    user_id=faculty_user.id,
                    staff_number=f"FAC-{faculty_user.id}",
                    full_name=faculty_user.email.split("@", 1)[0],
                )
                db.add(faculty)
                db.flush()

            has_section = db.scalar(
                select(models.ClassSection.id).where(models.ClassSection.faculty_id == faculty.id).limit(1)
            )
            if has_section is None:
                subject_code = f"DEMO{faculty_user.id}"
                subject = db.scalar(select(models.Subject).where(models.Subject.code == subject_code))
                if subject is None:
                    subject = models.Subject(
                        code=subject_code,
                        name="Demo Class",
                        department_id=department.id,
                    )
                    db.add(subject)
                    db.flush()
                db.add(models.ClassSection(
                    subject_id=subject.id,
                    faculty_id=faculty.id,
                    section_code="A",
                    room="Default Classroom",
                ))
        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    Base.metadata.create_all(bind=engine)
    with engine.begin() as connection:
        student_columns = {column["name"] for column in inspect(connection).get_columns("students")}
        if "batch" not in student_columns:
            connection.execute(text("ALTER TABLE students ADD COLUMN batch VARCHAR(64) NOT NULL DEFAULT ''"))
    _prepare_demo_data()
    yield

app = FastAPI(title="Campus Attendance API", version="0.1.0", lifespan=lifespan)

allowed_origins = [
    origin.strip()
    for origin in os.getenv("FRONTEND_ORIGINS", "").split(",")
    if origin.strip()
]
allowed_origins.extend(["http://localhost:5173", "http://127.0.0.1:5173"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(dict.fromkeys(allowed_origins)),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(router)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "attendance-api"}


frontend_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
assets_dir = frontend_dist / "assets"

if frontend_dist.is_dir():
    app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend-assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_frontend(full_path: str) -> FileResponse:
        requested_file = frontend_dist / full_path
        if full_path and requested_file.is_file():
            return FileResponse(requested_file)
        return FileResponse(frontend_dist / "index.html")
