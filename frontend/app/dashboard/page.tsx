"use client";

import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Gauge,
  Image,
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
  XCircle,
} from "lucide-react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useEffect, useMemo, useState } from "react";
import {
  allowProtectedNavigation,
  apiRequest,
  canOpenProtectedRoute,
  clearAuth,
  downloadApiFile,
  getStoredSessionId,
  getStoredUser,
  isEmployeeAccount,
} from "@/lib/api";
import type { StoredUser } from "@/lib/api";
import { SessionUsageTables } from "./session-usage-tables";
import type { SessionUsageRow } from "./session-usage-tables";

const navItems = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "employees", label: "Employees", icon: Users },
  { id: "attendance", label: "Attendance", icon: CalendarCheck },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "workflow", label: "Workflows", icon: ListChecks },
  { id: "screenshots", label: "Screenshots", icon: Image },
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
  logoutTime?: string;
  workedMinutes?: number;
};

type WorkflowItem = {
  id: number;
  title: string;
  employeeCode: string;
  owner: string;
  department: string;
  status: string;
  priority: string;
  estimatedHours?: number | null;
  actualHours?: number | null;
  assignedToId?: number | null;
  due: string;
  completedAt: string;
  updatedAt: string;
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

const DEFAULT_BREAK_ALLOWANCE_MINUTES = 45;
const HALF_DAY_WORK_MINUTES = 4 * 60;

type WorkdayStats = {
  date?: string;
  sessionId?: number | null;
  loginTime: string | null;
  activeMinutes: number;
  idleMinutes: number;
  productiveMinutes: number;
  productivity: number;
  attendance?: string;
  isFinalized: boolean;
};

type AppUsageRow = {
  appName: string;
  windowTitle: string;
  category: string;
  durationSeconds: number;
  firstSeenAt: string;
  lastSeenAt: string;
};

type EmployeeReportSummary = {
  attendanceDays: number;
  presentDays: number;
  lateDays: number;
  halfDays: number;
  totalLoginMinutes: number;
  totalActiveMinutes: number;
  totalProductiveMinutes: number;
  totalIdleMinutes: number;
  totalBreakMinutes: number;
  averageProductivity: number;
  workflowCount: number;
  completedWorkflows: number;
};

type EmployeeScreenshot = {
  id: number;
  imageDataUrl: string;
  capturedAt: string;
  isIdle: boolean;
  appName?: string | null;
  windowTitle?: string | null;
  user: {
    id: number;
    employeeCode: string;
    firstName: string;
    lastName: string;
    department?: { name: string } | null;
  };
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
    logoutAt?: string | null;
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
  id: number;
  title: string;
  status: string;
  priority: string;
  dueDate?: string | null;
  completedAt?: string | null;
  updatedAt: string;
  estimatedHours?: number | null;
  actualHours?: number | null;
  assignedTo?: { id: number; employeeCode: string; firstName: string; lastName: string } | null;
  department?: { name: string } | null;
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

type ApiPolicy = {
  allowedIdleMinutes: number;
  breakAllowanceMinutes: number;
  graceMinutes: number;
  minimumWorkHours: number;
};

type ApiAttendanceRecord = {
  status: string;
  loginAt?: string | null;
  logoutAt?: string | null;
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
  generatedFor?: {
    employeeCode: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  } | null;
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

type ApiAllTimeReportSummary = {
  firstLoginAt?: string | null;
  attendanceRecords: number;
  productivityRecords: number;
  averageProductivity: number;
  workflows: number;
  completedWorkflows: number;
  workflowStatusGroups: number;
};

function formatMinutes(minutes = 0) {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;

  if (hours <= 0) {
    return `${remaining}m`;
  }

  return `${hours}h ${remaining}m`;
}

function formatSeconds(seconds = 0) {
  if (seconds < 60) {
    return `${Math.max(0, Math.round(seconds))}s`;
  }

  return formatMinutes(Math.round(seconds / 60));
}

function minutesFromLabel(value?: string) {
  if (!value) {
    return 0;
  }

  const hours = value.match(/(\d+)h/)?.[1];
  const minutes = value.match(/(\d+)m/)?.[1];

  return (hours ? Number(hours) * 60 : 0) + (minutes ? Number(minutes) : 0);
}

function minutesBetween(start: string | Date, end: string | Date) {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
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

function formatFullDateTime(value?: string | null) {
  if (!value) {
    return "--";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
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

function formatMonthLabel(value = new Date()) {
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
  }).format(value);
}

function formatDateParam(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDateInputDisplay(value: string) {
  const [year, month, day] = value.split("-");

  if (!year || !month || !day) {
    return "--";
  }

  return `${day}-${month}-${year}`;
}

function formatMonthParam(value = new Date()) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
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

function productiveMinutesWithBreakAllowance(
  loginMinutes: number,
  idleMinutes: number,
  breakMinutes: number,
  breakAllowanceMinutes = DEFAULT_BREAK_ALLOWANCE_MINUTES,
) {
  const excessBreakMinutes = Math.max(0, breakMinutes - breakAllowanceMinutes);
  return Math.max(0, loginMinutes - idleMinutes - excessBreakMinutes);
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
  const liveProductiveMinutes = productiveMinutesWithBreakAllowance(liveLoginMinutes, idleMinutes, breakMinutes);
  const productivityValue = isActiveSession
    ? productivityPercent(liveProductiveMinutes, liveLoginMinutes)
    : Math.round(productivity?.productivityPercent ?? 0);
  const productiveMinutes = isActiveSession ? liveProductiveMinutes : productivity?.productiveMinutes ?? session?.productiveMinutes ?? 0;
  const workedMinutes = session?.logoutAt ? minutesBetween(session.loginAt, session.logoutAt) : liveLoginMinutes;
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
    logoutTime: session?.logoutAt ? formatDateTime(session.logoutAt) : "--",
    workedMinutes,
    activeTime: formatMinutes(session?.activeMinutes ?? productiveMinutes),
    idleTime: formatMinutes(idleMinutes),
    productiveTime: formatMinutes(productiveMinutes),
  };
}

function mapWorkflow(workflow: ApiWorkflow): WorkflowItem {
  return {
    id: workflow.id,
    title: workflow.title,
    employeeCode: workflow.assignedTo?.employeeCode || "",
    owner: workflow.assignedTo
      ? `${workflow.assignedTo.firstName} ${workflow.assignedTo.lastName}`
      : "Unassigned",
    department: workflow.department?.name || "Unassigned",
    status: labelFromEnum(workflow.status),
    priority: labelFromEnum(workflow.priority),
    estimatedHours: workflow.estimatedHours,
    actualHours: workflow.actualHours,
    assignedToId: workflow.assignedTo?.id ?? null,
    due: formatDate(workflow.dueDate),
    completedAt: formatDate(workflow.completedAt),
    updatedAt: formatDate(workflow.updatedAt),
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

const barChartMargin = { top: 24, right: 24, bottom: 0, left: 12 };
const barXAxisPadding = { left: 32, right: 32 };

function formatPercentValue(value: unknown) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return `${value}%`;
  }

  return `${Math.round(numericValue)}%`;
}

function AttendanceMark({ checked }: { checked: boolean }) {
  return (
    <span className="inline-flex w-full justify-center">
      {checked ? (
        <CheckCircle2 className="text-emerald-300" size={18} />
      ) : (
        <XCircle className="text-rose-300" size={18} />
      )}
    </span>
  );
}

function AttendanceMarkWithDetail({
  checked,
  detail,
  subDetail,
  showMark = true,
}: {
  checked: boolean;
  detail?: string;
  subDetail?: string;
  showMark?: boolean;
}) {
  return (
    <div className="flex min-w-24 flex-col items-center gap-1 text-center">
      {showMark && <AttendanceMark checked={checked} />}
      {checked && detail && (
        <span className="text-xs font-semibold text-slate-200">{detail}</span>
      )}
      {checked && subDetail && (
        <span className="text-[11px] font-medium text-slate-400">{subDetail}</span>
      )}
    </div>
  );
}

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
  const [sessionUsageRows, setSessionUsageRows] = useState<SessionUsageRow[]>([]);
  const [currentLoginAppUsageRows, setCurrentLoginAppUsageRows] = useState<SessionUsageRow[]>([]);
  const [workflowItems, setWorkflowItems] = useState<WorkflowItem[]>([]);
  const [notificationItems, setNotificationItems] = useState<NotificationItem[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<ApiLeaveRequest[]>([]);
  const [reviewingLeaveId, setReviewingLeaveId] = useState<number | null>(null);
  const [, setLiveEmployees] = useState<ApiLiveEmployee[]>([]);
  const [reportCards, setReportCards] = useState<ReportItem[]>([]);
  const [policyItems, setPolicyItems] = useState<PolicyItem[]>([]);
  const [systemSettings, setSystemSettings] = useState<Record<string, boolean>>({
    "Role-based admin access": true,
    "Daily reports scheduled at 6:00 PM": true,
    "Audit logging for admin actions": true,
    "Secure token-based sessions": true,
  });
  const [attendanceRecords, setAttendanceRecords] = useState<ApiAttendanceRecord[]>([]);
  const [departmentChartData, setDepartmentChartData] = useState<Array<{ name: string; value: number; color: string }>>([]);
  const [productivityChartData, setProductivityChartData] = useState<Array<{ day: string; productivity: number; attendance: number; tasks: number }>>([]);
  const [activityChartData, setActivityChartData] = useState<Array<{ hour: string; keyboard: number; mouse: number }>>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRow | null>(null);
  const [selectedWorkdayDate, setSelectedWorkdayDate] = useState(formatDateParam());
  const [reportDate, setReportDate] = useState("");
  const [attendanceDate, setAttendanceDate] = useState(formatDateParam());
  const [activityDate, setActivityDate] = useState(formatDateParam());
  const [screenshotDate, setScreenshotDate] = useState("");
  const [isReportCalendarOpen, setIsReportCalendarOpen] = useState(false);
  const effectiveAttendanceDate = attendanceDate || formatDateParam();

const [workdayStats, setWorkdayStats] = useState<WorkdayStats | null>(null);
const [appUsageRows, setAppUsageRows] = useState<AppUsageRow[]>([]);

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
  const headerDateTab = ["reports", "attendance", "activity", "screenshots"].includes(activeTab) ? activeTab : "";
  const headerDateValue =
    headerDateTab === "reports"
      ? reportDate
      : headerDateTab === "attendance"
        ? effectiveAttendanceDate
        : headerDateTab === "screenshots"
          ? screenshotDate
          : activityDate;
  const headerDateTitle =
    headerDateTab === "reports"
      ? "Select report date"
      : headerDateTab === "attendance"
        ? "Select attendance date"
        : headerDateTab === "screenshots"
          ? "Select screenshot date"
          : "Select activity date";

  function setHeaderDate(value: string) {
    if (headerDateTab === "reports") {
      setReportDate(value);
      return;
    }

    if (headerDateTab === "attendance") {
      setAttendanceDate(value || formatDateParam());
      return;
    }

    if (headerDateTab === "activity") {
      setActivityDate(value || formatDateParam());
      return;
    }

    if (headerDateTab === "screenshots") {
      setScreenshotDate(value);
    }
  }

  useEffect(() => {
    let isCurrent = true;

    const fetchWorkdayStats = async () => {
      if (!selectedEmployee) {
        setWorkdayStats(null);
        setAppUsageRows([]);
        return;
      }

      try {
        const dateQuery = encodeURIComponent(selectedWorkdayDate);
        const [workdayData, appUsageData] = await Promise.all([
          apiRequest<WorkdayStats>(`/api/employees/${selectedEmployee.id}/workday-stats?date=${dateQuery}`),
          apiRequest<{ usage: AppUsageRow[] }>(`/api/employees/${selectedEmployee.id}/app-usage?date=${dateQuery}`),
        ]);

        if (isCurrent) {
          setWorkdayStats(workdayData);
          setAppUsageRows(appUsageData.usage || []);
        }
      } catch (error) {
        console.error("Workday stats error:", error);
        if (isCurrent) {
          setWorkdayStats(null);
          setAppUsageRows([]);
        }
      }
    };

    fetchWorkdayStats();

    return () => {
      isCurrent = false;
    };
  }, [selectedEmployee, selectedWorkdayDate]);

  useEffect(() => {
    let isCurrent = true;
    const storedUser = getStoredUser();

    if (!canOpenProtectedRoute("/dashboard")) {
      clearAuth();
      router.replace("/login");
      return;
    }

    if (isEmployeeAccount(storedUser)) {
      allowProtectedNavigation("/employee");
      router.replace("/employee");
      return;
    }

    async function loadDashboardData() {
      try {
        const meResponse = await apiRequest<{ user: StoredUser }>("/api/auth/me");

        if (isEmployeeAccount(meResponse.user)) {
          allowProtectedNavigation("/employee");
          router.replace("/employee");
          return;
        }

        const [
          employeesResponse,
          workflowsResponse,
          notificationsResponse,
          leaveRequestsResponse,
          liveResponse,
          policiesResponse,
          dashboardStatsResponse,
          reportResponse,
          sessionUsageResponse,
          currentLoginAppUsageResponse,
          attendanceResponse,
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
          apiRequest<{ rows: SessionUsageRow[] }>(`/api/admin/session-usage?since=${encodeURIComponent(activityDate)}&limit=200`),
          apiRequest<{ rows: SessionUsageRow[] }>("/api/admin/session-usage?todayActiveOnly=true&limit=200"),
          apiRequest<{ records: ApiAttendanceRecord[] }>(`/api/attendance?date=${encodeURIComponent(effectiveAttendanceDate)}&all=true`),
        ]);
        const allTimeReportResponse = await apiRequest<ApiAllTimeReportSummary>(
          "/api/reports/all-time-summary",
        ).catch(() => ({
          firstLoginAt: null,
          attendanceRecords: reportResponse.attendance.length,
          productivityRecords: reportResponse.productivity.length,
          averageProductivity: dashboardStatsResponse.avgProductivity,
          workflows: workflowsResponse.workflows.length,
          completedWorkflows: workflowsResponse.workflows.filter((workflow) => workflow.status === "COMPLETED").length,
          workflowStatusGroups: reportResponse.workflowCounts.length,
        }));

        if (!isCurrent) {
          return;
        }

        setCurrentUser(meResponse.user || storedUser);
        const mappedEmployees = employeesResponse.employees.map(mapEmployee);
        const mappedWorkflows = workflowsResponse.workflows.map(mapWorkflow);
        const mappedNotifications = adminNotificationsOnly(
          notificationsResponse.notifications.map(mapNotification),
        );
        const colors = ["#2563eb", "#16a34a", "#f59e0b", "#7c3aed", "#dc2626"];

        setEmployeeRows(mappedEmployees);
        setSelectedEmployee((current) =>
          current
            ? mappedEmployees.find((employee) => employee.id === current.id) ?? current
            : mappedEmployees[0] ?? null,
        );
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
        setAttendanceRecords(attendanceResponse.records || reportResponse.attendance);
        setWorkflowItems(mappedWorkflows);
        setNotificationItems(mappedNotifications);
        setSessionUsageRows(sessionUsageResponse.rows || []);
        setCurrentLoginAppUsageRows(currentLoginAppUsageResponse.rows || []);
        setLeaveRequests(leaveRequestsResponse.requests);
        setLiveEmployees(liveResponse.employees);

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

        const allTimeReportDate = allTimeReportResponse.firstLoginAt
          ? `${formatDate(allTimeReportResponse.firstLoginAt)} to now`
          : "First login to now";
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
            title: "Productivity History",
            owner: `${allTimeReportResponse.productivityRecords} records - Avg ${allTimeReportResponse.averageProductivity}%`,
            status: allTimeReportResponse.productivityRecords > 0 ? "Updated" : "Pending",
            date: allTimeReportDate,
          },
          {
            title: "Attendance Record",
            owner: `${allTimeReportResponse.attendanceRecords} records`,
            status: allTimeReportResponse.attendanceRecords > 0 ? "Updated" : "Pending",
            date: allTimeReportDate,
          },
          {
            title: "Workflow Efficiency Report",
            owner: `${allTimeReportResponse.completedWorkflows}/${allTimeReportResponse.workflows} completed - ${allTimeReportResponse.workflowStatusGroups} status groups`,
            status: allTimeReportResponse.workflows > 0 ? "Updated" : "Pending",
            date: allTimeReportDate,
          },
        ]);
        setIsAuthorized(true);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Backend connection failed";
        const lowerMessage = message.toLowerCase();

        if (
          message.startsWith("401:") ||
          message.startsWith("403:") ||
          lowerMessage.includes("token") ||
          lowerMessage.includes("auth")
        ) {
          clearAuth();
          router.replace("/login");
          return;
        }

        console.error("Dashboard data load failed:", error);
        setCurrentUser(storedUser);
        setIsAuthorized(true);
      }
    }

    loadDashboardData();
    const refreshInterval = window.setInterval(loadDashboardData, 10000);

    return () => {
      isCurrent = false;
      window.clearInterval(refreshInterval);
    };
  }, [activityDate, effectiveAttendanceDate, router]);

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
    setSearchQuery("");
    setSelectedWorkdayDate(formatDateParam());
  }

  function openTab(tabId: string) {
    setActiveTab(tabId);
    setSearchQuery("");
    setIsReportCalendarOpen(false);

    if (tabId === "employees") {
      setSelectedEmployee(null);
      setSelectedWorkdayDate(formatDateParam());
    }
  }

  function handleSearchSubmit() {
    if (activeTab === "reports") {
      return;
    }

    const match = filteredEmployees[0];

    if (match) {
      selectEmployee(match);
    }
  }

  async function handleExportReport(path = "/api/reports/export", fileName = "all-employee-work-report.csv") {
    setIsExporting(true);

    try {
      await downloadApiFile(path, fileName);
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
    return null;
  }

  return (
    <main className="relative h-screen overflow-hidden bg-[#030712] text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(34,211,238,0.14),transparent_30%),radial-gradient(circle_at_86%_6%,rgba(99,102,241,0.14),transparent_28%),linear-gradient(180deg,#030712,#07111f_48%,#020617)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.06] bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] bg-size-[72px_72px]" />
      <div className="relative z-10 flex h-screen">
        <aside className={`${
  sidebarOpen ? "w-72" : "w-20"
} sticky top-0 hidden h-screen shrink-0 border-r border-white/10 bg-white/5 px-5 py-6 shadow-2xl shadow-black/20 backdrop-blur-2xl transition-all duration-300 md:block`} >
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
                  onClick={() => openTab(item.id)}
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
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                {headerDateTab && (
                  <div className="relative">
                    <button
                      aria-label={headerDateTitle}
                      className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/6 text-cyan-100 hover:bg-white/10"
                      onClick={() => setIsReportCalendarOpen((open) => !open)}
                      type="button"
                    >
                      <CalendarDays size={18} />
                    </button>
                    {isReportCalendarOpen && (
                      <div className="absolute left-0 z-30 mt-3 w-64 rounded-2xl border border-white/10 bg-slate-950 p-4 shadow-2xl shadow-black/40">
                        <label>
                          <input
                            className="h-10 w-full rounded-xl border border-white/10 bg-slate-900 px-3 text-sm text-white [color-scheme:dark]"
                            onChange={(event) => setHeaderDate(event.target.value)}
                            type="date"
                            value={headerDateValue}
                          />
                        </label>
                        <button
                          className="mt-3 w-full rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-300/15"
                          onClick={() => {
                            setHeaderDate(headerDateTab === "reports" || headerDateTab === "screenshots" ? "" : formatDateParam());
                            setIsReportCalendarOpen(false);
                          }}
                          type="button"
                        >
                          {headerDateTab === "reports" || headerDateTab === "screenshots" ? "Clear" : "Today"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
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
                    placeholder="Search employee name, ID, or department"
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
                  onClick={() => openTab("notifications")}
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

            <div className="mt-4 flex gap-2 overflow-x-auto md:hidden">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium ${
                    activeTab === item.id
                      ? "bg-cyan-300/10 text-cyan-100 ring-1 ring-cyan-300/20"
                      : "bg-white/6 text-slate-300"
                  }`}
                  onClick={() => openTab(item.id)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </header>

          <div className="space-y-6 p-4 md:p-8">
            {activeTab === "overview" && (
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
            )}

            {activeTab === "overview" && (
              <>
                <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
                  <SectionCard title="Employee Productivity Intelligence">
                    <div className="h-80">
                      <ResponsiveContainer height="100%" width="100%">
                        <BarChart data={productivityChartData} margin={barChartMargin}>
                          <CartesianGrid stroke="#1e293b" strokeDasharray="4 4" />
                          <XAxis dataKey="day" padding={barXAxisPadding} stroke="#94a3b8" />
                          <YAxis stroke="#94a3b8" tickFormatter={formatPercentValue} />
                          <Tooltip
                            contentStyle={chartTooltipStyle}
                            formatter={(value, name) => [formatPercentValue(value), name]}
                            labelStyle={chartTooltipTextStyle}
                          />
                          <Bar
                            dataKey="productivity"
                            fill="#22d3ee"
                            name="Productivity"
                            radius={[6, 6, 0, 0]}
                          >
                            <LabelList
                              className="fill-slate-200 text-xs font-semibold"
                              formatter={formatPercentValue}
                              position="top"
                            />
                          </Bar>
                          <Bar
                            dataKey="attendance"
                            fill="#34d399"
                            name="Attendance"
                            radius={[6, 6, 0, 0]}
                          >
                            <LabelList
                              className="fill-slate-200 text-xs font-semibold"
                              formatter={formatPercentValue}
                              position="top"
                            />
                          </Bar>
                        </BarChart>
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

                <SessionUsageTables
                  appWebsiteRows={currentLoginAppUsageRows}
                  rows={sessionUsageRows}
                />
              </>
            )}

            {activeTab === "employees" && (
              <EmployeeTable onSelect={selectEmployee} rows={filteredEmployees} selectedName={selectedEmployee?.name} />
            )}
            {activeTab === "employee" && (
             <EmployeeSelfDashboard
              employee={selectedEmployee}
              appUsageRows={appUsageRows}
              leaveRequests={leaveRequests}
              notifications={notificationItems.filter((item) => item.userId == null || item.userId === selectedEmployee?.id)}
              onSelectDate={setSelectedWorkdayDate}
              selectedDate={selectedWorkdayDate}
              workdayStats={workdayStats}
            />
            )}
            {activeTab === "attendance" && (
              <AttendanceView
                chartRows={employeeRows}
                records={attendanceRecords}
                searchQuery={searchQuery}
                selectedDate={effectiveAttendanceDate}
                tableRows={filteredEmployees}
              />
            )}
            {activeTab === "activity" && (
              <ActivityView
                chartData={activityChartData}
                currentLoginAppUsageRows={currentLoginAppUsageRows}
                rows={employeeRows}
                searchQuery={searchQuery}
                selectedDate={activityDate}
                sessionUsageRows={sessionUsageRows}
              />
            )}
            {activeTab === "workflow" && <WorkflowView currentUser={currentUser} items={workflowItems} />}
            {activeTab === "screenshots" && (
              <ScreenshotsView
                onSelectedDateChange={setScreenshotDate}
                rows={employeeRows}
                selectedDate={screenshotDate}
              />
            )}
            {activeTab === "notifications" && (
              <NotificationView
                items={notificationItems}
                leaveRequests={leaveRequests}
                onLeaveDecision={handleLeaveDecision}
                reviewingLeaveId={reviewingLeaveId}
              />
            )}
            {activeTab === "reports" && (
              <div className="space-y-6">
                <ReportsView currentUser={currentUser} exporting={isExporting} items={reportCards} onExport={handleExportReport} />
                <EmployeeDepartmentReports
                  employees={employeeRows}
                  exporting={isExporting}
                  onExport={handleExportReport}
                  reportDate={reportDate}
                  searchQuery={searchQuery}
                  workflows={workflowItems}
                />
              </div>
            )}
            {activeTab === "settings" && (
              <SettingsView
                onToggleSetting={(setting) =>
                  setSystemSettings((items) => ({ ...items, [setting]: !items[setting] }))
                }
                policies={policyItems}
                settings={systemSettings}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function EmployeeTable({
  onSelect,
  rows = [],
  selectedName,
}: {
  onSelect?: (employee: EmployeeRow) => void;
  rows?: EmployeeRow[];
  selectedName?: string;
}) {
  const pageSize = 5;
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const visibleRows = rows.slice(0, visibleCount);
  const hasMoreRows = visibleCount < rows.length;

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [rows]);

  return (
    <SectionCard title="Employee Directory">
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
              <th className="py-3 pl-4">Focus Time</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((employee) => (
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
                <td className="py-4 pl-4 text-slate-300">{employee.focus}</td>
              </tr>
            ))}
            {visibleRows.length === 0 && (
              <tr>
                <td className="py-8 text-center text-sm text-slate-400" colSpan={6}>
                  No employee found for this search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {hasMoreRows && (
        <div className="mt-5 flex justify-center">
          <button
            className="rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/15"
            onClick={() => setVisibleCount((count) => Math.min(count + pageSize, rows.length))}
            type="button"
          >
            See more
          </button>
        </div>
      )}
    </SectionCard>
  );
}

function EmployeeSelfDashboard({
  employee,
  appUsageRows = [],
  leaveRequests = [],
  notifications: notificationRows = [],
  onSelectDate,
  selectedDate,
  workdayStats,
}: {
  employee?: EmployeeRow | null;
  appUsageRows?: AppUsageRow[];
  leaveRequests?: ApiLeaveRequest[];
  notifications?: NotificationItem[];
  onSelectDate?: (date: string) => void;
  selectedDate: string;
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
    label: "Active Now",
    value: employee.status === "Active" ? "Active" : "Offline",
  },

  {
    label: "Attendance",
    value: workdayStats?.attendance ? labelFromEnum(workdayStats.attendance) : employee.attendance,
  },

  {
    label: "Productivity",
    value: `${productivityValue}%`,
  },

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
const selectedDay = new Date(`${selectedDate}T00:00:00`);
const today = new Date();
const monthStart = new Date(selectedDay.getFullYear(), selectedDay.getMonth(), 1);
const monthEnd = new Date(selectedDay.getFullYear(), selectedDay.getMonth() + 1, 0);
const firstCalendarDay = monthStart.getDay();
const monthDays = monthEnd.getDate();
const calendarCells = [
  ...Array.from({ length: firstCalendarDay }, (_, index) => ({ key: `blank-${index}`, day: null })),
  ...Array.from({ length: monthDays }, (_, index) => ({ key: `day-${index + 1}`, day: index + 1 })),
];
const currentMonthApprovedLeaves = leaveRequests.filter((request) => {
  if (request.user.id !== employee.id || request.status !== "APPROVED") {
    return false;
  }

  const createdAt = new Date(request.createdAt);
  return createdAt.getFullYear() === selectedDay.getFullYear() && createdAt.getMonth() === selectedDay.getMonth();
});
const paidLeaveDays = currentMonthApprovedLeaves.reduce((total, request) => total + request.paidDays, 0);
const unpaidLeaveDays = currentMonthApprovedLeaves.reduce((total, request) => total + request.unpaidDays, 0);
const totalLeaveDays = paidLeaveDays + unpaidLeaveDays;
const selectedDateLabel = formatDate(selectedDate);
const selectedMonth = formatMonthParam(selectedDay);

function selectMonth(monthValue: string) {
  if (!monthValue) {
    return;
  }

  onSelectDate?.(`${monthValue}-01`);
}

function shiftMonth(offset: number) {
  const nextMonth = new Date(selectedDay.getFullYear(), selectedDay.getMonth() + offset, 1);
  onSelectDate?.(formatDateParam(nextMonth));
}

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
      <SectionCard title={`${employee.name} - Workday Details`}>
        <p className="mb-4 text-sm text-slate-400">
          Showing workday details for {selectedDateLabel}.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
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

      <SectionCard title="Calendar">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">{formatMonthLabel(selectedDay)}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                aria-label="Previous month"
                className="flex size-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                onClick={() => shiftMonth(-1)}
                type="button"
              >
                <ChevronLeft size={17} />
              </button>
              <input
                aria-label="Select month"
                className="h-9 rounded-xl border border-white/10 bg-white/5 px-2 text-sm text-slate-100 outline-none [color-scheme:dark]"
                onChange={(event) => selectMonth(event.target.value)}
                type="month"
                value={selectedMonth}
              />
              <button
                aria-label="Next month"
                className="flex size-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                onClick={() => shiftMonth(1)}
                type="button"
              >
                <ChevronRight size={17} />
              </button>
              <button
                aria-label="Today"
                className="flex size-9 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/15"
                onClick={() => onSelectDate?.(formatDateParam())}
                type="button"
              >
                <CalendarCheck size={17} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
              <span className="py-1 font-semibold text-slate-500" key={`${day}-${index}`}>
                {day}
              </span>
            ))}
            {calendarCells.map((cell) => {
              const cellDate = cell.day
                ? formatDateParam(new Date(selectedDay.getFullYear(), selectedDay.getMonth(), cell.day))
                : "";
              const isToday =
                cell.day === today.getDate() &&
                selectedDay.getMonth() === today.getMonth() &&
                selectedDay.getFullYear() === today.getFullYear();
              const isSelected = cellDate === selectedDate;

              return (
                <button
                  className={`flex aspect-square items-center justify-center rounded-lg text-xs transition ${
                    isSelected
                      ? "bg-cyan-300 text-slate-950 font-semibold"
                      : isToday
                        ? "bg-cyan-300/15 text-cyan-100 ring-1 ring-cyan-300/25"
                      : cell.day
                        ? "bg-white/5 text-slate-300 hover:bg-white/10"
                        : "bg-transparent"
                  }`}
                  disabled={!cell.day}
                  key={cell.key}
                  onClick={() => cellDate && onSelectDate?.(cellDate)}
                  type="button"
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase text-slate-400">Total Leaves</p>
            <p className="mt-2 text-2xl font-semibold text-white">{totalLeaveDays}</p>
          </div>
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4">
            <p className="text-xs font-semibold uppercase text-emerald-100">Paid</p>
            <p className="mt-2 text-2xl font-semibold text-white">{paidLeaveDays}</p>
          </div>
          <div className="rounded-2xl border border-rose-300/20 bg-rose-300/10 p-4">
            <p className="text-xs font-semibold uppercase text-rose-100">Nonpaid</p>
            <p className="mt-2 text-2xl font-semibold text-white">{unpaidLeaveDays}</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="App & Website Usage">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr className="border-b border-white/10">
                <th className="px-3 py-3 font-semibold">Activity / App / Website</th>
                <th className="px-3 py-3 font-semibold">Window</th>
                <th className="px-3 py-3 font-semibold">Type</th>
                <th className="px-3 py-3 font-semibold">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {appUsageRows.length > 0 ? (
                appUsageRows.map((item) => (
                  <tr key={`${item.appName}-${item.windowTitle}-${item.category}`}>
                    <td className="max-w-[180px] px-3 py-3 font-medium text-white">
                      <span className="block truncate">{item.appName}</span>
                    </td>
                    <td className="max-w-[260px] px-3 py-3 text-slate-300">
                      <span className="block truncate">{item.windowTitle}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                          item.category === "UNPRODUCTIVE"
                            ? "bg-rose-300/10 text-rose-200 ring-rose-300/20"
                            : item.category === "NETWORK"
                              ? "bg-violet-300/10 text-violet-200 ring-violet-300/20"
                            : "bg-emerald-300/10 text-emerald-200 ring-emerald-300/20"
                        }`}
                      >
                        {labelFromEnum(item.category)}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-semibold text-cyan-100">
                      {formatSeconds(item.durationSeconds)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-400" colSpan={4}>
                    No app or website usage recorded for this session.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="My Notifications">
        <div className="space-y-3">
          {notificationRows.slice(0, 3).map((item) => (
            <div className="rounded-2xl border border-white/10 bg-white/4 p-4" key={item.id}>
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
  chartRows = [],
  records = [],
  searchQuery = "",
  selectedDate,
  tableRows = [],
}: {
  chartRows?: EmployeeRow[];
  records?: ApiAttendanceRecord[];
  searchQuery?: string;
  selectedDate: string;
  tableRows?: EmployeeRow[];
}) {
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const recordByEmployeeCode = new Map(records.map((record) => [record.user.employeeCode, record]));
  const employeeMatchesSearch = (employee: EmployeeRow) => {
    if (!normalizedSearch) {
      return true;
    }

    return [employee.name, employee.employeeCode, employee.department, employee.role]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedSearch));
  };
  const attendanceStatusForEmployee = (employee: EmployeeRow) => {
    const record = employee.employeeCode ? recordByEmployeeCode.get(employee.employeeCode) : undefined;
    return record?.status || "ABSENT";
  };
  const attendanceChartData = chartRows.map((employee) => {
    const status = attendanceStatusForEmployee(employee);
    const isHighlighted = employeeMatchesSearch(employee);
    const attendance = status === "LATE"
      ? 70
      : status === "PRESENT"
        ? 100
        : status === "HALF_DAY"
          ? 50
          : 0;

    return {
      day: employee.name,
      attendance: normalizedSearch && !isHighlighted ? 0 : attendance,
      isHighlighted,
    };
  });

  return (
    <div className="space-y-6">
      <SectionCard title="Team Attendance Overview">
        <p className="mb-4 text-sm text-slate-400">
          Showing attendance for {formatDateInputDisplay(selectedDate)}.
        </p>
        <div className="h-80">
          <ResponsiveContainer height="100%" width="100%">
            <BarChart data={attendanceChartData} margin={barChartMargin}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="4 4" />
              <XAxis dataKey="day" padding={barXAxisPadding} stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" tickFormatter={formatPercentValue} />
              <Tooltip
                contentStyle={chartTooltipStyle}
                formatter={(value, name) => [formatPercentValue(value), name]}
                labelStyle={chartTooltipTextStyle}
              />
              <Bar dataKey="attendance" fill="#34d399" name="Attendance %" radius={[6, 6, 0, 0]}>
                {attendanceChartData.map((item) => (
                  <Cell
                    fill={normalizedSearch ? (item.isHighlighted ? "#34d399" : "#334155") : "#34d399"}
                    key={item.day}
                  />
                ))}
                <LabelList
                  className="fill-slate-200 text-xs font-semibold"
                  formatter={formatPercentValue}
                  position="top"
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard title="Attendance Status">
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr className="border-b border-white/10">
                <th className="px-4 py-3 font-semibold">Employee</th>
                <th className="px-4 py-3 font-semibold">Login</th>
                <th className="px-4 py-3 font-semibold">Logout</th>
                <th className="px-4 py-3 text-center font-semibold">Late Login</th>
                <th className="px-4 py-3 text-center font-semibold">Half Day</th>
                <th className="px-4 py-3 text-center font-semibold">Present</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {tableRows.length > 0 ? (
                tableRows.map((employee) => {
                  const record = employee.employeeCode ? recordByEmployeeCode.get(employee.employeeCode) : undefined;
                  const status = record?.status || "ABSENT";
                  const isLateLogin = status === "LATE" || (record?.lateMinutes ?? 0) > 0;
                  const loginTime = record?.loginAt ? formatDateTime(record.loginAt) : "--";
                  const logoutTime = record?.logoutAt ? formatDateTime(record.logoutAt) : "--";
                  const hasLoggedIn = loginTime !== "--" && loginTime !== "Not started";
                  const hasLoggedOut = logoutTime !== "--" && logoutTime !== "Not started";
                  const isEarlyHalfDayLogout = hasLoggedOut && (employee.workedMinutes ?? Number.POSITIVE_INFINITY) < HALF_DAY_WORK_MINUTES;
                  const isHalfDay = status === "HALF_DAY" || isLateLogin || isEarlyHalfDayLogout;
                  const isPresent =
                    (hasLoggedIn && !hasLoggedOut) ||
                    (status === "PRESENT" && !isHalfDay);
                  const lateMinutes = record?.lateMinutes ?? 0;
                  const halfDayTime = isEarlyHalfDayLogout && hasLoggedOut ? logoutTime : loginTime;
                  const halfDayReason = isEarlyHalfDayLogout
                    ? `Logout after ${formatMinutes(employee.workedMinutes ?? 0)}`
                    : status === "HALF_DAY"
                      ? "Half day login"
                      : isLateLogin
                        ? "Late login"
                        : undefined;

                  return (
                    <tr key={`${employee.employeeCode || employee.name}-attendance-status`}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-white">{employee.name}</p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {employee.employeeCode || "No code"} | {record?.user.department?.name || employee.department || "Unassigned"}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-300">{loginTime === "Not started" ? "--" : loginTime}</td>
                      <td className="px-4 py-3 text-slate-300">{logoutTime === "Not started" ? "--" : logoutTime}</td>
                      <td className="px-4 py-3">
                        <AttendanceMarkWithDetail
                          checked
                          detail={isLateLogin && loginTime !== "Not started" ? loginTime : "--"}
                          showMark={false}
                          subDetail={lateMinutes > 0 ? `${lateMinutes}m late` : undefined}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <AttendanceMarkWithDetail
                          checked={isHalfDay}
                          detail={halfDayTime === "Not started" ? "--" : halfDayTime}
                          subDetail={halfDayReason}
                        />
                      </td>
                      <td className="px-4 py-3"><AttendanceMark checked={isPresent} /></td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-400" colSpan={6}>
                    No attendance records available yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}

function ActivityView({
  chartData = [],
  currentLoginAppUsageRows = [],
  rows = [],
  searchQuery = "",
  selectedDate,
  sessionUsageRows = [],
}: {
  chartData?: Array<{ hour: string; keyboard: number; mouse: number }>;
  currentLoginAppUsageRows?: SessionUsageRow[];
  rows?: EmployeeRow[];
  searchQuery?: string;
  selectedDate: string;
  sessionUsageRows?: SessionUsageRow[];
}) {
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const employeeMatchesSearch = (employee: Pick<EmployeeRow, "name" | "employeeCode" | "department" | "role">) => {
    if (!normalizedSearch) {
      return true;
    }

    return [employee.name, employee.employeeCode, employee.department, employee.role]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedSearch));
  };
  const sessionRowMatchesSearch = (row: SessionUsageRow) => {
    if (!normalizedSearch) {
      return true;
    }

    return [row.employeeName, row.employeeCode, row.department, row.appName, row.windowTitle]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedSearch));
  };
  const selectedSessionRows = sessionUsageRows.filter((row) => {
    const loginDate = row.loginAt ? formatDateParam(new Date(row.loginAt)) : "";
    const logoutDate = row.logoutAt ? formatDateParam(new Date(row.logoutAt)) : "";
    return loginDate === selectedDate || logoutDate === selectedDate;
  });
  const visibleSessionRows = selectedSessionRows.filter(sessionRowMatchesSearch);
  const visibleCurrentLoginAppRows = currentLoginAppUsageRows.filter(sessionRowMatchesSearch);
  const activityByUser = selectedSessionRows.reduce((map, row) => {
    const current = map.get(row.userId) || { keyboard: 0, mouse: 0 };
    current.keyboard += row.productiveMinutes || 0;
    current.mouse += row.idleMinutes || 0;
    map.set(row.userId, current);
    return map;
  }, new Map<number, { keyboard: number; mouse: number }>());
  const fallbackActivityByName = new Map(chartData.map((item) => [item.hour, item]));
  const chartRows = rows.map((employee) => {
    const activity = typeof employee.id === "number"
      ? activityByUser.get(employee.id)
      : fallbackActivityByName.get(employee.name);
    const isHighlighted = employeeMatchesSearch(employee);

    return {
      hour: employee.name,
      keyboard: normalizedSearch && !isHighlighted ? 0 : activity?.keyboard ?? 0,
      mouse: normalizedSearch && !isHighlighted ? 0 : activity?.mouse ?? 0,
      isHighlighted,
    };
  });
  const activeSessions = visibleSessionRows.filter((row) => row.sessionStatus === "ACTIVE").length;
  const trackedEmployees = new Set(visibleSessionRows.map((row) => row.userId)).size || (normalizedSearch ? 0 : rows.length);
  const idleMinutes = visibleSessionRows.reduce((sum, row) => sum + row.idleMinutes, 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <SectionCard title="Recorded Activity Signals">
          <p className="mb-4 text-sm text-slate-400">
            Showing tracked productive and idle minutes for {formatDateInputDisplay(selectedDate)}.
          </p>
          <div className="h-80">
            <ResponsiveContainer height="100%" width="100%">
              <BarChart data={chartRows} margin={barChartMargin}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="4 4" />
                <XAxis dataKey="hour" padding={barXAxisPadding} stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip
                  contentStyle={chartTooltipStyle}
                  labelStyle={chartTooltipTextStyle}
                />
                <Bar dataKey="keyboard" fill="#22d3ee" name="Productive Time" radius={[6, 6, 0, 0]}>
                  {chartRows.map((item) => (
                    <Cell
                      fill={normalizedSearch ? (item.isHighlighted ? "#22d3ee" : "#334155") : "#22d3ee"}
                      key={`${item.hour}-productive`}
                    />
                  ))}
                </Bar>
                <Bar dataKey="mouse" fill="#34d399" name="Idle Time" radius={[6, 6, 0, 0]}>
                  {chartRows.map((item) => (
                    <Cell
                      fill={normalizedSearch ? (item.isHighlighted ? "#34d399" : "#475569") : "#34d399"}
                      key={`${item.hour}-idle`}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Tracking Summary">
          <div className="grid gap-3">
            <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-cyan-100">
              <KeyboardMetric icon={<Activity size={20} />} label="Active Sessions" value={`${activeSessions}`} />
            </div>
            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-emerald-100">
              <KeyboardMetric icon={<MousePointer2 size={20} />} label="Tracked Employees" value={`${trackedEmployees}`} />
            </div>
            <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-amber-100">
              <KeyboardMetric
                icon={<Clock3 size={20} />}
                label="Average Idle Time"
                value={`${Math.round(idleMinutes / Math.max(trackedEmployees, 1))}m`}
              />
            </div>
          </div>
        </SectionCard>
      </div>

      <SessionUsageTables appWebsiteRows={visibleCurrentLoginAppRows} rows={visibleSessionRows} />
    </div>
  );
}

function ScreenshotsView({
  onSelectedDateChange,
  rows = [],
  selectedDate,
}: {
  onSelectedDateChange: (date: string) => void;
  rows?: EmployeeRow[];
  selectedDate: string;
}) {
  const [screenshots, setScreenshots] = useState<EmployeeScreenshot[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [showIdleOnly, setShowIdleOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const idleBorderLabel = "Idle > 5 min";

  useEffect(() => {
    let isCurrent = true;

    async function loadScreenshots() {
      setIsLoading(true);

      try {
        const params = new URLSearchParams({
          limit: selectedEmployeeId ? "100" : "12",
        });

        if (selectedDate) {
          params.set("date", selectedDate);
        }

        if (selectedEmployeeId) {
          params.set("userId", selectedEmployeeId);
        }

        if (showIdleOnly) {
          params.set("isIdle", "true");
          params.set("limit", "100");
        }

        const response = await apiRequest<{ screenshots: EmployeeScreenshot[] }>(`/api/screenshots?${params.toString()}`);

        if (isCurrent) {
          setScreenshots(response.screenshots);
        }
      } catch {
        if (isCurrent) {
          setScreenshots([]);
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    }

    loadScreenshots();
    const interval = window.setInterval(loadScreenshots, 60000);

    return () => {
      isCurrent = false;
      window.clearInterval(interval);
    };
  }, [selectedDate, selectedEmployeeId, showIdleOnly]);

  return (
    <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
      <SectionCard title="Screenshot Filters">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase text-slate-400">Employee</label>
            <select
              className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#111827] px-3 text-sm text-white outline-none"
              onChange={(event) => {
                setSelectedEmployeeId(event.target.value);
              }}
              value={selectedEmployeeId}
            >
              <option value="">Recent captures</option>
              {rows.map((employee) => (
                <option key={employee.id ?? employee.name} value={employee.id ?? ""}>
                  {employee.name} {employee.employeeCode ? `(${employee.employeeCode})` : ""}
                </option>
              ))}
            </select>
          </div>

          <button
            className={`flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold ${
              showIdleOnly
                ? "border-rose-300/40 bg-rose-300/15 text-rose-100"
                : "border-rose-300/20 bg-rose-300/10 text-rose-100 hover:bg-rose-300/15"
            }`}
            onClick={() => setShowIdleOnly((value) => !value)}
            type="button"
          >
            <Clock3 size={16} />
            Idle Screenshots
          </button>

          <button
            className="w-full rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-2.5 text-sm font-semibold text-cyan-100 hover:bg-cyan-300/15"
            onClick={() => {
              setSelectedEmployeeId("");
              onSelectedDateChange("");
              setShowIdleOnly(false);
            }}
            type="button"
          >
            Show Recent Captures
          </button>
        </div>
      </SectionCard>

      <SectionCard title={showIdleOnly ? "Idle Screenshots" : selectedEmployeeId ? "Employee Screenshots" : "Captured Screenshots"}>
        {isLoading ? (
          <p className="text-sm text-slate-400">Loading screenshots...</p>
        ) : screenshots.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {screenshots.map((item) => {
              const employeeName = `${item.user.firstName} ${item.user.lastName}`;

              return (
                <article
                  className={`overflow-hidden rounded-2xl border-2 bg-white/5 ${
                    item.isIdle
                      ? "border-rose-500 shadow-[0_0_0_3px_rgba(244,63,94,0.35)]"
                      : "border-white/10"
                  }`}
                  key={item.id}
                >
                  <img
                    alt={`${employeeName} screenshot captured ${formatFullDateTime(item.capturedAt)}`}
                    className="aspect-video w-full bg-slate-950 object-cover"
                    src={item.imageDataUrl}
                  />
                  <div className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{employeeName}</p>
                        <p className="text-xs text-slate-400">{item.user.employeeCode}</p>
                      </div>
                      {item.isIdle && (
                        <span className="rounded-full bg-rose-500/15 px-2.5 py-1 text-xs font-semibold text-rose-100 ring-1 ring-rose-400/40">
                          {idleBorderLabel}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-300">{formatFullDateTime(item.capturedAt)}</p>
                    {(item.appName || item.windowTitle) && (
                      <p className="line-clamp-2 text-xs text-slate-400">
                        {item.appName || "Unknown app"}{item.windowTitle ? ` - ${item.windowTitle}` : ""}
                      </p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-slate-400">
            {selectedEmployeeId
              ? "No screenshots captured for this employee on the selected date."
              : showIdleOnly
                ? "No idle screenshots have been captured yet."
              : selectedDate
                ? "No screenshots captured on the selected date."
                : "No screenshots captured yet."}
          </p>
        )}
      </SectionCard>
    </div>
  );
}

function WorkflowView({
  currentUser,
  items = [],
}: {
  currentUser?: StoredUser | null;
  items?: WorkflowItem[];
}) {
  return (
    <SectionCard title="Workflow Tracking">
      {currentUser && (
        <div className="mb-5 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-sm text-cyan-50">
          <p className="font-semibold">
            Logged in: {currentUser.firstName} {currentUser.lastName}
          </p>
          <p className="mt-1 text-cyan-100/80">
            {currentUser.employeeCode} • {currentUser.role} • {items.length} workflow{items.length === 1 ? "" : "s"}
          </p>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-240 border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-xs font-semibold uppercase text-slate-400">
              <th className="py-3 pr-4">Workflow</th>
              <th className="px-4 py-3">Employee Code</th>
              <th className="px-4 py-3">Assigned To</th>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Hours</th>
              <th className="px-4 py-3">Due Date</th>
              <th className="px-4 py-3">Completed</th>
              <th className="py-3 pl-4">Updated</th>
            </tr>
          </thead>
          <tbody>
            {items.map((workflow) => (
              <tr className="border-b border-white/5 last:border-0 hover:bg-cyan-300/5" key={workflow.id}>
                <td className="py-4 pr-4 font-semibold text-white">{workflow.title}</td>
                <td className="px-4 py-4 text-slate-300">{workflow.employeeCode || "--"}</td>
                <td className="px-4 py-4 text-slate-300">{workflow.owner}</td>
                <td className="px-4 py-4 text-slate-300">{workflow.department}</td>
                <td className="px-4 py-4">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                      workflow.status === "Blocked"
                        ? "bg-rose-300/10 text-rose-200 ring-rose-300/20"
                        : workflow.status === "Completed"
                          ? "bg-emerald-300/10 text-emerald-200 ring-emerald-300/20"
                          : workflow.status === "In Progress"
                            ? "bg-cyan-300/10 text-cyan-100 ring-cyan-300/20"
                            : "bg-amber-300/10 text-amber-200 ring-amber-300/20"
                    }`}
                  >
                    {workflow.status}
                  </span>
                </td>
                <td className="px-4 py-4 text-slate-300">{workflow.priority}</td>
                <td className="px-4 py-4 text-slate-300">
                  {workflow.actualHours ?? 0}/{workflow.estimatedHours ?? "--"}
                </td>
                <td className="px-4 py-4 text-slate-300">{workflow.due}</td>
                <td className="px-4 py-4 text-slate-300">{workflow.completedAt}</td>
                <td className="py-4 pl-4 text-slate-300">{workflow.updatedAt}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td className="py-8 text-center text-sm text-slate-400" colSpan={10}>
                  No workflows created or assigned yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
  currentUser,
  exporting,
  items = [],
  onExport,
}: {
  currentUser?: StoredUser | null;
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
      {currentUser && (
        <div className="mb-5 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-sm text-cyan-50">
          <p className="font-semibold">
            Report for: {currentUser.firstName} {currentUser.lastName}
          </p>
          <p className="mt-1 text-cyan-100/80">
            {currentUser.employeeCode} • {currentUser.role} • {currentUser.email}
          </p>
        </div>
      )}
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

function EmployeeDepartmentReports({
  employees = [],
  exporting,
  reportDate,
  searchQuery = "",
  workflows = [],
  onExport,
}: {
  employees?: EmployeeRow[];
  exporting: boolean;
  reportDate: string;
  searchQuery?: string;
  workflows?: WorkflowItem[];
  onExport: (path?: string, fileName?: string) => void;
}) {
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const departments = useMemo(() => {
    const grouped = new Map<string, EmployeeRow[]>();

    for (const employee of employees) {
      const department = employee.department || "Unassigned";
      grouped.set(department, [...(grouped.get(department) || []), employee]);
    }

    return Array.from(grouped.entries())
      .map(([name, departmentEmployees]) => ({
        name,
        employees: departmentEmployees.sort((first, second) => first.name.localeCompare(second.name)),
      }))
      .sort((first, second) => first.name.localeCompare(second.name));
  }, [employees]);
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [summary, setSummary] = useState<EmployeeReportSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const searchedEmployee = useMemo(() => {
    if (!normalizedSearch) {
      return null;
    }

    return employees.find((employee) =>
      [employee.name, employee.employeeCode, employee.department, employee.role]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch)),
    ) ?? null;
  }, [employees, normalizedSearch]);

  useEffect(() => {
    if (!departments.length) {
      setSelectedDepartment("");
      setSelectedEmployeeId(null);
      return;
    }

    setSelectedDepartment((current) =>
      current && departments.some((department) => department.name === current)
        ? current
        : departments[0].name,
    );
  }, [departments]);

  const departmentEmployees =
    departments.find((department) => department.name === selectedDepartment)?.employees || [];

  useEffect(() => {
    if (searchedEmployee) {
      setSelectedDepartment(searchedEmployee.department || "Unassigned");
      setSelectedEmployeeId(searchedEmployee.id ?? null);
      return;
    }

    setSelectedEmployeeId((current) =>
      current && departmentEmployees.some((employee) => employee.id === current)
        ? current
        : departmentEmployees[0]?.id ?? null,
    );
  }, [departmentEmployees, searchedEmployee]);

  const selectedEmployee = departmentEmployees.find((employee) => employee.id === selectedEmployeeId);
  const selectedWorkflows = selectedEmployee
    ? workflows.filter((workflow) => workflow.assignedToId === selectedEmployee.id)
    : [];
  const completedWorkflows = selectedWorkflows.filter((workflow) => workflow.status === "Completed").length;
  const summaryQuery = useMemo(() => {
    if (!selectedEmployee?.id) {
      return "";
    }

    const params = new URLSearchParams({ employeeId: String(selectedEmployee.id) });

    if (reportDate) {
      params.set("date", reportDate);
    }

    return params.toString();
  }, [reportDate, selectedEmployee?.id]);

  useEffect(() => {
    if (!summaryQuery) {
      setSummary(null);
      return;
    }

    let isCurrent = true;
    setSummaryLoading(true);

    apiRequest<EmployeeReportSummary>(`/api/reports/employee-summary?${summaryQuery}`)
      .then((response) => {
        if (isCurrent) {
          setSummary(response);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setSummary(null);
        }
      })
      .finally(() => {
        if (isCurrent) {
          setSummaryLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [summaryQuery]);

  const reportRangeLabel = reportDate ? formatDate(reportDate) : "Login to now";
  const reportCards = selectedEmployee
    ? [
        {
          title: "Productivity",
          value: summary ? `${summary.averageProductivity}%` : selectedEmployee.productivityLabel,
          detail: summary
            ? `${formatMinutes(summary.totalProductiveMinutes)} productive time | ${formatMinutes(summary.totalIdleMinutes)} idle time`
            : `${selectedEmployee.productiveTime || "0m"} productive time | ${selectedEmployee.idleTime || "0m"} idle time`,
        },
        {
          title: "Attendance",
          value: summary ? `${summary.attendanceDays} days` : selectedEmployee.attendance,
          detail: summary
            ? `${summary.presentDays} present | ${summary.lateDays} late | ${summary.halfDays} half day`
            : `Login ${selectedEmployee.loginTime || "--"} | Logout ${selectedEmployee.logoutTime || "--"}`,
        },
        {
          title: "Workflow",
          value: summary ? `${summary.completedWorkflows}/${summary.workflowCount}` : `${completedWorkflows}/${selectedWorkflows.length}`,
          detail: "completed workflows",
        },
      ]
    : [];

  function exportSelectedEmployeeReport() {
    if (!selectedEmployee?.id) {
      return;
    }

    const params = new URLSearchParams({ employeeId: String(selectedEmployee.id) });

    if (reportDate) {
      params.set("date", reportDate);
    }

    onExport(
      `/api/reports/export?${params.toString()}`,
      `${selectedEmployee.employeeCode || selectedEmployee.id}-work-report.csv`,
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[300px_280px_minmax(460px,1fr)]">
      <SectionCard title="Departments">
        <div className="space-y-3">
          {departments.map((department) => (
            <button
              className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-base font-semibold transition ${
                selectedDepartment === department.name
                  ? "bg-cyan-300/10 text-cyan-100 ring-1 ring-cyan-300/20"
                  : "bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
              key={department.name}
              onClick={() => setSelectedDepartment(department.name)}
              type="button"
            >
              <span>{department.name}</span>
              <span className="text-sm text-slate-400">{department.employees.length}</span>
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Employees">
        <div className="space-y-3">
          {departmentEmployees.map((employee) => (
            <button
              className={`w-full rounded-2xl px-4 py-4 text-left transition ${
                selectedEmployeeId === employee.id
                  ? "bg-emerald-300/10 text-emerald-100 ring-1 ring-emerald-300/20"
                  : "bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
              key={employee.id ?? employee.employeeCode}
              onClick={() => setSelectedEmployeeId(employee.id ?? null)}
              type="button"
            >
              <p className="break-words text-base font-semibold">{employee.name}</p>
              <p className="mt-1 text-sm text-slate-400">{employee.employeeCode || "No code"}</p>
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        action={
          <button
            className="flex h-12 items-center gap-2 rounded-2xl bg-white px-5 text-base font-semibold text-slate-950 hover:bg-cyan-50 disabled:bg-slate-600 disabled:text-slate-300"
            disabled={exporting || !selectedEmployee}
            onClick={exportSelectedEmployeeReport}
            type="button"
          >
            <Download size={16} />
            {exporting ? "Exporting" : "Export"}
          </button>
        }
        title={selectedEmployee ? `${selectedEmployee.name} Reports` : "Employee Reports"}
      >
        <div className="mb-7 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-base font-semibold text-cyan-100">{reportRangeLabel}</p>
            <p className="mt-2 text-base text-slate-400">
              {summaryLoading ? "Loading selected range..." : "Cards and export follow the selected range."}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-5">
          {reportCards.map((report) => (
            <div className="min-w-0 rounded-3xl border border-white/10 bg-white/4 p-5" key={report.title}>
              <div className="flex size-13 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-100">
                <FileText size={24} />
              </div>
              <h3 className="mt-6 text-base font-semibold text-white sm:text-lg">{report.title}</h3>
              <p className="mt-4 text-2xl font-semibold text-white sm:text-3xl">{report.value}</p>
              <p className="mt-4 text-sm leading-6 text-slate-400 sm:text-base">{report.detail}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function SettingsView({
  onToggleSetting,
  policies = [],
  settings,
}: {
  onToggleSetting: (setting: string) => void;
  policies?: PolicyItem[];
  settings: Record<string, boolean>;
}) {
  const settingItems = Object.keys(settings);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(320px,1.1fr)]">
      <SectionCard title="System Settings">
        <div className="grid gap-4">
          {settingItems.map((setting) => {
            const enabled = settings[setting];

            return (
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/4 p-4" key={setting}>
              <span className="font-medium text-slate-200">{setting}</span>
              <button
                aria-pressed={enabled}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition ${
                  enabled
                    ? "bg-emerald-300/10 text-emerald-200 ring-emerald-300/20 hover:bg-emerald-300/15"
                    : "bg-slate-300/10 text-slate-300 ring-white/10 hover:bg-white/10"
                }`}
                onClick={() => onToggleSetting(setting)}
                type="button"
              >
                {enabled ? "Enabled" : "Disabled"}
              </button>
            </div>
            );
          })}
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
