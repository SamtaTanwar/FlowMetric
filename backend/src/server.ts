import cors from "cors";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import express, { NextFunction, Request, RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";
import { createServer } from "node:http";
import { Server } from "socket.io";
import {
  AttendanceStatus,
  NotificationType,
  Prisma,
  PrismaClient,
  SessionStatus,
  TrackingEventType,
  UserRole,
  WorkflowPriority,
  WorkflowStatus,
} from "@prisma/client";

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" },
});
const prisma = new PrismaClient();
const jwtSecret = process.env.JWT_SECRET || "employee_workflow_secret_key";
const adminLikeRoles: UserRole[] = [UserRole.ADMIN, UserRole.MANAGER, UserRole.HR];

type AuthUser = {
  id: number;
  employeeCode: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
};

type AuthRequest = Request & {
  user?: AuthUser;
};

app.use(cors());
app.use(express.json({ limit: "1mb" }));

io.on("connection", (socket) => {
  socket.emit("connected", { message: "Realtime employee workflow channel connected" });
});

const asyncHandler =
  (handler: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler =>
  (req, res, next) => {
    handler(req, res, next).catch(next);
  };

function getAuthUser(req: Request) {
  return (req as AuthRequest).user;
}

function generateToken(user: AuthUser) {
  return jwt.sign(
    {
      userId: user.id,
      role: user.role,
      employeeCode: user.employeeCode,
    },
    jwtSecret,
    { expiresIn: "8h" },
  );
}

function sanitizeUser(user: AuthUser & { department?: unknown; shift?: unknown }) {
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

function dayStart(input?: string | Date) {
  const date = input ? new Date(input) : new Date();
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function minutesBetween(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function shiftStartForDate(date: Date, shiftStart = "09:00") {
  const [hours = "9", minutes = "0"] = shiftStart.split(":");
  const result = dayStart(date);
  result.setHours(Number(hours), Number(minutes), 0, 0);
  return result;
}

function productivityPercent(productiveMinutes: number, loginMinutes: number) {
  if (loginMinutes <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((productiveMinutes / loginMinutes) * 100));
}

async function writeAuditLog(actorId: number | null, action: string, entity: string, entityId?: string) {
  await prisma.auditLog.create({
    data: {
      actorId,
      action,
      entity,
      entityId: entityId ?? null,
    },
  });
}

const authenticate: RequestHandler = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Authentication token is required" });
    return;
  }

  try {
    const token = authHeader.replace("Bearer ", "");
    const payload = jwt.verify(token, jwtSecret) as { userId: number };
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

    (req as AuthRequest).user = user;
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired authentication token" });
  }
});

function requireRoles(...roles: UserRole[]): RequestHandler {
  return (req, res, next) => {
    const user = getAuthUser(req);

    if (!user || !roles.includes(user.role)) {
      res.status(403).json({ message: "You do not have permission for this action" });
      return;
    }

    next();
  };
}

async function finalizeSession(
  sessionId: number,
  input: {
    activeMinutes?: number;
    idleMinutes?: number;
    breakMinutes?: number;
    lockMinutes?: number;
  } = {},
) {
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
  const activeMinutes =
    input.activeMinutes ?? Math.max(0, loginMinutes - idleMinutes - breakMinutes);
  const lockMinutes = input.lockMinutes ?? session.lockMinutes;
  const productiveMinutes = Math.max(0, loginMinutes - idleMinutes - breakMinutes);
  const date = dayStart(session.loginAt);

  const updatedSession = await prisma.loginSession.update({
    where: { id: session.id },
    data: {
      logoutAt,
      status: SessionStatus.COMPLETED,
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
      overtimeMinutes: Math.max(
        0,
        loginMinutes - Math.round((session.user.shift?.minimumWorkHours || 8) * 60),
      ),
      idleDeductionMinutes: idleMinutes,
    },
  });

  await prisma.trackingEvent.create({
    data: {
      userId: session.userId,
      sessionId: session.id,
      type: TrackingEventType.LOGOUT,
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
      ].filter(Boolean) as Array<{ employeeCode?: string; email?: string }>,
    },
    include: { department: true, shift: true },
  });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ message: "Invalid credentials" });
    return;
  }

  if (user.status !== "ACTIVE") {
    res.status(403).json({ message: "This employee account is inactive" });
    return;
  }

  const authUser: AuthUser = {
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
  const {
    firstName,
    lastName,
    email,
    password,
    designation,
    departmentId,
  } = req.body;

  // Validate required fields
  if (
    !firstName ||
    !lastName ||
    !email ||
    !password ||
    !designation ||
    !departmentId
  ) {
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
  const passwordHash = await bcrypt.hash(password, 10);

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
      role: UserRole.EMPLOYEE,
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
    data: { passwordHash: await bcrypt.hash(password, 10) },
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
        type: NotificationType.ADMIN_ANNOUNCEMENT,
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
      status: SessionStatus.ACTIVE,
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

app.get(
  "/api/employees",
  authenticate,
  requireRoles(UserRole.ADMIN, UserRole.MANAGER, UserRole.HR),
  asyncHandler(async (_req, res) => {
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
  }),
);

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
    where: { userId: user.id, status: SessionStatus.ACTIVE },
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
  const attendanceStatus = lateMinutes > 0 ? AttendanceStatus.LATE : AttendanceStatus.PRESENT;

  const session = await prisma.loginSession.create({
    data: {
      userId: user.id,
      loginAt,
      deviceInfo: req.body.deviceInfo ?? null,
      ipAddress: req.ip ?? null,
      events: {
        create: {
          userId: user.id,
          type: TrackingEventType.LOGIN,
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

app.get(
  "/api/employees/:id/workday-stats",
  authenticate,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);

    const today = dayStart();

    const session = await prisma.loginSession.findFirst({
      where: {
        userId: id,
        loginAt: {
          gte: today,
        },
      },

      orderBy: {
        loginAt: "desc",
      },
    });

    if (!session) {
      res.json({
        loginTime: null,
        activeMinutes: 0,
        idleMinutes: 0,
        productiveMinutes: 0,
        productivity: 0,
      });

      return;
    }

    const events = await prisma.trackingEvent.findMany({
      where: {
        sessionId: session.id,
      },

      orderBy: {
        createdAt: "asc",
      },
    });

    let idleMinutes = 0;
    let idleStart: Date | null = null;

    for (const event of events) {
      if (event.type === "IDLE_START") {
        idleStart = event.createdAt;
      }

      if (
        event.type === "IDLE_END" &&
        idleStart
      ) {
        idleMinutes += Math.floor(
          (event.createdAt.getTime() -
            idleStart.getTime()) /
            60000
        );

        idleStart = null;
      }
    }

    const endTime =
      session.logoutAt || new Date();

    const totalMinutes = Math.floor(
      (endTime.getTime() -
        session.loginAt.getTime()) /
        60000
    );

    const productiveMinutes =
      totalMinutes - idleMinutes;

    const productivity =
      totalMinutes > 0
        ? Math.round(
            (productiveMinutes /
              totalMinutes) *
              100
          )
        : 0;

    res.json({
      loginTime: session.loginAt,
      activeMinutes: totalMinutes,
      idleMinutes,
      productiveMinutes,
      productivity,
    });
  })
);

app.post("/api/tracking/event", authenticate, asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { sessionId, type, durationSeconds, appName, windowTitle, metadata } = req.body;

  if (!user) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  if (!Object.values(TrackingEventType).includes(type)) {
    res.status(400).json({ message: "Invalid tracking event type" });
    return;
  }

  const event = await prisma.trackingEvent.create({
    data: {
      userId: user.id,
      sessionId: sessionId ? Number(sessionId) : null,
      type: type as TrackingEventType,
      durationSeconds: durationSeconds ? Number(durationSeconds) : null,
      appName: appName ?? null,
      windowTitle: windowTitle ?? null,
      metadata: metadata ?? Prisma.JsonNull,
    },
  });

  if (sessionId && durationSeconds) {
    const minutes = Math.round(Number(durationSeconds) / 60);
    const increment =
      type === TrackingEventType.IDLE_END
        ? { idleMinutes: { increment: minutes } }
        : type === TrackingEventType.BREAK_END
          ? { breakMinutes: { increment: minutes } }
          : type === TrackingEventType.SCREEN_UNLOCK
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
      status: SessionStatus.ACTIVE,
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

app.get(
  "/api/tracking/active-session",
  authenticate,
  async (req: any, res) => {
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

      const latestBreakEvent =
        await prisma.trackingEvent.findFirst({
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

        isOnBreak:
          latestBreakEvent?.type === "BREAK_START",
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: "Failed to fetch active session",
      });
    }
  }
);

app.get(
  "/api/tracking/latest-session",
  authenticate,
  async (req: any, res) => {
    try {
      const latestSession =
        await prisma.loginSession.findFirst({
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
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: "Failed to fetch latest session",
      });
    }
  }
);
app.get(
  "/api/tracking/events/:sessionId",
  authenticate,
  async (req, res) => {
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
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: "Failed to fetch tracking events",
      });
    }
  }
);

app.get(
  "/api/tracking/live",
  authenticate,
  requireRoles(UserRole.ADMIN, UserRole.MANAGER, UserRole.HR),
  asyncHandler(async (_req, res) => {
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
        liveStatus:
          employee.loginSessions[0]?.status === SessionStatus.ACTIVE ? "ONLINE" : "OFFLINE",
        currentSession: employee.loginSessions[0] || null,
      })),
    });
  }),
);

