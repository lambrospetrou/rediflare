import { DurableObject } from 'cloudflare:workers';
import { ApiListRedirectRulesResponse, ApiRedirectRuleStatsAggregated } from './types';
import { SchemaMigration, SchemaMigrations } from './sql-migrations';

export interface CfEnv {
	REDIFLARE_TENANT: DurableObjectNamespace<RediflareTenant>;
	REDIFLARE_REDIRECT_RULE: DurableObjectNamespace<RediflareRedirectRule>;

	ASSETS: Fetcher;

	VAR_API_AUTH_ENABLED: boolean;

	// TODO Move auth keys to Workers KV for multitenancy.
	VAR_API_AUTH_ADMIN_KEYS_CSV: string;
}

/////////////////////////////////////////////////////////////////
// Durable Objects
///////////////////

const RediflareTenantMigrations: SchemaMigration[] = [
	{
		idMonotonicInc: 1,
		description: 'initial version',
		sql: `
            CREATE TABLE IF NOT EXISTS tenant_info(
				tenant_id TEXT PRIMARY KEY,
				dataJson TEXT
			);
            CREATE TABLE IF NOT EXISTS rules (
				rule_url TEXT PRIMARY KEY,
				tenant_id TEXT,
				response_status INTEGER,
				response_location TEXT,
				response_headers TEXT
			);
        `,
	},
	{
		idMonotonicInc: 2,
		description: 'initial version for stats table',
		// Aggregated statistics for all the rules on the tenant.
		// Alternatively query Analytics Engine directly from the Workers.
		sql: `
            CREATE TABLE IF NOT EXISTS url_visits_stats_agg (
                tenant_id TEXT,
				rule_url TEXT,
				ts_hour_ms INTEGER,
				total_visits INTEGER,

				PRIMARY KEY (tenant_id, rule_url, ts_hour_ms)
			);
        `,
	},
];

export class RediflareTenant extends DurableObject {
	env: CfEnv;
	sql: SqlStorage;
	tenantId: string = '';

	_migrations?: SchemaMigrations;

	/**
	 * @param ctx - The interface for interacting with Durable Object state
	 * @param env - The interface to reference bindings declared in wrangler.toml
	 */
	constructor(ctx: DurableObjectState, env: CfEnv) {
		super(ctx, env);
		this.env = env;
		this.sql = ctx.storage.sql;

		ctx.blockConcurrencyWhile(async () => {
			this._migrations = new SchemaMigrations({
				doStorage: ctx.storage,
				migrations: RediflareTenantMigrations,
			});

			const tableExists = this.sql.exec("SELECT name FROM sqlite_master WHERE name = 'tenant_info';").toArray().length > 0;
			this.tenantId = tableExists ? String(this.sql.exec('SELECT tenant_id FROM tenant_info LIMIT 1').one().tenant_id) : '';
		});
	}

	async _initTables(tenantId: string) {
		const rowsData = await this._migrations!.runAll();
		if (rowsData.rowsRead || rowsData.rowsWritten) {
			console.info({ message: `RediflareTenant schema migrations`, rowsRead: rowsData.rowsRead, rowsWritten: rowsData.rowsWritten });
		}

		if (this.tenantId) {
			if (this.tenantId !== tenantId) {
				throw new Error('wrong tenant ID on the wrong RediflareTenant');
			}
		} else {
			this.sql.exec('INSERT INTO tenant_info VALUES (?, ?) ON CONFLICT DO NOTHING;', tenantId, '{}');
			this.tenantId = tenantId;
		}
		return this.tenantId;
	}

	async upsert(tenantId: string, ruleUrl: string, responseStatus: number, responseLocation: string, responseHeaders: string[2][]) {
		// console.log('BOOM :: TENANT :: UPSERT', tenantId, ruleUrl, responseStatus);
		await this._initTables(tenantId);

		await this.makeRedirectRuleStub(tenantId, ruleUrl).upsert(tenantId, ruleUrl, responseStatus, responseLocation, responseHeaders);

		this.sql.exec(
			`INSERT OR REPLACE INTO rules VALUES (?, ?, ?, ?, ?);`,
			ruleUrl,
			tenantId,
			responseStatus,
			responseLocation,
			JSON.stringify(responseHeaders)
		);

		return this.list();
	}

