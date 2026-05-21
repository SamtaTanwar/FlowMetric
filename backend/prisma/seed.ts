import bcrypt from "bcryptjs";
import {
  AttendanceStatus,
  NotificationPriority,
  NotificationType,
  PrismaClient,
  SessionStatus,
  TrackingEventType,
  UserRole,
  WorkflowPriority,
  WorkflowStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

function dayStart(input = new Date()) {
  return new Date(input.getFullYear(), input.getMonth(), input.getDate());
}

function atTime(hours: number, minutes: number) {
  const date = dayStart();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

async function findOrCreateDepartment(name: string, description: string) {
  const existing = await prisma.department.findFirst({ where: { name } });

  if (existing) {
    return existing;
  }

  return prisma.department.create({
    data: { name, description },
  });
}

async function findOrCreateShift() {
  const existing = await prisma.shift.findFirst({ where: { shiftName: "General Shift" } });

  if (existing) {
    return existing;
  }

  return prisma.shift.create({
    data: {
      shiftName: "General Shift",
      startTime: "09:00",
      endTime: "18:00",
      breakMinutes: 45,
      graceMinutes: 10,
      minimumWorkHours: 8,
    },
  });
}

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  const departments = await Promise.all([
    findOrCreateDepartment("Engineering", "Product and platform engineering"),
    findOrCreateDepartment("Quality", "QA and release validation"),
    findOrCreateDepartment("Sales", "Sales and client operations"),
    findOrCreateDepartment("People Ops", "HR and employee operations"),
    findOrCreateDepartment("Support", "Customer support team"),
  ]);

  const [engineering, quality, sales, peopleOps] = departments;

  const generalShift = await findOrCreateShift();

  await prisma.workPolicy.upsert({
    where: { name: "Default Work Policy" },
    update: {
      allowedIdleMinutes: 5,
      breakAllowanceMinutes: 45,
      graceMinutes: 10,
      minimumWorkHours: 8,
      overtimeAfterHours: 8.5,
      isDefault: true,
    },
    create: {
      name: "Default Work Policy",
      allowedIdleMinutes: 5,
      breakAllowanceMinutes: 45,
      graceMinutes: 10,
      minimumWorkHours: 8,
      overtimeAfterHours: 8.5,
      isDefault: true,
    },
  });

  const users = await Promise.all([
    prisma.user.upsert({
      where: { employeeCode: "EMP-1001" },
      update: { passwordHash },
      create: {
        employeeCode: "EMP-1001",
        firstName: "Admin",
        lastName: "User",
        email: "admin@worktrack.local",
        phone: "9999990001",
        passwordHash,
        role: UserRole.ADMIN,
        designation: "System Administrator",
        departmentId: engineering.id,
        shiftId: generalShift.id,
      },
    }),
    prisma.user.upsert({
      where: { employeeCode: "EMP-1002" },
      update: { passwordHash },
      create: {
        employeeCode: "EMP-1002",
        firstName: "Rahul",
        lastName: "Sharma",
        email: "rahul@worktrack.local",
        phone: "9999990002",
        passwordHash,
        role: UserRole.EMPLOYEE,
        designation: "Frontend Developer",
        departmentId: engineering.id,
        shiftId: generalShift.id,
      },
    }),
    prisma.user.upsert({
      where: { employeeCode: "EMP-1003" },
      update: { passwordHash },
      create: {
        employeeCode: "EMP-1003",
        firstName: "Priya",
        lastName: "Verma",
        email: "priya@worktrack.local",
        phone: "9999990003",
        passwordHash,
        role: UserRole.EMPLOYEE,
        designation: "QA Analyst",
        departmentId: quality.id,
        shiftId: generalShift.id,
      },
    }),
    prisma.user.upsert({
      where: { employeeCode: "EMP-1004" },
      update: { passwordHash },
      create: {
        employeeCode: "EMP-1004",
        firstName: "Aman",
        lastName: "Gupta",
        email: "aman@worktrack.local",
        phone: "9999990004",
        passwordHash,
        role: UserRole.EMPLOYEE,
        designation: "Backend Developer",
        departmentId: engineering.id,
        shiftId: generalShift.id,
      },
    }),
    prisma.user.upsert({
      where: { employeeCode: "EMP-1005" },
      update: { passwordHash },
      create: {
        employeeCode: "EMP-1005",
        firstName: "Sneha",
        lastName: "Iyer",
        email: "sneha@worktrack.local",
        phone: "9999990005",
        passwordHash,
        role: UserRole.HR,
        designation: "HR Executive",
        departmentId: peopleOps.id,
        shiftId: generalShift.id,
      },
    }),
    prisma.user.upsert({
      where: { employeeCode: "EMP-1006" },
      update: { passwordHash },
      create: {
        employeeCode: "EMP-1006",
        firstName: "Karan",
        lastName: "Mehta",
        email: "karan@worktrack.local",
        phone: "9999990006",
        passwordHash,
        role: UserRole.EMPLOYEE,
        designation: "Sales Associate",
        departmentId: sales.id,
        shiftId: generalShift.id,
      },
    }),
  ]);

  // Create 6 additional employees to reach 10 total (plus admin)
  const additionalUsers = await Promise.all([
    prisma.user.upsert({
      where: { employeeCode: "EMP-1007" },
      update: { passwordHash },
      create: {
        employeeCode: "EMP-1007",
        firstName: "Vikram",
        lastName: "Singh",
        email: "vikram@worktrack.local",
        phone: "9999990007",
        passwordHash,
        role: UserRole.EMPLOYEE,
        designation: "DevOps Engineer",
        departmentId: engineering.id,
        shiftId: generalShift.id,
      },
    }),
    prisma.user.upsert({
      where: { employeeCode: "EMP-1008" },
      update: { passwordHash },
      create: {
        employeeCode: "EMP-1008",
        firstName: "Neha",
        lastName: "Patel",
        email: "neha@worktrack.local",
        phone: "9999990008",
        passwordHash,
        role: UserRole.EMPLOYEE,
        designation: "UI/UX Designer",
        departmentId: engineering.id,
        shiftId: generalShift.id,
      },
    }),
    prisma.user.upsert({
      where: { employeeCode: "EMP-1009" },
      update: { passwordHash },
      create: {
        employeeCode: "EMP-1009",
        firstName: "Rohan",
        lastName: "Kapoor",
        email: "rohan@worktrack.local",
        phone: "9999990009",
        passwordHash,
        role: UserRole.EMPLOYEE,
        designation: "Support Specialist",
        departmentId: departments[4].id, // Support
        shiftId: generalShift.id,
      },
    }),
    prisma.user.upsert({
      where: { employeeCode: "EMP-1010" },
      update: { passwordHash },
      create: {
        employeeCode: "EMP-1010",
        firstName: "Anjali",
        lastName: "Reddy",
        email: "anjali@worktrack.local",
        phone: "9999990010",
        passwordHash,
        role: UserRole.MANAGER,
        designation: "Engineering Manager",
        departmentId: engineering.id,
        shiftId: generalShift.id,
      },
    }),
  ]);

  const allEmployees = [...users, ...additionalUsers];

  const today = dayStart();
  const demoStats = [
    { user: allEmployees[1], login: 480, active: 400, idle: 18, breakTime: 40, productive: 422, percent: 92, status: AttendanceStatus.PRESENT },
    { user: allEmployees[2], login: 450, active: 330, idle: 42, breakTime: 45, productive: 363, percent: 78, status: AttendanceStatus.PRESENT },
    { user: allEmployees[3], login: 470, active: 380, idle: 22, breakTime: 38, productive: 410, percent: 88, status: AttendanceStatus.PRESENT },
    { user: allEmployees[5], login: 420, active: 310, idle: 34, breakTime: 45, productive: 341, percent: 74, status: AttendanceStatus.LATE },
    { user: allEmployees[6], login: 465, active: 390, idle: 15, breakTime: 45, productive: 415, percent: 90, status: AttendanceStatus.PRESENT },
    { user: allEmployees[7], login: 440, active: 360, idle: 25, breakTime: 45, productive: 370, percent: 85, status: AttendanceStatus.PRESENT },
    { user: allEmployees[8], login: 400, active: 280, idle: 50, breakTime: 45, productive: 305, percent: 65, status: AttendanceStatus.PRESENT },
    { user: allEmployees[9], login: 475, active: 410, idle: 10, breakTime: 40, productive: 440, percent: 95, status: AttendanceStatus.PRESENT },
  ];

  for (const item of demoStats) {
    await prisma.productivityRecord.upsert({
      where: { userId_date: { userId: item.user.id, date: today } },
      update: {
        loginMinutes: item.login,
        activeMinutes: item.active,
        idleMinutes: item.idle,
        breakMinutes: item.breakTime,
        productiveMinutes: item.productive,
        productivityPercent: item.percent,
        score: item.percent,
      },
      create: {
        userId: item.user.id,
        date: today,
        loginMinutes: item.login,
        activeMinutes: item.active,
        idleMinutes: item.idle,
        breakMinutes: item.breakTime,
        productiveMinutes: item.productive,
        productivityPercent: item.percent,
        score: item.percent,
      },
    });
  }

  await Promise.all([
    prisma.attendanceRecord.upsert({
      where: { userId_date: { userId: allEmployees[1].id, date: today } },
      update: {},
      create: {
        userId: allEmployees[1].id,
        date: today,
        status: AttendanceStatus.PRESENT,
        loginAt: atTime(9, 4),
        logoutAt: atTime(18, 2),
      },
    }),
    prisma.attendanceRecord.upsert({
      where: { userId_date: { userId: allEmployees[2].id, date: today } },
      update: {},
      create: {
        userId: allEmployees[2].id,
        date: today,
        status: AttendanceStatus.PRESENT,
        loginAt: atTime(9, 1),
        logoutAt: atTime(17, 55),
        idleDeductionMinutes: 42,
      },
    }),
    prisma.attendanceRecord.upsert({
      where: { userId_date: { userId: allEmployees[3].id, date: today } },
      update: {},
      create: {
        userId: allEmployees[3].id,
        date: today,
        status: AttendanceStatus.PRESENT,
        loginAt: atTime(9, 8),
        logoutAt: atTime(18, 7),
      },
    }),
    prisma.attendanceRecord.upsert({
      where: { userId_date: { userId: allEmployees[4].id, date: today } },
      update: {},
      create: {
        userId: allEmployees[4].id,
        date: today,
        status: AttendanceStatus.LEAVE,
        remarks: "Approved leave",
      },
    }),
    prisma.attendanceRecord.upsert({
      where: { userId_date: { userId: allEmployees[5].id, date: today } },
      update: {},
      create: {
        userId: allEmployees[5].id,
        date: today,
        status: AttendanceStatus.LATE,
        loginAt: atTime(9, 32),
        lateMinutes: 22,
      },
    }),
    prisma.attendanceRecord.upsert({
      where: { userId_date: { userId: allEmployees[6].id, date: today } },
      update: {},
      create: {
        userId: allEmployees[6].id,
        date: today,
        status: AttendanceStatus.PRESENT,
        loginAt: atTime(9, 5),
        logoutAt: atTime(18, 5),
      },
    }),
    prisma.attendanceRecord.upsert({
      where: { userId_date: { userId: allEmployees[7].id, date: today } },
      update: {},
      create: {
        userId: allEmployees[7].id,
        date: today,
        status: AttendanceStatus.PRESENT,
        loginAt: atTime(9, 2),
        logoutAt: atTime(17, 50),
      },
    }),
    prisma.attendanceRecord.upsert({
      where: { userId_date: { userId: allEmployees[8].id, date: today } },
      update: {},
      create: {
        userId: allEmployees[8].id,
        date: today,
        status: AttendanceStatus.PRESENT,
        loginAt: atTime(9, 15),
        logoutAt: atTime(18, 0),
      },
    }),
    prisma.attendanceRecord.upsert({
      where: { userId_date: { userId: allEmployees[9].id, date: today } },
      update: {},
      create: {
        userId: allEmployees[9].id,
        date: today,
        status: AttendanceStatus.PRESENT,
        loginAt: atTime(9, 0),
        logoutAt: atTime(18, 10),
      },
    }),
  ]);

  if ((await prisma.workflowTask.count()) === 0) {
    await prisma.workflowTask.createMany({
      data: [
        {
          title: "Sprint dashboard module",
          description: "Build dashboard charts and employee snapshot cards.",
          assignedToId: allEmployees[1].id,
          createdById: allEmployees[0].id,
          departmentId: engineering.id,
          status: WorkflowStatus.IN_PROGRESS,
          priority: WorkflowPriority.HIGH,
          dueDate: atTime(18, 0),
          estimatedHours: 7,
          actualHours: 5.5,
        },
        {
          title: "API integration testing",
          description: "Validate API contracts for tracking and attendance flows.",
          assignedToId: allEmployees[2].id,
          createdById: allEmployees[0].id,
          departmentId: quality.id,
          status: WorkflowStatus.REVIEW,
          priority: WorkflowPriority.MEDIUM,
          dueDate: atTime(18, 0),
          estimatedHours: 5,
          actualHours: 3.5,
        },
        {
          title: "Attendance exception logic",
          description: "Complete late login and idle deduction calculations.",
          assignedToId: allEmployees[3].id,
          createdById: allEmployees[0].id,
          departmentId: engineering.id,
          status: WorkflowStatus.IN_PROGRESS,
          priority: WorkflowPriority.URGENT,
          dueDate: atTime(18, 0),
          estimatedHours: 6,
          actualHours: 4.5,
        },
        {
          title: "Frontend optimization",
          description: "Improve dashboard performance and rendering.",
          assignedToId: allEmployees[7].id,
          createdById: allEmployees[0].id,
          departmentId: engineering.id,
          status: WorkflowStatus.IN_PROGRESS,
          priority: WorkflowPriority.MEDIUM,
          dueDate: atTime(18, 0),
          estimatedHours: 4,
          actualHours: 2.5,
        },
        {
          title: "Database query optimization",
          description: "Optimize slow queries and add indices.",
          assignedToId: allEmployees[6].id,
          createdById: allEmployees[0].id,
          departmentId: engineering.id,
          status: WorkflowStatus.COMPLETED,
          priority: WorkflowPriority.HIGH,
          dueDate: atTime(18, 0),
          estimatedHours: 5,
          actualHours: 4.8,
          completedAt: new Date(),
        },
        {
          title: "Customer support incident",
          description: "Resolve critical production issue.",
          assignedToId: allEmployees[8].id,
          createdById: allEmployees[0].id,
          departmentId: departments[4].id,
          status: WorkflowStatus.IN_PROGRESS,
          priority: WorkflowPriority.URGENT,
          dueDate: atTime(16, 0),
          estimatedHours: 2,
          actualHours: 1.2,
        },
      ],
    });
  }

  if ((await prisma.notification.count()) === 0) {
    await prisma.notification.createMany({
      data: [
        {
          userId: allEmployees[2].id,
          type: NotificationType.IDLE_ALERT,
          priority: NotificationPriority.HIGH,
          title: "Idle time alert",
          message: "Priya has been idle for 14 minutes.",
        },
        {
          userId: allEmployees[5].id,
          type: NotificationType.LATE_LOGIN,
          priority: NotificationPriority.MEDIUM,
          title: "Late login warning",
          message: "Karan logged in at 9:32 AM, 22 minutes after grace period.",
        },
        {
          userId: allEmployees[1].id,
          type: NotificationType.PRODUCTIVITY_ALERT,
          priority: NotificationPriority.LOW,
          title: "Productivity milestone",
          message: "Rahul crossed 90% productivity today.",
        },
        {
          userId: null,
          type: NotificationType.ADMIN_ANNOUNCEMENT,
          priority: NotificationPriority.MEDIUM,
          title: "Daily report ready",
          message: "The daily productivity report is ready for admin review.",
        },
        {
          userId: allEmployees[6].id,
          type: NotificationType.PRODUCTIVITY_ALERT,
          priority: NotificationPriority.LOW,
          title: "High productivity",
          message: "Vikram achieved 90% productivity with excellent focus time.",
        },
        {
          userId: allEmployees[9].id,
          type: NotificationType.PRODUCTIVITY_ALERT,
          priority: NotificationPriority.LOW,
          title: "Top performer",
          message: "Anjali achieved 95% productivity today - excellent work!",
        },
        {
          userId: null,
          type: NotificationType.REPORT_READY,
          priority: NotificationPriority.MEDIUM,
          title: "Weekly productivity report generated",
          message: "View detailed analytics for all departments this week.",
        },
      ],
    });
  }

  // Create active login sessions for employees currently working
  if ((await prisma.loginSession.count()) === 0) {
    await Promise.all([
      prisma.loginSession.create({
        data: {
          userId: allEmployees[1].id,
          loginAt: atTime(9, 4),
          status: SessionStatus.ACTIVE,
          activeMinutes: 400,
          idleMinutes: 18,
          breakMinutes: 40,
          productiveMinutes: 422,
          events: {
            create: [
              { userId: allEmployees[1].id, type: TrackingEventType.LOGIN, occurredAt: atTime(9, 4) },
            ],
          },
        },
      }),
      prisma.loginSession.create({
        data: {
          userId: allEmployees[3].id,
          loginAt: atTime(9, 8),
          status: SessionStatus.ACTIVE,
          activeMinutes: 380,
          idleMinutes: 22,
          breakMinutes: 38,
          productiveMinutes: 410,
          events: {
            create: [
              { userId: allEmployees[3].id, type: TrackingEventType.LOGIN, occurredAt: atTime(9, 8) },
            ],
          },
        },
      }),
      prisma.loginSession.create({
        data: {
          userId: allEmployees[6].id,
          loginAt: atTime(9, 5),
          status: SessionStatus.ACTIVE,
          activeMinutes: 390,
          idleMinutes: 15,
          breakMinutes: 45,
          productiveMinutes: 415,
          events: {
            create: [
              { userId: allEmployees[6].id, type: TrackingEventType.LOGIN, occurredAt: atTime(9, 5) },
            ],
          },
        },
      }),
      prisma.loginSession.create({
        data: {
          userId: allEmployees[9].id,
          loginAt: atTime(9, 0),
          status: SessionStatus.ACTIVE,
          activeMinutes: 410,
          idleMinutes: 10,
          breakMinutes: 40,
          productiveMinutes: 440,
          events: {
            create: [
              { userId: allEmployees[9].id, type: TrackingEventType.LOGIN, occurredAt: atTime(9, 0) },
            ],
          },
        },
      }),
    ]);
  }

  console.log("Database seeded successfully.");
  console.log("Admin login: EMP-1001 / admin@worktrack.local / password123");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
