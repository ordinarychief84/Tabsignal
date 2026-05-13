"use client";

import { useState } from "react";

export function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  return (
    <form
      className="mt-4 flex gap-2"
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
        placeholder="Enter your email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="min-w-0 flex-1 rounded-full border border-umber-soft/40 bg-white px-4 py-2.5 text-sm text-slate placeholder-slate/40 outline-none focus:border-slate/40"
      />
      <button
        type="submit"
        disabled={submitted}
        className="shrink-0 rounded-full bg-chartreuse px-4 py-2.5 text-sm font-semibold text-slate hover:bg-chartreuse/85 disabled:opacity-70"
      >
        {submitted ? "Thanks" : "Subscribe"}
      </button>
    </form>
  );
}
