var express = require('express'),
    serveStatic = require('serve-static'),
    path = require('path'),
    bodyParser = require('body-parser'),
    http = require('http'),
    https = require('https'),
    fs = require('fs'),
    mongoose = require('mongoose'),
    expressErrorHandler = require('express-error-handler'),
    basicAuth = require('express-basic-auth'),
    httpRequest = require('./custom_modules/httpRequest.js'),
    enc_algorithm = require('md5'),
    winston = require('winston');
    
/**
 * Logging function
 */
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.File({
            filename: 'logs/automatic-wol.log',
            level: 'error'
        })
    ]
});

if(process.env.ENV_TYPE != 'PRODUCTION')
    logger.add(new winston.transports.Console({
        format: winston.format.simple(),
        level: 'debug'
    }));
    
/**
 * HTTPS certificate
 */
var credential = {
    key: fs.readFileSync('/etc/letsencrypt/live/<hostname>/privkey.pem', 'utf8'),
    cert: fs.readFileSync('/etc/letsencrypt/live/<hostname>/fullchain.pem', 'utf8')
};

/**
 * Database Initialization
 */

mongoose.connect('mongodb://localhost/automatic_wol').then((result) => {
    logger.info('[DB] 연결 성공');
}).catch((reject) => {
    logger.warn('[DB] ' + reject.name
        + ': 데이터베이스에 연결할 수 없습니다: ' + reject.message);
});

var app = express();
var router = express.Router();


// Express App Configuration
app.set('PORT', process.env.PORT || 80);
app.set('PORT_S', process.env.PORT_S || 443);
app.set('ROUTER_HOST', '<ipTIME_Router_IP>');
app.set('ROUTER_PORT', '<ipTIME_Router_Port>');
app.set('ROUTER_LOGIN_ID', '<ipTIME_Login_ID>');
app.set('ROUTER_LOGIN_PW', '<ipTIME_Login_PW>');
app.set('ROUTER_WOL_MACADDR', '<Target_PC_MAC_ADDR_SPLIT_BY_:_>');
app.set('ROUTER_AUTH', 'http'); // http or session

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Enabling HSTS Middleware
app.use((req, res, next) => {
    res.set('Strict-Transport-Security', 'max-age=31536000');
    next();
});

// Logger Middleware
app.use((req, res, next) => {
    
    var isAuthComplete = (req.headers.authorization)? true : false;
    var rawAuthInfo = null, authInfo = null;
    
    if(isAuthComplete) {
        rawAuthInfo = Buffer.from(req.headers.authorization.split(' ')[1], 'base64').toString('ascii').split(':');
        authInfo = {
            id: rawAuthInfo[0],
            pw: Buffer.from(rawAuthInfo[1], 'ascii').toString('base64')
        };
    }
    
    var connectionInfo = {
        timeStamp: Date.now(),
        location: req.connection.remoteAddress.toString(),
        requestUrl: req.url,
        requests: req.body,
        session: req.session,
        authorization: isAuthComplete? authInfo : false,
        https: req.connection.encrypted
    };

    if(connectionInfo.requestUrl.search('favicon.ico') == -1) {
        // logger.verbose(JSON.stringify(connectionInfo));
    }
    
    if(connectionInfo.requestUrl == '/') {
        res.redirect('/index.html');
        res.end();
        return;
    } else if (!connectionInfo.https) {
        // force HTTPS on every connection!
        res.redirect('https://' + req.headers.host + '/index.html');
        res.end();
        return;
    }
    
    next();
});

app.use('/', serveStatic(path.join(__dirname, 'public')));
app.use(router);

app.use(expressErrorHandler.httpError(404));
app.use(expressErrorHandler({
    static: {
        '404': './public/include/404.html'
    }
}));
// Express app configuration end

// Express Router configuration
router.route('/process/processWOL').post((req, res) => {
    if(app.get('ROUTER_AUTH') == 'session')
        httpRequest.requestHttpWolRequest(app.get('ROUTER_HOST'),
            app.get('ROUTER_PORT'), app.get('ROUTER_LOGIN_ID'),
            app.get('ROUTER_LOGIN_PW'), app.get('ROUTER_WOL_MACADDR'), (data) => {
                res.json(data);
                res.end();
        });
    else if(app.get('ROUTER_AUTH') == 'http')
        httpRequest.requestHttpWolRequest_http(app.get('ROUTER_HOST'),
            app.get('ROUTER_PORT'), app.get('ROUTER_LOGIN_ID'),
            app.get('ROUTER_LOGIN_PW'), app.get('ROUTER_WOL_MACADDR'), (data) => {
                res.json(data);
                res.end();
        });
    else if(app.get('ROUTER_AUTH') == 'disabled')
        httpRequest.requestHttpWolRequest_noauth(app.get('ROUTER_HOST'),
            app.get('ROUTER_PORT'), app.get('ROUTER_LOGIN_ID'),
            app.get('ROUTER_LOGIN_PW'), app.get('ROUTER_WOL_MACADDR'), (data) => {
                res.json(data);
                res.end();
        });
});

router.route('/process/checkStatus').get((req, res) => {
    if(app.get('ROUTER_AUTH') == 'session')
        httpRequest.requestCheckStatus_Session(app.get('ROUTER_HOST'),
            app.get('ROUTER_PORT'), app.get('ROUTER_LOGIN_ID'),
            app.get('ROUTER_LOGIN_PW'), app.get('ROUTER_WOL_MACADDR'), (data) => {
            res.json(data);
            res.end();
        });
    else if (app.get('ROUTER_AUTH') == 'http')
        httpRequest.requestCheckStatus_http(app.get('ROUTER_HOST'),
            app.get('ROUTER_PORT'), app.get('ROUTER_LOGIN_ID'),
            app.get('ROUTER_LOGIN_PW'), app.get('ROUTER_WOL_MACADDR'), (data) => {
            res.json(data);
            res.end();
        });
    else if (app.get('ROUTER_AUTH') == 'disabled')
        httpRequest.requestCheckStatus_noauth(app.get('ROUTER_HOST'),
            app.get('ROUTER_PORT'), app.get('ROUTER_LOGIN_ID'),
            app.get('ROUTER_LOGIN_PW'), app.get('ROUTER_WOL_MACADDR'), (data) => {
            res.json(data);
            res.end();
        });
});

/**
 * Authentication Scheme
 */

http.createServer(app).listen(app.get('PORT'), () => {
    logger.info('[정보] 서버 시작됨. ' + app.get('PORT') + '번 포트에서  Listening...');
});

https.createServer(credential, app).listen(app.get('PORT_S'), () => {
    logger.info('[정보] 서버 시작됨(SSL). 443번 포트에서 Listening...');
});