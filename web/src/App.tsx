import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./auth/AuthProvider";
import { AppShell } from "./components/layout/AppShell";
import { WordmarkWipe } from "./components/brand/WordmarkWipe";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ChooseWorkspacePage } from "./pages/ChooseWorkspacePage";
import { DashboardPage } from "./pages/DashboardPage";
import { SchoolsPage } from "./pages/SchoolsPage";
import { StudentsPage } from "./pages/StudentsPage";
import { FleetPage } from "./pages/FleetPage";
import { DriversPage } from "./pages/DriversPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { PlannerPage } from "./pages/PlannerPage";
import { ComparePage } from "./pages/ComparePage";
import { TwinPage } from "./pages/TwinPage";
import { DispatchPage } from "./pages/DispatchPage";
import { TripDetailPage } from "./pages/TripDetailPage";
import { DrivePage } from "./pages/DrivePage";
import { SchoolDetailPage } from "./pages/SchoolDetailPage";
import { StudentDetailPage } from "./pages/StudentDetailPage";
import { AdminPage } from "./pages/AdminPage";
import { LivePage } from "./pages/LivePage";
import { PrivacyPage } from "./pages/PrivacyPage";
import type { Role } from "./types";

const STAFF_ROLES: Role[] = ["platform_admin", "district_admin", "planner", "dispatcher"];
const PLANNING_ROLES: Role[] = ["platform_admin", "district_admin", "planner"];

function Guard({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white" role="status" aria-label="Loading session">
        <WordmarkWipe size="md" loop />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role) && user.role !== "platform_admin") {
    return <Navigate to="/app/dashboard" replace />;
  }
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route
        path="/choose-workspace"
        element={
          <Guard>
            <ChooseWorkspacePage />
          </Guard>
        }
      />

      {/* Authenticated app — everything below requires a session */}
      <Route
        path="/app"
        element={
          <Guard>
            <AppShell />
          </Guard>
        }
      >
        <Route index element={<Navigate to="/app/dashboard" replace />} />
        <Route path="live" element={<LivePage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route
          path="schools"
          element={
            <Guard roles={STAFF_ROLES}>
              <SchoolsPage />
            </Guard>
          }
        />
        <Route
          path="schools/:id"
          element={
            <Guard roles={STAFF_ROLES}>
              <SchoolDetailPage />
            </Guard>
          }
        />
        <Route
          path="students"
          element={
            <Guard roles={STAFF_ROLES}>
              <StudentsPage />
            </Guard>
          }
        />
        <Route
          path="students/:id"
          element={
            <Guard roles={STAFF_ROLES}>
              <StudentDetailPage />
            </Guard>
          }
        />
        <Route
          path="fleet"
          element={
            <Guard roles={STAFF_ROLES}>
              <FleetPage />
            </Guard>
          }
        />
        <Route
          path="drivers"
          element={
            <Guard roles={STAFF_ROLES}>
              <DriversPage />
            </Guard>
          }
        />
        <Route
          path="onboarding"
          element={
            <Guard roles={PLANNING_ROLES}>
              <OnboardingPage />
            </Guard>
          }
        />
        <Route
          path="planner"
          element={
            <Guard roles={PLANNING_ROLES}>
              <PlannerPage />
            </Guard>
          }
        />
        <Route
          path="compare"
          element={
            <Guard roles={PLANNING_ROLES}>
              <ComparePage />
            </Guard>
          }
        />
        <Route
          path="twin"
          element={
            <Guard roles={PLANNING_ROLES}>
              <TwinPage />
            </Guard>
          }
        />
        <Route
          path="dispatch"
          element={
            <Guard roles={["platform_admin", "district_admin", "dispatcher"]}>
              <DispatchPage />
            </Guard>
          }
        />
        <Route path="drive" element={<DrivePage />} />
        <Route path="drive/:id" element={<DrivePage />} />
        <Route path="trips/:id" element={<TripDetailPage />} />
        <Route
          path="admin"
          element={
            <Guard roles={["platform_admin", "district_admin"]}>
              <AdminPage />
            </Guard>
          }
        />
      </Route>

      {/* Unknown paths fall back to the landing page */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
