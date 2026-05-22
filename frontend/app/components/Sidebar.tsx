"use client";

import {
  LayoutDashboard,
  ClipboardCheck,
  Activity,
  BarChart3,
  Settings,
} from "lucide-react";

const menuItems = [
  {
    title: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Attendance",
    icon: ClipboardCheck,
  },
  {
    title: "Activity",
    icon: Activity,
  },
  {
    title: "Reports",
    icon: BarChart3,
  },
  {
    title: "Settings",
    icon: Settings,
  },
];

export default function Sidebar() {
  return (
    <div className="w-64 h-screen bg-zinc-950 border-r border-zinc-800 text-white p-5">
      <h1 className="text-2xl font-bold mb-10 text-blue-500">
        WorkTracker
      </h1>

      <div className="space-y-3">
        {menuItems.map((item, index) => {
          const Icon = item.icon;

          return (
            <div
              key={index}
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-800 cursor-pointer transition-all duration-200"
            >
              <Icon size={20} />
              <span className="text-sm font-medium">{item.title}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}