"use client";

import { Bell, Search } from "lucide-react";

export default function Navbar() {
  return (
    <div className="w-full h-20 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between px-6">
      
      {/* Search Bar */}
      <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 w-80">
        <Search size={18} className="text-zinc-400" />

        <input
          type="text"
          placeholder="Search..."
          className="bg-transparent outline-none text-sm ml-3 w-full text-white placeholder:text-zinc-500"
        />
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-5">
        
        {/* Notification */}
        <div className="relative cursor-pointer">
          <Bell className="text-zinc-300" size={22} />

          <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"></div>
        </div>

        {/* Profile */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold">
            A
          </div>

          <div>
            <h2 className="text-sm font-semibold text-white">
              Admin
            </h2>

            <p className="text-xs text-zinc-400">
              Administrator
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}