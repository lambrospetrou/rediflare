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

GET http://127.0.0.1:8787/test-rule
HTTP 301
Location: https://skybear.net

POST http://127.0.0.1:8787/-_-/v1/redirects.Upsert
Rediflare-Api-Key: rf_key_TENANT1111_sometoken
```json
{
    "ruleUrl": "http://127.0.0.1:8787/test-rule",
    "responseStatus": 307,
    "responseLocation": "https://about.skybear.net",
    "responseHeaders": []
}
```
HTTP 200

GET http://127.0.0.1:8787/test-rule
HTTP 307
Location: https://about.skybear.net

POST http://127.0.0.1:8787/-_-/v1/redirects.Upsert
Rediflare-Api-Key: rf_key_TENANT1111_sometoken
```json
{
    "ruleUrl": "http://127.0.0.1:8787/test-rule-full",
    "responseStatus": 301,
    "responseLocation": "https://lambros.dev/path",
    "responseHeaders": [["boomer", "value1"]]
}
```
HTTP 200

GET http://127.0.0.1:8787/test-rule-full
HTTP 301
Location: https://lambros.dev/path
boomer: value1

GET http://127.0.0.1:8787/-_-/v1/redirects.List
Rediflare-Api-Key: rf_key_TENANT1111_sometoken
HTTP 200
[Asserts]
jsonpath "$.data.rules" count == 2

POST http://127.0.0.1:8787/-_-/v1/redirects.Delete
Rediflare-Api-Key: rf_key_TENANT1111_sometoken
```json
{
    "ruleUrl": "http://127.0.0.1:8787/test-rule-full"
}
```
HTTP 200
[Asserts]
jsonpath "$.data.rules" count == 1

POST http://127.0.0.1:8787/-_-/v1/redirects.Delete
Rediflare-Api-Key: rf_key_TENANT1111_sometoken
```json
{
    "ruleUrl": "http://127.0.0.1:8787/test-rule"
}
```
HTTP 200
[Asserts]
jsonpath "$.data.rules" count == 0

GET http://127.0.0.1:8787/test-rule-full
HTTP 404
