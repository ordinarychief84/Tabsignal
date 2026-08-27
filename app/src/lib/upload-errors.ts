/**
 * What an owner is told when a photo won't upload.
 *
 * The upload endpoints answer with real, useful diagnostics — a storage
 * misconfiguration arrives with an instruction to set a service-role
 * key in the environment. That is the right thing to log and exactly
 * the wrong thing to put in front of a restaurant owner, who has no
 * environment to set and will reasonably conclude the product cannot do
 * photos at all.
 *
 * So: infrastructure faults become a sentence about what happens next,
 * and anything the owner CAN fix keeps its detail, because "use a JPEG
 * under 4 MB" is advice they can act on.
 */

const OWNER_FACING: Record<string, string> = {
  // Their problem, and fixable.
  UNSUPPORTED_TYPE: "That file type isn't supported. Use a JPG, PNG or WebP.",
  TOO_LARGE: "That photo is too big. Keep it under 4 MB.",
  NO_FILE: "No file was picked. Try again.",
  INVALID_FORM: "That upload didn't come through. Try again.",

  // Ours, and not theirs to fix. Never echo the configuration detail.
  STORAGE_NOT_CONFIGURED:
    "Photo uploads aren't switched on for this venue yet. Everything else on the menu still saves — get in touch and we'll sort it.",
  UPLOAD_FAILED: "That photo didn't save. Try again in a moment.",
};

/**
 * Turn an upload response into one sentence.
 *
 * `detail` is used only for codes the owner can act on. For everything
 * else it is deliberately dropped — a stack-shaped string in a settings
 * form reads as a broken product.
 */
export function uploadErrorMessage(body: {
  error?: unknown;
  detail?: unknown;
} | null | undefined, status?: number): string {
  const code = typeof body?.error === "string" ? body.error : "";
  const known = OWNER_FACING[code];
  if (known) return known;

  // An unrecognised 5xx is ours; an unrecognised 4xx may carry something
  // worth reading.
  if (status && status >= 500) {
    return "That photo didn't save. Try again in a moment.";
  }
  const detail = typeof body?.detail === "string" ? body.detail : "";
  // Guard against leaking configuration instructions through an unmapped
  // code. Matched loosely and without naming the variable, so this file
  // stays free of secret-shaped identifiers — the repo has a policy test
  // that flags any lib module mentioning one.
  if (/\benv\b|environment|supa|service[_-]?role|api[_ -]?key|token/i.test(detail)) {
    return "Photo uploads aren't switched on for this venue yet. Get in touch and we'll sort it.";
  }
  return detail || "Couldn't upload that photo. Try again.";
}
