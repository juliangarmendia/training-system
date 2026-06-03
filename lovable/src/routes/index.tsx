import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, Settings, ChevronRight, Flame, Activity, Moon, Zap, Check, Dumbbell, Heart, Wind } from "lucide-react";
import heroPull from "@/assets/hero-pull.jpg";
import queueLegs from "@/assets/queue-legs.jpg";
import queuePush from "@/assets/queue-push.jpg";
import queueRest from "@/assets/queue-rest.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Today — Training System" },
      {
        name: "description",
        content: "Your training command center. Recovery, strain, and today's session.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const [today, setToday] = useState<{ weekday: string; date: string } | null>(null);
  useEffect(() => {
    const d = new Date();
    setToday({
      weekday: d.toLocaleDateString("en-US", { weekday: "long" }),
      date: d.toLocaleDateString("en-US", { day: "numeric", month: "long" }),
    });
  }, []);

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto max-w-md px-5 pt-6 pb-32">
        {/* Top bar */}
        <header className="flex items-center justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              Today
            </p>
            <p className="mt-1 font-display text-[15px] font-semibold tracking-tight">
              {today?.weekday ?? "—"}
              <span className="ml-2 text-muted-foreground font-normal">
                {today?.date ?? ""}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <IconBtn><Bell className="size-4" /></IconBtn>
            <IconBtn><Settings className="size-4" /></IconBtn>
            <div className="ml-1 grid size-9 place-items-center rounded-full bg-gradient-to-br from-recovery/80 to-strain/80 font-display text-[13px] font-bold text-background">
              JG
            </div>
          </div>
        </header>

        {/* Recovery hero — Whoop-style ring + huge % */}
        <section className="mt-6 relative overflow-hidden rounded-3xl p-6 ring-1 ring-white/[0.08] bg-gradient-to-br from-white/[0.06] via-white/[0.02] to-transparent backdrop-blur-xl shadow-[0_20px_60px_-30px_rgba(0,0,0,0.8)]">
          <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 size-56 rounded-full bg-recovery/20 blur-3xl" />
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              Recovery
            </p>
            <span className="rounded-full bg-recovery/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.2em] text-recovery">
              Primed
            </span>
          </div>

          <div className="mt-5 flex items-center gap-6">
            <RecoveryRing value={84} />
            <div className="flex-1">
              <p className="font-display text-[64px] font-black leading-none tracking-[-0.04em] text-recovery tabular-nums">
                84<span className="text-[28px] align-top">%</span>
              </p>
              <p className="mt-2 max-w-[18ch] text-[13px] leading-snug text-muted-foreground">
                Your body is ready for high strain today.
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3">
            <Vital icon={<Activity className="size-3.5" />} label="HRV" value="68" unit="ms" tone="recovery" />
            <Vital icon={<Flame className="size-3.5" />} label="RHR" value="52" unit="bpm" tone="strain" />
            <Vital icon={<Moon className="size-3.5" />} label="Sleep" value="7h 42" unit="" tone="sleep" />
          </div>
        </section>

        {/* Weekly calendar — compact tracking strip */}
        <WeekCalendar />

        {/* Today's session — Peloton-style full-bleed cover */}
        <section className="mt-6">
          <div className="mb-3 flex items-baseline justify-between px-1">
            <h2 className="font-display text-[18px] font-bold tracking-tight">
              Today's session
            </h2>
            <Link to="/workout" className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground">
              Detail
            </Link>
          </div>

          <Link to="/workout" className="group relative block overflow-hidden rounded-3xl ring-1 ring-white/5">
            <div className="relative aspect-[4/5]">
              <img
                src={heroPull}
                alt="Heavy pull session"
                width={1152}
                height={1408}
                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />

              {/* Top chips */}
              <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
                <span className="rounded-full bg-background/60 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-foreground backdrop-blur-md ring-1 ring-white/10">
                  Hypertrophy · Day 1
                </span>
                <span className="flex items-center gap-1.5 rounded-full bg-background/60 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-energy backdrop-blur-md ring-1 ring-white/10">
                  <Zap className="size-3" /> Heavy
                </span>
              </div>

              {/* Bottom content */}
              <div className="absolute inset-x-0 bottom-0 p-5">
                <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-recovery">
                  45 min · 6 exercises · 22 sets
                </p>
                <h3 className="mt-2 font-display text-[40px] font-black uppercase leading-[0.92] tracking-[-0.03em]">
                  Pull A<br />Back & Biceps
                </h3>

                <button className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-background transition-transform active:scale-[0.98]">
                  <span className="font-display text-[13px] font-bold uppercase tracking-[0.15em]">
                    Start workout
                  </span>
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          </Link>
        </section>

        {/* Stat trio — Whoop dashboard cards */}
        <section className="mt-5 grid grid-cols-3 gap-2.5">
          <StatCard label="Strain" value="14.2" sub="/ 21" tone="strain" trend="+2.1" />
          <StatCard label="Streak" value="14" sub="DAYS" tone="energy" trend="🔥" />
          <StatCard label="Volume" value="42K" sub="LBS" tone="recovery" trend="+8%" />
        </section>

        {/* Queue — Peloton class list */}
        <section className="mt-8">
          <div className="mb-3 flex items-baseline justify-between px-1">
            <h2 className="font-display text-[18px] font-bold tracking-tight">
              This week
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              3 ahead
            </span>
          </div>

          <ul className="space-y-2.5">
            <QueueRow
              img={queueLegs}
              day="Tue"
              title="Legs & Core"
              meta="80 min · Heavy"
              tone="strain"
            />
            <QueueRow
              img={queuePush}
              day="Wed"
              title="Push B — Chest focus"
              meta="70 min · Medium"
              tone="energy"
            />
            <QueueRow
              img={queueRest}
              day="Thu"
              title="Mobility & recovery"
              meta="30 min · Low"
              tone="recovery"
            />
          </ul>
        </section>
      </div>

      <BottomNav />
    </main>
  );
}

