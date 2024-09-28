import { DurableObject } from 'cloudflare:workers';

import { Hono } from 'hono/tiny';
import { HTTPException } from 'hono/http-exception';
import { requestId } from 'hono/request-id';
import { logger } from 'hono/logger';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';

import {CfEnv, routeDeleteUrlRedirect, routeListUrlRedirects, routeRedirectRequest, routeUpsertUrlRedirect} from "./durable-objects";
export {RediflareTenant, RediflareRedirectRule } from "./durable-objects";

import { uiAdmin } from './ui';
import {RequestVars} from "./types"

const app = new Hono<{ Bindings: CfEnv; Variables: RequestVars }>();
export default app;

app.onError((e, c) => {
	if (e instanceof HTTPException) {
		// Get the custom response
		return e.getResponse();
	}
	console.error('failed to handle the request: ', e);
	return new Response('failed to handle the request: ' + e.message, {
		status: 500,
		statusText: e.name,
	});
});

app.use('*', requestId());
app.use(async function poweredBy(c, next) {
	await next();
	c.res.headers.set('X-Powered-By', 'Rediflare');
});
app.use(logger());
app.use(
	cors({
		// TODO
		origin: '*',
		allowHeaders: ['Upgrade-Insecure-Requests'],
		allowMethods: ['POST', 'GET', 'OPTIONS'],
		maxAge: 600,
		credentials: true,
	})
);
app.use(
	bodyLimit({
		maxSize: 10 * 1024, // 10kb
		onError: (c) => {
			return c.text('overflow :(', 413);
		},
	})
);

app.use('/-_-/v1/*', async (c, next) => {
	const tenantId = apiKeyAuth(c.env, c.req.raw);
	c.set("tenantId", tenantId);
	return next();
});

app.use('/-_-/ui/partials.*', async (c, next) => {
	const tenantId = apiKeyAuth(c.env, c.req.raw);
	c.set("tenantId", tenantId);
	return next();
});

app.get('/-_-/v1/redirects.List', async (c) => {
	return routeListUrlRedirects(c.req.raw, c.env, c.var.tenantId);
});

app.post('/-_-/v1/redirects.Upsert', async (c) => {
	return routeUpsertUrlRedirect(c.req.raw, c.env, c.var.tenantId);
});

app.post('/-_-/v1/redirects.Delete', async (c) => {
	return routeDeleteUrlRedirect(c.req.raw, c.env, c.var.tenantId);
});

app.route('/', uiAdmin);

app.get('/*', async (c) => {
	return routeRedirectRequest(c.req.raw, c.env);
});

function apiKeyAuth(env: CfEnv, request: Request) {
	const authEnabled = env.VAR_API_AUTH_ENABLED;
	if (!authEnabled) {
		console.log('skipping auth like some monster!');
		return 'rediflare-public-tenant';
	}

	console.log('authing...');

	// TODO
	// 1. Extra `rediflare-api-key` header
	// 2. Extract tenantID and token from the header.
	// 3. Validate token for tenant.
	// 4. proceed or reject.
	const authKey = request.headers.get('Rediflare-Api-Key')?.trim();
	if (!authKey) {
		throw new HTTPException(403, {
			message: 'Rediflare-Api-Key header missing',
		});
	}
	// TODO Move this to Workers KV to allow multiple keys for multi-tenancy.
	if (env.VAR_API_AUTH_ADMIN_KEYS_CSV.indexOf(`,${authKey},`) < 0) {
		throw new HTTPException(403, {
			message: 'Rediflare-Api-Key is invalid',
		});
	}

	// The key is `rf_key_<tenantID>_<token>`.

	const lastSepIdx = authKey.lastIndexOf('_');
	if (lastSepIdx < 0) {
		throw new HTTPException(403, {
			message: 'Rediflare-Api-Key is malformed',
		});
	}
	const tenantId = authKey.slice('rf_key_'.length, lastSepIdx)?.trim();
	if (!tenantId) {
		throw new HTTPException(403, {
			message: 'Rediflare-Api-Key is malformed',
		});
	}

	return tenantId;
}
