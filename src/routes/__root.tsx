import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { DJBoothProvider } from "@/components/zynk/DJBoothProvider";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 overflow-hidden noise">
      <div className="absolute inset-0 bg-gradient-spotlight pointer-events-none" />
      <div className="relative max-w-lg text-center">
        <div className="font-display text-[10rem] md:text-[14rem] font-bold leading-none text-gradient-zynk glitch">404</div>
        <div className="text-[10px] font-mono uppercase tracking-[0.5em] text-muted-foreground">signal lost · off the grid</div>
        <h2 className="mt-6 font-display text-3xl font-bold">This room doesn't exist.</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          The booth, the crowd, the projector — none of them know this address.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            to="/"
            className="px-5 py-3 bg-foreground text-background font-mono uppercase text-[10px] tracking-[0.4em] clip-corner hover:bg-muted-foreground transition-colors"
          >
            ↩ home
          </Link>
          <Link
            to="/connect"
            className="px-5 py-3 border border-foreground font-mono uppercase text-[10px] tracking-[0.4em] clip-corner hover:bg-foreground hover:text-background transition-colors"
          >
            start a session
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "ZYNK — Live AI DJ Performance" },
      { name: "description", content: "ZYNK is a live AI DJ that mixes your music in real time, reacts to crowd energy, and projects cinematic shadow visuals." },
      { property: "og:title", content: "ZYNK — Live AI DJ Performance" },
      { property: "og:description", content: "An AI DJ that mixes your music live, with cinematic shadow visuals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <DJBoothProvider>
      <Outlet />
    </DJBoothProvider>
  );
}
