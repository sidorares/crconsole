# crconsole
`crconsole` is a remote Javascript console for Chrome/Webkit that runs in your terminal:

![crconsole in Terminal](https://f.cloud.github.com/assets/173025/1191227/f5bae2f4-244b-11e3-8440-6b67fab21004.png)

## Install
With [node.js](http://nodejs.org/) and the npm package manager:

	npm install crconsole -g

You can now use `crconsole` from the command line.

## Connecting

Start chrome with remote protocol enabled:

```
google-chrome --remote-debugging-port=9222
```


```
$> crconsole
google.com> 1+1
2
```

## Commands

There are two extra REPL commands available beyond the standard node.js commands. `.tabs` lists the open tabs. `.switch 2` switches to evaluating in a tab. The argument is the index of the tab to switch to.

## See also

  - [fxconsole](https://github.com/harthur/fxconsole) - remote Javascript console for Firefox
  - [firefox-client](https://github.com/harthur/firefox-client) - client for [Firefox Remote Debugging Protocol](https://wiki.mozilla.org/Remote_Debugging_Protocol)
  - [chrome-remote-interface](https://github.com/cyrus-and/chrome-remote-interface) - client for [Chrome DevTools Remote Debugging Protocol](https://developers.google.com/chrome-developer-tools/docs/protocol/1.0/), also features simple REPL.
  - [crmux](https://github.com/sidorares/crmux) - multiplex DevTools connections, allows you to connect multiple debugging clients to a single target
## Credits

 Parts of the code taken from [fxconsole](https://github.com/harthur/fxconsole). Uses [chrome-remote-interface](https://github.com/cyrus-and/chrome-remote-interface) to communicate with Chrome.
