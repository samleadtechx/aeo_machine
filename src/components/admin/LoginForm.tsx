"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        setLoading(true);
        setError("");
        const formData = new FormData(event.currentTarget);
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Object.fromEntries(formData.entries())),
        });
        setLoading(false);
        if (!response.ok) {
          setError("Invalid email or password.");
          return;
        }
        router.push("/dashboard");
        router.refresh();
      }}
    >
      <label className="field">
        <span>Email</span>
        <input className="input" name="email" type="email" defaultValue="admin@example.com" autoComplete="email" />
      </label>
      <label className="field">
        <span>Password</span>
        <input className="input" name="password" type="password" defaultValue="change-me-on-first-run" autoComplete="current-password" />
      </label>
      {error ? <div className="notice">{error}</div> : null}
      <button className="btn primary" type="submit" disabled={loading}>
        <LogIn size={16} />
        {loading ? "Signing in" : "Sign in"}
      </button>
    </form>
  );
}
