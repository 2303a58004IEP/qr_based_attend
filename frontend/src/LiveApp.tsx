import { useEffect, useRef, useState } from 'react'
import { Download } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { api, type AttendanceSession, type AuthUser, type ClassSection, type QrToken, type SessionDashboard, type SessionStudent, type StudentAttendance } from './api'
import AdminWorkspace from './AdminWorkspace'

const TOKEN_KEY = 'campus.access-token'
const USER_KEY = 'campus.user'

function readSavedUser(): AuthUser | null {
  try {
    const stored = localStorage.getItem(USER_KEY)
    return stored ? JSON.parse(stored) as AuthUser : null
  } catch {
    return null
  }
}

function LoginScreen({ onSuccess }: { onSuccess: (token: string, user: AuthUser) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = await api.login(email, password)
      onSuccess(result.access_token, result.user)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel">
        <a className="brand login-brand" href="#home" aria-label="Campus Attendance home">
          <span className="brand-mark"><span className="cap-glyph">C</span></span>
          <span className="brand-copy"><strong>campus</strong><small>ATTENDANCE</small></span>
        </a>
        <div className="eyebrow">LOCAL CLASSROOM WORKSPACE</div>
        <h1>Sign in to continue<span>.</span></h1>
        <p className="login-subtitle">Use your campus account to manage or check in to a class session.</p>
        <form className="login-form" onSubmit={submit}>
          <label>Email address<input autoComplete="username" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Password<input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="primary-button login-submit" disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <div className="login-note">Demo password for every account: <code>demo@123</code></div>
      </section>
      <aside className="login-aside"><span>01 / SESSION CHECK-IN</span><strong>Attendance,<br />without the guesswork.</strong><p>Verified student accounts. Short-lived class codes. A clear record for every session.</p></aside>
    </main>
  )
}

