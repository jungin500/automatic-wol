var http = require('http'),
    urlencode = require('urlencode'),
    { JSDOM } = require('jsdom');

function requestDB(hostname, port, id, password, macaddr) {
    // Request Options Database
    var options = {
        auth: {
            hostname: hostname,
            port: port,
            path: '/sess-bin/login_handler.cgi',
            method: 'POST'
        },

        auth2: {
            hostname: hostname,
            port: port,
            path: '/sess-bin/login.cgi',
            method: 'GET',
            headers: {
                'Cookie': {}
            }
        },

        auth3: {
            hostname: hostname,
            port: port,
            path: '/sess-bin/login_session.cgi',
            method: 'GET',
            headers: {
                'Cookie': {}
            }
        },

        dowol: {
            hostname: hostname,
            port: port,
            path: '/sess-bin/timepro.cgi',
            method: 'POST',
            headers: {
                Cookie: {}
            }
        },
        
        checkLinkStatus: {
            hostname: hostname,
            port: port,
            path: '/sess-bin/timepro.cgi?tmenu=iframe&smenu=trafficconf_linksetup_linkstatus_status',
            method: 'GET',
            headers: {
                Cookie: {}
            }
        }
    };

    // Request Form Database
    var frmData = {
        auth: {
            init_status: '1',
            captcha_on: '0',
            captcha_file: '',
            username: id,
            passwd: password,
            captcha_code: ''
        },

        mac_addr: {
            tmenu: 'iframe',
            smenu: 'expertconfwollist',
            nomore: '0',
            wakeupchk: macaddr,
            act: 'wake'
        },
        
        checkLinkStatus: {
            tmenu: 'iframe',
            smenu: 'trafficconf_linksetup_linkstatus_status'
        }
    };
    
    return {
        options: options,
        frmData: frmData
    };
};

// Request Query Builder Fn
function buildRequest(obj) {
    obj = (typeof obj == 'object') ? obj : {};
    var str = '',
        length = 0;

    for (var i in obj) {
        ++length;
        str = str.concat('&' + i + '=' + urlencode(obj[i]));
    }

    return str.replace('&', '');
};

