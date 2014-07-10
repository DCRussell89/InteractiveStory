/*
 * Module dependencies
 */
var express = require('express')
  , stylus = require('stylus')
  , nib = require('nib')
  , jade = require('jade')
  , natural = require('natural')
  , validator = require('validator')
  , helpers = require('helper')
  , credentials = require('credentials')
  , twitter = require('ntwitter')
  , http = require('http')
  , passport = require('passport')
  , TwitterStrategy = require('passport-twitter').Strategy
  , ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn
  , WordPOS = require('wordpos');
  
var wordpos = new WordPOS();

var app = express();
function compile(str, path) {
  return stylus(str)
    .set('filename', path)
    .use(nib());
}

app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.logger('dev'));
app.use(express.cookieParser());
app.use(express.bodyParser());
app.use(express.session({ secret: 'keyboard cat' }));
app.use(passport.initialize());
app.use(passport.session());
app.use(stylus.middleware(
  { src: __dirname + '/public'
  , compile: compile
  }
));
app.use(express.static(__dirname + '/public'));

passport.serializeUser(function(user, done) {
done(null, user);
});
 
passport.deserializeUser(function(obj, done) {
done(null, obj);
});
 
 
passport.use(new TwitterStrategy({
consumerKey: credentials.consumer_key,
consumerSecret: credentials.consumer_secret,
callbackURL: "unassembled-interactivestory.rhcloud.com" + "/auth/twitter/callback"
},
function(token, tokenSecret, profile, done) {
// NOTE: You'll probably want to associate the Twitter profile with a
// user record in your application's DB.
var user = profile;
return done(null, user);
}
));

var t = new twitter({
    consumer_key: credentials.consumer_key,
    consumer_secret: credentials.consumer_secret,
    access_token_key: credentials.access_token_key,
    access_token_secret: credentials.access_token_secret
});

app.get('/', function (req, res) {
  res.render('index',
  { title : 'Home' }
  );
});

function tempFix(words, done){
    var nouns = words.nouns;
    for(var i = 0; i < nouns.length; i++){
        if(i > 0){
            nouns[i] = " " + nouns[i];
        }
    }
    var verbs = words.verbs;
    for(var j = 0; j < verbs.length; j++){
        if(j > 0){
            verbs[j] = " " + verbs[j];
        }
    }
    var adj = words.adjectives;
    for(var k = 0; k < adj.length; k++){
        if(k > 0){
            adj[k] = " " + adj[k];
        }
    }
    var finalArray = words;
    finalArray.nouns = nouns;
    finalArray.verbs = verbs;
    finalArray.adjectives = adj;
    done(undefined, finalArray);
}

function createTextBlock(dataArray, done){
    var tweets = dataArray;
    var text;
    
    for(var i = 0; i < tweets.length; i++){
        if (text === undefined){
            text = tweets[i].text;
        }else{
            text = text + " " + tweets[i].text;
        }
    }
    return done(undefined, text);
}

function getUserHistory(user, done) {
  var data = [];
  search();

  function search(lastId) {
    var args = {
      screen_name: user,
      count: 200,
      include_rts: 1
    };
    if(lastId) {args.max_id = lastId}

    t.getUserTimeline(args, onTimeline);

    function onTimeline(err, chunk) {
      if (err) {
        console.log('Twitter search failed!');
        return done(err);
      }

      if (!chunk.length) {
        console.log('User has not tweeted yet');
        return done(err);
      }

      //Get rid of the first element of each iteration (not the first time)
      if (data.length) {chunk.shift()}

      data = data.concat(chunk);
      var thisId = Number(data[data.length - 1].id_str);

      if (chunk.length) {return search(thisId)}
      console.log(data.length + ' tweets imported');
      return done(undefined, data);
    }
  }
}

app.get('/result',
ensureLoggedIn('/'),
function(req, res) {
    var myName = req.user.displayName;
    var myUsername = req.user.username;
    var myLocation = helpers.getVariableFromRaw(req.user._raw, 'location');
    var myCreation = helpers.getVariableFromRaw(req.user._raw, 'created_at');
    var myFollowers = helpers.getVariableFromRaw(req.user._raw, 'followers_count');
    var myFriends = helpers.getVariableFromRaw(req.user._raw, 'friends_count');
    
    //console.log("User: %j", req.user);
    /*t.get(
      '/statuses/user_timeline.json',
      { screen_name: req.user.username, count: 200},
      function(error, tweets) {
       res.send(text + ' tweet: ' + tweets.length);
      }
    );*/
    var tweets;
    getUserHistory(req.user.username, function(err, data){
        if(err) throw err;
        tweets = data;
        
        createTextBlock(tweets, function(err, textBlock){
            if(err) throw err;
            wordpos.getPOS(textBlock, function(result){
                tempFix(result, function(err, withSpaces){
                    res.render('result',
                    { title : 'Result',
                    name : myName,
                    username : myUsername,
                    location : myLocation,
                    created : myCreation,
                    followers : myFollowers,
                    following : myFriends,
                    nouns : withSpaces.nouns,
                    verbs : withSpaces.verbs,
                    adjectives : withSpaces.adjectives}
                    );
                });
            });
         });
    });
});

app.get('/auth/twitter', passport.authenticate('twitter'));
app.get('/auth/twitter/callback', passport.authenticate('twitter', { successReturnToOrRedirect: '/result', failureRedirect: '/' }));

app.listen(process.env.PORT);
console.log('Express server started on port %s', process.env.PORT);


