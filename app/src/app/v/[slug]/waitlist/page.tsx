import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { planFromOrg, meetsAtLeast } from "@/lib/plans";
import { SITE_URL } from "@/lib/seo";
import { WaitlistForm } from "./waitlist-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const venue = await db.venue.findUnique({ where: { slug: params.slug }, select: { name: true } });
  if (!venue) return { title: "Join the waitlist" };
  return {
    title: `Join the Waitlist at ${venue.name}`,
    description: `Add your party to the live waitlist at ${venue.name} and get a text when your table is ready. Powered by TabCall.`,
    alternates: { canonical: `${SITE_URL}/v/${params.slug}/waitlist` },
  };
}

export default async function GuestWaitlistPage({ params }: { params: { slug: string } }) {
  const venue = await db.venue.findUnique({
    where: { slug: params.slug },
    select: {
      name: true,
      org: { select: { subscriptionPriceId: true, subscriptionStatus: true, trialEndsAt: true } },
    },
  });
  if (!venue) notFound();
  if (!meetsAtLeast(planFromOrg(venue.org), "pro")) notFound();

  return (
    <main className="min-h-screen bg-oat px-6 py-10 text-slate">
      <div className="mx-auto max-w-md">
        <p className="text-[11px] uppercase tracking-[0.18em] text-umber">Join the waitlist</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight">{venue.name}</h1>
        <p className="mt-2 text-sm text-slate/60">
          Add your name and we&rsquo;ll text when a table is ready.
        </p>
        <div className="mt-6">
          <WaitlistForm slug={params.slug} />
        </div>
      </div>
    </main>
  );
}
