import { HTTPException } from "hono/http-exception";
import { CfEnv } from "./durable-objects";

export function apiKeyAuth(env: CfEnv, request: Request) {
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
