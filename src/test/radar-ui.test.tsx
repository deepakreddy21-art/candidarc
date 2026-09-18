import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { JobCard, fitCategoryFromLabel } from "@/components/radar/job-card";
import { FreshnessControls } from "@/components/radar/freshness-controls";
import { RepostFilter } from "@/components/radar/repost-filter";
import { radarJobs } from "@/data/radar-seed";
import { TooltipProvider } from "@/components/ui/tabs";

describe("Radar UI", () => {
  it("renders compact job row without match percentage", () => {
    const job = radarJobs.find((j) => j.classification === "REPOSTED") ?? radarJobs[0]!;
    render(
      <TooltipProvider>
        <JobCard job={job} />
      </TooltipProvider>,
    );
    expect(screen.getByTestId("job-row")).toBeInTheDocument();
    expect(screen.getByText(job.title)).toBeInTheDocument();
    expect(screen.getAllByText(new RegExp(job.company)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
  });

  it("maps match labels to Strong/Good/Stretch", () => {
    expect(fitCategoryFromLabel("Strong match")).toBe("Strong");
    expect(fitCategoryFromLabel("Good match")).toBe("Good");
    expect(fitCategoryFromLabel("Stretch opportunity")).toBe("Stretch");
    expect(fitCategoryFromLabel("Not recommended")).toBeNull();
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
