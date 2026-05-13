"use client";

import { useState } from "react";

export function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitted(true);
      }}
      aria-label="Newsletter signup"
    >
      <label className="sr-only" htmlFor="newsletter">
        Email address
      </label>
      <input
        id="newsletter"
        type="email"
        required
        placeholder="Email address"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="min-w-0 flex-1 rounded-lg border border-outline-variant/60 bg-white px-4 py-2.5 text-sm text-primary-deep placeholder-on-surface-variant/60 outline-none focus:border-brand-lime focus:ring-2 focus:ring-brand-lime"
      />
      <button
        type="submit"
        disabled={submitted}
        className="shrink-0 rounded-lg bg-primary-deep px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-70"
      >
        {submitted ? "Thanks" : "Join"}
      </button>
    </form>
  );
}
