import { HTTPException } from 'hono/http-exception';
import { CfEnv } from './durable-objects';

export function apiKeyAuth(env: CfEnv, request: Request) {
	const authEnabled = env.VAR_API_AUTH_ENABLED;
	if (!authEnabled) {
		console.log('skipping auth like some monster!');
		return 'rediflare-public-tenant';
	}

	// 1. Extra `rediflare-api-key` header.
	// 2. Extract tenantID and token from the header.
	// 3. Validate API KEY.
	// 4. Proceed or reject.
	const authKey = request.headers.get('Rediflare-Api-Key')?.trim();
	if (!authKey) {
		throw new HTTPException(403, {
			message: 'Rediflare-Api-Key header missing',
		});
	}

	// TODO Move this to Workers KV to allow multiple keys for multi-tenancy.
	const csvKeys = env.VAR_API_AUTH_ADMIN_KEYS_CSV?.split(',')
		.map((k) => k?.trim())
		.filter(Boolean);
	if (csvKeys.indexOf(authKey) < 0) {
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

export async function hash(s: string) {
	const utf8 = new TextEncoder().encode(s);
	const hashBuffer = await crypto.subtle.digest('SHA-256', utf8);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	const hashHex = hashArray.map((bytes) => bytes.toString(16).padStart(2, '0')).join('');
	return hashHex;
}

export async function hashToBigInt(s: string) {
	const hashHex = hash(s);
	return BigInt(`0x${(await hashHex).substring(0, 16)}`);
}
