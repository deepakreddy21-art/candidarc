import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { JobCard } from "@/components/radar/job-card";
import { FreshnessControls } from "@/components/radar/freshness-controls";
import { RepostFilter } from "@/components/radar/repost-filter";
import { radarJobs } from "@/data/radar-seed";
import { TooltipProvider } from "@/components/ui/tabs";

describe("Radar UI", () => {
  it("renders job card with repost and company-direct labels", () => {
    const job = radarJobs.find((j) => j.classification === "REPOSTED") ?? radarJobs[0]!;
    render(
      <TooltipProvider>
        <JobCard job={job} />
      </TooltipProvider>,
    );
    expect(screen.getByText(job.company)).toBeInTheDocument();
    expect(screen.getByText(job.title)).toBeInTheDocument();
    expect(screen.getAllByText(/Reposted/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Company direct/i)).toBeInTheDocument();
  });

  it("exposes freshness presets and basis controls", () => {
    render(
      <FreshnessControls
        value={{ preset: "24h", basis: "discovered" }}
        onChange={() => undefined}
      />,
    );
    expect(screen.getByText(/Last 24 hours/i)).toBeInTheDocument();
  });

  it("exposes new vs reposted selector", () => {
    render(<RepostFilter value="new_or_reposted" onChange={() => undefined} />);
    expect(screen.getByText(/Genuinely new/i)).toBeInTheDocument();
    expect(screen.getByText(/Reposted only/i)).toBeInTheDocument();
  });
});
