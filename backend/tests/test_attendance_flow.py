import os
import sys
from pathlib import Path

os.environ["DATABASE_URL"] = "sqlite:///./attendance_test.db"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-not-used-outside-tests"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

from app.db import Base, SessionLocal, engine
from app.main import app
from app.models import AttendanceRecord, ClassSection, Department, Enrollment, Faculty, Student, Subject, User
from app.security import hash_password


def test_qr_checkin_requires_enrollment_and_prevents_duplicates() -> None:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    password_hash = hash_password("local-test-password")
    admin_user = User(email="admin@example.com", password_hash=password_hash, role="admin")
    faculty_user = User(email="faculty@example.com", password_hash=password_hash, role="faculty")
    student_user = User(email="student@example.com", password_hash=password_hash, role="student")
    outsider_user = User(email="outsider@example.com", password_hash=password_hash, role="student")
    absent_user = User(email="absent@example.com", password_hash=password_hash, role="student")
    db.add_all([admin_user, faculty_user, student_user, outsider_user, absent_user])
    db.flush()

    faculty = Faculty(user_id=faculty_user.id, staff_number="F-001", full_name="Test Faculty")
    student = Student(user_id=student_user.id, roll_number="CS-001", full_name="Test Student", semester=2)
    outsider = Student(user_id=outsider_user.id, roll_number="CS-002", full_name="Not Enrolled", semester=2)
    absent_student = Student(user_id=absent_user.id, roll_number="CS-003", full_name="Absent Student", semester=2)
    department = Department(name="Computer Science")
    db.add_all([faculty, student, outsider, absent_student, department])
    db.flush()

    subject = Subject(code="CS101", name="Intro to CS", department_id=department.id)
    db.add(subject)
    db.flush()
    section = ClassSection(subject_id=subject.id, faculty_id=faculty.id, section_code="A", room="Room 1")
    db.add(section)
    db.flush()
    db.add_all([
        Enrollment(student_id=student.id, class_section_id=section.id, active=True),
        Enrollment(student_id=absent_student.id, class_section_id=section.id, active=True),
    ])
    db.commit()
    section_id = section.id
    db.close()

    with TestClient(app) as client:
        admin_login = client.post("/auth/login", json={"email": "admin@example.com", "password": "local-test-password"})
        faculty_login = client.post("/auth/login", json={"email": "faculty@example.com", "password": "local-test-password"})
        student_login = client.post("/auth/login", json={"email": "student@example.com", "password": "local-test-password"})
        outsider_login = client.post("/auth/login", json={"email": "outsider@example.com", "password": "local-test-password"})
        assert admin_login.status_code == faculty_login.status_code == student_login.status_code == outsider_login.status_code == 200

        admin_headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}
        faculty_headers = {"Authorization": f"Bearer {faculty_login.json()['access_token']}"}
        student_headers = {"Authorization": f"Bearer {student_login.json()['access_token']}"}
        outsider_headers = {"Authorization": f"Bearer {outsider_login.json()['access_token']}"}

        assert client.get("/admin/students", headers=admin_headers).status_code == 200
        assert len(client.get("/admin/faculty", headers=admin_headers).json()) == 1
        assert len(client.get("/admin/subjects", headers=admin_headers).json()) == 1
        assert len(client.get("/admin/classes", headers=admin_headers).json()) == 1
        assert client.get("/admin/students", headers=student_headers).status_code == 403
        student_created = client.post("/admin/students", json={
            "full_name": "New Student",
            "email": "new.student@example.com",
            "roll_number": "CS-004",
            "department": "Computer Science",
            "batch": "2024-2028",
            "semester": 1,
        }, headers=admin_headers)
        assert student_created.status_code == 201
        new_student = next(
            student for student in client.get("/admin/students", headers=admin_headers).json()
            if student["roll_number"] == "CS-004"
        )
        assert new_student["batch"] == "2024-2028"
        new_student_login = client.post("/auth/login", json={"email": "new.student@example.com", "password": "demo@123"})
        assert new_student_login.status_code == 200

        faculty_created = client.post("/admin/faculty", json={
            "email": "new.faculty@example.com",
            "full_name": "New Faculty",
            "staff_number": "F-002",
        }, headers=admin_headers)
        assert faculty_created.status_code == 201
        new_faculty_login = client.post("/auth/login", json={"email": "new.faculty@example.com", "password": "demo@123"})
        assert new_faculty_login.status_code == 200

        profile = client.get("/auth/me", headers=student_headers)
        assert profile.status_code == 200
        assert profile.json()["display_name"] == "Test Student"

        session_response = client.post("/sessions", json={"class_section_id": section_id}, headers=faculty_headers)
        assert session_response.status_code == 201
        session_id = session_response.json()["id"]
        qr_response = client.get(f"/sessions/{session_id}/qr", headers=faculty_headers)
        assert qr_response.status_code == 200
        assert qr_response.json()["refresh_after_seconds"] == 15
        qr_token = qr_response.json()["token"]

        first_check_in = client.post("/attendance/check-in", json={"qr_token": qr_token}, headers=student_headers)
        repeat_check_in = client.post("/attendance/check-in", json={"qr_token": qr_token}, headers=student_headers)
        rejected_check_in = client.post("/attendance/check-in", json={"qr_token": qr_token}, headers=outsider_headers)
        assert first_check_in.status_code == 200
        assert first_check_in.json()["status"] == "present"
        assert repeat_check_in.json()["status"] == "already_present"
        assert rejected_check_in.status_code == 403

        dashboard = client.get(f"/sessions/{session_id}/dashboard", headers=faculty_headers)
        assert dashboard.status_code == 200
        assert dashboard.json()["present_count"] == 1
        assert dashboard.json()["enrolled_count"] == 2
        assert dashboard.json()["attendance"][0]["roll_number"] == "CS-001"

        db = SessionLocal()
        record_id = db.query(AttendanceRecord).filter_by(session_id=session_id, student_id=dashboard.json()["attendance"][0]["student_id"]).one().id
        db.close()
        correction = client.patch(
            f"/attendance/{record_id}",
            json={"status": "late", "reason": "Arrived after the class start."},
            headers=faculty_headers,
        )
        assert correction.status_code == 200
        assert correction.json()["status"] == "late"

        report = client.get(f"/sessions/{session_id}/report.csv", headers=faculty_headers)
        assert report.status_code == 200
        assert "CS-001,Test Student,late," in report.text
        assert "CS-003,Absent Student,absent," in report.text

        history = client.get("/student/attendance", headers=student_headers)
        assert history.status_code == 200
        assert len(history.json()) == 1

        ended_session = client.post(f"/sessions/{session_id}/end", headers=faculty_headers)
        assert ended_session.status_code == 200
        after_end = client.post("/attendance/check-in", json={"qr_token": qr_token}, headers=student_headers)
        assert after_end.status_code == 409
