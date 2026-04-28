import { Link } from "@tanstack/react-router";

export function Logo({ size = "md", to = "/" }: { size?: "sm" | "md" | "lg"; to?: string }) {
  const sizes = {
    sm: "text-lg tracking-[0.4em]",
    md: "text-2xl tracking-[0.5em]",
    lg: "text-5xl tracking-[0.6em]",
  };
  return (
    <Link to={to} className={`font-display font-bold ${sizes[size]} text-foreground inline-flex items-center gap-2`}>
      <span className="inline-block w-2 h-2 bg-foreground breathe rounded-full" />
      ZYNK
    </Link>
  );
}