	async delete(tenantId: string, ruleUrl: string): Promise<ApiListRedirectRulesResponse> {
		// console.log('BOOM :: TENANT :: DELETE', tenantId, ruleUrl);
		await this._initTables(tenantId);

		await this.makeRedirectRuleStub(tenantId, ruleUrl).deleteAll();

		this.sql.exec(`DELETE FROM rules WHERE rule_url = ? AND tenant_id = ?;`, ruleUrl, tenantId);

		return this.list();
	}

	async list(): Promise<ApiListRedirectRulesResponse> {
		// console.log('BOOM :: TENANT :: LIST', this.tenantId);
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
					tenantId: String(row.tenant_id),
					ruleUrl: String(row.rule_url),
					tsHourMs: Number(row.ts_hour_ms),
					totalVisits: Number(row.total_visits),
				})),
		};
		return { data };
	}

	async recordStats(aggStats: ApiRedirectRuleStatsAggregated[]) {
		aggStats.forEach((s) => {
			this.sql.exec(`INSERT OR REPLACE INTO url_visits_stats_agg VALUES (?, ?, ?, ?);`, s.tenantId, s.ruleUrl, s.tsHourMs, s.totalVisits);
		});
	}

	makeRedirectRuleStub(tenantId: string, ruleUrl: string) {
		const ruleDOName = stubIdForRuleFromTenantRule(tenantId, ruleUrl);
		let id: DurableObjectId = this.env.REDIFLARE_REDIRECT_RULE.idFromName(ruleDOName);
		let ruleStub = this.env.REDIFLARE_REDIRECT_RULE.get(id);
		return ruleStub;
	}
}

