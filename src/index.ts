import { DurableObject } from "cloudflare:workers";

interface Env {
	REDIFLARE_TENANT: DurableObjectNamespace<RediflareTenant>;
	REDIFLARE_URL_ENTRY: DurableObjectNamespace<RediflareUrlEntry>;
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
	}

	/**
	 * The Durable Object exposes an RPC method sayHello which will be invoked when when a Durable
	 *  Object instance receives a request from a Worker via the same method invocation on the stub
	 *
	 * @param name - The name provided to a Durable Object instance from a Worker
	 * @returns The greeting to be sent back to the Worker
	 */
	async sayHello(name: string): Promise<string> {
		return `Hello, ${name}!`;
	}
}

export class RediflareUrlEntry extends DurableObject {
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
	}

}

const CONTROL_ROUTE_HANDLERS = new Map([
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

async function routeRedirectRequest(request: Request, env: Env) {
	let id: DurableObjectId = env.REDIFLARE_TENANT.idFromName(new URL(request.url).pathname);

	let stub = env.REDIFLARE_TENANT.get(id);

	let greeting = await stub.sayHello("world");

	return new Response(greeting);
}

async function routeListUrlRedirects(request: Request, env: Env) {
	return new Response();
}

async function routeUpsertUrlRedirect(request: Request, env: Env) {
	return new Response();
}

async function routeDeleteUrlRedirect(request: Request, env: Env) {
	return new Response();
}