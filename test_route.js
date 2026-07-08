const http = require('http');

const data = JSON.stringify({
  source: 'torres-phone',
  target: 'cmd-hq',
  scenario: 'earthquake'
});

const options = {
  hostname: 'localhost',
  port: 5050,
  path: '/api/route',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', body);
  });
});

req.on('error', (e) => console.error('Error:', e.message));
req.write(data);
req.end();
