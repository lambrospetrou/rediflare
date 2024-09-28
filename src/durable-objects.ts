import { DurableObject } from 'cloudflare:workers';
import { ApiListRedirectRulesResponse } from './types';

export interface CfEnv {
	REDIFLARE_TENANT: DurableObjectNamespace<RediflareTenant>;
	REDIFLARE_REDIRECT_RULE: DurableObjectNamespace<RediflareRedirectRule>;

    ASSETS: Fetcher,

	VAR_API_AUTH_ENABLED: boolean;

	// TODO Move auth keys to Workers KV for multitenancy.
	VAR_API_AUTH_ADMIN_KEYS_CSV: string;
}

/////////////////////////////////////////////////////////////////
// Durable Objects
///////////////////

export class RediflareTenant extends DurableObject {
	env: CfEnv;
	sql: SqlStorage;
	tenantId: string = '';

	/**
	 * @param ctx - The interface for interacting with Durable Object state
	 * @param env - The interface to reference bindings declared in wrangler.toml
	 */
	constructor(ctx: DurableObjectState, env: CfEnv) {
		super(ctx, env);
		this.env = env;
		this.sql = ctx.storage.sql;

		console.log('constructor DO tenant');

		ctx.blockConcurrencyWhile(async () => {
			const tableExists = this.sql.exec("SELECT name FROM sqlite_master WHERE name = 'tenant_info';").toArray().length > 0;
			this.tenantId = tableExists ? String(this.sql.exec('SELECT tenant_id FROM tenant_info LIMIT 1').one().tenant_id) : '';
			console.log('DO TENANT found:', this.tenantId);
		});
	}

	async _initTables(tenantId: string) {
		if (this.tenantId) {
			if (this.tenantId !== tenantId) {
				throw new Error('wrong tenant ID on the wrong RediflareTenant');
			}
			return this.tenantId;
		}
		this.sql.exec(`CREATE TABLE IF NOT EXISTS tenant_info(
				tenant_id TEXT PRIMARY KEY,
				dataJson TEXT
			)`);
		this.sql.exec('INSERT INTO tenant_info VALUES (?, ?) ON CONFLICT DO NOTHING;', tenantId, '{}');

		this.sql.exec(`CREATE TABLE IF NOT EXISTS rules (
				rule_url TEXT PRIMARY KEY,
				tenant_id TEXT,
				response_status INTEGER,
				response_location TEXT,
				response_headers TEXT
			)`);

		// Aggregated statistics for all the rules on the tenant.
		// Alternatively query Analytics Engine directly from the Workers.
		this.sql.exec(`CREATE TABLE IF NOT EXISTS url_visits_stats_agg (
				rule_url TEXT,
				ts_hour_ms INTEGER,
				total_visits INTEGER,

				PRIMARY KEY (rule_url, ts_hour_ms)
			)`);
		this.tenantId = tenantId;
	}

	async upsert(tenantId: string, ruleUrl: string, responseStatus: number, responseLocation: string, responseHeaders: string[2][]) {
		console.log('BOOM :: TENANT :: UPSERT', tenantId, ruleUrl, responseStatus);

		await this._initTables(tenantId);

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
			JSON.stringify(responseHeaders)
		);

