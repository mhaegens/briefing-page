import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireOwner } from "@/src/lib/auth";
import HubClient from "@/app/_components/HubClient";

export const dynamic = "force-dynamic";

export default async function Home() {
  const headersList = await headers();
  const request = new Request("http://localhost/", {
    headers: headersList,
  });
  try {
    await requireOwner(request);
  } catch {
    redirect(`https://haegens-zero-trust.cloudflareaccess.com`);
  }
  return <HubClient />;
}
