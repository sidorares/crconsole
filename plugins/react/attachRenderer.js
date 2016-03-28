/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 */
'use strict';

/**
 * This takes care of patching the renderer to emit events on the global
 * `Hook`. The returned object has a `.cleanup` method to un-patch everything.
 */
function attachRenderer(hook, rid, renderer) {


/**
 * Convert a react internal instance to a sanitized data object.
 */
var getData = (function() {
  return function getData(element) {
  var children = null;
  var props = null;
  var state = null;
  var context = null;
  var updater = null;
  var name = null;
  var type = null;
  var text = null;
  var publicInstance = null;
  var nodeType = 'Native';
  if (element._currentElement === null || element._currentElement === false) {
    nodeType = 'Empty';
  } else if (element._renderedComponent) {
    nodeType = 'NativeWrapper';
    children = [element._renderedComponent];
    props = element._instance.props;
    state = element._instance.state;
    context = element._instance.context;
    if (context && Object.keys(context).length === 0) {
      context = null;
    }
  } else if (element._renderedChildren) {
    children = childrenList(element._renderedChildren);
  } else if (element._currentElement.props) {
    // This is a native node without rendered children -- meaning the children
    // prop is just a string.
    children = element._currentElement.props.children;
  }

  if (!props && element._currentElement && element._currentElement.props) {
    props = element._currentElement.props;
  }

  if (element._currentElement) {
    type = element._currentElement.type;
    if (typeof type === 'string') {
      name = type;
    } else if (element.getName) {
      nodeType = 'Composite';
      name = element.getName();
      // 0.14 top-level wrapper
      // TODO(jared): The backend should just act as if these don't exist.
      if (element._renderedComponent && element._currentElement.props === element._renderedComponent._currentElement) {
        nodeType = 'Wrapper';
      }
      if (name === null) {
        name = 'No display name';
      }
    } else if (element._stringText) {
      nodeType = 'Text';
      text = element._stringText;
    } else {
      name = type.displayName || type.name || 'Unknown';
    }
  }

  if (element._instance) {
    var inst = element._instance;
    updater = {
      setState: inst.setState && inst.setState.bind(inst),
      forceUpdate: inst.forceUpdate && inst.forceUpdate.bind(inst),
      setInProps: inst.forceUpdate && setInProps.bind(null, inst),
      setInState: inst.forceUpdate && setInState.bind(null, inst),
      setInContext: inst.forceUpdate && setInContext.bind(null, inst),
    };
    publicInstance = inst;

    // TODO: React ART currently falls in this bucket, but this doesn't
    // actually make sense and we should clean this up after stabilizing our
    // API for backends
    if (inst._renderedChildren) {
      children = childrenList(inst._renderedChildren);
    }
  }

  return {
    nodeType,
    type,
    name,
    props,
    state,
    context,
    children,
    text,
    updater,
    publicInstance,
  };
}

function copyWithSetImpl(obj, path, idx, value) {
  if (idx >= path.length) {
    return value;
  }
  var key = path[idx];
  var updated = Array.isArray(obj) ? obj.slice() : Object.assign({}, obj);
  // $FlowFixMe number or string is fine here
  updated[key] = copyWithSetImpl(obj[key], path, idx + 1, value);
  return updated;
}

function copyWithSet(obj, path, value) {
  return copyWithSetImpl(obj, path, 0, value);
}

function setInProps(inst, path, value) {
  inst.props = copyWithSet(inst.props, path, value);
  inst.forceUpdate();
}

function setInState(inst, path, value) {
  setIn(inst.state, path, value);
  inst.forceUpdate();
}

function setInContext(inst, path, value) {
  setIn(inst.context, path, value);
  inst.forceUpdate();
}

function setIn(obj, path, value) {
  var last = path.pop();
  var parent = path.reduce((obj_, attr) => obj_ ? obj_[attr] : null, obj);
  if (parent) {
    parent[last] = value;
  }
}

function childrenList(children) {
  var res = [];
  for (var name in children) {
    res.push(children[name]);
  }
  return res;
}
})(); // getData

var getData012 = (function() {
 return function getData012(element) {
   debugger
  var children = null;
  var props = element.props;
  var state = element.state;
  var context = element.context;
  var updater = null;
  var name = null;
  var type = null;
  var text = null;
  var publicInstance = null;
  var nodeType = 'Native';
  if (element._renderedComponent) {
    nodeType = 'Wrapper';
    children = [element._renderedComponent];
    if (context && Object.keys(context).length === 0) {
      context = null;
    }
  } else if (element._renderedChildren) {
    name = element.constructor.displayName;
    children = childrenList(element._renderedChildren);
  } else if (typeof props.children === 'string') {
    // string children
    name = element.constructor.displayName;
    children = props.children;
    nodeType = 'Native';
  }

  if (!props && element._currentElement && element._currentElement.props) {
    props = element._currentElement.props;
  }

  if (element._currentElement) {
    type = element._currentElement.type;
    if (typeof type === 'string') {
      name = type;
    } else {
      nodeType = 'Composite';
      name = type.displayName;
      if (!name) {
        name = 'No display name';
      }
    }
  }

  if (!name) {
    name = element.constructor.displayName || 'No display name';
    nodeType = 'Composite';
  }

  if (typeof props === 'string') {
    nodeType = 'Text';
    text = props;
    props = null;
    name = null;
  }

  if (element.forceUpdate) {
    updater = {
      setState: element.setState.bind(element),
      forceUpdate: element.forceUpdate.bind(element),
      setInProps: element.forceUpdate && setInProps.bind(null, element),
      setInState: element.forceUpdate && setInState.bind(null, element),
      setInContext: element.forceUpdate && setInContext.bind(null, element),
    };
    publicInstance = element;
  }

  return {
    nodeType,
    type,
    name,
    props,
    state,
    context,
    children,
    text,
    updater,
    publicInstance,
  };
}

function setInProps(inst, path, value) {
  inst.props = copyWithSet(inst.props, path, value);
  inst.forceUpdate();
}

function setInState(inst, path, value) {
  setIn(inst.state, path, value);
  inst.forceUpdate();
}

function setInContext(inst, path, value) {
  setIn(inst.context, path, value);
  inst.forceUpdate();
}

function setIn(obj, path, value) {
  var last = path.pop();
  var parent = path.reduce((obj_, attr) => obj_ ? obj_[attr] : null, obj);
  if (parent) {
    parent[last] = value;
  }
}

function childrenList(children) {
  var res = [];
  for (var name in children) {
    res.push(children[name]);
  }
  return res;
}
})(); // getData012

  var rootNodeIDMap = new Map();
  var extras = {};
  // Before 0.13 there was no Reconciler, so we patch Component.Mixin
  var isPre013 = !renderer.Reconciler;

  // React Native
  if (renderer.Mount.findNodeHandle && renderer.Mount.nativeTagToRootNodeID) {
    extras.getNativeFromReactElement = function(component) {
      return renderer.Mount.findNodeHandle(component);
    };

    extras.getReactElementFromNative = function(nativeTag) {
      var id = renderer.Mount.nativeTagToRootNodeID(nativeTag);
      return rootNodeIDMap.get(id);
    };
  // React DOM 15+
  } else if (renderer.ComponentTree) {
    extras.getNativeFromReactElement = function(component) {
      return renderer.ComponentTree.getNodeFromInstance(component);
    };

    extras.getReactElementFromNative = function(node) {
      return renderer.ComponentTree.getClosestInstanceFromNode(node);
    };
  // React DOM
  } else if (renderer.Mount.getID && renderer.Mount.getNode) {
    extras.getNativeFromReactElement = function(component) {
      try {
        return renderer.Mount.getNode(component._rootNodeID);
      } catch (e) {}
    };

    extras.getReactElementFromNative = function(node) {
      var id = renderer.Mount.getID(node);
      while (node && node.parentNode && !id) {
        node = node.parentNode;
        id = renderer.Mount.getID(node);
      }
      return rootNodeIDMap.get(id);
    };
  } else {
    console.warn('Unknown react version (does not have getID), probably an unshimmed React Native');
  }

  var oldMethods;
  var oldRenderComponent;
  var oldRenderRoot;

  // React DOM
  if (renderer.Mount._renderNewRootComponent) {
    oldRenderRoot = decorateResult(renderer.Mount, '_renderNewRootComponent', (element) => {
      hook.emit('root', {renderer: rid, element});
    });
  // React Native
  } else if (renderer.Mount.renderComponent) {
    oldRenderComponent = decorateResult(renderer.Mount, 'renderComponent', element => {
      hook.emit('root', {renderer: rid, element: element._reactInternalInstance});
    });
  }

  if (renderer.Component) {
    console.error('You are using a version of React with limited support in this version of the devtools.\nPlease upgrade to use at least 0.13, or you can downgrade to use the old version of the devtools:\ninstructions here https://github.com/facebook/react-devtools/tree/devtools-next#how-do-i-use-this-for-react--013');
    // 0.11 - 0.12
    // $FlowFixMe renderer.Component is not "possibly undefined"
    oldMethods = decorateMany(renderer.Component.Mixin, {
      mountComponent() {
        rootNodeIDMap.set(this._rootNodeID, this);
        // FIXME DOMComponent calls Component.Mixin, and sets up the
        // `children` *after* that call, meaning we don't have access to the
        // children at this point. Maybe we should find something else to shim
        // (do we have access to DOMComponent here?) so that we don't have to
        // setTimeout.
        setTimeout(() => {
          hook.emit('mount', {element: this, data: getData012(this, {}), renderer: rid});
        }, 0);
      },
      updateComponent() {
        setTimeout(() => {
          hook.emit('update', {element: this, data: getData012(this, {}), renderer: rid});
        }, 0);
      },
      unmountComponent() {
        hook.emit('unmount', {element: this, renderer: rid});
        rootNodeIDMap.delete(this._rootNodeID, this);
      },
    });
  } else if (renderer.Reconciler) {
    oldMethods = decorateMany(renderer.Reconciler, {
      mountComponent(element, rootID, transaction, context) {
        var data = getData(element, context);
        rootNodeIDMap.set(element._rootNodeID, element);
        hook.emit('mount', {element, data, renderer: rid});
      },
      performUpdateIfNecessary(element, nextChild, transaction, context) {
        hook.emit('update', {element, data: getData(element, context), renderer: rid});
      },
      receiveComponent(element, nextChild, transaction, context) {
        hook.emit('update', {element, data: getData(element, context), renderer: rid});
      },
      unmountComponent(element) {
        hook.emit('unmount', {element, renderer: rid});
        rootNodeIDMap.delete(element._rootNodeID, element);
      },
    });
  }

  extras.walkTree = function(visit, visitRoot) {
    var onMount = (component, data) => {
      rootNodeIDMap.set(component._rootNodeID, component);
      visit(component, data);
    };
    walkRoots(renderer.Mount._instancesByReactRootID || renderer.Mount._instancesByContainerID, onMount, visitRoot, isPre013);
  };

  extras.cleanup = function() {
    if (oldMethods) {
      if (renderer.Component) {
        restoreMany(renderer.Component.Mixin, oldMethods);
      } else {
        restoreMany(renderer.Reconciler, oldMethods);
      }
    }
    if (oldRenderRoot) {
      renderer.Mount._renderNewRootComponent = oldRenderRoot;
    }
    if (oldRenderComponent) {
      renderer.Mount.renderComponent = oldRenderComponent;
    }
    oldMethods = null;
    oldRenderRoot = null;
    oldRenderComponent = null;
  };

  function walkRoots(roots, onMount, onRoot, isPre013) {
    for (var name in roots) {
      walkNode(roots[name], onMount, isPre013);
      onRoot(roots[name]);
    }
  }

  function walkNode(element, onMount, isPre013) {
    var data = isPre013 ? getData012(element) : getData(element);
    if (data.children && Array.isArray(data.children)) {
      data.children.forEach(child => walkNode(child, onMount, isPre013));
    }
    onMount(element, data);
  }

  function decorateResult(obj, attr, fn) {
    var old = obj[attr];
    obj[attr] = function(instance) {
      var res = old.apply(this, arguments);
      fn(res);
      return res;
    };
    return old;
  }

  function decorate(obj, attr, fn) {
    var old = obj[attr];
    obj[attr] = function(instance) {
      var res = old.apply(this, arguments);
      fn.apply(this, arguments);
      return res;
    };
    return old;
  }

  function decorateMany(source, fns) {
    var olds = {};
    for (var name in fns) {
      olds[name] = decorate(source, name, fns[name]);
    }
    return olds;
  }

  function restoreMany(source, olds) {
    for (var name in olds) {
      source[name] = olds[name];
    }
  }

  return extras;
}

module.exports = attachRenderer;
