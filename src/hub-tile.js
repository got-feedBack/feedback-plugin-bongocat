(function () {
  "use strict";

  var PLUGIN_ID = "feedback-plugin-bongocat";

  function buildTileHtml(lastRun) {
    var summaryHtml = "";

    if (lastRun) {
      summaryHtml =
        lastRun.mode + " &middot; " + lastRun.bpm + " BPM" +
        (lastRun.summaryHtml ? " &mdash; " + lastRun.summaryHtml : "");
    } else {
      summaryHtml = "No runs yet";
    }

    return (
      '<div class="bc-game-root">' +
        '<div class="bc-game-root__hub-tile sticker-panel" data-surface="hub">' +
          '<img class="bc-game-root__hub-thumbnail" src="/api/plugins/' + PLUGIN_ID + '/assets/thumbnail.png" alt="Bongo Cat\'s Rhythm Trainer" />' +
          '<h3 class="bc-game-root__hub-title">Bongo Cat\'s Rhythm Trainer</h3>' +
          '<p class="bc-game-root__hub-summary">' + summaryHtml + '</p>' +
        '</div>' +
      '</div>'
    );
  }

  function fetchLastRun(sdk, callback) {
    if (!sdk || !sdk.getProfile) {
      callback(null);
      return;
    }

    sdk.getProfile().then(function (profile) {
      var userId = profile && profile.id;
      if (!userId) {
        callback(null);
        return;
      }

      var xhr = new XMLHttpRequest();
      xhr.open("GET", "/api/plugins/" + PLUGIN_ID + "/runs/latest?user_id=" + encodeURIComponent(userId), true);
      xhr.onload = function () {
        if (xhr.status === 200) {
          try {
            callback(JSON.parse(xhr.responseText));
          } catch (e) {
            callback(null);
          }
        } else {
          callback(null);
        }
      };
      xhr.onerror = function () {
        callback(null);
      };
      xhr.send();
    }).catch(function () {
      callback(null);
    });
  }

  function HubTile(container, sdk) {
    this._container = container;
    this._sdk = sdk;
    this._root = null;
  }

  HubTile.prototype.render = function () {
    var self = this;

    this._container.innerHTML = buildTileHtml(null);

    fetchLastRun(this._sdk, function (lastRun) {
      self._container.innerHTML = buildTileHtml(lastRun);
    });
  };

  HubTile.prototype.destroy = function () {
    var root = this._container.querySelector(".bc-game-root");
    if (root) {
      root.parentNode.removeChild(root);
    }
    this._container = null;
    this._sdk = null;
  };

  if (typeof window.feedBackMinigamesHubTile === "undefined") {
    window.feedBackMinigamesHubTile = {};
  }
  window.feedBackMinigamesHubTile.HubTile = HubTile;
})();