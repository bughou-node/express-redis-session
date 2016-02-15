# redis session for express

usage:

```javascript

var app = require('express')();
app.use(require('cookie-parser')());
app.use(require('redis_session')(
  require('redis').createClient()
));

```
