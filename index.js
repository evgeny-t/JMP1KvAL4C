var express = require("express");
var Webtask = require("webtask-tools");
var bodyParser = require("body-parser");
var googleapis = require("googleapis");
var customsearch = googleapis.customsearch("v1");

var app = express();
app.use(bodyParser.json());

app.get("/", function(req, res) {
  res.status(200).send("OK");
});

app.post("/", function(req, res) {
  console.log("::", req.body);
  var text = req.body.text;
  var tosearch = text.replace(/\W/, " ");

  lookupRepos(tosearch, req.webtaskContext.secrets)
    .then(function(repos) {
      console.log(
        repos.map(function(repo) {
          return repo.join("/");
        })
      );
    })
    .then(function() {
      res.sendStatus(200);
    });
});

module.exports = Webtask.fromExpress(app);

function lookupRepos(q, secrets) {
  return new Promise(function(resolve, reject) {
    customsearch.cse.list(
      {
        cx: secrets.CX,
        q,
        auth: secrets.KEY
      },
      function(err, res) {
        if (err) {
          return reject(err);
        }

        var repos = res.data.items.map(function(i) {
          var match = i.link.match(/github.com\/([^\/]+)\/([^\/]+)/);
          if (match) return [match[1], match[2]];
          else return [];
        });
        resolve(repos);
      }
    );
  });
}
