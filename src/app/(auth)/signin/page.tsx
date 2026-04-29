import { signIn } from "@/lib/auth";

export const metadata = {
  title: "Sign in · LAS Duty Dashboard",
};

export default function SignInPage() {
  return (
    <main className="signin">
      <div className="signin__card">
        <div className="signin__eyebrow">Leysin American School</div>
        <h1 className="signin__title">
          LAS <em>Duty</em> Dashboard
        </h1>
        <p className="signin__lede">
          Sign in with your <strong>@las.ch</strong> Google account to continue.
        </p>

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button type="submit" className="btn btn--primary">
            Sign in with Google
          </button>
        </form>

        <p className="signin__foot">
          Access is restricted to LAS Workspace accounts. Personal Gmail
          addresses will be rejected.
        </p>
      </div>
    </main>
  );
}
