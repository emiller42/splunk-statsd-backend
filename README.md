splunk-statsd-backend
=====================
Backend plugin for [statsd](https://github.com/statsd/statsd) to output metrics to [Splunk](https://www.splunk.com) HTTP Event Collector (HEC)

# Support

This plugin is in *Maintenance Mode*.

As it has been a number of years since I have worked with either Splunk or StatsD, and given the general lack of activity on this project, I have reduced the scope of support in preparation for the eventual deprecation of this library.

The following describes what users should expect from maintainers moving forward.

## In Scope

Maintainers will continue to do the following on a best-effort basis:

*  Maintain compatibility with [supported Node releases](https://github.com/nodejs/release#release-schedule)
*  Address security vulnerabilities
*  Address minor bugs

## Out of Scope

*  Feature Requests or Enhancements
*  Significant updates to address breaking changes in related technologies. (Splunk, StatsD, dependency libraries, etc.)

## Deprecation Plan

There currently no deprecation schedule or date. The intent is to keep the library healthy in it's current form. If related technologies evolve to the point that that is not possible without significant effort, (Ex: major breaking changes to the StatsD plugin model) then Maintainers will favor deprecation rather than accomodating the change.

---

# Installation
```bash
$ cd /path/to/statsd/install
$ npm install splunk-statsd-backend
```

# Configuration
```js
{
  backends: ['splunk-statsd-backend', 'other-backends'],
  splunk: {
    splunkHost: '127.0.0.1', // the hostname of the Splunk Collector you wish to send metrics (default: 127.0.0.1)
    splunkPort: 8088,        // port that the event collector is listening on (Default: 8088)
    useSSL: true,            // HEC is using SSL (Default: true)
    strictSSL: true,         // Should collectd should validate ssl certificates. Set to false if Splunk is using self-signed certs. (Default: true)
    splunkToken: 'abcde',    // HEC token for authentication with Splunk (required)
    // the following are somewhat equivalent to the 'prefix*' options for the graphite backend
    timerLabel: 'timer',     // Label applied to all timer metrics (default: 'timer')
    counterLabel: 'counter', // Label applied to all counter metrics (default: 'counter')
    gaugeLabel: 'gauge',     // Label applied to all gauge metrics (default: 'gauge')
    setLabel: 'set',         // Label applied to all set metrics (default: 'set')
    // the following populate splunk-specific fields
    host: 'foo',             // Specify a 'host' value for the events sent to Splunk. Leave unset to let Splunk infer this value.  
    source: 'statsd',        // Specify a 'source' value for the events sent to Splunk.  (default: statsd)
    sourcetype: '_json',     // Specify a 'sourcetype' value for the events sent to Splunk. (default: _json)
    index: 'main',           // Specify the target index for the events sent to Splunk.  Leave unset to let Splunk control destination index.
    useMetrics: false        // Send data in Splunk Metrics format. (default: false)
}
}
```

# Implementation Details and Examples (JSON formatted events)
This backend will transform statsd metrics into a format suitable for batch collection by the Splunk HTTP Event Collector.  Further, the events are properly formed JSON, allowing ['Indexed Extractions'](http://dev.splunk.com/view/event-collector/SP-CAAAFB6) to be applied out of the box.  All metrics are sent in a single HTTP POST request to the collector.  

A batch event follows this format:
```js
{ "time": <timestamp>, "source": "my_source", "sourcetype": "my_sourcetype", "index": "my_index", "event": {...event payload...} }
```

Where the event payload will contain all relevant fields for the metrics.  (Examples further down)

## Field Names
* `metricType` will be set according to the *Label fields.  ('timer', 'counter', etc.)
* `metricName` will be a direct passthrough of the metric name provided to statsd.  (`my.counter:123|c` sets `metricName = "my.counter"`)
* Other event field names are derived from the stats they represent.  

## Example Counter
```js
{
  "event": {
    "rate": 1704.6,
    "count": 17046,
    "metricType": "counter",
    "metricName": "foo.requests"
  },
  "time": 1485314310,
  "source": "statsd",
  "sourcetype": "_json"
}
```

## Example Timer (with Histogram)
```js
{
  "event": {
    "count_90": 304,
    "mean_90": 143.07236842105263,
    "upper_90": 280,
    "sum_90": 43494,
    "sum_squares_90": 8083406,
    "std": 86.5952973729948,
    "upper": 300,
    "lower": 1,
    "count": 338,
    "count_ps": 33.8,
    "sum": 53402,
    "sum_squares": 10971776,
    "mean": 157.9940828402367,
    "median": 157.5,
    "histogram": {
      "bin_50": 49,
      "bin_100": 45,
      "bin_150": 66,
      "bin_200": 60,
      "bin_inf": 118
    },
    "metricType": "timer",
    "metricName": "foo.duration"
  },
  "time": 1485314310,
  "source": "statsd",
  "sourcetype": "_json"
}
```

## Example Gauge
```js
{
  "event": {
    "value": 2,
    "metricType": "gauge",
    "metricName": "foo.pct_util"
  },
  "time": 1485314310,
  "source": "statsd",
  "sourcetype": "_json"
}
```

## Example Set
```js
{
  "event": {
    "count": 98,
    "metricType": "set",
    "metricName": "foo.uniques"
  },
  "time": 1485314310,
  "source": "statsd",
  "sourcetype": "_json"
}
```

# Implementation Details and Examples (Splunk Metrics)
when setting `useMetrics: true` in your config, the backend will format StatsD metrics in a way suitable for ingestion as [Splunk Metrics](https://docs.splunk.com/Documentation/Splunk/8.2.0/Metrics/Overview). All metrics of a given type will be included in a single event object using the [multiple-metric JSON format](https://docs.splunk.com/Documentation/Splunk/8.2.0/Metrics/GetMetricsInOther#The_multiple-metric_JSON_format) and all objects will be sent in a single POST request to the collector.

The event object follows this format:
```js
{ 
  "time": "<timestamp>", 
  "event": "metric", 
  "host": "<host>", 
  "source": "<source>", 
  "sourcetype": "<sourcetype>", 
  "index": "<index>", 
  "event": {
    "metric_type": "<type>",
    // repeated metrics
    "metric_name:<metric_name>": "<value>". 
  } 
}
```

## Notes on Sourcetype

Splunk has build-in handling of some sourcetypes when processing metrics. The [`statsd` sourcetype](https://docs.splunk.com/Documentation/Splunk/8.2.0/Metrics/GetMetricsInStatsd) in particular is used to send raw StatsD data directly to Splunk, rather than to a StatsD server for processing. It is recommended that you avoid these built-in sourcetypes when using this backend. 

## Field Names

* The `metric_type` dimension will be set according to the *Label fields (`timer`, `counter`, etc)
* In cases where the metric has a single value (gauges, sets) the metric name will be a direct passthrough of the metric name provided by StatsD. (`my.gauge:97|g` becomes `"metric_name:my.gauge": 97`)
* In cases where the metric has multiple values (counters, timers) the specific measurement will be appended following dot-notation. (`my.counter:123|c` sets `metric_name:my.counter.count` and `metric_name:my.counter.rate`)

## Example Counters

```js
{
  "time": 1485314310,
  "event": "metric",
  "source": "statsd",
  "sourcetype": "_json",
  "event": {
    "metric_type": "counter",
    "metric_name:foo.count": 17046,
    "metric_name:foo.rate": 1704.6,
    "metric_name:bar.count": 32567,
    "metric_name:bar.rate": 3256.7,
    // etc.
  }
}
```

## Example Timer (with Histogram)

```js
{
  "time": 1485314310,
  "event": "metric",
  "source": "statsd",
  "sourcetype": "_json",
  "event": {
    "metric_type": "timer",
    "metric_name:foo.duration.count_90": 304,
    "metric_name:foo.duration.mean_90": 143.07236842105263,
    "metric_name:foo.duration.upper_90": 280,
    "metric_name:foo.duration.sum_90": 43494,
    "metric_name:foo.duration.sum_squares_90": 8083406,
    "metric_name:foo.duration.std": 86.5952973729948,
    "metric_name:foo.duration.upper": 300,
    "metric_name:foo.duration.lower": 1,
    "metric_name:foo.duration.count": 338,
    "metric_name:foo.duration.count_ps": 33.8,
    "metric_name:foo.duration.sum": 53402,
    "metric_name:foo.duration.sum_squares": 10971776,
    "metric_name:foo.duration.mean": 157.9940828402367,
    "metric_name:foo.duration.median": 157.5,
    "metric_name:foo.duration.histogram.bin_50": 49,
    "metric_name:foo.duration.histogram.bin_100": 45,
    "metric_name:foo.duration.histogram.bin_150": 66,
    "metric_name:foo.duration.histogram.bin_200": 60,
    "metric_name:foo.duration.histogram.bin_inf": 118
    // etc.
  }
}
```

## Example Gauges

```js
{
  "time": 1485314310,
  "event": "metric",
  "source": "statsd",
  "sourcetype": "_json",
  "event": {
    "metric_type": "gauge",
    "metric_name:foo.pct_util": 2,
    "metric_name:bar.pct_util": 17,
    // etc.
  }
}
```

## Example Sets

```js
{
  "time": 1485314310,
  "event": "metric",
  "source": "statsd",
  "sourcetype": "_json",
  "event": {
    "metric_type": "set",
    "metric_name:foo.uniques": 98,
    "metric_name:bar.uniques": 127,
    // etc.
  }
}
```

# Backend Metrics
The following internal metrics are calculated and emitted under the `splunkStats` metricName
* `calculationTime` - time spent parsing metrics in ms
* `numStats` - The number of metrics processed
* `flush_length` - the length of the event payload sent to Splunk
* `flush_time` - the response time of the POST request to Splunk
* `last_exception` - the timestamp of the last time a POST failed
* `last_flush` - the timestamp of the last flush

# Running tests
```sh
$ cd /path/to/splunk-statsd-backend
$ npm install
$ npm test
```