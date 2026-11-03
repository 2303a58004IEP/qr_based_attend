import csv
from io import StringIO
from datetime import datetime, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .auth import DbSession, require_role, require_user
from .models import (
    AttendanceAuditLog,
    AttendanceRecord,
    AttendanceSession,
    ClassSection,
    Department,
    Enrollment,
    Faculty,
    Student,
    Subject,
    User,
)
from .schemas import (
    AttendanceEntry,
    AttendanceCorrection,
    CheckInRequest,
    CheckInResponse,
    ClassCreate,
    EnrollmentCreate,
    FacultyCreate,
    LoginRequest,
    LoginResponse,
    QRTokenResponse,
    SessionCreate,
    SessionDashboard,
    SessionStudent,
    SessionSummary,
    StudentAttendanceEntry,
    StudentCreate,
    SubjectCreate,
    UserSummary,
)
from .security import DEFAULT_TEMPORARY_PASSWORD, QR_REFRESH_SECONDS, create_access_token, create_qr_token, decode_token, hash_password, verify_password

router = APIRouter()


def _display_name(db: Session, user: User) -> str:
    if user.role == "student":
        student = db.scalar(select(Student).where(Student.user_id == user.id))
        if student:
            return student.full_name
    if user.role == "faculty":
        faculty = db.scalar(select(Faculty).where(Faculty.user_id == user.id))
        if faculty:
            return faculty.full_name
    return user.email


def _session_summary(db: Session, session: AttendanceSession) -> SessionSummary:
    section = db.get(ClassSection, session.class_section_id)
    subject = db.get(Subject, section.subject_id) if section else None
    if section is None or subject is None:
        raise HTTPException(status_code=404, detail="Class section not found.")
    return SessionSummary(
        id=session.id,
        class_section_id=section.id,
        subject_code=subject.code,
        subject_name=subject.name,
        section_code=section.section_code,
        room=section.room,
        started_at=session.started_at,
        active=session.active,
    )


def _faculty_for_user(db: Session, user: User) -> Faculty:
    faculty = db.scalar(select(Faculty).where(Faculty.user_id == user.id))
    if faculty is None:
        raise HTTPException(status_code=403, detail="Faculty profile is not configured.")
    return faculty


def _ensure_faculty_class(db: Session, faculty: Faculty) -> ClassSection | None:
    section = db.scalar(
        select(ClassSection).where(ClassSection.faculty_id == faculty.id).order_by(ClassSection.id).limit(1)
    )
    if section is not None:
        return section

    department = db.scalar(select(Department).where(Department.name == "General"))
    if department is None:
        department = Department(name="General")
        db.add(department)
        db.flush()

    subject_code = f"DEMO{faculty.user_id}"
    subject = db.scalar(select(Subject).where(Subject.code == subject_code))
    if subject is None:
        subject = Subject(code=subject_code, name="Demo Class", department_id=department.id)
        db.add(subject)
        db.flush()

    section = ClassSection(
        subject_id=subject.id,
        faculty_id=faculty.id,
        section_code="A",
        room="Default Classroom",
    )
    db.add(section)
    db.commit()
    db.refresh(section)
    return section


