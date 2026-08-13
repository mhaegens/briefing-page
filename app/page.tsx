import { headers } from "next/headers";
import { requireOwner } from "@/src/lib/auth";
import HubClient from "@/app/_components/HubClient";

export const dynamic = "force-dynamic";

export default async function Home() {
  const headersList = await headers();
  const request = new Request("http://localhost/", {
    headers: headersList,
  });
  await requireOwner(request);
  return <HubClient />;
}
