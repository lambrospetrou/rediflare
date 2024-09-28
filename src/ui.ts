import { Hono } from 'hono';
import { html, raw } from 'hono/html';
import { ApiListRedirectRulesResponse, RequestVars } from './types';
import { HTTPException } from 'hono/http-exception';
import { CfEnv, routeDeleteUrlRedirect, routeListUrlRedirects } from './durable-objects';
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
	console.log(data);
	return c.html(
		RulesAndStats({
			data,
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
	console.log(data);
	return c.html(
		RulesAndStats({
			data,
		})
	);
});

function RulesAndStats(props: { data: ApiListRedirectRulesResponse['data'] }) {
	const { data } = props;

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
    data.stats.forEach(s => totalAggs.set(s.ruleUrl, totalAggs.get(s.ruleUrl) ?? 0 + s.totalVisits));

	return html`
		<div id="rules-list">
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
		<div id="stats-list">
            <h3>Statistics</h3>
            ${
                [...totalAggs.entries()].map(([ruleUrl, cnt]) => html`<p>${ruleUrl}: ${cnt}</p>`)
            }
            <hr>
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

function Dashboard(props: {}) {
	return html` <main>
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
			<div id="redirection-rules-container" hx-get="/-_-/ui/partials.ListRules" hx-trigger="load, every 10s"></div>
		</section>

        <script type="text/javascript">
        (function() {
            // Auto load the api key if it's in the hash section of the URL.
            function parseApiKeyFromHash() {
                let hashFragment = window.location.hash?.trim();
                if (hashFragment) {
                    hashFragment = hashFragment.startsWith("#") ? hashFragment.substring(1) : hashFragment;
                    const params = new URLSearchParams(hashFragment);
                    const apiKey = params.get("rfApiKey")?.trim();
                    if (apiKey) {
                        document.querySelector("#rf-api-key").value = apiKey;
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