		return { data: res.data };
	}

	async list(): Promise<ApiListRedirectRulesResponse> {
		console.log('BOOM :: TENANT :: LIST', this.tenantId);
		if (!this.tenantId) {
			return {
				data: {
					rules: [],
					stats: [],
				},
			} as ApiListRedirectRulesResponse;
		}

		const data: ApiListRedirectRulesResponse['data'] = {
			rules: this.sql
				.exec('SELECT * FROM rules;')
				.toArray()
				.map((row) => ({
					tenantId: String(row.tenant_id),
					ruleUrl: String(row.rule_url),
					responseStatus: Number(row.response_status),
					responseLocation: String(row.response_location),
					responseHeaders: JSON.parse(row.response_headers as string) as string[2][],
				})),
			stats: this.sql
				.exec('SELECT * FROM url_visits_stats_agg')
				.toArray()
				.map((row) => ({
					ruleUrl: String(row.rule_url),
					tsHourMs: Number(row.ts_hour_ms),
					totalVisits: Number(row.total_visits),
				})),
		};
		console.log({ debug: JSON.stringify(data) });
		return { data };
	}

	async delete(tenantId: string, ruleUrl: string): Promise<ApiListRedirectRulesResponse> {
		console.log('BOOM :: TENANT :: DELETE', tenantId, ruleUrl);

		await this._initTables(tenantId);

		const ruleDOName = stubIdForRuleFromTenantRule(tenantId, ruleUrl);
		let id: DurableObjectId = this.env.REDIFLARE_REDIRECT_RULE.idFromName(ruleDOName);
		let ruleStub = this.env.REDIFLARE_REDIRECT_RULE.get(id);

		await ruleStub.deleteAll();

		this.sql.exec(`DELETE FROM rules WHERE rule_url = ? AND tenant_id = ?;`, ruleUrl, tenantId);

		return this.list();
	}
}

export class RediflareRedirectRule extends DurableObject {
	env: CfEnv;
	storage: DurableObjectStorage;
	sql: SqlStorage;
	rules: Map<
		string,
		{
			tenantId: string;
			ruleUrl: string;
			responseStatus: number;
			responseLocation: string;
			responseHeaders: string[2][];
		}
	> = new Map();

	_sqlInitialized: boolean = false;

	/**
	 * @param ctx - The interface for interacting with Durable Object state
	 * @param env - The interface to reference bindings declared in wrangler.toml
	 */
	constructor(ctx: DurableObjectState, env: CfEnv) {
		super(ctx, env);
		this.env = env;
		this.storage = ctx.storage;
		this.sql = ctx.storage.sql;

		console.log('constructor DO redirect rule');
		ctx.blockConcurrencyWhile(async () => {
			const tableExists = this.sql.exec("SELECT name FROM sqlite_master WHERE name = 'rules';").toArray().length > 0;
			if (tableExists) {
				await this._initTables();
			}
		});
	}

	async _initTables() {
		if (this._sqlInitialized) {
			return;
		}

		this.sql.exec(`CREATE TABLE IF NOT EXISTS rules (
				rule_url TEXT PRIMARY KEY,
				tenant_id TEXT,
				response_status INTEGER,
				response_location TEXT,
				response_headers TEXT
			)`);

		// We could asynchronously aggregate this into Analytics Engine, to generate fancy analytics.
		this.sql.exec(`CREATE TABLE IF NOT EXISTS url_visits (
				slug_url TEXT,
				ts_ms INTEGER,
				id TEXT,
				request_details TEXT,

				PRIMARY KEY (slug_url, ts_ms, id)
			)`);

		this.rules = new Map(
			this.sql
				.exec(`SELECT * FROM rules;`)
				.toArray()
				.map((row) => {
					return [
						String(row.rule_url),
						{
							tenantId: String(row.tenant_id),
							ruleUrl: String(row.rule_url),
							responseStatus: Number(row.response_status),
							responseLocation: String(row.response_location),
							responseHeaders: JSON.parse(row.response_headers as string) as string[2][],
						},
					];
				})
		);

		this._sqlInitialized = true;
	}

	async upsert(tenantId: string, ruleUrl: string, responseStatus: number, responseLocation: string, responseHeaders: string[2][]) {
		console.log('BOOM :: REDIRECT_RULE :: UPSERT', tenantId, ruleUrl, responseStatus);

		await this._initTables();

		this.sql.exec(
			`INSERT OR REPLACE INTO rules VALUES (?, ?, ?, ?, ?);`,
			ruleUrl,
			tenantId,
			responseStatus,
			responseLocation,
			JSON.stringify(responseHeaders)
		);
		this.rules.set(ruleUrl, {
			tenantId,
			ruleUrl,
			responseStatus,
			responseLocation,
			responseHeaders,
		});

		console.log('upsert DO redirect rule', JSON.stringify({ rules: [...this.rules.entries()] }));

		return {
			data: {
				rules: [...this.rules.entries()],
			},
		};
	}

