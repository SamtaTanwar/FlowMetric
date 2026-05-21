"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors_1 = __importDefault(require("cors"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const node_http_1 = require("node:http");
const socket_io_1 = require("socket.io");
const client_1 = require("@prisma/client");
dotenv_1.default.config();
const app = (0, express_1.default)();
const httpServer = (0, node_http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
    cors: { origin: "*" },
});
const prisma = new client_1.PrismaClient();
const jwtSecret = process.env.JWT_SECRET || "employee_workflow_secret_key";
const adminLikeRoles = [client_1.UserRole.ADMIN, client_1.UserRole.MANAGER, client_1.UserRole.HR];
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: "1mb" }));
io.on("connection", (socket) => {
    socket.emit("connected", { message: "Realtime employee workflow channel connected" });
});
const asyncHandler = (handler) => (req, res, next) => {
    handler(req, res, next).catch(next);
};
function getAuthUser(req) {
    return req.user;
}
function generateToken(user) {
    return jsonwebtoken_1.default.sign({
        userId: user.id,
        role: user.role,
        employeeCode: user.employeeCode,
    }, jwtSecret, { expiresIn: "8h" });
}
function sanitizeUser(user) {
    return {
        id: user.id,
        employeeCode: user.employeeCode,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        department: user.department,
        shift: user.shift,
    };
}
function dayStart(input) {
    const date = input ? new Date(input) : new Date();
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function minutesBetween(start, end) {
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}
function shiftStartForDate(date, shiftStart = "09:00") {
    const [hours = "9", minutes = "0"] = shiftStart.split(":");
    const result = dayStart(date);
    result.setHours(Number(hours), Number(minutes), 0, 0);
    return result;
}
function productivityPercent(productiveMinutes, loginMinutes) {
    if (loginMinutes <= 0) {
        return 0;
    }
    return Math.min(100, Math.round((productiveMinutes / loginMinutes) * 100));
}
async function writeAuditLog(actorId, action, entity, entityId) {
    await prisma.auditLog.create({
        data: {
            actorId,
            action,
            entity,
            entityId: entityId ?? null,
        },
    });
}
const authenticate = asyncHandler(async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).json({ message: "Authentication token is required" });
        return;
    }
    try {
        const token = authHeader.replace("Bearer ", "");
        const payload = jsonwebtoken_1.default.verify(token, jwtSecret);
        const user = await prisma.user.findUnique({
            where: { id: payload.userId },
            select: {
                id: true,
                employeeCode: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                status: true,
            },
        });
        if (!user || user.status !== "ACTIVE") {
            res.status(401).json({ message: "User is inactive or no longer exists" });
            return;
        }
        req.user = user;
        next();
    }
    catch {
        res.status(401).json({ message: "Invalid or expired authentication token" });
    }
});
function requireRoles(...roles) {
    return (req, res, next) => {
        const user = getAuthUser(req);
        if (!user || !roles.includes(user.role)) {
            res.status(403).json({ message: "You do not have permission for this action" });
            return;
        }
        next();
    };
}
async function finalizeSession(sessionId, input = {}) {
    const session = await prisma.loginSession.findUnique({
        where: { id: sessionId },
        include: { user: { include: { shift: true } } },
    });
    if (!session) {
        throw new Error("Tracking session not found");
    }
    const logoutAt = new Date();
    const loginMinutes = minutesBetween(session.loginAt, logoutAt);
    const idleMinutes = input.idleMinutes ?? session.idleMinutes;
    const breakMinutes = input.breakMinutes ?? session.breakMinutes;
    const activeMinutes = input.activeMinutes ?? Math.max(0, loginMinutes - idleMinutes - breakMinutes);
    const lockMinutes = input.lockMinutes ?? session.lockMinutes;
    const productiveMinutes = Math.max(0, loginMinutes - idleMinutes - breakMinutes);
    const date = dayStart(session.loginAt);
    const updatedSession = await prisma.loginSession.update({
        where: { id: session.id },
        data: {
            logoutAt,
            status: client_1.SessionStatus.COMPLETED,
            activeMinutes,
            idleMinutes,
            breakMinutes,
            lockMinutes,
            productiveMinutes,
        },
    });
    const record = await prisma.productivityRecord.upsert({
        where: {
            userId_date: {
                userId: session.userId,
                date,
            },
        },
        update: {
            loginMinutes,
            activeMinutes,
            idleMinutes,
            breakMinutes,
            productiveMinutes,
            productivityPercent: productivityPercent(productiveMinutes, loginMinutes),
            score: productivityPercent(productiveMinutes, loginMinutes),
        },
        create: {
            userId: session.userId,
            date,
            loginMinutes,
            activeMinutes,
            idleMinutes,
            breakMinutes,
            productiveMinutes,
            productivityPercent: productivityPercent(productiveMinutes, loginMinutes),
            score: productivityPercent(productiveMinutes, loginMinutes),
        },
    });
    await prisma.attendanceRecord.updateMany({
        where: {
            userId: session.userId,
            date,
        },
        data: {
            logoutAt,
            overtimeMinutes: Math.max(0, loginMinutes - Math.round((session.user.shift?.minimumWorkHours || 8) * 60)),
            idleDeductionMinutes: idleMinutes,
        },
    });
    await prisma.trackingEvent.create({
        data: {
            userId: session.userId,
            sessionId: session.id,
            type: client_1.TrackingEventType.LOGOUT,
        },
    });
    io.emit("session-stopped", { session: updatedSession, productivity: record });
    return { session: updatedSession, productivity: record };
}
app.get("/", (_req, res) => {
    res.json({
        message: "Employee Workflow Tracking API is running",
        docs: "/api/health",
    });
});
app.get("/api/health", asyncHandler(async (_req, res) => {
    const userCount = await prisma.user.count().catch(() => 0);
    res.json({
        status: "ok",
        service: "employee-workflow-tracking-api",
        database: userCount > 0 ? "connected" : "ready",
        timestamp: new Date().toISOString(),
    });
}));
app.post("/api/auth/login", asyncHandler(async (req, res) => {
    const { employeeCode, email, password, deviceInfo } = req.body;
    if ((!employeeCode && !email) || !password) {
        res.status(400).json({ message: "Employee code/email and password are required" });
        return;
    }
    const user = await prisma.user.findFirst({
        where: {
            OR: [
                employeeCode ? { employeeCode } : undefined,
                email ? { email } : undefined,
            ].filter(Boolean),
        },
        include: { department: true, shift: true },
    });
    if (!user || !(await bcryptjs_1.default.compare(password, user.passwordHash))) {
        res.status(401).json({ message: "Invalid credentials" });
        return;
    }
    if (user.status !== "ACTIVE") {
        res.status(403).json({ message: "This employee account is inactive" });
        return;
    }
    const authUser = {
        id: user.id,
        employeeCode: user.employeeCode,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
    };
    const token = generateToken(authUser);
    await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
    });
    await writeAuditLog(user.id, "LOGIN", "User", String(user.id));
    res.json({
        message: "Login successful",
        token,
        user: sanitizeUser(user),
        deviceInfo,
    });
}));
app.post("/api/auth/signup", asyncHandler(async (req, res) => {
    const { firstName, lastName, email, password, designation, departmentId, } = req.body;
    // Validate required fields
    if (!firstName ||
        !lastName ||
        !email ||
        !password ||
        !designation ||
        !departmentId) {
        res.status(400).json({
            message: "All fields are required",
        });
        return;
    }
    // Validate official email
    if (!email.endsWith("@bridgegroupsolutions.com")) {
        res.status(400).json({
            message: "Use your official company email",
        });
        return;
    }
    // Check existing user
    const existingUser = await prisma.user.findUnique({
        where: { email },
    });
    if (existingUser) {
        res.status(400).json({
            message: "Account already exists",
        });
        return;
    }
    // Check department exists
    const department = await prisma.department.findUnique({
        where: {
            id: Number(departmentId),
        },
    });
    if (!department) {
        res.status(404).json({
            message: "Department not found",
        });
        return;
    }
    // Generate employee code
    const employeeCode = `EMP-${Date.now().toString().slice(-5)}`;
    // Hash password
    const passwordHash = await bcryptjs_1.default.hash(password, 10);
    // Find default shift
    const shift = await prisma.shift.findFirst();
    // Create employee
    const user = await prisma.user.create({
        data: {
            employeeCode,
            firstName,
            lastName,
            email,
            passwordHash,
            designation,
            role: client_1.UserRole.EMPLOYEE,
            departmentId: department.id,
            shiftId: shift ? shift.id : null,
        },
    });
    await writeAuditLog(user.id, "SIGNUP", "User", String(user.id));
    res.status(201).json({
        message: "Account created successfully",
    });
}));
app.post("/api/auth/create-password", asyncHandler(async (req, res) => {
    const { employeeCode, email, otp, password } = req.body;
    if (!employeeCode || !email || !password) {
        res.status(400).json({ message: "Employee code, email, and new password are required" });
        return;
    }
    if (otp && otp !== "123456") {
        res.status(400).json({ message: "Invalid demo OTP. Use 123456 for demo setup." });
        return;
    }
    const user = await prisma.user.findFirst({
        where: { employeeCode, email },
    });
    if (!user) {
        res.status(404).json({ message: "Employee not found" });
        return;
    }
    await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await bcryptjs_1.default.hash(password, 10) },
    });
    await writeAuditLog(user.id, "CREATE_PASSWORD", "User", String(user.id));
    res.json({ message: "Password created successfully" });
}));
app.post("/api/auth/forgot-password", asyncHandler(async (req, res) => {
    const { email } = req.body;
    if (!email) {
        res.status(400).json({ message: "Official email is required" });
        return;
    }
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
        await prisma.notification.create({
            data: {
                userId: user.id,
                type: client_1.NotificationType.ADMIN_ANNOUNCEMENT,
                priority: "MEDIUM",
                title: "Password reset requested",
                message: "Demo OTP for password reset is 123456.",
            },
        });
    }
    res.json({
        message: "If this email exists, a reset OTP has been generated. Demo OTP: 123456",
    });
}));
app.post("/api/auth/logout", authenticate, asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const { sessionId } = req.body;
    if (!user) {
        res.status(401).json({ message: "Authentication required" });
        return;
    }
    const activeSession = await prisma.loginSession.findFirst({
        where: {
            userId: user.id,
            status: client_1.SessionStatus.ACTIVE,
            ...(sessionId ? { id: Number(sessionId) } : {}),
        },
        orderBy: { loginAt: "desc" },
    });
    if (!activeSession) {
        res.json({ message: "Logout successful. No active tracking session was open." });
        return;
    }
    const result = await finalizeSession(activeSession.id, req.body);
    await writeAuditLog(user.id, "LOGOUT", "LoginSession", String(activeSession.id));
    res.json({
        message: "Logout successful",
        ...result,
    });
}));
app.get("/api/auth/me", authenticate, asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    if (!user) {
        res.status(401).json({ message: "Authentication required" });
        return;
    }
    const fullUser = await prisma.user.findUnique({
        where: { id: user.id },
        include: { department: true, shift: true },
    });
    res.json({ user: fullUser ? sanitizeUser(fullUser) : user });
}));
app.get("/api/employees", authenticate, requireRoles(client_1.UserRole.ADMIN, client_1.UserRole.MANAGER, client_1.UserRole.HR), asyncHandler(async (_req, res) => {
    const employees = await prisma.user.findMany({
        include: {
            department: true,
            shift: true,
            loginSessions: {
                orderBy: { loginAt: "desc" },
                take: 1,
            },
            productivityRecords: {
                orderBy: { date: "desc" },
                take: 1,
            },
            attendanceRecords: {
                orderBy: { date: "desc" },
                take: 1,
            },
        },
        orderBy: { firstName: "asc" },
    });
    res.json({
        employees: employees.map(({ passwordHash: _passwordHash, ...employee }) => employee),
    });
}));
app.get("/api/employees/:id", authenticate, asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const id = Number(req.params.id);
    if (!user) {
        res.status(401).json({ message: "Authentication required" });
        return;
    }
    const isSelf = user.id === id;
    const canViewAny = adminLikeRoles.includes(user.role);
    if (!isSelf && !canViewAny) {
        res.status(403).json({ message: "You can view only your own employee profile" });
        return;
    }
    const employee = await prisma.user.findUnique({
        where: { id },
        include: {
            department: true,
            shift: true,
            productivityRecords: { orderBy: { date: "desc" }, take: 7 },
            attendanceRecords: { orderBy: { date: "desc" }, take: 7 },
            assignedWorkflows: true,
            notifications: { orderBy: { createdAt: "desc" }, take: 10 },
        },
    });
    if (!employee) {
        res.status(404).json({ message: "Employee not found" });
        return;
    }
    const { passwordHash: _passwordHash, ...safeEmployee } = employee;
    res.json({ employee: safeEmployee });
}));
app.post("/api/tracking/start", authenticate, asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    if (!user) {
        res.status(401).json({ message: "Authentication required" });
        return;
    }
    const existing = await prisma.loginSession.findFirst({
        where: { userId: user.id, status: client_1.SessionStatus.ACTIVE },
    });
    if (existing) {
        res.json({ message: "Tracking already active", session: existing });
        return;
    }
    const fullUser = await prisma.user.findUnique({
        where: { id: user.id },
        include: { shift: true },
    });
    const loginAt = new Date();
    const date = dayStart(loginAt);
    const shiftStart = shiftStartForDate(loginAt, fullUser?.shift?.startTime || "09:00");
    const graceMinutes = fullUser?.shift?.graceMinutes || 10;
    const lateMinutes = Math.max(0, minutesBetween(shiftStart, loginAt) - graceMinutes);
    const attendanceStatus = lateMinutes > 0 ? client_1.AttendanceStatus.LATE : client_1.AttendanceStatus.PRESENT;
    const session = await prisma.loginSession.create({
        data: {
            userId: user.id,
            loginAt,
            deviceInfo: req.body.deviceInfo ?? null,
            ipAddress: req.ip ?? null,
            events: {
                create: {
                    userId: user.id,
                    type: client_1.TrackingEventType.LOGIN,
                },
            },
        },
    });
    await prisma.attendanceRecord.upsert({
        where: {
            userId_date: {
                userId: user.id,
                date,
            },
        },
        update: {
            loginAt,
            lateMinutes,
            status: attendanceStatus,
        },
        create: {
            userId: user.id,
            date,
            loginAt,
            lateMinutes,
            status: attendanceStatus,
        },
    });
    await writeAuditLog(user.id, "START_TRACKING", "LoginSession", String(session.id));
    io.emit("session-started", { session, user });
    res.status(201).json({
        message: "Tracking started",
        session,
        attendanceStatus,
    });
}));
app.post("/api/tracking/event", authenticate, asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const { sessionId, type, durationSeconds, appName, windowTitle, metadata } = req.body;
    if (!user) {
        res.status(401).json({ message: "Authentication required" });
        return;
    }
    if (!Object.values(client_1.TrackingEventType).includes(type)) {
        res.status(400).json({ message: "Invalid tracking event type" });
        return;
    }
    const event = await prisma.trackingEvent.create({
        data: {
            userId: user.id,
            sessionId: sessionId ? Number(sessionId) : null,
            type: type,
            durationSeconds: durationSeconds ? Number(durationSeconds) : null,
            appName: appName ?? null,
            windowTitle: windowTitle ?? null,
            metadata: metadata ?? client_1.Prisma.JsonNull,
        },
    });
    if (sessionId && durationSeconds) {
        const minutes = Math.round(Number(durationSeconds) / 60);
        const increment = type === client_1.TrackingEventType.IDLE_END
            ? { idleMinutes: { increment: minutes } }
            : type === client_1.TrackingEventType.BREAK_END
                ? { breakMinutes: { increment: minutes } }
                : type === client_1.TrackingEventType.SCREEN_UNLOCK
                    ? { lockMinutes: { increment: minutes } }
                    : {};
        if (Object.keys(increment).length > 0) {
            await prisma.loginSession.update({
                where: { id: Number(sessionId) },
                data: increment,
            });
        }
    }
    io.emit("tracking-event", { event, userId: user.id });
    res.status(201).json({ message: "Tracking event recorded", event });
}));
app.post("/api/tracking/stop", authenticate, asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const sessionId = Number(req.body.sessionId);
    if (!user) {
        res.status(401).json({ message: "Authentication required" });
        return;
    }
    const session = await prisma.loginSession.findFirst({
        where: {
            id: sessionId,
            userId: user.id,
            status: client_1.SessionStatus.ACTIVE,
        },
    });
    if (!session) {
        res.status(404).json({ message: "Active tracking session not found" });
        return;
    }
    const result = await finalizeSession(session.id, req.body);
    await writeAuditLog(user.id, "STOP_TRACKING", "LoginSession", String(session.id));
    res.json({
        message: "Tracking stopped",
        ...result,
    });
}));
app.get("/api/tracking/active-session", authenticate, async (req, res) => {
    try {
        const activeSession = await prisma.loginSession.findFirst({
            where: {
                userId: req.user.id,
                logoutAt: null,
            },
            orderBy: {
                loginAt: "desc",
            },
        });
        if (!activeSession) {
            return res.json({
                activeSession: null,
            });
        }
        const latestBreakEvent = await prisma.trackingEvent.findFirst({
            where: {
                sessionId: activeSession.id,
                type: {
                    in: ["BREAK_START", "BREAK_END"],
                },
            },
            orderBy: {
                createdAt: "desc",
            },
        });
        res.json({
            activeSession,
            isOnBreak: latestBreakEvent?.type === "BREAK_START",
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to fetch active session",
        });
    }
});
app.get("/api/tracking/latest-session", authenticate, async (req, res) => {
    try {
        const latestSession = await prisma.loginSession.findFirst({
            where: {
                userId: req.user.id,
            },
            orderBy: {
                loginAt: "desc",
            },
        });
        res.json({
            latestSession,
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to fetch latest session",
        });
    }
});
app.get("/api/tracking/events/:sessionId", authenticate, async (req, res) => {
    try {
        const sessionId = Number(req.params.sessionId);
        const events = await prisma.trackingEvent.findMany({
            where: {
                sessionId,
            },
            orderBy: {
                createdAt: "asc",
            },
        });
        res.json({
            events,
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Failed to fetch tracking events",
        });
    }
});
app.get("/api/tracking/live", authenticate, requireRoles(client_1.UserRole.ADMIN, client_1.UserRole.MANAGER, client_1.UserRole.HR), asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
        where: { status: "ACTIVE" },
        include: {
            department: true,
            loginSessions: {
                orderBy: { loginAt: "desc" },
                take: 1,
            },
        },
        orderBy: { firstName: "asc" },
    });
    res.json({
        employees: users.map((employee) => ({
            id: employee.id,
            employeeCode: employee.employeeCode,
            name: `${employee.firstName} ${employee.lastName}`,
            department: employee.department?.name || "Unassigned",
            liveStatus: employee.loginSessions[0]?.status === client_1.SessionStatus.ACTIVE ? "ONLINE" : "OFFLINE",
            currentSession: employee.loginSessions[0] || null,
        })),
    });
}));
app.get("/api/productivity/summary", authenticate, asyncHandler(async (_req, res) => {
    const today = dayStart();
    const records = await prisma.productivityRecord.findMany({
        where: { date: today },
        include: { user: { include: { department: true } } },
        orderBy: { productivityPercent: "desc" },
    });
    const average = records.length > 0
        ? Math.round(records.reduce((sum, item) => sum + item.productivityPercent, 0) / records.length)
        : 0;
    const departments = new Map();
    for (const record of records) {
        const departmentName = record.user.department?.name || "Unassigned";
        const current = departments.get(departmentName) || { total: 0, count: 0 };
        departments.set(departmentName, {
            total: current.total + record.productivityPercent,
            count: current.count + 1,
        });
    }
    res.json({
        date: today,
        averageProductivity: average,
        topEmployees: records.slice(0, 5).map((record) => ({
            userId: record.userId,
            name: `${record.user.firstName} ${record.user.lastName}`,
            productivityPercent: record.productivityPercent,
            productiveMinutes: record.productiveMinutes,
        })),
        departmentPerformance: Array.from(departments.entries()).map(([department, value]) => ({
            department,
            productivityPercent: Math.round(value.total / value.count),
        })),
    });
}));
app.get("/api/productivity/employee/:id", authenticate, asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const employeeId = Number(req.params.id);
    if (!user) {
        res.status(401).json({ message: "Authentication required" });
        return;
    }
    if (user.id !== employeeId && !adminLikeRoles.includes(user.role)) {
        res.status(403).json({ message: "You can view only your own productivity records" });
        return;
    }
    const records = await prisma.productivityRecord.findMany({
        where: { userId: employeeId },
        orderBy: { date: "desc" },
        take: 31,
    });
    res.json({ records });
}));
app.get("/api/attendance", authenticate, asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const requestedUserId = req.query.userId ? Number(req.query.userId) : undefined;
    if (!user) {
        res.status(401).json({ message: "Authentication required" });
        return;
    }
    const canViewAny = adminLikeRoles.includes(user.role);
    const userId = canViewAny ? requestedUserId : user.id;
    const records = await prisma.attendanceRecord.findMany({
        where: userId ? { userId } : {},
        include: {
            user: {
                select: {
                    employeeCode: true,
                    firstName: true,
                    lastName: true,
                    department: true,
                },
            },
        },
        orderBy: { date: "desc" },
        take: 100,
    });
    res.json({ records });
}));
app.get("/api/workflows", authenticate, asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    if (!user) {
        res.status(401).json({ message: "Authentication required" });
        return;
    }
    const canViewAny = adminLikeRoles.includes(user.role);
    const workflows = await prisma.workflowTask.findMany({
        where: canViewAny ? {} : { assignedToId: user.id },
        include: {
            assignedTo: {
                select: { id: true, firstName: true, lastName: true, employeeCode: true },
            },
            createdBy: {
                select: { id: true, firstName: true, lastName: true },
            },
            department: true,
        },
        orderBy: { updatedAt: "desc" },
    });
    res.json({ workflows });
}));
app.post("/api/workflows", authenticate, requireRoles(client_1.UserRole.ADMIN, client_1.UserRole.MANAGER), asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const { title, description, assignedToId, departmentId, dueDate, priority } = req.body;
    if (!title) {
        res.status(400).json({ message: "Workflow title is required" });
        return;
    }
    const workflowData = {
        title,
        description: description ?? null,
        assignedToId: assignedToId ? Number(assignedToId) : null,
        departmentId: departmentId ? Number(departmentId) : null,
        createdById: user?.id ?? null,
        dueDate: dueDate ? new Date(dueDate) : null,
        priority: priority || client_1.WorkflowPriority.MEDIUM,
    };
    const workflow = await prisma.workflowTask.create({
        data: workflowData,
    });
    await writeAuditLog(user?.id || null, "CREATE_WORKFLOW", "WorkflowTask", String(workflow.id));
    io.emit("workflow-created", workflow);
    res.status(201).json({ message: "Workflow created", workflow });
}));
app.patch("/api/workflows/:id/status", authenticate, asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const id = Number(req.params.id);
    const { status, actualHours } = req.body;
    if (!user) {
        res.status(401).json({ message: "Authentication required" });
        return;
    }
    if (!Object.values(client_1.WorkflowStatus).includes(status)) {
        res.status(400).json({ message: "Invalid workflow status" });
        return;
    }
    const workflow = await prisma.workflowTask.findUnique({ where: { id } });
    if (!workflow) {
        res.status(404).json({ message: "Workflow not found" });
        return;
    }
    const canUpdate = workflow.assignedToId === user.id ||
        adminLikeRoles.includes(user.role);
    if (!canUpdate) {
        res.status(403).json({ message: "You cannot update this workflow" });
        return;
    }
    const updateData = {
        status,
        completedAt: status === client_1.WorkflowStatus.COMPLETED ? new Date() : null,
    };
    if (actualHours !== undefined && actualHours !== null) {
        updateData.actualHours = Number(actualHours);
    }
    const updated = await prisma.workflowTask.update({
        where: { id },
        data: updateData,
    });
    await writeAuditLog(user.id, "UPDATE_WORKFLOW_STATUS", "WorkflowTask", String(id));
    io.emit("workflow-updated", updated);
    res.json({ message: "Workflow updated", workflow: updated });
}));
app.get("/api/notifications", authenticate, asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    if (!user) {
        res.status(401).json({ message: "Authentication required" });
        return;
    }
    const canViewAll = adminLikeRoles.includes(user.role);
    const notifications = await prisma.notification.findMany({
        where: canViewAll ? {} : { OR: [{ userId: user.id }, { userId: null }] },
        orderBy: { createdAt: "desc" },
        take: 50,
    });
    res.json({ notifications });
}));
app.patch("/api/notifications/:id/read", authenticate, asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const id = Number(req.params.id);
    if (!user) {
        res.status(401).json({ message: "Authentication required" });
        return;
    }
    const notification = await prisma.notification.findFirst({
        where: {
            id,
            OR: [{ userId: user.id }, { userId: null }],
        },
    });
    if (!notification) {
        res.status(404).json({ message: "Notification not found" });
        return;
    }
    const updated = await prisma.notification.update({
        where: { id },
        data: { isRead: true },
    });
    res.json({ message: "Notification marked as read", notification: updated });
}));
app.get("/api/policies", authenticate, asyncHandler(async (_req, res) => {
    const policies = await prisma.workPolicy.findMany({
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
    res.json({ policies });
}));
app.put("/api/policies/:id", authenticate, requireRoles(client_1.UserRole.ADMIN, client_1.UserRole.HR), asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const id = Number(req.params.id);
    const { allowedIdleMinutes, breakAllowanceMinutes, graceMinutes, minimumWorkHours, overtimeAfterHours, } = req.body;
    const updated = await prisma.workPolicy.update({
        where: { id },
        data: {
            allowedIdleMinutes: Number(allowedIdleMinutes),
            breakAllowanceMinutes: Number(breakAllowanceMinutes),
            graceMinutes: Number(graceMinutes),
            minimumWorkHours: Number(minimumWorkHours),
            overtimeAfterHours: Number(overtimeAfterHours),
        },
    });
    await writeAuditLog(user?.id || null, "UPDATE_POLICY", "WorkPolicy", String(id));
    res.json({ message: "Policy updated", policy: updated });
}));
app.get("/api/reports/daily", authenticate, requireRoles(client_1.UserRole.ADMIN, client_1.UserRole.MANAGER, client_1.UserRole.HR), asyncHandler(async (req, res) => {
    const date = dayStart(req.query.date ? String(req.query.date) : undefined);
    const [attendance, productivity, workflowCounts, activeSessions] = await Promise.all([
        prisma.attendanceRecord.findMany({
            where: { date },
            include: { user: { select: { employeeCode: true, firstName: true, lastName: true } } },
        }),
        prisma.productivityRecord.findMany({
            where: { date },
            include: { user: { select: { employeeCode: true, firstName: true, lastName: true } } },
        }),
        prisma.workflowTask.groupBy({
            by: ["status"],
            _count: { status: true },
        }),
        prisma.loginSession.count({ where: { status: client_1.SessionStatus.ACTIVE } }),
    ]);
    res.json({
        date,
        activeSessions,
        attendance,
        productivity,
        workflowCounts,
    });
}));
app.get("/api/reports/export", authenticate, requireRoles(client_1.UserRole.ADMIN, client_1.UserRole.MANAGER, client_1.UserRole.HR), asyncHandler(async (_req, res) => {
    const records = await prisma.productivityRecord.findMany({
        include: { user: true },
        orderBy: { date: "desc" },
        take: 100,
    });
    const csv = [
        "Employee Code,Name,Date,Login Minutes,Idle Minutes,Break Minutes,Productive Minutes,Productivity Percent",
        ...records.map((record) => [
            record.user.employeeCode,
            `${record.user.firstName} ${record.user.lastName}`,
            record.date.toISOString().slice(0, 10),
            record.loginMinutes,
            record.idleMinutes,
            record.breakMinutes,
            record.productiveMinutes,
            record.productivityPercent,
        ].join(",")),
    ].join("\n");
    res.header("Content-Type", "text/csv");
    res.attachment("productivity-report.csv");
    res.send(csv);
}));
app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({
        message: "Something went wrong on the server",
        detail: process.env.NODE_ENV === "production" ? undefined : err.message,
    });
});
const PORT = Number(process.env.PORT) || 5000;
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
//# sourceMappingURL=server.js.map