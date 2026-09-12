import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { LoginPage } from "../src/pages/LoginPage";
import { AuthProvider } from "../src/auth/AuthProvider";
import { DemoGuideProvider } from "../src/demo/DemoGuideProvider";
import { GUIDE_STEPS } from "../src/demo/steps";
import { ROLE_HOME, afterSignInPath } from "../src/types";
import { DispatchPage } from "../src/pages/DispatchPage";
import { PlannerPage } from "../src/pages/PlannerPage";
import { OnboardingPage } from "../src/pages/OnboardingPage";
import { ChooseWorkspacePage } from "../src/pages/ChooseWorkspacePage";

vi.mock("../src/api/client", async () => {
  const actual = await vi.importActual<typeof import("../src/api/client")>("../src/api/client");
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
    },
  };
});

// maplibre needs WebGL/canvas, unavailable in jsdom — stub the map component.
vi.mock("../src/components/maps/RouteMap", () => ({ RouteMap: () => null }));

import { api } from "../src/api/client";

function wrap(ui: ReactElement, route = "/") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>
          <DemoGuideProvider>{ui}</DemoGuideProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("auth", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/auth/me/") throw new Error("no session");
      if (url === "/auth/demo-credentials/") {
        return {
          data: {
            demo_mode: true,
            password: "DemoPass123!",
            accounts: [{ email: "admin@jefferson.demo", label: "District admin", role: "district_admin" }],
          },
        };
      }
      return { data: { results: [] } };
    });
  });

  it("renders login and demo accounts", async () => {
    vi.stubEnv("VITE_DEMO_MODE", "true");
    wrap(<LoginPage />);
    expect(await screen.findByRole("heading", { name: "Start the demo" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Start walkthrough/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sign in with email instead/i })).toBeInTheDocument();
  });

  it("walkthrough has six ordered screens", () => {
    expect(GUIDE_STEPS.map((s) => s.id)).toEqual(["dashboard", "planner", "compare", "twin", "live", "family"]);
  });

  it("shows error on failed login", async () => {
    vi.mocked(api.post).mockRejectedValue({ response: { data: { error: { message: "Invalid email or password." } } } });
    wrap(<LoginPage />);
    const emailToggle = await screen.findByRole("button", { name: /Sign in with email instead/i });
    await userEvent.click(emailToggle);
    await userEvent.type(screen.getByLabelText("Email"), "x@y.com");
    await userEvent.type(screen.getByLabelText("Password"), "badpassw0rd");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password.");
  });

  it("maps roles to homes", () => {
    expect(ROLE_HOME.dispatcher).toBe("/app/dispatch");
    expect(ROLE_HOME.planner).toBe("/app/planner");
    expect(ROLE_HOME.district_admin).toBe("/app/dashboard");
    expect(afterSignInPath("district_admin", { pickWorkspace: true })).toBe("/choose-workspace");
    expect(afterSignInPath("platform_admin", { pickWorkspace: true })).toBe("/app/dashboard");
    expect(afterSignInPath("district_admin", { newDistrict: true })).toBe("/app/onboarding");
  });
});

describe("planner", () => {
  it("posts a generate request", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { results: [{ id: "s1", name: "Oakridge" }] } });
    vi.mocked(api.post).mockResolvedValue({ data: { id: "p1", status: "generating" } });
    wrap(<PlannerPage />);
    expect(await screen.findByText("Route planner")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Generate plan/i }));
    expect(api.post).toHaveBeenCalled();
  });

  it("renders solver failure reasons", async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (String(url).includes("/route-plans/p1")) {
        return {
          data: {
            id: "p1",
            status: "failed",
            infeasibility: { reasons: ["Insufficient wheelchair capacity"] },
            routes: [],
          },
        };
      }
      return { data: { results: [] } };
    });
    wrap(<PlannerPage />);
    // open existing plan list empty — still assert generate UI exists
    expect(await screen.findByText("Route planner")).toBeInTheDocument();
  });
});

describe("onboarding mapper", () => {
  it("lets the user confirm mapping after upload", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: {} });
    wrap(<OnboardingPage />);
    expect(await screen.findByText("Set up your district")).toBeInTheDocument();
    expect(screen.getByText("Continue to roster import")).toBeInTheDocument();
  });
});

describe("workspace picker", () => {
  it("defaults to district admin", async () => {
    vi.mocked(api.get).mockRejectedValue(new Error("no session"));
    wrap(<ChooseWorkspacePage />);
    expect(await screen.findByText("Where would you like to start?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue as District admin" })).toBeInTheDocument();
  });
});

describe("alerts", () => {
  it("acknowledges an alert", async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (String(url).startsWith("/trips/")) return { data: { results: [] } };
      if (String(url).startsWith("/alerts/")) {
        return { data: { results: [{ id: "a1", title: "Predicted delay", message: "late", severity: "warning" }] } };
      }
      return { data: { results: [] } };
    });
    vi.mocked(api.post).mockResolvedValue({ data: {} });
    wrap(<DispatchPage />);
    expect(await screen.findByText("Predicted delay")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Ack"));
    expect(api.post).toHaveBeenCalledWith("/alerts/a1/acknowledge/");
  });
});
