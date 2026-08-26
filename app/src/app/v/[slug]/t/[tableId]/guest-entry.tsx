"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { WelcomeScreen } from "./welcome-screen";
import { ServiceSheet } from "@/components/guest/service-sheet";
import { TrackProvider, useTrackOnce } from "@/components/guest/track";

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
type GuestEntryProps = {
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
  /**
   * "Welcome back, Sam" — null unless this guest identified themselves
   * on a previous visit and has been here before.
   */
  welcomeBack: string | null;
};

/**
 * Wraps the entry screen in the analytics provider. Mounted here as well
 * as on the home because a scan that never gets past the welcome is a
 * different — and more interesting — outcome than one that does, and
 * without this the whole first screen would be invisible to the funnel.
 */
export function GuestEntry(props: GuestEntryProps) {
  return (
    <TrackProvider
      venueSlug={props.venueSlug}
      sessionId={props.sessionId}
      sessionToken={props.sessionToken}
    >
      <GuestEntryInner {...props} />
    </TrackProvider>
  );
}

function GuestEntryInner(props: GuestEntryProps) {
  const router = useRouter();
  const [sheetSignal, setSheetSignal] = useState(0);

  // Every arrival, welcome shown or not — this is the top of the funnel
  // that every other rate is measured against.
  useTrackOnce("guest_qr_scanned");
  useTrackOnce(props.showWelcome ? "welcome_viewed" : "menu_explored");
  // Counted so a venue can see whether the scheme is bringing anyone
  // back. The event carries no identity — only that one happened.
  useTrackOnce(props.welcomeBack ? "return_visit_detected" : "guest_qr_scanned");

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
        welcomeBack={props.welcomeBack}
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
          feedbackHref={props.feedbackHref}
        />
      ) : null}
    </>
  );
}
