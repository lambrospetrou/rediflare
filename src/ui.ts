import { Hono } from 'hono';
import { html, raw } from 'hono/html';
import { ApiListRedirectRulesResponse, RequestVars } from './types';
import { HTTPException } from 'hono/http-exception';
import { CfEnv, routeDeleteUrlRedirect, routeListUrlRedirects, routeUpsertUrlRedirect } from './durable-objects';
import { apiKeyAuth } from './shared';

export const uiAdmin = new Hono<{ Bindings: CfEnv; Variables: RequestVars }>();

uiAdmin.use('/-_-/ui/partials.*', async (c, next) => {
	const tenantId = apiKeyAuth(c.env, c.req.raw);
	c.set('tenantId', tenantId);
	return next();
});

uiAdmin.get('/-_-/ui/static/*', async (c) => {
	const url = new URL(c.req.raw.url);
	url.pathname = url.pathname.substring('/-_-'.length);
	const req = new Request(url, c.req.raw);
	return c.env.ASSETS.fetch(req);
});

uiAdmin.get('/-_-/ui', async (c) => {
	const main = Dashboard({});
	return c.html(
		Layout({
			title: 'Rediflare - Unlimited redirections for FREE',
			description: 'Unlimited URL redirections for FREE, deployed in your own account.',
			image: '',
			children: main,
		})
	);
});

uiAdmin.get('/-_-/ui/partials.ListRules', async (c) => {
	const { data } = await routeListUrlRedirects(c.req.raw, c.env, c.var.tenantId);
	return c.html(
		RulesAndStats({
			data,
			swapOOB: false,
		})
	);
});

uiAdmin.post('/-_-/ui/partials.DeleteRule', async (c) => {
	const form = await c.req.raw.formData();
	const ruleUrl = decodeURIComponent((form.get('ruleUrl') as string) ?? '');
	if (!ruleUrl) {
		throw new HTTPException(400, {
			res: new Response(`<p>Invalid request for deletion!</p>`, { status: 400 }),
		});
	}
	const { data } = await routeDeleteUrlRedirect(
		new Request(c.req.raw.url, {
			body: JSON.stringify({ ruleUrl }),
			method: 'POST',
		}),
		c.env,
		c.var.tenantId
	);
	return c.html(
		RulesAndStats({
			data,
			swapOOB: false,
		})
	);
});

uiAdmin.post('/-_-/ui/partials.CreateRule', async (c) => {
	const form = await c.req.raw.formData();
	const newRuleJson = (form.get('newRuleJson') as string) ?? '';
	if (!newRuleJson) {
		throw new HTTPException(400, {
			res: new Response(`<p>Invalid request for creation!</p>`, { status: 400 }),
		});
	}

	// TODO Parse and validate it before sending it to the DO.
	const { data } = await routeUpsertUrlRedirect(
		new Request(c.req.raw.url, {
			body: newRuleJson,
			method: 'POST',
		}),
		c.env,
		c.var.tenantId
	);
	const rulesList = RulesAndStats({
		data,
		swapOOB: true,
	});
	const createRuleForm = CreateRuleForm();

	return c.html(html`${createRuleForm} ${rulesList}`);
});

