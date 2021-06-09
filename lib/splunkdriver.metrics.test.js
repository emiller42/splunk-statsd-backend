const splunkdriver = require('./splunkdriver.js');
const events = require('events');
const request = require('request');

jest.mock('../node_modules/request');

const timestamp = Date.now();
Date.now = jest.fn(() => timestamp);

const emitter = new events.EventEmitter();

describe('Splunk Metrics events', () => {
    test('successful init', () => {
        const config = {
            splunk: {
                splunkToken: 'mySplunkToken',
                useMetrics: true,
            }
        };
        expect(splunkdriver.init(Date.now(), config, emitter, console)).toBeTruthy();

    });

    test('empty flush', () => {
        flush({});
        const req = request.mock.calls[0][0];
        expect(req.url).toEqual('https://127.0.0.1:8088/services/collector');
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

        const expected = {
            time: timestamp,
            event: 'metric',
            source: 'statsd',
            sourcetype: '_json',
            fields: {
                metric_type:'counter',
                'metric_name:foo.rate': 10,
                'metric_name:foo.count':100,
                'metric_name:bar.rate':15,
                'metric_name:bar.count':150
            }
        };

        flush(metrics);
        const parsedBody = parseBody(request.mock.calls[0][0].body);
        expect(parsedBody).toContainEqual(expected);
    });

    test('flush with gauges', () => {
        const metrics = {
            gauges: {
                "foo": 90,
                "bar": 102,
                "baz": 2.5,
            },
        };
        const expected = {
            time: timestamp,
            event: 'metric',
            source: 'statsd',
            sourcetype: '_json',
            fields: {
                metric_type:'gauge',
                'metric_name:foo': 90,
                'metric_name:bar': 102,
                'metric_name:baz': 2.5
            }
        };

        flush(metrics);
        const parsedBody = parseBody(request.mock.calls[0][0].body);
        expect(parsedBody).toContainEqual(expected);
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
        
        const expected = {
            time: timestamp,
            event: 'metric',
            source: 'statsd',
            sourcetype: '_json',
            fields: {
                metric_type:'set',
                'metric_name:foo': 3,
                'metric_name:bar': 1
            }
        };
        
        flush(metrics);
        const parsedBody = parseBody(request.mock.calls[0][0].body);
        expect(parsedBody).toContainEqual(expected);
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

        const expected = {
            time: timestamp,
            event: 'metric',
            source: 'statsd',
            sourcetype: '_json',
            fields: {
                metric_type:'timer',
                'metric_name:foo.std': data.std,
                'metric_name:foo.upper': data.upper,
                'metric_name:foo.lower': data.lower,
                'metric_name:foo.count': data.count,
                'metric_name:foo.count_ps': data.count_ps,
                'metric_name:foo.sum': data.sum,
                'metric_name:foo.sum_squares': data.sum_squares,
                'metric_name:foo.mean': data.mean,
                'metric_name:foo.median': data.median,
            }
        };
        
        flush(metrics);
        const parsedBody = parseBody(request.mock.calls[0][0].body);
        expect(parsedBody).toContainEqual(expected);
        
    });
});

function parseBody(body) {
    return JSON.parse(`[${body.replace(/}{/g, '},{')}]`);
}

function flush(metrics, eventEmitter = emitter) {
    eventEmitter.emit('flush', Date.now(), metrics);
}