var express = require("express");
var Webtask = require("webtask-tools");
var bodyParser = require("body-parser");
var lookRepos = require("./lookupRepos").lookupRepos;
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
