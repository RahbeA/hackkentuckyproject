import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AnalogClock,
  FailureIcon,
  HardGeometry,
  LiveDot,
  PipelineTrack,
  PracticeLoop,
  RadarBackdrop,
  RouteProgress,
  SlideRule,
  SpinMark,
  StreetGrid,
  SyntheticChip,
  TitleRouteLine,
  IntroWordStack,
  WordmarkWipe,
} from "./bits";
import {
  ComparePanelCrop,
  DriverRunSheetCrop,
  DualScreenComposite,
  GuardianTrackCrop,
  LiveBoardCrop,
  PhoneAbsence,
  PhoneToday,
  PhoneTrack,
  PhoneUpdates,
  PlannerMapCrop,
  TwinChartCrop,
  TwinToggles,
  WhyInfeasibleBubble,
} from "./mocks";

export const SLIDE_COUNT = 15;

export const SPEAKER_NOTES: string[] = [
  "We're DART. We built a school bus routing and tracking platform in a weekend, and I want to start with why the tagline is a time of day.",
  "Louisville rolled out three changes at once on the first day of 2023: a new student assignment plan, new bell times, and brand-new routes from an outside routing vendor. Drivers got stapled paper packets. There were no real dry runs. By 2:20 in the afternoon, MetroSafe was logging missing-child calls. Fifty-nine of them. The district help line closed at 7 PM while kindergartners were still on buses. One mother's five-year-old was on a bus for more than three hours; she told LPM that calling the police felt like filling out a missing persons report. The last student got home around 10. The district shut down for most of two weeks. We're not going to dwell here. But every feature you're about to see maps back to something that went wrong on this one day. Quote: LPM family accounts, Aug 10, 2023.",
  "The damage compounded. Students lost about four times as much instruction per day as the year before, roughly 2.4 million minutes across 24 school days that fall, and DOJ records showed Black students lost about 15 minutes more than white students districtwide, with multilingual learners hit harder. Drivers staged a sickout. The district's fix for late buses was to stop busing magnet and traditional students, around fifteen thousand kids. One mother lost her son's bus, couldn't get him across town, and after 30-plus absences was facing a truancy referral with jail time on the table. There was a federal lawsuit, a state audit, a records lawsuit, and a bill to strip the elected board of power. And for the 2026 first day, the district's public goal was to get the last kid home by 6:59 PM. That's the bar. We think software can move it.",
  "This isn't a Louisville problem. The same vendor had public failures in Columbus and Cincinnati before Louisville sole-sourced it. Prince George's County launched a $3.2 million routing app this August and about ten thousand students had no route on day one. Howard County finalized routes the Saturday before school, flew in drivers who navigated by paper maps, and 2,400 kids had no ride the first week. Boston's day-one on-time rate with a new tracking app was 34 percent. Chicago, New York, and Baton Rouge are running on decades-old vendor systems where special education routes break first. Six failure modes, over and over. We built DART against this list.",
  "Every district on the last slide found out their routes were wrong by putting children on buses. Pilots don't do that. We wanted a flight simulator for the first day of school, and a single source of truth that reaches the parent as fast as it reaches the dispatcher.",
  "Before the product tour — introducing DART. Pause here half a beat; let the name land.",
  "DART is District Automated Routing and Tracking. Three audiences, one API, role-scoped views. Districts plan and run the day. Drivers get a live run sheet. Families get a private app. Everything you'll see runs against a fictional district we call Jefferson Demo Schools. Nothing here is real student data, and we are not affiliated with JCPS.",
  "Django REST with WebSockets and Celery in the back. OR-Tools solves a capacitated vehicle routing problem with time windows. A sklearn layer gives each leg a P50 and P90 travel time and a late-risk score. The digital twin runs the morning many times under different conditions. The live simulator emits GPS over WebSockets to the dispatcher board and the Expo guardian app at the same time. One API, and every role sees only what it's allowed to.",
  "The independent audit of Louisville's 2023 rollout found the routing model allowed 30 seconds per stop for unloading, ignored the extra time wheelchair loading takes, and was built on a rider count of about 67,000 when the district actually moved about 50,000. The plan looked fine on paper because the paper was wrong. DART's Reliability mode plans against P90 travel times and a late classifier, enforces capacity including wheelchair seats, and respects bell-time windows. And when a plan can't work, it says why, stop by stop, instead of quietly producing a route that fails at 3 PM. On the equity point: the students who lost the most instruction in 2023 were Black, Latino, multilingual, and disabled. Planning for the 90th percentile instead of the median is the part we can do in software. It's not the whole answer.",
  "This is the rehearsal. The twin takes a plan and simulates the morning under weather and traffic draws, N times. You get a distribution of arrival times and a plain on-time probability. In 2023 the district's timeline didn't allow staff to vet the routes. Here, vetting is a button. We show the run with rain and heavy traffic on, and the on-time probability for the Fastest plan drops well below the Reliability plan. Those specific numbers are synthetic, but the method is real.",
  "Now the live part. I click Start Live Demo. Buses animate along the routes. I inject a disruption on Bus 3. The dispatcher board raises an alert with a predicted delay and an Acknowledge button. At the same instant, the guardian's phone shows the new ETA and a delay notice. No phone tree, no help line that closes at 7. The same event reaches the person who can fix it and the person who is waiting at the curb.",
  "Parents in 2023 got a tracking app mid-crisis and later said it gave inaccurate information. Later research found that the same vendor's API had exposed bus locations and parent contact info for around six million students industry-wide. So we made two decisions. First, the guardian app shows the same ETA the dispatcher sees, and it says 'Simulated GPS' right on the screen because that's what it is today. Second, privacy is enforced in the API, not the UI: a guardian is linked to riders, and every query is scoped to those riders. There is no manifest endpoint for a guardian to find. A student can also be their own guardian, which matters for high schoolers getting home from work shifts.",
  "Use the 90-second script. Say the fictional-data line out loud before touching the keyboard. 0:00 Sign in as district admin. 0:10 Planner + flagged CSV rows. 0:25 Generate Reliability, compare miles / vehicles / on-time. 0:40 Twin, rain + traffic. 0:55 Start Live Demo. 1:05 Inject disruption, Acknowledge. 1:15 Guardian Track — same ETA, Simulated GPS. 1:25 Advance to What's next.",
  "We want to be precise about what this is. It's a proof of concept. The GPS is simulated, the students are fictional, the ML is trained on synthetic labels, and none of this has been through a FERPA or COPPA review or certified for real bus navigation. The path from here is real student information system sync, real vehicle telematics, a security review, and a lot of testing with drivers and dispatchers in the room. The part of the 2023 story that stuck with us was that the transportation department was cut out of the planning. We would not repeat that.",
  "5:41 PM is the time Louisville said it wanted the last kid home by the second week of this school year. We think a district should be able to know its last-drop-off time before the first bell, not after. That's DART. Thank you.",
];

