import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, X, Pause, Play, Plus, Minus } from "lucide-react";
import heroPull from "@/assets/hero-pull.jpg";

export const Route = createFileRoute("/workout")({
  head: () => ({
    meta: [
      { title: "Active session — Training System" },
      {
        name: "description",
        content: "Live training session. Log sets, track rest, finish strong.",
      },
    ],
  }),
  component: WorkoutPage,
});

interface SetData {
  weight: number;
  targetReps: number;
  reps: number;
  status: "done" | "active" | "pending";
}

function format(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function WorkoutPage() {
  const navigate = useNavigate();

  const [sessionSec, setSessionSec] = useState(2538);
  useEffect(() => {
    const id = setInterval(() => setSessionSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const [sets, setSets] = useState<SetData[]>([
    { weight: 315, targetReps: 8, reps: 8, status: "done" },
    { weight: 315, targetReps: 8, reps: 0, status: "active" },
    { weight: 315, targetReps: 8, reps: 0, status: "pending" },
    { weight: 315, targetReps: 8, reps: 0, status: "pending" },
  ]);

  const [restSec, setRestSec] = useState(102);
  const [restRunning, setRestRunning] = useState(true);
  const REST_TARGET = 120;
  useEffect(() => {
    if (!restRunning) return;
    const id = setInterval(() => setRestSec((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [restRunning]);

  function logActiveSet() {
    setSets((prev) => {
      const next = [...prev];
      const idx = next.findIndex((s) => s.status === "active");
      if (idx === -1) return prev;
      next[idx] = { ...next[idx], reps: next[idx].targetReps, status: "done" };
      const nextIdx = next.findIndex((s, i) => i > idx && s.status === "pending");
      if (nextIdx !== -1) next[nextIdx] = { ...next[nextIdx], status: "active" };
      return next;
    });
    setRestSec(REST_TARGET);
    setRestRunning(true);
  }

  const completed = sets.filter((s) => s.status === "done").length;
  const progress = (completed / sets.length) * 100;
  const restPct = Math.max(0, Math.min(100, ((REST_TARGET - restSec) / REST_TARGET) * 100));

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto max-w-md px-5 pt-5 pb-8">
        {/* Top bar */}
        <header className="flex items-center justify-between">
          <button
            onClick={() => navigate({ to: "/" })}
            className="grid size-10 place-items-center rounded-full bg-white/[0.06] ring-1 ring-white/10 hover:bg-white/10 transition-colors"
            aria-label="Exit"
          >
            <X className="size-4" />
          </button>
          <div className="flex items-center gap-2 rounded-full bg-strain/15 px-3 py-1.5 ring-1 ring-strain/30">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-strain opacity-60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-strain" />
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-strain">
              Live
            </span>
          </div>
          <div className="font-mono text-[12px] tabular-nums text-muted-foreground">
            {format(sessionSec)}
          </div>
        </header>

        {/* Hero — exercise cover */}
        <section className="mt-5 relative overflow-hidden rounded-3xl ring-1 ring-white/5">
          <div className="relative aspect-[16/10]">
            <img
              src={heroPull}
              alt="Barbell row"
              width={1152}
              height={720}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-5">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-recovery">
                Exercise 04 of 06
              </p>
              <h1 className="mt-1.5 font-display text-[34px] font-black uppercase leading-[0.95] tracking-[-0.03em]">
                Barbell Row
              </h1>
            </div>
          </div>

          {/* Progress strip */}
          <div className="bg-card px-5 py-4">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                Session progress
              </span>
              <span className="font-mono text-[11px] tabular-nums">
                <span className="text-recovery">{completed}</span>
                <span className="text-muted-foreground">/{sets.length} sets</span>
              </span>
            </div>
            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
              <div
                className="h-full rounded-full bg-recovery transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </section>

        {/* Target chips */}
        <section className="mt-4 grid grid-cols-3 gap-2.5">
          <Chip label="Weight" value="315" unit="LBS" />
          <Chip label="Reps" value="8" unit="TARGET" />
          <Chip label="Tempo" value="3-1-1" unit="ECC" />
        </section>

        {/* Sets list — card style */}
        <section className="mt-5 space-y-2">
          {sets.map((s, i) => {
            const isDone = s.status === "done";
            const isActive = s.status === "active";
            return (
              <div
                key={i}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 transition-all ${
                  isActive
                    ? "bg-card ring-1 ring-recovery/40"
                    : isDone
                    ? "bg-white/[0.03] ring-1 ring-white/5"
                    : "bg-white/[0.02] ring-1 ring-white/5 opacity-50"
                }`}
              >
                <div
                  className={`grid size-9 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold tabular-nums ${
                    isDone
                      ? "bg-recovery text-background"
                      : isActive
                      ? "bg-foreground text-background"
                      : "bg-white/5 text-muted-foreground"
                  }`}
                >
                  {isDone ? <Check className="size-4 stroke-[3]" /> : i + 1}
                </div>
                <div className="flex-1">
                  <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                    Set {i + 1}
                  </p>
                  <p className="mt-0.5 font-display text-[15px] font-semibold tabular-nums">
                    {s.weight}
                    <span className="mx-1.5 text-muted-foreground">×</span>
                    {isDone ? s.reps : isActive ? "—" : s.targetReps}
                    <span className="ml-1 font-mono text-[10px] font-normal text-muted-foreground">
                      {isDone ? "reps" : isActive ? "log now" : "queued"}
                    </span>
                  </p>
                </div>
                {isActive && (
                  <button
                    onClick={logActiveSet}
                    className="rounded-full bg-recovery px-4 py-2 font-display text-[11px] font-bold uppercase tracking-[0.15em] text-background transition-transform active:scale-95"
                  >
                    Log
                  </button>
                )}
              </div>
            );
          })}
        </section>

        {/* Rest timer — large card */}
        <section className="mt-6 relative overflow-hidden rounded-3xl p-6 ring-1 ring-white/[0.08] bg-gradient-to-br from-white/[0.06] via-white/[0.02] to-transparent shadow-[0_20px_60px_-30px_rgba(0,0,0,0.8)]">
          <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-16 size-56 rounded-full bg-strain/20 blur-3xl" />
          <div className="flex items-baseline justify-between">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-strain">
              Rest interval
            </p>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Target {format(REST_TARGET)}
            </span>
          </div>

          <div className="mt-4 flex items-center gap-5">
            <div className="flex-1">
              <p className="font-display text-[72px] font-black leading-none tracking-[-0.04em] tabular-nums">
                {format(restSec)}
              </p>
              <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/[0.07]">
                <div
                  className="h-full rounded-full bg-strain transition-all duration-1000 ease-linear"
                  style={{ width: `${restPct}%` }}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setRestSec((s) => s + 15)}
                className="grid size-10 place-items-center rounded-full bg-white/[0.06] ring-1 ring-white/10 hover:bg-white/10"
                aria-label="Add 15s"
              >
                <Plus className="size-4" />
              </button>
              <button
                onClick={() => setRestRunning((r) => !r)}
                className="grid size-12 place-items-center rounded-full bg-foreground text-background transition-transform active:scale-95"
                aria-label={restRunning ? "Pause" : "Resume"}
              >
                {restRunning ? <Pause className="size-5" /> : <Play className="size-5" />}
              </button>
              <button
                onClick={() => setRestSec((s) => Math.max(0, s - 15))}
                className="grid size-10 place-items-center rounded-full bg-white/[0.06] ring-1 ring-white/10 hover:bg-white/10"
                aria-label="Subtract 15s"
              >
                <Minus className="size-4" />
              </button>
            </div>
          </div>
        </section>

        {/* Finish */}
        <button
          onClick={() => navigate({ to: "/" })}
          className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-foreground text-background transition-transform active:scale-[0.985] hover:bg-recovery"
        >
          <span className="font-display text-[14px] font-bold uppercase tracking-[0.16em]">
            Finish workout
          </span>
        </button>
      </div>
    </main>
  );
}

function Chip({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-2xl bg-gradient-to-b from-white/[0.05] to-white/[0.01] px-4 py-3 ring-1 ring-white/[0.07]">
      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-[20px] font-bold leading-none tabular-nums">
        {value}
      </p>
      <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/60">
        {unit}
      </p>
    </div>
  );
}
