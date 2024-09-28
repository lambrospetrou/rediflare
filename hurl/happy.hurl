POST http://127.0.0.1:8787/v1/redirects.Upsert
```json
{
    "ruleUrl": "*/test-rule",
    "responseStatus": 301,
    "responseLocation": "https://skybear.net",
    "responseHeaders": []
}
```
HTTP 200

GET http://127.0.0.1:8787/-_-/debug
HTTP 200

GET http://127.0.0.1:8787/test-rule
Location: https://skybear.net
HTTP 301

POST http://127.0.0.1:8787/v1/redirects.Upsert
```json
{
    "ruleUrl": "*/test-rule",
    "responseStatus": 301,
    "responseLocation": "https://about.skybear.net",
    "responseHeaders": []
}
```
HTTP 200

GET http://127.0.0.1:8787/test-rule
Location: https://about.skybear.net
HTTP 301

POST http://127.0.0.1:8787/v1/redirects.Upsert
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
Location: https://lambros.dev/path
boomer: value1
HTTP 301
