"use client";

import { Menu, Bell } from "lucide-react";

interface TopbarProps {
  title: string;
  onMenuClick: () => void;
}

export default function Topbar({ title, onMenuClick }: TopbarProps) {
  return (
    <header className="flex-shrink-0 h-16 bg-white border-b border-primary/8 flex items-center justify-between px-4 md:px-6 gap-4">
      {/* Mobile hamburger */}
      <button
        onClick={onMenuClick}
        className="md:hidden p-2 rounded-xl text-primary/60 hover:text-primary hover:bg-primary/5 transition-colors"
        aria-label="فتح القائمة"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Page title (desktop) */}
      <h2 className="hidden md:block font-heading font-bold text-primary text-lg">
        {title}
      </h2>

      {/* App name (mobile center) */}
      <span className="md:hidden font-heading font-bold text-primary text-base flex-1 text-center">
        Clinica AI
      </span>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button className="relative p-2 rounded-xl text-primary/60 hover:text-primary hover:bg-primary/5 transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 end-1.5 w-2 h-2 rounded-full bg-accent" />
        </button>
      </div>
    </header>
  );
}