app.get(
  "/api/admin/dashboard-stats",
  authenticate,
  async (req: any, res) => {
    try {
      const today = dayStart();
      
      // Total employees count (all roles)
      const totalEmployees = await prisma.user.count({
        where: {
          role: UserRole.EMPLOYEE,
        },
      });

      // Active employees (have active login sessions today)
      const activeEmployees = await prisma.loginSession.count({
        where: {
          status: SessionStatus.ACTIVE,
        },
      });

      // Employees on break today
      const breakEmployees = await prisma.trackingEvent.count({
        where: {
          type: TrackingEventType.BREAK_START,
          createdAt: {
            gte: today,
            lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
          },
        },
      });

      // Idle employees today
      const idleEmployees = await prisma.trackingEvent.count({
        where: {
          type: TrackingEventType.IDLE_START,
          createdAt: {
            gte: today,
            lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
          },
        },
      });

      // Average productivity today
      const productivityRecords = await prisma.productivityRecord.findMany({
        where: { date: today },
      });

      const avgProductivity =
        productivityRecords.length > 0
          ? Math.round(
              productivityRecords.reduce((sum, record) => sum + record.productivityPercent, 0) /
                productivityRecords.length
            )
          : 0;

      // Attendance metrics today
      const attendanceRecords = await prisma.attendanceRecord.findMany({
        where: { date: today },
      });

      const presentCount = attendanceRecords.filter(
        (r) => r.status === AttendanceStatus.PRESENT
      ).length;
      const attendancePercent =
        totalEmployees > 0 ? Math.round((presentCount / totalEmployees) * 100) : 0;

      res.json({
        totalEmployees,
        activeEmployees,
        breakEmployees,
        idleEmployees,
        avgProductivity,
        attendancePercent,
        presentCount,
        totalRecorded: attendanceRecords.length,
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        message: "Failed to fetch dashboard stats",
      });
    }
  }
);

