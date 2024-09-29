# Rediflare

Your own self-hosted URL redirection tool.

Built with [Cloudflare Workers](https://developers.cloudflare.com/workers/) and [Durable Objects](https://developers.cloudflare.com/durable-objects/), specifically the [SQLite in DO](https://blog.cloudflare.com/sqlite-in-durable-objects/) variant.

This application has the basis for multi-tenancy (e.g. SaaS), but it's still unfinished.

It has everything you need for single tenant cases though, so feel free to deploy it in your own Cloudflare account and setup your redirection rules.

There is an admin UI and an API that you can use to manage your redirection rules 😅🙃

## Development and Deployment

I assume that you already have a Cloudflare account, and you checked out this repository.

1. Install dependencies: `npm ci`.
2. Create a local file `.dev.vars` with the following content:
    ```
    VAR_API_AUTH_ADMIN_KEYS_CSV=",rf_key_TENANT1111_sometoken,"
    ```
3. Start the local setup using `npm run dev`. This should start the Workers/Durable Objects listening on <http://127.0.0.1:8787>.
4. Run the tests against that: `npm run test`.
5. Modify the `wrangler.toml` to use your own `route.pattern` for each environment, i.e. replace `go-staging.lambros.dev` and `go.lambros.dev` with your own domains.
6. Deploy with `npm run deploy:staging` or `npm run deploy:prod`.

That's it! 🥳

## Authentication

The API provided by the Worker is protected using the header `Rediflare-Api-Key` that expects a string value of the format `rf_key_<TENANT_ID>_<TOKEN>`.

The `TENANTID` should be non-empty and is used as sharding mechanism for the multi-tenancy aspects. Some of the multi-tenancy features are not implemented yet though.

The whole API key is checked against a [Secret](https://developers.cloudflare.com/workers/configuration/secrets/) configured for the worker named `VAR_API_AUTH_ADMIN_KEYS_CSV` (as you saw in step 2 above).

In the future, these api keys will move to Workers KV to allow unlimited number of tenants.

To generate an API key according to the format expected run: `npm run --silent gen:apikey`

Example:
```sh
$ npm run --silent gen:apikey
rf_key_dP1gH07gDCnWwql9HrwPshZzsQfxCCgh_vm6PT3RH5fK37hS8fl6B5NlRJ8M460dKD4qS
```

Then, once you have the above key run `npx wrangler secret put VAR_API_AUTH_ADMIN_KEYS_CSV` to store it in your worker (you will need to paste it after prompted), or just create it through the Cloudflare dashboard.

### Tenant ID

- Each tenant ID should be considered like an account/organization.
- Each tenant can have multiple API keys (but the tenant ID portion should be the same across them to be considered as the same tenant).
- Each tenant can have unlimited number of custom domains using the same deployment (Cloudflare limits apply, not application logic limits).
- There is one database (SQLite in Durable Objects (DO)) per tenant for coordinating the creation/deletion of redirection rules. However, the actual URL visits are NOT bottlenecked by the single DO for the tenant. Each redirection rule lives in its own Durable Object and URL visits go straight to that DO from the edge workers.

## Custom domains

Once you have the project deployed, you can add custom domains to it ([see docs](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/#set-up-a-custom-domain-in-your-wranglertoml)).

Just modify the `wrangler.toml` file for the corresponding environment (e.g. `dev`, `staging`, `prod`) you want and add as many custom domains as you want.

```
routes = [
  { pattern = "shop.example.com", custom_domain = true },
  { pattern = "shop-two.example.com", custom_domain = true }
]
```

Fun fact, with Rediflare it's not the domain that decides the "account used" but the `TENANT_ID` part of the API key (see previous section).

So, as long as you use the same API key, accessing the `/-_-/ui/` admin UI from any of your custom domains is exactly the same.

## Admin UI

There is an admin UI at `/-_-/ui/`, e.g. <http://127.0.0.1:8787/-_-/ui/> where you can put the test API KEY `rf_key_TENANT1111_sometoken` in the input box and it will start pinging the local workers (started in step 3 above).

I often refresh the page to make sure everything is reset, so for ease of use you can also provide the token in the URL hash segment, e.g. <http://127.0.0.1:8787/-_-/ui/#rfApiKey=rf_key_TENANT1111_sometoken>.

The admin UI allows you to list, delete, and create redirection rules.
Soon, the UI will also show analytics and statistics about the visits of these links, which was one of the motivations doing the project in the first place.

## API

The API supports full CRUD to manage redirection rules.

The following Hurl file showcases the main functionality, but you can see a more elaborate one in `hurl/tests/happy.hurl`:

    # LIST all the rules.
    GET https://go.lambros.dev/-_-/v1/redirects.List
    Rediflare-Api-Key: {{ REDIFLARE_API_KEY_LAMBROSDEV_PROD }}
    HTTP 200

    # CREATE a rule.
    POST http://127.0.0.1:8787/-_-/v1/redirects.Upsert
    Rediflare-Api-Key: rf_key_TENANT1111_sometoken
    ```json
    {
        "ruleUrl": "http://127.0.0.1:8787/test-rule",
        "responseStatus": 301,
        "responseLocation": "https://skybear.net",
        "responseHeaders": []
    }
    ```
    HTTP 200

    # VERIFY it redirects.
    GET http://127.0.0.1:8787/test-rule
    HTTP 301
    Location: https://skybear.net

    # DELETE a rule.
    POST http://127.0.0.1:8787/-_-/v1/redirects.Delete
    Rediflare-Api-Key: rf_key_TENANT1111_sometoken
    ```json
    {
        "ruleUrl": "http://127.0.0.1:8787/test-rule"
    }
    ```
    HTTP 200 

## Architecture

How are Durable Objects used in this project?

_Coming soon..._

## Contact - Help - Feedback

Feel free to get in touch with me at [@lambrospetrou](https://x.com/LambrosPetrou).
