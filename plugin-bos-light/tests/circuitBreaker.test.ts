import { describe, expect, it } from "vitest";
import { createCircuitBreakerRecord, recordFailure, recordSuccess } from "../src/circuitBreaker";

describe("Circuit Breaker", () => {
  it("opens after three failures", () => {
    let record = createCircuitBreakerRecord("issue_1", "2026-05-27T00:00:00.000Z");
    record = recordFailure(record, "fail 1", "2026-05-27T00:01:00.000Z");
    record = recordFailure(record, "fail 2", "2026-05-27T00:02:00.000Z");
    record = recordFailure(record, "fail 3", "2026-05-27T00:03:00.000Z");
    expect(record.state).toBe("OPEN");
    expect(record.attempt_count).toBe(3);
    expect(record.opened_at).toBe("2026-05-27T00:03:00.000Z");
  });

  it("resets on success", () => {
    let record = createCircuitBreakerRecord("issue_1");
    record = recordFailure(record, "fail");
    record = recordSuccess(record);
    expect(record.state).toBe("CLOSED");
    expect(record.attempt_count).toBe(0);
    expect(record.last_failure_reason).toBeNull();
  });
});
