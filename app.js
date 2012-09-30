var system = require('system');
var port = system.env.PORT;
var server = require('webserver').create();
var service = server.listen(port, function (request, response) {
  console.log(JSON.stringify(request, null, 4));
  var params = request.post;
  var data = params.data;
  var type = params.type;
  if (!['bar','line','pie'].some(function(t) { return t == type; })) {
    response.statusCode = 406;
    response.headers = {
      'Cache': 'no-cache',
      'Content-Type': 'text/json'
    };
    response.write("{\"status\":\"invalid type\"}");
    response.close();
    return
  }
  data = data.split(",").map(function(dp) { return parseFloat(dp); }).filter(function(dp) { return !isNaN(dp); });
  var page = require("webpage").create();
  page.viewportSize = { width: 480, height: 800 };
  page.content = "<html><head>" +
                 "<script src='http://code.jquery.com/jquery-1.8.2.min.js'></script>" +
                 "<script src='http://benpickles.github.com/peity/jquery.peity.min.js'></script></head><body>" +
                 "<div id='charts' style='display:inline'>" + 
                   '<span class="bar">' + data.join(",") + '</span>' +
                 "</div>"+
                 "<script>" +
                 '$(".bar").peity("bar")' +
                 "</script>" +
                 "</body></html>";
  
  page.onCallback = function(msg) {
    console.log(msg);
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
      callPhantom(JSON.stringify({height:$("#charts").height(),width:$("#charts").width()}));
    });
  };
});

if (service) {
  console.log('Web server running on port ' + port);
} else {
  console.log('Error: Could not create web server listening on port ' + port);
  phantom.exit();
}
