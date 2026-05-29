import cors from "cors";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import express, { NextFunction, Request, RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";
import { createServer } from "node:http";
import { Server } from "socket.io";
import {
  AttendanceStatus,
  LeaveRequestStatus,
  LeaveType,
  NotificationPriority,
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
const FIRST_BREAK_ALLOWANCE_MINUTES = 45;
const SECOND_BREAK_ALLOWANCE_MINUTES = 15;
const DEFAULT_BREAK_ALLOWANCE_MINUTES = FIRST_BREAK_ALLOWANCE_MINUTES + SECOND_BREAK_ALLOWANCE_MINUTES;
const IDLE_THRESHOLD_MINUTES = 5;
const SCREENSHOT_INTERVAL_MINUTES = 10;

type AuthUser = {
  id: number;
  employeeCode: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  accountType: "ADMIN" | "USER";
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

function userActorId(user?: AuthUser) {
  return user?.accountType === "USER" ? user.id : null;
}

function adminActorId(user?: AuthUser) {
  return user?.accountType === "ADMIN" ? user.id : null;
}

function isEmployeeAccount(
  user?: AuthUser,
): user is AuthUser & { accountType: "USER"; role: "EMPLOYEE" } {
  return user?.accountType === "USER" && user.role === UserRole.EMPLOYEE;
}

function generateToken(user: AuthUser) {
  return jwt.sign(
    {
      userId: user.id,
      role: user.role,
      employeeCode: user.employeeCode,
      accountType: user.accountType,
    },
    jwtSecret,
    { expiresIn: "8h" },
  );
}

function sanitizeUser(user: {
  id: number;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  accountType?: "ADMIN" | "USER";
  department?: unknown;
  shift?: unknown;
}) {
  return {
    id: user.id,
    employeeCode: user.employeeCode,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    accountType: user.accountType,
    department: user.department,
    shift: user.shift,
  };
}

function dayStart(input?: string | Date) {
  const date = input ? new Date(input) : new Date();
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function nextDayStart(input = new Date()) {
  return new Date(input.getFullYear(), input.getMonth(), input.getDate() + 1);
}

function minutesBetween(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function timeForDate(date: Date, hours: number, minutes: number) {
  const result = dayStart(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function attendanceForLogin(loginAt: Date) {
  const shiftStart = timeForDate(loginAt, 9, 0);
  const halfDayThreshold = timeForDate(loginAt, 9, 15);

  if (loginAt.getTime() >= halfDayThreshold.getTime()) {
    return {
      status: AttendanceStatus.HALF_DAY,
      lateMinutes: minutesBetween(shiftStart, loginAt),
    };
  }

  return {
    status: AttendanceStatus.PRESENT,
    lateMinutes: 0,
  };
}

function productivityPercent(productiveMinutes: number, loginMinutes: number) {
  if (loginMinutes <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((productiveMinutes / loginMinutes) * 100));
}

function productivityPercentFromSeconds(productiveSeconds: number, loginSeconds: number) {
  if (loginSeconds <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((productiveSeconds / loginSeconds) * 100));
}

function productiveMinutesWithBreakAllowance(
  loginMinutes: number,
  idleMinutes: number,
  breakMinutes: number,
  breakAllowanceMinutes = DEFAULT_BREAK_ALLOWANCE_MINUTES,
  excessBreakMinutes?: number,
) {
  const breakOverage = excessBreakMinutes ?? Math.max(0, breakMinutes - breakAllowanceMinutes);
  return Math.max(0, loginMinutes - idleMinutes - breakOverage);
}

function productiveSecondsWithBreakAllowance(
  loginSeconds: number,
  idleSeconds: number,
  breakSeconds: number,
  breakAllowanceMinutes = DEFAULT_BREAK_ALLOWANCE_MINUTES,
  excessBreakSeconds?: number,
) {
  const breakOverageSeconds = excessBreakSeconds ?? Math.max(0, breakSeconds - breakAllowanceMinutes * 60);
  return Math.max(0, loginSeconds - idleSeconds - breakOverageSeconds);
}

async function getBreakAllowanceMinutes() {
  const policy = await prisma.workPolicy.findFirst({
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: { breakAllowanceMinutes: true },
  });

  return Math.max(policy?.breakAllowanceMinutes ?? 0, DEFAULT_BREAK_ALLOWANCE_MINUTES);
}

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function csvRow(values: unknown[]) {
  return values.map(csvCell).join(",");
}

function workflowStatusFromProgress(actualHours: number, estimatedHours?: number | null) {
  if (!estimatedHours || estimatedHours <= 0) {
    return WorkflowStatus.IN_PROGRESS;
  }

  const progress = (actualHours / estimatedHours) * 100;

  if (progress >= 100) {
    return WorkflowStatus.COMPLETED;
  }

  if (progress >= 80) {
    return WorkflowStatus.REVIEW;
  }

  return WorkflowStatus.IN_PROGRESS;
}

async function applyProductiveTimeToWorkflows(userId: number, productiveMinutes: number) {
  if (productiveMinutes <= 0) {
    return [];
  }

  const workflows = await prisma.workflowTask.findMany({
    where: {
      assignedToId: userId,
      status: {
        in: [WorkflowStatus.TODO, WorkflowStatus.IN_PROGRESS, WorkflowStatus.REVIEW],
      },
    },
    orderBy: [
      { dueDate: "asc" },
      { updatedAt: "asc" },
    ],
  });

  if (workflows.length === 0) {
    return [];
  }

  const addedHoursPerWorkflow = productiveMinutes / 60 / workflows.length;

  const updates = await Promise.all(
    workflows.map((workflow) => {
      const nextActualHours = Number(
        ((workflow.actualHours ?? 0) + addedHoursPerWorkflow).toFixed(2),
      );
      const nextStatus = workflowStatusFromProgress(nextActualHours, workflow.estimatedHours);

      return prisma.workflowTask.update({
        where: { id: workflow.id },
        data: {
          actualHours: nextActualHours,
          status: nextStatus,
          completedAt: nextStatus === WorkflowStatus.COMPLETED ? new Date() : null,
        },
      });
    }),
  );

  updates.forEach((workflow) => io.emit("workflow-updated", workflow));

  return updates;
}

function monthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);

  return { start, end };
}

async function calculateLeavePaySplit(userId: number, type: LeaveType, days: number) {
  if (type !== LeaveType.SICK) {
    return { paidDays: 0, unpaidDays: days };
  }

  const { start, end } = monthRange();
  const usedPaidSickLeave = await prisma.leaveRequest.aggregate({
    where: {
      userId,
      type: LeaveType.SICK,
      status: LeaveRequestStatus.APPROVED,
      createdAt: {
        gte: start,
        lt: end,
      },
    },
    _sum: {
      paidDays: true,
    },
  });
  const remainingPaidSickLeave = Math.max(0, 1 - (usedPaidSickLeave._sum.paidDays ?? 0));
  const paidDays = Math.min(days, remainingPaidSickLeave);

  return {
    paidDays,
    unpaidDays: days - paidDays,
  };
}

function validatePasswordStrength(password: string) {
  if (
    password.length < 8 ||
    !/[A-Za-z]/.test(password) ||
    !/\d/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    return "Password must be at least 8 characters and include a letter, number, and symbol";
  }

  return null;
}

function prismaErrorMessage(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return "A record with this value already exists";
    }

    if (error.code === "P2003") {
      return "This action cannot be completed because related data is missing";
    }

    if (error.code === "P2025") {
      return "The requested record was not found";
    }

    if (error.code === "P2021" || error.code === "P2022") {
      return "Database schema is not synced. Run npx.cmd prisma db push from the backend folder";
    }

    return "Database request failed";
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return "Invalid data sent to the database";
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return "Database connection could not be initialized";
  }

  return null;
}

async function writeAuditLog(
  actorId: number | null,
  action: string,
  entity: string,
  entityId?: string,
  actorAdminId: number | null = null,
) {
  await prisma.auditLog.create({
    data: {
      actorId,
      actorAdminId,
      action,
      entity,
      entityId: entityId ?? null,
    },
  });
}

async function writeAuthAuditLog(user: AuthUser | undefined, action: string, entity: string, entityId?: string) {
  await writeAuditLog(userActorId(user), action, entity, entityId, adminActorId(user));
}

const authenticate: RequestHandler = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Authentication token is required" });
    return;
  }

  try {
    const token = authHeader.replace("Bearer ", "");
    const payload = jwt.verify(token, jwtSecret) as {
      userId: number;
      accountType?: "ADMIN" | "USER";
    };

    if (payload.accountType === "ADMIN") {
      const admin = await prisma.admin.findUnique({
        where: { id: payload.userId },
        select: {
          id: true,
          adminCode: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          status: true,
        },
      });

      if (!admin || admin.status !== "ACTIVE") {
        res.status(401).json({ message: "User is inactive or no longer exists" });
        return;
      }

      (req as AuthRequest).user = {
        id: admin.id,
        employeeCode: admin.adminCode,
        firstName: admin.firstName,
        lastName: admin.lastName,
        email: admin.email,
        role: admin.role,
        accountType: "ADMIN",
      };
      next();
      return;
    }

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

    (req as AuthRequest).user = {
      ...user,
      accountType: "USER",
    };
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

const UNPRODUCTIVE_USAGE_KEYWORDS = [
  "youtube",
  "netflix",
  "prime video",
  "hotstar",
  "disney+",
  "spotify",
  "wynk",
  "gaana",
  "jiosaavn",
  "vlc",
  "media player",
  "movie",
  "music",
  "song",
  "game",
  "gaming",
  "steam",
  "epic games",
  "valorant",
  "pubg",
  "free fire",
  "minecraft",
  "roblox",
  "facebook",
  "instagram",
  "whatsapp",
  "telegram",
  "twitter",
  "x.com",
  "reddit",
];

function metadataValue(metadata: Prisma.JsonValue | null | undefined, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "";
  }

  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

function appUsageCategory(input: {
  appName?: string | null;
  windowTitle?: string | null;
  metadata?: Prisma.JsonValue | null;
}) {
  const explicitCategory = metadataValue(input.metadata, "category").toLowerCase();

  if (explicitCategory.includes("network")) {
    return "NETWORK";
  }

  if (explicitCategory.includes("unproductive")) {
    return "UNPRODUCTIVE";
  }

  if (explicitCategory.includes("productive")) {
    return "PRODUCTIVE";
  }

  const text = [
    input.appName,
    input.windowTitle,
    metadataValue(input.metadata, "url"),
    metadataValue(input.metadata, "domain"),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return UNPRODUCTIVE_USAGE_KEYWORDS.some((keyword) => text.includes(keyword))
    ? "UNPRODUCTIVE"
    : "PRODUCTIVE";
}

async function nonWorkingUsageMinutesForSession(sessionId: number) {
  const events = await prisma.trackingEvent.findMany({
    where: {
      sessionId,
      type: TrackingEventType.APP_USAGE,
    },
    select: {
      appName: true,
      windowTitle: true,
      metadata: true,
      durationSeconds: true,
    },
  });

  const seconds = events.reduce((sum, event) => {
    const category = appUsageCategory(event);

    if (category !== "UNPRODUCTIVE" && category !== "NETWORK") {
      return sum;
    }

    return sum + (event.durationSeconds ?? 0);
  }, 0);

  return Math.round(seconds / 60);
}

async function idleMinutesWithOpenIdle(sessionId: number, storedIdleMinutes: number, endAt: Date) {
  const latestIdleEvent = await prisma.trackingEvent.findFirst({
    where: {
      sessionId,
      type: {
        in: [TrackingEventType.IDLE_START, TrackingEventType.IDLE_END],
      },
    },
    orderBy: { createdAt: "desc" },
  });

  if (latestIdleEvent?.type !== TrackingEventType.IDLE_START) {
    return storedIdleMinutes;
  }

  return storedIdleMinutes + minutesBetween(latestIdleEvent.createdAt, endAt);
}

function secondsFromEventPairs(
  events: Array<{
    type: TrackingEventType;
    createdAt: Date;
    durationSeconds?: number | null;
  }>,
  startType: TrackingEventType,
  endType: TrackingEventType,
  endAt: Date,
) {
  let startedAt: Date | null = null;
  let totalSeconds = 0;

  for (const event of events) {
    if (event.type === startType) {
      startedAt = event.createdAt;
    }

    if (event.type === endType && startedAt) {
      totalSeconds += event.durationSeconds
        ? Number(event.durationSeconds)
        : Math.max(0, Math.round((event.createdAt.getTime() - startedAt.getTime()) / 1000));
      startedAt = null;
    }
  }

  if (startedAt) {
    totalSeconds += Math.max(0, Math.round((endAt.getTime() - startedAt.getTime()) / 1000));
  }

  return totalSeconds;
}

function breakAllowanceFromEvents(
  events: Array<{
    type: TrackingEventType;
    createdAt: Date;
    durationSeconds?: number | null;
  }>,
  endAt: Date,
  fallbackBreakMinutes = 0,
) {
  let startedAt: Date | null = null;
  const breakDurations: number[] = [];

  for (const event of events) {
    if (event.type === TrackingEventType.BREAK_START) {
      startedAt = event.createdAt;
    }

    if (event.type === TrackingEventType.BREAK_END && startedAt) {
      breakDurations.push(
        event.durationSeconds
          ? Math.max(0, Number(event.durationSeconds))
          : Math.max(0, Math.round((event.createdAt.getTime() - startedAt.getTime()) / 1000)),
      );
      startedAt = null;
    }
  }

  if (startedAt) {
    breakDurations.push(Math.max(0, Math.round((endAt.getTime() - startedAt.getTime()) / 1000)));
  }

  const totalBreakMinutes = breakDurations.length
    ? Math.round(breakDurations.reduce((sum, seconds) => sum + seconds, 0) / 60)
    : fallbackBreakMinutes;
  const allowedSeconds = breakDurations.reduce((sum, seconds, index) => {
    const allowanceMinutes =
      index === 0
        ? FIRST_BREAK_ALLOWANCE_MINUTES
        : index === 1
          ? SECOND_BREAK_ALLOWANCE_MINUTES
          : 0;

    return sum + Math.min(seconds, allowanceMinutes * 60);
  }, 0);
  const excessBreakMinutes = Math.max(0, totalBreakMinutes - Math.round(allowedSeconds / 60));

  return {
    totalBreakMinutes,
    excessBreakMinutes,
  };
}

function lastWorkActivityAt(
  events: Array<{
    type: TrackingEventType;
    createdAt: Date;
  }>,
  fallback: Date,
) {
  const workActivityTypes = new Set<TrackingEventType>([
    TrackingEventType.LOGIN,
    TrackingEventType.IDLE_END,
    TrackingEventType.BREAK_END,
    TrackingEventType.APP_USAGE,
    TrackingEventType.KEYBOARD,
    TrackingEventType.MOUSE,
    TrackingEventType.SCREEN_UNLOCK,
  ]);
  const workEvents = events.filter((event) =>
    workActivityTypes.has(event.type),
  );

  return workEvents.at(-1)?.createdAt ?? fallback;
}

function trailingIdleSecondsAfterLastActivity(
  events: Array<{
    type: TrackingEventType;
    createdAt: Date;
  }>,
  loginAt: Date,
  endAt: Date,
) {
  const latestEvent = events.at(-1);

  if (latestEvent?.type === TrackingEventType.IDLE_START) {
    return 0;
  }

  if (latestEvent?.type === TrackingEventType.BREAK_START) {
    return 0;
  }

  const lastActivityAt = lastWorkActivityAt(events, loginAt);
  const idleStartedAt = new Date(lastActivityAt.getTime() + IDLE_THRESHOLD_MINUTES * 60 * 1000);

  if (idleStartedAt.getTime() >= endAt.getTime()) {
    return 0;
  }

  return Math.round((endAt.getTime() - idleStartedAt.getTime()) / 1000);
}

async function finalizeSession(
  sessionId: number,
  input: {
    activeMinutes?: number;
    idleMinutes?: number;
    breakMinutes?: number;
    lockMinutes?: number;
    logoutAt?: Date;
  } = {},
) {
  const session = await prisma.loginSession.findUnique({
    where: { id: sessionId },
    include: {
      user: { include: { shift: true } },
      events: {
        where: {
          type: {
            in: [TrackingEventType.BREAK_START, TrackingEventType.BREAK_END],
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!session) {
    throw new Error("Tracking session not found");
  }

  const logoutAt = input.logoutAt ?? new Date();
  const loginMinutes = minutesBetween(session.loginAt, logoutAt);
  const rawIdleMinutes = input.idleMinutes ?? session.idleMinutes;
  const rawBreakMinutes = input.breakMinutes ?? session.breakMinutes;
  const breakUsage = breakAllowanceFromEvents(session.events, logoutAt, rawBreakMinutes);
  const breakMinutes = Math.max(rawBreakMinutes, breakUsage.totalBreakMinutes);
  const idleMinutes = rawIdleMinutes + breakUsage.excessBreakMinutes;
  const lockMinutes = input.lockMinutes ?? session.lockMinutes;
  const breakAllowanceMinutes = await getBreakAllowanceMinutes();
  const nonWorkingUsageMinutes = await nonWorkingUsageMinutesForSession(session.id);
  const activeMinutes = Math.max(
    0,
    (input.activeMinutes ?? loginMinutes - rawIdleMinutes - breakMinutes) - nonWorkingUsageMinutes,
  );
  const productiveMinutes = Math.max(
    0,
    productiveMinutesWithBreakAllowance(
      loginMinutes,
      rawIdleMinutes,
      breakMinutes,
      breakAllowanceMinutes,
      breakUsage.excessBreakMinutes,
    ) - nonWorkingUsageMinutes,
  );
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

  const updatedWorkflows = await applyProductiveTimeToWorkflows(
    session.userId,
    productiveMinutes,
  );

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

  const existingLogoutEvent = await prisma.trackingEvent.findFirst({
    where: {
      sessionId: session.id,
      type: TrackingEventType.LOGOUT,
    },
  });

  if (!existingLogoutEvent) {
    await prisma.trackingEvent.create({
      data: {
        userId: session.userId,
        sessionId: session.id,
        type: TrackingEventType.LOGOUT,
        createdAt: logoutAt,
      },
    });
  }

  io.emit("session-stopped", {
    session: updatedSession,
    productivity: record,
    workflows: updatedWorkflows,
  });

  return { session: updatedSession, productivity: record, workflows: updatedWorkflows };
}

async function finalizeStaleActiveSessions(userId?: number) {
  const today = dayStart();
  const sessions = await prisma.loginSession.findMany({
    where: {
      status: SessionStatus.ACTIVE,
      loginAt: { lt: today },
      ...(userId ? { userId } : {}),
    },
    orderBy: { loginAt: "asc" },
  });

  for (const session of sessions) {
    const logoutAt = new Date(dayStart(session.loginAt).getTime() + 24 * 60 * 60 * 1000);
    const events = await prisma.trackingEvent.findMany({
      where: {
        sessionId: session.id,
        type: {
          in: [
            TrackingEventType.LOGIN,
            TrackingEventType.IDLE_START,
            TrackingEventType.IDLE_END,
            TrackingEventType.BREAK_START,
            TrackingEventType.BREAK_END,
            TrackingEventType.APP_USAGE,
            TrackingEventType.KEYBOARD,
            TrackingEventType.MOUSE,
            TrackingEventType.SCREEN_UNLOCK,
          ],
        },
      },
      orderBy: { createdAt: "asc" },
    });
    const idleSecondsFromEvents = secondsFromEventPairs(
      events,
      TrackingEventType.IDLE_START,
      TrackingEventType.IDLE_END,
      logoutAt,
    );
    const trailingIdleSeconds = trailingIdleSecondsAfterLastActivity(events, session.loginAt, logoutAt);
    const idleMinutes = Math.max(
      session.idleMinutes,
      Math.round((idleSecondsFromEvents + trailingIdleSeconds) / 60),
    );

    await finalizeSession(session.id, {
      logoutAt,
      idleMinutes,
    });
  }
}

function scheduleMidnightAutoClockOut() {
  const now = new Date();
  const nextMidnight = nextDayStart(now);
  const delayMs = Math.max(1000, nextMidnight.getTime() - now.getTime());

  setTimeout(async () => {
    try {
      await finalizeStaleActiveSessions();
    } catch (error) {
      console.error("Failed to auto clock-out sessions at midnight", error);
    } finally {
      scheduleMidnightAutoClockOut();
    }
  }, delayMs);
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

  const admin = await prisma.admin.findFirst({
    where: {
      OR: [
        employeeCode ? { adminCode: employeeCode } : undefined,
        email ? { email } : undefined,
      ].filter(Boolean) as Array<{ adminCode?: string; email?: string }>,
    },
  });

  if (admin && (await bcrypt.compare(password, admin.passwordHash))) {
    if (admin.status !== "ACTIVE") {
      res.status(403).json({ message: "This admin account is inactive" });
      return;
    }

    const authUser: AuthUser = {
      id: admin.id,
      employeeCode: admin.adminCode,
      firstName: admin.firstName,
      lastName: admin.lastName,
      email: admin.email,
      role: admin.role,
      accountType: "ADMIN",
    };
    const token = generateToken(authUser);

    await prisma.admin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });
    await writeAuthAuditLog(authUser, "LOGIN", "Admin", String(admin.id));

    res.json({
      message: "Login successful",
      token,
      user: sanitizeUser(authUser),
      deviceInfo,
    });
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
    accountType: "USER",
  };
  const token = generateToken(authUser);

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await writeAuthAuditLog(authUser, "LOGIN", "User", String(user.id));

  res.json({
    message: "Login successful",
    token,
    user: sanitizeUser({ ...user, accountType: "USER" }),
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

  const passwordError = validatePasswordStrength(password);

  if (passwordError) {
    res.status(400).json({ message: passwordError });
    return;
  }

  // Validate official email
  if (!email.endsWith("@bridgegroupsolutions.com") && !email.endsWith("@employmentexpress.org")) {
    res.status(400).json({
      message: "Use your official company email",
    });
    return;
  }

  // Check existing user
  const [existingUser, existingAdmin] = await Promise.all([
    prisma.user.findUnique({ where: { email } }),
    prisma.admin.findUnique({ where: { email } }),
  ]);

  if (existingUser || existingAdmin) {
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

  const passwordError = validatePasswordStrength(password);

  if (passwordError) {
    res.status(400).json({ message: passwordError });
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

  if (user.accountType === "ADMIN") {
    await writeAuthAuditLog(user, "LOGOUT", "Admin", String(user.id));
    res.json({ message: "Logout successful" });
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
  await writeAuthAuditLog(user, "LOGOUT", "LoginSession", String(activeSession.id));

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

  if (user.accountType === "ADMIN") {
    const admin = await prisma.admin.findUnique({
      where: { id: user.id },
    });

    res.json({ user: admin ? sanitizeUser({ ...user, employeeCode: admin.adminCode }) : user });
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
    await finalizeStaleActiveSessions();

    const today = dayStart();
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    const employees = await prisma.user.findMany({
      where: {
  role: UserRole.EMPLOYEE,
},
      include: {
        department: true,
        shift: true,
        loginSessions: {
          where: {
            OR: [
              { status: SessionStatus.ACTIVE },
              {
                loginAt: {
                  gte: today,
                  lt: tomorrow,
                },
              },
            ],
          },
          orderBy: [{ status: "asc" }, { loginAt: "desc" }],
          take: 1,
        },
        productivityRecords: {
          where: {
            date: today,
          },
          orderBy: { date: "desc" },
          take: 1,
        },
        attendanceRecords: {
          where: {
            date: today,
          },
          orderBy: { date: "desc" },
          take: 1,
        },
        assignedWorkflows: {
          select: { id: true },
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

  if (!isEmployeeAccount(user)) {
    res.status(403).json({ message: "Only employee accounts can start tracking" });
    return;
  }

  await finalizeStaleActiveSessions(user.id);

  const existing = await prisma.loginSession.findFirst({
    where: { userId: user.id, status: SessionStatus.ACTIVE },
  });

  if (existing) {
    res.json({ message: "Tracking already active", session: existing });
    return;
  }

  const loginAt = new Date();
  const date = dayStart(loginAt);
  const { lateMinutes, status: attendanceStatus } = attendanceForLogin(loginAt);

  const session = await prisma.loginSession.create({
    data: {
      userId: user.id,
      loginAt,
      deviceInfo: req.body?.deviceInfo ?? null,
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

  await writeAuthAuditLog(user, "START_TRACKING", "LoginSession", String(session.id));
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
    const user = getAuthUser(req);
    const id = Number(req.params.id);
    const requestedDate = req.query.date ? dayStart(String(req.query.date)) : dayStart();
    const nextDate = new Date(requestedDate.getTime() + 24 * 60 * 60 * 1000);
    const today = dayStart();
    const isToday = requestedDate.getTime() === today.getTime();

    if (!user) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    if (user.id !== id && !adminLikeRoles.includes(user.role)) {
      res.status(403).json({ message: "You can view only your own workday stats" });
      return;
    }

    await finalizeStaleActiveSessions(id);

    const session = await prisma.loginSession.findFirst({
      where: {
        userId: id,
        OR: [
          ...(isToday ? [{ status: SessionStatus.ACTIVE }] : []),
          {
            loginAt: {
              gte: requestedDate,
              lt: nextDate,
            },
          },
        ],
      },

      orderBy: [{ status: "asc" }, { loginAt: "desc" }],
    });

    if (!session) {
      res.json({
        date: requestedDate,
        generatedAt: new Date(),
        sessionId: null,
        loginTime: null,
        totalSeconds: 0,
        activeSeconds: 0,
        idleSeconds: 0,
        breakSeconds: 0,
        productiveSeconds: 0,
        activeMinutes: 0,
        idleMinutes: 0,
        breakMinutes: 0,
        productiveMinutes: 0,
        productivity: 0,
        attendance: "NOT_MARKED",
        isFinalized: false,
      });

      return;
    }

    const productivityRecord = await prisma.productivityRecord.findUnique({
      where: {
        userId_date: {
          userId: id,
          date: dayStart(session.loginAt),
        },
      },
    });

    const attendanceRecord = await prisma.attendanceRecord.findUnique({
      where: {
        userId_date: {
          userId: id,
          date: requestedDate,
        },
      },
    });

    const events = await prisma.trackingEvent.findMany({
      where: {
        sessionId: session.id,
      },

      orderBy: {
        createdAt: "asc",
      },
    });

    const endTime =
      session.logoutAt || new Date();
    const idleSecondsFromEvents = secondsFromEventPairs(
      events,
      TrackingEventType.IDLE_START,
      TrackingEventType.IDLE_END,
      endTime,
    );
    const nonWorkingUsageSeconds = events.reduce((sum, event) => {
        if (event.type !== TrackingEventType.APP_USAGE) {
          return sum;
        }

        const category = appUsageCategory(event);

        if (category !== "UNPRODUCTIVE" && category !== "NETWORK") {
          return sum;
        }

        return sum + (event.durationSeconds ?? 0);
      }, 0);
    const nonWorkingUsageMinutes = Math.round(nonWorkingUsageSeconds / 60);
    const totalSeconds = Math.max(0, Math.round((endTime.getTime() - session.loginAt.getTime()) / 1000));
    const totalMinutes = Math.floor(totalSeconds / 60);

    const breakAllowanceMinutes = await getBreakAllowanceMinutes();
    const breakUsage = breakAllowanceFromEvents(events, endTime, session.breakMinutes);
    const breakMinutes = Math.max(session.breakMinutes, breakUsage.totalBreakMinutes);
    const rawIdleSeconds = Math.max(session.idleMinutes * 60, idleSecondsFromEvents);
    const rawIdleMinutes = Math.round(rawIdleSeconds / 60);
    const breakSeconds = breakMinutes * 60;
    const excessBreakSeconds = breakUsage.excessBreakMinutes * 60;
    const idleSeconds = rawIdleSeconds + excessBreakSeconds;
    const idleMinutes = Math.round(idleSeconds / 60);
    const activeMinutes = Math.max(
      0,
      totalMinutes - rawIdleMinutes - breakMinutes - nonWorkingUsageMinutes,
    );
    const activeSeconds = Math.max(
      0,
      totalSeconds - rawIdleSeconds - breakSeconds - nonWorkingUsageSeconds,
    );
    const productiveMinutes = Math.max(
      0,
      productiveMinutesWithBreakAllowance(
        totalMinutes,
        rawIdleMinutes,
        breakMinutes,
        breakAllowanceMinutes,
        breakUsage.excessBreakMinutes,
      ) - nonWorkingUsageMinutes,
    );
    const productiveSeconds = Math.max(
      0,
      productiveSecondsWithBreakAllowance(
        totalSeconds,
        rawIdleSeconds,
        breakSeconds,
        breakAllowanceMinutes,
        excessBreakSeconds,
      ) - nonWorkingUsageSeconds,
    );

    const productivity = productivityPercentFromSeconds(productiveSeconds, totalSeconds);
    const useSavedRecord = session.status === SessionStatus.COMPLETED && productivityRecord;

    res.json({
      date: requestedDate,
      generatedAt: endTime,
      sessionId: session.id,
      loginTime: session.loginAt,
      totalSeconds,
      activeSeconds: useSavedRecord ? productivityRecord.activeMinutes * 60 : activeSeconds,
      idleSeconds: useSavedRecord ? productivityRecord.idleMinutes * 60 : idleSeconds,
      breakSeconds,
      productiveSeconds: useSavedRecord ? productivityRecord.productiveMinutes * 60 : productiveSeconds,
      activeMinutes: useSavedRecord ? productivityRecord.activeMinutes : activeMinutes,
      idleMinutes: useSavedRecord ? productivityRecord.idleMinutes : idleMinutes,
      breakMinutes,
      productiveMinutes: useSavedRecord ? productivityRecord.productiveMinutes : productiveMinutes,
      productivity: useSavedRecord ? productivityRecord.productivityPercent : productivity,
      attendance: attendanceRecord?.status ?? "NOT_MARKED",
      isFinalized: session.status === SessionStatus.COMPLETED,
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

  if (!isEmployeeAccount(user)) {
    res.status(403).json({ message: "Only employee accounts can record tracking events" });
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

app.post("/api/screenshots", authenticate, asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { sessionId, imageDataUrl, capturedAt, isIdle = false, appName, windowTitle } = req.body;
  const parsedSessionId = Number(sessionId);

  if (!user) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  if (!isEmployeeAccount(user)) {
    res.status(403).json({ message: "Only employee accounts can upload screenshots" });
    return;
  }

  if (!parsedSessionId || typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
    res.status(400).json({ message: "Session and screenshot image are required" });
    return;
  }

  const session = await prisma.loginSession.findFirst({
    where: {
      id: parsedSessionId,
      userId: user.id,
      status: SessionStatus.ACTIVE,
    },
  });

  if (!session) {
    res.status(403).json({ message: "Screenshots can be uploaded only during an active clock-in session" });
    return;
  }

  const requestedCapturedAt = capturedAt ? new Date(capturedAt) : new Date();

  if (!Number.isFinite(requestedCapturedAt.getTime())) {
    res.status(400).json({ message: "Invalid screenshot capture time" });
    return;
  }

  const screenshotIntervalMs = SCREENSHOT_INTERVAL_MINUTES * 60 * 1000;
  const firstAllowedAt = new Date(session.loginAt.getTime() + screenshotIntervalMs);

  if (requestedCapturedAt.getTime() < firstAllowedAt.getTime()) {
    res.status(409).json({
      message: `First screenshot is allowed ${SCREENSHOT_INTERVAL_MINUTES} minutes after login`,
      nextAllowedAt: firstAllowedAt,
    });
    return;
  }

  const latestScreenshot = await prisma.employeeScreenshot.findFirst({
    where: {
      userId: user.id,
      sessionId: session.id,
    },
    orderBy: { capturedAt: "desc" },
    select: { capturedAt: true },
  });

  if (
    latestScreenshot &&
    requestedCapturedAt.getTime() - latestScreenshot.capturedAt.getTime() < screenshotIntervalMs
  ) {
    res.status(409).json({
      message: `Screenshots are allowed only every ${SCREENSHOT_INTERVAL_MINUTES} minutes`,
      nextAllowedAt: new Date(latestScreenshot.capturedAt.getTime() + screenshotIntervalMs),
    });
    return;
  }

  const screenshot = await prisma.employeeScreenshot.create({
    data: {
      userId: user.id,
      sessionId: session.id,
      imageDataUrl,
      capturedAt: requestedCapturedAt,
      isIdle: Boolean(isIdle),
      appName: appName ? String(appName) : null,
      windowTitle: windowTitle ? String(windowTitle) : null,
    },
    include: {
      user: {
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          department: true,
        },
      },
    },
  });

  io.emit("employee-screenshot", {
    screenshotId: screenshot.id,
    userId: user.id,
    capturedAt: screenshot.capturedAt,
    isIdle: screenshot.isIdle,
  });

  res.status(201).json({ message: "Screenshot captured", screenshot });
}));

app.get(
  "/api/screenshots",
  authenticate,
  requireRoles(UserRole.ADMIN, UserRole.MANAGER, UserRole.HR),
  asyncHandler(async (req, res) => {
    const userId = req.query.userId ? Number(req.query.userId) : undefined;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 24));
    const date = req.query.date ? dayStart(String(req.query.date)) : undefined;
    const isIdle = req.query.isIdle === "true" ? true : undefined;
    const department = typeof req.query.department === "string" ? req.query.department.trim() : "";
    const capturedAt = date
      ? {
        gte: date,
        lt: new Date(date.getTime() + 24 * 60 * 60 * 1000),
      }
      : undefined;

    const screenshots = await prisma.employeeScreenshot.findMany({
      where: {
        ...(userId ? { userId } : {}),
        ...(capturedAt ? { capturedAt } : {}),
        ...(isIdle === true ? { isIdle: true } : {}),
        ...(department
          ? {
              user: {
                department: {
                  name: {
                    contains: department,
                  },
                },
              },
            }
          : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            department: true,
          },
        },
      },
      orderBy: { capturedAt: "desc" },
      take: limit,
    });

    res.json({ screenshots });
  }),
);

app.get("/api/my/screenshots", authenticate, asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const sessionId = req.query.sessionId ? Number(req.query.sessionId) : undefined;
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 24));

  if (!user) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  if (!isEmployeeAccount(user)) {
    res.status(403).json({ message: "Only employee accounts can view their screenshots" });
    return;
  }

  const screenshots = await prisma.employeeScreenshot.findMany({
    where: {
      userId: user.id,
      ...(sessionId ? { sessionId } : {}),
    },
    orderBy: { capturedAt: "desc" },
    take: limit,
  });

  res.json({ screenshots });
}));

app.post("/api/tracking/stop", authenticate, asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const sessionId = Number(req.body.sessionId);

  if (!user) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  if (!isEmployeeAccount(user)) {
    res.status(403).json({ message: "Only employee accounts can stop tracking" });
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
  await writeAuthAuditLog(user, "STOP_TRACKING", "LoginSession", String(session.id));

  res.json({
    message: "Tracking stopped",
    ...result,
  });
}));

app.get(
  "/api/tracking/active-session",
  authenticate,
  async (req, res) => {
    try {
      const user = getAuthUser(req);

      if (!isEmployeeAccount(user)) {
        return res.status(403).json({ message: "Only employee accounts can view active sessions" });
      }

      await finalizeStaleActiveSessions(user.id);

      const activeSession = await prisma.loginSession.findFirst({
        where: {
          userId: user.id,
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

      const latestIdleEvent =
        await prisma.trackingEvent.findFirst({
          where: {
            sessionId: activeSession.id,
            type: {
              in: ["IDLE_START", "IDLE_END"],
            },
          },

          orderBy: {
            createdAt: "desc",
          },
        });

      res.json({
        activeSession,
        breakStartedAt:
          latestBreakEvent?.type === "BREAK_START" ? latestBreakEvent.createdAt : null,
        idleStartedAt:
          latestIdleEvent?.type === "IDLE_START" ? latestIdleEvent.createdAt : null,

        isOnBreak:
          latestBreakEvent?.type === "BREAK_START",
        isIdle:
          latestIdleEvent?.type === "IDLE_START",
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
  async (req, res) => {
    try {
      const user = getAuthUser(req);

      if (!isEmployeeAccount(user)) {
        return res.status(403).json({ message: "Only employee accounts can view latest sessions" });
      }

      const latestSession =
        await prisma.loginSession.findFirst({
          where: {
            userId: user.id,
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
      const user = getAuthUser(req);
      const sessionId = Number(req.params.sessionId);

      if (!user) {
        res.status(401).json({ message: "Authentication required" });
        return;
      }

      const session = await prisma.loginSession.findUnique({
        where: { id: sessionId },
        select: { userId: true },
      });

      if (!session) {
        res.status(404).json({ message: "Tracking session not found" });
        return;
      }

      if (session.userId !== user.id && !adminLikeRoles.includes(user.role)) {
        res.status(403).json({ message: "You can view only your own tracking events" });
        return;
      }

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
  "/api/employees/:id/app-usage",
  authenticate,
  asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const id = Number(req.params.id);
    const requestedSessionId = req.query.sessionId ? Number(req.query.sessionId) : null;
    const requestedDate = req.query.date ? dayStart(String(req.query.date)) : null;

    if (!user) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    if (user.id !== id && !adminLikeRoles.includes(user.role)) {
      res.status(403).json({ message: "You can view only your own app usage" });
      return;
    }

    await finalizeStaleActiveSessions(id);

    const session = requestedSessionId
      ? await prisma.loginSession.findFirst({
        where: {
          id: requestedSessionId,
          userId: id,
        },
      })
      : await prisma.loginSession.findFirst({
        where: {
          userId: id,
          ...(requestedDate
            ? {
              loginAt: {
                gte: requestedDate,
                lt: new Date(requestedDate.getTime() + 24 * 60 * 60 * 1000),
              },
            }
            : {}),
        },
        orderBy: [{ status: "asc" }, { loginAt: "desc" }],
      });

    if (!session) {
      res.json({ date: requestedDate, session: null, usage: [] });
      return;
    }

    const events = await prisma.trackingEvent.findMany({
      where: {
        sessionId: session.id,
        type: TrackingEventType.APP_USAGE,
      },
      orderBy: { createdAt: "asc" },
    });

    const usageByKey = new Map<string, {
      appName: string;
      windowTitle: string;
      category: string;
      durationSeconds: number;
      firstSeenAt: Date;
      lastSeenAt: Date;
    }>();

    for (const event of events) {
      const appName = event.appName || "Unknown app";
      const windowTitle = event.windowTitle || "Unknown window";
      const category = appUsageCategory(event);
      const key = `${appName}\u0000${windowTitle}\u0000${category}`;
      const existing = usageByKey.get(key);
      const durationSeconds = event.durationSeconds ?? 0;

      if (existing) {
        existing.durationSeconds += durationSeconds;
        existing.lastSeenAt = event.createdAt;
      } else {
        usageByKey.set(key, {
          appName,
          windowTitle,
          category,
          durationSeconds,
          firstSeenAt: event.createdAt,
          lastSeenAt: event.createdAt,
        });
      }
    }

    res.json({
      date: requestedDate ?? dayStart(session.loginAt),
      session,
      usage: Array.from(usageByKey.values())
        .filter((item) => item.durationSeconds > 0)
        .sort((a, b) => b.durationSeconds - a.durationSeconds),
    });
  }),
);

app.get(
  "/api/admin/session-usage",
  authenticate,
  requireRoles(UserRole.ADMIN, UserRole.MANAGER, UserRole.HR),
  asyncHandler(async (req, res) => {
    await finalizeStaleActiveSessions();

    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    const todayActiveOnly = String(req.query.todayActiveOnly || "").toLowerCase() === "true";
    const since = req.query.since
      ? dayStart(String(req.query.since))
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const todayStart = dayStart();
    const tomorrowStart = nextDayStart(todayStart);

    const sessions = await prisma.loginSession.findMany({
      where: {
        user: { role: UserRole.EMPLOYEE },
        ...(todayActiveOnly
          ? {
              status: SessionStatus.ACTIVE,
              loginAt: {
                gte: todayStart,
                lt: tomorrowStart,
              },
            }
          : {
              OR: [
                { status: SessionStatus.ACTIVE },
                { loginAt: { gte: since } },
                { logoutAt: { gte: since } },
              ],
            }),
      },
      include: {
        user: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            department: true,
          },
        },
        events: {
          where: {
            type: {
              in: [
                TrackingEventType.APP_USAGE,
                TrackingEventType.IDLE_START,
                TrackingEventType.IDLE_END,
                TrackingEventType.BREAK_START,
                TrackingEventType.BREAK_END,
                TrackingEventType.LOGIN,
                TrackingEventType.KEYBOARD,
                TrackingEventType.MOUSE,
                TrackingEventType.SCREEN_UNLOCK,
              ],
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { loginAt: "desc" },
      take: limit,
    });

    const rows = [];

    for (const session of sessions) {
      const endTime = session.logoutAt || new Date();
      const idleSecondsFromEvents = secondsFromEventPairs(
        session.events,
        TrackingEventType.IDLE_START,
        TrackingEventType.IDLE_END,
        endTime,
      );
      const trailingIdleSeconds = session.status === SessionStatus.COMPLETED
        ? trailingIdleSecondsAfterLastActivity(session.events, session.loginAt, endTime)
        : 0;
      const rawIdleMinutes = Math.max(
        session.status === SessionStatus.ACTIVE
          ? await idleMinutesWithOpenIdle(session.id, session.idleMinutes, endTime)
          : session.idleMinutes,
        Math.round((idleSecondsFromEvents + trailingIdleSeconds) / 60),
      );
      const breakUsage = breakAllowanceFromEvents(session.events, endTime, session.breakMinutes);
      const breakMinutes = Math.max(
        session.breakMinutes,
        breakUsage.totalBreakMinutes,
      );
      const idleMinutes = rawIdleMinutes + breakUsage.excessBreakMinutes;
      const usageByKey = new Map<string, {
        appName: string;
        windowTitle: string;
        category: string;
        durationSeconds: number;
        firstSeenAt: Date;
        lastSeenAt: Date;
      }>();

      for (const event of session.events) {
        if (event.type !== TrackingEventType.APP_USAGE) {
          continue;
        }

        const appName = event.appName || "Unknown app";
        const windowTitle = event.windowTitle || "Unknown window";
        const category = appUsageCategory(event);
        const key = `${appName}\u0000${windowTitle}\u0000${category}`;
        const existing = usageByKey.get(key);
        const durationSeconds = event.durationSeconds ?? 0;

        if (existing) {
          existing.durationSeconds += durationSeconds;
          existing.lastSeenAt = event.createdAt;
        } else {
          usageByKey.set(key, {
            appName,
            windowTitle,
            category,
            durationSeconds,
            firstSeenAt: event.createdAt,
            lastSeenAt: event.createdAt,
          });
        }
      }

      const usageRows = Array.from(usageByKey.values()).filter((item) => item.durationSeconds > 0);
      const unproductiveAppMinutes = Math.round(
        usageRows
          .filter((item) => item.category === "UNPRODUCTIVE")
          .reduce((sum, item) => sum + item.durationSeconds, 0) / 60,
      );
      const networkInterruptionMinutes = Math.round(
        usageRows
          .filter((item) => item.category === "NETWORK")
          .reduce((sum, item) => sum + item.durationSeconds, 0) / 60,
      );
      const unproductiveMinutes = idleMinutes + unproductiveAppMinutes;
      const nonWorkingUsageMinutes = unproductiveAppMinutes + networkInterruptionMinutes;
      const totalMinutes = minutesBetween(session.loginAt, endTime);
      const activeMinutes = Math.max(
        0,
        totalMinutes - rawIdleMinutes - breakMinutes - nonWorkingUsageMinutes,
      );
      const breakAllowanceMinutes = await getBreakAllowanceMinutes();
      const productiveMinutes = Math.max(
        0,
        productiveMinutesWithBreakAllowance(
          totalMinutes,
          rawIdleMinutes,
          breakMinutes,
          breakAllowanceMinutes,
          breakUsage.excessBreakMinutes,
        ) - nonWorkingUsageMinutes,
      );
      const autoClosedAt = new Date(dayStart(session.loginAt).getTime() + 24 * 60 * 60 * 1000);
      const sessionLabel =
        session.status === SessionStatus.ACTIVE
          ? "Active"
          : session.logoutAt?.getTime() === autoClosedAt.getTime()
            ? "Auto Closed"
            : "Completed";
      const baseRow = {
        sessionId: session.id,
        userId: session.userId,
        employeeCode: session.user.employeeCode,
        employeeName: `${session.user.firstName} ${session.user.lastName}`,
        department: session.user.department?.name || "Unassigned",
        loginAt: session.loginAt,
        logoutAt: session.logoutAt,
        sessionStatus: session.status,
        sessionLabel,
        totalMinutes,
        idleMinutes,
        breakMinutes,
        activeMinutes,
        productiveMinutes,
        unproductiveMinutes,
        unproductiveAppMinutes,
        networkInterruptionMinutes,
      };

      if (usageRows.length === 0) {
        rows.push({
          ...baseRow,
          appName: "No app or website recorded",
          windowTitle: "--",
          category: "UNRECORDED",
          appDurationSeconds: 0,
          firstSeenAt: null,
          lastSeenAt: null,
        });
        continue;
      }

      for (const usage of usageRows.sort((a, b) => b.durationSeconds - a.durationSeconds)) {
        rows.push({
          ...baseRow,
          appName: usage.appName,
          windowTitle: usage.windowTitle,
          category: usage.category,
          appDurationSeconds: usage.durationSeconds,
          firstSeenAt: usage.firstSeenAt,
          lastSeenAt: usage.lastSeenAt,
        });
      }
    }

    res.json({ rows });
  }),
);

app.get(
  "/api/tracking/live",
  authenticate,
  requireRoles(UserRole.ADMIN, UserRole.MANAGER, UserRole.HR),
  asyncHandler(async (_req, res) => {
    await finalizeStaleActiveSessions();

    const users = await prisma.user.findMany({
      where: { status: "ACTIVE", role: UserRole.EMPLOYEE },
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
      await finalizeStaleActiveSessions();

      const today = dayStart();
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      
      // Total employees count (all roles)
      const totalEmployees = await prisma.user.count({
        where: {
          role: UserRole.EMPLOYEE,
        },
      });

      const [sessionsToday, activeSessions, productivityRecords, breakAllowanceMinutes] = await Promise.all([
        prisma.loginSession.findMany({
          where: {
            loginAt: {
              gte: today,
              lt: tomorrow,
            },
            user: { role: UserRole.EMPLOYEE },
          },
          orderBy: { loginAt: "desc" },
        }),
        prisma.loginSession.findMany({
          where: {
            status: SessionStatus.ACTIVE,
            user: { role: UserRole.EMPLOYEE },
          },
          orderBy: { loginAt: "desc" },
        }),
        prisma.productivityRecord.findMany({
          where: {
            date: today,
            user: { role: UserRole.EMPLOYEE },
          },
        }),
        getBreakAllowanceMinutes(),
      ]);

      const latestSessionByUser = new Map<number, (typeof sessionsToday)[number]>();

      for (const session of sessionsToday) {
        if (!latestSessionByUser.has(session.userId)) {
          latestSessionByUser.set(session.userId, session);
        }
      }

      const activeSessionByUser = new Map<number, (typeof activeSessions)[number]>();

      for (const session of activeSessions) {
        if (!activeSessionByUser.has(session.userId)) {
          activeSessionByUser.set(session.userId, session);
        }
      }

      const loggedInUserIds = new Set(sessionsToday.map((session) => session.userId));
      const activeEmployees = activeSessionByUser.size;
      const activeSessionIds = activeSessions.map((session) => session.id);

      const activeStateEvents = activeSessionIds.length > 0
        ? await prisma.trackingEvent.findMany({
          where: {
            sessionId: { in: activeSessionIds },
            type: {
              in: [
                TrackingEventType.BREAK_START,
                TrackingEventType.BREAK_END,
                TrackingEventType.IDLE_START,
                TrackingEventType.IDLE_END,
              ],
            },
          },
          orderBy: { createdAt: "desc" },
        })
        : [];
      const latestBreakEventBySession = new Map<number, (typeof activeStateEvents)[number]>();
      const latestIdleEventBySession = new Map<number, (typeof activeStateEvents)[number]>();

      for (const event of activeStateEvents) {
        if (
          event.sessionId &&
          (event.type === TrackingEventType.BREAK_START || event.type === TrackingEventType.BREAK_END) &&
          !latestBreakEventBySession.has(event.sessionId)
        ) {
          latestBreakEventBySession.set(event.sessionId, event);
        }

        if (
          event.sessionId &&
          (event.type === TrackingEventType.IDLE_START || event.type === TrackingEventType.IDLE_END) &&
          !latestIdleEventBySession.has(event.sessionId)
        ) {
          latestIdleEventBySession.set(event.sessionId, event);
        }
      }

      const breakEmployees = Array.from(latestBreakEventBySession.values()).filter(
        (event) => event.type === TrackingEventType.BREAK_START,
      ).length;
      const idleEmployees = Array.from(latestIdleEventBySession.values()).filter(
        (event) => event.type === TrackingEventType.IDLE_START,
      ).length;

      const productivityByUser = new Map(
        productivityRecords.map((record) => [record.userId, record.productivityPercent]),
      );
      const trackedUserIds = new Set([...loggedInUserIds, ...activeSessionByUser.keys()]);
      const productivityValues = Array.from(trackedUserIds).map((userId) => {
        const storedPercent = productivityByUser.get(userId);

        if (typeof storedPercent === "number") {
          return storedPercent;
        }

        const session = latestSessionByUser.get(userId) || activeSessionByUser.get(userId);

        if (!session) {
          return 0;
        }

        const endTime = session.logoutAt || new Date();
        const loginMinutes = minutesBetween(session.loginAt, endTime);
        const productiveMinutes = productiveMinutesWithBreakAllowance(
          loginMinutes,
          session.idleMinutes,
          session.breakMinutes,
          breakAllowanceMinutes,
        );

        return productivityPercent(productiveMinutes, loginMinutes);
      });
      const avgProductivity =
        productivityValues.length > 0
          ? Math.round(productivityValues.reduce((sum, value) => sum + value, 0) / productivityValues.length)
          : 0;
      const presentCount = loggedInUserIds.size;
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
        totalRecorded: presentCount,
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
    where: {
      date: today,
      user: { role: UserRole.EMPLOYEE },
    },
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

  const take = req.query.all === "true" ? undefined : 31;
  const records = await prisma.productivityRecord.findMany({
    where: { userId: employeeId },
    orderBy: { date: "desc" },
    ...(take ? { take } : {}),
  });

  res.json({ records });
}));

app.get("/api/attendance", authenticate, asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const requestedUserId = req.query.userId ? Number(req.query.userId) : undefined;
  const requestedDate = typeof req.query.date === "string" && req.query.date ? dayStart(req.query.date) : undefined;
  const dateRange = requestedDate
    ? {
        gte: requestedDate,
        lt: new Date(requestedDate.getTime() + 24 * 60 * 60 * 1000),
      }
    : undefined;

  if (!user) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  const canViewAny = adminLikeRoles.includes(user.role);
  const userId = canViewAny ? requestedUserId : user.id;

  const take = req.query.all === "true" ? undefined : 100;
  const records = await prisma.attendanceRecord.findMany({
    where: {
      ...(userId ? { userId } : {}),
      ...(dateRange ? { date: dateRange } : {}),
    },
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
    ...(take ? { take } : {}),
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
      createdByAdmin: {
        select: { id: true, firstName: true, lastName: true, adminCode: true },
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
    const { title, description, assignedToId, departmentId, dueDate, priority, estimatedHours } = req.body;

    if (!title) {
      res.status(400).json({ message: "Workflow title is required" });
      return;
    }

    const workflowData: Prisma.WorkflowTaskCreateInput = {
      title,
      description: description ?? null,
      dueDate: dueDate ? new Date(dueDate) : null,
      estimatedHours: estimatedHours ? Number(estimatedHours) : null,
      priority: priority || WorkflowPriority.MEDIUM,
    };
    const workflowAssignedToId = assignedToId ? Number(assignedToId) : null;
    const workflowDepartmentId = departmentId ? Number(departmentId) : null;
    const workflowCreatedById = userActorId(user);
    const workflowCreatedByAdminId = adminActorId(user);

    if (workflowAssignedToId) {
      workflowData.assignedTo = { connect: { id: workflowAssignedToId } };
    }

    if (workflowDepartmentId) {
      workflowData.department = { connect: { id: workflowDepartmentId } };
    }

    if (workflowCreatedById) {
      workflowData.createdBy = { connect: { id: workflowCreatedById } };
    }

    if (workflowCreatedByAdminId) {
      workflowData.createdByAdmin = { connect: { id: workflowCreatedByAdminId } };
    }

    const workflow = await prisma.workflowTask.create({
      data: workflowData,
    });

    await writeAuthAuditLog(user, "CREATE_WORKFLOW", "WorkflowTask", String(workflow.id));
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

  await writeAuthAuditLog(user, "UPDATE_WORKFLOW_STATUS", "WorkflowTask", String(id));
  io.emit("workflow-updated", updated);

  res.json({ message: "Workflow updated", workflow: updated });
}));

app.get("/api/notifications", authenticate, asyncHandler(async (req, res) => {
  const user = getAuthUser(req);

  if (!user) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  const canViewAdminNotifications = user.accountType === "ADMIN" || adminLikeRoles.includes(user.role);
  const notifications = await prisma.notification.findMany({
    where: canViewAdminNotifications ? { userId: null } : { userId: user.id },
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

  const canReadAdminNotification = user.accountType === "ADMIN" || adminLikeRoles.includes(user.role);
  const notification = await prisma.notification.findFirst({
    where: {
      id,
      userId: canReadAdminNotification ? null : user.id,
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

app.get("/api/leave-requests", authenticate, asyncHandler(async (req, res) => {
  const user = getAuthUser(req);

  if (!user) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  const canViewAll = adminLikeRoles.includes(user.role);
  const requests = await prisma.leaveRequest.findMany({
    where: canViewAll ? {} : { userId: user.id },
    include: {
      user: {
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          department: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  res.json({ requests });
}));

app.post("/api/leave-requests", authenticate, asyncHandler(async (req, res) => {
  const user = getAuthUser(req);
  const { reason, days, type = LeaveType.SICK } = req.body;

  if (!user) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  if (user.role !== UserRole.EMPLOYEE) {
    res.status(403).json({ message: "Only employees can send leave requests" });
    return;
  }

  const leaveDays = Number(days);
  const requestedLeaveType = String(type).toUpperCase();
  const leaveType = Object.values(LeaveType).includes(requestedLeaveType as LeaveType)
    ? requestedLeaveType as LeaveType
    : LeaveType.SICK;

  if (!reason || !Number.isInteger(leaveDays) || leaveDays <= 0) {
    res.status(400).json({ message: "Reason and valid leave days are required" });
    return;
  }

  const { paidDays, unpaidDays } = await calculateLeavePaySplit(user.id, leaveType, leaveDays);

  const request = await prisma.leaveRequest.create({
    data: {
      userId: user.id,
      type: leaveType,
      reason,
      days: leaveDays,
      paidDays,
      unpaidDays,
    },
    include: {
      user: {
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          department: true,
        },
      },
    },
  });

  await prisma.notification.create({
    data: {
      userId: null,
      type: NotificationType.ADMIN_ANNOUNCEMENT,
      priority: NotificationPriority.HIGH,
      title: "Leave request pending",
      message: `${user.firstName} ${user.lastName} requested ${leaveDays} ${leaveType.toLowerCase()} leave day${leaveDays === 1 ? "" : "s"} (${paidDays} paid, ${unpaidDays} unpaid): ${reason}`,
    },
  });

  res.status(201).json({ message: "Leave request sent", request });
}));

app.patch(
  "/api/leave-requests/:id",
  authenticate,
  requireRoles(UserRole.ADMIN, UserRole.MANAGER, UserRole.HR),
  asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const id = Number(req.params.id);
    const { status } = req.body;

    if (!user) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    if (![LeaveRequestStatus.APPROVED, LeaveRequestStatus.REJECTED].includes(status)) {
      res.status(400).json({ message: "Status must be APPROVED or REJECTED" });
      return;
    }

    const existing = await prisma.leaveRequest.findUnique({
      where: { id },
    });

    if (!existing) {
      res.status(404).json({ message: "Leave request not found" });
      return;
    }

    if (existing.status !== LeaveRequestStatus.PENDING) {
      res.status(400).json({ message: "Leave request is already reviewed" });
      return;
    }

    const paySplit = await calculateLeavePaySplit(existing.userId, existing.type, existing.days);
    const updated = await prisma.leaveRequest.update({
      where: { id },
      data: {
        status,
        paidDays: status === LeaveRequestStatus.APPROVED ? paySplit.paidDays : 0,
        unpaidDays: status === LeaveRequestStatus.APPROVED ? paySplit.unpaidDays : existing.days,
        reviewedById: user.id,
        reviewedAt: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            department: true,
          },
        },
      },
    });

    await prisma.notification.create({
      data: {
        userId: existing.userId,
        type: NotificationType.ATTENDANCE_WARNING,
        priority: status === LeaveRequestStatus.APPROVED ? NotificationPriority.MEDIUM : NotificationPriority.HIGH,
        title: `Leave request ${String(status).toLowerCase()}`,
        message: `Your ${existing.days} ${existing.type.toLowerCase()} leave day${existing.days === 1 ? "" : "s"} request was ${String(status).toLowerCase()} by ${user.firstName} ${user.lastName}. ${status === LeaveRequestStatus.APPROVED ? `${paySplit.paidDays} paid, ${paySplit.unpaidDays} unpaid.` : ""}`,
      },
    });

    res.json({ message: `Leave request ${String(status).toLowerCase()}`, request: updated });
  }),
);

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

    await writeAuthAuditLog(user, "UPDATE_POLICY", "WorkPolicy", String(id));
    res.json({ message: "Policy updated", policy: updated });
  }),
);

app.get(
  "/api/reports/daily",
  authenticate,
  requireRoles(UserRole.ADMIN, UserRole.MANAGER, UserRole.HR),
  asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const date = dayStart(req.query.date ? String(req.query.date) : undefined);
    const tomorrow = new Date(date.getTime() + 24 * 60 * 60 * 1000);
    const [attendance, productivityEmployees, workflowCounts, activeSessions, breakAllowanceMinutes] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where: {
          date,
          user: { role: UserRole.EMPLOYEE },
        },
        include: { user: { select: { employeeCode: true, firstName: true, lastName: true } } },
      }),
      prisma.user.findMany({
        where: { role: UserRole.EMPLOYEE },
        include: {
          productivityRecords: {
            where: { date },
            orderBy: { date: "desc" },
            take: 1,
          },
          loginSessions: {
            where: {
              loginAt: {
                gte: date,
                lt: tomorrow,
              },
            },
            orderBy: { loginAt: "desc" },
            take: 1,
          },
        },
        orderBy: { firstName: "asc" },
      }),
      prisma.workflowTask.groupBy({
        by: ["status"],
        _count: { status: true },
      }),
      prisma.loginSession.count({
        where: {
          status: SessionStatus.ACTIVE,
          user: { role: UserRole.EMPLOYEE },
        },
      }),
      getBreakAllowanceMinutes(),
    ]);

    const productivity = productivityEmployees.map((employee) => {
      const record = employee.productivityRecords[0];

      if (record) {
        return {
          ...record,
          user: {
            employeeCode: employee.employeeCode,
            firstName: employee.firstName,
            lastName: employee.lastName,
          },
        };
      }

      const session = employee.loginSessions[0];
      const endTime = session?.logoutAt || new Date();
      const loginMinutes = session ? minutesBetween(session.loginAt, endTime) : 0;
      const idleMinutes = session?.idleMinutes ?? 0;
      const breakMinutes = session?.breakMinutes ?? 0;
      const productiveMinutes = productiveMinutesWithBreakAllowance(
        loginMinutes,
        idleMinutes,
        breakMinutes,
        breakAllowanceMinutes,
      );
      const percent = productivityPercent(productiveMinutes, loginMinutes);

      return {
        id: session?.id ?? employee.id,
        userId: employee.id,
        date,
        loginMinutes,
        activeMinutes: Math.max(0, loginMinutes - idleMinutes - breakMinutes),
        idleMinutes,
        breakMinutes,
        productiveMinutes,
        productivityPercent: percent,
        score: percent,
        createdAt: session?.createdAt ?? date,
        updatedAt: session?.updatedAt ?? date,
        user: {
          employeeCode: employee.employeeCode,
          firstName: employee.firstName,
          lastName: employee.lastName,
        },
      };
    });

    res.json({
      date,
      generatedFor: user
        ? {
            employeeCode: user.employeeCode,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            role: user.role,
          }
        : null,
      activeSessions,
      attendance,
      productivity,
      workflowCounts,
    });
  }),
);

app.get(
  "/api/reports/all-time-summary",
  authenticate,
  requireRoles(UserRole.ADMIN, UserRole.MANAGER, UserRole.HR),
  asyncHandler(async (_req, res) => {
    const [
      firstSession,
      attendanceCount,
      sessions,
      workflowCount,
      completedWorkflowCount,
      workflowCounts,
    ] = await Promise.all([
      prisma.loginSession.findFirst({
        where: { user: { role: UserRole.EMPLOYEE } },
        orderBy: { loginAt: "asc" },
        select: { loginAt: true },
      }),
      prisma.attendanceRecord.count({
        where: { user: { role: UserRole.EMPLOYEE } },
      }),
      prisma.loginSession.findMany({
        where: { user: { role: UserRole.EMPLOYEE } },
        select: {
          loginAt: true,
          logoutAt: true,
          activeMinutes: true,
          idleMinutes: true,
          breakMinutes: true,
          productiveMinutes: true,
        },
      }),
      prisma.workflowTask.count(),
      prisma.workflowTask.count({
        where: { status: WorkflowStatus.COMPLETED },
      }),
      prisma.workflowTask.groupBy({
        by: ["status"],
        _count: { status: true },
      }),
    ]);
    const now = new Date();
    const sessionProductivity = sessions.map((session) => {
      const loginMinutes = minutesBetween(session.loginAt, session.logoutAt || now);
      const productiveMinutes = Math.max(
        session.productiveMinutes,
        productiveMinutesWithBreakAllowance(loginMinutes, session.idleMinutes, session.breakMinutes),
      );

      return productivityPercent(productiveMinutes, loginMinutes);
    });
    const averageProductivity = sessionProductivity.length
      ? Math.round(
          sessionProductivity.reduce((sum, percent) => sum + percent, 0) /
            sessionProductivity.length,
        )
      : 0;

    res.json({
      firstLoginAt: firstSession?.loginAt ?? null,
      attendanceRecords: attendanceCount,
      productivityRecords: sessions.length,
      averageProductivity,
      workflows: workflowCount,
      completedWorkflows: completedWorkflowCount,
      workflowStatusGroups: workflowCounts.length,
    });
  }),
);

app.get(
  "/api/reports/employee-summary",
  authenticate,
  requireRoles(UserRole.ADMIN, UserRole.MANAGER, UserRole.HR),
  asyncHandler(async (req, res) => {
    const employeeId = Number(req.query.employeeId);

    if (!employeeId) {
      res.status(400).json({ message: "employeeId is required" });
      return;
    }

    const dateFilterValue = typeof req.query.date === "string" && req.query.date ? req.query.date : "";
    const monthFilterValue = typeof req.query.month === "string" && req.query.month ? req.query.month : "";
    const rangeStart = dateFilterValue
      ? dayStart(dateFilterValue)
      : monthFilterValue
        ? new Date(`${monthFilterValue}-01T00:00:00`)
        : null;
    const rangeEnd = rangeStart
      ? dateFilterValue
        ? new Date(rangeStart.getTime() + 24 * 60 * 60 * 1000)
        : new Date(rangeStart.getFullYear(), rangeStart.getMonth() + 1, 1)
      : null;
    const dateWhere = rangeStart && rangeEnd ? { gte: rangeStart, lt: rangeEnd } : undefined;

    const [employee, sessions, attendance, workflows] = await Promise.all([
      prisma.user.findUnique({
        where: { id: employeeId },
        include: { department: true },
      }),
      prisma.loginSession.findMany({
        where: {
          userId: employeeId,
          ...(dateWhere ? { loginAt: dateWhere } : {}),
        },
        orderBy: { loginAt: "asc" },
      }),
      prisma.attendanceRecord.findMany({
        where: {
          userId: employeeId,
          ...(dateWhere ? { date: dateWhere } : {}),
        },
        orderBy: { date: "desc" },
      }),
      prisma.workflowTask.findMany({
        where: {
          assignedToId: employeeId,
          ...(dateWhere ? { updatedAt: dateWhere } : {}),
        },
        orderBy: { updatedAt: "desc" },
      }),
    ]);

    if (!employee) {
      res.status(404).json({ message: "Employee not found" });
      return;
    }

    const generatedAt = new Date();
    const sessionRows = sessions.map((session) => {
      const endTime = session.logoutAt || generatedAt;
      const loginMinutes = minutesBetween(session.loginAt, endTime);
      const productiveMinutes = Math.max(
        session.productiveMinutes,
        productiveMinutesWithBreakAllowance(
          loginMinutes,
          session.idleMinutes,
          session.breakMinutes,
        ),
      );

      return {
        loginMinutes,
        activeMinutes: Math.max(
          session.activeMinutes,
          loginMinutes - session.idleMinutes - session.breakMinutes,
        ),
        idleMinutes: session.idleMinutes,
        breakMinutes: session.breakMinutes,
        productiveMinutes,
        productivityPercent: productivityPercent(productiveMinutes, loginMinutes),
      };
    });
    const totalLoginMinutes = sessionRows.reduce((sum, record) => sum + record.loginMinutes, 0);
    const totalActiveMinutes = sessionRows.reduce((sum, record) => sum + record.activeMinutes, 0);
    const totalProductiveMinutes = sessionRows.reduce((sum, record) => sum + record.productiveMinutes, 0);
    const totalIdleMinutes = sessionRows.reduce((sum, record) => sum + record.idleMinutes, 0);
    const totalBreakMinutes = sessionRows.reduce((sum, record) => sum + record.breakMinutes, 0);
    const averageProductivity = sessionRows.length
      ? Math.round(sessionRows.reduce((sum, record) => sum + record.productivityPercent, 0) / sessionRows.length)
      : 0;
    const completedWorkflows = workflows.filter((workflow) => workflow.status === WorkflowStatus.COMPLETED).length;

    res.json({
      employee: {
        id: employee.id,
        employeeCode: employee.employeeCode,
        name: `${employee.firstName} ${employee.lastName}`,
        department: employee.department?.name || "Unassigned",
      },
      range: dateFilterValue || monthFilterValue || "all",
      attendanceDays: attendance.length,
      presentDays: attendance.filter((record) => record.status === AttendanceStatus.PRESENT).length,
      lateDays: attendance.filter((record) => record.status === AttendanceStatus.LATE).length,
      halfDays: attendance.filter((record) => record.status === AttendanceStatus.HALF_DAY).length,
      totalLoginMinutes,
      totalActiveMinutes,
      totalProductiveMinutes,
      totalIdleMinutes,
      totalBreakMinutes,
      averageProductivity,
      workflowCount: workflows.length,
      completedWorkflows,
    });
  }),
);

app.get(
  "/api/reports/export",
  authenticate,
  requireRoles(UserRole.ADMIN, UserRole.MANAGER, UserRole.HR),
  asyncHandler(async (req, res) => {
    const user = getAuthUser(req);
    const generatedAt = new Date();
    const employeeId = req.query.employeeId ? Number(req.query.employeeId) : undefined;
    const dateFilterValue = typeof req.query.date === "string" && req.query.date ? req.query.date : "";
    const monthFilterValue = typeof req.query.month === "string" && req.query.month ? req.query.month : "";
    const rangeStart = dateFilterValue
      ? dayStart(dateFilterValue)
      : monthFilterValue
        ? new Date(`${monthFilterValue}-01T00:00:00`)
        : null;
    const rangeEnd = rangeStart
      ? dateFilterValue
        ? new Date(rangeStart.getTime() + 24 * 60 * 60 * 1000)
        : new Date(rangeStart.getFullYear(), rangeStart.getMonth() + 1, 1)
      : null;
    const dateWhere = rangeStart && rangeEnd ? { gte: rangeStart, lt: rangeEnd } : undefined;
    const employeeWhere = {
      role: UserRole.EMPLOYEE,
      ...(employeeId ? { id: employeeId } : {}),
    };
    const workflowWhere = {
      ...(employeeId ? { assignedToId: employeeId } : {}),
      ...(dateWhere ? { updatedAt: dateWhere } : {}),
    };
    const [employees, attendance, productivity, workflows, workflowCounts] = await Promise.all([
      prisma.user.findMany({
        where: employeeWhere,
        include: {
          department: true,
          loginSessions: {
            ...(dateWhere ? { where: { loginAt: dateWhere } } : {}),
            orderBy: { loginAt: "asc" },
          },
        },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      }),
      prisma.attendanceRecord.findMany({
        where: {
          ...(dateWhere ? { date: dateWhere } : {}),
          user: employeeWhere,
        },
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
        orderBy: [{ userId: "asc" }, { date: "desc" }],
      }),
      prisma.productivityRecord.findMany({
        where: {
          ...(dateWhere ? { date: dateWhere } : {}),
          user: employeeWhere,
        },
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
        orderBy: [{ userId: "asc" }, { date: "desc" }],
      }),
      prisma.workflowTask.findMany({
        where: workflowWhere,
        include: {
          assignedTo: {
            select: { employeeCode: true, firstName: true, lastName: true },
          },
          department: true,
        },
        orderBy: [{ updatedAt: "desc" }],
      }),
      prisma.workflowTask.groupBy({
        by: ["status"],
        where: workflowWhere,
        _count: { status: true },
      }),
    ]);

    const productivityByUser = new Map<number, typeof productivity>();
    const attendanceByUser = new Map<number, typeof attendance>();
    const workflowsByUser = new Map<number, typeof workflows>();

    productivity.forEach((record) => {
      const rows = productivityByUser.get(record.userId) || [];
      rows.push(record);
      productivityByUser.set(record.userId, rows);
    });

    attendance.forEach((record) => {
      const rows = attendanceByUser.get(record.userId) || [];
      rows.push(record);
      attendanceByUser.set(record.userId, rows);
    });

    workflows.forEach((workflow) => {
      if (!workflow.assignedToId) {
        return;
      }

      const rows = workflowsByUser.get(workflow.assignedToId) || [];
      rows.push(workflow);
      workflowsByUser.set(workflow.assignedToId, rows);
    });

    const sessionProductivityRows = employees.flatMap((employee) =>
      employee.loginSessions.map((session) => {
        const endTime = session.logoutAt || generatedAt;
        const loginMinutes = minutesBetween(session.loginAt, endTime);
        const activeMinutes = Math.max(
          session.activeMinutes,
          loginMinutes - session.idleMinutes - session.breakMinutes,
        );
        const productiveMinutes = Math.max(
          session.productiveMinutes,
          productiveMinutesWithBreakAllowance(
            loginMinutes,
            session.idleMinutes,
            session.breakMinutes,
          ),
        );

        return {
          employee,
          date: session.loginAt,
          loginAt: session.loginAt,
          logoutAt: session.logoutAt,
          loginMinutes,
          activeMinutes,
          idleMinutes: session.idleMinutes,
          breakMinutes: session.breakMinutes,
          productiveMinutes,
          productivityPercent: productivityPercent(productiveMinutes, loginMinutes),
        };
      }),
    );
    const sessionProductivityByUser = new Map<number, typeof sessionProductivityRows>();

    sessionProductivityRows.forEach((row) => {
      const rows = sessionProductivityByUser.get(row.employee.id) || [];
      rows.push(row);
      sessionProductivityByUser.set(row.employee.id, rows);
    });

    const summaryRows = employees.map((employee) => {
      const employeeProductivity = sessionProductivityByUser.get(employee.id) || [];
      const employeeAttendance = attendanceByUser.get(employee.id) || [];
      const employeeWorkflows = workflowsByUser.get(employee.id) || [];
      const totalLoginMinutes = employeeProductivity.reduce((sum, record) => sum + record.loginMinutes, 0);
      const totalActiveMinutes = employeeProductivity.reduce((sum, record) => sum + record.activeMinutes, 0);
      const totalProductiveMinutes = employeeProductivity.reduce((sum, record) => sum + record.productiveMinutes, 0);
      const totalIdleMinutes = employeeProductivity.reduce((sum, record) => sum + record.idleMinutes, 0);
      const totalBreakMinutes = employeeProductivity.reduce((sum, record) => sum + record.breakMinutes, 0);
      const averageProductivity = employeeProductivity.length
        ? Math.round(
            employeeProductivity.reduce((sum, record) => sum + record.productivityPercent, 0) /
              employeeProductivity.length,
          )
        : 0;
      const completedWorkflows = employeeWorkflows.filter(
        (workflow) => workflow.status === WorkflowStatus.COMPLETED,
      ).length;

      return {
        employee,
        firstLoginAt: employee.loginSessions[0]?.loginAt ?? null,
        attendanceDays: employeeAttendance.length,
        totalLoginMinutes,
        totalActiveMinutes,
        totalProductiveMinutes,
        totalIdleMinutes,
        totalBreakMinutes,
        averageProductivity,
        workflowCount: employeeWorkflows.length,
        completedWorkflows,
      };
    });
    const selectedEmployee = employeeId ? employees[0] : null;
    const reportTitle = selectedEmployee
      ? `${selectedEmployee.firstName} ${selectedEmployee.lastName} Work Report`
      : "All Employee Work Report";
    const reportRange = dateFilterValue
      ? dateFilterValue
      : monthFilterValue
        ? monthFilterValue
        : "First Login To Now";
    const attachmentPrefix = selectedEmployee
      ? `${selectedEmployee.employeeCode}-work-report`
      : "all-employee-work-report";

    const csv = [
      csvRow([reportTitle]),
      csvRow(["Report Range", reportRange]),
      csvRow(["Generated For", user ? `${user.firstName} ${user.lastName}` : ""]),
      csvRow(["Employee Code", user?.employeeCode || ""]),
      csvRow(["Role", user?.role || ""]),
      csvRow(["Email", user?.email || ""]),
      csvRow(["Generated At", generatedAt.toISOString()]),
      "",
      csvRow(["Employee Summary - First Login To Now"]),
      csvRow([
        "Employee Code",
        "Name",
        "Department",
        "First Login",
        "Attendance Days",
        "Total Worked Minutes",
        "Active Minutes",
        "Productive Minutes",
        "Idle Minutes",
        "Break Minutes",
        "Average Productivity Percent",
        "Completed Workflows",
        "Total Workflows",
      ]),
      ...summaryRows.map((row) =>
        csvRow([
          row.employee.employeeCode,
          `${row.employee.firstName} ${row.employee.lastName}`,
          row.employee.department?.name || "Unassigned",
          row.firstLoginAt ? row.firstLoginAt.toISOString() : "",
          row.attendanceDays,
          row.totalLoginMinutes,
          row.totalActiveMinutes,
          row.totalProductiveMinutes,
          row.totalIdleMinutes,
          row.totalBreakMinutes,
          row.averageProductivity,
          row.completedWorkflows,
          row.workflowCount,
        ]),
      ),
      "",
      csvRow(["Attendance History - All Employees"]),
      csvRow([
        "Employee Code",
        "Name",
        "Department",
        "Date",
        "Status",
        "Clock In",
        "Clock Out",
        "Late Minutes",
        "Overtime Minutes",
        "Idle Deduction Minutes",
      ]),
      ...attendance.map((record) =>
        csvRow([
          record.user.employeeCode,
          `${record.user.firstName} ${record.user.lastName}`,
          record.user.department?.name || "Unassigned",
          record.date.toISOString().slice(0, 10),
          record.status,
          record.loginAt ? record.loginAt.toISOString() : "",
          record.logoutAt ? record.logoutAt.toISOString() : "",
          record.lateMinutes,
          record.overtimeMinutes,
          record.idleDeductionMinutes,
        ]),
      ),
      "",
      csvRow(["Productivity History - All Employees"]),
      csvRow([
        "Employee Code",
        "Name",
        "Department",
        "Date",
        "Clock In",
        "Clock Out",
        "Login Minutes",
        "Active Minutes",
        "Idle Minutes",
        "Break Minutes",
        "Productive Minutes",
        "Productivity Percent",
      ]),
      ...sessionProductivityRows
        .sort((a, b) => b.loginAt.getTime() - a.loginAt.getTime())
        .map((record) =>
        csvRow([
          record.employee.employeeCode,
          `${record.employee.firstName} ${record.employee.lastName}`,
          record.employee.department?.name || "Unassigned",
          record.date.toISOString().slice(0, 10),
          record.loginAt.toISOString(),
          record.logoutAt ? record.logoutAt.toISOString() : "",
          record.loginMinutes,
          record.activeMinutes,
          record.idleMinutes,
          record.breakMinutes,
          record.productiveMinutes,
          record.productivityPercent,
        ]),
      ),
      "",
      csvRow(["Workflow Efficiency Summary - All Employees"]),
      csvRow(["Status", "Count"]),
      ...workflowCounts.map((item) => csvRow([item.status, item._count.status])),
      "",
      csvRow(["Workflow Details - All Employees"]),
      csvRow([
        "Title",
        "Assigned Employee Code",
        "Assigned To",
        "Department",
        "Status",
        "Priority",
        "Estimated Hours",
        "Actual Hours",
        "Due Date",
        "Completed At",
        "Last Updated",
      ]),
      ...workflows.map((workflow) =>
        csvRow([
          workflow.title,
          workflow.assignedTo?.employeeCode || "",
          workflow.assignedTo
            ? `${workflow.assignedTo.firstName} ${workflow.assignedTo.lastName}`
            : "Unassigned",
          workflow.department?.name || "Unassigned",
          workflow.status,
          workflow.priority,
          workflow.estimatedHours ?? "",
          workflow.actualHours ?? "",
          workflow.dueDate ? workflow.dueDate.toISOString().slice(0, 10) : "",
          workflow.completedAt ? workflow.completedAt.toISOString() : "",
          workflow.updatedAt.toISOString(),
        ]),
      ),
    ].join("\r\n");

    res.header("Content-Type", "text/csv; charset=utf-8");
    res.attachment(`${attachmentPrefix}-${generatedAt.toISOString().slice(0, 10)}.csv`);
    res.send(csv);
  }),
);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  const databaseMessage = prismaErrorMessage(err);

  if (databaseMessage) {
    res.status(400).json({
      message: databaseMessage,
    });
    return;
  }

  res.status(500).json({
    message: "Something went wrong on the server",
  });
});

const PORT = Number(process.env.PORT) || 5000;

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  finalizeStaleActiveSessions().catch((error) => {
    console.error("Failed to finalize stale sessions on startup", error);
  });
  scheduleMidnightAutoClockOut();
});