	async deleteAll() {
		this.rules.clear();
		this._sqlInitialized = false;

		this.storage.deleteAlarm();
		await this.storage.deleteAll();
	}

	async redirect(eyeballRequest: Request) {
		let ruleUrl = ruleUrlFromEyeballRequest(eyeballRequest);

		console.log('BOOM :: REDIRECT_RULE :: REDIRECT', ruleUrl);

		let rule = this.rules.get(ruleUrl);
		console.log('found rule', !!rule, ruleUrl, JSON.stringify({ rule, rules: [...this.rules.entries()] }));
		if (!rule) {
			return new Response('Not found 404', {
				status: 404,
				statusText: 'Not found',
			});
		}

		await this._initTables();

		const requestInfo = {
			userAgent: eyeballRequest.headers.get('User-Agent'),
		};
		this.sql.exec(`INSERT INTO url_visits VALUES (?, ?, ?, ?)`, ruleUrl, Date.now(), crypto.randomUUID(), JSON.stringify(requestInfo));

		const h = new Headers();
		h.set('X-Powered-By', 'rediflare');
		rule.responseHeaders.forEach((rh) => h.set(rh[0], rh[1]));
		h.set('Location', rule.responseLocation);
		return new Response('redirecting', {
			status: rule.responseStatus,
			statusText: 'rediflare redirecting',
			headers: h,
		});
	}
}

/////////////////////////////////////////////////////////////////
// Utils
/////////

function ruleUrlFromEyeballRequest(request: Request) {
	const url = new URL(request.url);
	return `${url.origin}${url.pathname}`;
}

function stubIdForRuleFromTenantRule(tenantId: string, ruleUrl: string) {
	if (ruleUrl.startsWith('*/')) {
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
	const hashHex = hashArray.map((bytes) => bytes.toString(16).padStart(2, '0')).join('');
	return hashHex;
}

async function hashToBigInt(s: string) {
	const hashHex = hash(s);
	return BigInt(`0x${(await hashHex).substring(0, 16)}`);
}

/////////////////////////////////////////////////////////////////
// API Handlers
////////////////

export async function routeRedirectRequest(request: Request, env: CfEnv) {
	const stubName = stubIdForRuleFromRequest(request);
	let id: DurableObjectId = env.REDIFLARE_REDIRECT_RULE.idFromName(stubName);
	let stub = env.REDIFLARE_REDIRECT_RULE.get(id);
	return stub.redirect(request);
}

export async function routeListUrlRedirects(request: Request, env: CfEnv, tenantId: string) {
	let id: DurableObjectId = env.REDIFLARE_TENANT.idFromName(tenantId);
	let tenantStub = env.REDIFLARE_TENANT.get(id);

	const resp = (await tenantStub.list()) as ApiListRedirectRulesResponse;

	return Response.json({ data: resp.data });
}

export async function routeUpsertUrlRedirect(request: Request, env: CfEnv, tenantId: string) {
	interface Params {
		ruleUrl: string;
		responseStatus: number;
		responseLocation: string;
		responseHeaders?: string[2][];
	}

	const params = (await request.json()) as Params;

	let id: DurableObjectId = env.REDIFLARE_TENANT.idFromName(tenantId);
	let tenantStub = env.REDIFLARE_TENANT.get(id);

	const resp = await tenantStub.upsert(
		tenantId,
		params.ruleUrl,
		params.responseStatus,
		params.responseLocation,
		params.responseHeaders || []
	);

	return Response.json(resp);
}

export async function routeDeleteUrlRedirect(request: Request, env: CfEnv, tenantId: string) {
	interface Params {
		ruleUrl: string;
	}
	const params = (await request.json()) as Params;

	let id: DurableObjectId = env.REDIFLARE_TENANT.idFromName(tenantId);
	let tenantStub = env.REDIFLARE_TENANT.get(id);

	const resp = (await tenantStub.delete(tenantId, params.ruleUrl)) as ApiListRedirectRulesResponse;

	return Response.json({ data: resp.data });
}