type SessionType = "lift" | "run" | "mobility" | "rest";

type DayPlan = {
  label: string;
  date: number;
  type: SessionType;
  title: string;
  duration: string;
  status: "done" | "today" | "upcoming" | "missed";
};

function WeekCalendar() {
  const todayIdx = 1; // Tue = today in this mock
  const [completed, setCompleted] = useState<Record<number, boolean>>({ 0: true });

  const week: DayPlan[] = [
    { label: "Mon", date: 24, type: "lift", title: "Pull A", duration: "45m", status: completed[0] ? "done" : "missed" },
    { label: "Tue", date: 25, type: "lift", title: "Pull A — Back & Biceps", duration: "45m", status: "today" },
    { label: "Wed", date: 26, type: "lift", title: "Legs & Core", duration: "80m", status: "upcoming" },
    { label: "Thu", date: 27, type: "run", title: "Zone 2 run", duration: "40m", status: "upcoming" },
    { label: "Fri", date: 28, type: "lift", title: "Push B — Chest", duration: "70m", status: "upcoming" },
    { label: "Sat", date: 29, type: "run", title: "Long run · 12km", duration: "75m", status: "upcoming" },
    { label: "Sun", date: 30, type: "mobility", title: "Mobility & recovery", duration: "30m", status: "upcoming" },
  ];

  const doneCount = week.filter((d, i) => (i === 0 ? completed[0] : false)).length;

  return (
    <section className="mt-5">
      <div className="mb-3 flex items-baseline justify-between px-1">
        <h2 className="font-display text-[18px] font-bold tracking-tight">This week</h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {doneCount}/{week.length} <span className="text-foreground/40">done</span>
        </span>
      </div>

      {/* Day strip */}
      <div className="grid grid-cols-7 gap-1.5">
        {week.map((d, i) => {
          const isToday = i === todayIdx;
          const isDone = d.status === "done";
          const isMissed = d.status === "missed";
          const tone = typeTone(d.type);
          return (
            <button
              key={i}
              onClick={() => {
                if (i === 0) setCompleted((p) => ({ ...p, 0: !p[0] }));
              }}
              className={`group relative flex flex-col items-center gap-1.5 rounded-2xl p-2 pt-2.5 ring-1 transition-all ${
                isToday
                  ? "bg-foreground text-background ring-foreground/20 shadow-[0_8px_24px_-12px_rgba(255,255,255,0.3)]"
                  : "bg-white/[0.03] ring-white/[0.06] hover:bg-white/[0.06] hover:ring-white/10"
              }`}
            >
              <span
                className={`font-mono text-[8.5px] uppercase tracking-[0.2em] ${
                  isToday ? "text-background/60" : "text-muted-foreground"
                }`}
              >
                {d.label}
              </span>
              <span
                className={`font-display text-[16px] font-bold leading-none tabular-nums ${
                  isToday ? "text-background" : isMissed ? "text-muted-foreground/50" : "text-foreground"
                }`}
              >
                {d.date}
              </span>

              {/* Status dot / check */}
              <div className="mt-0.5 grid h-4 place-items-center">
                {isDone ? (
                  <div className={`grid size-4 place-items-center rounded-full ${tone.bg}`}>
                    <Check className="size-2.5 text-background" strokeWidth={3.5} />
                  </div>
                ) : isMissed ? (
                  <span className="block size-1 rounded-full bg-muted-foreground/40" />
                ) : (
                  <span className={`block h-1 w-4 rounded-full ${isToday ? "bg-background/40" : tone.bg + " opacity-70"}`} />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Historial button */}
      <Link
        to="/"
        className="mt-3 flex items-center justify-between rounded-2xl bg-white/[0.03] px-4 py-3 ring-1 ring-white/[0.06] transition-all hover:bg-white/[0.06] hover:ring-white/10"
      >
        <div className="flex items-center gap-2.5">
          <div className="grid size-7 place-items-center rounded-lg bg-white/[0.05] ring-1 ring-white/5">
            <Activity className="size-3.5 text-muted-foreground" />
          </div>
          <span className="font-display text-[13px] font-semibold tracking-tight">
            Historial
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
            All workouts
          </span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </div>
      </Link>
    </section>
  );
}

function typeTone(type: SessionType) {
  switch (type) {
    case "lift":
      return { icon: Dumbbell, text: "text-strain", bg: "bg-strain", tint: "bg-strain/10" };
    case "run":
      return { icon: Heart, text: "text-recovery", bg: "bg-recovery", tint: "bg-recovery/10" };
    case "mobility":
      return { icon: Wind, text: "text-sleep", bg: "bg-sleep", tint: "bg-sleep/10" };
    case "rest":
    default:
      return { icon: Moon, text: "text-muted-foreground", bg: "bg-muted-foreground", tint: "bg-white/5" };
  }
}

function RecoveryRing({ value }: { value: number }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  return (
    <div className="relative size-[100px] shrink-0">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="oklch(1 0 0 / 0.08)" strokeWidth="6" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="var(--recovery)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
          REC
        </span>
      </div>
    </div>
  );
}

function Vital({
  icon,
  label,
  value,
  unit,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  tone: "recovery" | "strain" | "sleep" | "energy";
}) {
  const color = {
    recovery: "text-recovery",
    strain: "text-strain",
    sleep: "text-sleep",
    energy: "text-energy",
  }[tone];
  return (
    <div className="rounded-2xl bg-white/[0.03] p-3 ring-1 ring-white/5">
      <div className={`flex items-center gap-1.5 ${color}`}>
        {icon}
        <span className="font-mono text-[9px] uppercase tracking-[0.2em]">
          {label}
        </span>
      </div>
      <p className="mt-1.5 font-display text-[20px] font-bold tabular-nums leading-none">
        {value}
        {unit && <span className="ml-1 text-[11px] font-medium text-muted-foreground">{unit}</span>}
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
  trend,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "recovery" | "strain" | "sleep" | "energy";
  trend?: string;
}) {
  const color = {
    recovery: "text-recovery",
    strain: "text-strain",
    sleep: "text-sleep",
    energy: "text-energy",
  }[tone];
  return (
    <div className="rounded-2xl bg-gradient-to-b from-white/[0.05] to-white/[0.01] p-4 ring-1 ring-white/[0.07] shadow-[0_10px_30px_-20px_rgba(0,0,0,0.6)]">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </p>
        {trend && (
          <span className="font-mono text-[9px] text-muted-foreground/70">{trend}</span>
        )}
      </div>
      <p className={`mt-3 font-display text-[26px] font-black leading-none tracking-[-0.02em] tabular-nums ${color}`}>
        {value}
      </p>
      <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/70">
        {sub}
      </p>
    </div>
  );
}

function QueueRow({
  img,
  day,
  title,
  meta,
  tone,
}: {
  img: string;
  day: string;
  title: string;
  meta: string;
  tone: "recovery" | "strain" | "sleep" | "energy";
}) {
  const dot = {
    recovery: "bg-recovery",
    strain: "bg-strain",
    sleep: "bg-sleep",
    energy: "bg-energy",
  }[tone];
  return (
    <li>
      <button className="group flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-white/[0.05] to-white/[0.01] p-2 ring-1 ring-white/[0.07] transition-all hover:ring-white/15 hover:from-white/[0.08]">
        <div className="relative size-16 shrink-0 overflow-hidden rounded-xl">
          <img
            src={img}
            alt=""
            width={256}
            height={256}
            loading="lazy"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-background/20" />
        </div>
        <div className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className={`size-1.5 rounded-full ${dot}`} />
            <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
              {day}
            </span>
          </div>
          <p className="mt-1 truncate font-display text-[15px] font-semibold tracking-tight">
            {title}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{meta}</p>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
      </button>
    </li>
  );
}

function IconBtn({ children }: { children: React.ReactNode }) {
  return (
    <button className="grid size-9 place-items-center rounded-full bg-white/[0.06] text-foreground/80 ring-1 ring-white/10 transition-colors hover:bg-white/10 hover:text-foreground">
      {children}
    </button>
  );
}

function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-4 z-30 mx-auto max-w-[360px] px-4">
      <div className="flex items-center justify-around rounded-full bg-card/90 px-2 py-2 ring-1 ring-white/10 backdrop-blur-xl shadow-2xl shadow-black/40">
        <NavItem label="Today" active />
        <NavItem label="Train" />
        <NavItem label="Body" />
        <NavItem label="You" />
      </div>
    </nav>
  );
}

function NavItem({ label, active }: { label: string; active?: boolean }) {
  return (
    <button
      className={`rounded-full px-4 py-2 font-display text-[11px] font-bold uppercase tracking-[0.14em] transition-colors ${
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}