def _owned_session(db: Session, session_id: int, user: User) -> AttendanceSession:
    session = db.get(AttendanceSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Attendance session not found.")
    if user.role != "admin" and session.faculty_id != _faculty_for_user(db, user).id:
        raise HTTPException(status_code=403, detail="This session is assigned to another faculty member.")
    return session


def _department(db: Session, name: str) -> Department:
    department = db.scalar(select(Department).where(Department.name == name.strip()))
    if department is None:
        department = Department(name=name.strip())
        db.add(department)
        db.flush()
    return department


@router.post("/auth/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: DbSession) -> LoginResponse:
    user = db.scalar(select(User).where(func.lower(User.email) == payload.email.lower()))
    if user is None or not user.active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    return LoginResponse(
        access_token=create_access_token(user.id, user.role),
        user=UserSummary(id=user.id, email=user.email, role=user.role, display_name=_display_name(db, user)),
    )


@router.get("/auth/me", response_model=UserSummary)
def current_profile(db: DbSession, user: User = Depends(require_user)) -> UserSummary:
    return UserSummary(id=user.id, email=user.email, role=user.role, display_name=_display_name(db, user))


@router.post("/admin/students", status_code=201)
def create_student(payload: StudentCreate, db: DbSession, _admin: User = Depends(require_role("admin"))) -> dict[str, int | str]:
    if db.scalar(select(User).where(func.lower(User.email) == payload.email.lower())):
        raise HTTPException(status_code=409, detail="Email already exists.")
    user = User(email=payload.email.lower(), password_hash=hash_password(DEFAULT_TEMPORARY_PASSWORD), role="student")
    db.add(user)
    db.flush()
    student = Student(
        user_id=user.id,
        roll_number=payload.roll_number.strip(),
        full_name=payload.full_name.strip(),
        department_id=_department(db, payload.department).id,
        batch=payload.batch.strip(),
        semester=payload.semester,
    )
    db.add(student)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Roll number already exists.") from None
    return {"student_id": student.id, "user_id": user.id, "email": user.email}


@router.post("/admin/faculty", status_code=201)
def create_faculty(payload: FacultyCreate, db: DbSession, _admin: User = Depends(require_role("admin"))) -> dict[str, int | str]:
    if db.scalar(select(User).where(func.lower(User.email) == payload.email.lower())):
        raise HTTPException(status_code=409, detail="Email already exists.")
    user = User(email=payload.email.lower(), password_hash=hash_password(DEFAULT_TEMPORARY_PASSWORD), role="faculty")
    db.add(user)
    db.flush()
    faculty = Faculty(user_id=user.id, staff_number=payload.staff_number.strip(), full_name=payload.full_name.strip())
    db.add(faculty)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Staff number already exists.") from None
    return {"faculty_id": faculty.id, "user_id": user.id, "email": user.email}


@router.post("/admin/subjects", status_code=201)
def create_subject(payload: SubjectCreate, db: DbSession, _admin: User = Depends(require_role("admin"))) -> dict[str, int | str]:
    subject = Subject(code=payload.code.strip().upper(), name=payload.name.strip(), department_id=_department(db, payload.department).id)
    db.add(subject)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Subject code already exists.") from None
    return {"subject_id": subject.id, "code": subject.code}


@router.post("/admin/classes", status_code=201)
def create_class(payload: ClassCreate, db: DbSession, _admin: User = Depends(require_role("admin"))) -> dict[str, int]:
    if db.get(Subject, payload.subject_id) is None or db.get(Faculty, payload.faculty_id) is None:
        raise HTTPException(status_code=404, detail="Subject or faculty record not found.")
    section = ClassSection(**payload.model_dump())
    db.add(section)
    db.commit()
    return {"class_section_id": section.id}


@router.post("/admin/enrollments", status_code=201)
def create_enrollment(payload: EnrollmentCreate, db: DbSession, _admin: User = Depends(require_role("admin"))) -> dict[str, int]:
    student = db.get(Student, payload.student_id)
    section = db.get(ClassSection, payload.class_section_id)
    if student is None or section is None or not student.active:
        raise HTTPException(status_code=404, detail="Active student or class section not found.")
    enrollment = Enrollment(student_id=student.id, class_section_id=section.id)
    db.add(enrollment)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Student is already enrolled in this class.") from None
    return {"enrollment_id": enrollment.id}


@router.get("/admin/students")
def list_students(db: DbSession, _admin: User = Depends(require_role("admin"))) -> list[dict[str, int | str | bool]]:
    rows = db.execute(
        select(Student, User, Department)
        .join(User, Student.user_id == User.id)
        .outerjoin(Department, Student.department_id == Department.id)
        .order_by(Student.roll_number)
    ).all()
    return [{
        "id": student.id,
        "full_name": student.full_name,
        "roll_number": student.roll_number,
        "email": user.email,
        "department": department.name if department else "Unassigned",
        "batch": student.batch,
        "semester": student.semester,
        "active": student.active,
    } for student, user, department in rows]


@router.get("/admin/faculty")
def list_faculty(db: DbSession, _admin: User = Depends(require_role("admin"))) -> list[dict[str, int | str]]:
    rows = db.execute(
        select(Faculty, User)
        .join(User, Faculty.user_id == User.id)
        .order_by(Faculty.full_name)
    ).all()
    return [{
        "id": faculty.id,
        "full_name": faculty.full_name,
        "staff_number": faculty.staff_number,
        "email": user.email,
    } for faculty, user in rows]


@router.get("/admin/subjects")
def list_subjects(db: DbSession, _admin: User = Depends(require_role("admin"))) -> list[dict[str, int | str]]:
    rows = db.execute(select(Subject, Department).outerjoin(Department).order_by(Subject.code)).all()
    return [{
        "id": subject.id,
        "code": subject.code,
        "name": subject.name,
        "department": department.name if department else "Unassigned",
    } for subject, department in rows]


@router.get("/admin/classes")
def list_classes(db: DbSession, _admin: User = Depends(require_role("admin"))) -> list[dict[str, int | str]]:
    rows = db.execute(
        select(ClassSection, Subject, Faculty)
        .join(Subject, ClassSection.subject_id == Subject.id)
        .join(Faculty, ClassSection.faculty_id == Faculty.id)
        .order_by(Subject.code, ClassSection.section_code)
    ).all()
    return [{
        "id": section.id,
        "subject_code": subject.code,
        "subject_name": subject.name,
        "section_code": section.section_code,
        "room": section.room,
        "faculty_name": faculty.full_name,
        "enrolled_count": db.scalar(select(func.count(Enrollment.id)).where(
            Enrollment.class_section_id == section.id,
            Enrollment.active.is_(True),
        )) or 0,
    } for section, subject, faculty in rows]


@router.get("/faculty/classes")
def faculty_classes(db: DbSession, user: User = Depends(require_role("faculty"))) -> list[dict[str, int | str]]:
    faculty = _faculty_for_user(db, user)
    _ensure_faculty_class(db, faculty)
    rows = db.execute(
        select(ClassSection, Subject)
        .join(Subject, ClassSection.subject_id == Subject.id)
        .where(ClassSection.faculty_id == faculty.id)
        .order_by(Subject.code)
    ).all()
    result = []
    for section, subject in rows:
        enrolled = db.scalar(select(func.count(Enrollment.id)).where(Enrollment.class_section_id == section.id, Enrollment.active.is_(True))) or 0
        result.append({
            "id": section.id,
            "subject_code": subject.code,
            "subject_name": subject.name,
            "section_code": section.section_code,
            "room": section.room,
            "enrolled_count": enrolled,
        })
    return result


@router.post("/sessions", response_model=SessionSummary, status_code=201)
def start_session(payload: SessionCreate, db: DbSession, user: User = Depends(require_role("faculty"))) -> SessionSummary:
    faculty = _faculty_for_user(db, user)
    default_section = _ensure_faculty_class(db, faculty)
    section = db.get(ClassSection, payload.class_section_id)
    if section is None and payload.class_section_id == 0:
        section = default_section
    if section is None or section.faculty_id != faculty.id:
        raise HTTPException(status_code=404, detail="Assigned class section not found.")
    existing = db.scalar(select(AttendanceSession).where(
        AttendanceSession.class_section_id == section.id,
        AttendanceSession.active.is_(True),
    ))
    if existing:
        raise HTTPException(status_code=409, detail="This class already has an active session.")
    session = AttendanceSession(class_section_id=section.id, faculty_id=faculty.id, active=True)
    db.add(session)
    db.commit()
    db.refresh(session)
    return _session_summary(db, session)


@router.get("/sessions/active", response_model=list[SessionSummary])
def active_sessions(db: DbSession, user: User = Depends(require_role("faculty"))) -> list[SessionSummary]:
    faculty = _faculty_for_user(db, user)
    sessions = db.scalars(select(AttendanceSession).where(
        AttendanceSession.faculty_id == faculty.id,
        AttendanceSession.active.is_(True),
    ).order_by(AttendanceSession.started_at.desc())).all()
    return [_session_summary(db, session) for session in sessions]


@router.get("/sessions/{session_id}/qr", response_model=QRTokenResponse)
def get_qr_token(session_id: int, db: DbSession, user: User = Depends(require_role("faculty"))) -> QRTokenResponse:
    session = _owned_session(db, session_id, user)
    if not session.active:
        raise HTTPException(status_code=409, detail="Session is closed.")
    token, expires_at = create_qr_token(session.id)
    return QRTokenResponse(token=token, expires_at=expires_at, refresh_after_seconds=QR_REFRESH_SECONDS)


@router.post("/attendance/check-in", response_model=CheckInResponse)
def check_in(payload: CheckInRequest, db: DbSession, user: User = Depends(require_role("student"))) -> CheckInResponse:
    try:
        claims = decode_token(payload.qr_token, "attendance_qr")
        session_id = int(claims["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail="The attendance code is invalid or expired.") from None
    student = db.scalar(select(Student).where(Student.user_id == user.id, Student.active.is_(True)))
    if student is None:
        raise HTTPException(status_code=403, detail="Active student record not found.")
    session = db.get(AttendanceSession, session_id)
    if session is None or not session.active:
        raise HTTPException(status_code=409, detail="This attendance session is closed.")
    enrollment = db.scalar(select(Enrollment).where(
        Enrollment.student_id == student.id,
        Enrollment.class_section_id == session.class_section_id,
        Enrollment.active.is_(True),
    ))
    if enrollment is None:
        raise HTTPException(status_code=403, detail="You are not enrolled in this class.")
    existing = db.scalar(select(AttendanceRecord).where(
        AttendanceRecord.session_id == session.id,
        AttendanceRecord.student_id == student.id,
    ))
    if existing:
        return CheckInResponse(status="already_present", checked_in_at=existing.checked_in_at)
    record = AttendanceRecord(session_id=session.id, student_id=student.id, status="present", method="qr")
    db.add(record)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.scalar(select(AttendanceRecord).where(
            AttendanceRecord.session_id == session.id,
            AttendanceRecord.student_id == student.id,
        ))
        if existing:
            return CheckInResponse(status="already_present", checked_in_at=existing.checked_in_at)
        raise HTTPException(status_code=409, detail="Check-in could not be recorded.") from None
    db.refresh(record)
    return CheckInResponse(status="present", checked_in_at=record.checked_in_at)


@router.get("/sessions/{session_id}/dashboard", response_model=SessionDashboard)
def session_dashboard(session_id: int, db: DbSession, user: User = Depends(require_role("faculty"))) -> SessionDashboard:
    session = _owned_session(db, session_id, user)
    enrolled_count = db.scalar(select(func.count(Enrollment.id)).where(
        Enrollment.class_section_id == session.class_section_id,
        Enrollment.active.is_(True),
    )) or 0
    rows = db.execute(
        select(AttendanceRecord, Student)
        .join(Student, AttendanceRecord.student_id == Student.id)
        .where(AttendanceRecord.session_id == session.id)
        .order_by(AttendanceRecord.checked_in_at.desc())
    ).all()
    attendance = [AttendanceEntry(
        student_id=student.id,
        full_name=student.full_name,
        roll_number=student.roll_number,
        status=record.status,
        checked_in_at=record.checked_in_at,
    ) for record, student in rows]
    return SessionDashboard(
        session=_session_summary(db, session),
        enrolled_count=enrolled_count,
        present_count=sum(entry.status != "absent" for entry in attendance),
        attendance=attendance,
    )


@router.get("/sessions/{session_id}/enrollments", response_model=list[SessionStudent])
def session_enrollments(session_id: int, db: DbSession, user: User = Depends(require_role("faculty"))) -> list[SessionStudent]:
    session = _owned_session(db, session_id, user)
    rows = db.execute(
        select(Student, AttendanceRecord)
        .join(Enrollment, Enrollment.student_id == Student.id)
        .outerjoin(
            AttendanceRecord,
            (AttendanceRecord.student_id == Student.id) & (AttendanceRecord.session_id == session.id),
        )
        .where(Enrollment.class_section_id == session.class_section_id, Enrollment.active.is_(True))
        .order_by(Student.roll_number)
    ).all()
    return [SessionStudent(
        student_id=student.id,
        full_name=student.full_name,
        roll_number=student.roll_number,
        present=record is not None and record.status != "absent",
    ) for student, record in rows]


@router.post("/sessions/{session_id}/end", response_model=SessionSummary)
def end_session(session_id: int, db: DbSession, user: User = Depends(require_role("faculty"))) -> SessionSummary:
    session = _owned_session(db, session_id, user)
    session.active = False
    session.ended_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(session)
    return _session_summary(db, session)


@router.get("/student/attendance", response_model=list[StudentAttendanceEntry])
def student_attendance(db: DbSession, user: User = Depends(require_role("student"))) -> list[StudentAttendanceEntry]:
    student = db.scalar(select(Student).where(Student.user_id == user.id, Student.active.is_(True)))
    if student is None:
        raise HTTPException(status_code=404, detail="Student profile not found.")
    rows = db.execute(
        select(AttendanceRecord, AttendanceSession, ClassSection, Subject)
        .join(AttendanceSession, AttendanceRecord.session_id == AttendanceSession.id)
        .join(ClassSection, AttendanceSession.class_section_id == ClassSection.id)
        .join(Subject, ClassSection.subject_id == Subject.id)
        .where(AttendanceRecord.student_id == student.id)
        .order_by(AttendanceRecord.checked_in_at.desc())
    ).all()
    return [StudentAttendanceEntry(
        subject_code=subject.code,
        subject_name=subject.name,
        section_code=section.section_code,
        status=record.status,
        checked_in_at=record.checked_in_at,
    ) for record, _session, section, subject in rows]


@router.post("/sessions/{session_id}/attendance/{student_id}/manual", response_model=CheckInResponse)
def manual_attendance(
    session_id: int,
    student_id: int,
    reason: str,
    db: DbSession,
    user: User = Depends(require_role("faculty")),
) -> CheckInResponse:
    if len(reason.strip()) < 5:
        raise HTTPException(status_code=422, detail="Provide a correction reason of at least five characters.")
    session = _owned_session(db, session_id, user)
    student = db.get(Student, student_id)
    if student is None or not student.active:
        raise HTTPException(status_code=404, detail="Active student not found.")
    enrollment = db.scalar(select(Enrollment).where(
        Enrollment.student_id == student.id,
        Enrollment.class_section_id == session.class_section_id,
        Enrollment.active.is_(True),
    ))
    if enrollment is None:
        raise HTTPException(status_code=403, detail="Student is not enrolled in this class.")
    record = db.scalar(select(AttendanceRecord).where(
        AttendanceRecord.session_id == session.id,
        AttendanceRecord.student_id == student.id,
    ))
    if record is None:
        record = AttendanceRecord(session_id=session.id, student_id=student.id, status="present", method="manual")
        db.add(record)
        db.flush()
    db.add(AttendanceAuditLog(
        attendance_record_id=record.id,
        actor_user_id=user.id,
        action="manual_check_in",
        reason=reason.strip(),
    ))
    db.commit()
    db.refresh(record)
    return CheckInResponse(status=record.status, checked_in_at=record.checked_in_at)


@router.patch("/attendance/{record_id}", response_model=CheckInResponse)
def correct_attendance(
    record_id: int,
    payload: AttendanceCorrection,
    db: DbSession,
    user: User = Depends(require_role("faculty")),
) -> CheckInResponse:
    record = db.get(AttendanceRecord, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Attendance record not found.")
    _owned_session(db, record.session_id, user)
    previous_status = record.status
    record.status = payload.status
    db.add(AttendanceAuditLog(
        attendance_record_id=record.id,
        actor_user_id=user.id,
        action="attendance_correction",
        reason=f"{previous_status} -> {payload.status}: {payload.reason.strip()}",
    ))
    db.commit()
    db.refresh(record)
    return CheckInResponse(status=record.status, checked_in_at=record.checked_in_at)


@router.get("/sessions/{session_id}/report.csv")
def download_session_report(
    session_id: int,
    db: DbSession,
    user: User = Depends(require_role("faculty")),
) -> StreamingResponse:
    session = _owned_session(db, session_id, user)
    rows = db.execute(
        select(Student, AttendanceRecord)
        .join(Enrollment, Enrollment.student_id == Student.id)
        .outerjoin(
            AttendanceRecord,
            (AttendanceRecord.student_id == Student.id) & (AttendanceRecord.session_id == session.id),
        )
        .where(Enrollment.class_section_id == session.class_section_id, Enrollment.active.is_(True))
        .order_by(Student.roll_number)
    ).all()
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["roll_number", "student_name", "status", "checked_in_at"])

    def safe_cell(value: str) -> str:
        return f"'{value}" if value.startswith(("=", "+", "-", "@", "\t", "\r")) else value

    for student, record in rows:
        writer.writerow([
            safe_cell(student.roll_number),
            safe_cell(student.full_name),
            record.status if record else "absent",
            record.checked_in_at.isoformat() if record else "",
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=session-{session.id}-attendance.csv"},
    )
