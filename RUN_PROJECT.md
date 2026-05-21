# Run The Full Project

## 1. Start MySQL

Make sure MySQL is running and this database exists:

```text
employee_workflow_db
```

The backend connection is configured in:

```text
backend/.env
```

## 2. Prepare Backend Database

From the `backend` folder:

```bash
npm.cmd run prisma:generate
npm.cmd run prisma:push
npm.cmd run seed
```

## 3. Start Backend

From the `backend` folder:

```bash
npm.cmd run dev
```

Keep this terminal open. The login page will not redirect to the dashboard if the backend server is closed, because authentication happens through `http://localhost:5000/api/auth/login`.

Backend health check:

```text
http://localhost:5000/api/health
```

## 4. Start Frontend

Open another terminal from the `frontend` folder:

```bash
npm.cmd run dev
```

Keep this terminal open too. You need one terminal for backend and one terminal for frontend.

Frontend URL:

```text
http://localhost:3000/login
```

## 5. Demo Login

Admin/manager dashboard login:

```text
Employee ID: EMP-1001
Email: admin@worktrack.local
Password: password123
```

Employee clock-in login:

```text
Employee ID: EMP-1002
Email: rahul@worktrack.local
Password: password123
```

When an admin/manager/HR logs in, the app opens `/dashboard`.

When an employee logs in, the app opens `/employee`, where they can:

- Clock In
- Start Break
- Resume Work
- Clock Out

The employee portal tracks browser idle time after 5 minutes of no page activity. Full system-level keyboard/mouse/screen-lock monitoring would require a separate desktop background application.

## 6. What Is End-To-End Connected

- Login form connects to backend authentication.
- Role-based redirect sends admins/managers/HR to `/dashboard` and employees to `/employee`.
- Employee Clock In creates a `LoginSession` and attendance record.
- Employee Break/Resume records break tracking events.
- Employee Clock Out updates login session, productivity, and attendance.
- Dashboard employees come from `GET /api/employees`.
- Productivity summary comes from `GET /api/productivity/summary`.
- Attendance data comes from `GET /api/attendance`.
- Workflows come from `GET /api/workflows`.
- Notifications come from `GET /api/notifications`.
- Policy controls come from `GET /api/policies`.
- Report cards come from `GET /api/reports/daily`.
- Export button downloads CSV from `GET /api/reports/export`.
- Logout calls backend logout and clears the frontend session.
