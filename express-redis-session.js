var crypto = require('crypto');
var base64 = require('urlsafe-base64');
var onHeaders = require('on-headers');

module.exports = function (redis, options) {
  make_options(options);

  return function (req, res, next) {
    if (res.locals) res.locals.req = req;

    get_value(redis, req.cookies[options.cookie_name], function (id, value) {
      var session = generate(id, value);
      req.session = res.session = session.session;

      onHeaders(res, function () {
        save(session, id, value, redis, options);
      });

      next();
    });
  };
}

function generate (id, value) {
  var session = parse_value(value);

  session.__defineGetter__('id', function () {
    if (!id) {
      id = base64.encode(crypto.randomBytes(30));
    }
    return id;
  });

  session.clear = function () {
    id = null;
    for (var key in session) {
      if (key !== 'id' && key !== 'clear') {
        delete session[key];
      }
    }
  };
  return session;
}


function save (session, original_id, original_value, redis, options) {
  var value = JSON.stringify(session, replacer);

  var id_modified = session.id !== original_id;
  var modified = id_modified || value !== original_value;

  if (modified) {
    // save session unless it's new and empty
    if (!(id_modified && value === '{}'))
      redis.setex(session_key(session.id), options.timeout, value, log_error);

    if (id_modified) {
      res.cookie(options.cookie_name, req.session.id, options.cookie_options);
      // remove old session
      if (original_id) redis.del(session_key(original_id), log_error);
    }
  } else { // touch session
    redis.expire(session_key(session.id), options.timeout, log_error);
  }
}

function make_options (options) {
  if (!options) options = { };
  if (!options.timeout) options.timeout = 3600 * 100; // seconds
  if (!options.cookie_name) options.cookie_name = 'node_session';
  if (!options.cookie_options) {
    var date = new Date();
    date.setFullYear(date.getFullYear() + 100);
    options.cookie_options = {
      httpOnly: true,
      expires:  date
    };
  }
  if (options.cookie_domain) {
    options.cookie_options.domain = options.cookie_domain;
  }
}


function session_key (id) {
  return 'session:' + id;
}

function get_value (redis, id, callback) {
  if (!id) return callback();
  redis.get(session_key(id), function (err, value) {
    if (err) log_error(err);
    callback(id, value);
  });
}


function parse_value (value) {
  if (!value) return { };
  try {
    return JSON.parse(value);
  } catch (e) {
    log_error(e);
    return { };
  }
}


function replacer (key, value) {
  return (key === 'id' || key === 'clear') ? undefined : value;
}


function get_stack(fn) {
  var e = new Error;
  Error.captureStackTrace(e, fn);
  return e.stack;
}

function log_error(err, req, res) {
  if (err === null || err === undefined) return;

  var info = '\n\n\n' + new Date().toISOString() + ' ';
  if (req) {
    info += req.method + ' ' + req.url + ' ' + res.statusCode + '\n';
  }
  info += (err && err.stack || err) + '\n';
  info += get_stack(arguments.callee);
  console.error(info);
};

