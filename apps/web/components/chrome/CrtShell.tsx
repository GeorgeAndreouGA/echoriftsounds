'use client';

export function CrtShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="scanlines" aria-hidden="true" />
      {/* Vertical hold very slightly off — a soft band drifting down the tube,
          forever. The one piece of motion here that doesn't wait to be triggered,
          which is what stops the page reading as a static screenshot between
          interactions. transform-only, so it composites and never repaints; and
          it's hidden outright below the 'full' tier (see globals.css) rather than
          burning a compositor loop on a phone or a save-data connection. */}
      <div className="crt-rollbar" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />
      <div className="flicker-overlay" aria-hidden="true" />

      {/* A #crt-curve filter (feTurbulence + feDisplacementMap) used to be defined
          here with no consumer. Removed rather than wired up:
            - it was misnamed. That pair gives noise wobble, not radial distortion;
              barrel needs a displacement map whose R/G encode a radial gradient.
            - a filter on an ancestor becomes the containing block for fixed
              descendants, so applying it would have silently broken .scanlines,
              .vignette, .flicker-overlay and the portalled .crt-listbox-list.
            - a full-page filter forces a raster layer and kills subpixel AA, and
              amber-on-black monospace text is the entire aesthetic.
            - web runs on 1 CPU / 256M (docker-compose.yml).
          If curvature is ever wanted: a static inset box-shadow + border-radius on
          a fixed overlay reads almost the same and costs nothing. */}

      <div className="crt-safe-area">{children}</div>
    </>
  );
}
