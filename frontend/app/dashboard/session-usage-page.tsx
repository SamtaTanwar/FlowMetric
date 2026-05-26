"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  allowProtectedNavigation,
  apiRequest,
  canOpenProtectedRoute,
  clearAuth,
  getStoredUser,
  isEmployeeAccount,
} from "@/lib/api";
import type { StoredUser } from "@/lib/api";
import {
  AppWebsiteActivityTable,
  EmployeeSnapshotTable,
} from "./session-usage-tables";
import type { EmployeeSnapshotRow, SessionUsageRow } from "./session-usage-tables";

type TableKind = "employee-snapshot" | "app-website-activity";

type ApiEmployee = {
  id: number;
  employeeCode: string;
  firstName: string;
  lastName: string;
  department?: { name: string } | null;
};

const pageConfig = {
  "employee-snapshot": {
    title: "Employee Snapshot",
    description: "Full clock-in, clock-out and session summary for employee work sessions.",
  },
  "app-website-activity": {
    title: "App/Website Activity",
    description: "Full app and website usage activity captured across employee sessions.",
  },
};

export default function SessionUsagePage({ kind }: { kind: TableKind }) {
  const router = useRouter();
  const [rows, setRows] = useState<SessionUsageRow[]>([]);
  const [employeeSnapshotRows, setEmployeeSnapshotRows] = useState<EmployeeSnapshotRow[]>([]);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const config = pageConfig[kind];

  useEffect(() => {
    let isCurrent = true;

    async function loadPage() {
      const storedUser = getStoredUser();

      if (!canOpenProtectedRoute(`/dashboard/${kind}`)) {
        clearAuth();
        router.replace("/login");
        return;
      }

      try {
        const meResponse = await apiRequest<{ user: StoredUser }>("/api/auth/me");
        const user = meResponse.user || storedUser;

        if (isEmployeeAccount(user)) {
          allowProtectedNavigation("/employee");
          router.replace("/employee");
          return;
        }

        const [sessionUsageResponse, employeesResponse] = await Promise.all([
          apiRequest<{ rows: SessionUsageRow[] }>("/api/admin/session-usage?limit=200"),
          kind === "employee-snapshot"
            ? apiRequest<{ employees: ApiEmployee[] }>("/api/employees")
            : Promise.resolve({ employees: [] }),
        ]);

        if (!isCurrent) {
          return;
        }

        const sessionRows = sessionUsageResponse.rows || [];
        const latestSessionByUser = new Map<number, SessionUsageRow>();

        for (const row of sessionRows) {
          if (!latestSessionByUser.has(row.userId)) {
            latestSessionByUser.set(row.userId, row);
          }
        }

        setRows(sessionRows);
        setEmployeeSnapshotRows(
          kind === "employee-snapshot"
            ? employeesResponse.employees.map((employee) => {
                const sessionRow = latestSessionByUser.get(employee.id);

                if (sessionRow) {
                  return sessionRow;
                }

                return {
                  sessionId: `employee-${employee.id}`,
                  userId: employee.id,
                  employeeCode: employee.employeeCode,
                  employeeName: `${employee.firstName} ${employee.lastName}`,
                  department: employee.department?.name || "Unassigned",
                  loginAt: null,
                  logoutAt: null,
                  sessionStatus: "NO_SESSION",
                  sessionLabel: "No Session",
                  totalMinutes: 0,
                  idleMinutes: 0,
                  breakMinutes: 0,
                  activeMinutes: 0,
                  productiveMinutes: 0,
                  unproductiveMinutes: 0,
                  networkInterruptionMinutes: 0,
                };
              })
            : [],
        );
        setIsAuthorized(true);
      } catch {
        clearAuth();
        router.replace("/login");
      } finally {
        if (isCurrent) {
          setLoading(false);
        }
      }
    }

    loadPage();
    const refreshInterval = window.setInterval(loadPage, 10000);

    return () => {
      isCurrent = false;
      window.clearInterval(refreshInterval);
    };
  }, [kind, router]);

  if (!isAuthorized || loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#020617] px-6 text-center text-white">
        <div className="rounded-2xl border border-white/10 bg-white/6 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl">
          <p className="text-sm font-medium text-slate-300">Loading {config.title.toLowerCase()}...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#020617] px-6 py-8 text-white">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">
              Admin Dashboard
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-white md:text-4xl">
              {config.title}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              {config.description}
            </p>
          </div>

          <Link
            className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/6 px-4 text-sm font-semibold text-slate-200 hover:bg-white/10"
            href="/dashboard"
            onClick={() => allowProtectedNavigation("/dashboard")}
          >
            Back to dashboard
          </Link>
        </div>

        {kind === "employee-snapshot" ? (
          <EmployeeSnapshotTable rows={employeeSnapshotRows} />
        ) : (
          <AppWebsiteActivityTable rows={rows} />
        )}
      </div>
    </main>
  );
}
