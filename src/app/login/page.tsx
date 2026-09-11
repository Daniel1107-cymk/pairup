import { login } from "../actions";
import { Submit } from "../submit";

export default async function Login({ searchParams }: PageProps<"/login">) {
  const bad = "bad" in (await searchParams);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center p-5">
      <h1 className="text-6xl font-extrabold leading-none tracking-tight">Pair<span className="text-shuttle">Up</span></h1>
      <form action={login} className="panel mt-8 space-y-4 p-4">
        <label className="block text-sm text-chalk/70">
          Club passphrase
          <input name="passphrase" type="password" autoComplete="current-password" autoFocus required className="field mt-1 w-full p-3 text-lg" />
        </label>
        {bad && <p className="text-sm text-coral">Wrong passphrase</p>}
        <Submit className="shuttle-btn w-full rounded-full p-4 text-xl">Enter</Submit>
      </form>
    </main>
  );
}
