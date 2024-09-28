import { DurableObject } from "cloudflare:workers";

interface Env {
	REDIFLARE_TENANT: DurableObjectNamespace<RediflareTenant>;
	REDIFLARE_REDIRECT_RULE: DurableObjectNamespace<RediflareRedirectRule>;
}

/**
 * Welcome to Cloudflare Workers! This is your first Durable Objects application.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your Durable Object in action
 * - Run `npm run deploy` to publish your application
 *
 * Learn more at https://developers.cloudflare.com/durable-objects
 */

export class RediflareTenant extends DurableObject {
	env: Env
	sql: SqlStorage

	/**
	 * @param ctx - The interface for interacting with Durable Object state
	 * @param env - The interface to reference bindings declared in wrangler.toml
	 */
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.env = env;
		this.sql = ctx.storage.sql;

		this.ctx.blockConcurrencyWhile(async () => {
			// this.sql.exec(`CREATE TABLE IF NOT EXISTS tenant_info(
			// 	id TEXT PRIMARY KEY
			// )`);
			this.sql.exec(`CREATE TABLE IF NOT EXISTS rules (
				rule_url TEXT PRIMARY KEY,
				tenant_id TEXT,
				response_status INTEGER,
				response_location TEXT,
				response_headers TEXT
			)`);

			// Aggregated statistics for all the rules on the tenant.
			// Alternatively query Analytics Engine directly from the Workers.
			// this.sql.exec(`CREATE TABLE IF NOT EXISTS url_entries_stats (
			// 	id TEXT PRIMARY KEY,
			// 	total_visits INTEGER
			// )`);
		});
	}

	async debug() {
		console.log("BOOM :: TENANT :: DEBUG");
		const d = {
			rules: this.sql.exec("SELECT * FROM rules;").toArray(),
		};
		console.log({debug: JSON.stringify(d)});
		return d;
	}

	async upsert(tenantId: string, ruleUrl: string, responseStatus: number, responseLocation: string, responseHeaders: string[2][]) {
		console.log("BOOM :: TENANT :: UPSERT", tenantId, ruleUrl, responseStatus);

		// ruleUrl is either `*/path/here` or a full URL `https://example.com/path/here`.
		const ruleDOName = stubIdForRuleFromTenantRule(tenantId, ruleUrl);
		let id: DurableObjectId = this.env.REDIFLARE_REDIRECT_RULE.idFromName(ruleDOName);
		let ruleStub = this.env.REDIFLARE_REDIRECT_RULE.get(id);
		const res = await ruleStub.upsert(tenantId, ruleUrl, responseStatus, responseLocation, responseHeaders);

		this.sql.exec(
			`INSERT OR REPLACE INTO rules VALUES (?, ?, ?, ?, ?);`,
			ruleUrl,
			tenantId,
			responseStatus,
			responseLocation,
			JSON.stringify(responseHeaders),
		);

		return res;
	}
}

export class RediflareRedirectRule extends DurableObject {
	env: Env
	sql: SqlStorage
	rules: Map<string, {
		tenantId: string,
		ruleUrl: string,
		responseStatus: number,
		responseLocation: string,
		responseHeaders: string[2][],
	}> = new Map();

	/**
	 * @param ctx - The interface for interacting with Durable Object state
	 * @param env - The interface to reference bindings declared in wrangler.toml
	 */
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.env = env;
		this.sql = ctx.storage.sql;

		this.ctx.blockConcurrencyWhile(async () => {
			// this.sql.exec(`CREATE TABLE IF NOT EXISTS tenant_info(
			// 	id TEXT PRIMARY KEY
			// )`);
			this.sql.exec(`CREATE TABLE IF NOT EXISTS rules (
				rule_url TEXT PRIMARY KEY,
				tenant_id TEXT,
				response_status INTEGER,
				response_location TEXT,
				response_headers TEXT
			)`);

			// We could asynchronously aggregate this into Analytics Engine, to generate fancy analytics.
			this.sql.exec(`CREATE TABLE IF NOT EXISTS url_visits (
				ts_ms INTEGER,
				id TEXT,
				request_details TEXT,

				PRIMARY KEY (ts_ms, id)
			)`);

			this.rules = new Map(this.sql.exec(`SELECT * FROM rules;`).toArray().map(row => {
				return [String(row.rule_url), {
					tenantId: String(row.tenant_id),
					ruleUrl: String(row.rule_url),
					responseStatus: Number(row.response_status),
					responseLocation: String(row.response_location),
					responseHeaders: JSON.parse(row.response_headers as string) as string[2][],
				}];
			}));
		});

		console.log("constructor DO redirect rule", JSON.stringify({rules: [...this.rules.entries()]}));
	}

	async upsert(tenantId: string, ruleUrl: string, responseStatus: number, responseLocation: string, responseHeaders: string[2][]) {
		console.log("BOOM :: REDIRECT_RULE :: UPSERT", tenantId, ruleUrl, responseStatus);

		this.sql.exec(
			`INSERT OR REPLACE INTO rules VALUES (?, ?, ?, ?, ?);`,
			ruleUrl,
			tenantId,
			responseStatus,
			responseLocation,
			JSON.stringify(responseHeaders),
		);
		this.rules.set(ruleUrl, {
			tenantId,
			ruleUrl,
			responseStatus,
			responseLocation,
			responseHeaders,
		});

		console.log("upsert DO redirect rule", JSON.stringify({rules: [...this.rules.entries()]}));

		return {
			data: {
				rules: [...this.rules.entries()],
			},
		};
	}

	async redirect(eyeballRequest: Request) {
		let ruleUrl = ruleUrlFromEyeballRequest(eyeballRequest);

		console.log("BOOM :: REDIRECT_RULE :: REDIRECT", ruleUrl);

		let rule = this.rules.get(ruleUrl);
		console.log("found rule", !!rule, ruleUrl, JSON.stringify({rule, rules: [...this.rules.entries()]}))
		if (!rule) {
			return new Response("Not found 404", {
				status: 404,
				statusText: "Not found",
			});
		}

		const requestInfo = {
			userAgent: eyeballRequest.headers.get("User-Agent"),

		};
		this.sql.exec(`INSERT INTO url_visits VALUES (?, ?, ?)`, Date.now(), crypto.randomUUID(), JSON.stringify(requestInfo));

		const h = new Headers();
		h.set("X-Powered-By", "rediflare");
		rule.responseHeaders.forEach(rh => h.set(rh[0], rh[1]));
		h.set("Location", rule.responseLocation);
		return new Response("redirecting", {
			status: rule.responseStatus,
			statusText: "rediflare redirecting",
			headers: h,
		});
	}
}

