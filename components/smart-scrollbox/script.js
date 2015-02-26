/* global SpatialNavigator */

window.SmartScrollbox = (function(exports) {
  'use strict';

  var proto = Object.create(HTMLElement.prototype);

  proto.createdCallback = function ssb_createdCallback() {

    this._template = template.content.cloneNode(true);

    this.listElem = this._template.getElementById('scrollbox-list');
    this.createShadowRoot().appendChild(this._template);

    // left and right margin of the scroll list
    this.margin = this.hasAttribute('margin')?
                                    this.getAttribute('margin') : 0;
    this.margin = parseInt(this.margin, 10) * 10;

    this.viewWidth = parseInt(this.clientWidth - 2 * this.margin, 10);

    this.translateX = 0;

    // Current active node
    this.currentNode = null;

    // add navigable elements to spacial navigator
    var navigableElems = Array.prototype.slice.call(
                                  this.getElementsByClassName('navigable'));
    if (navigableElems.length > 0) {
      this._scrollTo(navigableElems[0]);
    }
    this._spatialNavigator = new SpatialNavigator(navigableElems);
    this._spatialNavigator.on('focus', this._handleFocus.bind(this));
    this._spatialNavigator.on('unfocus', this._handleUnfocus.bind(this));

    // handle appendChild and removeChild in scrollbox
    this._observer = new MutationObserver(this._handleMutation.bind(this));
    this._observer.observe(this, {
      childList: true
    });

    this.addEventListener('transitionend', this);
    this.addEventListener('scroll', this);
  };

  /**
   * Current focused element
   */
  Object.defineProperty(proto, 'currentElem', {
    get: function() {
      return this._spatialNavigator.getFocusedElement();
    }
  });

  /**
   * First node in scrollbox
   */
  Object.defineProperty(proto, 'firstNode', {
    get: function() {
      return this.children[0];
    }
  });

  /**
   * Last node in scrollbox
   */
  Object.defineProperty(proto, 'lastNode', {
    get: function() {
      return this.children[this.children.length - 1];
    }
  });

  /**
   * Catch the active node
   */
  proto.activate = function() {
    if (!this.currentNode) {
      this.focus(0);
    } else {
      this.focus(this.currentElem);
    }
  };

  /**
   * Deactive the active node
   */
  proto.deactivate = function() {
    if (this.currentNode) {
      this.currentNode.classList.remove('active');
      this.currentElem.blur();
    }
  };

  /**
   * Focus a element in scrollbox. If the input item is a number, it will focus
   * the first navigable element in node having the same index as the number.
   * If the item is not navigable, it will focus the first navigable element in
   * the same node as the element.
   */
  proto.focus = function(item) {
    if (!item) {
      return false;
    }

    if (typeof item === 'number') {
      item = this.children[item];
    }

    // focus the first navigable item
    if (!item.classList.contains('navigable')) {
      item = this._getNodeFromItem(item).getElementsByClassName('navigable')[0];
    }

    if (item) {
      this._spatialNavigator.focus(item);
    }
    return true;
  };

  /**
   * Move the focus element
   */
  proto.move = function(direction) {
    return this._spatialNavigator.move(direction);
  };

  /**
   * Add navigable elements in scrollbox
   */
  proto.addNavigableElems = function(navigableElems) {
    return this._spatialNavigator.multiAdd(navigableElems);
  };

  /**
   * Remove navigable elements in scrollbox
   */
  proto.removeNavigableElems = function(navigableElems) {
    return this._spatialNavigator.multiRemove(navigableElems);
  };

  proto.handleEvent = function (evt) {
    if (evt.target !== this) {
      return;
    }

    switch (evt.type) {
      case 'transitionend':
        if (evt.propertyName === 'transform') {
          this._fireEvent('scrollbox-scroll', {
            element: this
          });
        }
        break;
      case 'scroll':
        // Gecko may scroll the scrollbox automatically, we want to prevent this
        // behavior inorder to have correct view.
        evt.target.scrollLeft = 0;
        break;
    }
  };

  /**
   * Get the node element of the item element
   */
  proto._getNodeFromItem = function(itemElem) {
    if (!itemElem) {
      return null;
    }

    var nodeElem = itemElem;
    // Find the node element. If the node is removed from scrollbox, it's parent
    // will be null, so we may handle the case here.
    while (nodeElem.parentElement && nodeElem.parentElement !== this) {
      nodeElem = nodeElem.parentElement;
    }

    return nodeElem;
  };

  /**
   * Scroll the list to the item element
   */
  proto._scrollTo = function(itemElem) {
    this.translateX = this._getScrollOffset(this._getNodeFromItem(itemElem));
    this.listElem.style.transform = 'translateX(' + this.translateX + 'px)';
  };


  /**
   * Get the offset of the node element
   */
  proto._getScrollOffset = function(nodeElem) {
    var nodeLeft = nodeElem.offsetLeft;
    var nodeWidth = nodeElem.offsetWidth;
    var listWidth = this.listElem.offsetWidth;
    var newTranslate = this.translateX;

    if (listWidth < this.viewWidth) {
      // scroll to center
      return (this.viewWidth - listWidth) / 2 + this.margin;
    } else if (nodeLeft + nodeWidth >
                          -this.translateX + this.viewWidth + this.margin) {
      // scroll left
      newTranslate = this.viewWidth - nodeLeft - nodeWidth + this.margin;
    } else if (nodeLeft < -this.translateX + this.margin) {
      // scroll right
      newTranslate = -nodeLeft + this.margin;
    }

    // If the new scroll offset contains first/last node, we have to align the
    // list to begin/end.
    if (this.lastNode.offsetLeft + this.lastNode.offsetWidth <=
                          -newTranslate + this.viewWidth + this.margin) {
      return this.viewWidth + this.margin -
                          this.lastNode.offsetLeft - this.lastNode.offsetWidth;
    } else if (this.firstNode.offsetLeft >= -newTranslate + this.margin) {
      return -this.firstNode.offsetLeft + this.margin;
    }
    return newTranslate;
  };

  /**
   * Handle focus from spacial navigator
   */
  proto._handleFocus = function(itemElem) {
    var nodeElem = this._getNodeFromItem(itemElem);
    this._scrollTo(itemElem);
    this._fireEvent('focus', {
      itemElem: itemElem,
      nodeElem: nodeElem,
      index: Array.prototype.indexOf.call(this.children, nodeElem)
    });

    // Since we may have many elements in one node, node-changed event happens
    // when active node is changed.
    if (this.currentNode && this.currentNode !== nodeElem) {
      this.currentNode.classList.remove('active');
      this._fireEvent('node-changed', {
        scrollbox: this,
        oldNodeElem: this.currentNode,
        newNodeElem: nodeElem
      });
    }
    this.currentNode = nodeElem;
    this.currentNode.classList.add('active');
    itemElem.focus();
  };

  /**
   * Handle unfocus from spacial navigator
   */
  proto._handleUnfocus = function(itemElem) {
    var nodeElem = this._getNodeFromItem(itemElem);
    this._fireEvent('unfocus', {
      itemElem: itemElem,
      nodeElem: nodeElem,
      index: Array.prototype.indexOf.call(this.children, nodeElem)
    });
    itemElem.blur();
  };

  /**
   * Add/Remove elements to/from spacial navigator when a child is
   * added/removed.
   */
  proto._handleMutation = function(mutations) {
    mutations.forEach(function(mutation) {
      var prevElem = mutation.previousSibling;
      var nextElem = mutation.nextSibling;
      if (prevElem) {
        prevElem = (prevElem.nodeType === Node.ELEMENT_NODE)?
                                    prevElem : prevElem.previousElementSibling;
      }
      if (nextElem) {
        nextElem = (nextElem.nodeType === Node.ELEMENT_NODE)?
                                    nextElem : nextElem.nextElementSibling;
      }
      var navigableElems;
      var nodes;
      if (mutation.type === 'childList') {
        nodes = Array.prototype.slice.call(mutation.addedNodes);
        // add every element to spacial navigator
        nodes.forEach(function(node) {
          navigableElems = Array.prototype.slice.call(
                                    node.getElementsByClassName('navigable'));
          if (node.classList.contains('navigable')) {
            navigableElems.push(node);
          }
          this._spatialNavigator.multiAdd(navigableElems);
          this._fireEvent('node-added', {
            node: node
          });
        }, this);

        nodes = Array.prototype.slice.call(mutation.removedNodes);
        // remove every element from spacial navigator
        nodes.forEach(function(node) {
          navigableElems = Array.prototype.slice.call(
                                    node.getElementsByClassName('navigable'));
          if (node.classList.contains('navigable')) {
            navigableElems.push(node);
          }
          this._spatialNavigator.multiRemove(navigableElems);
          // If the removed node is active, then we have transfer the active
          // node to the nearest node, otherwise, adjust the scroll offset
          if (node.classList.contains('active')) {
            if (prevElem) {
              this.focus(prevElem);
            } else {
              this.focus(nextElem);
            }
          } else {
            if (prevElem) {
              this._scrollTo(prevElem);
            } else {
              this._scrollTo(nextElem);
            }
          }
          this._fireEvent('node-removed', {
            node: node
          });
        }, this);
      }
    }, this);
  };

  proto._fireEvent = function(event, detail) {
    var evtObject = new CustomEvent(event, {
                                      bubbles: false,
                                      detail: detail || this
                                    });
    this.dispatchEvent(evtObject);
  };

  // scrollbox template
  var template = document.createElement('template');
  template.innerHTML =
    `<style>
      .scrollbox-list {
        position: relative;
        display: inline-block;
        height: 100%;
        white-space: nowrap;
        transition: transform 0.2s ease;
        transform-origin: 0 50%;
      }
    </style>

    <div class="scrollbox-list" id="scrollbox-list">
      <content></content>
    </div>`;

  return document.registerElement('smart-scrollbox', { prototype: proto });
})(window);

