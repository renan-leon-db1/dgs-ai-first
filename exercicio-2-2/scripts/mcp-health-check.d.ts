declare const process: {
	env: Record<string, string | undefined>;
	exitCode?: number;
};

declare module 'pino' {
	export interface LoggerOptions {
		name?: string;
		level?: string;
	}

	export interface Logger {
		info(obj: unknown, msg?: string): void;
		warn(obj: unknown, msg?: string): void;
		error(obj: unknown, msg?: string): void;
		fatal(obj: unknown, msg?: string): void;
	}

	export default function pino(options?: LoggerOptions): Logger;
}
