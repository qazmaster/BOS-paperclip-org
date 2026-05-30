declare module "node:child_process" {
  export function spawn(command: string, args?: readonly string[], options?: Record<string, unknown>): any;
}

declare module "node:test" {
  const test: any;
  export default test;
}

declare module "node:assert/strict" {
  const assert: any;
  export default assert;
}

declare const process: {
  cwd(): string;
  env: Record<string, string | undefined>;
};

declare function setTimeout(callback: (...args: unknown[]) => void, ms: number): unknown;
declare function clearTimeout(handle: unknown): void;

declare const Buffer: {
  isBuffer(value: unknown): boolean;
};
