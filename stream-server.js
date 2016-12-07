
if( process.argv.length < 3 ) {
	console.log(
		'Usage: \n' +
		'node stream-server.js <secret> [<stream-port> <websocket-port>]'
	);
	process.exit();
}

var STREAM_SECRET = process.argv[2],
	STREAM_PORT = process.argv[3] || 8082,
	WEBSOCKET_PORT = process.argv[4] || 8084,
	STREAM_MAGIC_BYTES = 'jsmp'; // Must be 4 bytes

var width = 320,
	height = 240;

var portOffset = 0;
var mostWatched = {};
// Websocket Server
var socketServers = {}
function initialize_funcs(key) {
	socketServers[key] = new (require('ws').Server)({port: WEBSOCKET_PORT+portOffset});

	console.log("new socket server at port: "+(WEBSOCKET_PORT+portOffset));
    socketServers[key].on('connection', function(socket) {
		onConnection(this, socket);
	});
	socketServers[key].broadcast = function(data, opts) {
		onBroadcast(this, data, opts)
	};
	mostWatched[key] = 0;
	portOffset++;
}

function onConnection(thisServer, socket) {
	// Send magic bytes and video size to the newly connected socket
	// struct { char magic[4]; unsigned short width, height;}
	var streamHeader = new Buffer(8);
	streamHeader.write(STREAM_MAGIC_BYTES);
	streamHeader.writeUInt16BE(width, 4);
	streamHeader.writeUInt16BE(height, 6);
	socket.send(streamHeader, {binary:true});

	console.log( 'New WebSocket Connection ('+thisServer.clients.length+' total)' );
	
	socket.on('close', function(code, message){
		console.log( 'Disconnected WebSocket ('+thisServer.clients.length+' total)' );
	});
}

function onBroadcast(thisServer, data, opts) {
	for( var i in thisServer.clients ) {
		if (thisServer.clients[i].readyState == 1) {
			thisServer.clients[i].send(data, opts);
		}
		else {
			console.log( 'Error: Client ('+i+') not connected.' );
		}
	}
}

//Express http server config
var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var request = require('request');
var streamServer = require('http').createServer(app);
var util = require('util');

app.use(express.static(__dirname + '/app'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:true}));
app.use(function(request, response, next){
	response.setHeader('Access-Control-Allow-Origin', '*');
	next();
});

streamServer.listen(STREAM_PORT);

app.post("/"+STREAM_SECRET+"/:width?/:height?/:vid?", function(request, response){
	response.connection.setTimeout(0);
	
	width = (request.params.width || 320)|0;
	height = (request.params.height || 240)|0;

	console.log(request.method);
	
	console.log(
		'Stream Connected: ' + request.socket.remoteAddress + 
		':' + request.socket.remotePort + ' size: ' + width + 'x' + height
	);
	
	var vidServ = (typeof request.params.vid === 'undefined') ? "default" : request.params.vid;
	console.log("capture "+vidServ);
	request.on('data', function(data){
		if (!(vidServ in socketServers)) {
			initialize_funcs(vidServ)
		}
		socketServers[vidServ].broadcast(data, {binary:true});
	});
});

app.get("/api/update-count/:id", function(request, response){
	if (request.params.id in mostWatched)
		mostWatched[request.params.id]  += 1;
	else
		mostWatched[request.params.id]  = 1;
	return response.end();
});

app.get("/api/get-count", function(request, response){
	var array=[];
	for(a in mostWatched){
		 array.push([a,mostWatched[a]])
	}
	array.sort(function(a,b){return a[1] - b[1]});
	array.reverse();
	var arrayKeys = [];
	for (a in array) {
		console.log(array[a]);
		arrayKeys.push(array[a][0]);
	}
	return response.end(JSON.stringify(arrayKeys));
});


// HTTP Server to accept incomming MPEG Stream
// var streamServer = require('http').createServer( function(request, response) {
// 	var params = request.url.substr(1).split('/');

// 	if( params[0] == STREAM_SECRET ) {
// 		response.connection.setTimeout(0);
		
// 		width = (params[1] || 320)|0;
// 		height = (params[2] || 240)|0;

// 		console.log(request.method);
		
// 		console.log(
// 			'Stream Connected: ' + request.socket.remoteAddress + 
// 			':' + request.socket.remotePort + ' size: ' + width + 'x' + height
// 		);
		
// 		var vidServ = (typeof params[3] === 'undefined') ? "default" : params[3];
// 		console.log("capture "+vidServ);
// 		request.on('data', function(data){
// 			if (!(vidServ in socketServers)) {
// 				initialize_funcs(vidServ)
// 			}
// 			socketServers[vidServ].broadcast(data, {binary:true});
// 		});
// 	} else {
// 		if (request.headers["x-requested-with"] != 'XMLHttpRequest') {
// 			console.log(
// 				'Failed Stream Connection: '+ request.socket.remoteAddress + 
// 				request.socket.remotePort + '.'
// 			);
// 		}
// 		console.log(
// 			'New ajax request: '+ request.socket.remoteAddress + 
// 			request.socket.remotePort
// 		);

// 		// response.writeHead(200, {'Content-Type': 'application/json'});
//   //   	response.end(JSON.stringify({ 'a': 1 }));
//     	response.writeHead(200, {'Content-Type': 'text/plain'});
//       	response.end("formOutput");
//       	// response.end(formOutput);
//     	// response.end();
// 	}
// }).listen(STREAM_PORT);

console.log('Listening for MPEG Stream on http://127.0.0.1:'+STREAM_PORT+'/<secret>/<width>/<height>/<vid-name>');
console.log('Awaiting WebSocket connections on ws://127.0.0.1:'+WEBSOCKET_PORT+'/');
