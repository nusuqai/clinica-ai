"use client";

import { Menu, Bell } from "lucide-react";

interface TopbarProps {
  title: string;
  clinicName: string;
  onMenuClick: () => void;
}

export default function Topbar({ title, clinicName, onMenuClick }: TopbarProps) {
  return (
    <header className="border-primary/8 flex h-16 flex-shrink-0 items-center justify-between gap-4 border-b bg-white px-4 md:px-6">
      {/* Mobile hamburger */}
      <button
        onClick={onMenuClick}
        className="rounded-xl p-2 text-primary/60 transition-colors hover:bg-primary/5 hover:text-primary md:hidden"
        aria-label="فتح القائمة"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Page title (desktop) */}
      <h2 className="hidden font-heading text-lg font-bold text-primary md:block">{title}</h2>

      {/* Clinic name (mobile center) — the sidebar that carries it is hidden here. */}
      <span className="flex-1 truncate text-center font-heading text-base font-bold text-primary md:hidden">
        {clinicName}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* <button className="relative p-2 rounded-xl text-primary/60 hover:text-primary hover:bg-primary/5 transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 end-1.5 w-2 h-2 rounded-full bg-accent" />
        </button> */}
      </div>
    </header>
  );
}
