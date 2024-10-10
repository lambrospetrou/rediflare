import { Hono } from 'hono';
import { html, raw } from 'hono/html';
import { ApiListRedirectRulesResponse, RequestVars } from './types';
import { HTTPException } from 'hono/http-exception';
import { CfEnv, routeDeleteUrlRedirect, routeListUrlRedirects, routeUpsertUrlRedirect } from './durable-objects';
import { apiKeyAuth } from './shared';

export const uiAdmin = new Hono<{ Bindings: CfEnv; Variables: RequestVars }>();
export const uiAbout = new Hono<{ Bindings: CfEnv; Variables: RequestVars }>();

function RediflareName() {
	return html`<span class="rediflare-name">Rediflare <span style="color: var(--pico-primary)">↝</span></span>`;
}

uiAbout.get('/', async (c) => {
	return c.html(
		Layout({
			title: 'Rediflare - Unlimited URL redirections. Practically FREE.',
			description: 'URL redirections tool deployed in your own Cloudflare account.',
			image: '',
			children: AboutIndex(),
		})
	);
});

function AboutIndex() {
	const heroSnippetCode = `"ruleUrl": "https://go.rediflare.com/boom",
"responseStatus": 302,
"responseLocation": "https://skybear.net",
"responseHeaders": [
    ["X-Powered-By", "Rediflare"]
]`;

	return html`
	<header class="about-header container">
		<nav>
			<ul>
				<li>
					<p style="margin-bottom: 0"><a href="/" class="contrast">${RediflareName()}</span></p>
				</li>
			</ul>
			<ul>
				<!-- <li><a href="https://developers.cloudflare.com/durable-objects/" class="contrast">Durable Objects</a></li> -->
				<li>
					<a href="https://github.com/lambrospetrou/rediflare" target="_blank"><button class="contrast">Github repo</button></a>
				</li>
			</ul>
		</nav>
	</header>

	<main class="container">
		<section class="about-hero">
			<div>
				<h2 class="text-center"><kbd>Unlimited</kbd> URL redirections. Practically <mark>FREE.</mark></h2>
				<p class="text-center"><em>Self-host Rediflare in your own Cloudflare account.</em></p>
			</div>

			<div class="mac-window">
				<div class="mac-window-header">
					<div class="mac-window-buttons">
						<div class="mac-window-button mac-window-close"></div>
						<div class="mac-window-button mac-window-minimize"></div>
						<div class="mac-window-button mac-window-maximize"></div>
					</div>
				</div>
				<div class="mac-window-content overflow-auto">
					<pre class="hero-snippet"><code>${heroSnippetCode}</code></pre>
				</div>
			</div>
		</section>

		<section class="text-center">
			<p><code><span class="self-window-location-domain">go.rediflare.com</span></code> uses ${RediflareName()} for its URL redirection needs.</p>
			<p><a href="https://github.com/lambrospetrou/rediflare/fork"><button>Fork the repository ➜ <code>npm run deploy:prod</code></button></a></p>

			<script>
			(function() {
				document.querySelectorAll(".self-window-location-domain").forEach(n => n.innerHTML = window.location.host ?? "go.rediflare.com");
			})()
			</script>
		</section>
	</main>

	<hr>
	<footer class="container text-center">
		<p>${RediflareName()} is built by <a href="https://www.lambrospetrou.com" target="_blank">Lambros Petrou</a>. 🚀👌</p>
		<p><small><a href="/-_-/ui/" class="secondary">Open Admin UI</a></small></p>
	</footer>

	<style>
		:root {
			--app-window-code-bg-color: #f0f0f0;
		}

		h1, h2, h3, h4, h5, p {
			text-wrap: pretty;
		}

		.text-center { text-align: center; }

		.about-header .rediflare-name {
			font-size: 2rem;
		}

		.about-hero {
			display: flex;
			flex-direction: column;
			align-items: center;
			margin: 2rem auto 4rem auto;
		}

		.about-hero h2 {
			line-height: 2.25rem;
		}

		pre.hero-snippet {
			--pico-code-background-color: var(--app-window-code-bg-color);
			margin-bottom: 0;
		}
		pre.hero-snippet code {
			padding: 0;
		}

		.mac-window {
			width: fit-content;
			max-width: 95%;
			background-color: var(--app-window-code-bg-color);
			border-radius: 8px;
			box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
			overflow: hidden;
		}

		.mac-window-header {
			background-color: #e0e0e0;
			padding: 10px;
			display: flex;
			align-items: center;
		}

		.mac-window-buttons {
			display: flex;
			gap: 6px;
		}

		.mac-window-button {
			width: 12px;
			height: 12px;
			border-radius: 50%;
		}

		.mac-window-close { background-color: #ff5f56; }
		.mac-window-minimize { background-color: #ffbd2e; }
		.mac-window-maximize { background-color: #27c93f; }

		.mac-window-content {
			padding: 1rem;
		}

		@media (min-width: 50rem) {
			.mac-window-content {
				padding: 2rem;
			}
		}
	</style>
`;
}

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
			title: 'Rediflare - Unlimited URL redirections. Practically FREE.',
			description: 'URL redirections tool deployed in your own Cloudflare account.',
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
	data.stats.forEach((s) => totalAggs.set(s.ruleUrl, (totalAggs.get(s.ruleUrl) ?? 0) + s.totalVisits));
	const totalCountsSorted = [...totalAggs.entries()].sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));

	// console.log("BOOM :: rules and stats", {data});

	return html`
		<section id="rules-list" hx-swap-oob="${swapOOB ? 'true' : undefined}">
			<h3>Existing rules</h3>
			<div>
				${
					// TODO Improve :)
					data.rules.map(
						(rule) => html`
							<article>
								<header><a href="${rule.ruleUrl}" target="_blank">${rule.ruleUrl} ↝</a></header>
								<pre><code>${raw(JSON.stringify(rule, null, 2))}</code></pre>
								<footer>
									<button class="outline"
										hx-post="/-_-/ui/partials.DeleteRule"
										hx-vals=${raw(`'{"ruleUrl": "${encodeURIComponent(rule.ruleUrl)}"}'`)}
										hx-target="#redirection-rules-container"
										hx-confirm="Are you sure you want to delete rule?"
									>
										Delete rule
									</button>
								</footer>
							</article>
							<hr />
						`
					)
				}
			</div>
			<div id="stats-list" hx-swap-oob="${swapOOB ? 'true' : undefined}">
				<hgroup>
					<h2>Statistics</h2>
					${
						data.stats.length === 0 ? html`<p>No stats have been aggregated yet.</p>` : null
					}
				</hgroup>
				<table class="striped">
					<thead>
						<tr>
							<th scope="col">Rule URL</th>
							<th scope="col">Total count</th>
						</tr>
					</thead>
					<tbody>
						${totalCountsSorted.map(([ruleUrl, cnt]) => html`<tr><th scope="row">${ruleUrl}</th><td>${cnt}</td></tr>`)}
					</tbody>
				</table>
				<hr />
				<div id="chart-test"></div>
				<script
					type="text/javascript"
					src="/ui/static/lightweight-charts.4.2.1.standalone.production.js"
				></script>
				<script type="text/javascript">
					setTimeout(renderChart, 100);
					function renderChart() {
						// Lightweight Charts™ Example: Range switcher
						// https://tradingview.github.io/lightweight-charts/tutorials/demos/range-switcher

						const dayData = [
							{ time: '2018-10-19', value: 26.19 },
							{ time: '2018-10-22', value: 25.87 },
							{ time: '2018-10-23', value: 25.83 },
							{ time: '2018-10-24', value: 25.78 },
							{ time: '2018-10-25', value: 25.82 },
							{ time: '2018-10-26', value: 25.81 },
							{ time: '2018-10-29', value: 25.82 },
							{ time: '2018-10-30', value: 25.71 },
							{ time: '2018-10-31', value: 25.82 },
							{ time: '2018-11-01', value: 25.72 },
							{ time: '2018-11-02', value: 25.74 },
							{ time: '2018-11-05', value: 25.81 },
							{ time: '2018-11-06', value: 25.75 },
							{ time: '2018-11-07', value: 25.73 },
							{ time: '2018-11-08', value: 25.75 },
							{ time: '2018-11-09', value: 25.75 },
							{ time: '2018-11-12', value: 25.76 },
							{ time: '2018-11-13', value: 25.8 },
							{ time: '2018-11-14', value: 25.77 },
							{ time: '2018-11-15', value: 25.75 },
							{ time: '2018-11-16', value: 25.75 },
							{ time: '2018-11-19', value: 25.75 },
							{ time: '2018-11-20', value: 25.72 },
							{ time: '2018-11-21', value: 25.78 },
							{ time: '2018-11-23', value: 25.72 },
							{ time: '2018-11-26', value: 25.78 },
							{ time: '2018-11-27', value: 25.85 },
							{ time: '2018-11-28', value: 25.85 },
							{ time: '2018-11-29', value: 25.55 },
							{ time: '2018-11-30', value: 25.41 },
							{ time: '2018-12-03', value: 25.41 },
							{ time: '2018-12-04', value: 25.42 },
							{ time: '2018-12-06', value: 25.33 },
							{ time: '2018-12-07', value: 25.39 },
							{ time: '2018-12-10', value: 25.32 },
							{ time: '2018-12-11', value: 25.48 },
							{ time: '2018-12-12', value: 25.39 },
							{ time: '2018-12-13', value: 25.45 },
							{ time: '2018-12-14', value: 25.52 },
							{ time: '2018-12-17', value: 25.38 },
							{ time: '2018-12-18', value: 25.36 },
							{ time: '2018-12-19', value: 25.65 },
							{ time: '2018-12-20', value: 25.7 },
							{ time: '2018-12-21', value: 25.66 },
							{ time: '2018-12-24', value: 25.66 },
							{ time: '2018-12-26', value: 25.65 },
							{ time: '2018-12-27', value: 25.66 },
							{ time: '2018-12-28', value: 25.68 },
							{ time: '2018-12-31', value: 25.77 },
							{ time: '2019-01-02', value: 25.72 },
							{ time: '2019-01-03', value: 25.69 },
							{ time: '2019-01-04', value: 25.71 },
							{ time: '2019-01-07', value: 25.72 },
							{ time: '2019-01-08', value: 25.72 },
							{ time: '2019-01-09', value: 25.66 },
							{ time: '2019-01-10', value: 25.85 },
							{ time: '2019-01-11', value: 25.92 },
							{ time: '2019-01-14', value: 25.94 },
							{ time: '2019-01-15', value: 25.95 },
							{ time: '2019-01-16', value: 26.0 },
							{ time: '2019-01-17', value: 25.99 },
							{ time: '2019-01-18', value: 25.6 },
							{ time: '2019-01-22', value: 25.81 },
							{ time: '2019-01-23', value: 25.7 },
							{ time: '2019-01-24', value: 25.74 },
							{ time: '2019-01-25', value: 25.8 },
							{ time: '2019-01-28', value: 25.83 },
							{ time: '2019-01-29', value: 25.7 },
							{ time: '2019-01-30', value: 25.78 },
							{ time: '2019-01-31', value: 25.35 },
							{ time: '2019-02-01', value: 25.6 },
							{ time: '2019-02-04', value: 25.65 },
							{ time: '2019-02-05', value: 25.73 },
							{ time: '2019-02-06', value: 25.71 },
							{ time: '2019-02-07', value: 25.71 },
							{ time: '2019-02-08', value: 25.72 },
							{ time: '2019-02-11', value: 25.76 },
							{ time: '2019-02-12', value: 25.84 },
							{ time: '2019-02-13', value: 25.85 },
							{ time: '2019-02-14', value: 25.87 },
							{ time: '2019-02-15', value: 25.89 },
							{ time: '2019-02-19', value: 25.9 },
							{ time: '2019-02-20', value: 25.92 },
							{ time: '2019-02-21', value: 25.96 },
							{ time: '2019-02-22', value: 26.0 },
							{ time: '2019-02-25', value: 25.93 },
							{ time: '2019-02-26', value: 25.92 },
							{ time: '2019-02-27', value: 25.67 },
							{ time: '2019-02-28', value: 25.79 },
							{ time: '2019-03-01', value: 25.86 },
							{ time: '2019-03-04', value: 25.94 },
							{ time: '2019-03-05', value: 26.02 },
							{ time: '2019-03-06', value: 25.95 },
							{ time: '2019-03-07', value: 25.89 },
							{ time: '2019-03-08', value: 25.94 },
							{ time: '2019-03-11', value: 25.91 },
							{ time: '2019-03-12', value: 25.92 },
							{ time: '2019-03-13', value: 26.0 },
							{ time: '2019-03-14', value: 26.05 },
							{ time: '2019-03-15', value: 26.11 },
							{ time: '2019-03-18', value: 26.1 },
							{ time: '2019-03-19', value: 25.98 },
							{ time: '2019-03-20', value: 26.11 },
							{ time: '2019-03-21', value: 26.12 },
							{ time: '2019-03-22', value: 25.88 },
							{ time: '2019-03-25', value: 25.85 },
							{ time: '2019-03-26', value: 25.72 },
							{ time: '2019-03-27', value: 25.73 },
							{ time: '2019-03-28', value: 25.8 },
							{ time: '2019-03-29', value: 25.77 },
							{ time: '2019-04-01', value: 26.06 },
							{ time: '2019-04-02', value: 25.93 },
							{ time: '2019-04-03', value: 25.95 },
							{ time: '2019-04-04', value: 26.06 },
							{ time: '2019-04-05', value: 26.16 },
							{ time: '2019-04-08', value: 26.12 },
							{ time: '2019-04-09', value: 26.07 },
							{ time: '2019-04-10', value: 26.13 },
							{ time: '2019-04-11', value: 26.04 },
							{ time: '2019-04-12', value: 26.04 },
							{ time: '2019-04-15', value: 26.05 },
							{ time: '2019-04-16', value: 26.01 },
							{ time: '2019-04-17', value: 26.09 },
							{ time: '2019-04-18', value: 26.0 },
							{ time: '2019-04-22', value: 26.0 },
							{ time: '2019-04-23', value: 26.06 },
							{ time: '2019-04-24', value: 26.0 },
							{ time: '2019-04-25', value: 25.81 },
							{ time: '2019-04-26', value: 25.88 },
							{ time: '2019-04-29', value: 25.91 },
							{ time: '2019-04-30', value: 25.9 },
							{ time: '2019-05-01', value: 26.02 },
							{ time: '2019-05-02', value: 25.97 },
							{ time: '2019-05-03', value: 26.02 },
							{ time: '2019-05-06', value: 26.03 },
							{ time: '2019-05-07', value: 26.04 },
							{ time: '2019-05-08', value: 26.05 },
							{ time: '2019-05-09', value: 26.05 },
							{ time: '2019-05-10', value: 26.08 },
							{ time: '2019-05-13', value: 26.05 },
							{ time: '2019-05-14', value: 26.01 },
							{ time: '2019-05-15', value: 26.03 },
							{ time: '2019-05-16', value: 26.14 },
							{ time: '2019-05-17', value: 26.09 },
							{ time: '2019-05-20', value: 26.01 },
							{ time: '2019-05-21', value: 26.12 },
							{ time: '2019-05-22', value: 26.15 },
							{ time: '2019-05-23', value: 26.18 },
							{ time: '2019-05-24', value: 26.16 },
							{ time: '2019-05-28', value: 26.23 },
						];

						const weekData = [
							{ time: '2016-07-18', value: 26.1 },
							{ time: '2016-07-25', value: 26.19 },
							{ time: '2016-08-01', value: 26.24 },
							{ time: '2016-08-08', value: 26.22 },
							{ time: '2016-08-15', value: 25.98 },
							{ time: '2016-08-22', value: 25.85 },
							{ time: '2016-08-29', value: 25.98 },
							{ time: '2016-09-05', value: 25.71 },
							{ time: '2016-09-12', value: 25.84 },
							{ time: '2016-09-19', value: 25.89 },
							{ time: '2016-09-26', value: 25.65 },
							{ time: '2016-10-03', value: 25.69 },
							{ time: '2016-10-10', value: 25.67 },
							{ time: '2016-10-17', value: 26.11 },
							{ time: '2016-10-24', value: 25.8 },
							{ time: '2016-10-31', value: 25.7 },
							{ time: '2016-11-07', value: 25.4 },
							{ time: '2016-11-14', value: 25.32 },
							{ time: '2016-11-21', value: 25.48 },
							{ time: '2016-11-28', value: 25.08 },
							{ time: '2016-12-05', value: 25.06 },
							{ time: '2016-12-12', value: 25.11 },
							{ time: '2016-12-19', value: 25.34 },
							{ time: '2016-12-26', value: 25.2 },
							{ time: '2017-01-02', value: 25.33 },
							{ time: '2017-01-09', value: 25.56 },
							{ time: '2017-01-16', value: 25.32 },
							{ time: '2017-01-23', value: 25.71 },
							{ time: '2017-01-30', value: 25.85 },
							{ time: '2017-02-06', value: 25.77 },
							{ time: '2017-02-13', value: 25.94 },
							{ time: '2017-02-20', value: 25.67 },
							{ time: '2017-02-27', value: 25.6 },
							{ time: '2017-03-06', value: 25.54 },
							{ time: '2017-03-13', value: 25.84 },
							{ time: '2017-03-20', value: 25.96 },
							{ time: '2017-03-27', value: 25.9 },
							{ time: '2017-04-03', value: 25.97 },
							{ time: '2017-04-10', value: 26.0 },
							{ time: '2017-04-17', value: 26.13 },
							{ time: '2017-04-24', value: 26.02 },
							{ time: '2017-05-01', value: 26.3 },
							{ time: '2017-05-08', value: 26.27 },
							{ time: '2017-05-15', value: 26.24 },
							{ time: '2017-05-22', value: 26.02 },
							{ time: '2017-05-29', value: 26.2 },
							{ time: '2017-06-05', value: 26.12 },
							{ time: '2017-06-12', value: 26.2 },
							{ time: '2017-06-19', value: 26.46 },
							{ time: '2017-06-26', value: 26.39 },
							{ time: '2017-07-03', value: 26.52 },
							{ time: '2017-07-10', value: 26.57 },
							{ time: '2017-07-17', value: 26.65 },
							{ time: '2017-07-24', value: 26.45 },
							{ time: '2017-07-31', value: 26.37 },
							{ time: '2017-08-07', value: 26.13 },
							{ time: '2017-08-14', value: 26.21 },
							{ time: '2017-08-21', value: 26.31 },
							{ time: '2017-08-28', value: 26.33 },
							{ time: '2017-09-04', value: 26.38 },
							{ time: '2017-09-11', value: 26.38 },
							{ time: '2017-09-18', value: 26.5 },
							{ time: '2017-09-25', value: 26.39 },
							{ time: '2017-10-02', value: 25.95 },
							{ time: '2017-10-09', value: 26.15 },
							{ time: '2017-10-16', value: 26.43 },
							{ time: '2017-10-23', value: 26.22 },
							{ time: '2017-10-30', value: 26.14 },
							{ time: '2017-11-06', value: 26.08 },
							{ time: '2017-11-13', value: 26.27 },
							{ time: '2017-11-20', value: 26.3 },
							{ time: '2017-11-27', value: 25.92 },
							{ time: '2017-12-04', value: 26.1 },
							{ time: '2017-12-11', value: 25.88 },
							{ time: '2017-12-18', value: 25.82 },
							{ time: '2017-12-25', value: 25.82 },
							{ time: '2018-01-01', value: 25.81 },
							{ time: '2018-01-08', value: 25.95 },
							{ time: '2018-01-15', value: 26.03 },
							{ time: '2018-01-22', value: 26.04 },
							{ time: '2018-01-29', value: 25.96 },
							{ time: '2018-02-05', value: 25.99 },
							{ time: '2018-02-12', value: 26.0 },
							{ time: '2018-02-19', value: 26.06 },
							{ time: '2018-02-26', value: 25.77 },
							{ time: '2018-03-05', value: 25.81 },
							{ time: '2018-03-12', value: 25.88 },
							{ time: '2018-03-19', value: 25.72 },
							{ time: '2018-03-26', value: 25.75 },
							{ time: '2018-04-02', value: 25.7 },
							{ time: '2018-04-09', value: 25.73 },
							{ time: '2018-04-16', value: 25.74 },
							{ time: '2018-04-23', value: 25.69 },
							{ time: '2018-04-30', value: 25.76 },
							{ time: '2018-05-07', value: 25.89 },
							{ time: '2018-05-14', value: 25.89 },
							{ time: '2018-05-21', value: 26.0 },
							{ time: '2018-05-28', value: 25.79 },
							{ time: '2018-06-04', value: 26.11 },
							{ time: '2018-06-11', value: 26.43 },
							{ time: '2018-06-18', value: 26.3 },
							{ time: '2018-06-25', value: 26.58 },
							{ time: '2018-07-02', value: 26.33 },
							{ time: '2018-07-09', value: 26.33 },
							{ time: '2018-07-16', value: 26.32 },
							{ time: '2018-07-23', value: 26.2 },
							{ time: '2018-07-30', value: 26.03 },
							{ time: '2018-08-06', value: 26.15 },
							{ time: '2018-08-13', value: 26.17 },
							{ time: '2018-08-20', value: 26.28 },
							{ time: '2018-08-27', value: 25.86 },
							{ time: '2018-09-03', value: 25.69 },
							{ time: '2018-09-10', value: 25.69 },
							{ time: '2018-09-17', value: 25.64 },
							{ time: '2018-09-24', value: 25.67 },
							{ time: '2018-10-01', value: 25.55 },
							{ time: '2018-10-08', value: 25.59 },
							{ time: '2018-10-15', value: 26.19 },
							{ time: '2018-10-22', value: 25.81 },
							{ time: '2018-10-29', value: 25.74 },
							{ time: '2018-11-05', value: 25.75 },
							{ time: '2018-11-12', value: 25.75 },
							{ time: '2018-11-19', value: 25.72 },
							{ time: '2018-11-26', value: 25.41 },
							{ time: '2018-12-03', value: 25.39 },
							{ time: '2018-12-10', value: 25.52 },
							{ time: '2018-12-17', value: 25.66 },
							{ time: '2018-12-24', value: 25.68 },
							{ time: '2018-12-31', value: 25.71 },
							{ time: '2019-01-07', value: 25.92 },
							{ time: '2019-01-14', value: 25.6 },
							{ time: '2019-01-21', value: 25.8 },
							{ time: '2019-01-28', value: 25.6 },
							{ time: '2019-02-04', value: 25.72 },
							{ time: '2019-02-11', value: 25.89 },
							{ time: '2019-02-18', value: 26.0 },
							{ time: '2019-02-25', value: 25.86 },
							{ time: '2019-03-04', value: 25.94 },
							{ time: '2019-03-11', value: 26.11 },
							{ time: '2019-03-18', value: 25.88 },
							{ time: '2019-03-25', value: 25.77 },
							{ time: '2019-04-01', value: 26.16 },
							{ time: '2019-04-08', value: 26.04 },
							{ time: '2019-04-15', value: 26.0 },
							{ time: '2019-04-22', value: 25.88 },
							{ time: '2019-04-29', value: 26.02 },
							{ time: '2019-05-06', value: 26.08 },
							{ time: '2019-05-13', value: 26.09 },
							{ time: '2019-05-20', value: 26.16 },
							{ time: '2019-05-27', value: 26.23 },
						];

						const monthData = [
							{ time: '2006-12-01', value: 25.4 },
							{ time: '2007-01-01', value: 25.5 },
							{ time: '2007-02-01', value: 25.11 },
							{ time: '2007-03-01', value: 25.24 },
							{ time: '2007-04-02', value: 25.34 },
							{ time: '2007-05-01', value: 24.82 },
							{ time: '2007-06-01', value: 23.85 },
							{ time: '2007-07-02', value: 23.24 },
							{ time: '2007-08-01', value: 23.05 },
							{ time: '2007-09-03', value: 22.26 },
							{ time: '2007-10-01', value: 22.52 },
							{ time: '2007-11-01', value: 20.84 },
							{ time: '2007-12-03', value: 20.37 },
							{ time: '2008-01-01', value: 23.9 },
							{ time: '2008-02-01', value: 22.58 },
							{ time: '2008-03-03', value: 21.74 },
							{ time: '2008-04-01', value: 22.5 },
							{ time: '2008-05-01', value: 22.38 },
							{ time: '2008-06-02', value: 20.58 },
							{ time: '2008-07-01', value: 20.6 },
							{ time: '2008-08-01', value: 20.82 },
							{ time: '2008-09-01', value: 17.5 },
							{ time: '2008-10-01', value: 17.7 },
							{ time: '2008-11-03', value: 15.52 },
							{ time: '2008-12-01', value: 18.58 },
							{ time: '2009-01-01', value: 15.4 },
							{ time: '2009-02-02', value: 11.68 },
							{ time: '2009-03-02', value: 14.89 },
							{ time: '2009-04-01', value: 16.24 },
							{ time: '2009-05-01', value: 18.33 },
							{ time: '2009-06-01', value: 18.08 },
							{ time: '2009-07-01', value: 20.07 },
							{ time: '2009-08-03', value: 20.35 },
							{ time: '2009-09-01', value: 21.53 },
							{ time: '2009-10-01', value: 21.48 },
							{ time: '2009-11-02', value: 20.28 },
							{ time: '2009-12-01', value: 21.39 },
							{ time: '2010-01-01', value: 22.0 },
							{ time: '2010-02-01', value: 22.31 },
							{ time: '2010-03-01', value: 22.82 },
							{ time: '2010-04-01', value: 22.58 },
							{ time: '2010-05-03', value: 21.02 },
							{ time: '2010-06-01', value: 21.45 },
							{ time: '2010-07-01', value: 22.42 },
							{ time: '2010-08-02', value: 23.61 },
							{ time: '2010-09-01', value: 24.4 },
							{ time: '2010-10-01', value: 24.46 },
							{ time: '2010-11-01', value: 23.64 },
							{ time: '2010-12-01', value: 22.9 },
							{ time: '2011-01-03', value: 23.73 },
							{ time: '2011-02-01', value: 23.52 },
							{ time: '2011-03-01', value: 24.15 },
							{ time: '2011-04-01', value: 24.37 },
							{ time: '2011-05-02', value: 24.4 },
							{ time: '2011-06-01', value: 24.45 },
							{ time: '2011-07-01', value: 24.24 },
							{ time: '2011-08-01', value: 24.0 },
							{ time: '2011-09-01', value: 22.77 },
							{ time: '2011-10-03', value: 24.21 },
							{ time: '2011-11-01', value: 23.4 },
							{ time: '2011-12-01', value: 23.9 },
							{ time: '2012-01-02', value: 24.84 },
							{ time: '2012-02-01', value: 25.04 },
							{ time: '2012-03-01', value: 24.9 },
							{ time: '2012-04-02', value: 25.06 },
							{ time: '2012-05-01', value: 24.63 },
							{ time: '2012-06-01', value: 25.07 },
							{ time: '2012-07-02', value: 25.3 },
							{ time: '2012-08-01', value: 25.08 },
							{ time: '2012-09-03', value: 25.27 },
							{ time: '2012-10-01', value: 25.39 },
							{ time: '2012-11-01', value: 25.06 },
							{ time: '2012-12-03', value: 25.03 },
							{ time: '2013-01-01', value: 25.26 },
							{ time: '2013-02-01', value: 25.2 },
							{ time: '2013-03-01', value: 25.3 },
							{ time: '2013-04-01', value: 25.38 },
							{ time: '2013-05-01', value: 25.22 },
							{ time: '2013-06-03', value: 24.88 },
							{ time: '2013-07-01', value: 24.98 },
							{ time: '2013-08-01', value: 24.6 },
							{ time: '2013-09-02', value: 24.65 },
							{ time: '2013-10-01', value: 24.62 },
							{ time: '2013-11-01', value: 24.65 },
							{ time: '2013-12-02', value: 24.7 },
							{ time: '2014-01-01', value: 24.98 },
							{ time: '2014-02-03', value: 24.95 },
							{ time: '2014-03-03', value: 25.45 },
							{ time: '2014-04-01', value: 25.4 },
							{ time: '2014-05-01', value: 25.51 },
							{ time: '2014-06-02', value: 25.34 },
							{ time: '2014-07-01', value: 25.3 },
							{ time: '2014-08-01', value: 25.36 },
							{ time: '2014-09-01', value: 25.16 },
							{ time: '2014-10-01', value: 25.53 },
							{ time: '2014-11-03', value: 25.4 },
							{ time: '2014-12-01', value: 25.7 },
							{ time: '2015-01-01', value: 25.95 },
							{ time: '2015-02-02', value: 25.81 },
							{ time: '2015-03-02', value: 25.63 },
							{ time: '2015-04-01', value: 25.39 },
							{ time: '2015-05-01', value: 25.62 },
							{ time: '2015-06-01', value: 25.23 },
							{ time: '2015-07-01', value: 25.47 },
							{ time: '2015-08-03', value: 25.18 },
							{ time: '2015-09-01', value: 25.3 },
							{ time: '2015-10-01', value: 25.68 },
							{ time: '2015-11-02', value: 25.63 },
							{ time: '2015-12-01', value: 25.57 },
							{ time: '2016-01-01', value: 25.55 },
							{ time: '2016-02-01', value: 25.05 },
							{ time: '2016-03-01', value: 25.61 },
							{ time: '2016-04-01', value: 25.91 },
							{ time: '2016-05-02', value: 25.84 },
							{ time: '2016-06-01', value: 25.94 },
							{ time: '2016-07-01', value: 26.19 },
							{ time: '2016-08-01', value: 26.06 },
							{ time: '2016-09-01', value: 25.65 },
							{ time: '2016-10-03', value: 25.8 },
							{ time: '2016-11-01', value: 25.06 },
							{ time: '2016-12-01', value: 25.2 },
							{ time: '2017-01-02', value: 25.7 },
							{ time: '2017-02-01', value: 25.78 },
							{ time: '2017-03-01', value: 25.9 },
							{ time: '2017-04-03', value: 26.02 },
							{ time: '2017-05-01', value: 26.02 },
							{ time: '2017-06-01', value: 26.39 },
							{ time: '2017-07-03', value: 26.3 },
							{ time: '2017-08-01', value: 26.14 },
							{ time: '2017-09-01', value: 26.39 },
							{ time: '2017-10-02', value: 26.12 },
							{ time: '2017-11-01', value: 25.81 },
							{ time: '2017-12-01', value: 25.82 },
							{ time: '2018-01-01', value: 26.06 },
							{ time: '2018-02-01', value: 25.78 },
							{ time: '2018-03-01', value: 25.75 },
							{ time: '2018-04-02', value: 25.72 },
							{ time: '2018-05-01', value: 25.75 },
							{ time: '2018-06-01', value: 26.58 },
							{ time: '2018-07-02', value: 26.14 },
							{ time: '2018-08-01', value: 25.86 },
							{ time: '2018-09-03', value: 25.67 },
							{ time: '2018-10-01', value: 25.82 },
							{ time: '2018-11-01', value: 25.41 },
							{ time: '2018-12-03', value: 25.77 },
							{ time: '2019-01-01', value: 25.35 },
							{ time: '2019-02-01', value: 25.79 },
							{ time: '2019-03-01', value: 25.77 },
							{ time: '2019-04-01', value: 25.9 },
							{ time: '2019-05-01', value: 26.23 },
						];

						const yearData = [
							{ time: '2006-01-02', value: 24.89 },
							{ time: '2007-01-01', value: 25.5 },
							{ time: '2008-01-01', value: 23.9 },
							{ time: '2009-01-01', value: 15.4 },
							{ time: '2010-01-01', value: 22.0 },
							{ time: '2011-01-03', value: 23.73 },
							{ time: '2012-01-02', value: 24.84 },
							{ time: '2013-01-01', value: 25.26 },
							{ time: '2014-01-01', value: 24.98 },
							{ time: '2015-01-01', value: 25.95 },
							{ time: '2016-01-01', value: 25.55 },
							{ time: '2017-01-02', value: 25.7 },
							{ time: '2018-01-01', value: 26.06 },
							{ time: '2019-01-01', value: 26.23 },
						];

						const seriesesData = new Map([
							['1D', dayData],
							['1W', weekData],
							['1M', monthData],
							['1Y', yearData],
						]);

						const chartOptions = {
							layout: {
								textColor: 'black',
								background: { type: 'solid', color: 'white' },
							},
							height: 200,
						};
						const container = document.getElementById('chart-test');
						/** @type {import('lightweight-charts').IChartApi} */
						const chart = LightweightCharts.createChart(container, chartOptions);

						// Only needed within demo page
						// eslint-disable-next-line no-undef
						window.addEventListener('resize', () => {
							chart.applyOptions({ height: 200 });
						});

						const intervalColors = {
							'1D': '#2962FF',
							'1W': 'rgb(225, 87, 90)',
							'1M': 'rgb(242, 142, 44)',
							'1Y': 'rgb(164, 89, 209)',
						};

						const lineSeries = chart.addLineSeries({ color: intervalColors['1D'] });

						function setChartInterval(interval) {
							lineSeries.setData(seriesesData.get(interval));
							lineSeries.applyOptions({
								color: intervalColors[interval],
							});
							chart.timeScale().fitContent();
						}

						setChartInterval('1D');

						const styles = "";
						const stylesElement = document.createElement('style');
						stylesElement.innerHTML = styles;
						container.appendChild(stylesElement);

						const buttonsContainer = document.createElement('div');
						buttonsContainer.classList.add('buttons-container');
						const intervals = ['1D', '1W', '1M', '1Y'];
						intervals.forEach(interval => {
							const button = document.createElement('button');
							button.innerText = interval;
							button.addEventListener('click', () => setChartInterval(interval));
							buttonsContainer.appendChild(button);
						});

						container.appendChild(buttonsContainer);	
					}
				</script>
				<hr />
				${
					// TODO Improve :)
					data.stats.map(
						(stat) => html`
							<article>
								<header><h4>Hour bucket: ${new Date(stat.tsHourMs).toISOString()}</h4></header>
								<pre><code>${raw(JSON.stringify(stat, null, 2))}</code></pre>
								<footer></footer>
							</article>
						`
					)
				}
			</div>
		</section>
	`;
}

