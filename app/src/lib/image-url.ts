import { z } from "zod";

/**
 * A URL that is safe to put in an `<img src>` on a stranger's phone.
 *
 * `z.string().url()` is not that. It accepts every scheme the URL parser
 * knows, so `javascript:alert(1)` and `data:text/html,...` both pass —
 * and a staff photo URL is rendered directly into the guest app, which
 * is about the worst place to discover that.
 *
 * Modern browsers don't execute `javascript:` in an img src, so this is
 * defence in depth rather than a live hole. But the value also flows
 * into other surfaces over time, and "the browser probably won't run it"
 * is a poor thing to be relying on in an input validator.
 *
 * http is allowed alongside https because local development and
 * self-hosted storage both use it; anything else is refused.
 */
export const imageUrl = z
  .string()
  .url()
  .refine(
    value => {
      try {
        const protocol = new URL(value).protocol;
        return protocol === "https:" || protocol === "http:";
      } catch {
        return false;
      }
    },
    { message: "Image URLs must start with http:// or https://" },
  );
