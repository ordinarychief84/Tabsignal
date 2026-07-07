/**
 * bun-test shim for the `server-only` marker package.
 *
 * Secret-bearing modules (lib/stripe, lib/db, lib/auth/*, …) import
 * "server-only" so `next build` refuses to bundle them into client
 * components — that's the enforcement we want in the app. Outside a
 * React Server bundler condition the package's default export THROWS
 * by design, which would kill every bun test that touches those
 * modules. Preloading this mock keeps the build-time guarantee while
 * letting the test runner import server code freely.
 */
import { mock } from "bun:test";

mock.module("server-only", () => ({}));
