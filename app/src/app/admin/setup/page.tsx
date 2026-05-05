import { SetupForm } from "./setup-form";

export const metadata = { title: "TabCall — venue setup" };

export default function SetupPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-6 py-10">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-wider text-slate-500">TabCall · setup</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Create your venue</h1>
        <p className="mt-2 text-sm text-slate-600">
          Five fields, takes under five minutes. You&rsquo;ll get a QR per table at the end.
        </p>
      </header>
      <SetupForm />
    </main>
  );
}
