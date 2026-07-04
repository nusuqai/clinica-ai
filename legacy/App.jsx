import { useEffect, useState } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { supabase } from "./lib/supabase";

import LandingPage from "./pages/LandingPage";
import Auth from "./components/Auth";
import DashboardLayout from "./components/DashboardLayout";
import DashboardHome from "./components/DashboardHome";
import CalendarView from "./components/dashboard/CalendarView";
import ProfileView from "./components/dashboard/ProfileView";
import ChatbotWidget from "./components/chatbot/ChatbotWidget";
import DoctorDashboardLayout from "./components/doctor/DoctorDashboardLayout";
import DoctorHome from "./components/doctor/DoctorHome";
import DoctorAppointments from "./components/doctor/DoctorAppointments";
import DoctorPatients from "./components/doctor/DoctorPatients";
import DoctorAvailability from "./components/doctor/DoctorAvailability";

function PrivateRoute({ children, session, loading }) {
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary/20 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <Router>
      <div className="font-sans text-text antialiased selection:bg-accent/30 selection:text-primary max-w-[100vw] overflow-x-hidden min-h-screen flex flex-col">
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route
            path="/login"
            element={
              !loading && session ? (
                <Navigate to="/dashboard" replace />
              ) : (
                <Auth />
              )
            }
          />

          {/* Protected Patient Dashboard */}
          <Route
            path="/dashboard"
            element={
              <PrivateRoute session={session} loading={loading}>
                <DashboardLayout />
              </PrivateRoute>
            }
          >
            <Route index element={<DashboardHome session={session} />} />
            <Route
              path="appointments"
              element={<CalendarView session={session} />}
            />
            <Route path="profile" element={<ProfileView session={session} />} />
          </Route>

          {/* Protected Doctor Dashboard */}
          <Route
            path="/doctor-dashboard"
            element={
              <PrivateRoute session={session} loading={loading}>
                <DoctorDashboardLayout />
              </PrivateRoute>
            }
          >
            <Route index element={<DoctorHome />} />
            <Route path="appointments" element={<DoctorAppointments />} />
            <Route path="patients" element={<DoctorPatients />} />
            <Route path="availability" element={<DoctorAvailability />} />
            <Route path="profile" element={<ProfileView session={session} />} />
          </Route>
        </Routes>
      </div>
      <ChatbotWidget />
    </Router>
  );
}
