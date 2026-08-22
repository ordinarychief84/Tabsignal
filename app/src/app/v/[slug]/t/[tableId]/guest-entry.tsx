"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { WelcomeScreen } from "./welcome-screen";
import { ServiceSheet } from "@/components/guest/service-sheet";

/**
 * Client shell for the entry screen.
 *
 * Exists for one reason: "Need Sarah now?" on the welcome has to be able
 * to open the service sheet, and the sheet owns its own open state. The
 * welcome is otherwise presentational.
 *
 * A venue that has turned the welcome off skips straight to the home
 * experience rather than seeing a stripped-down version of it.
 */
export function GuestEntry(props: {
  venueName: string;
  tableLabel: string;
  server: { displayName: string; photoUrl: string | null; welcomeMessage: string } | null;
  homeHref: string;
  sessionToken: string;
  sessionId: string;
  venueSlug: string;
  brandColor: string | null;
  showWelcome: boolean;
  requestsEnabled: boolean;
  feedbackHref?: string;
}) {
  const router = useRouter();
  const [sheetSignal, setSheetSignal] = useState(0);

  useEffect(() => {
    if (!props.showWelcome) router.replace(props.homeHref);
  }, [props.showWelcome, props.homeHref, router]);

  if (!props.showWelcome) return null;

  return (
    <>
      <WelcomeScreen
        venueName={props.venueName}
        tableLabel={props.tableLabel}
        server={props.server}
        homeHref={props.homeHref}
        brandColor={props.brandColor}
        onNeedServer={() => setSheetSignal(n => n + 1)}
      />
      {props.requestsEnabled ? (
        <ServiceSheet
          key={sheetSignal}
          serverName={props.server?.displayName ?? null}
          sessionToken={props.sessionToken}
          sessionId={props.sessionId}
          venueSlug={props.venueSlug}
          autoOpen={sheetSignal > 0}
          showDock={false}
          feedbackHref={props.feedbackHref}
        />
      ) : null}
    </>
  );
}
