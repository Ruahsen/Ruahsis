-- =====================================================================
--  RosarioSIS (ASCII Web Edition) -- SQLite schema
--  Faithful to the RosarioSIS relational model, simplified where the
--  original relies on PostgreSQL specific features.
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- SETUP
CREATE TABLE IF NOT EXISTS schools (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  title          TEXT NOT NULL,
  address        TEXT,
  city           TEXT,
  state          TEXT,
  zip            TEXT,
  phone          TEXT,
  principal      TEXT,
  website        TEXT,
  short_name     TEXT,
  reporting_gp   REAL DEFAULT 0,
  reporting_scale REAL DEFAULT 100,
  created_at     INTEGER
);

CREATE TABLE IF NOT EXISTS school_years (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id  INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  short_name TEXT,
  start_date TEXT,
  end_date   TEXT,
  is_current INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);

-- MP type: year | semester | quarter | progress
CREATE TABLE IF NOT EXISTS marking_periods (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id      INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  school_year_id INTEGER REFERENCES school_years(id) ON DELETE CASCADE,
  parent_id      INTEGER REFERENCES marking_periods(id) ON DELETE CASCADE,
  mp_type        TEXT NOT NULL DEFAULT 'quarter',
  title          TEXT NOT NULL,
  short_name     TEXT,
  sort_order     INTEGER DEFAULT 0,
  start_date     TEXT,
  end_date       TEXT,
  does_grades    INTEGER DEFAULT 1,
  does_comments  INTEGER DEFAULT 1,
  does_exam      INTEGER DEFAULT 0
);

-- Bell schedule periods
CREATE TABLE IF NOT EXISTS periods (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id   INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  short_name  TEXT,
  sort_order  INTEGER DEFAULT 0,
  start_time  TEXT,
  end_time    TEXT,
  length_min  INTEGER DEFAULT 50
);

CREATE TABLE IF NOT EXISTS grade_levels (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id     INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  short_name    TEXT,
  sort_order    INTEGER DEFAULT 0,
  next_grade_id INTEGER
);

