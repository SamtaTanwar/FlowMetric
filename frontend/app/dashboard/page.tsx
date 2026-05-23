"use client";

import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  CalendarCheck,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Gauge,
  LayoutDashboard,
  ListChecks,
  LogOut,
  MousePointer2,
  PanelLeft,
  Search,
  Settings,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useEffect, useMemo, useState } from "react";
import {
  apiRequest,
  clearAuth,
  downloadApiFile,
  getStoredSessionId,
  getStoredToken,
  getStoredUser,
} from "@/lib/api";
import type { StoredUser } from "@/lib/api";

const navItems = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "employees", label: "Employees", icon: Users },
  { id: "employee", label: "Selected Employee", icon: Gauge },
  { id: "attendance", label: "Attendance", icon: CalendarCheck },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "workflow", label: "Workflows", icon: ListChecks },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "reports", label: "Reports", icon: FileText },
  { id: "settings", label: "Settings", icon: Settings },
];

type EmployeeRow = {
  id?: number;
  employeeCode?: string;
  name: string;
  role: string;
  department: string;
  status: string;
  attendance: string;
  productivity: number;
  productivityLabel: string;
  focus: string;
  tasks: string;
  loginTime?: string;
  activeTime?: string;
  idleTime?: string;
  productiveTime?: string;
};

type ActivityItem = {
  title: string;
  time: string;
  type: string;
};

type WorkflowItem = {
  title: string;
  owner: string;
  progress: number;
  status: string;
  due: string;
};

type NotificationItem = {
  id: number;
  userId?: number | null;
  title: string;
  category: string;
  tone: string;
  time: string;
};

type ReportItem = {
  title: string;
  owner: string;
  status: string;
  date: string;
};

type PolicyItem = {
  label: string;
  value: string;
  width: string;
};

type WorkdayStats = {
  loginTime: string | null;
  activeMinutes: number;
  idleMinutes: number;
  productiveMinutes: number;
  productivity: number;
  isFinalized: boolean;
};

type ApiEmployee = {
  id: number;
  employeeCode: string;
  firstName: string;
  lastName: string;
  designation?: string | null;
  department?: { name: string } | null;
  loginSessions?: Array<{
    status: string;
    loginAt: string;
    activeMinutes: number;
    idleMinutes: number;
    breakMinutes: number;
    productiveMinutes: number;
  }>;
  productivityRecords?: Array<{
    productiveMinutes: number;
    productivityPercent: number;
    idleMinutes: number;
  }>;
  attendanceRecords?: Array<{
    status: string;
    loginAt?: string | null;
    lateMinutes?: number | null;
  }>;
  assignedWorkflows?: Array<{ id: number }>;
};

type ApiWorkflow = {
  title: string;
  status: string;
  dueDate?: string | null;
  estimatedHours?: number | null;
  actualHours?: number | null;
  assignedTo?: { firstName: string; lastName: string } | null;
};

type ApiNotification = {
  id: number;
  userId?: number | null;
  title: string;
  message: string;
  type: string;
  priority: string;
  createdAt: string;
};

type ApiLeaveRequest = {
  id: number;
  type: "SICK" | "CASUAL";
  reason: string;
  days: number;
  paidDays: number;
  unpaidDays: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  user: {
    id: number;
    employeeCode: string;
    firstName: string;
    lastName: string;
    department?: { name: string } | null;
  };
};

type ApiLiveEmployee = {
  id: number;
  employeeCode: string;
  name: string;
  department: string;
  liveStatus: string;
  currentSession: {
    id: number;
    loginAt: string;
    logoutAt?: string | null;
    status: string;
  } | null;
};

type ApiTrackingEvent = {
  id: number;
  sessionId: number;
  type: string;
  detail?: string | null;
  createdAt: string;
};

type ApiPolicy = {
  allowedIdleMinutes: number;
  breakAllowanceMinutes: number;
  graceMinutes: number;
  minimumWorkHours: number;
};

type ApiAttendanceRecord = {
  status: string;
  loginAt?: string | null;
  lateMinutes?: number | null;
  user: {
    employeeCode: string;
    firstName: string;
    lastName: string;
    department?: { name: string } | null;
  };
};

type ApiDailyReport = {
  date: string;
  activeSessions: number;
  attendance: ApiAttendanceRecord[];
  productivity: Array<{
    loginMinutes: number;
    idleMinutes: number;
    productiveMinutes: number;
    productivityPercent: number;
    user: {
      employeeCode: string;
      firstName: string;
      lastName: string;
    };
  }>;
  workflowCounts: Array<{ status: string; _count: { status: number } }>;
};

// Initialize as empty — dashboard should populate from backend APIs only
const activityFeed: ActivityItem[] = [];

function formatMinutes(minutes = 0) {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;

  if (hours <= 0) {
    return `${remaining}m`;
  }

  return `${hours}h ${remaining}m`;
}