export const APPENDIX_SOURCES = [
  "LPM (Louisville Public Media) 2023–2025: Aug 10 2023 family accounts; Nov 2023 sickout; DOJ disparity records (July 2024); Taryn Bell story (Dec 2024); records ruling (July 2025).",
  "Prismatic Services transportation audit of JCPS (March 2024), as reported by LPM and the Courier Journal.",
  "WAVE / WDRB cost reporting ($1.4M). Spectrum News (2026 first-day goals).",
  "Kentucky Auditor of Public Accounts special examination (June 2026). Kentucky Association of School Superintendents funding brief.",
  "The Baltimore Banner (Howard County 2023, Prince George's County 2026). WBUR (Boston 2024). Chalkbeat (Chicago, NYC). The Advocate (East Baton Rouge).",
  "THE Journal and The 74 (Edulog API disclosure, Tenable, Dec 2023).",
];

function SlideShell({
  children,
  progress,
  dark = false,
}: {
  children: ReactNode;
  progress?: number;
  dark?: boolean;
}) {
  return (
    <div className={`relative h-full w-full overflow-hidden ${dark ? "bg-navy text-white" : "bg-paper text-ink"}`}>
      {children}
      {progress != null ? <RouteProgress step={progress} /> : null}
    </div>
  );
}

