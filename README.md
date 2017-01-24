splunk-statsd-backend
=====================
Backend plugin for [statsd](https://github.com/etsy/statsd) to output metrics to [Splunk](https://www.splunk.com) HTTP Event Collector (HEC)

# Configuration
```js
{
  backends: ["splunk-statsd-backend"],
  splunk: {
    host: foo,
    port: 8088,
    token: a-b-c,
    source: splunk-statsd,
    sourcetype: _json,
    index: main
  }
}
```