export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-48 gap-4">
      {/* Animated swarm orbit loader */}
      <div className="relative h-12 w-12">
        <div
          className="absolute inset-0 rounded-full border border-accent/30"
          style={{ animation: "orbit-cw 2s linear infinite" }}
        />
        <div
          className="absolute inset-2 rounded-full border border-accent/15"
          style={{ animation: "orbit-ccw 3s linear infinite" }}
        />
        <div
          className="absolute inset-[18px] rounded-full bg-accent/80"
          style={{ animation: "logo-breathe 1.5s ease-in-out infinite" }}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-mono text-text-muted">Preparing workspace</span>
        <div className="flex gap-0.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1 w-1 rounded-full bg-text-muted/50"
              style={{ animation: `think-dot 1.2s ease-in-out infinite`, animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
