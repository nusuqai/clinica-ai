import React, { useEffect, useState } from "react";
import { Outlet, Navigate, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import {
  LayoutDashboard,
  Calendar,
  User,
  LogOut,
  Menu,
  X,
  Loader2,
  Activity,
} from "lucide-react";

export default function DashboardLayout() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);

      // Fetch user profile with the related doctors row embedded.
      // If userProfile.doctors has a value this user is a doctor.
      if (session?.user?.id) {
        const { data: userProfile, error: userError } = await supabase
          .from("users")
          .select("*")
          .eq("id", session.user.id)
          .single();

        if (userProfile?.doctor) {
          setLoading(false);
          navigate("/doctor-dashboard", { replace: true });
          return;
        }
      }

      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-accent animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  const navItems = [
    {
      label: "نظرة عامة",
      path: "/dashboard",
      icon: <LayoutDashboard size={20} />,
    },
    {
      label: "مواعيدي",
      path: "/dashboard/appointments",
      icon: <Calendar size={20} />,
    },
    {
      label: "الملف الشخصي",
      path: "/dashboard/profile",
      icon: <User size={20} />,
    },
  ];

  const SidebarContent = () => (
    <>
      <div className="p-6 shrink-0">
        <a
          href="/"
          className="flex flex-col items-center justify-center gap-2 mb-8 group"
        >
          <div className="bg-primary/20 p-3 rounded-2xl group-hover:bg-primary/30 transition-colors">
            <img
              src="/logo.png"
              alt="Clinica AI Logo"
              className="h-16 w-auto brightness-0 invert opacity-90 object-contain"
            />
          </div>
          <span className="font-heading font-bold text-2xl text-white tracking-wide">
            Clinica <span className="text-accent">AI</span>
          </span>
        </a>
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-accent/20 rounded-full mx-auto flex items-center justify-center mb-3 text-accent font-heading text-2xl border flex-shrink-0 border-accent/50">
            {session.user.email?.charAt(0).toUpperCase()}
          </div>
          <p className="font-sans font-medium text-white/90 truncate px-2 text-sm">
            {session.user.email}
          </p>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={(e) => {
                e.preventDefault();
                navigate(item.path);
                setSidebarOpen(false);
              }}
              className={`flex items-center gap-3 w-full text-right px-4 py-3 rounded-xl font-sans font-medium transition-colors ${
                isActive
                  ? "bg-accent text-primary"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 mt-auto shrink-0">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-4 py-3 text-red-400 hover:bg-red-400/10 rounded-xl transition-colors font-sans font-medium"
        >
          <LogOut size={20} />
          <span>تسجيل الخروج</span>
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden bg-primary text-white p-4 flex justify-between items-center sticky top-0 z-30 shadow-sm">
        <div className="font-heading font-bold text-xl">لوحة التحكم</div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden md:block w-64 shrink-0">
        <div className="fixed top-0 right-0 w-64 h-screen bg-primary text-white flex flex-col z-40">
          <SidebarContent />
        </div>
      </aside>

      {/* Mobile Drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative w-64 bg-primary text-white flex flex-col h-full shadow-2xl">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 p-6 lg:p-10 min-w-0">
        <div className="max-w-5xl mx-auto h-full">
          <Outlet context={{ session }} />
        </div>
      </main>
    </div>
  );
}