const CONTROL_ROUTE_HANDLERS = new Map([
	["GET /-_-/debug", routeDebug],
	["GET /v1/redirects.List", routeListUrlRedirects],
	["POST /v1/redirects.Upsert", routeUpsertUrlRedirect],
	["POST /v1/redirects.Delete", routeDeleteUrlRedirect],
]);

export default {
	/**
	 * This is the standard fetch handler for a Cloudflare Worker
	 *
	 * @param request - The request submitted to the Worker from the client
	 * @param env - The interface to reference bindings declared in wrangler.toml
	 * @param ctx - The execution context of the Worker
	 * @returns The response to be sent back to the client
	 */

	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		// Poor man's auth :)
		// const hClientId = request.headers.get(CLIENT_ID_HEADER);
		// const qClientId = url.searchParams.get(CLIENT_ID_HEADER);
		// if (!CLIENT_IDS_ALLOWED.has(hClientId) && !CLIENT_IDS_ALLOWED.has(qClientId)) {
		// 	return new Response("⚆ _ ⚆", { status: 403 });
		// }

		const routeId = `${request.method} ${url.pathname}`;
		const routeHandler = CONTROL_ROUTE_HANDLERS.get(routeId);
		if (!routeHandler) {
			return routeRedirectRequest(request, env);
		}

		console.log(`control plane handling ${request.url}`)

		return routeHandler(request, env).catch(e => {
			const isUserError = e.message.startsWith("user_error:");
			if (!isUserError) {
				console.error(`failed to handle request: ${e.message} stacktrace: ${e.stack ?? "<unknown>"}`);
			}
			return new Response("failed to handle the request: " + e.message, {
				status: isUserError ? 400 : 500,
				statusText: e.message,
			})
		});
	},
} satisfies ExportedHandler<Env>;

///// HANDLERS

async function routeDebug(request: Request, env: Env) {
	const tenantId = stubIdForTenantFromRequest(request);
	let id: DurableObjectId = env.REDIFLARE_TENANT.idFromName(tenantId);
	let tenantStub = env.REDIFLARE_TENANT.get(id);
	return Response.json(await tenantStub.debug());
}

async function routeRedirectRequest(request: Request, env: Env) {
	const stubName = stubIdForRuleFromRequest(request);
	let id: DurableObjectId = env.REDIFLARE_REDIRECT_RULE.idFromName(stubName);
	let stub = env.REDIFLARE_REDIRECT_RULE.get(id);
	return stub.redirect(request);
}

async function routeListUrlRedirects(request: Request, env: Env) {
	return new Response();
}

async function routeUpsertUrlRedirect(request: Request, env: Env) {
	interface Params {
		ruleUrl: string,
		responseStatus: number,
		responseLocation: string,
		responseHeaders?: string[2][],
	};

	const params = await request.json() as Params;

	const tenantId = stubIdForTenantFromRequest(request);
	let id: DurableObjectId = env.REDIFLARE_TENANT.idFromName(tenantId);
	let tenantStub = env.REDIFLARE_TENANT.get(id);

	const resp = await tenantStub.upsert(tenantId, params.ruleUrl, params.responseStatus, params.responseLocation, params.responseHeaders || []);

	return Response.json(resp);
}

async function routeDeleteUrlRedirect(request: Request, env: Env) {
	return new Response();
}

//////////////////////////////////////////////////////////////////////////////

function ruleUrlFromEyeballRequest(request: Request) {
	const url = new URL(request.url);
	return `${url.origin}${url.pathname}`;
}

function wildcardOriginRuleUrlFromEyeballRequest(request: Request) {
	const url = new URL(request.url);
	return `*${url.pathname}`;
}

function stubIdForTenantFromRequest(request: Request) {
	// FIXME implement some kind of tenant ID derivation from the request.
	// Either the hostname, or from the Rediflare API KEY if present.

	return "rediflare-default-tenant";
}

function stubIdForRuleFromTenantRule(tenantId: string, ruleUrl: string) {
	if (ruleUrl.startsWith("*/")) {
		return `${tenantId}:::${ruleUrl}`;
	}
	// It's a full URL with origin and path.
	return ruleUrl;
}

function stubIdForRuleFromRequest(request: Request) {
	return ruleUrlFromEyeballRequest(request);
}

async function hash(s: string) {
	const utf8 = new TextEncoder().encode(s);
	const hashBuffer = await crypto.subtle.digest('SHA-256', utf8);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const hashHex = hashArray
	  .map((bytes) => bytes.toString(16).padStart(2, '0'))
	  .join('');
	return hashHex;
}

async function hashToBigInt(s: string) {
	const hashHex = hash(s);
	return BigInt(`0x${(await hashHex).substring(0, 16)}`)
}
