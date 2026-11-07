# Database Schema & Entity Relationships

The Premier LMS backend uses PostgreSQL managed via **Prisma ORM 6**. All primary keys are UUID strings.

---

## 🗺️ Entity Relationship Diagram

```mermaid
erDiagram
    Course ||--o{ CourseModule : "contains"
    CourseModule ||--o{ CourseLesson : "contains"
    Course ||--o{ CourseReview : "has"
    Course ||--o{ Enrollment : "enrolls"
    Course ||--o{ RecordedLecture : "archives"
    Course }o--o{ Batch : "offered_in"

    Batch ||--o{ Class : "schedules"
    Batch ||--o{ Admission : "applies_to"
    Batch ||--o{ Enrollment : "cohort"

    User ||--o{ Admission : "owns"
    User ||--o{ Enrollment : "attends"
    User ||--o{ DeviceSession : "logs_into"
    User ||--o{ Attendance : "records"
    User ||--o{ AuditLog : "tracks"
    User ||--o{ PlaybackHistory : "watches"

    Class ||--o| LiveSession : "hosts"
    LiveSession ||--o{ Attendance : "logs"
    LiveSession ||--o{ ParticipantPermission : "manages"
    LiveSession ||--o{ WaitingParticipant : "queues"

    RecordedLecture ||--o{ PlaybackHistory : "measures"
```

---

## 📋 Data Models Overview

### 1. `User`
Stores system accounts (`student`, `admin`).
* `id` (UUID): Primary key.
* `email` (String, Unique): User email address.
* `password` (String): Bcrypt hashed password.
* `role` (String, default: "student"): Access tier.
* `isActive` (Boolean, default: true): Account enabled status.
* `currentToken` (String, Optional): Active JWT signature used for single-device session locking.

### 2. `Admission`
Intake records submitted by prospective students.
* `cnic` (String, Unique): National Identity Card number.
* `email` (String, Unique): Contact email.
* `status` (String, default: "pending"): State (`pending`, `approved`, `rejected`).
* `selectedCourses` (String[]): Array of course names applied for.
* `cnicFile`, `photoFile`, `paymentProof` (String): File paths/URLs.
* `userId` (String, Optional): Foreign key linked upon application approval.

### 3. `Course`, `CourseModule`, `CourseLesson`
Represents the educational curriculum.
* `Course`: High-level offering (`name`, `originalFee`, `discountedFee`, `instructorBio`, `duration`).
* `CourseModule`: Section within a course (`title`, `sortOrder`).
* `CourseLesson`: Individual lesson topic within a module (`title`, `duration`, `isPreview`).

### 4. `Enrollment`
Grants an active student access to a specific Course & Batch.
* `registrationNo` (String, Unique): Official student roll/registration identifier.
* `accessType` (String, default: "FULL"): Access level.
* `startDate`, `endDate`: Duration of course access.
* `isActive` (Boolean, default: true).

### 5. `Class` & `LiveSession`
Scheduled live lectures and active real-time classroom state.
* `Class`: Scheduled time (`scheduledStart`, `scheduledEnd`), Zoom credentials (`zoomMeetingId`, `zoomPasscode`), and permissions (`allowStudentMic`, `allowStudentCamera`).
* `LiveSession`: Running instance of a class (`startedAt`, `endedAt`, `status`).

### 6. `Attendance` & `PlaybackHistory`
Compliance and activity tracking.
* `Attendance`: Live class presence (`joinTime`, `leaveTime`, `duration`, `ipAddress`, `device`).
* `PlaybackHistory`: Recorded video watch time (`durationWatched`, `lastPosition`).

### 7. `DeviceSession`
Auditing and single-device session control.
* `token` (String, Unique): Associated JWT token.
* `ipAddress`, `userAgent`, `deviceType`, `os`, `browser`.
* `isActive` (Boolean): Invalidated when a user signs in elsewhere.
