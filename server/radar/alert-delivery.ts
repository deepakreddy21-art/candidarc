import { NotificationsService } from "../modules/notifications/service";
import type { CanonicalJobCatalog } from "./catalog";
import type { JobAlert } from "./types";

export async function deliverCurrentAlertMatches(
  catalog: CanonicalJobCatalog,
  inbox: NotificationsService,
  alert: JobAlert,
): Promise<number> {
  if (!alert.enabled || alert.cadence === "paused") return 0;
  let delivered = 0;
  for (const job of catalog.canonicalJobs.values()) {
    if (job.status !== "open") continue;
    const deliveries = catalog.evaluateAlertsForJob(job);
    for (const delivery of deliveries) {
      if (delivery.alertId !== alert.id) continue;
      await inbox.create(delivery.tenantId, delivery.userId, {
        title: "Job alert",
        body: delivery.message,
        href: `/app/radar/jobs/${job.publicId}`,
      });
      delivered += 1;
    }
  }
  return delivered;
}
