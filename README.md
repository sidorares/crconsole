# crconsole
`crconsole` is a remote Javascript console for Chrome/Webkit that runs in your terminal:

![crconsole in Terminal](https://f.cloud.github.com/assets/173025/1189411/f0b083a8-2410-11e3-905b-53543c0fc57f.png)


## Install
With [node.js](http://nodejs.org/) and the npm package manager:

	npm install crconsole -g

You can now use `crconsole` from the command line.

## Connecting

Stert chrome with remote protocol enabled:

```
google-chrome --remote-debugging-port=9222
```


```
$> crconsole --port 9222
google.com> 1+1
2
```

## Commands

There are two extra REPL commands available beyond the standard node.js commands. `.tabs` lists the open tabs. `.switch 2` switches to evaluating in a tab. The argument is the index of the tab to switch to.

## See also

  - [fxconsole](https://github.com/harthur/fxconsole) - remote Javascript console for Firefox
  - [firefox-xlient](https://github.com/harthur/firefox-client) - client for [Firefox Remote Debugging Protocol](https://wiki.mozilla.org/Remote_Debugging_Protocol)
  - [chrome-remote-interface](https://github.com/cyrus-and/chrome-remote-interface) - client for [Remote Debugging Protocol](https://developers.google.com/chrome-developer-tools/docs/protocol/1.0/), also features simple REPL.

## Credits

 Parts of the code taken from [fxconsole](https://github.com/harthur/fxconsole). Uses [chrome-remote-interface](https://github.com/cyrus-and/chrome-remote-interface) to communicate with Chrome.
