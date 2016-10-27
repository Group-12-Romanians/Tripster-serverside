var express = require('express');
var fs = require('fs');
var url = require('url');
var path = require('path');
var app = express();

var port = process.env.PORT || 8081

app.use(express.static('public'));

app.get('/index.html', function (req, res) {
   res.sendFile( __dirname + "/" + "index.html" );
})

app.get('/process_get', function(req, res) {
    var request = url.parse(req.url, true);
    var action = request.pathname;
    var filePath = path.join(__dirname, action).split('%20').join(' ');
    var ext = path.extname(action);
    console.log(ext);
})

app.listen(port);

console.log('Server running now on port: ' + port);

