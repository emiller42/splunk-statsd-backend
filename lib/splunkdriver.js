/*jshint node:true, laxcomma:true */

/*
 * Flush stats to Splunk HEC (http://dev.splunk.com/view/event-collector/SP-CAAAE6M)
 *
 *  backends: ["splunk-statsd-backend"]
 *  splunk:
 *    splunkHost: '127.0.0.1', // the hostname of the Splunk Collector you wish to send metrics (default: 127.0.0.1)
 *    splunkPort: 8088,        // port that the event collector is listening on (Default: 8088)
 *    useSSL: true,            // HEC is using SSL (Default: true)
 *    strictSSL: true,         // Should collectd should validate ssl certificates. Set to false if Splunk is using self-signed certs. (Default: true)
 *    splunkToken: 'abcde',    // HEC token for authentication with Splunk (required)
 *    // the following are somewhat equivalent to the 'prefix*' options for the graphite backend
 *    timerLabel: 'timer',     // Label applied to all timer metrics (default: 'timer')
 *    counterLabel: counter,   // Label applied to all counter metrics (default: 'counter')
 *    gaugeLabel: gauge,       // Label applied to all gauge metrics (default: 'gauge')
 *    setLabel: Set,           // Label applied to all set metrics (default: 'set')
 *    // the following populate splunk-specific fields
 *    host: 'foo',             // Specify a 'host' value for the events sent to Splunk. Leave unset to let Splunk infer this value.  
 *    source: 'statsd',        // Specify a 'source' value for the events sent to Splunk.  (default: statsd)
 *    sourcetype: _json,       // Specify a 'sourcetype' value for the events sent to Splunk. (default: _json)
 *    index: 'main'            // Specify the target index for the events sent to Splunk.  Leave unset to let Splunk control destination index.
 *
 * This backend has been adapted using the backends provided with the
 * main statsd distribution for guidance. (https://github.com/etsy/statsd) 
 */

var request = require('request');

// this will be instantiated to the logger
var l;

var flushInterval;
var flush_counts;
var splunkHost;
var splunkPort;
var useSSL;
var strictSSL;
var splunkToken;
var counterLabel;
var timerLabel;
var gaugeLabel;
var setLabel;
var host;
var source;
var sourcetype;
var index;
var prefixStats;

var splunkStats = {};

function Stats() {
  var s = this;
  this.metrics = [];  
  this.add = function(metricType, key, metrics, ts) {
    metric = {};
    metric.event = metrics;
    metric.event.metricType = metricType;
    metric.event.metricName = key;
    metric.time = ts;
    if (host) metric.host = host;
    if (source) metric.source = source;
    if (sourcetype) metric.sourcetype = sourcetype;
    if (index) metric.index = index;
    s.metrics.push(metric);
  }

  // turn a collection of metrics into a valid Splunk HEC event.
  // We assume batching
  this.to_text = function() {
    var output = "";
    s.metrics.map(function(m) {
      output += JSON.stringify(m);
    });
    return output;
  }
}

var hec_output = function splunk_hec_output(stats) {

  var ts = Math.round(Date.now() / 1000);
  stats.add(prefixStats, 'splunkStats', splunkStats, ts);
  var stats_payload = stats.to_text();
  if (splunkHost) {
    var url = '';
    url += useSSL ? 'https://' : 'http://';
    url += splunkHost;
    url += ':' + splunkPort;
    url += '/services/collector/event';
    var options = {
      url: url,
      strictSSL: strictSSL,
      method: 'POST',
      headers: {
        'Authorization': 'Splunk '+ splunkToken
      },
      body: stats_payload
    };

    function callback(error, response, body) {
      if (error) {
        splunkStats.last_exception = Math.round(Date.now() / 1000);
        l.log(error);
      }

    }
    var starttime = Date.now();
    request(options, callback);

    splunkStats.flush_time = (Date.now() - starttime);
    splunkStats.flush_length = stats_payload.length;
    splunkStats.last_flush = Math.round(Date.now() / 1000);

  }
}

var flush_stats = function splunk_flush(ts, metrics) {
  var starttime = Date.now();
  var numStats = 0;
  var key;
  var timer_data_key;
  var counters = metrics.counters;
  var gauges = metrics.gauges;
  var timers = metrics.timers;
  var sets = metrics.sets;
  var counter_rates = metrics.counter_rates;
  var timer_data = metrics.timer_data;
  var statsd_metrics = metrics.statsd_metrics;

  var stats = new Stats();

  for (key in counters) {
    metric = {};
    metric.rate = counter_rates[key];
    if (flush_counts) metric.count = counters[key];
    stats.add(counterLabel, key, metric, ts);
    numStats += 1;
  }

  for (key in timer_data) {
    stats.add(timerLabel, key, timer_data[key], ts);
    numStats += 1;
  }

  for (key in gauges) {
    metric = {};
    metric.value = gauges[key];
    stats.add(gaugeLabel, key, metric, ts);
    numStats += 1;
  }

  for (key in sets) {
    metric = {};
    metric.count = sets[key].size();
    stats.add(setLabel, key, metric, ts);
    numStats += 1;
  }

  splunkStats.numStats = numStats;
  splunkStats.calculationTime = (Date.now() - starttime);
  statsd = {}
  for (key in statsd_metrics) {
    statsd[key] = statsd_metrics[key];
  }
  stats.add(prefixStats, 'statsd', statsd, ts);
  hec_output(stats);
}

exports.init = function splunk_init(startup_time, config, events, logger) {
  l = logger;
  splunkHost = config.splunk.splunkHost || '127.0.0.1';
  splunkPort = config.splunk.splunkPort || 8088;
  useSSL = typeof(config.splunk.useSSL) === 'undefined' ? true : config.splunk.useSSL;
  strictSSL = typeof(config.splunk.strictSSL) === 'undefined' ? true : config.splunk.strictSSL;
  splunkToken = config.splunk.splunkToken;
  counterLabel = config.splunk.counterLabel || 'counter';
  timerLabel = config.splunk.timerLabel || 'timer';
  gaugeLabel = config.splunk.gaugeLabel || 'gauge';
  setLabel = config.splunk.setLabel || 'set';
  source = config.splunk.source || 'statsd';
  sourcetype = config.splunk.sourcetype || '_json';
  host = config.splunk.host;
  index = config.splunk.index;
  flushInterval = config.flushInterval;
  flush_counts = typeof(config.flush_counts) === "undefined" ? true : config.flush_counts;
  prefixStats = config.prefixStats || 'statsd';

  splunkStats.last_flush = startup_time;
  splunkStats.last_exception = startup_time;
  splunkStats.flush_time = 0;
  splunkStats.flush_length = 0;

  events.on('flush', flush_stats);
  //events.on('status', backend_status);

  return true;
}