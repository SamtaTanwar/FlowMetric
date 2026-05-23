/// <reference types="node" />

import bcrypt from "bcryptjs";
import {
  PrismaClient,
  UserRole,
} from "@prisma/client";

const prisma = new PrismaClient();

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
  const passwordHash = await bcrypt.hash("password@123", 10);

  const departments = await Promise.all([
    findOrCreateDepartment("Engineering", "Product and platform engineering"),
    findOrCreateDepartment("Quality", "QA and release validation"),
    findOrCreateDepartment("Sales", "Sales and client operations"),
    findOrCreateDepartment("People Ops", "HR and employee operations"),
    findOrCreateDepartment("Support", "Customer support team"),
  ]);

  const [engineering, quality, sales] = departments;

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

  await Promise.all([
    prisma.admin.upsert({
      where: { adminCode: "EMP-1001" },
      update: { passwordHash },
      create: {
        adminCode: "EMP-1001",
        firstName: "Admin",
        lastName: "User",
        email: "admin@worktrack.local",
        phone: "9999990001",
        passwordHash,
        role: UserRole.ADMIN,
        designation: "System Administrator",
      },
    }),
    prisma.admin.upsert({
      where: { adminCode: "EMP-1005" },
      update: { passwordHash },
      create: {
        adminCode: "EMP-1005",
        firstName: "Sneha",
        lastName: "Iyer",
        email: "sneha@worktrack.local",
        phone: "9999990005",
        passwordHash,
        role: UserRole.HR,
        designation: "HR Executive",
      },
    }),
    prisma.admin.upsert({
      where: { adminCode: "EMP-1010" },
      update: { passwordHash },
      create: {
        adminCode: "EMP-1010",
        firstName: "Anjali",
        lastName: "Reddy",
        email: "anjali@worktrack.local",
        phone: "9999990010",
        passwordHash,
        role: UserRole.MANAGER,
        designation: "Engineering Manager",
      },
    }),
  ]);

  await prisma.user.deleteMany({
    where: {
      role: {
        in: [UserRole.ADMIN, UserRole.MANAGER, UserRole.HR],
      },
    },
  });

  await Promise.all([
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

  // Create additional demo users.
  await Promise.all([
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
  ]);

  console.log("Database seeded successfully.");
  console.log("Admin login: EMP-1001 / admin@worktrack.local / password@123");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
