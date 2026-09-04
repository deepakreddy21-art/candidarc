import { redirect } from "next/navigation";

export default function NewApplicationRedirect() {
  redirect("/app/opportunities/new");
}
