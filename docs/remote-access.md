# Reaching it from another machine

Short version: it is off, it is not the internet, and it does not add a login.

## The default, and it is not a mistake

The API listens on `127.0.0.1` and nothing else. That is hardcoded, not a setting. Nothing on your
house network, your office network or a container bridge can reach it. An installation that has
never touched this is in the state every installation starts in.

## The second listener

Setting a second port opens a **second listener, also on `127.0.0.1`**, for a private network daemon
to pass your other machines through to. Tailscale Serve is what it was designed against. The bind
address never changes.

There is no default port, because turning this on means naming a number, and a default would be the
product deciding to listen for other machines because nobody said not to. Set and blank is refused
rather than read as absence: an unset variable in a template produces a blank one, and reading that
as "off" would be guessing.

## What changes when you turn it on

A request arriving on the second listener is stamped as coming from another machine. Every act the
product keeps local is refused to it: anything that touches this computer's files, ports or
processes, anything that would start work here, and the acts reserved to the person.

**Being somewhere else is a permission, not a demotion.** An ordinary write from another machine
goes through and is still recorded as yours, because it is yours.

`GET /api/access` lists exactly which acts are refused and where the caller is. Checked 27 August
2026 on this installation:

```
remoteAccess: off      answersOn: this machine only      hostAndPort: 127.0.0.1
```

## Two things it does not do

- **It does not put the product on the internet.** Something still has to be told to pass requests
  to that port, and that is a command you run outside the product.
- **It does not add a login.** It cannot tell you from anything else on your own private network,
  which is why the acts above are refused rather than asked about. See
  [governance.md](governance.md) for how weak that guarantee is and what would change it.

## Running the built app is part of it

The development command serves the browser app from a second process that is not exposed, so another
machine reaching the API port gets the API and no app. Build the app and run it in production mode
to let another machine open it.
