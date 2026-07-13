// Bongo Cat's Rhythm Trainer — Diagnostics
// Ring-buffered event log for debugging the input pipeline. Every entry is
// also mirrored to the console with a "BongoCat[diag]" prefix.
//
// From the browser console:
//   bongocatDiag.export()    → logs the full JSON, downloads
//                              bongocat-diag.json, and returns the string
//   bongocatDiag.entries     → raw entries for ad-hoc inspection
//   bongocatDiag.clear()

(function () {
  "use strict";

  var MAX_ENTRIES = 1000;

  var diag = {
    entries: [],

    log: function (tag, data) {
      var entry = {
        t: Math.round((typeof performance !== "undefined" && performance.now)
          ? performance.now() : Date.now()),
        tag: tag,
        data: data === undefined ? null : data,
      };
      this.entries.push(entry);
      if (this.entries.length > MAX_ENTRIES) {
        this.entries.splice(0, this.entries.length - MAX_ENTRIES);
      }
      try {
        // Stringify so text-only console exports (browser "save as log")
        // carry the payload instead of a collapsed "Object".
        var s = "";
        if (data !== undefined && data !== null) {
          try { s = JSON.stringify(data); } catch (e2) { s = String(data); }
          if (s && s.length > 500) s = s.slice(0, 500) + "…";
        }
        console.log("BongoCat[diag] " + tag + (s ? " " + s : ""));
      } catch (e) {}
      return entry;
    },

    clear: function () {
      this.entries = [];
    },

    export: function () {
      var json = JSON.stringify(this.entries, null, 2);
      try {
        console.log("BongoCat[diag] export (" + this.entries.length + " entries):\n" + json);
      } catch (e) {}
      // Trigger a file download so the log can be attached to a report.
      try {
        var blob = new Blob([json], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "bongocat-diag.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      } catch (e) {}
      return json;
    },
  };

  window.bongocatDiag = diag;
  if (typeof window.feedBackMinigamesDiagnostics === "undefined") {
    window.feedBackMinigamesDiagnostics = diag;
  }
})();
