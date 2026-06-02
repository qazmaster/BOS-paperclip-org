import React from "react";
import type { PluginSettingsPageProps } from "@paperclipai/plugin-sdk/ui";

export function BosSettingsPage({ context }: PluginSettingsPageProps) {
  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
        BOS Light Settings
      </h2>
      <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 16 }}>
        Configure division routing, eval gates, and circuit breakers.
      </p>
      <div
        style={{
          padding: 12,
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.1)",
          fontSize: 13,
        }}
      >
        <div style={{ marginBottom: 8 }}>
          <strong>Plugin:</strong> BOS Light v0.1.0
        </div>
        <div style={{ marginBottom: 8 }}>
          <strong>Company:</strong> {context.companyId ?? "N/A"}
        </div>
        <div>
          <strong>Status:</strong> Active
        </div>
      </div>
    </div>
  );
}
