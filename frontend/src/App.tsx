import { useState } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  GraduationCap,
  LayoutDashboard,
  Plus,
  Search,
  Settings2,
  Users,
} from 'lucide-react'

type IconComponent = typeof LayoutDashboard

const navigation: { label: string; icon: IconComponent }[] = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Classes', icon: BookOpen },
  { label: 'Students', icon: Users },
  { label: 'Reports', icon: ClipboardCheck },
]

const sessions = [
  { subject: 'Database Systems', code: 'CS 302', room: 'Lab 204', time: '09:00 AM', present: '28 / 32', state: 'Completed' },
  { subject: 'Software Engineering', code: 'CS 410', room: 'Room 18', time: '11:30 AM', present: '—', state: 'Upcoming' },
  { subject: 'Computer Networks', code: 'CS 315', room: 'Lab 108', time: '02:00 PM', present: '—', state: 'Upcoming' },
]

function App() {
  const [activePage, setActivePage] = useState('Overview')
  const [sessionActive, setSessionActive] = useState(false)

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview" aria-label="Campus Attendance home">
          <span className="brand-mark"><GraduationCap size={21} strokeWidth={2.2} /></span>
          <span className="brand-copy"><strong>campus</strong><small>ATTENDANCE</small></span>
        </a>

        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {navigation.map(({ label, icon: Icon }) => (
            <button
              className={`nav-item ${activePage === label ? 'selected' : ''}`}
              key={label}
              onClick={() => setActivePage(label)}
              type="button"
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
              {label === 'Classes' && <span className="nav-count">4</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button className="nav-item" type="button"><Settings2 size={18} /><span>Settings</span></button>
          <button className="nav-item" type="button"><CircleHelp size={18} /><span>Help center</span></button>
          <div className="profile-mini">
            <div className="avatar">AM</div>
            <div className="profile-copy"><strong>Alex Morgan</strong><small>Faculty</small></div>
            <ChevronDown size={16} className="profile-chevron" />
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span><strong>{activePage}</strong></div>
          <div className="topbar-actions">
            <span className="local-indicator"><span className="status-dot" />LOCAL PREVIEW</span>
            <button className="icon-button" type="button" aria-label="Search"><Search size={18} /></button>
            <button className="icon-button notification-button" type="button" aria-label="Notifications"><Bell size={18} /><i /></button>
            <div className="top-avatar">AM</div>
          </div>
        </header>

        <div className="page-content">
          <div className="preview-notice"><span>Preview mode</span><span>Sample figures and session actions are not saved yet.</span></div>

          {activePage === 'Overview' ? (
            <>
              <section className="page-heading">
                <div>
                  <div className="eyebrow">MONDAY, OCTOBER 19, 2026</div>
                  <h1>Good morning, Alex<span>.</span></h1>
                  <p>Here’s what’s happening with your classes today.</p>
                </div>
                <button className={`primary-button ${sessionActive ? 'end-button' : ''}`} onClick={() => setSessionActive(!sessionActive)} type="button">
                  {sessionActive ? <Check size={17} /> : <Plus size={17} />}
                  {sessionActive ? 'Session active' : 'Start attendance'}
                </button>
              </section>

              <section className="metric-grid" aria-label="Attendance summary">
                <article className="metric-card">
                  <div className="metric-top"><span>Students enrolled</span><span className="metric-icon green"><Users size={17} /></span></div>
                  <div className="metric-value">126</div>
                  <div className="metric-foot"><span className="delta up"><ArrowUpRight size={14} /> 8</span><span>across your classes</span></div>
                </article>
                <article className="metric-card">
                  <div className="metric-top"><span>Marked present</span><span className="metric-icon yellow"><Check size={17} /></span></div>
                  <div className="metric-value">28</div>
                  <div className="metric-foot"><span>in today’s completed sessions</span></div>
                </article>
                <article className="metric-card">
                  <div className="metric-top"><span>Sessions today</span><span className="metric-icon blue"><CalendarDays size={17} /></span></div>
                  <div className="metric-value">3</div>
                  <div className="metric-foot"><span>1 completed</span><span className="foot-divider">·</span><span>2 upcoming</span></div>
                </article>
                <article className="metric-card">
                  <div className="metric-top"><span>Average attendance</span><span className="metric-icon coral"><ArrowDownRight size={17} /></span></div>
                  <div className="metric-value">87<span className="percent">%</span></div>
                  <div className="metric-foot"><span>across active enrollments</span></div>
                </article>
              </section>

              <section className="content-grid">
                <article className="panel sessions-panel">
                  <div className="panel-heading">
                    <div><h2>Today’s sessions</h2><p>Your scheduled classes and attendance</p></div>
                    <button className="text-button" type="button" onClick={() => setActivePage('Classes')}>View classes <span>→</span></button>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>SUBJECT</th><th>TIME & ROOM</th><th>ATTENDANCE</th><th>STATUS</th></tr></thead>
                      <tbody>
                        {sessions.map((session) => (
                          <tr key={session.code}>
                            <td><div className="subject-name">{session.subject}</div><div className="subject-code">{session.code}</div></td>
                            <td><div className="time-cell"><Clock3 size={14} />{session.time}</div><div className="room-cell">{session.room}</div></td>
                            <td className="attendance-cell">{session.present}</td>
                            <td><span className={`session-status ${session.state === 'Completed' ? 'completed' : ''}`}><i />{session.state}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>

                <article className="panel next-panel">
                  <div className="panel-heading"><div><h2>Next up</h2><p>Your next scheduled class</p></div><span className="calendar-icon"><CalendarDays size={18} /></span></div>
                  <div className="next-course"><div className="course-mark">CS</div><div><strong>Software Engineering</strong><span>CS 410 · Section A</span></div></div>
                  <div className="next-details"><div><span>STARTS IN</span><strong>11:30 AM</strong></div><div><span>LOCATION</span><strong>Room 18</strong></div></div>
                  <button className="outline-button" type="button" onClick={() => setSessionActive(true)}>{sessionActive ? 'Session is active' : 'Prepare attendance'}<span>→</span></button>
                </article>
              </section>

              <footer className="page-footer"><span>Campus Attendance <b>·</b> Local development build</span><span>Data shown is illustrative</span></footer>
            </>
          ) : (
            <section className="empty-module">
              <div className="empty-icon"><BookOpen size={22} /></div>
              <div className="eyebrow">NEXT MODULE</div>
              <h1>{activePage}</h1>
              <p>This section will be added in the next implementation step.</p>
              <button className="text-button" onClick={() => setActivePage('Overview')} type="button">← Back to overview</button>
            </section>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
