// most of the code extracted from https://github.com/facebook/react-devtools/blob/master/agent/Agent.js
// - Copyright (c) 2015-present, Facebook, Inc.
// BSD license

module.exports = function injectAgent(hook) {

  var assign = Object.assign;
  function guid() {
    return 'g' + Math.random().toString(16).substr(2);
  }

  var r = hook._renderers;
  //var crh = window.__CRCONSOLE_HOOK__;
  // crh('event-name', data) truggers 'event-name' event on crconsole side via special pause event

  function Agent(hook) {
    this.reactElements = new Map();
    this.ids = new WeakMap();
    this.renderers = new Map();
    this.elementData = new Map();
    this.roots = new Set();
    this.reactInternals = {};
  }

  var AP = Agent.prototype;

  // TODO add EE stuff here
  // wire events up to crconsole if needed
  AP.emit = function(name, data) {
    //console.log('Agent event', name, data);
  }

  AP.setReactInternals = function(renderer, reactInternals) {
    this.reactInternals[renderer] = reactInternals;
  }

  AP.addRoot = function(renderer, element) {
    var id = this.getId(element);
    console.log('ADD ROOT' + id)
    this.roots.add(id);
    this.emit('root', id);
  }

  AP.onMounted = function(renderer, component, data) {
    var id = this.getId(component);
    this.renderers.set(id, renderer);
    this.elementData.set(id, data);

    var send = assign({}, data);
    if (send.children && send.children.map) {
      send.children = send.children.map(c => this.getId(c));
    }
    send.id = id;
    send.canUpdate = send.updater && !!send.updater.forceUpdate;
    delete send.type;
    delete send.updater;
    this.emit('mount', send);
  }

  AP.onUpdated = function(component, data) {
    var id = this.getId(component);
    this.elementData.set(id, data);

    var send = assign({}, data);
    if (send.children && send.children.map) {
      send.children = send.children.map(c => this.getId(c));
    }
    send.id = id;
    send.canUpdate = send.updater && !!send.updater.forceUpdate;
    delete send.type;
    delete send.updater;
    this.emit('update', send);
  }

  AP.onUnmounted = function(component) {
    var id = this.getId(component);
    this.elementData.delete(id);
    this.roots.delete(id);
    this.renderers.delete(id);
    this.emit('unmount', id);
    this.ids.delete(component);
  }

  AP.getId = function(element) {
    if (typeof element !== 'object') {
      return element;
    }
    if (!this.ids.has(element)) {
      this.ids.set(element, guid());
      this.reactElements.set(this.ids.get(element), element);
    }
    return this.ids.get(element);
  }

  AP._subTree = function(el) {
    var obj = {}
    //if (!el)
    //  return '';

    obj.name = el.name;
    obj.type = el.nodeType;
    if (obj.type === 'Text') {
      return el.text
    }
    if (el.children && el.children.map) {
      var children = el.children.map((c) => {
        var id = this.getId(c)
        var data = this.elementData.get(id);
        return this._subTree(data)
      });
      obj.children = children;
    }
    return obj;
  }

  AP.getTree = function() {
    var rs = [];
    for (r of this.roots) {
      var root = this.elementData.get(r);
      rs.push(this._subTree(root));
    }
    return JSON.stringify(rs);
  }

  AP.getIDForNode = function(node) {
    if (!this.reactInternals) {
      return null;
    }
    var component;
    for (var renderer in this.reactInternals) {
      // If a renderer doesn't know about a reactId, it will throw an error.¬
      try {
        // $FlowFixMe possibly null - it's not null¬
        component = this.reactInternals[renderer].getReactElementFromNative(node);
      } catch (e) {}
      if (component) {
        return this.getId(component);
      }
    }
  }

  function getIn(base, path) {
    return path.reduce((obj, attr) => {
      return obj ? obj[attr] : null;
    }, base);
  }

  var agent = new Agent();

  var subs = [
    hook.sub('renderer-attached', function(p) {
      var id = p.id;
      var renderer = p.renderer;
      var helpers = p.helpers;
      agent.setReactInternals(id, helpers);
      helpers.walkTree(agent.onMounted.bind(agent, id), agent.addRoot.bind(agent, id))
    }),
    hook.sub('root',  (r) => agent.addRoot(r.renderer, r.element) ),
    hook.sub('mount', (r) => agent.onMounted(r.renderer, r.element, r.data) ),
    hook.sub('unmount', (r) => agent.onMounted(r.renderer, r.element, r.data) )
  ];

  for (rid in hook._renderers) {
    var helpers = attachRenderer(hook, rid, hook._renderers[rid]);
    hook.helpers[rid] = helpers;
    hook.emit('renderer-attached', {id: rid, renderer: hook._renderers[rid], helpers: helpers});
  }

  hook.on('renderer', (r) => {
    hook.helpers[r.id] = attachRenderer(hook, r.id, r.renderer);
    hook.emit('renderer-attached', {id: r.id, renderer: r.renderer, helpers: hook.helpers[r.id]});
  });

  // TODO: remove subs on shutdown
  hook.reactDevtoolsAgent = agent;
  return agent;
}
