import { LoginForm } from "./login-form";

export const metadata = { title: "TabSignal — staff sign-in" };

const MESSAGES: Record<string, string> = {
  missing: "That link is missing its token. Request a new one below.",
  expired: "That sign-in link has expired. Request a new one.",
  invalid: "That sign-in link is invalid. Request a new one.",
};

export default function StaffLogin({
  searchParams,
}: {
  searchParams: { err?: string; sent?: string };
}) {
  const err = searchParams?.err;
  const errMsg = err && MESSAGES[err] ? MESSAGES[err] : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center px-6">
      <div className="w-full">
        <h1 className="text-2xl font-semibold text-slate-900">Staff sign-in</h1>
        <p className="mt-2 text-sm text-slate-600">
          Enter your work email. We&rsquo;ll send a one-tap sign-in link.
        </p>
        {errMsg ? (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {errMsg}
          </p>
        ) : null}
        <div className="mt-6">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