function FacultyWorkspace({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [classes, setClasses] = useState<ClassSection[]>([])
  const [selectedClassId, setSelectedClassId] = useState('')
  const [session, setSession] = useState<AttendanceSession | null>(null)
  const [dashboard, setDashboard] = useState<SessionDashboard | null>(null)
  const [roster, setRoster] = useState<SessionStudent[]>([])
  const [qr, setQr] = useState<QrToken | null>(null)
  const [qrRefreshAt, setQrRefreshAt] = useState(0)
  const [error, setError] = useState('')
  const [manualNotice, setManualNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let mounted = true
    Promise.all([api.classes(token), api.activeSessions(token)])
      .then(([classList, active]) => {
        if (!mounted) return
        setClasses(classList)
        setSelectedClassId(classList[0] ? String(classList[0].id) : '')
        setSession(active[0] ?? null)
        setError('')
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not load faculty classes.'))
    return () => { mounted = false }
  }, [token])

  useEffect(() => {
    if (!session) {
      setDashboard(null)
      return
    }
    let mounted = true
    const refresh = () => Promise.all([api.dashboard(token, session.id), api.sessionRoster(token, session.id)])
      .then(([value, students]) => {
        if (mounted) {
          setDashboard(value)
          setRoster(students)
        }
      })
      .catch((reason: unknown) => { if (mounted) setError(reason instanceof Error ? reason.message : 'Dashboard refresh failed.') })
    void refresh()
    const timer = window.setInterval(() => { void refresh() }, 3000)
    return () => { mounted = false; window.clearInterval(timer) }
  }, [session, token])

  useEffect(() => {
    if (!session) {
      setQr(null)
      setQrRefreshAt(0)
      return
    }
    let mounted = true
    let timer = 0
    const refresh = async () => {
      try {
        const value = await api.qrToken(token, session.id)
        if (!mounted) return
        setQr(value)
        setQrRefreshAt(Date.now() + value.refresh_after_seconds * 1000)
        timer = window.setTimeout(() => { void refresh() }, value.refresh_after_seconds * 1000)
      } catch (reason) {
        if (mounted) {
          setError(reason instanceof Error ? reason.message : 'Could not refresh QR code.')
          timer = window.setTimeout(() => { void refresh() }, 5000)
        }
      }
    }
    void refresh()
    return () => { mounted = false; window.clearTimeout(timer) }
  }, [session, token])

  async function startSession() {
    if (!selectedClassId) return
    setBusy(true)
    setError('')
    try {
      const created = await api.startSession(token, Number(selectedClassId))
      setSession(created)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not start session.')
    } finally {
      setBusy(false)
    }
  }

  async function endSession() {
    if (!session) return
    setBusy(true)
    setError('')
    try {
      await api.endSession(token, session.id)
      setSession(null)
      const active = await api.activeSessions(token)
      setSession(active[0] ?? null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not end session.')
    } finally {
      setBusy(false)
    }
  }

  async function manualCheckIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!session) return
    const form = event.currentTarget
    const values = new FormData(form)
    setBusy(true)
    setError('')
    setManualNotice('')
    try {
      await api.manualCheckIn(token, session.id, Number(values.get('student_id')), String(values.get('reason')))
      form.reset()
      setManualNotice('Manual attendance recorded with an audit reason.')
      const [updatedDashboard, updatedRoster] = await Promise.all([
        api.dashboard(token, session.id),
        api.sessionRoster(token, session.id),
      ])
      setDashboard(updatedDashboard)
      setRoster(updatedRoster)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Manual check-in failed.')
    } finally {
      setBusy(false)
    }
  }

  async function downloadReport() {
    if (!session) return
    try {
      const report = await api.downloadReport(token, session.id)
      const url = URL.createObjectURL(report)
      const link = document.createElement('a')
      link.href = url
      link.download = `session-${session.id}-attendance.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not download report.')
    }
  }

  const remaining = qr ? Math.max(0, Math.ceil((qrRefreshAt - Date.now()) / 1000)) : 0

  return (
    <WorkspaceShell roleLabel="Faculty" onLogout={onLogout}>
      <div className="workspace-heading">
        <div><div className="eyebrow">LIVE CLASSROOM SESSION</div><h1>Attendance desk<span>.</span></h1><p>Open a class session and share the rotating check-in code.</p></div>
        <span className="live-badge"><i />{session ? 'SESSION LIVE' : 'NO ACTIVE SESSION'}</span>
      </div>
      {error && <div className="notice-error" role="alert">{error}</div>}
      {!session ? (
        <section className="start-session panel">
          <div className="section-title"><h2>Start a session</h2><p>Only your assigned classes are listed.</p></div>
          {classes.length ? (
            <div className="session-controls">
              <label>Class section<select value={selectedClassId} onChange={(event) => setSelectedClassId(event.target.value)}>
                {classes.map((item) => <option key={item.id} value={item.id}>{item.subject_code} · {item.subject_name} · Section {item.section_code}</option>)}
              </select></label>
              <button className="primary-button" disabled={busy} onClick={() => void startSession()} type="button">{busy ? 'Starting…' : 'Start attendance'}</button>
            </div>
          ) : <p className="empty-copy">No assigned classes found. Ask an administrator to add your faculty profile and class section.</p>}
        </section>
      ) : (
        <>
          <section className="session-banner">
            <div><div className="eyebrow">{session.subject_code} · SECTION {session.section_code}</div><h2>{session.subject_name}</h2><p>{session.room || 'Room not set'} <span>·</span> Started {new Date(session.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p></div>
            <button className="outline-button end-session" disabled={busy} onClick={() => void endSession()} type="button">End session</button>
          </section>
          <section className="faculty-grid">
            <article className="panel qr-panel">
              <div className="section-title"><h2>Student check-in</h2><p>Code rotates every 2 minutes</p></div>
              <div className="qr-frame">{qr ? <QRCodeSVG value={qr.token} size={220} level="M" includeMargin /> : <div className="qr-loading">Preparing secure code…</div>}</div>
              <div className="qr-countdown">{qr ? `Refreshes in ${remaining}s` : 'Connecting to attendance API'}</div>
              <p className="qr-caption">Students must sign in on their own device before scanning.</p>
            </article>
            <article className="panel summary-panel">
              <div className="section-title"><h2>Session totals</h2><p>Updates automatically every few seconds</p></div>
              <div className="session-metrics"><div><span>Verified</span><strong>{dashboard?.present_count ?? 0}</strong></div><div><span>Enrolled</span><strong>{dashboard?.enrolled_count ?? 0}</strong></div><div><span>Attendance</span><strong>{dashboard?.enrolled_count ? Math.round((dashboard.present_count / dashboard.enrolled_count) * 100) : 0}<small>%</small></strong></div></div>
              <div className="verified-note"><span className="verified-dot" />Verified check-ins are shown in green. This workflow does not identify people using a camera.</div>
            </article>
          </section>
          <section className="panel manual-panel"><div className="section-title"><h2>Manual check-in</h2><p>Use when a student cannot scan; a reason is recorded in the audit log.</p></div>
            <form className="manual-form" onSubmit={(event) => void manualCheckIn(event)}><label>Enrolled student<select name="student_id" required defaultValue="" disabled={!roster.some((student) => !student.present)}><option value="" disabled>Select a student</option>{roster.filter((student) => !student.present).map((student) => <option key={student.student_id} value={student.student_id}>{student.roll_number} · {student.full_name}</option>)}</select></label><label>Reason<input name="reason" required minLength={5} maxLength={500} placeholder="For example: camera not available" /></label><button className="outline-button" disabled={busy || !roster.some((student) => !student.present)} type="submit">Record manual attendance</button></form>
            {manualNotice && <div className="admin-success" role="status">{manualNotice}</div>}
          </section>
          <section className="panel roster-panel">
            <div className="section-title roster-title"><div><h2>Verified students</h2><p>{dashboard?.present_count ?? 0} check-ins recorded in this session</p></div><div className="roster-actions"><button className="download-button" onClick={() => void downloadReport()} type="button"><Download size={15} />Download CSV</button><span className="roster-live"><i />LIVE</span></div></div>
            <div className="table-wrap"><table><thead><tr><th>STUDENT</th><th>ROLL NUMBER</th><th>TIME VERIFIED</th><th>METHOD</th></tr></thead><tbody>
              {dashboard?.attendance.map((entry) => <tr key={entry.student_id}><td><span className="verified-row-dot" />{entry.full_name}</td><td>{entry.roll_number}</td><td>{new Date(entry.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td><td><span className="method-pill">{entry.status === 'present' ? 'QR verified' : entry.status}</span></td></tr>)}
              {!dashboard?.attendance.length && <tr><td className="empty-table" colSpan={4}>No students checked in yet.</td></tr>}
            </tbody></table></div>
          </section>
        </>
      )}
    </WorkspaceShell>
  )
}

function StudentWorkspace({ token, onLogout }: { token: string; onLogout: () => void }) {
  const scannerContainerId = 'student-qr-scanner'
  const processing = useRef(false)
  const toastTimer = useRef<number | undefined>(undefined)
  const [message, setMessage] = useState('')
  const [toast, setToast] = useState('')
  const [resultState, setResultState] = useState<'success' | 'error' | ''>('')
  const [history, setHistory] = useState<StudentAttendance[]>([])

  async function loadHistory() {
    try { setHistory(await api.studentAttendance(token)) } catch { setHistory([]) }
  }

  useEffect(() => { void loadHistory() }, [token])

  useEffect(() => {
    let mounted = true
    let scanner: import('html5-qrcode').Html5QrcodeScanner | undefined
    void import('html5-qrcode').then(({ Html5QrcodeScanner }) => {
      if (!mounted) return
      scanner = new Html5QrcodeScanner(scannerContainerId, { fps: 8, qrbox: { width: 220, height: 220 } }, false)
      scanner.render(async (decodedText) => {
        if (processing.current) return
        processing.current = true
        try {
          const result = await api.checkIn(token, decodedText)
          setResultState('success')
          const confirmation = result.status === 'already_present'
            ? 'You are already marked present for this session.'
            : 'You have been marked as present.'
          setMessage(confirmation)
          setToast(confirmation)
          window.clearTimeout(toastTimer.current)
          toastTimer.current = window.setTimeout(() => setToast(''), 4000)
          await loadHistory()
        } catch (reason) {
          setResultState('error')
          const errorMessage = reason instanceof Error ? reason.message : 'Check-in failed.'
          setMessage(errorMessage)
          setToast(errorMessage)
          window.clearTimeout(toastTimer.current)
          toastTimer.current = window.setTimeout(() => setToast(''), 4000)
        } finally {
          window.setTimeout(() => { processing.current = false }, 1500)
        }
      }, () => undefined)
    })
    return () => {
      mounted = false
      window.clearTimeout(toastTimer.current)
      void scanner?.clear().catch(() => undefined)
    }
  }, [token])

  return (
    <WorkspaceShell roleLabel="Student" onLogout={onLogout}>
      {toast && <div className={`scan-toast ${resultState}`} role="status">{toast}</div>}
      <div className="workspace-heading"><div><div className="eyebrow">STUDENT CHECK-IN</div><h1>Welcome back<span>.</span></h1><p>Scan the QR code displayed by your faculty to check in to the active class.</p></div></div>
      <section className="student-grid">
        <article className="panel scanner-panel"><div className="section-title"><h2>Scan class code</h2><p>Camera access is used only to read the QR code.</p></div><div id={scannerContainerId} className="qr-reader" />{message && <div className={`scan-message ${resultState}`} role="status">{message}</div>}<p className="privacy-caption">No face scan or photo is taken. Your account and class enrollment are checked by the server.</p></article>
        <article className="panel student-history"><div className="section-title"><h2>Recent attendance</h2><p>Your recorded class check-ins</p></div><div className="table-wrap"><table><thead><tr><th>SUBJECT</th><th>DATE & TIME</th><th>STATUS</th></tr></thead><tbody>
          {history.map((item, index) => <tr key={`${item.subject_code}-${item.checked_in_at}-${index}`}><td><strong>{item.subject_code}</strong><div className="subject-code">{item.subject_name} · {item.section_code}</div></td><td>{new Date(item.checked_in_at).toLocaleString()}</td><td><span className="method-pill">{item.status}</span></td></tr>)}
          {!history.length && <tr><td className="empty-table" colSpan={3}>No attendance records yet.</td></tr>}
        </tbody></table></div></article>
      </section>
    </WorkspaceShell>
  )
}

function WorkspaceShell({ children, roleLabel, onLogout }: { children: React.ReactNode; roleLabel: string; onLogout: () => void }) {
  return (
    <div className="live-shell">
      <header className="live-topbar">
        <a className="brand" href="#home"><span className="brand-mark"><span className="cap-glyph">C</span></span><span className="brand-copy"><strong>campus</strong><small>ATTENDANCE</small></span></a>
        <div className="live-top-actions"><span className="local-indicator"><span className="status-dot" />LOCAL DEVELOPMENT</span><span className="role-chip">{roleLabel}</span><button className="signout-button" onClick={onLogout} type="button">Sign out</button></div>
      </header>
      <main className="live-content"><div className="preview-notice"><span>Local MVP</span><span>Attendance uses signed-in QR check-in; no biometric identification.</span></div>{children}<footer className="page-footer"><span>Campus Attendance <b>·</b> Local development build</span><span>Records stored in local database</span></footer></main>
    </div>
  )
}

export default function LiveApp() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? '')
  const [user, setUser] = useState<AuthUser | null>(readSavedUser)

  function acceptLogin(accessToken: string, authUser: AuthUser) {
    localStorage.setItem(TOKEN_KEY, accessToken)
    localStorage.setItem(USER_KEY, JSON.stringify(authUser))
    setToken(accessToken)
    setUser(authUser)
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setToken('')
    setUser(null)
  }

  if (!token || !user) return <LoginScreen onSuccess={acceptLogin} />
  if (user.role === 'faculty') return <FacultyWorkspace token={token} onLogout={logout} />
  if (user.role === 'student') return <StudentWorkspace token={token} onLogout={logout} />
  if (user.role === 'admin') return <AdminWorkspace token={token} onLogout={logout} />
  return <LoginScreen onSuccess={acceptLogin} />
}
