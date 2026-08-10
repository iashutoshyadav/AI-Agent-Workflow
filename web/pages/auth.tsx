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
    <div className="container" style={{ maxWidth: 420 }}>
      <h1>AI Agent Workflow Builder</h1>
      <div className="card">
        <div className="row" style={{ marginBottom: 16 }}>
          <button onClick={() => setMode("signin")} disabled={mode === "signin"}>
            Sign in
          </button>
          <button onClick={() => setMode("signup")} disabled={mode === "signup"}>
            Sign up
          </button>
        </div>
        <form onSubmit={submit}>
          <div style={{ marginBottom: 10 }}>
            <input
              type="email"
              placeholder="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ marginBottom: 10 }}>
            <input
              type="password"
              placeholder="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              style={{ width: "100%" }}
            />
          </div>
          <button className="primary" type="submit" disabled={loading}>
            {mode === "signin" ? "Sign in" : "Sign up"}
          </button>
          {error ? <p style={{ color: "#f87171" }}>{error.message}</p> : null}
        </form>
      </div>
    </div>
  );
}
