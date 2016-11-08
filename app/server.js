var express = require('express');
var bodyParser = require('body-parser');
var fs = require('fs');
var url = require('url');
var path = require('path');
var app = express();

var port = process.env.PORT || 8081

app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); 

app.get('/', function (req, res) {
   res.send("This is working!!!");
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

