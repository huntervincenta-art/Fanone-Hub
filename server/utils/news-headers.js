// Shared browser-like headers for Google News RSS fetches.
// Google blocks datacenter requests that look like bots — these headers
// mimic a real Chrome browser to avoid 503 responses.
//
// NOTE: Do NOT include Accept-Encoding (gzip/br). Our httpsRequest helper
// does not decompress responses. Asking for compression produces binary
// garbage that fast-xml-parser can't parse (the "tagName" crash).

const GOOGLE_NEWS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Accept': 'application/rss+xml, application/xml, text/xml, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
};

module.exports = { GOOGLE_NEWS_HEADERS };
