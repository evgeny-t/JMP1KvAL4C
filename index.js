var express = require("express");
var Webtask = require("webtask-tools");
var bodyParser = require("body-parser");
var googleapis = require("googleapis");
var client = require("mongodb").MongoClient;
var pug = require("pug");

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
      res.status(200).send(renderIndex(repos));
    })
    .catch(function(error) {
      console.error(error);
      res.status(500).send({ error: error });
    });
});

app.post("/", function(req, res) {
  var db = new Db(req.webtaskContext.secrets);

  Promise.resolve()
    .then(function() {
      var text = req.body.text;
      var tosearch = text.replace(/(https?:\/\/\S+)|(@\S+)|\W/g, " ");
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
      console.log(error);
      res.status(500).send({
        error: error
      });
    });
});

module.exports = Webtask.fromExpress(app);

function lookupRepos(q, secrets) {
  return new Promise(function(resolve, reject) {
    console.log("lookupRepos:", q);
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
          if (!res.items) return [];
          var repos = res.items.map(function(i) {
            var match = i.link.match(/github.com\/([^\/]+)\/([^\/]+)/);
            if (match && match.length === 3) {
              return [match[1], match[2]];
            } else return [];
          });
          resolve(repos);
        } catch (error) {
          reject(error);
        }
      }
    );
  });
}

var template = `
doctype html
html
  head
    title Tweets to Repos
    script(src='https://unpkg.com/chart.js@2.7.1/dist/Chart.min.js')
    script(src='https://unpkg.com/google-palette@1.0.0/palette.js')
  body(onload='onload()')
    div#container
      canvas#chart-area
    script.
      function hexToRgb(hex) {
        hex = parseInt(hex, 16);
        return 'rgb('+(hex>>16)+','+((hex>>8)&0xff)+','+(hex&0xff)+')';
      }
      function onload() {
        var config = !{config};
        config.data.datasets[0].backgroundColor =
          palette("rainbow", config.data.datasets[0].data.length)
            .map(hexToRgb)
        new Chart(document.getElementById("chart-area")
          .getContext("2d"), config);
      };
`;

var noDataTemplate = `
doctype html
html
  head
    title Tweets to Repos
  body
    div(style="height:100vh;width:100vw;display:flex;justify-content:center;align-items:center;")
      p No data available
`;

function renderIndex(repos) {
  if (repos && repos.length) {
    var config = {
      type: "pie",
      data: {
        datasets: [
          {
            data: repos.map(function(repo) {
              return repo.count;
            })
          }
        ],
        labels: repos.map(function(repo) {
          return repo.name;
        })
      },
      options: {
        responsive: true
      }
    };

    return pug.render(template, { config: JSON.stringify(config) });
  } else {
    return pug.render(noDataTemplate);
  }
}
