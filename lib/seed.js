'use strict';
/**
 * Seeds a realistic demo school: 1 high school, full setup, ~130 students,
 * staff, 30+ courses, course periods, schedules, gradebook, attendance,
 * discipline and fees.
 *
 *  Usage:  npm run seed
 */
const { open, initSchema, DB } = require('./db');
const { hashPassword } = require('./auth');

const db = new DB(initSchema(open()));

// ------------------------------------------------------------------ random
let _s = 20260909;
const rnd = () => { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (a) => a[Math.floor(rnd() * a.length)];
const chance = (p) => rnd() < p;
function shuffled(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
/** normal-ish distribution 0..1 */
function bell() { return (rnd() + rnd() + rnd()) / 3; }

const NOW = Date.now();
const pad = (n, w = 3) => String(n).padStart(w, '0');
const dstr = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

const FIRST = ['Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Ethan', 'Sophia', 'Mason', 'Isabella', 'Lucas', 'Mia', 'Oliver', 'Amelia', 'Elijah', 'Harper', 'James', 'Evelyn', 'Benjamin', 'Abigail', 'Sebastian', 'Emily', 'Jack', 'Charlotte', 'Henry', 'Madison', 'Owen', 'Ella', 'Samuel', 'Scarlett', 'Leo', 'Grace', 'Julian', 'Chloe', 'Levi', 'Victoria', 'Isaac', 'Riley', 'Gabriel', 'Aria', 'Caleb', 'Lily', 'Ryan', 'Aubrey', 'Nathan', 'Zoey', 'Isaiah', 'Penelope', 'Thomas', 'Layla', 'Charles', 'Nora', 'Hunter', 'Zoe', 'Eli', 'Hannah', 'Aaron', 'Luna', 'Landon', 'Savannah', 'Jonathan', 'Brooklyn', 'Adrian', 'Leah', 'Cameron', 'Audrey', 'Nolan', 'Claire', 'Ian', 'Lucy', 'Jeremiah', 'Anna', 'Easton', 'Samantha', 'Colton', 'Natalie', 'Cooper', 'Stella', 'Micah', 'Violet', 'Roman', 'Hazel', 'Xavier', 'Aurora', 'Jaxon', 'Ellie', 'Miles', 'Paisley', 'Wyatt', 'Skylar', 'Jayden', 'Nova', 'Dominic', 'Ruby', 'Austin', 'Eliana', 'Carter', 'Ivy', 'Chase', 'Sadie', 'Blake', 'Alice', 'Lincoln', 'Hailey', 'Carson', 'Bella'];
const LAST = ['Smith', 'Johnson', 'Williams', 'Brown', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores', 'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts', 'Gomez', 'Phillips', 'Evans', 'Turner', 'Diaz', 'Parker', 'Cruz', 'Edwards', 'Collins', 'Reyes', 'Stewart', 'Morris', 'Morales', 'Murphy', 'Cook', 'Rogers', 'Gutierrez', 'Ortiz', 'Morgan', 'Cooper', 'Peterson', 'Bailey', 'Reed', 'Kelly', 'Howard', 'Ramos', 'Kim', 'Cox', 'Ward'];
const CITIES = [['Springfield', 'IL', '62701'], ['Riverton', 'IL', '62561'], ['Fairview', 'IL', '61432'], ['Clarksdale', 'IL', '61611']];

// ================================================================== SETUP
console.log('\n[*] Seeding RUAHSIS demo database...\n');

db.exec('DELETE FROM sessions'); db.exec('DELETE FROM activity_log');
for (const t of ['gradebook_grades', 'schedule', 'student_report_card_grades', 'attendance_period', 'attendance_day',
  'discipline_referrals', 'student_payments', 'student_fees', 'student_notes', 'student_medical',
  'students_join_people', 'student_enrollment', 'students', 'gradebook_assignments',
  'gradebook_assignment_types', 'course_periods', 'courses', 'staff', 'attendance_calendar',
  'attendance_codes', 'enrollment_codes', 'discipline_actions', 'discipline_categories',
  'grade_scale_breakdowns', 'grade_scales', 'course_subjects', 'grade_levels', 'periods',
  'marking_periods', 'school_years', 'schools', 'messages', 'portal_notes']) {
  try { db.exec(`DELETE FROM ${t}`); } catch (_) {}
  try { db.run(`DELETE FROM sqlite_sequence WHERE name = ?`, [t]); } catch (_) {}
}

// ---- schools
const schoolId = db.run('INSERT INTO schools (title, short_name, address, city, state, zip, phone, principal, website, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
  ['Central High School', 'CHS', '1420 Elm Street', 'Springfield', 'IL', '62701', '(217) 555-0142', 'Dr. Margaret Chen', 'www.centralhigh.edu', NOW]).lastInsertRowid;
const school2 = db.run('INSERT INTO schools (title, short_name, address, city, state, zip, phone, principal, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
  ['Riverside Middle School', 'RMS', '88 Oak Avenue', 'Riverton', 'IL', '62561', '(217) 555-0199', 'Mr. Daniel Okafor', NOW]).lastInsertRowid;

// ---- school year
const SY_TITLE = '2026-2027';
const syStart = '2026-08-24', syEnd = '2027-06-04';
const syId = db.run('INSERT INTO school_years (school_id, title, short_name, start_date, end_date, is_current, sort_order) VALUES (?,?,?,?,?,?,?)',
  [schoolId, SY_TITLE, '26-27', syStart, syEnd, 1, 1]).lastInsertRowid;
db.run('INSERT INTO school_years (school_id, title, short_name, start_date, end_date, is_current, sort_order) VALUES (?,?,?,?,?,?,?)',
  [school2, SY_TITLE, '26-27', syStart, syEnd, 0, 1]);

// ---- marking periods
function mp(parent, type, title, short, start, end, sort, doesGrades = 1) {
  return db.run('INSERT INTO marking_periods (school_id, school_year_id, parent_id, mp_type, title, short_name, sort_order, start_date, end_date, does_grades, does_comments) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [schoolId, syId, parent, type, title, short, sort, start, end, doesGrades, doesGrades]).lastInsertRowid;
}
const FY = mp(null, 'year', 'Full Year 2026-2027', 'FY', syStart, syEnd, 1);
const S1 = mp(FY, 'semester', 'Semester 1', 'S1', '2026-08-24', '2027-01-15', 2);
const S2 = mp(FY, 'semester', 'Semester 2', 'S2', '2027-01-18', '2027-06-04', 3);
const Q1 = mp(S1, 'quarter', 'Quarter 1', 'Q1', '2026-08-24', '2026-10-23', 4);
const Q2 = mp(S1, 'quarter', 'Quarter 2', 'Q2', '2026-10-26', '2027-01-15', 5);
const Q3 = mp(S2, 'quarter', 'Quarter 3', 'Q3', '2027-01-18', '2027-03-26', 6);
const Q4 = mp(S2, 'quarter', 'Quarter 4', 'Q4', '2027-03-29', '2027-06-04', 7);
const QUARTERS = [Q1, Q2, Q3, Q4];
const QUARTER_DATES = [[Q1, '2026-08-24', '2026-10-23'], [Q2, '2026-10-26', '2027-01-15'], [Q3, '2027-01-18', '2027-03-26'], [Q4, '2027-03-29', '2027-06-04']];

// ---- periods (bell schedule)
const PERIOD_TIMES = [['08:00', '08:50'], ['08:55', '09:45'], ['09:50', '10:40'], ['10:45', '11:35'],
  ['11:40', '12:30'], ['12:35', '13:25'], ['13:30', '14:20'], ['14:25', '15:15']];
const periodIds = [];
PERIOD_TIMES.forEach(([s, e], i) => {
  periodIds.push(db.run('INSERT INTO periods (school_id, title, short_name, sort_order, start_time, end_time, length_min) VALUES (?,?,?,?,?,?,?)',
    [schoolId, 'Period ' + (i + 1), 'P' + (i + 1), i + 1, s, e, 50]).lastInsertRowid);
});

// ---- grade levels
const GRADE_TITLES = ['9th Grade', '10th Grade', '11th Grade', '12th Grade'];
const gradeLevelIds = GRADE_TITLES.map((t, i) =>
  db.run('INSERT INTO grade_levels (school_id, title, short_name, sort_order, next_grade_id) VALUES (?,?,?,?,?)',
    [schoolId, t, String(9 + i), i + 1, null]).lastInsertRowid);
for (let i = 0; i < gradeLevelIds.length - 1; i++)
  db.run('UPDATE grade_levels SET next_grade_id = ? WHERE id = ?', [gradeLevelIds[i + 1], gradeLevelIds[i]]);
const GRADE_SHORT = ['9', '10', '11', '12'];

// ---- grade scale
const gsId = db.run('INSERT INTO grade_scales (school_id, title, comment, hr_gpa, sort_order) VALUES (?,?,?,?,?)',
  [schoolId, 'Standard 4.0 Scale', 'Default high school scale', 4.0, 1]).lastInsertRowid;
const BREAKS = [['A+', 97, 4.33], ['A', 93, 4.0], ['A-', 90, 3.67], ['B+', 87, 3.33], ['B', 83, 3.0], ['B-', 80, 2.67],
  ['C+', 77, 2.33], ['C', 73, 2.0], ['C-', 70, 1.67], ['D+', 67, 1.33], ['D', 63, 1.0], ['F', 0, 0.0]];
const SCALE = [];
BREAKS.forEach(([t, b, g], i) => {
  db.run('INSERT INTO grade_scale_breakdowns (grade_scale_id, title, short_name, breakoff, gpa_value, sort_order) VALUES (?,?,?,?,?,?)',
    [gsId, t, t, b, g, i + 1]);
  SCALE.push({ title: t, breakoff: b, gpa: g });
});
SCALE.sort((a, b) => b.breakoff - a.breakoff);
const letterFor = (pct) => (SCALE.find((s) => pct >= s.breakoff) || SCALE[SCALE.length - 1]);

// ---- subjects
const SUBJECTS = ['Mathematics', 'English', 'Science', 'Social Studies', 'World Languages', 'Fine Arts', 'Physical Education', 'Technology'];
const subjectIds = {};
SUBJECTS.forEach((s, i) => { subjectIds[s] = db.run('INSERT INTO course_subjects (school_id, title, short_name, sort_order) VALUES (?,?,?,?)', [schoolId, s, s.slice(0, 4), i + 1]).lastInsertRowid; });

// ---- enrollment codes
[['New Enrollment', 'NEW', 'add'], ['Transfer In', 'TRIN', 'add'], ['Re-Enrollment', 'REEN', 'add'],
 ['Transferred Out', 'TROUT', 'drop'], ['Graduated', 'GRAD', 'drop'], ['Withdrawn', 'WD', 'drop'], ['Promoted', 'PROMO', 'roll']]
  .forEach(([t, s, ty], i) => db.run('INSERT INTO enrollment_codes (school_id, title, short_name, type, sort_order) VALUES (?,?,?,?,?)', [schoolId, t, s, ty, i + 1]));

// ---- attendance codes
const ATT_CODES = [['Present', 'P', 'present', 1], ['Absent', 'A', 'absent', 0], ['Excused Absent', 'EA', 'excused', 0],
 ['Tardy', 'T', 'late', 0], ['Unexcused Tardy', 'UT', 'late', 0], ['Excused Tardy', 'ET', 'late', 0]];
const attCodeIds = {};
ATT_CODES.forEach(([t, s, ty, def], i) => {
  attCodeIds[s] = db.run('INSERT INTO attendance_codes (school_id, title, short_name, type, sort_order, is_default) VALUES (?,?,?,?,?,?)',
    [schoolId, t, s, ty, i + 1, def]).lastInsertRowid;
});

// ---- discipline
const CATS = [['Tardiness', 'TARDY'], ['Disruption', 'DISR'], ['Disrespect', 'DISRES'], ['Dress Code', 'DRESS'], ['Technology Misuse', 'TECH'], ['Physical Altercation', 'PHYS'], ['Academic Dishonesty', 'ACAD']];
const catIds = CATS.map(([t, s], i) => db.run('INSERT INTO discipline_categories (school_id, title, short_name, sort_order) VALUES (?,?,?,?)', [schoolId, t, s, i + 1]).lastInsertRowid);
const ACTS = [['Warning', 'WARN'], ['Parent Contact', 'PCONT'], ['Detention', 'DET'], ['In-School Suspension', 'ISS'], ['Out-of-School Suspension', 'OSS'], ['Conference', 'CONF']];
const actIds = ACTS.map(([t, s], i) => db.run('INSERT INTO discipline_actions (school_id, title, short_name, sort_order) VALUES (?,?,?,?)', [schoolId, t, s, i + 1]).lastInsertRowid);

// ================================================================== STAFF
const PASS = hashPassword('admin');
function mkStaff(first, last, profile, school, username, extra = {}) {
  return db.run(`INSERT INTO staff (staff_id, username, password, first_name, middle_name, last_name, title, profile, profile_id,
      email, phone, home_phone, cell_phone, address, city, state, zip, school_id, is_admin, is_active, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [extra.staffId || null, username || null, username ? (extra.password || PASS) : null,
      first, extra.middle || null, last, extra.title || null, profile, profile === 'admin' ? 1 : 0,
      extra.email || null, extra.phone || null, extra.home || null, extra.cell || null,
      extra.address || null, extra.city || null, extra.state || null, extra.zip || null,
      school, profile === 'admin' ? 1 : 0, 1, NOW, NOW]).lastInsertRowid;
}

const adminId = mkStaff('Margaret', 'Chen', 'admin', schoolId, 'admin', { title: 'Dr.', email: 'mchen@centralhigh.edu', staffId: 'STF001', phone: '(217) 555-0142' });
const asstId = mkStaff('Robert', 'Alvarez', 'admin', schoolId, 'registrar', { title: 'Mr.', email: 'ralvarez@centralhigh.edu', staffId: 'STF002', password: hashPassword('registrar') });

const TEACHERS = [
  ['Katherine', 'Nolan', 'Mathematics'], ['David', 'Osei', 'Mathematics'], ['Priya', 'Sharma', 'Mathematics'],
  ['Michael', 'Byrne', 'English'], ['Laura', 'Whitfield', 'English'], ['Grace', 'Kim', 'English'],
  ['Alan', 'Reyes', 'Science'], ['Nadia', 'Haddad', 'Science'], ['Peter', 'Sullivan', 'Science'],
  ['Diane', 'Frost', 'Social Studies'], ['Marcus', 'Bell', 'Social Studies'],
  ['Sofia', 'Rossi', 'World Languages'], ['Hugo', 'Mendes', 'World Languages'],
  ['Clara', 'Bennett', 'Fine Arts'], ['Omar', 'Farouk', 'Fine Arts'],
  ['Jill', 'Hartley', 'Physical Education'], ['Victor', 'Nguyen', 'Technology']
];
const teachers = [];
TEACHERS.forEach(([f, l, subj], i) => {
  const uname = (f + '.' + l).toLowerCase();
  const id = mkStaff(f, l, 'teacher', schoolId, uname, {
    title: pick(['Mr.', 'Ms.', 'Mrs.', 'Dr.']),
    email: uname + '@centralhigh.edu',
    staffId: 'STF' + pad(i + 10),
    phone: '(217) 555-0' + pad(ri(200, 899)),
    password: hashPassword('teacher')
  });
  teachers.push({ id, first: f, last: l, subject: subj, name: f + ' ' + l });
});

// ================================================================== COURSES
const COURSES = [
  ['Algebra I', 'ALG1', 'Mathematics', 1.0], ['Geometry', 'GEO', 'Mathematics', 1.0], ['Algebra II', 'ALG2', 'Mathematics', 1.0],
  ['Pre-Calculus', 'PRECALC', 'Mathematics', 1.0], ['AP Calculus AB', 'APCALC', 'Mathematics', 1.0], ['Statistics', 'STAT', 'Mathematics', 1.0],
  ['English 9', 'ENG9', 'English', 1.0], ['English 10', 'ENG10', 'English', 1.0], ['English 11', 'ENG11', 'English', 1.0],
  ['AP English Literature', 'APENGLIT', 'English', 1.0], ['Creative Writing', 'CREWRITE', 'English', 0.5],
  ['Biology', 'BIO', 'Science', 1.0], ['Chemistry', 'CHEM', 'Science', 1.0], ['Physics', 'PHYS', 'Science', 1.0],
  ['Earth Science', 'EARTH', 'Science', 1.0], ['AP Biology', 'APBIO', 'Science', 1.0], ['Environmental Science', 'ENVSCI', 'Science', 1.0],
  ['World History', 'WORLDHIST', 'Social Studies', 1.0], ['US History', 'USHIST', 'Social Studies', 1.0], ['Government', 'GOVT', 'Social Studies', 0.5],
  ['Economics', 'ECON', 'Social Studies', 0.5], ['Psychology', 'PSYCH', 'Social Studies', 0.5],
  ['Spanish I', 'SPAN1', 'World Languages', 1.0], ['Spanish II', 'SPAN2', 'World Languages', 1.0], ['French I', 'FREN1', 'World Languages', 1.0],
  ['Art I', 'ART1', 'Fine Arts', 0.5], ['Concert Band', 'BAND', 'Fine Arts', 0.5], ['Choir', 'CHOIR', 'Fine Arts', 0.5], ['Drama', 'DRAMA', 'Fine Arts', 0.5],
  ['Physical Education', 'PE', 'Physical Education', 0.5], ['Health', 'HEALTH', 'Physical Education', 0.5],
  ['Computer Science I', 'CS1', 'Technology', 1.0], ['AP Computer Science A', 'APCSA', 'Technology', 1.0], ['Web Design', 'WEBDES', 'Technology', 0.5]
];

const courseIds = [];
COURSES.forEach(([title, short, subj, credits]) => {
  courseIds.push(db.run('INSERT INTO courses (school_id, subject_id, title, short_name, grade_level, credit_hours, description, is_active) VALUES (?,?,?,?,?,?,?,?)',
    [schoolId, subjectIds[subj], title, short, '9-12', credits, `${title} - full year course offered by the ${subj} department.`, 1]).lastInsertRowid);
});

// ---- course periods (sections)
const coursePeriods = [];
courseIds.forEach((courseId, idx) => {
  const [title, short, subj] = COURSES[idx];
  const sections = ri(2, 3);
  const deptTeachers = teachers.filter((t) => t.subject === subj);
  for (let s = 0; s < sections; s++) {
    const t = deptTeachers.length ? deptTeachers[s % deptTeachers.length] : pick(teachers);
    const cpId = db.run(`INSERT INTO course_periods (course_id, school_id, school_year_id, teacher_id, period_id, mp_id, grade_scale_id,
        title, short_name, room, total_seats, filled_seats, credit_attempted, credit_earned, does_attendance, does_honor_roll, is_active)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [courseId, schoolId, syId, t.id, periodIds[ri(0, periodIds.length - 1)], FY, gsId,
        `${title} - Sec ${s + 1}`, `${short}-${s + 1}`, String(ri(100, 320)), ri(24, 32), 0, COURSES[idx][3], COURSES[idx][3], 1, 1, 1]).lastInsertRowid;
    coursePeriods.push({ id: cpId, courseId, title, short: `${short}-${s + 1}`, teacherId: t.id, periodIdx: db.get('SELECT period_id FROM course_periods WHERE id = ?', [cpId]).period_id, credits: COURSES[idx][3] });
  }
});
// reload period idx properly
coursePeriods.forEach((cp) => { cp.periodId = db.get('SELECT period_id FROM course_periods WHERE id = ?', [cp.id]).period_id; });
// Ensure each period has spread: reassign periods round robin
shuffled(coursePeriods).forEach((cp, i) => {
  const p = periodIds[i % periodIds.length];
  cp.periodId = p;
  db.run('UPDATE course_periods SET period_id = ? WHERE id = ?', [p, cp.id]);
});

// ================================================================== STUDENTS
const NUM_STUDENTS = 132;
const students = [];
for (let i = 0; i < NUM_STUDENTS; i++) {
  const f = pick(FIRST), l = pick(LAST);
  const gl = GRADE_SHORT[ri(0, 3)];
  const [city, st, zip] = pick(CITIES);
  const birthYear = 2026 - (9 + GRADE_SHORT.indexOf(gl)) - 5 + ri(0, 1);
  const sid = db.run(`INSERT INTO students (student_id, alt_id, first_name, middle_name, last_name, preferred_name, gender, birthdate,
      grade_level, school_id, email, phone, address, city, state, zip, ethnicity, language, is_active, enrollment_date, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['S' + pad(1000 + i), 'A' + pad(9000 + i), f, chance(0.6) ? pick(FIRST) : null, l, null,
      pick(['Male', 'Female']), `${birthYear}-${pad(ri(1, 12), 2)}-${pad(ri(1, 28), 2)}`, gl, schoolId,
      (f + '.' + l + i).toLowerCase() + '@student.centralhigh.edu', '(217) 555-' + pad(ri(1000, 9999), 4),
      ri(100, 2499) + ' ' + pick(['Maple', 'Oak', 'Cedar', 'Birch', 'Pine', 'Walnut']) + ' ' + pick(['St', 'Ave', 'Dr', 'Ln']),
      city, st, zip, pick(['Hispanic or Latino', 'White', 'Black or African American', 'Asian', 'Two or More Races', 'American Indian']),
      pick(['English', 'English', 'English', 'Spanish', 'Mandarin']), 1, syStart, NOW, NOW]).lastInsertRowid;
  students.push({ id: sid, first: f, last: l, name: f + ' ' + l, grade: gl });

  // enrollment record
  db.run(`INSERT INTO student_enrollment (student_id, school_id, school_year_id, grade_level, start_date, end_date, enrollment_code, drop_code, calendar_id, comment)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, [sid, schoolId, syId, gl, syStart, null, 'NEW', null, 1, null]);

  // medical
  db.run(`INSERT INTO student_medical (student_id, physician, physician_phone, insurance, policy_number, allergies, medications, immunizations, notes, date_updated)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, [sid, 'Dr. ' + pick(LAST), '(217) 555-' + pad(ri(1000, 9999), 4),
      pick(['BlueCross', 'Aetna', 'UnitedHealth', 'Cigna', 'None']), 'POL' + pad(ri(10000, 99999), 5),
      chance(0.25) ? pick(['Peanuts', 'Penicillin', 'Latex', 'Shellfish', 'Pollen']) : null,
      chance(0.15) ? pick(['Albuterol inhaler', 'Adderall', 'Insulin']) : null,
      chance(0.9) ? 'Up to date' : 'Incomplete', null, dstr(addDays(new Date(syStart), ri(0, 20)))]);

  // contacts (1-2 parent/guardian people)
  const nContacts = ri(1, 2);
  for (let c = 0; c < nContacts; c++) {
    const pf = pick(FIRST), pl = c === 0 ? l : pick(LAST);
    const rel = c === 0 ? pick(['Mother', 'Father', 'Guardian']) : pick(['Mother', 'Father', 'Step-parent', 'Grandparent']);
    const pid = mkStaff(pf, pl, 'parent', schoolId, null, {
      title: rel === 'Father' || rel === 'Step-parent' ? 'Mr.' : 'Ms.',
      home: '(217) 555-' + pad(ri(1000, 9999), 4),
      cell: '(217) 555-' + pad(ri(1000, 9999), 4),
      email: (pf + '.' + pl + ri(1, 99)).toLowerCase() + '@mail.com',
      city, state: st, zip, address: ri(100, 2499) + ' ' + pick(['Maple', 'Oak', 'Cedar']) + ' St'
    });
    db.run('INSERT INTO students_join_people (student_id, person_id, relationship, is_emergency, is_custodial) VALUES (?,?,?,?,?)',
      [sid, pid, rel, 1, c === 0 ? 1 : 0]);
  }
}

// ---- portal accounts for a handful of students & the parent of student #1
for (let i = 0; i < 6; i++) {
  const s = students[i];
  const sid = mkStaff(s.first, s.last, 'student', schoolId, 'student' + (i + 1), {
    email: s.first.toLowerCase() + i + '@student.centralhigh.edu', staffId: 'STU' + pad(i + 1), password: hashPassword('student')
  });
  db.run('UPDATE students SET staff_id = ? WHERE id = ?', [sid, s.id]);
}
db.run('UPDATE students SET first_name = ?, last_name = ?, email = ? WHERE id = ?', ['Emma', 'Smith', 'emma.smith@student.centralhigh.edu', students[0].id]);
students[0].first = 'Emma'; students[0].last = 'Smith'; students[0].name = 'Emma Smith';
db.run('UPDATE staff SET first_name = ?, last_name = ? WHERE id = (SELECT staff_id FROM students WHERE id = ?)', ['Emma', 'Smith', students[0].id]);

const parentPerson = db.get(`SELECT p.id FROM students_join_people j JOIN staff p ON p.id = j.person_id WHERE j.student_id = ? LIMIT 1`, [students[0].id]);
if (parentPerson) {
  db.run('UPDATE staff SET username = ?, password = ?, profile = ?, staff_id = ?, first_name = ?, last_name = ? WHERE id = ?',
    ['parent', hashPassword('parent'), 'parent', 'PAR001', 'Diane', 'Smith', parentPerson.id]);
}

// ================================================================== SCHEDULE
console.log('    building student schedules...');
for (const s of students) {
  const wanted = ri(6, 7);
  const usedPeriods = new Set();
  const chosen = [];
  for (const cp of shuffled(coursePeriods)) {
    if (chosen.length >= wanted) break;
    if (usedPeriods.has(cp.periodId)) continue;
    const row = db.get('SELECT total_seats, filled_seats FROM course_periods WHERE id = ?', [cp.id]);
    if (row.filled_seats >= row.total_seats) continue;
    usedPeriods.add(cp.periodId);
    chosen.push(cp);
    db.run('UPDATE course_periods SET filled_seats = filled_seats + 1 WHERE id = ?', [cp.id]);
  }
  for (const cp of chosen) {
    db.run('INSERT INTO schedule (student_id, course_period_id, mp_id, start_date, end_date, seats) VALUES (?,?,?,?,?,?)',
      [s.id, cp.id, FY, syStart, syEnd, 1]);
  }
}

// ================================================================== GRADEBOOK
console.log('    generating gradebook assignments & scores...');
const ASSIGN_TITLES = ['Homework 1', 'Homework 2', 'Quiz 1', 'Quiz 2', 'Unit Test', 'Project', 'Classwork', 'Lab Report', 'Midterm', 'Final Exam'];
const TYPE_NAMES = ['Homework', 'Classwork', 'Quizzes', 'Tests', 'Projects'];
const TYPE_WEIGHTS = [10, 15, 20, 40, 15];

let assignmentCount = 0, gradeCount = 0;
for (const cp of coursePeriods) {
  const enrolled = db.all('SELECT student_id FROM schedule WHERE course_period_id = ?', [cp.id]);
  if (!enrolled.length) continue;
  // assignment types
  const typeIds = TYPE_NAMES.map((t, i) =>
    db.run('INSERT INTO gradebook_assignment_types (staff_id, course_id, title, sort_order, final_weight) VALUES (?,?,?,?,?)',
      [cp.teacherId, cp.courseId, t, i + 1, TYPE_WEIGHTS[i]]).lastInsertRowid);

  const nAss = ri(6, 10);
  for (let a = 0; a < nAss; a++) {
    const due = dstr(addDays(new Date(syStart), ri(0, 16)));
    const points = pick([10, 20, 25, 50, 100, 100]);
    const aId = db.run(`INSERT INTO gradebook_assignments (staff_id, course_period_id, assignment_type_id, mp_id, title, description,
        points, weight, is_ec, assigned_date, due_date, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [cp.teacherId, cp.id, typeIds[a % typeIds.length], Q1, ASSIGN_TITLES[a] || ('Assignment ' + (a + 1)),
        null, points, 1, 0, dstr(addDays(new Date(due), -7)), due, a + 1]).lastInsertRowid;
    assignmentCount++;
    // student scores
    const insert = db.raw.prepare('INSERT OR IGNORE INTO gradebook_grades (assignment_id, student_id, points, is_exempt, comment) VALUES (?,?,?,?,?)');
    for (const e of enrolled) {
      const st = students.find((x) => x.id === e.student_id);
      const ability = 0.55 + ((st ? (FIRST.indexOf(st.first) % 10) : 5) / 10) * 0.4; // stable per-student ability
      let pct = ability * 0.75 + bell() * 0.45;
      pct = Math.max(0.25, Math.min(1.0, pct));
      let score = null, exempt = 0;
      if (chance(0.05)) { score = null; exempt = 0; }        // missing
      else score = Math.round(points * pct * 10) / 10;
      insert.run(aId, e.student_id, score, exempt, null);
      gradeCount++;
    }
  }
}

// ---- report card grades for Q1 (in progress) based on assignment average
console.log('    computing report card grades...');
for (const cp of coursePeriods) {
  const enrolled = db.all('SELECT student_id FROM schedule WHERE course_period_id = ?', [cp.id]);
  for (const e of enrolled) {
    const rows = db.all(`SELECT g.points, a.points AS max FROM gradebook_grades g
      JOIN gradebook_assignments a ON a.id = g.assignment_id
      WHERE g.student_id = ? AND a.course_period_id = ? AND g.points IS NOT NULL`, [e.student_id, cp.id]);
    if (!rows.length) continue;
    let earned = 0, poss = 0;
    for (const r of rows) { earned += r.points; poss += r.max; }
    if (!poss) continue;
    const pct = Math.round((earned / poss) * 1000) / 10;
    const l = letterFor(pct);
    db.run(`INSERT OR REPLACE INTO student_report_card_grades (student_id, course_period_id, mp_id, grade_letter, grade_percent, gpa_points, unweighted_gp, weighted_gp, comment)
      VALUES (?,?,?,?,?,?,?,?,?)`, [e.student_id, cp.id, Q1, l.title, pct, l.gpa, l.gpa * cp.credits, l.gpa * cp.credits, null]);
  }
}

// ================================================================== ATTENDANCE
console.log('    generating attendance records...');
let day = new Date(syStart + 'T00:00:00Z');
const today = new Date();
const schoolDays = [];
while (day <= today) {
  const dow = day.getUTCDay();
  if (dow !== 0 && dow !== 6) {
    const ds = dstr(day);
    schoolDays.push(ds);
    db.run('INSERT OR IGNORE INTO attendance_calendar (school_id, school_date, minutes, is_school_day) VALUES (?,?,?,?)', [schoolId, ds, 360, 1]);
  }
  day = addDays(day, 1);
}
const recentDays = schoolDays.slice(-20);
for (const s of students) {
  for (const ds of recentDays) {
    const r = rnd();
    let code, presentMin, absentMin, stateVal;
    if (r < 0.94) { code = attCodeIds['P']; presentMin = 360; absentMin = 0; stateVal = 1.0; }
    else if (r < 0.965) { code = attCodeIds['A']; presentMin = 0; absentMin = 360; stateVal = 0.0; }
    else if (r < 0.98) { code = attCodeIds['EA']; presentMin = 0; absentMin = 360; stateVal = 0.0; }
    else { code = attCodeIds['T']; presentMin = 350; absentMin = 10; stateVal = 0.97; }
    db.run(`INSERT OR IGNORE INTO attendance_day (student_id, school_id, school_date, minutes_present, minutes_absent, state_value, attendance_code, comment)
      VALUES (?,?,?,?,?,?,?,?)`, [s.id, schoolId, ds, presentMin, absentMin, stateVal, code, null]);

    // period attendance mirrors day code mostly
    const sched = db.all('SELECT course_period_id, (SELECT period_id FROM course_periods c WHERE c.id = s.course_period_id) AS pid FROM schedule s WHERE s.student_id = ?', [s.id]);
    for (const sc of sched) {
      const pcode = (code === attCodeIds['P'] && chance(0.02)) ? attCodeIds['T'] : code;
      const cpRow = db.get('SELECT teacher_id FROM course_periods WHERE id = ?', [sc.course_period_id]);
      db.run(`INSERT OR IGNORE INTO attendance_period (student_id, course_period_id, school_id, school_date, period_id, attendance_code, attendance_reason, teacher_id)
        VALUES (?,?,?,?,?,?,?,?)`, [s.id, sc.course_period_id, schoolId, ds, sc.pid, pcode, pcode === attCodeIds['P'] ? null : pick(['Illness', 'Appointment', 'Overslept', 'Family matter', 'Transportation']), cpRow ? cpRow.teacher_id : null]);
    }
  }
}

// ================================================================== DISCIPLINE / FEES / NOTES
console.log('    discipline, fees, notes...');
for (let i = 0; i < 28; i++) {
  const s = pick(students);
  db.run(`INSERT INTO discipline_referrals (student_id, school_id, staff_id, entry_date, event_date, category_id, action_id, title, description, consequence, points, is_resolved)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [s.id, schoolId, pick(teachers).id,
      dstr(addDays(new Date(syStart), ri(0, Math.max(1, recentDays.length)))),
      dstr(addDays(new Date(syStart), ri(0, Math.max(1, recentDays.length)))),
      pick(catIds), pick(actIds), pick(['Classroom disruption', 'Repeated tardiness', 'Phone use in class', 'Dress code violation', 'Incomplete homework', 'Verbal altercation']),
      'Incident documented by staff. Student was spoken to and the behaviour was reviewed.',
      pick(['Verbal warning', 'Parent contact', 'After-school detention', '1 day ISS', 'Conference scheduled']),
      pick([0, 1, 2, 3]), chance(0.6) ? 1 : 0]);
}
const FEE_TITLES = [['Textbook Fee', 85], ['Lab Fee', 35], ['Technology Fee', 50], ['Athletics Fee', 60], ['Field Trip', 25], ['AP Exam Fee', 96], ['Library Fine', 5], ['Yearbook', 45]];
for (let i = 0; i < 90; i++) {
  const s = pick(students);
  const [title, amt] = pick(FEE_TITLES);
  const fid = db.run('INSERT INTO student_fees (student_id, school_id, title, amount, due_date, comments, created_at) VALUES (?,?,?,?,?,?,?)',
    [s.id, schoolId, title, amt, dstr(addDays(new Date(syStart), ri(10, 60))), null, NOW]).lastInsertRowid;
  if (chance(0.45)) {
    db.run('INSERT INTO student_payments (student_id, fee_id, amount, payment_date, method, comments, created_at) VALUES (?,?,?,?,?,?,?)',
      [s.id, fid, amt, dstr(addDays(new Date(syStart), ri(5, 40))), pick(['Cash', 'Check', 'Card', 'Online']), null, NOW]);
  }
}
const NOTE_CATS = ['General', 'Academic', 'Behaviour', 'Health', 'Counselling'];
for (let i = 0; i < 45; i++) {
  const s = pick(students);
  db.run('INSERT INTO student_notes (student_id, staff_id, school_id, note_date, category, title, note, created_at) VALUES (?,?,?,?,?,?,?,?)',
    [s.id, pick(teachers).id, schoolId, dstr(addDays(new Date(syStart), ri(0, Math.max(1, recentDays.length)))), pick(NOTE_CATS),
      pick(['Progress check', 'Parent meeting', 'Counsellor visit', 'IEP review', 'Award nomination']),
      'Note recorded during routine review. Follow up scheduled as needed.', NOW]);
}

// ---- portal notes / messages
db.run('INSERT INTO portal_notes (school_id, title, body, published, created_at) VALUES (?,?,?,?,?)',
  [schoolId, 'Welcome to the 2026-2027 School Year', 'Classes began on August 24. Report cards for Quarter 1 will be published on October 30.', 1, NOW]);
db.run('INSERT INTO portal_notes (school_id, title, body, published, created_at) VALUES (?,?,?,?,?)',
  [schoolId, 'Picture Day', 'School picture day is scheduled for September 22. Please bring the order form.', 1, NOW]);
for (let i = 0; i < 8; i++) {
  db.run('INSERT INTO messages (from_staff_id, to_staff_id, subject, body, is_read, created_at) VALUES (?,?,?,?,?,?)',
    [pick(teachers).id, adminId, pick(['Grade submission', 'Schedule conflict', 'Field trip approval', 'Supply request', 'Absence notification']),
      'Please review at your earliest convenience.', chance(0.5) ? 1 : 0, NOW - ri(1, 20) * 86400000]);
}

// ------------------------------------------------------------------ summary
const counts = {
  Schools: db.count('SELECT COUNT(*) c FROM schools'),
  'School Years': db.count('SELECT COUNT(*) c FROM school_years'),
  'Marking Periods': db.count('SELECT COUNT(*) c FROM marking_periods'),
  Staff: db.count('SELECT COUNT(*) c FROM staff'),
  Students: db.count('SELECT COUNT(*) c FROM students'),
  Courses: db.count('SELECT COUNT(*) c FROM courses'),
  'Course Periods': db.count('SELECT COUNT(*) c FROM course_periods'),
  Schedules: db.count('SELECT COUNT(*) c FROM schedule'),
  Assignments: assignmentCount,
  'Assignment Grades': gradeCount,
  'Report Card Grades': db.count('SELECT COUNT(*) c FROM student_report_card_grades'),
  'Attendance Days': db.count('SELECT COUNT(*) c FROM attendance_day'),
  'Period Attendance': db.count('SELECT COUNT(*) c FROM attendance_period'),
  Referrals: db.count('SELECT COUNT(*) c FROM discipline_referrals'),
  Fees: db.count('SELECT COUNT(*) c FROM student_fees'),
  Payments: db.count('SELECT COUNT(*) c FROM student_payments')
};
console.log('\n  +------------------------------------------+');
console.log('  |  SEEDED                                  |');
console.log('  +------------------------------------------+');
for (const [k, v] of Object.entries(counts)) console.log('  | ' + k.padEnd(24) + String(v).padStart(15) + ' |');
console.log('  +------------------------------------------+');
console.log('\n  [OK] Demo data loaded.\n');
console.log('  Default logins:');
console.log('    admin      / admin        (Administrator)');
console.log('    registrar  / registrar    (Administrator)');
console.log('    katherine.nolan / teacher (Teacher)');
console.log('    student1   / student      (Student portal)');
console.log('    parent     / parent       (Parent portal)\n');
process.exit(0);