function RulesAndStats(props: { data: ApiListRedirectRulesResponse['data']; swapOOB: boolean }) {
	const { data, swapOOB } = props;

	if (!data.rules.length && !data.stats.length) {
		return html`<p>You have no redirect rules yet (•_•)</p>`;
	}

	data.stats.sort((s1, s2) => {
		if (s1.tsHourMs !== s2.tsHourMs) {
			return s2.tsHourMs - s1.tsHourMs;
		}
		return s2.ruleUrl.localeCompare(s1.ruleUrl);
	});

	const totalAggs = new Map<string, number>();
	data.stats.forEach((s) => totalAggs.set(s.ruleUrl, totalAggs.get(s.ruleUrl) ?? 0 + s.totalVisits));

	return html`
		<div id="rules-list" hx-swap-oob="${swapOOB ? 'true' : undefined}">
			${
				// TODO Improve :)
				data.rules.map(
					(rule) => html`
						<div>
							<pre>${raw(JSON.stringify(rule, null, 2))}</pre>
							<button
								hx-post="/-_-/ui/partials.DeleteRule"
								hx-vals=${raw(`'{"ruleUrl": "${encodeURIComponent(rule.ruleUrl)}"}'`)}
								hx-target="#redirection-rules-container"
								hx-confirm="Are you sure you want to delete rule?"
							>
								Delete rule
							</button>
						</div>
						<hr />
					`
				)
			}
		</div>
		<div id="stats-list" hx-swap-oob="${swapOOB ? 'true' : undefined}">
			<h3>Statistics</h3>
			${[...totalAggs.entries()].map(([ruleUrl, cnt]) => html`<p>${ruleUrl}: ${cnt}</p>`)}
			<hr />
			${
				// TODO Improve :)
				data.stats.map(
					(stat) => html`
						<div>
							<p>Hour: ${new Date(stat.tsHourMs).toISOString()}</p>
							<pre>${raw(JSON.stringify(stat, null, 2))}</pre>
						</div>
					`
				)
			}
		</div>
	`;
}

function CreateRuleForm() {
	return html`
		<div id="create-rule-container">
			<h3>Create new redirection rule</h3>
			<textarea id="new-rule-json" name="newRuleJson" cols="60" rows="7">
{
"ruleUrl": "http://127.0.0.1:8787/test-rule-11",
"responseStatus": 301,
"responseLocation": "https://skybear.net",
"responseHeaders": []
}
		</textarea>
			<button hx-post="/-_-/ui/partials.CreateRule" hx-include="#new-rule-json" hx-target="#create-rule-container" hx-swap="outerHTML">
				Create redirection rule
			</button>
		</div>
	`;
}

function Dashboard(props: {}) {
	const createRuleForm = CreateRuleForm();
	return html`<main>
		<h1>Rediflare</h1>

		<section>
			<h2>Rediflare-Api-Key</h2>
			<!-- This input value is auto-injected by HTMX in the AJAX requests to the API. See helpers.js. -->
			<input
				type="text"
				id="rf-api-key"
				name="rf-api-key"
				style="-webkit-text-security:disc"
				hx-trigger="input"
				hx-target="#redirection-rules-container"
				hx-get="/-_-/ui/partials.ListRules"
				hx-params="none"
			/>
		</section>

		<section>
			<h2>Redirection Rules</h2>

			${createRuleForm}

			<div id="redirection-rules-container" hx-get="/-_-/ui/partials.ListRules" hx-trigger="load, every 10s">
				<p>
					Paste your Rediflare-Api-Key in the above input box, or append it in the URL hash (e.g.
					<code>#rfApiKey=rf_key_TENANT1111_sometoken</code>) to interact with your redirection rules.
				</p>
			</div>
		</section>

		<script type="text/javascript">
			(function () {
				// Auto load the api key if it's in the hash section of the URL.
				function parseApiKeyFromHash() {
					let hashFragment = window.location.hash?.trim();
					if (hashFragment) {
						hashFragment = hashFragment.startsWith('#') ? hashFragment.substring(1) : hashFragment;
						const params = new URLSearchParams(hashFragment);
						const apiKey = params.get('rfApiKey')?.trim();
						if (apiKey) {
							document.querySelector('#rf-api-key').value = apiKey;
						}
					}
				}
				parseApiKeyFromHash();
			})();
		</script>
	</main>`;
}

function Layout(props: { title: string; description: string; image: string; children?: any }) {
	return html`
		<html>
			<head>
				<meta charset="UTF-8" />
				<title>${props.title}</title>
				<meta name="description" content="${props.description}" />
				<meta property="og:type" content="article" />
				<meta property="og:title" content="${props.title}" />
				<meta property="og:image" content="${props.image}" />

				<meta name="htmx-config" content='{"withCredentials":true,"globalViewTransitions": true,"selfRequestsOnly": false}' />
			</head>
			<body>
				${props.children}

				<script src="/-_-/ui/static/htmx.2.0.2.min.js" defer></script>
				<script src="/-_-/ui/static/helpers.js" defer></script>
			</body>
		</html>
	`;
}