const RediflareRedirectRuleMigrations: SchemaMigration[] = [
	{
		idMonotonicInc: 1,
		description: 'initial version',
		sql: `
            CREATE TABLE IF NOT EXISTS rules (
                rule_url TEXT PRIMARY KEY,
                tenant_id TEXT,
                response_status INTEGER,
                response_location TEXT,
                response_headers TEXT
            );

            CREATE TABLE IF NOT EXISTS url_visits (
				rule_url TEXT,
				ts_ms INTEGER,
				id TEXT,
				request_details TEXT,

				PRIMARY KEY (rule_url, ts_ms, id)
			);
        `
    }
];

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
	_statsAlarm: number | null = null;

	/**
	 * @param ctx - The interface for interacting with Durable Object state
	 * @param env - The interface to reference bindings declared in wrangler.toml
	 */
	constructor(ctx: DurableObjectState, env: CfEnv) {
		super(ctx, env);
		this.env = env;
		this.storage = ctx.storage;
		this.sql = ctx.storage.sql;

		ctx.blockConcurrencyWhile(async () => {
			const tableExists = this.sql.exec("SELECT name FROM sqlite_master WHERE name = 'rules';").toArray().length > 0;
			if (tableExists) {
				await this._initTables();
			}
			this._statsAlarm = await this.storage.getAlarm();
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

		// We asynchronously aggregate this to generate fancy analytics.
		this.sql.exec(`CREATE TABLE IF NOT EXISTS url_visits (
				rule_url TEXT,
				ts_ms INTEGER,
				id TEXT,
				request_details TEXT,

				PRIMARY KEY (rule_url, ts_ms, id)
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
		// console.log('BOOM :: REDIRECT_RULE :: UPSERT', tenantId, ruleUrl, responseStatus);

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

		// console.log('upsert DO redirect rule', JSON.stringify({ rules: [...this.rules.entries()] }));

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
		let rule = this.rules.get(ruleUrl);

        // console.log("BOOM :: ", [...this.rules.entries()], rule, eyeballRequest.url, ruleUrl);

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

		// FIXME Alarms are broken for SQLite DOs as of 2024-09-27, so enable them later.
		// await this.scheduleStatsSubmission();

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

	async scheduleStatsSubmission() {
		if (!!this._statsAlarm) {
			// Already scheduled, backoff.
			return;
		}
		this._statsAlarm = Date.now() + 5_000;
		await this.storage.setAlarm(this._statsAlarm);
	}

	async alarm() {
		this._statsAlarm = null;

		const tenantId = await this.findTenantId();

		const raw = this.sql
			.exec('SELECT * FROM url_visits')
			.toArray()
			.map((row) => ({
				ruleUrl: String(row.rule_url),
				tsMs: Number(row.ts_ms),
				id: String(row.id),
				requestDetailsJson: String(row.request_details),
			}));

		const agg: Map<string, ApiRedirectRuleStatsAggregated> = new Map();
		for (const r of raw) {
			const hourStart = Math.floor(r.tsMs / (3600 * 1000)) * (3600 * 1000);
			const key = `${r.ruleUrl}::${hourStart}`;

			if (!agg.has(key)) {
				agg.set(key, {
					tenantId,
					ruleUrl: r.ruleUrl,
					tsHourMs: hourStart,
					totalVisits: 1,
				});
			} else {
				agg.get(key)!.totalVisits += 1;
			}
		}

		const aggStats = [...agg.values()];

		let id: DurableObjectId = this.env.REDIFLARE_TENANT.idFromName(tenantId);
		let tenantStub = this.env.REDIFLARE_TENANT.get(id);
		await tenantStub.recordStats(aggStats);

		// TODO Publish stats to Workers Analytics Engine with more fine-grained detail (e.g. user agent).

		// Delete all data from more than 2 hours ago to keep the storage low in this DO.
		this.sql.exec(`
            DELETE FROM url_visits
            WHERE ts_ms < (strftime('%s', 'now') * 1000) - (2 * 3600 * 1000);    
        `);
	}

	async findTenantId() {
		await this._initTables();
		return String(this.sql.exec('SELECT tenant_id FROM rules LIMIT 1;').one().tenant_id);
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

/////////////////////////////////////////////////////////////////
// API Handlers
////////////////

export async function routeRedirectRequest(request: Request, env: CfEnv) {
	const stubName = stubIdForRuleFromRequest(request);
	let id: DurableObjectId = env.REDIFLARE_REDIRECT_RULE.idFromName(stubName);
	let stub = env.REDIFLARE_REDIRECT_RULE.get(id);
	return stub.redirect(request);
}

export async function routeListUrlRedirects(request: Request, env: CfEnv, tenantId: string): Promise<ApiListRedirectRulesResponse> {
	let id: DurableObjectId = env.REDIFLARE_TENANT.idFromName(tenantId);
	let tenantStub = env.REDIFLARE_TENANT.get(id);

	return tenantStub.list();
}

export async function routeUpsertUrlRedirect(request: Request, env: CfEnv, tenantId: string): Promise<ApiListRedirectRulesResponse> {
	interface Params {
		ruleUrl: string;
		responseStatus: number;
		responseLocation: string;
		responseHeaders?: string[2][];
	}

	const params = (await request.json()) as Params;

	let id: DurableObjectId = env.REDIFLARE_TENANT.idFromName(tenantId);
	let tenantStub = env.REDIFLARE_TENANT.get(id);

	return tenantStub.upsert(tenantId, params.ruleUrl, params.responseStatus, params.responseLocation, params.responseHeaders || []);
}

export async function routeDeleteUrlRedirect(request: Request, env: CfEnv, tenantId: string): Promise<ApiListRedirectRulesResponse> {
	interface Params {
		ruleUrl: string;
	}
	const params = (await request.json()) as Params;

	let id: DurableObjectId = env.REDIFLARE_TENANT.idFromName(tenantId);
	let tenantStub = env.REDIFLARE_TENANT.get(id);

	return tenantStub.delete(tenantId, params.ruleUrl);
}