function minutesFromLabel(value?: string) {
  if (!value) {
    return 0;
  }

  const hours = value.match(/(\d+)h/)?.[1];
  const minutes = value.match(/(\d+)m/)?.[1];

  return (hours ? Number(hours) * 60 : 0) + (minutes ? Number(minutes) : 0);
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "Not started";
  }

  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDate(value?: string | null) {
  if (!value) {
    return "No due date";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function labelFromEnum(value?: string) {
  if (!value) {
    return "Not Marked";
  }

  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function productivityPercent(productiveMinutes: number, loginMinutes: number) {
  if (loginMinutes <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((productiveMinutes / loginMinutes) * 100));
}

function timeAgo(value?: string) {
  if (!value) {
    return "Just now";
  }

  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));

  if (minutes < 1) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  return `${Math.round(minutes / 60)} hr ago`;
}

function mapEmployee(employee: ApiEmployee): EmployeeRow {
  const session = employee.loginSessions?.[0];
  const isActiveSession = session?.status === "ACTIVE";
  const productivity = employee.productivityRecords?.[0];
  const attendance = employee.attendanceRecords?.[0];
  const liveLoginMinutes = session ? Math.max(0, Math.round((Date.now() - new Date(session.loginAt).getTime()) / 60000)) : 0;
  const idleMinutes = isActiveSession ? session?.idleMinutes ?? 0 : productivity?.idleMinutes ?? session?.idleMinutes ?? 0;
  const breakMinutes = session?.breakMinutes ?? 0;
  const liveProductiveMinutes = Math.max(0, liveLoginMinutes - idleMinutes - breakMinutes);
  const productivityValue = isActiveSession
    ? productivityPercent(liveProductiveMinutes, liveLoginMinutes)
    : Math.round(productivity?.productivityPercent ?? 0);
  const productiveMinutes = isActiveSession ? liveProductiveMinutes : productivity?.productiveMinutes ?? session?.productiveMinutes ?? 0;
  const workflowCount = employee.assignedWorkflows?.length ?? 0;

  return {
    id: employee.id,
    employeeCode: employee.employeeCode,
    name: `${employee.firstName} ${employee.lastName}`,
    role: employee.designation || "Employee",
    department: employee.department?.name || "Unassigned",
    status: isActiveSession ? "Active" : "Offline",
    attendance:
      attendance?.status === "HALF_DAY"
        ? "Half Day"
        : attendance?.status === "LATE" || (attendance?.lateMinutes ?? 0) > 0
          ? "Late"
          : labelFromEnum(attendance?.status),
    productivity: productivityValue,
    productivityLabel: `${productivityValue}%`,
    focus: formatMinutes(productiveMinutes),
    tasks: `${workflowCount} task${workflowCount === 1 ? "" : "s"}`,
    loginTime: formatDateTime(attendance?.loginAt || session?.loginAt),
    activeTime: formatMinutes(session?.activeMinutes ?? productiveMinutes),
    idleTime: formatMinutes(idleMinutes),
    productiveTime: formatMinutes(productiveMinutes),
  };
}

function mapWorkflow(workflow: ApiWorkflow): WorkflowItem {
  const progress =
    workflow.status === "COMPLETED"
      ? 100
      : workflow.estimatedHours && workflow.actualHours
        ? Math.min(100, Math.round((workflow.actualHours / workflow.estimatedHours) * 100))
        : workflow.status === "IN_PROGRESS"
          ? 65
          : workflow.status === "REVIEW"
            ? 82
            : 35;

  return {
    title: workflow.title,
    owner: workflow.assignedTo
      ? `${workflow.assignedTo.firstName} ${workflow.assignedTo.lastName}`
      : "Unassigned",
    progress,
    status: labelFromEnum(workflow.status),
    due: formatDate(workflow.dueDate),
  };
}

function mapNotification(item: ApiNotification): NotificationItem {
  return {
    id: item.id,
    userId: item.userId ?? null,
    title: item.message || item.title,
    category: labelFromEnum(item.type),
    tone:
      item.priority === "HIGH"
        ? "alert"
        : item.type.includes("PRODUCTIVITY") || item.type.includes("REPORT")
          ? "success"
          : "warning",
    time: timeAgo(item.createdAt),
  };
}

function adminNotificationsOnly(items: NotificationItem[]) {
  return items.filter((item) => item.userId == null);
}

function mapTrackingEventToActivityItem(event: ApiTrackingEvent, employeeName: string): ActivityItem {
  const normalizedType = event.type.replace(/_/g, " ").toLowerCase();
  const title = event.detail
    ? `${employeeName}: ${event.detail}`
    : `${employeeName}: ${normalizedType}`;

  const tone = event.type.includes("END")
    ? "success"
    : event.type.includes("START")
      ? "warning"
      : "info";

  return {
    title,
    time: timeAgo(event.createdAt),
    type: tone,
  };
}

function mapPolicies(policy?: ApiPolicy): PolicyItem[] {
  if (!policy) {
    return [];
  }

  return [
    {
      label: "Allowed Idle Threshold",
      value: `${policy.allowedIdleMinutes} minutes`,
      width: `${Math.min(100, policy.allowedIdleMinutes * 7)}%`,
    },
    {
      label: "Attendance Grace Period",
      value: `${policy.graceMinutes} minutes`,
      width: `${Math.min(100, policy.graceMinutes * 5)}%`,
    },
    {
      label: "Minimum Working Hours",
      value: `${policy.minimumWorkHours} hours`,
      width: `${Math.min(100, policy.minimumWorkHours * 10)}%`,
    },
    {
      label: "Break Allowance",
      value: `${policy.breakAllowanceMinutes} minutes`,
      width: `${Math.min(100, policy.breakAllowanceMinutes)}%`,
    },
  ];
}

function statusStyle(status: string) {
  if (status === "Active" || status === "Present" || status === "Ready") {
    return "bg-emerald-300/10 text-emerald-200 ring-emerald-300/20";
  }

  if (status === "Idle" || status === "Late" || status === "Half Day" || status === "Review") {
    return "bg-amber-300/10 text-amber-200 ring-amber-300/20";
  }

  return "bg-slate-300/10 text-slate-300 ring-white/10";
}

const chartTooltipStyle = {
  backgroundColor: "#ffffff",
  border: "1px solid #cbd5e1",
  color: "#020617",
};

const chartTooltipTextStyle = {
  color: "#020617",
};

function KpiCard({
  title,
  value,
  change,
  icon: Icon,
}: {
  title: string;
  value: string;
  change: string;
  icon: typeof LayoutDashboard;
}) {
  return (
    <motion.div
      className="rounded-2xl border border-white/10 bg-white/6 p-5 shadow-2xl shadow-black/20 backdrop-blur-xl"
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      viewport={{ once: true }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-400">{title}</p>
          <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
        </div>
        <div className="flex size-10 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-100">
          <Icon size={20} />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 text-sm font-medium text-emerald-200">
        <TrendingUp size={16} />
        <span>{change}</span>
      </div>
    </motion.div>
  );
}

function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/6 p-5 shadow-2xl shadow-black/20 backdrop-blur-xl">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(null);
  const [employeeRows, setEmployeeRows] = useState<EmployeeRow[]>([]);
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [workflowItems, setWorkflowItems] = useState<WorkflowItem[]>([]);
  const [notificationItems, setNotificationItems] = useState<NotificationItem[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<ApiLeaveRequest[]>([]);
  const [reviewingLeaveId, setReviewingLeaveId] = useState<number | null>(null);
  const [, setLiveEmployees] = useState<ApiLiveEmployee[]>([]);
  const [reportCards, setReportCards] = useState<ReportItem[]>([]);
  const [policyItems, setPolicyItems] = useState<PolicyItem[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<ApiAttendanceRecord[]>([]);
  const [departmentChartData, setDepartmentChartData] = useState<Array<{ name: string; value: number; color: string }>>([]);
  const [productivityChartData, setProductivityChartData] = useState<Array<{ day: string; productivity: number; attendance: number; tasks: number }>>([]);
  const [activityChartData, setActivityChartData] = useState<Array<{ hour: string; keyboard: number; mouse: number }>>([]);
  const [apiStatus, setApiStatus] = useState("Connecting to backend...");
  const [isExporting, setIsExporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRow | null>(null);

const [workdayStats, setWorkdayStats] = useState<WorkdayStats | null>(null);

  const [isAuthorized, setIsAuthorized] = useState(false);
  const [dashboardStats, setDashboardStats] = useState<{
    totalEmployees: number;
    activeEmployees: number;
    breakEmployees: number;
    idleEmployees: number;
    avgProductivity: number;
    attendancePercent: number;
    presentCount: number;
    totalRecorded: number;
  }>({
    totalEmployees: 0,
    activeEmployees: 0,
    breakEmployees: 0,
    idleEmployees: 0,
    avgProductivity: 0,
    attendancePercent: 0,
    presentCount: 0,
    totalRecorded: 0,
  });

  useEffect(() => {
    let isCurrent = true;

    const fetchWorkdayStats = async () => {
      if (!selectedEmployee) {
        setWorkdayStats(null);
        return;
      }

      try {
        const data = await apiRequest<WorkdayStats>(
          `/api/employees/${selectedEmployee.id}/workday-stats`,
        );

        if (isCurrent) {
          setWorkdayStats(data);
        }
      } catch (error) {
        console.error("Workday stats error:", error);
        if (isCurrent) {
          setWorkdayStats(null);
        }
      }
    };

    fetchWorkdayStats();

    return () => {
      isCurrent = false;
    };
  }, [selectedEmployee]);

  useEffect(() => {
    const token = getStoredToken();
    const storedUser = getStoredUser();

    if (!token) {
      router.replace("/login");
      return;
    }

    if (storedUser?.role === "EMPLOYEE") {
      router.replace("/employee");
      return;
    }

    async function loadDashboardData() {
      try {
        const [
          employeesResponse,
          workflowsResponse,
          notificationsResponse,
          leaveRequestsResponse,
          liveResponse,
          policiesResponse,
          dashboardStatsResponse,
          reportResponse,
        ] = await Promise.all([
          apiRequest<{ employees: ApiEmployee[] }>("/api/employees"),
          apiRequest<{ workflows: ApiWorkflow[] }>("/api/workflows"),
          apiRequest<{ notifications: ApiNotification[] }>("/api/notifications"),
          apiRequest<{ requests: ApiLeaveRequest[] }>("/api/leave-requests"),
          apiRequest<{ employees: ApiLiveEmployee[] }>("/api/tracking/live"),
          apiRequest<{ policies: ApiPolicy[] }>("/api/policies"),
          apiRequest<{
  totalEmployees: number;
  activeEmployees: number;
  breakEmployees: number;
  idleEmployees: number;
  avgProductivity: number;
  attendancePercent: number;
  presentCount: number;
  totalRecorded: number;
}>("/api/admin/dashboard-stats"),
          apiRequest<ApiDailyReport>("/api/reports/daily"),
        ]);

        setCurrentUser(storedUser);
        const mappedEmployees = employeesResponse.employees.map(mapEmployee);
        const mappedWorkflows = workflowsResponse.workflows.map(mapWorkflow);
        const mappedNotifications = adminNotificationsOnly(
          notificationsResponse.notifications.map(mapNotification),
        );
        const colors = ["#2563eb", "#16a34a", "#f59e0b", "#7c3aed", "#dc2626"];

        setEmployeeRows(mappedEmployees);
        setSelectedEmployee(mappedEmployees[0] ?? null);
        setProductivityChartData(
          mappedEmployees.map((employee) => ({
            day: employee.name,
            productivity: employee.productivity,
            attendance: employee.attendance === "Present" ? 100 : employee.attendance === "Late" ? 70 : employee.attendance === "Half Day" ? 50 : 0,
            tasks: Number.parseInt(employee.tasks, 10) || 0,
          })),
        );
        setActivityChartData(
          mappedEmployees.map((employee) => ({
            hour: employee.name,
            keyboard: minutesFromLabel(employee.productiveTime),
            mouse: minutesFromLabel(employee.idleTime),
          })),
        );
        setAttendanceRecords(reportResponse.attendance);
        setWorkflowItems(mappedWorkflows);
        setNotificationItems(mappedNotifications);
        setLeaveRequests(leaveRequestsResponse.requests);
        setLiveEmployees(liveResponse.employees);

        const liveSessionEmployees = liveResponse.employees
          .filter((employee) => employee.currentSession?.id)
          .slice(0, 2);

        const liveSessionEvents = await Promise.all(
          liveSessionEmployees.map((employee) =>
            apiRequest<{ events: ApiTrackingEvent[] }>(
              `/api/tracking/events/${employee.currentSession!.id}`,
            ),
          ),
        );

        const eventActivityItems = liveSessionEmployees.flatMap((employee, index) =>
          liveSessionEvents[index].events.slice(-2).map((event) =>
            mapTrackingEventToActivityItem(event, employee.name),
          ),
        );

        setActivityItems(
          [
            ...eventActivityItems,
            ...mappedNotifications.slice(0, 2).map((item) => ({
              title: item.title,
              time: item.time,
              type: item.tone === "alert" ? "alert" : item.tone,
            })),
            ...liveResponse.employees.slice(0, 2).map((employee) => ({
              title: `${employee.name} is ${employee.liveStatus.toLowerCase()}`,
              time: employee.currentSession?.loginAt ? timeAgo(employee.currentSession.loginAt) : "Just now",
              type: employee.liveStatus === "ONLINE" ? "success" : "warning",
            })),
          ]
            .slice(0, 4),
        );
        setPolicyItems(mapPolicies(policiesResponse.policies[0]));

        const departmentCounts = mappedEmployees.reduce<Record<string, number>>((counts, employee) => {
          counts[employee.department] = (counts[employee.department] || 0) + 1;
          return counts;
        }, {});

        setDepartmentChartData(
          Object.entries(departmentCounts).map(([department, count], index) => ({
            name: department,
            value: count,
            color: colors[index % colors.length],
          })),
        );

        const reportDate = formatDate(reportResponse.date);
        setDashboardStats({
          totalEmployees: dashboardStatsResponse.totalEmployees,
          activeEmployees: dashboardStatsResponse.activeEmployees,
          breakEmployees: dashboardStatsResponse.breakEmployees,
          idleEmployees: dashboardStatsResponse.idleEmployees,
          avgProductivity: dashboardStatsResponse.avgProductivity,
          attendancePercent: dashboardStatsResponse.attendancePercent,
          presentCount: dashboardStatsResponse.presentCount,
          totalRecorded: dashboardStatsResponse.totalRecorded,
        });

        setReportCards([
          {
            title: "Daily Productivity Summary",
            owner: `Average ${dashboardStatsResponse.avgProductivity}%`,
            status: reportResponse.productivity.length > 0 ? "Updated" : "Pending",
            date: reportDate,
          },
          {
            title: "Attendance Exception Report",
            owner: `${reportResponse.attendance.length} records`,
            status: reportResponse.attendance.length > 0 ? "Updated" : "Pending",
            date: reportDate,
          },
          {
            title: "Workflow Efficiency Report",
            owner: `${reportResponse.workflowCounts.length} status groups`,
            status: reportResponse.workflowCounts.length > 0 ? "Updated" : "Pending",
            date: reportDate,
          },
        ]);
        setApiStatus(`Backend connected - ${reportResponse.activeSessions} active sessions`);
        setIsAuthorized(true);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Backend connection failed";

        if (message.toLowerCase().includes("token") || message.toLowerCase().includes("auth")) {
          clearAuth();
          router.replace("/login");
          return;
        }

        setApiStatus("Backend connection failed - start backend on port 5000");
        setIsAuthorized(true);
      }
    }

    loadDashboardData();
  }, [router]);

  const filteredEmployees = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return employeeRows;
    }

    return employeeRows.filter((employee) =>
      [employee.name, employee.employeeCode, employee.department, employee.role]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [employeeRows, searchQuery]);

  function selectEmployee(employee: EmployeeRow) {
    setSelectedEmployee(employee);
    setActiveTab("employee");
    setSearchQuery(employee.name);
  }

  function handleSearchSubmit() {
    const match = filteredEmployees[0];

    if (match) {
      selectEmployee(match);
    }
  }

  async function handleExportReport() {
    setIsExporting(true);

    try {
      await downloadApiFile("/api/reports/export", "productivity-report.csv");
    } finally {
      setIsExporting(false);
    }
  }

  async function handleLeaveDecision(id: number, status: "APPROVED" | "REJECTED") {
    setReviewingLeaveId(id);

    try {
      const response = await apiRequest<{ request: ApiLeaveRequest }>(`/api/leave-requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });

      setLeaveRequests((items) =>
        items.map((item) => (item.id === id ? response.request : item)),
      );

      const notificationsResponse = await apiRequest<{ notifications: ApiNotification[] }>("/api/notifications");
      setNotificationItems(
        adminNotificationsOnly(notificationsResponse.notifications.map(mapNotification)),
      );
    } finally {
      setReviewingLeaveId(null);
    }
  }

  async function handleLogout() {
    const sessionId = getStoredSessionId();

    await apiRequest("/api/auth/logout", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    }).catch(() => null);

    clearAuth();
    router.push("/login");
  }

  if (!isAuthorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#030712] px-5 text-white">
        <div className="rounded-2xl border border-white/10 bg-white/6 p-6 text-center shadow-2xl shadow-black/30 backdrop-blur-xl">
          <div className="mx-auto flex size-11 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-100">
            <ShieldCheck size={22} />
          </div>
          <h1 className="mt-4 text-lg font-semibold">Checking admin access</h1>
          <p className="mt-2 text-sm text-slate-400">Please login before opening the dashboard.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative h-screen overflow-hidden bg-[#030712] text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(34,211,238,0.14),transparent_30%),radial-gradient(circle_at_86%_6%,rgba(99,102,241,0.14),transparent_28%),linear-gradient(180deg,#030712,#07111f_48%,#020617)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.06] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-size-[72px_72px]" />
      <div className="relative z-10 flex h-screen">
        <aside className={`${
  sidebarOpen ? "w-72" : "w-20"
} sticky top-0 hidden h-screen shrink-0 border-r border-white/10 bg-white/5 px-5 py-6 shadow-2xl shadow-black/20 backdrop-blur-2xl transition-all duration-300 lg:block`} >
       <div className="flex items-center justify-between">
<div className="flex items-center justify-between">
  <div className="flex items-center gap-3">
    <div className="flex size-10 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-100 shadow-lg shadow-cyan-500/10">
      <Gauge size={22} />
    </div>

    {sidebarOpen && (
      <div>
        <p className="text-lg font-semibold text-white">WorkTrack Pro</p>
        <p className="text-xs font-medium text-slate-400">
          Employee Monitoring
        </p>
      </div>
    )}
  </div>

  
</div>

  <button
    onClick={() => setSidebarOpen(!sidebarOpen)}
    className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10"
  >
    <PanelLeft size={17} />
  </button>
</div>

          <nav className="mt-8 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  className={`flex w-full items-center rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${
  sidebarOpen
    ? "justify-start gap-3"
    : "justify-center"
} ${
  isActive
    ? "bg-cyan-300/10 text-cyan-100 ring-1 ring-cyan-300/20"
    : "text-slate-400 hover:bg-white/7 hover:text-white"
}`}
                  onClick={() => setActiveTab(item.id)}
                  type="button"
                >
                  <Icon size={18} />
                  {sidebarOpen && item.label}
                </button>
              );
            })}
          </nav>

       <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4">
  <div
    className={`flex items-center text-sm font-semibold text-white ${
      sidebarOpen ? "gap-2" : "justify-center"
    }`}
  >
    <ShieldCheck size={18} className="text-emerald-300" />

    {sidebarOpen && "Secure session"}
  </div>

  {sidebarOpen && (
    <p className="mt-2 text-sm text-slate-400">
      {currentUser
        ? `${currentUser.firstName} ${currentUser.lastName}`
        : "Admin"}{" "}
      access active.
    </p>
  )}
</div>
        </aside>

        <div className="flex h-screen min-w-0 flex-1 flex-col overflow-y-auto">
          <header className="sticky top-0 z-20 border-b border-white/10 bg-[#030712]/82 px-4 py-4 backdrop-blur-2xl md:px-8">

            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
  
              <div>
                <p className="text-sm font-medium text-cyan-200">Admin Dashboard</p>
                <h1 className="text-2xl font-semibold text-white">
                  Employee Workflow Tracking
                </h1>
                <p className="mt-1 text-sm text-slate-400">{apiStatus}</p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex h-10 min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-white/6 px-3 sm:w-80">
                  <Search size={18} className="shrink-0 text-slate-400" />
                  <input
                    className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                    onChange={(event) => setSearchQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        handleSearchSubmit();
                      }
                    }}
                    placeholder="Search employee name or ID"
                    type="text"
                    value={searchQuery}
                  />
                </div>
                {searchQuery && (
                  <button
                    className="h-10 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 text-sm font-semibold text-cyan-100 hover:bg-cyan-300/15"
                    onClick={handleSearchSubmit}
                    type="button"
                  >
                    Open
                  </button>
                )}
                <button
                  className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/6 text-slate-300 hover:bg-white/10"
                  onClick={() => setActiveTab("notifications")}
                  type="button"
                >
                  <Bell size={18} />
                </button>
                <button
                  className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/6 px-3 text-sm font-semibold text-slate-300 hover:bg-white/10"
                  onClick={handleLogout}
                  type="button"
                >
                  <LogOut size={17} />
                  Logout
                </button>
              </div>
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto lg:hidden">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium ${
                    activeTab === item.id
                      ? "bg-cyan-300/10 text-cyan-100 ring-1 ring-cyan-300/20"
                      : "bg-white/6 text-slate-300"
                  }`}
                  onClick={() => setActiveTab(item.id)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </header>

          <div className="space-y-6 p-4 md:p-8">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                title="Total Employees"
                value={`${dashboardStats.totalEmployees}`}
                change={`${dashboardStats.presentCount} present today`}
                icon={Users}
              />
              <KpiCard
                title="Active Now"
                value={`${dashboardStats.activeEmployees}`}
                change={`${dashboardStats.activeEmployees} active sessions`}
                icon={Activity}
              />
              <KpiCard
                title="Productivity"
                value={`${dashboardStats.avgProductivity}%`}
                change={`${dashboardStats.totalRecorded} productivity records`}
                icon={BarChart3}
              />
              <KpiCard
                title="Attendance"
                value={`${dashboardStats.attendancePercent}%`}
                change={`${dashboardStats.presentCount} present`}
                icon={CalendarCheck}
              />
            </div>

            {activeTab === "overview" && (
              <>
                <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
                  <SectionCard title="Employee Productivity Intelligence">
                    <div className="h-80">
                      <ResponsiveContainer height="100%" width="100%">
                        <AreaChart data={productivityChartData}>
                          <defs>
                            <linearGradient id="productivityFill" x1="0" x2="0" y1="0" y2="1">
                              <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.28} />
                              <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid stroke="#1e293b" strokeDasharray="4 4" />
                          <XAxis dataKey="day" stroke="#94a3b8" />
                          <YAxis stroke="#94a3b8" />
                          <Tooltip
                            contentStyle={chartTooltipStyle}
                            labelStyle={chartTooltipTextStyle}
                          />
                          <Area
                            dataKey="productivity"
                            fill="url(#productivityFill)"
                            name="Productivity"
                            stroke="#22d3ee"
                            strokeWidth={3}
                            type="monotone"
                          />
                          <Line dataKey="attendance" name="Attendance" stroke="#34d399" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </SectionCard>

                  <SectionCard title="Department Distribution">
                    <div className="h-80">
                      <ResponsiveContainer height="100%" width="100%">
                        <PieChart>
                          <Pie
                            cx="50%"
                            cy="48%"
                            data={departmentChartData}
                            dataKey="value"
                            innerRadius={58}
                            outerRadius={96}
                            paddingAngle={4}
                          >
                            {departmentChartData.map((entry) => (
                              <Cell fill={entry.color} key={entry.name} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={chartTooltipStyle}
                            labelStyle={chartTooltipTextStyle}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {departmentChartData.map((item) => (
                        <div className="flex items-center gap-2 text-sm" key={item.name}>
                          <span
                            className="size-2.5 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="text-slate-300">{item.name}</span>
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                </div>

                <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
                  <EmployeeTable compact onSelect={selectEmployee} rows={filteredEmployees} selectedName={selectedEmployee?.name} />
                  <ActivityFeed items={activityItems} />
                </div>
              </>
            )}

            {activeTab === "employees" && (
              <EmployeeTable onSelect={selectEmployee} rows={filteredEmployees} selectedName={selectedEmployee?.name} />
            )}
            {activeTab === "employee" && (
             <EmployeeSelfDashboard
              employee={selectedEmployee}
              notifications={notificationItems.filter((item) => item.userId == null || item.userId === selectedEmployee?.id)}
              workdayStats={workdayStats}
            />
            )}
            {activeTab === "attendance" && <AttendanceView records={attendanceRecords} rows={employeeRows} />}
            {activeTab === "activity" && <ActivityView chartData={activityChartData} rows={employeeRows} />}
            {activeTab === "workflow" && <WorkflowView items={workflowItems} />}
            {activeTab === "notifications" && (
              <NotificationView
                items={notificationItems}
                leaveRequests={leaveRequests}
                onLeaveDecision={handleLeaveDecision}
                reviewingLeaveId={reviewingLeaveId}
              />
            )}
            {activeTab === "reports" && (
              <ReportsView exporting={isExporting} items={reportCards} onExport={handleExportReport} />
            )}
            {activeTab === "settings" && <SettingsView policies={policyItems} />}
          </div>
        </div>
      </div>
    </main>
  );
}

function EmployeeTable({
  compact = false,
  onSelect,
  rows = [],
  selectedName,
}: {
  compact?: boolean;
  onSelect?: (employee: EmployeeRow) => void;
  rows?: EmployeeRow[];
  selectedName?: string;
}) {
  return (
    <SectionCard title={compact ? "Employee Snapshot" : "Employee Directory"}>
      <p className="mb-4 text-sm text-slate-400">
        Click an employee row to open their individual attendance and productivity details.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-190 border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs font-semibold uppercase text-slate-400">
              <th className="py-3 pr-4">Employee</th>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Attendance</th>
              <th className="px-4 py-3">Productivity</th>
              <th className="px-4 py-3">Focus Time</th>
              <th className="py-3 pl-4">Tasks</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, compact ? 4 : rows.length).map((employee) => (
              <tr
                className={`cursor-pointer border-b border-white/5 last:border-0 hover:bg-cyan-300/5 ${
                  selectedName === employee.name ? "bg-cyan-300/10" : ""
                }`}
                key={employee.name}
                onClick={() => onSelect?.(employee)}
              >
                <td className="py-4 pr-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-sm font-semibold text-cyan-100">
                      {employee.name
                        .split(" ")
                        .map((part) => part[0])
                        .join("")}
                    </div>
                    <div>
                      <p className="font-semibold text-white">{employee.name}</p>
                      <p className="text-xs text-slate-400">{employee.role}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 text-slate-300">{employee.department}</td>
                <td className="px-4 py-4">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusStyle(employee.status)}`}>
                    {employee.status}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusStyle(employee.attendance)}`}>
                    {employee.attendance}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-24 rounded-full bg-white/10">
                      <div
                        className="h-2 rounded-full bg-linear-to-r from-cyan-300 to-indigo-300"
                        style={{ width: `${employee.productivity ?? 0}%` }}
                      />
                    </div>
                    <span className="font-medium text-slate-200">{employee.productivityLabel}</span>
                  </div>
                </td>
                <td className="px-4 py-4 text-slate-300">{employee.focus}</td>
                <td className="py-4 pl-4 font-medium text-slate-200">{employee.tasks}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="py-8 text-center text-sm text-slate-400" colSpan={7}>
                  No employee found for this search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function ActivityFeed({ items = activityFeed }: { items?: ActivityItem[] }) {
  return (
    <SectionCard title="Live Activity Feed">
      <div className="space-y-4">
        {items.map((item) => {
          const Icon =
            item.type === "success"
              ? CheckCircle2
              : item.type === "warning"
                ? Clock3
                : item.type === "info"
                  ? Activity
                  : AlertTriangle;
          const glassColor =
            item.type === "success"
              ? "text-emerald-200 bg-emerald-300/10 ring-1 ring-emerald-300/20"
              : item.type === "warning"
                ? "text-amber-200 bg-amber-300/10 ring-1 ring-amber-300/20"
                : "text-rose-200 bg-rose-300/10 ring-1 ring-rose-300/20";

          return (
            <div className="flex gap-3" key={item.title}>
              <div className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${glassColor}`}>
                <Icon size={18} />
              </div>
              <div>
                <p className="text-sm font-medium text-white">{item.title}</p>
                <p className="mt-1 text-xs text-slate-400">{item.time}</p>
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function EmployeeSelfDashboard({
  employee,
  notifications: notificationRows = [],
  workdayStats,
}: {
  employee?: EmployeeRow | null;
  notifications?: NotificationItem[];
  workdayStats?: WorkdayStats | null;
}) {
  if (!employee) {
    return (
      <SectionCard title="No employee selected">
        <p className="text-sm text-slate-400">Select an employee from the directory or search to view details.</p>
      </SectionCard>
    );
  }
const productivityValue = workdayStats?.productivity ?? employee.productivity ?? 0;
const summary = [
  {
    label: "Login Time",
    value: workdayStats?.loginTime
      ? new Date(
          workdayStats.loginTime
        ).toLocaleTimeString("en-IN", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          timeZone: "Asia/Kolkata",
        })
      : "--",
  },

  {
    label: "Active Time",
    value: formatMinutes(workdayStats?.activeMinutes ?? 0),
  },

  {
    label: "Idle Time",
    value: formatMinutes(workdayStats?.idleMinutes ?? 0),
  },

  {
    label: "Productive Time",
    value: formatMinutes(workdayStats?.productiveMinutes ?? 0),
  },
];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
      <SectionCard title={`${employee.name} - Workday Details`}>
        <p className="mb-4 text-sm text-slate-400">
          These numbers belong to the employee selected from search or the Employee Directory.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {summary.map((item) => (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4" key={item.label}>
              <p className="text-sm font-medium text-slate-400">{item.label}</p>
              <p className="mt-2 text-2xl font-semibold text-white">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-cyan-100">Today&apos;s Productivity</p>
              <p className="mt-1 text-3xl font-semibold text-white">
                {productivityValue}%
              </p>
            </div>
            <div className="h-3 w-full rounded-full bg-white/10 sm:w-64">
              <div className="h-3 rounded-full bg-linear-to-r from-cyan-300 to-indigo-300" style={{ width: `${productivityValue ?? 0}%` }} />
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="My Notifications">
        <div className="space-y-3">
          {notificationRows.slice(0, 3).map((item) => (
            <div className="rounded-2xl border border-white/10 bg-white/4 p-4" key={item.title}>
              <p className="text-xs font-semibold uppercase text-cyan-200">{item.category}</p>
              <p className="mt-2 font-medium text-white">{item.title}</p>
              <p className="mt-1 text-xs text-slate-400">{item.time}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function AttendanceView({
  records = [],
  rows = [],
}: {
  records?: ApiAttendanceRecord[];
  rows?: EmployeeRow[];
}) {
  const attendanceChartData = rows.map((employee) => ({
    day: employee.name,
    attendance: employee.attendance === "Late"
      ? 70
      : employee.attendance === "Present"
        ? 100
        : employee.attendance === "Half Day"
          ? 50
          : employee.attendance === "Absent"
            ? 20
            : 0,
  }));

  const exceptionRows = rows.filter((employee) => employee.attendance !== "Present");
  const recordByEmployeeCode = new Map(records.map((record) => [record.user.employeeCode, record]));

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
      <SectionCard title="Team Attendance Overview">
        <p className="mb-4 text-sm text-slate-400">
          This chart uses today&apos;s employee attendance state from the dashboard API.
        </p>
        <div className="h-80">
          <ResponsiveContainer height="100%" width="100%">
            <BarChart data={attendanceChartData}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="4 4" />
              <XAxis dataKey="day" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                contentStyle={chartTooltipStyle}
                labelStyle={chartTooltipTextStyle}
              />
              <Bar dataKey="attendance" fill="#34d399" name="Attendance %" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard title="Attendance Exceptions">
        <p className="mb-4 text-sm text-slate-400">
          Employees who are not marked Present today appear here.
        </p>
        <div className="space-y-3">
          {exceptionRows.length > 0 ? (
            exceptionRows.map((employee) => {
              const record = employee.employeeCode ? recordByEmployeeCode.get(employee.employeeCode) : undefined;

              return (
              <div className="rounded-2xl border border-white/10 bg-white/4 p-4" key={`${employee.employeeCode || employee.name}-${employee.attendance}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-white">{employee.name}</p>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusStyle(employee.attendance)}`}>
                    {employee.attendance}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-400">
                  {record?.user.department?.name || employee.department || "Unassigned"}
                </p>
              </div>
              );
            })
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/4 p-4 text-center text-sm text-slate-400">
              All employees are present today.
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

function ActivityView({
  chartData = [],
  rows = [],
}: {
  chartData?: Array<{ hour: string; keyboard: number; mouse: number }>;
  rows?: EmployeeRow[];
}) {
  const activeSessions = rows.filter((employee) => employee.status === "Active").length;
  const idleMinutes = rows.reduce((sum, employee) => sum + minutesFromLabel(employee.idleTime), 0);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
      <SectionCard title="Recorded Activity Signals">
        <p className="mb-4 text-sm text-slate-400">
          This chart uses each employee&apos;s tracked productive and idle minutes.
        </p>
        <div className="h-80">
          <ResponsiveContainer height="100%" width="100%">
            <LineChart data={chartData}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="4 4" />
              <XAxis dataKey="hour" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                contentStyle={chartTooltipStyle}
                labelStyle={chartTooltipTextStyle}
              />
              <Line dataKey="keyboard" name="Productive Time" stroke="#22d3ee" strokeWidth={3} type="monotone" />
              <Line dataKey="mouse" name="Idle Time" stroke="#34d399" strokeWidth={3} type="monotone" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard title="Tracking Summary">
        <div className="grid gap-3">
          <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-cyan-100">
            <KeyboardMetric icon={<Activity size={20} />} label="Active Sessions" value={`${activeSessions}`} />
          </div>
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-emerald-100">
            <KeyboardMetric icon={<MousePointer2 size={20} />} label="Tracked Employees" value={`${rows.length}`} />
          </div>
          <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-amber-100">
            <KeyboardMetric
              icon={<Clock3 size={20} />}
              label="Average Idle Time"
              value={`${Math.round(idleMinutes / Math.max(rows.length, 1))}m`}
            />
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

function WorkflowView({ items = [] }: { items?: WorkflowItem[] }) {
  return (
    <SectionCard title="Workflow Tracking">
      <div className="grid gap-4 lg:grid-cols-2">
        {items.map((workflow) => (
          <div className="rounded-2xl border border-white/10 bg-white/4 p-5" key={workflow.title}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold text-white">{workflow.title}</h3>
                <p className="mt-1 text-sm text-slate-400">{workflow.owner}</p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                  workflow.status === "Blocked"
                    ? "bg-rose-300/10 text-rose-200 ring-rose-300/20"
                    : statusStyle(workflow.status === "In Progress" ? "Present" : "Review")
                }`}
              >
                {workflow.status}
              </span>
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-400">Completion</span>
                <span className="font-semibold text-white">{workflow.progress}%</span>
              </div>
              <div className="mt-2 h-2.5 rounded-full bg-white/10">
                <div
                  className="h-2.5 rounded-full bg-linear-to-r from-cyan-300 to-indigo-300"
                  style={{ width: `${workflow.progress}%` }}
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-slate-400">Due</span>
              <span className="font-semibold text-slate-200">{workflow.due}</span>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function NotificationView({
  items = [],
  leaveRequests = [],
  onLeaveDecision,
  reviewingLeaveId,
}: {
  items?: NotificationItem[];
  leaveRequests?: ApiLeaveRequest[];
  onLeaveDecision?: (id: number, status: "APPROVED" | "REJECTED") => void;
  reviewingLeaveId?: number | null;
}) {
  const pendingLeaveRequests = leaveRequests.filter((request) => request.status === "PENDING");

  return (
    <SectionCard title="Notification Center">
      {pendingLeaveRequests.length > 0 && (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          {pendingLeaveRequests.map((request) => (
            <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-5" key={request.id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase text-amber-100">Leave Request</p>
                  <h3 className="mt-1 font-semibold text-white">
                    {request.user.firstName} {request.user.lastName}
                  </h3>
                  <p className="mt-1 text-sm text-slate-300">
                    {labelFromEnum(request.type)} · {request.days} day{request.days === 1 ? "" : "s"} - {request.reason}
                  </p>
                  <p className="mt-1 text-sm text-cyan-100">
                    {request.paidDays} paid · {request.unpaidDays} unpaid
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {request.user.department?.name || "Unassigned"} · {timeAgo(request.createdAt)}
                  </p>
                </div>
                <span className="rounded-full bg-amber-300/10 px-2.5 py-1 text-xs font-semibold text-amber-100 ring-1 ring-amber-300/20">
                  Pending
                </span>
              </div>

              <div className="mt-4 flex gap-3">
                <button
                  className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-60"
                  disabled={reviewingLeaveId === request.id}
                  onClick={() => onLeaveDecision?.(request.id, "APPROVED")}
                  type="button"
                >
                  Approve
                </button>
                <button
                  className="rounded-xl bg-rose-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-rose-300 disabled:opacity-60"
                  disabled={reviewingLeaveId === request.id}
                  onClick={() => onLeaveDecision?.(request.id, "REJECTED")}
                  type="button"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {items.map((item) => {
          const Icon =
            item.tone === "success" ? CheckCircle2 : item.tone === "warning" ? Clock3 : AlertTriangle;
          const color =
            item.tone === "success"
              ? "bg-emerald-300/10 text-emerald-200 ring-1 ring-emerald-300/20"
              : item.tone === "warning"
                ? "bg-amber-300/10 text-amber-200 ring-1 ring-amber-300/20"
                : "bg-rose-300/10 text-rose-200 ring-1 ring-rose-300/20";

          return (
            <div className="flex gap-4 rounded-2xl border border-white/10 bg-white/4 p-5" key={item.id}>
              <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${color}`}>
                <Icon size={19} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-cyan-200">{item.category}</p>
                <h3 className="mt-1 font-semibold text-white">{item.title}</h3>
                <p className="mt-1 text-sm text-slate-400">{item.time}</p>
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function KeyboardMetric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span className="text-xl font-semibold">{value}</span>
    </div>
  );
}

function ReportsView({
  exporting,
  items = [],
  onExport,
}: {
  exporting: boolean;
  items?: ReportItem[];
  onExport: () => void;
}) {
  return (
    <SectionCard
      action={
        <button
          className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-50 disabled:bg-slate-600 disabled:text-slate-300"
          disabled={exporting}
          onClick={onExport}
          type="button"
        >
          <Download size={16} />
          {exporting ? "Exporting" : "Export"}
        </button>
      }
      title="Reports"
    >
      <div className="grid gap-4 md:grid-cols-3">
        {items.map((report) => (
          <div className="rounded-2xl border border-white/10 bg-white/4 p-4" key={report.title}>
            <div className="flex size-10 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-100">
              <FileText size={20} />
            </div>
            <h3 className="mt-4 font-semibold text-white">{report.title}</h3>
            <p className="mt-2 text-sm text-slate-400">{report.owner} - {report.date}</p>
            <span className={`mt-4 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusStyle(report.status)}`}>
              {report.status}
            </span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function SettingsView({ policies = [] }: { policies?: PolicyItem[] }) {
  const settings = [
    "Role-based admin access",
    "Daily reports scheduled at 6:00 PM",
    "Audit logging for admin actions",
    "Secure token-based sessions",
  ];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(320px,1.1fr)]">
      <SectionCard title="System Settings">
        <div className="grid gap-4">
          {settings.map((setting) => (
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/4 p-4" key={setting}>
              <span className="font-medium text-slate-200">{setting}</span>
              <span className="rounded-full bg-emerald-300/10 px-2.5 py-1 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-300/20">
                Enabled
              </span>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Policy Controls">
        <div className="space-y-5">
          {policies.map((policy) => (
            <div key={policy.label}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-slate-300">{policy.label}</span>
                <span className="font-semibold text-white">{policy.value}</span>
              </div>
              <div className="mt-2 h-2.5 rounded-full bg-white/10">
                <div className="h-2.5 rounded-full bg-linear-to-r from-cyan-300 to-indigo-300" style={{ width: policy.width }} />
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
