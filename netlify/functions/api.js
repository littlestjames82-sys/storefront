// Netlify Function entry: wraps the Storefront HTTP handler via serverless-http.
// The app keeps zero local state: Turso (libsql) for data, HMAC-signed cookies for admin sessions.
const serverless = require('serverless-http');

const { handler, initDb } = require('../../server');

let ready = null;
const sls = serverless((req, res) => { handler(req, res); });

module.exports.handler = async (event, context) => {
  if (!ready) {
    ready = initDb().catch((e) => { ready = null; throw e; });
  }
  await ready;
  return sls(event, context);
};
