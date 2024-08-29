const express = require('express');
const logger = require('./logger');
const api = require('./api');
const rateLimit = require('./rate-limit');

const app = express();
const config = require('./config');

const request = require("request");

corslist=["localhost","zerocat.houlangs.com","zerocat.wuyuan.dev","z.8r.ink",'zerocat-static.houlangs.com','zerocat-comment.houlangs.com','zerocatdev.github.io','zeronext.wuyuan.dev','python.190823.xyz','scratch.190823.xyz',"zerocat-test1.wuyuan.dev"]

// cors配置
var cors = require("cors");
var corsOptions = {
  origin: (origin, callback) => {
    if (!origin || corslist.indexOf(new URL(origin).hostname) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  preflightContinue: false,
  optionsSuccessStatus: 200,
  credentials: true,
};
app.use(cors(corsOptions)); // 应用CORS配置函数
app.set('case sensitive routing', true);
app.set('strict routing', true);
app.set('x-powered-by', false);
app.set('trust proxy', true);
app.set('query parser', (q) => new URLSearchParams(q));

app.use((req, res, next) => {
  res.header('X-Frame-Options', 'DENY');
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('Referrer-Policy', 'no-referrer');
  res.header('Permissions-Policy', 'interest-cohort=()');
  next();
});

const STATIC_ROOT = 'static';
app.use(express.static(STATIC_ROOT));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', config.APP.allowOrigins);
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Content-Security-Policy', 'default-src \'self\'')
  logger.debug('Handling Request :: %s', req.path);
  next();
});

const formatExpires = (unix) => {
  const date = new Date(unix);
  const now = Date.now();
  // It's possible an expired response is returned or that it has become outdated since it was received.
  const until = Math.max(0, date.getTime() - now);
  return {
    expires: date.toUTCString(),
    cacheControl: `public, max-age=${Math.round(until / 1000)}, immutable, must-revalidate`
  };
};

const handleResponse = (res, dbPromise) => {
  dbPromise
    .then(({status, data, expires}) => {
      res.status(status);
      if (status !== 200) {
        res.type('application/json');
      }
      if (expires) {
        const formattedExpires = formatExpires(expires);
        // TODO: consider dropping `Expires` as `Cache-Control` takes precedence
        res.header('Expires', formattedExpires.expires);
        res.header('Cache-Control', formattedExpires.cacheControl);
      }
      res.send(data);
    })
    .catch((error) => {
      logger.error('' + ((error && error.stack) || error));
      res.status(500);
      res.type('text/plain');
      res.send('Internal server error');
    });
};

const apiProxy = express.Router();

apiProxy.get('/projectssource/:id', (req, res) => {
  res.type('application/json');
  logger.debug('test');


  handleResponse(res, api.getProjectSource(req.params.id,req.query.token));
});
apiProxy.get('/projects/:id', (req, res) => {
  res.type('application/json');
  handleResponse(res, api.getProjectMeta(req.params.id));
});

apiProxy.get('/users/:username', (req, res) => {
  res.type('application/json');
  handleResponse(res, api.getUser(req.params.username));
});

apiProxy.get('/studios/:id/projects', (req, res) => {
  const offset = req.query.offset || '0';
  res.type('application/json');
  handleResponse(res, api.getStudioPage(req.params.id, offset));
});

apiProxy.get('/studios/:id/projectstemporary/:offset', (req, res) => {
  res.type('application/json');
  handleResponse(res, api.getStudioPage(req.params.id, req.params.offset));
});

app.use('/api', apiProxy);
app.use('/proxy', apiProxy);

app.get('/thumbnails/:id', (req, res) => {
  const width = req.query.width || '480';
  const height = req.query.height || '360';
  // probably not spec compliant but good enough
  const format = (req.get('accept') || '').includes('image/webp') ? 'image/webp' : 'image/jpeg';
  res.type(format);
  res.header('Vary', 'Accept');
  handleResponse(res, api.getResizedThumbnail(req.params.id, +width, +height, format));
});


app.get('/asset/:hash', (req, res) => {
  handleResponse(res, api.getAsset(req.params.hash));
});
app.get('/asset/:hash/*', (req, res) => {
  handleResponse(res, api.getAsset(req.params.hash));
});


app.get('/avatars/by-username/:username', (req, res) => {
  res.type('image/png');
  handleResponse(res, api.getAvatarByUsername(req.params.username));
});

app.get('/avatars/:id', (req, res) => {
  res.type('image/png');
  handleResponse(res, api.getAvatar(req.params.id));
});

app.get('/translate/translate', rateLimit({ requests: 500 }), (req, res) => {
  const language = req.query.language;
  const text = req.query.text;
  res.type('application/json');
  if (req.rateLimited) {
    // TODO: we should still try to hit the cache
    res.status(429);
    res.send(JSON.stringify({
      result: text
    }));
    return;
  }
  handleResponse(res, api.getTranslate(language, text));
});

app.get('/tts/synth', (req, res) => {
  const locale = req.query.locale;
  const gender = req.query.gender;
  const text = req.query.text;
  res.type('audio/mpeg');
  handleResponse(res, api.getTTS(locale, gender, text));
});

app.get('/cloud-proxy/*', (req, res) => {
  res.status(404);
  res.type('text/plain');
  res.send('cloud proxy has been removed');
});

app.get('/site-proxy/*', (req, res) => {
  res.status(404);
  res.type('text/plain');
  res.send('site proxy has been removed');
});

app.get("/explore/projects", function (req, res) {
  request({
    url: "https://api.scratch.mit.edu/explore/projects",
    qs: {
      limit: req.query.limit || 16,
      language: req.query.language || 'zh-cn',
      mode: req.query.mode || 'popular',
      q: req.query.q || '*',
      offset: req.query.offset || 0,
    },
    method: "GET",
  }, function (error, response, body) {
    //console.log(body);
    if (!error && response.statusCode == 200) {
      res.status(200).send(body);
    }
  })
});

app.get("/search/projects", function (req, res) {
  request({
    url: "https://api.scratch.mit.edu/explore/projects",
    qs: {
      limit: req.query.limit || 16,
      language: req.query.language || 'zh-cn',
      mode: req.query.mode || 'popular',
      q: req.query.q || '*',
      offset: req.query.offset || 0,
    },
    method: "GET",
  }, function (error, response, body) {
    //console.log(body);
    if (!error && response.statusCode == 200) {
      res.status(200).send(body);
    }
  })
});
app.get("/projects/:id", function (req, res) {
  request({
    url: "https://api.scratch.mit.edu/projects/"+req.params.id,

    method: "GET",
  }, function (error, response, body) {
    //console.log(body);
    if (!error && response.statusCode == 200) {
      res.status(200).send(body);
    }
  })
});
app.get("/projects/source/:id", function (req, res) {
  request({
    url: `https://projects.scratch.mit.edu/${req.params.id}?token=${req.query.token}`,
    method: "GET",
  }, function (error, response, body) {
    //console.log(body);
    if (!error && response.statusCode == 200) {
      res.status(200).send(body);
    }
  })
});
app.use((req, res) => {
  logger.debug('404: %s', req.path);
  res.status(404).sendFile('404.html', { root: STATIC_ROOT });
});

module.exports = app;