function CreateRuleForm() {
	return html`
		<form id="create-rule-container" action="#">
			<hgroup>
				<h3>Create new redirection rule</h3>
				<p>Edit the JSON in the box below to your needs, but keep all the properties.</p>
			</hgroup>
			<textarea id="new-rule-json" name="newRuleJson" rows="6">{
"ruleUrl": "http://127.0.0.1:8787/test-rule-11",
"responseStatus": 302,
"responseLocation": "https://skybear.net",
"responseHeaders": [["X-Powered-By", "Rediflare"]]
}</textarea
			>
			<button hx-post="/-_-/ui/partials.CreateRule" hx-include="#new-rule-json" hx-target="#create-rule-container" hx-swap="outerHTML">
				Create redirection rule
			</button>
		</form>
	`;
}

function Dashboard(props: {}) {
	const createRuleForm = CreateRuleForm();
	return html`
		<header class="container">
			<nav>
				<ul>
					<li>
						<h1 style="margin-bottom: 0"><a href="https://rediflare.com" class="contrast">${RediflareName()}</a></h1>
					</li>
				</ul>
				<ul>
					<!-- <li><a href="https://developers.cloudflare.com/durable-objects/" class="contrast">Durable Objects</a></li> -->
					<li>
						<a href="https://github.com/lambrospetrou/rediflare" target="_blank"><button class="contrast">Github repo</button></a>
					</li>
				</ul>
			</nav>
		</header>

		<main class="container">
			<section>
				<hgroup>
					<h2>Rediflare-Api-Key</h2>
					<p>Paste your API key to enable the page to fetch your data.</p>
				</hgroup>
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
				<hr />
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
		</main>
		<footer class="container">
			${RediflareName()} is built by <a href="https://www.lambrospetrou.com" target="_blank">Lambros Petrou</a>. 🚀👌
		</footer>
	`;
}

