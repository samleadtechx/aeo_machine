"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyValue({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <label className="field">
      <span>{label}</span>
      <div className="button-row" style={{ alignItems: "stretch" }}>
        {multiline ? (
          <textarea className="textarea" readOnly value={value} style={{ minHeight: 132, flex: 1 }} />
        ) : (
          <input className="input" readOnly value={value} style={{ flex: 1 }} />
        )}
        <button className="btn" type="button" onClick={copy} title={`Copy ${label}`}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </label>
  );
}
