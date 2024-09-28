import { Hono } from 'hono';
import { html, raw } from 'hono/html';

interface CfEnv {
	ASSETS: Fetcher;
}

export const uiAdmin = new Hono<{Bindings: CfEnv}>();

uiAdmin.get('/-_-/ui/static/*', async (c) => {
    const url = new URL(c.req.raw.url);
    url.pathname = url.pathname.substring("/-_-".length);
    const req = new Request(url, c.req.raw);
	return c.env.ASSETS.fetch(req);
});

uiAdmin.get('/-_-/ui', async (c) => {
	return c.html(
		Layout({
			title: 'Rediflare - Unlimited redirections for FREE',
			description: '',
			image: '',
			children: html`<h1>Rediflare</h1>`,
		})
	);
});

interface SiteData {
	title: string;
	description: string;
	image: string;
	children?: any;
}

function Layout(props: SiteData) {
	return html`
		<html>
			<head>
				<meta charset="UTF-8" />
				<title>${props.title}</title>
				<meta name="description" content="${props.description}" />
				<meta property="og:type" content="article" />
				<!-- More elements slow down JSX, but not template literals. -->
				<meta property="og:title" content="${props.title}" />
				<meta property="og:image" content="${props.image}" />

                <meta name="htmx-config" content='{"withCredentials":true,"globalViewTransitions": true,"selfRequestsOnly": false}'>
                <script src="/-_-/ui/static/htmx.2.0.2.min.js"></script>
			</head>
			<body>
				${props.children}
			</body>
		</html>
	`;
}
