# Rediflare

Your own self-hosted URL redirection tool.

Built with [Cloudflare Workers](https://developers.cloudflare.com/workers/) and [Durable Objects](https://developers.cloudflare.com/durable-objects/), specifically the [SQLite in DO](https://blog.cloudflare.com/sqlite-in-durable-objects/) variant.

This application has the basis for multi-tenancy (e.g. SaaS), but it's still unfinished.

It has everything you need for single tenant cases though, so feel free to deploy it in your own Cloudflare account and setup your redirection rules.
The UI is super basic, and quite limited, but you can do everything through the API 😅🙃

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

The API provided by the Worker is protected using the header `Rediflare-Api-Key` that expects a string value of the format `rf_key_<TENANTID>_<TOKEN>`.

The `TENANTID` should be non-empty and is used as sharding mechanism for the multi-tenancy aspects. Some of the multi-tenancy features are not implemented yet though.

The whole API key is checked against a [Secret](https://developers.cloudflare.com/workers/configuration/secrets/) configured for the worker named `VAR_API_AUTH_ADMIN_KEYS_CSV` (as you saw in step 2 above).

In the future, these api keys will move to Workers KV to allow unlimited number of tenants.

## Admin UI

The UI is still unpolished, but there is an admin UI at `/-_-/ui/`, e.g. <http://127.0.0.1:8787/-_-/ui/> where you can put the test API KEY `rf_key_TENANT1111_sometoken` in the input box and it will start pinging the local workers (started in step 3 above).

I often refresh the page to make sure everything is reset, so for ease of use you can also provide the token in the URL hash segment, e.g. <http://127.0.0.1:8787/-_-/ui/#rfApiKey=rf_key_TENANT1111_sometoken>.

The admin UI only lists, and allows deletion of redirection rules.
Use the API to create them.

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
