# API Reference: Premier LMS Backend

Base URL (Local): `http://localhost:3001/api`  
Base URL (Production): `https://premier-l-ms-backend.vercel.app/api`

All authenticated endpoints require the header:
```
Authorization: Bearer <accessToken>
```

---

## 🔐 1. Authentication (`/auth`)

### `POST /auth/login`
Authenticates a user and establishes a single-device session.
* **Access:** Public
* **Request Body:**
  ```json
  {
    "email": "student@example.com",
    "password": "SecretPassword123"
  }
  ```
* **Success Response (200):**
  ```json
  {
    "accessToken": "eyJhbGciOi...",
    "user": {
      "id": "uuid-here",
      "email": "student@example.com",
      "name": "Syed Ali",
      "role": "student"
    }
  }
  ```

### `GET /auth/profile`
Fetches the currently authenticated user's profile and active enrollment status.
* **Access:** Authenticated (Student / Admin)
* **Response (200):**
  ```json
  {
    "id": "uuid-here",
    "email": "student@example.com",
    "name": "Syed Ali",
    "role": "student",
    "isActive": true,
    "enrollments": [...]
  }
  ```

### `POST /auth/logout`
Terminates the user's active session and marks `DeviceSession.isActive = false`.
* **Access:** Authenticated

---

## 📚 2. Courses (`/courses`)

### `GET /courses`
Returns active courses for public display (with modules, lessons count, and faculty bio).
* **Access:** Public

### `GET /courses/all`
Returns all courses including inactive/draft courses.
* **Access:** Admin only

### `GET /courses/:id`
Returns full course details including modules, lessons, syllabus, and reviews.
* **Access:** Public

### `POST /courses`
Creates a new course entity with pricing, modules, and faculty information.
* **Access:** Admin only

### `PUT /courses/:id`
Updates course attributes or module tree.
* **Access:** Admin only

---

## 📝 3. Admissions (`/admissions`)

### `POST /admissions`
Submits a student admission application with personal details and payment proof.
* **Access:** Public
* **Request Body:**
  ```json
  {
    "fullName": "Muhammad Usman",
    "fatherName": "Tariq Mahmood",
    "cnic": "35201-1234567-1",
    "dateOfBirth": "1998-05-15",
    "gender": "Male",
    "whatsapp": "+923001234567",
    "email": "usman@example.com",
    "postalAddress": "House 12, Street 4, Lahore",
    "selectedCourses": ["Mastering Income Tax Ordinances 2001"],
    "totalAmount": 30000,
    "paymentMethod": "Bank Transfer",
    "cnicFile": "uploads/cnic_123.jpg",
    "photoFile": "uploads/photo_123.jpg",
    "paymentProof": "uploads/receipt_123.jpg",
    "batchId": "optional-batch-uuid"
  }
  ```

### `GET /admissions`
List admissions with filters (`status`, `search`, `page`, `limit`).
* **Access:** Admin only

### `PATCH /admissions/:id/status`
Approves or rejects an admission. On approval, automatically generates a `User` and `Enrollment`, sending credentials via email.
* **Access:** Admin only
* **Request Body:**
  ```json
  {
    "status": "approved", // or "rejected"
    "remarks": "Payment verified via Meezan Bank"
  }
  ```

---

## 📅 4. Batches (`/batches`)

### `GET /batches/public`
Returns active batches currently open for admission.
* **Access:** Public

### `GET /batches`
Returns all batches with linked courses, class schedules, and student counts.
* **Access:** Admin only

### `POST /batches`
Creates a new academic batch with start/end dates.
* **Access:** Admin only

---

## 🎥 5. Live Classes & Zoom (`/classes`)

### `GET /classes/public/upcoming`
Returns upcoming scheduled classes across public batches.
* **Access:** Public

### `GET /classes/my/upcoming`
Returns upcoming live classes for batches the authenticated student is enrolled in.
* **Access:** Authenticated (Student)

### `GET /classes/my/past`
Returns completed past classes with recording availability indicators.
* **Access:** Authenticated (Student)

### `GET /classes/my/recordings`
Returns the list of recorded lecture archives available to the enrolled student.
* **Access:** Authenticated (Student)

### `POST /classes/:id/join`
Generates Zoom Meeting SDK credentials and signature for joining the meeting.
* **Access:** Authenticated (Student / Admin)
* **Response (200):**
  ```json
  {
    "zoomMeetingId": "98765432101",
    "zoomPasscode": "123456",
    "signature": "eyJhbGciOi...",
    "sdkKey": "zoom_sdk_key_here",
    "userName": "Syed Ali",
    "userRole": "student",
    "isModerator": false,
    "zak": "optional_host_zak_for_admin_only",
    "allowStudentMic": true,
    "allowStudentCamera": true,
    "allowStudentScreenshare": false
  }
  ```

### `POST /classes/:id/recording-token`
Generates a time-limited playback signature for streaming a cloud-recorded lecture.
* **Access:** Authenticated (Student enrolled in the corresponding course)

---

## 📁 6. File Uploads (`/uploads`)

### `POST /uploads`
Uploads a file (CNIC scan, portrait photo, payment receipt).
* **Access:** Public / Authenticated
* **Content-Type:** `multipart/form-data`
* **Response (201):**
  ```json
  {
    "url": "https://res.cloudinary.com/.../receipt.jpg" // or local path "uploads/receipt.jpg"
  }
  ```
