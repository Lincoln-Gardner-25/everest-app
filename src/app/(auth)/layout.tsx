import { Mountain } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      {/* Left brand panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20">
            <Mountain className="h-5 w-5 text-white" />
          </div>
          <span
            className="text-2xl font-bold text-white"
            style={{ fontFamily: "var(--font-libre-baskerville)" }}
          >
            Everest
          </span>
        </div>
        <div>
          <h2
            className="text-4xl font-bold text-white leading-tight mb-4"
            style={{ fontFamily: "var(--font-libre-baskerville)" }}
          >
            Know your worth. <br /> Climb your peak.
          </h2>
          <p className="text-white/75 text-lg leading-relaxed max-w-md">
            Track your time, measure your income per hour, and build a freelance
            career that actually pays what you deserve.
          </p>
        </div>
        <p className="text-white/50 text-sm">Built for freelance videographers.</p>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Mountain className="h-4 w-4 text-primary-foreground" />
            </div>
            <span
              className="text-xl font-bold"
              style={{ fontFamily: "var(--font-libre-baskerville)" }}
            >
              Everest
            </span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
