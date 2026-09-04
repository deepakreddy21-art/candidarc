import { redirect } from "next/navigation";

export default async function ApplicationOverviewRedirect({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;
  redirect(`/app/opportunities/${applicationId}`);
}
