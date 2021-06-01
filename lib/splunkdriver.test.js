const splunkdriver = require('./splunkdriver.js');
const events = require('events');
const request = require('request');

jest.mock('request');

const emitter = new events.EventEmitter()

test('successful init', () => {
    const config = {
        splunk: {
            splunkToken: 'mySplunkToken'
        }
    };
    expect(splunkdriver.init(Date.now(), config, emitter, console)).toBeTruthy();
});

test('empty flush', () => {
    flush({});
    const req = request.mock.calls[0][0];
    expect(req.url).toEqual('https://127.0.0.1:8088/services/collector/event');
    expect(req.strictSSL).toEqual(true);
    expect(req.method).toEqual('POST');
    expect(req.headers.Authorization).toEqual("Splunk mySplunkToken");
});

test('flush with counters', () => {
    const metrics = {
        counter_rates: {
            "foo": 10.0,
            "bar": 15.0,
        },
        counters: {
            "foo": 100,
            "bar": 150,
        },
    };
    flush(metrics);
    const body = request.mock.calls[0][0].body;
    expect(body).toEqual(expectedCounter("foo", 100, 10));
    expect(body).toEqual(expectedCounter("bar", 150, 15.0));
});

test('flush with gauges', () => {
    const metrics = {
        gauges: {
            "foo": 90,
            "bar": 102,
            "baz": 2.5,
        },
    };
    flush(metrics);
    const body = request.mock.calls[0][0].body;
    expect(body).toEqual(expectedGauge("foo", 90));
    expect(body).toEqual(expectedGauge("bar", 102));
    expect(body).toEqual(expectedGauge("baz", 2.5));
});

test('flush with sets', () => {
    const metrics = {
        sets: {
            foo: {
                size() {return 3},
            },
            bar: {
                size() {return 1},
            }
        }
    };

    flush(metrics);
    const body = request.mock.calls[0][0].body;
    expect(body).toEqual(expectedSet("foo", 3));
    expect(body).toEqual(expectedSet("bar", 1));
});

test('flush with timers', () => {
    const data = {
        std: 81.64965809277261,
        upper: 300,
        lower: 100,
        count: 3,
        count_ps: 30,
        sum: 600,
        sum_squares: 140000,
        mean: 200,
        median: 200,
    };

    const metrics = {
        timer_data: {
            "foo": data
        }
    };

    flush(metrics);
    const body = request.mock.calls[0][0].body;
    data.metricType = "timer";
    data.metricName = "foo";
    expect(body).toEqual(expectedMetric(data));

});

function flush(metrics, eventEmitter = emitter) {
    eventEmitter.emit('flush', Date.now(), metrics);
}

function expectedMetric(metric) {
    return expect.stringContaining(JSON.stringify(metric));
}

function expectedSet(metricName, count, metricType = "set") {
    return expectedMetric({
        count,
        metricType,
        metricName,
    });
}

function expectedCounter(metricName, count, rate, metricType = "counter") {
    return expectedMetric({
        rate,
        count,
        metricType,
        metricName,
    });
}

function expectedGauge(metricName, value, metricType = "gauge") {
    return expectedMetric({
        value,
        metricType,
        metricName,
    });
}