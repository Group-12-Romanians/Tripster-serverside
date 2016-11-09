var express = require('express');
var bodyParser = require('body-parser');
var fs = require('fs');
var url = require('url');
var path = require('path');
var db = require('./database');
var mongoose = require('mongoose');
mongoose.Promise = global.Promise;
var app = express();
app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); 

var port = process.env.PORT || 8081

app.get('/', function (req, res) {
	db.User.find({}).then(function(users) {
		res.send('This is working!!! DB contains:\n' + users);
	}).catch(function (err) {
		res.send('DB failed');
	});
});

app.get('/locations', function(req, res) {
	res.send(places);
});

app.post('/sync_locations', function(req, res) {
	var locations = req.body.locations;
	console.log("locations: " + locations);
	places += locations;
	res.send("OK!");
});

app.get('/all_users', function(req, res) {
	db.User.find({}).then(function(all_users) {
		var user_names = all_users.map(function(user) {
			return user.name + ", with id: " + user.user_id;
		});
		res.send(user_names);
	}).catch(function(err){
		res.send('Error while getting all users:' + err);
	});
});

app.post('/new_user', function(req, res) {
	var id = req.body.id;
	var name = req.body.name;
	console.log("New user with id: " + id + " and name: " + name);
	new db.User({
		user_id: id,
		name: name
	}).save().then(function() {
		res.send('OK');
	}).catch(function (err) {
		res.send('Error while saving user: ' + err);
	});
});

var startServer = function() {
	var dbUrl = 'mongodb://146.169.46.220:27017';
	mongoose.connect(dbUrl);
	
	var server = app.listen(port);
	console.log('Server running now on port: ' + port);
	
	server.on('close', function() {
		return mongoose.connection.close();
	});

	return server;
};

startServer();
