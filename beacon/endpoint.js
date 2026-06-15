/** Shared SiteCommand endpoint resolver for static HTML sites */
(function () {
  var host = location.hostname;
  var isLocal = host === 'localhost' || host === '127.0.0.1';
  window.SiteCommandEndpoint =
    window.SITECOMMAND_API ||
    (isLocal ? 'http://localhost:3001/v1/events' : 'https://systemwatch.onrender.com/v1/events');
})();
