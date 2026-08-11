import { useState } from "react";
import { useRouter } from "next/router";
import { useSignInEmailPassword, useSignUpEmailPassword, useAuthenticationStatus } from "@nhost/react";

export default function AuthPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthenticationStatus();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const { signInEmailPassword, isLoading: signingIn, error: signInError } = useSignInEmailPassword();
  const { signUpEmailPassword, isLoading: signingUp, error: signUpError } = useSignUpEmailPassword();

  if (isAuthenticated) {
    router.replace("/orgs");
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const result = mode === "signin" ? await signInEmailPassword(email, password) : await signUpEmailPassword(email, password);
    if (result.isSuccess) router.push("/orgs");
  }

  const error = mode === "signin" ? signInError : signUpError;
  const loading = signingIn || signingUp;

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-logo">AI</div>
          <div>
            <h1 className="auth-title">AI Agent Workflow Builder</h1>
            <p className="auth-tagline">
              Chain LLM calls, API requests, and human approvals into automated workflows for your team.
            </p>
          </div>
        </div>

        <div className="tabs">
          <button
            type="button"
            className={mode === "signin" ? "tab active" : "tab"}
            onClick={() => setMode("signin")}
          >
            Sign in
          </button>
          <button
            type="button"
            className={mode === "signup" ? "tab active" : "tab"}
            onClick={() => setMode("signup")}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={submit} noValidate>
          <label className="field">
            <span className="field-label">Email</span>
            <input
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label className="field">
            <span className="field-label">Password</span>
            <input
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
            {mode === "signup" ? <span className="field-hint">At least 8 characters.</span> : null}
          </label>

          <button className="primary full" type="submit" disabled={loading}>
            {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>

          {error ? <div className="error-box">{error.message}</div> : null}
        </form>

        <p className="auth-footnote">
          {mode === "signin" ? (
            <>New here? Click "Sign up" above to create an account.</>
          ) : (
            <>After signing up, you'll create or join an organization next.</>
          )}
        </p>
      </div>
    </div>
  );
}
