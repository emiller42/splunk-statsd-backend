splunk-statsd-backend
=====================
Backend plugin for [statsd](https://github.com/statsd/statsd) to output metrics to [Splunk](https://www.splunk.com) HTTP Event Collector (HEC)

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
    counterLabel: counter,   // Label applied to all counter metrics (default: 'counter')
    gaugeLabel: gauge,       // Label applied to all gauge metrics (default: 'gauge')
    setLabel: Set,           // Label applied to all set metrics (default: 'set')
    // the following populate splunk-specific fields
    host: 'foo',             // Specify a 'host' value for the events sent to Splunk. Leave unset to let Splunk infer this value.  
    source: 'statsd',        // Specify a 'source' value for the events sent to Splunk.  (default: statsd)
    sourcetype: _json,       // Specify a 'sourcetype' value for the events sent to Splunk. (default: _json)
    index: 'main'            // Specify the target index for the events sent to Splunk.  Leave unset to let Splunk control destination index.
  }
}
```

# Implementation Details and Examples
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
...
splunk-statsd-backend % npm test

> splunk-statsd-backend@0.1.0 test
> jest

 PASS  lib/splunkdriver.test.js
  ✓ successful init (1 ms)
  ✓ empty flush (1 ms)
  ✓ flush with counters (1 ms)
  ✓ flush with gauges (1 ms)
  ✓ flush with sets
  ✓ flush with timers (1 ms)

Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total
Snapshots:   0 total
Time:        0.497 s
Ran all test suites.
```