export function SlideView({ index }: { index: number }) {
  switch (index) {
    case 0:
      return <Slide1 />;
    case 1:
      return <Slide2 />;
    case 2:
      return <Slide3 />;
    case 3:
      return <Slide4 />;
    case 4:
      return <Slide5 />;
    case 5:
      return <Slide6Intro />;
    case 6:
      return <Slide6 />;
    case 7:
      return <Slide7 />;
    case 8:
      return <Slide8 />;
    case 9:
      return <Slide9 />;
    case 10:
      return <Slide10 />;
    case 11:
      return <Slide11 />;
    case 12:
      return <Slide12 />;
    case 13:
      return <Slide13 />;
    case 14:
      return <Slide14 />;
    default:
      return <Slide1 />;
  }
}

function Slide1() {
  return (
    <SlideShell>
      <StreetGrid />
      <TitleRouteLine />
      <div className="relative flex h-full flex-col px-16 pb-12 pt-[108px]">
        <p className="pitch-in-lead font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-route">
          School transportation platform
        </p>
        <div className="mt-5">
          <WordmarkWipe />
        </div>
        <p className="pitch-in-lead mt-5 text-[18px] font-medium text-slate">District Automated Routing &amp; Tracking</p>
        <p className="mt-3 font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-muted">
          Built by Rahbe Abass + Aditya Mendiratta
        </p>
        <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">HackKentucky 2026 · Proof of concept</p>
        <p className="pitch-in-head absolute bottom-[148px] left-16 max-w-[22em] font-display text-[26px] font-bold leading-tight tracking-tight text-route">
          So the last kid isn’t home at 10 PM.
        </p>
        <p className="absolute bottom-10 left-16 max-w-[28em] text-[11px] leading-relaxed text-muted">
          Proof of concept. Not affiliated with any school district. Demo data is synthetic.
        </p>
      </div>
    </SlideShell>
  );
}

function Slide2() {
  const stops = [
    { t: "2:20 PM", d: "59 missing-child calls to MetroSafe begin" },
    { t: "7:00 PM", d: "District help line closes, kids still riding" },
    { t: "~10:00 PM", d: "Last student dropped off" },
    { t: "Then", d: "Schools closed for most of two weeks" },
  ];
  return (
    <SlideShell dark>
      <StreetGrid dark />
      <div className="relative grid h-full grid-cols-[0.95fr_1.35fr] gap-10 px-14 py-10">
        <div className="flex flex-col items-center justify-center">
          <AnalogClock hour={22} minute={0} dark minuteTone="amber" size={268} />
          <p className="mt-4 font-mono text-[12px] font-medium uppercase tracking-[0.16em] text-white/45">August 9, 2023</p>
        </div>
        <div className="flex flex-col justify-center">
          <SlideRule label="The night" n="02" dark />
          <h2 className="pitch-in-head mt-6 font-display text-[34px] font-bold leading-tight tracking-tight">The night Louisville remembers</h2>
          <p className="mt-1 text-[15px] text-white/50">First day of school.</p>
          <div className="relative mt-8 pl-5">
            <div className="absolute bottom-2 left-[7px] top-2 w-px bg-route" />
            <ol className="flex flex-col gap-4">
              {stops.map((s) => (
                <li key={s.t} className="relative">
                  <span className="absolute -left-5 top-1.5 h-2.5 w-2.5 rounded-full bg-route" />
                  <div className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-white/45">{s.t}</div>
                  <div className="mt-0.5 text-[15px] leading-snug text-white/85">{s.d}</div>
                </li>
              ))}
            </ol>
          </div>
          <p className="mt-8 font-display text-[18px] italic text-white/70">“The scariest day of my life.”</p>
        </div>
      </div>
    </SlideShell>
  );
}

