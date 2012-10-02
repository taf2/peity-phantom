const System   = require('system');
const PORT     = System.env.PORT;
const Server   = require('webserver').create();
const FS       = require('fs');
const URI      = require('./jsuri-1.1.1.js').URI;

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

function peityOptionsString(type, opts) {
  if (Object.keys(opts).length > 0) {
    var ostr = "$.extend($.fn.peity.defaults." + type + ", ";
    ostr += JSON.stringify(opts) + ");";
    return ostr;
  }
  return "";
}

function renderGraph(params, response) {
  console.log("renderGraph: " + JSON.stringify(params));
  var type = params.type;
  var data = params.data;

  if (!['bar','line','pie'].some(function(t) { return t == type; })) {
    console.log("invalid type");
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

  try {

  var dataStr = "";
  if (type != 'pie') {
    data = data.split(",").map(function(dp) { return parseFloat(dp); }).filter(function(dp) { return !isNaN(dp); });
    dataStr = data.join(",");
  } else {
    data = data.split("/").map(function(dp) { return parseFloat(dp); }).filter(function(dp) { return !isNaN(dp); });
    dataStr = data.join("/");
  }
  var opts = {};
  var page = require("webpage").create();

  // copy the options
  for (var k in params) {
    if (k != 'type' && k != 'data') {
      opts[k] = params[k];
    }
  }
  
  page.onCallback = function(msg) {
    var dim = JSON.parse(msg);
    page.viewportSize = { width: dim.width, height: dim.height };
    setTimeout(function() {

      response.statusCode = 200;
      var base64Image = page.renderBase64('png');
      var res = JSON.stringify({image:base64Image,type:type,data:data});
      response.headers = {
        'Content-Length': res.length,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'max-age=290304000, public',
        'Content-Type': 'text/json'
      };
      response.write(res);
      response.close();
      page.close();
    }, 100);
  }

  page.onLoadFinished = function() {
    var status = page.evaluate(function() {
      if (window.$) {
        callPhantom(JSON.stringify({height:window.$("#charts").height(),width:window.$("#charts").width()}));
        return true;
      } else {
        return false;
      }
    });
    if (!status) {
      setTimeout(function() {
        page.evaluate(function() {
          callPhantom(JSON.stringify({height:window.$("#charts").height(),width:window.$("#charts").width()}));
        });
      }, 100);
    }
  };
  page.onError = function(e) {
    console.log("error", e.message, JSON.stringify(e));
    response.close();
    page.close();
  }
  // start the page rendering
  page.viewportSize = { width: 640, height: 480 };
  var graph =    "<html><head>" +
                 "<script src='http://code.jquery.com/jquery-1.8.2.min.js'></script>" +
                 "<script src='http://benpickles.github.com/peity/jquery.peity.min.js'></script></head><body>" +
                 "<div id='charts' style='display:inline'>" + 
                   '<span class="' + type + '">' + dataStr + '</span>' +
                 "</div>"+
                 "<script>" + peityOptionsString(type, opts) + "\n" +
                 '$(".' + type + '").peity("' + type + '")' +
                 "</script>" +
                 "</body></html>";
    console.log("graph:", graph);
    page.content = graph;
  } catch(e) {
    console.log(e.message);
    response.write(e.message);
    response.close();
  }
}

const ColorMatch = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

function optsFromURI(uri,optKeys) {
  var params = {}
  console.log(uri.query());
  optKeys.forEach(function(key) {
    var raw = uri.getQueryParamValues(key);
    console.log(key, raw);
    var skey = key.replace(/\[\]/g,'')
    var value = decodeURIComponent(raw); 
    if (typeof(params[skey]) == 'string') {
      params[skey] = [params[skey], value];
    } else if (typeof(params[skey]) == 'object' && params[skey].length) {
      params[skey].push(value);
    } else {
      if (key.match(/\[\]/)) {
        params[skey] = value.split(',');
      } else {
        params[skey] = value;
      }
    }
  });
  return params;
}

function pieOptions(uri) {
  var opts = {}, di;
  var params = optsFromURI(uri, ['diameter', 'colors[]']);
  console.log("pie options parsed", JSON.stringify(params.colors));
  if ((di=params.diameter) && !isNaN((di=parseFloat(di)))) {
    opts.diameter = di;
  }
  console.log(params.colors);
  if (typeof(params.colors) == 'string' && params.colors.match(ColorMatch)) {
    console.log("colors is a string");
    opts.colours = params.colors;
  } else if (typeof(params.colors) == 'object' && params.colors.length) {
    console.log("colors is a array");
    opts.colours = params.colors.filter(function(color) {
      return color.match(ColorMatch);
    });

  }
  console.log("pie options accepted", JSON.stringify(opts));
  return opts;
}
function lineOptions(uri) {
  var opts = {}
  var params = optsFromURI(uri, ['color', 'strokeColor', 'strokeWidth', 'height', 'width', 'max', 'min']);
  if (typeof(params.color) == 'string' && params.color.match(ColorMatch)) {
    opts.colour = params.color;
  }
  if (typeof(params.strokeColor) == 'string' && params.strokeColor.match(ColorMatch)) {
    opts.strokeColour = params.strokeColor;
  }
  if (!isNaN(parseInt(params.strokeWidth))) {
    opts.strokeWidth = parseInt(params.strokeWidth);
  }
  if (!isNaN(parseInt(params.height))) {
    opts.height = parseInt(params.height);
  }
  if (!isNaN(parseInt(params.width))) {
    opts.width = parseInt(params.width);
  }
  if (!isNaN(parseFloat(params.max))) {
    opts.max = parseFloat(params.max);
  }
  if (!isNaN(parseFloat(params.min))) {
    opts.min = parseFloat(params.min);
  }
  return opts;
}
function barOptions(uri) {
  var opts = {}
  var params = optsFromURI(uri, ['color', 'height', 'width', 'max', 'min']);
  console.log(JSON.stringify(params));
  if (typeof(params.color) == 'string' && params.color.match(ColorMatch)) {
    opts.colour = params.color;
  }
  if (!isNaN(parseInt(params.height))) {
    opts.height = parseInt(params.height);
  }
  if (!isNaN(parseInt(params.width))) {
    opts.width = parseInt(params.width);
  }
  if (!isNaN(parseFloat(params.max))) {
    opts.max = parseFloat(params.max);
  }
  if (!isNaN(parseFloat(params.min))) {
    opts.min = parseFloat(params.min);
  }
  return opts;
}
const OptMap = {
  'pie': pieOptions,
  'line': lineOptions,
  'bar': barOptions
}

var service = Server.listen(PORT, function(request, response) {
  try {
    //console.log(JSON.stringify(request, null, 4));
    var uri = new URI(request.url, true);
    var path = uri.path();
    if (!['/', '/pie', '/bar', '/line'].some(function(p) { return path == p; })) { response.statusCode = 404; response.write("404"); response.close(); return; }

    if (path == '/') {
      renderWelcome(request, response);
    } else {
      var type = path.replace(/^\//,'');
      var params = OptMap[type](uri);
      console.log(JSON.stringify(params));

      params.data = decodeURIComponent(uri.getQueryParamValues("data"));
      params.type = type;
      console.log(path, "type:", type, JSON.stringify(params));

      renderGraph(params, response);
    }
  } catch(e) {
    console.log(e.message);
    response.close();
  }
});

if (service) {
  console.log('Web server running on port ' + PORT);
} else {
  console.log('Error: Could not create web server listening on port ' + PORT);
  phantom.exit();
}