CREATE TABLE IF NOT EXISTS grade_scales (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id  INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  comment    TEXT,
  hr_gpa     REAL DEFAULT 4.0,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS grade_scale_breakdowns (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  grade_scale_id INTEGER NOT NULL REFERENCES grade_scales(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  short_name     TEXT,
  breakoff       REAL NOT NULL DEFAULT 0,
  gpa_value      REAL DEFAULT 0,
  sort_order     INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS course_subjects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id  INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  short_name TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS enrollment_codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id  INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  short_name TEXT,
  type       TEXT NOT NULL DEFAULT 'add', -- add | drop | roll
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS attendance_codes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id    INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  short_name   TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'absent', -- official|present|absent|late|excused
  state_code   TEXT,
  sort_order   INTEGER DEFAULT 0,
  is_default   INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS discipline_categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id  INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  short_name TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS discipline_actions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id  INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  short_name TEXT,
  sort_order INTEGER DEFAULT 0
);

-- ---------------------------------------------------------------- PEOPLE
CREATE TABLE IF NOT EXISTS staff (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id     TEXT UNIQUE,
  username     TEXT UNIQUE,
  password     TEXT,
  first_name   TEXT NOT NULL,
  middle_name  TEXT,
  last_name    TEXT NOT NULL,
  title        TEXT,          -- Mr / Ms / Dr
  profile      TEXT NOT NULL DEFAULT 'none', -- admin|teacher|parent|student|none
  profile_id   INTEGER DEFAULT 0,
  email        TEXT,
  phone        TEXT,
  home_phone   TEXT,
  cell_phone   TEXT,
  address      TEXT,
  city         TEXT,
  state        TEXT,
  zip          TEXT,
  school_id    INTEGER REFERENCES schools(id) ON DELETE SET NULL,
  is_admin     INTEGER DEFAULT 0,
  is_active    INTEGER DEFAULT 1,
  last_login   INTEGER,
  failed_logins INTEGER DEFAULT 0,
  created_at   INTEGER,
  updated_at   INTEGER
);

CREATE TABLE IF NOT EXISTS students (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id     TEXT UNIQUE,
  alt_id         TEXT,
  first_name     TEXT NOT NULL,
  middle_name    TEXT,
  last_name      TEXT NOT NULL,
  preferred_name TEXT,
  name_suffix    TEXT,
  gender         TEXT,
  birthdate      TEXT,
  grade_level    TEXT,
  school_id      INTEGER REFERENCES schools(id) ON DELETE SET NULL,
  email          TEXT,
  phone          TEXT,
  address        TEXT,
  city           TEXT,
  state          TEXT,
  zip            TEXT,
  ethnicity      TEXT,
  language       TEXT,
  is_active      INTEGER DEFAULT 1,
  enrollment_date TEXT,
  staff_id       INTEGER REFERENCES staff(id) ON DELETE SET NULL, -- portal login
  photo          TEXT,
  created_at     INTEGER,
  updated_at     INTEGER
);

CREATE TABLE IF NOT EXISTS student_enrollment (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id     INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_id      INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  school_year_id INTEGER REFERENCES school_years(id) ON DELETE CASCADE,
  grade_level    TEXT,
  start_date     TEXT,
  end_date       TEXT,
  enrollment_code TEXT,  -- RosarioSIS: ENROLLMENT_CODE / DROP_CODE
  drop_code      TEXT,
  calendar_id    INTEGER,
  next_school    TEXT,
  comment        TEXT
);

-- Contacts / parents / emergency contacts (RosarioSIS "people")
CREATE TABLE IF NOT EXISTS students_join_people (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  person_id   INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  relationship TEXT,
  is_emergency INTEGER DEFAULT 0,
  is_custodial INTEGER DEFAULT 0,
  UNIQUE(student_id, person_id)
);

CREATE TABLE IF NOT EXISTS student_medical (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id     INTEGER NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
  physician      TEXT,
  physician_phone TEXT,
  insurance      TEXT,
  policy_number  TEXT,
  allergies      TEXT,
  medications    TEXT,
  immunizations  TEXT,
  notes          TEXT,
  date_updated   TEXT
);

CREATE TABLE IF NOT EXISTS student_notes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id   INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  staff_id     INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  school_id    INTEGER REFERENCES schools(id) ON DELETE CASCADE,
  note_date    TEXT,
  category     TEXT DEFAULT 'General',
  title        TEXT,
  note         TEXT,
  created_at   INTEGER
);

-- ---------------------------------------------------------------- SCHEDULE
CREATE TABLE IF NOT EXISTS courses (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id     INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  subject_id    INTEGER REFERENCES course_subjects(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  short_name    TEXT,
  grade_level   TEXT,
  credit_hours  REAL DEFAULT 1.0,
  description   TEXT,
  is_active     INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS course_periods (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id         INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  school_id         INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  school_year_id    INTEGER REFERENCES school_years(id) ON DELETE CASCADE,
  teacher_id        INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  period_id         INTEGER REFERENCES periods(id) ON DELETE SET NULL,
  mp_id             INTEGER REFERENCES marking_periods(id) ON DELETE SET NULL,
  grade_scale_id    INTEGER REFERENCES grade_scales(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  short_name        TEXT,
  room              TEXT,
  total_seats       INTEGER DEFAULT 30,
  filled_seats      INTEGER DEFAULT 0,
  credit_attempted  REAL DEFAULT 1.0,
  credit_earned     REAL DEFAULT 1.0,
  does_attendance   INTEGER DEFAULT 1,
  does_honor_roll   INTEGER DEFAULT 1,
  is_active         INTEGER DEFAULT 1
);

-- Student schedule (RosarioSIS SCHEDULE table)
CREATE TABLE IF NOT EXISTS schedule (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id       INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_period_id INTEGER NOT NULL REFERENCES course_periods(id) ON DELETE CASCADE,
  mp_id            INTEGER REFERENCES marking_periods(id) ON DELETE SET NULL,
  start_date       TEXT,
  end_date         TEXT,
  seats            INTEGER DEFAULT 1,
  UNIQUE(student_id, course_period_id)
);

-- ---------------------------------------------------------------- GRADES
CREATE TABLE IF NOT EXISTS gradebook_assignment_types (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id     INTEGER REFERENCES staff(id) ON DELETE CASCADE,
  course_id    INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  sort_order   INTEGER DEFAULT 0,
  final_weight REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS gradebook_assignments (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id         INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  course_period_id INTEGER NOT NULL REFERENCES course_periods(id) ON DELETE CASCADE,
  assignment_type_id INTEGER REFERENCES gradebook_assignment_types(id) ON DELETE SET NULL,
  mp_id            INTEGER REFERENCES marking_periods(id) ON DELETE SET NULL,
  title            TEXT NOT NULL,
  description      TEXT,
  points           REAL DEFAULT 100,
  weight           REAL DEFAULT 1,
  is_ec            INTEGER DEFAULT 0,
  assigned_date    TEXT,
  due_date         TEXT,
  sort_order       INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS gradebook_grades (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id    INTEGER NOT NULL REFERENCES gradebook_assignments(id) ON DELETE CASCADE,
  student_id       INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  points           REAL,
  is_exempt        INTEGER DEFAULT 0,
  comment          TEXT,
  UNIQUE(assignment_id, student_id)
);

-- Report card (marking period) grades
CREATE TABLE IF NOT EXISTS student_report_card_grades (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id       INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_period_id INTEGER NOT NULL REFERENCES course_periods(id) ON DELETE CASCADE,
  mp_id            INTEGER NOT NULL REFERENCES marking_periods(id) ON DELETE CASCADE,
  grade_letter     TEXT,
  grade_percent    REAL,
  gpa_points       REAL DEFAULT 0,
  unweighted_gp    REAL DEFAULT 0,
  weighted_gp      REAL DEFAULT 0,
  comment          TEXT,
  UNIQUE(student_id, course_period_id, mp_id)
);

CREATE TABLE IF NOT EXISTS report_card_comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id  INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  course_id  INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0
);

-- ---------------------------------------------------------------- ATTENDANCE
CREATE TABLE IF NOT EXISTS attendance_calendar (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id   INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  school_date TEXT NOT NULL,
  minutes     INTEGER DEFAULT 360,
  is_school_day INTEGER DEFAULT 1,
  UNIQUE(school_id, school_date)
);

CREATE TABLE IF NOT EXISTS attendance_day (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id      INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_id       INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  school_date     TEXT NOT NULL,
  minutes_present INTEGER DEFAULT 0,
  minutes_absent  INTEGER DEFAULT 0,
  state_value     REAL DEFAULT 1.0,
  attendance_code TEXT,
  comment         TEXT,
  UNIQUE(student_id, school_date)
);

CREATE TABLE IF NOT EXISTS attendance_period (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id      INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_period_id INTEGER REFERENCES course_periods(id) ON DELETE CASCADE,
  school_id       INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  school_date     TEXT NOT NULL,
  period_id       INTEGER REFERENCES periods(id) ON DELETE SET NULL,
  attendance_code TEXT,
  attendance_reason TEXT,
  teacher_id      INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  UNIQUE(student_id, course_period_id, school_date)
);

-- ---------------------------------------------------------------- DISCIPLINE
CREATE TABLE IF NOT EXISTS discipline_referrals (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id        INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_id         INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  staff_id          INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  entry_date        TEXT,
  event_date        TEXT,
  category_id       INTEGER REFERENCES discipline_categories(id) ON DELETE SET NULL,
  action_id         INTEGER REFERENCES discipline_actions(id) ON DELETE SET NULL,
  title             TEXT,
  description       TEXT,
  consequence       TEXT,
  points            INTEGER DEFAULT 0,
  is_resolved       INTEGER DEFAULT 0
);

-- ---------------------------------------------------------------- FEES
CREATE TABLE IF NOT EXISTS student_fees (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_id   INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  amount      REAL DEFAULT 0,
  due_date    TEXT,
  comments    TEXT,
  created_at  INTEGER
);

CREATE TABLE IF NOT EXISTS student_payments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  fee_id      INTEGER REFERENCES student_fees(id) ON DELETE SET NULL,
  amount      REAL DEFAULT 0,
  payment_date TEXT,
  method      TEXT DEFAULT 'Cash',
  comments    TEXT,
  created_at  INTEGER
);

-- ---------------------------------------------------------------- MESSAGING
CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  from_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  to_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  subject     TEXT,
  body        TEXT,
  is_read     INTEGER DEFAULT 0,
  created_at  INTEGER
);

CREATE TABLE IF NOT EXISTS portal_notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id   INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  title       TEXT,
  body        TEXT,
  published   INTEGER DEFAULT 1,
  created_at  INTEGER
);

-- ---------------------------------------------------------------- SESSIONS
CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  staff_id    INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  student_id  INTEGER,
  created_at  INTEGER,
  expires_at  INTEGER,
  ip          TEXT
);

CREATE TABLE IF NOT EXISTS activity_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id   INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  username   TEXT,
  action     TEXT,
  detail     TEXT,
  created_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_students_name ON students(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_schedule_student ON schedule(student_id);
CREATE INDEX IF NOT EXISTS idx_cp_teacher ON course_periods(teacher_id);
CREATE INDEX IF NOT EXISTS idx_att_day ON attendance_day(student_id, school_date);
CREATE INDEX IF NOT EXISTS idx_gbg_assignment ON gradebook_grades(assignment_id);
