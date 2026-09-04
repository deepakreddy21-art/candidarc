import { AppError } from "../domain/types";
import { isFeatureCopilotEnabled, isFeatureRadarEnabled } from "../config/env";
import type { RadarService } from "../radar/service";
import type { CopilotService } from "../copilot/service";

export function requireRadarFeature(): void {
  if (!isFeatureRadarEnabled()) {
    throw new AppError("FEATURE_DISABLED", "Radar is not enabled", 404);
  }
}

export function requireCopilotFeature(): void {
  if (!isFeatureCopilotEnabled()) {
    throw new AppError("FEATURE_DISABLED", "Copilot is not enabled", 404);
  }
}

export function getRadarService(radar: RadarService | null): RadarService {
  requireRadarFeature();
  if (!radar) throw new AppError("FEATURE_DISABLED", "Radar is not enabled", 404);
  return radar;
}

export function getCopilotService(copilot: CopilotService | null): CopilotService {
  requireCopilotFeature();
  if (!copilot) throw new AppError("FEATURE_DISABLED", "Copilot is not enabled", 404);
  return copilot;
}
