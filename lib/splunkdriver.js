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
let useMetrics;

const splunkStats = {};

class JsonMetric {
  constructor(metricType, key, metrics, ts) {
    this.event = metrics;
    this.event.metricType = metricType;
    this.event.metricName = key;
    this.time = ts;
    if (host) this.host = host;
    if (source) this.source = source;
    if (sourcetype) this.sourcetype = sourcetype;
    if (index) this.index = index;
  }
  toString() {
    return JSON.stringify(this);
  }
}

class JsonMetrics {
  constructor() {
    this.metrics = [];
  }
  addCounters(counters, counterRates, ts) {
    for (const counter in counters) {
      const metric = {
        rate: counterRates[counter]
      };
      if (flushCounts) metric.count = counters[counter];
      this.add(counterLabel, counter, metric, ts);
    }
  }
  addTimers(timerData, ts) {
    for (const timer in timerData) {
      this.add(timerLabel, timer, timerData[timer], ts);
    }
  }
  addGauges(gauges, ts) {
    for (const gauge in gauges) {
      const metric = {
        value: gauges[gauge]
      };
      this.add(gaugeLabel, gauge, metric, ts);
    }
  }
  addSets(sets, ts) {
    for (const set in sets) {
      const metric = {
        count: sets[set].size()
      };
      this.add(setLabel, set, metric, ts);
    }
  }
  addStatsdMetrics(statsdMetrics, ts) {
    this.add(prefixStats, 'statsd', statsdMetrics, ts);
  }
  addSplunkStats(splunkStats, ts) {
    this.add(prefixStats, 'statsd.splunkStats', splunkStats, ts);
  }
  add(metricType, key, metrics, ts) {
    this.metrics.push(new JsonMetric(metricType, key, metrics, ts));
  }
  toString() {
    return this.metrics.map((m) => m.toString()).join('');
  }
}

class SplunkMetric {
  constructor(metricType, ts) {
    this.time = ts;
    this.event = "metric";
    if (host) this.host = host;
    if (source) this.source = source;
    if (sourcetype) this.sourcetype = sourcetype;
    if (index) this.index = index;
    this.fields = {};
    this.fields.metric_type = metricType;
  }
  add(metricName, value) {
    this.fields[`metric_name:${metricName}`] = value;
  }
  toString() {
    return JSON.stringify(this);
  }
}

class SplunkMetrics {
  constructor() {
    this.metrics = {};
  }
  addCounters(counters, counterRates, ts) {
    const collection = this.getMultiMetricCollection(counterLabel, ts);
    for (const counter in counters) {
      collection.add(`${counter}.rate`, counterRates[counter]);
      if (flushCounts) collection.add(`${counter}.count`, counters[counter]);
    }
  }
  addTimers(timerData, ts) {
    const collection = this.getMultiMetricCollection(timerLabel, ts);
    for (const timer in timerData) {
      for (const [metric, value] of Object.entries(timerData[timer])) {
        if (metric == 'histogram') {
          for (const bin in value) {
            collection.add(`${timer}.histogram.${bin}`, value[bin]);
          }
        } else {
          collection.add(`${timer}.${metric}`, value);
        }
      }
    }
  }
  addGauges(gauges, ts) {
    const collection = this.getMultiMetricCollection(gaugeLabel, ts);
    for (const gauge in gauges) {
      collection.add(gauge, gauges[gauge]);
    } 
  }
  addSets(sets, ts) {
    const collection = this.getMultiMetricCollection(setLabel, ts);
    for (const set in sets) {
      collection.add(set, sets[set].size());
    }
  }
  addStatsdMetrics(statsdMetrics, ts) {
    const collection = this.getMultiMetricCollection(prefixStats, ts);
    for (const metric in statsdMetrics) {
      collection.add(`statsd.${metric}`, statsdMetrics[metric]);
    }
  }
  addSplunkStats(splunkStats, ts) {
    const collection = this.getMultiMetricCollection(prefixStats, ts);
    for (const stat in splunkStats) {
      collection.add(`statsd.splunkStats.${stat}`, splunkStats[stat]);
    }
  }
  getMultiMetricCollection(metricType, ts) {
    if (!this.metrics[metricType]) {
      this.metrics[metricType] = new SplunkMetric(metricType, ts);
    }
    return this.metrics[metricType];
  }
  toString() {
    return Object.values(this.metrics).map((m) => m.toString()).join('');
  }
}

function hecOutput(stats, ts) {
  stats.addSplunkStats(splunkStats, ts);
  const statsPayload = stats.toString();
  const splunkUrl = new URL(`http://${splunkHost}:${splunkPort}`);
  if (useSSL) splunkUrl.protocol = 'https';
  splunkUrl.pathname = useMetrics ? '/services/collector' : '/services/collector/event';
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

  const stats = useMetrics ? new SplunkMetrics() : new JsonMetrics();

  if (counters) {
    stats.addCounters(counters, counterRates, ts);
    numStats += Object.keys(counters).length;
  }

  if (timerData) {
    stats.addTimers(timerData, ts);
    numStats += Object.keys(timerData).length;
  }

  if (gauges) {
    stats.addGauges(gauges, ts);
    numStats += Object.keys(gauges).length;
  }

  if (sets) {
    stats.addSets(sets, ts);
    numStats += Object.keys(sets).length;
  }

  splunkStats.numStats = numStats;
  splunkStats.calculationTime = (Date.now() - starttime);

  if (statsdMetrics) {
    stats.addStatsdMetrics(statsdMetrics, ts);
  }

  hecOutput(stats, ts);
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
  useMetrics = typeof(config.splunk.useMetrics) === 'undefined' ? false : config.splunk.useMetrics;

  splunkStats.last_flush = startup_time;
  splunkStats.last_exception = startup_time;
  splunkStats.flush_time = 0;
  splunkStats.flush_length = 0;

  if (useMetrics && sourcetype == 'statsd') {
    l.log('You are attempting to send metrics events with sourcetype=statsd. ' +
          'Splunk attempts to process these events as raw StatsD input, ' +
          'which will *not* behave as expected. (https://splk.it/34HZe2k)', 'WARN')
  }

  events.on('flush', flushStats);
  //events.on('status', backend_status);

  return true;
}

exports.init = splunkInit;