app.get("/api/productivity/summary", authenticate, asyncHandler(async (_req, res) => {
  const today = dayStart();
  const records = await prisma.productivityRecord.findMany({
    where: { date: today },
    include: { user: { include: { department: true } } },
    orderBy: { productivityPercent: "desc" },
  });

  const average =
    records.length > 0
      ? Math.round(records.reduce((sum, item) => sum + item.productivityPercent, 0) / records.length)
      : 0;
  const departments = new Map<string, { total: number; count: number }>();

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

app.post(
  "/api/workflows",
  authenticate,
  requireRoles(UserRole.ADMIN, UserRole.MANAGER),
  asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const { title, description, assignedToId, departmentId, dueDate, priority } = req.body;

    if (!title) {
      res.status(400).json({ message: "Workflow title is required" });
      return;
    }

    const workflowData: Prisma.WorkflowTaskUncheckedCreateInput = {
      title,
      description: description ?? null,
      assignedToId: assignedToId ? Number(assignedToId) : null,
      departmentId: departmentId ? Number(departmentId) : null,
      createdById: user?.id ?? null,
      dueDate: dueDate ? new Date(dueDate) : null,
      priority: priority || WorkflowPriority.MEDIUM,
    };

    const workflow = await prisma.workflowTask.create({
      data: workflowData,
    });

    await writeAuditLog(user?.id || null, "CREATE_WORKFLOW", "WorkflowTask", String(workflow.id));
    io.emit("workflow-created", workflow);

    res.status(201).json({ message: "Workflow created", workflow });
  }),
);

app.patch("/api/workflows/:id/status", authenticate, asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const id = Number(req.params.id);
  const { status, actualHours } = req.body;

  if (!user) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  if (!Object.values(WorkflowStatus).includes(status)) {
    res.status(400).json({ message: "Invalid workflow status" });
    return;
  }

  const workflow = await prisma.workflowTask.findUnique({ where: { id } });

  if (!workflow) {
    res.status(404).json({ message: "Workflow not found" });
    return;
  }

  const canUpdate =
    workflow.assignedToId === user.id ||
    adminLikeRoles.includes(user.role);

  if (!canUpdate) {
    res.status(403).json({ message: "You cannot update this workflow" });
    return;
  }

  const updateData: Prisma.WorkflowTaskUncheckedUpdateInput = {
    status,
    completedAt: status === WorkflowStatus.COMPLETED ? new Date() : null,
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

app.put(
  "/api/policies/:id",
  authenticate,
  requireRoles(UserRole.ADMIN, UserRole.HR),
  asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const id = Number(req.params.id);
    const {
      allowedIdleMinutes,
      breakAllowanceMinutes,
      graceMinutes,
      minimumWorkHours,
      overtimeAfterHours,
    } = req.body;

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
  }),
);

app.get(
  "/api/reports/daily",
  authenticate,
  requireRoles(UserRole.ADMIN, UserRole.MANAGER, UserRole.HR),
  asyncHandler(async (req, res) => {
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
      prisma.loginSession.count({ where: { status: SessionStatus.ACTIVE } }),
    ]);

    res.json({
      date,
      activeSessions,
      attendance,
      productivity,
      workflowCounts,
    });
  }),
);

app.get(
  "/api/reports/export",
  authenticate,
  requireRoles(UserRole.ADMIN, UserRole.MANAGER, UserRole.HR),
  asyncHandler(async (_req, res) => {
    const records = await prisma.productivityRecord.findMany({
      include: { user: true },
      orderBy: { date: "desc" },
      take: 100,
    });
    const csv = [
      "Employee Code,Name,Date,Login Minutes,Idle Minutes,Break Minutes,Productive Minutes,Productivity Percent",
      ...records.map((record) =>
        [
          record.user.employeeCode,
          `${record.user.firstName} ${record.user.lastName}`,
          record.date.toISOString().slice(0, 10),
          record.loginMinutes,
          record.idleMinutes,
          record.breakMinutes,
          record.productiveMinutes,
          record.productivityPercent,
        ].join(","),
      ),
    ].join("\n");

    res.header("Content-Type", "text/csv");
    res.attachment("productivity-report.csv");
    res.send(csv);
  }),
);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
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