module.exports = {
    
    requestCheckStatus_http: function(hostname, port, id, password, macaddr, callback) {
        var reqDB = requestDB(hostname, port, id, password, macaddr);
        var options = reqDB.options;
        var frmData = reqDB.frmData;
        
        var authConvBuf = Buffer.from(id + ':' + password, 'ascii').toString('base64');
        options.checkLinkStatus.headers.Authorization = 'Basic ' + authConvBuf;
        options.checkLinkStatus.path = '/cgi-bin/timepro.cgi?tmenu=iframe&smenu=trafficconf_linksetup_linkstatus_status';
        
        var request = http.request(options.checkLinkStatus, (res, err) => {
            // DoRequest Begin
            var resultData = '';
    
            res.setEncoding('utf8');
            res.on('data', (data) => {
                resultData += data;
            }).on('end', () => {
                var dom = new JSDOM(resultData);
                var window = dom.window;
                var $ = require('jquery')(window);
                
                // console.log(resultData);
                var speedTableCell = $('table#trafficconf_linksetup_linkstatus_table > tbody > tr:nth-child(3) > td');
                var resultSpeedSet = {};
                
                for(var $i = 2; $i < speedTableCell.length - 1; $i++) {
                    var speedTxt = $(speedTableCell[$i]).text();
                    if(speedTxt == '--')
                        resultSpeedSet[$i - 2] = 'NoDevice';
                    else if (speedTxt == '10')
                        resultSpeedSet[$i - 2] = 'PowerOff';
                    else if (speedTxt == '100')
                        resultSpeedSet[$i - 2] = 'PowerOn';
                    else
                        resultSpeedSet[$i - 2] = 'Unknown(' + speedTxt + ')';
                    
                }
                
                callback({
                    result: 'success',
                    data: resultSpeedSet
                });
            });
            
            // DoRequest End
        }).end();
        
        request.on('error', function(err) {
            callback({
                result: 'failed',
                data: err.code
            });
        });
    },

    requestCheckStatus_Session: function(hostname, port, id, password, macaddr, callback) {
        var reqDB = requestDB(hostname, port, id, password, macaddr);
        var options = reqDB.options;
        var frmData = reqDB.frmData;
        
        // Main Request
        http.request(options.auth, (res) => {
            // Authorization Begin

            /*
                1. 다음으로 Auth로 이동 (login_handler.cgi)
                2. 다음은 login.cgi
                3. 메인 페이지가 돌아오면 http://<IP>/sess-bin/timepro.cgi?tmenu=expertconf&smenu=remotepc 로 접속. inline frame이 있으니 참고!
            */
            var cookieData = null;

            res.setEncoding('utf8');
            res.on('data', (data) => {
                // data에는 cookie id값이 들어있다.
                // fail시에는 'parent.parent.location'를 contain한다.

                // console.dir(data);

                if (data.search('parent.parent.location') != -1) {
                    callback({
                        result: 'error',
                        message: 'InvalidLogin'
                    });
                    return;
                } else if (data.search('efm_session_id') == -1) {
                    callback({
                        result: 'error',
                        message: 'InvalidSiteId'
                    });
                    return;
                }

                cookieData = 'efm_session_id=' + data.split('setCookie(\'')[1].split('\'')[0];
            }).on('end', () => {
                // CookieSave Begin
                // 앞으로의 Request 옵션 값에 쿠키 설정.
                if (cookieData == null)
                    return;
                else if (cookieData == 0) {
                    callback({
                        result: 'error',
                        message: 'InvalidCookie'
                    });
                    return;
                }

                options.auth2.headers.Cookie = cookieData;
                options.auth3.headers.Cookie = cookieData;
                options.dowol.headers.Cookie = cookieData;
                options.checkLinkStatus.headers.Cookie = cookieData;

                // 두번째 Login Request.
                //TODO: 필요없으면 삭제하기.
                http.request(options.auth2, (res) => {
                    // RequestLogin Begin

                    res.setEncoding('utf8');
                    res.on('data', (data) => {}).on('end', () => {
                        http.request(options.checkLinkStatus, (res) => {
                            // DoRequest Begin
                            
                            var resultData = '';

                            res.setEncoding('utf8');
                            res.on('data', (data) => {
                                resultData += data;
                            }).on('end', () => {
                                var dom = new JSDOM(resultData);
                                var window = dom.window;
                                var $ = require('jquery')(window);
                                
                                // console.log(resultData);
                                var speedTableCell = $('table#trafficconf_linksetup_linkstatus_table > tbody > tr:nth-child(3) > td');
                                var resultSpeedSet = {};
                                
                                for(var $i = 2; $i < speedTableCell.length - 1; $i++) {
                                    var speedTxt = $(speedTableCell[$i]).text();
                                    if(speedTxt == '--')
                                        resultSpeedSet[$i - 2] = 'NoDevice';
                                    else if (speedTxt == '10')
                                        resultSpeedSet[$i - 2] = 'PowerOff';
                                    else if (speedTxt == '100')
                                        resultSpeedSet[$i - 2] = 'PowerOn';
                                    else
                                        resultSpeedSet[$i - 2] = 'Unknown(' + speedTxt + ')';
                                    
                                }
                                
                                callback({
                                    result: 'success',
                                    data: resultSpeedSet
                                });
                            });
                            
                            // DoRequest End
                        }).end();
                    });

                    // RequestLogin End
                }).end();

                // CookieSave End
            });

            // Authorization Begin
        }).on('error', (err) => {
            callback({
                result: 'error',
                reason: err.code
            })
        }).end(buildRequest(frmData.auth));
    },
    
    requestHttpWolRequest_http: function(hostname, port, id, password, macaddr, callback) {
        var reqDB = requestDB(hostname, port, id, password, macaddr);
        var options = reqDB.options;
        var frmData = reqDB.frmData;
        
        
        var authConvBuf = Buffer.from(id + ':' + password, 'ascii').toString('base64');
        options.dowol.headers.Authorization = 'Basic ' + authConvBuf;
        options.dowol.path = '/cgi-bin/timepro.cgi';
        
        http.request(options.dowol, (res) => {
            // DoWOLRequest Begin
    
            res.setEncoding('utf8');
            res.on('data', (data) => {}).on('end', () => {
                callback({
                    result: 'success'
                });
            });
            
            // DoWOLRequest End
        }).end(buildRequest(frmData.mac_addr));
    },
    
    requestHttpWolRequest: function(hostname, port, id, password, macaddr, callback) {
        var reqDB = requestDB(hostname, port, id, password, macaddr);
        var options = reqDB.options;
        var frmData = reqDB.frmData;
        

        // Main Request
        http.request(options.auth, (res) => {
            // Authorization Begin

            /*
                1. 다음으로 Auth로 이동 (login_handler.cgi)
                2. 다음은 login.cgi
                3. 메인 페이지가 돌아오면 http://<IP>/sess-bin/timepro.cgi?tmenu=expertconf&smenu=remotepc 로 접속. inline frame이 있으니 참고!
            */
            var cookieData = null;

            res.setEncoding('utf8');
            res.on('data', (data) => {
                // data에는 cookie id값이 들어있다.
                // fail시에는 'parent.parent.location'를 contain한다.

                // console.dir(data);

                if (data.search('parent.parent.location') != -1) {
                    callback({
                        result: 'error',
                        message: 'InvalidLogin'
                    });
                    return;
                } else if (data.search('efm_session_id') == -1) {
                    callback({
                        result: 'error',
                        message: 'InvalidSiteId'
                    });
                    return;
                }

                cookieData = 'efm_session_id=' + data.split('setCookie(\'')[1].split('\'')[0];
            }).on('end', () => {
                // CookieSave Begin
                // 앞으로의 Request 옵션 값에 쿠키 설정.
                if (cookieData == null) {
                    return;
                } else if (cookieData == 0) {
                    callback({
                        result: 'error',
                        message: 'InvalidCookie'
                    });
                    return;
                }

                options.auth2.headers.Cookie = cookieData;
                options.auth3.headers.Cookie = cookieData;
                options.dowol.headers.Cookie = cookieData;

                // 두번째 Login Request.
                //TODO: 필요없으면 삭제하기.
                http.request(options.auth2, (res) => {
                    // RequestLogin Begin

                    res.setEncoding('utf8');
                    res.on('data', (data) => {}).on('end', () => {
                        http.request(options.dowol, (res) => {
                            // DoWOLRequest Begin

                            res.setEncoding('utf8');
                            res.on('data', (data) => {}).on('end', () => {
                                callback({
                                    result: 'success'
                                });
                            });
                            
                            // DoWOLRequest End
                        }).end(buildRequest(frmData.mac_addr));
                    });

                    // RequestLogin End
                }).end();

                // CookieSave End
            });

            // Authorization Begin
        }).on('error', (err) => {
            callback({
                result: 'error',
                reason: err.code
            })
        }).end(buildRequest(frmData.auth));
    }
};