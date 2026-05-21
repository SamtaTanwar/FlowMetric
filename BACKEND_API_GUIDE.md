# Backend API Guide

## Local Run Steps

Run these commands from `backend`:

```bash
npm.cmd run prisma:generate
npm.cmd run prisma:push
npm.cmd run seed
npm.cmd run dev
```

Backend URL:

```text
http://localhost:5000
```

Demo admin login:

```text
Employee ID: EMP-1001
Email: admin@worktrack.local
Password: password123
```

## Main API Groups

### Auth

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/create-password`
- `POST /api/auth/forgot-password`
- `GET /api/auth/me`

### Employee/Admin

- `GET /api/employees`
- `GET /api/employees/:id`

### Activity Tracking

- `POST /api/tracking/start`
- `POST /api/tracking/event`
- `POST /api/tracking/stop`
- `GET /api/tracking/live`

### Productivity

- `GET /api/productivity/summary`
- `GET /api/productivity/employee/:id`

### Attendance

- `GET /api/attendance`

### Workflows

- `GET /api/workflows`
- `POST /api/workflows`
- `PATCH /api/workflows/:id/status`

### Notifications

- `GET /api/notifications`
- `PATCH /api/notifications/:id/read`

### Policies

- `GET /api/policies`
- `PUT /api/policies/:id`

### Reports

- `GET /api/reports/daily`
- `GET /api/reports/export`

## Productivity Formula

```text
Productive Minutes = Total Login Minutes - Idle Minutes - Break Minutes
Productivity % = Productive Minutes / Total Login Minutes * 100
```

The backend stores this in `ProductivityRecord` after a tracking session is stopped.

## Database Tables

- `User`
- `Department`
- `Shift`
- `WorkPolicy`
- `LoginSession`
- `TrackingEvent`
- `ProductivityRecord`
- `AttendanceRecord`
- `WorkflowTask`
- `Notification`
- `AuditLog`
