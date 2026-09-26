const PHASES = [
  { id: "A", label: "Creative", plane: "LOCAL", detail: "CPU + local agents" },
  { id: "B", label: "Assets", plane: "LOCAL", detail: "cached + rights checked" },
  { id: "C", label: "Audio", plane: "LOCAL", detail: "Kokoro + timing spine" },
  { id: "D", label: "Render", plane: "HYBRID", detail: "FFmpeg / AWS Fargate" },
  { id: "E", label: "State", plane: "MANAGED", detail: "Neon + Upstash" },
] as const;

export function HybridExecutionStrip() {
  return (
    <section className="rounded-lg border border-border bg-bg-surface p-3" aria-label="Hybrid execution policy">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[9px] font-mono uppercase tracking-widest text-text-muted">Execution boundary</span>
        <span className="text-[9px] font-mono text-accent">8GB SERIALIZED</span>
      </div>
      <div className="grid gap-1 sm:grid-cols-5">
        {PHASES.map((phase) => (
          <div key={phase.id} className="border border-border bg-bg-elevated/40 px-2 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono text-text-muted">P{phase.id}</span>
              <span className={`text-[9px] font-mono ${phase.plane === "LOCAL" ? "text-accent" : "text-accent-cyan"}`}>
                {phase.plane}
              </span>
            </div>
            <div className="mt-1 text-[10px] font-semibold text-text-primary">{phase.label}</div>
            <div className="mt-0.5 text-[9px] leading-relaxed text-text-muted">{phase.detail}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
