# Employee Workflow Tracking Requirements Checklist

## Frontend Approval Scope

- [x] Modern dashboard layout
- [x] Responsive desktop/tablet/mobile structure
- [x] Admin dashboard KPIs
- [x] Employee monitoring table
- [x] Productivity analytics charts
- [x] Attendance overview
- [x] Real-time activity view
- [x] Reports section
- [x] Settings/security indicators
- [x] Login screen
- [x] Employee self-dashboard view
- [x] Employee clock-in/clock-out workspace
- [x] Employee break/resume controls
- [x] Workflow/task management view
- [x] Notification center
- [x] Configurable policy controls
- [x] Animation-rich interactions
- [x] Light/dark mode or strong visual theme polish

## Backend Scope

- [x] Authentication APIs: login, logout, create password, forgot password
- [x] Activity APIs: start tracking, stop tracking, idle detection, productivity calculation
- [x] Admin APIs: employee reports, productivity analytics, attendance
- [x] Secure password hashing
- [x] JWT/session authentication
- [x] Role-based access control

## Database Scope

- [x] Initial employees/users table
- [x] Initial department table
- [x] Initial shift table
- [x] Login activity table
- [x] Productivity table
- [x] Attendance table
- [x] Notifications table
- [x] Workflow/tasks table
- [x] Policy/settings table

## Documentation Scope

- [x] API documentation
- [x] Deployment/run guide
- [x] Admin manual
- [x] Technical explanation
- [x] Final submission notes

## Full Stack Integration

- [x] Frontend login calls backend auth API
- [x] Role-based login redirect for admin versus employee
- [x] Employee portal starts/stops tracking session
- [x] Employee portal records break time
- [x] Employee portal tracks browser idle time
- [x] JWT saved in browser storage
- [x] Dashboard calls protected backend APIs
- [x] Frontend reads employees/productivity/attendance/workflows/notifications/policies/reports from backend
- [x] Report export calls backend CSV endpoint
- [x] Logout clears frontend session and calls backend logout
