import React from "react";
import { useHostContext } from "@paperclipai/plugin-sdk/ui";
import type { PluginSidebarProps } from "@paperclipai/plugin-sdk/ui";

export function BosSidebarEntry({ context }: PluginSidebarProps) {
  return (
    <a
      href={`/${context.companyPrefix ?? "BOS"}/dashboard`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 8px",
        borderRadius: 6,
        color: "inherit",
        textDecoration: "none",
        fontSize: 13,
        opacity: 0.8,
      }}
    >
      <span style={{ fontWeight: 600 }}>BOS Light</span>
      <span style={{ fontSize: 11, opacity: 0.6 }}>Org Intelligence</span>
    </a>
  );
}
