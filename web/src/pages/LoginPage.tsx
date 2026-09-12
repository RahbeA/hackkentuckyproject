import { useEffect, useRef, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Compass } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { api, errorMessage } from "../api/client";
import { AuthBrandPanel } from "../components/brand/AuthBrandPanel";
import { Logo } from "../components/brand/Logo";
import { useDemoGuideOptional } from "../demo/DemoGuideProvider";
import { afterSignInPath, ROLE_HOME, type Role } from "../types";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password is required"),
});

type Form = z.infer<typeof schema>;
type Panel = "demo" | "account";

const JUMP_ROLES: { role: Role; label: string; hint: string }[] = [
  { role: "guardian", label: "Family", hint: "Ava's bus only" },
  { role: "driver", label: "Driver", hint: "Assigned run" },
  { role: "dispatcher", label: "Dispatcher", hint: "Alerts" },
  { role: "planner", label: "Planner", hint: "Routes" },
];

function AuthSlide({
  label,
  n,
  title,
  lead,
  children,
  highlight = false,
}: {
  label: string;
  n: string;
  title: string;
  lead?: string;
  children: ReactNode;
  highlight?: boolean;
}) {
  return (
    <article
      className={`rounded-2xl border bg-paper p-5 shadow-card sm:p-6 ${
        highlight ? "border-route ring-1 ring-route/15" : "border-line"
      }`}
    >
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-route">{label}</span>
        <span className="h-px flex-1 bg-line" />
        <span className="font-mono text-[11px] font-semibold tabular-nums text-muted">{n}</span>
      </div>
      <h2 className="mt-4 font-display text-[22px] font-bold tracking-tight text-ink">{title}</h2>
      {lead ? <p className="mt-1.5 text-[14px] leading-relaxed text-slate">{lead}</p> : null}
      <div className="mt-5">{children}</div>
    </article>
  );
}

function panelFromUrl(wantGuide: boolean): Panel {
  if (typeof window === "undefined") return wantGuide ? "demo" : "demo";
  if (window.location.hash === "#account") return "account";
  if (window.location.hash === "#demo" || wantGuide) return "demo";
  return "demo";
}

