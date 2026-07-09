/// <reference path="./mcp-health-check.d.ts" />

declare const process: {
	env: Record<string, string | undefined>;
	exitCode?: number;
};

import pino from 'pino';

type HealthStatus = 'UP' | 'DOWN' | 'DEGRADED';

type ProbePath = 'health' | 'ready' | 'readyz' | 'live' | '.well-known/mcp' | '';

interface ServerDefinition {
	id: 'github' | 'azure-search' | 'azure-openai' | 'confluence' | 'azure-devops';
	name: string;
	envVar:
		| 'GITHUB_MCP_URL'
		| 'AZURE_SEARCH_MCP_URL'
		| 'AZURE_OPENAI_MCP_URL'
		| 'CONFLUENCE_MCP_URL'
		| 'AZDEVOPS_MCP_URL';
	critical: boolean;
}

interface ProbeResult {
	status: HealthStatus;
	latencyMs: number;
	httpStatus?: number;
	url: string;
	probePath: ProbePath;
	error?: string;
	responseSnippet?: string;
}

interface ServerHealthResult {
	server: ServerDefinition;
	endpoint: string;
	status: HealthStatus;
	latencyMs: number;
	probePath?: ProbePath;
	httpStatus?: number;
	error?: string;
	responseSnippet?: string;
}

const TIMEOUT_MS = 5_000;

const PROBE_PATHS: readonly ProbePath[] = ['health', 'ready', 'readyz', 'live', '.well-known/mcp', ''];

const SERVERS: readonly ServerDefinition[] = [
	{
		id: 'github',
		name: 'GitHub MCP Server',
		envVar: 'GITHUB_MCP_URL',
		critical: true,
	},
	{
		id: 'azure-search',
		name: 'Azure AI Search MCP Server',
		envVar: 'AZURE_SEARCH_MCP_URL',
		critical: true,
	},
	{
		id: 'azure-openai',
		name: 'Azure OpenAI MCP Server',
		envVar: 'AZURE_OPENAI_MCP_URL',
		critical: false,
	},
	{
		id: 'confluence',
		name: 'Confluence MCP Server',
		envVar: 'CONFLUENCE_MCP_URL',
		critical: false,
	},
	{
		id: 'azure-devops',
		name: 'Azure DevOps MCP Server',
		envVar: 'AZDEVOPS_MCP_URL',
		critical: false,
	},
] as const;

const logger = pino({
	name: 'novatech-mcp-health-check',
	level: process.env.LOG_LEVEL ?? 'info',
});

function describeError(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}

	return typeof error === 'string' ? error : 'Unknown error';
}

function isHealthyBody(responseText: string): boolean {
	const normalized = responseText.toLowerCase();
	return (
		normalized.includes('"status":"degraded"')
		|| normalized.includes('"status": "degraded"')
		|| normalized.includes('"status":"warning"')
		|| normalized.includes('"status": "warning"')
		|| normalized.includes('"status":"down"')
		|| normalized.includes('"status": "down"')
		|| normalized.includes('"healthy":false')
		|| normalized.includes('"healthy": false')
		|| normalized.includes('"ok":false')
		|| normalized.includes('"ok": false')
		|| normalized.includes('unhealthy')
		|| normalized.includes('degraded')
	);
}

function resolveProbeUrl(baseUrl: URL, probePath: ProbePath): URL {
	const resolved = new URL(baseUrl.toString());

	if (probePath === '') {
		return resolved;
	}

	const basePath = resolved.pathname.endsWith('/') ? resolved.pathname : `${resolved.pathname}/`;
	resolved.pathname = `${basePath}${probePath}`.replace(/\/+/g, '/');
	return resolved;
}

async function readResponseSnippet(response: Response): Promise<string> {
	try {
		const text = await response.text();
		return text.slice(0, 256);
	} catch {
		return '';
	}
}

async function classifyResponse(response: Response): Promise<{ status: HealthStatus; responseSnippet: string }> {
	const responseSnippet = await readResponseSnippet(response);

	if (isHealthyBody(responseSnippet)) {
		return { status: 'DEGRADED', responseSnippet };
	}

	return {
		status: response.ok ? 'UP' : 'DEGRADED',
		responseSnippet,
	};
}

async function probeUrl(url: URL, probePath: ProbePath): Promise<ProbeResult> {
	const controller = new AbortController();
	const startedAt = performance.now();
	const timeoutId = setTimeout(() => {
		controller.abort();
	}, TIMEOUT_MS);

	try {
		const response = await fetch(url, {
			method: 'GET',
			headers: {
				accept: 'application/json,text/plain,*/*',
			},
			signal: controller.signal,
		});
		const latencyMs = Math.round(performance.now() - startedAt);
		const classification = await classifyResponse(response);

		return {
			status: classification.status,
			latencyMs,
			httpStatus: response.status,
			url: url.toString(),
			probePath,
			responseSnippet: classification.responseSnippet || undefined,
		};
	} catch (error) {
		const latencyMs = Math.round(performance.now() - startedAt);

		return {
			status: 'DOWN',
			latencyMs,
			url: url.toString(),
			probePath,
			error: describeError(error),
		};
	} finally {
		clearTimeout(timeoutId);
	}
}

