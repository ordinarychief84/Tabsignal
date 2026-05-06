"use client";

import { useEffect, useState } from "react";

export function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const h = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(h);
  }, []);
  if (!now) return <span className="font-mono text-sm text-oat/60">--:--</span>;
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return <span className="font-mono text-sm text-oat/60">{hh}:{mm}</span>;
}
