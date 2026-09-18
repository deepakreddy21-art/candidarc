import { redirect } from "next/navigation";

type Props = { params: Promise<{ opportunityId: string }> };

/** Legacy activity URL → application overview. */
export default async function ActivityPage({ params }: Props) {
  const { opportunityId } = await params;
  redirect(`/app/opportunities/${opportunityId}`);
}
