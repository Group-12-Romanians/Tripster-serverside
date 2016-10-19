var http = require("http");
var port = process.env.PORT || 8081
http.createServer(function (request, response) {
	response.writeHead(200, {'Content-Type': 'text/plain'});
	response.end('Hello World! We are group 12 and this app is running!\n');
}).listen(port);

// Console will print the message
console.log('Server running on port: ' + port);

