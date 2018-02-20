var googleapis = require("googleapis");
var customsearch = googleapis.customsearch("v1");

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

module.exports = {
  lookupRepos,
}
