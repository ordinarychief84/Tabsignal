/**
 * The words a guest reads when they sit down, and the name attached to
 * them.
 *
 * Split out of lib/server-identity because that module is `server-only`
 * — it reads table assignments from the database — while these two
 * functions are pure string handling that the staff profile form needs
 * on the client to preview what a guest will see.
 *
 * TypeScript does not catch importing a server-only module into a client
 * component; only the Next build boundary does, at runtime. Keeping the
 * pure parts here is what stops that happening again.
 */

/**
 * First name only.
 *
 * "Meet Alexandra Okonkwo" reads like a database record introducing
 * itself, and a surname is more of someone's identity than needs to be
 * on a screen a whole table can see.
 */
export function firstNameOf(value: string): string {
  const first = value.trim().split(/\s+/)[0] ?? "";
  return first;
}

/**
 * What TabCall writes when neither the server nor the venue has written
 * anything. Warm, short, and it sets an expectation the product can
 * actually keep: someone is coming, look at the menu meanwhile.
 */
export function defaultWelcome(serverName: string, venueName: string): string {
  return (
    `Hi, I'm ${serverName}. Welcome to ${venueName}. I'll be with you shortly. ` +
    `Feel free to explore tonight's menu and specials while I make my way over.`
  );
}
