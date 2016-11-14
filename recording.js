'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});
exports.sendS3 = sendS3;
exports.convertWavToMp4 = convertWavToMp4;
exports.uploadMessage = uploadMessage;
exports.upload = upload;
exports.getJSONP = getJSONP;

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _url = require('url');

var _url2 = _interopRequireDefault(_url);

var _https = require('https');

var _https2 = _interopRequireDefault(_https);

var _nodeMicrophone = require('node-microphone');

var _nodeMicrophone2 = _interopRequireDefault(_nodeMicrophone);

var _fluentFfmpeg = require('fluent-ffmpeg');

var _fluentFfmpeg2 = _interopRequireDefault(_fluentFfmpeg);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var mic = new _nodeMicrophone2.default({
    device: 'hw:3,0'
}).on('error', function (error) {
    console.log(error);
});

var filename;
var micStream = void 0;

function startRecording() {
    filename = '/tmp/aquiles/wavfile' + new Date().getTime() + '.wav';
    console.log("starting");
    micStream = mic.startRecording();

    var wstream = _fs2.default.createWriteStream(filename);
    wstream.on('close', function () {
        console.log('stream end');
        sendAudio(filename);
    });
    micStream.pipe(wstream);
}

function stopRecording() {
    console.log("stopping");
    mic.stopRecording();
}

function sendAudio(filename) {
    var resultfilePath = '/tmp/aquiles/result' + new Date().getTime() + '.mp4';
    convertWavToMp4(filename, resultfilePath).then(function (mp4FilePath) {
        console.log('--------------SendAudio:Res', mp4FilePath);
        sendS3(mp4FilePath).then(function (res) {}).catch(function (error) {});
    }).catch(function (err) {
        console.log('-----------------SendAudio:Err', err);
    });
}

// startRecording()
// setTimeout(() => { stopRecording() }, 3000)


function sendS3(mp4FilePath) {
    return new Promise(function (resolve, reject) {
        console.log('-----------------SendS3');

        _fs2.default.readFile(mp4FilePath, function (err, mp4) {
            var recordingId = "VVVAAATEST-" + new Date().getTime();
            uploadMessage(recordingId, mp4).then(function (resp) {
                console.log('-----------------SendS3:Resp', resp);
                _fs2.default.unlink(mp4FilePath);
                resolve();
            }).catch(function (err) {
                console.log('-----------------.SendS3:Err', err);
                _fs2.default.unlink(mp4FilePath);
                reject();
            });
        });
    });
}

function convertWavToMp4(filePath, resultfilePath) {
    console.log('----------------ConvertWavToMp4');
    return new Promise(function (resolve, reject) {
        (0, _fluentFfmpeg2.default)(filePath).audioBitrate('128k').audioCodec('libmp3lame').output(resultfilePath).on('end', function (commandLine) {
            console.log('----------------ConvertWavToMp4 mp4 created');
            _fs2.default.unlink(filePath);
            resolve(resultfilePath);
        }).on('error', function (error) {
            try {
                _fs2.default.unlink(resultfilePath);
            } catch (e) {}
            console.log('----------------ConvertWavToMp4:ERROR', error);
            reject(error);
        }).run();
    });
}

function uploadMessage(recordingId, file) {
    return new Promise(function (resolve, reject) {
        console.log('---------------------uploadMessage');
        var reqParams = {
            host: 'stg.clinicloud.com',
            port: 443,
            path: '/api/v2/s3url?filename=' + recordingId + '.mp4&folder=recordings&bucket=ccloud-messaging-dev&mode=upload&content-type=audio/mp4',
            method: 'GET'
        };

        getJSONP(reqParams).then(function (response) {
            var resp = JSON.parse(response);
            upload(resp.url, file).then(function (res) {
                resolve(res);
            }).catch(function (err) {
                reject(err);
            });
        }).catch(function (error) {
            reject(error);
        });
    });
}

function upload(uploadUrl, data) {
    return new Promise(function (resolve, reject) {
        try {
            var s3Url = _url2.default.parse(uploadUrl);
            console.log(s3Url.host + s3Url.path);

            var options = {
                host: s3Url.host,
                path: s3Url.path,
                method: 'PUT',
                headers: {
                    'x-amz-server-side-encryption': 'AES256',
                    'Content-Type': 'audio/mp4',
                    'Content-Length': data.length
                }
            };

            console.log('Content-Length', data.length);

            var req = _https2.default.request(options, function (res) {
                var output = '';

                res.on('data', function (chunk) {
                    output += chunk;
                });

                res.on('end', function () {
                    console.log(output);
                    resolve(output);
                });
            });

            req.on('error', function (err) {
                reject(err);
            });

            req.write(data);
            req.end();
        } catch (e) {
            reject(e);
        }
    });
}

function getJSONP(options, body) {
    return new Promise(function (fulfill, reject) {
        var prot = options.port == 443 ? _https2.default : http;
        var req = prot.request(options, function (res) {
            var output = '';
            res.setEncoding('utf8');

            res.on('data', function (chunk) {
                output += chunk;
            });

            res.on('end', function () {
                fulfill(output);
            });
        });

        req.on('error', function (err) {
            reject('error: ' + err.message);
        });

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}