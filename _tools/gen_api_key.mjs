import {customAlphabet} from "nanoid";

const nanoid = customAlphabet('0123456789BCDFGHJKLMNPQRSTVWXZbcdfghjklmnpqrstvwxz', 32);

// Each tenant ID should be considered like an account/organization.
// Each tenant can have multiple API keys (but the tenant ID portion should be the same).
// Each tenant can have unlimited number of custom domains using the same deployment.
// There is one database (DO) per tenant for coordinating the creation/deletion of redirection rules.
// But, the actual URL visits are NOT bottlenecked by the tenant, each rule has its own Durable Object
// and requests go straight to that from the edge.
const tenantId = nanoid(32);

// Not used anywhere in the code other than checking every request to the API
// that this token matches the Worker Secret variable injected in its `env`.
const token = nanoid(36);

// After printing this, add it in your Worker with `npx wrangler secret put VAR_API_AUTH_ADMIN_KEYS_CSV`.
console.log(`rf_key_${tenantId}_${token}`);
