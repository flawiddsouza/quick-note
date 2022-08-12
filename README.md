## Known Issues

#### When using Nginx proxied API, WebSocket connection from the client disconnects after 1 minute.

This is due to the proxy_read_timeout parameter. It defaults to 1 minute. Increasing it in nginx config of the api as mentioned in this stackoverflow answer: https://stackoverflow.com/a/28829907/4932305.
