import secrets

from sqlalchemy import select

from .db import Base, SessionLocal, engine
from .models import ClassSection, Department, Enrollment, Faculty, Student, Subject, User
from .security import hash_password


def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.scalar(select(User.id).limit(1)) is not None:
            raise SystemExit("Database already contains users; refusing to add demo accounts.")

        demo_password = secrets.token_urlsafe(18)
        admin = User(email="admin@example.com", password_hash=hash_password(demo_password), role="admin")
        faculty_user = User(email="faculty@example.com", password_hash=hash_password(demo_password), role="faculty")
        student_one_user = User(email="student1@example.com", password_hash=hash_password(demo_password), role="student")
        student_two_user = User(email="student2@example.com", password_hash=hash_password(demo_password), role="student")
        db.add_all([admin, faculty_user, student_one_user, student_two_user])
        db.flush()

        department = Department(name="Computer Science")
        db.add(department)
        db.flush()
        faculty = Faculty(user_id=faculty_user.id, staff_number="FAC-001", full_name="Alex Morgan")
        students = [
            Student(user_id=student_one_user.id, roll_number="CS-2026-001", full_name="Jordan Lee", department_id=department.id, semester=3),
            Student(user_id=student_two_user.id, roll_number="CS-2026-002", full_name="Taylor Chen", department_id=department.id, semester=3),
        ]
        subject = Subject(code="CS302", name="Database Systems", department_id=department.id)
        db.add_all([faculty, *students, subject])
        db.flush()
        section = ClassSection(subject_id=subject.id, faculty_id=faculty.id, section_code="A", room="Lab 204")
        db.add(section)
        db.flush()
        db.add_all([Enrollment(student_id=student.id, class_section_id=section.id) for student in students])
        db.commit()

        print("Demo data created.")
        print("Admin:   admin@example.com")
        print("Faculty: faculty@example.com")
        print("Student: student1@example.com or student2@example.com")
        print(f"Password for all demo accounts: {demo_password}")
        print("Keep this local-only demo password private and do not reuse it.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
