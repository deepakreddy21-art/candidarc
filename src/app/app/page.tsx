import { redirect } from "next/navigation";
import { isRadarFeatureEnabled } from "@/lib/app-mode";

/** Completed candidates land on Jobs when Radar is on; otherwise Applications. */
export default function AppHomePage() {
  redirect(isRadarFeatureEnabled() ? "/app/radar" : "/app/opportunities");
}