function Slide3() {
  const nodes = [
    "Lost instruction",
    "Driver sickout",
    "Magnet busing cut",
    "Families without cars",
    "Truancy threats",
    "Audits, lawsuits, politics",
  ];
  return (
    <SlideShell>
      <HardGeometry />
      <div className="relative flex h-full flex-col justify-center px-16">
        <SlideRule label="Compounding" n="03" />
        <div className="mt-12 flex items-start justify-between gap-2">
          {nodes.map((n, i) => (
            <div key={n} className="flex min-w-0 flex-1 flex-col items-center">
              <div className="flex w-full items-center">
                <span className={`h-px flex-1 ${i === 0 ? "bg-transparent" : i === nodes.length - 1 ? "bg-warn" : "bg-route"}`} />
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full border-2 ${i === nodes.length - 1 ? "border-warn bg-paper" : "border-route bg-paper"}`} />
                <span className={`h-px flex-1 ${i === nodes.length - 1 ? "bg-transparent" : "bg-route"}`} />
              </div>
              <p className="mt-4 max-w-[9.5em] text-center font-mono text-[11px] font-medium uppercase leading-snug tracking-[0.08em] text-ink">
                {n}
              </p>
            </div>
          ))}
        </div>
        <h2 className="pitch-in-head mt-14 font-display text-[40px] font-bold leading-[1.08] tracking-tight">
          Three years later, the goal is still
          <br />
          “last kid home before 7.”
        </h2>
      </div>
    </SlideShell>
  );
}

function Slide4() {
  const tiles: { kind: "data" | "calendar" | "paper" | "app" | "closed" | "uneven"; label: string }[] = [
    { kind: "data", label: "Dirty data" },
    { kind: "calendar", label: "No dry run" },
    { kind: "paper", label: "Paper packets" },
    { kind: "app", label: "App vs. reality" },
    { kind: "closed", label: "Comms collapse" },
    { kind: "uneven", label: "Harm lands unevenly" },
  ];
  return (
    <SlideShell>
      <div className="flex h-full flex-col px-16 py-12">
        <SlideRule label="National" n="04" />
        <h2 className="pitch-in-head mt-5 font-display text-[34px] font-bold tracking-tight">The failure mode is national</h2>
        <div className="mt-7 grid flex-1 grid-cols-3 grid-rows-2 gap-4">
          {tiles.map((t, i) => (
            <div key={t.label} data-i={i} className="pitch-in-card flex flex-col items-start justify-center rounded-2xl border border-line bg-canvas px-6">
              <FailureIcon kind={t.kind} />
              <div className="mt-3 font-display text-[20px] font-bold tracking-tight">{t.label}</div>
            </div>
          ))}
        </div>
        <p className="mt-5 font-mono text-[12px] text-slate">Same shape in Prince George’s County (2026) and Howard County (2023).</p>
      </div>
    </SlideShell>
  );
}

function Slide5() {
  return (
    <SlideShell>
      <StreetGrid />
      <div className="relative flex h-full flex-col items-center justify-center px-24 text-center">
        <h2 className="pitch-in-head font-display text-[42px] font-bold leading-[1.12] tracking-tight">
          What if planners could stress-test rain, traffic, and dwell time before the first bell,
          <br />
          and families saw the same truth dispatch sees?
        </h2>
        <PracticeLoop />
      </div>
    </SlideShell>
  );
}

function Slide6Intro() {
  return (
    <SlideShell>
      <StreetGrid />
      <div className="relative flex h-full flex-col items-center justify-center px-16">
        <IntroWordStack />
      </div>
    </SlideShell>
  );
}

function Slide6() {
  return (
    <SlideShell progress={1}>
      <div className="flex h-full flex-col px-14 pb-12 pt-9">
        <SlideRule label="The platform" n="07" />
        <div className="mt-4 flex items-center gap-3">
          <SpinMark size={30} />
          <h2 className="pitch-in-head font-display text-[30px] font-bold leading-tight tracking-tight">
            DART plans, rehearses, and runs the bus day on one platform.
          </h2>
        </div>
        <div className="mt-7 grid flex-1 grid-cols-3 gap-5">
          <div className="pitch-in-card" data-i="0">
            <div className="font-display text-[18px] font-bold">Districts</div>
            <p className="mt-1 text-[13px] leading-relaxed text-slate">Import, route, stress-test, dispatch</p>
            <div className="mt-4">
              <PlannerMapCrop />
            </div>
          </div>
          <div className="pitch-in-card" data-i="1">
            <div className="font-display text-[18px] font-bold">Drivers</div>
            <p className="mt-1 text-[13px] leading-relaxed text-slate">A run sheet that updates</p>
            <div className="mt-4">
              <DriverRunSheetCrop />
            </div>
          </div>
          <div className="pitch-in-card" data-i="2">
            <div className="font-display text-[18px] font-bold">Families</div>
            <p className="mt-1 text-[13px] leading-relaxed text-slate">One honest ETA, only for their riders</p>
            <div className="mt-4">
              <GuardianTrackCrop />
            </div>
          </div>
        </div>
        <p className="mt-5 text-[13px] text-slate">Proof of concept for HackKentucky. Synthetic demo data.</p>
      </div>
    </SlideShell>
  );
}

function Slide7() {
  const stages = [
    { title: "Import", sub: "CSV mapper" },
    { title: "OR-Tools routes", sub: "Capacitated VRP-TW" },
    { title: "P50 / P90 overlay", sub: "sklearn + late classifier" },
    { title: "Monte Carlo twin", sub: "N simulations" },
    { title: "Live GPS sim", sub: "WebSockets + Celery" },
    { title: "Board + mobile", sub: "Vite React + Expo" },
  ];
  const stack = [
    { group: "Backend", items: ["Django 5", "DRF", "Channels", "Celery", "Postgres / PostGIS", "Redis"] },
    { group: "Routing · ML", items: ["OR-Tools", "scikit-learn", "joblib", "NumPy"] },
    { group: "Clients", items: ["Vite", "React", "TypeScript", "Tailwind", "Expo", "MapLibre"] },
  ];
  return (
    <SlideShell progress={2}>
      <div className="flex h-full flex-col justify-center px-12 py-8">
        <SlideRule label="Architecture" n="08" />
        <h2 className="pitch-in-head mt-4 font-display text-[28px] font-bold tracking-tight">Architecture at a glance</h2>
        <div className="mt-6">
          <PipelineTrack />
        </div>
        <div className="relative mt-1">
          <div className="relative z-10 grid grid-cols-6 gap-3">
            {stages.map((s, i) => (
              <div key={s.title} data-i={i} className="pitch-in-card rounded-xl border border-line bg-paper px-3 pb-3 pt-3">
                <div className="mb-3 h-2.5 w-2.5 rounded-full bg-route" />
                <div className="font-mono text-[11px] font-semibold uppercase leading-snug tracking-[0.08em]">{s.title}</div>
                <div className="mt-1 text-[11px] leading-snug text-slate">{s.sub}</div>
                {i === 5 ? (
                  <div className="mt-2 flex gap-2 text-[10px] font-semibold text-slate">
                    <span>Monitor</span>
                    <span>Phone</span>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-7">
          <div className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-slate">Tech stack</div>
          <div className="mt-3 grid grid-cols-3 gap-4">
            {stack.map((col, i) => (
              <div key={col.group} data-i={i} className="pitch-in-card">
                <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-route">{col.group}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {col.items.map((item) => (
                    <span
                      key={item}
                      className="rounded-md border border-line bg-canvas px-2 py-1 font-mono text-[11px] font-medium text-ink"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-6 text-[15px] font-medium text-ink">Same API. Role-scoped views. Tenant-isolated.</p>
      </div>
    </SlideShell>
  );
}

function Slide8() {
  return (
    <SlideShell progress={3}>
      <div className="flex h-full flex-col px-14 py-9">
        <SlideRule label="Reliability" n="09" />
        <h2 className="pitch-in-head mt-5 font-display text-[30px] font-bold tracking-tight">Routes that survive a bad morning.</h2>
        <div className="mt-5 grid grid-cols-2 gap-6">
          <div>
            <div className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-slate">Fastest (P50)</div>
            <p className="mt-2 text-[15px] leading-relaxed">Shortest miles, optimistic dwell, fewer buses.</p>
          </div>
          <div>
            <div className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-slate">Reliability (P90 + late risk)</div>
            <p className="mt-2 text-[15px] leading-relaxed">P90 travel time, real wheelchair dwell, on-time probability.</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-[1.3fr_0.9fr] items-start gap-5">
          <ComparePanelCrop />
          <WhyInfeasibleBubble />
        </div>
        <p className="mt-5 rounded-xl border border-warn/30 bg-[#FFFBF5] px-4 py-3 text-[14px] font-medium text-ink">
          The 2023 plan assumed 30 seconds per stop and inflated rider counts. DART won’t let you.
        </p>
      </div>
    </SlideShell>
  );
}

function Slide9() {
  return (
    <SlideShell progress={4}>
      <div className="flex h-full flex-col px-14 py-9">
        <SlideRule label="Digital twin" n="10" />
        <h2 className="pitch-in-head mt-5 font-display text-[30px] font-bold leading-tight tracking-tight">
          Run the morning 500 times before a single kid boards.
        </h2>
        <p className="mt-2 text-[15px] text-slate">Toggle rain and traffic. Read on-time probability. Fix the plan, not the news cycle.</p>
        <div className="mt-6 grid flex-1 grid-cols-[1.7fr_1fr] gap-5">
          <TwinChartCrop />
          <TwinToggles />
        </div>
        <p className="mt-3 text-[13px] text-slate">Dry run in software before kids board.</p>
      </div>
    </SlideShell>
  );
}

function Slide10() {
  const frames = [
    { label: "Start demo", node: <LiveBoardCrop /> },
    { label: "Buses move", node: <LiveBoardCrop /> },
    { label: "Disruption", node: <LiveBoardCrop alert /> },
    { label: "Alert + ETA", node: <GuardianTrackCrop delayed /> },
  ];
  return (
    <SlideShell progress={5}>
      <RadarBackdrop />
      <div className="relative flex h-full flex-col px-12 py-8">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <SlideRule label="Live ops" n="11" />
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-paper px-3 py-1.5">
            <LiveDot />
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-slate">Websocket · live</span>
          </span>
        </div>
        <h2 className="pitch-in-head mt-4 font-display text-[26px] font-bold tracking-tight">
          One board for dispatch. One honest ETA for families.
        </h2>
        <p className="mt-1 text-[13px] text-slate">One click starts the day. One injected delay. Dispatcher and guardian update together.</p>
        <div className="mt-4 grid grid-cols-4 gap-3">
          {frames.map((f, i) => (
            <div key={f.label} data-i={i} className="pitch-in-card">
              <div className="mb-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-slate">{f.label}</div>
              {f.node}
            </div>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4">
          <div className="rounded-2xl border border-line bg-canvas px-5 py-4">
            <div className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-slate">2023</div>
            <p className="mt-1 text-[16px] font-semibold leading-snug">Help line closed at 7 PM with kids still riding.</p>
          </div>
          <div className="rounded-2xl border border-line bg-canvas px-5 py-4">
            <div className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-route">DART</div>
            <p className="mt-1 text-[16px] font-semibold leading-snug">The board never closes, and the family hears first.</p>
          </div>
        </div>
      </div>
    </SlideShell>
  );
}

function Slide11() {
  return (
    <SlideShell progress={6}>
      <div className="relative flex h-full flex-col px-14 pb-14 pt-10">
        <SyntheticChip className="absolute right-14 top-[42px]" />
        <SlideRule label="Guardian trust" n="12" />
        <h2 className="pitch-in-head mt-5 font-display text-[30px] font-bold tracking-tight">Guardian trust</h2>
        <p className="mt-1 font-mono text-[12px] font-medium uppercase tracking-[0.12em] text-slate">Today · Track · Updates · Absence</p>
        <div className="mt-5 flex min-h-0 flex-1 items-stretch justify-center gap-3">
          <div className="w-[168px]">
            <PhoneToday />
          </div>
          <div className="w-[168px] translate-y-2">
            <PhoneTrack />
          </div>
          <div className="w-[168px]">
            <PhoneUpdates />
          </div>
          <div className="w-[168px] translate-y-2">
            <PhoneAbsence />
          </div>
        </div>
        <p className="mt-5 text-[16px] font-semibold">Only your riders. Never the manifest.</p>
      </div>
    </SlideShell>
  );
}

function Slide12() {
  const steps = [
    "Sign in as district admin, Jefferson Demo Schools",
    "Generate Reliability plan, compare to Fastest",
    "Stress the morning in the twin (rain + traffic)",
    "Start live demo, inject a delay",
    "Dispatcher board and guardian phone, side by side",
  ];
  return (
    <SlideShell progress={7}>
      <div className="grid h-full grid-cols-[1.05fr_1.15fr] gap-8 px-12 pb-14 pt-9">
        <div className="flex flex-col">
          <SlideRule label="Demo" n="13" />
          <h2 className="pitch-in-head mt-5 font-display text-[28px] font-bold tracking-tight">Demo walkthrough</h2>
          <ol className="mt-6 flex flex-col gap-4">
            {steps.map((s, i) => (
              <li key={s} data-i={i} className="pitch-in-card flex gap-3">
                <span className="font-mono text-[22px] font-semibold leading-none tabular-nums text-route">{String(i + 1).padStart(2, "0")}</span>
                <span className="pt-1 text-[16px] font-medium leading-snug">{s}</span>
              </li>
            ))}
          </ol>
          <p className="mt-auto text-[13px] text-slate">All names, addresses, and GPS are fictional.</p>
        </div>
        <div className="flex items-center">
          <DualScreenComposite />
        </div>
      </div>
    </SlideShell>
  );
}

function Slide13() {
  return (
    <SlideShell progress={8}>
      <div className="flex h-full flex-col px-16 pb-14 pt-11">
        <SlideRule label="Roadmap" n="14" />
        <h2 className="pitch-in-head mt-5 font-display text-[32px] font-bold tracking-tight">What’s next</h2>
        <div className="mt-8 grid flex-1 grid-cols-2 gap-10">
          <div>
            <div className="font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-route">Today (hackathon)</div>
            <ul className="mt-4 flex flex-col gap-3 text-[16px] leading-snug">
              {["Synthetic riders and GPS", "Simulated ML labels", "Demo auth", "One fictional district"].map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-route" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-slate">Before any district could use this</div>
            <ul className="mt-4 flex flex-col gap-3 text-[16px] leading-snug">
              {["SIS sync", "Real AVL hardware", "FERPA and COPPA review", "Hardened auth, push at scale", "Certified routing and navigation"].map((item) => (
                <li key={item} className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-line" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="font-display text-[22px] font-bold tracking-tight">Not production. Not certified. Not shipping Monday.</p>
      </div>
    </SlideShell>
  );
}

function Slide14() {
  return (
    <SlideShell>
      <StreetGrid />
      <div className="relative grid h-full grid-cols-[0.9fr_1.2fr] gap-8 px-16 py-12">
        <div className="flex flex-col items-center justify-center">
          <AnalogClock hour={17} minute={41} minuteTone="blue" size={260} />
        </div>
        <div className="flex flex-col justify-center">
          <SlideRule label="Close" n="15" />
          <div className="mt-6">
            <SpinMark size={40} />
          </div>
          <h2 className="pitch-in-head mt-5 font-display text-[40px] font-bold leading-tight tracking-tight">Last kid home. By design.</h2>
          <p className="mt-4 font-mono text-[12px] font-medium uppercase tracking-[0.14em] text-slate">
            Rahbe Abass + Aditya Mendiratta
          </p>
          <p className="mt-1 text-[15px] text-slate">DART · HackKentucky 2026</p>
          <Link
            to="/login?guide=1"
            className="mt-6 inline-flex w-fit items-center rounded-xl bg-route px-5 py-2.5 text-[14px] font-semibold text-white"
          >
            Start guided demo
          </Link>
          <p className="mt-3 text-[13px] text-muted">jefferson.demo · DemoPass123!</p>
          <p className="mt-10 text-[11px] text-muted">
            Proof of concept. Synthetic demo data. Not affiliated with any district.
          </p>
        </div>
      </div>
    </SlideShell>
  );
}
