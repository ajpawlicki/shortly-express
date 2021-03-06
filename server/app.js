var express = require('express');
var path = require('path');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');

var Users = require('./models/user');
var Links = require('./models/link');
var Sessions = require('./models/session');
var Click = require('./models/click');

var cookieParser = require('./middleware/cookieParser');
var sessionParser = require('./middleware/sessionParser');

var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
// Serve static files from ../public directory
app.use(express.static(path.join(__dirname, '../public')));

// Call cookie parser and session parser on each request
// app.use(cookieParser);
// app.use(sessionParser);

app.get('/', 
function(req, res) {
  res.render('index');
});

app.get('/login', 
function(req, res) {
  res.render('login');
});

app.get('/signup', 
function(req, res) {
  res.render('signup');
});

app.post('/login',
function(req, res) {
  // Set up params with username to check
  var params = [req.body.username];
  // Get login information for the user (salt + hashedPassword)
  Users.getLoginInfo(params, function(err, results) {
    if (err) {
      console.log(err);
    } else {
      // results should contain the salt and hashedPassword
      
      // Didn't find username in db
      if (!results.length) {
        res.redirect('/login');
      } else {  // Found username in db
        console.log('LOGIN call results', results);
        // Hash the password the user sends in
        var result = results[0];
        var storedHashedPW = result.password;
        var newlyHashedPW = util.hashPassword(req.body.password, result.salt);
        // res.sendStatus(201);
        // Compare the newly hashed password with the hashedPassword from the db
        if (newlyHashedPW === storedHashedPW) {
          res.redirect('/');
        } else {
          res.redirect('/login');
        }
      }
    }
  });


});

app.post('/signup',
function(req, res) {
  // Insert new user's information into database
  // Make salt string
  var salt = util.createSalt();
  // Hash the concatenated string using SHA-256
  var hash = util.hashPassword(req.body.password, salt);
  // Create params object to send to user model method call
  var params = [req.body.username, hash, salt];

  // Invoke user model dbQuery method
  Users.userPost(params, function(err, results) {
    if (err) { 
      res.redirect('/signup');
    } else {

      res.statusCode = 201;
      res.redirect('/');
    // TODO: redirect to ALL LINKS with the user's links
      
    }


  });

});

app.get('/create', 
function(req, res) {
  res.render('index');
});

app.get('/links', 
function(req, res, next) {
  Links.getAll()
  .then(function(results) {
    var links = results[0];
    res.status(200).send(links);
  })
  .error(function(error) {
    next({ status: 500, error: error });
  });
});

app.post('/links', 
function(req, res, next) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    // send back a 404 if link is not valid
    return next({ status: 404 });
  }

  return Links.getOne({ type: 'url', data: uri })
  .then(function(results) {
    if (results.length) {
      var existingLink = results[0];
      throw existingLink;
    }
    return util.getUrlTitle(uri);
  })
  .then(function(title) {
    return Links.addOne({
      url: uri,
      title: title,
      baseUrl: req.headers.origin
    });
  })
  .then(function() {
    return Links.getOne({ type: 'url', data: uri });
  })
  .then(function(results) {
    var link = results[0];
    res.status(200).send(link);
  })
  .error(function(error) {
    next({ status: 500, error: error });
  })
  .catch(function(link) {
    res.status(200).send(link);
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/



/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res, next) {
  var code = req.params[0];
  var link;
  return Links.getOne({ type: 'code', data: code })
  .then(function(results) {
    link = results[0];

    if (!link) {
      throw new Error('Link does not exist');
    }
    return Click.addClick(link.id);
  })
  .then(function() {
    return Links.incrementVisit(link);
  })
  .then(function() {
    res.redirect(link.url);
  })
  .error(function(error) {
    next({ status: 500, error: error });
  })
  .catch(function() {
    res.redirect('/');
  });
});

app.use(function(err, req, res, next) {
  if (!err.error) {
    return res.sendStatus(err.status);
  }
  res.status(err.status).send(err.error);
});

module.exports = app;
// 