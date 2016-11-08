var express = require('express');
var bodyParser = require('body-parser');
var fs = require('fs');
var url = require('url');
var path = require('path');
var app = express();
var mongoose = require('mongoose');
var MongoClient = require('mongodb').MongoClient;
var assert = require('assert');
mongoose.Promise = global.Promise;

var port = process.env.PORT || 8081

var dbUrl = 'mongodb://146.169.46.220:27017';
mongoose.connect(dbUrl);
var Schema = mongoose.Schema;

var userSchema = new Schema({
	user_id: 	String,
	name: 		String,
});

var imageSchema = new Schema({
	image_id: 	String,
	name:		String,
	latitude:	String,
	longitutde:	String,
	user_id:	String,
	path:		String,
});

var tripSchema = new Schema({
	trip_id:	String,
	user_id:	String,
});

var locationSchema = new Schema({
	latitude:	String,
	longitutude:	String,
	timestamp:	Number,
});

var User = mongoose.model('User', userSchema);
var Image = mongoose.model('Image', imageSchema);
var tripSchema = mongoose.model('Trip', tripSchema); 

var newUser = new User( {
	user_id: '123',
	name: 'Andreea K',
});

var out = []
newUser.save(function(err) {
	if (err) throw err;
  console.log('User created!');
});

User.find({}, function(err, users) {
  if (err) throw err;
	out = users;
  // object of all the users
  console.log(users);
});

app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); 

app.get('/', function (req, res) {
   res.send("This is working!!! DB contains:\n" + out);
});

app.get('/process_get', function(req, res) {
    var request = url.parse(req.url, true);
    var action = request.pathname;
    var filePath = path.join(__dirname, action).split('%20').join(' ');
    var ext = path.extname(action);
    console.log(ext);
});

var places = "";

app.get('/locations', function(req, res) {
	res.send(places);
});

app.post('/sync_locations', function(req, res) {
	var locations = req.body.locations;
	console.log("locations: " + locations);
	places += locations;
	res.send("OK!");
});

app.listen(port);

console.log('Server running now on port: ' + port);

