import type { FitReport, FitDimension } from "@/lib/jobs/fit-score";

interface Props {
  report: FitReport;
}

function bandColor(band: FitDimension["band"]): { fg: string; chip: string } {
  switch (band) {
    case "top":
      return { fg: "var(--ok)", chip: "color-mix(in srgb, var(--ok) 12%, transparent)" };
    case "stretch":
      return { fg: "var(--warn)", chip: "color-mix(in srgb, var(--warn) 12%, transparent)" };
    case "pass":
      return { fg: "var(--danger)", chip: "color-mix(in srgb, var(--danger) 12%, transparent)" };
    default:
      return { fg: "var(--fg-4)", chip: "var(--bg-elev)" };
  }
}

function bandLabel(band: FitDimension["band"]): string {
  switch (band) {
    case "top":
      return "strong";
    case "stretch":
      return "stretch";
    case "pass":
      return "weak";
    default:
      return "n/a";
  }
}

function skillClassColor(c: "matched" | "partial" | "missing"): {
  fg: string;
  bg: string;
  border: string;
} {
  switch (c) {
    case "matched":
      return {
        fg: "var(--ok)",
        bg: "color-mix(in srgb, var(--ok) 12%, transparent)",
        border: "color-mix(in srgb, var(--ok) 40%, var(--border))",
      };
    case "partial":
      return {
        fg: "var(--warn)",
        bg: "color-mix(in srgb, var(--warn) 12%, transparent)",
        border: "color-mix(in srgb, var(--warn) 40%, var(--border))",
      };
    case "missing":
      return {
        fg: "var(--danger)",
        bg: "color-mix(in srgb, var(--danger) 10%, transparent)",
        border: "color-mix(in srgb, var(--danger) 35%, var(--border))",
      };
  }
}

export function FitDashboard({ report }: Props) {
  const overallColor = bandColor(report.overall.band);
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-elev)] p-5 space-y-5">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="section-label">Role fit dashboard</div>
          <p className="text-[12px] text-[var(--fg-3)] mt-1">
            Fast-glance read on how this role matches your profile. All scores computed locally
            from the JD + your active CV + (if enriched) the company. The deeper LLM analysis
            lives below in <em>CV match</em>.
          </p>
        </div>
        {report.overall.score >= 0 && (
          <div
            className="flex items-baseline gap-2 rounded-md border px-3 py-1.5"
            style={{
              borderColor: overallColor.fg,
              background: overallColor.chip,
            }}
          >
            <span className="text-[10px] uppercase tracking-wider text-[var(--fg-3)]">overall</span>
            <span
              className="text-[22px] font-mono leading-none"
              style={{ color: overallColor.fg }}
            >
              {report.overall.score}
            </span>
            <span
              className="text-[10px] uppercase tracking-wider"
              style={{ color: overallColor.fg }}
            >
              {bandLabel(report.overall.band)}
            </span>
          </div>
        )}
      </header>

      {/* 5-dimension grid */}
      <div className="space-y-2">
        {report.dimensions.map((d) => {
          const c = bandColor(d.band);
          return (
            <div
              key={d.key}
              className="grid grid-cols-[100px_1fr_auto] gap-3 items-center border-l-2 pl-3 py-2"
              style={{ borderColor: c.fg }}
            >
              <div>
                <div className="text-[13px] font-medium">{d.label}</div>
                <div
                  className="text-[10px] uppercase tracking-wider mt-0.5"
                  style={{ color: c.fg }}
                >
                  {bandLabel(d.band)}
                </div>
              </div>
              <div className="text-[11px] text-[var(--fg-3)] space-y-0.5">
                {d.evidence.map((e, i) => (
                  <div key={i}>{e}</div>
                ))}
              </div>
              <div
                className="text-[18px] font-mono leading-none px-2 py-1 rounded-md min-w-[42px] text-center"
                style={{ color: c.fg, background: c.chip }}
              >
                {d.score >= 0 ? d.score : "—"}
              </div>
            </div>
          );
        })}
      </div>

      {/* Skill chips */}
      {report.skills.classified.length > 0 && (
        <div className="space-y-2 border-t border-[var(--border)] pt-4">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <div className="section-label">JD skills tagged against your CV</div>
            <div className="text-[10px] font-mono text-[var(--fg-4)]">
              <span style={{ color: "var(--ok)" }}>
                {report.skills.matchedCount} matched
              </span>{" "}
              ·{" "}
              <span style={{ color: "var(--warn)" }}>
                {report.skills.partialCount} partial
              </span>{" "}
              ·{" "}
              <span style={{ color: "var(--danger)" }}>
                {report.skills.missingCount} missing
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {report.skills.classified.map((s, i) => {
              const k = skillClassColor(s.class);
              const isPortfolio = s.evidence === "portfolio";
              const title =
                s.class === "matched"
                  ? isPortfolio
                    ? `Matched via portfolio project "${s.portfolioProject ?? "unknown"}" — CV doesn't mention it but you have a repo`
                    : `Matched — CV: "${s.cvMatch ?? ""}"`
                  : s.class === "partial"
                    ? isPortfolio
                      ? `Partial — portfolio project "${s.portfolioProject ?? "unknown"}" has a related family member`
                      : `Partial — CV has related: "${s.cvMatch ?? "related family"}"`
                    : "Missing from your CV and your portfolio";
              return (
                <span
                  key={`${s.token}-${i}`}
                  title={title}
                  className="inline-flex items-baseline gap-1 rounded-md border px-2 py-1 text-[11px] font-mono"
                  style={{ background: k.bg, color: k.fg, borderColor: k.border }}
                >
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full"
                    style={{ background: k.fg }}
                  />
                  {s.token}
                  {isPortfolio && (
                    <span
                      className="text-[9px] uppercase tracking-wider opacity-70"
                      style={{ color: k.fg }}
                      aria-label="from portfolio"
                    >
                      ↗
                    </span>
                  )}
                </span>
              );
            })}
          </div>
          <p className="text-[10px] text-[var(--fg-4)] mt-2">
            Sources: your active CV's <code className="font-mono">skills</code> array
            + every visible portfolio repo/project (GitHub topics, GitLab tags,
            and TECH_TOKENS scanned from README content). Chips marked with{" "}
            <span className="font-mono">↗</span> matched via a portfolio project.
          </p>
        </div>
      )}
    </section>
  );
}
