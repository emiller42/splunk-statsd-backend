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

const request = require('request');

// this will be instantiated to the logger
let l;

let flushCounts;
let splunkHost;
let splunkPort;
let useSSL;
let strictSSL;
let splunkToken;
let counterLabel;
let timerLabel;
let gaugeLabel;
let setLabel;
let host;
let source;
let sourcetype;
let index;
let prefixStats;

const splunkStats = {};

class Stats {
  constructor() {
    this.metrics = [];
  }
  add(metricType, key, metrics, ts) {
    var metric = {};
    metric.event = metrics;
    metric.event.metricType = metricType;
    metric.event.metricName = key;
    metric.time = ts;
    if (host) metric.host = host;
    if (source) metric.source = source;
    if (sourcetype) metric.sourcetype = sourcetype;
    if (index) metric.index = index;
    this.metrics.push(metric);
  }
  toText() {
    return this.metrics.map((m) => JSON.stringify(m)).join('');
  }
}

function hecOutput(stats) {
  const ts = Math.round(Date.now() / 1000);
  stats.add(prefixStats, 'splunkStats', splunkStats, ts);
  const statsPayload = stats.toText();
  let splunkUrl = new URL(`http://${splunkHost}:${splunkPort}`);
  if (useSSL) splunkUrl.protocol = 'https';
  splunkUrl.pathname = '/services/collector/event';
  const options = {
    url: splunkUrl.href,
    strictSSL: strictSSL,
    method: 'POST',
    headers: {
      Authorization: `Splunk ${splunkToken}`,
    },
    body: statsPayload
  };

  function callback(error, _response, _body) {
    if (error) {
      splunkStats.last_exception = Math.round(Date.now() / 1000);
      l.log(error);
    }

  }
  const starttime = Date.now();
  request(options, callback);

  splunkStats.flush_time = (Date.now() - starttime);
  splunkStats.flush_length = statsPayload.length;
  splunkStats.last_flush = Math.round(Date.now() / 1000);
}

function flushStats(ts, metrics) {
  const starttime = Date.now();
  let numStats = 0;
  const counters = metrics.counters;
  const gauges = metrics.gauges;
  const sets = metrics.sets;
  const counterRates = metrics.counter_rates;
  const timerData = metrics.timer_data;
  const statsdMetrics = metrics.statsd_metrics;
  /* unused metrics fields:
   * metrics.timers - raw timer data
   * metrics.timer_counters - number of datapoints in each timer. (Equivalent to timer_data[timer].count)
   * metrics.pct_threshold - equivalent to config.percentThreshold of timers
   */

  const stats = new Stats();

  for (const counter in counters) {
    const metric = {
      rate: counterRates[counter]
    };
    if (flushCounts) metric.count = counters[counter];
    stats.add(counterLabel, counter, metric, ts);
    numStats += 1;
  }

  for (const timer in timerData) {
    stats.add(timerLabel, timer, timerData[timer], ts);
    numStats += 1;
  }
  
  for (const gauge in gauges) {
    const metric = {
      value: gauges[gauge]
    };
    stats.add(gaugeLabel, gauge, metric, ts);
    numStats += 1;
  }
 
  for (const set in sets) {
    const metric = {
      count: sets[set].size(),
    };
    stats.add(setLabel, set, metric, ts);
    numStats += 1;
  }

  splunkStats.numStats = numStats;
  splunkStats.calculationTime = (Date.now() - starttime);
  
  if (statsdMetrics) {
    stats.add(prefixStats, 'statsd', statsdMetrics, ts);
  }
  
  hecOutput(stats);
}

function splunkInit(startup_time, config, events, logger) {
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
  flushCounts = typeof(config.flush_counts) === "undefined" ? true : config.flush_counts;
  prefixStats = config.prefixStats || 'statsd';

  splunkStats.last_flush = startup_time;
  splunkStats.last_exception = startup_time;
  splunkStats.flush_time = 0;
  splunkStats.flush_length = 0;

  events.on('flush', flushStats);
  //events.on('status', backend_status);

  return true;
}

exports.init = splunkInit;