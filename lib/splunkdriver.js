/*jshint node:true, laxcomma:true */

/*
 * Flush stats to Splunk HEC (http://dev.splunk.com/view/event-collector/SP-CAAAE6M)
 *
 * To enable this backend, include 'splunkdriver' in the backends configuration array
 *
 *  backends: ["splunkdriver"]
 *
 * config options TODO
 *
 * This backend has been adapted using the backends provided with the
 * main statsd distribution for guidance. (https://github.com/etsy/statsd) 
 */

var request = require('request');

// this will be instantiated to the logger
var l;

var flushInterval;
var flush_counts;
var host;
var port;
var token;
var source;
var sourcetype;
var index;

var stats = {};

function Stats() {
  var s = this;
  this.metrics = {
    Timer: {},
    Counter: {},
    Gauge: {},
    Set: {},
    Stats: {}
  };  
  this.addTimer = function(key, metrics, ts) {
    s.metrics["Timer"][key] = {
      'event': metrics
    };
    s.metrics["Timer"][key]['event']['metricType'] = "Timer";
    s.metrics["Timer"][key]['event']['key'] = key;
    s.metrics['Timer'][key]['time'] = ts;
    if (source) s.metrics['Timer'][key]['source'] = source;
    if (sourcetype) s.metrics['Timer'][key]['sourcetype'] = sourcetype;
    if (index) s.metrics['Timer'][key]['index'] = index;
  }
  this.add = function(metricType, key, metricName, metricValue, ts) {
    if (!(metricType in s.metrics)) s.metrics[metricType] = {}
    // if this is a new key, initialize it in the collection
    if (!(key in s.metrics[metricType])) {
      s.metrics[metricType][key] = {
        "metricType": metricType,
        "key": key,
        "time": ts
      };
    };
    // now add the specific metric
    s.metrics[metricType][key][metricName] = metricValue;
  };
  // turn a collection of metrics into a valid Splunk HEC event.
  // We assume batching
  this.to_string = function() {
    var output = "";
    for (metricType in s.metrics) {
      for (key in s.metrics[metricType]) {
        output += JSON.stringify(s.metrics[metricType][key]);
      }
    } 
    return output;
  }
}

var hec_output = function splunk_hec_output(stats) {
  if (host) {
    var options = {
      url: 'https://'+host+':'+port+'/services/collector/event',
      strictSSL: false,
      method: 'POST',
      headers: {
        'Authorization': 'Splunk '+ token
      },
      body: stats.to_string()
    };
    l.log(JSON.stringify(options));
    function callback(error, response, body) {
      l.log(error);
      l.log(response);
      l.log(body);
    }
    request(options, callback);
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
    stats.add("Counter", key, "rate", counter_rates[key], ts);
    if (flush_counts) stats.add("Counter", key, "count", counters[key], ts);
    numStats += 1;
  }
  // {"foo":{"count_90":3,"mean_90":127,"upper_90":127,"sum_90":381,"sum_squares_90":48387,"std":0,"upper":127,"lower":127,"count":3,"count_ps":0.3,"sum":381,"sum_squares":48387,"mean":127,"median":127}
  for (key in timer_data) {
    stats.addTimer(key, timer_data[key], ts);
    numStats += 1;
  }

  for (key in gauges) {
    stats.add("Gauge", key, "value", gauges[key], ts);
    numStats += 1;
  }

  for (key in sets) {
    stats.add("Set", key, "count", sets[key].size(), ts);
    numStats += 1;
  }

  stats.add("Stats", "statsd", "numStats", numStats, ts);
  stats.add("Stats", "statsd", "SplunkStats.calculationtime", (Date.now() - starttime) , ts);
  for (key in statsd_metrics) {
    stats.add("Stats", "statsd", key, statsd_metrics[key], ts);
  }
  hec_output(stats);
}

exports.init = function splunk_init(startup_time, config, events, logger) {
  l = logger;
  host = config.splunk.host;
  port = config.splunk.port || 8088;
  token = config.splunk.token;
  source = config.splunk.source || 'statsd';
  sourcetype = config.splunk.sourcetype || '_json';
  index = config.splunk.index;
  flushInterval = config.flushInterval;
  flush_counts = typeof(config.flush_counts) === "undefined" ? true : config.flush_counts;

  events.on('flush', flush_stats);
  //events.on('status', backend_status);

  return true;
}