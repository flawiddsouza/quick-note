# Quick Note

Offline first note taking app with cross device sync. `Web-UI` is a Vue PWA, `API` is a
Node service with Postgres.

Notes and categories are rows, on the device (IndexedDB) and on the server. A device pulls
the rows written since it last looked and pushes its own changes with the version each one
was based on. A change to a note that changed on another device meanwhile is merged three
ways on the device, line by line; when both sides changed the same line, the other device's
text is kept and this device's text is saved as a copy, so nothing typed is lost. The
websocket only tells devices that there is something to pull.

New accounts are end-to-end encrypted: the password never leaves the device, note titles,
texts and category names are encrypted on the device with a key the server never sees, and
a recovery phrase shown once at registration is the only other way in. Existing accounts
can turn encryption on in Settings.

Requires Node 26 (see `.node-version`).

## API

```sh
cd API
npm install
cp .env.example .env   # fill in PG* and JWT_SECRET (npm run generate-jwt-secret)
npm run migrate
node app.js
```

`sync.js` holds the pull and push rules, `routes.js` the account calls. For an encrypted
account the `password` on the wire is a key derived from the password on the device, and
the server stores the data key wrapped under it, so it can hand it back to a new device.

### Upgrading from the version before rows

Documents saved by the old build sit in `user_store`. After running the migrations once,
copy them into rows:

```sh
npm run import-legacy-documents
```

It skips users that are already imported, so it is safe to rerun. `user_store` and
`user_client_store` are left in place as a fallback copy and can be dropped later.
The old client cannot talk to the new server, so deploy both together. Old clients keep
working offline until they update; on first start the new build turns the document on the
device into rows and pushes anything that never reached the server.

## Web UI

```sh
cd Web-UI
npm install
npm run dev
```

`.env` points the app at the production API. For local work override it in the shell:

```sh
QUICK_NOTE_API_URL=http://localhost:6943 QUICK_NOTE_WEBSOCKET_URL=ws://localhost:6943 npm run dev
```

`src/sync.js` owns the rows and the syncing, `src/merge.js` the three-way merge,
`src/crypto.js` the keys and encryption and `src/account.js` the account calls. The store
and components only see plain notes and categories. Automerge remains only in
`src/legacy.js`, loaded once to read the document of the build before rows.

## Tests

```sh
npm test
```

in either directory. The API tests need a Postgres database with the migrations applied,
named by the usual `PG*` environment variables. They create their own users and delete them.

The Web UI tests run the sync module against an in-memory stand-in for the API
(`test/fake-server.js`). The end-to-end tests run the same scenarios against the real API:

```sh
cd Web-UI
npm run test:e2e
```

They start the API and a database from `docker-compose.test.yml` (Docker required), on port
16943 so a running dev API is not in the way, and remove both afterwards.

## Known Issues

#### When using Nginx proxied API, WebSocket connection from the client disconnects after 1 minute.

This is due to the proxy_read_timeout parameter. It defaults to 1 minute. Increasing it in nginx config of the api as mentioned in this stackoverflow answer: https://stackoverflow.com/a/28829907/4932305. The server also pings every half minute, which keeps most proxies from dropping a quiet connection.
