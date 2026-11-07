# Architecture: Premier LMS Backend

This document details the software architecture, design patterns, security mechanisms, and request lifecycle of the NestJS backend application (`PREMIER_LMs_backend_`).

---

## 🏛️ Architectural Pattern: NestJS Modular Design

The backend is organized into domain-driven feature modules. Each module is encapsulated with its own controllers, services, DTOs, and providers:

```
src/
├── app-setup.ts         # Global pipes, CORS, helmet, and body-parser configuration
├── app.controller.ts    # Health check endpoint (GET /api/health)
├── app.module.ts        # Root module importing all feature modules and guards
├── main.ts              # Application bootstrap entry point
├── common/              # Shared decorators, filters, and interceptors
├── prisma/              # PrismaService database singleton
└── modules/
    ├── auth/            # JWT, login, logout, device sessions, Passport strategies
    ├── admission/       # Student application submission and approval flows
    ├── batch/           # Academic cohorts and schedules
    ├── class/           # Classes, Zoom meetings, recordings, WebSockets, attendance
    ├── course/          # Course catalog, modules, lessons, reviews
    ├── enrollment/      # Student-to-course enrollments & permissions
    ├── mail/            # Nodemailer templates and async mailer
    ├── upload/          # Multipart disk/Cloudinary file storage
    └── user/            # User account management, bans, and audit logs
```

---

## 🛡️ Request Lifecycle & Security Pipeline

When an incoming HTTP request hits the backend, it traverses several layers before reaching a route handler:

```
[ Incoming Request ]
         │
         ▼
[ Helmet Middleware ]           -> Sets HTTP security headers (X-Frame-Options, CSP, etc.)
         │
         ▼
[ CORS Middleware ]             -> Validates Origin against ALLOWED_ORIGINS whitelist
         │
         ▼
[ Global ThrottlerGuard ]       -> Rate limiting (20 req/min short, 100 req/min long)
         │
         ▼
[ ValidationPipe ]              -> Validates request DTOs, strips unknown properties (whitelist: true)
         │
         ▼
[ JwtAuthGuard & RolesGuard ]   -> Authenticates JWT, checks single-session validity, checks Role
         │
         ▼
[ Controller Route Handler ]    -> Unpacks parameters, delegates to Service
         │
         ▼
[ Prisma Service ]              -> PostgreSQL Query Execution
```

---

## 🔑 Authentication & Single-Session Enforcement

The application enforces a **Strict Single-Session Policy** to prevent account sharing between students:

1. **Session Invalidation on Login:**
   In [`AuthService.login`](file:///c:/Users/user/Desktop/Downloads/premier_lms_mobile/PREMIER_LMs_backend_/src/modules/auth/auth.service.ts#L14-L89):
   ```typescript
   // 1. Mark all previous device sessions for this user as inactive
   await this.prisma.deviceSession.updateMany({
     where: { userId: user.id, isActive: true },
     data: { isActive: false },
   });

   // 2. Persist the latest token on the user record
   await this.prisma.user.update({
     where: { id: user.id },
     data: { currentToken: accessToken },
   });
   ```

2. **Validation on Every Authenticated Request:**
   The `JwtStrategy` validates that the token presented in the `Authorization: Bearer <token>` header matches the user's `currentToken` in the database. If another device logs in, `currentToken` changes, causing all subsequent requests from the previous device to fail with `401 Unauthorized`.

3. **Client-Side Interception:**
   * Both `premier_LMS_Frontend` (`lib/api.ts`) and `lms-mobile` (`ApiService`) listen for 401 errors containing `"Session expired"` or `"logged in from another device"`, automatically logging the user out and redirecting them to the login screen with an explanatory message.

---

## 📡 Real-Time WebSockets (`LiveClassGateway`)

Located at [`src/modules/class/live-class.gateway.ts`](file:///c:/Users/user/Desktop/Downloads/premier_lms_mobile/PREMIER_LMs_backend_/src/modules/class/live-class.gateway.ts):
* **Namespace:** `/live-class`
* **Transports:** `websocket`, `polling`
* **Key Events:**
  * `join-session`: Student enters class room; server creates an `Attendance` record and pushes current participant list.
  * `leave-session`: Updates `Attendance.leaveTime` and calculates total session duration.
  * `permission-change`: Host mutes/unmutes student audio or allows/disallows screen sharing.
  * `waiting-room-update`: Host admits or rejects students waiting to enter.
  * `session-ended`: Host ends class; broadcast kicks all connected clients and triggers recording processing.