function buildProbeCandidate(baseUrl: URL, probePath: ProbePath): URL {
	return resolveProbeUrl(baseUrl, probePath);
}

async function checkServer(server: ServerDefinition): Promise<ServerHealthResult> {
	const endpoint = process.env[server.envVar]?.trim();

	if (!endpoint) {
		return {
			server,
			endpoint: '',
			status: 'DOWN',
			latencyMs: 0,
			error: `Missing environment variable ${server.envVar}`,
		};
	}

	let baseUrl: URL;

	try {
		baseUrl = new URL(endpoint);
	} catch {
		return {
			server,
			endpoint,
			status: 'DOWN',
			latencyMs: 0,
			error: `Invalid URL in ${server.envVar}`,
		};
	}

	let firstDegraded: ProbeResult | undefined;
	let firstDown: ProbeResult | undefined;

	for (const probePath of PROBE_PATHS) {
		const candidateUrl = buildProbeCandidate(baseUrl, probePath);
		const result = await probeUrl(candidateUrl, probePath);

		if (result.status === 'UP') {
			return {
				server,
				endpoint,
				status: 'UP',
				latencyMs: result.latencyMs,
				probePath: result.probePath,
				httpStatus: result.httpStatus,
				responseSnippet: result.responseSnippet,
			};
		}

		if (result.status === 'DEGRADED' && !firstDegraded) {
			firstDegraded = result;
		}

		if (result.status === 'DOWN' && !firstDown) {
			firstDown = result;
		}
	}

	if (firstDegraded) {
		return {
			server,
			endpoint,
			status: 'DEGRADED',
			latencyMs: firstDegraded.latencyMs,
			probePath: firstDegraded.probePath,
			httpStatus: firstDegraded.httpStatus,
			responseSnippet: firstDegraded.responseSnippet,
		};
	}

	return {
		server,
		endpoint,
		status: 'DOWN',
		latencyMs: firstDown?.latencyMs ?? 0,
		probePath: firstDown?.probePath,
		error: firstDown?.error ?? `Unable to reach ${server.envVar}`,
	};
}

function logServerResult(result: ServerHealthResult): void {
	const payload = {
		event: 'mcp_health_check_result',
		serverId: result.server.id,
		serverName: result.server.name,
		envVar: result.server.envVar,
		critical: result.server.critical,
		endpoint: result.endpoint,
		status: result.status,
		latencyMs: result.latencyMs,
		probePath: result.probePath,
		httpStatus: result.httpStatus,
		error: result.error,
		responseSnippet: result.responseSnippet,
	};

	if (result.status === 'DOWN') {
		logger.error(payload, 'mcp server is down');
		return;
	}

	if (result.status === 'DEGRADED') {
		logger.warn(payload, 'mcp server is degraded');
		return;
	}

	logger.info(payload, 'mcp server is up');
}

async function main(): Promise<void> {
	const startedAt = performance.now();
	logger.info(
		{
			event: 'mcp_health_check_start',
			servers: SERVERS.map(server => ({
				id: server.id,
				name: server.name,
				envVar: server.envVar,
				critical: server.critical,
			})),
			timeoutMs: TIMEOUT_MS,
		},
		'starting mcp health check',
	);

	const results = await Promise.all(SERVERS.map(async server => checkServer(server)));

	for (const result of results) {
		logServerResult(result);
	}

	const upCount = results.filter(result => result.status === 'UP').length;
	const degradedCount = results.filter(result => result.status === 'DEGRADED').length;
	const downCount = results.filter(result => result.status === 'DOWN').length;
	const criticalDownCount = results.filter(result => result.server.critical && result.status === 'DOWN').length;
	const durationMs = Math.round(performance.now() - startedAt);

	logger.info(
		{
			event: 'mcp_health_check_summary',
			totalServers: results.length,
			upServers: upCount,
			degradedServers: degradedCount,
			downServers: downCount,
			criticalDownServers: criticalDownCount,
			durationMs,
		},
		'mcp health check summary',
	);

	if (criticalDownCount > 0) {
		process.exitCode = 1;
	}
}

try {
	await main();
} catch (error: unknown) {
	logger.fatal(
		{
			event: 'mcp_health_check_failure',
			error: error instanceof Error ? error : new Error(describeError(error)),
		},
		'mcp health check failed',
	);
	process.exitCode = 1;
}
