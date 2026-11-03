const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

export type AuthUser = {
  id: number
  email: string
  role: 'admin' | 'faculty' | 'student'
  display_name: string
}

export type LoginResult = {
  access_token: string
  token_type: string
  user: AuthUser
}

export type ClassSection = {
  id: number
  subject_code: string
  subject_name: string
  section_code: string
  room: string
  enrolled_count: number
}

export type AttendanceSession = {
  id: number
  class_section_id: number
  subject_code: string
  subject_name: string
  section_code: string
  room: string
  started_at: string
  active: boolean
}

export type AttendanceEntry = {
  student_id: number
  full_name: string
  roll_number: string
  status: string
  checked_in_at: string
}

export type SessionDashboard = {
  session: AttendanceSession
  enrolled_count: number
  present_count: number
  attendance: AttendanceEntry[]
}

export type SessionStudent = {
  student_id: number
  full_name: string
  roll_number: string
  present: boolean
}

export type QrToken = {
  token: string
  expires_at: string
  refresh_after_seconds: number
}

export type StudentAttendance = {
  subject_code: string
  subject_name: string
  section_code: string
  status: string
  checked_in_at: string
}

export type AdminStudent = {
  id: number
  full_name: string
  roll_number: string
  email: string
  department: string
  batch: string
  semester: number
  active: boolean
}

export type FacultyRecord = {
  id: number
  full_name: string
  staff_number: string
  email: string
}

export type SubjectRecord = {
  id: number
  code: string
  name: string
  department: string
}

export type AdminClassRecord = {
  id: number
  subject_code: string
  subject_name: string
  section_code: string
  room: string
  faculty_name: string
  enrolled_count: number
}

async function request<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(typeof data.detail === 'string' ? data.detail : `Request failed (${response.status}).`)
  }
  return data as T
}

export const api = {
  login: (email: string, password: string) => request<LoginResult>('/auth/login', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }),
  classes: (token: string) => request<ClassSection[]>('/faculty/classes', token),
  activeSessions: (token: string) => request<AttendanceSession[]>('/sessions/active', token),
  startSession: (token: string, classSectionId: number) => request<AttendanceSession>('/sessions', token, {
    method: 'POST',
    body: JSON.stringify({ class_section_id: classSectionId }),
  }),
  endSession: (token: string, sessionId: number) => request<AttendanceSession>(`/sessions/${sessionId}/end`, token, {
    method: 'POST',
  }),
  qrToken: (token: string, sessionId: number) => request<QrToken>(`/sessions/${sessionId}/qr`, token),
  dashboard: (token: string, sessionId: number) => request<SessionDashboard>(`/sessions/${sessionId}/dashboard`, token),
  sessionRoster: (token: string, sessionId: number) => request<SessionStudent[]>(`/sessions/${sessionId}/enrollments`, token),
  checkIn: (token: string, qrToken: string) => request<{ status: string; checked_in_at?: string }>('/attendance/check-in', token, {
    method: 'POST',
    body: JSON.stringify({ qr_token: qrToken }),
  }),
  studentAttendance: (token: string) => request<StudentAttendance[]>('/student/attendance', token),
  adminStudents: (token: string) => request<AdminStudent[]>('/admin/students', token),
  adminFaculty: (token: string) => request<FacultyRecord[]>('/admin/faculty', token),
  adminSubjects: (token: string) => request<SubjectRecord[]>('/admin/subjects', token),
  adminClasses: (token: string) => request<AdminClassRecord[]>('/admin/classes', token),
  createStudent: (token: string, value: { email: string; password: string; full_name: string; roll_number: string; department: string; batch: string; semester: number }) => request('/admin/students', token, { method: 'POST', body: JSON.stringify(value) }),
  createFaculty: (token: string, value: { email: string; password: string; full_name: string; staff_number: string }) => request('/admin/faculty', token, { method: 'POST', body: JSON.stringify(value) }),
  createSubject: (token: string, value: { code: string; name: string; department: string }) => request('/admin/subjects', token, { method: 'POST', body: JSON.stringify(value) }),
  createClass: (token: string, value: { subject_id: number; faculty_id: number; section_code: string; room: string }) => request('/admin/classes', token, { method: 'POST', body: JSON.stringify(value) }),
  enrollStudent: (token: string, value: { student_id: number; class_section_id: number }) => request('/admin/enrollments', token, { method: 'POST', body: JSON.stringify(value) }),
  downloadReport: async (token: string, sessionId: number) => {
    const response = await fetch(`${API_BASE}/sessions/${sessionId}/report.csv`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error(typeof data.detail === 'string' ? data.detail : `Request failed (${response.status}).`)
    }
    return response.blob()
  },
  manualCheckIn: (token: string, sessionId: number, studentId: number, reason: string) => request<{ status: string; checked_in_at?: string }>(
    `/sessions/${sessionId}/attendance/${studentId}/manual?reason=${encodeURIComponent(reason)}`,
    token,
    { method: 'POST' },
  ),
}