export function LoginPage() {
  const { login, user } = useAuth();
  const guide = useDemoGuideOptional();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const wantGuide = params.get("guide") === "1";
  const justSignedIn = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(() => panelFromUrl(wantGuide));
  const [demo, setDemo] = useState<{ password: string; accounts: { email: string; label: string; role: Role }[] } | null>(
    null,
  );
  const form = useForm<Form>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  useEffect(() => {
    if (user && !justSignedIn.current) nav(ROLE_HOME[user.role], { replace: true });
  }, [user, nav]);

  useEffect(() => {
    if (import.meta.env.VITE_DEMO_MODE === "true") {
      api.get("/auth/demo-credentials/").then((r) => r.data.demo_mode && setDemo(r.data));
    }
  }, []);

  useEffect(() => {
    const sync = () => setPanel(panelFromUrl(wantGuide));
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [wantGuide]);

  function showPanel(next: Panel) {
    setPanel(next);
    setError(null);
    const hash = next === "account" ? "#account" : "#demo";
    if (window.location.hash !== hash) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${hash}`);
    }
  }

  async function enter(email: string, password: string, opts?: { walkthrough?: boolean }) {
    setError(null);
    try {
      const u = await login(email, password);
      justSignedIn.current = true;
      if (opts?.walkthrough && guide) {
        guide.start("dashboard");
        nav("/app/dashboard", { replace: true });
        return;
      }
      nav(afterSignInPath(u.role, { pickWorkspace: u.role === "district_admin" }));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function onSubmit(values: Form) {
    await enter(values.email, values.password);
  }

  const admin = demo?.accounts.find((a) => a.role === "district_admin");
  const hasDemo = Boolean(demo && admin);
  const onDemo = hasDemo && panel === "demo";

  return (
    <div className="grid min-h-screen bg-canvas lg:h-dvh lg:grid-cols-2 lg:overflow-hidden">
      <AuthBrandPanel
        heading={onDemo ? "Six screens. One morning." : "Sign in to DART"}
        sub={
          onDemo
            ? "Jefferson Demo Schools is already seeded. Start the walkthrough — no CSV import, no account to create."
            : hasDemo
              ? "Use your district email for a real workspace — not the seeded Jefferson demo."
              : "Use your district email to open the console."
        }
      />

      <section className="flex justify-center overflow-y-auto p-6 pb-10 sm:p-8 sm:pb-12 lg:items-center lg:p-10 xl:p-12">
        <div className="w-full max-w-[440px] animate-slide-up py-2 lg:py-4">
          <div className="mb-4 lg:hidden">
            <Logo size={26} />
          </div>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-slate transition-colors hover:text-ink"
          >
            <ArrowLeft size={14} /> Back to home
          </Link>

          {hasDemo && (
            <nav className="mt-4 flex gap-2" aria-label="Login sections">
              <button
                type="button"
                onClick={() => showPanel("demo")}
                aria-pressed={panel === "demo"}
                className={`rounded-full border px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                  panel === "demo"
                    ? "border-route bg-accent-soft text-route"
                    : "border-line bg-paper text-slate hover:border-route hover:text-route"
                }`}
              >
                01 · Demo
              </button>
              <button
                type="button"
                onClick={() => showPanel("account")}
                aria-pressed={panel === "account"}
                className={`rounded-full border px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors ${
                  panel === "account"
                    ? "border-route bg-accent-soft text-route"
                    : "border-line bg-paper text-slate hover:border-route hover:text-route"
                }`}
              >
                02 · Account
              </button>
            </nav>
          )}

          <div className="mt-5">
            {onDemo ? (
              <AuthSlide
                label="Demo"
                n="01"
                title="Start the demo"
                lead="Hackathon judges: press the blue button. The in-app coach tells you what to click on each screen."
                highlight={wantGuide}
              >
                <div
                  className={`rounded-xl border p-4 ${wantGuide ? "border-route/30 bg-accent-soft/40" : "border-line bg-canvas"}`}
                >
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-route">
                    <Compass size={13} />
                    Recommended
                  </div>
                  <p className="mt-2 text-[15px] font-semibold text-ink">District admin walkthrough</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-slate">
                    Dashboard → planner → compare → rain test → start buses → family view. About six minutes. All names
                    are fictional.
                  </p>
                  <button
                    type="button"
                    className="btn-primary mt-4 w-full !py-3.5 !text-[15px]"
                    onClick={() => enter(admin!.email, demo!.password, { walkthrough: true })}
                  >
                    Start walkthrough <ArrowRight size={16} />
                  </button>
                </div>

                <div className="mt-4">
                  <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-muted">Or jump to a role</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {JUMP_ROLES.map((j) => {
                      const account = demo!.accounts.find((a) => a.role === j.role && !a.email.startsWith("student@"));
                      if (!account) return null;
                      return (
                        <button
                          key={j.role}
                          type="button"
                          onClick={() => enter(account.email, demo!.password)}
                          className="min-h-11 rounded-xl border border-line bg-paper px-3 py-2.5 text-left transition-colors hover:border-route"
                        >
                          <span className="block text-[13px] font-semibold text-ink">{j.label}</span>
                          <span className="block text-[11.5px] text-slate">{j.hint}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </AuthSlide>
            ) : (
              <AuthSlide
                label={hasDemo ? "Account" : "Sign in"}
                n={hasDemo ? "02" : "01"}
                title={hasDemo ? "Sign in or create an account" : "Sign in"}
                lead={
                  hasDemo
                    ? "For a real district workspace — not the seeded Jefferson demo."
                    : "Use your district email to open the console."
                }
              >
                {error && (
                  <p role="alert" className="mb-4 rounded-lg border border-bad/20 bg-bad/5 p-3 text-sm text-bad">
                    {error}
                  </p>
                )}
                <EmailForm form={form} onSubmit={onSubmit} />
              </AuthSlide>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function EmailForm({
  form,
  onSubmit,
}: {
  form: ReturnType<typeof useForm<Form>>;
  onSubmit: (values: Form) => Promise<void>;
}) {
  return (
    <form className="flex flex-col gap-[18px]" onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          className="input"
          type="email"
          placeholder="you@district.org"
          autoComplete="username"
          {...form.register("email")}
        />
        {form.formState.errors.email && <p className="mt-1 text-sm text-bad">{form.formState.errors.email.message}</p>}
      </div>
      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          className="input"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          {...form.register("password")}
        />
        {form.formState.errors.password && (
          <p className="mt-1 text-sm text-bad">{form.formState.errors.password.message}</p>
        )}
      </div>
      <button className="btn-primary w-full !py-3.5 !text-[15px]" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-center text-[13.5px] text-slate">
        New district?{" "}
        <Link to="/register" className="font-semibold text-route hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
