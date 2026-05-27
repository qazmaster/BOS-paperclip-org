// Draft UI scaffold. Validate Paperclip plugin UI bridge before use.
import React from "react";

export interface BettingTableWidgetProps {
  items: Array<{
    issue_id: string;
    bpi_score: number;
    status: string;
    native_approval_status?: string | null;
  }>;
  onApproveBatch: (issueIds: string[]) => Promise<void>;
}

export function BettingTableWidget(props: BettingTableWidgetProps) {
  const issueIds = props.items.map((item) => item.issue_id);
  return (
    <section>
      <h2>BOS Betting Table</h2>
      <p>Pitch Deck sorted by BPI. Approval is created through Paperclip-native governance.</p>
      <table>
        <thead>
          <tr><th>Issue</th><th>BPI</th><th>Status</th><th>Native approval</th></tr>
        </thead>
        <tbody>
          {props.items.map((item) => (
            <tr key={item.issue_id}>
              <td>{item.issue_id}</td>
              <td>{item.bpi_score.toFixed(3)}</td>
              <td>{item.status}</td>
              <td>{item.native_approval_status ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={() => props.onApproveBatch(issueIds)}>Approve Batch</button>
    </section>
  );
}
