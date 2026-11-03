from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class StudentCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=160)
    roll_number: str = Field(min_length=1, max_length=64)
    department: str = Field(min_length=1, max_length=120)
    batch: str = Field(min_length=1, max_length=64)
    semester: int = Field(ge=1, le=20)


class FacultyCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=160)
    staff_number: str = Field(min_length=1, max_length=64)


class SubjectCreate(BaseModel):
    code: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=1, max_length=160)
    department: str = Field(min_length=1, max_length=120)


class ClassCreate(BaseModel):
    subject_id: int = Field(gt=0)
    faculty_id: int = Field(gt=0)
    section_code: str = Field(min_length=1, max_length=32)
    room: str = Field(default="", max_length=80)


class EnrollmentCreate(BaseModel):
    student_id: int = Field(gt=0)
    class_section_id: int = Field(gt=0)


class UserSummary(BaseModel):
    id: int
    email: EmailStr
    role: str
    display_name: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserSummary


class SessionCreate(BaseModel):
    class_section_id: int


class SessionSummary(BaseModel):
    id: int
    class_section_id: int
    subject_code: str
    subject_name: str
    section_code: str
    room: str
    started_at: datetime
    active: bool


class QRTokenResponse(BaseModel):
    token: str
    expires_at: datetime
    refresh_after_seconds: int


class CheckInRequest(BaseModel):
    qr_token: str = Field(min_length=16, max_length=4096)


class AttendanceCorrection(BaseModel):
    status: Literal["present", "late", "absent", "manually_verified"]
    reason: str = Field(min_length=5, max_length=500)


class CheckInResponse(BaseModel):
    status: str
    checked_in_at: datetime | None = None


class AttendanceEntry(BaseModel):
    student_id: int
    full_name: str
    roll_number: str
    status: str
    checked_in_at: datetime


class SessionDashboard(BaseModel):
    session: SessionSummary
    enrolled_count: int
    present_count: int
    attendance: list[AttendanceEntry]


class SessionStudent(BaseModel):
    student_id: int
    full_name: str
    roll_number: str
    present: bool


class StudentAttendanceEntry(BaseModel):
    subject_code: str
    subject_name: str
    section_code: str
    status: str
    checked_in_at: datetime


class ErrorResponse(BaseModel):
    detail: str
