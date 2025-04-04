import { performance } from "node:perf_hooks";

export async function logExecutionTime<T>(label: string, fn: () => Promise<T>): Promise<T> {
	const start = performance.now();
	const result = await fn();
	const end = performance.now();
	console.log(`[${label}] took ${(end - start).toFixed(2)}ms`);
	return result;
}
