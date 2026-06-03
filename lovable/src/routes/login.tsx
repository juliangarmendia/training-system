import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import heroPull from "@/assets/hero-pull.jpg";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Training System" },
      {
        name: "description",
        content: "Access your Training System. Built for athletes who measure everything.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    navigate({ to: "/" });
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-background text-foreground">
      {/* Full-bleed cinematic backdrop */}
      <div className="pointer-events-none absolute inset-0">
        <img
          src={heroPull}
          alt=""
          aria-hidden
          className="h-full w-full object-cover opacity-[0.35]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background" />
      </div>

      <div className="relative mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-8 pb-8">
        {/* Top bar */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="grid size-7 place-items-center rounded-md bg-foreground text-background">
              <span className="font-display text-[13px] font-black leading-none">T</span>
            </div>
            <span className="font-display text-[13px] font-bold uppercase tracking-[0.18em]">
              Training System
            </span>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            v2.0
          </span>
        </header>

        {/* Hero copy */}
        <section className="mt-auto pt-32">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-recovery">
            Welcome back
          </p>
          <h1 className="mt-4 font-display text-[64px] font-black uppercase leading-[0.88] tracking-[-0.035em]">
            Train<br />with<br />precision.
          </h1>
          <p className="mt-6 max-w-[28ch] text-[15px] leading-relaxed text-muted-foreground">
            Personalized strength programming, recovery and strain — engineered into a single signal.
          </p>
        </section>

        {/* Form */}
        <form className="mt-10 space-y-5" onSubmit={onSubmit}>
          <Field
            id="email"
            label="Email"
            type="email"
            placeholder="you@athlete.com"
            value={email}
            onChange={setEmail}
          />
          <Field
            id="password"
            label="Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={setPassword}
          />

          <button
            type="submit"
            className="group mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-foreground text-background transition-transform active:scale-[0.985] hover:bg-recovery"
          >
            <span className="font-display text-[15px] font-bold uppercase tracking-[0.14em]">
              Continue
            </span>
            <span className="transition-transform group-hover:translate-x-1">→</span>
          </button>
        </form>

        <footer className="mt-8 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          <button className="hover:text-foreground transition-colors">
            Create account
          </button>
          <span className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-recovery" />
            Encrypted
          </span>
        </footer>
      </div>
    </main>
  );
}

function Field({
  id,
  label,
  type,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="rounded-2xl bg-white/[0.04] px-5 py-3.5 ring-1 ring-white/10 backdrop-blur-xl transition-colors focus-within:ring-recovery/60">
      <label
        htmlFor={id}
        className="block font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 h-7 w-full bg-transparent text-[16px] text-foreground outline-none placeholder:text-muted-foreground/40"
      />
    </div>
  );
}
