# I manage this in https://www.skybear.net/s/s_nkjfLc27FDb1dRz7rZ95zcc after all.

POST {{ BASEURL }}/-_-/v1/redirects.Upsert
Rediflare-Api-Key: {{ REDIFLARE_API_KEY }}
```json
{
    "ruleUrl": "{{ BASEURL }}/book-interview-prep",
    "responseStatus": 302,
    "responseLocation": "https://cal.com/lambrospetrou/interview-preparation-1h",
    "responseHeaders": []
}
```
HTTP 200
