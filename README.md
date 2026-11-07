# Premier LMS Backend API (`PREMIER_LMs_backend_`)

The centralized NestJS 11 backend service providing authenticated RESTful APIs, Prisma 6 PostgreSQL data persistence, real-time WebSockets, automated Zoom meeting orchestration, and media asset management for the Premier LMS platform.

---

## 🚀 Key Responsibilities

1. **Identity & Session Management:**
   * JWT authentication with strict single-device session invalidation (`DeviceSession` + `currentToken`).
   * Role-based access control (`student` vs. `admin`).
   * Password hashing using `bcrypt` (10 rounds).
   * Audit logging for user logins, logouts, and administrative actions.

2. **Admissions & Student Lifecycle:**
   * Public admission intake supporting multi-course selections, CNIC identification, and payment proof attachments.
   * Admin workflow for approving or rejecting applications.
   * Auto-provisioning of student user accounts with generated credentials sent via email.
   * Enforcement of the single-course active enrollment constraint.

3. **Curriculum, Courses & Batches:**
   * Course management including modules, lessons, video durations, syllabus points, and reviews.
   * Batch lifecycle scheduling (`admission`, `ongoing`, `completed`) with automated student grouping.

4. **Live Classes & Zoom Integration:**
   * Server-to-Server OAuth Zoom integration to automatically create and configure scheduled meetings.
   * Zoom Meeting SDK cryptographic signature generation (`HMAC-SHA256`).
   * ZAK (Zoom Access Key) host token issuance allowing administrators to claim host status in the embedded web player.
   * Real-time participant state and waiting room synchronization via Socket.IO (`LiveClassGateway`).
   * Zoom Cloud Recording webhook ingestion, duration calculation, and token-gated lecture playback.

5. **File Uploads & Media Storage:**
   * Dual-mode file upload service supporting local filesystem storage (`/uploads`) and Cloudinary cloud CDN for production.

---

## 🛠️ Tech Stack & Dependencies

| Category | Technology |
| :--- | :--- |
| **Framework** | NestJS v11, Express |
| **Language** | TypeScript (v5.8), Node.js (v18+) |
| **Database & ORM** | PostgreSQL, Prisma ORM v6 |
| **Authentication** | Passport.js, `@nestjs/jwt`, `bcrypt` |
| **WebSockets** | Socket.IO (`@nestjs/websockets`, `@nestjs/platform-socket.io`) |
| **Email** | Nodemailer (SMTP over TLS) |
| **Cloud Storage** | Cloudinary SDK, Multer |
| **Security & Utilities** | Helmet, Throttler (`@nestjs/throttler`), `uuid` |

---

## ⚙️ Environment Variables

Create a `.env` file in the root of `PREMIER_LMs_backend_` by copying `.env.example`:

```bash
cp .env.example .env
```

### Essential Configuration Keys:
```env
# Server
NODE_ENV=development
API_PORT=3001
API_HOST=127.0.0.1
CORS_ORIGIN=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001

# Database (PostgreSQL)
DATABASE_URL="postgresql://user:pass@host:5432/dbname?sslmode=require"
DIRECT_URL="postgresql://user:pass@host:5432/dbname?sslmode=require"

# JWT Secrets
JWT_SECRET=super_secret_jwt_key_at_least_32_chars
JWT_EXPIRATION=30d
JWT_REFRESH_SECRET=super_secret_refresh_key
JWT_REFRESH_EXPIRATION=7d

# Zoom Server-to-Server OAuth
ZOOM_ACCOUNT_ID=your_zoom_account_id
ZOOM_CLIENT_ID=your_zoom_client_id
ZOOM_CLIENT_SECRET=your_zoom_client_secret
ZOOM_TEACHER_EMAIL=instructor@premieracademy.com

# Zoom Meeting SDK Credentials
ZOOM_SDK_KEY=your_zoom_meeting_sdk_key
ZOOM_SDK_SECRET=your_zoom_meeting_sdk_secret
ZOOM_WEBHOOK_SECRET=your_zoom_webhook_secret

# SMTP Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_gmail_app_password
SMTP_FROM="Premier Academy" <noreply@premieracademy.com>

# Cloudinary (Optional)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Uploads
UPLOAD_DIR=./uploads
```

---

## 🏃 Running the Service

### 1. Install Dependencies
```bash
npm install
```

### 2. Generate Prisma Client
```bash
npm run db:generate
```

### 3. Push Database Schema (Dev)
```bash
npm run db:push
```

### 4. Start Development Server
```bash
npm run dev
# The API will be available at http://localhost:3001/api
```

### 5. Build for Production
```bash
npm run build
npm run start:prod
```

---

## 📚 In-Depth Documentation

* 🏛️ [Architecture & Module Design](file:///c:/Users/user/Desktop/Downloads/premier_lms_mobile/PREMIER_LMs_backend_/docs/ARCHITECTURE.md)
* 📡 [REST API & WebSockets Reference](file:///c:/Users/user/Desktop/Downloads/premier_lms_mobile/PREMIER_LMs_backend_/docs/API_REFERENCE.md)
* 🗄️ [Database Schema & Prisma Models](file:///c:/Users/user/Desktop/Downloads/premier_lms_mobile/PREMIER_LMs_backend_/docs/DATABASE_SCHEMA.md)
* 📹 [Zoom Integration & Webhooks](file:///c:/Users/user/Desktop/Downloads/premier_lms_mobile/PREMIER_LMs_backend_/docs/ZOOM_INTEGRATION.md)
