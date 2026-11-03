import { useEffect, useState } from 'react'
import { api, type AdminClassRecord, type AdminStudent, type FacultyRecord, type SubjectRecord } from './api'

type AdminTab = 'Students' | 'Faculty' | 'Classes'

export default function AdminWorkspace({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [tab, setTab] = useState<AdminTab>('Students')
  const [students, setStudents] = useState<AdminStudent[]>([])
  const [faculty, setFaculty] = useState<FacultyRecord[]>([])
  const [subjects, setSubjects] = useState<SubjectRecord[]>([])
  const [classes, setClasses] = useState<AdminClassRecord[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function refresh() {
    try {
      const [studentRows, facultyRows, subjectRows, classRows] = await Promise.all([
        api.adminStudents(token), api.adminFaculty(token), api.adminSubjects(token), api.adminClasses(token),
      ])
      setStudents(studentRows)
      setFaculty(facultyRows)
      setSubjects(subjectRows)
      setClasses(classRows)
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load college records.')
    }
  }

  useEffect(() => { void refresh() }, [token])

  async function submit(event: React.FormEvent<HTMLFormElement>, action: (values: FormData) => Promise<unknown>, success: string) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action(values)
      form.reset()
      setNotice(success)
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save this record.')
    } finally {
      setBusy(false)
    }
  }

  const addStudent = (values: FormData) => api.createStudent(token, {
    full_name: String(values.get('full_name')),
    email: String(values.get('email')),
    password: String(values.get('password')),
    roll_number: String(values.get('roll_number')),
    department: String(values.get('department')),
    batch: String(values.get('batch')),
    semester: Number(values.get('semester')),
  })
  const addFaculty = (values: FormData) => api.createFaculty(token, {
    full_name: String(values.get('full_name')),
    email: String(values.get('email')),
    password: String(values.get('password')),
    staff_number: String(values.get('staff_number')),
  })
  const addSubject = (values: FormData) => api.createSubject(token, {
    code: String(values.get('code')),
    name: String(values.get('name')),
    department: String(values.get('department')),
  })
  const addClass = (values: FormData) => api.createClass(token, {
    subject_id: Number(values.get('subject_id')),
    faculty_id: Number(values.get('faculty_id')),
    section_code: String(values.get('section_code')),
    room: String(values.get('room')),
  })
  const addEnrollment = (values: FormData) => api.enrollStudent(token, {
    student_id: Number(values.get('student_id')),
    class_section_id: Number(values.get('class_section_id')),
  })

  const tabs: AdminTab[] = ['Students', 'Faculty', 'Classes']
  return (
    <div className="live-shell">
      <header className="live-topbar">
        <a className="brand" href="#home"><span className="brand-mark"><span className="cap-glyph">C</span></span><span className="brand-copy"><strong>campus</strong><small>ATTENDANCE</small></span></a>
        <div className="live-top-actions"><span className="local-indicator"><span className="status-dot" />LOCAL DEVELOPMENT</span><span className="role-chip">Admin</span><button className="signout-button" onClick={onLogout} type="button">Sign out</button></div>
      </header>
      <main className="live-content">
        <div className="preview-notice"><span>Local MVP</span><span>Changes are stored in the local database.</span></div>
        <div className="workspace-heading"><div><div className="eyebrow">COLLEGE MANAGEMENT</div><h1>Administration<span>.</span></h1><p>Manage student records, teaching staff, and class enrollment.</p></div></div>
        {error && <div className="notice-error" role="alert">{error}</div>}
        {notice && <div className="admin-success" role="status">{notice}</div>}
        <nav className="admin-tabs" aria-label="Administration sections">{tabs.map((item) => <button className={tab === item ? 'active' : ''} key={item} onClick={() => setTab(item)} type="button">{item}{item === 'Students' ? <span>{students.length}</span> : item === 'Faculty' ? <span>{faculty.length}</span> : <span>{classes.length}</span>}</button>)}</nav>
        {tab === 'Students' && <section className="admin-layout">
          <article className="panel admin-form-panel"><div className="section-title"><h2>Add student</h2><p>Account credentials are hashed by the API.</p></div>
            <form className="admin-form" onSubmit={(event) => void submit(event, addStudent, 'Student account created.')}>
              <label>Full name<input name="full_name" required maxLength={160} /></label><label>HT number<input name="roll_number" required maxLength={64} /></label><label>Email<input name="email" type="email" required /></label><label>Temporary password<input name="password" type="password" minLength={8} required /></label><label>Branch<input name="department" required maxLength={120} /></label><label>Batch<input name="batch" required maxLength={64} placeholder="e.g. 2024–2028" /></label><label>Semester<input name="semester" type="number" min={1} max={20} defaultValue={1} required /></label><button className="primary-button" disabled={busy} type="submit">{busy ? 'Saving…' : 'Create student'}</button>
            </form>
          </article>
          <article className="panel admin-list-panel"><div className="section-title"><h2>Student records</h2><p>{students.length} registered accounts</p></div><div className="table-wrap"><table><thead><tr><th>STUDENT</th><th>HT NUMBER</th><th>BRANCH</th><th>BATCH</th><th>SEMESTER</th></tr></thead><tbody>{students.map((student) => <tr key={student.id}><td><strong>{student.full_name}</strong><div className="subject-code">{student.email}</div></td><td>{student.roll_number}</td><td>{student.department}</td><td>{student.batch}</td><td>{student.semester}</td></tr>)}{!students.length && <tr><td className="empty-table" colSpan={5}>No student records yet.</td></tr>}</tbody></table></div></article>
        </section>}
        {tab === 'Faculty' && <section className="admin-layout">
          <div className="admin-form-stack">
            <article className="panel admin-form-panel"><div className="section-title"><h2>Add faculty member</h2><p>Create a local faculty sign-in.</p></div>
              <form className="admin-form" onSubmit={(event) => void submit(event, addFaculty, 'Faculty account created.')}><label>Full name<input name="full_name" required maxLength={160} /></label><label>Staff number<input name="staff_number" required maxLength={64} /></label><label>Email<input name="email" type="email" required /></label><label>Temporary password<input name="password" type="password" minLength={8} required /></label><button className="primary-button" disabled={busy} type="submit">{busy ? 'Saving…' : 'Create faculty'}</button></form>
            </article>
            <article className="panel admin-form-panel"><div className="section-title"><h2>Add subject</h2><p>Subjects can be assigned to class sections.</p></div>
              <form className="admin-form" onSubmit={(event) => void submit(event, addSubject, 'Subject created.')}><label>Subject code<input name="code" required maxLength={32} /></label><label>Subject name<input name="name" required maxLength={160} /></label><label>Department<input name="department" required maxLength={120} /></label><button className="primary-button" disabled={busy} type="submit">Create subject</button></form>
            </article>
          </div>
          <article className="panel admin-list-panel"><div className="section-title"><h2>Faculty directory</h2><p>{faculty.length} registered accounts</p></div><div className="table-wrap"><table><thead><tr><th>FACULTY</th><th>STAFF NUMBER</th><th>EMAIL</th></tr></thead><tbody>{faculty.map((person) => <tr key={person.id}><td>{person.full_name}</td><td>{person.staff_number}</td><td>{person.email}</td></tr>)}{!faculty.length && <tr><td className="empty-table" colSpan={3}>No faculty records yet.</td></tr>}</tbody></table></div><div className="section-title subject-list-heading"><h2>Subjects</h2><p>{subjects.length} active subjects</p></div><div className="subject-list">{subjects.map((subject) => <div key={subject.id}><strong>{subject.code}</strong><span>{subject.name}</span><small>{subject.department}</small></div>)}{!subjects.length && <p className="empty-copy">No subjects created yet.</p>}</div></article>
        </section>}
        {tab === 'Classes' && <section className="admin-layout">
          <div className="admin-form-stack">
            <article className="panel admin-form-panel"><div className="section-title"><h2>Create class section</h2><p>Select existing subject and faculty IDs.</p></div>
              <form className="admin-form" onSubmit={(event) => void submit(event, addClass, 'Class section created.')}><label>Subject<select name="subject_id" required defaultValue="">{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.code} · {subject.name} (#{subject.id})</option>)}</select></label><label>Faculty<select name="faculty_id" required defaultValue="">{faculty.map((person) => <option key={person.id} value={person.id}>{person.full_name} (#{person.id})</option>)}</select></label><label>Section<input name="section_code" required maxLength={32} /></label><label>Room<input name="room" maxLength={80} /></label><button className="primary-button" disabled={busy || !subjects.length || !faculty.length} type="submit">Create class</button></form>
            </article>
            <article className="panel admin-form-panel"><div className="section-title"><h2>Enroll student</h2><p>Enrollment is required before check-in.</p></div>
              <form className="admin-form" onSubmit={(event) => void submit(event, addEnrollment, 'Student enrolled in class.')}><label>Student<select name="student_id" required defaultValue="">{students.map((student) => <option key={student.id} value={student.id}>{student.roll_number} · {student.full_name}</option>)}</select></label><label>Class section<select name="class_section_id" required defaultValue="">{classes.map((section) => <option key={section.id} value={section.id}>{section.subject_code} · Section {section.section_code} (#{section.id})</option>)}</select></label><button className="primary-button" disabled={busy || !students.length || !classes.length} type="submit">Enroll student</button></form>
            </article>
          </div>
          <article className="panel admin-list-panel"><div className="section-title"><h2>Class sections</h2><p>{classes.length} available sections</p></div><div className="table-wrap"><table><thead><tr><th>SUBJECT</th><th>SECTION</th><th>FACULTY</th><th>ENROLLED</th></tr></thead><tbody>{classes.map((section) => <tr key={section.id}><td><strong>{section.subject_code}</strong><div className="subject-code">{section.subject_name}</div></td><td>{section.section_code}<div className="subject-code">{section.room || 'Room not set'}</div></td><td>{section.faculty_name}</td><td>{section.enrolled_count}</td></tr>)}{!classes.length && <tr><td className="empty-table" colSpan={4}>No class sections yet.</td></tr>}</tbody></table></div></article>
        </section>}
        <footer className="page-footer"><span>Campus Attendance <b>·</b> Local development build</span><span>No biometric data is collected</span></footer>
      </main>
    </div>
  )
}
