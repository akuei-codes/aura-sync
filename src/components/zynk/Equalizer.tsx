export function Equalizer({ bars = 5, className = "" }: { bars?: number; className?: string }) {
  return (
    <div className={`flex items-end gap-[3px] h-4 ${className}`}>
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className="w-[3px] bg-foreground equalizer-bar"
          style={{ animationDelay: `${i * 0.12}s`, animationDuration: `${0.5 + (i % 3) * 0.2}s`, height: "100%" }}
        />
      ))}
    </div>
  );
}