function Layout(props: { title: string; description: string; image: string; children?: any }) {
	const image = props.image || "https://go.rediflare.com/ui/static/20240929T1559-B3S2MSGffh.png";
	return html`
		<html>
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<meta name="color-scheme" content="light dark" />
				<title>${props.title}</title>
				<meta name="description" content="${props.description}" />
				<meta property="og:type" content="website" />
				<meta property="og:title" content="${props.title}" />
				<meta property="og:image" content="${image}" />

				<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22 fill=%22%23990000%22>↝</text></svg>">

				<meta name="htmx-config" content='{"withCredentials":true,"globalViewTransitions": true,"selfRequestsOnly": false}' />

				<link rel="stylesheet" href="/-_-/ui/static/pico.v2.0.6.red.min.css" />
				<style>
					:root {
						--pico-form-element-spacing-vertical: 0.75rem;
						--pico-form-element-spacing-horizontal: 1.125rem;
					}

					button {
						--pico-font-weight: bold;
						font-size: 0.875em;
					}

					.rediflare-name {
						font-weight: bold;
					}
				</style>
			</head>
			<body>
				${props.children}

				<script src="/-_-/ui/static/htmx.2.0.2.min.js" defer></script>
				<script src="/-_-/ui/static/helpers.js" defer></script>
			</body>
		</html>
	`;
}
