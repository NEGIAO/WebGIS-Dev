export function collectShaders(frontendRoot: string): Array<{ name: string; body: string }>;
export function bundleShaders(options?: { check?: boolean }): {
    ok: boolean;
    count: number;
    drifts: string[];
};
