const System   = require('system');
const PORT     = System.env.PORT;
const Server   = require('webserver').create();
const FS       = require('fs');
if (System.env.PHANTOMJS_ENV == 'production') {
  const CachedIndex = FS.read("index.html");
} else {
  const CachedIndex = null;
}

function renderWelcome(request, response) {
  var res = CachedIndex ? CachedIndex : FS.read("index.html");
  response.statusCode = 200;
  response.headers = {
    'Content-Length': res.length,
    'Content-Type': 'text/html'
  };
  response.write(res);
  response.close();
}

function renderGraph(request, response) {
  var params = request.post;
  var data = params.data;
  var type = params.type;
  //console.log(params);
  if (!['bar','line','pie'].some(function(t) { return t == type; })) {
    response.statusCode = 406;
    var res = "{\"status\":\"invalid type\"}";
    response.headers = {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'text/json',
      'Content-Length': res.length
    };
    response.write(res);
    response.close();
    return
  }
  var dataStr = "";
  if (type != 'pie') {
    data = data.split(",").map(function(dp) { return parseFloat(dp); }).filter(function(dp) { return !isNaN(dp); });
    dataStr = data.join(",");
  } else {
    data = data.split("/").map(function(dp) { return parseFloat(dp); }).filter(function(dp) { return !isNaN(dp); });
    dataStr = data.join("/");
  }
  var page = require("webpage").create();
  page.viewportSize = { width: 480, height: 800 };
  page.content = "<html><head>" +
                 "<script src='http://code.jquery.com/jquery-1.8.2.min.js'></script>" +
                 "<script src='http://benpickles.github.com/peity/jquery.peity.min.js'></script></head><body>" +
                 "<div id='charts' style='display:inline'>" + 
                   '<span class="' + type + '">' + dataStr + '</span>' +
                 "</div>"+
                 "<script>" +
                 '$(".' + type + '").peity("' + type + '")' +
                 "</script>" +
                 "</body></html>";
  
  page.onCallback = function(msg) {
    //console.log(msg);
    var dim = JSON.parse(msg);
    page.viewportSize = { width: dim.width, height: dim.height };
    setTimeout(function() {

      response.statusCode = 200;
      var base64Image = page.renderBase64('png');
      var res = JSON.stringify({image:base64Image,type:type,data:data});
      response.headers = {
        'Content-Length': res.length,
        'Content-Type': 'text/json'
      };
      response.write(res);
      response.close();
      page.close();
    }, 100);
  }

  page.onLoadFinished = function() {
    page.evaluate(function() {
      callPhantom(JSON.stringify({height:window.$("#charts").height(),width:window.$("#charts").width()}));
    });
  };
}

var service = Server.listen(PORT, function(request, response) {
  console.log(JSON.stringify(request, null, 4));
  if (request.url != '/') { response.close(); return; }

  if (request.method == "POST") {
    renderGraph(request, response);
  } else if (request.method == "GET") {
    renderWelcome(request, response);
  } else {
    response.close();
  }
});

if (service) {
  console.log('Web server running on port ' + PORT);
} else {
  console.log('Error: Could not create web server listening on port ' + PORT);
  phantom.exit();
}
