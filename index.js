var express = require("express");
var Webtask = require("webtask-tools");
var bodyParser = require("body-parser");
var googleapis = require("googleapis");
var client = require("mongodb").MongoClient;

function Db(secrets) {
  this._secrets = secrets || process.env;
}

Db.prototype.database = function() {
  return client
    .connect(this._secrets.MONGOURL)
    .then(function(db) {
      console.log("OK");
      return db.db("webtask");
    })
    .catch(function(error) {
      console.log("ERROR", error);
      throw error;
    });
};

Db.prototype.allRepos = function() {
  return this.database().then(function(db) {
    return new Promise(function(resolve, reject) {
      db
        .collection("repos")
        .find({})
        .maxScan(1000)
        .toArray(function(err, repos) {
          if (err) return reject(err);
          resolve(repos);
        });
    });
  });
};

Db.prototype.updateRepo = function(name, increment) {
  return this.database().then(function(db) {
    return new Promise(function(resolve, reject) {
      db
        .collection("repos")
        .updateOne(
          { name: name },
          { $inc: { count: increment } },
          { upsert: true },
          function(err, result) {
            if (err) return resolve(err);
            resolve(result);
          }
        );
    });
  });
};

var customsearch = googleapis.customsearch("v1");

var app = express();
app.use(bodyParser.json());

app.get("/", function(req, res) {
  var db = new Db(req.webtaskContext.secrets);
  db
    .allRepos()
    .then(function(repos) {
      res.status(200).send({ repos: repos });
    })
    .catch(function(error) {
      res.status(500).send({ error: error });
    });
});

app.post("/", function(req, res) {
  var db = new Db(req.webtaskContext.secrets);
  var text = req.body.text;
  var tosearch = text.replace(/\W/, " ");

  Promise.resolve()
    .then(function() {
      return lookupRepos(tosearch, req.webtaskContext.secrets);
    })
    .then(function(repos) {
      var repoNames = repos
        .map(function(repo) {
          return repo.join("/");
        })
        .reduce(function(prev, curr) {
          if (curr) prev[curr] = prev[curr] ? prev[curr] + 1 : 1;
          return prev;
        }, {});

      console.log("repo names:", repoNames);
      return repoNames;
    })
    .then(function(names) {
      var updateOps = [];
      for (var name in names) {
        updateOps.push(db.updateRepo(name, names[name]));
      }
      return Promise.all(updateOps);
    })
    .then(function() {
      res.status(200).send({});
    })
    .catch(function(error) {
      res.status(500).send({
        error: error
      });
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

        try {
          var repos = res.items.map(function(i) {
            var match = i.link.match(/github.com\/([^\/]+)\/([^\/]+)/);
            if (match) return [match[1], match[2]];
            else return [];
          });
          resolve(repos);
        } catch (error) {
          reject(error);
        }
      }
    );
  });
}
